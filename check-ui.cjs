const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const root = process.env.DEMO_URL || 'http://127.0.0.1:4180/u-ai-board-demo/';
const screen = (path) => `${root}?screen=${encodeURIComponent(path)}`;

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  await page.goto(screen('/tasks'));
  await page.locator('.task-card').first().waitFor();
  assert.equal(await page.locator('.task-card').count(), 40);
  assert.equal(await page.locator('.member-lock').count(), 36);
  assert.equal(await page.locator('.skill-requirement:not(.skill-requirement-locked)').count(), 4);

  for (const [task, locked] of [['task-4', true], ['task-2', true], ['task-3', false]]) {
    await page.goto(screen(`/tasks/${task}`));
    await page.locator('.page-header').waitFor();
    assert.equal(await page.locator('.membership-gate').count(), Number(locked));
    assert.equal(await page.locator('#application-form').count(), Number(!locked));
  }

  await page.goto(screen('/tasks/task-3'));
  await page.locator('.ai-policy').waitFor();
  assert.match(await page.locator('.ai-policy').textContent(), /AI利用|人による確認|入力禁止/);

  await page.goto(screen('/tasks/task-4'));
  assert.equal(await page.locator('.ai-policy').count(), 0);

  await page.goto(screen('/contact'));
  await page.locator('#contact-form').waitFor();
  await page.locator('#contact-category').selectOption({ label: '会員登録・ログイン' });
  await page.locator('#contact-name').fill('デモ利用者');
  await page.locator('#contact-email').fill('demo@example.com');
  await page.locator('#contact-message').fill('ログインについて確認したいです。');
  await page.locator('#contact-form button').click();
  assert.match(await page.locator('#contact-status').textContent(), /送信・保存されません/);

  await page.goto(screen('/me'));
  await page.locator('.trust-passport').waitFor();
  assert.ok(await page.locator('.trust-certification').count() >= 3);
  assert.match(await page.locator('.eligibility-list').textContent(), /ランク\s*D.*応募可能/);
  await page.screenshot({ path: '/tmp/u-ai-trust-passport-desktop.png', fullPage: true });

  await page.goto(screen('/projects/project-1'));
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.workroom').waitFor();
  assert.ok(await page.locator('.workroom-participant').count() >= 2);
  assert.ok(await page.locator('.workroom-milestone').count() >= 3);
  await page.locator('#workroom-message').fill('<img src=x onerror=alert(1)> 進捗共有');
  await page.locator('#workroom-message-form button').click();
  assert.equal(await page.locator('.workroom-message img').count(), 0);
  assert.match(await page.locator('.workroom-message').last().textContent(), /進捗共有/);
  await page.locator('#workroom-resource-label').fill('確認資料');
  await page.locator('#workroom-resource-url').fill('javascript:alert(1)');
  await page.locator('#workroom-resource-form button').click();
  assert.equal(await page.locator('.workroom-resource').count(), 1);
  await page.locator('#workroom-resource-url').fill('https://example.com/review');
  await page.locator('#workroom-resource-form button').click();
  assert.equal(await page.locator('.workroom-resource').count(), 2);
  await page.locator('.workroom-milestone input').nth(1).check();
  await page.reload();
  await page.locator('.workroom').waitFor();
  assert.match(await page.locator('.workroom-message').last().textContent(), /進捗共有/);
  assert.equal(await page.locator('.workroom-milestone input').nth(1).isChecked(), true);
  await page.screenshot({ path: '/tmp/u-ai-workroom-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('.workroom').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.deepEqual(await page.locator('.workroom a.button, .workroom button, .workroom input:not([type="checkbox"]), .workroom textarea').evaluateAll((items) => items
    .filter((item) => item.getClientRects().length)
    .filter((item) => item.getBoundingClientRect().height < 44)
    .map((item) => `${item.tagName}:${item.id || item.className}`)), []);
  await page.screenshot({ path: '/tmp/u-ai-workroom-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.evaluate(() => localStorage.setItem('uai-workroom:project-1', JSON.stringify({
    messages: [], resources: [], milestoneDone: { 'milestone-2': 'false' },
  })));
  await page.reload();
  await page.locator('.workroom').waitFor();
  assert.equal(await page.locator('.workroom-milestone input').nth(1).isChecked(), false);

  const blockedWorkroomPage = await browser.newPage();
  await blockedWorkroomPage.addInitScript(() => {
    Storage.prototype.getItem = () => null;
    Storage.prototype.setItem = () => { throw new Error('blocked'); };
  });
  await blockedWorkroomPage.goto(screen('/projects/project-1'));
  await blockedWorkroomPage.locator('.workroom').waitFor();
  await blockedWorkroomPage.locator('.workroom-milestone input').nth(1).click();
  assert.equal(await blockedWorkroomPage.locator('.workroom-milestone input').nth(1).isChecked(), false);
  assert.match(await blockedWorkroomPage.locator('#workroom-milestone-status').textContent(), /保存できません/);
  await blockedWorkroomPage.close();

  await page.goto(screen('/projects'));
  await page.locator('.kanban-column').first().waitFor();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.kanban-column').first().waitFor();
  assert.equal(await page.locator('.kanban-column').count(), 4);
  assert.equal(await page.locator('.kanban-task').count(), 4);
  assert.equal(await page.getByRole('tab').count(), 3);
  await page.getByRole('tab', { name: 'カレンダー' }).click();
  assert.equal(await page.locator('#calendar-title').textContent(), '2026年9月');
  assert.ok(await page.locator('.calendar-day li').count() > 4);
  await page.locator('[data-calendar-move="1"]').click();
  assert.equal(await page.locator('#calendar-title').textContent(), '2026年10月');
  await page.getByRole('tab', { name: 'ガントチャート' }).click();
  assert.equal(await page.locator('.gantt-row').count(), 4);
  assert.equal(await page.locator('.gantt-bar').count(), 4);
  await page.getByRole('tab', { name: 'ボード' }).click();
  await page.locator('#board-task-title').fill('   ');
  await page.locator('#board-task-start').fill('2026-09-29');
  await page.locator('#board-task-due').fill('2026-09-30');
  await page.locator('#board-task-form button').click();
  assert.equal(await page.locator('.kanban-task').count(), 4);
  await page.locator('#board-task-title').fill('日付エラー');
  await page.locator('#board-task-start').fill('2026-09-30');
  await page.locator('#board-task-due').fill('2026-09-29');
  await page.locator('#board-task-form button').click();
  assert.equal(await page.locator('.kanban-task').count(), 4);
  await page.locator('#board-task-title').fill('<img src=x onerror=alert(1)>');
  await page.locator('#board-task-assignee').fill('テスト担当');
  await page.locator('#board-task-start').fill('2026-09-29');
  await page.locator('#board-task-due').fill('2026-09-30');
  await page.locator('#board-task-form button').click();
  assert.equal(await page.locator('.kanban-task').count(), 5);
  assert.equal(await page.locator('.kanban-task img').count(), 0);
  await page.locator('.kanban-task').last().locator('select').selectOption('doing');
  await page.reload();
  await page.locator('.kanban-column').first().waitFor();
  assert.equal(await page.locator('.kanban-task').count(), 5);
  assert.equal(await page.locator('[data-board-list="doing"] .kanban-task').count(), 2);

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.kanban-column').first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await page.getByRole('tab', { name: 'カレンダー' }).click();
  await page.screenshot({ path: '/tmp/u-ai-project-calendar-desktop.png', fullPage: true });
  await page.getByRole('tab', { name: 'ボード' }).click();
  await page.screenshot({ path: '/tmp/u-ai-project-board-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('.kanban-column').first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.deepEqual(await page.locator('a.button, button, input, select').evaluateAll((items) => items
    .filter((item) => item.getClientRects().length)
    .filter((item) => item.getBoundingClientRect().height < 44)
    .map((item) => `${item.tagName}:${item.id || item.className}`)), []);
  await page.getByRole('tab', { name: 'ガントチャート' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  await page.screenshot({ path: '/tmp/u-ai-project-gantt-mobile.png', fullPage: true });
  await page.getByRole('tab', { name: 'ボード' }).click();
  await page.screenshot({ path: '/tmp/u-ai-project-board-mobile.png', fullPage: true });

  await page.evaluate(() => localStorage.setItem('uai-project-board:member-demo-1', JSON.stringify([
    { id: 'old-task', title: '旧保存データ', assignee: 'テスト会員', due: '2026-09-12', status: 'todo' },
  ])));
  await page.reload();
  await page.locator('.kanban-task').first().waitFor();
  assert.match(await page.locator('.kanban-task').textContent(), /2026-09-12〜2026-09-12/);
  await page.evaluate(() => localStorage.setItem('uai-project-board:member-demo-1', JSON.stringify(Array.from({ length: 101 }, (_, index) => ({
    id: `task-${index}`, title: '上限確認', assignee: 'テスト会員', due: '2026-09-12', status: 'todo',
  })))));
  await page.reload();
  await page.locator('.kanban-task').first().waitFor();
  assert.equal(await page.locator('.kanban-task').count(), 4);
  await page.evaluate(() => localStorage.clear());

  const blockedStoragePage = await browser.newPage();
  await blockedStoragePage.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error('blocked'); };
    Storage.prototype.removeItem = () => { throw new Error('blocked'); };
  });
  await blockedStoragePage.goto(screen('/projects'));
  await blockedStoragePage.locator('.kanban-column').first().waitFor();
  assert.equal(await blockedStoragePage.locator('.kanban-task').count(), 4);

  await browser.close();
  console.log('ui gate and project board: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
