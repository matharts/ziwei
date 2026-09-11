import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { test } from "@rstest/core";

import { serveAssets } from "./fixtures/server.ts";

test("unreleased real Wasm holders are cleaned by their actual binding finalizers", async () => {
  const server = await serveAssets();
  try {
    const result = await promisify(execFile)(
      process.execPath,
      [
        "--expose-gc",
        fileURLToPath(new URL("./fixtures/gc.ts", import.meta.url)),
        server.url("/wasm").href,
      ],
      { timeout: 15_000 },
    );
    assert.match(result.stdout, /wasm-gc-ok/);
  } finally {
    await server.close();
  }
});
