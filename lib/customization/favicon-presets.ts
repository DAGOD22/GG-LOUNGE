/**
 * Real favicon presets.
 *
 * The old "presets" were emoji rendered into an SVG data URL. That technically
 * produces a favicon, but it looks like an emoji in a tab — nothing like the
 * sites people are trying to blend in with, which all use a coloured square with
 * an abstract mark. These are drawn as SVG, so they render crisply at 16px, need
 * no network request, and cannot break.
 */

export interface FaviconPreset {
  id: string;
  /** What the tab pretends to be, for the picker label. */
  name: string;
  /** Background colour, also used by the picker swatch. */
  bg: string;
  /** Mark colour. */
  fg: string;
  /** Builds the SVG body at 64x64. */
  svg: string;
}

const P = (id: string, name: string, bg: string, fg: string, body: string): FaviconPreset => ({
  id, name, bg, fg,
  svg: `<rect width="64" height="64" rx="14" fill="${bg}"/>${body}`,
});

export const FAVICON_PRESETS: FaviconPreset[] = [
  P('docs', 'Documents', '#1a73e8', '#ffffff',
    `<path d="M22 14h13l9 9v27H22z" fill="${'#ffffff'}" opacity=".18"/><path d="M22 14h13l9 9v27H22z" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"/><path d="M35 14v9h9" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"/><path d="M28 35h14M28 42h10" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/>`),
  P('sheets', 'Spreadsheet', '#0f9d58', '#ffffff',
    `<rect x="16" y="16" width="32" height="32" rx="3" fill="none" stroke="#ffffff" stroke-width="3.5"/><path d="M16 27h32M16 37h32M27 16v32" stroke="#ffffff" stroke-width="3"/>`),
  P('slides', 'Slides', '#f4b400', '#0b0d12',
    `<rect x="15" y="18" width="34" height="24" rx="3" fill="none" stroke="#0b0d12" stroke-width="3.5"/><path d="M32 24v12M26 30h12" stroke="#0b0d12" stroke-width="3.5" stroke-linecap="round"/><path d="M26 48h12" stroke="#0b0d12" stroke-width="3.5" stroke-linecap="round"/>`),
  P('mail', 'Mail', '#ea4335', '#ffffff',
    `<rect x="14" y="20" width="36" height="24" rx="3" fill="none" stroke="#ffffff" stroke-width="3.5"/><path d="M15 22l17 13 17-13" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"/>`),
  P('drive', 'Drive', '#4285f4', '#ffffff',
    `<path d="M26 16h12l14 24H40z" fill="#ffffff" opacity=".9"/><path d="M26 16L12 40l6 10 14-24z" fill="#ffffff" opacity=".65"/><path d="M18 50h26l6-10H24z" fill="#ffffff" opacity=".8"/>`),
  P('notion', 'Notes', '#ffffff', '#111111',
    `<rect x="14" y="14" width="36" height="36" rx="4" fill="none" stroke="#111" stroke-width="3.5"/><path d="M23 44V22l18 22V22" fill="none" stroke="#111" stroke-width="3.5" stroke-linejoin="round"/>`),
  P('canvas', 'Classroom', '#0f9d58', '#ffffff',
    `<circle cx="32" cy="32" r="16" fill="none" stroke="#ffffff" stroke-width="3.5"/><circle cx="32" cy="32" r="6" fill="#ffffff"/><path d="M32 16v6M32 42v6M16 32h6M42 32h6" stroke="#ffffff" stroke-width="3"/>`),
  P('calendar', 'Calendar', '#1a73e8', '#ffffff',
    `<rect x="15" y="19" width="34" height="30" rx="3" fill="none" stroke="#ffffff" stroke-width="3.5"/><path d="M15 28h34" stroke="#ffffff" stroke-width="3.5"/><path d="M24 15v7M40 15v7" stroke="#ffffff" stroke-width="3.5" stroke-linecap="round"/><rect x="23" y="34" width="7" height="7" rx="1.5" fill="#ffffff"/>`),
  P('slack', 'Chat', '#4a154b', '#ffffff',
    `<rect x="26" y="14" width="7" height="20" rx="3.5" fill="#36c5f0"/><rect x="34" y="26" width="20" height="7" rx="3.5" fill="#2eb67d"/><rect x="30" y="30" width="7" height="20" rx="3.5" fill="#ecb22e"/><rect x="10" y="30" width="20" height="7" rx="3.5" fill="#e01e5a"/>`),
  P('github', 'Code', '#24292f', '#ffffff',
    `<circle cx="32" cy="32" r="17" fill="none" stroke="#ffffff" stroke-width="3.5"/><path d="M25 46v-6c0-3 2-4 2-4-4-1-7-3.5-7-8a8 8 0 0 1 2-5c-.5-2 0-4 0-4s2 0 4 2a13 13 0 0 1 12 0c2-2 4-2 4-2s.5 2 0 4a8 8 0 0 1 2 5c0 4.5-3 7-7 8 0 0 2 1 2 4v6" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"/>`),
  P('terminal', 'Terminal', '#0b0d12', '#22d37f',
    `<rect x="12" y="16" width="40" height="32" rx="4" fill="none" stroke="#22d37f" stroke-width="3.5"/><path d="M21 28l6 5-6 5M32 38h11" fill="none" stroke="#22d37f" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`),
  P('library', 'Library', '#6b4fbb', '#ffffff',
    `<path d="M18 18h7v28h-7zM28 18h7v28h-7z" fill="#ffffff" opacity=".85"/><path d="M38 19l7 2 6 25-7 2z" fill="#ffffff" opacity=".6"/>`),
  P('science', 'Science', '#00a1a7', '#ffffff',
    `<path d="M27 16h10v10l9 20a4 4 0 0 1-3.5 6H21.5A4 4 0 0 1 18 46l9-20z" fill="none" stroke="#ffffff" stroke-width="3.5" stroke-linejoin="round"/><path d="M24 38h16" stroke="#ffffff" stroke-width="3.5"/>`),
];

const cache = new Map<string, string>();

/** Turn a preset into a data URL favicon. Cached: this runs on every render. */
export function presetIcon(preset: FaviconPreset): string {
  const hit = cache.get(preset.id);
  if (hit) return hit;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">${preset.svg}</svg>`;
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  cache.set(preset.id, url);
  return url;
}

/**
 * `about:blank` as a favicon. A blank tab has an empty icon, and drawing one is
 * the only way to reproduce that: a transparent 64x64 with nothing in it.
 */
export const BLANK_FAVICON =
  'data:image/svg+xml,' +
  encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"></svg>');

/** Titles that go with about:blank cloaking, in the order they help most. */
export const BLANK_TITLES = ['about:blank', '', 'New Tab', 'Untitled'];
