import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createProxyDiagnosticRecord,
  resolveProxyDiagnosticsEnabled,
  safeProxyErrorCode,
} from '../lib/proxy-diagnostics';

test('proxy diagnostics are automatic in development and opt-in in production', () => {
  assert.equal(resolveProxyDiagnosticsEnabled(false, '', null), true);
  assert.equal(resolveProxyDiagnosticsEnabled(true, '', null), false);
  assert.equal(resolveProxyDiagnosticsEnabled(true, '?proxyDebug=1', null), true);
  assert.equal(resolveProxyDiagnosticsEnabled(true, '', '1'), true);
  assert.equal(resolveProxyDiagnosticsEnabled(true, '?proxyDebug=0', '0'), false);
});

test('diagnostic records include safe status fields only, never URLs, headers, bodies or error messages', () => {
  const record = createProxyDiagnosticRecord('request.failed', {
    source: 'service-worker', outcome: 'failed', status: 502, method: 'POST', requestType: 'fetch',
    code: safeProxyErrorCode(new Error('private-token=fixture-secret')),
    ...({
      url: 'https://youtubei.googleapis.com/search?token=fixture-secret',
      headers: { cookie: 'session=fixture-secret' },
      body: 'fixture-secret',
      message: 'private-token=fixture-secret',
    } as object),
  } as any);
  assert.deepEqual(record, {
    source: 'service-worker', stage: 'request.failed', outcome: 'failed', status: 502,
    code: 'Error', method: 'POST', requestType: 'fetch',
  });
  assert.doesNotMatch(JSON.stringify(record), /fixture-secret|youtubei|cookie|headers/);
});

test('unrecognized exception names are reduced to Error', () => {
  assert.equal(safeProxyErrorCode({ name: 'PrivateToken=fixture-secret', message: 'secret' }), 'Error');
});
