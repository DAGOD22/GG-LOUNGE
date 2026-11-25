/**
 * GG-GPT storage: conversations, messages and the long-term memory that lets
 * the assistant remember across chats.
 *
 * Everything is scoped to an account id (`auth_user.id`). A signed-out visitor
 * gets a browser-local conversation list instead, so nothing is lost but
 * nothing is shared between people either.
 */
import { randomUUID } from "node:crypto";
import { getMode, pgQuery } from "./connection";
import { withLocalLock, readLocal } from "./local-store";

export interface GgChat {
  id: string;
  userId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

export interface GgMessage {
  id: string;
  chatId: string;
  userId: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** JSON: attachments, tool results, image/video URLs, search citations. */
  meta: string | null;
  createdAt: string;
}

export interface GgMemory {
  id: string;
  userId: string;
  /** Short, human-readable fact: "Runs a Minecraft server called Blockhaven". */
  fact: string;
  /** Where it came from: chat | profile | manual */
  source: string;
  createdAt: string;
}

async function ensurePgSchema() {
  await pgQuery(`
    CREATE TABLE IF NOT EXISTS "gg_chat" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "title" TEXT NOT NULL DEFAULT 'New chat',
      "archived" BOOLEAN NOT NULL DEFAULT FALSE,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "gg_chat_user_idx" ON "gg_chat" ("userId", "updatedAt" DESC);
    CREATE TABLE IF NOT EXISTS "gg_message" (
      "id" TEXT PRIMARY KEY,
      "chatId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "content" TEXT NOT NULL,
      "meta" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "gg_message_chat_idx" ON "gg_message" ("chatId", "createdAt");
    CREATE TABLE IF NOT EXISTS "gg_memory" (
      "id" TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "fact" TEXT NOT NULL,
      "source" TEXT NOT NULL DEFAULT 'chat',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS "gg_memory_user_idx" ON "gg_memory" ("userId");
  `);
}

/* ------------------------------- chats ------------------------------- */

export async function listChats(userId: string): Promise<GgChat[]> {
  if (getMode() === "postgres") {
    await ensurePgSchema();
    const rows = await pgQuery<Record<string, unknown>>(
      `SELECT * FROM "gg_chat" WHERE "userId"=$1 AND "archived"=FALSE ORDER BY "updatedAt" DESC LIMIT 200`,
      [userId],
    );
    return rows.map(rowToChat);
  }
  const s = (await readLocal()) as unknown as { ggChats?: GgChat[] };
  return (s.ggChats || [])
    .filter(c => c.userId === userId && !c.archived)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 200);
}

export async function createChat(userId: string, title = "New chat"): Promise<GgChat> {
  const chat: GgChat = {
    id: randomUUID(),
    userId,
    title: title.slice(0, 120) || "New chat",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archived: false,
  };
  if (getMode() === "postgres") {
    await ensurePgSchema();
    await pgQuery(
      `INSERT INTO "gg_chat" ("id","userId","title") VALUES ($1,$2,$3)`,
      [chat.id, userId, chat.title],
    );
    return chat;
  }
  await withLocalLock((store: unknown) => {
    const s = store as { ggChats?: GgChat[] };
    s.ggChats = s.ggChats || [];
    s.ggChats.push(chat);
  });
  return chat;
}

export async function renameChat(userId: string, chatId: string, title: string): Promise<void> {
  const clean = title.slice(0, 120);
  if (getMode() === "postgres") {
    await ensurePgSchema();
    await pgQuery(`UPDATE "gg_chat" SET "title"=$1, "updatedAt"=NOW() WHERE "id"=$2 AND "userId"=$3`, [clean, chatId, userId]);
    return;
  }
  await withLocalLock((store: unknown) => {
    const s = store as { ggChats?: GgChat[] };
    const c = (s.ggChats || []).find(x => x.id === chatId && x.userId === userId);
    if (c) { c.title = clean; c.updatedAt = new Date().toISOString(); }
  });
}

export async function deleteChat(userId: string, chatId: string): Promise<void> {
  if (getMode() === "postgres") {
    await ensurePgSchema();
    await pgQuery(`DELETE FROM "gg_message" WHERE "chatId"=$1 AND "userId"=$2`, [chatId, userId]);
    await pgQuery(`DELETE FROM "gg_chat" WHERE "id"=$1 AND "userId"=$2`, [chatId, userId]);
    return;
  }
  await withLocalLock((store: unknown) => {
    const s = store as { ggChats?: GgChat[]; ggMessages?: GgMessage[] };
    s.ggChats = (s.ggChats || []).filter(c => !(c.id === chatId && c.userId === userId));
    s.ggMessages = (s.ggMessages || []).filter(m => !(m.chatId === chatId && m.userId === userId));
  });
}

export async function touchChat(userId: string, chatId: string): Promise<void> {
  if (getMode() === "postgres") {
    await ensurePgSchema();
    await pgQuery(`UPDATE "gg_chat" SET "updatedAt"=NOW() WHERE "id"=$1 AND "userId"=$2`, [chatId, userId]);
    return;
  }
  await withLocalLock((store: unknown) => {
    const s = store as { ggChats?: GgChat[] };
    const c = (s.ggChats || []).find(x => x.id === chatId && x.userId === userId);
    if (c) c.updatedAt = new Date().toISOString();
  });
}

/* ------------------------------ messages ------------------------------ */

export async function listMessages(userId: string, chatId: string, limit = 200): Promise<GgMessage[]> {
  if (getMode() === "postgres") {
    await ensurePgSchema();
    const rows = await pgQuery<Record<string, unknown>>(
      `SELECT * FROM "gg_message" WHERE "chatId"=$1 AND "userId"=$2 ORDER BY "createdAt" ASC LIMIT $3`,
      [chatId, userId, limit],
    );
    return rows.map(rowToMessage);
  }
  const s = (await readLocal()) as unknown as { ggMessages?: GgMessage[] };
  return (s.ggMessages || [])
    .filter(m => m.chatId === chatId && m.userId === userId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(0, limit);
}

export async function addMessage(
  userId: string,
  chatId: string,
  role: GgMessage["role"],
  content: string,
  meta?: unknown,
): Promise<GgMessage> {
  const msg: GgMessage = {
    id: randomUUID(),
    chatId,
    userId,
    role,
    content: content.slice(0, 40000),
    meta: meta === undefined ? null : JSON.stringify(meta),
    createdAt: new Date().toISOString(),
  };
  if (getMode() === "postgres") {
    await ensurePgSchema();
    await pgQuery(
      `INSERT INTO "gg_message" ("id","chatId","userId","role","content","meta") VALUES ($1,$2,$3,$4,$5,$6)`,
      [msg.id, chatId, userId, role, msg.content, msg.meta],
    );
    return msg;
  }
  await withLocalLock((store: unknown) => {
    const s = store as { ggMessages?: GgMessage[] };
    s.ggMessages = s.ggMessages || [];
    s.ggMessages.push(msg);
  });
  return msg;
}

/* ------------------------------- memory ------------------------------- */

export async function listMemories(userId: string): Promise<GgMemory[]> {
  if (getMode() === "postgres") {
    await ensurePgSchema();
    const rows = await pgQuery<Record<string, unknown>>(
      `SELECT * FROM "gg_memory" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 200`,
      [userId],
    );
    return rows.map(rowToMemory);
  }
  const s = (await readLocal()) as unknown as { ggMemory?: GgMemory[] };
  return (s.ggMemory || []).filter(m => m.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addMemory(userId: string, fact: string, source = "chat"): Promise<GgMemory> {
  const clean = fact.trim().slice(0, 300);
  const mem: GgMemory = {
    id: randomUUID(),
    userId,
    fact: clean,
    source,
    createdAt: new Date().toISOString(),
  };
  if (!clean) return mem;
  const existing = await listMemories(userId);
  // Case-insensitive de-dupe so the assistant does not relearn the same thing.
  if (existing.some(m => m.fact.toLowerCase() === clean.toLowerCase())) return mem;
  if (getMode() === "postgres") {
    await ensurePgSchema();
    await pgQuery(
      `INSERT INTO "gg_memory" ("id","userId","fact","source") VALUES ($1,$2,$3,$4)`,
      [mem.id, userId, clean, source],
    );
    return mem;
  }
  await withLocalLock((store: unknown) => {
    const s = store as { ggMemory?: GgMemory[] };
    s.ggMemory = s.ggMemory || [];
    s.ggMemory.push(mem);
  });
  return mem;
}

export async function forgetMemory(userId: string, id: string): Promise<void> {
  if (getMode() === "postgres") {
    await ensurePgSchema();
    await pgQuery(`DELETE FROM "gg_memory" WHERE "id"=$1 AND "userId"=$2`, [id, userId]);
    return;
  }
  await withLocalLock((store: unknown) => {
    const s = store as { ggMemory?: GgMemory[] };
    s.ggMemory = (s.ggMemory || []).filter(m => !(m.id === id && m.userId === userId));
  });
}

/* ------------------------------- helpers ------------------------------ */

function rowToChat(r: Record<string, unknown>): GgChat {
  return {
    id: String(r.id),
    userId: String(r.userId),
    title: String(r.title ?? "New chat"),
    createdAt: new Date(String(r.createdAt)).toISOString(),
    updatedAt: new Date(String(r.updatedAt)).toISOString(),
    archived: Boolean(r.archived),
  };
}

function rowToMessage(r: Record<string, unknown>): GgMessage {
  return {
    id: String(r.id),
    chatId: String(r.chatId),
    userId: String(r.userId),
    role: String(r.role) as GgMessage["role"],
    content: String(r.content ?? ""),
    meta: r.meta == null ? null : String(r.meta),
    createdAt: new Date(String(r.createdAt)).toISOString(),
  };
}

function rowToMemory(r: Record<string, unknown>): GgMemory {
  return {
    id: String(r.id),
    userId: String(r.userId),
    fact: String(r.fact ?? ""),
    source: String(r.source ?? "chat"),
    createdAt: new Date(String(r.createdAt)).toISOString(),
  };
}
