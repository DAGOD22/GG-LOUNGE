/* GG-LOUNGE offline stub: the real ads-v2.js calls Adinplay/Google ad endpoints.
   The game only needs these functions to exist; with no network the ad paths
   resolve immediately so gameplay is never blocked. */
(function (w) {
  function noop() {}
  var api = {
    showAd: function (cb) { if (typeof cb === 'function') setTimeout(function () { cb(); }, 0); },
    displayAd: noop,
    preloadAd: noop,
    requestAd: noop,
    showBanner: noop,
    hideBanner: noop,
    refreshAd: noop,
    initAds: noop,
    adsReady: true,
    adBlocked: false,
    isAdBlocked: function () { return false; }
  };
  w.adsbygoogle = w.adsbygoogle || { push: noop };
  for (var k in api) if (!(k in w)) w[k] = api[k];
})(window);
