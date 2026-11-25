import { NextResponse } from "next/server";
import { isChatverseMember } from "@/lib/chatverse-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * The long poll.
 *
 * Realtime without a WebSocket, because a serverless function cannot hold one
 * open. The shape:
 *
 *   · the client sends the last id it holds;
 *   · if there is nothing newer, this waits up to `WAIT_MS`, checking every
 *     `STEP_MS`, then returns an empty list and the client asks again;
 *   · the moment something exists it returns immediately.
 *
 * Waiting on the *database* rather than on a socket is what makes this work on
 * Vercel and also what makes it honest: if the write never landed, the poll
 * cannot pretend a message arrived. `after=0` short-circuits, so the initial
 * backlog load is never delayed.
 */
const STEP_MS = 700;
const WAIT_MS = 12_000;

export async function GET(req: Request) {
  if (!(await isChatverseMember())) return NextResponse.json({ error: "Locked" }, { status: 401 });

  const url = new URL(req.url);
  const room = (url.searchParams.get("room") ?? "").slice(0, 40);
  const after = Math.max(0, Number(url.searchParams.get("after") ?? 0) || 0);
  if (!room) return NextResponse.json({ error: "Which room?" }, { status: 400 });

  const { latestId, readMessages } = await import("@/lib/db/chat");
  const deadline = Date.now() + WAIT_MS;

  // Ask once before the loop so "nothing new" costs one query, not two.
  let head = await latestId(room);
  while (head <= after && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, STEP_MS));
    head = await latestId(room);
  }
  if (head <= after) return NextResponse.json({ messages: [], head }, { headers: { "cache-control": "no-store" } });

  const messages = await readMessages(room, after);
  return NextResponse.json({ messages, head }, { headers: { "cache-control": "no-store" } });
}
