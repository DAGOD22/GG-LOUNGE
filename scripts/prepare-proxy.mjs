// Copy pinned, self-hosted runtime assets. No third-party CDNs in the browser.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { cp, mkdir, readdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const packages = {
  scramjet: '@mercuryworkshop/scramjet',
  baremux: '@mercuryworkshop/bare-mux',
  bare: '@mercuryworkshop/bare-as-module3',
  libcurl: '@mercuryworkshop/libcurl-transport',
};
for (const [name, pkg] of Object.entries(packages)) {
  let root = dirname(require.resolve(pkg));
  while (!root.endsWith(pkg.split('/').at(-1))) root = dirname(root);
  const dest = join('public', 'proxy-runtime', name);
  await mkdir(dest, { recursive: true });
  for (const file of await readdir(join(root, 'dist'))) {
    if (/\.(js|mjs|wasm)$/.test(file)) await cp(join(root, 'dist', file), join(dest, file));
  }
  for (const file of await readdir(root)) {
    if (/^(license|copying|notice)/i.test(file)) await cp(join(root, file), join(dest, file));
  }
}
console.log('Prepared pinned Scramjet, BareMux, HTTP and Wisp transports.');
// All Flash entries share one complete, pinned Ruffle distribution (JS + WASM).
const ruffle = dirname(require.resolve('@ruffle-rs/ruffle'));
await mkdir('public/game-runtime/ruffle', { recursive: true });
for (const file of await readdir(ruffle)) {
  if (/\.(js|wasm)$/.test(file) || /^LICENSE/.test(file)) await cp(join(ruffle, file), join('public/game-runtime/ruffle', file));
}
console.log('Prepared shared Ruffle runtime with matching WASM engines.');
