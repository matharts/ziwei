import assert from 'node:assert/strict';
import { test } from '@rstest/core';
import { Ziwei } from '@matharts/ziwei';

test('toJSON returns a frozen, detached snapshot with explicit missing fields and no behavior', () => {
  const fromBirth = Ziwei.fromBirth({ gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 });
  const fromParameters = Ziwei.fromParameters({ gender: 1, birthStem: 0, birthBranch: 0, birthMonth: 1, ziweiBranch: 2, birthHour: 0 });
  for (const natal of [fromBirth, fromParameters]) {
    const snapshot = natal.toJSON();
    assert.deepEqual(Object.keys(snapshot).sort(), ['fiveElementBureau', 'mingPalaceBranch', 'originPalaceBranch', 'palaces', 'profile', 'shenPalaceBranch', 'ziweiBranch', 'zodiac']);
    assert.deepEqual([snapshot.mingPalaceBranch, snapshot.shenPalaceBranch, snapshot.originPalaceBranch, snapshot.ziweiBranch], [2, 2, 10, 2]);
    assert.equal(snapshot.profile, natal.profile);
    assert.equal(snapshot.palaces, natal.palaces);
    assert.ok(Object.isFrozen(snapshot));
    assert.ok(Object.isFrozen(snapshot.palaces[0].stars[0].selfTransformations));
    const decoded = JSON.parse(JSON.stringify(natal));
    assert.deepEqual(decoded, snapshot);
    assert.deepEqual(structuredClone(snapshot), snapshot);
    assert.equal(Object.isFrozen(decoded), false);
    assert.equal(Reflect.get(decoded, 'palace'), undefined);
  }
  assert.equal(fromBirth.toJSON().profile.birthYear, 1984);
  assert.equal(fromParameters.toJSON().profile.birthYear, null);
  assert.equal(fromParameters.toJSON().profile.birthDay, null);
});
