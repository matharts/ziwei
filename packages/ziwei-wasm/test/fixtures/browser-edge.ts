import type { Birth, NatalSnapshot, ZiweiErrorDetail } from "@matharts/ziwei-wasm";

import type { QueryCall } from "./queries.ts";

export interface EdgeRequest {
  readonly id: number;
  readonly kind: "birth" | "busy";
  readonly birth: Birth;
}

export type EdgeReply =
  | { readonly id: number; readonly status: "started"; readonly completed: number }
  | { readonly id: number; readonly status: "success"; readonly snapshot: NatalSnapshot }
  | {
      readonly id: number;
      readonly status: "error";
      readonly error: {
        readonly name: string;
        readonly message: string;
        readonly detail: ZiweiErrorDetail;
      };
    };

// This file is loaded directly by Node; each evaluate function is self-contained.
export async function numberBoundaries() {
  const module: typeof import("@matharts/ziwei-wasm") = await import(
    new URL("/index.js", location.href).href
  );
  const { Ziwei } = await module.initialize();
  const birth: Birth = { gender: 0, birthYear: 1992, birthMonth: 8, birthDay: 15, birthHour: 3 };
  const endpoints = [-2_147_483_648, 2_147_483_647].map((birthYear) => {
    const natal = Ziwei.fromBirth({ ...birth, birthYear });
    try {
      return natal.toJSON();
    } finally {
      natal.dispose();
    }
  });
  const failures = [-2_147_483_649, 2_147_483_648, NaN, Infinity, -Infinity, 1.5].map(
    (birthYear) => {
      try {
        Ziwei.fromBirth({ ...birth, birthYear }).dispose();
      } catch (error) {
        if (!(error instanceof module.ZiweiError)) throw error;
        return { input: birthYear, name: error.name, message: error.message, detail: error.detail };
      }
      throw new Error(`Accepted invalid birth year ${birthYear}`);
    },
  );
  return { endpoints, failures };
}

export async function memoryGrowth({ birth, calls }: { birth: Birth; calls: QueryCall[] }) {
  const module: typeof import("@matharts/ziwei-wasm") = await import(
    new URL("/index.js", location.href).href
  );
  const original = WebAssembly.instantiate;
  const memories = new Set<WebAssembly.Memory>();
  let observed = 0;
  WebAssembly.instantiate = new Proxy(original, {
    apply(target, receiver, args) {
      // Preserve the original call and Promise identity; only observe its result.
      const pending: Promise<WebAssembly.Instance | WebAssembly.WebAssemblyInstantiatedSource> =
        Reflect.apply(target, receiver, args);
      void pending.then(
        (result) => {
          observed++;
          const instance = result instanceof WebAssembly.Instance ? result : result.instance;
          for (const value of Object.values(instance.exports)) {
            if (value instanceof WebAssembly.Memory) memories.add(value);
          }
        },
        () => {},
      );
      return pending;
    },
  });
  let ready;
  try {
    ready = await module.initialize();
  } finally {
    WebAssembly.instantiate = original;
  }
  const memory = [...memories][0];
  if (memories.size !== 1 || !memory) throw new Error("Did not observe one real Wasm memory");
  const natal = ready.Ziwei.fromBirth(birth);
  const query = (call: QueryCall) => {
    const method: unknown = Reflect.get(natal, call.method);
    if (typeof method !== "function") throw new Error(`Missing query ${call.method}`);
    return Reflect.apply(method, natal, call.args);
  };
  try {
    const retained = natal.toJSON();
    const profile = natal.profile;
    const palaces = natal.palaces;
    const oldBuffer = memory.buffer;
    const before = oldBuffer.byteLength;
    const previousPages = memory.grow(1);
    const after = memory.buffer.byteLength;
    const results = calls.map(query);
    const snapshot = natal.toJSON();
    const sameCache = natal.profile === profile && natal.palaces === palaces;
    natal.dispose();
    natal.dispose();
    const disposed = calls.every((call) => {
      try {
        query(call);
      } catch (error) {
        return error instanceof module.ZiweiLifecycleError;
      }
      return false;
    });
    const disposedGetters = ["profile", "palaces", "zodiac", "fiveElementBureau"].every((name) => {
      try {
        Reflect.get(natal, name);
      } catch (error) {
        return error instanceof module.ZiweiLifecycleError;
      }
      return false;
    });
    return {
      observed,
      restored: WebAssembly.instantiate === original,
      before,
      after,
      previousPages,
      oldBufferBytes: oldBuffer.byteLength,
      results,
      snapshot,
      retained,
      sameCache,
      disposed,
      disposedGetters,
      retainedFrozen: Object.isFrozen(retained) && Object.isFrozen(retained.palaces[0]?.stars),
    };
  } finally {
    natal.dispose();
  }
}

export async function workerRecovery() {
  const worker = new Worker(new URL("/edge-worker.js", location.href), { type: "module" });
  const birth: Birth = { gender: 0, birthYear: 1992, birthMonth: 8, birthDay: 15, birthHour: 3 };
  const request = (id: number, birthYear: number) =>
    new Promise<EdgeReply>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Worker response timed out")), 10_000);
      worker.onerror = (event) => {
        clearTimeout(timeout);
        reject(new Error(event.message));
      };
      worker.onmessage = (event: MessageEvent<EdgeReply>) => {
        clearTimeout(timeout);
        if (event.data.id !== id) reject(new Error("Worker replied with the wrong request ID"));
        else resolve(event.data);
      };
      worker.postMessage({
        id,
        kind: "birth",
        birth: { ...birth, birthYear },
      } satisfies EdgeRequest);
    });
  try {
    const errors = [];
    for (const [index, year] of [
      NaN,
      Infinity,
      -Infinity,
      2_147_483_648,
      -2_147_483_649,
      1.5,
    ].entries()) {
      errors.push({ input: year, reply: await request(index, year) });
    }
    // No replacement/reinitialization: the exact Worker that returned errors handles this.
    return { errors, recovered: await request(100, birth.birthYear) };
  } finally {
    worker.terminate();
  }
}

export async function terminateBusyWorker() {
  const birth: Birth = { gender: 0, birthYear: 1992, birthMonth: 8, birthDay: 15, birthHour: 3 };
  const old = new Worker(new URL("/edge-worker.js", location.href), { type: "module" });
  const messages: EdgeReply[] = [];
  old.addEventListener("message", (event: MessageEvent<EdgeReply>) => messages.push(event.data));
  let replacement: Worker | undefined;
  try {
    const started = await new Promise<EdgeReply>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Busy Worker never started")), 10_000);
      old.onerror = (event) => {
        clearTimeout(timeout);
        reject(new Error(event.message));
      };
      old.onmessage = (event: MessageEvent<EdgeReply>) => {
        clearTimeout(timeout);
        resolve(event.data);
      };
      old.postMessage({ id: 1, kind: "busy", birth } satisfies EdgeRequest);
    });
    if (started.status !== "started") throw new Error("Expected busy-start acknowledgement");
    // Observe main-realm timer and rendering progress while the old Worker is computing.
    let ticks = 0;
    const timer = setInterval(() => ticks++, 0);
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
    } finally {
      clearInterval(timer);
    }
    old.terminate();
    const beforeReplacement = messages.length;
    replacement = new Worker(new URL("/edge-worker.js", location.href), { type: "module" });
    const active = replacement;
    const recovered = await new Promise<EdgeReply>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Replacement Worker timed out")), 10_000);
      active.onerror = (event) => {
        clearTimeout(timeout);
        reject(new Error(event.message));
      };
      active.onmessage = (event: MessageEvent<EdgeReply>) => {
        clearTimeout(timeout);
        resolve(event.data);
      };
      active.postMessage({ id: 2, kind: "birth", birth } satisfies EdgeRequest);
    });
    // A bounded observation window also catches queued messages from the terminated task.
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    return { started, ticks, recovered, messages, beforeReplacement };
  } finally {
    old.terminate();
    replacement?.terminate();
  }
}
