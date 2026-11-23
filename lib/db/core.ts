/**
 * Shared database types, limits and helpers.
 *
 * Imported by every other module in this folder; it must not import them back.
 */
export type DbMode = "postgres" | "local";

export interface Ban {
  id: string;
  identifier: string;
  reason: string | null;
  createdAt: string;
  expiresAt: string | null;
}
export interface Visit {
  id: string;
  ip: string;
  ua: string;
  path: string;
  createdAt: string;
  userId?: string | null;
}
export interface GameRequest {
  id: string;
  title: string;
  icon: string | null;
  html?: string;
  status: string;
  createdAt: string;
  votes?: number;
}
export interface Report {
  id: string;
  gameId: string;
  title: string;
  createdAt: string;
}
export interface PublishedGame {
  id: string;
  title: string;
  icon: string | null;
  html?: string;
  createdAt: string;
}

export const MAX_HTML_BYTES = 50 * 1024 * 1024; // 50MB per game (chunked upload)
export const MAX_CHUNK_BYTES = 1024 * 1024; // 1MB per request (serverless limits)
export const MAX_ICON_BYTES = 300 * 1024; // 300KB favicon (data URL)

// ---- Auth hardening ----
// ---- Fix 2: auth hardening helpers ----
const COMMON_PASSWORDS = new Set(['password','123456','qwerty','letmein','admin','aaaa','abcd','1234','password1','qwerty123','12345678','111111','123123','abc123','password123','letmein123','welcome','monkey','dragon','master','football','iloveyou','admin123','gg-lounge','gg lounge'])
export function isStrongPassword(pw: string): string | null {
  if (pw.length < 8 || pw.length > 64) return 'Password must be 8-64 characters'
  if (pw.length < 12 && !/(?=.*[a-z])(?=.*[A-Z])|(?=.*\d)(?=.*[a-zA-Z])/.test(pw)) return 'Use 8+ chars with mix of cases or letters+numbers'
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) return 'Password too common — choose another'
  if (/^([a-zA-Z0-9])\1{3,}$/.test(pw)) return 'Password too simple'
  if (/(.)\1{4,}/.test(pw)) return 'Too many repeated characters'
  // block username-like passwords will be checked in createAuthUser
  return null
}
const rateMap = new Map<string, { count:number, reset:number }>()
export function checkRateLimit(key:string, max=5, windowMs=15*60*1000): boolean {
  const now = Date.now()
  const e = rateMap.get(key)
  if (!e || now > e.reset) { rateMap.set(key, { count: 1, reset: now + windowMs }); return true }
  if (e.count >= max) return false
  e.count++
  return true
}
export function getRateLimitRemaining(key:string, max=5): number {
  const e = rateMap.get(key)
  if (!e) return max
  if (Date.now() > e.reset) return max
  return Math.max(0, max - e.count)
}

// ---- Row shapes shared across the storage modules ----
export interface UserAchievement {
  userId: string;
  gameId: string;
  achievementId: string;
  progress: number;
  unlocked: boolean;
  unlockedAt: string | null;
  updatedAt: string;
}

export interface UserGameStats {
  userId: string;
  gameId: string;
  plays: number;
  timeSeconds: number;
  lastPlayedAt: string | null;
  updatedAt: string;
}

export interface UserState { id: string; favorites: string[]; playCounts: Record<string, number>; recentlyPlayed?: string[]; updatedAt: string }
export interface AuthUser { id: string; username: string; usernameLower: string; passwordHash: string; favoriteFoodHash: string; favoriteFoodNorm: string; createdAt: string }
export interface AuthSession { token: string; userId: string; createdAt: string; expiresAt: string }
export interface GameSave { userId: string; gameId: string; data: string; updatedAt: string }
