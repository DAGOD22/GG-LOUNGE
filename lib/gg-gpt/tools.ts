/**
 * GG-GPT tools: web search, image generation, video generation.
 *
 * Web search has no key. It scrapes the public result pages of a couple of
 * engines and normalises them; if everything is blocked it degrades to a
 * clearly-labelled "could not reach the web" note rather than inventing
 * results, because a hallucinated citation is worse than none.
 */

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

const UA = "Mozilla/5.0 (compatible; GG-GPT/1.0; +https://gg-lounge.vercel.app)";

function stripTags(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeDuckUrl(href: string): string {
  // DuckDuckGo wraps results as //duckduckgo.com/l/?uddg=<encoded>
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      /* fall through */
    }
  }
  if (href.startsWith("//")) return `https:${href}`;
  return href;
}

async function duckduckgo(query: string): Promise<SearchHit[]> {
  const res = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
    headers: { "user-agent": UA, accept: "text/html" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const html = await res.text();
  const hits: SearchHit[] = [];
  const blocks = html.split(/<div[^>]*class="[^"]*result__body[^"]*"/).slice(1);
  for (const block of blocks) {
    const link = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const snippet = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/) ||
      block.match(/<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const url = decodeDuckUrl(link[1]);
    if (!/^https?:/.test(url)) continue;
    hits.push({
      title: stripTags(link[2]).slice(0, 180),
      url,
      snippet: snippet ? stripTags(snippet[1]).slice(0, 400) : "",
    });
    if (hits.length >= 8) break;
  }
  return hits;
}

async function bingRss(query: string): Promise<SearchHit[]> {
  // Bing's RSS output is stable, tiny and needs no key.
  const res = await fetch(`https://www.bing.com/search?format=rss&q=${encodeURIComponent(query)}`, {
    headers: { "user-agent": UA, accept: "application/rss+xml, application/xml" },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const hits: SearchHit[] = [];
  for (const item of xml.split("<item>").slice(1)) {
    const title = item.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1] ?? "";
    const desc = item.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "";
    if (!link) continue;
    hits.push({
      title: stripTags(title).slice(0, 180),
      url: link.trim(),
      snippet: stripTags(desc).slice(0, 400),
    });
    if (hits.length >= 8) break;
  }
  return hits;
}

async function wikipedia(query: string): Promise<SearchHit[]> {
  const res = await fetch(
    `https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=${encodeURIComponent(query)}`,
    { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) return [];
  const json = (await res.json()) as { query?: { search?: Array<{ title: string; snippet: string }> } };
  return (json.query?.search || []).map(r => ({
    title: r.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
    snippet: stripTags(r.snippet).slice(0, 400),
  }));
}

export async function webSearch(query: string): Promise<{ hits: SearchHit[]; source: string }> {
  const clean = query.trim().slice(0, 300);
  if (!clean) return { hits: [], source: "none" };
  const engines: Array<[string, (q: string) => Promise<SearchHit[]>]> = [
    ["duckduckgo", duckduckgo],
    ["bing", bingRss],
    ["wikipedia", wikipedia],
  ];
  for (const [name, fn] of engines) {
    try {
      const hits = await fn(clean);
      if (hits.length) return { hits, source: name };
    } catch {
      // next engine
    }
  }
  return { hits: [], source: "unreachable" };
}

/** Compact, model-friendly rendering of search hits. */
export function renderHits(hits: SearchHit[]): string {
  return hits
    .map((h, i) => `${i + 1}. ${h.title} — ${h.url}${h.snippet ? `\n   ${h.snippet}` : ""}`)
    .join("\n");
}
