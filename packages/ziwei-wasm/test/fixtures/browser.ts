import type { Birth, Parameters, Natal, ReadyZiweiRuntime } from "@matharts/ziwei-wasm";

import type { QueryCall } from "./queries.ts";

export interface ContractInput {
  readonly birth: Birth;
  readonly parameters: Parameters;
  readonly calls: QueryCall[];
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
  let running = true;
  const tick = () => {
    if (running) {
      ticks++;
      requestAnimationFrame(tick);
    }
  };
  requestAnimationFrame(tick);
  try {
    const result = await new Promise<Awaited<ReturnType<typeof fullContract>>>(
      (resolve, reject) => {
        worker.onerror = (event) => reject(new Error(event.message));
        worker.onmessage = (event) =>
          event.data.error
            ? reject(new Error(JSON.stringify(event.data.error)))
            : resolve(event.data);
        worker.postMessage({ id: 1, ...input, count: 50_000 });
      },
    );
    return { ...result, cloneFrozen: Object.isFrozen(result.charts.birth.snapshot), ticks };
  } finally {
    running = false;
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
