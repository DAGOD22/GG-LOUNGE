import { cookies } from "next/headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cloak-aware PWA manifest.
 *
 * gg-boot.js keeps a `gg_cloak` cookie in sync with the Settings page, so an
 * installed app ("GG Lounge" → "Google Classroom") picks up the student's chosen
 * name and icon. Chrome re-reads the manifest when the link href changes, which
 * is why the client appends a `?k=` hash.
 */
type CloakCookie = { n?: string; s?: string; i?: string; t?: string };

const SAFE_ICON = /^https:\/\/[A-Za-z0-9.\-]+(?::\d+)?\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*$/;

function clean(value: unknown, max: number, fallback: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) return fallback;
  return s.replace(/[<>"'`\u0000-\u001f]/g, "").slice(0, max);
}

function color(value: unknown, fallback: string): string {
  const s = typeof value === "string" ? value.trim() : "";
  return /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : fallback;
}

export async function GET(req: Request) {
  const jar = await cookies();
  let cloak: CloakCookie = {};
  try {
    const raw = jar.get("gg_cloak")?.value;
    if (raw) cloak = JSON.parse(decodeURIComponent(raw)) as CloakCookie;
  } catch {
    cloak = {};
  }
  const url = new URL(req.url);
  const forced = url.searchParams.get("name");

  const name = clean(forced || cloak.n, 60, "GG-Lounge");
  const short = clean(cloak.s || name, 16, "GG-Lounge");
  // Once the app is renamed we also drop the brand text and the "unblocked
  // video" shortcuts, otherwise the launcher menu gives the whole thing away.
  const isCloaked = name.toLowerCase() !== "gg-lounge";
  const theme = color(cloak.t, "#0b0d12");
  const origin = req.headers.get("origin") || url.origin;

  const icons: Record<string, unknown>[] = [];
  const customIcon = typeof cloak.i === "string" && SAFE_ICON.test(cloak.i) ? cloak.i : "";
  if (customIcon) {
    icons.push({
      src: `/api/img?url=${encodeURIComponent(customIcon)}`,
      sizes: "any",
      purpose: "any",
    });
    icons.push({
      src: `/api/img?url=${encodeURIComponent(customIcon)}`,
      sizes: "192x192",
      purpose: "maskable",
    });
  }
  const iconUrl = (size: number) =>
    `/api/gg/icon.svg?label=${encodeURIComponent(short.slice(0, 1).toUpperCase())}&color=${encodeURIComponent(
      customIcon ? "%23ffffff" : "%23d7f34a",
    )}&bg=${encodeURIComponent(theme)}&size=${size}`;
  // Real brand PNGs when this is "GG-Lounge"; generated letter badges once the
  // student cloaks the install, because a lime G on the launcher is the tell.
  const brand = (size: number, maskable = false) =>
    maskable ? "/brand/maskable-512.png" : `/brand/icon-${size}.png`;
  if (isCloaked || customIcon) {
    icons.push({ src: iconUrl(192), sizes: "192x192", type: "image/svg+xml", purpose: "any" });
    icons.push({ src: iconUrl(512), sizes: "512x512", type: "image/svg+xml", purpose: "any" });
  } else {
    icons.push({ src: brand(192), sizes: "192x192", type: "image/png", purpose: "any" });
    icons.push({ src: brand(512), sizes: "512x512", type: "image/png", purpose: "any" });
    icons.push({ src: "/brand/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" });
  }

  const manifest = {
    id: "gg-lounge",
    name,
    short_name: short,
    description: isCloaked
      ? `${name} - offline school workspace`
      : "GG-LOUNGE\u2122 \u2014 browser games, unblocked video, all night.",
    start_url: `${origin}/`,
    scope: `${origin}/`,
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    orientation: "any",
    background_color: theme,
    theme_color: theme,
    icons,
    shortcuts: isCloaked
      ? []
      : [
          { name: "Continue playing", url: `${origin}/#games`, icons: [{ src: iconUrl(96) }] },
          { name: "Video room", url: `${origin}/games/youtube/index.html`, icons: [{ src: iconUrl(96) }] },
          { name: "TikTok room", url: `${origin}/games/tiktok/index.html`, icons: [{ src: iconUrl(96) }] },
          { name: "Settings", url: `${origin}/settings`, icons: [{ src: iconUrl(96) }] },
        ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
