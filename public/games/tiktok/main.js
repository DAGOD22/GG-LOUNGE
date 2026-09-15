"use strict";
/* ============================================================
   GG Lounge — TikTok Unblocked
   The feed and hashtag search are fetched by the lounge server (tikwm mirrors,
   with TikTok's own page payload as a rescue), and every playable URL is
   rewritten to /api/yt/media — so a student's browser only ever talks to the
   lounge. Themes, tab cloaking and the panic key come from /gg/gg-boot.js.
   ============================================================ */

(function () {
  var API = "/api/tt";
  var feed = document.getElementById("feed");
  var toasts = document.getElementById("toasts");

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
    schoolMode: true,
    region: "US",
    autoplay: true,
    muted: true,
    volume: 1
  }, lsGet("ggl_tt_prefs", {}));
  function savePrefs() { lsSet("ggl_tt_prefs", prefs); }

  (function bindProfile() {
    var gg = window.GG;
    if (!gg) { document.addEventListener("gg:ready", bindProfile, { once: true }); return; }
    try {
      var apply = function (s) {
        if (!s || !s.video) return;
        prefs.schoolMode = s.video.schoolMode !== false;
        prefs.region = s.video.region || "US";
        prefs.autoplay = s.video.autoplay !== false ? true : true; // feed always plays; keep the flag for future use
        savePrefs();
      };
      apply(gg.get());
      gg.subscribe(apply);
    } catch (e) { /* profile optional */ }
  })();

  var liked = lsGet("ggl_tt_liked", {});
  var saved = lsGet("ggl_tt_saved", {});
  var state = { mode: "feed", q: "", cursor: 0, items: [], loading: false, done: false, active: -1 };

  function toast(msg) {
    var el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    toasts.appendChild(el);
    setTimeout(function () { el.remove(); }, 2200);
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function fmt(n) {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(n);
  }
  function mediaOf(item) {
    // school mode: same-origin relay (default). Direct: only works if the
    // network lets TikTok's CDN through.
    return prefs.schoolMode ? item.play : (item.playDirect || item.play);
  }
  function coverOf(item) {
    return prefs.schoolMode ? item.cover : (item.coverDirect || item.cover);
  }
  function fetchJson(url, ms) {
    return new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error("timed out")); }, ms || 16000);
      fetch(url, { headers: { Accept: "application/json" } }).then(function (res) {
        clearTimeout(timer);
        res.text().then(function (text) {
          var data = text;
          try { data = JSON.parse(text); } catch (e) { /* keep */ }
          if (!res.ok) {
            var err = new Error((data && (data.detail || data.error)) || ("HTTP " + res.status));
            err.status = res.status;
            reject(err);
            return;
          }
          resolve(data || {});
        }, reject);
      }, function (err) { clearTimeout(timer); reject(err); });
    });
  }

  // ---------------------------------------------------------------- render --
  var ICONS = {
    like: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 20.7 4.6 13.6a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9a4.6 4.6 0 1 1 6.5 6.5z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.5-5.1A8 8 0 1 1 21 12z"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 12v7h16v-7"/><path d="M12 3v12"/><path d="m8 7 4-4 4 4"/></svg>',
    save: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.2L5 21V4a1 1 0 0 1 1-1z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>'
  };

  function captionHtml(text) {
    return esc(text || "")
      .replace(/#([\p{L}\p{N}_]+)/gu, '<span class="tag">#$1</span>')
      .replace(/@([\p{L}\p{N}._]+)/gu, '<span class="tag">@$1</span>');
  }

  function slideHtml(item, index) {
    var isLiked = !!liked[item.id];
    var isSaved = !!saved[item.id];
    return (
      '<div class="slide" data-index="' + index + '" data-id="' + esc(item.id) + '">' +
        '<div class="stage">' +
          '<div class="poster sharp" style="background-image:url(\'' + esc(coverOf(item)) + '\')"></div>' +
          '<div class="scrim"></div>' +
          '<div class="center-play">' + ICONS.play + '</div>' +
          '<div class="like-burst">' + ICONS.like + '</div>' +
          '<div class="meta">' +
            '<div class="who">@' + esc(item.author || "unknown") + (item.authorNickname && item.authorNickname !== item.author ? " · " + esc(item.authorNickname) : "") + '</div>' +
            '<p class="cap">' + captionHtml(item.title) + '<button class="more" data-more>more</button></p>' +
            (item.music ? '<div class="music"><span class="spin"></span><span>' + esc(item.music) + "</span></div>" : "") +
          "</div>" +
          '<div class="rail">' +
            '<div class="avatar"><img src="' + esc(item.authorAvatar || "") + '" alt="" onerror="this.style.display=\'none\'" /><span class="plus">+</span></div>' +
            '<button class="act like' + (isLiked ? " on" : "") + '" data-act="like">' + ICONS.like + "<span>" + fmt(item.likes) + "</span></button>" +
            '<button class="act" data-act="comment">' + ICONS.comment + "<span>" + fmt(item.comments) + "</span></button>" +
            '<button class="act save' + (isSaved ? " on" : "") + '" data-act="save">' + ICONS.save + "<span>" + fmt(0) + "</span></button>" +
            '<button class="act" data-act="share">' + ICONS.share + "<span>" + fmt(item.shares) + "</span></button>" +
          "</div>" +
          '<div class="bar"><i></i></div>' +
        "</div>" +
      "</div>"
    );
  }

  function paint() {
    if (!state.items.length && !state.loading) {
      feed.innerHTML =
        '<div class="slide"><div class="state"><div class="box">' +
        "<h2>No clips loaded</h2><p>" +
        (state.q ? 'Nothing came back for “' + esc(state.q) + '”.' : "The TikTok mirrors didn’t answer.") +
        ' The lounge server fetches these for you, so if this keeps happening the mirrors are having a bad day.' +
        "</p><div class=\"row\"><button class=\"btn\" data-retry>Try again</button>" +
        '<a class="btn ghost" href="/settings?tab=video">Video engine</a>' +
        '<a class="btn ghost" href="/games/youtube/index.html">YouTube room</a></div>' +
        "</div></div></div>";
      var retry = feed.querySelector("[data-retry]");
      if (retry) retry.onclick = function () { load(0, true); };
      return;
    }
    var html = "";
    for (var i = 0; i < state.items.length; i++) html += slideHtml(state.items[i], i);
    if (state.loading) {
      html += '<div class="slide"><div class="state"><div class="box"><div class="spinner"></div><p>Loading more clips…</p></div></div></div>';
    }
    feed.innerHTML = html;
    bindSlides();
    observe();
    if (state.active < 0) setActive(0);
  }

  var observers = null;
  function observe() {
    if (observers) { try { observers.disconnect(); } catch (e) { /* noop */ } observers = null; }
    if (!("IntersectionObserver" in window)) return;
    observers = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        var slide = en.target;
        var index = Number(slide.getAttribute("data-index"));
        if (en.isIntersecting && en.intersectionRatio > 0.6) {
          setActive(index);
          if (index >= state.items.length - 3) maybeLoadMore();
        } else {
          pause(slide);
        }
      });
    }, { root: feed, threshold: [0, 0.6, 1] });
    var slides = feed.querySelectorAll(".slide[data-index]");
    for (var i = 0; i < slides.length; i++) observers.observe(slides[i]);
  }

  function pause(slide) {
    var v = slide && slide.querySelector("video");
    if (v) { try { v.pause(); } catch (e) { /* noop */ } }
  }

  function setActive(index) {
    if (index === state.active) return;
    state.active = index;
    var slides = feed.querySelectorAll(".slide");
    for (var i = 0; i < slides.length; i++) {
      var v = slides[i].querySelector("video");
      if (!v) continue;
      if (i === index) {
        ensurePlayer(state.items[i], slides[i]);
        v.currentTime = v.dataset.resumeAt ? Number(v.dataset.resumeAt) : 0;
        v.muted = prefs.muted;
        v.volume = prefs.volume;
        var p = v.play();
        if (p && p.catch) p.catch(function () { v.muted = true; v.play().catch(function () {}); });
      } else {
        v.dataset.resumeAt = String(v.currentTime || 0);
        try { v.pause(); } catch (e) { /* noop */ }
      }
    }
  }

  /** Videos are only mounted for the slides that actually get attention. */
  function ensurePlayer(item, slide) {
    if (!item) return;
    if (slide.querySelector("video")) return;
    var poster = slide.querySelector(".poster");
    var video = document.createElement("video");
    video.src = mediaOf(item);
    video.loop = true;
    video.playsInline = true;
    video.muted = prefs.muted;
    video.preload = "auto";
    video.setAttribute("playsinline", "");
    video.setAttribute("referrerpolicy", "no-referrer");
    if (poster) video.dataset.poster = "1";
    slide.insertBefore(video, slide.querySelector(".scrim"));
    video.addEventListener("loadeddata", function () { if (poster) poster.classList.remove("sharp"); });
    video.addEventListener("timeupdate", function () {
      var bar = slide.querySelector(".bar i");
      if (bar && video.duration) bar.style.width = (video.currentTime / video.duration) * 100 + "%";
    });
    video.addEventListener("error", function () {
      // proxied link dead? fall back to the mirror URL once.
      if (!video.dataset.fellBack) {
        video.dataset.fellBack = "1";
        var alt = prefs.schoolMode ? item.playDirect : item.play;
        if (alt) { video.src = alt; video.play().catch(function () {}); return; }
      }
      var st = slide.querySelector(".state");
      if (!st) {
        var box = document.createElement("div");
        box.className = "state";
        box.innerHTML = '<div class="box"><h2>Clip unavailable</h2><p>This file refused to play. Swipe for the next one, or turn School mode off in lounge settings.</p></div>';
        slide.appendChild(box);
      }
    });
  }

  function bindSlides() {
    var slides = feed.querySelectorAll(".slide[data-index]");
    for (var i = 0; i < slides.length; i++) {
      (function (slide) {
        var index = Number(slide.getAttribute("data-index"));
        var item = state.items[index];
        if (!item) return;

        // tap = pause/play, double tap = like
        var lastTap = 0;
        slide.addEventListener("click", function (e) {
          if (e.target.closest("[data-act],[data-more],a")) return;
          var now = Date.now();
          if (now - lastTap < 280) { toggleLike(item, slide); lastTap = 0; return; }
          lastTap = now;
          var v = slide.querySelector("video");
          if (!v) return;
          if (v.paused) { v.play().catch(function () {}); slide.classList.remove("paused"); }
          else { v.pause(); slide.classList.add("paused"); }
        });

        var more = slide.querySelector("[data-more]");
        if (more) {
          more.onclick = function (e) {
            e.stopPropagation();
            var cap = slide.querySelector(".cap");
            cap.classList.toggle("expanded");
            more.textContent = cap.classList.contains("expanded") ? "less" : "more";
          };
        }

        var acts = slide.querySelectorAll("[data-act]");
        for (var a = 0; a < acts.length; a++) {
          (function (btn) {
            btn.onclick = function (e) {
              e.stopPropagation();
              var kind = btn.getAttribute("data-act");
              if (kind === "like") toggleLike(item, slide);
              else if (kind === "save") toggleSave(item, btn);
              else if (kind === "share") share(item);
              else if (kind === "comment") toast("Comments live on TikTok — this room is play-only, no login.");
            };
          })(acts[a]);
        }
      })(slides[i]);
    }
  }

  function toggleLike(item, slide) {
    liked[item.id] = !liked[item.id];
    if (!liked[item.id]) delete liked[item.id];
    lsSet("ggl_tt_liked", liked);
    var btn = slide.querySelector('[data-act="like"]');
    if (btn) {
      btn.classList.toggle("on", !!liked[item.id]);
      var span = btn.querySelector("span");
      if (span) span.textContent = fmt(Math.max(0, (Number(item.likes) || 0) + (liked[item.id] ? 1 : 0)));
    }
    var burst = slide.querySelector(".like-burst");
    if (burst && liked[item.id]) {
      burst.classList.remove("go");
      void burst.offsetWidth;
      burst.classList.add("go");
    }
  }

  function toggleSave(item, btn) {
    saved[item.id] = !saved[item.id];
    if (!saved[item.id]) delete saved[item.id];
    lsSet("ggl_tt_saved", saved);
    if (btn) {
      btn.classList.toggle("on", !!saved[item.id]);
      var count = Object.keys(saved).length;
      var span = btn.querySelector("span");
      if (span) span.textContent = fmt(count);
    }
    toast(saved[item.id] ? "Saved to this browser" : "Removed");
  }

  function share(item) {
    var link = item.author
      ? "https://www.tiktok.com/@" + item.author + "/video/" + item.id
      : "https://www.tiktok.com/@tiktok/video/" + item.id;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () { toast("TikTok link copied"); }, function () { window.prompt("Copy link", link); });
    } else window.prompt("Copy link", link);
  }

  // ------------------------------------------------------------------ data --
  function load(cursor, reset) {
    if (state.loading) return;
    state.loading = true;
    if (reset) { state.items = []; state.done = false; paint(); }
    else { paint(); }
    var url = state.q
      ? API + "/search?q=" + encodeURIComponent(state.q) + "&cursor=" + (cursor || 0)
      : API + "/feed?cursor=" + (cursor || 0) + "&region=" + encodeURIComponent(prefs.region);
    fetchJson(url).then(function (data) {
      var items = (data.items || []).filter(function (it) { return it && it.play; });
      state.items = reset ? items : state.items.concat(items);
      state.cursor = Number(data.cursor || (cursor || 0) + 30);
      state.loading = false;
      state.done = !items.length;
      paint();
      if (items.length && document.querySelector(".slide")) {
        var v = feed.querySelector(".slide video");
        if (!v) ensurePlayer(state.items[0], feed.querySelector(".slide"));
      }
    }, function (err) {
      state.loading = false;
      state.error = err.message || "offline";
      paint();
      toast("Feed failed: " + (err.message || "offline"));
    });
  }

  function maybeLoadMore() {
    if (state.loading || state.done) return;
    load(state.cursor, false);
  }

  // ------------------------------------------------------------- controls --
  var mutedBtn = document.getElementById("btn-sound");
  function paintMuteIcon() {
    if (!mutedBtn) return;
    mutedBtn.innerHTML = prefs.muted
      ? '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h3l4-4v14l-4-4H4z"/><path d="m16 9 5 6M21 9l-5 6"/></svg>'
      : '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 9h3l4-4v14l-4-4H4z"/><path d="M16 9.5a3.5 3.5 0 0 1 0 5"/><path d="M18.5 7a7 7 0 0 1 0 10"/></svg>';
    mutedBtn.setAttribute("title", prefs.muted ? "Unmute (M)" : "Mute (M)");
  }
  if (mutedBtn) {
    mutedBtn.onclick = function () {
      prefs.muted = !prefs.muted;
      savePrefs();
      paintMuteIcon();
      var v = feed.querySelector(".slide video");
      if (v) {
        v.muted = prefs.muted;
        if (!prefs.muted && v.paused) v.play().catch(function () { prefs.muted = true; v.muted = true; paintMuteIcon(); toast("Unmute blocked until you tap again"); });
      }
      if (!prefs.muted) toast("Sound on");
    };
  }
  paintMuteIcon();

  var reloadBtn = document.getElementById("btn-reload");
  if (reloadBtn) reloadBtn.onclick = function () { toast("Refreshing feed"); load(0, true); };

  var searchWrap = document.getElementById("search-wrap");
  var searchInput = document.getElementById("search-input");
  var searchBtn = document.getElementById("btn-search");
  var searchForm = document.getElementById("search-form");
  function toggleSearch(force) {
    searchWrap.classList.toggle("open", force === undefined ? !searchWrap.classList.contains("open") : force);
    if (searchWrap.classList.contains("open")) setTimeout(function () { searchInput.focus(); }, 30);
    else searchInput.blur();
  }
  if (searchBtn) searchBtn.onclick = function () { toggleSearch(); };
  if (searchForm) {
    searchForm.onsubmit = function (e) {
      e.preventDefault();
      var q = (searchInput.value || "").trim();
      if (!q) { state.q = ""; setTab("foryou"); load(0, true); return; }
      state.q = q;
      toggleSearch(false);
      feed.scrollTop = 0;
      load(0, true);
      toast('Searching “' + q + '”');
    };
  }

  var tabFy = document.getElementById("tab-foryou");
  var tabTr = document.getElementById("tab-trending");
  function setTab(which) {
    if (tabFy) { tabFy.classList.toggle("active", which === "foryou"); tabFy.setAttribute("aria-selected", which === "foryou" ? "true" : "false"); }
    if (tabTr) { tabTr.classList.toggle("active", which === "trending"); tabTr.setAttribute("aria-selected", which === "trending" ? "true" : "false"); }
  }
  if (tabFy) tabFy.onclick = function () { state.q = ""; setTab("foryou"); load(0, true); };
  if (tabTr) {
    tabTr.onclick = function () {
      state.q = "trending";
      setTab("trending");
      load(0, true);
    };
  }

  feed.addEventListener("scroll", function () {
    // wheel/keyboard scrolling is native; this just tops up the tail
    if (feed.scrollTop + feed.clientHeight * 1.6 > feed.scrollHeight) maybeLoadMore();
  }, { passive: true });

  window.addEventListener("keydown", function (e) {
    if (e.target === searchInput) { if (e.key === "Escape") toggleSearch(false); return; }
    var slide = feed.querySelector(".slide[data-index='" + state.active + "']");
    var v = slide && slide.querySelector("video");
    if (e.key === "ArrowDown") { e.preventDefault(); step(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); step(-1); }
    else if (e.key === " ") {
      e.preventDefault();
      if (v) { if (v.paused) { v.play().catch(function () {}); slide.classList.remove("paused"); } else { v.pause(); slide.classList.add("paused"); } }
    } else if (e.key === "m" || e.key === "M") {
      if (mutedBtn) mutedBtn.click();
    } else if (e.key === "l" || e.key === "L") {
      if (slide && state.items[state.active]) toggleLike(state.items[state.active], slide);
    } else if (e.key === "s" || e.key === "S") {
      var btn = slide && slide.querySelector('[data-act="save"]');
      if (btn && state.items[state.active]) toggleSave(state.items[state.active], btn);
    } else if (e.key === "/") {
      e.preventDefault();
      toggleSearch(true);
    } else if (e.key === "Escape") {
      toggleSearch(false);
    }
  });

  function step(dir) {
    var target = Math.max(0, Math.min(state.items.length - 1, state.active + dir));
    var slide = feed.querySelector(".slide[data-index='" + target + "']");
    if (slide) slide.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (target >= state.items.length - 1) maybeLoadMore();
  }

  // first interaction unmutes nothing but satisfies autoplay policies
  document.addEventListener(
    "pointerdown",
    function once() {
      document.removeEventListener("pointerdown", once);
      var v = feed.querySelector(".slide video");
      if (v && v.paused) v.play().catch(function () {});
    },
    { once: true }
  );

  window.onerror = function (msg) { toast("Something glitched: " + String(msg).slice(0, 80)); };

  // ------------------------------------------------------------------ boot --
  feed.innerHTML = '<div class="slide"><div class="stage"><div class="state"><div class="box"><div class="spinner"></div><p>Tuning in…</p></div></div></div></div>';
  load(0, true);
})();
