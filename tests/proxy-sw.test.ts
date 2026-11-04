import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

const workerSource = readFileSync('public/proxy/sw.js', 'utf8');

test('service-worker failures return a sanitized 502 and privacy-safe diagnostics', async () => {
  const listeners = new Map<string, (event: any) => void>();
  const consoleRecords: unknown[] = [];
  const sandbox: Record<string, any> = {
    URL, Request, Response, Headers, Uint8Array, Promise,
    console: { info: (...values: unknown[]) => consoleRecords.push(values), warn() {}, error() {} },
    importScripts() {},
    $scramjetLoadWorker: () => ({
      ScramjetServiceWorker: class {
        async loadConfig() { throw new Error('private-token=fixture-secret'); }
        route() { return true; }
        async fetch() { return new Response('unexpected'); }
      },
    }),
    clients: { async matchAll() { return []; }, async claim() {} },
    skipWaiting: async () => {},
    location: new URL('https://lounge.example/proxy/sw.js'),
    addEventListener(name: string, callback: (event: any) => void) { listeners.set(name, callback); },
  };
  sandbox.self = sandbox;
  const context = createContext(sandbox);
  runInContext(workerSource, context);

  listeners.get('message')?.({ data: { ggLounge: 'diagnostics', enabled: true, transport: 'http' } });
  const responsePromise = new Promise<Response>(resolve => {
    listeners.get('fetch')?.({
      request: new Request('https://lounge.example/browse/https%3A%2F%2Fexample.com%2F%3Ftoken%3Dfixture-secret'),
      respondWith(value: Promise<Response>) { resolve(value); },
    });
  });
  const response = await responsePromise;
  const body = await response.text();
  assert.equal(response.status, 502);
  assert.match(body, /Proxy connection failed/);
  assert.doesNotMatch(body, /fixture-secret|private-token|example\.com/);
  assert.doesNotMatch(JSON.stringify(consoleRecords), /fixture-secret|private-token|example\.com/);
  assert.match(JSON.stringify(consoleRecords), /request\.failed/);
});

test('service worker replaces Scramjet JSON parse pages with a sanitized proxy diagnostic', async () => {
  const listeners = new Map<string, (event: any) => void>();
  const consoleRecords: unknown[] = [];
  const sandbox: Record<string, any> = {
    URL, Request, Response, Headers, Uint8Array, TextDecoder, Promise,
    console: { info: (...values: unknown[]) => consoleRecords.push(values), warn() {}, error() {} },
    importScripts() {},
    $scramjetLoadWorker: () => ({
      ScramjetServiceWorker: class {
        async loadConfig() {}
        route() { return true; }
        async fetch() {
          return new Response(
            '<!doctype html><textarea id="errorTrace">Unexpected token &lt;, token=fixture-secret</textarea><b id="fetchedURL">https://youtube.example/</b>',
            { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          );
        }
      },
    }),
    clients: { async matchAll() { return []; }, async claim() {} },
    skipWaiting: async () => {},
    location: new URL('https://lounge.example/proxy/sw.js'),
    addEventListener(name: string, callback: (event: any) => void) { listeners.set(name, callback); },
  };
  sandbox.self = sandbox;
  runInContext(workerSource, createContext(sandbox));
  listeners.get('message')?.({ data: { ggLounge: 'diagnostics', enabled: true, transport: 'http' } });
  const responsePromise = new Promise<Response>(resolve => {
    listeners.get('fetch')?.({
      request: new Request('https://lounge.example/browse/https%3A%2F%2Fyoutube.example%2F'),
      respondWith(value: Promise<Response>) { resolve(value); },
    });
  });
  const response = await responsePromise;
  const body = await response.text();
  assert.equal(response.status, 502);
  assert.match(body, /Proxy connection failed/);
  assert.doesNotMatch(body, /errorTrace|Unexpected token|fixture-secret|youtube\.example/);
  assert.doesNotMatch(JSON.stringify(consoleRecords), /fixture-secret|youtube\.example/);
  assert.match(JSON.stringify(consoleRecords), /request\.failed/);
});
