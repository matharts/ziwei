import type { Branch, Stem } from "./identities.js";

export type ZiweiErrorCode =
  | "INVALID_ARGUMENT"
  | "INVALID_SEXAGENARY_YEAR"
  | "INVALID_LUNISOLAR_MONTH"
  | "INVALID_LUNISOLAR_DAY"
  | "INVALID_DECADE_INDEX"
  | "INVALID_YEARLY_INDEX";
export type ZiweiErrorDetail =
  | { readonly code: "INVALID_ARGUMENT"; readonly field: string; readonly value: unknown }
  | { readonly code: "INVALID_SEXAGENARY_YEAR"; readonly stem: Stem; readonly branch: Branch }
  | {
      readonly code:
        | "INVALID_LUNISOLAR_MONTH"
        | "INVALID_LUNISOLAR_DAY"
        | "INVALID_DECADE_INDEX"
        | "INVALID_YEARLY_INDEX";
      readonly value: number;
    };

export class ZiweiError extends Error {
  readonly code: ZiweiErrorCode;
  readonly detail: ZiweiErrorDetail;
  constructor(code: ZiweiErrorCode, message: string, detail: Record<string, unknown>) {
    super(message);
    this.name = "ZiweiError";
    this.code = code;
    this.detail = Object.freeze({ code, ...detail }) as ZiweiErrorDetail;
  }
}
