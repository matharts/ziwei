import type { ContractInput } from "./browser.ts";

declare function postMessage(value: unknown): void;
type Message = ContractInput & { readonly id: number; readonly kind: "start" };

addEventListener("message", async (event: MessageEvent<Message>) => {
  const message = event.data;
  const id = message.id;
  try {
    const module: typeof import("@matharts/ziwei-wasm") = await import(
      new URL("./index.js", import.meta.url).href
    );
    const ready = await module.initialize();
    let completed = 0;
    postMessage({ id, kind: "busy" });
    while (completed < 50_000) {
      const end = Math.min(completed + 256, 50_000);
      for (; completed < end; completed++) {
        const natal = ready.Ziwei.fromBirth(message.birth);
        natal.dispose();
      }
      // The fixed batch finishes without a main-thread acknowledgment.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    const fixture: typeof import("./browser.ts") = await import(
      new URL("./browser.js", import.meta.url).href
    );
    postMessage({ id, kind: "result", completed, ...(await fixture.fullContract(message)) });
  } catch (error) {
    const record = error !== null && typeof error === "object" ? error : {};
    postMessage({
      id,
      error: {
        name: Reflect.get(record, "name"),
        message: Reflect.get(record, "message"),
        code: Reflect.get(record, "code"),
        detail: Reflect.get(record, "detail"),
      },
    });
  }
});
