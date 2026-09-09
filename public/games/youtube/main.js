"use strict";
/* ============================================================
   GG Lounge — YouTube Unblocked
   A Piped-powered YouTube client. No Google API key, no ads,
   no youtube.com requests. All data flows through the lounge's
   own /api/yt proxy ("school mode") with direct Piped fallback.
   ============================================================ */

(function () {
  // ---------- config ----------
  var API_BASE = "/api/yt";
  var DIRECT_INSTANCES = [
    "https://pipedapi.kavin.rocks",
    "https://pipedapi.leptons.xyz",
    "https://pipedapi-libre.kavin.rocks",
    "https://pipedapi.adminforge.de",
    "https://api.piped.yt",
    "https://pipedapi.drgns.space",
    "https://pipedapi.ducks.party",
    "https://piped-api.codespace.cz",
    "https://pipedapi.reallyaweso.me",
    "https://api.piped.private.coffee",
    "https://pipedapi.darkness.services",
    "https://pipedapi.orangenet.cc",
    "https://pipedapi.owo.si",
    "https://piped-api.privacy.com.de"
  ];
  var REGIONS = [
    ["AU", "Australia"], ["US", "United States"], ["GB", "United Kingdom"],
    ["CA", "Canada"], ["NZ", "New Zealand"], ["IN", "India"],
    ["DE", "Germany"], ["FR", "France"], ["JP", "Japan"], ["BR", "Brazil"]
  ];
  var SEARCH_FILTERS = [
    ["all", "All"], ["videos", "Videos"], ["channels", "Channels"], ["playlists", "Playlists"]
  ];

  // ---------- tiny store ----------
  function lsGet(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }

  var prefs = Object.assign({
    schoolMode: true,   // video bytes via /api/yt/media (same origin)
    strictImg: false,   // thumbnails via /api/yt/img (same origin)
    instance: "auto",   // "auto" (lounge proxy) or a direct Piped URL
    region: "AU",
    autoplay: false,
    skipSponsors: true,
    quality: "auto"
  }, lsGet("ggl_yt_prefs", {}));

  function savePrefs() { lsSet("ggl_yt_prefs", prefs); }
  function getHistory() { return lsGet("ggl_yt_history", []); }
  function getLater() { return lsGet("ggl_yt_later", []); }

  function pushHistory(entry) {
    var list = getHistory().filter(function (x) { return x.id !== entry.id; });
    list.unshift(Object.assign({ ts: Date.now() }, entry));
    lsSet("ggl_yt_history", list.slice(0, 100));
  }
  function toggleLater(entry) {
    var list = getLater();
    var i = -1;
    for (var k = 0; k < list.length; k++) if (list[k].id === entry.id) i = k;
    if (i >= 0) { list.splice(i, 1); lsSet("ggl_yt_later", list); return false; }
    list.unshift(Object.assign({ ts: Date.now() }, entry));
    lsSet("ggl_yt_later", list.slice(0, 200));
    return true;
  }
  function isLater(id) {
    return getLater().some(function (x) { return x.id === id; });
  }

  // ---------- dom ----------
  var main = document.getElementById("main");
  var netDot = document.getElementById("net-dot");
  var netText = document.getElementById("net-text");
  var searchInput = document.getElementById("search-input");
  var searchBtn = document.getElementById("search-btn");
  var suggestBox = document.getElementById("suggest");
  var toasts = document.getElementById("toasts");

  function toast(msg) {
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    toasts.appendChild(el);
    setTimeout(function () { el.remove(); }, 2600);
  }

  function setNet(state, text) {
    netDot.classList.remove("ok", "bad");
    if (state === "ok") netDot.classList.add("ok");
    if (state === "bad") netDot.classList.add("bad");
    netText.textContent = text;
  }

  // If a proxied thumbnail fails (proxy unreachable), retry it direct once.
  document.addEventListener("error", function (ev) {
    var t = ev.target;
    if (t && t.tagName === "IMG" && !t.getAttribute("data-direct-retried") &&
        t.src.indexOf(API_BASE + "/img?url=") >= 0) {
      t.setAttribute("data-direct-retried", "1");
      try {
        var u = new URL(t.src, location.href).searchParams.get("url");
        if (u) t.src = u;
      } catch (e) { /* noop */ }
    }
  }, true);

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }
  function linkify(text) {
    var safe = esc(text);
    return safe.replace(/(https?:\/\/[^\s<]+)/g, function (m) {
      return '<a href="' + m + '" target="_blank" rel="noopener noreferrer">' + m + "</a>";
    }).replace(/\n/g, "<br>");
  }
  function fmtDur(sec) {
    if (sec == null || sec < 0) return "";
    sec = Math.floor(sec);
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    function p(n) { return (n < 10 ? "0" : "") + n; }
    return h > 0 ? h + ":" + p(m) + ":" + p(s) : m + ":" + p(s);
  }
  function fmtNum(n) {
    if (n == null || n < 0) return "";
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }
  function timeAgo(ts) {
    if (!ts || ts < 0) return "";
    var d = Date.now() - (ts < 1e12 ? ts * 1000 : ts);
    if (d < 0) return "";
    var mins = Math.floor(d / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + " min ago";
    var h = Math.floor(mins / 60);
    if (h < 24) return h + " hour" + (h > 1 ? "s" : "") + " ago";
    var days = Math.floor(h / 24);
    if (days < 30) return days + " day" + (days > 1 ? "s" : "") + " ago";
    var months = Math.floor(days / 30);
    if (months < 12) return months + " month" + (months > 1 ? "s" : "") + " ago";
    var y = Math.floor(months / 12);
    return y + " year" + (y > 1 ? "s" : "") + " ago";
  }
  function when(item) {
    if (item.uploadedDate) return item.uploadedDate;
    if (item.uploadDate) return item.uploadDate;
    if (typeof item.uploaded === "number" && item.uploaded > 0) return timeAgo(item.uploaded);
    return "";
  }
  function metaLine(item) {
    var parts = [];
    if (item.views != null && item.views >= 0) parts.push(fmtNum(item.views) + " views");
    var w = when(item);
    if (w) parts.push(w);
    return parts.join(" • ");
  }
  function videoIdFromUrl(url) {
    if (!url) return null;
    var m = /[?&]v=([\w-]{11})/.exec(url) || /\/watch\/([\w-]{11})/.exec(url) ||
            /^([\w-]{11})$/.exec(url) || /youtu\.be\/([\w-]{11})/.exec(url);
    return m ? m[1] : null;
  }
  function channelPathFromUrl(url) {
    if (!url) return null;
    var m = /^\/(channel|c|user)\/([^/?#]+)/.exec(url);
    return m ? m[1] + "/" + m[2] : null;
  }

  function mediaUrl(u) {
    if (!u) return "";
    if (prefs.schoolMode) return API_BASE + "/media?url=" + encodeURIComponent(u);
    return u;
  }
  function imgUrl(u, fallback) {
    if (!u) return fallback || "";
    // School mode proxies images same-origin too (auto-falls back to direct
    // via the global IMG error handler below if the proxy is unreachable).
    if (prefs.strictImg || prefs.schoolMode) return API_BASE + "/img?url=" + encodeURIComponent(u);
    return u;
  }

  // ---------- api client ----------
  var lastVia = "";
  var directCursor = 0;
  var proxyAlive = null; // null = unknown, true/false after probe or first use

  // One cheap boot probe so we don't waste seconds on a dead proxy (or a
  // dead direct route) before trying the other path.
  function probeProxy() {
    if (proxyAlive !== null) return;
    proxyAlive = undefined; // probing
    fetchJson(API_BASE + "/trending?region=" + encodeURIComponent(prefs.region || "US"), 6000).then(function () {
      proxyAlive = true;
    }, function () { proxyAlive = false; });
  }

  function fetchJson(url, timeoutMs) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error("timed out")); }, timeoutMs || 15000);
      fetch(url, { headers: { Accept: "application/json" } })
        .then(function (res) {
          clearTimeout(timer);
          res.text().then(function (text) {
            var data = text;
            try { data = JSON.parse(text); } catch (e) { /* keep text */ }
            if (!res.ok) {
              var msg = (data && data.message) || (data && data.error) || ("HTTP " + res.status);
              var err = new Error(String(msg));
              err.status = res.status;
              reject(err);
            } else resolve(data);
          }, reject);
        }, function (err) { clearTimeout(timer); reject(err); });
    });
  }

  function directOrder() {
    var list = DIRECT_INSTANCES.slice();
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(list[(directCursor + i) % list.length]);
    return out;
  }

  function tryDirect(path, proxyErr) {
    var order = directOrder();
    var chain = Promise.reject(proxyErr);
    order.slice(0, 6).forEach(function (base) {
      chain = chain.catch(function () {
        return fetchJson(base + path, 10000).then(function (data) {
          lastVia = base;
          directCursor = DIRECT_INSTANCES.indexOf(base); // start here next time
          setNet("ok", "Direct • connected");
          return data;
        });
      });
    });
    return chain.catch(function (err) {
      setNet("bad", "Offline");
      throw err;
    });
  }

  function api(path) {
    // Manual instance selected → go direct only.
    if (prefs.instance && prefs.instance !== "auto") {
      return fetchJson(prefs.instance + path).then(function (data) {
        lastVia = prefs.instance;
        setNet("ok", "Server: custom");
        return data;
      });
    }
    // Proxy known-dead (e.g. sandbox preview): skip straight to direct.
    if (proxyAlive === false) {
      return tryDirect(path, new Error("lounge proxy unreachable"));
    }
    // Auto: lounge proxy first (same origin = unblockable), then direct Piped.
    return fetchJson(API_BASE + path).then(function (data) {
      lastVia = "lounge proxy";
      proxyAlive = true;
      setNet("ok", prefs.schoolMode ? "School mode • connected" : "Connected");
      return data;
    }).catch(function (proxyErr) {
      proxyAlive = false;
      return tryDirect(path, proxyErr);
    });
  }

  function cycleServer() {
    directCursor = (directCursor + 1) % DIRECT_INSTANCES.length;
    prefs.instance = DIRECT_INSTANCES[directCursor];
    savePrefs();
    toast("Trying server: " + prefs.instance.replace("https://", ""));
  }

  // ---------- navigation ----------
  var state = { view: "home", q: "", filter: "all", id: "", chan: "", nextpage: null };
  var currentVideo = null;   // HTMLVideoElement
  var currentHls = null;     // hls.js instance
  var upNext = [];
  var sponsorsSkipped = 0;

  function stopPlayer() {
    try { if (currentHls) currentHls.destroy(); } catch (e) { /* noop */ }
    currentHls = null;
    if (currentVideo) { try { currentVideo.pause(); } catch (e) { /* noop */ } }
    currentVideo = null;
    upNext = [];
    sponsorsSkipped = 0;
  }

  function setActiveNav(view) {
    var btns = document.querySelectorAll("[data-nav]");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].getAttribute("data-nav") === view);
    }
  }

  function go(view, params, push) {
    stopPlayer();
    state = Object.assign({ view: view }, params || {});
    setActiveNav(view === "watch" || view === "search" || view === "channel" ? "" : view);
    if (push !== false) {
      var url = "./index.html" + toQuery(state);
      try { history.pushState(Object.assign({}, state), "", url); } catch (e) { /* file:// */ }
    }
    window.scrollTo(0, 0);
    render();
  }

  function toQuery(s) {
    if (s.view === "watch" && s.id) return "?v=" + encodeURIComponent(s.id);
    if (s.view === "search" && s.q) return "?q=" + encodeURIComponent(s.q);
    if (s.view === "channel" && s.chan) return "?c=" + encodeURIComponent(s.chan);
    if (s.view && s.view !== "home") return "?view=" + encodeURIComponent(s.view);
    return "";
  }

  function bootFromUrl() {
    var q = new URLSearchParams(window.location.search);
    if (q.get("v")) return { view: "watch", id: q.get("v") };
    if (q.get("q")) return { view: "search", q: q.get("q"), filter: "all" };
    if (q.get("c")) return { view: "channel", chan: q.get("c") };
    if (q.get("view")) return { view: q.get("view") };
    return { view: "home" };
  }

  window.addEventListener("popstate", function (e) {
    stopPlayer();
    state = e.state || { view: "home" };
    setActiveNav(state.view);
    render();
  });

  // ---------- shared render bits ----------
  function skeletonGrid(n) {
    var html = '<div class="grid">';
    for (var i = 0; i < (n || 12); i++) {
      html += '<div class="skeleton"><div class="skel-thumb"></div><div class="skel-line" style="width:88%"></div><div class="skel-line" style="width:60%"></div></div>';
    }
    return html + "</div>";
  }

  function officialEmbed(id, holder) {
    holder.innerHTML = '<iframe class="player official" src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="no-referrer"></iframe>';
  }

  function officialOnly(id) {
    main.innerHTML =
      '<div class="watch"><div class="player-col"><div class="player-holder">' +
      '<iframe class="player official" src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0" title="YouTube video player" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen referrerpolicy="no-referrer"></iframe>' +
      '</div><p class="official-note">Stream servers are unreachable, so this is playing through the official YouTube player.</p></div></div>';
  }

  function errorBox(title, message, retryFn) {
    main.innerHTML =
      '<div class="error-box"><h2>' + esc(title) + '</h2><p>' + esc(message) + '</p>' +
      '<div class="btn-row"><button class="btn" id="err-retry">Try again</button>' +
      '<button class="btn ghost" id="err-server">Try another server</button></div></div>';
    document.getElementById("err-retry").onclick = retryFn;
    document.getElementById("err-server").onclick = function () {
      cycleServer();
      retryFn();
    };
  }

  function cardHtml(item) {
    var id = videoIdFromUrl(item.url);
    if (!id) return "";
    var live = item.isShort === false && item.duration === -1;
    var dur = item.duration != null && item.duration > 0 ? fmtDur(item.duration) : "";
    var uploader = item.uploaderName || item.uploader || "";
    var avatar = imgUrl(item.uploaderAvatar, "");
    return (
      '<div class="card" data-video="' + esc(id) + '" role="button" tabindex="0">' +
        '<div class="thumb">' +
          '<img loading="lazy" referrerpolicy="no-referrer" src="' + esc(imgUrl(item.thumbnail, "")) + '" alt="" onerror="this.classList.add(\'broken\')" />' +
          (dur ? '<span class="badge-dur">' + esc(dur) + "</span>" : (live ? '<span class="badge-live">LIVE</span>' : "")) +
        "</div>" +
        '<div class="card-row">' +
          (avatar ? '<img class="avatar" loading="lazy" referrerpolicy="no-referrer" src="' + esc(avatar) + '" alt="" onerror="this.style.visibility=\'hidden\'" />' : '<span class="avatar"></span>') +
          '<div class="card-meta"><p class="card-title">' + esc(item.title) + "</p>" +
          '<div class="card-sub">' + esc(uploader) +
          (item.uploaderVerified ? ' <span class="verified">✓</span>' : "") + "<br>" + esc(metaLine(item)) + "</div></div>" +
        "</div>" +
      "</div>"
    );
  }

  function bindCards(root) {
    var cards = (root || main).querySelectorAll("[data-video]");
    for (var i = 0; i < cards.length; i++) {
      (function (el) {
        function open() { go("watch", { id: el.getAttribute("data-video") }); }
        el.addEventListener("click", open);
        el.addEventListener("keydown", function (e) { if (e.key === "Enter") open(); });
      })(cards[i]);
    }
  }

  function regionSelectHtml() {
    var html = '<select class="region-select" id="region-sel" aria-label="Trending region">';
    for (var i = 0; i < REGIONS.length; i++) {
      html += '<option value="' + REGIONS[i][0] + '"' +
        (prefs.region === REGIONS[i][0] ? " selected" : "") + ">" + esc(REGIONS[i][1]) + "</option>";
    }
    return html + "</select>";
  }

  // ---------- home / trending ----------
  function renderHome() {
    var title = state.view === "trending" ? "Trending now" : "Recommended";
    main.innerHTML =
      '<div class="view-head"><h1>' + title + '</h1>' + regionSelectHtml() + "</div>" +
      '<div id="feed">' + skeletonGrid(12) + "</div>";
    document.getElementById("region-sel").onchange = function (e) {
      prefs.region = e.target.value;
      savePrefs();
      renderHome();
    };
    api("/trending?region=" + encodeURIComponent(prefs.region)).then(function (items) {
      if (!items || !items.length) {
        main.querySelector("#feed").innerHTML = '<div class="empty">No trending videos right now. Try another region.</div>';
        return;
      }
      var html = '<div class="grid">';
      for (var i = 0; i < items.length; i++) html += cardHtml(items[i]);
      main.querySelector("#feed").innerHTML = html + "</div>";
      bindCards();
    }, function (err) {
      errorBox("Couldn't load videos", err.message || "Network error", renderHome);
    });
  }

  // ---------- search ----------
  function renderSearch() {
    var tabs = '<div class="filter-tabs">';
    for (var i = 0; i < SEARCH_FILTERS.length; i++) {
      tabs += '<button data-filter="' + SEARCH_FILTERS[i][0] + '"' +
        (state.filter === SEARCH_FILTERS[i][0] ? ' class="active"' : "") + ">" +
        SEARCH_FILTERS[i][1] + "</button>";
    }
    main.innerHTML =
      '<div class="view-head"><h1>Results for “' + esc(state.q) + "”</h1></div>" + tabs + "</div>" +
      '<div class="rows" id="results"><div class="empty">Searching…</div></div>' +
      '<button class="load-more" id="more-btn" style="display:none">Load more</button>';
    searchInput.value = state.q;

    var tabsBtns = main.querySelectorAll("[data-filter]");
    for (var t = 0; t < tabsBtns.length; t++) {
      tabsBtns[t].onclick = function () {
        state.filter = this.getAttribute("data-filter");
        state.nextpage = null;
        renderSearch();
      };
    }

    var next = null;
    function paint(items, append) {
      var box = document.getElementById("results");
      var html = append ? "" : "";
      if (!append && (!items || !items.length)) {
        box.innerHTML = '<div class="empty">No results. Try different keywords.</div>';
        return;
      }
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (it.type === "stream") {
          var id = videoIdFromUrl(it.url);
          if (!id) continue;
          html +=
            '<div class="row" data-video="' + esc(id) + '">' +
              '<div class="thumb"><img loading="lazy" referrerpolicy="no-referrer" src="' + esc(imgUrl(it.thumbnail, "")) + '" alt="" onerror="this.classList.add(\'broken\')" />' +
              (it.duration > 0 ? '<span class="badge-dur">' + esc(fmtDur(it.duration)) + "</span>" : "") + "</div>" +
              '<div class="row-body"><p class="row-title">' + esc(it.title) + "</p>" +
              '<div class="row-sub">' + esc(metaLine(it)) + " • " + esc(it.uploaderName || "") +
              (it.uploaderVerified ? " ✓" : "") + "</div>" +
              '<div class="row-desc">' + esc(it.description || "") + "</div></div>" +
            "</div>";
        } else if (it.type === "channel") {
          var cp = channelPathFromUrl(it.url);
          html +=
            '<div class="channel-row" data-channel="' + esc(cp || "") + '">' +
              '<img loading="lazy" referrerpolicy="no-referrer" src="' + esc(imgUrl(it.thumbnail, "")) + '" alt="" />' +
              "<div><div style='font-weight:700'>" + esc(it.name) + (it.verified ? " ✓" : "") + "</div>" +
              '<div class="row-sub">' + esc(fmtNum(it.subscribers) + (it.subscribers >= 0 ? " subscribers • " : "") + (it.videoCount >= 0 ? it.videoCount + " videos" : "")) + "</div>" +
              '<div class="row-desc">' + esc(it.description || "") + "</div></div>" +
            "</div>";
        } else if (it.type === "playlist") {
          html +=
            '<div class="row" data-playlist="' + esc(it.url || "") + '">' +
              '<div class="thumb"><img loading="lazy" referrerpolicy="no-referrer" src="' + esc(imgUrl(it.thumbnail, "")) + '" alt="" onerror="this.classList.add(\'broken\')" /></div>' +
              '<div class="row-body"><p class="row-title">▶ ' + esc(it.name) + "</p>" +
              '<div class="row-sub">Playlist • ' + esc(it.uploaderName || "") + " • " + esc(String(it.videos >= 0 ? it.videos : "") + " videos") + "</div></div>" +
            "</div>";
        }
      }
      if (append) {
        var tmp = document.createElement("div");
        tmp.innerHTML = html;
        while (tmp.firstChild) box.appendChild(tmp.firstChild);
      } else box.innerHTML = html;
      bindCards(box);
      var chans = box.querySelectorAll("[data-channel]");
      for (var c = 0; c < chans.length; c++) {
        (function (el) {
          el.onclick = function () {
            var p = el.getAttribute("data-channel");
            if (p) go("channel", { chan: p });
          };
        })(chans[c]);
      }
      var pls = box.querySelectorAll("[data-playlist]");
      for (var p2 = 0; p2 < pls.length; p2++) {
        pls[p2].onclick = function () { toast("Playlists open the first video — full playlist view coming soon."); };
      }
    }

    function loadMore() {
      if (!next) return;
      var btn = document.getElementById("more-btn");
      btn.textContent = "Loading…";
      var body = { nextpage: next, q: state.q, filter: state.filter };
      // Piped nextpage/search is a GET with the page blob as a query param.
      api("/nextpage/search?nextpage=" + encodeURIComponent(JSON.stringify(next)) +
        "&q=" + encodeURIComponent(state.q) + "&filter=" + encodeURIComponent(state.filter))
        .then(function (page) {
          next = page.nextpage || null;
          paint(page.items || [], true);
          btn.style.display = next ? "block" : "none";
          btn.textContent = "Load more";
        }, function () { btn.textContent = "Load more"; });
    }
    document.getElementById("more-btn").onclick = loadMore;

    api("/search?q=" + encodeURIComponent(state.q) + "&filter=" + encodeURIComponent(state.filter))
      .then(function (page) {
        next = page.nextpage || null;
        if (page.suggestion) {
          var s = document.createElement("div");
          s.className = "row-sub";
          s.style.marginBottom = "12px";
          s.innerHTML = "Did you mean: <b></b>";
          s.querySelector("b").textContent = page.suggestion;
          s.style.cursor = "pointer";
          s.onclick = function () { go("search", { q: page.suggestion, filter: state.filter }); };
          document.getElementById("results").before(s);
        }
        paint(page.items || [], false);
        document.getElementById("more-btn").style.display = next ? "block" : "none";
      }, function (err) {
        errorBox("Search failed", err.message || "Network error", renderSearch);
      });
  }

  // ---------- watch ----------
  function pickStreams(data) {
    var videos = (data.videoStreams || []).slice();
    var muxed = videos.filter(function (s) { return !s.videoOnly; });
    // Prefer mp4 muxed for widest <video> support.
    muxed.sort(function (a, b) {
      var am = /mp4/i.test(a.mimeType || "") || /mp4/i.test(a.format || "") ? 0 : 1;
      var bm = /mp4/i.test(b.mimeType || "") || /mp4/i.test(b.format || "") ? 0 : 1;
      if (am !== bm) return am - bm;
      // In school mode, prefer non-googlevideo hosts (pipedproxy mirrors),
      // since school filters usually block video CDNs but not these.
      if (prefs.schoolMode) {
        var ag = /googlevideo\.com/i.test(a.url || "") ? 1 : 0;
        var bg = /googlevideo\.com/i.test(b.url || "") ? 1 : 0;
        if (ag !== bg) return ag - bg;
      }
      return (b.height || 0) - (a.height || 0);
    });
    return { muxed: muxed, all: videos, audio: (data.audioStreams || []).slice() };
  }

  function qualityLabel(s) {
    if (s.quality) return s.quality;
    if (s.height) return s.height + "p";
    return s.format || "SD";
  }

  function ensureHls() {
    return new Promise(function (resolve, reject) {
      if (window.Hls) return resolve(window.Hls);
      var s = document.createElement("script");
      s.src = "./vendor/hls.min.js";
      s.onload = function () { resolve(window.Hls); };
      s.onerror = function () { reject(new Error("player engine failed to load")); };
      document.head.appendChild(s);
    });
  }

  function attachHls(video, hlsUrl) {
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = prefs.schoolMode ? hlsUrl : hlsUrl; // manifests use absolute proxy URLs
      return;
    }
    ensureHls().then(function (Hls) {
      if (!Hls.isSupported()) { video.src = hlsUrl; return; }
      var hls = new Hls({ maxBufferLength: 30 });
      if (prefs.schoolMode) {
        hls.config.xhrSetup = function (xhr, url) {
          if (/^https?:/.test(url)) {
            xhr.open("GET", API_BASE + "/media?url=" + encodeURIComponent(url), true);
          }
        };
      }
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      currentHls = hls;
    }, function () { video.src = hlsUrl; });
  }

  function renderWatch() {
    var id = state.id;
    main.innerHTML =
      '<div class="watch"><div class="player-col">' +
        '<div class="player-holder"><div class="player-fallback" id="player-ph">Loading player…</div>' +
        '<div class="skipper" id="skipper">Skipping sponsor…</div></div>' +
        '<div id="watch-info"><div class="skel-line" style="width:70%;height:18px"></div><div class="skel-line" style="width:40%"></div></div>' +
        '<div class="comments" id="comments"><h2>Comments</h2><div class="empty">Loading…</div></div>' +
      '</div><div class="upnext"><h2>Up next</h2><div id="upnext-list">' + skeletonGrid(4) + "</div></div></div>";

    api("/streams/" + encodeURIComponent(id)).then(function (data) {
      paintWatch(id, data);
    }, function (err) {
      errorBox("Couldn't load this video", err.message || "Network error", renderWatch);
      var row = main.querySelector(".btn-row");
      if (row) {
        var btn = document.createElement("button");
        btn.className = "btn";
        btn.id = "err-official";
        btn.textContent = "Play with official YouTube player";
        btn.onclick = function () { officialOnly(id); };
        row.appendChild(btn);
      }
    });
  }

  function paintWatch(id, data) {
    var picked = pickStreams(data);
    var isLive = !!data.livestream;

    pushHistory({
      id: id, title: data.title,
      thumbnail: data.thumbnailUrl || "",
      uploader: data.uploader || "",
      duration: data.duration || 0
    });

    // ---- player ----
    var holder = main.querySelector(".player-holder");
    holder.querySelector("#player-ph").remove();
    var video = document.createElement("video");
    video.className = "player";
    video.controls = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.poster = imgUrl(data.thumbnailUrl, "");
    video.setAttribute("referrerpolicy", "no-referrer");
    holder.insertBefore(video, holder.firstChild);
    currentVideo = video;

    var defaultStream = picked.muxed[0] || null;
    if (prefs.quality !== "auto" && picked.muxed.length) {
      for (var i = 0; i < picked.muxed.length; i++) {
        if (qualityLabel(picked.muxed[i]) === prefs.quality) defaultStream = picked.muxed[i];
      }
    }

    // Ordered playback candidates: proxied best stream (school mode, if the
    // proxy is alive) → direct best stream → other direct renditions.
    var candidates = [];
    var candIdx = 0;
    if (defaultStream) {
      if (prefs.schoolMode && proxyAlive !== false) candidates.push(mediaUrl(defaultStream.url));
      candidates.push(defaultStream.url);
      for (var ci = 0; ci < picked.muxed.length && candidates.length < 6; ci++) {
        var cu = picked.muxed[ci].url;
        if (cu && cu !== defaultStream.url && candidates.indexOf(cu) < 0) candidates.push(cu);
      }
    }

    if (isLive && data.hls) {
      attachHls(video, data.hls);
    } else if (defaultStream) {
      video.src = candidates[0];
    } else if (data.hls) {
      attachHls(video, data.hls);
    } else {
      holder.innerHTML = '<div class="player-fallback">No playable stream from this server.<br>Try another server in Settings, turn School mode off,<br><br><button class="btn" id="official-btn">Play with official YouTube player</button></div>';
      document.getElementById("official-btn").onclick = function () { officialEmbed(id, holder); };
    }

    video.onerror = function () {
      // Step through every candidate before giving up to the official player.
      candIdx++;
      if (candIdx < candidates.length) {
        video.src = candidates[candIdx];
        video.play().catch(function () {});
      } else if (!document.getElementById("official-btn")) {
        var wrap = document.createElement("div");
        wrap.className = "player-fallback official-wrap";
        wrap.innerHTML = 'This stream is blocked or broken on this network.<br><br><button class="btn" id="official-btn">Play with official YouTube player</button>';
        holder.appendChild(wrap);
        document.getElementById("official-btn").onclick = function () { officialEmbed(id, holder); };
      }
    };

    // ---- info ----
    var chanPath = channelPathFromUrl(data.uploaderUrl);
    var saved = isLater(id);
    var info = document.getElementById("watch-info");
    var qOptions = '<option value="auto">Quality: Auto</option>';
    var seen = {};
    picked.muxed.forEach(function (s) {
      var label = qualityLabel(s);
      if (seen[label]) return;
      seen[label] = true;
      qOptions += '<option value="' + esc(label) + '"' +
        (defaultStream && qualityLabel(defaultStream) === label ? " selected" : "") + ">" + esc(label) + "</option>";
    });
    if (picked.audio.length) qOptions += '<option value="__audio">Audio only</option>';

    info.innerHTML =
      '<h1 class="watch-title">' + esc(data.title) + "</h1>" +
      '<div class="watch-row">' +
        '<div class="channel-chip" id="w-chan">' +
          (data.uploaderAvatar ? '<img referrerpolicy="no-referrer" src="' + esc(imgUrl(data.uploaderAvatar, "")) + '" alt="" />' : "") +
          "<div><div class='name'>" + esc(data.uploader || "") +
          (data.uploaderVerified ? " ✓" : "") + "</div>" +
          '<div class="subs">' + esc(data.uploaderSubscriberCount != null ? fmtNum(data.uploaderSubscriberCount) + " subscribers" : "") + "</div></div>" +
        "</div>" +
        '<div class="watch-actions">' +
          (isLive || picked.muxed.length === 0 ? "" : '<select class="pill" id="w-quality" aria-label="Quality">' + qOptions + "</select>") +
          '<button class="pill' + (saved ? " on" : "") + '" id="w-save">' + (saved ? "★ Saved" : "☆ Save") + "</button>" +
          '<button class="pill" id="w-share">⤴ Share</button>' +
          '<button class="pill' + (prefs.autoplay ? " on" : "") + '" id="w-auto">Autoplay: ' + (prefs.autoplay ? "On" : "Off") + "</button>" +
        "</div>" +
      "</div>" +
      '<div class="desc" id="w-desc"><div class="desc-meta">' +
        esc((data.views >= 0 ? fmtNum(data.views) + " views • " : "") +
          (data.uploadDate || "") +
          (data.likes >= 0 ? " • 👍 " + fmtNum(data.likes) : "")) +
      '</div><div class="desc-text">' + linkify(data.description || "No description.") + '</div>' +
      '<button class="desc-toggle" id="w-desc-toggle">…more</button></div>';

    document.getElementById("w-desc-toggle").onclick = function () {
      var d = document.getElementById("w-desc");
      d.classList.toggle("expanded");
      this.textContent = d.classList.contains("expanded") ? "Show less" : "…more";
    };
    if (chanPath) {
      document.getElementById("w-chan").onclick = function () { go("channel", { chan: chanPath }); };
    }
    var qSel = document.getElementById("w-quality");
    if (qSel) {
      qSel.onchange = function () {
        var val = qSel.value;
        prefs.quality = val;
        savePrefs();
        var t = video.currentTime || 0;
        var wasPlaying = !video.paused;
        if (val === "__audio") {
          var best = picked.audio.slice().sort(function (a, b) { return (b.bitrate || 0) - (a.bitrate || 0); })[0];
          if (best) { video.src = mediaUrl(best.url); candidates = proxyAlive === false ? [best.url] : [mediaUrl(best.url), best.url]; candIdx = 0; }
        } else {
          var target = picked.muxed[0];
          for (var k = 0; k < picked.muxed.length; k++) {
            if (qualityLabel(picked.muxed[k]) === val) target = picked.muxed[k];
          }
          if (val === "auto") target = picked.muxed[0];
          if (target) { video.src = mediaUrl(target.url); candidates = proxyAlive === false ? [target.url] : [mediaUrl(target.url), target.url]; candIdx = 0; }
        }
        video.currentTime = t;
        if (wasPlaying) video.play().catch(function () {});
      };
    }
    document.getElementById("w-save").onclick = function () {
      var added = toggleLater({ id: id, title: data.title, thumbnail: data.thumbnailUrl || "", uploader: data.uploader || "", duration: data.duration || 0 });
      this.classList.toggle("on", added);
      this.textContent = added ? "★ Saved" : "☆ Save";
      toast(added ? "Saved to Watch Later" : "Removed from Watch Later");
    };
    document.getElementById("w-share").onclick = function () {
      var link = new URL("./index.html", window.location.href).toString().split("?")[0] + "?v=" + id;
      function done() { toast("Link copied"); }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done, function () { prompt("Copy this link:", link); });
      } else prompt("Copy this link:", link);
    };
    document.getElementById("w-auto").onclick = function () {
      prefs.autoplay = !prefs.autoplay;
      savePrefs();
      this.classList.toggle("on", prefs.autoplay);
      this.textContent = "Autoplay: " + (prefs.autoplay ? "On" : "Off");
    };

    // ---- up next ----
    var related = (data.relatedStreams || []).filter(function (r) { return videoIdFromUrl(r.url); });
    upNext = related.map(function (r) { return videoIdFromUrl(r.url); });
    var un = document.getElementById("upnext-list");
    if (!related.length) {
      un.innerHTML = '<div class="empty">Nothing else here.</div>';
    } else {
      var uh = "";
      related.forEach(function (r) {
        var rid = videoIdFromUrl(r.url);
        uh +=
          '<div class="mini" data-video="' + esc(rid) + '">' +
            '<div class="thumb"><img loading="lazy" referrerpolicy="no-referrer" src="' + esc(imgUrl(r.thumbnail, "")) + '" alt="" />' +
            (r.duration > 0 ? '<span class="badge-dur">' + esc(fmtDur(r.duration)) + "</span>" : "") + "</div>" +
            "<div><p class='mini-title'>" + esc(r.title) + "</p>" +
            '<div class="mini-sub">' + esc(r.uploaderName || "") + (r.uploaderVerified ? " ✓" : "") + "<br>" + esc(metaLine(r)) + "</div></div>" +
          "</div>";
      });
      un.innerHTML = uh;
      bindCards(un);
    }

    video.addEventListener("ended", function () {
      if (prefs.autoplay && upNext.length) go("watch", { id: upNext[0] });
    });

    // ---- sponsor skip ----
    if (prefs.skipSponsors && !isLive) {
      api("/sponsors/" + encodeURIComponent(id) + "?category=sponsor").then(function (sb) {
        var segs = (sb.segments || []).filter(function (s) { return s.segment && s.segment.length === 2; });
        if (!segs.length) return;
        var chip = document.getElementById("skipper");
        video.addEventListener("timeupdate", function () {
          var t = video.currentTime;
          for (var s = 0; s < segs.length; s++) {
            if (t >= segs[s].segment[0] && t < segs[s].segment[1] - 0.3) {
              video.currentTime = segs[s].segment[1];
              sponsorsSkipped++;
              if (chip) {
                chip.style.display = "block";
                setTimeout(function () { chip.style.display = "none"; }, 1500);
              }
              break;
            }
          }
        });
      }, function () { /* sponsor data unavailable — ignore */ });
    }

    // ---- comments ----
    loadComments(id, null);
  }

  function loadComments(id, nextpage) {
    var box = document.getElementById("comments");
    var path = nextpage
      ? "/nextpage/comments/" + encodeURIComponent(id) + "?nextpage=" + encodeURIComponent(JSON.stringify(nextpage))
      : "/comments/" + encodeURIComponent(id);
    api(path).then(function (page) {
      var list = page.comments || [];
      var html = nextpage ? "" : "<h2>Comments" + (page.commentCount >= 0 ? " (" + fmtNum(page.commentCount) + ")" : "") + "</h2>";
      if (!nextpage && !list.length) {
        box.innerHTML = html + '<div class="empty">Comments are off or unavailable.</div>';
        return;
      }
      list.forEach(function (c) {
        html +=
          '<div class="comment">' +
            (c.thumbnail ? '<img loading="lazy" referrerpolicy="no-referrer" src="' + esc(imgUrl(c.thumbnail, "")) + '" alt="" />' : "") +
            "<div><div class='comment-head'><b>" + esc(c.author || "Unknown") + "</b><span>" +
            esc(c.commentedTime || c.commentTime || "") + "</span></div>" +
            '<div class="comment-body">' + esc(c.commentText || "") + "</div>" +
            (c.likeCount >= 0 ? '<div class="comment-likes">👍 ' + esc(fmtNum(c.likeCount)) + (c.replyCount > 0 ? " • " + c.replyCount + " replies" : "") + "</div>" : "") +
            "</div>" +
          "</div>";
      });
      if (nextpage) {
        var btn = document.getElementById("c-more");
        if (btn) btn.remove();
        var tmp = document.createElement("div");
        tmp.innerHTML = html;
        while (tmp.firstChild) box.appendChild(tmp.firstChild);
      } else box.innerHTML = html;
      if (page.nextpage) {
        var more = document.createElement("button");
        more.className = "load-more";
        more.id = "c-more";
        more.textContent = "Load more comments";
        more.onclick = function () { loadComments(id, page.nextpage); };
        box.appendChild(more);
      }
    }, function () {
      if (!nextpage) box.innerHTML = "<h2>Comments</h2><div class='empty'>Couldn't load comments.</div>";
    });
  }

  // ---------- channel ----------
  function renderChannel() {
    main.innerHTML = '<div id="chan"><div class="skel-line" style="width:40%;height:24px"></div>' + skeletonGrid(8) + "</div>";
    api("/" + state.chan).then(function (data) {
      paintChannel(data, null);
    }, function (err) {
      errorBox("Couldn't load channel", err.message || "Network error", renderChannel);
    });
  }

  function paintChannel(data, next) {
    var box = document.getElementById("chan");
    var chanId = null;
    if (data.id) chanId = data.id;
    var videos = data.relatedStreams || [];
    var html =
      (data.bannerUrl ? '<div class="chan-banner" style="background-image:url(\'' + esc(imgUrl(data.bannerUrl, "")).replace(/'/g, "%27") + '\')"></div>' : '<div class="chan-banner"></div>') +
      '<div class="chan-head">' +
        (data.avatarUrl ? '<img referrerpolicy="no-referrer" src="' + esc(imgUrl(data.avatarUrl, "")) + '" alt="" />' : "") +
        "<div><h1>" + esc(data.name || "Channel") + (data.verified ? " ✓" : "") + "</h1>" +
        '<div class="subs">' + esc((data.subscriberCount >= 0 ? fmtNum(data.subscriberCount) + " subscribers • " : "") + (data.videoCount >= 0 ? data.videoCount + " videos" : "")) + "</div></div>" +
      "</div>" +
      (data.description ? '<div class="desc"><div class="desc-text">' + linkify(data.description) + '</div></div>' : "") +
      '<div style="height:18px"></div><div class="grid" id="chan-grid"></div>' +
      '<button class="load-more" id="chan-more" style="display:none">Load more</button>';
    box.innerHTML = html;
    var grid = document.getElementById("chan-grid");
    function append(list) {
      var h = "";
      for (var i = 0; i < list.length; i++) h += cardHtml(list[i]);
      var tmp = document.createElement("div");
      tmp.innerHTML = h;
      while (tmp.firstChild) grid.appendChild(tmp.firstChild);
      bindCards(grid);
    }
    append(videos);
    var moreBtn = document.getElementById("chan-more");
    var nextTok = next !== undefined ? next : data.nextpage;
    if (nextTok && chanId) moreBtn.style.display = "block";
    moreBtn.onclick = function () {
      moreBtn.textContent = "Loading…";
      api("/nextpage/channel/" + encodeURIComponent(chanId) + "?nextpage=" + encodeURIComponent(JSON.stringify(nextTok)))
        .then(function (page) {
          append(page.relatedStreams || []);
          nextTok = page.nextpage || null;
          moreBtn.style.display = nextTok ? "block" : "none";
          moreBtn.textContent = "Load more";
        }, function () { moreBtn.textContent = "Load more"; });
    };
  }

  // ---------- history / later ----------
  function renderLocal(kind) {
    var list = kind === "history" ? getHistory() : getLater();
    var title = kind === "history" ? "Watch history" : "Watch Later";
    setActiveNav(kind === "history" ? "history" : "later");
    var html = '<div class="view-head"><h1>' + title + "</h1>" +
      (list.length ? '<button class="pill" id="clear-local">Clear all</button>' : "") + "</div>";
    if (!list.length) {
      main.innerHTML = html + '<div class="empty">' +
        (kind === "history" ? "Videos you watch will show up here." : "Tap ☆ Save on any video to keep it here.") + "</div>";
      return;
    }
    html += '<div class="rows">';
    list.forEach(function (it) {
      html +=
        '<div class="row" data-video="' + esc(it.id) + '">' +
          '<div class="thumb"><img loading="lazy" referrerpolicy="no-referrer" src="' + esc(imgUrl(it.thumbnail, "")) + '" alt="" />' +
          (it.duration > 0 ? '<span class="badge-dur">' + esc(fmtDur(it.duration)) + "</span>" : "") + "</div>" +
          '<div class="row-body"><p class="row-title">' + esc(it.title) + "</p>" +
          '<div class="row-sub">' + esc(it.uploader || "") + (it.ts ? " • " + timeAgo(it.ts) : "") + "</div></div>" +
        "</div>";
    });
    main.innerHTML = html + "</div>";
    bindCards();
    var clear = document.getElementById("clear-local");
    if (clear) {
      clear.onclick = function () {
        lsSet(kind === "history" ? "ggl_yt_history" : "ggl_yt_later", []);
        renderLocal(kind);
      };
    }
  }

  // ---------- settings ----------
  function renderSettings() {
    setActiveNav("settings");
    var instOptions = '<option value="auto"' + (prefs.instance === "auto" ? " selected" : "") + ">Auto (lounge proxy + fallback)</option>";
    DIRECT_INSTANCES.forEach(function (u) {
      instOptions += '<option value="' + esc(u) + '"' + (prefs.instance === u ? " selected" : "") + ">" + esc(u.replace("https://", "")) + "</option>";
    });
    var regionOpts = "";
    REGIONS.forEach(function (r) {
      regionOpts += '<option value="' + r[0] + '"' + (prefs.region === r[0] ? " selected" : "") + ">" + esc(r[1]) + "</option>";
    });
    main.innerHTML =
      '<div class="view-head"><h1>Settings</h1></div>' +
      '<div class="settings">' +
        '<div class="set-card"><h2>Unblock mode</h2><p>Route traffic through the lounge so school filters only see this site.</p>' +
          '<div class="set-row"><label>School mode<small>Stream video through the lounge domain. Turn off if videos buffer.</small></label>' +
          '<span class="switch"><input type="checkbox" id="set-school"' + (prefs.schoolMode ? " checked" : "") + "><i></i></span></div>" +
          '<div class="set-row"><label>Strict image proxy<small>Also proxy thumbnails. Use if pictures don\'t load at school.</small></label>' +
          '<span class="switch"><input type="checkbox" id="set-img"' + (prefs.strictImg ? " checked" : "") + "><i></i></span></div>" +
        "</div>" +
        '<div class="set-card"><h2>Playback</h2><p>How videos behave.</p>' +
          '<div class="set-row"><label>Skip sponsors<small>Auto-skip sponsor segments (SponsorBlock).</small></label>' +
          '<span class="switch"><input type="checkbox" id="set-sb"' + (prefs.skipSponsors ? " checked" : "") + "><i></i></span></div>" +
          '<div class="set-row"><label>Autoplay<small>Automatically play the next video.</small></label>' +
          '<span class="switch"><input type="checkbox" id="set-auto"' + (prefs.autoplay ? " checked" : "") + "><i></i></span></div>" +
        "</div>" +
        '<div class="set-card"><h2>Servers &amp; region</h2><p>Video data comes from community Piped servers. Switch if one is slow.</p>' +
          '<div class="set-row"><label>Server</label><select class="set-select" id="set-inst">' + instOptions + "</select></div>" +
          '<div class="set-row"><label>Trending region</label><select class="set-select" id="set-region">' + regionOpts + "</select></div>" +
          '<div class="set-row"><label>Connection</label><button class="pill" id="set-test">Test connection</button></div>' +
        "</div>" +
        '<div class="set-card"><h2>Data</h2><p>History and saved videos live only in this browser.</p>' +
          '<div class="set-row"><label>Local data</label><button class="danger" id="set-wipe">Clear history &amp; saved</button></div>' +
        "</div>" +
        '<div class="set-card"><h2>About</h2><p>GG Lounge video room v2. Powered by the open-source Piped API (' +
        '<a href="https://github.com/TeamPiped/Piped" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">TeamPiped/Piped</a>). ' +
        "No Google account, no ads, no tracking. Livestreams play from proxy URLs directly. " +
        (lastVia ? "Last served by: " + esc(lastVia) + "." : "") + "</p></div>" +
      "</div>";

    document.getElementById("set-school").onchange = function (e) {
      prefs.schoolMode = e.target.checked; savePrefs();
      toast(prefs.schoolMode ? "School mode on" : "School mode off");
    };
    document.getElementById("set-img").onchange = function (e) {
      prefs.strictImg = e.target.checked; savePrefs();
    };
    document.getElementById("set-sb").onchange = function (e) {
      prefs.skipSponsors = e.target.checked; savePrefs();
    };
    document.getElementById("set-auto").onchange = function (e) {
      prefs.autoplay = e.target.checked; savePrefs();
    };
    document.getElementById("set-inst").onchange = function (e) {
      prefs.instance = e.target.value; savePrefs();
      toast("Server updated");
    };
    document.getElementById("set-region").onchange = function (e) {
      prefs.region = e.target.value; savePrefs();
    };
    document.getElementById("set-test").onclick = function () {
      var btn = this;
      btn.textContent = "Testing…";
      setNet("", "Testing…");
      api("/trending?region=" + encodeURIComponent(prefs.region)).then(function (items) {
        btn.textContent = "Test connection";
        toast("Connected — " + (items ? items.length : 0) + " trending videos found");
      }, function (err) {
        btn.textContent = "Test connection";
        toast("Connection failed: " + (err.message || "offline"));
      });
    };
    document.getElementById("set-wipe").onclick = function () {
      lsSet("ggl_yt_history", []);
      lsSet("ggl_yt_later", []);
      toast("History & saved cleared");
    };
  }

  // ---------- router ----------
  function render() {
    if (state.view === "home" || state.view === "trending") renderHome();
    else if (state.view === "search") renderSearch();
    else if (state.view === "watch" && state.id) renderWatch();
    else if (state.view === "channel" && state.chan) renderChannel();
    else if (state.view === "history") renderLocal("history");
    else if (state.view === "later") renderLocal("later");
    else if (state.view === "settings") renderSettings();
    else renderHome();
  }

  // ---------- search box + suggestions ----------
  var suggestTimer = null;
  var suggestItems = [];
  var suggestActive = -1;

  function closeSuggest() {
    suggestBox.classList.remove("open");
    suggestBox.innerHTML = "";
    suggestItems = [];
    suggestActive = -1;
  }

  function doSearch(q) {
    q = (q || "").trim();
    if (!q) return;
    closeSuggest();
    searchInput.blur();
    go("search", { q: q, filter: "all" });
  }

  searchBtn.onclick = function () { doSearch(searchInput.value); };
  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      if (suggestActive >= 0 && suggestItems[suggestActive]) {
        searchInput.value = suggestItems[suggestActive];
      }
      doSearch(searchInput.value);
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!suggestItems.length) return;
      e.preventDefault();
      suggestActive += e.key === "ArrowDown" ? 1 : -1;
      if (suggestActive < 0) suggestActive = suggestItems.length - 1;
      if (suggestActive >= suggestItems.length) suggestActive = 0;
      var btns = suggestBox.querySelectorAll("button");
      for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("active", i === suggestActive);
      searchInput.value = suggestItems[suggestActive];
    } else if (e.key === "Escape") closeSuggest();
  });
  searchInput.addEventListener("input", function () {
    var q = searchInput.value.trim();
    clearTimeout(suggestTimer);
    if (q.length < 2) { closeSuggest(); return; }
    suggestTimer = setTimeout(function () {
      api("/suggestions?query=" + encodeURIComponent(q)).then(function (items) {
        if (!items || !items.length || document.activeElement !== searchInput) { closeSuggest(); return; }
        suggestItems = items.slice(0, 8);
        suggestActive = -1;
        suggestBox.innerHTML = "";
        suggestItems.forEach(function (s) {
          var b = document.createElement("button");
          b.textContent = s;
          b.onmousedown = function (e) { e.preventDefault(); searchInput.value = s; doSearch(s); };
          suggestBox.appendChild(b);
        });
        suggestBox.classList.add("open");
      }, function () { /* suggestions are optional */ });
    }, 250);
  });
  document.addEventListener("click", function (e) {
    if (!suggestBox.contains(e.target) && e.target !== searchInput) closeSuggest();
  });

  // ---------- nav ----------
  var navBtns = document.querySelectorAll("[data-nav]");
  for (var n = 0; n < navBtns.length; n++) {
    navBtns[n].addEventListener("click", function () {
      var v = this.getAttribute("data-nav");
      if (v === "home" || v === "trending") go(v);
      else go(v);
    });
  }
  document.getElementById("settings-btn").onclick = function () { go("settings"); };
  document.getElementById("brand-home").onclick = function (e) {
    e.preventDefault();
    go("home");
  };

  window.onerror = function (message) {
    toast("Something glitched: " + String(message).slice(0, 90));
  };

  // ---------- boot ----------
  probeProxy();
  state = bootFromUrl();
  setActiveNav(state.view);
  render();
})();
