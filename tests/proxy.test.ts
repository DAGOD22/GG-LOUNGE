import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProxyUrl, waitForActivation } from '../lib/proxy-client';
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
test('Bare returns a real error when upstream fails, never a blank 200', async()=>{
  const handle=createBareHandler({async routeRequest(){throw new Error('fail');}});
  const response=await handle(new Request('https://lounge.example/api/bare/v3/'));assert.equal(response.status,502);assert.match(await response.text(),/PROXY_ERROR/);
});
