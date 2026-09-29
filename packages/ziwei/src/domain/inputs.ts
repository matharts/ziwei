import { integer, invalid } from "./constraints.js";
import { ZiweiError } from "./errors.js";
import { Gender, Stem } from "./identities.js";
import type { Birth, BirthDay, BirthMonth, Parameters } from "./types.js";
import { branch } from "./validation.js";

function gender(value: unknown): Gender {
  return integer(value, "gender", 0, 1) as Gender;
}

function stem(value: unknown): Stem {
  return integer(value, "birthStem", 0, 9) as Stem;
}

function birthMonth(value: unknown): BirthMonth {
  const month = integer(value, "birthMonth", 0, 255);
  if (month < 1 || month > 12)
    throw new ZiweiError("INVALID_LUNISOLAR_MONTH", `无效农历月份：${month}`, { value: month });
  return month;
}

function birthDay(value: unknown): BirthDay {
  const day = integer(value, "birthDay", 0, 255);
  if (day < 1 || day > 30)
    throw new ZiweiError("INVALID_LUNISOLAR_DAY", `无效农历日期：${day}`, { value: day });
  return day;
}

function inputKeys(value: unknown): readonly PropertyKey[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) invalid("input", value);
  const symbols = Object.getOwnPropertySymbols(value);
  const names = Object.getOwnPropertyNames(value);
  return symbols.length === 0 ? names : [...names, ...symbols];
}

function inputField(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor)) invalid(key, undefined);
  return descriptor.value;
}

function inputComplete(value: object, own: readonly PropertyKey[], keys: readonly string[]): void {
  if (own.length !== keys.length) invalid("input", value);
  let ordered = true;
  for (let index = 0; index < keys.length; index++) {
    if (own[index] !== keys[index]) {
      ordered = false;
      break;
    }
  }
  if (ordered) return;
  if (own.some((key) => typeof key !== "string" || !keys.includes(key))) invalid("input", value);
}

const BIRTH_KEYS = ["gender", "birthYear", "birthMonth", "birthDay", "birthHour"];
const PARAMETER_KEYS = [
  "gender",
  "birthStem",
  "birthBranch",
  "birthMonth",
  "ziweiBranch",
  "birthHour",
];

export function validateBirth(raw: Birth): Birth {
  const own = inputKeys(raw);
  const genderValue = inputField(raw, "gender");
  const birthYearValue = inputField(raw, "birthYear");
  const birthMonthValue = inputField(raw, "birthMonth");
  const birthDayValue = inputField(raw, "birthDay");
  const birthHourValue = inputField(raw, "birthHour");
  inputComplete(raw, own, BIRTH_KEYS);
  return {
    gender: gender(genderValue),
    birthYear: integer(birthYearValue, "birthYear", -2_147_483_648, 2_147_483_647),
    birthMonth: birthMonth(birthMonthValue),
    birthDay: birthDay(birthDayValue),
    birthHour: branch(birthHourValue, "birthHour"),
  };
}

export function validateParameters(raw: Parameters): Parameters {
  const own = inputKeys(raw);
  const genderValue = inputField(raw, "gender");
  const birthStemValue = inputField(raw, "birthStem");
  const birthBranchValue = inputField(raw, "birthBranch");
  const birthMonthValue = inputField(raw, "birthMonth");
  const ziweiBranchValue = inputField(raw, "ziweiBranch");
  const birthHourValue = inputField(raw, "birthHour");
  inputComplete(raw, own, PARAMETER_KEYS);
  const values = {
    gender: gender(genderValue),
    birthStem: stem(birthStemValue),
    birthBranch: branch(birthBranchValue, "birthBranch"),
    birthMonth: birthMonth(birthMonthValue),
    ziweiBranch: branch(ziweiBranchValue, "ziweiBranch"),
    birthHour: branch(birthHourValue, "birthHour"),
  };
  if (values.birthStem % 2 !== values.birthBranch % 2) {
    throw new ZiweiError("INVALID_SEXAGENARY_YEAR", "无效六十甲子年柱", {
      stem: values.birthStem,
      branch: values.birthBranch,
    });
  }
  return values;
}
