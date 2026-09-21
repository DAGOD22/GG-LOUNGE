/** Exact identities + explicit aliases, never fuzzy matching that deletes sequels. */
const aliases: Record<string, string> = {
  erraria: 'terraria', geometrydashworking: 'geometrydash', geometrydashfixed: 'geometrydash',
  mrmine: 'mrmine', catpizza: 'catpizza', papaspizzaria: 'papaspizzeria',
};
export function canonicalGameTitle(value: string): string {
  const key = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  return aliases[key] || key;
}
export function dedupeGames<T extends { id: string; title: string; path?: string }>(items: T[]): T[] {
  const ids = new Set<string>(), titles = new Set<string>(), paths = new Set<string>();
  return items.filter(item => {
    const title = canonicalGameTitle(item.title);
    const path = item.path?.replace(/\/index\.html(?:\?.*)?$|\/$/g, '');
    if (ids.has(item.id) || (title && titles.has(title)) || (path && paths.has(path))) return false;
    ids.add(item.id); if (title) titles.add(title); if (path) paths.add(path);
    return true;
  });
}
export function mergeDuplicateRequests<T extends { id: string; title: string; status: string; votes?: number; createdAt: string }>(items: T[]): T[] {
  const grouped = new Map<string, T>();
  // Oldest canonical ID stays stable for voting and old bookmarks; retain originals in storage.
  for (const item of [...items].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || a.id.localeCompare(b.id))) {
    const key = `${canonicalGameTitle(item.title)}:${item.status}`;
    const existing = grouped.get(key);
    if (existing) existing.votes = (existing.votes ?? 1) + (item.votes ?? 1);
    else grouped.set(key, { ...item, votes: item.votes ?? 1 });
  }
  return [...grouped.values()].sort((a, b) => (b.votes ?? 1) - (a.votes ?? 1) || String(a.createdAt).localeCompare(String(b.createdAt)));
}
