import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { test } from "@rstest/core";

import { serveAssets } from "./fixtures/server.ts";

async function fresh(): Promise<typeof import("@matharts/ziwei-wasm")> {
  const url = new URL("../dist/index.js", import.meta.url);
  url.searchParams.set("test", randomUUID());
  return import(/* webpackIgnore: true */ url.href);
}

test("import is SSR-safe and performs no network or implicit initialization", async () => {
  const module = await fresh();
  assert.deepEqual(Object.keys(module).sort(), [
    "ZiweiError",
    "ZiweiInitializationError",
    "ZiweiLifecycleError",
    "initialize",
  ]);
  await assert.rejects(module.initialize(), TypeError);
});

test("invalid responses, corruption and failed requests clear state for explicit retry", async () => {
  const server = await serveAssets();
  try {
    for (const [path, code] of [
      ["/missing", "INVALID_RESPONSE"],
      ["/wrong-mime", "INVALID_RESPONSE"],
      ["/corrupt", "INTEGRITY_MISMATCH"],
      ["/oversized", "INTEGRITY_MISMATCH"],
    ]) {
      assert.ok(path);
      const module = await fresh();
      await assert.rejects(
        module.initialize({ wasmUrl: server.url(path) }),
        (error: unknown) => error instanceof module.ZiweiInitializationError && error.code === code,
      );
      const ready = await module.initialize({ wasmUrl: server.url("/wasm") });
      const natal = ready.Ziwei.fromBirth({
        gender: 0,
        birthYear: 1992,
        birthMonth: 8,
        birthDay: 15,
        birthHour: 3,
      });
      assert.equal(natal.mingPalace().name, "Ming");
      natal.dispose();
    }
    const module = await fresh();
    await assert.rejects(
      module.initialize({ wasmUrl: server.url("/retry") }),
      module.ZiweiInitializationError,
    );
    await module.initialize({ wasmUrl: server.url("/retry") });
    assert.equal(server.hits.get("/retry"), 2);
  } finally {
    await server.close();
  }
});

test("same resource concurrent calls share work and a different resource is rejected", async () => {
  const server = await serveAssets();
  try {
    const module = await fresh();
    const pending = module.initialize({ wasmUrl: server.url("/wasm") });
    await assert.rejects(
      module.initialize({ wasmUrl: server.url("/cors") }),
      (error: unknown) =>
        error instanceof module.ZiweiInitializationError && error.code === "RESOURCE_CONFLICT",
    );
    const [first, second] = await Promise.all([
      pending,
      module.initialize({ wasmUrl: server.url("/wasm") }),
    ]);
    assert.equal(first, second);
    assert.equal(server.hits.get("/wasm"), 1);
    await assert.rejects(
      module.initialize({ wasmUrl: server.url("/cors") }),
      module.ZiweiInitializationError,
    );
  } finally {
    await server.close();
  }
});

test("initialization options reject unknown fields, credentials and accessors without reading them", async () => {
  const module = await fresh();
  let reads = 0;
  const options = Object.defineProperty({}, "wasmUrl", {
    get() {
      reads++;
      return new URL("https://example.com/wasm");
    },
  });
  await assert.rejects(module.initialize(options), TypeError);
  await assert.rejects(
    module.initialize({ wasmUrl: new URL("https://user:secret@example.com/wasm") }),
    TypeError,
  );
  await assert.rejects(Reflect.apply(module.initialize, null, [{ signal: null }]), TypeError);
  await assert.rejects(
    Reflect.apply(module.initialize, null, [{ wasmUrl: "https://example.com/wasm" }]),
    TypeError,
  );
  assert.equal(reads, 0);
});

test("socket and response-body failures allow same-resource retries", async () => {
  const server = await serveAssets();
  try {
    for (const path of ["/disconnect", "/interrupted"]) {
      const module = await fresh();
      await assert.rejects(
        module.initialize({ wasmUrl: server.url(path) }),
        (error: unknown) =>
          error instanceof module.ZiweiInitializationError && error.code === "LOAD_FAILED",
      );
      server.recover(path);
      assert.ok(Object.isFrozen(await module.initialize({ wasmUrl: server.url(path) })));
    }
  } finally {
    await server.close();
  }
});

test("an unavailable secure context fails clearly without poisoning retry state", async () => {
  const server = await serveAssets();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "isSecureContext");
  try {
    const module = await fresh();
    Object.defineProperty(globalThis, "isSecureContext", { configurable: true, value: false });
    await assert.rejects(
      module.initialize({ wasmUrl: server.url("/wasm") }),
      (error: unknown) =>
        error instanceof module.ZiweiInitializationError &&
        error.code === "UNSUPPORTED_ENVIRONMENT",
    );
    if (descriptor) Object.defineProperty(globalThis, "isSecureContext", descriptor);
    else Reflect.deleteProperty(globalThis, "isSecureContext");
    assert.equal(server.hits.get("/wasm"), undefined);
    await module.initialize({ wasmUrl: server.url("/wasm") });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "isSecureContext", descriptor);
    else Reflect.deleteProperty(globalThis, "isSecureContext");
    await server.close();
  }
});
