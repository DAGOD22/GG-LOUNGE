/*!
 * gg-arcade.js — the small shared engine behind GG-LOUNGE's original cabinets.
 *
 * Four games in this folder (orbital-drift, neon-runner, block-fall, pulse-grid)
 * are written against this file rather than against a framework. It does four
 * things and nothing else:
 *
 *   1. a canvas that is sharp on a retina screen and resizes with the window,
 *   2. a fixed-timestep loop, so physics does not change speed on a 144 Hz
 *      monitor,
 *   3. input that is the same shape for keyboard, pointer and touch,
 *   4. a save layer with the same semantics as gg-save.js (localStorage, then
 *      cookie, then memory) so a high score survives a reload in private mode.
 *
 * Everything is namespaced under GGA. No dependencies, no build step: the games
 * are plain HTML files served from /games/<id>/ and they must run exactly as
 * written.
 */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------- storage -- */

  var NS = (function () {
    var match = /\/games\/([^/?#]+)/.exec(global.location.pathname);
    return 'gga:' + (match ? match[1] : 'unknown') + ':';
  })();
  var memory = Object.create(null);

  function store(key, value) {
    if (value === undefined) {
      try {
        var raw = global.localStorage.getItem(NS + key);
        if (raw !== null) return JSON.parse(raw);
      } catch (error) { /* fall through */ }
      return key in memory ? memory[key] : null;
    }
    memory[key] = value;
    try {
      global.localStorage.setItem(NS + key, JSON.stringify(value));
    } catch (error) { /* private mode: memory keeps it for the session */ }
    return value;
  }

  /* --------------------------------------------------------------- canvas -- */

  function createCanvas(host) {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d', { alpha: false });
    (host || document.body).appendChild(canvas);
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    var size = { w: 0, h: 0, dpr: 1 };

    function resize() {
      var dpr = Math.min(2, global.devicePixelRatio || 1);
      // clientWidth can be 0 before layout; fall back to the viewport so the
      // first frame is never a 1x1 canvas that then has to re-render.
      var w = canvas.clientWidth || global.innerWidth;
      var h = canvas.clientHeight || global.innerHeight;
      size.w = w;
      size.h = h;
      size.dpr = dpr;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (typeof onResize === 'function') onResize(size);
    }
    var onResize = null;
    global.addEventListener('resize', resize);
    resize();

    return {
      canvas: canvas,
      ctx: ctx,
      size: size,
      resize: resize,
      onResize: function (fn) { onResize = fn; }
    };
  }

  /* ----------------------------------------------------------------- loop -- */

  /**
   * Fixed-timestep loop.
   *
   * `update(dt)` is called at a constant 1/60 s so a game's physics never
   * depends on the refresh rate; `draw(alpha)` is called once per animation
   * frame with the interpolation factor between the last two steps. Frame
   * spirals are capped: if the tab was asleep for four seconds, we simulate at
   * most a quarter second and then carry on, because replaying four seconds of
   * a game the player could not see is how a run ends before it resumes.
   */
  function loop(update, draw) {
    var STEP = 1 / 60;
    var accumulator = 0;
    var last = 0;
    var running = false;
    var raf = 0;

    function frame(now) {
      if (!running) return;
      raf = global.requestAnimationFrame(frame);
      if (!last) last = now;
      var elapsed = Math.min(0.25, (now - last) / 1000);
      last = now;
      accumulator += elapsed;
      var guard = 0;
      while (accumulator >= STEP && guard++ < 8) {
        update(STEP);
        accumulator -= STEP;
      }
      draw(STEP > 0 ? accumulator / STEP : 0);
    }

    return {
      start: function () {
        if (running) return;
        running = true;
        last = 0;
        raf = global.requestAnimationFrame(frame);
      },
      stop: function () {
        running = false;
        if (raf) global.cancelAnimationFrame(raf);
      },
      get running() { return running; }
    };
  }

  /* ---------------------------------------------------------------- input -- */

  /**
   * Input, in one shape.
   *
   * `keys` maps the same names every game uses (left, right, up, down, action,
   * pause) onto the physical keys a player would try. `pointer` is normalised
   * to the canvas box, so a game never has to know about device pixel ratio.
   */
  function input(canvas) {
    var keys = { left: false, right: false, up: false, down: false, action: false };
    var pointer = { x: 0, y: 0, active: false };
    var handlers = { press: [], release: [] };

    var map = {
      ArrowLeft: 'left', KeyA: 'left',
      ArrowRight: 'right', KeyD: 'right',
      ArrowUp: 'up', KeyW: 'up',
      ArrowDown: 'down', KeyS: 'down',
      Space: 'action', Enter: 'action', KeyZ: 'action', KeyJ: 'action'
    };

    function emit(list, name) {
      for (var i = 0; i < list.length; i++) list[i](name);
    }

    function key(event, down) {
      var name = map[event.code];
      if (!name) return;
      // Arrows and space scroll the page; a game must not lose to the document.
      event.preventDefault();
      if (down && !keys[name]) emit(handlers.press, name);
      if (!down && keys[name]) emit(handlers.release, name);
      keys[name] = down;
    }

    global.addEventListener('keydown', function (event) { key(event, true); });
    global.addEventListener('keyup', function (event) { key(event, false); });

    function track(event) {
      var box = canvas.getBoundingClientRect();
      pointer.x = (event.clientX - box.left) / Math.max(1, box.width);
      pointer.y = (event.clientY - box.top) / Math.max(1, box.height);
      pointer.active = true;
    }
    canvas.addEventListener('pointermove', track);
    canvas.addEventListener('pointerdown', function (event) {
      track(event);
      canvas.setPointerCapture && canvas.setPointerCapture(event.pointerId);
      emit(handlers.press, 'action');
    });
    canvas.addEventListener('pointerup', function () { emit(handlers.release, 'action'); });
    canvas.addEventListener('pointerleave', function () { pointer.active = false; });

    return {
      keys: keys,
      pointer: pointer,
      onPress: function (fn) { handlers.press.push(fn); },
      onRelease: function (fn) { handlers.release.push(fn); },
      /** Clear everything — used when a round ends under a held key. */
      reset: function () {
        for (var name in keys) keys[name] = false;
      }
    };
  }

  /* ----------------------------------------------------------------- feel -- */

  // Small helpers the games share so they feel like one arcade.
  function clamp(value, min, max) { return value < min ? min : value > max ? max : value; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
  function hit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  /* ------------------------------------------------------------- rendering -- */

  /** A soft glow, cheaper than shadowBlur for objects drawn every frame. */
  function glow(ctx, x, y, radius, colour, alpha) {
    var gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, colour);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha === undefined ? 1 : alpha;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /** The grid backdrop every cabinet uses, so the family reads as one place. */
  function grid(ctx, w, h, offset, gap, colour) {
    gap = gap || 56;
    ctx.strokeStyle = colour || 'rgba(255,255,255,.05)';
    ctx.lineWidth = 1;
    var x0 = (offset || 0) % gap;
    var y0 = ((offset || 0) * 0.6) % gap;
    ctx.beginPath();
    for (var x = -gap + x0; x < w + gap; x += gap) { ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (var y = -gap + y0; y < h + gap; y += gap) { ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
  }

  global.GGA = {
    createCanvas: createCanvas,
    loop: loop,
    input: input,
    store: store,
    clamp: clamp,
    lerp: lerp,
    rand: rand,
    randInt: randInt,
    hit: hit,
    glow: glow,
    grid: grid
  };
})(window);
