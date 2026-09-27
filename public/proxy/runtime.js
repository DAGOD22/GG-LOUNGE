/**
 * GG Lounge proxy runtime — injected as the first script of every proxied
 * HTML document. Patches the network APIs a page uses so subresources, API
 * calls and navigations keep flowing through /api/proxy instead of escaping
 * to the real internet (or silently failing CORS).
 *
 * Loaded as a plain classic script (no modules) so it runs before any page
 * script regardless of CSP-sandbox quirks. All patching is defensive: a page
 * that breaks a patch must never break the lounge itself.
 *
 * Boot config arrives as window.__GG_BOOT__ = {
 *   origin:  'https://lounge-host'   — the lounge's own origin
 *   target:  'https://real.site/page' — the real URL being displayed
 *   status:  200                       — upstream status
 *   error:   null | {code,message}
 *   jar:     {...}                     — initial cookie jar (rule → k/v)
 * }
 */
(function () {
  'use strict'
  var boot = window.__GG_BOOT__ || {}
  // If boot has not been assigned yet (or was lost), recover the REAL target
  // URL from our own /api/proxy/<segment> location — never treat the proxy
  // path itself as the page origin (that would mis-resolve every relative URL).
  if (!boot.target) {
    try {
      var recovered = (function (path) {
        var m = /\/api\/proxy\/([A-Za-z0-9_-]+)/.exec(path)
        if (!m) return null
        var bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))
        var bytes = new Uint8Array(bin.length)
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        return new TextDecoder().decode(bytes)
      })(location.pathname)
      if (recovered) boot = Object.assign({}, boot, { target: recovered })
    } catch (e) {
      /* fall through */
    }
  }
  var LOUNGE = String(boot.origin || '').replace(/\/$/, '')
  var TARGET = boot.target || location.href
  var targetUrl
  try {
    targetUrl = new URL(TARGET)
  } catch (e) {
    targetUrl = new URL(location.href)
  }

  function encode(abs) {
    // base64url of the absolute URL — must match lib/proxy/codec.ts
    var bytes = new TextEncoder().encode(abs)
    var bin = ''
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
    return '/api/proxy/' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  /** Resolve any reference against the REAL target and return a proxy path. */
  function proxied(value) {
    if (value == null) return value
    var raw = String(value)
    if (!raw) return raw
    if (raw.charAt(0) === '#') return raw
    if (/^(data|blob|javascript|mailto|tel|sms|about|chrome|moz-extension):/i.test(raw)) return raw
    if (raw.indexOf('/api/proxy/') === 0) return raw
    try {
      var abs = new URL(raw, targetUrl.href)
      if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return raw
      return encode(abs.href) + abs.hash
    } catch (e) {
      return raw
    }
  }

  /** Decode a proxy path back to the real URL (for navigation bookkeeping). */
  function decode(path) {
    try {
      var m = /\/api\/proxy\/([A-Za-z0-9_-]+)/.exec(path)
      if (!m) return null
      var bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))
      var bytes = new Uint8Array(bin.length)
      for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      return new TextDecoder().decode(bytes)
    } catch (e) {
      return null
    }
  }

  // ---------------------------------------------------------------- parent
  function notify(type, detail) {
    try {
      if (window.parent && window.parent !== window) {
        // targetOrigin '*' on purpose: these are status pings (no secrets), and
        // a computed lounge origin that does not match the real one (localhost
        // vs 127.0.0.1, proxy rewrites, previews) makes the browser DROP the
        // message silently — the parent would never see errors or status.
        window.parent.postMessage({ gg: type, url: targetUrl.href, detail: detail || null }, '*')
      }
    } catch (e) {
      /* ignore */
    }
  }

  // ------------------------------------------------------------ fetch
  try {
    var nativeFetch = window.fetch
    if (typeof nativeFetch === 'function') {
      window.fetch = function (input, init) {
        try {
          if (typeof input === 'string') {
            input = proxied(input)
          } else if (input instanceof Request) {
            var url = proxied(input.url)
            if (url !== input.url) input = new Request(url, input)
          } else if (input && typeof input.url === 'string') {
            input = proxied(input.url)
          }
        } catch (e) {
          notify('net-error', { api: 'fetch', message: String((e && e.message) || e) })
        }
        init = init || {}
        // Proxied requests are logically same-origin AT THE TARGET; from the
        // sandboxed (opaque) frame they must carry cookies explicitly.
        if (!('credentials' in init)) init.credentials = 'include'
        return nativeFetch.call(this, input, init).catch(function (err) {
          notify('net-error', { api: 'fetch', message: String((err && err.message) || err) })
          throw err
        })
      }
    }
  } catch (e) {
    notify('patch-failed', { api: 'fetch', message: String((e && e.message) || e) })
  }

  // -------------------------------------------------------- XMLHttpRequest
  try {
    var NativeXHR = window.XMLHttpRequest
    if (NativeXHR) {
      var open = NativeXHR.prototype.open
      var setReqHeader = NativeXHR.prototype.setRequestHeader
      NativeXHR.prototype.open = function (method, url) {
        var rest = Array.prototype.slice.call(arguments, 2)
        try {
          arguments[1] = proxied(String(url))
        } catch (e) {
          /* keep original */
        }
        var applied = open.apply(this, [method, arguments[1]].concat(rest))
        // Attach the virtual cookie jar (opaque-origin frames can rely on the
        // header even when browsers drop third-party cookies).
        try {
          if (pendingJar) setReqHeader.call(this, 'X-GG-Jar', pendingJar)
        } catch (e) {
          /* headers must be set after open(); ignore if browser refuses */
        }
        // Listen on the INSTANCE — calling addEventListener on the prototype
        // itself throws Illegal invocation and (before this fix) made us
        // falsely report patch-failed even though open() was already patched.
        try {
          this.addEventListener('error', xhrErrorHandler)
        } catch (e) {
          /* never break the request over telemetry */
        }
        return applied
      }
      function xhrErrorHandler() {
        notify('net-error', { api: 'xhr', message: 'request failed' })
      }
    }
  } catch (e) {
    notify('patch-failed', { api: 'xhr', message: String((e && e.message) || e) })
  }

  // ------------------------------------- element URL properties + attributes
  function patchElementProp(tag, prop) {
    try {
      var proto = window[tag] && window[tag].prototype
      if (!proto) return
      var desc = Object.getOwnPropertyDescriptor(proto, prop)
      if (!desc || !desc.set) return
      Object.defineProperty(proto, prop, {
        configurable: true,
        enumerable: desc.enumerable,
        get: desc.get
          ? function () {
              return desc.get.call(this)
            }
          : undefined,
        set: function (v) {
          try {
            v = proxied(String(v))
          } catch (e) {
            /* keep */
          }
          return desc.set.call(this, v)
        },
      })
    } catch (e) {
      /* per-element patch is best-effort */
    }
  }
  ;[
    ['HTMLScriptElement', 'src'],
    ['HTMLImageElement', 'src'],
    ['HTMLLinkElement', 'href'],
    ['HTMLIFrameElement', 'src'],
    ['HTMLSourceElement', 'src'],
    ['HTMLVideoElement', 'src'],
    ['HTMLAudioElement', 'src'],
    ['HTMLTrackElement', 'src'],
    ['HTMLAnchorElement', 'href'],
    ['HTMLFormElement', 'action'],
    ['HTMLEmbedElement', 'src'],
    ['HTMLObjectElement', 'data'],
  ].forEach(function (pair) {
    patchElementProp(pair[0], pair[1])
  })

  // setAttribute covers inline markup mutations.
  var nativeSetAttribute = Element.prototype.setAttribute
  Element.prototype.setAttribute = function (name, value) {
    try {
      var lower = String(name).toLowerCase()
      if (
        lower === 'src' ||
        lower === 'href' ||
        lower === 'action' ||
        lower === 'poster' ||
        lower === 'data' ||
        lower === 'formaction' ||
        lower === 'srcset' ||
        lower === 'xlink:href'
      ) {
        if (lower === 'srcset') {
          value = String(value)
            .split(',')
            .map(function (part) {
              var t = part.trim()
              if (!t) return t
              var sp = t.search(/\s/)
              var u = sp < 0 ? t : t.slice(0, sp)
              var d = sp < 0 ? '' : t.slice(sp)
              return proxied(u) + d
            })
            .join(', ')
        } else {
          value = proxied(String(value))
        }
      }
    } catch (e) {
      /* keep */
    }
    return nativeSetAttribute.call(this, name, value)
  }

  // ------------------------------------------------------------ WebSocket
  // Serverless hosts cannot upgrade connections; fail loudly, not silently.
  try {
    var NativeWS = window.WebSocket
    if (NativeWS) {
      window.WebSocket = function (url, protocols) {
        var target = String(url)
        notify('net-error', {
          api: 'websocket',
          message: 'WebSocket connections cannot be proxied on this host (' + target.slice(0, 120) + ')',
        })
        var ws = new NativeWS('wss://gg-lounge.invalid/proxy-blocked')
        // Close immediately with an explicit code so app code sees the failure.
        setTimeout(function () {
          try {
            ws.close(1006, 'proxy: websockets unsupported')
          } catch (e) {
            /* ignore */
          }
        }, 0)
        return ws
      }
      window.WebSocket.prototype = NativeWS.prototype
      window.WebSocket.CONNECTING = 0
      window.WebSocket.OPEN = 1
      window.WebSocket.CLOSING = 2
      window.WebSocket.CLOSED = 3
    }
  } catch (e) {
    notify('patch-failed', { api: 'websocket', message: String((e && e.message) || e) })
  }

  // ------------------------------------------------------------- history
  function rewrittenLocation(url) {
    var abs = new URL(String(url), targetUrl.href)
    if (abs.origin !== targetUrl.origin && abs.protocol !== 'http:' && abs.protocol !== 'https:') return null
    return { proxied: proxied(abs.href), real: abs.href }
  }
  try {
    var pushState = history.pushState
    var replaceState = history.replaceState
    history.pushState = function (state, title, url) {
      if (url != null) {
        var r = rewrittenLocation(url)
        if (r) {
          targetUrl = new URL(r.real)
          notify('navigate', { real: r.real })
          return pushState.call(this, state, title, r.proxied)
        }
      }
      return pushState.apply(this, arguments)
    }
    history.replaceState = function (state, title, url) {
      if (url != null) {
        var r = rewrittenLocation(url)
        if (r) {
          targetUrl = new URL(r.real)
          notify('navigate', { real: r.real })
          return replaceState.call(this, state, title, r.proxied)
        }
      }
      return replaceState.apply(this, arguments)
    }
  } catch (e) {
    notify('patch-failed', { api: 'history', message: String((e && e.message) || e) })
  }

  // location.href assignments inside page JS still navigate within our
  // origin (the browser resolves them against the document URL), so in-page
  // links rewritten by the server keep working. Nothing extra to patch.

  // ------------------------------------------------------------- cookie
  // Sandboxed frames cannot read document.cookie; expose a virtual jar that
  // is synced to the server via the X-GG-Jar header on fetch/XHR.
  var jar = boot.jar || {}
  function jarForRule(rule) {
    if (!jar[rule]) jar[rule] = {}
    return jar[rule]
  }
  try {
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: function () {
        var host = targetUrl.hostname
        var rule = ruleOf(host)
        if (!rule) return ''
        var bucket = jarForRule(rule)
        return Object.keys(bucket)
          .map(function (k) {
            return k + '=' + bucket[k]
          })
          .join('; ')
      },
      set: function (v) {
        var pair = String(v).split(';')[0] || ''
        var eq = pair.indexOf('=')
        if (eq <= 0) return
        var host = targetUrl.hostname
        var rule = ruleOf(host)
        if (!rule) return
        var bucket = jarForRule(rule)
        bucket[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim()
        syncJar()
      },
    })
  } catch (e) {
    notify('patch-failed', { api: 'cookie', message: String((e && e.message) || e) })
  }

  function ruleOf(host) {
    var rules = (window.__GG_RULES__ || []).slice().sort(function (a, b) {
      return b.length - a.length
    })
    for (var i = 0; i < rules.length; i++) {
      if (host === rules[i] || host.slice(-(rules[i].length + 1)) === '.' + rules[i]) return rules[i]
    }
    // Fall back to the boot target's registrable-ish host.
    return boot.rule || null
  }

  function syncJar() {
    try {
      var json = JSON.stringify(jar)
      var bytes = new TextEncoder().encode(json)
      var bin = ''
      for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
      var encoded = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
      if (encoded.length > 4000) return
      // Attach to the next same-origin fetches via a header wrapper.
      pendingJar = encoded
    } catch (e) {
      /* ignore */
    }
  }
  var pendingJar = null

  // Wrap fetch/XHR again to attach X-GG-Jar so stateless serverless handlers
  // see the jar the frame built.
  try {
    if (window.fetch) {
      var f = window.fetch
      window.fetch = function (input, init) {
        init = init || {}
        if (pendingJar) {
          var headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined))
          if (!headers.has('X-GG-Jar')) headers.set('X-GG-Jar', pendingJar)
          init.headers = headers
        }
        return f.call(this, input, init).then(function (res) {
          var updated = res.headers.get('X-GG-Jar')
          if (updated) {
            try {
              var bytes = Uint8Array.from(atob(updated.replace(/-/g, '+').replace(/_/g, '/')), function (c) {
                return c.charCodeAt(0)
              })
              jar = JSON.parse(new TextDecoder().decode(bytes)) || jar
            } catch (e) {
              /* keep old jar */
            }
          }
          return res
        })
      }
    }
  } catch (e) {
    /* ignore */
  }

  // -------------------------------------------------------- runtime report
  var reported = false
  function report() {
    if (reported) return
    reported = true
    // Re-read boot at report time: catches scripts that assign __GG_BOOT__
    // after runtime.js (never invent a status — null means "unknown").
    boot = window.__GG_BOOT__ || boot
    notify('ready', {
      status: boot.status != null ? boot.status : null,
      title: document.title || '',
      error: boot.error || null,
      host: targetUrl.hostname,
      path: targetUrl.pathname,
    })
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', report)
    window.addEventListener('load', report)
  } else {
    report()
  }
  syncJar()

  // Expose for debugging from the lounge chrome (same code cannot read
  // sandboxed internals otherwise; this is OUR runtime, not page code).
  try {
    Object.defineProperty(window, '__GG_RUNTIME__', {
      value: { version: 1, target: targetUrl.href, encode: encode, decode: decode },
    })
  } catch (e) {
    /* ignore */
  }
})()
