import assert from "node:assert/strict";

import { test } from "@rstest/core";

import { Branch, Gender, PalaceName, Ziwei } from "@matharts/ziwei";

test("TypeScript period palace queries preserve independently worked forward and reverse layouts", () => {
  const cases = [
    {
      birth: {
        gender: Gender.Male,
        birthYear: 1987,
        birthMonth: 5,
        birthDay: 20,
        birthHour: Branch.You,
      },
      expected: [
        [PalaceName.Ming, Branch.Shen, Branch.Yin],
        [PalaceName.XiongDi, Branch.Wei, Branch.Chou],
        [PalaceName.FuQi, Branch.Wu, Branch.Zi],
        [PalaceName.ZiNv, Branch.Si, Branch.Hai],
        [PalaceName.CaiBo, Branch.Chen, Branch.Xu],
        [PalaceName.JiE, Branch.Mao, Branch.You],
        [PalaceName.QianYi, Branch.Yin, Branch.Shen],
        [PalaceName.JiaoYou, Branch.Chou, Branch.Wei],
        [PalaceName.GuanLu, Branch.Zi, Branch.Wu],
        [PalaceName.TianZhai, Branch.Hai, Branch.Si],
        [PalaceName.FuDe, Branch.Xu, Branch.Chen],
        [PalaceName.FuMu, Branch.You, Branch.Mao],
      ],
    },
    {
      birth: {
        gender: Gender.Female,
        birthYear: 1981,
        birthMonth: 11,
        birthDay: 7,
        birthHour: Branch.Chou,
      },
      expected: [
        [PalaceName.Ming, Branch.Zi, Branch.Wu],
        [PalaceName.XiongDi, Branch.Hai, Branch.Si],
        [PalaceName.FuQi, Branch.Xu, Branch.Chen],
        [PalaceName.ZiNv, Branch.You, Branch.Mao],
        [PalaceName.CaiBo, Branch.Shen, Branch.Yin],
        [PalaceName.JiE, Branch.Wei, Branch.Chou],
        [PalaceName.QianYi, Branch.Wu, Branch.Zi],
        [PalaceName.JiaoYou, Branch.Si, Branch.Hai],
        [PalaceName.GuanLu, Branch.Chen, Branch.Xu],
        [PalaceName.TianZhai, Branch.Mao, Branch.You],
        [PalaceName.FuDe, Branch.Yin, Branch.Shen],
        [PalaceName.FuMu, Branch.Chou, Branch.Wei],
      ],
    },
  ] as const;

  for (const { birth, expected } of cases) {
    const natal = Ziwei.fromBirth(birth);
    for (const [name, decadeBranch, yearlyBranch] of expected) {
      const decadePalace = natal.decadePalaceByName(1, name);
      const yearlyPalace = natal.yearlyPalaceByName(1, 9, name);
      assert.equal(decadePalace.branch, decadeBranch);
      assert.equal(yearlyPalace.branch, yearlyBranch);
      assert.equal(natal.decadeByBranch(1, decadeBranch).name, name);
      assert.equal(natal.yearlyByBranch(1, 9, yearlyBranch).name, name);
    }
  }
});
