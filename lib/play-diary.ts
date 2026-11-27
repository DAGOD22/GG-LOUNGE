/**
 * The Play Diary.
 *
 * A secret that keeps an honest, local record of everything the visitor
 * opens: game id, title, when. Nothing leaves the device — this is a diary,
 * not telemetry. The vault's diary card is the only reader.
 *
 * Written from the launcher itself (one line in `launch`), so every path that
 * opens a game — cards, palette, deep links, co-op invites — lands here.
 */

const KEY = 'ggl_diary';
const MAX_ENTRIES = 300;

export type DiaryEntry = { id: string; title: string; at: number };

export function readDiary(): DiaryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(entry => entry && typeof entry.id === 'string') : [];
  } catch {
    return [];
  }
}

export function recordDiaryEntry(id: string, title: string): void {
  if (typeof window === 'undefined') return;
  try {
    const diary = readDiary();
    diary.push({ id, title, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(diary.slice(-MAX_ENTRIES)));
  } catch {
    /* storage refused — a diary nobody can keep is fine to lose */
  }
}

export function clearDiary(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

/** "3 minutes ago" style, but tiny — the vault shows whole rows of these. */
export function diaryWhen(at: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - at) / 60000));
  if (minutes < 90) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 36) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}
