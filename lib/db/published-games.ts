/** Request administration, publishing, and the published-game catalog. */
import { randomUUID } from "node:crypto";
import { getMode, pgQuery } from "./connection";
import { withLocalLock, readLocal } from "./local-store";
import { mergeDuplicateRequests } from "../game-identity";
import type { GameRequest, PublishedGame } from "./core";

async function listRawRequests(): Promise<GameRequest[]> {
  if (getMode() === "postgres") {
    try{
      return await pgQuery<GameRequest>(
        'SELECT "id","title","icon","status","createdAt",COALESCE("votes",1) as "votes" FROM "game_request" ORDER BY COALESCE("votes",0) DESC, "createdAt" DESC',
      );
    }catch{
      return pgQuery<GameRequest>('SELECT "id","title","icon","status","createdAt" FROM "game_request" ORDER BY "createdAt" DESC').then(rs=> rs.map(r=> ({...r, votes:1})));
    }
  }
  const s = await readLocal();
  return s.requests
    .map(({ html: _html, ...rest }) => ({...rest, votes: (rest as any).votes||1}))
    .sort((a, b) => ((b as any).votes||0) - ((a as any).votes||0) || (a.createdAt < b.createdAt ? 1 : -1));
}

export async function listRequests(): Promise<GameRequest[]> {
  return mergeDuplicateRequests(await listRawRequests());
}

export async function getRequest(id: string): Promise<GameRequest | null> {
  if (getMode() === "postgres") {
    const rows = await pgQuery<GameRequest>(
      'SELECT "id","title","icon","html","status","createdAt" FROM "game_request" WHERE "id"=$1',
      [id],
    );
    return rows[0] ?? null;
  }
  const s = await readLocal();
  return s.requests.find((r) => r.id === id) ?? null;
}

export async function setRequestStatus(id: string, status: string): Promise<void> {
  if (getMode() === "postgres") {
    await pgQuery('UPDATE "game_request" SET "status"=$2 WHERE "id"=$1', [id, status]);
    return;
  }
  await withLocalLock(async (s) => {
    const r = s.requests.find((x) => x.id === id);
    if (r) r.status = status;
  });
}

export async function deleteRequest(id: string): Promise<void> {
  if (getMode() === "postgres") {
    await pgQuery('DELETE FROM "game_request" WHERE "id"=$1', [id]);
    return;
  }
  await withLocalLock(async (s) => {
    s.requests = s.requests.filter((x) => x.id !== id);
  });
}

export async function publishFromRequest(id: string): Promise<PublishedGame | null> {
  const req = await getRequest(id);
  if (!req?.html) return null;
  return publishDirect(req.title, req.icon ?? null, req.html, id);
}

export async function publishDirect(
  title: string,
  icon: string | null,
  html: string,
  id: string = randomUUID(),
): Promise<PublishedGame> {
  const createdAt = new Date().toISOString();
  if (getMode() === "postgres") {
    await pgQuery(
      'INSERT INTO "published_game" ("id","title","icon","html") VALUES ($1,$2,$3,$4) ON CONFLICT ("id") DO UPDATE SET "title"=EXCLUDED."title","icon"=EXCLUDED."icon","html"=EXCLUDED."html"',
      [id, title, icon, html],
    );
  } else {
    await withLocalLock(async (s) => {
      s.games = s.games.filter((g) => g.id !== id);
      s.games.push({ id, title, icon, html, createdAt });
    });
  }
  return { id, title, icon, createdAt };
}

export async function listGames(): Promise<PublishedGame[]> {
  if (getMode() === "postgres") {
    return pgQuery<PublishedGame>(
      'SELECT "id","title","icon","createdAt" FROM "published_game" ORDER BY "createdAt" DESC',
    );
  }
  const s = await readLocal();
  return s.games
    .map(({ html, ...rest }) => rest)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getGame(id: string): Promise<PublishedGame | null> {
  if (getMode() === "postgres") {
    const rows = await pgQuery<PublishedGame>(
      'SELECT "id","title","icon","html","createdAt" FROM "published_game" WHERE "id"=$1',
      [id],
    );
    return rows[0] ?? null;
  }
  const s = await readLocal();
  return s.games.find((g) => g.id === id) ?? null;
}

export async function deleteGame(id: string): Promise<void> {
  if (getMode() === "postgres") {
    await pgQuery('DELETE FROM "published_game" WHERE "id"=$1', [id]);
    return;
  }
  await withLocalLock(async (s) => {
    s.games = s.games.filter((g) => g.id !== id);
  });
}