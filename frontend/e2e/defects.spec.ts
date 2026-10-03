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
