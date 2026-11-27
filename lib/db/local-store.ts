/**
 * Local JSON fallback used when no DATABASE_URL is configured (dev, self-host).
 * Writes are serialised and atomic, and every read-modify-write goes through
 * withLocalLock so two requests cannot clobber each other's changes.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  Ban,
  Visit,
  GameRequest,
  Report,
  PublishedGame,
  UserAchievement,
  UserGameStats,
  UserState,
  AuthUser,
  AuthSession,
  GameSave,
} from "./core";
import type { GgChat, GgMessage, GgMemory } from "./gg-gpt";
import { isEphemeralHost } from "./connection";

/**
 * All writes to the JSON file are chained through this promise so a read-modify
 * -write cannot interleave with another one and lose an update.
 */
let writeQueue: Promise<void> = Promise.resolve();

/* ---------------- Local JSON fallback ---------------- */

interface LocalStore {
  bans: Ban[];
  visits: Visit[];
  requests: GameRequest[];
  games: PublishedGame[];
  reports: Report[];
  userStates: Record<string, UserState>;
  users: AuthUser[];
  sessions: AuthSession[];
  saves: GameSave[];
  achievements: UserAchievement[];
  gameStats: UserGameStats[];
  gateStates: Record<string, { ip: string; fails: number; banLevel: number; bannedUntil: string | null; updatedAt: string }>;
  /** GG-GPT conversations, messages and remembered facts. */
  ggChats: GgChat[];
  ggMessages: GgMessage[];
  ggMemory: GgMemory[];
  /** Notifications queued for a member (e.g. a game request was published). */
  notifications: Array<{ id: string; userId: string; title: string; body: string; href?: string; read: boolean; createdAt: string }>;
  /**
   * Live presence, declared as `unknown` on purpose: this module must not import
   * the presence/coop row types, because those import this one. The owners of
   * these slices read and write them through their own typed accessors; the
   * store only has to stop erasing them between writes.
   */
  presence?: unknown;
  events?: unknown;
  coopRooms?: unknown;
  /**
   * The co-op relay queue. Declared here like every other slice: a store object
   * rebuilt without this key erases the queue on the next unrelated write,
   * which is exactly what made the relay look like it accepted messages and
   * then silently forget them.
   */
  coopRelay?: unknown;
  /** CHATVERSE: rooms, messages, presence and uploaded images. Same reason as
   *  above — kept as `unknown` slices so this module stays dependency-free. */
  chatRooms?: unknown;
  chatMessages?: unknown;
  chatPresence?: unknown;
  chatMedia?: unknown;
  /** The real visitor counter: one entry per anonymous visitor id, plus the
   *  site-wide hit total. Same reason as every slice above — readLocal
   *  rebuilds the store from this key list, so a missing key here would wipe
   *  the count on the next unrelated write. */
  siteVisitors?: unknown;
  siteHits?: unknown;
}

let localDir: string | null = null;
export async function getLocalDir(): Promise<string> {
  if (localDir) return localDir;
  // On a serverless host the filesystem is ephemeral and mostly read-only, so
  // writing "accounts" there would lose them. Fail loudly instead of pretending.
  if (isEphemeralHost()) {
    throw new Error(
      "Accounts need the Postgres database. Set DATABASE_URL (or connect the Neon/Vercel Postgres integration) and redeploy.",
    );
  }
  const candidates = [
    process.env.DATA_DIR,
    path.join(process.cwd(), ".data"),
    "/tmp/gg-lounge",
  ].filter(Boolean) as string[];
  for (const dir of candidates) {
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.access(dir);
      localDir = dir;
      return dir;
    } catch {
      // try next
    }
  }
  throw new Error("No writable data directory");
}

export async function readLocal(): Promise<LocalStore> {
  const dir = await getLocalDir();
  try {
    const raw = await fs.readFile(path.join(dir, "lounge.json"), "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalStore>;
    return {
      bans: parsed.bans ?? [],
      visits: parsed.visits ?? [],
      requests: parsed.requests ?? [],
      games: parsed.games ?? [],
      reports: (parsed as any).reports ?? [],
      userStates: (parsed as any).userStates ?? {},
      users: (parsed as any).users ?? [],
      sessions: (parsed as any).sessions ?? [],
      saves: (parsed as any).saves ?? [],
      achievements: (parsed as any).achievements ?? [],
      gameStats: (parsed as any).gameStats ?? [],
      gateStates: (parsed as any).gateStates ?? {},
      ggChats: (parsed as any).ggChats ?? [],
      ggMessages: (parsed as any).ggMessages ?? [],
      ggMemory: (parsed as any).ggMemory ?? [],
      notifications: (parsed as any).notifications ?? [],
      presence: (parsed as any).presence,
      events: (parsed as any).events,
      coopRooms: (parsed as any).coopRooms,
      coopRelay: (parsed as any).coopRelay,
      chatRooms: (parsed as any).chatRooms,
      chatMessages: (parsed as any).chatMessages,
      chatPresence: (parsed as any).chatPresence,
      chatMedia: (parsed as any).chatMedia,
      siteVisitors: (parsed as any).siteVisitors,
      siteHits: (parsed as any).siteHits,
    };
  } catch {
    return { bans: [], visits: [], requests: [], games: [], reports: [], userStates: {}, users: [], sessions: [], saves: [], achievements: [], gameStats: [], gateStates: {}, ggChats: [], ggMessages: [], ggMemory: [], notifications: [] };
  }
}

async function writeLocalRaw(store: LocalStore): Promise<void> {
  const dir = await getLocalDir();
  // atomic: write tmp then rename
  const tmp = path.join(dir, "lounge.json.tmp");
  await fs.writeFile(tmp, JSON.stringify(store));
  await fs.rename(tmp, path.join(dir, "lounge.json"));
}
export async function writeLocal(store: LocalStore): Promise<void> {
  const task = writeQueue.then(() => writeLocalRaw(store));
  // keep queue alive even if one fails
  writeQueue = task.catch(() => {});
  return task;
}
// Fix 7: serialize read-modify-write for local JSON to prevent lost updates
export async function withLocalLock<T>(fn: (store: LocalStore) => Promise<T> | T): Promise<T> {
  let result!: T
  const task = writeQueue.then(async () => {
    const store = await readLocal();
    result = await fn(store);
    await writeLocalRaw(store);
  });
  writeQueue = task.catch(() => {});
  await task;
  return result;
}