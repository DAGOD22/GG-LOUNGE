import { NextResponse } from "next/server";
import { getGame } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GG_TAG = "/gg/gg-boot.js";

/** Insert the lounge boot script once, as late as possible. */
export function injectGgEngine(html: string): string {
  if (typeof html !== "string" || html.includes(GG_TAG)) return html;
  const tag = `<script src="${GG_TAG}"></script>`;
  if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${tag}</body>`);
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, `${tag}</head>`);
  return `${tag}${html}`;
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const game = await getGame(id);
    if (!game?.html) return new NextResponse("Game not found", { status: 404 });
    // Games served from the database miss the lounge <head>, so bolt the shared
    // settings engine on: tab cloak, panic key, theme + background all work
    // inside a full-page game the same way they do on the site.
    const html = injectGgEngine(game.html);
    return new NextResponse(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy":
          "default-src 'self' data: blob: https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:;",
      },
    });
  } catch (err) {
    console.error("[games/[id]]", err);
    return new NextResponse("Couldn't load game", { status: 500 });
  }
}
