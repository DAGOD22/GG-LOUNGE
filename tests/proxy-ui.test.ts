import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('app/globals.css', 'utf8');
const page = readFileSync('app/proxy/page.tsx', 'utf8');

test('proxy address input uses readable foreground text and a visible focus treatment', () => {
  assert.match(page, /aria-label="Website address or search"/);
  assert.match(css, /\.proxy-form input\s*\{[^}]*color:\s*#f4f2ec;[^}]*caret-color:\s*var\(--lime\)/);
  assert.match(css, /\.proxy-form:focus-within\s*\{[^}]*box-shadow:/);
  assert.match(css, /\[data-theme="light"\] \.proxy-form input\s*\{[^}]*color:\s*#111118/);
});
