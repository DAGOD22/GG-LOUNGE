import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', fullyParallel: false, workers: 1, timeout: 35000,
  // Separate browser workers release heavy game-engine GPU/WASM memory before app tests.
  projects: [{ name: 'games', testMatch: 'games.spec.ts', use: { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined, args: ['--no-sandbox','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] } } }, { name: 'launcher', testMatch: 'launcher.spec.ts' }, { name: 'customization', testMatch: 'customization.spec.ts' }, { name: 'new-games', testMatch: 'new-games.spec.ts' }],
  expect: { timeout: 20000 }, reporter: 'list',
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:3000',
    locale: 'en-US', viewport: { width: 1280, height: 800 },
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ['--no-sandbox', '--no-zygote'] },
  },
});
