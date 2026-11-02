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
  assert.match(result.notice, /HTTP fallback/);
  assert.equal(configured[0].path, '/proxy-runtime/bare/index.mjs');
  assert.deepEqual(configured[0].options, ['http://lounge.example/api/bare/']);
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
test('Bare returns a real error when upstream fails without reflecting exception details', async()=>{
  const handle=createBareHandler({async routeRequest(){throw new Error('private-token=fixture-secret');}});
  const response=await handle(new Request('https://lounge.example/api/bare/v3/'));
  const body=await response.text();
  assert.equal(response.status,502);assert.match(body,/PROXY_ERROR/);assert.doesNotMatch(body,/fixture-secret|private-token/);
});
