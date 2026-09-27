import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { test } from "@rstest/core";

import {
  Branch,
  FiveElementBureau,
  Gender,
  StarName,
  Stem,
  Ziwei,
  ZiweiError,
} from "@matharts/ziwei";

interface JiaZiCase {
  readonly id: string;
  readonly contractVersion: "v1";
  readonly scenario: "construct-chart" | "reject-input";
  readonly input: {
    readonly kind: "Birth";
    readonly gender: "Male" | "Female";
    readonly birthYear: number;
    readonly birthMonth: number;
    readonly birthDay: number;
    readonly birthHour: string;
  };
  readonly expected: {
    readonly yearPillar: { readonly stem: string; readonly branch: string };
    readonly fiveElementBureau: string;
    readonly mingBranch: string;
    readonly shenBranch: string;
    readonly originBranch: string;
    readonly ziweiBranch: string;
    readonly tianfuBranch: string;
    readonly palaces?: readonly {
      readonly branch: string;
      readonly name: string;
      readonly stem: string;
      readonly ageStart: number;
      readonly ageEnd: number;
    }[];
  };
  readonly queries: readonly (
    | { readonly kind: "star-branch"; readonly star: string; readonly expectedBranch: string }
    | {
        readonly kind: "period-boundary";
        readonly decadeIndex: number;
        readonly yearlyIndex: number;
        readonly decadeMingBranch: string;
        readonly yearlyMingBranch: string;
        readonly firstAge: number;
        readonly lastAge: number;
        readonly firstYear: number;
        readonly lastYear: number;
      }
  )[];
  readonly provenance: {
    readonly sources: readonly { readonly path: string; readonly section: string }[];
    readonly derivation: string;
  };
  readonly evidence: {
    readonly independentOfImplementationOutput: true;
    readonly externalReview: "not-reviewed" | "reviewed";
    readonly reviewSource?: string;
  };
}

const conformanceRoot = new URL("../../../conformance/", import.meta.url);
const branches = new Map<number, string>([
  [Branch.Zi, "Zi"],
  [Branch.Chou, "Chou"],
  [Branch.Yin, "Yin"],
  [Branch.Mao, "Mao"],
  [Branch.Chen, "Chen"],
  [Branch.Si, "Si"],
  [Branch.Wu, "Wu"],
  [Branch.Wei, "Wei"],
  [Branch.Shen, "Shen"],
  [Branch.You, "You"],
  [Branch.Xu, "Xu"],
  [Branch.Hai, "Hai"],
]);
const branchesByName: Readonly<Record<string, Branch>> = {
  Zi: Branch.Zi,
  Chou: Branch.Chou,
  Yin: Branch.Yin,
  Mao: Branch.Mao,
  Chen: Branch.Chen,
  Si: Branch.Si,
  Wu: Branch.Wu,
  Wei: Branch.Wei,
  Shen: Branch.Shen,
  You: Branch.You,
  Xu: Branch.Xu,
  Hai: Branch.Hai,
};
const stemsByName: Readonly<Record<string, Stem>> = {
  Jia: Stem.Jia,
  Yi: Stem.Yi,
  Bing: Stem.Bing,
  Ding: Stem.Ding,
  Wu: Stem.Wu,
  Ji: Stem.Ji,
  Geng: Stem.Geng,
  Xin: Stem.Xin,
  Ren: Stem.Ren,
  Gui: Stem.Gui,
};
const stems = new Map<number, string>([
  [Stem.Jia, "Jia"],
  [Stem.Yi, "Yi"],
  [Stem.Bing, "Bing"],
  [Stem.Ding, "Ding"],
  [Stem.Wu, "Wu"],
  [Stem.Ji, "Ji"],
  [Stem.Geng, "Geng"],
  [Stem.Xin, "Xin"],
  [Stem.Ren, "Ren"],
  [Stem.Gui, "Gui"],
]);
const bureaus = new Map<number, string>([
  [FiveElementBureau.WaterTwo, "WaterTwo"],
  [FiveElementBureau.WoodThree, "WoodThree"],
  [FiveElementBureau.MetalFour, "MetalFour"],
  [FiveElementBureau.EarthFive, "EarthFive"],
  [FiveElementBureau.FireSix, "FireSix"],
]);
const stars: Readonly<Record<string, StarName>> = {
  ZiWei: StarName.ZiWei,
  TianJi: StarName.TianJi,
  TaiYang: StarName.TaiYang,
  WuQu: StarName.WuQu,
  TianTong: StarName.TianTong,
  LianZhen: StarName.LianZhen,
  TianFu: StarName.TianFu,
  TaiYin: StarName.TaiYin,
  TanLang: StarName.TanLang,
  JuMen: StarName.JuMen,
  TianXiang: StarName.TianXiang,
  TianLiang: StarName.TianLiang,
  QiSha: StarName.QiSha,
  PoJun: StarName.PoJun,
  ZuoFu: StarName.ZuoFu,
  YouBi: StarName.YouBi,
  WenChang: StarName.WenChang,
  WenQu: StarName.WenQu,
};

test("TypeScript consumes the independently derived shared Jia Zi conformance case", () => {
  const schema = JSON.parse(
    readFileSync(fileURLToPath(new URL("schema/case.schema.json", conformanceRoot)), "utf8"),
  ) as {
    readonly $id: string;
    readonly properties: {
      readonly input: { readonly oneOf: readonly { readonly $ref: string }[] };
      readonly expected: { readonly oneOf: readonly { readonly $ref: string }[] };
      readonly evidence: { readonly required: readonly string[] };
    };
    readonly $defs: {
      readonly branch: { readonly enum: readonly string[] };
      readonly stem: { readonly enum: readonly string[] };
      readonly birth: { readonly required: readonly string[] };
    };
  };
  const testReadme = readFileSync(fileURLToPath(new URL("README.md", conformanceRoot)), "utf8");
  const fixture = JSON.parse(
    readFileSync(fileURLToPath(new URL("cases/jia-zi-fire-six.json", conformanceRoot)), "utf8"),
  ) as JiaZiCase;

  assert.equal(schema.$id, "urn:matharts:ziwei:conformance:case:v1");
  assert.deepEqual(schema.properties.input.oneOf, [
    { $ref: "#/$defs/birth" },
    { $ref: "#/$defs/parameters" },
  ]);
  assert.deepEqual(schema.properties.expected.oneOf, [
    { $ref: "#/$defs/chartExpected" },
    { $ref: "#/$defs/errorExpected" },
  ]);
  assert.deepEqual(schema.properties.evidence.required, [
    "independentOfImplementationOutput",
    "externalReview",
  ]);
  assert.deepEqual(schema.$defs.branch.enum, [...branches.values()]);
  assert.deepEqual(schema.$defs.stem.enum, [...stems.values()]);
  assert.deepEqual(schema.$defs.birth.required, [
    "kind",
    "gender",
    "birthYear",
    "birthMonth",
    "birthDay",
    "birthHour",
  ]);
  assert.match(testReadme, /预期事实/u);
  assert.match(testReadme, /独立/u);
  assert.equal(fixture.id, "natal.jia-zi-fire-six.1984-01-06");
  assert.equal(fixture.contractVersion, "v1");
  assert.equal(fixture.scenario, "construct-chart");
  assert.equal(fixture.evidence.independentOfImplementationOutput, true);
  assert.equal(fixture.evidence.externalReview, "not-reviewed");
  assert.ok(fixture.provenance.sources.length > 0);
  assert.ok(fixture.provenance.derivation.length > 0);

  assert.equal(fixture.input.kind, "Birth");
  const birthHour = branchesByName[fixture.input.birthHour];
  assert.notEqual(birthHour, undefined);
  const natal = Ziwei.fromBirth({
    gender: fixture.input.gender === "Male" ? Gender.Male : Gender.Female,
    birthYear: fixture.input.birthYear,
    birthMonth: fixture.input.birthMonth,
    birthDay: fixture.input.birthDay,
    birthHour,
  });
  const branchName = (branch: Branch) => branches.get(branch);
  assert.deepEqual(
    {
      yearPillar: {
        stem: stems.get(natal.profile.birthStem),
        branch: branchName(natal.profile.birthBranch),
      },
      fiveElementBureau: bureaus.get(natal.fiveElementBureau),
      mingBranch: branchName(natal.mingPalace().branch),
      shenBranch: branchName(natal.shenPalace().branch),
      originBranch: branchName(natal.originPalace().branch),
      ziweiBranch: branchName(natal.ziweiPalace().branch),
      tianfuBranch: branchName(natal.palaceByStar(StarName.TianFu).branch),
    },
    fixture.expected,
  );
  for (const query of fixture.queries) {
    if (query.kind === "star-branch") {
      const star = stars[query.star];
      assert.ok(star, `Unsupported case star: ${query.star}`);
      assert.equal(branchName(natal.palaceByStar(star).branch), query.expectedBranch);
    }
  }
});

test("TypeScript consumes independent day-one anchors for the other bureaus", () => {
  const filenames = [
    "bureau-day-one-water-two.json",
    "bureau-day-one-wood-three.json",
    "bureau-day-one-metal-four.json",
    "bureau-day-one-earth-five.json",
  ];
  for (const filename of filenames) {
    const fixture = JSON.parse(
      readFileSync(fileURLToPath(new URL(`cases/${filename}`, conformanceRoot)), "utf8"),
    ) as JiaZiCase;
    assert.equal(fixture.scenario, "construct-chart");
    assert.equal(fixture.evidence.independentOfImplementationOutput, true);
    assert.equal(fixture.evidence.externalReview, "not-reviewed");
    assert.ok(fixture.provenance.sources.length > 0);
    const birthHour = branchesByName[fixture.input.birthHour];
    assert.notEqual(birthHour, undefined);
    const natal = Ziwei.fromBirth({
      gender: fixture.input.gender === "Male" ? Gender.Male : Gender.Female,
      birthYear: fixture.input.birthYear,
      birthMonth: fixture.input.birthMonth,
      birthDay: fixture.input.birthDay,
      birthHour,
    });
    const branchName = (branch: Branch) => branches.get(branch);
    assert.deepEqual(
      {
        yearPillar: {
          stem: stems.get(natal.profile.birthStem),
          branch: branchName(natal.profile.birthBranch),
        },
        fiveElementBureau: bureaus.get(natal.fiveElementBureau),
        mingBranch: branchName(natal.mingPalace().branch),
        shenBranch: branchName(natal.shenPalace().branch),
        originBranch: branchName(natal.originPalace().branch),
        ziweiBranch: branchName(natal.ziweiPalace().branch),
        tianfuBranch: branchName(natal.palaceByStar(StarName.TianFu).branch),
      },
      fixture.expected,
      fixture.id,
    );
    for (const query of fixture.queries) {
      if (query.kind === "star-branch") {
        const star = stars[query.star];
        assert.ok(star, `Unsupported case star: ${query.star}`);
        assert.equal(branchName(natal.palaceByStar(star).branch), query.expectedBranch);
      }
    }
  }
});

test("TypeScript consumes both hand-worked full-chart and period boundary cases", () => {
  for (const filename of ["ding-mao-reverse-periods.json", "xin-you-forward-periods.json"]) {
    const fixture = JSON.parse(
      readFileSync(fileURLToPath(new URL(`cases/${filename}`, conformanceRoot)), "utf8"),
    ) as JiaZiCase;
    const { palaces: expectedPalaces, ...expectedCore } = fixture.expected;
    assert.equal(fixture.evidence.independentOfImplementationOutput, true);
    assert.equal(fixture.evidence.externalReview, "not-reviewed");
    const birthHour = branchesByName[fixture.input.birthHour];
    assert.notEqual(birthHour, undefined);
    const natal = Ziwei.fromBirth({
      gender: fixture.input.gender === "Male" ? Gender.Male : Gender.Female,
      birthYear: fixture.input.birthYear,
      birthMonth: fixture.input.birthMonth,
      birthDay: fixture.input.birthDay,
      birthHour,
    });
    const branchName = (branch: Branch) => branches.get(branch);
    assert.deepEqual(
      {
        yearPillar: {
          stem: stems.get(natal.profile.birthStem),
          branch: branchName(natal.profile.birthBranch),
        },
        fiveElementBureau: bureaus.get(natal.fiveElementBureau),
        mingBranch: branchName(natal.mingPalace().branch),
        shenBranch: branchName(natal.shenPalace().branch),
        originBranch: branchName(natal.originPalace().branch),
        ziweiBranch: branchName(natal.ziweiPalace().branch),
        tianfuBranch: branchName(natal.palaceByStar(StarName.TianFu).branch),
      },
      expectedCore,
      fixture.id,
    );
    assert.deepEqual(
      natal.palaces.map((palace) => ({
        branch: branchName(palace.branch),
        name: palace.name,
        stem: stems.get(palace.stem),
        ageStart: palace.decadeAgeRange[0],
        ageEnd: palace.decadeAgeRange[1],
      })),
      expectedPalaces,
      `${fixture.id} palace facts`,
    );
    for (const query of fixture.queries) {
      if (query.kind === "star-branch") {
        const star = stars[query.star];
        assert.ok(star, `Unsupported case star: ${query.star}`);
        assert.equal(branchName(natal.palaceByStar(star).branch), query.expectedBranch);
      } else {
        assert.equal(
          natal.decadeByBranch(query.decadeIndex, branchesByName[query.decadeMingBranch]!).name,
          "Ming",
        );
        assert.equal(
          natal.yearlyByBranch(
            query.decadeIndex,
            query.yearlyIndex,
            branchesByName[query.yearlyMingBranch]!,
          ).name,
          "Ming",
        );
        const years = natal.decadeYears(query.decadeIndex);
        assert.deepEqual([years[0]?.age, years[9]?.age], [query.firstAge, query.lastAge]);
        assert.deepEqual([years[0]?.year, years[9]?.year], [query.firstYear, query.lastYear]);
      }
    }
  }
});

test("TypeScript consumes a shared invalid sexagenary-year error case", () => {
  const fixture = JSON.parse(
    readFileSync(
      fileURLToPath(new URL("cases/reject-inconsistent-sexagenary-year.json", conformanceRoot)),
      "utf8",
    ),
  ) as {
    readonly scenario: "reject-input";
    readonly input: {
      readonly gender: "Female" | "Male";
      readonly birthStem: string;
      readonly birthBranch: string;
      readonly birthMonth: number;
      readonly ziweiBranch: string;
      readonly birthHour: string;
    };
    readonly expected: { readonly code: string; readonly stem: string; readonly branch: string };
    readonly evidence: { readonly independentOfImplementationOutput: true };
  };
  assert.equal(fixture.scenario, "reject-input");
  assert.equal(fixture.evidence.independentOfImplementationOutput, true);
  assert.throws(
    () =>
      Ziwei.fromParameters({
        gender: fixture.input.gender === "Male" ? Gender.Male : Gender.Female,
        birthStem: stemsByName[fixture.input.birthStem],
        birthBranch: branchesByName[fixture.input.birthBranch],
        birthMonth: fixture.input.birthMonth,
        ziweiBranch: branchesByName[fixture.input.ziweiBranch],
        birthHour: branchesByName[fixture.input.birthHour],
      }),
    (error) => {
      assert.ok(error instanceof ZiweiError);
      assert.equal(error.code, fixture.expected.code);
      assert.deepEqual(error.detail, {
        code: fixture.expected.code,
        stem: stemsByName[fixture.expected.stem],
        branch: branchesByName[fixture.expected.branch],
      });
      return true;
    },
  );
});
