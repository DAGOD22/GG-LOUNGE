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
  // Two shapes have to survive the rewrite:
  //   fetch("https://lbr.../router.php", {method:"POST", body})
  //   fetch(new Request("https://lbr.../router.php", {method:"POST", body}))
  // The second one used to lose its body (we passed the URL plus empty
  // options, so the upload went out as a bodiless GET and the server
  // rejected it), which is exactly what "Save upload failed" was.
  if (window.fetch) {
    var nativeFetch = window.fetch;
    window.fetch = function (input, init) {
      try {
        var url = typeof input === "string" ? input : (input && input.url) || "";
        if (isOfficial(url)) {
          if (typeof input === "string") {
            var opts = Object.assign({}, init || {});
            opts.credentials = "same-origin";
            delete opts.mode;
            return nativeFetch.call(window, relay(url), opts);
          }
          // Request object: rebuild it against the relay, keeping the body.
          var rebuilt = new Request(relay(url), input);
          return nativeFetch.call(window, rebuilt, init);
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

  // --- sendBeacon (used for some fire-and-forget save pings) -----------
  if (navigator.sendBeacon) {
    var nativeBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = function (url, data) {
      return nativeBeacon(isOfficial(url) ? relay(url) : url, data);
    };
  }

  // --- the game's health check reads a status code from a plain load ----
  window.ggLbrRelay = { isOfficial: isOfficial, relay: relay };
})();
