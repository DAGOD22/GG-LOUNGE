/* Offline stub of the Poki SDK (poki-sdk.js) for the GG-Lounge.
 * The real SDK phones home to poki.com (blocked at schools and offline),
 * so every call below is an instant no-op: ads "complete" immediately and
 * the game runs as if the player is a normal web visitor. */
(function () {
  var ok = function () {
    return Promise.resolve();
  };
  window.PokiSDK = {
    init: ok,
    gameLoadingStart: function () {},
    gameLoadingFinished: function () {},
    gameplayStart: function () {},
    gameplayStop: function () {},
    happyTime: function () {},
    setDebug: function () {},
    setDebugTouchOverlayController: function () {},
    setPlaytestCanvas: function () {},
    captureError: function () {},
    getURLParam: function () {
      return "";
    },
    getLanguage: function () {
      return (navigator.language || "en").slice(0, 2);
    },
    isAdBlocked: function () {
      return true;
    },
    shareableURL: function () {
      return Promise.resolve(window.location.href);
    },
    commercialBreak: function (cb) {
      if (typeof cb === "function") {
        try {
          cb();
        } catch (e) {}
      }
      return Promise.resolve();
    },
    rewardedBreak: function (cb) {
      if (typeof cb === "function") {
        try {
          cb(true);
        } catch (e) {}
      }
      return Promise.resolve(true);
    },
  };
})();
