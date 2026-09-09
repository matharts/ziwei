import { parentPort, workerData } from 'node:worker_threads';
import { Ziwei } from '@matharts/ziwei';
import assert from 'node:assert/strict';

let profile;
let palaces;
let snapshot;
let query;
let period;
for (let i = 0; i < 500; i++) {
  const natal = Ziwei.fromBirth(workerData);
  profile = natal.profile;
  palaces = natal.palaces;
  snapshot = natal.toJSON();
  query = natal.birthTransformations();
  period = natal.yearly(11, 9);
}
assert.ok(parentPort && query);
parentPort.postMessage({ profile, palaces, snapshot, query, period,
  frozen: Object.isFrozen(profile), palacesFrozen: Object.isFrozen(palaces),
  queryFrozen: Object.isFrozen(query[0].star.selfTransformations),
});
