importScripts("/uv/uv.bundle.js");
importScripts("/uv/uv.config.js");
try { if (typeof userKey === "undefined") var userKey = "default"; } catch(e) { var userKey = "default"; }
class UVServiceWorker extends EventEmitter {
  constructor(e = __uv$config) {
    super(),
      e.bare || (e.bare = "/ca/"),
      (this.addresses =
        "string" == typeof e.bare
          ? [new URL(e.bare, location)]
          : e.bare.map(e => new URL(e, location))),
      (this.headers = {
        csp: [
          "cross-origin-embedder-policy",
          "cross-origin-opener-policy",
          "cross-origin-resource-policy",
          "content-security-policy",
          "content-security-policy-report-only",
          "expect-ct",
          "feature-policy",
          "origin-isolation",
          "strict-transport-security",
          "upgrade-insecure-requests",
          "x-content-type-options",
          "x-download-options",
          "x-frame-options",
          "x-permitted-cross-domain-policies",
          "x-powered-by",
          "x-xss-protection",
        ],
        // Forward everything that carries identity or content negotiation.
        // The .io clients, CrazyGames, Poki and now.gg all authenticate with
        // bespoke headers; an allowlist that drops them produces a page that
        // loads and then immediately reports "no internet".
        forward: ["connection", "content-length", "accept", "accept-language", "range", "if-range", "if-none-match", "if-modified-since", "referer", "origin", "cache-control", "pragma", "sec-fetch-mode", "sec-fetch-dest", "sec-fetch-site", "sec-fetch-user", "authorization", "x-client-data", "x-goog-visitor-id", "x-goog-authuser", "x-goog-page-cl", "x-goog-page-label", "x-youtube-client-name", "x-youtube-client-version", "x-youtube-page-cl", "x-youtube-page-label", "x-youtube-utc-offset", "x-youtube-time-zone", "x-youtube-ad-signals", "x-origin", "x-referer", "x-requested-with", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform", "sec-ch-ua-arch", "sec-ch-ua-model", "sec-ch-ua-full-version-list", "sec-ch-ua-wow64"],
      }),
      (this.method = { empty: ["GET", "HEAD"] }),
      (this.statusCode = { empty: [204, 304] }),
      (this.config = e),
      (this.browser = Ultraviolet.Bowser.getParser(
        self.navigator.userAgent,
      ).getBrowserName()),
      this.headers.forward.push("user-agent"),
      this.headers.forward.push("content-type"),
      this.headers.forward.push("cookie");
  }
  async fetch({ request: e }) {
    const __prefix = this.config.prefix || "/service/";
    const __isProxied = e.url.startsWith(location.origin + __prefix);
    if (!__isProxied) {
      try {
        let __ref = e.referrer || "";
        try { const __rh = e.headers && typeof e.headers.get==="function" ? e.headers.get("referer") : null; if (!__ref && __rh) __ref = __rh; } catch(e2){}
        if (__ref && __ref.startsWith(location.origin + __prefix)) {
          const __tmp = new Ultraviolet(this.config);
          if (typeof this.config.construct === "function") try { this.config.construct(__tmp, "service"); } catch(e2){}
          let __src = "";
          try { __src = __tmp.sourceUrl(__ref); } catch(e2){}
          if (__src) {
            const __proxiedOrigin = new URL(__src).origin;
            const __reqUrl = new URL(e.url);
            // Everything a proxied document asks its own origin for has to be
            // proxied back to that origin — static assets *and* its API. The
            // old check skipped /api/, so every session/game-state call landed
            // on GG-LOUNGE itself, 404'd, and the client showed a network error.
            // Only prefixes that can *only* be ours. Everything else — including
            // "/" and "/api/…" — belongs to the destination, because .io clients
            // and portals (Next-based ones especially) use those paths for their
            // own auth and state. Some of them call /api/auth; serving our auth
            // there is both a broken page and a security problem.
            const __ownRoute = /^\/(uv|wisp|service|app-frames)\/|^\/api\/bare(\/|$)/.test(__reqUrl.pathname);
            if (!__ownRoute) {
              const __target = new URL(__reqUrl.pathname + __reqUrl.search + __reqUrl.hash, __proxiedOrigin).href;
              const __enc = __tmp.encodeUrl(__target);
              // Preserve the body: POSTs to a game's API are how sessions and
              // lobby joins work. Dropping it silently logged everyone out.
              let __body = null;
              try { if (e.method !== "GET" && e.method !== "HEAD") __body = await e.clone().arrayBuffer(); } catch (__e2) {}
              const __synthetic = new Request(location.origin + __prefix + __enc, { method: e.method, headers: e.headers, redirect: e.redirect, body: __body });
              return this.fetch({ request: __synthetic });
            }
          }
        }
      } catch(__e){}
      return fetch(e);
    }
    try {
      const t = new Ultraviolet(this.config);
      "function" == typeof this.config.construct &&
        this.config.construct(t, "service");
      const r = await t.cookie.db();
      (t.meta.origin = location.origin),
        (t.meta.base = t.meta.url = new URL(t.sourceUrl(e.url)));
      const n = new RequestContext(
        e,
        this,
        t,
        this.method.empty.includes(e.method.toUpperCase()) ? null : await e.blob(),
      );
      if (
        ("blob:" === t.meta.url.protocol &&
          ((n.blob = !0), (n.base = n.url = new URL(n.url.pathname))),
        e.referrer && e.referrer.startsWith(location.origin))
      ) {
        const r = new URL(t.sourceUrl(e.referrer));
        (n.headers.origin ||
          (t.meta.url.origin !== r.origin && "cors" === e.mode)) &&
          (n.headers.origin = r.origin),
          (n.headers.referer = r.href);
      }
      const s = (await t.cookie.getCookies(r)) || [],
        i = t.cookie.serialize(s, t.meta, !1);
      "Firefox" === this.browser &&
        "iframe" !== e.destination &&
        "document" !== e.destination &&
        n.forward.shift(),
        i && (n.headers.cookie = i),
        (n.headers.Host = n.url.host);
      const o = new HookEvent(n, null, null);
      if ((this.emit("request", o), o.intercepted)) return o.returnValue;
      const a = await fetch(n.send);
      if (500 === a.status) {
        // Do not reject — a rejected fetch inside the SW looks like a dead
        // network to the page. Hand back an honest, readable error instead.
        return new Response(
          "<!doctype html><meta charset=utf-8><title>Proxy connection failed</title>" +
          "<body style=\"font:14px system-ui;background:#12131a;color:#e6e6ef;padding:40px\">" +
          "<h1 style=\"font-size:18px\">Upstream did not answer</h1>" +
          "<p>The destination server refused or timed out. This is the site, not your connection — retry, or open it directly.</p></body>",
          { status: 502, headers: { "content-type": "text/html; charset=utf-8" } },
        );
      }
      const c = new ResponseContext(n, a, this),
        u = new HookEvent(c, null, null);
      if ((this.emit("beforemod", u), u.intercepted)) return u.returnValue;
      for (const e of this.headers.csp) c.headers[e] && delete c.headers[e];
      if (
        (c.headers.location &&
          (c.headers.location = t.rewriteUrl(c.headers.location)),
        c.headers["set-cookie"] &&
          (Promise.resolve(
            t.cookie.setCookies(c.headers["set-cookie"], r, t.meta),
          ).then(() => {
            self.clients.matchAll().then(function (e) {
              e.forEach(function (e) {
                e.postMessage({ msg: "updateCookies", url: t.meta.url.href });
              });
            });
          }),
          delete c.headers["set-cookie"]),
        c.body)
      )
        switch (e.destination) {
          case "script":
          case "worker":
            (c.body = `if (!self.__uv && self.importScripts) importScripts('${__uv$config.bundle}', '${__uv$config.config}', '${__uv$config.handler}');\n`),
              (c.body += t.js.rewrite(await a.text()));
            break;
          case "style":
            c.body = t.rewriteCSS(await a.text());
            break;
          case "iframe":
          case "document":
            isHtml(t.meta.url, c.headers["content-type"] || "") &&
              (c.body = t.rewriteHtml(await a.text(), {
                document: !0,
                injectHead: t.createHtmlInject(
                  this.config.handler,
                  this.config.bundle,
                  this.config.config,
                  t.cookie.serialize(s, t.meta, !0),
                  e.referrer,
                ),
              }));
        }
        // Fix YouTube search/watch + googlevideo + now.gg JSON not being rewritten (e.destination is "" for fetch)
        // These API responses contain https://...googlevideo.com / youtube.com URLs that must be proxied or video/search breaks
        if (c.body != null && !["script","worker","style","document","iframe"].includes(e.destination)) {
          const __ct = (c.headers["content-type"] || "").toLowerCase();
          const __isJson = __ct.includes("application/json") || __ct.includes("text/json") || __ct.includes("application/vnd.youtube");
          if (__isJson) {
            try {
              const __txt = await a.text();
              // Only rewrite heavy hosts — avoid rewriting every JSON blindly
              if (/(googlevideo\.com|youtube\.com|ytimg\.com|ggpht\.com|now\.gg|discord\.com|cloudmoon)/i.test(__txt)) {
                c.body = __txt.replace(/https?:\/\/[^"'\s,\\<]+/g, (u) => {
                  try {
                    // Strip trailing punctuation that regex may have captured
                    let __clean = u.replace(/[),]+$/,"");
                    if (/^(https?:\/\/(?:[^\/]+\.)?(?:googlevideo\.com|youtube\.com|ytimg\.com|ggpht\.com|now\.gg|discord\.com|cloudmoonapp\.com|tiktok\.com|twitch\.tv|reddit\.com|spotify\.com))/i.test(__clean)) {
                      return t.rewriteUrl(__clean) + u.slice(__clean.length);
                    }
                    return u;
                  } catch { return u; }
                });
              } else {
                c.body = __txt;
              }
            } catch {}
          }
        }
      return (
        "text/event-stream" === n.headers.accept &&
          (c.headers["content-type"] = "text/event-stream"),
        this.emit("response", u),
        u.intercepted
          ? u.returnValue
          : new Response(c.body, {
              headers: c.headers,
              status: c.status,
              statusText: c.statusText,
            })
      );
    } catch (e) {
      return new Response(e.toString(), { status: 500 });
    }
  }
  getBarerResponse(e) {
    const t = {},
      r = JSON.parse(e.headers.get("x-bare-headers"));
    for (const e in r) t[e.toLowerCase()] = r[e];
    return {
      headers: t,
      status: +e.headers.get("x-bare-status"),
      statusText: e.headers.get("x-bare-status-text"),
      body: this.statusCode.empty.includes(+e.headers.get("x-bare-status"))
        ? null
        : e.body,
    };
  }
  get address() {
    return this.addresses[Math.floor(Math.random() * this.addresses.length)];
  }
  static Ultraviolet = Ultraviolet;
}
self.UVServiceWorker = UVServiceWorker;
class ResponseContext {
  constructor(e, t, r) {
    const {
      headers: n,
      status: s,
      statusText: i,
      body: o,
    } = e.blob
      ? {
          status: t.status,
          statusText: t.statusText,
          headers: Object.fromEntries([...t.headers.entries()]),
          body: t.body,
        }
      : r.getBarerResponse(t);
    (this.request = e),
      (this.raw = t),
      (this.ultraviolet = e.ultraviolet),
      (this.headers = n),
      (this.status = s),
      (this.statusText = i),
      (this.body = o);
  }
  get url() {
    return this.request.url;
  }
  get base() {
    return this.request.base;
  }
  set base(e) {
    this.request.base = e;
  }
}
class RequestContext {
  constructor(e, t, r, n = null) {
    (this.ultraviolet = r),
      (this.request = e),
      (this.headers = Object.fromEntries([...e.headers.entries()])),
      (this.method = e.method),
      (this.forward = [...t.headers.forward]),
      // dynamically forward any x-* , authorization, sec-ch-ua* from the real request (fixes YouTube search/watch x-youtube-* etc.)
      (() => {
        try {
          const HOP = new Set(["host","connection","keep-alive","proxy-authenticate","proxy-authorization","te","trailer","transfer-encoding","upgrade","http2-settings","content-length","accept-encoding"]);
          for (const [k] of e.headers.keys()) {
            const lk = k.toLowerCase();
            // Never strip identity: a dropped cookie/authorization header is
            // exactly what makes YouTube and now.gg say the network is down.
            if (!HOP.has(lk) && !this.forward.includes(lk)) this.forward.push(lk);
          }
        } catch(_) {}
      })(),
      (this.address = t.address),
      (this.body = n || null),
      (this.redirect = e.redirect),
      (this.credentials = "omit"),
      (this.mode = "cors" === e.mode ? e.mode : "same-origin"),
      (this.blob = !1);
  }
  get send() {
    return new Request(
      this.blob
        ? "blob:" + location.origin + this.url.pathname
        : this.address.href + "v1/",
      {
        method: this.method,
        headers: {
          "x-bare-protocol": this.url.protocol,
          "x-bare-host": this.url.hostname,
          "x-bare-path": this.url.pathname + this.url.search,
          "x-bare-port":
            this.url.port || ("https:" === this.url.protocol ? "443" : "80"),
          "x-bare-headers": JSON.stringify(this.headers),
          "x-bare-forward-headers": JSON.stringify(this.forward),
          userKey: (typeof userKey !== "undefined" ? userKey : "default"),
        },
        redirect: this.redirect,
        credentials: this.credentials,
        mode: location.origin !== this.address.origin ? "cors" : this.mode,
        body: this.body,
      },
    );
  }
  get url() {
    return this.ultraviolet.meta.url;
  }
  set url(e) {
    this.ultraviolet.meta.url = e;
  }
  get base() {
    return this.ultraviolet.meta.base;
  }
  set base(e) {
    this.ultraviolet.meta.base = e;
  }
}
function isHtml(e, t = "") {
  return (
    "text/html" ===
    (Ultraviolet.mime.contentType(t || e.pathname) || "text/html").split(";")[0]
  );
}
class HookEvent {
  #e;
  #t;
  constructor(e = {}, t = null, r = null) {
    (this.#e = !1),
      (this.#t = null),
      (this.data = e),
      (this.target = t),
      (this.that = r);
  }
  get intercepted() {
    return this.#e;
  }
  get returnValue() {
    return this.#t;
  }
  respondWith(e) {
    (this.#t = e), (this.#e = !0);
  }
}
var ReflectOwnKeys,
  R = "object" == typeof Reflect ? Reflect : null,
  ReflectApply =
    R && "function" == typeof R.apply
      ? R.apply
      : function (e, t, r) {
          return Function.prototype.apply.call(e, t, r);
        };
function ProcessEmitWarning(e) {
  console && console.warn && console.warn(e);
}
ReflectOwnKeys =
  R && "function" == typeof R.ownKeys
    ? R.ownKeys
    : Object.getOwnPropertySymbols
      ? function (e) {
          return Object.getOwnPropertyNames(e).concat(
            Object.getOwnPropertySymbols(e),
          );
        }
      : function (e) {
          return Object.getOwnPropertyNames(e);
        };
var NumberIsNaN =
  Number.isNaN ||
  function (e) {
    return e != e;
  };
function EventEmitter() {
  EventEmitter.init.call(this);
}
(EventEmitter.EventEmitter = EventEmitter),
  (EventEmitter.prototype._events = void 0),
  (EventEmitter.prototype._eventsCount = 0),
  (EventEmitter.prototype._maxListeners = void 0);
var defaultMaxListeners = 10;
function checkListener(e) {
  if ("function" != typeof e)
    throw new TypeError(
      'The "listener" argument must be of type Function. Received type ' + typeof e,
    );
}
function _getMaxListeners(e) {
  return void 0 === e._maxListeners
    ? EventEmitter.defaultMaxListeners
    : e._maxListeners;
}
function _addListener(e, t, r, n) {
  var s, i, o;
  if (
    (checkListener(r),
    void 0 === (i = e._events)
      ? ((i = e._events = Object.create(null)), (e._eventsCount = 0))
      : (void 0 !== i.newListener &&
          (e.emit("newListener", t, r.listener ? r.listener : r), (i = e._events)),
        (o = i[t])),
    void 0 === o)
  )
    (o = i[t] = r), ++e._eventsCount;
  else if (
    ("function" == typeof o
      ? (o = i[t] = n ? [r, o] : [o, r])
      : n
        ? o.unshift(r)
        : o.push(r),
    (s = _getMaxListeners(e)) > 0 && o.length > s && !o.warned)
  ) {
    o.warned = !0;
    var a = new Error(
      "Possible EventEmitter memory leak detected. " +
        o.length +
        " " +
        String(t) +
        " listeners added. Use emitter.setMaxListeners() to increase limit",
    );
    (a.name = "MaxListenersExceededWarning"),
      (a.emitter = e),
      (a.type = t),
      (a.count = o.length),
      ProcessEmitWarning(a);
  }
  return e;
}
function onceWrapper() {
  if (!this.fired)
    return (
      this.target.removeListener(this.type, this.wrapFn),
      (this.fired = !0),
      0 === arguments.length
        ? this.listener.call(this.target)
        : this.listener.apply(this.target, arguments)
    );
}
function _onceWrap(e, t, r) {
  var n = { fired: !1, wrapFn: void 0, target: e, type: t, listener: r },
    s = onceWrapper.bind(n);
  return (s.listener = r), (n.wrapFn = s), s;
}
function _listeners(e, t, r) {
  var n = e._events;
  if (void 0 === n) return [];
  var s = n[t];
  return void 0 === s
    ? []
    : "function" == typeof s
      ? r
        ? [s.listener || s]
        : [s]
      : r
        ? unwrapListeners(s)
        : arrayClone(s, s.length);
}
function listenerCount(e) {
  var t = this._events;
  if (void 0 !== t) {
    var r = t[e];
    if ("function" == typeof r) return 1;
    if (void 0 !== r) return r.length;
  }
  return 0;
}
function arrayClone(e, t) {
  for (var r = new Array(t), n = 0; n < t; ++n) r[n] = e[n];
  return r;
}
function spliceOne(e, t) {
  for (; t + 1 < e.length; t++) e[t] = e[t + 1];
  e.pop();
}
function unwrapListeners(e) {
  for (var t = new Array(e.length), r = 0; r < t.length; ++r)
    t[r] = e[r].listener || e[r];
  return t;
}
function once(e, t) {
  return new Promise(function (r, n) {
    function s(r) {
      e.removeListener(t, i), n(r);
    }
    function i() {
      "function" == typeof e.removeListener && e.removeListener("error", s),
        r([].slice.call(arguments));
    }
    eventTargetAgnosticAddListener(e, t, i, { once: !0 }),
      "error" !== t && addErrorHandlerIfEventEmitter(e, s, { once: !0 });
  });
}
function addErrorHandlerIfEventEmitter(e, t, r) {
  "function" == typeof e.on && eventTargetAgnosticAddListener(e, "error", t, r);
}
function eventTargetAgnosticAddListener(e, t, r, n) {
  if ("function" == typeof e.on) n.once ? e.once(t, r) : e.on(t, r);
  else {
    if ("function" != typeof e.addEventListener)
      throw new TypeError(
        'The "emitter" argument must be of type EventEmitter. Received type ' +
          typeof e,
      );
    e.addEventListener(t, function s(i) {
      n.once && e.removeEventListener(t, s), r(i);
    });
  }
}
Object.defineProperty(EventEmitter, "defaultMaxListeners", {
  enumerable: !0,
  get: function () {
    return defaultMaxListeners;
  },
  set: function (e) {
    if ("number" != typeof e || e < 0 || NumberIsNaN(e))
      throw new RangeError(
        'The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' +
          e +
          ".",
      );
    defaultMaxListeners = e;
  },
}),
  (EventEmitter.init = function () {
    (void 0 !== this._events &&
      this._events !== Object.getPrototypeOf(this)._events) ||
      ((this._events = Object.create(null)), (this._eventsCount = 0)),
      (this._maxListeners = this._maxListeners || void 0);
  }),
  (EventEmitter.prototype.setMaxListeners = function (e) {
    if ("number" != typeof e || e < 0 || NumberIsNaN(e))
      throw new RangeError(
        'The value of "n" is out of range. It must be a non-negative number. Received ' +
          e +
          ".",
      );
    return (this._maxListeners = e), this;
  }),
  (EventEmitter.prototype.getMaxListeners = function () {
    return _getMaxListeners(this);
  }),
  (EventEmitter.prototype.emit = function (e) {
    for (var t = [], r = 1; r < arguments.length; r++) t.push(arguments[r]);
    var n = "error" === e,
      s = this._events;
    if (void 0 !== s) n = n && void 0 === s.error;
    else if (!n) return !1;
    if (n) {
      var i;
      if ((t.length > 0 && (i = t[0]), i instanceof Error)) throw i;
      var o = new Error("Unhandled error." + (i ? " (" + i.message + ")" : ""));
      throw ((o.context = i), o);
    }
    var a = s[e];
    if (void 0 === a) return !1;
    if ("function" == typeof a) ReflectApply(a, this, t);
    else {
      var c = a.length,
        u = arrayClone(a, c);
      for (r = 0; r < c; ++r) ReflectApply(u[r], this, t);
    }
    return !0;
  }),
  (EventEmitter.prototype.addListener = function (e, t) {
    return _addListener(this, e, t, !1);
  }),
  (EventEmitter.prototype.on = EventEmitter.prototype.addListener),
  (EventEmitter.prototype.prependListener = function (e, t) {
    return _addListener(this, e, t, !0);
  }),
  (EventEmitter.prototype.once = function (e, t) {
    return checkListener(t), this.on(e, _onceWrap(this, e, t)), this;
  }),
  (EventEmitter.prototype.prependOnceListener = function (e, t) {
    return checkListener(t), this.prependListener(e, _onceWrap(this, e, t)), this;
  }),
  (EventEmitter.prototype.removeListener = function (e, t) {
    var r, n, s, i, o;
    if ((checkListener(t), void 0 === (n = this._events))) return this;
    if (void 0 === (r = n[e])) return this;
    if (r === t || r.listener === t)
      0 == --this._eventsCount
        ? (this._events = Object.create(null))
        : (delete n[e],
          n.removeListener && this.emit("removeListener", e, r.listener || t));
    else if ("function" != typeof r) {
      for (s = -1, i = r.length - 1; i >= 0; i--)
        if (r[i] === t || r[i].listener === t) {
          (o = r[i].listener), (s = i);
          break;
        }
      if (s < 0) return this;
      0 === s ? r.shift() : spliceOne(r, s),
        1 === r.length && (n[e] = r[0]),
        void 0 !== n.removeListener && this.emit("removeListener", e, o || t);
    }
    return this;
  }),
  (EventEmitter.prototype.off = EventEmitter.prototype.removeListener),
  (EventEmitter.prototype.removeAllListeners = function (e) {
    var t, r, n;
    if (void 0 === (r = this._events)) return this;
    if (void 0 === r.removeListener)
      return (
        0 === arguments.length
          ? ((this._events = Object.create(null)), (this._eventsCount = 0))
          : void 0 !== r[e] &&
            (0 == --this._eventsCount
              ? (this._events = Object.create(null))
              : delete r[e]),
        this
      );
    if (0 === arguments.length) {
      var s,
        i = Object.keys(r);
      for (n = 0; n < i.length; ++n)
        "removeListener" !== (s = i[n]) && this.removeAllListeners(s);
      return (
        this.removeAllListeners("removeListener"),
        (this._events = Object.create(null)),
        (this._eventsCount = 0),
        this
      );
    }
    if ("function" == typeof (t = r[e])) this.removeListener(e, t);
    else if (void 0 !== t)
      for (n = t.length - 1; n >= 0; n--) this.removeListener(e, t[n]);
    return this;
  }),
  (EventEmitter.prototype.listeners = function (e) {
    return _listeners(this, e, !0);
  }),
  (EventEmitter.prototype.rawListeners = function (e) {
    return _listeners(this, e, !1);
  }),
  (EventEmitter.listenerCount = function (e, t) {
    return "function" == typeof e.listenerCount
      ? e.listenerCount(t)
      : listenerCount.call(e, t);
  }),
  (EventEmitter.prototype.listenerCount = listenerCount),
  (EventEmitter.prototype.eventNames = function () {
    return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
  });


const sw = new UVServiceWorker(self.__uv$config);

/* ========================================================================
 * One worker, not two.
 *
 * This file used to be the proxy worker only, while public/gg-app-sw.js was a
 * *second* worker registered at the same scope ("/") to cache the shell for
 * offline use. A scope can only have one registration: the second register()
 * call replaces the first, and the replaced worker goes straight to
 * `state === 'redundant'` — which the proxy page reported, correctly and
 * uselessly, as "Proxy worker installation failed". It also meant that
 * whichever worker lost the race was not controlling /service/, so a proxied
 * navigation fell through to Next.js, hit the legacy /service redirect, and
 * bounced the user back to GG-Lounge. That is exactly the reported bug: open
 * the proxy, land back on the lounge.
 *
 * So the offline shell lives here now, behind the proxy's own rules, and only
 * one registration exists at origin scope. Everything below this line is the
 * old gg-app-sw.js, with one addition: a dispatcher that hands proxied traffic
 * to Ultraviolet and everything else to the cache.
 * ===================================================================== */

const SHELL_VERSION = 'ggl-app-v2';
const SHELL = `${SHELL_VERSION}-shell`;
const ASSETS = `${SHELL_VERSION}-assets`;
const GAMES = `${SHELL_VERSION}-games`;
const SHELL_FILES = ['/offline.html', '/manifest.json', '/icon.svg'];
const MAX_GAME_ENTRIES = 120;

/**
 * Paths that must never be served from a cache, or that belong to the proxy.
 *
 * Matched per path *segment*, not by string prefix: the routes are `/proxy` and
 * `/apps`, with no trailing slash, so a `startsWith('/proxy/')` test missed them
 * entirely and served a cached copy of the proxy shell over a live one.
 */
const HANDS_OFF = ['/browse', '/proxy', '/service', '/api', '/uv', '/_next', '/gg-sw.js', '/gg-app-sw.js'];

function handsOff(pathname) {
  return HANDS_OFF.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function cacheable(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  return !handsOff(url.pathname);
}

/**
 * Is this request part of a proxied document?
 *
 * The document itself is under /service/. Its subresources are same-origin
 * requests whose referrer is still the proxied URL, and Ultraviolet has to see
 * both — a cached copy of a destination's asset would be a cached copy of
 * somebody else's site.
 */
function proxied(event) {
  if (event.request.url.startsWith(self.location.origin + '/service/')) return true;
  const referrer = event.request.referrer || '';
  return referrer.startsWith(self.location.origin + '/service/');
}

self.addEventListener('install', event => {
  event.waitUntil(
    (async () => {
      // Individually, so one 404 cannot fail the install and leave the origin
      // with no worker at all — which is precisely the failure mode this file
      // has already caused once.
      const cache = await caches.open(SHELL);
      await Promise.all(SHELL_FILES.map(file => cache.add(file).catch(() => {})));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(name => (name.startsWith('ggl-app-') || name.startsWith('ggl-shell-')) && !name.startsWith(SHELL_VERSION))
          .map(name => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', event => {
  // The proxy gets first refusal. A destination's own documents, assets and
  // API calls must never be answered from this origin's cache.
  if (proxied(event)) {
    event.respondWith(sw.fetch(event));
    return;
  }
  const request = event.request;
  if (!cacheable(request)) return;

  const url = new URL(request.url);

  // Navigations: network first, cache second, offline page last. The cache is
  // a fallback, never the source of truth, so a deploy shows up next load.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put(request, response.clone()).catch(() => {});
          return response;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const shell = await caches.match('/');
          if (shell) return shell;
          return (await caches.match('/offline.html')) || Response.error();
        }
      })(),
    );
    return;
  }

  // Game files, icons and host-game frames: cache first. They are immutable
  // and are the difference between an installed app that opens instantly and
  // one that spins on a school network.
  if (url.pathname.startsWith('/games/') || url.pathname.startsWith('/game-icons/') || url.pathname.startsWith('/app-frames/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(GAMES);
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response.ok) {
            // Bound the cache: a 254-game catalogue would otherwise fill the
            // quota and get the whole origin evicted.
            const keys = await cache.keys();
            if (keys.length >= MAX_GAME_ENTRIES) await cache.delete(keys[0]);
            cache.put(request, response.clone()).catch(() => {});
          }
          return response;
        } catch {
          return new Response('', { status: 504, statusText: 'Offline' });
        }
      })(),
    );
    return;
  }

  // Everything else: stale-while-revalidate.
  event.respondWith(
    (async () => {
      const cache = await caches.open(ASSETS);
      const cached = await cache.match(request);
      const network = fetch(request)
        .then(response => {
          if (response.ok) cache.put(request, response.clone()).catch(() => {});
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })(),
  );
});

/**
 * The page can ask for a game to be kept offline, which is what makes the
 * "download for offline" affordance honest rather than decorative.
 */
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'ggl-precache' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(GAMES);
      let stored = 0;
      for (const raw of data.urls.slice(0, 40)) {
        try {
          const url = new URL(raw, self.location.origin);
          if (url.origin !== self.location.origin) continue;
          const response = await fetch(url);
          if (!response.ok) continue;
          await cache.put(url.href, response);
          stored++;
        } catch {
          /* skip this one, keep going */
        }
      }
      const client = event.source;
      if (client && typeof client.postMessage === 'function') {
        client.postMessage({ type: 'ggl-precached', stored });
      }
    })(),
  );
});
