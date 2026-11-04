import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkProxyBackendTarget } from '../lib/proxy-health';
import { GET as getProxyDiagnostics } from '../app/api/proxy/diagnostics/route';

test('backend diagnostics probe only fixed HTTPS hosts and treat a response as network reachability', async () => {
  let requested = '';
  const result = await checkProxyBackendTarget('youtube', {
    lookup: async host => {
      assert.equal(host, 'www.youtube.com');
      return [{ address: '142.250.72.196', family: 4 }];
    },
    fetcher: async (input, init) => {
      requested = String(input);
      assert.equal(init?.method, 'GET');
      assert.equal(init?.redirect, 'manual');
      assert.ok(init?.signal);
      return new Response('discarded probe body', { status: 403 });
    },
  });
  assert.equal(requested, 'https://www.youtube.com/generate_204');
  assert.equal(result.target, 'youtube');
  assert.equal(result.dns.outcome, 'resolved');
  assert.equal(result.dns.addressCount, 1);
  assert.equal(result.http.outcome, 'connected');
  assert.equal(result.http.status, 403, 'HTTP denial still proves DNS and TLS reached the destination');
  assert.equal('addresses' in result.dns, false);
});

test('backend diagnostics report redirects without following or exposing their Location', async () => {
  const result = await checkProxyBackendTarget('youtube', {
    lookup: async () => [{ address: '142.250.72.196', family: 4 }],
    fetcher: async (_input, init) => {
      assert.equal(init?.redirect, 'manual');
      return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } });
    },
  });
  assert.equal(result.http.outcome, 'connected');
  assert.equal(result.http.status, 302);
  assert.doesNotMatch(JSON.stringify(result), /127\.0\.0\.1|private/);
});

test('empty DNS results are reported as resolution failures, not private-address blocks', async () => {
  const result = await checkProxyBackendTarget('tiktok', { lookup: async () => [] });
  assert.equal(result.dns.outcome, 'failed');
  assert.equal(result.dns.code, 'DNS_ERROR');
  assert.equal(result.http.outcome, 'skipped');
});

test('backend diagnostics block non-public DNS answers without making a request', async () => {
  let fetched = false;
  const result = await checkProxyBackendTarget('roblox', {
    lookup: async () => [{ address: '127.0.0.1', family: 4 }],
    fetcher: async () => { fetched = true; return new Response('unexpected'); },
  });
  assert.equal(result.dns.outcome, 'blocked');
  assert.equal(result.dns.code, 'PRIVATE_DNS_ANSWER');
  assert.equal(result.http.outcome, 'skipped');
  assert.equal(fetched, false);
});

test('backend diagnostics map DNS and TLS failures to safe codes without exception text', async () => {
  const dnsFailure = new Error('private host detail');
  Object.assign(dnsFailure, { code: 'ENOTFOUND' });
  const dns = await checkProxyBackendTarget('tiktok', { lookup: async () => { throw dnsFailure; } });
  assert.equal(dns.dns.code, 'DNS_ERROR');
  assert.equal(dns.http.outcome, 'skipped');
  assert.doesNotMatch(JSON.stringify(dns), /private host detail|ENOTFOUND/);

  const tlsFailure = Object.assign(new Error('private-token=fixture'), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } });
  const tls = await checkProxyBackendTarget('tiktok', {
    lookup: async () => [{ address: '23.52.10.1', family: 4 }],
    fetcher: async () => { throw tlsFailure; },
  });
  assert.equal(tls.dns.outcome, 'resolved');
  assert.equal(tls.http.code, 'TLS_ERROR');
  assert.doesNotMatch(JSON.stringify(tls), /private-token|UNABLE_TO_VERIFY/);

  const reset = await checkProxyBackendTarget('youtube', {
    lookup: async () => [{ address: '142.250.72.196', family: 4 }],
    fetcher: async () => { throw Object.assign(new Error('https://secret.example/'), { cause: { code: 'ECONNRESET' } }); },
  });
  assert.equal(reset.http.code, 'CONNECTION_RESET');
  assert.doesNotMatch(JSON.stringify(reset), /secret\.example|ECONNRESET/);
});

test('diagnostics API rejects arbitrary targets and prevents caching', async () => {
  const response = await getProxyDiagnostics(new Request('https://lounge.example/api/proxy/diagnostics?target=constructor'));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /supported proxy diagnostic targets/i);
});

test('backend diagnostics reject arbitrary and inherited object-property names', async () => {
  await assert.rejects(checkProxyBackendTarget('http://127.0.0.1'), /Unknown proxy health target/);
  await assert.rejects(checkProxyBackendTarget('constructor'), /Unknown proxy health target/);
  await assert.rejects(checkProxyBackendTarget('__proto__'), /Unknown proxy health target/);
});
