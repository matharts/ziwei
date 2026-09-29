import { ZiweiError } from "./errors.js";

export function invalid(field: string, value: unknown): never {
  throw new ZiweiError("INVALID_ARGUMENT", `无效参数：${field}`, { field, value });
}

export function integer(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max)
    invalid(field, value);
  return value;
}
