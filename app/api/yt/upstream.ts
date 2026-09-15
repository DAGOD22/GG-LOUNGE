/**
 * Community-instance providers (Piped + Invidious) with normalisation into the
 * shape the lounge client speaks. These are the fallbacks when YouTube itself
 * rate-limits our server, or vice versa.
 */

import {
  INVIDIOUS_INSTANCES,
  PIPED_INSTANCES,
  cacheGet,
  cacheSet,
  orderedInstances,
  sameOriginMediaUrl,
  markGood,
  fetchWithTimeout,
  type ProviderResult,
} from "./lib";

type Any = Record<string, any>;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// ------------------------------------------------------------------- Piped --

export async function pipedJson(pathWithQuery: string, attempts = 4): Promise<ProviderResult> {
  const errors: string[] = [];
  for (const base of orderedInstances("piped", PIPED_INSTANCES).slice(0, attempts)) {
    try {
      const res = await fetchWithTimeout(`${base}${pathWithQuery}`, 8000, {
        headers: { Accept: "application/json", "User-Agent": UA },
      });
      const text = await res.text();
      let data: any = text;
      try {
        data = JSON.parse(text);
      } catch {
        /* raw text */
      }
      if (res.status >= 500) {
        errors.push(`${base} -> ${res.status}`);
        continue;
      }
      markGood("piped", PIPED_INSTANCES, base);
      return { ok: true, data, via: base, status: res.status };
    } catch (err) {
      errors.push(`${base} -> ${err instanceof Error ? err.message : "unreachable"}`);
    }
  }
  return { ok: false, error: errors.join("; ") || "no Piped instance reachable" };
}

// -------------------------------------------------------------- Invidious --

function invThumb(list: any, prefer?: string): string {
  if (!Array.isArray(list) || !list.length) return "";
  if (prefer) {
    const hit = list.find((t) => typeof t?.url === "string" && t.url.includes(prefer));
    if (hit) return hit.url;
  }
  const sorted = [...list].sort((a, b) => (b?.height ?? 0) - (a?.height ?? 0));
  return sorted[0]?.url || list[0]?.url || "";
}

function invVideo(v: Any, base: string): Any | null {
  const id = v?.videoId;
  if (typeof id !== "string" || !/^[\w-]{11}$/.test(id)) return null;
  const length = Number(v?.lengthSeconds ?? -1);
  return {
    type: "stream",
    url: `/watch?v=${id}`,
    title: v?.title || "",
    thumbnail: invThumb(v?.videoThumbnails) || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    uploaderName: v?.author || "",
    uploaderUrl: v?.authorId ? `/channel/${v.authorId}` : "",
    uploaderAvatar: invThumb(v?.authorThumbnails, "MQ"),
    uploaderVerified: false,
    duration: Number.isFinite(length) ? length : -1,
    views: Number(v?.viewCount ?? -1),
    uploaded: Number(v?.published ?? -1),
    uploadedDate: v?.publishedText || "",
    shortDescription: (v?.description || "").slice(0, 200),
    isLive: !!v?.live,
  };
}

async function invGet<T = Any>(
  pathWithQuery: string,
  attempts = 4,
): Promise<{ ok: true; data: T; base: string } | { ok: false; error: string }> {
  const errors: string[] = [];
  for (const base of orderedInstances("invidious", INVIDIOUS_INSTANCES).slice(0, attempts)) {
    try {
      const res = await fetchWithTimeout(`${base}${pathWithQuery}`, 9000, {
        headers: { Accept: "application/json", "User-Agent": UA, "Accept-Language": "en" },
      });
      if (res.status >= 500) {
        errors.push(`${base} -> ${res.status}`);
        continue;
      }
      const data = (await res.json().catch(() => null)) as T | null;
      if (!res.ok || data == null) {
        errors.push(`${base} -> HTTP ${res.status}`);
        continue;
      }
      markGood("invidious", INVIDIOUS_INSTANCES, base);
      return { ok: true, data, base };
    } catch (err) {
      errors.push(`${base} -> ${err instanceof Error ? err.message : "unreachable"}`);
    }
  }
  return { ok: false, error: errors.join("; ") || "no Invidious instance reachable" };
}

export async function invSearch(q: string, filter: string, page = 1): Promise<ProviderResult> {
  const type = filter === "channels" ? "channel" : filter === "playlists" ? "playlist" : "video";
  const path = `/api/v1/search?q=${encodeURIComponent(q)}&type=${type}&page=${page}`;
  const res = await invGet<any[]>(path);
  if (!res.ok) return { ok: false, error: res.error };
  const list = Array.isArray(res.data) ? res.data : [];
  const items = list
    .map((v) => (type === "channel" ? invChannelCard(v) : invVideo(v, res.base)))
    .filter(Boolean);
  return {
    ok: true,
    data: { items, nextpage: items.length >= 20 ? `iv:${page + 1}` : null, suggestion: null },
    via: `invidious:${new URL(res.base).hostname}`,
  };
}

function invChannelCard(c: Any): Any {
  return {
    type: "channel",
    name: c?.author || c?.name || "",
    url: c?.authorId ? `/channel/${c.authorId}` : "",
    thumbnail: invThumb(c?.authorThumbnails, "MQ"),
    description: (c?.authorDescription || c?.description || "").slice(0, 300),
    subscribers: Number(c?.subCount ?? -1),
    videoCount: Number(c?.videos ?? -1),
    verified: false,
  };
}

export async function invFeed(): Promise<ProviderResult> {
  const cacheKey = "inv:trending";
  const hit = cacheGet<Any[]>(cacheKey);
  if (hit) return { ok: true, data: hit, via: "invidious(cache)" };
  const res = await invGet<any[]>("/api/v1/trending?type=short");
  if (!res.ok) return { ok: false, error: res.error };
  const list = Array.isArray(res.data) ? res.data : [];
  const items = list.map((v) => invVideo(v, res.base)).filter(Boolean);
  if (!items.length) return { ok: false, error: "no trending items" };
  cacheSet(cacheKey, items, 240);
  return { ok: true, data: items, via: `invidious:${new URL(res.base).hostname}` };
}

/** Map Invidious stream metadata onto the Piped `streams` shape. */
export async function invStreams(videoId: string): Promise<ProviderResult> {
  const cacheKey = `inv:streams:${videoId}`;
  const hit = cacheGet<Any>(cacheKey);
  if (hit) return { ok: true, data: hit, via: "invidious(cache)" };
  const res = await invGet<Any>(`/api/v1/videos/${encodeURIComponent(videoId)}?local=true&region=US`);
  if (!res.ok) return { ok: false, error: res.error };
  const v = res.data;
  const abs = (u: unknown): string => {
    if (typeof u !== "string" || !u) return "";
    if (/^https?:/i.test(u)) return u;
    return res.base + u;
  };
  const muxed = (v?.formatStreams || []).map((f: Any) => ({
    url: abs(f?.url),
    mimeType: f?.container ? `video/${f.container}` : "video/mp4",
    format: f?.container || "mp4",
    quality: String(f?.quality || f?.resolution || "").replace(/^(sd|hd|high)/i, "") || `${f?.resolution || ""}`,
    height: Number(String(f?.quality || "").replace(/\D/g, "")) || 0,
    bitrate: Number(f?.bitrate || 0),
    itag: f?.itag,
    videoOnly: false,
  }));
  const adaptive = (v?.adaptiveFormats || []).map((f: Any) => {
    const type = String(f?.type || f?.mimeType || "");
    return {
      url: abs(f?.url),
      mimeType: type || "video/mp4",
      format: f?.container || (type.includes("mp4") ? "mp4" : "webm"),
      quality: String(f?.quality || "").replace(/^(sd|hd|high)/i, ""),
      height: Number(String(f?.quality || "").replace(/\D/g, "")) || 0,
      bitrate: Number(f?.bitrate || 0),
      itag: f?.itag,
      videoOnly: /^video\//i.test(type) || !f?.audioCodec === false,
    };
  });
  const videoStreams = [...muxed, ...adaptive.filter((f: Any) => /^video\//i.test(f.mimeType))];
  const audioStreams = adaptive
    .filter((f: Any) => /^audio\//i.test(f.mimeType))
    .map((f: Any) => ({ ...f, videoOnly: undefined }));
  const hlsRaw = abs(v?.hlsUrl || v?.dashUrl || "");

  const out = {
    title: v?.title || "",
    description: v?.videoDescription || v?.description || "",
    thumbnailUrl: invThumb(v?.videoThumbnails, "maxres") || `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    previewUrl: "",
    uploader: v?.author || "",
    uploaderUrl: v?.authorId ? `/channel/${v.authorId}` : "",
    uploaderAvatar: invThumb(v?.authorThumbnails, "MQ"),
    uploaderVerified: false,
    uploaderSubscriberCount: -1,
    views: Number(v?.viewCount ?? -1),
    likes: Number(v?.likeCount ?? -1),
    duration: Number(v?.lengthSeconds ?? -1),
    uploadDate: v?.publishedText || String(v?.published || ""),
    category: v?.category || "",
    licence: "",
    visibility: "",
    livestream: !!v?.live,
    videoStreams,
    audioStreams,
    hls: hlsRaw ? sameOriginMediaUrl(hlsRaw) : null,
    relatedStreams: (v?.recommendedVideos || []).map((r: Any) => invVideo(r, res.base)).filter(Boolean),
    chapters: (v?.chapters || []).map((c: Any) => ({
      title: c?.title || "",
      start: Number(c?.start || 0),
      image: invThumb(c?.thumbnails),
    })),
    subtitles: (v?.captions || []).map((c: Any) => ({
      code: c?.language_code || c?.languageCode || "",
      name: c?.label || c?.name || "",
      url: abs(c?.url),
      autoGenerated: !!(c?.auto_generated ?? c?.autoGenerated),
    })),
    provider: "invidious",
  };
  cacheSet(cacheKey, out, 240);
  return { ok: true, data: out, via: `invidious:${new URL(res.base).hostname}` };
}

export async function invComments(videoId: string, page = 1): Promise<ProviderResult> {
  const res = await invGet<Any>(
    `/api/v1/comments/${encodeURIComponent(videoId)}?sort_by=top&page=${page}`,
  );
  if (!res.ok) return { ok: false, error: res.error };
  const data = res.data;
  const comments = (data?.comments || []).map((c: Any) => ({
    author: c?.author || "Anonymous",
    authorId: c?.authorId || "",
    thumbnail: invThumb(c?.authorThumbnails, "M"),
    commentText: c?.content || "",
    commentTime: c?.publishedText || "",
    commentedTime: c?.publishedText || "",
    likeCount: Number(c?.likeCount ?? 0),
    replyCount: Number(c?.replyCount ?? 0),
    pinned: !!c?.pinned,
    continuation: null,
  }));
  return {
    ok: true,
    data: {
      comments,
      commentCount: Number(data?.commentCount ?? -1),
      nextpage: comments.length ? `ivc:${page + 1}:${videoId}` : null,
    },
    via: `invidious:${new URL(res.base).hostname}`,
  };
}

export async function invChannel(handle: string): Promise<ProviderResult> {
  const res = await invGet<Any>(`/api/v1/channels/${encodeURIComponent(handle)}`);
  if (!res.ok) return { ok: false, error: res.error };
  const c = res.data;
  return {
    ok: true,
    data: {
      id: c?.id || handle,
      name: c?.author || "",
      avatarUrl: invThumb(c?.authorThumbnails, "MQ2"),
      bannerUrl: invThumb(c?.authorBanners, "banner"),
      description: c?.description || "",
      subscriberCount: Number(c?.subscriberCount ?? -1),
      videoCount: Number(c?.videoCount ?? -1),
      verified: false,
      relatedStreams: [...(c?.latestVideos || []), ...(c?.videos || [])]
        .map((v: Any) => invVideo(v, res.base))
        .filter(Boolean),
      nextpage: null,
    },
    via: `invidious:${new URL(res.base).hostname}`,
  };
}

export async function invSuggestions(q: string): Promise<ProviderResult> {
  const res = await invGet<any[]>(`/api/v1/search/suggestions?q=${encodeURIComponent(q)}`);
  if (!res.ok) return { ok: false, error: res.error };
  const data: any = res.data;
  const list = Array.isArray(data)
    ? data.map((d: any) => (typeof d === "string" ? d : d?.text)).filter(Boolean)
    : Array.isArray(data?.suggestions)
      ? data.suggestions
      : [];
  return { ok: true, data: list, via: "invidious" };
}
