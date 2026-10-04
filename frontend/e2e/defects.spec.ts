import { test, expect, type Page } from '@playwright/test';
import { storageKey } from '../src/lib/storage';
import { newComponent, type Architecture } from '../src/lib/domain';

async function openGraph(page: Page): Promise<void> {
  await page.goto('/?test-store');
  const nodes = [newComponent('server', { x: 0, y: 0 }, 'a'), newComponent('server', { x: 250, y: 0 }, 'b'), newComponent('database', { x: 500, y: 0 }, 'c')];
  nodes[0].label = 'A'; nodes[1].label = 'B'; nodes[2].label = 'C';
  const resource: Architecture = { id: crypto.randomUUID(), name: 'Selection', document: { format_version: 1, nodes, edges: [{ id: 'ac', source: 'a', target: 'c', order: 0, weight: 1 }] }, created_at: '2026-10-03T12:00:00Z', updated_at: '2026-10-03T12:00:00Z' };
  await page.evaluate(({ key, resource }) => localStorage.setItem(key, JSON.stringify({ store_version: 1, items: [resource] })), { key: storageKey, resource });
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: /^Open Selection / }).click();
  await expect(page.getByRole('group', { name: 'A component', exact: true })).toBeVisible();
  await page.waitForTimeout(250);
}
const savedGraph = (page: Page): Promise<Architecture['document']> => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).items[0].document, storageKey);
async function save(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.save-state')).toHaveText('Saved');
}

test('V switches pan and box selection; group movement and deletion persist', async ({ page }) => {
  await openGraph(page);
  await expect(page.getByRole('button', { name: 'Drag mode', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('v');
  await expect(page.getByRole('button', { name: 'Select mode', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const a = page.getByRole('group', { name: 'A component', exact: true }), b = page.getByRole('group', { name: 'B component', exact: true });
  const aBox = (await a.boundingBox())!, bBox = (await b.boundingBox())!;
  await page.mouse.move(aBox.x - 10, aBox.y - 10); await page.mouse.down();
  await page.mouse.move(bBox.x + bBox.width + 10, bBox.y + bBox.height + 10, { steps: 15 }); await page.mouse.up();
  await expect(page.locator('.svelte-flow__node.selected')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: '3 items selected' })).toBeVisible();
  await expect(page.locator('.save-state')).toHaveText('Saved');
  const before = await savedGraph(page);
  const group = (await page.locator('.svelte-flow__selection-wrapper').boundingBox())!;
  await page.mouse.move(group.x + group.width / 2, group.y + group.height / 2); await page.mouse.down();
  await page.mouse.move(group.x + group.width / 2 + 35, group.y + group.height / 2 + 45, { steps: 12 }); await page.mouse.up();
  await expect(page.locator('.svelte-flow__node.selected')).toHaveCount(2); await save(page);
  const moved = await savedGraph(page);
  const dx = moved.nodes[0].position.x - before.nodes[0].position.x, dy = moved.nodes[0].position.y - before.nodes[0].position.y;
  expect(dx).toBeGreaterThan(20); expect(dy).toBeGreaterThan(20);
  expect(moved.nodes[1].position.x - before.nodes[1].position.x).toBeCloseTo(dx);
  expect(moved.nodes[1].position.y - before.nodes[1].position.y).toBeCloseTo(dy);
  expect(moved.nodes[2].position).toEqual(before.nodes[2].position);
  await page.getByRole('region', { name: 'Architecture canvas' }).focus(); await page.keyboard.press('Delete');
  await expect(page.getByRole('group', { name: / component$/ })).toHaveCount(1); await save(page);
  expect((await savedGraph(page)).nodes.map((node) => node.id)).toEqual(['c']); expect((await savedGraph(page)).edges).toEqual([]);
  await page.keyboard.press('v'); await expect(page.getByRole('button', { name: 'Drag mode', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Shift selection toggles items and V does not interfere with text, paste or dialogs', async ({ page }) => {
  await openGraph(page);
  await page.getByRole('group', { name: 'A component', exact: true }).click();
  await page.getByRole('group', { name: 'B component', exact: true }).click({ modifiers: ['Shift'] });
  await expect(page.locator('.svelte-flow__node.selected')).toHaveCount(2);
  await page.getByRole('group', { name: 'B component', exact: true }).click({ modifiers: ['Shift'] });
  await expect(page.locator('.svelte-flow__node.selected')).toHaveCount(1);
  await page.getByLabel('Label', { exact: true }).press('v');
  await expect(page.getByRole('button', { name: 'Drag mode', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('region', { name: 'Architecture canvas' }).focus(); await page.keyboard.press('ControlOrMeta+v');
  await expect(page.getByRole('button', { name: 'Drag mode', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Library', exact: true }).click(); await page.keyboard.press('v');
  await expect(page.getByRole('button', { name: 'Drag mode', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('successful Save shows a timed notice, identifies unsaved later edits, and can be dismissed', async ({ page }) => {
  await page.goto('/?test-store'); await page.clock.install();
  const notice = page.locator('.save-notification'), button = page.getByRole('button', { name: 'Save', exact: true });
  await page.getByLabel('Architecture name').fill('Captured');
  await page.evaluate(() => window.__studioTest?.holdNextSave()); await button.click();
  await expect(button).toHaveAttribute('aria-busy', 'true'); await expect(button).toContainText('Saving…'); await expect(notice).toHaveCount(0);
  await page.getByLabel('Architecture name').fill('Later changes'); await page.evaluate(() => window.__studioTest?.releaseSave());
  await expect(notice).toContainText('Saved “Captured”. Newer changes are still unsaved.');
  await expect(page.locator('.save-state')).toHaveText('Unsaved changes'); await expect(button).toBeEnabled();
  await button.click(); await expect(notice).toContainText('Saved “Later changes”.');
  await expect(button).toContainText('Saved'); await expect(button).toBeDisabled(); await expect(button).toHaveAttribute('aria-busy', 'false');
  await page.clock.fastForward(4000);
  await page.getByLabel('Architecture name').fill('Saved again'); await button.click();
  await expect(notice).toContainText('Saved “Saved again”.');
  await page.clock.fastForward(1500); await expect(notice).toBeVisible();
  await page.clock.fastForward(3501); await expect(notice).toHaveCount(0);
  await page.getByLabel('Architecture name').fill('Dismissed'); await button.click();
  await expect(notice).toBeVisible(); await page.getByRole('button', { name: 'Dismiss save notification', exact: true }).click(); await expect(notice).toHaveCount(0);
});

test('a failed Save shows no success notice and retry confirms persistence', async ({ page }) => {
  await page.goto('/?test-store'); await page.getByLabel('Architecture name').fill('Retry notice');
  await page.evaluate(() => { const set = Storage.prototype.setItem; window.__failStorage = true; Storage.prototype.setItem = function (key, value) { if (window.__failStorage) throw new DOMException('Quota exceeded', 'QuotaExceededError'); set.call(this, key, value); }; });
  await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.locator('.save-state')).toHaveText('Save failed');
  await expect(page.locator('.save-notification')).toHaveCount(0);
  await page.evaluate(() => window.__failStorage = false); await page.getByRole('button', { name: 'Retry Save', exact: true }).first().click();
  await expect(page.locator('.save-notification')).toContainText('Saved “Retry notice”.');
});

test('zoom buttons change an empty canvas and respect both zoom limits', async ({ page }) => {
  await page.goto('/?test-store');
  const zoom = () => page.locator('.svelte-flow__viewport').evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
  await expect.poll(zoom).toBeCloseTo(1);
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click(); await expect.poll(zoom).toBeCloseTo(1.2);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click(); await expect.poll(zoom).toBeCloseTo(1);
  for (let count = 0; count < 6; count++) await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect.poll(zoom).toBeCloseTo(2);
  for (let count = 0; count < 16; count++) await page.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await expect.poll(zoom).toBeCloseTo(0.2);
  await expect(page.getByRole('group', { name: / component$/ })).toHaveCount(0); await expect(page.locator('.save-state')).toHaveText('New architecture');
});

test('zoom and fit work after reopening and resizing without changing the saved diagram', async ({ page }) => {
  await openGraph(page); const before = await savedGraph(page);
  const zoom = () => page.locator('.svelte-flow__viewport').evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
  const initial = await zoom();
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click(); await expect.poll(zoom).toBeCloseTo(initial * 1.2);
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click(); await expect.poll(zoom).toBeCloseTo(initial);
  await page.setViewportSize({ width: 1000, height: 750 });
  await page.getByRole('button', { name: 'Zoom out', exact: true }).click(); await expect.poll(zoom).toBeLessThan(initial);
  await page.getByRole('button', { name: 'Fit diagram', exact: true }).click(); await page.waitForTimeout(250);
  for (const label of ['A', 'B', 'C']) await expect(page.getByRole('group', { name: label + ' component', exact: true })).toBeInViewport();
  await expect(page.locator('.save-state')).toHaveText('Saved'); expect(await savedGraph(page)).toEqual(before);
});
