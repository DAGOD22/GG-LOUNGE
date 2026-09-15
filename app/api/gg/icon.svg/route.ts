export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Generated app icon (rounded square + a single glyph). Used by the cloak-aware
 * manifest so an installed app always has a 512px icon even when the chosen
 * favicon is a 16px .ico — and it never depends on an outside host.
 */
function clean(v: string | null, fallback: string, max: number): string {
  const s = (v || "").trim();
  if (!s) return fallback;
  return s.replace(/[<>&"'\u0000-\u001f]/g, "").slice(0, max);
}
function hex(v: string | null, fallback: string): string {
  const s = (v || "").trim();
  return /^#?[0-9a-fA-F]{3,8}$/.test(s) ? (s.startsWith("#") ? s : "#" + s) : fallback;
}

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const label = clean(sp.get("label"), "G", 2);
  const color = hex(sp.get("color"), "#d7f34a");
  const bg = hex(sp.get("bg"), "#0b0d12");
  const accent = hex(sp.get("accent"), color);
  const size = Math.min(1024, Math.max(48, Number(sp.get("size") || 512) || 512));
  const radius = Math.round(size * 0.22);
  const fontSize = Math.round(size * (label.length > 1 ? 0.36 : 0.5));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}" />
      <stop offset="1" stop-color="${accent}" stop-opacity="0.28" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" fill="url(#g)" />
  <rect x="${size * 0.035}" y="${size * 0.035}" width="${size * 0.93}" height="${size * 0.93}" rx="${Math.round(
    radius * 0.9,
  )}" fill="none" stroke="${color}" stroke-opacity="0.5" stroke-width="${Math.max(1, size * 0.006)}" />
  <text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle"
        font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="800" fill="${color}">${label}</text>
</svg>`;

  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}
