import { ComponentType } from '../src/lib/domain/component-types';
import { test, expect, type Page, type Response } from '@playwright/test';
import { moveComponentTo } from './canvas-helpers';
import type { Architecture } from '../src/lib/domain';

const endpoint = 'http://127.0.0.1:8000/api/v1/architectures';
const saveButton = (page: Page) => page.getByRole('button', { name: 'Save', exact: true });
const mutation = (method: 'POST' | 'PUT') => (response: Response) => response.url().startsWith(endpoint) && response.request().method() === method;
async function save(page: Page, method: 'POST' | 'PUT'): Promise<Architecture> {
  const response = page.waitForResponse(mutation(method)); await saveButton(page).click();
  const result = await response; expect(result.status()).toBe(method === 'POST' ? 201 : 200);
  await expect(page.locator('.save-state')).toHaveText('Saved'); return result.json() as Promise<Architecture>;
}
async function open(page: Page, resource: Architecture): Promise<void> {
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: `Open ${resource.name} ${resource.id.slice(0, 8)}`, exact: true }).click();
  await expect(page.locator('.save-state')).toHaveText('Saved');
}
test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('Save creates via POST, canvas edits replace via PUT, and the backend library reopens them', async ({ page }) => {
  const requests: string[] = []; page.on('request', (request) => { if (request.url().startsWith(endpoint) && ['POST', 'PUT'].includes(request.method())) requests.push(request.method()); });
  const name = `Backend round trip ${crypto.randomUUID()}`;
  await page.getByLabel('Architecture name').fill(`  ${name}  `);
  await page.getByRole('button', { name: 'Add Server', exact: true }).click();
  await page.getByLabel('Label', { exact: true }).fill('Application'); await moveComponentTo(page, 'Application', -12.5, 0);
  expect(requests).toEqual([]); const created = await save(page, 'POST');
  await expect(page.getByLabel('Architecture name')).toHaveValue(name);
  await page.getByLabel('Maximum RPS').fill('240'); await moveComponentTo(page, 'Application', -12.5, 80);
  const updated = await save(page, 'PUT');
  expect(updated.id).toBe(created.id); expect(updated.created_at).toBe(created.created_at); expect(updated.updated_at).not.toBe(created.updated_at);
  expect(updated.document.nodes[0]).toMatchObject({ label: 'Application', capacity_rps: 240 });
  expect(updated.document.nodes[0].position.y).toBeGreaterThan(created.document.nodes[0].position.y + 30);
  expect(requests).toEqual(['POST', 'PUT']); expect(await (await page.request.get(`${endpoint}/${created.id}`)).json()).toEqual(updated);
  await page.reload(); await open(page, updated);
  await page.getByRole('group', { name: 'Application component', exact: true }).click(); await expect(page.getByLabel('Maximum RPS')).toHaveValue('240'); await expect(page.getByText('CANVAS POSITION', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Library', exact: true }).click();
  await page.getByRole('button', { name: `Delete ${updated.name} ${updated.id.slice(0, 8)}`, exact: true }).click();
  await page.getByRole('button', { name: 'Delete architecture', exact: true }).click();
  await expect(page.locator('.save-state')).toHaveText('New architecture'); expect((await page.request.get(`${endpoint}/${updated.id}`)).status()).toBe(404);
});

test('a pending real PUT saves its snapshot, preserves later edits, and prevents overlapping Saves', async ({ page }) => {
  await page.getByLabel('Architecture name').fill(`Pending ${crypto.randomUUID()}`); const created = await save(page, 'POST');
  let release!: () => void; const held = new Promise<void>((resolve) => { release = resolve; });
  let reached!: () => void; const intercepted = new Promise<void>((resolve) => { reached = resolve; });
  await page.route(`${endpoint}/${created.id}`, async (route) => { if (route.request().method() === 'PUT') { reached(); await held; } await route.continue(); });
  await page.getByLabel('Architecture name').fill('Submitted snapshot'); const response = page.waitForResponse(mutation('PUT')); await saveButton(page).click(); await intercepted;
  await expect(saveButton(page)).toBeDisabled(); await page.getByLabel('Architecture name').fill('Later canvas work'); release();
  expect((await (await response).json() as Architecture).name).toBe('Submitted snapshot'); await expect(page.locator('.save-state')).toHaveText('Unsaved changes');
  await expect(page.getByLabel('Architecture name')).toHaveValue('Later canvas work'); const updated = await save(page, 'PUT'); expect(updated.id).toBe(created.id); expect(updated.name).toBe('Later canvas work');
});

test('a backend 404 keeps the working diagram and retries PUT without creating a replacement', async ({ page }) => {
  await page.getByLabel('Architecture name').fill(`Missing ${crypto.randomUUID()}`); const created = await save(page, 'POST');
  expect((await page.request.delete(`${endpoint}/${created.id}`)).status()).toBe(204);
  await page.getByRole('button', { name: 'Add Server', exact: true }).click(); const response = page.waitForResponse(mutation('PUT')); await saveButton(page).click(); expect((await response).status()).toBe(404);
  await expect(page.locator('.save-state')).toHaveText('Save failed'); await expect(page.getByRole('group', { name: 'Server component', exact: true })).toBeVisible();
  const retry = page.waitForResponse(mutation('PUT')); await page.getByRole('button', { name: 'Retry Save', exact: true }).first().click(); expect((await retry).status()).toBe(404);
  await expect(page.locator('.save-state')).toHaveText('Save failed');
});

test('backend validation details highlight the field and allow an explicit corrected Save', async ({ page }) => {
  await page.getByLabel('Architecture name').fill(`Validation ${crypto.randomUUID()}`); await page.getByRole('button', { name: 'Add Server', exact: true }).click();
  // Submit an invalid capacity to the real validator to exercise a server-side rejection.
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const body = route.request().postDataJSON() as { document: { nodes: { capacity_rps: number }[] } }; body.document.nodes[0].capacity_rps = 0;
    await route.continue({ postData: JSON.stringify(body) });
  }, { times: 1 });
  const rejected = page.waitForResponse(mutation('POST')); await saveButton(page).click(); expect((await rejected).status()).toBe(422);
  await expect(page.locator('.save-state')).toHaveText('Save failed'); await expect(page.getByLabel('Maximum RPS')).toHaveAttribute('aria-invalid', 'true'); await expect(page.getByRole('button', { name: 'Retry Save', exact: true }).first()).toBeDisabled();
  await page.getByLabel('Maximum RPS').fill('250'); const accepted = page.waitForResponse(mutation('POST')); await saveButton(page).click(); expect((await accepted).status()).toBe(201); await expect(page.locator('.save-state')).toHaveText('Saved');
});

test('an unreachable backend retains a new document for an explicit retry', async ({ page }) => {
  await page.getByLabel('Architecture name').fill(`Offline ${crypto.randomUUID()}`); await page.route(endpoint, (route) => route.abort('connectionrefused'), { times: 1 }); await saveButton(page).click();
  await expect(page.locator('.save-state')).toHaveText('Save failed'); await expect(page.getByRole('alert')).toContainText('Your edits are intact');
  const response = page.waitForResponse(mutation('POST')); await page.getByRole('button', { name: 'Retry Save', exact: true }).first().click(); expect((await response).status()).toBe(201); await expect(page.locator('.save-state')).toHaveText('Saved');
});

test('Save and continue creates a new document, then updates the same resource before navigating', async ({ page }) => {
  await page.getByLabel('Architecture name').fill(`Navigation ${crypto.randomUUID()}`); await page.getByRole('button', { name: 'New', exact: true }).click();
  let response = page.waitForResponse(mutation('POST')); await page.getByRole('button', { name: 'Save and continue', exact: true }).click(); const created = await (await response).json() as Architecture;
  await expect(page.locator('.save-state')).toHaveText('New architecture'); await open(page, created);
  await page.getByRole('button', { name: 'Add Database', exact: true }).click(); await page.getByRole('button', { name: 'New', exact: true }).click();
  response = page.waitForResponse(mutation('PUT')); await page.getByRole('button', { name: 'Save and continue', exact: true }).click(); const updated = await (await response).json() as Architecture;
  expect(updated.id).toBe(created.id); expect(updated.document.nodes[0].type).toBe(ComponentType.DATABASE); await expect(page.locator('.save-state')).toHaveText('New architecture');
});
