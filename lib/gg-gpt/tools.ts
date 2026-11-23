/**
 * GG-GPT tools.
 *
 * Every tool here is keyless and answers a question the model would otherwise
 * have to invent: today's weather, a live exchange rate, the current price of a
 * thing, what a word means. That distinction matters — a language model's
 * memory of "what the weather is" is always wrong, and a confidently wrong
 * answer is worse than a refusal.
 *
 * Each tool returns a compact string ready to drop into the prompt, plus a
 * `data` payload the UI can render as a card.
 */

export interface ToolResult {
  /** One or two lines, already formatted for the model. */
  text: string;
  /** Structured values the UI may render. */
  data?: unknown;
  source: string;
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

/* ------------------------------- search ------------------------------- */

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

function decodeDuckUrl(href: string): string {
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
    const snippet =
      block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/) ||
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

async function wikipediaSearch(query: string): Promise<SearchHit[]> {
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

/**
 * Search across several engines **at once** rather than one after another.
 * Sequential fallback means a single fast-but-empty engine costs the whole
 * latency budget before the useful one is even tried; racing them costs one
 * round trip and lets us keep the best result set instead of the first.
 *
 * Engines are ranked by how well they answer a question (not just keywords),
 * so a Wikipedia hit never beats a live DuckDuckGo hit, but a DuckDuckGo
 * challenge page never leaves the user with nothing.
 */
export async function webSearch(query: string): Promise<{ hits: SearchHit[]; source: string }> {
  const clean = query.trim().slice(0, 300);
  if (!clean) return { hits: [], source: "none" };
  const engines: Array<[string, (q: string) => Promise<SearchHit[]>, number]> = [
    ["duckduckgo", duckduckgo, 3],
    ["bing", bingRss, 2],
    ["wikipedia", wikipediaSearch, 1],
  ];
  const settled = await Promise.allSettled(engines.map(([, fn]) => fn(clean)));
  let bestHits: SearchHit[] = [];
  let bestSource = "unreachable";
  let bestScore = -1;
  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    if (r.status !== "fulfilled" || !r.value.length) continue;
    const [name, , rank] = engines[i];
    const score = rank * 10 + Math.min(r.value.length, 8);
    if (score > bestScore) {
      bestScore = score;
      bestHits = r.value;
      bestSource = name;
    }
  }
  return { hits: bestHits, source: bestSource };
}

export function renderHits(hits: SearchHit[]): string {
  return hits
    .map((h, i) => `${i + 1}. ${h.title} — ${h.url}${h.snippet ? `\n   ${h.snippet}` : ""}`)
    .join("\n");
}

/* ------------------------------- weather ------------------------------- */

const WEATHER_CODES: Record<number, string> = {
  0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
  45: "fog", 48: "freezing fog", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
  56: "freezing drizzle", 57: "heavy freezing drizzle", 61: "light rain", 63: "rain", 65: "heavy rain",
  66: "freezing rain", 67: "heavy freezing rain", 71: "light snow", 73: "snow", 75: "heavy snow",
  77: "snow grains", 80: "light showers", 81: "showers", 82: "violent showers",
  85: "snow showers", 86: "heavy snow showers", 95: "thunderstorm", 96: "thunderstorm with hail",
  99: "thunderstorm with heavy hail",
};

async function geocode(place: string): Promise<{ name: string; lat: number; lon: number } | null> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&language=en&format=json&name=${encodeURIComponent(place)}`,
    { signal: AbortSignal.timeout(10000) },
  );
  if (!res.ok) return null;
  const json = (await res.json()) as {
    results?: Array<{ name: string; latitude: number; longitude: number; country?: string; admin1?: string }>;
  };
  const hit = json.results?.[0];
  if (!hit) return null;
  const label = [hit.name, hit.admin1, hit.country].filter(Boolean).join(", ");
  return { name: label, lat: hit.latitude, lon: hit.longitude };
}

/** Live weather for a named place. Open-Meteo needs no key. */
export async function getWeather(place: string): Promise<ToolResult | null> {
  const geo = await geocode(place);
  if (!geo) return null;
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=3&timezone=auto`,
    { signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as {
    current?: Record<string, number>;
    current_units?: Record<string, string>;
    daily?: Record<string, Array<number | string>>;
  };
  const c = j.current || {};
  const u = j.current_units || {};
  const code = Number(c.weather_code ?? 0);
  const desc = WEATHER_CODES[code] || "unknown conditions";
  const lines = [
    `Right now in ${geo.name}: ${Math.round(Number(c.temperature_2m ?? 0))}°C (feels like ${Math.round(Number(c.apparent_temperature ?? 0))}°C), ${desc}.`,
    `Humidity ${c.relative_humidity_2m ?? "?"}${u.relative_humidity_2m || "%"}, wind ${c.wind_speed_10m ?? "?"} km/h, precipitation ${c.precipitation ?? 0} mm.`,
  ];
  const d = j.daily;
  if (d?.time?.length) {
    const days = d.time.slice(0, 3).map((day, i) =>
      `${day}: ${Math.round(Number(d.temperature_2m_max?.[i] ?? 0))}°/${Math.round(Number(d.temperature_2m_min?.[i] ?? 0))}°C, ${WEATHER_CODES[Number(d.weather_code?.[i] ?? 0)] || "—"}`,
    );
    lines.push(`Forecast — ${days.join(" | ")}`);
  }
  return { text: lines.join("\n"), data: { place: geo.name, current: c, daily: d }, source: "open-meteo" };
}

/* ----------------------------- conversions ----------------------------- */

/** Live FX rates, refreshed hourly in-process (the API is free and rate-limited). */
let fxCache: { at: number; rates: Record<string, number> } | null = null;
async function fxRates(): Promise<Record<string, number> | null> {
  if (fxCache && Date.now() - fxCache.at < 3_600_000) return fxCache.rates;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return fxCache?.rates ?? null;
    const j = (await res.json()) as { rates?: Record<string, number> };
    if (!j.rates) return fxCache?.rates ?? null;
    fxCache = { at: Date.now(), rates: j.rates };
    return j.rates;
  } catch {
    return fxCache?.rates ?? null;
  }
}

export async function convertCurrency(amount: number, from: string, to: string): Promise<ToolResult | null> {
  const rates = await fxRates();
  if (!rates) return null;
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (!rates[f] || !rates[t]) return null;
  const usd = amount / rates[f];
  const value = usd * rates[t];
  return {
    text: `${amount} ${f} = ${value.toFixed(2)} ${t} (mid-market rate, ${new Date().toISOString().slice(0, 10)})`,
    data: { amount, from: f, to: t, value, rate: value / amount },
    source: "open.er-api",
  };
}

const UNIT_ALIASES: Record<string, { base: string; factor: number }> = {
  mm: { base: "m", factor: 0.001 }, cm: { base: "m", factor: 0.01 }, m: { base: "m", factor: 1 },
  km: { base: "m", factor: 1000 }, in: { base: "m", factor: 0.0254 }, ft: { base: "m", factor: 0.3048 },
  yd: { base: "m", factor: 0.9144 }, mi: { base: "m", factor: 1609.344 },
  mg: { base: "g", factor: 0.001 }, g: { base: "g", factor: 1 }, kg: { base: "g", factor: 1000 },
  oz: { base: "g", factor: 28.3495 }, lb: { base: "g", factor: 453.592 },
  ml: { base: "l", factor: 0.001 }, l: { base: "l", factor: 1 }, gal: { base: "l", factor: 3.78541 },
  c: { base: "k", factor: 1 }, f: { base: "k", factor: 1 }, k: { base: "k", factor: 1 },
  ms: { base: "s", factor: 0.001 }, s: { base: "s", factor: 1 }, min: { base: "s", factor: 60 },
  h: { base: "s", factor: 3600 }, day: { base: "s", factor: 86400 },
};

export function convertUnit(amount: number, from: string, to: string): ToolResult | null {
  const f = UNIT_ALIASES[from.toLowerCase()];
  const t = UNIT_ALIASES[to.toLowerCase()];
  if (!f || !t || f.base !== t.base) return null;
  // Temperatures need offsets, not just factors.
  if (f.base === "k") {
    const toC = from.toLowerCase() === "c" ? amount : (amount - 32) * (5 / 9);
    const out = to.toLowerCase() === "c" ? toC : toC * (9 / 5) + 32;
    return {
      text: `${amount}°${from.toUpperCase()} = ${out.toFixed(1)}°${to.toUpperCase()}`,
      data: { amount, from, to, value: out },
      source: "units",
    };
  }
  const value = (amount * f.factor) / t.factor;
  return {
    text: `${amount} ${from} = ${value.toLocaleString("en-AU", { maximumFractionDigits: 6 })} ${to}`,
    data: { amount, from, to, value },
    source: "units",
  };
}

/* ------------------------------- lookups ------------------------------- */

export async function cryptoPrice(ids: string[], vs = "usd"): Promise<ToolResult | null> {
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${encodeURIComponent(ids.join(","))}&vs_currencies=${vs}&include_24hr_change=true`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12000) },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as Record<string, Record<string, number>>;
  const parts: string[] = [];
  for (const id of ids) {
    const row = j[id];
    if (!row) continue;
    const price = row[vs];
    const change = row[`${vs}_24h_change`];
    if (price === undefined) continue;
    parts.push(
      `${id}: ${price.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${vs.toUpperCase()}` +
        (change !== undefined ? ` (${change >= 0 ? "+" : ""}${change.toFixed(2)}% 24h)` : ""),
    );
  }
  if (!parts.length) return null;
  return { text: `Live prices — ${parts.join(" | ")}`, data: j, source: "coingecko" };
}

export async function defineWord(word: string): Promise<ToolResult | null> {
  const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as Array<{
    word: string;
    phonetic?: string;
    meanings?: Array<{ partOfSpeech: string; definitions: Array<{ definition: string; example?: string }> }>;
  }>;
  const entry = j?.[0];
  if (!entry) return null;
  const lines = [`${entry.word}${entry.phonetic ? ` ${entry.phonetic}` : ""}`];
  for (const m of (entry.meanings || []).slice(0, 3)) {
    const def = m.definitions?.[0];
    if (def) lines.push(`(${m.partOfSpeech}) ${def.definition}${def.example ? ` — e.g. "${def.example}"` : ""}`);
  }
  return { text: lines.join("\n"), data: entry, source: "dictionaryapi" };
}

/* ------------------------------ catalogue ------------------------------ */

export interface CatalogueEntry {
  id: string;
  title: string;
  genre: string;
  tone: string;
  description: string;
}

/**
 * Find games in the GG-LOUNGE catalogue. This is the one tool that makes
 * GG-GPT genuinely better *than* a general chatbot here: it can name a real,
 * playable game on this site instead of vaguely suggesting one.
 */
export function searchCatalogue(games: CatalogueEntry[], query: string, limit = 6): CatalogueEntry[] {
  const terms = query.toLowerCase().split(/\W+/).filter(t => t.length > 2 && t !== "game" && t !== "games");
  if (!terms.length) return games.slice(0, limit);
  const scored = games.map(g => {
    const hay = `${g.title} ${g.genre} ${g.tone} ${g.description}`.toLowerCase();
    let score = 0;
    for (const t of terms) {
      if (g.title.toLowerCase().includes(t)) score += 5;
      if (g.genre.toLowerCase().includes(t)) score += 3;
      if (g.tone.toLowerCase().includes(t)) score += 2;
      if (hay.includes(t)) score += 1;
    }
    return { g, score };
  });
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.g);
}
