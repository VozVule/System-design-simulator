import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { Architecture } from '../src/lib/domain';
import type { StudioTestControl } from '../src/test-store';
import { storageKey } from '../src/lib/storage';
declare global { interface Window { __studioTest?: StudioTestControl; __failStorage?: boolean } }

const saveButton = (page: Page) => page.getByRole('button', { name: /^Save(?:⌘ S)?$/ });
async function add(page: Page, type: string, label: string, x: number, y: number): Promise<void> {
  await page.getByRole('button', { name: 'Add ' + type, exact: true }).click();
  await page.getByLabel('Label', { exact: true }).fill(label);
  await page.getByLabel('X position').fill(String(x)); await page.getByLabel('Y position').fill(String(y));
}
async function select(page: Page, label: string): Promise<void> {
  await page.getByRole('group', { name: label + ' component', exact: true }).click();
  await expect(page.getByLabel('Label', { exact: true })).toHaveValue(label);
}
async function connectNodes(page: Page, source: string, target: string): Promise<void> {
  await select(page, source); await page.getByLabel('Connect to', { exact: true }).selectOption({ label: target });
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
}
async function savedItems(page: Page): Promise<Architecture[]> {
  return page.evaluate((key) => { const text = localStorage.getItem(key); return text ? (JSON.parse(text) as { items: Architecture[] }).items : []; }, storageKey);
}
async function save(page: Page): Promise<void> { await saveButton(page).click(); await expect(page.getByRole('status')).toHaveText('Saved'); }
async function openLibrary(page: Page): Promise<void> { await page.getByRole('button', { name: 'Library', exact: true }).click(); await expect(page.getByRole('dialog')).toBeVisible(); }
async function reopen(page: Page, name: string): Promise<void> {
  await openLibrary(page); await page.getByRole('button', { name: new RegExp('^Open ' + name + ' ') }).click();
}
test.beforeEach(async ({ page }) => { await page.goto('/?test-store'); });

test('starts empty and saves a named empty architecture without backend requests', async ({ page }) => {
  const backendRequests: string[] = []; page.on('request', (request) => { if (/\/api\/|:8000/.test(request.url())) backendRequests.push(request.url()); });
  await expect(page.getByRole('heading', { name: 'Build something that connects.' })).toBeVisible();
  await openLibrary(page); await expect(page.getByText('Your next idea belongs here.')).toBeVisible(); await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Architecture name').fill('  First architecture  '); await save(page);
  await expect(page.getByLabel('Architecture name')).toHaveValue('First architecture'); expect(await savedItems(page)).toHaveLength(1);
  await page.reload(); await reopen(page, 'First architecture'); await expect(page.getByRole('status')).toHaveText('Saved'); expect(backendRequests).toEqual([]);
});

test('round-trips five component types and configured positions through Save and reload', async ({ page }) => {
  await page.getByLabel('Architecture name').fill('Application');
  await add(page, 'Caller Group', 'Clients', -80.5, 50); await page.getByLabel('Caller count').fill('150'); await page.getByLabel('Total test RPS').fill('240');
  await add(page, 'Load Balancer', 'Balancer', 160, 50); await add(page, 'Gateway', 'Gateway', 400, 50);
  await add(page, 'Server', 'App', 640, 50); await page.getByLabel('Maximum RPS').fill('60'); await add(page, 'Database', 'Data', 880, 50);
  await page.getByRole('button', { name: 'Fit diagram', exact: true }).click();
  await connectNodes(page, 'Clients', 'Balancer'); await connectNodes(page, 'Balancer', 'Gateway'); await connectNodes(page, 'Gateway', 'App'); await connectNodes(page, 'App', 'Data');
  await save(page); const before = (await savedItems(page))[0]; expect(before.document.nodes).toHaveLength(5); expect(before.document.edges).toHaveLength(4);
  await page.reload(); await reopen(page, 'Application');
  await expect(page.getByRole('group', { name: / component$/ })).toHaveCount(5);
  await select(page, 'Clients'); await expect(page.getByLabel('Caller count')).toHaveValue('150'); await expect(page.getByLabel('Total test RPS')).toHaveValue('240'); await expect(page.getByLabel('X position')).toHaveValue('-80.5');
  await select(page, 'App'); await expect(page.getByLabel('Maximum RPS')).toHaveValue('60'); expect((await savedItems(page))[0]).toEqual(before);
});

test('retains fractional and zero weights, policy changes and explicit destination order', async ({ page }) => {
  await page.getByLabel('Architecture name').fill('Weighted');
  await add(page, 'Load Balancer', 'Router', 0, 0); await add(page, 'Server', 'One', 250, -30); await add(page, 'Server', 'Two', 250, 150);
  await connectNodes(page, 'Router', 'One'); await connectNodes(page, 'Router', 'Two');
  await page.getByLabel('Routing policy').selectOption('weighted'); await page.getByLabel('Weight for One', { exact: true }).fill('1.5'); await page.getByLabel('Weight for Two', { exact: true }).fill('0');
  await page.getByRole('button', { name: 'Move up destination 2', exact: true }).click();
  await page.getByLabel('Routing policy').selectOption('round_robin'); await expect(page.getByLabel('Weight for One')).toHaveCount(0);
  await page.getByLabel('Routing policy').selectOption('weighted'); await expect(page.getByLabel('Weight for One')).toHaveValue('1.5'); await save(page);
  const edges = (await savedItems(page))[0].document.edges; expect(edges.map((e) => e.weight)).toEqual([1.5, 0]); expect(edges.map((e) => e.order)).toEqual([1, 0]);
  await page.reload(); await reopen(page, 'Weighted'); await select(page, 'Router'); await expect(page.getByLabel('Weight for Two')).toHaveValue('0'); await expect(page.getByLabel('Weight for One')).toHaveValue('1.5');
  await page.getByLabel('Weight for One').fill('0'); await expect(page.getByText('All weights are zero.', { exact: false })).toBeVisible(); await save(page);
});

test('rejects invalid graph edits and permits saveable disconnected components', async ({ page }) => {
  await add(page, 'Caller Group', 'Clients', 0, 0); await add(page, 'Server', 'A', 240, 0); await add(page, 'Server', 'B', 490, 0); await add(page, 'Database', 'Data', 730, 0);
  await page.getByRole('button', { name: 'Fit diagram' }).click(); await connectNodes(page, 'A', 'B'); await connectNodes(page, 'B', 'A'); await expect(page.getByRole('alert')).toContainText('cycle');
  await connectNodes(page, 'Clients', 'Clients'); await expect(page.getByRole('alert')).toContainText('itself');
  await connectNodes(page, 'A', 'B'); await expect(page.getByRole('alert')).toContainText('already connected');
  await connectNodes(page, 'A', 'Data'); await expect(page.getByRole('alert')).toContainText('at most one');
  await connectNodes(page, 'B', 'Clients'); await expect(page.getByRole('alert')).toContainText('cannot receive');
  await page.getByRole('button', { name: 'Dismiss error' }).click(); await save(page); expect((await savedItems(page))[0].document.edges).toHaveLength(1);
});

test('preserves invalid form text across selection and protects input from Delete', async ({ page }) => {
  await add(page, 'Server', 'A', 0, 0); await add(page, 'Server', 'B', 250, 0);
  await select(page, 'A'); await page.getByLabel('Maximum RPS').fill(''); await select(page, 'B'); await select(page, 'A');
  await expect(page.getByLabel('Maximum RPS')).toHaveValue(''); await expect(saveButton(page)).toBeDisabled();
  await page.getByLabel('Maximum RPS').fill('120'); await page.getByLabel('Label', { exact: true }).focus(); await page.keyboard.press('Delete');
  await expect(page.getByRole('group', { name: 'A component', exact: true })).toBeVisible(); await save(page);
});

test('Save, Discard and Cancel govern switching documents', async ({ page }) => {
  await page.getByLabel('Architecture name').fill('Baseline'); await save(page);
  await page.getByLabel('Architecture name').fill('Changed'); await page.getByRole('button', { name: 'New', exact: true }).click(); await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByLabel('Architecture name')).toHaveValue('Changed');
  await page.getByRole('button', { name: 'New', exact: true }).click(); await page.getByRole('button', { name: 'Discard', exact: true }).click(); await reopen(page, 'Baseline');
  await page.getByLabel('Architecture name').fill('Kept'); await page.getByRole('button', { name: 'New', exact: true }).click(); await page.getByRole('button', { name: 'Save and continue', exact: true }).click();
  await expect(page.getByLabel('Architecture name')).toHaveValue('Untitled architecture'); expect((await savedItems(page))[0].name).toBe('Kept');
});

test('first pending Save preserves newer edits and never creates a second entry', async ({ page }) => {
  await page.goto('/?test-store'); await page.getByLabel('Architecture name').fill('First');
  await page.evaluate(() => window.__studioTest?.holdNextSave()); await saveButton(page).click(); await expect(page.getByRole('status')).toHaveText('Saving…');
  await page.getByLabel('Architecture name').fill('Second'); await page.evaluate(() => window.__studioTest?.releaseSave()); await expect(page.getByRole('status')).toHaveText('Unsaved changes');
  expect((await savedItems(page))[0].name).toBe('First'); await save(page); expect(await savedItems(page)).toHaveLength(1); expect((await savedItems(page))[0].name).toBe('Second');
});

test('a real failed browser-storage write retains edits and the prior saved entry', async ({ page }) => {
  await page.getByLabel('Architecture name').fill('Original'); await save(page); const original = (await savedItems(page))[0];
  await page.evaluate(() => { const set = Storage.prototype.setItem; window.__failStorage = true; Storage.prototype.setItem = function (key, value) { if (window.__failStorage) throw new DOMException('Quota exceeded', 'QuotaExceededError'); set.call(this, key, value); }; });
  await page.getByLabel('Architecture name').fill('Edited'); await saveButton(page).click(); await expect(page.getByRole('status')).toHaveText('Save failed');
  expect((await savedItems(page))[0]).toEqual(original); await expect(page.getByLabel('Architecture name')).toHaveValue('Edited');
  await page.evaluate(() => window.__failStorage = false); await page.getByRole('button', { name: /^Retry Save/ }).first().click(); await expect(page.getByRole('status')).toHaveText('Saved'); expect((await savedItems(page))[0].name).toBe('Edited');
});

test('confirms active deletion, warns about unsaved edits and preserves them on cancellation', async ({ page }) => {
  await page.getByLabel('Architecture name').fill('Delete me'); await save(page); await add(page, 'Server', 'Unsaved node', 0, 0);
  await openLibrary(page); await page.getByRole('button', { name: /^Delete Delete me / }).click(); await expect(page.getByRole('dialog')).toContainText('unsaved changes will also be discarded');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(page.getByRole('group', { name: 'Unsaved node component' })).toBeVisible();
  await openLibrary(page); await page.getByRole('button', { name: /^Delete Delete me / }).click(); await page.getByRole('button', { name: 'Delete architecture', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('New architecture'); expect(await savedItems(page)).toEqual([]);
});

test('redirection retains edge identity and node removal deletes incident edges', async ({ page }) => {
  await add(page, 'Caller Group', 'Clients', 0, 0); await add(page, 'Server', 'A', 250, 0); await add(page, 'Server', 'B', 250, 170);
  await connectNodes(page, 'Clients', 'A'); await save(page); const original = (await savedItems(page))[0].document.edges[0];
  const connection = page.getByRole('group', { name: 'Clients to A connection' });
  const midpoint = await connection.locator('path').first().evaluate((element) => { const path = element as SVGPathElement, point = path.getPointAtLength(path.getTotalLength() / 2), matrix = path.getScreenCTM(); if (!matrix) throw new Error('Missing edge transform'); const transformed = point.matrixTransform(matrix); return { x: transformed.x, y: transformed.y }; });
  await page.mouse.click(midpoint.x, midpoint.y); await page.getByLabel('Target', { exact: true }).selectOption({ label: 'B' }); await page.getByRole('button', { name: 'Redirect connection', exact: true }).click(); await save(page);
  const redirected = (await savedItems(page))[0].document.edges[0]; expect(redirected.id).toBe(original.id); expect(redirected.target).not.toBe(original.target);
  await select(page, 'B'); await page.getByRole('button', { name: 'Remove component', exact: true }).click(); await save(page); expect((await savedItems(page))[0].document.edges).toEqual([]);
});

test('canvas dragging and handle gestures update the saved domain document', async ({ page }) => {
  await add(page, 'Caller Group', 'Clients', 0, 0); await add(page, 'Server', 'A', 300, 0);
  const source = page.getByRole('group', { name: 'Clients component', exact: true }), target = page.getByRole('group', { name: 'A component', exact: true });
  const box = await source.boundingBox(); if (!box) throw new Error('Node missing');
  await page.mouse.move(box.x + 60, box.y + 40); await page.mouse.down(); await page.mouse.move(box.x + 90, box.y + 100, { steps: 12 }); await page.mouse.up();
  const out = await source.locator('.svelte-flow__handle-right').boundingBox(), input = await target.locator('.svelte-flow__handle-left').boundingBox(); if (!out || !input) throw new Error('Handles missing');
  await page.mouse.move(out.x + out.width / 2, out.y + out.height / 2); await page.mouse.down(); await page.mouse.move(input.x + input.width / 2, input.y + input.height / 2, { steps: 16 }); await page.mouse.up();
  await save(page); const graph = (await savedItems(page))[0].document; expect(graph.edges).toHaveLength(1); expect(graph.nodes[0].position.y).toBeGreaterThan(30);
});

test('all five renamed symbols connect through their visible handles and survive reopening', async ({ page }) => {
  const types = ['Caller Group', 'Load Balancer', 'Gateway', 'Server', 'Database'];
  for (const [index, type] of types.entries()) await add(page, type, `Node ${index + 1}`, index * 225, 0);
  await page.getByRole('button', { name: 'Fit diagram', exact: true }).click();
  // Wait for the animated Fit before using screen coordinates for actual handle gestures.
  await page.waitForTimeout(250);
  for (let index = 0; index < 4; index++) {
    const source = page.getByRole('group', { name: `Node ${index + 1} component`, exact: true });
    const target = page.getByRole('group', { name: `Node ${index + 2} component`, exact: true });
    const output = await source.locator('.svelte-flow__handle-right').boundingBox(), input = await target.locator('.svelte-flow__handle-left').boundingBox();
    if (!output || !input) throw new Error('Missing symbol handle');
    await page.mouse.move(output.x + output.width / 2, output.y + output.height / 2); await page.mouse.down();
    await page.mouse.move(input.x + input.width / 2, input.y + input.height / 2, { steps: 16 }); await page.mouse.up();
    await expect(page.getByRole('group', { name: / connection$/ })).toHaveCount(index + 1);
  }
  await page.getByLabel('Architecture name').fill('Symbols'); await save(page); const before = (await savedItems(page))[0];
  await page.reload(); await reopen(page, 'Symbols');
  for (const [index, type] of types.entries()) {
    const component = page.getByRole('group', { name: `Node ${index + 1} component`, exact: true });
    await expect(component.getByText(type, { exact: true })).toBeVisible();
    await expect(component.locator('.node-symbol > svg')).toBeVisible();
  }
  await expect(page.getByRole('group', { name: 'Node 1 component', exact: true }).locator('.svelte-flow__handle-left')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Node 5 component', exact: true }).locator('.svelte-flow__handle-right')).toHaveCount(0);
  expect((await savedItems(page))[0]).toEqual(before);
});

test('browser leave warning appears only after changes and allows staying', async ({ page }) => {
  await page.getByLabel('Architecture name').fill('Saved'); await save(page);
  await page.getByLabel('Architecture name').fill('Changed'); let observed = false;
  page.once('dialog', async (dialog) => { observed = true; expect(dialog.type()).toBe('beforeunload'); await dialog.dismiss(); });
  await page.reload({ timeout: 2000 }).catch(() => {}); expect(observed).toBe(true); await expect(page.getByLabel('Architecture name')).toHaveValue('Changed');
});

test('palette drag-and-drop respects the changed viewport', async ({ page }) => {
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
  const canvas = page.getByRole('region', { name: 'Architecture canvas' }), box = await canvas.boundingBox(); if (!box) throw new Error('Canvas missing');
  await page.mouse.move(box.x + 150, box.y + 100); await page.mouse.down(); await page.mouse.move(box.x + 210, box.y + 150, { steps: 10 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Add Server', exact: true }).dragTo(canvas, { targetPosition: { x: 200, y: 230 } });
  const nodeBox = await page.getByRole('group', { name: 'Server component', exact: true }).boundingBox(); if (!nodeBox) throw new Error('Node missing');
  expect(Math.abs(nodeBox.x - (box.x + 200))).toBeLessThan(12); expect(Math.abs(nodeBox.y - (box.y + 230))).toBeLessThan(12);
  await save(page); expect((await savedItems(page))[0].document.nodes).toHaveLength(1);
});

test('keyboard selection and inspector controls edit a graph without dragging', async ({ page }) => {
  await page.getByRole('button', { name: 'Add Server', exact: true }).focus(); await page.keyboard.press('Enter');
  await page.getByLabel('Label', { exact: true }).fill('Keyboard node'); await save(page);
  await page.getByRole('button', { name: 'Clear selection', exact: true }).click();
  const node = page.getByRole('group', { name: 'Keyboard node component', exact: true }); await node.focus(); await page.keyboard.press('Enter');
  await expect(page.getByLabel('Label', { exact: true })).toHaveValue('Keyboard node');
  await page.getByLabel('Maximum RPS').fill('80'); await page.getByLabel('X position').fill('-1.5'); await page.getByLabel('Y position').fill('35');
  await page.getByLabel('Maximum RPS').press('ControlOrMeta+s'); await expect(page.getByRole('status')).toHaveText('Saved');
  expect((await savedItems(page))[0].document.nodes[0]).toMatchObject({ capacity_rps: 80, position: { x: -1.5, y: 35 } });
});

test('New waits for a pending Save and then guards edits made after capture', async ({ page }) => {
  await page.goto('/?test-store'); await page.getByLabel('Architecture name').fill('Snapshot'); await page.evaluate(() => window.__studioTest?.holdNextSave()); await saveButton(page).click();
  await page.getByLabel('Architecture name').fill('Later edits'); await page.getByRole('button', { name: 'New', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.evaluate(() => window.__studioTest?.releaseSave()); await expect(page.getByRole('dialog')).toContainText('unsaved changes');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(page.getByLabel('Architecture name')).toHaveValue('Later edits'); expect((await savedItems(page))[0].name).toBe('Snapshot');
});

test('corrupt storage is surfaced and never silently reset', async ({ page }) => {
  await page.evaluate((key) => localStorage.setItem(key, 'not valid json'), storageKey);
  await openLibrary(page); await expect(page.getByRole('dialog')).toContainText('corrupt'); await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByLabel('Architecture name').fill('Work survives'); await saveButton(page).click(); await expect(page.getByRole('status')).toHaveText('Save failed');
  expect(await page.evaluate((key) => localStorage.getItem(key), storageKey)).toBe('not valid json'); await expect(page.getByLabel('Architecture name')).toHaveValue('Work survives');
});

test('missing saved entry errors preserve the working diagram', async ({ page }) => {
  await page.getByLabel('Architecture name').fill('Missing'); await save(page); await add(page, 'Server', 'Work', 0, 0);
  await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ store_version: 1, items: [] })), storageKey); await saveButton(page).click();
  await expect(page.getByRole('alert')).toContainText('no longer exists'); await expect(page.getByRole('group', { name: 'Work component' })).toBeVisible(); expect(await savedItems(page)).toEqual([]);
});

test('failed Delete retains saved and working state until a successful retry', async ({ page }) => {
  await page.getByLabel('Architecture name').fill('Retained'); await save(page); await add(page, 'Server', 'Working', 0, 0);
  await page.evaluate(() => { const set = Storage.prototype.setItem; window.__failStorage = true; Storage.prototype.setItem = function (key, value) { if (window.__failStorage) throw new DOMException('Quota', 'QuotaExceededError'); set.call(this, key, value); }; });
  await openLibrary(page); await page.getByRole('button', { name: /^Delete Retained / }).click(); await page.getByRole('button', { name: 'Delete architecture', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('could not save'); expect(await savedItems(page)).toHaveLength(1);
  await page.evaluate(() => window.__failStorage = false); await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(page.getByRole('group', { name: 'Working component' })).toBeVisible();
});
