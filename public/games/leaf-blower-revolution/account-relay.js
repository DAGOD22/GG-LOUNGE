/*
 * Leaf Blower Revolution — account-server relay (GG-Lounge).
 *
 * The game's own account dialog ("Sign in", "Register Account", cloud saves,
 * seasons) posts form data to its official account server and reads back JSON.
 * That server is sometimes unreachable from a browser in the lounge (blocked
 * host, CORS, school filtering), so this script rewrites those requests to
 * /api/lbr-account?url=<the same official URL>. The route forwards the request
 * unchanged to the official host — the same request the game would have made.
 *
 * Nothing is invented or simulated here: a failed sign-in is still a failed
 * sign-in, and the game shows its own error message from the real server.
 */
(function () {
  'use strict';

  var OFFICIAL = /^https?:\/\/([a-z0-9.-]*\.)?humblenorth\.de(:443)?\//i;
  var RELAY = '/api/lbr-account?url=';

  function isOfficial(url) {
    return typeof url === 'string' && OFFICIAL.test(url);
  }
  function relay(url) {
    return RELAY + encodeURIComponent(url);
  }

  // --- fetch -----------------------------------------------------------
  if (window.fetch) {
    var nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (isOfficial(url)) {
          var opts = Object.assign({}, init || {});
          // Keep the browser's own referrer/origin out of the relayed request;
          // the official server sees the same form body the game built.
          opts.credentials = 'same-origin';
          delete opts.mode;
          var target = url;
          if (typeof input !== 'string' && input && input.method && !opts.method) opts.method = input.method;
          return nativeFetch.call(window, relay(target), opts);
        }
      } catch (e) {}
      return nativeFetch.apply(window, arguments);
    };
  }

  // --- XMLHttpRequest --------------------------------------------------
  var nativeOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    var args = Array.prototype.slice.call(arguments);
    if (isOfficial(url)) args[1] = relay(url);
    return nativeOpen.apply(this, args);
  };

  // --- the game's health check reads a status code from a plain load ----
  window.ggLbrRelay = { isOfficial: isOfficial, relay: relay };
})();
