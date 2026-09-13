import assert from "node:assert/strict";

import { test } from "@rstest/core";

import { Ziwei, Gender, Stem, Branch } from "@matharts/ziwei";
import { projectProfile } from "@matharts/ziwei-shared";

// Independent project fixture: crates/ziwei/tests/fixtures/README.md, 甲子火六局.
test("both creation entries expose the confirmed Jia Zi birth profile", () => {
  const birth = Ziwei.fromBirth({
    gender: Gender.Male,
    birthYear: 1984,
    birthMonth: 1,
    birthDay: 6,
    birthHour: Branch.Zi,
  });
  assert.deepEqual(birth.profile, {
    gender: 1,
    birthYear: 1984,
    birthStem: 0,
    birthBranch: 0,
    birthMonth: 1,
    birthDay: 6,
    birthHour: 0,
  });
  const parameters = Ziwei.fromParameters({
    gender: Gender.Male,
    birthStem: Stem.Jia,
    birthBranch: Branch.Zi,
    birthMonth: 1,
    ziweiBranch: Branch.Yin,
    birthHour: Branch.Zi,
  });
  assert.deepEqual(parameters.profile, {
    gender: 1,
    birthYear: null,
    birthStem: 0,
    birthBranch: 0,
    birthMonth: 1,
    birthDay: null,
    birthHour: 0,
  });
  for (const natal of [birth, parameters]) {
    const profile = natal.profile;
    assert.equal(natal.profile, profile);
    assert.equal(Object.getPrototypeOf(profile), Object.prototype);
    assert.ok(Object.isFrozen(profile));
    assert.deepEqual(Reflect.ownKeys(profile), [
      "gender",
      "birthStem",
      "birthBranch",
      "birthMonth",
      "birthHour",
      "birthYear",
      "birthDay",
    ]);
  }
});

test("shared profile projection normalizes transport absence and rejects mismatched date fields", () => {
  // Inconsistent transport data cannot be produced by a valid core chart.
  // Exercise the shared Interface directly, without mocking native holders.
  const base = {
    gender: Gender.Male,
    birthStem: Stem.Jia,
    birthBranch: Branch.Zi,
    birthMonth: 1,
    birthHour: Branch.Zi,
  };
  const absent = { ...base, birthYear: null, birthDay: null };
  assert.deepEqual(projectProfile(base), absent);
  for (const birthYear of [undefined, null, 0]) {
    for (const birthDay of [undefined, null, 6]) {
      const raw = { ...base, birthYear, birthDay, extra: "transport only" };
      if ((birthYear == null) !== (birthDay == null)) {
        assert.throws(() => projectProfile(raw), {
          name: "Error",
          message: "原生出生档案的年份与日期状态不一致",
        });
      } else {
        const profile = projectProfile(raw);
        assert.deepEqual(profile, birthYear == null ? absent : { ...base, birthYear, birthDay });
        assert.notEqual(profile, raw);
        assert.ok(Object.isFrozen(profile));
        assert.equal(Object.getPrototypeOf(profile), Object.prototype);
      }
      assert.equal(Object.isFrozen(raw), false);
      assert.equal(raw.birthYear, birthYear);
      assert.equal(raw.birthDay, birthDay);
    }
  }
});
