/*!
 * gg-save.js — one tiny, dependency-free save layer for the games on GG-LOUNGE.
 *
 * Games on this site are third-party builds, so we cannot rewrite their
 * internals. What we can do is give them a storage API that survives a reload
 * even when the browser refuses localStorage (private mode, partitioned
 * third-party frames, a full quota). Strategy, in order:
 *
 *   1. localStorage            — fast, synchronous, survives reloads.
 *   2. document.cookie         — survives reloads when localStorage throws.
 *   3. window.name             — survives reloads within the same tab,
 *                                even across a frame navigation.
 *
 * Everything is namespaced per game via the path, so two games that both use
 * the key "score" never collide.
 *
 * Usage inside a game:
 *   GGSave.set('score', 1234)        // persists
 *   GGSave.get('score', 0)           // reads, with a default
 *   GGSave.saveState(obj) / GGSave.loadState()   // whole-object snapshots
 */
(function (global) {
  'use strict';

  // Derive a stable per-game namespace from the first path segment under
  // /games/, e.g. /games/2048/index.html -> "2048".
  var match = /\/games\/([^/?#]+)/.exec(global.location.pathname);
  var gameId = match ? match[1] : 'unknown';
  var NS = 'ggsave:' + gameId + ':';
  var COOKIE_DAYS = 365;
  var NAME_PREFIX = 'ggsave|';

  var backend = 'none';
  var mem = Object.create(null);

  function probeLocalStorage() {
    try {
      var k = NS + '__probe__';
      global.localStorage.setItem(k, '1');
      global.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false;
    }
  }

  function cookieGet(key) {
    var parts = ('; ' + global.document.cookie).split('; ' + encodeURIComponent(key) + '=');
    if (parts.length < 2) return null;
    var raw = parts[1].split(';')[0];
    try { return decodeURIComponent(raw); } catch (e) { return null; }
  }

  function cookieSet(key, value) {
    try {
      var expires = new Date(Date.now() + COOKIE_DAYS * 864e5).toUTCString();
      global.document.cookie =
        encodeURIComponent(key) + '=' + encodeURIComponent(value) +
        '; expires=' + expires + '; path=/; SameSite=Lax';
      return true;
    } catch (e) {
      return false;
    }
  }

  function readNameStore() {
    try {
      var raw = global.name || '';
      if (raw.indexOf(NAME_PREFIX) !== 0) return {};
      return JSON.parse(raw.slice(NAME_PREFIX.length)) || {};
    } catch (e) {
      return {};
    }
  }

  function writeNameStore(store) {
    try {
      global.name = NAME_PREFIX + JSON.stringify(store);
      return true;
    } catch (e) {
      return false;
    }
  }

  if (probeLocalStorage()) backend = 'localStorage';
  else if (global.document && typeof global.document.cookie === 'string') backend = 'cookie';

  function set(key, value) {
    var encoded;
    try {
      encoded = JSON.stringify(value === undefined ? null : value);
    } catch (e) {
      return false;
    }
    mem[key] = encoded;
    if (backend === 'localStorage') {
      try {
        global.localStorage.setItem(NS + key, encoded);
        return true;
      } catch (e) {
        // Quota or partitioning flipped mid-session; fall through to cookie.
        backend = 'cookie';
      }
    }
    if (backend === 'cookie' && cookieSet(NS + key, encoded)) return true;
    // Last resort: per-tab, survives reloads but not a new tab.
    var store = readNameStore();
    store[key] = encoded;
    return writeNameStore(store);
  }

  function get(key, fallback) {
    var encoded = null;
    if (backend === 'localStorage') {
      try { encoded = global.localStorage.getItem(NS + key); } catch (e) { encoded = null; }
    }
    if (encoded === null && backend === 'cookie') encoded = cookieGet(NS + key);
    if (encoded === null) {
      var store = readNameStore();
      if (Object.prototype.hasOwnProperty.call(store, key)) encoded = store[key];
    }
    if (encoded === null && Object.prototype.hasOwnProperty.call(mem, key)) encoded = mem[key];
    if (encoded === null) return fallback;
    try { return JSON.parse(encoded); } catch (e) { return fallback; }
  }

  function remove(key) {
    delete mem[key];
    if (backend === 'localStorage') {
      try { global.localStorage.removeItem(NS + key); } catch (e) {}
    }
    try {
      global.document.cookie = encodeURIComponent(NS + key) + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
    } catch (e) {}
    var store = readNameStore();
    delete store[key];
    writeNameStore(store);
  }

  // Whole-state helpers so a game can snapshot an object in one call.
  function saveState(state) { return set('__state__', state); }
  function loadState(fallback) { return get('__state__', fallback === undefined ? null : fallback); }

  /**
   * Wrap a game object so its integer counters survive reloads, without
   * touching the game's own code:
   *   var g = GGSave.track(freshScore, 'best')   // load 'best' (0 if none)
   *   g.now = 42; g.flush()                      // persist
   */
  function track(initial, key) {
    var value = get(key, initial);
    return {
      valueOf: function () { return value; },
      flush: function () { set(key, value); return value; },
      set: function (next) { value = next; set(key, value); return value; }
    };
  }

  global.GGSave = {
    gameId: gameId,
    backend: backend,
    set: set,
    get: get,
    remove: remove,
    saveState: saveState,
    loadState: loadState,
    track: track,
    /** True when the chosen backend really survives a reload. */
    persistent: backend === 'localStorage' || backend === 'cookie'
  };
})(typeof window !== 'undefined' ? window : this);
