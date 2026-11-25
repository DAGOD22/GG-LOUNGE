/**
 * Feature 9 — the Instant Arcade Lab.
 *
 * Generates a complete, playable canvas micro-game from a seed: a shooter, a
 * dodger or a platformer, with its own palette, enemy behaviour and title. It is
 * a generator, not a template — the point is that two seeds produce two games
 * that differ in how they play, not two skins of the same loop.
 *
 * It emits a *document string* rather than a React component so the result can
 * be dropped into the same sandboxed iframe the code sandbox uses. That also
 * means the game is a real HTML file a person can download and keep.
 */

export type MicroGame = {
  id: string;
  title: string;
  kind: 'shooter' | 'dodger' | 'climber';
  seed: number;
  difficulty: number;
  document: string;
};

const PALETTES = [
  { bg: '#0b0d12', fg: '#bef264', accent: '#7dd3ff', danger: '#ff7a7a' },
  { bg: '#0d0b16', fg: '#c4b5fd', accent: '#f0abfc', danger: '#fca5a5' },
  { bg: '#08120f', fg: '#6ee7b7', accent: '#fde68a', danger: '#fb7185' },
  { bg: '#120b0b', fg: '#fdba74', accent: '#93c5fd', danger: '#f87171' },
  { bg: '#0a1020', fg: '#7dd3fc', accent: '#a7f3d0', danger: '#fda4af' },
];

const NAMES = [
  ['Neon', 'Orbit', 'Signal', 'Static', 'Echo', 'Vector', 'Quantum', 'Prism', 'Nova', 'Flux'],
  ['Drift', 'Runner', 'Cascade', 'Bloom', 'Fall', 'Pulse', 'Rift', 'Sweep', 'Gambit', 'Loop'],
];

/** A small deterministic PRNG, so a seed is a game and not a lottery. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateGame(seed = Math.floor(Math.random() * 1e9)): MicroGame {
  const random = mulberry32(seed);
  const palette = PALETTES[Math.floor(random() * PALETTES.length)];
  const kind = (['shooter', 'dodger', 'climber'] as const)[Math.floor(random() * 3)];
  const title = `${NAMES[0][Math.floor(random() * NAMES[0].length)]} ${NAMES[1][Math.floor(random() * NAMES[1].length)]}`;
  const difficulty = Math.round((0.6 + random() * 2.4) * 10) / 10;
  const id = `lab-${seed.toString(36)}`;
  return { id, title, kind, seed, difficulty, document: buildDocument({ title, kind, palette, difficulty, seed }) };
}

function buildDocument(game: {
  title: string;
  kind: MicroGame['kind'];
  palette: (typeof PALETTES)[number];
  difficulty: number;
  seed: number;
}): string {
  const { title, kind, palette, difficulty, seed } = game;
  // The loop is deliberately plain: one canvas, one rAF, no libraries. A
  // generated game that needs a bundler is not an "instant" anything.
  const rules =
    kind === 'shooter'
      ? `
        // Aim with the pointer, fire with a click or the space bar.
        spawnEvery = 620 / difficulty;
        player.x = W / 2; player.y = H - 56;
        player.r = 12;
      `
      : kind === 'dodger'
        ? `
        // Move with WASD or the arrow keys; touch anything and the run ends.
        spawnEvery = 460 / difficulty;
        player.x = W / 2; player.y = H - 64;
        player.r = 10;
      `
        : `
        // Climb: hold space to jump, land on the ledges.
        spawnEvery = 900 / difficulty;
        player.x = 40; player.y = H - 60;
        player.r = 11;
        gravity = 0.62;
      `;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  html,body{margin:0;height:100%;background:${palette.bg};overflow:hidden;font-family:ui-sans-serif,system-ui,sans-serif}
  canvas{display:block;width:100%;height:100%;touch-action:none}
  #hud{position:fixed;left:12px;top:10px;color:${palette.fg};font:800 13px/1.4 ui-monospace,monospace;letter-spacing:.06em;pointer-events:none;text-shadow:0 2px 12px rgba(0,0,0,.6)}
  #over{position:fixed;inset:0;display:none;place-items:center;background:rgba(4,6,10,.78);color:#fff;text-align:center;font:700 16px/1.6 ui-sans-serif,system-ui,sans-serif}
  #over div{max-width:320px;padding:22px}
  button{margin-top:14px;padding:9px 18px;border-radius:10px;border:0;background:${palette.fg};color:#0b0d12;font-weight:900;font-size:14px;cursor:pointer}
</style></head>
<body>
<canvas id="c"></canvas>
<div id="hud">${title.toUpperCase()} · <span id="score">0</span></div>
<div id="over"><div><strong>Run over.</strong><br>Score <span id="final">0</span><br><button id="again">Again</button></div></div>
<script>
(function(){
  var c = document.getElementById('c'), x = c.getContext('2d');
  var scoreEl = document.getElementById('score'), over = document.getElementById('over'), finalEl = document.getElementById('final');
  var W = 0, H = 0, dpr = Math.min(2, window.devicePixelRatio || 1);
  function resize(){
    W = c.clientWidth; H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr;
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize); resize();

  var seed = ${seed};
  function rand(){ seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }

  var player = { x: 0, y: 0, r: 12, vy: 0 }, things = [], score = 0, dead = false;
  var gravity = 0, spawnEvery = 600, spawnAt = 0, last = 0, keys = {}, pointer = { x: 0, y: 0 }, t = 0;
  var kind = '${kind}', speed = ${difficulty};
  var difficulty = ${difficulty};
  ${rules}

  function reset(){
    dead = false; things = []; score = 0; spawnAt = 0;
    player.vy = 0; player.x = W / 2; player.y = kind === 'climber' ? H - 60 : H - 64;
    over.style.display = 'none'; scoreEl.textContent = '0';
  }
  function spawn(){
    if (kind === 'climber') {
      things.push({ x: W, y: H - 30 - rand() * (H - 120), w: 70 + rand() * 60, h: 10 });
    } else if (kind === 'shooter') {
      things.push({ x: rand() * (W - 40) + 20, y: -20, r: 10, vy: (1.1 + rand() * 1.4) * speed * .6, hostile: true });
    } else {
      things.push({ x: rand() * (W - 40) + 20, y: -20, r: 12 + rand() * 10, vy: (1.4 + rand() * 2) * speed * .7, hostile: true });
    }
  }

  function shoot(){
    if (kind !== 'shooter') return;
    things.push({ x: player.x, y: player.y - 14, r: 4, vy: -9, good: true });
  }

  function onKey(e, down){
    keys[e.code] = down;
    if (down && e.code === 'Space') { e.preventDefault(); if (kind === 'climber') player.vy = -9.4; else shoot(); }
  }
  window.addEventListener('keydown', function(e){ onKey(e, true); });
  window.addEventListener('keyup', function(e){ onKey(e, false); });
  c.addEventListener('pointermove', function(e){ pointer.x = e.clientX; pointer.y = e.clientY; player.x += (pointer.x - player.x) * (kind === 'shooter' ? .22 : 0); });
  c.addEventListener('pointerdown', function(){ if (kind === 'climber') player.vy = -9.4; else shoot(); });
  document.getElementById('again').addEventListener('click', reset);

  function step(now){
    requestAnimationFrame(step);
    var dt = Math.min(32, now - last || 16); last = now; t += dt;
    if (dead) { draw(); return; }

    if (kind !== 'shooter') {
      if (keys.ArrowLeft || keys.KeyA) player.x -= dt * 0.34;
      if (keys.ArrowRight || keys.KeyD) player.x += dt * 0.34;
    }
    if (kind === 'climber') {
      player.vy += gravity; player.y += player.vy;
      if (player.y > H - 40) { player.y = H - 40; player.vy = 0; player.x -= dt * 0.12; }
      for (var i = 0; i < things.length; i++) {
        var p = things[i];
        p.x -= dt * 0.08 * speed;
        // Land on a ledge only while falling.
        if (player.vy > 0 && player.y + player.r > p.y && player.y + player.r < p.y + p.h + 16
            && player.x > p.x - 10 && player.x < p.x + p.w + 10) { player.vy = 0; player.y = p.y - player.r; }
      }
      things = things.filter(function(p){ return p.x + p.w > -10; });
      if (player.x < -20) { end(); }
    }
    player.x = Math.max(player.r, Math.min(W - player.r, player.x));

    if (now > spawnAt) { spawn(); spawnAt = now + spawnEvery; }

    for (var j = things.length - 1; j >= 0; j--) {
      var o = things[j];
      o.y += o.vy || 0;
      if (o.y > H + 40) { things.splice(j, 1); continue; }
      var hit = Math.hypot(o.x - player.x, o.y - player.y) < (o.r || 8) + player.r;
      if (hit && o.hostile) { end(); return; }
      if (hit && o.good) {
        // A bullet that reaches a hostile clears it.
        for (var k = things.length - 1; k >= 0; k--) {
          var other = things[k];
          if (other.hostile && Math.hypot(other.x - o.x, other.y - o.y) < (other.r || 8) + 8) { things.splice(k, 1); score += 10; scoreEl.textContent = score; break; }
        }
        things.splice(j, 1);
      }
    }
    if (kind === 'shooter' && now % 1000 < 17) score += 1;
    scoreEl.textContent = score;
    draw();
  }

  function end(){ dead = true; finalEl.textContent = score; over.style.display = 'grid'; }

  function draw(){
    x.fillStyle = '${palette.bg}'; x.fillRect(0, 0, W, H);
    // A faint grid gives the eye motion feedback even when nothing moves.
    x.strokeStyle = 'rgba(255,255,255,.045)'; x.lineWidth = 1;
    var gap = 48;
    for (var gx = (t * 0.012) % gap; gx < W; gx += gap) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, H); x.stroke(); }
    for (var gy = (t * 0.02) % gap; gy < H; gy += gap) { x.beginPath(); x.moveTo(0, gy); x.lineTo(W, gy); x.stroke(); }

    things.forEach(function(o){
      x.beginPath();
      if (o.w) { x.fillStyle = '${palette.accent}'; x.fillRect(o.x, o.y, o.w, o.h); return; }
      x.fillStyle = o.good ? '${palette.fg}' : '${palette.danger}';
      x.arc(o.x, o.y, o.r || 8, 0, 7); x.fill();
    });
    x.beginPath(); x.fillStyle = '${palette.fg}';
    if (kind === 'climber') { x.fillRect(player.x - player.r, player.y - player.r, player.r * 2, player.r * 2); }
    else { x.arc(player.x, player.y, player.r, 0, 7); x.fill(); }
  }

  reset(); requestAnimationFrame(step);
})();
</script>
</body></html>`;
}
