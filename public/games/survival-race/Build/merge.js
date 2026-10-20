/* Survival Race — split WebAssembly reassembly.
 *
 * The build's wasm payload is stored as two files (a hosting limit on very large
 * single files): yandexBrotli.wasm.unityweb.part1 / .part2. This fetches the
 * parts in order, concatenates them into one binary and hands back a blob: URL
 * that the Unity loader can use as `codeUrl`.
 *
 * The blob is created with the application/wasm MIME type so the loader can use
 * WebAssembly.instantiateStreaming (it falls back to array-buffer compilation
 * where streaming is unavailable).
 *
 * The result is cached per load: calling GGMergeWasm() twice returns the same URL.
 */
(function () {
  'use strict';
  var cache = Object.create(null);

  function fetchPart(url) {
    return fetch(url, { credentials: 'same-origin', cache: 'force-cache' }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' while loading ' + url);
      return res.arrayBuffer();
    });
  }

  function merge(basePath, parts) {
    var key = basePath + '|' + parts;
    if (cache[key]) return Promise.resolve(cache[key]);

    var jobs = [];
    for (var i = 1; i <= parts; i++) jobs.push(fetchPart(basePath + '.part' + i));

    return Promise.all(jobs).then(function (buffers) {
      var total = 0, i;
      for (i = 0; i < buffers.length; i++) total += buffers[i].byteLength;
      if (!total) throw new Error('The game files are empty. Re-download the lounge game assets.');

      var merged = new Uint8Array(total);
      var offset = 0;
      for (i = 0; i < buffers.length; i++) {
        merged.set(new Uint8Array(buffers[i]), offset);
        offset += buffers[i].byteLength;
      }
      var url = URL.createObjectURL(new Blob([merged], { type: 'application/wasm' }));
      cache[key] = url;
      return url;
    });
  }

  window.GGMergeWasm = function (basePath, parts) {
    return merge(basePath || 'Build/yandexBrotli.wasm.unityweb', parts || 2);
  };
})();
