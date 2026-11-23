/** Chunked HTML upload assembly for the admin publish flow. */
import { promises as fs } from "node:fs";
import path from "node:path";
import { getMode, pgQuery } from "./connection";
import { getLocalDir } from "./local-store";

/* ---------------- Chunked uploads ---------------- */

export async function putChunk(uploadId: string, idx: number, chunk: string): Promise<void> {
  if (getMode() === "postgres") {
    await pgQuery(
      'INSERT INTO "upload_parts" ("upload_id","idx","chunk") VALUES ($1,$2,$3) ON CONFLICT ("upload_id","idx") DO UPDATE SET "chunk"=EXCLUDED."chunk"',
      [uploadId, idx, chunk],
    );
    return;
  }
  const dir = await getLocalDir();
  const upDir = path.join(dir, "uploads", uploadId);
  await fs.mkdir(upDir, { recursive: true });
  await fs.writeFile(path.join(upDir, `${idx}.txt`), chunk, "utf8");
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
    return rows.map((r) => r.chunk).join("");
  }
  const dir = await getLocalDir();
  const parts: string[] = [];
  for (let i = 0; i < total; i++) {
    try {
      parts.push(await fs.readFile(path.join(dir, "uploads", uploadId, `${i}.txt`), "utf8"));
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
    await fs.rm(path.join(dir, "uploads", uploadId), { recursive: true, force: true });
  } catch {
    // best effort
  }
}
