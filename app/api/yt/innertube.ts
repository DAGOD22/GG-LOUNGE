/**
 * InnerTube provider — talks straight to YouTube's own private API from the
 * lounge server, then normalises every response into the shape the lounge
 * client already speaks (Piped-style JSON).
 *
 * Nothing here needs an API key, a third-party instance, or the student's
 * browser being able to reach youtube.com. All parsing is defensive: YouTube
 * reshapes its JSON constantly, so we walk the tree for the renderers we know
 * instead of following a hard-coded path.
 */

import {
  UPSTREAM_UA,
  cacheGet,
  cacheSet,
  postJson,
  type ProviderResult,
} from "./lib";

const ENDPOINT = "https://www.youtube.com/youtubei/v1";
const WEB_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";

type Ctx = { client: Record<string, unknown>; extra?: Record<string, unknown> };

/**
 * Clients we impersonate, best-first for "give me playable URLs without a
 * login or a proof-of-origin token".
 */
const CLIENTS: Ctx[] = [
  {
    client: {
      clientName: "ANDROID",
      clientVersion: "19.44.38",
      androidSdkVersion: 30,
      hl: "en",
      gl: "US",
      userAgent: "com.google.android.youtube/19.44.38 (Linux; U; Android 11; en_US) gzip",
      disablePrefersReducedMotion: true,
    },
  },
  {
    client: {
      clientName: "MWEB",
      clientVersion: "2.20250311.03.01",
      hl: "en",
      gl: "US",
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
    },
  },
  {
    client: {
      clientName: "IOS",
      clientVersion: "19.45.4",
      deviceModel: "iPhone16,2",
      hl: "en",
      gl: "US",
      userAgent: "com.google.ios.youtube/19.45.4 (iPhone16,2; U; CPU iOS 17_2 like Mac OS X)",
    },
  },
  {
    client: {
      clientName: "TVHTML5_SIMPLY_EMBEDDED_PLAYER",
      clientVersion: "2.0",
      hl: "en",
      gl: "US",
      thirdParty: { embedUrl: "https://www.youtube.com", embedReferrerUrl: "https://www.youtube.com" },
    },
  },
  {
    client: {
      clientName: "WEB",
      clientVersion: "2.20250313.01.00",
      hl: "en",
      gl: "US",
      browserName: "Chrome",
      osName: "Windows",
      platform: "DESKTOP",
    },
  },
];

// ------------------------------------------------------------------ utils ----

type Any = Record<string, any>;

function isObj(v: unknown): v is Any {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Collect every value stored under `key` anywhere in the tree. */
export function collect<T = Any>(node: unknown, key: string, out: T[] = [], depth = 0): T[] {
  if (depth > 40 || node == null) return out;
  if (Array.isArray(node)) {
    for (const item of node) collect(item, key, out, depth + 1);
    return out;
  }
  if (!isObj(node)) return out;
  for (const [k, v] of Object.entries(node)) {
    if (k === key && v != null) out.push(v as T);
    else collect(v, key, out, depth + 1);
  }
  return out;
}

/** First non-empty value found for `key` in this subtree (shallow-first). */
export function findFirst<T = Any>(node: unknown, key: string, depth = 0): T | null {
  if (depth > 30 || node == null) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const hit = findFirst<T>(item, key, depth + 1);
      if (hit != null) return hit;
    }
    return null;
  }
  if (!isObj(node)) return null;
  if (node[key] != null) return node[key] as T;
  for (const v of Object.values(node)) {
    const hit = findFirst<T>(v, key, depth + 1);
    if (hit != null) return hit;
  }
  return null;
}

/** Extract human text from any of YouTube's text shapes. */
export function text(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).filter(Boolean).join("");
  if (isObj(node)) {
    if (typeof node.simpleText === "string") return node.simpleText;
    if (typeof node.content === "string") return node.content;
    if (typeof node.text === "string") return node.text;
    if (Array.isArray(node.runs)) return node.runs.map((r) => text(r)).join("");
    if (node.text != null) return text(node.text);
    if (node.title != null && (typeof node.title === "string" || isObj(node.title))) return text(node.title);
    if (isObj(node.accessibility)) {
      const acc = text(node.accessibility);
      if (acc) return acc;
    }
    if (typeof node.label === "string") return node.label;
  }
  return "";
}

/** Digits-only parse of things like "1.2M views" / "3,904,112 views". */
export function parseCount(value: unknown): number {
  const raw = text(value).replace(/,/g, "");
  const m = /([\d.]+)\s*([KMB]?)/i.exec(raw);
  if (!m) return -1;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return -1;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || "").toLowerCase() as "k" | "m" | "b"];
  return Math.round(n * (mult || 1));
}

/** "12:34" or "1:02:03" -> seconds */
export function parseDuration(value: unknown): number {
  const raw = text(value).trim();
  if (!/^\d+(:\d+){1,2}$/.test(raw)) return -1;
  const parts = raw.split(":").map(Number);
  if (parts.some((p) => !Number.isFinite(p))) return -1;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return sec;
}

function bestThumb(thumbs: any, prefer?: string): string {
  if (!thumbs) return "";
  if (typeof thumbs === "string") return thumbs;
  if (Array.isArray(thumbs)) {
    if (!thumbs.length) return "";
    if (prefer) {
      const hit = thumbs.find((t) => typeof t?.url === "string" && t.url.includes(prefer));
      if (hit) return hit.url;
    }
    const sorted = [...thumbs].sort((a, b) => (b?.height ?? 0) - (a?.height ?? 0));
    const mq = sorted.find((t) => typeof t?.url === "string" && /hqdefault|mqdefault/.test(t.url));
    return (mq?.url || sorted[0]?.url || "");
  }
  return "";
}

function thumbFromVideoId(id: string, quality = "hqdefault"): string {
  return `https://i.ytimg.com/vi/${id}/${quality}.jpg`;
}

// ------------------------------------------------------------- video items --

type VideoItem = {
  url: string;
  title: string;
  thumbnail: string;
  uploaderName: string;
  uploaderUrl: string;
  uploaderAvatar: string;
  uploaderVerified: boolean;
  duration: number;
  views: number;
  uploaded: number;
  uploadedDate: string;
  shortDescription: string;
  type: "stream" | "channel" | "playlist";
  isLive: boolean;
};

function isLiveBadge(node: unknown): boolean {
  const badges = collect(node, "thumbnailOverlayBadgeViewModel");
  for (const b of badges) if (/live/i.test(JSON.stringify(b))) return true;
  return /"LIVE"/.test(JSON.stringify(node).slice(0, 4000));
}

/** New-ish viewmodel cards (search, home, channel, up-next all use these). */
function fromLockup(l: Any): VideoItem | null {
  const id =
    l?.contentId ||
    l?.contentId?.videoId ||
    findFirst<string>(l?.rendererContext, "videoId") ||
    "";
  const videoId = typeof id === "string" ? id : "";
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  const meta = l?.metadata?.lockupMetadataViewModel || {};
  const rows: Any[] = meta?.metadata?.contentMetadataViewModel?.metadataRows || [];
  const parts: string[] = [];
  for (const row of rows) for (const p of row?.metadataParts || []) parts.push(text(p?.text));
  const images = collect(l?.contentImage, "url");
  const thumbs = (l?.contentImage?.thumbnailViewModel?.image?.sources || []) as Any[];
  const badges = collect(l?.contentImage, "thumbnailBadgeViewModel");
  let duration = -1;
  let live = false;
  for (const b of badges) {
    const t = text(b?.text);
    if (b?.style === "THUMBNAIL_OVERLAY_BADGE_STYLE_DEFAULT" || /^\d+:\d/.test(t)) duration = parseDuration(t);
    if (/live/i.test(t)) live = true;
  }
  const views = parts.find((p) => /view/i.test(p)) || "";
  const when = parts.find((p) => /ago|Streamed/i.test(p)) || "";
  // YouTube has shuffled which metadataRow holds the channel between clients, so
  // prefer the first row part that looks like a name rather than "1.2M views".
  const looksLikeMeta = (value: string) =>
    /view|watching|ago|Streamed|SHORTS|^\d/i.test(value);
  const uploader =
    parts.find((p) => p && !looksLikeMeta(p)) ||
    text(meta?.metadata?.contentMetadataViewModel?.metadataRows?.[1]?.metadataParts?.[0]?.text) ||
    text(meta?.metadata?.contentMetadataViewModel?.metadata?.content?.text) ||
    "";
  const avatarUrl = bestThumb(l?.metadata?.lockupMetadataViewModel?.image?.image?.sources);
  return {
    url: `/watch?v=${videoId}`,
    title: text(meta?.title),
    thumbnail: String(images[0] || "") || bestThumb(thumbs) || thumbFromVideoId(videoId),
    uploaderName: uploader.replace(/^by\s+/i, ""),
    uploaderUrl: "",
    uploaderAvatar: avatarUrl,
    uploaderVerified: /verify/i.test(JSON.stringify(l).slice(0, 6000)),
    duration: live ? -1 : duration,
    views: parseCount(views),
    uploaded: -1,
    uploadedDate: when,
    shortDescription: "",
    type: "stream",
    isLive: live || duration === -1 && /live/i.test(views + when),
  };
}

/** Classic renderer cards (still served to older client versions). */
function fromRenderer(v: Any): VideoItem | null {
  const videoId = v?.videoId;
  if (typeof videoId !== "string" || !/^[\w-]{11}$/.test(videoId)) return null;
  const lengthText = text(v?.lengthText) || text(v?.thumbnailOverlays?.[0]?.accessibility);
  const live = /LIVE/i.test(text(v?.lengthText)) || !!v?.thumbnailOverlayTimeStatusRenderer;
  return {
    url: `/watch?v=${videoId}`,
    title: text(v?.title) || text(v?.headline),
    thumbnail: bestThumb(v?.thumbnail?.thumbnails) || thumbFromVideoId(videoId),
    uploaderName:
      text(v?.ownerText) ||
      text(v?.bylineText) ||
      text(v?.longBylineText) ||
      text(v?.shortBylineText),
    uploaderUrl:
      v?.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ||
      v?.longBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ||
      v?.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ||
      "",
    uploaderAvatar: bestThumb(v?.channelThumbnail?.thumbnails, "MQ2") || "",
    uploaderVerified: !!v?.badges?.some?.((b: Any) => /VERIFIED/i.test(JSON.stringify(b))),
    duration: live ? -1 : parseDuration(lengthText),
    views: parseCount(v?.viewCountText || v?.shortViewCountText || v?.detailedMetadataSnippets),
    uploaded: -1,
    uploadedDate: text(v?.publishedTimeText),
    shortDescription: text(v?.detailedMetadataSnippets),
    type: "stream",
    isLive: live,
  };
}

const RENDERER_KEYS = [
  "videoRenderer",
  "gridVideoRenderer",
  "compactVideoRenderer",
  "videoWithContextRenderer",
  "playlistVideoRenderer",
  "richItemRenderer",
  "reelItemRenderer",
  "shortsLockupViewModel",
  "lockupViewModel",
];

/** Everything that looks like a video card, de-duplicated, in document order. */
export function extractVideos(node: unknown): VideoItem[] {
  const out: VideoItem[] = [];
  const seen = new Set<string>();
  for (const key of RENDERER_KEYS) {
    for (const raw of collect<any>(node, key)) {
      const item =
        key === "shortsLockupViewModel"
          ? fromShortsLockup(raw) || fromLockup(raw)
          : key === "lockupViewModel"
            ? fromLockup(raw)
            : key === "richItemRenderer"
            ? fromLockup(raw?.content?.lockupViewModel) || fromRenderer(raw?.content?.videoRenderer || raw)
            : key === "reelItemRenderer"
              ? fromReel(raw)
              : fromRenderer(raw);
      if (!item || !item.title) continue;
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      out.push(item);
    }
  }
  return out;
}

/** Shorts shelves use their own card type; the video id only lives in onTap. */
function fromShortsLockup(s: Any): VideoItem | null {
  const id =
    s?.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId ||
    s?.inlinePlayerData?.onVisible?.innertubeCommand?.watchEndpoint?.videoId ||
    /(?:ViewModel|lockup)-([\w-]{11})$/.exec(String(s?.entityId || ""))?.[1] ||
    findFirst<string>(s, "videoId") ||
    "";
  const videoId = typeof id === "string" ? id : "";
  if (!/^[\w-]{11}$/.test(videoId)) return null;
  const overlay = (s?.overlayMetadata || {}) as Any;
  const images = collect(s?.thumbnail, "url");
  const thumbs = (s?.thumbnail?.sources || []) as Any[];
  return {
    url: `/watch?v=${videoId}`,
    title:
      text(overlay?.primaryText) ||
      text(s?.accessibilityText) ||
      text(overlay?.secondaryText) ||
      "YouTube Short",
    thumbnail: String(images[0] || "") || bestThumb(thumbs) || thumbFromVideoId(videoId, "hq720"),
    uploaderName: "",
    uploaderUrl:
      s?.onTap?.innertubeCommand?.reelWatchEndpoint?.attribution?.channel ||
      s?.onTap?.innertubeCommand?.reelWatchEndpoint?.attribution?.ownerProfileUrl ||
      "",
    uploaderAvatar: "",
    uploaderVerified: false,
    duration: -1,
    views: parseCount(overlay?.secondaryText?.content ?? overlay?.secondaryText),
    uploaded: -1,
    uploadedDate: "",
    shortDescription: "",
    type: "stream",
    isLive: false,
  };
}

function fromReel(r: Any): VideoItem | null {
  const id = r?.videoId;
  if (typeof id !== "string") return null;
  return {
    url: `/watch?v=${id}`,
    title: text(r?.headline),
    thumbnail: bestThumb(r?.thumbnail?.thumbnails) || thumbFromVideoId(id),
    uploaderName: "",
    uploaderUrl: "",
    uploaderAvatar: "",
    uploaderVerified: false,
    duration: -1,
    views: parseCount(r?.primaryInfoText),
    uploaded: -1,
    uploadedDate: "",
    shortDescription: "",
    type: "stream",
    isLive: false,
  };
}

function extractChannels(node: unknown): Any[] {
  const out: Any[] = [];
  for (const key of ["channelRenderer", "gridChannelRenderer", "lockupViewModel"]) {
    for (const raw of collect<any>(node, key)) {
      if (key === "lockupViewModel") {
        const contentId = raw?.contentId;
        if (typeof contentId !== "string" || !/^UC[\w-]{22}$/.test(contentId)) continue;
        const meta = raw?.metadata?.lockupMetadataViewModel || {};
        out.push({
          type: "channel",
          name: text(meta?.title),
          url: `/channel/${contentId}`,
          thumbnail: bestThumb(raw?.contentImage?.thumbnailViewModel?.image?.sources, "2"),
          description: text(meta?.description),
          subscribers: parseCount(meta?.metadata?.contentMetadataViewModel?.metadataRows?.[1]),
          videoCount: -1,
          verified: false,
        });
        continue;
      }
      const id = raw?.channelId;
      if (typeof id !== "string") continue;
      out.push({
        type: "channel",
        name: text(raw?.title),
        url:
          raw?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl || `/channel/${id}`,
        thumbnail: bestThumb(raw?.thumbnail?.thumbnails, "M"),
        description: text(raw?.descriptionSnippet),
        subscribers: parseCount(raw?.subscriberCountText),
        videoCount: -1,
        verified: !!raw?.badges?.length,
      });
    }
  }
  return out;
}

function extractPlaylists(node: unknown): Any[] {
  const out: Any[] = [];
  for (const key of ["playlistRenderer", "gridPlaylistRenderer", "lockupViewModel"]) {
    for (const raw of collect<any>(node, key)) {
      if (key === "lockupViewModel") {
        const cid = raw?.contentId;
        if (typeof cid !== "string" || !/^(PL|RD|UU|FL|LL)[\w-]{10,}$/.test(cid)) continue;
        const meta = raw?.metadata?.lockupMetadataViewModel || {};
        out.push({
          type: "playlist",
          name: text(meta?.title),
          url: `/playlist?list=${cid}`,
          thumbnail: bestThumb(raw?.contentImage?.thumbnailViewModel?.image?.sources),
          videos: parseCount(meta?.metadata?.contentMetadataViewModel?.metadataRows?.[1]),
          uploaderName: "",
        });
        continue;
      }
      const id = raw?.playlistId;
      if (typeof id !== "string") continue;
      out.push({
        type: "playlist",
        name: text(raw?.title),
        url: `/playlist?list=${id}`,
        thumbnail: bestThumb(raw?.thumbnails?.[0]?.thumbnails) || bestThumb(raw?.thumbnail?.thumbnails),
        videos: parseCount(raw?.videoCountText) || Number(raw?.videoCount || -1),
        uploaderName: text(raw?.shortBylineText),
      });
    }
  }
  return out;
}

// ------------------------------------------------------------ call YouTube --

let clientIndex = 0;

async function call(
  method: "player" | "next" | "browse" | "search",
  body: Record<string, unknown>,
  timeoutMs = 9000,
  gl?: string,
): Promise<ProviderResult & { client?: string }> {
  const attempt = async (ctx: Ctx): Promise<ProviderResult & { client?: string }> => {
    const url = `${ENDPOINT}/${method}?key=${WEB_KEY}&prettyPrint=false`;
    // InnerTube wants { context: { client: {...} }, ...params }
    const client = { ...(ctx.client as Any) };
    if (gl && /^[A-Z]{2}$/.test(gl)) client.gl = gl;
    const payload = { context: { client }, ...body };
    const res = await postJson(url, payload, timeoutMs, {
      "X-Youtube-Client-Name": String(clientNameId(ctx.client.clientName)),
      "X-Youtube-Client-Version": String(ctx.client.clientVersion || ""),
      "X-Origin": "https://www.youtube.com",
      "X-Goog-Visitor-Id": "",
      Referer: "https://www.youtube.com/",
      Cookie: "SOCS=CAMSAhAB; PREF=h1=en&tz=UTC",
    });
    return res.ok ? { ...res, client: String(ctx.client.clientName) } : res;
  };

  // try clients in order, starting from the last one that worked
  const order = CLIENTS.slice(clientIndex).concat(CLIENTS.slice(0, clientIndex));
  let lastError = "unreachable";
  let lastStatus: number | undefined;
  for (let i = 0; i < order.length; i++) {
    const res = await attempt(order[i]);
    if (res.ok && isUsable(method, res.data)) {
      clientIndex = (clientIndex + i) % order.length;
      return res;
    }
    lastError = res.ok ? "empty response" : res.error;
    lastStatus = res.status;
    // 4xx from a working endpoint usually means the *video* is the problem,
    // not the client — stop trying other identities for those.
    if (res.status && res.status >= 400 && res.status < 500 && method !== "player") break;
  }
  return { ok: false, error: lastError, status: lastStatus };
}

function clientNameId(name: unknown): number {
  switch (name) {
    case "ANDROID":
      return 3;
    case "IOS":
      return 5;
    case "MWEB":
      return 2;
    case "TVHTML5_SIMPLY_EMBEDDED_PLAYER":
      return 3;
    default:
      return 1;
  }
}

function isUsable(method: string, data: unknown): boolean {
  if (!isObj(data)) return false;
  if (method === "player") {
    const status = (data as Any)?.playabilityStatus?.status;
    const sd = (data as Any)?.streamingData;
    const hasUrls =
      !!sd &&
      ([...(sd.formats || []), ...(sd.adaptiveFormats || [])] as Any[]).some((f) => typeof f?.url === "string") &&
        true;
    if (status && status !== "OK" && !/LIVE_STREAM/i.test(String(status))) return false;
    const hls = (data as Any)?.streams?.hlsManifestUrl || sd?.hlsManifestUrl;
    return hasUrls || typeof hls === "string";
  }
  if (method === "search" || method === "browse") {
    return JSON.stringify(data).length > 4000;
  }
  return JSON.stringify(data).length > 500;
}

// --------------------------------------------------------------- search ----

const SEARCH_PARAMS: Record<string, string> = {
  all: "",
  videos: "EgIQAQ%3D%3D",
  channels: "EgIQAg%3D%3D",
  playlists: "EgIQAw%3D%3D",
  lives: "EgJAAQ%3D%3D",
  movies: "EgQQARgB",
};

export async function search(q: string, filter: string) {
  const cacheKey = `it-search:${q}:${filter}`;
  const hit = cacheGet<Any>(cacheKey);
  if (hit) return { ok: true as const, data: hit, via: "innertube(cache)" };
  const params = SEARCH_PARAMS[filter] ?? "";
  const res = await call(
    "search",
    { query: q, params: params ? decodeURIComponent(params) : undefined },
    11000,
  );
  if (!res.ok) return { ok: false as const, error: res.error };
  const data = res.data as Any;
  const videos = extractVideos(data);
  const channels = filter === "channels" || filter === "all" ? extractChannels(data) : [];
  const playlists = filter === "playlists" || filter === "all" ? extractPlaylists(data) : [];
  const items =
    filter === "channels"
      ? channels
      : filter === "playlists"
        ? [...playlists, ...videos]
        : filter === "all"
          ? [...videos.slice(0, 8), ...channels.slice(0, 2), ...playlists.slice(0, 2), ...videos.slice(8)]
          : videos;
  const correction = findFirst<string>(data, "correctionQuery") || findFirst<string>(data, "text");
  const token =
    collect<string>(data, "continuationCommand").map((c) => (typeof c === "string" ? c : (c as any)?.token))
      .find((t) => typeof t === "string" && t.length > 20) || null;
  const payload = { items, nextpage: token, suggestion: correction || null };
  cacheSet(cacheKey, payload, 90);
  return { ok: true as const, data: payload, via: "innertube" };
}

export async function searchNextpage(token: string, _q: string, _filter: string) {
  const res = await call("browse", { continuation: token }, 11000);
  if (!res.ok) return { ok: false as const, error: res.error };
  const data = res.data as Any;
  const videos = extractVideos(data);
  const channels = extractChannels(data);
  const next =
    collect<Any>(data, "continuationItemRenderer")
      .map((c) => c?.continuationEndpoint?.continuationCommand?.token)
      .find((t) => typeof t === "string") || null;
  return { ok: true as const, data: { items: [...videos, ...channels], nextpage: next }, via: "innertube" };
}

// --------------------------------------------------- home / trending feeds --

export async function feed(kind: "trending" | "home", region: string) {
  const cacheKey = `it-feed:${kind}:${region}`;
  const hit = cacheGet<Any[]>(cacheKey);
  if (hit) return { ok: true as const, data: hit, via: "innertube(cache)" };
  const gl = /^[A-Z]{2}$/.test(String(region || "")) ? region : "US";
  // "Trending" was retired by YouTube in 2025, so trending falls back to the
  // home feed rather than showing an empty grid.
  let res = await call("browse", { browseId: "FEtrending" }, 11000, gl);
  let videos = res.ok ? extractVideos(res.data) : [];
  if (!videos.length) {
    res = await call("browse", { browseId: "FEwhat_to_watch" }, 11000, gl);
    videos = res.ok ? extractVideos(res.data) : [];
  }
  if (!res.ok || !videos.length) {
    return { ok: false as const, error: res.ok ? "no feed items" : res.error };
  }
  videos = videos.slice(0, 40);
  cacheSet(cacheKey, videos, 240);
  return { ok: true as const, data: videos, via: "innertube" };
}

// ------------------------------------------------------------ video stream --

export type NormalisedStreams = {
  title: string;
  description: string;
  thumbnailUrl: string;
  uploader: string;
  uploaderUrl: string;
  uploaderAvatar: string;
  uploaderVerified: boolean;
  uploaderSubscriberCount: number;
  views: number;
  likes: number;
  duration: number;
  uploadDate: string;
  category: string;
  livestream: boolean;
  videoStreams: Any[];
  audioStreams: Any[];
  hls: string | null;
  relatedStreams: Any[];
  subtitles: { code: string; name: string; url: string; autoGenerated: boolean }[];
  chapters: { title: string; start: number; image: string }[];
  provider: string;
};

const CONTAINER: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/3gpp": "mp4",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "audio/mp4a-latm": "m4a",
  "audio/ogg": "opus",
};

/**
 * YouTube sends `mimeType: 'video/mp4; codecs="avc1.640028, mp4a.40.2"'`, so the
 * container has to be read off the part before the semicolon — otherwise every
 * webm stream would be labelled mp4 and the player picks a codec it cannot
 * decode in an MSE SourceBuffer.
 */
function containerOf(mimeType: unknown, fallback = "mp4"): string {
  const base = String(mimeType || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return CONTAINER[base] || (base.endsWith("/mp4") ? "mp4" : base.includes("webm") ? "webm" : fallback);
}

export async function streams(videoId: string): Promise<ProviderResult> {
  const cacheKey = `it-streams:${videoId}`;
  const hit = cacheGet<NormalisedStreams>(cacheKey);
  if (hit) return { ok: true, data: hit, via: "innertube(cache)" };
  const res = await call("player", { videoId, contentCheckOk: true, racyCheckOk: true }, 11000);
  if (!res.ok) return { ok: false, error: res.error, status: res.status };
  const built = normalisePlayer(res.data as Any, videoId);
  if (!built.ok) return { ok: false, error: built.error };
  cacheSet(cacheKey, built.data, 240);
  return { ok: true, data: built.data, via: res.client ? `innertube:${res.client}` : "innertube" };
}

/** Pure: YouTube /player JSON -> the shape the lounge client consumes. */
export function normalisePlayer(
  data: Any,
  videoId: string,
): { ok: true; data: NormalisedStreams } | { ok: false; error: string } {
  const details = data?.videoDetails || {};
  const micro = data?.microformat?.playerMicroformatRenderer || {};
  const sd = data?.streamingData || {};
  const muxed: Any[] = (sd.formats || []) as Any[];
  const adaptive: Any[] = (sd.adaptiveFormats || []) as Any[];

  const videoStreams = muxed
    .filter((f) => typeof f?.url === "string")
    .map((f) => ({
      url: f.url,
      mimeType: f.mimeType || "video/mp4",
      format: containerOf(f.mimeType),
      quality: f.qualityLabel || `${f.height || 0}p`,
      height: f.height || 0,
      width: f.width || 0,
      bitrate: f.bitrate || 0,
      itag: f.itag,
      contentLength: Number(f.contentLength || 0),
      fps: f.frameRate ? Number(f.frameRate) : 30,
      videoOnly: false,
      availability: "public",
    }))
    .concat(
      adaptive
        .filter((f) => typeof f?.url === "string" && /^video\//i.test(String(f.mimeType || "")))
        .map((f) => ({
          url: f.url,
          mimeType: f.mimeType,
          format: containerOf(f.mimeType),
          quality: f.qualityLabel || `${f.height || 0}p`,
          height: f.height || 0,
          width: f.width || 0,
          bitrate: f.bitrate || 0,
          itag: f.itag,
          contentLength: Number(f.contentLength || 0),
          fps: f.frameRate ? Number(f.frameRate) : 30,
          videoOnly: true,
          availability: "public",
        })),
    );

  const audioStreams = adaptive
    .filter((f) => typeof f?.url === "string" && /^audio\//i.test(String(f.mimeType || "")))
    .map((f) => ({
      url: f.url,
      mimeType: f.mimeType,
      format: containerOf(f.mimeType, "m4a"),
      bitrate: f.bitrate || 0,
      itag: f.itag,
      contentLength: Number(f.contentLength || 0),
      quality: f.qualityLabel || (f.audioQuality ? String(f.audioQuality) : ""),
    }));

  const hls = data?.streams?.hlsManifestUrl || sd?.hlsManifestUrl || null;
  const playability = data?.playabilityStatus || {};
  if (!videoStreams.length && !audioStreams.length && !hls) {
    const reason = text(playability?.reason) || String(playability?.status || "no streams");
    return { ok: false, error: `YouTube refused playback for this video (${reason})` };
  }

  const captionTracks =
    (data as Any)?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  const subtitles = (captionTracks as Any[]).slice(0, 12).map((c) => ({
    code: String(c?.languageCode || "en"),
    name: text(c?.name?.simpleText || c?.name) || String(c?.languageCode || ""),
    url: typeof c?.captionTracks === "string" ? c.captionTracks : String(c?.baseUrl || ""),
    autoGenerated: c?.kind === "asr",
  }));

  const chapters = (collect<Any>(data, "chapterRenderer") as Any[]).slice(0, 60).map((c) => ({
    title: text(c?.title),
    start: parseDuration(text(c?.time)) >= 0 ? parseDuration(text(c?.time)) : Number(c?.startTimeSeconds || 0),
    image: bestThumb(c?.thumbnail?.thumbnails) || "",
  }));

  const out: NormalisedStreams = {
    title: text(details?.title) || text(micro?.title),
    description: String(details?.shortDescription || ""),
    thumbnailUrl: bestThumb(details?.thumbnail?.thumbnails, "maxresdefault") || thumbFromVideoId(videoId, "maxresdefault"),
    uploader: text(details?.author),
    uploaderUrl: details?.channelId ? `/channel/${details.channelId}` : "",
    uploaderAvatar: "",
    uploaderVerified: false,
    uploaderSubscriberCount: -1,
    views: Number(details?.viewCount || 0) || -1,
    likes: -1,
    duration: Number(details?.lengthSeconds || micro?.lengthSeconds || 0) || -1,
    uploadDate: String(micro?.uploadDate || micro?.publishDate || "").slice(0, 10),
    category: String(micro?.category || ""),
    livestream: !!(details?.isLiveContent && !micro?.lengthSeconds) || !!details?.isLive,
    videoStreams: videoStreams.sort((a, b) => (b.height || 0) - (a.height || 0)),
    audioStreams: audioStreams.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0)),
    hls: typeof hls === "string" ? hls : null,
    relatedStreams: [],
    subtitles,
    chapters,
    provider: "innertube",
  };
  return { ok: true, data: out };
}

/** `next` gives us: likes, avatar, subscriber count, related videos, comments token. */
export async function watchExtras(videoId: string): Promise<Any> {
  const cacheKey = `it-next:${videoId}`;
  const hit = cacheGet<Any>(cacheKey);
  if (hit) return hit;
  const res = await call("next", { videoId }, 10000);
  if (!res.ok) return {};
  const out = normaliseNext(res.data as Any, videoId);
  cacheSet(cacheKey, out, 180);
  return out;
}

/** Pure: YouTube /next JSON -> likes, owner chip, related list, comments token. */
export function normaliseNext(data: Any, videoId: string): Any {
  const out: Any = {};

  const likeBtn =
    findFirst<Any>(data, "likeButtonViewModel") ||
    findFirst<Any>(data, "toggleButtonViewModel") ||
    findFirst<Any>(data, "likeButtonEntity") ||
    findFirst<Any>(data, "likeCountEntity");
  if (likeBtn) {
    const t = JSON.stringify(likeBtn);
    const m =
      /"likeCountA11y":\s*"([^"]*?[\d.,KMB]+)/i.exec(t) ||
      /"likeCount":\s*"?([\d.,KMB]+)/i.exec(t) ||
      /"content":\s*"([\d.,KMB]+)"/.exec(t) ||
      /([\d.,KMB]+)\s+likes/i.exec(t);
    if (m) out.likes = parseCount(m[1]);
  }
  const owner = findFirst<Any>(data, "videoOwnerRenderer");
  if (owner) {
    out.uploaderAvatar = bestThumb(owner?.thumbnail?.thumbnails, "M");
    out.uploaderName = text(owner?.title);
    out.uploaderVerified = !!owner?.badges?.length;
    const subs = text(owner?.subscriberCountText) || text(owner?.subscriptionButton?.subscribeButtonRenderer?.subscriberCountText?.subscriberCountWithSubscriptionToggle);
    const n = parseCount(subs);
    if (n >= 0) out.uploaderSubscriberCount = n;
    const path =
      owner?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl ||
      owner?.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl;
    if (typeof path === "string") out.uploaderUrl = path;
  }
  const cta = findFirst<Any>(data, "commentsHeaderRenderer") || findFirst<Any>(data, "engagementPanelTitleHeaderRenderer");
  if (cta) out.commentCount = parseCount(findFirst(cta, "count") ?? findFirst(cta, "contextualInfo"));

  // Up next / autoplay chain first, then the related grid.
  const related: VideoItem[] = [];
  for (const item of extractVideos(data)) {
    if (item.url.includes(`v=${videoId}`)) continue;
    related.push(item);
    if (related.length >= 24) break;
  }
  out.relatedStreams = related;

  // comments continuation token
  out.commentsToken = findCommentsToken(data);
  return out;
}

export function findCommentsToken(data: Any): string | null {
  // 1) engagement panel route (most reliable)
  for (const panel of collect<Any>(data, "engagementPanelSectionListRenderer")) {
    const id = String(panel?.panelIdentifier || panel?.targetId || "");
    if (!/comment/i.test(id)) continue;
    const token = findFirst<string>(panel, "token");
    if (typeof token === "string") return token;
  }
  // 2) sectionIdentifier markers
  for (const section of collect<Any>(data, "sectionListRenderer")) {
    const contents = Array.isArray(section?.contents) ? section.contents : [];
    const isComments = contents.some(
      (c: Any) => /comment/i.test(String(c?.itemSectionRenderer?.sectionIdentifier || "")),
    );
    if (!isComments) continue;
    const token = findFirst<string>(contents, "token");
    if (typeof token === "string") return token;
  }
  // 3) desperate: token inside a comments continuation item
  for (const item of collect<Any>(data, "continuationItemRenderer")) {
    const token = item?.continuationEndpoint?.continuationCommand?.token;
    const label = JSON.stringify(item).slice(0, 900);
    if (typeof token === "string" && /comment/i.test(label)) return token;
  }
  return null;
}

export async function comments(videoId: string, token: string | null): Promise<ProviderResult> {
  if (!token) {
    const extras = await watchExtras(videoId);
    token = (extras?.commentsToken as string) || null;
  }
  if (!token) return { ok: false, error: "comments unavailable" };
  const res = await call("browse", { continuation: token }, 10000);
  if (!res.ok) return { ok: false, error: res.error };
  return { ok: true, data: normaliseComments(res.data as Any), via: "innertube" };
}

/** Pure: comments continuation JSON -> Piped-shaped comment page. */
export function normaliseComments(data: Any): Any {
  const list: Any[] = [];
  const threads = [
    ...collect<Any>(data, "commentRenderer"),
    ...collect<Any>(data, "commentEntityPayload"),
  ];
  for (const raw of threads) {
    // Google keeps renaming these bags; the payload sometimes sits directly on
    // the mutation and sometimes one level under `properties`.
    const c: Any = raw || {};
    const props: Any = isObj(c.properties) ? c.properties : c;
    const legacy = isObj(c?.contentText) || isObj(c?.authorText);
    const author = legacy
      ? text(c?.authorText)
      : text(c?.author?.displayName) || text(props?.author?.displayName) || text(c?.template?.author);
    const body = legacy
      ? text(c?.contentText)
      : text(props?.content) || text(c?.template?.parsedContent) || text(c?.content);
    const when = legacy
      ? text(c?.publishedTimeText)
      : text(props?.publishedTime) || text(c?.template?.publishedTime) || text(c?.published?.text);
    const thumb = legacy
      ? bestThumb(c?.authorThumbnail?.thumbnails, "M")
      : bestThumb(
          c?.author?.avatar?.sources ||
            props?.author?.avatar?.sources ||
            c?.author?.channelAvatar?.sources ||
            props?.author?.channelAvatar?.sources,
          "M",
        );
    const likesRaw = legacy
      ? c?.voteCount?.simpleText ?? c?.voteCount
      : c?.toolbar?.likeCountA11y ??
        c?.toolbar?.likeCountNotaglyph?.text ??
        c?.toolbar?.likeCountNotaglyph ??
        props?.score?.simpleText?.textContent ??
        props?.score ??
        c?.toolbar?.likeCount;
    const replies = legacy
      ? parseCount(c?.replies?.commentsEntryPointHeaderRenderer?.commentCount)
      : parseCount(c?.toolbar?.replyCount ?? props?.replyCount ?? c?.toolbar?.repliesButtonA11y);
    const nextToken =
      c?.continueThreadContinuation?.continuationCommand?.token ||
      c?.replies?.commentsEntryPointHeaderRenderer?.continuationItem?.continuationEndpoint?.continuationCommand?.token ||
      props?.replies?.continuationItem?.continuationEndpoint?.continuationCommand?.token ||
      null;
    if (!body) continue;
    list.push({
      author: author || "Anonymous",
      authorId:
        (legacy
          ? text(c?.authorText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId)
          : text(c?.author?.channelId) || text(props?.author?.channelId)) || "",
      thumbnail: thumb || "",
      commentText: body,
      commentTime: when || "",
      commentedTime: when || "",
      likeCount: Math.max(0, parseCount(likesRaw)),
      replyCount: Math.max(0, replies),
      pinned: !!(legacy ? c?.authorCommentBadge : (c?.toolbar?.isPinned ?? props?.isPinned ?? false)),
      isLiked: legacy ? !!c?.actionButtons?.likeButtonViewModel?.likeEntity?.liked : false,
      hearted: !!(c?.viewerState?.heartState || props?.heartState),
      continuation: nextToken,
    });
  }
  // The "Next page" of comments always lives on a buttonRenderer command; reply
  // continuations use a plain endpoint, so asking for the button keeps us from
  // paginating into a single comment's replies.
  const next =
    collect<Any>(data, "continuationItemRenderer")
      .map((c) => c?.button?.buttonRenderer?.command?.continuationCommand?.token)
      .find((t) => typeof t === "string") || null;
  return { comments: list, nextpage: next, commentCount: -1 };
}

// -------------------------------------------------------------- channels --

export async function channel(handle: string, tab = "videos", token?: string | null): Promise<ProviderResult> {
  const cacheKey = `it-chan:${handle}:${tab}`;
  if (!token) {
    const hit = cacheGet<Any>(cacheKey);
    if (hit) return { ok: true, data: hit, via: "innertube(cache)" };
  }
  let browseId: string | null = null;
  if (token) {
    const res = await call("browse", { continuation: token }, 11000);
    if (!res.ok) return { ok: false, error: res.error };
    const data = res.data as Any;
    return {
      ok: true,
      data: { relatedStreams: extractVideos(data), nextpage: findFirst<string>(data, "token") || null },
      via: "innertube",
    };
  }
  if (/^UC[\w-]{22}$/.test(handle)) {
    browseId = handle;
  } else {
    // @handle / /c/name / /user/name -> channel id, scraped from the page shell.
    const path = handle.replace(/^\/+/, "");
    const html = await fetchHtml(`https://www.youtube.com/${path}`);
    const id =
      html.match(/"channelId":"(UC[\w-]{22})"/)?.[1] ||
      html.match(/externalId":"(UC[\w-]{22})"/)?.[1] ||
      html.match(/"browseId":"(UC[\w-]{22})"/)?.[1];
    if (!id) return { ok: false, error: "channel not found" };
    browseId = id;
  }
  if (!browseId) return { ok: false, error: "channel not found" };

  const res = await call("browse", { browseId }, 11000);
  if (!res.ok) return { ok: false, error: res.error };
  const data = res.data as Any;
  const header = findFirst<Any>(data, "pageHeaderViewModel") || findFirst<Any>(data, "c4TabbedHeaderRenderer") || {};
  const meta = findFirst<Any>(data, "metadata");
  const avatarSources =
    findFirst<any[]>(header?.image, "sources") ||
    findFirst<any[]>(findFirst(data, "avatar"), "sources") ||
    findFirst<any[]>(findFirst(data, "c4TabbedHeaderRenderer")?.avatar, "sources") ||
    [];
  const payload = {
    id: browseId,
    name: text(findFirst(data, "title")) || text(header?.title) || "",
    avatarUrl: bestThumb(avatarSources, "M"),
    bannerUrl: bestThumb(findFirst<any[]>(findFirst(data, "banner"), "image") || [], "banner"),
    description:
      text(findFirst(data, "descriptionSnippet")) ||
      String(findFirst(data, "description") || "") ||
      "",
    subscriberCount: parseCount(findFirst(data, "subscriberCountText") ?? findFirst(meta, "content")),
    videoCount: -1,
    verified: false,
    relatedStreams: extractVideos(data).slice(0, 30),
    nextpage: findFirst<string>(data, "token") || null,
  };
  cacheSet(cacheKey, payload, 300);
  return { ok: true, data: payload, via: "innertube" };
}

async function fetchHtml(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UPSTREAM_UA,
        Accept: "text/html,application/xhtml+xml",
        Cookie: "SOCS=CAMSAhAB",
      },
    });
    return await res.text();
  } catch {
    return "";
  }
}

// ------------------------------------------------------------ suggestions --

export async function suggestions(q: string): Promise<ProviderResult> {
  const url = `https://suggestqueries-clients6.youtube.com/complete/search?client=firefox&ds=yt&hl=en&gl=us&q=${encodeURIComponent(q)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UPSTREAM_UA } });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      const m = /\(([\s\S]*)\)$/.exec(text);
      if (m) parsed = JSON.parse(m[1]);
    }
    const list: string[] = Array.isArray(parsed?.[1])
      ? parsed[1].map((x: any) => (Array.isArray(x) ? String(x[0]) : String(x)))
      : [];
    return { ok: true, data: list, via: "innertube" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "failed" };
  }
}

/** VTT conversion so the player can show real captions, same-origin. */
export async function captionsVtt(videoId: string, code: string, auto: boolean): Promise<string | null> {
  const base = auto
    ? `https://www.youtube.com/api/timedtext?type=list&v=${videoId}`
    : "";
  void base;
  const tracks = await streams(videoId);
  if (!tracks.ok) return null;
  const list = (tracks.data as NormalisedStreams).subtitles || [];
  const track = list.find((t) => t.code === code) || list[0];
  if (!track?.url) return null;
  const sep = track.url.includes("?") ? "&" : "?";
  try {
    const res = await fetch(`${track.url}${sep}fmt=json3`, { headers: { "User-Agent": UPSTREAM_UA } });
    if (!res.ok) return null;
    const json: any = await res.json();
    return json3ToVtt(json);
  } catch {
    return null;
  }
}

export function json3ToVtt(json: any): string {
  const events: any[] = Array.isArray(json?.events) ? json.events : [];
  let out = "WEBVTT\n\n";
  let idx = 0;
  for (const ev of events) {
    const segs: any[] = Array.isArray(ev?.segs) ? ev.segs : [];
    const line = segs
      .map((s) => (s?.utf8 === "\n" ? "\n" : String(s?.utf8 ?? "").replace(/\n/g, " ")))
      .join("")
      .replace(/<\/?(?:c|f0|fps|u|b|i)[^>]*>/gi, "")
      .replace(/[\u00a0\u200b]/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .trim();
    if (!line) continue;
    const start = Number(ev?.tStartMs || 0) / 1000;
    const dur = Number(ev?.dDurationMs || 1200) / 1000;
    const end = start + Math.max(0.3, dur);
    idx++;
    out += `${idx}\n${ts(start)} --> ${ts(end)}\n${line}\n\n`;
  }
  return out;
}

function ts(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.round((sec - Math.floor(sec)) * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return `${p(h)}:${p(m)}:${p(s)}.${p(ms, 3)}`;
}
