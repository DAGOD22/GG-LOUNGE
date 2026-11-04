import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../app/api/proxy/config/route';

const keys = ['WISP_URL', 'GG_LOCAL_WISP', 'VERCEL'] as const;
type EnvValues = Partial<Record<typeof keys[number], string | undefined>>;

async function withEnv<T>(values: EnvValues, run: () => Promise<T>): Promise<T> {
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]])) as EnvValues;
  for (const key of keys) {
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('normalizes WISP_URL to the trailing slash required by the pinned Wisp transport', async () => {
  await withEnv({ WISP_URL: 'wss://proxy.example/wisp', GG_LOCAL_WISP: '0', VERCEL: '1' }, async () => {
    const response = GET();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      engine: 'scramjet', wisp: 'wss://proxy.example/wisp/', websockets: true,
    });
  });
});

test('leaves the HTTP Bare fallback active on Vercel when no external Wisp is configured', async () => {
  await withEnv({ WISP_URL: undefined, GG_LOCAL_WISP: '1', VERCEL: '1' }, async () => {
    const response = GET();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { engine: 'scramjet', wisp: null, websockets: false });
  });
});

test('uses the in-process Wisp endpoint only in local Node mode', async () => {
  await withEnv({ WISP_URL: undefined, GG_LOCAL_WISP: '1', VERCEL: undefined }, async () => {
    const response = GET();
    assert.deepEqual(await response.json(), { engine: 'scramjet', wisp: '/wisp/', websockets: true });
  });
});

test('rejects private, credential-bearing and fragment URLs without leaking configuration', async () => {
  for (const WISP_URL of [
    'wss://127.0.0.1/wisp/',
    'wss://name:fixture-password@proxy.example/wisp/',
    'wss://proxy.example/wisp#fragment',
  ]) {
    await withEnv({ WISP_URL, GG_LOCAL_WISP: '0', VERCEL: '1' }, async () => {
      const response = GET();
      assert.equal(response.status, 503);
      const body = await response.text();
      assert.match(body, /public wss/);
      assert.doesNotMatch(body, /fixture-password|#fragment/);
    });
  }
});
