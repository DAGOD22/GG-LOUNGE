import { test, expect, type Page } from '@playwright/test';
const origin = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
async function localOnly(page: Page) {
  await page.route('**/*', route => new URL(route.request().url()).origin === origin || /^(data:|blob:)/.test(route.request().url()) ? route.continue() : route.abort());
  const missing: string[] = [], errors: string[] = [];
  page.on('response', response => { if (response.status() >= 400) missing.push(response.url()); });
  page.on('pageerror', error => errors.push(error.message));
  return { missing, errors };
}

test('original 2048 is installed locally and responds to keyboard moves', async ({ page }) => {
  const events=await localOnly(page);await page.goto('/games/2048/index.html');
  await expect(page.locator('.tile')).toHaveCount(2);const before=await page.locator('.tile-container').innerHTML();
  await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowDown');
  await expect.poll(()=>page.locator('.tile-container').innerHTML()).not.toBe(before);
  expect(events.missing).toEqual([]);expect(events.errors).toEqual([]);
});
test('Minecraft Classic starts and moves with every external request blocked', async ({ page }) => {
  const events=await localOnly(page);await page.goto('/games/minecraft-classic/index.html');
  const canvas=page.locator('#noa-canvas');await expect(canvas).toBeVisible();
  await page.waitForFunction(()=>Boolean(document.querySelector('#hotbar')?.children.length));
  // Classic routes input through a transparent menu canvas above the world.
  await page.mouse.click(500,300);
  const position=()=>page.evaluate(()=> { const noa=(window as any).noa; return Array.from(noa.entities.getPosition(noa.playerEntity)) });
  const before=await position();
  await page.keyboard.down('w');await page.keyboard.down('Space');await page.waitForTimeout(800);await page.keyboard.up('w');await page.keyboard.up('Space');
  expect(await position()).not.toEqual(before);
  expect(events.missing).toEqual([]);expect(events.errors).toEqual([]);
});
test('ClassiCube uses its local texture pack', async ({ page }) => {
  const events=await localOnly(page);await page.goto('/games/minecraftbeta/index.html');
  await page.waitForFunction(()=>Boolean((window as any).Module?.calledRun));
  await expect(page.locator('canvas')).toBeVisible();expect(events.missing).toEqual([]);expect(events.errors).toEqual([]);
});
test('Stack starts and accepts a block placement', async ({ page }) => {
  const events=await localOnly(page);await page.goto('/games/stack/index.html');await page.locator('#start-button').click();
  await expect(page.locator('#container')).toHaveClass(/playing/);await page.keyboard.press('Space');
  await expect(page.locator('#score')).not.toHaveText('-1');expect(events.missing).toEqual([]);expect(events.errors).toEqual([]);
});
test('Hextris has its real canvas and local dependencies', async ({ page }) => {
  const events=await localOnly(page);await page.goto('/games/hextris/index.html');
  await expect(page.locator('canvas').first()).toBeVisible();await page.keyboard.press('ArrowLeft');
  expect(events.missing).toEqual([]);expect(events.errors).toEqual([]);
});
test('Unity WebAssembly Slope reaches its initialized runtime', async ({ page }) => {
  const events=await localOnly(page);await page.goto('/games/slope/index.html');
  await page.waitForFunction(()=>Boolean((window as any).gameInstance?.Module?.calledRun));
  await expect(page.locator('canvas').first()).toBeVisible();expect(events.missing).toEqual([]);expect(events.errors).toEqual([]);
});
for (const id of ['bloxors','papaspizzaria','run-3']) test(`${id}: shared Ruffle loads the actual local SWF`, async ({ page }) => {
  const events=await localOnly(page);await page.goto(`/games/${id}/index.html`);
  await page.waitForFunction(()=> (document.querySelector('ruffle-player,ruffle-object,ruffle-embed') as any)?.ruffle?.().readyState === 2);
  await expect(page.locator('ruffle-player,ruffle-object,ruffle-embed').first()).toBeVisible();
  expect(events.missing).toEqual([]);expect(events.errors).toEqual([]);
});
