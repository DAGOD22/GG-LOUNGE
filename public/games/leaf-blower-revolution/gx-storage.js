/*
 * Leaf Blower Revolution — save-storage host.
 *
 * GameMaker's HTML5 export mounts its save folder ("/_savedata") on whichever
 * storage host is available. On Opera GX / gx.games that host is
 * window.oprt.gameStorage, whose shape is:
 *
 *     open(name) -> {
 *        list()          -> Promise<{ [fsPath]: { timestamp: Date } }>
 *        get(fsPath)     -> Promise<{ timestamp, mode, contents }>
 *        put(value, fsPath) -> Promise<void>
 *        delete(fsPath)  -> Promise<void>
 *     }
 *
 * Keys are absolute filesystem paths (e.g. "/_savedata/<project>/save.dat"),
 * because that is what the runtime's local/remote reconciliation compares.
 *
 * Without a host, this build keeps saves in Emscripten's in-memory filesystem
 * and nothing survives a reload. This file supplies the host backed by
 * IndexedDB, so the game's own save files persist exactly as written.
 *
 * Storage backend only: no game logic is changed, and the game files
 * (runner.js / runner.wasm / runner.data / game.unx) stay byte-identical.
 */
(function () {
  'use strict';

  var DB_NAME = 'gg-lbr-saves';
  var STORE = 'files';
  var openPromise = null;

  function openDb() {
    if (openPromise) return openPromise;
    openPromise = new Promise(function (resolve, reject) {
      var req;
      try { req = indexedDB.open(DB_NAME, 1); } catch (e) { return reject(e); }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return openPromise;
  }

  function toBytes(contents) {
    if (!contents) return new Uint8Array(0);
    if (contents instanceof Uint8Array) return contents;
    if (contents instanceof ArrayBuffer) return new Uint8Array(contents);
    if (Array.isArray(contents)) return new Uint8Array(contents);
    return new Uint8Array(0);
  }

  function norm(p) {
    var s = String(p == null ? '' : p).replace(/\\/g, '/').replace(/\/+/g, '/');
    if (s.charAt(0) !== '/') s = '/' + s;
    return s.replace(/\/+$/, '') || '/';
  }

  function dirOf(p) {
    var s = norm(p);
    var i = s.lastIndexOf('/');
    return i <= 0 ? '/' : s.slice(0, i);
  }

  // Every key under (and including) `dir`, plus direct children.
  function entriesUnder(dir) {
    var root = dir === '/' ? '' : dir;
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var out = {};
        var t = db.transaction([STORE], 'readonly');
        var req = t.objectStore(STORE).openCursor();
        req.onsuccess = function () {
          var cur = req.result;
          if (!cur) return resolve(out);
          var key = norm(cur.value.key);
          if (!root || key === root || key.indexOf(root + '/') === 0) {
            out[key] = { timestamp: new Date(cur.value.timestamp || 0) };
          }
          cur.continue();
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function writeOne(rec) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction([STORE], 'readwrite');
        t.objectStore(STORE).put(rec);
        t.oncomplete = function () { resolve(true); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function deleteOne(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction([STORE], 'readwrite');
        t.objectStore(STORE).delete(key);
        t.oncomplete = function () { resolve(true); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  function getOne(key) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var box = null;
        var t = db.transaction([STORE], 'readonly');
        var req = t.objectStore(STORE).get(key);
        req.onsuccess = function () { box = req.result || null; };
        req.onerror = function () { reject(req.error); };
        t.oncomplete = function () { resolve(box); };
        t.onabort = function () { resolve(box); };
      });
    });
  }

  function storageFor(name) {
    var root = norm(name);
    return {
      list: function () {
        return entriesUnder(root).catch(function () { return {}; });
      },
      get: function (key) {
        return getOne(norm(key)).then(function (rec) {
          if (!rec) return { timestamp: new Date(0), mode: 33206, contents: new Uint8Array(0) };
          return {
            timestamp: new Date(rec.timestamp || 0),
            mode: rec.mode || 33206,
            contents: toBytes(rec.contents),
          };
        });
      },
      put: function (value, key) {
        return writeOne({
          key: norm(key),
          timestamp: value && value.timestamp ? new Date(value.timestamp).getTime() : Date.now(),
          mode: (value && value.mode) || 33206,
          contents: toBytes(value && value.contents),
        }).then(function () { announce(norm(key)); });
      },
      delete: function (key) {
        return deleteOne(norm(key)).then(function () {});
      },
    };
  }

  // Lets the page know the game just wrote a save file (used to mirror it to
  // the signed-in account without waiting for the periodic sync).
  function announce(key) {
    try {
      window.dispatchEvent(new CustomEvent('ggl:save-written', { detail: { key: key } }));
    } catch (e) {}
  }

  // ---- the host the GameMaker runtime looks for --------------------------
  var hosts = {};
  window.oprt = window.oprt || {};
  window.oprt.gameStorage = {
    open: function (name) {
      var key = norm(name);
      if (!hosts[key]) hosts[key] = storageFor(key);
      return hosts[key];
    },
  };

  // ---- helpers used by the page's cloud-save code -----------------------
  // read(mount)  -> { "<path relative to mount>": [bytes…] }
  // write(files, mount) <- same shape
  function saveRoot(mount) { return norm(mount || '/_savedata'); }

  window.GGL_GX_SAVE = {
    db: DB_NAME,
    store: STORE,
    list: function (mount) {
      var root = saveRoot(mount);
      return entriesUnder(root).then(function (all) {
        return Object.keys(all)
          .filter(function (k) { return k.indexOf(root + '/') === 0; })
          .map(function (k) { return k.slice(root.length + 1); });
      }).catch(function () { return []; });
    },
    read: function (mount) {
      var root = saveRoot(mount);
      return entriesUnder(root).then(function (all) {
        var keys = Object.keys(all);
        return Promise.all(keys.map(function (k) { return getOne(k); })).then(function (recs) {
          var out = {};
          keys.forEach(function (k, i) {
            var rel = k.indexOf(root + '/') === 0 ? k.slice(root.length + 1) : k;
            out[rel] = Array.prototype.slice.call(toBytes(recs[i] && recs[i].contents));
          });
          return out;
        });
      }).catch(function () { return {}; });
    },
    write: function (files, mount) {
      var root = saveRoot(mount);
      var names = Object.keys(files || {});
      return Promise.all(names.map(function (k) {
        return writeOne({
          key: root + '/' + String(k).replace(/^\/+/, ''),
          timestamp: Date.now(),
          mode: 33206,
          contents: toBytes(files[k]),
        });
      })).then(function () { return true; }).catch(function () { return false; });
    },
    clear: function (mount) {
      var root = saveRoot(mount);
      return entriesUnder(root).then(function (all) {
        return Promise.all(Object.keys(all).map(deleteOne));
      }).then(function () { return true; }).catch(function () { return false; });
    },
  };
})();
