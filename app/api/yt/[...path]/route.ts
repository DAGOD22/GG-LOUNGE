import { NextResponse } from "next/server";
import {
  PIPED_INSTANCES,
  cacheGet,
  cacheSet,
  fetchWithTimeout,
  sameOriginImageUrl,
  type ProviderResult,
} from "../lib";
import {
  channel as itChannel,
  comments as itComments,
  feed as itFeed,
  search as itSearch,
  searchNextpage as itSearchNext,
  streams as itStreams,
  suggestions as itSuggestions,
  watchExtras as itWatchExtras,
} from "../innertube";
import {
  invChannel,
  invComments,
  invFeed,
  invSearch,
  invStreams,
  invSuggestions,
  pipedJson,
} from "../upstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One API for the lounge YouTube client, backed by several providers.
 *
 * The client only ever talks to this origin; this route decides who to ask
 * (YouTube InnerTube -> Piped -> Invidious), normalises the answer into one
 * shape, and rewrites media/thumbnail URLs so no request leaves for a
 * third-party host.
 */

type Provider = "innertube" | "piped" | "invidious";

const ALL_PROVIDERS: Provider[] = ["innertube", "piped", "invidious"];

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function providerOrder(req: Request, forced?: string | null): Provider[] {
  const want = (forced || "").trim().toLowerCase();
  if (want === "innertube" || want === "youtube") return ["innertube", "piped", "invidious"];
  if (want === "piped") return ["piped", "invidious"];
  if (want === "invidious") return ["invidious", "piped"];
  if (want === "innertube-only") return ["innertube"];
  return ALL_PROVIDERS;
}

function ok(data: unknown, via: string, ttl = 60, extra?: Record<string, string>) {
  return NextResponse.json(data, {
    headers: {
      "x-yt-via": via,
      "Cache-Control": `public, s-maxage=${ttl}, stale-while-revalidate=${ttl * 2}`,
      ...(extra || {}),
    },
  });
}

function fail(errors: string[], status = 502) {
  return NextResponse.json(
    {
      error: "Video network unreachable",
      detail:
        "Every video server we know refused to answer. Try another server in Settings, or flip School mode off.",
      attempts: errors,
    },
    { status },
  );
}



/** run through the provider list until one answers with usable data */
async function run(order: Provider[], handler: (provider: Provider) => Promise<ProviderResult>): Promise<ProviderResult> {
  const errors: string[] = [];
  for (const provider of order) {
    try {
      const res = await handler(provider);
      if (res.ok) return res;
      errors.push(`${provider}: ${res.error}`);
    } catch (err) {
      errors.push(`${provider}: ${err instanceof Error ? err.message : "error"}`);
    }
  }
  return { ok: false, error: errors.join(" | ") };
}

const asArray = (d: unknown): any[] => (Array.isArray(d) ? d : []);

// ------------------------------------------------------------------ pieces --

async function feedFor(provider: Provider, kind: "trending" | "home", region: string): Promise<ProviderResult> {
  if (provider === "innertube") return itFeed(kind, region);
  if (provider === "invidious") return invFeed();
  return pipedJson(`/trending?region=${encodeURIComponent(region)}`, 3);
}

async function searchFor(provider: Provider, q: string, filter: string, page: number | null): Promise<ProviderResult> {
  if (provider === "piped") {
    const path = page
      ? `/nextpage/search?nextpage=${encodeURIComponent(JSON.stringify({ nextpage: page }))}&q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filter)}`
      : `/search?q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filter)}`;
    return pipedJson(path, 3);
  }
  if (provider === "invidious") return invSearch(q, filter, page ?? 1);
  if (page) return { ok: false, error: "no token" };
  return itSearch(q, filter);
}

async function streamsFor(provider: Provider, id: string): Promise<ProviderResult> {
  if (provider === "piped") return pipedJson(`/streams/${encodeURIComponent(id)}`, 3);
  if (provider === "invidious") return invStreams(id);
  return itStreams(id);
}

async function commentsFor(provider: Provider, id: string, token: string | null): Promise<ProviderResult> {
  if (provider === "piped") {
    const path = token
      ? `/nextpage/comments/${encodeURIComponent(id)}?nextpage=${encodeURIComponent(JSON.stringify(token))}`
      : `/comments/${encodeURIComponent(id)}`;
    return pipedJson(path, 2);
  }
  if (provider === "invidious") {
    const page = token && /^ivc:(\d+)/.test(token) ? Number(/^ivc:(\d+)/.exec(token)![1]) : 1;
    return invComments(id, page);
  }
  if (token) return { ok: false, error: "needs fresh token" };
  return itComments(id, null);
}

async function channelFor(provider: Provider, handle: string, token: string | null): Promise<ProviderResult> {
  if (provider === "piped") {
    const path = token
      ? `/nextpage/channel/${encodeURIComponent(handle)}?nextpage=${encodeURIComponent(JSON.stringify(token))}`
      : `/${handle}`;
    return pipedJson(path, 3);
  }
  if (provider === "invidious") return invChannel(handle);
  return itChannel(handle, "videos", token);
}

/**
 * InnerTube streams don't carry the "nice" watch-page extras (avatar, likes,
 * related videos) — splice them in from /next so the UI never looks half-fed,
 * and hand any third-party image URL through our own image proxy.
 */
async function hydrateStreams(data: any, id: string): Promise<any> {
  const out = { ...data };
  if (!out.videoStreams) out.videoStreams = [];
  if (!out.audioStreams) out.audioStreams = [];
  if (!out.relatedStreams) {
    try {
      const extras = await itWatchExtras(id);
      if (extras?.likes != null && !(out.likes > 0)) out.likes = extras.likes;
      if (extras?.uploaderAvatar && !out.uploaderAvatar) out.uploaderAvatar = extras.uploaderAvatar;
      if (extras?.uploaderName && !out.uploader) out.uploader = extras.uploaderName;
      if (extras?.uploaderUrl) out.uploaderUrl = out.uploaderUrl || extras.uploaderUrl;
      if (extras?.uploaderSubscriberCount != null) out.uploaderSubscriberCount = extras.uploaderSubscriberCount;
      if (extras?.commentCount != null) out.commentCount = extras.commentCount;
      if (Array.isArray(extras?.relatedStreams) && extras.relatedStreams.length) {
        out.relatedStreams = extras.relatedStreams;
      }
    } catch {
      /* extras are cosmetic — never block playback on them */
    }
  }
  out.thumbnailUrl = out.thumbnailUrl || `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  if (out.uploaderVerified == null) out.uploaderVerified = false;
  if (out.uploaderSubscriberCount == null) out.uploaderSubscriberCount = -1;
  out.provider = out.provider || "innertube";
  return out;
}

// -------------------------------------------------------------------- route --

export async function GET(req: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const parts = (path ?? []).filter(Boolean);
  const [root, ...rest] = parts;
  const incoming = new URL(req.url);
  const sp = incoming.searchParams;
  const jarCookie = req.headers.get("cookie") || "";
  const rawCookie = /(?:^|;\s*)gg_yt_provider=([^;]+)/.exec(jarCookie)?.[1] || null;
  const cookieProvider = rawCookie ? safeDecode(rawCookie) : null;
  const order = providerOrder(req, sp.get("provider") || cookieProvider);
  const id = rest[0] || "";

  try {
    // ---- feed: trending / home -------------------------------------------
    if (root === "trending" || root === "home") {
      const region = sp.get("region") || "US";
      const cacheKey = `feed:${root}:${region}`;
      const hit = cacheGet<any[]>(cacheKey);
      if (hit) return ok(hit, "lounge-cache", 120);
      const errors: string[] = [];
      for (const provider of order) {
        const res = await feedFor(provider, root === "home" ? "home" : "trending", region);
        if (res.ok && asArray(res.data).length) {
          const items = asArray(res.data);
          cacheSet(cacheKey, items, 180);
          return ok(items, res.via, 180);
        }
        errors.push(`${provider}: ${res.ok ? "empty" : res.error}`);
      }
      // Last resort: a curated set of search results so the landing page is
      // never an empty grid.
      const fallback = await run(order, (provider) =>
        provider === "piped"
          ? pipedJson("/search?q=popular%20videos&filter=videos", 1)
          : provider === "invidious"
            ? invSearch("popular videos", "videos", 1)
            : itSearch("popular videos", "videos"),
      );
      if (fallback.ok) {
        const items = asArray((fallback.data as any)?.items ?? fallback.data);
        if (items.length) return ok(items, `${fallback.via} (fallback search)`, 120);
      }
      return fail(errors, 502);
    }

    // ---- search ------------------------------------------------------------
    if (root === "search") {
      const q = sp.get("q") || "";
      if (!q) return NextResponse.json({ error: "Missing q" }, { status: 400 });
      const filter = sp.get("filter") || "all";
      const cacheKey = `search:${q}:${filter}`;
      const hit = cacheGet<any>(cacheKey);
      if (hit) return ok(hit, "lounge-cache", 60);
      const errors: string[] = [];
      for (const provider of order) {
        const res = await searchFor(provider, q, filter, null);
        if (res.ok) {
          const data = normaliseSearchPage(res.data, provider);
          if (data.items.length) {
            cacheSet(cacheKey, data, 90);
            return ok(data, `${res.via}`, 90);
          }
        }
        errors.push(`${provider}: ${res.ok ? "empty" : res.error}`);
      }
      return fail(errors);
    }

    if (root === "nextpage" && rest[0] === "search") {
      const q = sp.get("q") || "";
      const filter = sp.get("filter") || "all";
      const raw = sp.get("nextpage") || "";
      let token: string | null = raw || null;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object") token = parsed.nextpage || parsed.token || raw;
        else if (typeof parsed === "string") token = parsed;
      } catch {
        /* plain token string */
      }
      // InnerTube wants its raw continuation token; Piped wants a JSON blob.
      const errors: string[] = [];
      for (const provider of order) {
        try {
          let res: ProviderResult;
          if (provider === "innertube") {
            const t = String(token || "").replace(/^"|"$/g, "");
            res = /^iv[c]?:/.test(t) ? { ok: false, error: "wrong provider token" } : await itSearchNext(t, q, filter);
          } else if (provider === "piped") {
            res = await pipedJson(
              `/nextpage/search?nextpage=${encodeURIComponent(JSON.stringify(token))}&q=${encodeURIComponent(q)}&filter=${encodeURIComponent(filter)}`,
              2,
            );
          } else {
            const m = /^iv:(\d+)$/.exec(String(token || ""));
            res = m ? await invSearch(q, filter === "channels" ? "channels" : "videos", Number(m[1])) : { ok: false, error: "no page token" };
          }
          if (res.ok) {
            const data = normaliseSearchPage(res.data, provider);
            if (data.items.length) return ok(data, `${res.via}`, 30);
          }
          errors.push(`${provider}: ${res.ok ? "empty" : res.error}`);
        } catch (err) {
          errors.push(`${provider}: ${err instanceof Error ? err.message : "error"}`);
        }
      }
      return fail(errors);
    }

    // ---- streams (watch) ---------------------------------------------------
    if (root === "streams") {
      if (!/^[\w-]{11}$/.test(id)) return NextResponse.json({ error: "Bad video id" }, { status: 400 });
      const cacheKey = `streams:${id}`;
      const hit = cacheGet<any>(cacheKey);
      if (hit) return ok(hit, "lounge-cache", 240);
      const errors: string[] = [];
      for (const provider of order) {
        const res = await streamsFor(provider, id);
        if (res.ok && res.status !== 404) {
          const data = await hydrateStreams(res.data, id);
          const playable =
            data.videoStreams.length || data.audioStreams.length || data.hls || data.livestream;
          if (playable) {
            cacheSet(cacheKey, data, 240);
            return ok(data, res.via, 240, { "x-yt-playable": "1" });
          }
        }
        errors.push(`${provider}: ${res.ok ? "no playable streams" : res.error}`);
      }
      return fail(errors);
    }

    // ---- comments ----------------------------------------------------------
    if (root === "comments" || (root === "nextpage" && rest[0] === "comments")) {
      const videoId = root === "comments" ? id : rest[1] || "";
      if (!/^[\w-]{11}$/.test(videoId)) return NextResponse.json({ error: "Bad video id" }, { status: 400 });
      const raw = sp.get("nextpage");
      for (const provider of order) {
        const res = await commentsFor(provider, videoId, raw);
        if (res.ok) {
          const payload = res.data as any;
          const list = Array.isArray(payload?.comments) ? payload.comments : [];
          if (list.length || raw) {
            return ok(
              {
                comments: list.map((c: any) => ({
                  ...c,
                  thumbnail: c?.thumbnail ? sameOriginImageUrl(String(c.thumbnail)) : "",
                })),
                commentCount: Number(payload?.commentCount ?? -1),
                nextpage: payload?.nextpage || null,
              },
              res.via,
              60,
            );
          }
        }
      }
      return ok({ comments: [], commentCount: 0, nextpage: null }, "none", 30);
    }

    // ---- channel -----------------------------------------------------------
    if (root === "channel" || root === "c" || root === "user") {
      const handle = [root, ...rest].map(encodeURIComponent).join("/");
      for (const provider of order) {
        const res = await channelFor(provider, decodeURIComponent(handle), null);
        if (res.ok) {
          const data = res.data as any;
          if (data && (data.name || data.relatedStreams?.length)) {
            return ok(
              {
                ...data,
                avatarUrl: data.avatarUrl ? sameOriginImageUrl(String(data.avatarUrl)) : "",
                bannerUrl: data.bannerUrl ? sameOriginImageUrl(String(data.bannerUrl)) : "",
                thumbnail: data.thumbnail ? sameOriginImageUrl(String(data.thumbnail)) : "",
              },
              res.via,
              300,
            );
          }
        }
      }
      return fail([`channel ${handle}: unreachable`]);
    }

    if (root === "nextpage" && rest[0] === "channel") {
      const handle = rest[1] || "";
      const token = sp.get("nextpage") || "";
      for (const provider of order) {
        const res = await channelFor(provider, handle, token);
        if (res.ok) {
          const data = res.data as any;
          const list = Array.isArray(data?.relatedStreams) ? data.relatedStreams : [];
          if (list.length) return ok({ relatedStreams: list, nextpage: data?.nextpage || null }, res.via, 60);
        }
      }
      return ok({ relatedStreams: [], nextpage: null }, "none", 30);
    }

    // ---- suggestions -------------------------------------------------------
    if (root === "suggestions") {
      const q = sp.get("q") || sp.get("query") || "";
      for (const provider of order) {
        const res =
          provider === "innertube"
            ? await itSuggestions(q)
            : provider === "invidious"
              ? await invSuggestions(q)
              : await pipedJson(`/suggestions?q=${encodeURIComponent(q)}`, 2);
        if (res.ok) {
          const data: any = res.data;
          const list = Array.isArray(data) ? data : Array.isArray(data?.suggestions) ? data.suggestions : [];
          if (list.length) return ok(list, res.via, 120);
        }
      }
      return ok([], "none", 10);
    }

    // ---- sponsorblock ------------------------------------------------------
    if (root === "sponsors") {
      const cacheKey = `sb:${id}`;
      const hit = cacheGet<any>(cacheKey);
      if (hit) return ok(hit, "lounge-cache", 3600);
      try {
        const res = await fetchWithTimeout(
          `https://sponsor.ajay.app/api/skipSegments/${encodeURIComponent(id)}?category=sponsor&category=intro&category=outro`,
          6000,
          { headers: { Accept: "application/json" } },
        );
        if (!res.ok) return ok([], "sponsorblock", 300);
        const data = await res.json();
        cacheSet(cacheKey, data, 3600);
        return ok(data, "sponsorblock", 3600);
      } catch {
        return ok([], "sponsorblock-offline", 60);
      }
    }

    return NextResponse.json({ error: "Unknown endpoint" }, { status: 404 });
  } catch (err) {
    return NextResponse.json(
      { error: "Proxy error", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

/** Make every provider's search page look the same to the client. */
function normaliseSearchPage(raw: unknown, provider: Provider): { items: any[]; nextpage: string | null; suggestion: string | null } {
  const data: any = raw && typeof raw === "object" ? raw : {};
  const items = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data)
      ? data
      : Array.isArray(data?.relatedStreams)
        ? data.relatedStreams
        : [];
  let nextpage: string | null = null;
  if (typeof data?.nextpage === "string") nextpage = data.nextpage;
  else if (data?.nextpage != null) {
    // Piped hands back a token object: keep it as a compact string.
    const inner = data.nextpage?.nextpage ?? data.nextpage;
    nextpage = typeof inner === "string" ? inner : JSON.stringify(inner);
  }
  if (provider === "piped" && nextpage && !nextpage.startsWith("{")) {
    nextpage = JSON.stringify({ nextpage });
  }
  return { items, nextpage, suggestion: typeof data?.suggestion === "string" ? data.suggestion : null };
}

export async function OPTIONS() {
  return new Response(null, { status: 204 });
}

// re-export so /api/yt/health can reuse the same instance pools
export { PIPED_INSTANCES };
