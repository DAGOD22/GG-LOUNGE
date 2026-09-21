import { test, expect } from '@playwright/test';
const origin = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';
test('apps launch through the shared boot page, not uninitialized proxy URLs', async ({ page }) => {
  await page.goto('/apps');const links=page.getByRole('link',{name:'Open in Scramjet'});await expect(links).toHaveCount(10);
  for(const link of await links.all()) expect(await link.getAttribute('href')).toMatch(/^\/proxy\?url=https/);
  await expect(page.getByText('Verified fix — works at school')).toHaveCount(0);
});
test('Scramjet starts a worker scoped to /browse/, with no game interception', async ({ page }) => {
  await page.goto('/proxy');await expect(page.getByRole('button',{name:'Go',exact:true})).toBeEnabled();
  const scopes=await page.evaluate(async()=> (await navigator.serviceWorker.getRegistrations()).map(r=>r.scope));
  expect(scopes).toContain(origin+'/browse/');expect(scopes).not.toContain(origin+'/');
});
test('workerless proxy deep links redirect to boot instead of 404', async ({ request }) => {
  const response=await request.get('/browse/'+encodeURIComponent('https://example.com/'),{maxRedirects:0});
  expect(response.status()).toBe(307);expect(response.headers().location).toContain('/proxy?url=');
});
test('missing Geometry Dash is reported honestly, not replaced by a CDN or an iframe', async ({ page }) => {
  await page.goto('/games/geometry-dash/index.html');await expect(page.getByRole('heading',{name:'Geometry Dash needs its game files'})).toBeVisible();await expect(page.locator('iframe')).toHaveCount(0);
});

test('the game modal respects hidden loaders and engine canvas dimensions', async ({ page }) => {
  await page.route('**/api/games',route=>route.fulfill({json:{games:[{id:'loader-fixture',title:'Loader regression fixture',icon:null}]}}));
  await page.route('**/games/loader-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><title>Game fixture</title></head><body><div id="loader" style="display:none">Loading</div><canvas width="320" height="180" style="width:320px;height:180px"></canvas></body></html>'}));
  await page.goto('/?play=pub-loader-fixture');
  const game=page.frameLocator('iframe.game-frame');
  await expect(game.locator('canvas')).toBeVisible();
  await expect(game.locator('#loader')).toBeHidden();
  expect(await game.locator('canvas').evaluate(canvas=>canvas.getBoundingClientRect().width)).toBe(320);
});
