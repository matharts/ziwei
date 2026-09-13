import type { Birth, Parameters, Natal, ReadyZiweiRuntime } from "@matharts/ziwei-wasm";

import type { QueryCall } from "./queries.ts";

export interface ContractInput {
  readonly birth: Birth;
  readonly parameters: Parameters;
  readonly calls: QueryCall[];
}

// A fresh page keeps the first projection cold, including the Wasm metadata cache.
export async function metadataProjection(input: Birth) {
  const module: typeof import("@matharts/ziwei-wasm") = await import(
    new URL("/index.js", location.href).href
  );
  const { Ziwei } = await module.initialize();
  const first = Ziwei.fromBirth(input);
  const second = Ziwei.fromBirth(input);
  const freeze = Object.freeze;
  const injected = new Error("cold palace projection failure");
  function check(value: unknown, message: string): asserts value {
    if (!value) throw new Error(message);
  }
  function detached(left: unknown, right: unknown): void {
    if (left === null || typeof left !== "object") return;
    check(right !== null && typeof right === "object", "DTO shape changed");
    check(left !== right, "Mutable containers are shared between charts");
    check(Object.isFrozen(left) && Object.isFrozen(right), "DTO is not deeply frozen");
    for (const key of Object.keys(left)) detached(Reflect.get(left, key), Reflect.get(right, key));
  }
  try {
    let thrown: unknown;
    try {
      Object.freeze = <T>(value: T): T => {
        if (Array.isArray(value) && value.length === 12) throw injected;
        return freeze(value);
      };
      void first.palaces;
    } catch (error) {
      thrown = error;
    } finally {
      Object.freeze = freeze;
    }
    check(thrown === injected, "First projection did not preserve the exception");
    const retried = first.palaces;
    const snapshot = second.toJSON();
    check(JSON.stringify(retried) === JSON.stringify(snapshot.palaces), "Retry changed output");
    check(retried === first.palaces, "Successful retry is not cached");
    detached(retried, snapshot.palaces);
    const expected = JSON.stringify(snapshot);
    first.dispose();
    second.dispose();
    check(JSON.stringify(snapshot) === expected, "Disposal damaged a detached snapshot");
    let disposed = false;
    try {
      void first.palaces;
    } catch (error) {
      disposed = error instanceof module.ZiweiLifecycleError;
    }
    check(disposed, "Cached properties remain accessible after disposal");
    const third = Ziwei.fromBirth(input);
    try {
      check(JSON.stringify(third.toJSON()) === expected, "Disposal damaged runtime metadata");
    } finally {
      third.dispose();
    }
    return snapshot;
  } finally {
    Object.freeze = freeze;
    first.dispose();
    second.dispose();
  }
}

// Private wire regression, not a public export or a timing benchmark.
export async function metadataReuse(input: Birth) {
  function check(value: unknown, message: string): asserts value {
    if (!value) throw new Error(message);
  }
  type Raw = typeof import("../../generated/ziwei_wasm.js");
  const decode = TextDecoder.prototype.decode;
  let decodes = 0;
  const read = (raw: Raw, birthYear = input.birthYear) => {
    const result = raw.fromBirth(
      input.gender,
      birthYear,
      input.birthMonth,
      input.birthDay,
      input.birthHour,
    );
    check(result.natal && result.error === null, "Raw construction failed");
    try {
      return result.natal.palaces;
    } finally {
      result.natal.free();
    }
  };
  try {
    TextDecoder.prototype.decode = function (...args) {
      decodes++;
      return decode.apply(this, args);
    };
    const instances = [];
    // Separate generated-module URLs create independent Wasm instances in one realm.
    for (const id of [1, 2]) {
      const raw: Raw = await import(
        new URL(`/generated/ziwei_wasm.js?metadata-instance=${id}`, location.href).href
      );
      const wasm = await raw.default({
        module_or_path: new URL("/generated/ziwei_wasm_bg.wasm", location.href),
      });
      const table = Object.values(wasm).find(
        (value) => value instanceof WebAssembly.Table && typeof value.get(0) !== "function",
      );
      check(table instanceof WebAssembly.Table, "Missing externref table");
      const live = () => {
        let count = 0;
        for (let i = 0; i < table.length; i++) if (table.get(i) != null) count++;
        return count;
      };
      const initial = live();
      decodes = 0;
      const first = read(raw);
      const cold = decodes;
      const expected = JSON.stringify(first);
      const retained = live();
      decodes = 0;
      const second = read(raw);
      const warm = decodes;
      check(JSON.stringify(second) === expected, "Cache changed raw tuples");
      // Seven fields per star and three per palace; only these finite strings persist.
      const capacity = 18 * 7 + 12 * 3;
      check(cold - warm === capacity, "Static strings were decoded again");
      check(retained - initial === capacity, "Unexpected cache capacity");
      check(first !== second, "Palace arrays are shared");
      for (let i = 0; i < first.length; i++) {
        const left = first[i],
          right = second[i];
        check(left && right, "Missing palace");
        check(
          left !== right && left[5] !== right[5] && left[6] !== right[6],
          "Palace containers are shared",
        );
        for (let j = 0; j < left[5].length; j++)
          check(left[5][j] !== right[5][j], "Star tuples are shared");
      }
      check(first[0], "Missing first palace");
      first[0][1] = "modified raw label";
      first[0][5].length = 0;
      check(JSON.stringify(read(raw)) === expected, "Raw mutation poisoned metadata");
      for (const end of [128, 2_048]) {
        for (let i = 0; i < end; i++) read(raw, i - 1_024);
        check(live() === retained, "Cache grew with birth inputs or disposed charts");
      }
      instances.push({ cold, warm, retained: retained - initial });
    }
    check(
      instances[0]?.cold === instances[1]?.cold,
      "An independent instance reused another cache",
    );
    return instances;
  } finally {
    TextDecoder.prototype.decode = decode;
  }
}

// Loaded by Node directly, so Rstest's import interception never enters browser code.
// Also served as a module in Worker tests: both realms exercise the exact same contract.
export async function fullContract({
  birth,
  parameters,
  calls,
  entry = "package",
}: ContractInput & { readonly entry?: "package" | "consumer" }) {
  let initialize: () => Promise<ReadyZiweiRuntime>;
  if (entry === "consumer") {
    const candidate: unknown = Reflect.get(globalThis, "initializeZiwei");
    if (typeof candidate !== "function") throw new Error("Consumer did not load its entry");
    initialize = () => candidate();
  } else {
    const module: typeof import("@matharts/ziwei-wasm") = await import(
      new URL("/index.js", location.href).href
    );
    initialize = module.initialize;
  }
  const [first, second] = await Promise.all([initialize(), initialize()]);
  const inspect = (natal: Natal) => {
    try {
      const snapshot = natal.toJSON();
      const results = calls.map((call) => {
        const query: unknown = Reflect.get(natal, call.method);
        if (typeof query !== "function") throw new Error(`Missing query ${call.method}`);
        return Reflect.apply(query, natal, call.args);
      });
      const frozen = Object.isFrozen(natal) && Object.isFrozen(snapshot.palaces[0]?.stars);
      const cached = natal.profile === natal.profile && natal.palaces === natal.palaces;
      natal.dispose();
      natal.dispose();
      let disposed = false;
      try {
        natal.toJSON();
      } catch (error) {
        disposed = error instanceof Error && Reflect.get(error, "code") === "NATAL_DISPOSED";
      }
      return { snapshot, results, frozen, cached, disposed };
    } finally {
      natal.dispose();
    }
  };
  return {
    charts: {
      birth: inspect(first.Ziwei.fromBirth(birth)),
      parameters: inspect(first.Ziwei.fromParameters(parameters)),
    },
    same: first === second,
    isolated: crossOriginIsolated,
  };
}

export async function runWorker(input: ContractInput) {
  const worker = new Worker(new URL("/worker.js", location.href), { type: "module" });
  let ticks = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let completed = 0;
  try {
    const result = await new Promise<Awaited<ReturnType<typeof fullContract>>>(
      (resolve, reject) => {
        worker.onerror = (event) => reject(new Error(event.message));
        worker.onmessage = (event) => {
          if (event.data.id !== 1) {
            reject(new Error("Worker replied with the wrong request ID"));
          } else if (event.data.kind === "busy") {
            const tick = () => {
              ticks++;
              timer = setTimeout(tick, 0);
            };
            timer = setTimeout(tick, 0);
          } else if (event.data.error) {
            reject(new Error(JSON.stringify(event.data.error)));
          } else {
            clearTimeout(timer);
            completed = event.data.completed;
            resolve(event.data);
          }
        };
        worker.postMessage({ id: 1, kind: "start", ...input });
      },
    );
    return {
      ...result,
      cloneFrozen: Object.isFrozen(result.charts.birth.snapshot),
      ticks,
      completed,
    };
  } finally {
    clearTimeout(timer);
    worker.terminate();
  }
}

export async function resourceFailure({ bad, good }: { bad: string; good: string }) {
  const module: typeof import("@matharts/ziwei-wasm") = await import(
    new URL("/index.js", location.href).href
  );
  let code;
  try {
    await module.initialize({ wasmUrl: new URL(bad) });
  } catch (error) {
    if (error instanceof module.ZiweiInitializationError) code = error.code;
    else throw error;
  }
  const ready = await module.initialize({ wasmUrl: new URL(good) });
  return { code, ready: Object.isFrozen(ready) };
}

export async function corsFailure({ denied, allowed }: { denied: string; allowed: string }) {
  const module: typeof import("@matharts/ziwei-wasm") = await import(
    new URL("/index.js", location.href).href
  );
  let deniedCode;
  try {
    await module.initialize({ wasmUrl: new URL(denied) });
  } catch (error) {
    if (error instanceof module.ZiweiInitializationError) deniedCode = error.code;
    else throw error;
  }
  return {
    deniedCode,
    ready: Object.isFrozen(await module.initialize({ wasmUrl: new URL(allowed) })),
  };
}

export async function cspFailure() {
  const module: typeof import("@matharts/ziwei-wasm") = await import(
    new URL("/index.js", location.href).href
  );
  try {
    await module.initialize();
  } catch (error) {
    if (error instanceof module.ZiweiInitializationError) return error.code;
    throw error;
  }
  return "unexpected success";
}
