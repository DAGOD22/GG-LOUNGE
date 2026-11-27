import { NextResponse } from "next/server";
import { isChatverseMember } from "@/lib/chatverse-auth";
import { cleanBody, getRoom, markPresent, postMessage, readMessages, whoIsHere } from "@/lib/db/chat";
import { consumeSharedBudget, callerKey } from "@/lib/live-budget";
import { describeDbError } from "@/lib/db/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Reading and writing messages in one room.
 *
 * `after` is the last id the client holds, so the same endpoint serves the
 * backlog and the tail without a second round trip. Only messages a person
 * typed exist here — there are no seeds, no join notices and no bots, so an
 * empty list genuinely means "nobody has said anything".
 *
 * Both handlers catch their own database failures and answer in JSON. This is
 * not decoration: an unhandled throw here produced an HTML 500, the client's
 * `response.json()` silently failed, and a message that never landed looked
 * exactly like one that had — the worst failure mode a chat can have.
 */
export async function GET(req: Request) {
  if (!(await isChatverseMember())) return NextResponse.json({ error: "Locked" }, { status: 401 });
  const url = new URL(req.url);
  const room = (url.searchParams.get("room") ?? "").slice(0, 40);
  const after = Math.max(0, Number(url.searchParams.get("after") ?? 0) || 0);
  const who = (url.searchParams.get("who") ?? "").slice(0, 24);

  if (!room) return NextResponse.json({ error: "Which room?" }, { status: 400 });

  try {
    if (!(await getRoom(room))) return NextResponse.json({ error: "No such room" }, { status: 404 });

    if (who) await markPresent(room, who).catch(() => {});
    const [messages, here] = await Promise.all([readMessages(room, after), whoIsHere(room)]);
    return NextResponse.json(
      { messages, here },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (cause) {
    const info = describeDbError(cause);
    console.error("[chat:messages]", info.detail);
    return NextResponse.json({ error: info.message, schema: info.schema }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (!(await isChatverseMember())) return NextResponse.json({ error: "Locked" }, { status: 401 });
  if (!(await consumeSharedBudget(`chatverse:send:${callerKey(req)}`, 90, 60))) {
    return NextResponse.json({ error: "Slow down — you are sending very fast." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const room = typeof body?.room === "string" ? body.room.slice(0, 40) : "";
  const author = (typeof body?.author === "string" ? body.author : "Member").slice(0, 24);
  const text = cleanBody(body?.body);
  const media = typeof body?.media === "string" && /^\/api\/chat\/media\/[a-f0-9]{24}$/.test(body.media)
    ? { url: body.media, name: typeof body?.mediaName === "string" ? body.mediaName : "image" }
    : null;

  if (!room) return NextResponse.json({ error: "Which room?" }, { status: 400 });
  if (!text && !media) return NextResponse.json({ error: "Nothing to send." }, { status: 400 });

  try {
    if (!(await getRoom(room))) return NextResponse.json({ error: "No such room" }, { status: 404 });

    const saved = await postMessage(room, author, text, media);
    if (!saved) return NextResponse.json({ error: "Nothing to send." }, { status: 400 });
    return NextResponse.json({ message: saved });
  } catch (cause) {
    const info = describeDbError(cause);
    console.error("[chat:messages]", info.detail);
    return NextResponse.json({ error: info.message, schema: info.schema }, { status: 503 });
  }
}
