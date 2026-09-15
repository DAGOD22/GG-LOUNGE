/* =============================================================================
   GG-LOUNGE · gg-boot.js
   The lounge's client-side "stealth + style" engine. Plain JS, zero deps, so it
   runs identically on the Next.js pages, the YouTube room, the TikTok room and
   inside game iframes. Everything the Settings page controls lives here:

     1. Tab cloaking      — title + favicon (presets or fully custom), PWA/app
                           name + icon, about:blank window cloak.
     2. Panic key         — any key/combo → jump to a safe URL, open a new tab,
                           or snap to an instant fake page. Optional blur-panic.
     3. Themes            — 18 real themes (colours, surfaces, type, glow).
     4. Backgrounds       — 20 animated canvas backgrounds that react to the
                           cursor and keyboard, stock photos/videos, and your own
                           uploaded photo/video (stored locally in this browser).
     5. Video engine      — school mode / provider / quality for YouTube + TikTok.

   Settings are stored in localStorage under one key and mirrored across frames
   (storage events + BroadcastChannel), so changing a theme in the lounge changes
   it in the YouTube room too.
   ========================================================================== */
(function () {
  'use strict';

  var VERSION = 3;
  var KEY = 'gg.settings.v' + VERSION;
  var LEGACY_KEYS = ['gg.settings.v2', 'gg.settings.v1'];
  var BROADCAST = 'gg-settings';
  var STYLE_ID = 'gg-theme-style';
  var LAYER_ID = 'gg-bg-layer';

  // --------------------------------------------------------------- presets --
  // Cloak presets: tab title + favicon. `icon` is fetched through the lounge's
  // image relay so a school filter can't block the favicon itself.
  var CLOAKS = [
    { id: 'classroom', name: 'Google Classroom', short: 'Classroom', icon: 'https://ssl.gstatic.com/atari/images/public/favicon.ico', tint: '#1a73e8', note: 'The classic. Looks like you never left.' },
    { id: 'docs', name: 'Project Overview - Google Docs', short: 'Docs', icon: 'https://ssl.gstatic.com/docs/documents/kinto/html/16/favicon.ico', tint: '#4285f4', note: 'A document tab. Boring in the best way.' },
    { id: 'drive', name: 'My Drive - Google Drive', short: 'Drive', icon: 'https://www.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png', tint: '#0f9d58' },
    { id: 'sheets', name: 'Grade Tracker - Google Sheets', short: 'Sheets', icon: 'https://ssl.gstatic.com/docs/spreadsheets/forms/favicon_jfk2x.png', tint: '#0f9d58' },
    { id: 'slides', name: 'History Presentation - Google Slides', short: 'Slides', icon: 'https://ssl.gstatic.com/docs/presentations/images/favicon5.ico', tint: '#f4b400' },
    { id: 'canvas', name: 'Dashboard - Canvas LMS', short: 'Canvas', icon: 'https://instructure-a1.gstatic.com/106841/1f2c8f.ico', tint: '#e6366e', note: 'Matches the real Canvas LMS tab.' },
    { id: 'schoology', name: 'Schoology', short: 'Schoology', icon: 'https://www.schoology.com/favicon.ico', tint: '#1f7ed8' },
    { id: 'edgenuity', name: 'Edgenuity', short: 'Edgenuity', icon: 'https://core.edgefw.com/favicon.ico', tint: '#00a0df' },
    { id: 'edpuzzle', name: 'Edpuzzle', short: 'Edpuzzle', icon: 'https://edpuzzle.com/favicon.ico', tint: '#20d4bb' },
    { id: 'nearpod', name: 'Nearpod', short: 'Nearpod', icon: 'https://content.nearpod.com/favicon.ico', tint: '#7c5cff' },
    { id: 'teams', name: 'Microsoft Teams', short: 'Teams', icon: 'https://static-teams.gblcdn.com/1.0.0/images/favicon.ico', tint: '#5059c9' },
    { id: 'google', name: 'Google', short: 'Google', icon: 'https://www.google.com/favicon.ico', tint: '#4285f4' },
    { id: 'search', name: 'school research - Google Search', short: 'Search', icon: 'https://www.google.com/favicon.ico', tint: '#4285f4' },
    { id: 'wiki', name: 'Wikipedia, the free encyclopedia', short: 'Wikipedia', icon: 'https://wikipedia.org/static/favicon/wikipedia.ico', tint: '#3366cc' },
    { id: 'khan', name: 'Khan Academy', short: 'Khan', icon: 'https://www.khanacademy.org/favicon.ico?fw=ti', tint: '#14bf96' },
    { id: 'quizlet', name: 'Quizlet', short: 'Quizlet', icon: 'https://quizlet.com/favicon.ico', tint: '#3d47f3' },
    { id: 'meet', name: 'Meet', short: 'Meet', icon: 'https://www.gstatic.com/meet/user_engagement/tab/icon/production/favicon_32-4.png', tint: '#00838f' },
    { id: 'gmail', name: 'Inbox - Gmail', short: 'Gmail', icon: 'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', tint: '#ea4335' },
    { id: 'library', name: 'Online Library Catalog', short: 'Library', icon: '', tint: '#7a5cff', note: 'No external favicon needed — a generated book mark.' },
    { id: 'blank', name: 'New Tab', short: 'New Tab', icon: '', tint: '#8b8f9a', note: 'Grey, empty, forgettable.' },
    { id: 'custom', name: 'Custom', short: 'Custom', icon: '', tint: '#d7f34a', note: 'Write your own tab name + favicon.' }
  ];

  var PANIC_TARGETS = [
    { id: 'classroom', name: 'Google Classroom', url: 'https://classroom.google.com', icon: 'https://ssl.gstatic.com/atari/images/public/favicon.ico' },
    { id: 'docs', name: 'Google Docs', url: 'https://docs.google.com/document/u/0/', icon: 'https://ssl.gstatic.com/docs/documents/kinto/html/16/favicon.ico' },
    { id: 'drive', name: 'Google Drive', url: 'https://drive.google.com', icon: 'https://www.gstatic.com/images/branding/product/1x/drive_2020q4_32dp.png' },
    { id: 'canvas', name: 'Canvas LMS', url: 'https://canvas.instructure.com', icon: '' },
    { id: 'wiki', name: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Main_Page', icon: 'https://wikipedia.org/static/favicon/wikipedia.ico' },
    { id: 'khan', name: 'Khan Academy', url: 'https://www.khanacademy.org', icon: '' },
    { id: 'search', name: 'Google Search', url: 'https://www.google.com/search?q=homework+help', icon: 'https://www.google.com/favicon.ico' },
    { id: 'mail', name: 'Inbox', url: 'https://mail.google.com', icon: '' },
    { id: 'edpuzzle', name: 'Edpuzzle', url: 'https://edpuzzle.com/assignments', icon: '' },
    { id: 'blank', name: 'about:blank', url: 'about:blank', icon: '' },
    { id: 'custom', name: 'Custom URL', url: '', icon: '' }
  ];

  // Themes: every theme paints the lounge *and* the built-in video rooms, and
  // each ships with a background pairing + a surface treatment.
  var THEMES = [
    { id: 'lounge', name: 'GG Lounge', tag: 'signature', accent: '#d7f34a', accent2: '#7d6bff', bg: '#0b0d12', panel: '#141720', text: '#f4f2ec', muted: '#9699a8', line: 'rgba(244,242,236,.13)', bgMode: 'aurora', surface: 'glass', glow: 1, font: 'default' },
    { id: 'midnight', name: 'Midnight Aurora', tag: 'calm', accent: '#6ee7ff', accent2: '#a78bfa', bg: '#070b16', panel: '#0f1626', text: '#e8eefc', muted: '#8ea0c4', line: 'rgba(140,170,220,.16)', bgMode: 'aurora', surface: 'glass', glow: .9, font: 'default' },
    { id: 'cyberpunk', name: 'Neon Cyberpunk', tag: 'loud', accent: '#00f0ff', accent2: '#ff2e97', bg: '#05010c', panel: '#100620', text: '#e6faff', muted: '#8f7fb5', line: 'rgba(0,240,255,.24)', bgMode: 'grid', surface: 'neon', glow: 1.4, font: 'mono' },
    { id: 'synthwave', name: 'Synthwave 1984', tag: 'retro', accent: '#ff6ad5', accent2: '#7873f5', bg: '#150026', panel: '#240b3d', text: '#ffe9ff', muted: '#b795d1', line: 'rgba(255,106,213,.26)', bgMode: 'synthgrid', surface: 'neon', glow: 1.2, font: 'rounded' },
    { id: 'terminal', name: 'Hacker Terminal', tag: 'phosphor', accent: '#39ff14', accent2: '#0aff9d', bg: '#010603', panel: '#04120a', text: '#b8ffcf', muted: '#4f9b6a', line: 'rgba(57,255,20,.22)', bgMode: 'matrix', surface: 'terminal', glow: 1, font: 'mono' },
    { id: 'ocean', name: 'Ocean Depths', tag: 'calm', accent: '#4fd1c5', accent2: '#3b82f6', bg: '#02121c', panel: '#072230', text: '#dff5ff', muted: '#7fa8bd', line: 'rgba(79,209,197,.18)', bgMode: 'bubbles', surface: 'glass', glow: .8, font: 'default' },
    { id: 'galaxy', name: 'Galaxy Drift', tag: 'space', accent: '#c4b5fd', accent2: '#60a5fa', bg: '#05030f', panel: '#100c22', text: '#efeaff', muted: '#9c92c8', line: 'rgba(196,181,253,.2)', bgMode: 'starfield', surface: 'glass', glow: 1.1, font: 'default' },
    { id: 'sakura', name: 'Sakura', tag: 'soft', accent: '#fb7fb2', accent2: '#c4b5fd', bg: '#1a0d16', panel: '#2a1424', text: '#ffeef5', muted: '#c79aae', line: 'rgba(251,127,178,.22)', bgMode: 'petals', surface: 'glass', glow: .7, font: 'rounded' },
    { id: 'bloodmoon', name: 'Blood Moon', tag: 'dark', accent: '#ff4d4d', accent2: '#ff9f1c', bg: '#0d0205', panel: '#1c060a', text: '#ffeaea', muted: '#b98c8c', line: 'rgba(255,77,77,.24)', bgMode: 'embers', surface: 'sharp', glow: 1.2, font: 'default' },
    { id: 'arctic', name: 'Arctic', tag: 'cool', accent: '#9adcff', accent2: '#c7d2fe', bg: '#050f18', panel: '#0c1e2c', text: '#eaf7ff', muted: '#93b3c8', line: 'rgba(154,220,255,.2)', bgMode: 'snow', surface: 'glass', glow: .6, font: 'default' },
    { id: 'goldrush', name: 'Gold Rush', tag: 'luxury', accent: '#ffd54a', accent2: '#ff9f1c', bg: '#0b0803', panel: '#1a1408', text: '#fff6df', muted: '#bda888', line: 'rgba(255,213,74,.22)', bgMode: 'shimmer', surface: 'sharp', glow: 1, font: 'default' },
    { id: 'vaporwave', name: 'Vaporwave', tag: 'aesthetic', accent: '#ff71ce', accent2: '#01cdfe', bg: '#1b0f2e', panel: '#2b1a45', text: '#f6e9ff', muted: '#b39ddb', line: 'rgba(1,205,254,.26)', bgMode: 'synthgrid', surface: 'neon', glow: 1.3, font: 'rounded' },
    { id: 'fireflies', name: 'Firefly Forest', tag: 'night', accent: '#d9f99d', accent2: '#fde68a', bg: '#04100a', panel: '#0b1c12', text: '#e9ffe0', muted: '#89b596', line: 'rgba(217,249,157,.18)', bgMode: 'fireflies', surface: 'glass', glow: .9, font: 'default' },
    { id: 'toxic', name: 'Toxic Lime', tag: 'loud', accent: '#b6ff00', accent2: '#00ffa3', bg: '#060a03', panel: '#101a06', text: '#f2ffdc', muted: '#93ad62', line: 'rgba(182,255,0,.26)', bgMode: 'plasma', surface: 'neon', glow: 1.5, font: 'mono' },
    { id: 'sunset', name: 'Sunset Drive', tag: 'warm', accent: '#ff8a5b', accent2: '#ffd166', bg: '#180711', panel: '#2a0f1e', text: '#ffeee5', muted: '#c79a8a', line: 'rgba(255,138,91,.24)', bgMode: 'speed', surface: 'glass', glow: 1, font: 'rounded' },
    { id: 'paper', name: 'Paper Daylight', tag: 'light', accent: '#2f6df6', accent2: '#0ea5e9', bg: '#f6f7fb', panel: '#ffffff', text: '#12172a', muted: '#5a6478', line: 'rgba(18,23,42,.12)', bgMode: 'none', surface: 'paper', glow: 0, font: 'default' },
    { id: 'contrast', name: 'High Contrast', tag: 'access', accent: '#ffffff', accent2: '#ffff00', bg: '#000000', panel: '#000000', text: '#ffffff', muted: '#cfcfcf', line: 'rgba(255,255,255,.55)', bgMode: 'none', surface: 'sharp', glow: 0, font: 'mono' },
    { id: 'inkwash', name: 'Ink Wash', tag: 'calm', accent: '#94a3b8', accent2: '#e2e8f0', bg: '#0b0f14', panel: '#141a22', text: '#e6edf5', muted: '#8fa0b3', line: 'rgba(148,163,184,.2)', bgMode: 'noise', surface: 'solid', glow: .3, font: 'default' },
    { id: 'orchid', name: 'Orid Neon', tag: 'loud', accent: '#e879f9', accent2: '#22d3ee', bg: '#0a0413', panel: '#160a26', text: '#fbeaff', muted: '#a98fc4', line: 'rgba(232,121,249,.24)', bgMode: 'plasma', surface: 'neon', glow: 1.25, font: 'default' },
    { id: 'espresso', name: 'Espresso', tag: 'warm', accent: '#f0b97a', accent2: '#d97706', bg: '#120c08', panel: '#1d140e', text: '#f8ecdd', muted: '#b09a8d', line: 'rgba(240,185,122,.18)', bgMode: 'noise', surface: 'solid', glow: .4, font: 'default' }
  ];

  // Backgrounds. `canvas` = our own renderer (works offline, reacts to input),
  // `video`/`image` = hosted media that the lounge relays same-origin.
  var BACKGROUNDS = [
    { id: 'aurora', name: 'Aurora Drift', kind: 'canvas', tag: 'cursor', desc: 'Slow light fields that lean toward your mouse.' },
    { id: 'starfield', name: 'Hyperspace', kind: 'canvas', tag: 'cursor+keys', desc: 'Fly past stars. Keys punch the throttle.' },
    { id: 'matrix', name: 'Code Rain', kind: 'canvas', tag: 'keys', desc: 'Glyph rain that reacts to what you type.' },
    { id: 'synthgrid', name: 'Retro Grid', kind: 'canvas', tag: 'cursor', desc: 'Sunset wireframe highway, tilts with the cursor.' },
    { id: 'grid', name: 'Neon Circuit', kind: 'canvas', tag: 'keys', desc: 'Circuit board that pulses on every keystroke.' },
    { id: 'bubbles', name: 'Deep Bubbles', kind: 'canvas', tag: 'cursor', desc: 'Rising bubbles you can shove around.' },
    { id: 'snow', name: 'Snowfall', kind: 'canvas', tag: 'cursor', desc: 'Soft snow, blown sideways by your cursor.' },
    { id: 'embers', name: 'Embers', kind: 'canvas', tag: 'cursor', desc: 'Sparks drifting up from the bottom edge.' },
    { id: 'fireflies', name: 'Fireflies', kind: 'canvas', tag: 'cursor', desc: 'They gather around the pointer.' },
    { id: 'petals', name: 'Cherry Petals', kind: 'canvas', tag: 'cursor', desc: 'Petals tumbling down, pushed by the mouse.' },
    { id: 'plasma', name: 'Plasma Field', kind: 'canvas', tag: 'keys', desc: 'Wobbling colour field; typing ripples it.' },
    { id: 'constellation', name: 'Constellation', kind: 'canvas', tag: 'cursor', desc: 'Points link up, the cursor repels them.' },
    { id: 'magnet', name: 'Magnet Mesh', kind: 'canvas', tag: 'cursor', desc: 'A dot grid that bends to the pointer and snaps back.' },
    { id: 'trails', name: 'Comet Trails', kind: 'canvas', tag: 'cursor', desc: 'Everything you move leaves light behind.' },
    { id: 'ripple', name: 'Key Ripples', kind: 'canvas', tag: 'keys', desc: 'Every keypress drops a ripple into the dark.' },
    { id: 'confetti', name: 'Keystroke Confetti', kind: 'canvas', tag: 'keys', desc: 'Typing throws a party, quietly.' },
    { id: 'speed', name: 'Speed Lines', kind: 'canvas', tag: 'cursor', desc: 'Hyperspeed streaks toward the horizon.' },
    { id: 'shimmer', name: 'Gold Shimmer', kind: 'canvas', tag: 'cursor', desc: 'Glinting dust that follows the mouse.' },
    { id: 'rain', name: 'Rain on Glass', kind: 'canvas', tag: 'cursor', desc: 'Droplets run down; the pointer wipes them.' },
    { id: 'noise', name: 'Film Grain', kind: 'canvas', tag: 'calm', desc: 'Analog grain + vignette. No motion.' },
    { id: 'mesh-ink', name: 'Ink Mesh', kind: 'gradient', tag: 'static', grad: 'radial-gradient(1200px 700px at 12% 8%, rgba(148,163,184,.22), transparent 60%), radial-gradient(900px 600px at 88% 78%, rgba(226,232,240,.14), transparent 60%)' },
    { id: 'mesh-sunset', name: 'Sunset Mesh', kind: 'gradient', tag: 'static', grad: 'radial-gradient(900px 600px at 15% 20%, rgba(255,138,91,.35), transparent 60%), radial-gradient(800px 700px at 85% 15%, rgba(255,209,102,.28), transparent 55%), radial-gradient(1000px 700px at 50% 100%, rgba(120,115,245,.3), transparent 60%)' },
    { id: 'mesh-toxic', name: 'Toxic Mesh', kind: 'gradient', tag: 'static', grad: 'radial-gradient(1000px 700px at 20% 80%, rgba(182,255,0,.22), transparent 60%), radial-gradient(800px 600px at 80% 10%, rgba(0,255,163,.2), transparent 60%)' },
    { id: 'mesh-orchid', name: 'Orchid Mesh', kind: 'gradient', tag: 'static', grad: 'conic-gradient(from 210deg at 60% 40%, rgba(232,121,249,.28), rgba(34,211,238,.22), rgba(232,121,249,.28))' },
    { id: 'stock-city', name: 'Night City 4K', kind: 'image', tag: 'photo', url: 'https://picsum.photos/id/1067/1920/1080.jpg' },
    { id: 'stock-mountain', name: 'Alpine Ridge', kind: 'image', tag: 'photo', url: 'https://picsum.photos/id/1018/1920/1080.jpg' },
    { id: 'stock-forest', name: 'Forest Light', kind: 'image', tag: 'photo', url: 'https://picsum.photos/id/1039/1920/1080.jpg' },
    { id: 'stock-ocean', name: 'Ocean Shore', kind: 'image', tag: 'photo', url: 'https://picsum.photos/id/1053/1920/1080.jpg' },
    { id: 'stock-space', name: 'Deep Space', kind: 'image', tag: 'photo', url: 'https://picsum.photos/id/1101/1920/1080.jpg' },
    { id: 'stock-desert', name: 'Desert Dunes', kind: 'image', tag: 'photo', url: 'https://picsum.photos/id/1016/1920/1080.jpg' },
    { id: 'stock-mono', name: 'Monochrome Street', kind: 'image', tag: 'photo', url: 'https://picsum.photos/id/237/1920/1080.jpg?grayscale' },
    { id: 'stock-blur', name: 'Soft Blur', kind: 'image', tag: 'photo', url: 'https://picsum.photos/seed/gglounge/1920/1080.jpg?blur=6' },
    { id: 'vid-bunny', name: 'Meadow (video)', kind: 'video', tag: 'video', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4', poster: 'https://storage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg' },
    { id: 'vid-blazes', name: 'Bonfire (video)', kind: 'video', tag: 'video', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', poster: 'https://storage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg' },
    { id: 'vid-escapes', name: 'Coast Run (video)', kind: 'video', tag: 'video', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', poster: 'https://storage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerEscapes.jpg' },
    { id: 'vid-joyrides', name: 'Night Ride (video)', kind: 'video', tag: 'video', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', poster: 'https://storage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerJoyrides.jpg' },
    { id: 'vid-fun', name: 'Skate Park (video)', kind: 'video', tag: 'video', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', poster: 'https://storage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerFun.jpg' },
    { id: 'vid-sintel', name: 'Cinematic (video)', kind: 'video', tag: 'video', url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4', poster: 'https://storage.googleapis.com/gtv-videos-bucket/sample/images/Sintel.jpg' }
  ];

  var STOCK_IMAGE_SEEDS = ['aurora', 'nebula', 'tokyo', 'forest', 'ocean', 'dunes', 'city', 'snow'];

  // ------------------------------------------------------------- settings ---
  function defaults() {
    return {
      v: VERSION,
      cloak: {
        enabled: true,
        preset: 'classroom',
        name: '',
        icon: '',
        iconMode: 'preset', // preset | url | letter
        letter: '',
        color: '#1a73e8',
        appCloak: true, // also rename + re-icon the installed app
        aboutBlank: false, // run the lounge inside an about:blank window
        autoCloak: false, // cloak on the first click of the session
        hideUrlHint: true
      },
      panic: {
        enabled: true,
        key: '`',
        alt: 'Esc',
        requireModifier: false,
        modifier: 'Alt',
        target: 'classroom',
        url: 'https://classroom.google.com',
        mode: 'replace', // replace | newtab | fake
        backGuard: true,
        panicOnBlur: false,
        blurDelay: 400,
        fakeTitle: 'Assignment 4 — World History'
      },
      theme: {
        id: 'lounge',
        accent: '', // overrides, "" = use theme
        bg: '',
        text: '',
        radius: 16,
        surface: '',
        font: '',
        glow: -1,
        dim: 0,
        scale: 1
      },
      bg: {
        id: 'aurora',
        intensity: 0.55,
        speed: 0.55,
        cursor: 'auto', // auto | none | spotlight | trail | magnet
        keyboard: 'auto', // auto | none | ripple | pulse | rain
        opacity: 0.85,
        blur: 0,
        dim: 0.32,
        loop: true,
        muted: true,
        playUnderContent: true,
        customUrl: '',
        customKind: '' // image | video | ''
      },
      video: {
        schoolMode: true,
        strictImg: true,
        provider: 'auto', // auto | innertube | piped | invidious
        instance: '',
        region: 'US',
        quality: 'auto', // auto | 1080 | 720 | 480 | 360
        engine: 'auto', // auto | hls | mp4
        autoplay: false,
        skipSponsors: true,
        captions: false,
        volume: 1
      },
      ui: {
        showSettingsFab: true,
        compactCards: false,
        reduceMotion: false,
        hideHeaderLinks: false
      }
    };
  }

  function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  function merge(base, patch) {
    var out = {};
    var k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    if (!isObj(patch)) return out;
    for (k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      var v = patch[k];
      if (v === undefined) continue;
      out[k] = isObj(base[k]) && isObj(v) ? merge(base[k], v) : v;
    }
    return out;
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var state = defaults();
  var listeners = [];
  var gotChannel = null;
  try {
    if ('BroadcastChannel' in window) {
      gotChannel = new BroadcastChannel(BROADCAST);
      gotChannel.onmessage = function (ev) {
        if (ev && (ev.data === 'panic' || (ev.data && ev.data.ggPanic))) {
          panicNow(true);
          return;
        }
        reloadFromStorage(true);
      };
    }
  } catch (e) { gotChannel = null; }

  function readStorage() {
    var raw = null;
    try {
      raw = localStorage.getItem(KEY) || localStorage.getItem(LEGACY_KEYS[0]) || localStorage.getItem(LEGACY_KEYS[1]);
    } catch (e) { return null; }
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  function writeStorage() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      for (var i = 0; i < LEGACY_KEYS.length; i++) localStorage.removeItem(LEGACY_KEYS[i]);
    } catch (e) { /* private mode: keep the session in memory */ }
  }

  function reloadFromStorage(broadcastBack) {
    var stored = readStorage();
    if (!stored) return;
    state = merge(defaults(), stored);
    applyAll({ fromSync: true, notify: !broadcastBack });
  }

  // ----------------------------------------------------------------- utils --
  function el(id, tag, cls) {
    var node = document.getElementById(id);
    if (node) return node;
    node = document.createElement(tag || 'div');
    node.id = id;
    if (cls) node.className = cls;
    return node;
  }

  function styleTag() {
    var s = document.getElementById(STYLE_ID);
    if (!s) {
      s = document.createElement('style');
      s.id = STYLE_ID;
      document.head.appendChild(s);
    }
    return s;
  }

  function themeById(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return THEMES[0];
  }
  function bgById(id) {
    for (var i = 0; i < BACKGROUNDS.length; i++) if (BACKGROUNDS[i].id === id) return BACKGROUNDS[i];
    return null;
  }
  function cloakById(id) {
    for (var i = 0; i < CLOAKS.length; i++) if (CLOAKS[i].id === id) return CLOAKS[i];
    return null;
  }
  function panicById(id) {
    for (var i = 0; i < PANIC_TARGETS.length; i++) if (PANIC_TARGETS[i].id === id) return PANIC_TARGETS[i];
    return null;
  }

  function inFrame() {
    try { return window.top !== window.self; } catch (e) { return true; }
  }
  /**
   * Backdrops are for lounge pages and the video rooms. Games (static or
   * DB-served) keep their own artwork unless they opt in with
   * <meta name="gg-bg" content="on">.
   */
  function isTouchOnly() {
    try {
      return !!(window.matchMedia && (!window.matchMedia('(hover: hover)').matches && !window.matchMedia('(pointer: fine)').matches));
    } catch (e) {
      return false;
    }
  }

  function bgAllowed() {
    try {
      var m = document.querySelector('meta[name="gg-bg"]');
      if (m) return m.getAttribute('content') !== 'off';
      return String(location.pathname).indexOf('/games/') !== 0;
    } catch (e) {
      return true;
    }
  }

  function isStandalone() {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
  }

  function proxyImage(url) {
    if (!url) return '';
    if (/^(data:|blob:)/i.test(url)) return url;
    return '/api/img?url=' + encodeURIComponent(url);
  }

  function hexToRgba(hex, alpha) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h.slice(0, 6), 16);
    if (!isFinite(n)) return 'rgba(215,243,74,' + alpha + ')';
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  // -------------------------------------------------------------- resolved --
  /** The theme with any per-user colour overrides folded in. */
  function resolvedTheme() {
    var t = themeById(state.theme.id);
    return {
      id: t.id,
      name: t.name,
      accent: state.theme.accent || t.accent,
      accent2: t.accent2,
      bg: state.theme.bg || t.bg,
      panel: t.panel,
      text: state.theme.text || t.text,
      muted: t.muted,
      line: t.line,
      surface: state.theme.surface || t.surface,
      font: state.theme.font || t.font,
      glow: state.theme.glow >= 0 ? state.theme.glow : t.glow,
      bgMode: t.bgMode
    };
  }

  function themeCss(t) {
    var radius = (isFinite(state.theme.radius) ? state.theme.radius : 16) + 'px';
    var scale = state.theme.scale && state.theme.scale !== 1 ? state.theme.scale : 1;
    var light = t.id === 'paper' || t.id === 'contrast';
    var mono = t.font === 'mono';
    var rounded = t.font === 'rounded';
    var fontFamily = mono
      ? 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace'
      : rounded
        ? '"Trebuchet MS",ui-rounded,"Segoe UI",system-ui,sans-serif'
        : 'Arial,Helvetica,system-ui,sans-serif';
    var glass = t.surface === 'glass';
    var neon = t.surface === 'neon';
    var terminal = t.surface === 'terminal';
    var paper = t.surface === 'paper';
    var shadow = t.glow > 0
      ? '0 0 0 1px ' + hexToRgba(t.accent, 0.14 * t.glow) + ',0 24px 60px ' + hexToRgba('#000000', light ? .08 : .4)
      : '0 1px 0 ' + hexToRgba(t.text, .06);
    return [
      ':root{',
      '--gg-accent:' + t.accent + ';',
      '--gg-accent2:' + t.accent2 + ';',
      '--gg-bg:' + t.bg + ';',
      '--gg-panel:' + t.panel + ';',
      '--gg-text:' + t.text + ';',
      '--gg-muted:' + t.muted + ';',
      '--gg-line:' + t.line + ';',
      '--gg-radius:' + radius + ';',
      '--gg-glow:' + t.glow + ';',
      '--gg-shadow:' + shadow + ';',
      '--gg-surface:' + t.surface + ';',
      /* lounge variables (globals.css) */
      '--background:' + t.bg + ';',
      '--foreground:' + t.text + ';',
      '--muted:' + t.muted + ';',
      '--line:' + t.line + ';',
      '--lime:' + t.accent + ';',
      '--coral:' + t.accent2 + ';',
      '--violet:' + t.accent2 + ';',
      '--panel:' + (glass || neon ? hexToRgba(t.panel, .82) : t.panel) + ';',
      '--ink:' + (light ? '#12172a' : '#f4f2ec') + ';',
      /* YouTube + TikTok room variables */
      '--bg:' + t.bg + ';--bg-soft:' + t.panel + ';--bg-card:' + t.panel + ';--bg-hover:' + hexToRgba(t.text, .08) + ';',
      '--text:' + t.text + ';--accent:' + t.accent + ';--red:' + t.accent2 + ';--chip:' + hexToRgba(t.text, .08) + ';',
      '--radius:' + radius + ';',
      '}',
      'html{background:' + t.bg + '}',
      'body{font-family:' + fontFamily + ';letter-spacing:' + (mono ? '-.01em' : 'normal') + ';}',
      '.lounge-shell,.proxy-shell,.settings-shell{background:transparent!important;}',
      glass
        ? '.game-card,.admin-panel,.stat-card,.set-card,.spotlight,.gg-card{backdrop-filter:blur(14px) saturate(1.15);background:linear-gradient(155deg,' + hexToRgba(t.panel, .86) + ',' + hexToRgba(t.bg, .74) + ')!important;}'
        : '',
      neon
        ? '.game-card,.admin-panel,.set-card,.gg-card{box-shadow:inset 0 0 0 1px ' + hexToRgba(t.accent, .5) + ',0 0 26px ' + hexToRgba(t.accent, .22) + '!important;border-color:' + hexToRgba(t.accent, .45) + '!important;text-shadow:0 0 14px ' + hexToRgba(t.accent, .35) + ';}'
        : '',
      terminal
        ? '.game-card,.set-card,.gg-card{border-style:dashed!important;border-color:' + hexToRgba(t.accent, .4) + '!important;border-radius:2px!important;}' +
          'h1,h2,h3,.card-kicker{text-transform:uppercase;letter-spacing:.06em;}'
        : '',
      paper ? '.game-card,.set-card,.gg-card{box-shadow:0 1px 3px rgba(15,20,40,.14)!important;}' : '',
      'html[data-gg-bg-active="1"] .noise{opacity:.02;}',
      t.glow > 1.1 ? '.brand-mark,.hero-link,.stat-icon{filter:drop-shadow(0 0 12px ' + hexToRgba(t.accent, .6) + ');}' : '',
      'a{color:inherit}',
      '.gg-bg-layer{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;opacity:' + state.bg.opacity + ';',
      (state.bg.blur > 0 ? 'filter:blur(' + state.bg.blur + 'px);' : '') + '}',
      'html[data-gg-bg-active="1"] body{background:transparent!important}',
      '.gg-bg-layer canvas,.gg-bg-layer video,.gg-bg-layer img{width:100%;height:100%;display:block;object-fit:cover}',
      '.gg-bg-scrim{position:absolute;inset:0;background:' + (state.bg.dim > 0
        ? 'linear-gradient(180deg,' + hexToRgba(t.bg, state.bg.dim) + ',' + hexToRgba(t.bg, Math.min(1, state.bg.dim + .22)) + ')'
        : 'transparent') + '}',
      state.ui.compactCards ? '.game-grid{gap:10px}.game-card{min-height:180px;grid-template-columns:34% 1fr}' : '',
      scale !== 1 ? 'body{zoom:' + scale + '}' : '',
      state.ui.reduceMotion ? '*,*::before,*::after{animation-duration:.001ms!important;transition-duration:.001ms!important}' : ''
    ].join('');
  }

  // ------------------------------------------------------------- the theme --
  function applyTheme() {
    var t = resolvedTheme();
    var style = styleTag();
    if (isTouchOnly() && (bg.cursor === 'spotlight' || bg.cursor === 'trail' || bg.cursor === 'magnet')) {
      // no pointer to follow on a phone: fall back to the plain animation
      bg = Object.assign({}, bg, { cursor: 'none' });
    }
    if (!bgAllowed()) {
      // Plain arcade games keep their own look; they still get the cloak and the
      // panic key, just not the lounge's theme or backdrop.
      if (style) style.textContent = '';
      return;
    }
    if (style) style.textContent = themeCss(t);
    var root = document.documentElement;
    root.setAttribute('data-gg-theme', t.id);
    root.setAttribute('data-gg-surface', t.surface);
    var metaTheme = document.querySelector('meta[name="theme-color"]');
    if (!metaTheme) {
      metaTheme = document.createElement('meta');
      metaTheme.name = 'theme-color';
      document.head.appendChild(metaTheme);
    }
    metaTheme.setAttribute('content', t.bg);
    if (isFinite(state.theme.dim) && state.theme.dim > 0) {
      root.style.setProperty('--gg-dim', state.theme.dim);
    } else {
      root.style.removeProperty('--gg-dim');
    }
  }

  // ------------------------------------------------------- background layer --
  var layer = null;
  var engine = null;
  var mediaNode = null;

  function ensureLayer() {
    if (layer && document.body.contains(layer)) return layer;
    layer = document.createElement('div');
    layer.className = 'gg-bg-layer gg-layer';
    layer.id = LAYER_ID;
    layer.setAttribute('aria-hidden', 'true');
    var scrim = document.createElement('div');
    scrim.className = 'gg-bg-scrim';
    layer.appendChild(scrim);
    document.body.insertBefore(layer, document.body.firstChild);
    return layer;
  }

  function clearLayer() {
    if (!layer) return;
    var kids = [].slice.call(layer.children);
    for (var i = 0; i < kids.length; i++) {
      if (kids[i].className !== 'gg-bg-scrim') layer.removeChild(kids[i]);
    }
    if (engine) { engine.stop(); engine = null; }
    mediaNode = null;
  }

  /** Big uploads live in IndexedDB; `idb:<key>` is resolved to a blob URL. */
  var idbCache = {};
  function resolveIdb(key, done) {
    if (idbCache[key] !== undefined) { done(idbCache[key]); return; }
    if (!('indexedDB' in window)) { idbCache[key] = ''; done(''); return; }
    try {
      var open = indexedDB.open('gg-files', 1);
      open.onerror = function () { idbCache[key] = ''; done(''); };
      open.onupgradeneeded = function () {
        try { if (!open.result.objectStoreNames.contains('files')) open.result.createObjectStore('files'); } catch (e) { /* noop */ }
      };
      open.onsuccess = function () {
        var db = open.result;
        try {
          var tx = db.transaction('files', 'readonly');
          var req = tx.objectStore('files').get(key);
          req.onsuccess = function () {
            var blob = req.result;
            var url = blob ? URL.createObjectURL(blob) : '';
            idbCache[key] = url;
            db.close();
            done(url);
          };
          req.onerror = function () { idbCache[key] = ''; db.close(); done(''); };
        } catch (e) { idbCache[key] = ''; db.close(); done(''); }
      };
    } catch (e) { idbCache[key] = ''; done(''); }
  }

  function applyBackground() {
    if (!document.body) { setTimeout(applyBackground, 30); return; }
    if (!bgAllowed()) {
      try { if (engine) engine.stop(); } catch (e) { /* noop */ }
      try { clearLayer(); } catch (e) { /* noop */ }
      document.documentElement.setAttribute('data-gg-bg-active', '0');
      return;
    }
    var bg = state.bg;
    var preset = bgById(bg.id);
    var t = resolvedTheme();
    ensureLayer();
    clearLayer();
    var active = false;

    // pending local upload: resolve it, then re-apply
    if (bg.customUrl && bg.customUrl.indexOf('idb:') === 0) {
      var key = bg.customUrl.slice(4);
      if (!idbCache[key]) {
        resolveIdb(key, function (url) {
          if (url) applyBackground();
          else paintGradientFallback(t);
        });
        paintGradientFallback(t);
        document.documentElement.setAttribute('data-gg-bg-active', '1');
        return;
      }
      bg = Object.assign({}, bg, { customUrl: idbCache[key] });
    }

    // user media wins over the picker
    if (bg.customUrl && bg.customKind === 'image') {
      var img = document.createElement('img');
      img.src = /^(data:|blob:|\/)/.test(bg.customUrl) ? bg.customUrl : proxyImage(bg.customUrl);
      img.alt = '';
      img.onerror = function () { img.remove(); paintGradientFallback(t); };
      layer.appendChild(img);
      active = true;
    } else if (bg.customUrl && bg.customKind === 'video') {
      active = attachVideo(bg.customUrl, '', true);
    } else if (preset && preset.kind === 'video') {
      active = attachVideo(preset.url, preset.poster || '', false);
    } else if (preset && preset.kind === 'image') {
      var photo = document.createElement('img');
      photo.src = proxyImage(preset.url);
      photo.alt = '';
      photo.onerror = function () { photo.remove(); paintGradientFallback(t); };
      layer.appendChild(photo);
      active = true;
    } else if (preset && preset.kind === 'gradient') {
      paintGradientFallback(t, preset.grad);
      active = true;
    } else if (preset && preset.kind === 'canvas' && preset.id !== 'none' && bg.id !== 'none') {
      startCanvas(preset.id, t);
      active = true;
    } else if (bg.id === 'none') {
      paintGradientFallback(t);
      active = true;
    }
    document.documentElement.setAttribute('data-gg-bg-active', active ? '1' : '0');
    document.documentElement.setAttribute('data-gg-bg', bg.id);
    // scrim sits above media but under content
    var scrim = layer.querySelector('.gg-bg-scrim');
    if (scrim) layer.appendChild(scrim);
  }

  function paintGradientFallback(t, extra) {
    var d = document.createElement('div');
    d.style.position = 'absolute';
    d.style.inset = '0';
    d.style.background = (extra ||
      'radial-gradient(1000px 700px at 82% 4%,' + hexToRgba(t.accent, .18) + ',transparent 60%),' +
      'radial-gradient(900px 700px at 8% 60%,' + hexToRgba(t.accent2, .14) + ',transparent 55%)') +
      ',' + t.bg;
    layer.insertBefore(d, layer.firstChild);
  }

  function attachVideo(src, poster, isCustom) {
    var v = document.createElement('video');
    v.muted = true;
    v.defaultMuted = true;
    v.loop = !!state.bg.loop;
    v.playsInline = true;
    v.preload = 'metadata';
    v.setAttribute('autoplay', '');
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    if (poster) v.poster = proxyImage(poster);
    v.src = isCustom || /^(data:|blob:)/.test(src) ? src : proxyStock(src);
    v.onerror = function () { if (isCustom) { v.remove(); paintGradientFallback(resolvedTheme()); } };
    layer.insertBefore(v, layer.firstChild);
    mediaNode = v;
    var play = function () { var p = v.play(); if (p && p.catch) p.catch(function () { v.muted = true; v.play().catch(function () {}); }); };
    play();
    document.addEventListener('visibilitychange', function () {
      if (!mediaNode) return;
      if (document.hidden) mediaNode.pause();
      else if (state.bg.muted !== false) mediaNode.play().catch(function () {});
    });
    return true;
  }

  /** Relay stock media through the lounge so school filters can't see it. */
  function proxyStock(url) {
    if (!url || /^(data:|blob:)/i.test(url)) return url;
    return '/api/gg/stock?url=' + encodeURIComponent(url);
  }

  function applyMediaSettings() {
    if (!mediaNode || mediaNode.tagName !== 'VIDEO') return;
    mediaNode.loop = !!state.bg.loop;
    mediaNode.muted = state.bg.muted !== false;
    if (mediaNode.muted) mediaNode.volume = 1;
    var rate = 0.6 + (isFinite(state.bg.speed) ? state.bg.speed : .5) * 0.9;
    try { mediaNode.playbackRate = rate; } catch (e) { /* noop */ }
  }

  // --------------------------------------------------------- canvas engine --
  function startCanvas(mode, t) {
    var canvas = document.createElement('canvas');
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    layer.insertBefore(canvas, layer.firstChild);
    var ctx = canvas.getContext('2d', { alpha: true });
    engine = makeEngine(canvas, ctx, mode, t);
    engine.start();
  }

  /**
   * One renderer, many looks. `mode` picks the particle system; the cursor and
   * keyboard layers are additive so any background can go interactive.
   */
  function makeEngine(canvas, ctx, mode, t) {
    var W = 0, H = 0, DPR = 1;
    var parts = [];
    var ripples = [];
    var trail = [];
    var glyphCols = [];
    var running = false;
    var raf = 0;
    var tick = 0;
    var pointer = { x: .5, y: .5, px: .5, py: .5, vx: 0, vy: 0, down: false, inside: false };
    var keyHeat = 0;
    var lastKey = 0;
    var accent = t.accent, accent2 = t.accent2, base = t.bg;

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth = window.innerWidth;
      H = canvas.clientHeight = window.innerHeight;
      canvas.width = Math.floor(W * DPR);
      canvas.height = Math.floor(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      seed();
    }

    function rand(a, b) { return a + Math.random() * (b - a); }
    function density() {
      var area = (W * H) / 260000;
      var i = isFinite(state.bg.intensity) ? state.bg.intensity : .55;
      return Math.max(8, Math.min(460, Math.round(area * (14 + i * 78))));
    }

    function seed() {
      parts = [];
      glyphCols = [];
      var n = density();
      var i;
      if (mode === 'matrix' || mode === 'grid') {
        var size = mode === 'matrix' ? 16 : 64;
        var cols = Math.ceil(W / size);
        for (i = 0; i < cols; i++) {
          glyphCols.push({ x: i * size, y: rand(-H, 0), speed: rand(.6, 2.4), size: size, bright: rand(.2, 1) });
        }
        return;
      }
      for (i = 0; i < n; i++) {
        var p = { x: rand(0, W), y: rand(0, H), r: rand(.6, 3), a: rand(0, Math.PI * 2), s: rand(.2, 1.4), o: rand(.25, 1), m: rand(.4, 1.6), hue: Math.random() };
        if (mode === 'snow' || mode === 'petals') { p.y = rand(-H, H); p.vy = rand(.25, 1.1); p.vx = rand(-.25, .25); p.r = rand(1, 3.4); }
        if (mode === 'embers' || mode === 'bubbles' || mode === 'shimmer') { p.y = rand(0, H * 1.2); p.vy = -rand(.25, 1.3); p.vx = rand(-.2, .2); }
        if (mode === 'bubbles') p.r = rand(2, 16);
        if (mode === 'constellation' || mode === 'magnet') { p.hx = p.x; p.hy = p.y; p.vx = rand(-.35, .35); p.vy = rand(-.35, .35); p.r = rand(1, 2.4); }
        if (mode === 'starfield') { p.z = rand(1, W); p.zz = p.z; p.px = rand(-1, 1); p.py = rand(-1, 1); }
        if (mode === 'fireflies') { p.vx = rand(-.4, .4); p.vy = rand(-.4, .4); p.phase = rand(0, 6.28); }
        if (mode === 'confetti') { p.vy = rand(.6, 2.2); p.vx = rand(-.6, .6); p.rot = rand(0, 6.28); p.vr = rand(-.1, .1); p.r = rand(2, 5); }
        if (mode === 'rain') { p.y = rand(-H, H); p.vy = rand(1.2, 5.2); p.r = rand(.8, 2.6); p.trail = rand(8, 40); }
        if (mode === 'speed') { p.angle = rand(0, 6.28); p.dist = rand(0, Math.max(W, H)); p.speed = rand(6, 26); }
        parts.push(p);
      }
    }

    var cursorMode = function () {
      var c = state.bg.cursor;
      if (c && c !== 'auto') return c;
      var tag = (bgById(mode) || {}).tag || '';
      if (tag.indexOf('cursor') >= 0) return 'magnet';
      return 'none';
    };
    var keyMode = function () {
      var k = state.bg.keyboard;
      if (k && k !== 'auto') return k;
      var tag = (bgById(mode) || {}).tag || '';
      if (tag.indexOf('keys') >= 0) return mode === 'matrix' ? 'rain' : 'pulse';
      return 'none';
    };

    function onMove(e) {
      var x = (e.touches ? e.touches[0].clientX : e.clientX) / Math.max(1, W);
      var y = (e.touches ? e.touches[0].clientY : e.clientY) / Math.max(1, H);
      pointer.vx = x - pointer.x;
      pointer.vy = y - pointer.y;
      pointer.x = x; pointer.y = y; pointer.inside = true;
      if (cursorMode() === 'trail' || mode === 'trails') {
        for (var i = 0; i < 2; i++) {
          trail.push({ x: e.clientX || 0, y: e.clientY || 0, life: 1, r: rand(1.5, 4.5), hue: Math.random() });
        }
        if (trail.length > 420) trail.splice(0, trail.length - 420);
      }
    }
    function onDown() { pointer.down = true; burst(pointer.x * W, pointer.y * H, 18); }
    function onUp() { pointer.down = false; }
    function onLeave() { pointer.inside = false; }
    function onKey(e) {
      if (!e || e.metaKey || e.ctrlKey || e.altKey) return;
      keyHeat = Math.min(1.6, keyHeat + .35);
      lastKey = Date.now();
      var km = keyMode();
      if (km === 'none') return;
      var cx = pointer.x * W, cy = pointer.y * H;
      if (km === 'ripple' || km === 'pulse') burst(cx, cy, km === 'pulse' ? 10 : 6);
      if (km === 'rain') {
        for (var i = 0; i < glyphCols.length; i++) {
          if (Math.random() < .18) { glyphCols[i].y = -20; glyphCols[i].bright = 1; glyphCols[i].char = e.key; }
        }
      }
      if (km === 'confetti' || mode === 'confetti') {
        for (var j = 0; j < 14; j++) {
          parts.push({ x: cx + rand(-40, 40), y: cy + rand(-30, 30), vx: rand(-3, 3), vy: rand(-6, -1), rot: rand(0, 6.28), vr: rand(-.25, .25), r: rand(2, 6), hue: Math.random(), life: 1, gravity: .18, conf: true });
        }
        if (parts.length > 900) parts.splice(0, parts.length - 900);
      }
    }
    function burst(x, y, count) {
      for (var i = 0; i < count; i++) {
        ripples.push({ x: x, y: y, r: rand(2, 16), max: rand(60, 260), life: 1, w: rand(.6, 2.4) });
      }
      if (ripples.length > 90) ripples.splice(0, ripples.length - 90);
    }

    function frame() {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      tick++;
      var speed = 0.35 + (isFinite(state.bg.speed) ? state.bg.speed : .55) * 1.9 + keyHeat * .5;
      keyHeat *= 0.94;
      if (Date.now() - lastKey > 1400) keyHeat = Math.min(keyHeat, .12);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';

      // mode body -----------------------------------------------------------
      if (mode === 'aurora') drawAurora();
      else if (mode === 'plasma') drawPlasma();
      else if (mode === 'matrix') drawMatrix();
      else if (mode === 'grid') drawCircuit();
      else if (mode === 'synthgrid') drawSynth();
      else if (mode === 'starfield') drawStars();
      else if (mode === 'speed') drawSpeed();
      else if (mode === 'constellation' || mode === 'magnet') drawMesh(mode === 'magnet');
      else if (mode === 'noise') drawNoise();
      else if (mode === 'trails') drawTrails();
      else if (mode === 'ripple') drawRipplesOnly();
      else drawParticles();

      // additive input layers ----------------------------------------------
      var cm = cursorMode();
      if (cm === 'spotlight' || cm === 'magnet') drawSpotlight(cm === 'magnet' ? .35 : 1);
      if (cm === 'trail') drawTrails();
      drawRipples();

      // ripples decay
      for (var i = ripples.length - 1; i >= 0; i--) {
        var rp = ripples[i];
        rp.life -= 0.012;
        if (rp.life <= 0) ripples.splice(i, 1);
      }
      for (var j = trail.length - 1; j >= 0; j--) {
        trail[j].life -= 0.02;
        if (trail[j].life <= 0) trail.splice(j, 1);
      }
    }

    // individual renderers --------------------------------------------------
    function drawAurora() {
      ctx.globalCompositeOperation = 'lighter';
      var px = (pointer.x - .5), py = (pointer.y - .5);
      for (var i = 0; i < 3; i++) {
        var t1 = (tick * 0.0026 * (1 + i * .3) * (0.5 + (isFinite(state.bg.speed) ? state.bg.speed : .5))) + i * 2.2;
        var cx = W * (.35 + .35 * Math.sin(t1) + px * .18 * (i + 1));
        var cy = H * (.4 + .28 * Math.cos(t1 * .8 + i) + py * .18 * (i + 1));
        var r = Math.max(W, H) * (.32 + .1 * Math.sin(t1 * 1.7));
        var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        g.addColorStop(0, hexToRgba(i % 2 ? accent2 : accent, .16));
        g.addColorStop(.55, hexToRgba(i % 2 ? accent : accent2, .07));
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
      // soft dust
      for (var p = 0; p < parts.length; p++) {
        var q = parts[p];
        q.a += 0.002;
        var x = q.x + Math.cos(q.a) * 12, y = q.y + Math.sin(q.a * .8) * 12;
        ctx.fillStyle = hexToRgba(accent, .10 + q.o * .12);
        ctx.fillRect(x, y, q.r, q.r);
      }
    }

    function drawPlasma() {
      var step = 14;
      var t0 = tick * 0.012 * (0.5 + (isFinite(state.bg.speed) ? state.bg.speed : 0.5));
      for (var y = 0; y < H; y += step) {
        for (var x = 0; x < W; x += step) {
          var v = Math.sin((x * .012) + t0) + Math.sin((y * .01) - t0 * .8) + Math.sin(((x + y) * .006) + t0 * .6) + Math.sin(Math.hypot(x - pointer.x * W, y - pointer.y * H) * .012 - t0 * 1.4);
          var n = (v + 4) / 8;
          ctx.fillStyle = hexToRgba(n > .5 ? accent : accent2, .04 + n * .12 + keyHeat * .05);
          ctx.fillRect(x, y, step, step);
        }
      }
    }

    var GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎ0123456789ABCDEF<>/\\|=+-*';
    function drawMatrix() {
      ctx.font = '15px ui-monospace,monospace';
      ctx.textBaseline = 'top';
      var speed = 1 + keyHeat * 2.4;
      for (var i = 0; i < glyphCols.length; i++) {
        var c = glyphCols[i];
        c.y += (1.1 + c.speed * 1.6) * speed * (0.5 + (isFinite(state.bg.speed) ? state.bg.speed : .55));
        if (c.y > H + 40) { c.y = rand(-160, -10); c.bright = rand(.2, 1); delete c.char; }
        var glow = c.bright * (0.55 + keyHeat * .5);
        for (var k = 0; k < 14; k++) {
          var ch = k === 0 && c.char ? c.char : GLYPHS[(Math.random() * GLYPHS.length) | 0];
          ctx.fillStyle = k === 0
            ? hexToRgba('#ffffff', Math.min(1, .75 + glow))
            : hexToRgba(accent, Math.max(0, glow * (1 - k / 14)));
          ctx.fillText(ch, c.x, c.y - k * 16);
        }
      }
    }

    function drawCircuit() {
      var size = 64, i;
      ctx.lineWidth = 1;
      var pulse = .12 + keyHeat * .5;
      ctx.strokeStyle = hexToRgba(accent, pulse);
      ctx.beginPath();
      for (i = 0; i * size < W + size; i++) {
        var x = i * size + Math.sin(tick * .004 + i) * 6;
        ctx.moveTo(x, 0); ctx.lineTo(x, H);
      }
      for (i = 0; i * size < H + size; i++) {
        var y = i * size + Math.cos(tick * .004 + i) * 6;
        ctx.moveTo(0, y); ctx.lineTo(W, y);
      }
      ctx.stroke();
      // travelling nodes that light up around the cursor
      for (i = 0; i < glyphCols.length; i++) {
        var c = glyphCols[i];
        c.y += (0.6 + c.speed) * (0.5 + (isFinite(state.bg.speed) ? state.bg.speed : .55));
        if (c.y > H) c.y = 0;
        var nx = Math.round(c.x / size) * size, ny = Math.round(c.y / size) * size;
        var d = Math.hypot(nx - pointer.x * W, ny - pointer.y * H);
        var near = Math.max(0, 1 - d / 260);
        ctx.fillStyle = hexToRgba(near > .35 ? '#ffffff' : accent2, .25 + near * .75);
        ctx.fillRect(nx - 2 - near * 3, ny - 2 - near * 3, 4 + near * 6, 4 + near * 6);
      }
    }

    function drawSynth() {
      var horizon = H * (.52 + (pointer.y - .5) * .12);
      var g = ctx.createLinearGradient(0, 0, 0, horizon);
      g.addColorStop(0, hexToRgba(accent2, .18));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, horizon);
      // sun
      var sunY = horizon - 60 - (pointer.y - .5) * 40;
      var sg = ctx.createRadialGradient(W * .5 + (pointer.x - .5) * 120, sunY, 10, W * .5, sunY, 190);
      sg.addColorStop(0, hexToRgba(accent, .55));
      sg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(W * .5 + (pointer.x - .5) * 120, sunY, 150, 0, 6.28); ctx.fill();
      ctx.strokeStyle = hexToRgba(accent, .35);
      ctx.lineWidth = 1.4;
      var scroll = (tick * .02 * (0.4 + (isFinite(state.bg.speed) ? state.bg.speed : .55))) % 1;
      ctx.beginPath();
      for (var i = 0; i < 26; i++) {
        var p = (i + scroll) / 26;
        var yy = horizon + Math.pow(p, 2.4) * (H - horizon);
        ctx.moveTo(0, yy); ctx.lineTo(W, yy);
      }
      var cx2 = W * .5 + (pointer.x - .5) * W * .6;
      for (var j = -18; j <= 18; j++) {
        ctx.moveTo(cx2 + j * 30, horizon);
        ctx.lineTo(cx2 + j * (W / 6), H);
      }
      ctx.stroke();
    }

    function drawStars() {
      var cx = W / 2 + (pointer.x - .5) * 240;
      var cy = H / 2 + (pointer.y - .5) * 180;
      var boost = 1 + keyHeat * 5;
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.z -= (2.2 + keyHeat * 6) * boost * .5 * (0.4 + (isFinite(state.bg.speed) ? state.bg.speed : .55)) + 1.2;
        if (p.z <= 1) { p.z = W; p.px = rand(-1, 1); p.py = rand(-1, 1); p.hue = Math.random(); }
        var k = 128 / p.z;
        var x = cx + p.px * W * k * .5;
        var y = cy + p.py * H * k * .5;
        var pz = 1 - p.z / W;
        if (x < -50 || x > W + 50 || y < -50 || y > H + 50) continue;
        var r = Math.max(.4, pz * 3.2);
        ctx.strokeStyle = hexToRgba(p.hue > .7 ? accent2 : accent, .25 + pz * .75);
        ctx.lineWidth = r;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (x - cx) * .04 * boost, y + (y - cy) * .04 * boost);
        ctx.stroke();
      }
    }

    function drawSpeed() {
      var cx = W * .5 + (pointer.x - .5) * 200, cy = H * .5 + (pointer.y - .5) * 160;
      ctx.strokeStyle = hexToRgba(accent, .3);
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        p.dist += (2 + p.speed) * (0.4 + (isFinite(state.bg.speed) ? state.bg.speed : .55)) + keyHeat * 6;
        var maxD = Math.max(W, H) * .9;
        if (p.dist > maxD) { p.dist = rand(10, 120); p.angle = rand(0, 6.28); }
        var x1 = cx + Math.cos(p.angle) * p.dist, y1 = cy + Math.sin(p.angle) * p.dist * .7;
        var x2 = cx + Math.cos(p.angle) * (p.dist + 30 + p.speed * 3), y2 = cy + Math.sin(p.angle) * (p.dist + 30) * .7;
        ctx.lineWidth = 1 + (p.dist / maxD) * 2;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }

    function drawMesh(strong) {
      var i, j;
      var mx = pointer.x * W, my = pointer.y * H;
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        var home = strong ? p.hx : null;
        var dx = p.x - (mx), dy = p.y - (my);
        var d = Math.hypot(dx, dy) || 1;
        if (pointer.inside && d < 220) {
          var force = (1 - d / 220) * (strong ? -2.4 : 1.9);
          p.vx += (dx / d) * force * .3;
          p.vy += (dy / d) * force * .3;
        }
        p.vx *= .94; p.vy *= .94;
        p.x += p.vx + (strong ? 0 : Math.cos(p.a) * .2);
        p.y += p.vy + (strong ? 0 : Math.sin(p.a * .7) * .2);
        if (strong) {
          p.vx += (p.hx - p.x) * .012;
          p.vy += (p.hy - p.y) * .012;
          if (tick % 300 === 0) { p.hx = rand(0, W); p.hy = rand(0, H); p.x = p.hx; p.y = p.hy; }
        } else {
          p.a += .004;
        }
        if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20;
        void home;
      }
      ctx.lineWidth = 1;
      for (i = 0; i < parts.length; i++) {
        var a = parts[i];
        for (j = i + 1; j < parts.length; j++) {
          var b = parts[j];
          var dd = Math.hypot(a.x - b.x, a.y - b.y);
          if (dd < 118) {
            ctx.strokeStyle = hexToRgba(accent, (1 - dd / 118) * .28);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
        ctx.fillStyle = hexToRgba(j % 2 ? accent2 : accent, .55 + (pointer.inside ? .3 : 0));
        ctx.beginPath(); ctx.arc(a.x, a.y, a.r + (strong ? 1 : 0), 0, 6.28); ctx.fill();
      }
    }

    function drawParticles() {
      var i;
      var mx = pointer.x * W, my = pointer.y * H;
      for (i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (p.conf) {
          p.vy += p.gravity || .2;
          p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= .008;
          if (p.life <= 0 || p.y > H + 40) { parts.splice(i, 1); i--; continue; }
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.rot);
          ctx.fillStyle = hexToRgba(p.hue > .5 ? accent : accent2, Math.max(0, p.life));
          ctx.fillRect(-p.r, -p.r * .6, p.r * 2, p.r * 1.2);
          ctx.restore();
          continue;
        }
        var drift = (0.4 + (isFinite(state.bg.speed) ? state.bg.speed : .55));
        if (mode === 'snow' || mode === 'petals') {
          p.y += p.vy * drift * 1.6;
          p.x += p.vx + Math.sin((p.y + p.r * 40) * .01) * .6 + (pointer.inside ? (p.x - mx) * 0.0007 * (1 - Math.min(1, Math.hypot(p.x - mx, p.y - my) / 300)) * 40 : 0);
          if (p.y > H + 12) { p.y = -12; p.x = rand(0, W); }
        } else if (mode === 'embers' || mode === 'bubbles' || mode === 'shimmer') {
          p.y += p.vy * drift * 1.7;
          p.x += p.vx + Math.sin(tick * .02 + p.a) * .5;
          if (pointer.inside) {
            var d = Math.hypot(p.x - mx, p.y - my);
            if (d < 130) { p.x += (p.x - mx) / (d || 1) * 1.6; p.y += (p.y - my) / (d || 1) * 1.1; }
          }
          if (p.y < -14) { p.y = H + rand(0, 80); p.x = rand(0, W); }
        } else if (mode === 'fireflies') {
          p.vx += rand(-.06, .06) + (pointer.inside ? (mx - p.x) * 0.00022 : 0);
          p.vy += rand(-.06, .06) + (pointer.inside ? (my - p.y) * 0.00022 : 0);
          p.vx = Math.max(-1.5, Math.min(1.5, p.vx * .985));
          p.vy = Math.max(-1.5, Math.min(1.5, p.vy * .985));
          p.x += p.vx * drift * 1.4; p.y += p.vy * drift * 1.4;
          p.phase += .05;
          if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
          if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        } else if (mode === 'rain') {
          p.y += p.vy * drift * 1.5;
          if (pointer.inside && Math.abs(p.x - mx) < 60 && Math.abs(p.y - my) < 90) p.x += (p.x - mx) * .06;
          if (p.y > H + 30) { p.y = rand(-200, -10); p.x = rand(0, W); }
        } else {
          p.a += .01 * drift;
          p.x += Math.cos(p.a) * p.s * drift;
          p.y += Math.sin(p.a * 1.3) * p.s * drift;
          if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
          if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        }
        var glow = mode === 'fireflies' ? (Math.sin(p.phase) * .5 + .5) : (mode === 'shimmer' ? (Math.sin(tick * .05 + p.a * 9) * .5 + .5) : 1);
        var col = p.hue > .62 ? accent2 : accent;
        if (mode === 'snow' || mode === 'petals') col = p.hue > .8 ? accent2 : '#ffffff';
        if (mode === 'rain') col = '#ffffff';
        ctx.fillStyle = hexToRgba(col, (mode === 'rain' ? .3 : .12) + p.o * glow * .55);
        if (mode === 'rain') {
          ctx.fillRect(p.x, p.y, 1.2, p.trail * .4);
        } else if (mode === 'bubbles') {
          ctx.strokeStyle = hexToRgba(col, .18 + glow * .3);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.28); ctx.stroke();
        } else if (mode === 'petals') {
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
          ctx.beginPath(); ctx.ellipse(0, 0, p.r * 2.2, p.r, 0, 0, 6.28); ctx.fill(); ctx.restore();
        } else {
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 + glow * .5), 0, 6.28); ctx.fill();
        }
      }
    }

    function drawNoise() {
      var n = 150;
      for (var i = 0; i < n; i++) {
        var x = Math.random() * W, y = Math.random() * H;
        ctx.fillStyle = hexToRgba(Math.random() > .5 ? accent : '#ffffff', Math.random() * .06);
        ctx.fillRect(x, y, 2, 2);
      }
      var g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .3, W / 2, H / 2, Math.max(W, H) * .75);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,.45)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (tick % 3 === 0) {
        ctx.fillStyle = hexToRgba(accent, .012);
        ctx.fillRect(0, (tick * 3) % H, W, 2);
      }
    }

    function drawTrails() {
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < trail.length; i++) {
        var p = trail[i];
        ctx.fillStyle = hexToRgba(p.hue > .5 ? accent : accent2, p.life * .5);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * p.life * 3, 0, 6.28); ctx.fill();
      }
    }

    function drawRipples() {
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < ripples.length; i++) {
        var r = ripples[i];
        var rad = r.max * (1 - r.life);
        ctx.strokeStyle = hexToRgba(i % 2 ? accent2 : accent, r.life * .5);
        ctx.lineWidth = r.w;
        ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, 6.28); ctx.stroke();
      }
    }

    function drawRipplesOnly() {
      if (tick % 34 === 0) burst(rand(0, W), rand(0, H), 1);
      ctx.globalCompositeOperation = 'lighter';
      var mx = pointer.x * W, my = pointer.y * H;
      var g = ctx.createRadialGradient(mx, my, 0, mx, my, 240);
      g.addColorStop(0, hexToRgba(accent, .07));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    function drawSpotlight(strength) {
      var mx = pointer.x * W, my = pointer.y * H;
      var r = 260 + Math.hypot(pointer.vx, pointer.vy) * 900;
      var g = ctx.createRadialGradient(mx, my, 0, mx, my, r);
      g.addColorStop(0, hexToRgba(accent, .13 * strength));
      g.addColorStop(.6, hexToRgba(accent2, .05 * strength));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    var bound = false;
    function bind() {
      if (bound) return;
      bound = true;
      window.addEventListener('resize', resize);
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('pointerdown', onDown, { passive: true });
      window.addEventListener('pointerup', onUp, { passive: true });
      window.addEventListener('pointerleave', onLeave, { passive: true });
      window.addEventListener('keydown', onKey, { passive: true });
    }
    function unbind() {
      if (!bound) return;
      bound = false;
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('keydown', onKey);
    }

    return {
      mode: mode,
      start: function () {
        if (state.ui.reduceMotion && mode !== 'noise') {
          // reduced motion: paint one static frame instead of animating
          resize();
          ctx.fillStyle = base;
          ctx.fillRect(0, 0, W, H);
          drawAurora();
          return;
        }
        running = true;
        bind();
        resize();
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(frame);
      },
      stop: function () { running = false; cancelAnimationFrame(raf); unbind(); },
      setMode: function (m) { mode = m; t = resolvedTheme(); accent = t.accent; accent2 = t.accent2; base = t.bg; seed(); },
      reseed: function () { seed(); }
    };
  }

  // ---------------------------------------------------------------- cloak --
  function cloakValues() {
    var c = state.cloak;
    var preset = cloakById(c.preset);
    var name = (c.name || (preset && c.preset !== 'custom' ? preset.name : '') || 'GG Lounge');
    var icon = '';
    if (c.iconMode === 'url' && c.icon) icon = proxyImage(c.icon);
    else if (c.iconMode === 'letter' || (!c.icon && !preset)) icon = letterIcon(name, c.color || (preset && preset.tint) || '#1a73e8');
    else if (preset && preset.icon) icon = proxyImage(preset.icon);
    else if (c.icon) icon = proxyImage(c.icon);
    else icon = letterIcon(name, c.color || (preset && preset.tint) || '#1a73e8');
    return { name: name, icon: icon, preset: preset };
  }

  function letterIcon(name, color) {
    // Draw the first letter as a favicon — no network, never blocked.
    try {
      var cv = document.createElement('canvas');
      cv.width = cv.height = 64;
      var g = cv.getContext('2d');
      g.fillStyle = color || '#1a73e8';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#fff';
      g.font = 'bold 34px Arial, Helvetica, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(String(name || 'G').trim().charAt(0).toUpperCase() || 'G', 32, 34);
      return cv.toDataURL('image/png');
    } catch (e) {
      return '';
    }
  }

  function applyCloak(opts) {
    var c = state.cloak;
    var vals = cloakValues();
    if (!opts || opts.title !== false) {
      var want = c.enabled ? vals.name : DEFAULT_TITLE;
      if (document.title !== want) {
        document.title = want;
        // installed apps / game iframes follow the same title
        var t2 = document.querySelector('title');
        if (t2) t2.textContent = want;
      }
    }
    if (!opts || opts.icon !== false) {
      var href = c.enabled && vals.icon ? vals.icon : DEFAULT_FAVICON;
      var links = document.querySelectorAll('link[rel~="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]');
      if (!links.length) {
        var l = document.createElement('link');
        l.rel = 'icon';
        document.head.appendChild(l);
        links = [l];
      }
      for (var i = 0; i < links.length; i++) {
        if (links[i].getAttribute('href') !== href) {
          links[i].setAttribute('type', /\.svg/i.test(href) ? 'image/svg+xml' : 'image/png');
          links[i].setAttribute('href', href);
        }
      }
    }
    syncCloakCookie(vals);
  }

  var DEFAULT_TITLE = document.title || 'GG Lounge';
  var DEFAULT_FAVICON = (function () {
    var l = document.querySelector('link[rel~="icon"]');
    return l ? l.getAttribute('href') : '/icon.svg';
  })();

  /** The manifest route reads this cookie, so installs / re-installs match. */
  function syncCloakCookie(vals) {
    var payload = {
      n: vals.name.slice(0, 60),
      s: (vals.preset && vals.preset.short ? vals.preset.short : vals.name).slice(0, 16),
      i: vals.icon && !/^data:/.test(vals.icon) ? vals.icon.slice(0, 300) : '',
      t: resolvedTheme().bg
    };
    try {
      document.cookie = 'gg_cloak=' + encodeURIComponent(JSON.stringify(payload)) +
        '; path=/; max-age=31536000; samesite=lax';
    } catch (e) { /* noop */ }
    if (state.cloak.appCloak) {
      var link = document.querySelector('link[rel="manifest"]');
      var k = hash(JSON.stringify(payload));
      var target = '/manifest.webmanifest?k=' + k;
      if (link) {
        if (link.getAttribute('href') !== target) link.setAttribute('href', target);
      } else if (!inFrame()) {
        var ml = document.createElement('link');
        ml.rel = 'manifest';
        ml.href = target;
        document.head.appendChild(ml);
      }
    }
  }

  function hash(str) {
    var h = 5381;
    for (var i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
    return (h >>> 0).toString(36);
  }

  // -------------------------------------------------- about:blank window --
  var DEFER_TITLE = 'Google Classroom';

  function openAboutBlank(targetUrl) {
    var vals = cloakValues();
    var url = targetUrl || location.href;
    var w = window.open('', '_blank', 'width=1280,height=860,noopener=no');
    if (!w) {
      // popup blocked → fall back to a plain new tab
      window.open(url, '_blank');
      return null;
    }
    try {
      w.document.title = state.cloak.enabled ? vals.name : DEFER_TITLE;
      w.document.head.innerHTML =
        '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
        (vals.icon ? '<link rel="icon" href="' + vals.icon.replace(/"/g, '') + '">' : '') +
        '<style>html,body{margin:0;height:100%;background:' + resolvedTheme().bg + '}iframe{border:0;width:100%;height:100%;display:block}</style>';
      w.document.body.innerHTML = '<iframe src="' + url.replace(/"/g, '%22') + '" allow="fullscreen; autoplay; clipboard-write; encrypted-media"></iframe>';
      if (state.cloak.hideUrlHint !== false) {
        setTimeout(function () { try { w.focus(); } catch (e) { /* noop */ } }, 30);
      }
      return w;
    } catch (e) {
      try { w.location.href = url; } catch (e2) { /* noop */ }
      return w;
    }
  }

  // ------------------------------------------------------------- panic key --
  var panicArmed = true;
  var fakeMode = false;
  var fakeRestore = null;

  function eventMatches(e) {
    var p = state.panic;
    if (!p.enabled || !p.key) return false;
    // The Settings recorder is grabbing the next keypress on purpose.
    if (window.__gg_captureKey) return false;
    var key = String(e.key || '');
    var want = String(p.key || '').toLowerCase();
    var backup = String(p.alt || '').toLowerCase();
    var k = key.toLowerCase();
    var pressed = (want && k === want) || (backup && k === backup);
    if (!pressed) return false;
    // Inside a text field, only "never typed by accident" keys interrupt.
    var target = e.target;
    var typing =
      !!target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable);
    if (typing) {
      var chord = e.altKey || e.ctrlKey || e.metaKey;
      var quiet = /^(Escape|F\d{1,2}|Backquote|GraveAccent|`|~|Tab)$/i.test(key);
      if (!chord && !quiet) return false;
    }
    if (p.requireModifier) {
      var want = String(p.modifier || 'Alt').toLowerCase();
      var ok = (want === 'alt' && e.altKey) || (want === 'ctrl' && (e.ctrlKey || e.metaKey)) ||
        (want === 'shift' && e.shiftKey) || (want === 'none');
      if (!ok) return false;
    }
    return true;
  }

  function panicTargetUrl() {
    var p = state.panic;
    if (p.url) return p.url;
    var t = panicById(p.target);
    return (t && t.url) || 'https://classroom.google.com';
  }

  /**
   * True when an outer lounge document owns the panic action for this window.
   * Games are iframed by the arcade, and both documents run gg-boot: without an
   * owner rule "open in new tab" would fire once per frame.
   */
  function panicOwnedElsewhere() {
    try {
      return inFrame() && !!(window.top && window.top.GG && window.top.GG.ownsPanic);
    } catch (e) {
      return false; // cross-origin parent: bail ourselves out
    }
  }

  function panicNow(fromPeer) {
    var p = state.panic;
    if (!p.enabled) return;
    var url = panicTargetUrl();
    // A game can hold focus inside an iframe, so tell every other window of this
    // tab/origin to bail out with us - otherwise the arcade shell stays put.
    if (!fromPeer) {
      try { if (gotChannel) gotChannel.postMessage('panic'); } catch (e) { /* noop */ }
    }
    if (panicOwnedElsewhere()) {
      // "new tab" leaves the lounge visible, so only hide when the outer
      // document is about to navigate or paint a decoy over everything.
      if (p.mode !== 'newtab') {
        try { document.documentElement.style.visibility = 'hidden'; } catch (e) { /* noop */ }
      }
      return;
    }
    if (p.mode === 'fake') { showFake(); return; }
    if (p.mode === 'newtab') {
      try { window.open(url, '_blank'); } catch (e) { /* popup blocked */ }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      return;
    }
    // replace: the lounge leaves the history entry behind
    var win = window;
    try {
      // same-origin games get navigated at the tab level
      if (window.top && window.top !== window && window.top.location && window.top.location.href) win = window.top;
    } catch (e) { win = window; }
    try {
      if (p.backGuard) {
        win.history.replaceState({ ggPanic: 1 }, '', win.location.href);
        win.history.pushState({ ggPanic: 1 }, '', win.location.href);
      }
    } catch (e) { /* noop */ }
    try {
      win.location.replace(url);
    } catch (e) {
      try { location.replace(url); } catch (e2) { /* noop */ }
    }
  }

  /**
   * Instant fake page: no navigation at all, so there is no spinner and no
   * URL change — the lounge DOM is hidden behind a boring school-looking page.
   */
  function showFake() {
    if (fakeMode) return;
    fakeMode = true;
    var t = resolvedTheme();
    var holder = document.createElement('div');
    holder.id = 'gg-fake-page';
    holder.setAttribute('style', 'position:fixed;inset:0;z-index:2147483000;background:#fff;color:#202124;' +
      'font-family:Google Sans,Roboto,Arial,sans-serif;overflow:auto;padding:0');
    holder.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;height:56px;padding:0 20px;border-bottom:1px solid #dadce0;background:#fff">' +
      '<div style="width:26px;height:26px;border-radius:6px;background:#1a73e8;color:#fff;display:grid;place-items:center;font-weight:700;font-size:14px">G</div>' +
      '<div style="font-size:15px;font-weight:500;color:#5f6368">' + esc(state.panic.fakeTitle || 'Google Docs') + '</div>' +
      '<div style="margin-left:auto;font-size:12px;color:#5f6368">Saved to Drive</div></div>' +
      '<div style="max-width:820px;margin:56px auto 0;padding:0 24px;line-height:1.9;font-size:15px">' +
      '<h1 style="font-size:28px;font-weight:400;margin:0 0 18px">Chapter 4 — Industrial Revolution</h1>' +
      '<p>Urbanisation grew quickly because factory work drew people from farms into towns. ' +
      'Steam power, coal and iron moved everything: goods, people, and ideas.</p>' +
      '<p>Questions to answer before Friday:</p><ol><li>What made textile production faster?</li>' +
      '<li>Describe one benefit and one cost of rail transport.</li>' +
      '<li>Why did factory towns grow so fast?</li></ol>' +
      '<p style="color:#5f6368;font-size:13px">Click anywhere (or press the panic key again) to return.</p></div>';
    document.body.appendChild(holder);
    var prevTitle = document.title;
    document.title = 'Google Docs';
    fakeRestore = function () {
      fakeMode = false;
      document.title = prevTitle;
      holder.remove();
      document.removeEventListener('click', onClick, true);
    };
    function onClick(e) {
      if (!fakeMode) return;
      e.preventDefault();
      e.stopPropagation();
      if (fakeRestore) fakeRestore();
    }
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', function onKey2(e) {
      if (!fakeMode) { document.removeEventListener('keydown', onKey2, true); return; }
      if (e.key === state.panic.key || e.key === 'Escape') {
        if (fakeRestore) fakeRestore();
        applyCloak();
      }
    }, true);
    void t;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var blurTimer = null;
  function bindPanicKeys() {
    if (GG_panicBound) return;
    GG_panicBound = true;
    window.addEventListener('keydown', function (e) {
      if (eventMatches(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        panicNow();
      }
    }, true);
    window.addEventListener('blur', function () {
      if (!state.panic.panicOnBlur) return;
      clearTimeout(blurTimer);
      blurTimer = setTimeout(function () {
        if (document.hasFocus && document.hasFocus()) return;
        panicNow();
      }, Math.max(120, state.panic.blurDelay || 400));
    });
    window.addEventListener('focus', function () { clearTimeout(blurTimer); });
    // popups / back navigation should re-apply the cloak
    window.addEventListener('pageshow', function () { applyAll(); });
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && state.cloak.enabled) applyCloak();
      if (engine) { if (document.hidden) engine.stop(); else engine.start(); }
    });
  }
  var GG_panicBound = false;

  // --------------------------------------------------------- install (PWA) --
  var deferredPrompt = null;
  function bindInstall() {
    window.addEventListener('beforeinstallprompt', function (e) {
      deferredPrompt = e;
      document.dispatchEvent(new CustomEvent('gg:installable', { detail: { canPrompt: true } }));
    });
    window.addEventListener('appinstalled', function () {
      deferredPrompt = null;
      document.dispatchEvent(new CustomEvent('gg:installed'));
    });
  }

  function installApp() {
    syncCloakCookie(cloakValues());
    if (deferredPrompt && deferredPrompt.prompt) {
      deferredPrompt.prompt();
      return deferredPrompt.userChoice.then(function () {
        return { ok: true };
      }).catch(function () { return { ok: false }; });
    }
    return Promise.resolve({ ok: false, needsManual: true });
  }

  // --------------------------------------------------------------- apply() --
  function applyAll(opts) {
    opts = opts || {};
    applyTheme();
    applyBackground();
    applyMediaSettings();
    applyCloak(opts);
    bindPanicKeys();
    if (!opts.fromSync) writeStorage();
    if (!opts.fromSync && gotChannel) { try { gotChannel.postMessage({ t: Date.now() }); } catch (e) { /* noop */ } }
    notify();
  }

  function notify() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](state, resolvedTheme()); } catch (e) { /* listener error */ }
    }
  }

  // -------------------------------------------------------------------- API --
  var GG = {
    version: VERSION,
    presets: { cloaks: CLOAKS, panicTargets: PANIC_TARGETS, themes: THEMES, backgrounds: BACKGROUNDS },
    defaults: defaults,
    get: function () { return clone(state); },
    theme: function () { return resolvedTheme(); },
    cloakValues: cloakValues,
    isStandalone: isStandalone,
    inFrame: inFrame,
    ownsPanic: !(function () { try { return window.top !== window; } catch (e) { return false } })(),
    subscribe: function (fn) {
      listeners.push(fn);
      return function () { listeners = listeners.filter(function (f) { return f !== fn; }); };
    },
    set: function (patch, opts) {
      state = merge(state, patch);
      applyAll(opts);
      return clone(state);
    },
    patch: function (section, values) {
      var s = {};
      s[section] = values;
      return GG.set(s);
    },
    reset: function () {
      state = defaults();
      try { localStorage.removeItem(KEY); } catch (e) { /* noop */ }
      applyAll();
      return clone(state);
    },
    import: function (json) {
      var parsed = typeof json === 'string' ? JSON.parse(json) : json;
      if (!isObj(parsed)) throw new Error('Bad payload');
      state = merge(defaults(), parsed);
      applyAll();
      return clone(state);
    },
    export: function () { return JSON.stringify(state, null, 2); },
    panic: panicNow,
    panicTarget: panicTargetUrl,
    cloakNow: function (url) { return openAboutBlank(url); },
    showFake: showFake,
    install: installApp,
    canInstall: function () { return !!deferredPrompt; },
    refresh: function () { reloadFromStorage(false); },
    applyBackground: applyBackground,
    applyCloak: applyCloak,
    reseedBackground: function () { if (engine) engine.reseed(); },
    setThemeBackground: function (themeId) {
      var t = themeById(themeId);
      state.theme.id = t.id;
      state.bg.id = t.bgMode || 'aurora';
      applyAll();
      return clone(state);
    },
    storageKey: KEY
  };
  window.GG = GG;

  // -------------------------------------------------------------- startup --
  function boot() {
    var stored = readStorage();
    if (stored) state = merge(defaults(), stored);
    applyAll({ notify: false });
    bindInstall();
    // keep the cloak on after back/forward cache restores
    window.addEventListener('focus', function () {
      if (state.cloak.enabled && document.title !== cloakValues().name) applyCloak();
    });
    window.addEventListener('storage', function (e) {
      if (e.key === KEY || LEGACY_KEYS.indexOf(e.key) >= 0) reloadFromStorage(true);
    });
    if (state.cloak.autoCloak && !inFrame() && !isStandalone()) {
      var once = function () {
        document.removeEventListener('pointerdown', once);
        if (state.cloak.aboutBlank) openAboutBlank(location.origin + '/');
      };
      document.addEventListener('pointerdown', once, { once: true });
    }
    document.dispatchEvent(new CustomEvent('gg:ready'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
    // theme + cloak should already be right for first paint
    var stored0 = readStorage();
    if (stored0) state = merge(defaults(), stored0);
    applyTheme();
  } else {
    boot();
  }
})();
