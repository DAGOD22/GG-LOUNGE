"use client";

/**
 * Chunked game-HTML uploader (client side).
 * Splits big index.html files into 1MB pieces so uploads survive
 * serverless request-size limits (e.g. Vercel's ~4.5MB cap).
 */

export interface UploadMeta {
  kind: "request" | "publish";
  title: string;
  icon: string | null;
  total: number;
}

export async function uploadGameHtml(
  file: File,
  meta: { kind: "request" | "publish"; title: string; icon: string | null },
  onProgress: (done: number, total: number) => void,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const CHUNK = 900 * 1024; // stay safely under per-request limits
  const text = await file.text();
  const total = Math.max(1, Math.ceil(text.length / CHUNK));
  const uploadId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  try {
    for (let i = 0; i < total; i++) {
      const piece = text.slice(i * CHUNK, (i + 1) * CHUNK);
      const r = await fetch("/api/uploads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ op: "chunk", uploadId, idx: i, chunk: piece }),
      });
      if (!r.ok) {
        const detail = await r.json().catch(() => ({}));
        throw new Error(detail.error || `Chunk ${i + 1}/${total} failed`);
      }
      onProgress(i + 1, total);
    }
    const done = await fetch("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "done",
        uploadId,
        total,
        kind: meta.kind,
        title: meta.title,
        icon: meta.icon,
      }),
    });
    const data = await done.json().catch(() => ({}));
    if (!done.ok) throw new Error(data.error || "Upload failed");
    return { ok: true, id: data.id };
  } catch (err) {
    fetch("/api/uploads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "abort", uploadId }),
    }).catch(() => {});
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed" };
  }
}

export function readFileAsDataUrl(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error(`Icon is too large (${Math.round(file.size / 1024)}KB, 300KB max).`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Couldn't read icon file."));
    reader.readAsDataURL(file);
  });
}
