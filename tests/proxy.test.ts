import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProxyUrl, normalizeWispUrl, selectProxyTransport, waitForActivation } from '../lib/proxy-client';
import { assertPublicTarget, isPublicAddress, publicLookup } from '../lib/network-target';
import { createBareHandler } from '../lib/bare-adapter';

test('normalizes addresses and search; rejects executable/credential URLs', () => {
  assert.equal(normalizeProxyUrl('github.com'), 'https://github.com/');
  assert.equal(new URL(normalizeProxyUrl('funny cats')).searchParams.get('q'),'funny cats');
  assert.throws(()=>normalizeProxyUrl('javascript:alert(1)'));
  assert.throws(()=>normalizeProxyUrl('data:text/html,test'));
  assert.throws(()=>normalizeProxyUrl('https://name:secret@example.com'));
  assert.throws(()=>normalizeProxyUrl(''));
});
test('normalizes Wisp URLs and rejects insecure or credential-bearing endpoints', () => {
  assert.equal(normalizeWispUrl('/wisp', 'http://localhost:3000/proxy').href, 'ws://localhost:3000/wisp/');
  assert.equal(normalizeWispUrl('wss://proxy.example/wisp', 'https://lounge.example/proxy').href, 'wss://proxy.example/wisp/');
  assert.throws(() => normalizeWispUrl('ws://proxy.example/wisp', 'https://lounge.example/proxy'), /secure WebSockets/);
  assert.throws(() => normalizeWispUrl('wss://name:secret@proxy.example/wisp', 'https://lounge.example/proxy'));
  assert.throws(() => normalizeWispUrl('wss://proxy.example/wisp#fragment', 'https://lounge.example/proxy'));
});

test('chooses Wisp only after a successful protocol handshake', async () => {
  const configured: Array<{ path: string; options: unknown[] }> = [];
  const mux = { async setTransport(path: string, options: unknown[]) { configured.push({ path, options }); } };
  const result = await selectProxyTransport(mux, { wisp: '/wisp/' }, 'http://lounge.example/proxy', {
    probeWisp: async endpoint => { assert.equal(endpoint, 'ws://lounge.example/wisp/'); },
    fetcher: async () => { throw new Error('HTTP fallback should not run'); },
  });
  assert.equal(result.transport, 'wisp');
  assert.equal(result.wispStatus, 'connected');
  assert.equal(configured[0].path, '/proxy-runtime/libcurl/index.mjs');
  assert.deepEqual(configured[0].options, [{ wisp: 'ws://lounge.example/wisp/' }]);
});

test('falls back to the existing Bare HTTP transport when Wisp fails', async () => {
  const configured: Array<{ path: string; options: unknown[] }> = [];
  const mux = { async setTransport(path: string, options: unknown[]) { configured.push({ path, options }); } };
  const result = await selectProxyTransport(mux, { wisp: '/wisp' }, 'http://lounge.example/proxy', {
    probeWisp: async () => { throw new Error('secret endpoint detail must not be reported'); },
    fetcher: async input => {
      assert.equal(String(input), 'http://lounge.example/api/bare/');
      return new Response(JSON.stringify({ versions: ['v3'] }), { status: 200 });
    },
  });
  assert.equal(result.transport, 'http');
  assert.equal(result.wispStatus, 'failed');
  assert.match(result.notice, /HTTP fallback/);
  assert.equal(configured[0].path, '/proxy-runtime/bare/index.mjs');
  assert.deepEqual(configured[0].options, ['http://lounge.example/api/bare/']);
});

test('reports Wisp as unconfigured when Bare HTTP is selected without WISP_URL', async () => {
  const mux = { async setTransport() {} };
  const result = await selectProxyTransport(mux, { wisp: null }, 'https://lounge.example/proxy', {
    fetcher: async () => new Response(JSON.stringify({ versions: ['v3'] }), { status: 200 }),
  });
  assert.equal(result.transport, 'http');
  assert.equal(result.wispStatus, 'not-configured');
  assert.match(result.notice, /HTTP only/);
});

test('does not report HTTP transport as ready when Bare v3 is unavailable', async () => {
  const mux = { async setTransport() { throw new Error('must not set a broken transport'); } };
  await assert.rejects(
    selectProxyTransport(mux, { wisp: null }, 'https://lounge.example/proxy', {
      fetcher: async () => new Response('{}', { status: 503 }),
    }),
    /HTTP 503/,
  );
});

test('blocks local, metadata and IPv4-mapped IPv6 proxy targets', () => {
  for (const value of ['127.0.0.1','10.0.0.1','169.254.169.254','192.168.1.1','172.16.0.1','::1','::ffff:127.0.0.1','fc00::1']) assert.equal(isPublicAddress(value),false,value);
  for(const value of ['http://localhost','http://127.0.0.1','http://[::1]','https://example.com:22','file:///etc/passwd']) assert.throws(()=>assertPublicTarget(new URL(value)),value);
  assert.doesNotThrow(()=>assertPublicTarget(new URL('https://example.com/path')));
});
test('waits for its own service worker activation, not another registration', async () => {
  class Worker extends EventTarget { state='installing'; }
  const worker=new Worker();const promise=waitForActivation({installing:worker} as unknown as ServiceWorkerRegistration,1000);
  setTimeout(()=>{worker.state='activated';worker.dispatchEvent(new Event('statechange'));},10);
  await promise;
});
test('service worker activation has a finite timeout', async () => {
  const worker=Object.assign(new EventTarget(),{state:'installing'});
  await assert.rejects(waitForActivation({installing:worker} as unknown as ServiceWorkerRegistration,10),/timed out/);
});
test('Bare adapter preserves long JSON headers, status and streamed bytes', async () => {
  const cookie='x'.repeat(19000);const headers=JSON.stringify({'set-cookie':cookie,'content-range':'bytes 0-5/20'});
  const handle=createBareHandler({async routeRequest(req,res){assert.equal(req.url,'/api/bare/v3/');res.writeHead(200,{'x-bare-status':'206','x-bare-headers':headers});res.write('abc');await new Promise(r=>setTimeout(r,5));res.end('def');}});
  const response=await handle(new Request('https://lounge.example/api/edu/v3'));
  assert.equal(response.status,200);assert.equal(response.headers.get('x-bare-status'),'206');assert.equal(response.headers.get('x-bare-headers'),headers);assert.equal(await response.text(),'abcdef');
});
test('Bare forwards request method, query, body and legitimate session headers unchanged', async () => {
  let received: { method?: string; url?: string; cookie?: string; authorization?: string; range?: string; body: string } | undefined;
  const handle = createBareHandler({ async routeRequest(req, res) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    received = {
      method: req.method, url: req.url, cookie: req.headers.cookie, authorization: req.headers.authorization,
      range: req.headers.range, body: Buffer.concat(chunks).toString('utf8'),
    };
    const headers = JSON.stringify({ 'set-cookie': 'fixture-session=abc; HttpOnly; Secure; SameSite=None' });
    res.writeHead(200, { 'x-bare-status': '201', 'x-bare-headers': headers });
    res.end('created');
  } });
  const response = await handle(new Request('https://lounge.example/api/bare/v3/items?from=proxy', {
    method: 'POST',
    headers: {
      origin: 'https://lounge.example', 'content-type': 'application/json',
      cookie: 'fixture-session=request-cookie', authorization: 'Bearer fixture-token', range: 'bytes=0-9',
    },
    body: JSON.stringify({ value: 'kept' }),
  }));
  assert.deepEqual(received, {
    method: 'POST', url: '/api/bare/v3/items?from=proxy', cookie: 'fixture-session=request-cookie',
    authorization: 'Bearer fixture-token', range: 'bytes=0-9', body: JSON.stringify({ value: 'kept' }),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-bare-status'), '201');
  assert.equal(JSON.parse(response.headers.get('x-bare-headers') || '{}')['set-cookie'], 'fixture-session=abc; HttpOnly; Secure; SameSite=None');
  assert.equal(await response.text(), 'created');
});

test('Bare preserves redirect status and Location in the Bare protocol envelope', async () => {
  const headers = JSON.stringify({ location: 'https://destination.example/next?step=2', 'cache-control': 'no-store' });
  const handle = createBareHandler({ async routeRequest(_req, res) {
    res.writeHead(200, { 'x-bare-status': '302', 'x-bare-status-text': 'Found', 'x-bare-headers': headers });
    res.end();
  } });
  const response = await handle(new Request('https://lounge.example/api/bare/v3/redirect'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-bare-status'), '302');
  assert.equal(JSON.parse(response.headers.get('x-bare-headers') || '{}').location, 'https://destination.example/next?step=2');
});

test('Bare OPTIONS preflight is answered locally without contacting the upstream server', async () => {
  let contacted = false;
  const handle = createBareHandler({ async routeRequest() { contacted = true; } });
  const response = await handle(new Request('https://lounge.example/api/bare/v3/resource', { method: 'OPTIONS' }));
  assert.equal(response.status, 204);
  assert.match(response.headers.get('access-control-allow-methods') || '', /PATCH/);
  assert.equal(contacted, false);
});

test('Bare adapter returns a bounded timeout as a valid Bare 504 response', async () => {
  const handle = createBareHandler({ async routeRequest() { await new Promise(resolve => setTimeout(resolve, 80)); } }, { requestTimeoutMs: 10 });
  const response = await handle(new Request('https://lounge.example/api/bare/v3/slow'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-bare-status'), '504');
  assert.match(await response.text(), /timed out/i);
});

test('Bare adapter streams the first response bytes before upstream completion', async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const handle = createBareHandler({ async routeRequest(_req, res) {
    res.writeHead(200);
    res.write('first-chunk');
    await gate;
    res.end('second-chunk');
  } });
  const response = await handle(new Request('https://lounge.example/api/bare/v3/stream'));
  const reader = response.body!.getReader();
  const first = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), 'first-chunk');
  release();
  let rest = '';
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    rest += new TextDecoder().decode(part.value);
  }
  assert.equal(rest, 'second-chunk');
});

for(const status of [204,205,304]) test(`Bare handles bodyless ${status}`, async()=>{
  const handle=createBareHandler({async routeRequest(req,res){res.writeHead(status);res.end();}});
  const response=await handle(new Request('https://lounge.example/api/bare/'));
  assert.equal(response.status,status);assert.equal(response.body,null);
});
test('Bare HEAD has no body and cross-origin misuse is rejected', async()=>{
  const handle=createBareHandler({async routeRequest(req,res){res.writeHead(200,{'x-test':'ok'});res.end('ignored');}});
  const response=await handle(new Request('https://lounge.example/api/bare/',{method:'HEAD'}));assert.equal(response.body,null);assert.equal(response.headers.get('x-test'),'ok');
  assert.equal((await handle(new Request('https://lounge.example/api/bare/',{headers:{origin:'https://other.example'}}))).status,403);
});
test('Bare encodes transport failures in v3 metadata, avoiding outer gateway HTML errors', async()=>{
  const handle=createBareHandler({async routeRequest(){throw new Error('private-token=fixture-secret');}});
  const response=await handle(new Request('https://lounge.example/api/bare/v3/'));
  const body=await response.text();
  assert.equal(response.status,200);
  assert.equal(response.headers.get('x-bare-status'),'502');
  assert.equal(response.headers.get('x-bare-status-text'),'Bad Gateway');
  assert.deepEqual(JSON.parse(response.headers.get('x-bare-headers') || '{}'),{
    'content-type':'text/plain; charset=utf-8','cache-control':'no-store',
  });
  assert.match(body,/proxy request failed/i);assert.doesNotMatch(body,/fixture-secret|private-token/);
});
