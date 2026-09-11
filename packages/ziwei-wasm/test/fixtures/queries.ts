import type { ReadyZiweiRuntime, Natal } from "../../src/index.js";

export interface QueryCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

/** Exhaust every public query across its finite identity/index domain. */
export function queryCalls(
  runtime: Pick<ReadyZiweiRuntime, "Branch" | "StarName" | "PalaceName" | "Transformation">,
): QueryCall[] {
  const calls: QueryCall[] = [
    "mingPalace",
    "shenPalace",
    "originPalace",
    "ziweiPalace",
    "birthTransformations",
    "selfTransformations",
    "toJSON",
  ].map((method) => ({ method, args: [] }));
  for (const branch of runtime.Branch.ALL) {
    for (const method of [
      "palace",
      "oppositePalace",
      "sizhengPalaces",
      "palaceTransformations",
      "palaceTransformationSources",
    ])
      calls.push({ method, args: [branch] });
    for (const include of [false, true])
      calls.push({ method: "sanfangPalaces", args: [branch, include] });
    for (const name of runtime.StarName.ALL)
      calls.push({ method: "palaceStar", args: [branch, name] });
    for (const kind of runtime.Transformation.ALL)
      calls.push({ method: "palaceTransformation", args: [branch, kind] });
  }
  for (const name of runtime.PalaceName.ALL) calls.push({ method: "palaceByName", args: [name] });
  for (const name of runtime.StarName.ALL) {
    calls.push({ method: "star", args: [name] }, { method: "palaceByStar", args: [name] });
  }
  for (let age = 0; age <= 255; age++) calls.push({ method: "periodIndicesAtAge", args: [age] });
  for (let decade = 0; decade < 12; decade++) {
    calls.push({ method: "decade", args: [decade] }, { method: "decadeYears", args: [decade] });
    for (const branch of runtime.Branch.ALL)
      calls.push({ method: "decadeByBranch", args: [decade, branch] });
    for (const name of runtime.PalaceName.ALL)
      calls.push({ method: "decadePalaceByName", args: [decade, name] });
    for (let yearly = 0; yearly < 10; yearly++) {
      calls.push({ method: "yearly", args: [decade, yearly] });
      for (const branch of runtime.Branch.ALL)
        calls.push({ method: "yearlyByBranch", args: [decade, yearly, branch] });
      for (const name of runtime.PalaceName.ALL)
        calls.push({ method: "yearlyPalaceByName", args: [decade, yearly, name] });
    }
  }
  return calls;
}

export function invoke(value: object, call: QueryCall): unknown {
  const method: unknown = Reflect.get(value, call.method);
  if (typeof method !== "function") throw new Error(`Missing query ${call.method}`);
  return Reflect.apply(method, value, call.args);
}

export function assertFrozen(value: unknown): void {
  if (value === null || typeof value !== "object") return;
  if (!Object.isFrozen(value)) throw new Error("Mutable output escaped the adapter");
  for (const child of Object.values(value)) assertFrozen(child);
}

export function facts(value: Pick<Natal, "profile" | "palaces" | "zodiac" | "fiveElementBureau">) {
  return {
    profile: value.profile,
    palaces: value.palaces,
    zodiac: value.zodiac,
    fiveElementBureau: value.fiveElementBureau,
  };
}
