import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import * as esm from '@ziweijs/core';

const birth = { gender: 1, birthYear: 1984, birthMonth: 1, birthDay: 6, birthHour: 0 };

test('profile is immutable, stable by reference, detached from input and usable after chart release', () => {
  const input = { ...birth };
  let natal = esm.Ziwei.fromBirth(input);
  input.birthYear = 2000;
  const profile = natal.profile;
  assert.equal(profile.birthYear, 1984);
  assert.equal(natal.profile, profile);
  assert.ok(Object.isFrozen(natal));
  assert.ok(Object.isFrozen(profile));
  assert.throws(() => { natal.profile = {}; }, TypeError);
  assert.throws(() => { profile.birthYear = 2000; }, TypeError);
  assert.equal(natal.constructor, undefined);
  const getter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(natal), 'profile').get;
  assert.throws(() => getter.call({}), TypeError);
  natal = null;
  assert.equal(profile.birthYear, 1984);
  assert.notEqual(esm.Ziwei.fromBirth(input).profile, profile);
});

test('ESM and CJS share entry points and error identity; only the root is public', async () => {
  const require = createRequire(import.meta.url);
  const cjs = require('@ziweijs/core');
  assert.equal(esm.Ziwei, cjs.Ziwei);
  assert.equal(esm.ZiweiError, cjs.ZiweiError);
  assert.deepEqual(Object.keys(esm).sort(), [
    'Branch', 'FiveElement', 'FiveElementBureau', 'Gender', 'PalaceName', 'StarCategory', 'StarGalaxy',
    'StarName', 'Stem', 'Transformation', 'YinYang', 'Ziwei', 'ZiweiError', 'Zodiac',
  ]);
  assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort());
  assert.deepEqual(Object.keys(esm.Ziwei).sort(), ['fromBirth', 'fromParameters']);
  const fromBirth = esm.Ziwei.fromBirth;
  assert.equal(fromBirth(birth).profile.birthYear, 1984);
  assert.throws(() => fromBirth(null), error => {
    assert.ok(error instanceof cjs.ZiweiError);
    assert.throws(() => { error.code = 'changed'; }, TypeError);
    assert.throws(() => { error.detail.reason = 'changed'; }, TypeError);
    assert.throws(() => { error.detail.path.push('changed'); }, TypeError);
    assert.throws(() => { error.detail.received.type = 'changed'; }, TypeError);
    return true;
  });
  for (const value of [
    esm.Ziwei, esm.Gender, esm.Stem, esm.Branch, esm.Zodiac, esm.FiveElementBureau,
    esm.PalaceName, esm.StarName, esm.StarCategory, esm.StarGalaxy, esm.Transformation,
  ]) assert.ok(Object.isFrozen(value));
  assert.throws(() => { esm.Ziwei.fromBirth = () => null; }, TypeError);
  for (const subpath of ['native/binding.cjs', 'dist/natal.js', 'src/natal.ts', 'natal']) {
    const specifier = `@ziweijs/core/${subpath}`;
    assert.throws(() => require(specifier), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
    await assert.rejects(import(specifier), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
  }
  assert.throws(() => new esm.ZiweiError(), TypeError);
});

test('full i32 years and birth day boundaries preserve exact profile values', () => {
  // Fixed Euclidean sexagenary anchors, not derived from either adapter entry.
  for (const [birthYear, birthStem, birthBranch] of [
    [-2147483648, 8, 0], [-1, 5, 7], [0, 6, 8], [2147483647, 3, 3],
  ]) {
    for (const birthDay of [1, 30]) {
      const profile = esm.Ziwei.fromBirth({ ...birth, birthYear, birthDay }).profile;
      assert.equal(profile.birthYear, birthYear);
      assert.equal(profile.birthStem, birthStem);
      assert.equal(profile.birthBranch, birthBranch);
      assert.equal(profile.birthDay, birthDay);
    }
  }
  assert.equal(Object.is(esm.Ziwei.fromBirth({ ...birth, birthYear: -0, birthHour: -0 }).profile.birthYear, -0), false);
});

test('independent Worker environments construct charts and return detached plain profiles', async () => {
  await Promise.all(Array.from({ length: 4 }, async () => {
    const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: birth });
    const exit = once(worker, 'exit');
    const [message] = await once(worker, 'message');
    const natal = esm.Ziwei.fromBirth(birth);
    assert.deepEqual(message, {
      profile: natal.profile, palaces: natal.palaces, snapshot: natal.toJSON(),
      query: natal.birthTransformations(), period: natal.yearly(11, 9),
      frozen: true, palacesFrozen: true, queryFrozen: true,
    });
    assert.equal(Object.isFrozen(message.profile), false);
    assert.equal(Object.isFrozen(message.palaces), false);
    assert.equal(Object.isFrozen(message.query), false);
    assert.equal(Object.isFrozen(message.snapshot), false);
    assert.deepEqual(await exit, [0]);
  }));
});
