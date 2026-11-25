import { NextResponse } from "next/server";
import {
  buildSandboxDocument,
  extractCode,
  isSafeSandboxSource,
} from "@/lib/gg-gpt/sandbox";
import { callerKey, consumeSharedBudget } from "@/lib/live-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Turn model output (or pasted code) into a document the sandbox iframe runs.
 *
 * Nothing here executes anything. It assembles a string; the browser runs it in
 * an opaque-origin iframe with a CSP that forbids network access. See
 * lib/gg-gpt/sandbox.ts for why the execution model looks like that.
 *
 * Two input shapes: `{ markdown }` for a whole reply (the fences are pulled
 * out), or `{ html, css, js }` for code the user edited by hand.
 */
export async function POST(req: Request) {
  if (!(await consumeSharedBudget(`sandbox:${callerKey(req)}`, 60, 60))) {
    return NextResponse.json({ error: "Slow down" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  let parts: { html: string; css: string; js: string };
  if (typeof (body as { markdown?: unknown }).markdown === "string") {
    parts = extractCode((body as { markdown: string }).markdown);
  } else if (isSafeSandboxSource(body)) {
    parts = {
      html: typeof body.html === "string" ? body.html : "",
      css: typeof body.css === "string" ? body.css : "",
      js: typeof body.js === "string" ? body.js : "",
    };
  } else {
    return NextResponse.json({ error: "Nothing to run — send some code." }, { status: 400 });
  }

  if (!parts.html.trim() && !parts.js.trim() && !parts.css.trim()) {
    return NextResponse.json({ error: "No code found in that message." }, { status: 400 });
  }

  const document = buildSandboxDocument(parts);
  return NextResponse.json(
    { document, parts, bytes: document.length },
    { headers: { "cache-control": "no-store" } },
  );
}
