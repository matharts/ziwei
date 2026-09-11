import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";

assert.equal(typeof globalThis.gc, "function");
const OriginalRegistry = globalThis.FinalizationRegistry;
let finalized = 0;
globalThis.FinalizationRegistry = class ObservedRegistry<T> extends OriginalRegistry<T> {
  constructor(cleanup: (held: T) => void) {
    super((held) => {
      cleanup(held);
      finalized++;
    });
  }
};
const module = await import("@matharts/ziwei-wasm");
globalThis.FinalizationRegistry = OriginalRegistry;
const url = process.argv[2];
assert.ok(url);
const { Ziwei } = await module.initialize({ wasmUrl: new URL(url) });
const birth = { gender: 0, birthYear: 1992, birthMonth: 8, birthDay: 15, birthHour: 3 } as const;
function allocate() {
  for (let index = 0; index < 200; index++) Ziwei.fromBirth(birth);
}
allocate();
for (let attempt = 0; attempt < 100 && finalized < 200; attempt++) {
  globalThis.gc?.();
  await setTimeout(10);
}
assert.ok(finalized >= 200, `Expected actual binding finalizers, got ${finalized}`);
console.log("wasm-gc-ok");
