import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const hash = (bytes: Buffer, algorithm = "sha256", encoding: "hex" | "base64" = "hex") =>
  createHash(algorithm).update(bytes).digest(encoding);
type Scenario = "normal" | "omit-optional" | "missing" | "corrupted";
export type Receipt = { tarball: string; bytes: number; sha256: string };
export type Platform = Receipt & {
  target: string;
  name: string;
  binaryDigest: Omit<Receipt, "tarball">;
};
export type RegistryPackages = { main: Receipt; platforms: Platform[] };
export type RuntimeObservation = {
  manager: "npm" | "pnpm";
  node: string;
  arch: string;
  sharedObjects: string[];
};

function readCohort(directory: string) {
  const source = readJson(fileURLToPath(new URL("../../package.json", import.meta.url)));
  const batch = readJson(join(directory, "batch.json"));
  assert.equal(batch.schemaVersion, 1);
  assert.equal(batch.name, source.name);
  assert.equal(batch.version, source.version);
  assert.match(batch.batch.commit, /^[a-f0-9]{40}$/);
  for (const [key, variable] of [
    ["commit", "GITHUB_SHA"],
    ["runId", "GITHUB_RUN_ID"],
    ["runAttempt", "GITHUB_RUN_ATTEMPT"],
  ]) {
    if (process.env[variable!]) assert.equal(batch.batch[key!], process.env[variable!]);
  }
  const platforms: Platform[] = batch.platforms;
  assert.deepEqual(platforms.map(({ target }) => target).sort(), [...source.napi.targets].sort());
  return readRegistryPackages(directory, batch, source);
}

/** Shared transport checks; callers independently enforce release or candidate scope. */
export function readRegistryPackages(
  directory: string,
  batch: RegistryPackages,
  source: { name: string; version: string },
) {
  const platforms = batch.platforms;
  assert.equal(new Set(platforms.map(({ name }) => name)).size, platforms.length);
  const packages = [batch.main as Receipt, ...platforms].map((receipt) => {
    assert.equal(basename(receipt.tarball), receipt.tarball);
    assert.match(receipt.tarball, /^[a-z0-9_-]+\.tgz$/);
    const path = join(directory, receipt.tarball);
    assert.ok(lstatSync(path).isFile());
    const bytes = readFileSync(path);
    assert.equal(bytes.length, receipt.bytes);
    assert.equal(hash(bytes), receipt.sha256);
    const manifest = JSON.parse(
      // Git Bash's GNU tar treats a Windows drive prefix as a remote archive.
      // stdin works with GNU, BSD and BusyBox tar and consumes the verified bytes.
      execFileSync("tar", ["-xOzf", "-", "package/package.json"], {
        input: bytes,
        encoding: "utf8",
        timeout: 30_000,
      }),
    );
    assert.equal(manifest.version, source.version);
    assert.equal(manifest.private, true);
    assert.equal(manifest.scripts, undefined);
    return { receipt, bytes, manifest };
  });
  const main = packages[0]!;
  assert.equal(main.manifest.name, source.name);
  assert.deepEqual(
    main.manifest.optionalDependencies,
    Object.fromEntries(platforms.map(({ name }) => [name, source.version])),
  );
  for (const [index, platform] of platforms.entries())
    assert.equal(packages[index + 1]!.manifest.name, platform.name);
  const report = process.report.getReport() as { header: { glibcVersionRuntime?: string } };
  const libc = report.header.glibcVersionRuntime ? "glibc" : "musl";
  const matching = packages
    .slice(1)
    .filter(
      ({ manifest }) =>
        manifest.os?.includes(process.platform) &&
        manifest.cpu?.includes(process.arch) &&
        (process.platform !== "linux" || manifest.libc?.includes(libc)),
    );
  assert.equal(matching.length, 1, "one platform must match the actual runtime");
  return { packages, main, matching: matching[0]!, platforms };
}

/** Serve the immutable cohort locally; real clients resolve all optional dependencies. */
type RegistryOptions = {
  managers?: readonly RuntimeObservation["manager"][];
  onRuntime?: (runtime: RuntimeObservation) => void;
  testWorker?: boolean;
  commandTimeoutMs?: number;
};

export async function verifyRegistry(directory: string, options: RegistryOptions = {}) {
  return consumeRegistry(readCohort(directory), options);
}

export async function consumeRegistry(
  { packages, main, matching, platforms }: ReturnType<typeof readRegistryPackages>,
  {
    managers = ["npm", "pnpm"],
    onRuntime,
    testWorker = false,
    commandTimeoutMs = 45_000,
  }: RegistryOptions = {},
) {
  assert.ok(managers.length > 0, "至少选择一个包管理器");
  assert.ok(
    Number.isInteger(commandTimeoutMs) && commandTimeoutMs > 0 && commandTimeoutMs <= 180_000,
  );
  const temporary = mkdtempSync(join(tmpdir(), "ziwei-registry-consumer-"));
  const env = { ...process.env };
  env.XDG_CONFIG_HOME = join(temporary, "config");
  env.XDG_CACHE_HOME = join(temporary, "cache");
  for (const key of Object.keys(env))
    if (
      /^(npm_config_|pnpm_config_|napi_rs_|node_options$|node_path$|npm_token$|node_auth_token$|https?_proxy$|all_proxy$)/i.test(
        key,
      )
    )
      delete env[key];
  const nodeBin = dirname(process.execPath);
  const npmCli =
    process.env.ZIWEI_NPM_CLI ??
    (process.platform === "win32"
      ? join(nodeBin, "node_modules/npm/bin/npm-cli.js")
      : join(nodeBin, "../lib/node_modules/npm/bin/npm-cli.js"));
  const pnpm = process.env.ZIWEI_PNPM_BIN ?? "pnpm";
  const expectedPnpm = readJson(fileURLToPath(new URL("../../../../package.json", import.meta.url)))
    .devEngines.packageManager.version;
  const options = {
    env,
    encoding: "utf8" as const,
    timeout: commandTimeoutMs,
    maxBuffer: 1024 * 1024,
  };
  let scenario: Scenario = "normal";
  let url = "";
  const requested = new Set<string>();
  const unexpected: string[] = [];
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url!, "http://localhost").pathname);
    const metadata = packages.find(({ manifest }) => path === `/${manifest.name}`);
    const tarball = packages.find(({ receipt }) => path === `/tarballs/${receipt.tarball}`);
    if (request.method !== "GET" || (!metadata && !tarball)) {
      unexpected.push(`${request.method} ${path}`);
      response.writeHead(404).end();
    } else if (metadata) {
      const { manifest, receipt, bytes } = metadata;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          name: manifest.name,
          modified: "2020-01-01T00:00:00.000Z",
          "dist-tags": { latest: manifest.version },
          versions: {
            [manifest.version]: {
              ...manifest,
              dist: {
                tarball: `${url}/tarballs/${receipt.tarball}`,
                integrity: `sha512-${hash(bytes, "sha512", "base64")}`,
                shasum: hash(bytes, "sha1"),
              },
            },
          },
        }),
      );
    } else if (tarball) {
      requested.add(tarball.manifest.name);
      if (tarball === matching && scenario === "missing") response.writeHead(404).end();
      else {
        response.setHeader("content-type", "application/octet-stream");
        response.end(
          tarball === matching && scenario === "corrupted"
            ? Buffer.concat([tarball.bytes, Buffer.from("integrity-mismatch")])
            : tarball.bytes,
        );
      }
    }
  });
  try {
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    url = `http://127.0.0.1:${address.port}`;
    for (const manager of managers) {
      if (manager === "pnpm")
        // Even --version reads project configuration; keep the probe out of the controller workspace.
        assert.equal(
          (await execute(pnpm, ["--version"], { ...options, cwd: temporary })).stdout.trim(),
          expectedPnpm,
        );
      for (const mode of ["normal", "omit-optional", "missing", "corrupted"] as const) {
        const consumer = join(temporary, `${manager}-${mode}`);
        mkdirSync(consumer);
        writeFileSync(
          join(consumer, "package.json"),
          JSON.stringify({
            name: "ziwei-registry-consumer",
            private: true,
            type: "module",
            dependencies: { [main.manifest.name]: main.manifest.version },
          }),
        );
        // No inherited registry credentials, architecture overrides, hoisting or caches.
        const npmrc = join(consumer, ".npmrc");
        const globalNpmrc = join(consumer, "global.npmrc");
        writeFileSync(npmrc, `registry=${url}/\n@matharts:registry=${url}/\n`);
        writeFileSync(globalNpmrc, "");
        writeFileSync(
          join(consumer, "pnpm-workspace.yaml"),
          JSON.stringify({
            registries: { default: `${url}/`, "@matharts": `${url}/` },
            ignoreScripts: true,
            minimumReleaseAge: 0,
            enableGlobalVirtualStore: false,
            nodeLinker: "isolated",
            updateNotifier: false,
            fetchRetries: 0,
          }),
        );
        const command = async (phase: "lock" | "install") => {
          const cache = join(consumer, `${phase}-cache`);
          const common = ["--ignore-scripts", `--registry=${url}/`, `--userconfig=${npmrc}`];
          if (manager === "npm") {
            return execute(
              process.execPath,
              [
                npmCli,
                ...(phase === "lock" ? ["install", "--package-lock-only"] : ["ci"]),
                ...common,
                `--globalconfig=${globalNpmrc}`,
                `--cache=${cache}`,
                "--no-audit",
                "--no-fund",
                "--no-update-notifier",
                "--fetch-retries=0",
                ...(mode === "omit-optional" && phase === "install" ? ["--omit=optional"] : []),
              ],
              { ...options, cwd: consumer },
            );
          }
          return execute(
            pnpm,
            [
              "install",
              ...(phase === "lock"
                ? ["--lockfile-only", "--no-frozen-lockfile"]
                : ["--frozen-lockfile"]),
              ...common,
              `--store-dir=${cache}`,
              ...(mode === "omit-optional" && phase === "install" ? ["--no-optional"] : []),
            ],
            { ...options, cwd: consumer },
          );
        };
        // Seed a real lockfile from healthy metadata, then use a separate cold content store.
        scenario = "normal";
        await command("lock");
        requested.clear();
        scenario = mode;
        let installError: unknown;
        try {
          await command("install");
        } catch (error) {
          installError = error;
        }
        if (mode === "normal" || mode === "omit-optional") assert.equal(installError, undefined);
        if (installError) {
          const failure = installError as { stdout: string; stderr: string };
          assert.match(
            `${failure.stdout}\n${failure.stderr}`,
            mode === "missing" ? /404|NOT_FOUND/ : /INTEGRITY/i,
          );
        }
        if (mode !== "omit-optional") assert.ok(requested.has(matching.manifest.name));
        assert.deepEqual(
          [...requested].sort(),
          (mode === "omit-optional"
            ? [main.manifest.name]
            : [main.manifest.name, matching.manifest.name]
          ).sort(),
          "incompatible platform tarballs must not be downloaded",
        );
        const probe = await execute(
          process.execPath,
          [
            "--input-type=module",
            "--eval",
            `
          import assert from 'node:assert/strict';
          import { createRequire } from 'node:module';
          import { createHash } from 'node:crypto';
          import { readFileSync, readdirSync } from 'node:fs';
          import { dirname, join } from 'node:path';
          const require = createRequire(import.meta.url);
          const mainRoot = dirname(dirname(require.resolve('@matharts/ziwei')));
          const nativeRequire = createRequire(join(mainRoot, 'package.json'));
          const names = ${JSON.stringify(platforms.map(({ name }) => name))};
          const installed = names.filter(name => { try { nativeRequire.resolve(name); return true; } catch { return false; } });
          const mode = ${JSON.stringify(mode)};
          try {
          if (mode !== 'normal') {
            await assert.rejects(import('@matharts/ziwei'), /Cannot find native binding/);
            assert.deepEqual(installed, []);
          } else {
            assert.deepEqual(installed, [${JSON.stringify(matching.manifest.name)}]);
            const binary = readFileSync(nativeRequire.resolve(installed[0]));
            assert.equal(binary.length, ${(matching.receipt as Platform).binaryDigest.bytes});
            assert.equal(createHash('sha256').update(binary).digest('hex'), ${JSON.stringify((matching.receipt as Platform).binaryDigest.sha256)});
            assert.ok(readdirSync(mainRoot, {recursive:true}).every(file => !file.endsWith('.node')));
            const { Ziwei, ZiweiError, Branch } = await import('@matharts/ziwei');
            const cjs = require('@matharts/ziwei');
            assert.equal(cjs.Ziwei, Ziwei);
            assert.equal(cjs.ZiweiError, ZiweiError);
            assert.equal(cjs.Branch, Branch);
            const natal = Ziwei.fromBirth({gender:1,birthYear:1984,birthMonth:1,birthDay:6,birthHour:0});
            assert.equal(natal.fiveElementBureau, 6);
            assert.equal(natal.palaces.length, 12);
            assert.equal(natal.star('WuQu').birthTransformation, 'C');
            assert.equal(natal.yearlyPalaceByName(1,9,'Ming').branch, 0);
            assert.ok(Object.isFrozen(natal.palaces[0].stars));
            assert.throws(() => Ziwei.fromBirth(null), ZiweiError);
            const queried = Ziwei.fromParameters({gender:1,birthStem:0,birthBranch:0,birthMonth:1,ziweiBranch:2,birthHour:0});
            assert.equal(queried.decadeYears(0)[0].year, null);
            if (${testWorker}) {
              assert.equal(natal.palaces, natal.palaces);
              assert.equal(natal.profile, natal.profile);
              const { Worker } = await import('node:worker_threads');
              const { once } = await import('node:events');
              const worker = new Worker(\`
                const { parentPort, workerData } = require('node:worker_threads');
                const { Ziwei, ZiweiError } = require(workerData);
                const a = Ziwei.fromBirth({gender:1,birthYear:1984,birthMonth:1,birthDay:6,birthHour:0});
                const b = Ziwei.fromParameters({gender:1,birthStem:0,birthBranch:0,birthMonth:1,ziweiBranch:2,birthHour:0});
                require('node:assert/strict').throws(() => Ziwei.fromBirth(null), ZiweiError);
                parentPort.postMessage([a.toJSON(), b.toJSON()]);
              \`, { eval: true, execArgv: [], workerData: require.resolve('@matharts/ziwei') });
              try {
                const [[snapshots], [exitCode]] = await Promise.all([
                  once(worker, 'message'), once(worker, 'exit'),
                ]);
                assert.deepEqual(snapshots, [natal.toJSON(), queried.toJSON()]);
                assert.equal(exitCode, 0);
              } finally { await worker.terminate(); }
            }
          }
          } finally {
            if (${Boolean(onRuntime)} && mode === 'normal') console.log(JSON.stringify({
              manager: ${JSON.stringify(manager)}, node: process.version, arch: process.arch,
              sharedObjects: process.report.getReport().sharedObjects,
            }));
          }
        `,
          ],
          { ...options, cwd: consumer, env: { ...env, NAPI_RS_ENFORCE_VERSION_CHECK: "1" } },
        ).catch((error: { stdout?: string }) => {
          // Preserve the loaded-module observation even when the native import fails.
          if (onRuntime && error.stdout?.trim()) onRuntime(JSON.parse(error.stdout));
          throw error;
        });
        if (onRuntime && probe.stdout.trim()) onRuntime(JSON.parse(probe.stdout));
        assert.equal(probe.stderr, "");
        assert.deepEqual(
          unexpected,
          [],
          "consumer must use only the fixture's metadata and tarballs",
        );
        console.log(`registry-consumer-ok ${manager}/${mode} ${process.platform}/${process.arch}`);
      }
    }
  } finally {
    server.closeAllConnections();
    if (server.listening) await new Promise<void>((done) => server.close(() => done()));
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const directory = process.argv[2];
  if (!directory) throw new Error("expected a complete distribution directory");
  await verifyRegistry(resolve(directory));
}
