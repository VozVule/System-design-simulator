import { test, expect, type Page } from '@playwright/test';
import type { Architecture } from '../src/lib/domain';
import { moveComponentTo } from './canvas-helpers';
import { storageKey } from '../src/lib/storage';

// Native clipboard contents are shared by browser pages; keep clipboard checks sequential.
test.describe.configure({ mode: 'serial' });
test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']); await page.goto('/?test-store');
});
const savedItems = (page: Page): Promise<Architecture[]> => page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? '{"items":[]}').items, storageKey);
async function save(page: Page): Promise<void> { await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByRole('status')).toHaveText('Saved'); }

test('native copy/paste shortcuts duplicate server configuration with new IDs and save through reload', async ({ page }) => {
  await page.getByLabel('Architecture name').fill('Clipboard'); await page.getByRole('button', { name: 'Add Server', exact: true }).click();
  await page.getByLabel('Label', { exact: true }).fill('Application'); await page.getByLabel('Maximum RPS').fill('240'); await moveComponentTo(page, 'Application', 0, 0);
  await page.getByRole('button', { name: 'Fit diagram', exact: true }).click(); await save(page);
  await page.getByRole('group', { name: 'Application component', exact: true }).click(); await page.keyboard.press('ControlOrMeta+c');
  await expect(page.getByRole('status')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click(); await page.keyboard.press('ControlOrMeta+v');
  await expect(page.getByLabel('Label', { exact: true })).toHaveValue('Application 2'); await expect(page.getByLabel('Maximum RPS')).toHaveValue('240');
  await expect(page.getByRole('group', { name: 'Application 2 component', exact: true })).toBeFocused();
  await expect(page.getByRole('status')).toHaveText('Unsaved changes'); await page.keyboard.press('ControlOrMeta+v');
  await expect(page.getByLabel('Label', { exact: true })).toHaveValue('Application 3'); await save(page);
  const saved = (await savedItems(page))[0]; expect(saved.document.nodes).toHaveLength(3); expect(new Set(saved.document.nodes.map((node) => node.id)).size).toBe(3); expect(saved.document.edges).toEqual([]);
  expect(saved.document.nodes[1].position).not.toEqual(saved.document.nodes[2].position);
  await page.reload(); await page.getByRole('button', { name: 'Library', exact: true }).click(); await page.getByRole('button', { name: /^Open Clipboard / }).click();
  await expect(page.getByRole('group', { name: / component$/ })).toHaveCount(3); expect((await savedItems(page))[0]).toEqual(saved);
});

test('copied components stay usable across New and pasted edits survive an earlier pending Save', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Gateway', exact: true }).click(); await page.getByLabel('Routing policy').selectOption('weighted'); await save(page);
  await page.getByRole('group', { name: 'Gateway component', exact: true }).click(); await page.keyboard.press('ControlOrMeta+c');
  await page.getByRole('button', { name: 'New', exact: true }).click(); await page.keyboard.press('ControlOrMeta+v');
  await expect(page.getByLabel('Routing policy')).toHaveValue('weighted'); await page.keyboard.press('ControlOrMeta+v'); await expect(page.getByRole('group', { name: / component$/ })).toHaveCount(2);
  await page.getByLabel('Architecture name').fill('Pasted document'); await page.evaluate(() => window.__studioTest?.holdNextSave()); await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.keyboard.press('ControlOrMeta+v'); await expect(page.getByRole('group', { name: / component$/ })).toHaveCount(3); await page.evaluate(() => window.__studioTest?.releaseSave());
  await expect(page.getByRole('status')).toHaveText('Unsaved changes'); await save(page);
  const resource = (await savedItems(page)).find((item) => item.name === 'Pasted document')!;
  expect(resource.document.nodes).toHaveLength(3); expect(new Set(resource.document.nodes.map((node) => JSON.stringify(node.position))).size).toBe(3);
});

test('a copied connected server saves through PUT with its own ID and the original connection intact', async ({ page }) => {
  await page.goto('/'); const endpoint = 'http://127.0.0.1:8000/api/v1/architectures';
  await page.getByLabel('Architecture name').fill(`Clipboard backend ${crypto.randomUUID()}`);
  await page.getByRole('button', { name: 'Add Server', exact: true }).click(); await page.getByLabel('Label', { exact: true }).fill('Application');
  await page.getByLabel('Maximum RPS').fill('320'); await moveComponentTo(page, 'Application', 0, 0);
  await page.getByRole('button', { name: 'Add Database', exact: true }).click(); await moveComponentTo(page, 'Database', 250, 0); await page.getByRole('button', { name: 'Fit diagram', exact: true }).click();
  await page.getByRole('group', { name: 'Application component', exact: true }).click(); await page.getByLabel('Connect to', { exact: true }).selectOption({ label: 'Database' }); await page.getByRole('button', { name: 'Connect', exact: true }).click();
  const create = page.waitForResponse((response) => response.url() === endpoint && response.request().method() === 'POST'); await save(page); const original = await (await create).json() as Architecture;
  await page.getByRole('group', { name: 'Application component', exact: true }).click(); await page.keyboard.press('ControlOrMeta+c'); await page.keyboard.press('ControlOrMeta+v');
  const replace = page.waitForResponse((response) => response.url() === `${endpoint}/${original.id}` && response.request().method() === 'PUT'); await save(page); const updated = await (await replace).json() as Architecture;
  expect(updated.id).toBe(original.id); expect(updated.document.nodes).toHaveLength(3); expect(updated.document.edges).toEqual(original.document.edges);
  expect(updated.document.nodes[2]).toMatchObject({ label: 'Application 2', capacity_rps: 320 }); expect(updated.document.nodes[2].id).not.toBe(original.document.nodes[0].id);
  await page.reload(); await page.getByRole('button', { name: 'Library', exact: true }).click(); await page.getByRole('button', { name: `Open ${updated.name} ${updated.id.slice(0, 8)}`, exact: true }).click();
  await expect(page.getByRole('group', { name: 'Application 2 component', exact: true })).toBeVisible(); await expect(page.getByRole('group', { name: / connection$/ })).toHaveCount(1);
});

test('copy is a snapshot and text input copy/paste keeps native behavior', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Server', exact: true }).click(); await page.getByRole('group', { name: 'Server component', exact: true }).click(); await page.keyboard.press('ControlOrMeta+c');
  await page.getByLabel('Maximum RPS').fill('250'); await page.getByRole('group', { name: 'Server component', exact: true }).click(); await page.keyboard.press('ControlOrMeta+v');
  await expect(page.getByLabel('Maximum RPS')).toHaveValue('100');
  const label = page.getByLabel('Label', { exact: true }); await label.fill('Native text'); await label.press('ControlOrMeta+a'); await label.press('ControlOrMeta+c');
  const name = page.getByLabel('Architecture name'); await name.fill(''); await name.press('ControlOrMeta+v'); await expect(name).toHaveValue('Native text');
  await page.getByRole('group', { name: 'Native text component', exact: true }).click(); await page.keyboard.press('ControlOrMeta+v'); await expect(page.getByRole('group', { name: / component$/ })).toHaveCount(2);
});

test('invalid selected fields cannot be copied and unrelated clipboard text never creates nodes', async ({ page }) => {
  await page.evaluate(() => navigator.clipboard.writeText('Ordinary text'));
  await page.getByRole('button', { name: 'Add Server', exact: true }).click(); await page.getByLabel('Maximum RPS').fill('');
  await page.getByRole('group', { name: 'Server component', exact: true }).click(); await page.keyboard.press('ControlOrMeta+c'); await expect(page.getByRole('alert').filter({ hasText: 'before copying' })).toBeVisible();
  await page.keyboard.press('ControlOrMeta+v'); await expect(page.getByRole('group', { name: / component$/ })).toHaveCount(1); await expect(page.getByLabel('Maximum RPS')).toHaveValue('');
});

test('both dividers resize by pointer and keyboard, reflow panel content, and preserve a clean diagram', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Server', exact: true }).click(); await save(page);
  const before = (await savedItems(page))[0], palette = page.getByRole('complementary', { name: 'Component palette' }), inspector = page.getByRole('complementary', { name: 'Configuration inspector' });
  const left = page.getByRole('separator', { name: 'Resize component palette' }), right = page.getByRole('separator', { name: 'Resize configuration inspector' });
  const initial = (await palette.boundingBox())!.width, box = (await left.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + 180); await page.mouse.down(); await page.mouse.move(box.x + 100, box.y + 180, { steps: 10 }); await page.mouse.up();
  expect((await palette.boundingBox())!.width).toBeGreaterThan(initial + 70);
  await left.focus(); await left.press('Home'); await expect(left).toHaveAttribute('aria-valuenow', '64'); await expect(palette.getByText('Components', { exact: true })).toBeHidden();
  await expect(palette.getByRole('button', { name: 'Add Server', exact: true })).toBeVisible(); await left.press('End'); await expect(palette.getByText('Components', { exact: true })).toBeVisible();
  const rightBox = (await right.boundingBox())!, initialRight = (await inspector.boundingBox())!.width;
  await page.mouse.move(rightBox.x + 4, rightBox.y + 180); await page.mouse.down(); await page.mouse.move(rightBox.x - 70, rightBox.y + 180, { steps: 10 }); await page.mouse.up();
  expect((await inspector.boundingBox())!.width).toBeGreaterThan(initialRight + 50);
  await right.focus(); await right.press('Home'); await expect(right).toHaveAttribute('aria-valuenow', '200');
  await expect(page.getByLabel('Maximum RPS')).toBeVisible();
  await expect(page.getByLabel('Connect to', { exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Saved'); expect((await savedItems(page))[0]).toEqual(before);
  expect(await inspector.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect((await page.getByRole('region', { name: 'Architecture canvas' }).boundingBox())!.width).toBeGreaterThanOrEqual(200);
});

test('viewport changes clamp panel widths without hiding controls or overflowing the inspector', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Load Balancer', exact: true }).click();
  await page.getByLabel('Label', { exact: true }).fill('Long router name '.repeat(6));
  await page.setViewportSize({ width: 620, height: 850 });
  await expect(page.getByRole('button', { name: 'Add Server', exact: true })).toBeVisible(); await expect(page.getByLabel('Routing policy')).toBeVisible();
  const inspector = page.getByRole('complementary', { name: 'Configuration inspector' });
  expect(await inspector.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect((await page.getByRole('region', { name: 'Architecture canvas' }).boundingBox())!.width).toBeGreaterThanOrEqual(200);
  await page.setViewportSize({ width: 1440, height: 850 }); await expect(page.getByRole('complementary', { name: 'Component palette' }).getByText('Components', { exact: true })).toBeVisible();
});
