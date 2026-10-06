import { test, expect, type Page, type Locator } from '@playwright/test';
import type { Architecture, ArchitectureDocument } from '../src/lib/domain';
import type { SimulationResult } from '../src/lib/simulation';
import { moveComponentTo } from './canvas-helpers';

const api = 'http://127.0.0.1:8000/api/v1';
const simulationUrl = `${api}/simulations`;
function reference(): ArchitectureDocument {
  return { format_version: 1, nodes: [
    { id: 'caller', type: 'caller_group', label: 'Caller Group', position: { x: 0, y: 0 }, capacity_rps: null, caller_count: 10, test_rps: 100 },
    { id: 'lb', type: 'load_balancer', label: 'Load Balancer', position: { x: 250, y: 0 }, capacity_rps: 100, routing_policy: 'round_robin' },
    { id: 'server', type: 'server', label: 'Server', position: { x: 500, y: 0 }, capacity_rps: 60 },
    { id: 'database', type: 'database', label: 'Database', position: { x: 750, y: 0 }, capacity_rps: 60 },
  ], edges: [
    { id: 'caller-to-lb', source: 'caller', target: 'lb', order: 0, weight: 1 },
    { id: 'lb-to-server', source: 'lb', target: 'server', order: 0, weight: 1 },
    { id: 'server-to-database', source: 'server', target: 'database', order: 0, weight: 1 },
  ] };
}
async function load(page: Page, document = reference()): Promise<Architecture> {
  const response = await page.request.post(`${api}/architectures`, { data: { name: `Simulation ${crypto.randomUUID()}`, document } }); expect(response.status()).toBe(201);
  const resource = await response.json() as Architecture;
  await page.goto('/'); await page.getByRole('button', { name: 'Library', exact: true }).click(); await page.getByRole('button', { name: `Open ${resource.name} ${resource.id.slice(0, 8)}`, exact: true }).click();
  await expect(page.getByRole('group', { name: 'Caller Group component', exact: true })).toBeVisible(); return resource;
}
async function run(page: Page): Promise<SimulationResult> {
  const waiting = page.waitForResponse((response) => response.url() === simulationUrl && response.request().method() === 'POST'); await page.getByRole('button', { name: 'Run', exact: true }).click();
  const response = await waiting; expect(response.status()).toBe(200); await expect(page.getByTestId('step-position')).toHaveText(/Step 0 of/); return response.json() as Promise<SimulationResult>;
}
async function step(page: Page, value: number | 'last'): Promise<void> {
  const scrubber = page.getByRole('slider', { name: 'Playback step' }); await scrubber.focus(); await scrubber.press('Home');
  if (value === 'last') await scrubber.press('End'); else for (let index = 0; index < value; index++) await scrubber.press('ArrowRight');
  await expect(page.getByTestId('step-position')).toHaveText(new RegExp(`Step ${value === 'last' ? '60' : value} of`));
}
async function select(page: Page, label: string): Promise<void> { await page.getByRole('group', { name: `${label} component`, exact: true }).click(); }
function metric(panel: Locator, label: string): Locator { return panel.locator('dt').filter({ hasText: new RegExp(`^${label}$`) }).locator('..').locator('dd'); }
function section(page: Page, title: string): Locator { return page.locator('.metric-section').filter({ has: page.getByRole('heading', { name: title, exact: true }) }); }

test('Run uses the unsaved canvas once, defaults to 60, and never saves the architecture', async ({ page }) => {
  await page.goto('/');
  for (const [index, type] of ['Caller Group', 'Load Balancer', 'Server', 'Database'].entries()) {
    await page.getByRole('button', { name: `Add ${type}`, exact: true }).click();
    if (type === 'Server' || type === 'Database') await page.getByLabel('Maximum RPS').fill('60');
    await moveComponentTo(page, type, index * 250, 0);
  }
  for (const [source, target] of [['Caller Group', 'Load Balancer'], ['Load Balancer', 'Server'], ['Server', 'Database']]) {
    await select(page, source); await page.getByLabel('Connect to', { exact: true }).selectOption({ label: target }); await page.getByRole('button', { name: 'Connect', exact: true }).click();
  }
  let runs = 0, saves = 0;
  page.on('request', (request) => { if (request.method() === 'POST' && request.url() === simulationUrl) { runs++; expect(request.postDataJSON()).toMatchObject({ total_ticks: 60 }); expect(Object.keys(request.postDataJSON() as object).sort()).toEqual(['document', 'total_ticks']); } if (['POST', 'PUT'].includes(request.method()) && request.url().startsWith(`${api}/architectures`)) saves++; });
  await expect(page.getByLabel('Total steps')).toHaveValue('60'); await page.getByLabel('Architecture name').fill(''); // A name draft cannot block simulation.
  const result = await run(page); expect(result.frames).toHaveLength(61); expect(result.summary).toEqual({ generated: 6000, completed: 3240, dropped: 2320, in_flight: 440 });
  await expect(page.getByTestId('cumulative-strip')).toContainText('Total through Step 0'); await expect(page.getByTestId('cumulative-strip')).toContainText('Generated 0');
  expect(runs).toBe(1); expect(saves).toBe(0); await expect(page.getByRole('button', { name: 'Play playback' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Add Server' })).toHaveCount(0);
});

test('records the full request and response path with separate current, cumulative, and whole-run counts', async ({ page }) => {
  await load(page); const result = await run(page);
  expect(result.frames[7].nodes.caller).toEqual({ generated: 100, completed: 60 });
  await step(page, 1); await select(page, 'Caller Group'); await expect(metric(section(page, 'Requests'), 'Generated')).toHaveText('100'); await expect(metric(section(page, 'Requests'), 'Completed')).toHaveText('0');
  await step(page, 2); await select(page, 'Load Balancer'); await expect(metric(section(page, 'Requests'), 'Received')).toHaveText('100');
  await step(page, 3); await select(page, 'Server'); await expect(metric(section(page, 'Requests'), 'Handled')).toHaveText('60'); await expect(metric(section(page, 'Requests'), 'Dropped')).toHaveText('40'); await expect(page.locator('.capacity-card')).toContainText('At capacity');
  await step(page, 4); await select(page, 'Database'); await expect(metric(section(page, 'Requests'), 'Handled')).toHaveText('60'); await expect(metric(section(page, 'Responses'), 'Returned')).toHaveText('60'); await expect(metric(page.getByTestId('whole-run-summary'), 'Completed')).toHaveText('3,240');
  await step(page, 5); await select(page, 'Server'); await expect(metric(section(page, 'Responses'), 'Received')).toHaveText('60'); await expect(metric(section(page, 'Requests'), 'Handled')).toHaveText('60');
  await step(page, 6); await select(page, 'Load Balancer'); await expect(metric(section(page, 'Responses'), 'Received')).toHaveText('60');
  await step(page, 7); await select(page, 'Caller Group'); await expect(metric(section(page, 'Requests'), 'Completed')).toHaveText('60');
  const edge = page.locator('.svelte-flow__edge[data-id="caller-to-lb"]'); await edge.focus(); await edge.press('Enter'); await expect(metric(section(page, 'Traffic sent · Step 7'), 'Requests →')).toHaveText('100'); await expect(metric(section(page, 'Traffic sent · Step 7'), '← Responses')).toHaveText('60');
  await step(page, 'last'); await expect(page.getByTestId('cumulative-strip')).toContainText('Completed 3,240'); await expect(page.getByTestId('cumulative-strip')).toContainText('Dropped 2,320'); await expect(page.getByTestId('cumulative-strip')).toContainText('In flight 440'); await expect(page.getByRole('button', { name: 'Next step' })).toBeDisabled();
  expect(result.frames.reduce((sum, frame) => sum + ('handled' in frame.nodes.database ? frame.nodes.database.handled : 0), 0)).toBe(3420);
});

test('playback reuses frames, pauses on seek and mode exit, and stops without draining', async ({ page }) => {
  await load(page); let requests = 0; page.on('request', (request) => { if (request.url() === simulationUrl) requests++; }); await run(page);
  await page.getByLabel('Playback speed').selectOption('8'); await page.getByRole('button', { name: 'Play playback' }).click(); await expect(page.getByTestId('step-position')).not.toHaveText('Step 0 of 60');
  await page.getByRole('button', { name: 'Pause playback' }).click(); const paused = await page.getByTestId('step-position').textContent(); await page.waitForTimeout(300); await expect(page.getByTestId('step-position')).toHaveText(paused!);
  await step(page, 7); await page.getByRole('button', { name: 'Previous step' }).click(); await expect(page.getByTestId('step-position')).toHaveText('Step 6 of 60'); await page.getByRole('button', { name: 'Next step' }).click(); await expect(page.getByTestId('step-position')).toHaveText('Step 7 of 60');
  await page.getByRole('button', { name: 'Play playback' }).click(); await page.getByRole('button', { name: 'Edit', exact: true }).click(); await page.waitForTimeout(300); await page.getByRole('button', { name: 'Replay', exact: true }).click(); await expect(page.getByRole('button', { name: 'Play playback' })).toBeVisible();
  await step(page, 'last'); await expect(page.getByRole('button', { name: 'Replay from start' })).toBeVisible(); await page.getByRole('button', { name: 'Replay from start' }).click(); await expect(page.getByTestId('step-position')).not.toHaveText('Step 60 of 60');
  await page.getByRole('button', { name: 'Pause playback' }).click(); expect(requests).toBe(1); await expect(page.getByText(/Elapsed time/i)).toHaveCount(0);
});

test('Replay keeps its snapshot after edits, follows document equality, and preserves selection and step', async ({ page }) => {
  await load(page); await run(page); await step(page, 7); await select(page, 'Server'); await page.getByRole('button', { name: 'Edit', exact: true }).click(); await expect(page.getByLabel('Maximum RPS')).toHaveValue('60');
  await page.getByLabel('Maximum RPS').fill('80'); await page.getByRole('button', { name: 'Replay', exact: true }).click(); await expect(page.locator('.snapshot-note')).toBeVisible(); await expect(metric(section(page, 'Captured configuration'), 'Maximum RPS')).toHaveText('60'); await expect(page.getByTestId('step-position')).toHaveText('Step 7 of 60');
  await page.getByRole('button', { name: 'Edit', exact: true }).click(); await page.getByLabel('Maximum RPS').fill('60'); await page.getByLabel('Architecture name').fill('Changed name only'); await page.getByRole('button', { name: 'Replay', exact: true }).click(); await expect(page.locator('.snapshot-note')).toHaveCount(0);
  await page.getByRole('button', { name: 'Edit', exact: true }).click(); await page.getByLabel('Label', { exact: true }).fill('Changed Server'); await page.getByRole('button', { name: 'Replay', exact: true }).click(); await expect(page.getByRole('group', { name: 'Server component', exact: true })).toBeVisible(); await expect(page.getByRole('group', { name: 'Changed Server component', exact: true })).toHaveCount(0); await expect(page.locator('.snapshot-note')).toBeVisible();
});

test('Replay permits keyboard selection and canvas navigation but blocks document mutation', async ({ page }) => {
  await load(page); await run(page); const node = page.getByRole('group', { name: 'Server component', exact: true }); await node.focus(); await node.press('Enter'); await expect(page.getByTestId('replay-inspector').getByRole('heading', { name: 'Server', exact: true })).toBeVisible();
  const before = await node.evaluate((element) => getComputedStyle(element).transform); await node.press('ArrowRight'); await node.press('Delete'); const box = (await node.boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 45); await page.mouse.up(); expect(await node.evaluate((element) => getComputedStyle(element).transform)).toBe(before);
  await node.press('ControlOrMeta+v'); await expect(page.getByRole('group', { name: /component$/ })).toHaveCount(4); await expect(page.getByRole('button', { name: 'Remove component' })).toHaveCount(0); await page.getByRole('button', { name: 'Fit diagram' }).click();
  const zoom = await page.locator('.svelte-flow__viewport').evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a); await page.getByRole('button', { name: 'Zoom in' }).click(); await expect.poll(() => page.locator('.svelte-flow__viewport').evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeGreaterThan(zoom);
  await page.getByRole('button', { name: 'Edit', exact: true }).click(); await expect(page.getByLabel('Maximum RPS')).toHaveValue('60'); await expect(page.locator('.save-state')).toHaveText('Saved');
});

test('readiness errors link captured IDs and Save stays available for an incomplete diagram', async ({ page }) => {
  await load(page); await page.getByRole('button', { name: 'Add Server', exact: true }).click(); await page.getByLabel('Label', { exact: true }).fill('Unreachable service');
  const rejection = page.waitForResponse(simulationUrl); await page.getByRole('button', { name: 'Run', exact: true }).click(); expect((await rejection).status()).toBe(422); await expect(page.locator('.run-issues')).toContainText('Unreachable service'); await page.locator('.run-issues button').click(); await expect(page.getByLabel('Label', { exact: true })).toHaveValue('Unreachable service'); await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  const saved = page.waitForResponse((response) => response.request().method() === 'PUT'); await page.getByRole('button', { name: 'Save', exact: true }).click(); expect((await saved).status()).toBe(200); await expect(page.locator('.save-state')).toHaveText('Saved');
});

test('invalid field and step drafts block Run while valid lengths remain separate from Save', async ({ page }) => {
  await load(page); let requests = 0; page.on('request', (request) => { if (request.url() === simulationUrl) requests++; }); await select(page, 'Server'); await page.getByLabel('Maximum RPS').fill(''); await page.getByRole('button', { name: 'Run', exact: true }).click(); await expect(page.locator('.run-error')).toContainText('Server · capacity rps'); expect(requests).toBe(0);
  await page.getByLabel('Maximum RPS').fill('60'); await page.getByLabel('Total steps').fill('0'); await page.getByRole('button', { name: 'Run', exact: true }).click(); await expect(page.locator('.run-error')).toContainText('positive safe whole number'); expect(requests).toBe(0);
  await page.getByLabel('Total steps').fill('8'); const result = await run(page); expect(result.frames).toHaveLength(9); await expect(page.getByTestId('step-position')).toHaveText('Step 0 of 8'); await page.getByRole('button', { name: 'Edit', exact: true }).click(); await expect(page.locator('.save-state')).toHaveText('Saved'); await page.getByLabel('Total steps').fill('9'); await page.getByRole('button', { name: 'Replay', exact: true }).click(); await expect(page.locator('.run-setting')).toContainText('Recorded · 8 steps'); await expect(page.locator('.run-setting')).toContainText('Next Run: 9 steps');
  await page.getByRole('button', { name: 'New', exact: true }).click(); await expect(page.getByLabel('Total steps')).toHaveValue('60'); await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeDisabled();
});

test('newer edits and independent Save survive a pending Run; Cancel and malformed replacement retain prior results', async ({ page }) => {
  await load(page); await run(page); await step(page, 7); await page.getByRole('button', { name: 'Edit', exact: true }).click();
  let release!: () => void; const hold = new Promise<void>((resolve) => { release = resolve; });
  let ready!: () => void; const reached = new Promise<void>((resolve) => { ready = resolve; });
  await page.route(simulationUrl, async (route) => { const response = await route.fetch(); ready(); await hold; await route.fulfill({ response }); }, { times: 1 });
  await page.getByRole('button', { name: 'Run', exact: true }).click(); await reached; await select(page, 'Server'); await page.getByLabel('Maximum RPS').fill('80');
  const saved = page.waitForResponse((response) => response.request().method() === 'PUT'); await page.getByRole('button', { name: 'Save', exact: true }).click(); expect((await saved).status()).toBe(200); release(); await expect(page.getByTestId('step-position')).toHaveText('Step 0 of 60'); await expect(page.locator('.snapshot-note')).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click(); await expect(page.getByLabel('Maximum RPS')).toHaveValue('80');
  await page.route(simulationUrl, async (route) => { const response = await route.fetch(); const body = await response.json() as SimulationResult; body.frames.pop(); await route.fulfill({ response, json: body }); }, { times: 1 });
  await page.getByRole('button', { name: 'Run', exact: true }).click(); await expect(page.locator('.run-error')).toContainText('invalid simulation result'); await page.getByRole('button', { name: 'Replay', exact: true }).click(); await expect(metric(page.getByTestId('whole-run-summary'), 'Completed')).toHaveText('3,240');
  await page.getByRole('button', { name: 'Edit', exact: true }).click(); let cancelRelease!: () => void; const cancelled = new Promise<void>((resolve) => { cancelRelease = resolve; }); let cancelReady!: () => void; const cancelReached = new Promise<void>((resolve) => { cancelReady = resolve; });
  await page.route(simulationUrl, async (route) => { const response = await route.fetch(); cancelReady(); await cancelled; await route.fulfill({ response }).catch(() => {}); }, { times: 1 }); await page.getByRole('button', { name: 'Run', exact: true }).click(); await cancelReached; await page.getByRole('button', { name: 'Cancel Run' }).click(); cancelRelease(); await page.getByRole('button', { name: 'Replay', exact: true }).click(); await expect(metric(page.getByTestId('whole-run-summary'), 'Completed')).toHaveText('3,240');
});

test('successful New ignores late Run responses and resets the runtime context', async ({ page }) => {
  await load(page); await page.getByLabel('Total steps').fill('8'); let release!: () => void; const hold = new Promise<void>((resolve) => { release = resolve; }); let ready!: () => void; const reached = new Promise<void>((resolve) => { ready = resolve; });
  await page.route(simulationUrl, async (route) => { const response = await route.fetch(); ready(); await hold; await route.fulfill({ response }).catch(() => {}); }); await page.getByRole('button', { name: 'Run', exact: true }).click(); await reached;
  await page.getByRole('button', { name: 'New', exact: true }).click(); release(); await expect(page.getByLabel('Total steps')).toHaveValue('60'); await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeDisabled(); await expect(page.getByRole('group', { name: /component$/ })).toHaveCount(0); await page.waitForTimeout(150); await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeDisabled();
});

test('capacity text is precise at normal, 80%, and full utilization with zero-source runs allowed', async ({ page }) => {
  const doc = reference(); doc.nodes[0].type === 'caller_group' && (doc.nodes[0].test_rps = 80); doc.nodes[2].type === 'server' && (doc.nodes[2].capacity_rps = 100); doc.nodes[3].type === 'database' && (doc.nodes[3].capacity_rps = 100); await load(page, doc); await run(page);
  await select(page, 'Load Balancer'); await expect(page.locator('.capacity-card')).toContainText('Normal'); await step(page, 2); await expect(page.locator('.capacity-card')).toContainText('80%'); await expect(page.locator('.capacity-card')).toContainText('Near capacity');
  await page.getByRole('button', { name: 'Edit', exact: true }).click(); await select(page, 'Caller Group'); await page.getByLabel('Total test RPS').fill('0'); const zero = await run(page); expect(zero.summary).toEqual({ generated: 0, completed: 0, dropped: 0, in_flight: 0 }); await step(page, 'last'); await expect(page.getByTestId('cumulative-strip')).toContainText('Generated 0');
});

test('deletion retains pending Run and prior results except after successful active-architecture deletion', async ({ page }) => {
  const resource = await load(page); const otherResponse = await page.request.post(`${api}/architectures`, { data: { name: `Other simulation ${crypto.randomUUID()}`, document: reference() } }); const other = await otherResponse.json() as Architecture;
  await run(page); await step(page, 7); await page.getByRole('button', { name: 'Edit', exact: true }).click(); await page.getByLabel('Total steps').fill('8');
  let release!: () => void; const hold = new Promise<void>((resolve) => { release = resolve; }); let ready!: () => void; const reached = new Promise<void>((resolve) => { ready = resolve; });
  let failActiveDelete = true;
  // Keep one interception configuration while the response is held. Chromium may
  // release a paused Fetch request when a one-shot route is removed and routing
  // is later reconfigured for an unrelated URL.
  await page.route(`${api}/**`, async (route) => {
    if (route.request().url() === simulationUrl) { const response = await route.fetch(); ready(); await hold; await route.fulfill({ response }).catch(() => {}); return; }
    if (route.request().url() === `${api}/architectures/${resource.id}` && route.request().method() === 'DELETE' && failActiveDelete) { failActiveDelete = false; await route.fulfill({ status: 500, contentType: 'application/json', json: { error: { code: 'storage_unavailable', message: 'Library temporarily unavailable.', details: [] } } }); return; }
    await route.continue();
  }); await page.getByRole('button', { name: 'Run', exact: true }).click(); await reached;
  async function askDelete(item: Architecture): Promise<void> { await page.getByRole('button', { name: 'Library', exact: true }).click(); await page.getByRole('button', { name: `Delete ${item.name} ${item.id.slice(0, 8)}`, exact: true }).click(); }
  await askDelete(other); await page.getByRole('button', { name: 'Delete architecture', exact: true }).click(); await expect(page.getByRole('button', { name: 'Cancel Run' })).toBeVisible();
  await askDelete(resource); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click(); await expect(page.getByRole('button', { name: 'Cancel Run' })).toBeVisible();
  await askDelete(resource); await page.getByRole('button', { name: 'Delete architecture', exact: true }).click(); await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('Library temporarily unavailable.'); await page.getByRole('dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Replay', exact: true }).click(); await expect(page.getByTestId('step-position')).toHaveText('Step 7 of 60'); await expect(page.getByRole('button', { name: 'Cancel Run' })).toBeVisible();
  await askDelete(resource); await page.getByRole('button', { name: 'Delete architecture', exact: true }).click(); release(); await expect(page.getByLabel('Total steps')).toHaveValue('60'); await expect(page.getByRole('button', { name: 'Replay', exact: true })).toBeDisabled(); await expect(page.getByRole('button', { name: 'Cancel Run' })).toHaveCount(0);
});

test('vertical and backward Replay routes keep traffic paths and labels clear of component text and metrics', async ({ page }) => {
  const doc = reference();
  doc.nodes[0].position = { x: 650, y: 0 };
  doc.nodes[1] = { id: 'lb', type: 'gateway', label: 'Gateway with a long route label', position: { x: 0, y: 0 }, capacity_rps: 100, routing_policy: 'round_robin' };
  doc.nodes[2].position = { x: 0, y: 430 }; doc.nodes[3].position = { x: 650, y: 430 };
  await load(page, doc); await run(page); await step(page, 'last'); await page.getByRole('button', { name: 'Fit diagram' }).click();
  await page.waitForTimeout(200); // The existing Fit transition lasts 180 ms.
  await expect(page.locator('.edge-traffic-label')).toHaveCount(3);
  const overlaps = await page.locator('.svelte-flow').evaluate((canvas) => {
    const text = [...canvas.querySelectorAll('.node-label, .node-type, .node-summary, .node-replay-metrics')].map((element) => element.getBoundingClientRect());
    const inside = (x: number, y: number) => text.some((box) => x > box.left && x < box.right && y > box.top && y < box.bottom);
    const labels = [...canvas.querySelectorAll('.edge-traffic-label')].filter((element) => { const a = element.getBoundingClientRect(); return text.some((b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top); }).length;
    const paths = [...canvas.querySelectorAll<SVGPathElement>('.svelte-flow__edge-path, .response-edge')].filter((path) => {
      const matrix = path.getScreenCTM(); if (!matrix) return false;
      const length = path.getTotalLength();
      for (let index = 0; index <= 100; index++) { const point = path.getPointAtLength(length * index / 100); const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix); if (inside(screen.x, screen.y)) return true; }
      return false;
    }).length;
    return { labels, paths };
  });
  expect(overlaps).toEqual({ labels: 0, paths: 0 });
  const clipped = await page.locator('.canvas').evaluate((canvas) => {
    const bounds = canvas.getBoundingClientRect(); return [...canvas.querySelectorAll('.edge-traffic-label')].filter((element) => { const label = element.getBoundingClientRect(); return label.left < bounds.left || label.right > bounds.right || label.top < bounds.top || label.bottom > bounds.bottom; }).length;
  });
  expect(clipped).toBe(0);
  await page.setViewportSize({ width: 800, height: 700 }); await page.getByRole('button', { name: 'Fit diagram' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
});

test('traffic batches move in opposite directions, freeze on pause, and arrive at the next recorded step', async ({ page }) => {
  await load(page); const posts: string[] = []; page.on('request', (request) => { if (request.url() === simulationUrl) posts.push(request.method()); });
  await run(page); await step(page, 1);
  await expect(page.getByTestId('traffic-guide')).toContainText('Sent in Step 1 · arrives in Step 2');
  await expect(page.getByTestId('request-batch-caller-to-lb')).toBeVisible();
  await expect(page.getByTestId('response-batch-caller-to-lb')).toHaveCount(0);
  await expect(page.getByTestId('request-batch-server-to-database')).toHaveCount(0);
  await step(page, 4); await select(page, 'Server');
  await page.getByRole('button', { name: 'Fit diagram' }).click(); await page.waitForTimeout(200);
  const request = page.getByTestId('request-batch-server-to-database'), response = page.getByTestId('response-batch-server-to-database');
  const x = (item: Locator) => item.evaluate((element) => (element as SVGGElement).transform.baseVal.consolidate()!.matrix.e);
  const requestStart = await x(request), responseStart = await x(response);
  await page.clock.install(); await page.getByRole('button', { name: 'Play playback', exact: true }).click(); await page.clock.runFor(400);
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  expect(await x(request)).toBeGreaterThan(requestStart); expect(await x(response)).toBeLessThan(responseStart);
  await expect(page.getByTestId('step-position')).toHaveText('Step 4 of 60');
  await expect(metric(section(page, 'Responses'), 'Received')).toHaveText('0');
  const frozenRequest = await request.getAttribute('transform'), frozenResponse = await response.getAttribute('transform');
  const frozenProgress = await request.getAttribute('data-progress'), frozenRequestX = await x(request), frozenResponseX = await x(response);
  await page.clock.runFor(2000); await expect(request).toHaveAttribute('transform', frozenRequest!); await expect(response).toHaveAttribute('transform', frozenResponse!);
  await page.getByRole('button', { name: 'Edit', exact: true }).click(); await page.getByRole('button', { name: 'Replay', exact: true }).click();
  await expect(request).toHaveAttribute('data-progress', frozenProgress!); await expect(response).toHaveAttribute('data-progress', frozenProgress!);
  // A new SVG path measurement can differ by a fraction of a pixel after remount.
  expect(await x(request)).toBeCloseTo(frozenRequestX, 2); expect(await x(response)).toBeCloseTo(frozenResponseX, 2);
  await page.getByLabel('Playback speed').selectOption('2'); await page.getByRole('button', { name: 'Play playback', exact: true }).click(); await page.clock.runFor(200);
  await page.getByRole('button', { name: 'Pause playback', exact: true }).click();
  expect(await x(request)).toBeGreaterThan(requestStart); await expect(page.getByTestId('step-position')).toHaveText('Step 4 of 60');
  await page.getByRole('button', { name: 'Next step', exact: true }).click(); await expect(page.getByTestId('step-position')).toHaveText('Step 5 of 60');
  await expect(metric(section(page, 'Responses'), 'Received')).toHaveText('60');
  await expect(request).toHaveAttribute('data-progress', '0');
  await page.emulateMedia({ reducedMotion: 'reduce' }); await expect(request).not.toBeVisible(); await expect(response).not.toBeVisible();
  await expect(page.getByTestId('edge-traffic-server-to-database')).toContainText('Requests'); await expect(page.getByTestId('edge-traffic-server-to-database')).toContainText('Responses');
  await step(page, 'last'); await expect(page.getByTestId('traffic-guide')).toContainText('Run ended'); await expect(page.getByTestId('traffic-guide')).toContainText('440 still in flight');
  expect(posts).toEqual(['POST']);
});

test('the traffic guide, canvas navigation, and playback controls keep separate space in short and narrow windows', async ({ page }, testInfo) => {
  await load(page); await run(page); await step(page, 7); await select(page, 'Server');
  await page.getByRole('button', { name: 'Edit', exact: true }).click(); await page.getByLabel('Maximum RPS').fill('65');
  await page.getByRole('button', { name: 'Replay', exact: true }).click(); await expect(page.locator('.snapshot-note')).toBeVisible();
  for (const viewport of [{ width: 1280, height: 720 }, { width: 1024, height: 600 }, { width: 800, height: 520 }, { width: 640, height: 520 }]) {
    await page.setViewportSize(viewport);
    const layout = await page.locator('.canvas-column').evaluate((column) => {
      const box = (selector: string) => column.querySelector(selector)!.getBoundingClientRect();
      const guide = box('.traffic-guide'), canvas = box('.canvas'), tools = box('.canvas-tools'), timeline = box('.replay-timeline'), controls = box('.playback-controls');
      return {
        guideAboveCanvas: guide.bottom <= canvas.top,
        canvasAboveTimeline: canvas.bottom <= timeline.top,
        canvasHasSpace: canvas.height >= 120,
        toolsInsideCanvas: tools.top >= canvas.top && tools.bottom <= canvas.bottom && tools.left >= canvas.left && tools.right <= canvas.right,
        controlsInsideTimeline: controls.top >= timeline.top && controls.bottom <= timeline.bottom && controls.left >= timeline.left && controls.right <= timeline.right,
        noHorizontalOverflow: column.scrollWidth <= column.clientWidth && document.documentElement.scrollWidth <= innerWidth,
      };
    });
    expect(layout, `${viewport.width} × ${viewport.height}`).toEqual({ guideAboveCanvas: true, canvasAboveTimeline: true, canvasHasSpace: true, toolsInsideCanvas: true, controlsInsideTimeline: true, noHorizontalOverflow: true });
    const play = page.getByRole('button', { name: 'Play playback', exact: true }); await play.scrollIntoViewIfNeeded();
    expect(await play.evaluate((button) => { const bounds = button.getBoundingClientRect(); const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2); return !!hit && button.contains(hit); })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`replay-layout-${viewport.width}x${viewport.height}.png`) });
  }
});
