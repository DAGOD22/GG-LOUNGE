import { NextResponse } from "next/server";
import { isChatverseMember } from "@/lib/chatverse-auth";
import { createRoom, deleteRoom, listRooms, getRoom } from "@/lib/db/chat";
import { cleanRoomName } from "@/lib/db/chat";
import { consumeSharedBudget, callerKey } from "@/lib/live-budget";
import { describeDbError } from "@/lib/db/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Rooms: list, create, delete.
 *
 * Gated on the CHATVERSE cookie, not on the site admin session — see
 * lib/chatverse-auth. A non-member gets a 401 with no body content, so the room
 * names are not discoverable by probing.
 *
 * Both handlers answer database failures in JSON with a sentence a person can
 * act on. The list route is the one that mattered: an unhandled throw rendered
 * an HTML 500, the client fell back to "no rooms", and every room a person had
 * made appeared to have vanished — which reads exactly like "nothing saves".
 */
export async function GET() {
  if (!(await isChatverseMember())) return NextResponse.json({ error: "Locked" }, { status: 401 });
  try {
    return NextResponse.json({ rooms: await listRooms() }, { headers: { "cache-control": "no-store" } });
  } catch (cause) {
    const info = describeDbError(cause);
    console.error("[chat:rooms]", info.detail);
    return NextResponse.json({ error: info.message, schema: info.schema }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (!(await isChatverseMember())) return NextResponse.json({ error: "Locked" }, { status: 401 });
  if (!(await consumeSharedBudget(`chatverse:rooms:${callerKey(req)}`, 20, 60))) {
    return NextResponse.json({ error: "Slow down" }, { status: 429 });
  }
  const body = await req.json().catch(() => ({}));
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "create") {
    const name = cleanRoomName(body?.name);
    if (!name) return NextResponse.json({ error: "Give the room a name." }, { status: 400 });
    const topic = typeof body?.topic === "string" ? body.topic.slice(0, 120) : "";
    try {
      const room = await createRoom(name, topic, typeof body?.by === "string" ? body.by : "Member");
      if (!room) return NextResponse.json({ error: "Could not create that room." }, { status: 400 });
      return NextResponse.json({ room });
    } catch (cause) {
      const info = describeDbError(cause);
      console.error("[chat:rooms]", info.detail);
      return NextResponse.json({ error: info.message, schema: info.schema }, { status: 503 });
    }
  }

  if (action === "delete") {
    const id = typeof body?.id === "string" ? body.id.slice(0, 40) : "";
    if (!id) return NextResponse.json({ error: "Which room?" }, { status: 400 });
    try {
      const room = await getRoom(id);
      if (!room) return NextResponse.json({ ok: true });
      await deleteRoom(id);
      return NextResponse.json({ ok: true });
    } catch (cause) {
      const info = describeDbError(cause);
      console.error("[chat:rooms]", info.detail);
      return NextResponse.json({ error: info.message, schema: info.schema }, { status: 503 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
