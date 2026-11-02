import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBareHandler } from '../lib/bare-adapter';

test('Bare masks its own protocol stack details but preserves the failure status', async () => {
  const handle = createBareHandler({ async routeRequest(_req, res) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ code: 'UNKNOWN', message: 'private-token=fixture-secret', stack: 'fixture-secret stack' }));
  }});
  const response = await handle(new Request('https://lounge.example/api/bare/v3/'));
  const body = await response.text();
  assert.equal(response.status, 502);
  assert.match(body, /PROXY_ERROR/);
  assert.doesNotMatch(body, /fixture-secret|stack/);
});

test('Bare forwards Range and preserves a 206 response with Content-Range', async () => {
  let incomingRange = '';
  const handle = createBareHandler({ async routeRequest(req, res) {
    incomingRange = String(req.headers.range || '');
    res.writeHead(206, {
      'content-type': 'video/mp4',
      'content-range': 'bytes 100-199/1000',
      'accept-ranges': 'bytes',
      'content-length': '100',
    });
    res.end(Buffer.alloc(100, 7));
  }});
  const response = await handle(new Request('https://lounge.example/api/bare/v3/', { headers: {
    'x-bare-url': 'https://video.example/file.mp4', Range: 'bytes=100-199', Origin: 'https://lounge.example',
  }}));
  assert.equal(incomingRange, 'bytes=100-199');
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(response.headers.get('content-range'), 'bytes 100-199/1000');
  assert.equal(response.headers.get('accept-ranges'), 'bytes');
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(await response.arrayBuffer().then(x => x.byteLength), 100);
});

test('Bare forwards method, query, body and request headers; retains redirect and Set-Cookie metadata', async () => {
  const seen: Array<{ url: string; method: string; body: string; headers: Record<string, string> }> = [];
  const setCookies = [
    'session=fixture-session; Path=/; Secure; HttpOnly; SameSite=None',
    'csrf=fixture-csrf; Path=/; Secure; SameSite=None',
  ];
  const handle = createBareHandler({ async routeRequest(req, res) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    seen.push({ url: String(req.url), method: String(req.method), body: Buffer.concat(chunks).toString(), headers: req.headers as Record<string, string> });
    res.writeHead(200, {
      'x-bare-status': '302',
      'x-bare-status-text': 'Found',
      'x-bare-headers': JSON.stringify({
        location: 'https://login.example/continue?state=fixture-state',
        'set-cookie': setCookies,
        'content-type': 'text/plain',
        'content-length': '23',
      }),
    });
    res.end('redirect metadata');
  }});
  const response = await handle(new Request('https://lounge.example/api/bare/v3/redirect?next=%2Ffeed&debug=1', {
    method: 'PATCH',
    headers: {
      Origin: 'https://lounge.example',
      'Content-Type': 'application/json',
      Cookie: 'session=fixture-session; csrf=fixture-csrf',
      Authorization: 'Bearer fixture-authorization',
      'X-CSRF-Token': 'fixture-csrf',
      'X-Bare-Url': 'https://youtubei.googleapis.com/youtubei/v1/search?prettyPrint=false',
    },
    body: JSON.stringify({ query: 'cats', page: 2 }),
  }));

  assert.equal(seen[0].method, 'PATCH');
  assert.equal(seen[0].url, '/api/bare/v3/redirect?next=%2Ffeed&debug=1');
  assert.deepEqual(JSON.parse(seen[0].body), { query: 'cats', page: 2 });
  assert.equal(seen[0].headers.cookie, 'session=fixture-session; csrf=fixture-csrf');
  assert.equal(seen[0].headers.authorization, 'Bearer fixture-authorization');
  assert.equal(seen[0].headers['x-csrf-token'], 'fixture-csrf');
  assert.equal(seen[0].headers['x-bare-url'], 'https://youtubei.googleapis.com/youtubei/v1/search?prettyPrint=false');
  assert.equal(response.status, 200, 'Bare v3 carries the upstream status in its protocol header');
  assert.equal(response.headers.get('x-bare-status'), '302');
  assert.equal(response.headers.get('x-bare-status-text'), 'Found');
  const metadata = JSON.parse(response.headers.get('x-bare-headers') || '{}');
  assert.equal(metadata.location, 'https://login.example/continue?state=fixture-state');
  assert.deepEqual(metadata['set-cookie'], setCookies);
  assert.equal(await response.text(), 'redirect metadata');
});

test('Bare forwards an authentication cookie on the next request without logging it', async () => {
  const seenCookies: string[] = [];
  const handle = createBareHandler({ async routeRequest(req, res) {
    seenCookies.push(String(req.headers.cookie || ''));
    res.writeHead(200, { 'x-bare-status': '200', 'x-bare-headers': JSON.stringify({ 'content-type': 'application/json' }) });
    res.end('{"ok":true}');
  }});
  await handle(new Request('https://lounge.example/api/bare/v3/profile', { headers: { Cookie: 'session=fixture-session' } }));
  await handle(new Request('https://lounge.example/api/bare/v3/profile', { headers: { Cookie: 'session=fixture-session; csrf=fixture-csrf' } }));
  assert.deepEqual(seenCookies, ['session=fixture-session', 'session=fixture-session; csrf=fixture-csrf']);
});

test('Bare answers CORS preflight without contacting upstream', async () => {
  let contacted = false;
  const handle = createBareHandler({ async routeRequest() { contacted = true; } });
  const response = await handle(new Request('https://lounge.example/api/bare/v3/', { method: 'OPTIONS', headers: {
    Origin: 'https://cdn.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range,content-type',
  }}));
  assert.equal(response.status, 204); assert.equal(contacted, false);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
  assert.equal(response.headers.get('access-control-allow-headers'), '*');
});
