import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Ziwei, Gender, Stem, Branch } from '@ziweijs/core';

// Independent project fixture: crates/ziwei/tests/fixtures/README.md, 甲子火六局.
test('both creation entries expose the confirmed Jia Zi birth profile', () => {
  const birth = Ziwei.fromBirth({
    gender: Gender.Male, birthYear: 1984, birthMonth: 1,
    birthDay: 6, birthHour: Branch.Zi,
  });
  assert.deepEqual(birth.profile, {
    gender: 1, birthYear: 1984, birthStem: 0, birthBranch: 0,
    birthMonth: 1, birthDay: 6, birthHour: 0,
  });
  const parameters = Ziwei.fromParameters({
    gender: Gender.Male, birthStem: Stem.Jia, birthBranch: Branch.Zi,
    birthMonth: 1, ziweiBranch: Branch.Yin, birthHour: Branch.Zi,
  });
  assert.deepEqual(parameters.profile, {
    gender: 1, birthYear: null, birthStem: 0, birthBranch: 0,
    birthMonth: 1, birthDay: null, birthHour: 0,
  });
});
