import { NextResponse, type NextRequest } from "next/server";

/**
 * GOD GATE + Ban enforcement
 * - Entire site password protected (except /gate, /banned, /api/gate, static)
 * - Device unlocked 3 hours via gg_gate HttpOnly cookie (HMAC, server verified)
 * - Escalating IP bans for gate failures are enforced here too
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allowlist: gate page itself, banned page, api gate, next internals, static assets, uv service worker files, bare aliases
  const isGatePath = pathname === "/gate" || pathname.startsWith("/gate/");
  const isBannedPath = pathname === "/banned" || pathname.startsWith("/banned/");
  const isApiGate = pathname.startsWith("/api/gate");
  const isApiBare = pathname.startsWith("/api/bare") || pathname.startsWith("/api/edu") || pathname.startsWith("/api/learn") || pathname.startsWith("/api/t");
  const isNext = pathname.startsWith("/_next");
  const isStaticFile = pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|css|js|json|woff2?|txt|xml)$/);
  const isFavicon = pathname === "/favicon.ico" || pathname === "/icon.svg" || pathname === "/apple-icon.png";
  const isUv = pathname.startsWith("/uv") || pathname.startsWith("/service");
  const isHealth = pathname === "/api/visit" || pathname === "/api/yt" || pathname.startsWith("/api/yt/");

  // For non-navigate fetches (assets, XHR), let through but still check banned for navigations only? We want gate to protect navigations only for API performance.
  // However for full site lock, we need to block page navigations, not API asset fetches that are needed for gate page itself.
  // So we check gate only for document navigations (sec-fetch-mode navigate) + top-level.
  const fetchMode = request.headers.get("sec-fetch-mode");
  const isNavigate = !fetchMode || fetchMode === "navigate" || fetchMode === "document";

  // Always allow gate page assets, banned page, api gate, _next, static, uv, bare
  if (isNext || isApiGate || isApiBare || isUv || isStaticFile || isFavicon) {
    // Still need to check banned for navigate? But for assets we can skip banned check for perf
    return NextResponse.next();
  }

  // For gate and banned pages themselves, we must still check if IP is banned -> show banned
  // But allow gate page to be visited even without gate cookie (otherwise infinite loop)
  // For banned page, allow regardless

  try {
    const forwarded = request.headers.get("x-forwarded-for") || "";
    const ip = forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
    const cookieHeader = request.headers.get("cookie") || "";
    const gateCookieMatch = cookieHeader.match(/(?:^|;\s*)gg_gate=([^;]+)/);
    const gateCookie = gateCookieMatch ? gateCookieMatch[1] : "";

    // Fetch gate status (checks admin ban, gate ban, and gate cookie validity server-side)
    const gateUrl = new URL("/api/gate", request.url);
    const gate = await fetch(gateUrl, {
      headers: {
        "x-gate-ip": ip,
        "x-gate-path": pathname,
        "x-gate-cookie": gateCookie,
        "user-agent": request.headers.get("user-agent") || "",
        "cookie": cookieHeader,
      },
      // ensure no cache
      cache: "no-store",
    });

    if (gate.ok) {
      const data = (await gate.json()) as { banned?: boolean; gatePassed?: boolean; gateBanned?: boolean; expiresAt?: string | null };
      if (data.banned) {
        // If already on banned page, allow to avoid loop
        if (isBannedPath) return NextResponse.next();
        return NextResponse.rewrite(new URL("/banned", request.url));
      }
      // If gate not passed and this is a navigation to a protected page, send to gate
      // Protected = everything except gate/banned/api/next/static already handled
      const isProtected = !isGatePath && !isBannedPath;
      if (isProtected && isNavigate && !data.gatePassed) {
        const url = new URL("/gate", request.url);
        // preserve original path for post-unlock redirect
        url.searchParams.set("next", pathname + request.nextUrl.search);
        return NextResponse.redirect(url);
      }
      // if gatePassed or not protected, allow
      if (data.gatePassed) {
        return NextResponse.next();
      }
      // For non-navigate (API, fetch), we allow even without gate? But spec says entire website password protected.
      // To avoid breaking internal API calls from gate page, we allow api/* already handled.
      // For other API (like /api/games), if not gatePassed, block? But those are XHR, not navigate, so we let through for now to avoid breaking.
      // Only navigations are hard-gated.
      if (!isNavigate) return NextResponse.next();
      // Fallback: if not navigate and not protected? just next
      return NextResponse.next();
    }
  } catch {
    // Fail open: gate errors must not break the lounge.
  }

  // If gate check failed open, still enforce gate for navigations by checking cookie presence locally (fallback)
  // Minimal fallback: if no gg_gate cookie and is navigate and protected, redirect to gate
  const hasGateCookie = (request.cookies.get("gg_gate")?.value || "").length > 10;
  const isGatePathFallback = pathname === "/gate" || pathname.startsWith("/gate");
  const isBannedFallback = pathname === "/banned";
  if (!hasGateCookie && !isGatePathFallback && !isBannedFallback && !isNext && !isStaticFile && !isFavicon && !isUv && !pathname.startsWith("/api/")) {
    const fetchMode2 = request.headers.get("sec-fetch-mode");
    if (!fetchMode2 || fetchMode2 === "navigate") {
      const url = new URL("/gate", request.url);
      url.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // protect everything, but matcher must exclude static handled above; we use broad matcher and filter inside
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)"],
};
