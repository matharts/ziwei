import type { ContractInput } from "./browser.ts";

declare function postMessage(value: unknown): void;
type Message = ContractInput & { readonly id: number; readonly count?: number };

addEventListener("message", async (event: MessageEvent<Message>) => {
  const id = event.data.id;
  try {
    const module: typeof import("@matharts/ziwei-wasm") = await import(
      new URL("./index.js", import.meta.url).href
    );
    const ready = await module.initialize();
    for (let index = 0; index < (event.data.count ?? 1); index++) {
      const natal = ready.Ziwei.fromBirth(event.data.birth);
      natal.dispose();
    }
    const fixture: typeof import("./browser.ts") = await import(
      new URL("./browser.js", import.meta.url).href
    );
    postMessage({ id, ...(await fixture.fullContract(event.data)) });
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
