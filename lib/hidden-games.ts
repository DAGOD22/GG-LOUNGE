/**
 * The Power Menu's hide list.
 *
 * Right-clicking a game card (with the secret on) can hide it from the home
 * catalogue. Hidden ids live in localStorage under `ggl_hidden`; the home
 * page filters them out. One event (`ggl:hidden-games`) tells everyone
 * listening — the page, the vault's restore button — that the list changed,
 * so a hide is visible the moment the menu closes.
 */

const KEY = 'ggl_hidden';

export const HIDDEN_EVENT = 'ggl:hidden-games';

export function readHidden(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

export function hideGame(id: string): void {
  if (typeof window === 'undefined' || !id) return;
  try {
    const hidden = readHidden();
    if (!hidden.includes(id)) localStorage.setItem(KEY, JSON.stringify([...hidden, id]));
    window.dispatchEvent(new CustomEvent(HIDDEN_EVENT));
  } catch {
    /* storage refused */
  }
}

export function unhideAll(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent(HIDDEN_EVENT));
  } catch {
    /* nothing to do */
  }
}
