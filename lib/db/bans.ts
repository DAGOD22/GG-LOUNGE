/** Bans, the site password gate, and escalating IP lockouts. */
import { randomUUID } from "node:crypto";
import { getMode, pgQuery, migrate } from "./connection";
import { withLocalLock, readLocal } from "./local-store";
import type { Ban } from "./core";

/* ---------------- Bans & kicks ---------------- */

export async function listBans(): Promise<Ban[]> {
  if (getMode() === "postgres") {
    return pgQuery<Ban>(
      'SELECT "id","identifier","reason","createdAt","expiresAt" FROM "banned_user" ORDER BY "createdAt" DESC',
    );
  }
  const s = await readLocal();
  return s.bans.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function addBan(
  identifier: string,
  reason: string | null,
  expiresAt: Date | null,
): Promise<Ban> {
  const id = randomUUID();
  if (getMode() === "postgres") {
    await pgQuery(
      'INSERT INTO "banned_user" ("id","identifier","reason","expiresAt") VALUES ($1,$2,$3,$4) ON CONFLICT ("identifier") DO UPDATE SET "reason"=EXCLUDED."reason","expiresAt"=EXCLUDED."expiresAt"',
      [id, identifier, reason, expiresAt ? expiresAt.toISOString() : null],
    );
    const rows = await pgQuery<Ban>(
      'SELECT "id","identifier","reason","createdAt","expiresAt" FROM "banned_user" WHERE "identifier"=$1',
      [identifier],
    );
    return rows[0];
  }
  let ban!: Ban
  await withLocalLock(async (s) => {
    s.bans = s.bans.filter((b) => b.identifier !== identifier);
    ban = {
      id,
      identifier,
      reason,
      createdAt: new Date().toISOString(),
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
    };
    s.bans.push(ban);
  });
  return ban;
}

export async function removeBan(id: string): Promise<void> {
  if (getMode() === "postgres") {
    await pgQuery('DELETE FROM "banned_user" WHERE "id"=$1', [id]);
    return;
  }
  await withLocalLock(async (s) => {
    s.bans = s.bans.filter((b) => b.id !== id);
  });
}

/** Returns the active ban for an identifier (null when clean/expired). Prunes expired rows. */
export async function findActiveBan(identifier: string): Promise<Ban | null> {
  const now = new Date();
  if (getMode() === "postgres") {
    await pgQuery('DELETE FROM "banned_user" WHERE "expiresAt" IS NOT NULL AND "expiresAt" <= NOW()');
    const rows = await pgQuery<Ban>(
      'SELECT "id","identifier","reason","createdAt","expiresAt" FROM "banned_user" WHERE "identifier"=$1',
      [identifier],
    );
    return rows[0] ?? null;
  }
  const s = await readLocal();
  const before = s.bans.length;
  const filtered = s.bans.filter((b) => !b.expiresAt || new Date(b.expiresAt) > now);
  if (filtered.length !== before) {
    await withLocalLock(async (store) => {
      store.bans = store.bans.filter((b) => !b.expiresAt || new Date(b.expiresAt) > now);
    });
  }
  // re-read after prune? keep simple: read again
  const s2 = await readLocal();
  return s2.bans.find((b) => b.identifier === identifier) ?? null;
}

/* ---------------- Gate (site password + escalating IP bans) ---------------- */

export const GATE_DURATIONS_MS: number[] = [
  60 * 1000,
  5 * 60 * 1000,
  10 * 60 * 1000,
  30 * 60 * 1000,
  60 * 60 * 1000,
  120 * 60 * 1000,
  24 * 60 * 60 * 1000,
  3 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
  // permanent -> null expiresAt
];

export interface GateState {
  ip: string;
  fails: number;
  banLevel: number;
  bannedUntil: string | null;
  updatedAt: string;
}

export async function getGateState(ip: string): Promise<GateState> {
  const norm = ip.slice(0, 80);
  if (getMode() === "postgres") {
    const rows = await pgQuery<any>('SELECT "ip","fails","ban_level" as "banLevel","banned_until" as "bannedUntil","updated_at" as "updatedAt" FROM "gate_state" WHERE "ip"=$1', [norm]);
    if (rows[0]) {
      const r = rows[0] as any;
      // prune expired ban
      if (r.bannedUntil && new Date(r.bannedUntil) <= new Date() && r.banLevel < GATE_DURATIONS_MS.length) {
        // expired, clear bannedUntil but keep banLevel for escalation
        await pgQuery('UPDATE "gate_state" SET "banned_until"=NULL, "updated_at"=NOW() WHERE "ip"=$1', [norm]);
        r.bannedUntil = null;
      }
      return { ip: r.ip, fails: Number(r.fails)||0, banLevel: Number(r.banLevel)||0, bannedUntil: r.bannedUntil ? new Date(r.bannedUntil).toISOString() : null, updatedAt: r.updatedAt };
    }
    return { ip: norm, fails: 0, banLevel: 0, bannedUntil: null, updatedAt: new Date().toISOString() };
  }
  const s = await readLocal();
  const gs = (s.gateStates || {})[norm];
  if (!gs) return { ip: norm, fails: 0, banLevel: 0, bannedUntil: null, updatedAt: new Date().toISOString() };
  if (gs.bannedUntil && new Date(gs.bannedUntil) <= new Date() && gs.banLevel < GATE_DURATIONS_MS.length) {
    // expired, clear
    await withLocalLock(async (store) => {
      const cur = store.gateStates?.[norm];
      if (cur) cur.bannedUntil = null;
    });
    gs.bannedUntil = null;
  }
  return { ip: gs.ip, fails: gs.fails, banLevel: gs.banLevel, bannedUntil: gs.bannedUntil, updatedAt: gs.updatedAt };
}

export async function isGateBanned(ip: string): Promise<{ banned: boolean; expiresAt: string | null; banLevel: number }> {
  const st = await getGateState(ip);
  // permanent is banLevel >= length (null expiry)
  if (st.banLevel >= GATE_DURATIONS_MS.length) return { banned: true, expiresAt: null, banLevel: st.banLevel };
  if (st.bannedUntil) {
    const exp = new Date(st.bannedUntil);
    if (exp > new Date()) return { banned: true, expiresAt: st.bannedUntil, banLevel: st.banLevel };
  }
  // also check banned_user table for gate:ip (handles postgres fallback and ensures consistency)
  const ban = await findActiveBan(`gate:${ip.slice(0,80)}`);
  if (ban) return { banned: true, expiresAt: ban.expiresAt, banLevel: st.banLevel };
  return { banned: false, expiresAt: null, banLevel: st.banLevel };
}

export async function recordGateFailure(ip: string): Promise<{ banned: boolean; expiresAt: string | null; banLevel: number }> {
  const norm = ip.slice(0, 80);
  const st = await getGateState(norm);
  // if already banned, don't increment
  if (st.bannedUntil && new Date(st.bannedUntil) > new Date()) {
    return { banned: true, expiresAt: st.bannedUntil, banLevel: st.banLevel };
  }
  const newFails = st.fails + 1;
  if (newFails < 3) {
    // just increment fails
    if (getMode() === "postgres") {
      await pgQuery('INSERT INTO "gate_state" ("ip","fails","ban_level","banned_until") VALUES ($1,$2,$3,$4) ON CONFLICT ("ip") DO UPDATE SET "fails"=EXCLUDED."fails","updated_at"=NOW()', [norm, newFails, st.banLevel, st.bannedUntil ? new Date(st.bannedUntil) : null]);
    } else {
      await withLocalLock(async (store) => {
        store.gateStates = store.gateStates || {};
        store.gateStates[norm] = { ip: norm, fails: newFails, banLevel: st.banLevel, bannedUntil: st.bannedUntil, updatedAt: new Date().toISOString() };
      });
    }
    return { banned: false, expiresAt: null, banLevel: st.banLevel };
  }
  // fails reached 3 -> trigger ban
  const nextLevel = st.banLevel; // 0-indexed
  let expiresAt: Date | null = null;
  if (nextLevel < GATE_DURATIONS_MS.length) {
    const dur = GATE_DURATIONS_MS[nextLevel];
    expiresAt = new Date(Date.now() + dur);
  } else {
    expiresAt = null; // permanent handled as banLevel >= length
  }
  const newBanLevel = st.banLevel + 1;
  const bannedUntilStr = expiresAt ? expiresAt.toISOString() : null;

  if (getMode() === "postgres") {
    await pgQuery('INSERT INTO "gate_state" ("ip","fails","ban_level","banned_until") VALUES ($1,$2,$3,$4) ON CONFLICT ("ip") DO UPDATE SET "fails"=0,"ban_level"=EXCLUDED."ban_level","banned_until"=EXCLUDED."banned_until","updated_at"=NOW()', [norm, 0, newBanLevel, expiresAt]);
  } else {
    await withLocalLock(async (store) => {
      store.gateStates = store.gateStates || {};
      store.gateStates[norm] = { ip: norm, fails: 0, banLevel: newBanLevel, bannedUntil: bannedUntilStr, updatedAt: new Date().toISOString() };
    });
  }
  // also add to banned_user for visibility in admin and for middleware fetch via findActiveBan
  const identifier = `gate:${norm}`;
  const reason = `gate escalating ban level ${newBanLevel}`;
  await addBan(identifier, reason, expiresAt);

  return { banned: true, expiresAt: bannedUntilStr, banLevel: newBanLevel - 1 };
}

export async function checkUpvoteCooldown(ip: string, requestId: string, cooldownMs=30000): Promise<{allowed:boolean, retryAfter:number}>{
  const normIp = ip.slice(0,80)
  if(getMode()==="postgres"){
    await migrate()
    const rows = await pgQuery<any>('SELECT last_at FROM upvote_cooldown WHERE ip=$1 AND request_id=$2', [normIp, requestId])
    if(rows[0]){
      const last = new Date(rows[0].last_at as string).getTime()
      const diff = Date.now() - last
      if(diff < cooldownMs) return {allowed:false, retryAfter: Math.ceil((cooldownMs - diff)/1000)}
      await pgQuery('UPDATE upvote_cooldown SET last_at=NOW() WHERE ip=$1 AND request_id=$2', [normIp, requestId])
      return {allowed:true, retryAfter:0}
    }
    await pgQuery('INSERT INTO upvote_cooldown (ip, request_id) VALUES ($1,$2) ON CONFLICT (ip, request_id) DO UPDATE SET last_at=NOW()', [normIp, requestId])
    return {allowed:true, retryAfter:0}
  }
  // local fallback: file-backed via withLocalLock
  let allowed = true
  let retry = 0
  await withLocalLock(async (s:any)=>{
    s.upvoteCooldown = s.upvoteCooldown || {}
    const key = normIp + ':' + requestId
    const last = s.upvoteCooldown[key] ? new Date(s.upvoteCooldown[key]).getTime() : 0
    const diff = Date.now() - last
    if(diff < cooldownMs){ allowed=false; retry=Math.ceil((cooldownMs-diff)/1000); return }
    s.upvoteCooldown[key]= new Date().toISOString()
    // prune old entries >1h (keep 2000 max)
    const keys = Object.keys(s.upvoteCooldown)
    if(keys.length>2000){ for(const k of keys){ if(Date.now()- new Date(s.upvoteCooldown[k]).getTime() > 3600000) delete s.upvoteCooldown[k] } }
  })
  return {allowed, retryAfter: retry}
}
export async function recordGateSuccess(ip: string): Promise<void> {
  const norm = ip.slice(0, 80);
  const st = await getGateState(norm);
  // If currently banned, do not lift ban — just reset fails, keep bannedUntil and level
  const now = new Date();
  const isCurrentlyBanned = !!(st.bannedUntil && new Date(st.bannedUntil) > now) || (st.banLevel >= GATE_DURATIONS_MS.length);
  if (isCurrentlyBanned) return;
  // reset fails but keep banLevel for escalation history, clear expired ban
  if (getMode() === "postgres") {
    await pgQuery('INSERT INTO "gate_state" ("ip","fails","ban_level","banned_until") VALUES ($1,0,$2,NULL) ON CONFLICT ("ip") DO UPDATE SET "fails"=0,"banned_until"=NULL,"updated_at"=NOW()', [norm, st.banLevel]);
  } else {
    await withLocalLock(async (store) => {
      store.gateStates = store.gateStates || {};
      store.gateStates[norm] = { ip: norm, fails: 0, banLevel: st.banLevel, bannedUntil: null, updatedAt: new Date().toISOString() };
    });
  }
}
