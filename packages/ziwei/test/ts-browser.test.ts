import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "@rstest/core";
import { chromium, firefox, webkit } from "playwright";

import { consumePackageRoot, consumePackageWorker } from "./fixtures/ts-browser.ts";

const engines = [chromium, firefox, webkit];

async function serveDist() {
  const dist = fileURLToPath(new URL("../dist/", import.meta.url));
  const root = resolve(dist);
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    if (pathname === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<!doctype html><meta charset=utf-8><title>TypeScript package consumer</title>");
      return;
    }
    if (pathname === "/worker.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(`
        import { Branch, Gender, Ziwei } from "/index.js";
        self.onmessage = ({ data }) => {
          const natal = Ziwei.fromBirth({
            gender: Gender.Male,
            birthYear: 1984,
            birthMonth: 1,
            birthDay: 6,
            birthHour: Branch.Zi,
          });
          self.postMessage({
            request: data.request,
            zodiac: natal.zodiac,
            bureau: natal.fiveElementBureau,
            palaceCount: natal.palaces.length,
            firstPalace: natal.mingPalace().name,
          });
        };
      `);
      return;
    }
    const file = resolve(root, `.${pathname}`);
    if (!file.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      response.setHeader(
        "Content-Type",
        extname(file) === ".js" ? "text/javascript" : "application/octet-stream",
      );
      response.end(await readFile(file));
    } catch {
      response.writeHead(404).end("missing");
    }
  });
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    origin,
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolveClose()));
      }),
  };
}

for (const engine of engines) {
  test(`${engine.name()}: browser package-root and Worker consumers compute the worked chart`, async (t) => {
    const server = await serveDist();
    t.onTestFinished(() => server.close());
    const browser = await engine.launch();
    t.onTestFinished(() => browser.close());
    const page = await browser.newPage();
    await page.goto(server.origin);

    const result = await page.evaluate(consumePackageRoot);

    assert.deepEqual(result, {
      zodiac: "Rat",
      bureau: 6,
      palaceNames: [
        "Ming",
        "FuMu",
        "FuDe",
        "TianZhai",
        "GuanLu",
        "JiaoYou",
        "QianYi",
        "JiE",
        "CaiBo",
        "ZiNv",
        "FuQi",
        "XiongDi",
      ],
      starBranch: 10,
      decadeStart: { age: 6, year: 1989 },
    });

    const workerResult = await page.evaluate(consumePackageWorker);
    assert.deepEqual(workerResult, {
      request: "independent-worker",
      zodiac: "Rat",
      bureau: 6,
      palaceCount: 12,
      firstPalace: "Ming",
    });
  }, 60_000);
}
