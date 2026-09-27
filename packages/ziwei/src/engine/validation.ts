import { argumentError } from "@matharts/ziwei-shared";

export interface EngineFailure {
  code: string;
  message: string;
  path?: string;
  reason?: string;
  receivedType?: string;
  value?: number;
  stem?: number;
  branch?: number;
}

export function isFailure(value: unknown): value is EngineFailure {
  return value !== null && typeof value === "object" && Object.hasOwn(value, "code");
}

export function argumentFailure(path: string, reason: string, value?: unknown): EngineFailure {
  const error = argumentError(path === "" ? [] : [path], reason as never, value);
  const detail = error.detail;
  if (detail.code !== "INVALID_ARGUMENT") throw new Error("参数错误分类不一致");
  return {
    code: detail.code,
    message: error.message,
    path: detail.path.join("."),
    reason: detail.reason,
    receivedType: detail.received.type,
    ...(detail.received.type === "number" ? { value: detail.received.value } : {}),
  };
}

export function domainFailure(code: string, valueOrStem: number, branch?: number): EngineFailure {
  if (code === "INVALID_SEXAGENARY_YEAR") {
    return {
      code,
      message: `无效六十甲子：${STEMS[valueOrStem] ?? "?"}${BRANCHES[branch ?? -1] ?? "?"}`,
      stem: valueOrStem,
      ...(branch === undefined ? {} : { branch }),
    };
  }
  const labels: Record<string, string> = {
    INVALID_LUNISOLAR_MONTH: "农历月份",
    INVALID_LUNISOLAR_DAY: "农历日期",
    INVALID_DECADE_INDEX: "大限序号",
    INVALID_YEARLY_INDEX: "流年序号",
  };
  const label = labels[code];
  if (label === undefined) throw new Error(`未知领域错误：${code}`);
  return { code, message: `无效${label}：${valueOrStem}`, value: valueOrStem };
}

export const STEMS = Object.freeze(["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"]);
export const BRANCHES = Object.freeze([
  "子",
  "丑",
  "寅",
  "卯",
  "辰",
  "巳",
  "午",
  "未",
  "申",
  "酉",
  "戌",
  "亥",
]);
