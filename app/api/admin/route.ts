import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { ADMIN_COOKIE, adminPassword, adminSignature, isAdmin, isDev } from "@/lib/auth";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  addBan,
  deleteGame,
  deleteRequest,
  getMode,
  listBans,
  listGames,
  listRequests,
  publishFromRequest,
  recentVisits,
  removeBan,
  setRequestStatus,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

/** Password attempts allowed per address before the endpoint locks it out. */
const LOGIN_ATTEMPTS = 8;
const LOGIN_WINDOW_MS = 10 * 60_000;

/**
 * Constant-time password check. The previous `!==` leaked the length of the
 * shared prefix through timing, and this endpoint had no attempt limit at all,
 * so the admin password was the only thing between a stranger and the console.
 * Both sides are hashed to a fixed length first so lengths never matter.
 */
function passwordMatches(candidate: string, expected: string): boolean {
  // Both sides digest to 32 bytes, so comparison length never depends on input.
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function dbError(err: unknown) {
  console.error("[admin]", err);
  return NextResponse.json(
    {
      error: "Database error",
      detail:
        getMode() === "postgres"
          ? "Postgres query failed. Check DATABASE_URL and table access."
          : "Local store write failed.",
    },
    { status: 500 },
  );
}

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [bans, requests, games, visits] = await Promise.all([
      listBans(),
      listRequests(),
      listGames(),
      recentVisits(60),
    ]);
    return NextResponse.json({ bans, requests, games, visits, mode: getMode() });
  } catch (err) {
    return dbError(err);
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));

  if (body.action === "login") {
    const ip = getClientIp(request);
    const attempts = rateLimit(`admin:login:${ip}`, LOGIN_ATTEMPTS, LOGIN_WINDOW_MS);
    if (!attempts.ok) {
      const retryAfter = Math.max(1, Math.ceil((attempts.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: `Too many attempts. Try again in ${Math.ceil(retryAfter / 60)} minutes.` },
        {
          status: 429,
          headers: { ...rateLimitResponse(LOGIN_ATTEMPTS, attempts.remaining, attempts.resetAt), "retry-after": String(retryAfter) },
        },
      );
    }
    if (typeof body.password !== "string" || !passwordMatches(body.password.trim(), adminPassword())) {
      return NextResponse.json(
        { error: "Incorrect admin password.", attemptsRemaining: attempts.remaining },
        { status: 401, headers: rateLimitResponse(LOGIN_ATTEMPTS, attempts.remaining, attempts.resetAt) },
      );
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, adminSignature(), {
      httpOnly: true,
      secure: !isDev(),
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });
    return response;
  }

  if (body.action === "logout") {
    const response = NextResponse.json({ ok: true });
    response.cookies.set(ADMIN_COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  }

  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const action = clean(body.action, 30);

    if (action === "ban" || action === "kick") {
      const identifier = clean(body.identifier, 160);
      if (!identifier) return NextResponse.json({ error: "Identifier required" }, { status: 400 });
      const minutes = action === "kick" ? Math.min(Math.max(Number(body.minutes) || 15, 1), 1440) : 0;
      await addBan(
        identifier,
        clean(body.reason, 500) || (action === "kick" ? "Kicked by admin" : null),
        action === "kick" ? new Date(Date.now() + minutes * 60_000) : null,
      );
      return NextResponse.json({ ok: true });
    }

    if (action === "publish") {
      const id = clean(body.id, 80);
      const game = await publishFromRequest(id);
      if (!game) return NextResponse.json({ error: "Request not found" }, { status: 404 });
      await setRequestStatus(id, "approved");
      return NextResponse.json({ ok: true, gameId: game.id });
    }

    if (action === "deny") {
      await setRequestStatus(clean(body.id, 80), "denied");
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    return dbError(err);
  }
}

export async function DELETE(request: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await request.json().catch(() => ({}));
    const type = clean(body.type, 20);
    const id = clean(body.id, 80);
    if (type === "ban") await removeBan(id);
    else if (type === "game") await deleteGame(id);
    else if (type === "request") await deleteRequest(id);
    else return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return dbError(err);
  }
}
