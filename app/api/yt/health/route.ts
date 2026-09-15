import { NextResponse } from "next/server";
import {
  INVIDIOUS_INSTANCES,
  PIPED_INSTANCES,
  cacheGet,
  cacheSet,
  fetchWithTimeout,
  orderedInstances,
} from "../lib";
import { feed as itFeed, streams as itStreams } from "../innertube";
import { invFeed, pipedJson } from "../upstream";
import { tiktokHealth } from "../../tt/lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "Are the video servers actually reachable right now?" — the settings page and
 * the YouTube client both poll this so the student knows whether to switch
 * server, turn School mode off, or blame the school firewall.
 */
type Probe = { ok: boolean; ms: number; detail: string };

async function timed(fn: () => Promise<Probe>): Promise<Probe> {
  const started = Date.now();
  try {
    const res = await fn();
    return { ...res, ms: Date.now() - started };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, detail: err instanceof Error ? err.message : "error" };
  }
}

async function probeInvidious(): Promise<Probe> {
  const errors: string[] = [];
  for (const base of orderedInstances("invidious", INVIDIOUS_INSTANCES).slice(0, 4)) {
    try {
      const res = await fetchWithTimeout(`${base}/api/v1/trending?type=short`, 7000, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        const n = Array.isArray(data) ? data.length : 0;
        return { ok: n > 0, ms: 0, detail: n ? `${n} videos on ${new URL(base).hostname}` : "empty response" };
      }
      errors.push(`${new URL(base).hostname}:${res.status}`);
    } catch (err) {
      errors.push(`${new URL(base).hostname}:${err instanceof Error ? err.message.slice(0, 24) : "down"}`);
    }
  }
  return { ok: false, ms: 0, detail: errors.join(", ") || "unreachable" };
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const deep = sp.get("deep") === "1";
  const cacheKey = `health:${deep ? "deep" : "fast"}`;
  const hit = cacheGet<any>(cacheKey);
  if (hit && !deep) return NextResponse.json(hit, { headers: { "cache-control": "no-store" } });

  const [innertube, piped, invidious, tiktok] = await Promise.all([
    timed(async () => {
      if (deep) {
        const res = await itStreams("jNQXAC9IVRw");
        if (!res.ok) return { ok: false, ms: 0, detail: res.error };
        const data: any = res.data;
        const n = (data?.videoStreams?.length || 0) + (data?.audioStreams?.length || 0);
        return { ok: n > 0, ms: 0, detail: n ? `${n} stream URLs from YouTube` : "no streams" };
      }
      const res = await itFeed("home", "US");
      if (!res.ok) return { ok: false, ms: 0, detail: res.error };
      const n = Array.isArray(res.data) ? res.data.length : 0;
      return { ok: n > 0, ms: 0, detail: n ? `${n} feed items from YouTube` : "empty feed" };
    }),
    timed(async () => {
      const res = await pipedJson("/trending?region=US", 3);
      if (!res.ok) return { ok: false, ms: 0, detail: res.error };
      const n = Array.isArray(res.data) ? res.data.length : 0;
      return { ok: n > 0, ms: 0, detail: n ? `${n} videos via ${res.via.replace("https://", "")}` : "empty" };
    }),
    timed(probeInvidious),
    timed(async () => await tiktokHealth()),
  ]);

  const out = {
    at: Date.now(),
    providers: { innertube, piped, invidious, tiktok },
    usable: innertube.ok || piped.ok || invidious.ok,
    mode: deep ? "deep" : "fast",
    instances: { piped: PIPED_INSTANCES.length, invidious: INVIDIOUS_INSTANCES.length },
  };
  cacheSet(cacheKey, out, 45);
  return NextResponse.json(out, { headers: { "cache-control": "no-store" } });
}
