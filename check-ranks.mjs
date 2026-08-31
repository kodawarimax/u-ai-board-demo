import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const data = JSON.parse(await readFile(new URL('./fixtures.json', import.meta.url), 'utf8'));
const taskIds = data.tasks.map(({ id }) => id).sort();
const rankedIds = Object.values(data.taskRanks).flat().sort();

assert.equal(taskIds.length, 40);
assert.equal(new Set(rankedIds).size, taskIds.length);
assert.deepEqual(rankedIds, taskIds);
assert.equal(data.taskRanks.A.length, 8);
assert.equal(data.member.isUwordMember, false);
for (const id of data.taskRanks.A) {
  const task = data.tasks.find((item) => item.id === id);
  for (const field of ['deliverable', 'doneWhen', 'scopeOut', 'legalTerms', 'review']) {
    assert.equal(field in task, false, `${id} must not expose ${field}`);
  }
}

console.log('rank gate fixtures: OK');
