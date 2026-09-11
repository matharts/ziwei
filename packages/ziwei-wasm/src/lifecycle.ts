/** A released Wasm holder cannot be queried; previously returned data remains valid. */
export class ZiweiLifecycleError extends Error {
  declare readonly code: "NATAL_DISPOSED";

  constructor() {
    super("Wasm 命盘已释放，不能继续读取或查询");
    Object.defineProperties(this, {
      name: { value: "ZiweiLifecycleError" },
      code: { value: "NATAL_DISPOSED", enumerable: true },
    });
  }
}
