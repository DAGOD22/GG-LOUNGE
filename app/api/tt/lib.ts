/**
 * TikTok backend for the lounge.
 *
 * Same trick as YouTube: the browser never touches tiktok.com or its CDNs.
 * Our server fetches feed/search metadata + playable URLs, rewrites every media
 * URL to the lounge's own media proxy, and the student only ever sees the
 * lounge domain.
 *
 * Providers:
 *   1. tikwm  — public TikTok mirror; gives feed, hashtag search and HD URLs.
 *   2. tiktok — the tiktok.com page payload, scraped server-side (used to
 *               refresh a single video when the mirror is missing it).
 */

import {
  TIKTOK_MIRRORS,
  cacheGet,
  cacheSet,
  fetchWithTimeout,
  orderedInstances,
  markGood,
  sameOriginMediaUrl,
} from "../yt/lib";

export type TtVideo = {
  id: string;
  title: string;
  author: string;
  authorNickname: string;
  authorAvatar: string;
  cover: string;
  coverDirect: string;
  play: string;
  playDirect: string;
  duration: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  music: string;
  created: number;
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Media from TikTok CDNs is fetched by *our* server, so hand back a proxy URL. */
function proxied(url: unknown): string {
  const s = typeof url === "string" ? url : "";
  if (!s) return "";
  if (s.startsWith("//")) return sameOriginMediaUrl("https:" + s);
  if (/^https?:/i.test(s)) return sameOriginMediaUrl(s);
  return s;
}

type MirrorResult = { ok: true; data: any; via: string } | { ok: false; error: string };

async function mirrorGet(pathWithQuery: string, attempts = 3, timeoutMs = 9000): Promise<MirrorResult> {
  const errors: string[] = [];
  for (const base of orderedInstances("tikwm", TIKTOK_MIRRORS).slice(0, attempts)) {
    try {
      const res = await fetchWithTimeout(`${base}${pathWithQuery}`, timeoutMs, {
        headers: { Accept: "application/json", "User-Agent": UA },
      });
      const text = await res.text();
      let data: any = null;
      try {
        data = JSON.parse(text);
      } catch {
        /* not json */
      }
      if (res.status >= 500 || !data) {
        errors.push(`${base} -> ${res.status}`);
        continue;
      }
      if (data.code !== undefined && Number(data.code) !== 0) {
        errors.push(`${base} -> ${data.msg || "code " + data.code}`);
        continue;
      }
      markGood("tikwm", TIKTOK_MIRRORS, base);
      return { ok: true, data, via: base };
    } catch (err) {
      errors.push(`${base} -> ${err instanceof Error ? err.message : "unreachable"}`);
    }
  }
  return { ok: false, error: errors.join("; ") || "no TikTok mirror reachable" };
}

function mapItem(raw: any): TtVideo | null {
  const id = String(raw?.video_id ?? raw?.id ?? raw?.item_id ?? "");
  if (!id) return null;
  const stats = raw?.stats || {};
  const author = raw?.author || raw?.author_info || {};
  const play = raw?.play || raw?.play_addr || raw?.origin?.play || "";
  const cover = raw?.cover || raw?.origin_cover || raw?.video_cover || "";
  return {
    id,
    title: String(raw?.title || raw?.desc || "").slice(0, 400),
    author: String(author?.unique_id || raw?.author || "").replace(/^@/, ""),
    authorNickname: String(author?.nickname || raw?.nickname || ""),
    authorAvatar: proxied(author?.avatar || author?.avatar_thumb || ""),
    cover: proxied(cover),
    coverDirect: typeof cover === "string" ? cover : "",
    play: proxied(play),
    playDirect: typeof play === "string" ? play : "",
    duration: Number(raw?.duration ?? raw?.video_duration ?? 0) || 0,
    views: Number(stats?.play_count ?? raw?.play_count ?? raw?.stat?.play_count ?? 0) || 0,
    likes: Number(stats?.digg_count ?? raw?.digg_count ?? raw?.stat?.digg_count ?? 0) || 0,
    comments: Number(stats?.comment_count ?? raw?.comment_count ?? 0) || 0,
    shares: Number(stats?.share_count ?? raw?.share_count ?? 0) || 0,
    music: String(raw?.music_info?.title || author?.music_info?.title || "").slice(0, 200),
    created: Number(raw?.create_time ?? 0) || 0,
  };
}

export async function tiktokFeed(opts: { cursor?: number; region?: string } = {}): Promise<{
  ok: boolean;
  items?: TtVideo[];
  cursor?: number;
  error?: string;
}> {
  const cacheKey = `tt:feed:${opts.region || "US"}:${opts.cursor || 0}`;
  const hit = cacheGet<any>(cacheKey);
  if (hit) return hit;
  const path = `/api/feed/list?count=30&cursor=${opts.cursor || 0}&region=${encodeURIComponent(opts.region || "US")}&lang=en`;
  const res = await mirrorGet(path, 3, 11000);
  if (!res.ok) return { ok: false, error: res.error };
  const list = res.data?.data?.list || res.data?.data || [];
  const items = (Array.isArray(list) ? list : []).map(mapItem).filter(Boolean) as TtVideo[];
  const payload = {
    ok: items.length > 0,
    items,
    cursor: Number(res.data?.data?.cursor || (opts.cursor || 0) + 30),
    ...(items.length ? {} : { error: "empty feed" }),
  };
  if (payload.ok) cacheSet(cacheKey, payload, 120);
  return payload;
}

export async function tiktokSearch(q: string, cursor = 0): Promise<{
  ok: boolean;
  items?: TtVideo[];
  cursor?: number;
  error?: string;
}> {
  const cacheKey = `tt:search:${q}:${cursor}`;
  const hit = cacheGet<any>(cacheKey);
  if (hit) return hit;
  const path = `/api/feed/search?keywords=${encodeURIComponent(q)}&count=30&cursor=${cursor}&hd=1`;
  const res = await mirrorGet(path, 3, 12000);
  if (!res.ok) return { ok: false, error: res.error };
  const list = res.data?.data?.list || [];
  const items = (Array.isArray(list) ? list : []).map(mapItem).filter(Boolean) as TtVideo[];
  const payload = {
    ok: items.length > 0,
    items,
    cursor: Number(res.data?.data?.cursor || cursor + 30),
    ...(items.length ? {} : { error: "no results" }),
  };
  if (payload.ok) cacheSet(cacheKey, payload, 120);
  return payload;
}

/** A single post by URL or id, with HD download URL. */
export async function tiktokPost(url: string): Promise<{ ok: boolean; item?: TtVideo; error?: string }> {
  const res = await mirrorGet(`/api/?url=${encodeURIComponent(url)}&hd=1`, 3, 12000);
  if (!res.ok) return { ok: false, error: res.error };
  const item = mapItem(res.data?.data);
  if (!item) return { ok: false, error: "not found" };
  return { ok: true, item };
}

/**
 * Rescue path: when the mirror can't serve a video, read TikTok's own page
 * payload (server-side fetch, so geo-blocks on the student's side are moot).
 */
export async function tiktokFromPage(shareUrl: string): Promise<{ ok: boolean; item?: TtVideo; error?: string }> {
  try {
    const res = await fetchWithTimeout(shareUrl, 11000, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html",
        Cookie: "tt_webid=1; JS-TikTok-Consent-Status=1",
      },
      redirect: "follow",
    });
    const html = await res.text();
    const marker = "__UNIVERSAL_DATA_FOR_REHYDRATION__";
    const at = html.indexOf(marker);
    if (at < 0) return { ok: false, error: "page payload missing" };
    const start = html.indexOf("{", at);
    const jsonText = sliceBalancedBraces(html, start);
    if (!jsonText) return { ok: false, error: "unparsable payload" };
    const parsed = JSON.parse(jsonText);
    const detail =
      parsed?.["__DEFAULT_SCOPE__"]?.["webapp.video-detail"]?.itemInfo?.[0] ||
      parsed?.["__DEFAULT_SCOPE__"]?.["webapp.video-detail"]?.itemInfo?.itemStruct;
    if (!detail) return { ok: false, error: "no item in payload" };
    const stats = detail.stats || {};
    const id = String(detail.id || "");
    const playAddr = detail.video?.playAddr || detail.video?.play_addr?.urlList?.[0] || "";
    const item: TtVideo = {
      id,
      title: String(detail.desc || "").slice(0, 400),
      author: String(detail.author?.uniqueId || ""),
      authorNickname: String(detail.author?.nickname || ""),
      authorAvatar: proxied(detail.author?.avatarThumb || detail.author?.avatarLarger || ""),
      cover: proxied(detail.video?.cover || detail.video?.originCover || ""),
      coverDirect: String(detail.video?.cover || detail.video?.originCover || ""),
      play: proxied(playAddr || detail.video?.downloadAddr || ""),
      playDirect: String(playAddr || detail.video?.downloadAddr || ""),
      duration: Number(detail.video?.duration || 0) || 0,
      views: Number(stats.playCount || 0) || 0,
      likes: Number(stats.diggCount || 0) || 0,
      comments: Number(stats.commentCount || 0) || 0,
      shares: Number(stats.shareCount || 0) || 0,
      music: String(detail.music?.title || "").slice(0, 200),
      created: Number(detail.createTime || 0) || 0,
    };
    return item.play ? { ok: true, item } : { ok: false, error: "no playable address" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "fetch failed" };
  }
}

function sliceBalancedBraces(text: string, from: number): string | null {
  if (from < 0 || text[from] !== "{") return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(from, i + 1);
    }
    if (i - from > 4_000_000) return null;
  }
  return null;
}

export async function tiktokHealth(): Promise<{ ok: boolean; ms: number; detail: string }> {
  const started = Date.now();
  const res = await tiktokFeed({ cursor: 0 });
  return {
    ok: !!res.ok,
    ms: Date.now() - started,
    detail: res.ok ? `${res.items?.length ?? 0} videos` : res.error || "empty",
  };
}
