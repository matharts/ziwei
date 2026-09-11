import { wasmSha256, wasmByteLength } from "../generated/asset.js";
import * as native from "../generated/ziwei_wasm.js";
import { createRuntime } from "./runtime.js";
import type { ReadyZiweiRuntime } from "./runtime.js";

export interface InitializeOptions {
  /** Override the HTTP(S) resource URL; it must serve the matching packaged Wasm bytes. */
  readonly wasmUrl?: URL;
}

export type InitializationFailure =
  | "UNSUPPORTED_ENVIRONMENT"
  | "RESOURCE_CONFLICT"
  | "LOAD_FAILED"
  | "INVALID_RESPONSE"
  | "INTEGRITY_MISMATCH"
  | "INSTANTIATION_FAILED";

export class ZiweiInitializationError extends Error {
  declare readonly code: InitializationFailure;

  constructor(code: InitializationFailure, message: string, options?: ErrorOptions) {
    super(message, options);
    Object.defineProperties(this, {
      name: { value: "ZiweiInitializationError" },
      code: { value: code, enumerable: true },
    });
  }
}

type Initialization = { readonly url: string; readonly promise: Promise<ReadyZiweiRuntime> };
let initialization: Initialization | undefined;

function resource(options: InitializeOptions | undefined): URL {
  if (options === undefined) return new URL("../generated/ziwei_wasm_bg.wasm", import.meta.url);
  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("初始化选项必须是对象");
  }
  for (const key of Reflect.ownKeys(options)) {
    if (key !== "wasmUrl") throw new TypeError("初始化选项只允许 wasmUrl");
  }
  const descriptor = Object.getOwnPropertyDescriptor(options, "wasmUrl");
  if (descriptor === undefined) return new URL("../generated/ziwei_wasm_bg.wasm", import.meta.url);
  if (!Object.hasOwn(descriptor, "value")) throw new TypeError("wasmUrl 必须是数据属性");
  if (!(descriptor.value instanceof URL)) throw new TypeError("wasmUrl 必须是 URL 对象");
  return new URL(descriptor.value.href);
}

async function load(url: URL): Promise<ReadyZiweiRuntime> {
  if (globalThis.isSecureContext === false || globalThis.crypto?.subtle === undefined) {
    throw new ZiweiInitializationError(
      "UNSUPPORTED_ENVIRONMENT",
      "Wasm 资源校验需要支持 Web Crypto 的 HTTPS 或 localhost 安全上下文",
    );
  }
  let response: Response;
  try {
    response = await fetch(url, { credentials: "same-origin" });
  } catch (cause) {
    throw new ZiweiInitializationError("LOAD_FAILED", "无法获取 Wasm 资源", { cause });
  }
  if (
    !response.ok ||
    response.headers.get("content-type")?.split(";")[0]?.trim() !== "application/wasm"
  ) {
    await response.body?.cancel();
    throw new ZiweiInitializationError(
      "INVALID_RESPONSE",
      "Wasm 资源需要成功响应及 application/wasm 类型",
    );
  }
  const data = new Uint8Array(wasmByteLength);
  let received = 0;
  const reader = response.body?.getReader();
  if (reader === undefined)
    throw new ZiweiInitializationError("INVALID_RESPONSE", "Wasm 响应没有资源内容");
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value.byteLength > wasmByteLength - received) {
        await reader.cancel();
        throw new ZiweiInitializationError("INTEGRITY_MISMATCH", "Wasm 资源与当前包不匹配");
      }
      data.set(value, received);
      received += value.byteLength;
    }
  } catch (cause) {
    if (cause instanceof ZiweiInitializationError) throw cause;
    throw new ZiweiInitializationError("LOAD_FAILED", "无法读取 Wasm 资源", { cause });
  } finally {
    reader.releaseLock();
  }
  if (received !== wasmByteLength) {
    throw new ZiweiInitializationError("INTEGRITY_MISMATCH", "Wasm 资源与当前包不匹配");
  }
  const bytes = data.buffer;
  let digest: ArrayBuffer;
  try {
    digest = await crypto.subtle.digest("SHA-256", bytes);
  } catch (cause) {
    throw new ZiweiInitializationError("LOAD_FAILED", "无法校验 Wasm 资源摘要", { cause });
  }
  const hash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  if (hash !== wasmSha256) {
    throw new ZiweiInitializationError("INTEGRITY_MISMATCH", "Wasm 资源与当前包不匹配");
  }
  try {
    await native.default({ module_or_path: bytes });
    return createRuntime(native);
  } catch (cause) {
    throw new ZiweiInitializationError("INSTANTIATION_FAILED", "无法初始化 Wasm 排盘引擎", {
      cause,
    });
  }
}

/** Initialize once per ESM instance. Domain operations remain synchronous after readiness. */
export async function initialize(options?: InitializeOptions): Promise<ReadyZiweiRuntime> {
  const url = resource(options);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("wasmUrl 必须使用 HTTP 或 HTTPS");
  }
  if (url.username !== "" || url.password !== "")
    throw new TypeError("wasmUrl 不能包含用户名或密码");
  const href = url.href;
  if (initialization !== undefined) {
    if (initialization.url !== href) {
      throw new ZiweiInitializationError("RESOURCE_CONFLICT", "当前模块已选择另一个 Wasm 资源");
    }
    return initialization.promise;
  }
  const current: Initialization = { url: href, promise: load(url) };
  initialization = current;
  try {
    return await current.promise;
  } catch (error) {
    if (initialization === current) initialization = undefined;
    throw error;
  }
}
