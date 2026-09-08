import { NextResponse, type NextRequest } from "next/server";

/**
 * Ban enforcement + visit logging for page navigations.
 * Only runs on document navigations (sec-fetch-mode == navigate),
 * so game assets / API calls / media streams pass straight through.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    pathname === "/banned" ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const fetchMode = request.headers.get("sec-fetch-mode");
  if (fetchMode && fetchMode !== "navigate") {
    return NextResponse.next();
  }

  try {
    const forwarded = request.headers.get("x-forwarded-for") || "";
    const ip = forwarded.split(",")[0].trim() || "unknown";
    const gate = await fetch(new URL("/api/gate", request.url), {
      headers: {
        "x-gate-ip": ip,
        "x-gate-path": pathname,
        "user-agent": request.headers.get("user-agent") || "",
      },
    });
    if (gate.ok) {
      const data = (await gate.json()) as { banned?: boolean };
      if (data.banned) {
        return NextResponse.rewrite(new URL("/banned", request.url));
      }
    }
  } catch {
    // Fail open: gate errors must not break the lounge.
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/admin", "/request-game", "/games/:path*"],
};
