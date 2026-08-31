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

  await page.goto(screen('/projects'));
  await page.locator('.kanban-column').first().waitFor();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.kanban-column').first().waitFor();
  assert.equal(await page.locator('.kanban-column').count(), 4);
  assert.equal(await page.locator('.kanban-task').count(), 4);
  await page.locator('#board-task-title').fill('   ');
  await page.locator('#board-task-due').fill('2026-09-30');
  await page.locator('#board-task-form button').click();
  assert.equal(await page.locator('.kanban-task').count(), 4);
  await page.locator('#board-task-title').fill('<img src=x onerror=alert(1)>');
  await page.locator('#board-task-assignee').fill('テスト担当');
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
  await page.screenshot({ path: '/tmp/u-ai-project-board-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.locator('.kanban-column').first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
  assert.deepEqual(await page.locator('a.button, button, input, select').evaluateAll((items) => items
    .filter((item) => item.getClientRects().length)
    .filter((item) => item.getBoundingClientRect().height < 44)
    .map((item) => `${item.tagName}:${item.id || item.className}`)), []);
  await page.screenshot({ path: '/tmp/u-ai-project-board-mobile.png', fullPage: true });

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
