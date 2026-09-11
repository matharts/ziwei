import type { EdgeRequest, EdgeReply } from "./browser-edge.ts";

declare function postMessage(value: EdgeReply): void;

addEventListener("message", async (event: MessageEvent<EdgeRequest>) => {
  const { id, kind, birth } = event.data;
  const module: typeof import("@matharts/ziwei-wasm") = await import(
    new URL("/index.js", import.meta.url).href
  );
  try {
    const { Ziwei } = await module.initialize();
    if (kind === "busy") {
      const until = performance.now() + 10_000;
      for (let completed = 1; completed <= 10_000_000; completed++) {
        const natal = Ziwei.fromBirth(birth);
        try {
          natal.mingPalace();
        } finally {
          natal.dispose();
        }
        // Acknowledge only after actual Wasm chart work, then stay synchronously busy.
        if (completed === 16) postMessage({ id, status: "started", completed });
        if (completed >= 16 && performance.now() >= until) break;
      }
    }
    const natal = Ziwei.fromBirth(birth);
    try {
      postMessage({ id, status: "success", snapshot: natal.toJSON() });
    } finally {
      natal.dispose();
    }
  } catch (error) {
    if (!(error instanceof module.ZiweiError)) throw error;
    // Error instances are not a cross-realm protocol; preserve the structured numeric data.
    postMessage({
      id,
      status: "error",
      error: { name: error.name, message: error.message, detail: error.detail },
    });
  }
});
