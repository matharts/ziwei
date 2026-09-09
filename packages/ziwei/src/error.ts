import type { NativeFailure } from "../native/binding.cjs";
import type { Branch, Stem } from "./types.js";

export type ArgumentFailureReason =
  | "missing"
  | "type"
  | "non_finite"
  | "non_integer"
  | "out_of_range"
  | "not_member"
  | "unknown_field"
  | "accessor";

export type ReceivedValue =
  | { readonly type: "number"; readonly value: number }
  | {
      readonly type:
        | "undefined"
        | "null"
        | "boolean"
        | "string"
        | "bigint"
        | "symbol"
        | "function"
        | "object"
        | "array"
        | "unread";
    };

export type ZiweiErrorDetail =
  | {
      readonly code: "INVALID_ARGUMENT";
      readonly path: readonly string[];
      readonly reason: ArgumentFailureReason;
      readonly received: ReceivedValue;
    }
  | { readonly code: "INVALID_SEXAGENARY_YEAR"; readonly stem: Stem; readonly branch: Branch }
  | { readonly code: "INVALID_LUNISOLAR_MONTH"; readonly value: number }
  | { readonly code: "INVALID_LUNISOLAR_DAY"; readonly value: number }
  | { readonly code: "INVALID_DECADE_INDEX"; readonly value: number }
  | { readonly code: "INVALID_YEARLY_INDEX"; readonly value: number };

export type ZiweiErrorCode = ZiweiErrorDetail["code"];

const errorToken = Symbol("ZiweiError");
let createError: (detail: ZiweiErrorDetail, message: string) => ZiweiError;

export class ZiweiError extends Error {
  declare readonly name: "ZiweiError";
  declare readonly code: ZiweiErrorDetail["code"];
  declare readonly detail: ZiweiErrorDetail;

  private constructor(detail: ZiweiErrorDetail, message: string, token: symbol) {
    super(message);
    if (token !== errorToken) throw new TypeError("ZiweiError 不提供公开构造器");
    if (detail.code === "INVALID_ARGUMENT") {
      Object.freeze(detail.path);
      Object.freeze(detail.received);
    }
    Object.freeze(detail);
    Object.defineProperties(this, {
      name: { value: "ZiweiError", enumerable: false },
      code: { value: detail.code, enumerable: true },
      detail: { value: detail, enumerable: true },
    });
  }

  static {
    createError = (detail, message) => new ZiweiError(detail, message, errorToken);
  }
}

function describe(value: unknown): ReceivedValue {
  const type = typeof value;
  if (type === "number") return { type, value: Number(value) };
  if (value === null) return { type: "null" };
  if (Array.isArray(value)) return { type: "array" };
  return { type };
}

export function argumentError(
  path: string[],
  reason: ArgumentFailureReason,
  value?: unknown,
): ZiweiError {
  return createError(
    {
      code: "INVALID_ARGUMENT",
      path,
      reason,
      received:
        reason === "accessor" || reason === "unknown_field" ? { type: "unread" } : describe(value),
    },
    path.length === 0 ? "建盘输入必须是包含自身数据属性的对象" : `参数 ${path[0]} 无效`,
  );
}

function required<T>(value: T | undefined | null): T {
  if (value === undefined || value === null) throw new Error("原生错误载荷不完整");
  return value;
}

function received(failure: NativeFailure): ReceivedValue {
  switch (failure.receivedType) {
    case "number":
      return { type: "number", value: required(failure.value) };
    case "undefined":
    case "null":
    case "boolean":
    case "string":
    case "bigint":
    case "symbol":
    case "function":
    case "object":
    case "array":
      return { type: failure.receivedType };
    default:
      throw new Error("原生错误含未知参数类型");
  }
}

function reason(failure: NativeFailure): ArgumentFailureReason {
  switch (failure.reason) {
    case "type":
    case "non_finite":
    case "non_integer":
    case "out_of_range":
    case "not_member":
      return failure.reason;
    default:
      throw new Error("原生错误含未知参数原因");
  }
}

function isStem(value: number): value is Stem {
  return Number.isInteger(value) && value >= 0 && value <= 9;
}

function isBranch(value: number): value is Branch {
  return Number.isInteger(value) && value >= 0 && value <= 11;
}

/** Internal native union: only expected failures carry a code field. */
export function unwrap<T>(result: T | NativeFailure): T {
  if (isNativeFailure(result)) throw nativeError(result);
  return result;
}

function isNativeFailure(value: unknown): value is NativeFailure {
  return value !== null && typeof value === "object" && Object.hasOwn(value, "code");
}

export function nativeError(failure: NativeFailure): ZiweiError {
  switch (failure.code) {
    case "INVALID_ARGUMENT":
      return createError(
        {
          code: failure.code,
          path: [required(failure.path)],
          reason: reason(failure),
          received: received(failure),
        },
        failure.message,
      );
    case "INVALID_SEXAGENARY_YEAR": {
      const stem = required(failure.stem);
      const branch = required(failure.branch);
      if (!isStem(stem) || !isBranch(branch)) throw new Error("原生错误含未知干支身份");
      return createError(
        {
          code: failure.code,
          stem,
          branch,
        },
        failure.message,
      );
    }
    case "INVALID_LUNISOLAR_MONTH":
    case "INVALID_LUNISOLAR_DAY":
    case "INVALID_DECADE_INDEX":
    case "INVALID_YEARLY_INDEX":
      return createError({ code: failure.code, value: required(failure.value) }, failure.message);
    default:
      throw new Error("原生错误码不受当前适配包支持");
  }
}
