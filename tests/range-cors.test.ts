import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBareHandler } from '../lib/bare-adapter';

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

test('Bare answers CORS preflight without contacting upstream', async () => {
  let contacted = false;
  const handle = createBareHandler({ async routeRequest() { contacted = true; } });
  const response = await handle(new Request('https://lounge.example/api/bare/v3/', { method: 'OPTIONS', headers: {
    Origin: 'https://cdn.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range,content-type',
  }}));
  assert.equal(response.status, 204); assert.equal(contacted, false);
  assert.equal(response.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
  assert.equal(response.headers.get('access-control-allow-headers'), '*');
});
