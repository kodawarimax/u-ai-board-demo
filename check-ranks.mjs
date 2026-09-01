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
const memberOnlyIds = ['A', 'B', 'C'].flatMap((rank) => data.taskRanks[rank]);
assert.equal(memberOnlyIds.length, 36);
for (const id of memberOnlyIds) {
  const task = data.tasks.find((item) => item.id === id);
  for (const field of ['skills', 'deliverable', 'doneWhen', 'scopeOut', 'legalTerms', 'review', 'aiPolicy']) {
    assert.equal(field in task, false, `${id} must not expose ${field}`);
  }
}
for (const task of data.tasks.filter(({ id }) => !memberOnlyIds.includes(id))) {
  assert.ok(Array.isArray(task.skills) && task.skills.length >= 2, `${task.id} must list required skills`);
  assert.ok(task.aiPolicy?.use && task.aiPolicy?.data && task.aiPolicy?.humanReview, `${task.id} must list AI policy`);
}
assert.ok(data.member.id);
assert.ok(data.member.trust?.certifications?.length >= 3);
assert.ok(data.projectBoard.tasks.length >= 4);
assert.equal(new Set(data.projectBoard.tasks.map(({ id }) => id)).size, data.projectBoard.tasks.length);
assert.ok(data.projectBoard.tasks.every(({ status }) => ['todo', 'doing', 'review', 'done'].includes(status)));
assert.ok(data.projectBoard.tasks.every(({ start, due }) => /^\d{4}-\d{2}-\d{2}$/.test(start) && start <= due));
assert.ok(data.project.workroom?.participants?.length >= 2);
assert.ok(data.project.workroom?.milestones?.length >= 3);

console.log('rank gate fixtures: OK');
