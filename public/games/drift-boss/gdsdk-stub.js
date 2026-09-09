/* Offline stub of the GameDistribution SDK (html5.api.gamedistribution.com).
 * Drift Boss (MarketJS) waits for the SDK's SDK_READY event before booting
 * and routes its ads through gdsdk.showAd(). The real SDK is unreachable
 * from schools/offline, so this stub reports "ready" instantly and resolves
 * every ad call immediately — the game plays with zero ads. */
(function () {
  var resolved = function () {
    return Promise.resolve();
  };
  window.gdsdk = {
    play: function () {},
    preloadAd: function () {
      return Promise.resolve();
    },
    showAd: function () {
      return Promise.resolve();
    },
    openConsole: function () {},
    showBanner: function () {
      return Promise.resolve();
    },
  };
  // Fire SDK_READY through the game's own event handler once it exists.
  var tries = 0;
  function fireReady() {
    tries++;
    try {
      if (window.GD_OPTIONS && typeof window.GD_OPTIONS.onEvent === "function") {
        window.GD_OPTIONS.onEvent({ name: "SDK_READY", message: "sdk ready (offline stub)" });
        return;
      }
    } catch (e) {}
    if (tries < 50) setTimeout(fireReady, 200);
    else if (typeof window.gameStart === "function") {
      try {
        window.gameStart();
      } catch (e) {}
    }
  }
  if (document.readyState === "complete") fireReady();
  else window.addEventListener("load", fireReady);
})();
