/* GG-Lounge ad blocker.
 *
 * Loaded by the proxy service worker (public/proxy/sw.js) via importScripts.
 * It inspects the *real* destination of every proxied request — Scramjet encodes
 * the target URL with encodeURIComponent after the /browse/ prefix — and drops
 * requests to advertising, analytics and tracking endpoints before they leave
 * the browser. It also injects cosmetic CSS into proxied HTML so the empty boxes
 * left behind by blocked ads are collapsed.
 *
 * Scope: everything that goes through the proxy — the proxy page itself, Apps,
 * and remote games such as Monkeytype. Locally hosted games ship no ad network
 * calls (their ad SDK hooks are no-ops), so there is nothing to strip there.
 *
 * State lives in a cookie so it survives service-worker restarts; the page also
 * pushes updates with postMessage for instant effect.
 */
(function (self) {
  'use strict';

  var COOKIE = 'ggl_adblock';
  var PREFIX = '/browse/';

  // ---------------------------------------------------------------- domains
  // Hostnames (or hostname suffixes) that exist to serve ads, analytics,
  // telemetry or tracking.
  var HOSTS = [
    // Google advertising / analytics
    'doubleclick.net', 'googleadservices.com', 'googlesyndication.com', 'googletagmanager.com',
    'googletagservices.com', 'google-analytics.com', 'googleadsserving.cn', '2mdn.net',
    'adservice.google.com', 'pagead2.googlesyndication.com', 'tpc.googlesyndication.com',
    'www-googleadservices-com', 'ad.doubleclick.net', 'stats.g.doubleclick.net',
    'googleads.g.doubleclick.net', 'ade.googlesyndication.com', 'adservice.google.com.au',
    // Amazon / Microsoft / Yahoo / Verizon
    'amazon-adsystem.com', 'assoc-amazon.com', 'adnxs.com', 'adsrvr.org', 'advertising.com',
    'adap.tv', 'bing.com/ads', 'bat.bing.com', 'admarketplace.net', 'yahoo.com/ads',
    'oath.com', 'aol.com/ads', 'ads.yahoo.com', 'analytics.yahoo.com',
    // Social pixels / SDK
    'connect.facebook.net', 'facebook.com/tr', 'staticxx.facebook.com', 'analytics.tiktok.com',
    'ads.tiktok.com', 'snap.licdn.com', 'px.ads.linkedin.com', 'analytics.pinterest.com',
    'ads.pinterest.com', 'static.ads-twitter.com', 'analytics.twitter.com', 't.co/i/adsct',
    'redditstatic.com', 'ads.reddit.com',
    // Ad networks / exchanges
    'criteo.com', 'criteo.net', 'taboola.com', 'outbrain.com', 'pubmatic.com',
    'rubiconproject.com', 'openx.net', 'openx.com', 'yieldmo.com', 'sovrn.com',
    'sharethrough.com', 'moatads.com', 'moatpixel.com', 'casalemedia.com', 'lijit.com',
    'sonobi.com', 'indexww.com', 'adform.net', 'adform.com', 'smartadserver.com',
    'adyoulike.com', 'teads.tv', 'triplelift.com', 'undertone.com', 'zemanta.com',
    'mgid.com', 'revcontent.com', 'zergnet.com', 'nativo.com', 'bidtellect.com',
    'genesis-media.com', 'gumgum.com', 'imedia.cz', 'adsafeprotected.com', 'integralads.com',
    // Pop-under / aggressive networks (common on game portals)
    'popads.net', 'popunder.net', 'propellerads.com', 'onclickads.net', 'adcash.com',
    'exoclick.com', 'hilltopads.com', 'adsterra.com', 'trafficjunky.net', 'juicyads.com',
    'ero-advertising.com', 'clickadu.com', 'richaudience.com', 'adnami.io',
    'ad-maven.com', 'adtraf.com', 'clickaine.com', 'href.li', 'adf.ly', 'adfoc.us',
    // Measurement / analytics
    'scorecardresearch.com', 'quantserve.com', 'hotjar.com', 'mixpanel.com',
    'segment.com', 'segment.io', 'amplitude.com', 'mouseflow.com', 'fullstory.com',
    'clarity.ms', 'analytics.google.com', 'newrelic.com', 'nr-data.net', 'sentry.io',
    'bugsnag.com', 'rollbar.com', 'datadoghq.com', 'chartbeat.com', 'parsely.com',
    'krxd.net', 'demdex.net', 'everesttech.net', 'omtrdc.net', 'adobedtm.com',
    'omniture.com', '2o7.net', 'ensighten.com', 'boostify.com', 'bounceexchange.com',
    'cookielaw.org', 'onetrust.com', 'trustarc.com', 'quantcast.com', 'bauhinia.com',
  ];

  // Path fragments that mark an ad or telemetry endpoint on any host.
  var PATH_PATTERNS = [
    /\/pagead\//i, /\/pagead2?\//i, /\/ads?\?/i, /\/adserv(?:er|ice)/i, /\/adsystem/i,
    /\/doubleclick/i, /\/googleads/i, /\/adx\//i, /\/adsense/i, /\/banner/i,
    /\/prebid/i, /\/ad[Ss]lot/i, /\/ad-?unit/i, /\/pop(?:under|-?up)(?:\.js|\/|$)/i,
    /\/analytics?\.(?:js|min\.js)/i, /\/gtag\/js/i, /\/gtm\.js/i, /\/tagmanager/i,
    /\/collect\?(?:.*)?(?:tid|v)=/i, /\/track(?:ing|er)?(?:\.js|\/|$)/i, /\/pixel(?:\.js|\/|$)/i,
    /\/beacon(?:\.js|\/|$)/i, /\/telemetry/i, /\/log\?event=/i, /\/ads\.txt$/i,
    /\/__utm\.gif/i, /\/urchin\.js/i, /\/ga\.js$/i, /\/fbevents\.js/i,
    /\/conversion\.js/i, /\/sponsor(?:ed)?\//i, /\/advert(?:ising|isement)/i,
  ];

  // Query-string markers.
  var QUERY_PATTERNS = [/[?&](?:utm_|gclid|fbclid|msclkid|igshid)=/i];

  // Element selectors hidden by the cosmetic layer.
  var COSMETIC_SELECTORS = [
    '[id*="google_ads"]', '[id*="ad-slot"]', '[id*="adslot"]', '[class*="ad-container"]',
    '[class*="adsbygoogle"]', '[id*="div-gpt-ad"]', '[data-ad-slot]', '[data-ad-client]',
    'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
    'iframe[src*="adnxs"]', 'iframe[src*="popads"]', 'iframe[src*="propellerads"]',
    'iframe[src*="adsterra"]', 'iframe[src*="exoclick"]',
    '[class*="ad-banner"]', '[class*="advert"]', '[id*="taboola"]', '[id*="outbrain"]',
    '.ad', '.ads', '.adsbox', '.ad-placement', '.ad-wrapper', '.sponsored-content',
    '#ad-container', '#ads', '#advertisement', '.gpt-ad', '.ad-slot', '.adbox',
  ].join(',');

  var hostSet = Object.create(null);
  for (var i = 0; i < HOSTS.length; i++) hostSet[HOSTS[i].replace(/^\./, '')] = true;

  // ------------------------------------------------------------- url helpers
  function decodeTarget(url) {
    try {
      var u = new URL(url);
      if (u.pathname.indexOf(PREFIX) !== 0) return null;
      return decodeURIComponent(u.pathname.slice(PREFIX.length) + u.search);
    } catch (e) {
      return null;
    }
  }

  function hostMatches(host) {
    if (!host) return false;
    host = host.toLowerCase();
    if (hostSet[host]) return true;
    var parts = host.split('.');
    for (var i = 0; i < parts.length - 1; i++) {
      var candidate = parts.slice(i).join('.');
      if (hostSet[candidate]) return true;
    }
    // bare ad-hostname heuristics
    return /(^|\.)(ads?|adsystem|adserver|adnetwork|adservice|advert|analytics|tracking|telemetry|stats|metrics)\d*\./.test(host)
      && !/^www\.(google|bing|youtube)\./.test(host);
  }

  function isAdTarget(target) {
    if (!target) return false;
    var host = '';
    var path = '';
    try {
      var u = new URL(target);
      host = u.hostname;
      path = u.pathname + u.search;
    } catch (e) {
      host = target;
      path = target;
    }
    if (hostMatches(host)) return true;
    for (var i = 0; i < PATH_PATTERNS.length; i++) if (PATH_PATTERNS[i].test(path)) return true;
    for (var j = 0; j < QUERY_PATTERNS.length; j++) if (QUERY_PATTERNS[j].test(path)) return true;
    return false;
  }

  // ------------------------------------------------------------- responses
  var TRANSPARENT_GIF = Uint8Array.from(
    atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
    function (c) { return c.charCodeAt(0); }
  );

  function emptyResponse(request) {
    var dest = request.destination || '';
    var headers = { 'Cache-Control': 'no-store', 'X-GG-Lounge': 'blocked-by-adblock' };
    if (dest === 'image') {
      headers['Content-Type'] = 'image/gif';
      return new Response(TRANSPARENT_GIF, { status: 200, headers: headers });
    }
    if (dest === 'script') {
      headers['Content-Type'] = 'application/javascript';
      return new Response('/* blocked by GG-Lounge ad blocker */', { status: 200, headers: headers });
    }
    if (dest === 'style') {
      headers['Content-Type'] = 'text/css';
      return new Response('/* blocked by GG-Lounge ad blocker */', { status: 200, headers: headers });
    }
    if (dest === 'font' || dest === 'video' || dest === 'audio') {
      return new Response(null, { status: 204, headers: headers });
    }
    headers['Content-Type'] = 'application/json';
    return new Response('{}', { status: 200, headers: headers });
  }

  // ------------------------------------------------------ cosmetic injection
  function cosmeticCss() {
    return COSMETIC_SELECTORS + '{display:none !important;visibility:hidden !important;height:0 !important;width:0 !important;overflow:hidden !important;}\n';
  }

  var COUNTER_NAME = '__ggAdblock';
  function cleanupScript() {
    return '(function(){' +
      'var S=' + JSON.stringify(COSMETIC_SELECTORS) + ';' +
      'function sweep(){try{var n=document.querySelectorAll(S);for(var i=0;i<n.length;i++){n[i].style.setProperty("display","none","important");}}catch(e){}}' +
      'sweep();' +
      'if(window.MutationObserver){var t=null;new MutationObserver(function(){if(t)clearTimeout(t);t=setTimeout(sweep,250)}).observe(document.documentElement,{childList:true,subtree:true});}' +
      '})();';
  }

  /** Injects the cosmetic layer into an HTML document string. */
  function injectHtml(html) {
    var style = '<style data-gg-adblock="1">' + cosmeticCss() + '</style>';
    var script = '<script data-gg-adblock="1">' + cleanupScript() + '<\/script>';
    if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, style + script + '</head>');
    if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, '<html$1><head>' + style + script + '</head>');
    return style + script + html;
  }

  // ------------------------------------------------------------------ state
  var enabledCache = null;

  function readCookie() {
    try {
      var match = /(?:^|;\s*)ggl_adblock=([^;]*)/.exec(self.document ? self.document.cookie : '');
      if (match) return match[1] === '1';
    } catch (e) {}
    return null;
  }

  /** Synchronous best-effort read. Message pushes and the cookie fill this in. */
  function enabled() {
    if (enabledCache !== null) return enabledCache;
    var fromCookie = readCookie();
    if (fromCookie !== null) { enabledCache = fromCookie; return enabledCache; }
    // Try the Cookie Store API where it is exposed to service workers.
    if (self.cookieStore && self.cookieStore.get) {
      self.cookieStore.get(COOKIE).then(function (c) {
        enabledCache = !!(c && c.value === '1');
      }).catch(function () {});
    }
    return false;
  }

  function setEnabled(value) {
    enabledCache = !!value;
    try {
      if (self.cookieStore && self.cookieStore.set) {
        self.cookieStore.set({ name: COOKIE, value: value ? '1' : '0', path: '/', sameSite: 'lax' });
      }
    } catch (e) {}
  }

  self.GGAdblock = {
    COOKIE: COOKIE,
    hostCount: HOSTS.length,
    decodeTarget: decodeTarget,
    isAdTarget: isAdTarget,
    isAd: function (requestUrl) { return isAdTarget(decodeTarget(requestUrl)); },
    emptyResponse: emptyResponse,
    injectHtml: injectHtml,
    cosmeticCss: cosmeticCss,
    enabled: enabled,
    setEnabled: setEnabled,
  };
})(self);
