/**
 * Chunked HTML upload assembly for the game-request and admin publish flows.
 *
 * The endpoint that writes here is public (anyone may request a game), so the
 * store cannot trust it to be well behaved: an upload id is attacker-chosen and
 * a chunk write is unbounded in aggregate until something stops it. Three
 * guards live here rather than in the route, because the route cannot see how
 * much a given id has already stored:
 *
 *   · per-upload ceiling  — an upload may not exceed MAX_UPLOAD_BYTES in total.
 *     Reaching it aborts the upload and deletes its pieces, so a client cannot
 *     "fill the disk a megabyte at a time" under one id.
 *   · open-upload quota   — only UPLOAD_QUOTA unfinished uploads may exist at
 *     once. Without it, an attacker picks a fresh id per megabyte and the
 *     per-upload ceiling never applies.
 *   · age reaper          — anything older than UPLOAD_TTL_MS is deleted. This
 *     is what stops the quota from deadlocking the feature after a burst: the
 *     abandoned uploads expire instead of blocking new legitimate ones.
 *
 * The reaper runs opportunistically on write rather than on a timer, because a
 * serverless instance has no long-lived process to host an interval.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { getMode, pgQuery } from "./connection";
import { getLocalDir } from "./local-store";

/* ---------------- Chunked uploads ---------------- */

/** Largest HTML any upload may assemble to. Comfortably above the biggest game. */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** How long an unfinished upload survives before the reaper takes it. */
export const UPLOAD_TTL_MS = 60 * 60 * 1000;
/** How many unfinished uploads may exist at once. */
export const UPLOAD_QUOTA = 250;

export type ChunkResult = "ok" | "too-large" | "busy";

function uploadDir(root: string, uploadId: string): string {
  return path.join(root, "uploads", uploadId);
}

/** Delete uploads whose newest piece is older than the TTL. */
export async function reapUploads(): Promise<number> {
  const cutoff = Date.now() - UPLOAD_TTL_MS;
  let removed = 0;

  if (getMode() === "postgres") {
    const rows = await pgQuery<{ upload_id: string }>(
      'SELECT "upload_id" FROM "upload_parts" GROUP BY "upload_id" HAVING MAX("createdAt") < $1',
      [new Date(cutoff)],
    ).catch(() => [] as { upload_id: string }[]);
    for (const row of rows) {
      await pgQuery('DELETE FROM "upload_parts" WHERE "upload_id"=$1', [row.upload_id]).catch(() => {});
      removed++;
    }
    return removed;
  }

  const root = path.join(await getLocalDir(), "uploads");
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const dir = path.join(root, entry);
    try {
      const stat = await fs.stat(dir);
      // Directory mtime updates when a child is written, so this is "last chunk".
      if (stat.mtimeMs >= cutoff) continue;
      await fs.rm(dir, { recursive: true, force: true });
      removed++;
    } catch {
      // Entry vanished mid-scan; nothing to do.
    }
  }
  return removed;
}

/** How many uploads are currently unfinished, and how big this one is. */
async function uploadUsage(uploadId: string): Promise<{ open: number; bytes: number; totalBytes: number }> {
  if (getMode() === "postgres") {
    const rows = await pgQuery<{ upload_id: string; bytes: string }>(
      'SELECT "upload_id", COALESCE(SUM(LENGTH("chunk")),0)::text AS bytes FROM "upload_parts" GROUP BY "upload_id"',
      [],
    );
    let open = 0;
    let bytes = 0;
    let totalBytes = 0;
    for (const row of rows) {
      open++;
      const size = Number(row.bytes) || 0;
      totalBytes += size;
      if (row.upload_id === uploadId) bytes = size;
    }
    return { open, bytes, totalBytes };
  }

  const root = path.join(await getLocalDir(), "uploads");
  let open = 0;
  let bytes = 0;
  let totalBytes = 0;
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return { open: 0, bytes: 0, totalBytes: 0 };
  }
  for (const entry of entries) {
    const dir = path.join(root, entry);
    let size = 0;
    try {
      for (const file of await fs.readdir(dir)) {
        const stat = await fs.stat(path.join(dir, file)).catch(() => null);
        size += stat?.size ?? 0;
      }
    } catch {
      continue;
    }
    open++;
    totalBytes += size;
    if (entry === uploadId) bytes = size;
  }
  return { open, bytes, totalBytes };
}

/** A snapshot of upload storage, for /api/health. */
export async function uploadStats(): Promise<{ open: number; bytes: number; quota: number; maxBytes: number; ttlMs: number }> {
  const usage = await uploadUsage("").catch(() => ({ open: -1, bytes: -1, totalBytes: -1 }));
  if (getMode() === "postgres") {
    const totals = await pgQuery<{ bytes: string }>(
      'SELECT COALESCE(SUM(LENGTH("chunk")),0)::text AS bytes FROM "upload_parts"',
      [],
    ).catch(() => [] as { bytes: string }[]);
    return {
      open: usage.open,
      bytes: Number(totals[0]?.bytes) || 0,
      quota: UPLOAD_QUOTA,
      maxBytes: MAX_UPLOAD_BYTES,
      ttlMs: UPLOAD_TTL_MS,
    };
  }
  return { open: usage.open, bytes: usage.totalBytes, quota: UPLOAD_QUOTA, maxBytes: MAX_UPLOAD_BYTES, ttlMs: UPLOAD_TTL_MS };
}

/**
 * Store one piece. Returns `too-large` when this write would push the upload
 * past MAX_UPLOAD_BYTES (the upload is then dropped so the space is reclaimed
 * immediately) and `busy` when the quota is full of *other* uploads.
 */
export async function putChunk(uploadId: string, idx: number, chunk: string): Promise<ChunkResult> {
  await reapUploads();
  const { open, bytes } = await uploadUsage(uploadId);
  if (bytes + chunk.length > MAX_UPLOAD_BYTES) {
    await dropUpload(uploadId);
    return "too-large";
  }
  if (open >= UPLOAD_QUOTA) {
    await dropUpload(uploadId);
    return "busy";
  }

  if (getMode() === "postgres") {
    await pgQuery(
      'INSERT INTO "upload_parts" ("upload_id","idx","chunk") VALUES ($1,$2,$3) ON CONFLICT ("upload_id","idx") DO UPDATE SET "chunk"=EXCLUDED."chunk"',
      [uploadId, idx, chunk],
    );
    return "ok";
  }
  const dir = await getLocalDir();
  const upDir = uploadDir(dir, uploadId);
  await fs.mkdir(upDir, { recursive: true });
  await fs.writeFile(path.join(upDir, `${idx}.txt`), chunk, "utf8");
  return "ok";
}

export async function assembleUpload(uploadId: string, total: number): Promise<string | null> {
  if (getMode() === "postgres") {
    const rows = await pgQuery<{ idx: number; chunk: string }>(
      'SELECT "idx","chunk" FROM "upload_parts" WHERE "upload_id"=$1 ORDER BY "idx" ASC',
      [uploadId],
    );
    if (rows.length !== total) return null;
    for (let i = 0; i < total; i++) {
      if (rows[i].idx !== i) return null;
    }
    if (rows.reduce((sum, row) => sum + row.chunk.length, 0) > MAX_UPLOAD_BYTES) return null;
    return rows.map((r) => r.chunk).join("");
  }
  const dir = await getLocalDir();
  const parts: string[] = [];
  let bytes = 0;
  for (let i = 0; i < total; i++) {
    try {
      const piece = await fs.readFile(path.join(uploadDir(dir, uploadId), `${i}.txt`), "utf8");
      bytes += piece.length;
      if (bytes > MAX_UPLOAD_BYTES) return null;
      parts.push(piece);
    } catch {
      return null;
    }
  }
  return parts.join("");
}

export async function dropUpload(uploadId: string): Promise<void> {
  try {
    if (getMode() === "postgres") {
      await pgQuery('DELETE FROM "upload_parts" WHERE "upload_id"=$1', [uploadId]);
      return;
    }
    const dir = await getLocalDir();
    await fs.rm(uploadDir(dir, uploadId), { recursive: true, force: true });
  } catch {
    // best effort
  }
}
