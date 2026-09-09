import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { NapiCli, parseTriple } from "@napi-rs/cli";

type Manifest = {
  name: string;
  version: string;
  private: boolean;
  description: string;
  license: string;
  type: string;
  main: string;
  types: string;
  exports: Record<string, unknown>;
  engines: { node: string };
  napi: { binaryName: string; targets: string[] };
};

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const writeJson = (path: string, value: unknown) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

/** Stage only explicitly selected, already-built targets; never mutate source manifests. */
export async function stageDistribution(
  packageRoot: string,
  outputParent: string,
  targets: string[],
) {
  const source: Manifest = readJson(join(packageRoot, "package.json"));
  if (targets.length === 0 || new Set(targets).size !== targets.length) {
    throw new Error("必须指定至少一个不重复的 Rust target");
  }
  const platforms = targets.map((target) => {
    if (!source.napi.targets.includes(target)) throw new Error(`未配置的分发目标：${target}`);
    const { platformArchABI: suffix } = parseTriple(target);
    return { target, suffix, binary: `${source.napi.binaryName}.${suffix}.node` };
  });
  // Rslib's bundle:false contract emits one JS module and declaration per source.
  // Derive the required set from source, never from potentially incomplete output.
  const distFiles = readdirSync(join(packageRoot, "src"))
    .filter((file) => file.endsWith(".ts"))
    .flatMap((file) => [file.replace(/\.ts$/, ".js"), file.replace(/\.ts$/, ".d.ts")]);
  if (!distFiles.includes("index.js") || !distFiles.includes("index.d.ts")) {
    throw new Error("缺少构建入口，请先运行 mise run build:node");
  }
  if (readdirSync(join(packageRoot, "dist")).some((file) => !distFiles.includes(file))) {
    throw new Error("dist 含有非预期文件，请重新构建");
  }
  const files = [
    ...distFiles.map((file) => `dist/${file}`),
    "native/binding.cjs",
    "native/binding.d.cts",
    "README.md",
    "AGENTS.md",
  ];
  // Preflight before creating any output. Do not silently omit missing targets.
  for (const file of [
    ...files,
    ...platforms.map(({ binary }) => `native/${binary}`),
    "../../LICENSE",
  ]) {
    const stat = lstatSync(join(packageRoot, file));
    if (!stat.isFile() || stat.size === 0) throw new Error(`缺少非空普通产物文件：${file}`);
  }

  mkdirSync(outputParent, { recursive: true });
  const directory = mkdtempSync(join(outputParent, "ziwei-"));
  // The napi API owns target -> package/CPU/OS/libc mapping. No prePublish call.
  writeJson(join(directory, "package.json"), { ...source, napi: { ...source.napi, targets } });
  await new NapiCli().createNpmDirs({ cwd: directory, npmDir: "platforms" });
  const mainDirectory = join(directory, "main");
  mkdirSync(join(mainDirectory, "dist"), { recursive: true });
  mkdirSync(join(mainDirectory, "native"));
  for (const file of files) copyFileSync(join(packageRoot, file), join(mainDirectory, file));
  copyFileSync(join(packageRoot, "../../LICENSE"), join(mainDirectory, "LICENSE"));
  const packages = platforms.map(({ target, suffix, binary }) => {
    const platformDirectory = join(directory, "platforms", suffix);
    const manifest = readJson(join(platformDirectory, "package.json"));
    // createNpmDirs does not propagate private. Keep every staged package guarded.
    writeJson(join(platformDirectory, "package.json"), { ...manifest, private: true });
    copyFileSync(join(packageRoot, "native", binary), join(platformDirectory, binary));
    copyFileSync(join(packageRoot, "../../LICENSE"), join(platformDirectory, "LICENSE"));
    return { target, name: manifest.name as string, binary, directory: platformDirectory };
  });
  writeJson(join(mainDirectory, "package.json"), {
    name: source.name,
    version: source.version,
    private: true,
    description: source.description,
    license: source.license,
    type: source.type,
    main: source.main,
    types: source.types,
    exports: source.exports,
    engines: source.engines,
    files: [
      "dist",
      "native/binding.cjs",
      "native/binding.d.cts",
      "README.md",
      "AGENTS.md",
      "LICENSE",
    ],
    optionalDependencies: Object.fromEntries(packages.map(({ name }) => [name, source.version])),
  });
  return { directory, mainDirectory, packages };
}

export async function packDistribution(
  packageRoot: string,
  outputParent: string,
  targets: string[],
) {
  const staged = await stageDistribution(packageRoot, outputParent, targets);
  const pack = (cwd: string, filename: string) => {
    const tarball = join(staged.directory, filename);
    execFileSync("pnpm", ["pack", "--out", tarball], { cwd, encoding: "utf8", timeout: 30_000 });
    return tarball;
  };
  const mainTarball = pack(staged.mainDirectory, "ziwei.tgz");
  const packages = staged.packages.map((pkg) => ({
    ...pkg,
    tarball: pack(pkg.directory, `${pkg.target}.tgz`),
  }));
  writeJson(join(staged.directory, "artifacts.json"), {
    main: "ziwei.tgz",
    platforms: packages.map(({ target, name }) => ({ target, name, tarball: `${target}.tgz` })),
  });
  return { ...staged, mainTarball, packages };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      target: { type: "string", multiple: true },
      output: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(
      "mise run pack:node -- --target <Rust target> [--target <Rust target>] [--output <directory>]\n仅打包已有产物，保留 private，不发布；输出到新的独立子目录。",
    );
  } else {
    const packageRoot = fileURLToPath(new URL("..", import.meta.url));
    const result = await packDistribution(
      packageRoot,
      resolve(values.output ?? "target/node-distribution"),
      values.target ?? [],
    );
    console.log(
      JSON.stringify(
        {
          main: result.mainTarball,
          platforms: result.packages.map(({ target, tarball }) => ({ target, tarball })),
        },
        null,
        2,
      ),
    );
  }
}
