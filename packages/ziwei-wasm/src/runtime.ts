import { createIdentities } from "./identities.js";
import { capture } from "./input.js";
import { natal } from "./natal.js";
import type { Birth, Parameters, Natal, ReadyZiweiRuntime } from "./types.js";

const birthFields = ["gender", "birthYear", "birthMonth", "birthDay", "birthHour"];
const parameterFields = [
  "gender",
  "birthStem",
  "birthBranch",
  "birthMonth",
  "ziweiBranch",
  "birthHour",
];

export function createRuntime(
  native: typeof import("../generated/ziwei_wasm.js"),
): ReadyZiweiRuntime {
  const Ziwei = Object.freeze({
    fromBirth(birth: Birth): Natal {
      const [gender, year, month, day, hour] = capture(birth, birthFields, arguments.length === 0);
      return natal(native.fromBirth(gender, year, month, day, hour));
    },
    fromParameters(parameters: Parameters): Natal {
      const [gender, stem, branch, month, ziweiBranch, hour] = capture(
        parameters,
        parameterFields,
        arguments.length === 0,
      );
      return natal(native.fromParameters(gender, stem, branch, month, ziweiBranch, hour));
    },
  });
  return Object.freeze({ Ziwei, ...createIdentities(native) });
}

export type { ReadyZiweiRuntime } from "./types.js";
