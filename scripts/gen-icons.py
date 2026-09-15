#!/usr/bin/env python3
"""Render the GG-Lounge brand mark into real icon files.

The sandbox has no rsvg/cairo/ImageMagick delegate, so this writes PNGs with a
tiny pure-Python encoder (zlib + struct only) and a signed-distance rasteriser.
Re-run after editing the palette or geometry:

    python3 scripts/gen-icons.py

Outputs (all committed):
    public/brand/icon-{16,32,48,64,128,180,192,512}.png
    public/brand/maskable-512.png
    public/brand/mark.svg            (vector, used for the tab favicon + manifest)
    public/favicon.ico               (16/32/48 PNG entries inside an ICO container)
"""
from __future__ import annotations

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "brand"

# ---------------------------------------------------------------- palette ----
BG_TOP = (20, 23, 34)      # #141722
BG_BOT = (13, 15, 22)      # #0d0f16
BG_TINT = (27, 21, 51)     # #1b1533 - violet corner
LIME = (222, 247, 92)      # #def75c
LIME_DIM = (176, 214, 53)
CORAL = (255, 107, 138)    # #ff6b8a


def lerp(a, b, t):
    return a + (b - a) * max(0.0, min(1.0, t))


def mix(c1, c2, t):
    return tuple(int(round(lerp(c1[i], c2[i], t))) for i in range(3))


# ------------------------------------------------------------ distance fns ---
def sd_round_rect(px, py, hw, hh, r):
    """Signed distance to a rounded rectangle centred on the origin (negative inside)."""
    qx = abs(px) - (hw - r)
    qy = abs(py) - (hh - r)
    ax = max(qx, 0.0)
    ay = max(qy, 0.0)
    return math.hypot(ax, ay) + min(max(qx, qy), 0.0) - r


def sd_segment(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    wx, wy = px - ax, py - ay
    t = (wx * vx + wy * vy) / (vx * vx + vy * vy)
    t = max(0.0, min(1.0, t))
    return math.hypot(wx - vx * t, wy - vy * t)


def coverage(dist, aa):
    """Antialiased 0..1 coverage for a shape whose SDF is `dist`."""
    if dist > aa * 0.5:
        return 0.0
    if dist < -aa * 0.5:
        return 1.0
    return 0.5 - dist / aa


# ---------------------------------------------------------------- renderer ---
def render(size: float, pad: float = 0.0) -> bytearray:
    """size in pixels; pad widens the safe area (used for maskable icons)."""
    S = size
    N = int(round(S))
    rgba = bytearray(N * N * 4)
    hw = S / 2.0  # used for offsets below
    radius = S * (0.215 + pad * 0.06)
    corner_r = S * 0.205
    ring_r = S * (0.245 - pad * 0.05)
    ring_t = S * (0.115 - pad * 0.02)
    aa = max(0.9, S / 260.0)

    # mark sits slightly left of centre so the coral bar can balance it
    gx = -S * 0.02
    gy = -S * 0.01
    gap = math.radians(62.0)  # half-angle of the opening on the right

    for y in range(N):
        py = y + 0.5 - N / 2.0
        for x in range(N):
            px = x + 0.5 - N / 2.0

            d_bg = sd_round_rect(px, py, hw - 1.0, hw - 1.0, corner_r)
            a_bg = coverage(d_bg, aa)
            if a_bg <= 0.0:
                idx = (y * N + x) * 4
                rgba[idx : idx + 4] = b"\x00\x00\x00\x00"
                continue

            # background: diagonal gradient plus a violet wash from the top-right
            t = (y / S) * 0.6 + (1 - x / S) * 0.4
            r, g, b = mix(BG_TOP, BG_BOT, t)
            wash = coverage(-(math.hypot(px - hw * 0.62, py + hw * 0.62) - S * 0.52), S * 0.55)
            r = int(lerp(r, BG_TINT[0], wash * 0.75))
            g = int(lerp(g, BG_TINT[1], wash * 0.75))
            b = int(lerp(b, BG_TINT[2], wash * 0.75))

            # one crisp border ring, inset from the edge
            d_outline = abs(d_bg + S * 0.017) - max(1.1, S * 0.0072)
            # the hairline frame turns to mud below ~48px - skip it there
            a_outline = 0.0 if S < 48 else coverage(d_outline, aa) * 0.45
            r = int(lerp(r, LIME[0], a_outline))
            g = int(lerp(g, LIME[1], a_outline))
            b = int(lerp(b, LIME[2], a_outline))

            # --- the G: an arc band with a clean opening on the right ---------
            dist_c = math.hypot(px - gx, py - gy)
            ang = abs(math.atan2(py - gy, px - gx))  # 0 == pointing right
            in_gap = ang < gap
            d_ring = abs(dist_c - ring_r) - ring_t / 2.0
            a_lime = 0.0 if in_gap else coverage(d_ring, aa)
            if a_lime > 0.0:
                # slight vertical shade so the ring reads as one solid stroke
                shade = 0.0 if py < 0 else 0.22
                r = int(lerp(r, int(lerp(LIME[0], LIME_DIM[0], shade)), a_lime))
                g = int(lerp(g, int(lerp(LIME[1], LIME_DIM[1], shade)), a_lime))
                b = int(lerp(b, int(lerp(LIME[2], LIME_DIM[2], shade)), a_lime))

            # G spur: the vertical stub that turns the arc into a letter, plus
            # a coral crossbar closing the opening.
            stub_x = gx + ring_r * 0.92
            d_stub = sd_segment(px, py, stub_x, gy, stub_x, gy + ring_r * 0.62) - ring_t * 0.47
            a_stub = coverage(d_stub, aa) if dist_c > ring_r * 0.30 else 0.0
            r = int(lerp(r, LIME[1], a_stub * 0.96))
            g = int(lerp(g, LIME[1], a_stub * 0.96))
            b = int(lerp(b, LIME[2], a_stub * 0.96))

            d_bar = sd_segment(px, py, gx + ring_r * 0.02, gy, stub_x, gy) - ring_t * 0.42
            a_coral = coverage(d_bar, aa) if (in_gap or dist_c < ring_r - ring_t * 0.5) else 0.0
            r = int(lerp(r, CORAL[0], a_coral))
            g = int(lerp(g, CORAL[1], a_coral))
            b = int(lerp(b, CORAL[2], a_coral))

            idx = (y * N + x) * 4
            rgba[idx : idx + 4] = bytes((r, g, b, int(255 * a_bg)))
    return rgba


# ------------------------------------------------------------- png writer ----
def png_bytes(size: int, rgba: bytearray) -> bytes:
    raw = bytearray()
    stride = size * 4
    for y in range(size):
        raw.append(0)  # filter: none
        raw += rgba[y * stride : (y + 1) * stride]

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    out = b"\x89PNG\r\n\x1a\n"
    out += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    out += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    out += chunk(b"IEND", b"")
    return out


def render_png(size: int, pad: float = 0.0) -> bytes:
    return png_bytes(size, render(float(size), pad))


def write_ico(path: Path, sizes: list[int]) -> None:
    """ICO container holding PNG entries (Vista+ allows PNG-compressed icons)."""
    entries = []
    blobs = []
    for s in sizes:
        png = render_png(s)
        blobs.append(png)
        w = 0 if s >= 256 else s
        h = 0 if s >= 256 else s
        entries.append(struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(png), 6 + 16 * len(sizes)))
    path.write_bytes(struct.pack("<HHH", 0, 1, len(sizes)) + b"".join(entries) + b"".join(blobs))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for s in (16, 32, 48, 64, 128, 180, 192, 512):
        (OUT / f"icon-{s}.png").write_bytes(render_png(s))
        print(f"  wrote public/brand/icon-{s}.png")
    (OUT / "maskable-512.png").write_bytes(render_png(512, pad=1.0))
    print("  wrote public/brand/maskable-512.png")
    write_ico(ROOT / "public" / "favicon.ico", [16, 32, 48])
    print("  wrote public/favicon.ico")
    # iOS reads these two, and the old v0 placeholders must not linger behind.
    apple = render_png(180)
    (ROOT / "public" / "apple-icon.png").write_bytes(apple)
    (ROOT / "public" / "icon-light-32x32.png").write_bytes(render_png(32))
    (ROOT / "public" / "icon-dark-32x32.png").write_bytes(render_png(32))
    print("  wrote public/apple-icon.png + 32px site icons")
    (OUT / "mark.svg").write_text(svg_mark())
    print("  wrote public/brand/mark.svg")


def svg_mark() -> str:
    """Vector copy of the raster mark, computed from the same numbers so the PNG
    and the SVG can never drift apart."""
    S = 512.0
    cx = S / 2 - S * 0.02
    cy = S / 2 - S * 0.01
    R = S * 0.245
    T = S * 0.115
    half = math.radians(62.0)
    sx = cx + R * math.cos(half)
    sy_top = cy - R * math.sin(half)
    sy_bot = cy + R * math.sin(half)
    stub_x = cx + R * 0.92
    stub_y = cy + R * 0.62
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="GG Lounge">
  <defs>
    <linearGradient id="gg-bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#171b28"/>
      <stop offset=".55" stop-color="#0d0f16"/>
      <stop offset="1" stop-color="#1b1533"/>
    </linearGradient>
    <linearGradient id="gg-lime" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#def75c"/>
      <stop offset="1" stop-color="#b0d635"/>
    </linearGradient>
  </defs>
  <rect x="1.5" y="1.5" width="{S - 3:.1f}" height="{S - 3:.1f}" rx="{S * 0.205:.1f}" fill="url(#gg-bg)"/>
  <rect x="9.5" y="9.5" width="{S - 19:.1f}" height="{S - 19:.1f}" rx="{S * 0.19:.1f}" fill="none" stroke="rgba(222,247,92,.45)" stroke-width="{S * 0.0072 * 2:.1f}"/>
  <g fill="none" stroke="url(#gg-lime)" stroke-linecap="butt">
    <path d="M{sx:.1f} {sy_bot:.1f}A{R:.1f} {R:.1f} 0 1 1 {sx:.1f} {sy_top:.1f}" stroke-width="{T:.1f}"/>
    <path d="M{stub_x:.1f} {cy:.1f}V{stub_y:.1f}" stroke-width="{T * 0.93:.1f}"/>
  </g>
  <path d="M{cx + R * 0.02:.1f} {cy:.1f}H{stub_x:.1f}" fill="none" stroke="#ff6b8a" stroke-width="{T * 0.84:.1f}" stroke-linecap="round"/>
</svg>
"""


if __name__ == "__main__":
    main()
