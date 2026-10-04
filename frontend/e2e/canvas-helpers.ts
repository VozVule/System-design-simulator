import { expect, type Page } from '@playwright/test';

/** Arrange a component through real canvas gestures instead of inspector coordinates. */
export async function moveComponentTo(page: Page, label: string, x: number, y: number): Promise<void> {
  const canvas = page.getByRole('region', { name: 'Architecture canvas' });
  const node = page.getByRole('group', { name: label + ' component', exact: true });
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.wheel(0, 2400);
  await expect.poll(() => page.locator('.svelte-flow__viewport').evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a)).toBeCloseTo(0.2);
  const origin = await node.evaluate((element) => { const matrix = new DOMMatrix(getComputedStyle(element).transform); return { x: matrix.e, y: matrix.f }; });
  const viewport = await page.locator('.svelte-flow__viewport').evaluate((element) => { const matrix = new DOMMatrix(getComputedStyle(element).transform); return { x: matrix.e, y: matrix.f, zoom: matrix.a }; });
  const middle = { x: (origin.x + x + 194) / 2, y: (origin.y + y + 190) / 2 };
  const dx = bounds.width / 2 - middle.x * viewport.zoom - viewport.x, dy = bounds.height / 2 - middle.y * viewport.zoom - viewport.y;
  await page.mouse.move(bounds.x + 12, bounds.y + 55); await page.mouse.down();
  await page.mouse.move(bounds.x + 12 + dx, bounds.y + 55 + dy, { steps: 8 }); await page.mouse.up();
  const box = (await node.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + (x - origin.x) * viewport.zoom, box.y + box.height / 2 + (y - origin.y) * viewport.zoom, { steps: 12 }); await page.mouse.up();
  await page.getByRole('button', { name: 'Fit diagram', exact: true }).click(); await page.waitForTimeout(250);
}
