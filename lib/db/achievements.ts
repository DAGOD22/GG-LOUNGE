/** Achievement progress and per-game play stats. */
import { getMode, pgQuery, migrate } from "./connection";
import { withLocalLock, readLocal } from "./local-store";
import type { UserAchievement, UserGameStats } from "./core";

/* ---------------- Achievements (CrazyGames-style) ---------------- */

export async function listUserAchievements(userId: string): Promise<UserAchievement[]> {
  if (getMode() === "postgres") {
    await migrate();
    return pgQuery<UserAchievement>('SELECT user_id as "userId", game_id as "gameId", achievement_id as "achievementId", progress, unlocked, unlocked_at as "unlockedAt", updated_at as "updatedAt" FROM user_achievement WHERE user_id=$1 ORDER BY updated_at DESC', [userId]);
  }
  const s = await readLocal();
  return (s.achievements || []).filter(a => a.userId === userId).sort((a,b)=> (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getUserAchievementsForGame(userId: string, gameId: string): Promise<UserAchievement[]> {
  if (getMode() === "postgres") {
    await migrate();
    return pgQuery<UserAchievement>('SELECT user_id as "userId", game_id as "gameId", achievement_id as "achievementId", progress, unlocked, unlocked_at as "unlockedAt", updated_at as "updatedAt" FROM user_achievement WHERE user_id=$1 AND game_id=$2', [userId, gameId]);
  }
  const s = await readLocal();
  return (s.achievements || []).filter(a => a.userId === userId && a.gameId === gameId);
}

export async function upsertAchievementProgress(userId: string, gameId: string, achievementId: string, progress: number, unlocked?: boolean): Promise<UserAchievement> {
  const now = new Date().toISOString();
  const shouldUnlock = unlocked ?? false;
  if (getMode() === "postgres") {
    await migrate();
    // fetch existing
    const rows = await pgQuery<UserAchievement>('SELECT progress, unlocked FROM user_achievement WHERE user_id=$1 AND achievement_id=$2', [userId, achievementId]);
    let newProgress = progress;
    let newUnlocked = shouldUnlock;
    let unlockedAt: string | null = null;
    if (rows.length) {
      const cur = rows[0] as any;
      newProgress = Math.max(Number(cur.progress) || 0, progress);
      newUnlocked = Boolean(cur.unlocked) || shouldUnlock;
      if (newUnlocked && !cur.unlocked) unlockedAt = now;
      else if (cur.unlocked) unlockedAt = (cur as any).unlockedAt || now;
      await pgQuery('UPDATE user_achievement SET progress=$3, unlocked=$4, unlocked_at=COALESCE($5, unlocked_at), updated_at=$6, game_id=$7 WHERE user_id=$1 AND achievement_id=$2', [userId, achievementId, newProgress, newUnlocked, unlockedAt, now, gameId]);
    } else {
      if (newUnlocked) unlockedAt = now;
      await pgQuery('INSERT INTO user_achievement (user_id, game_id, achievement_id, progress, unlocked, unlocked_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [userId, gameId, achievementId, newProgress, newUnlocked, unlockedAt, now]);
    }
    const out = await pgQuery<UserAchievement>('SELECT user_id as "userId", game_id as "gameId", achievement_id as "achievementId", progress, unlocked, unlocked_at as "unlockedAt", updated_at as "updatedAt" FROM user_achievement WHERE user_id=$1 AND achievement_id=$2', [userId, achievementId]);
    return out[0];
  }
  let result!: UserAchievement;
  await withLocalLock(async (s:any)=>{
    s.achievements = s.achievements || [];
    const idx = s.achievements.findIndex((x:any)=> x.userId===userId && x.achievementId===achievementId);
    if (idx>=0) {
      const cur = s.achievements[idx];
      const newProg = Math.max(cur.progress||0, progress);
      const wasUnlocked = !!cur.unlocked;
      const nowUnlocked = wasUnlocked || shouldUnlock;
      cur.progress = newProg;
      cur.unlocked = nowUnlocked;
      cur.updatedAt = now;
      cur.gameId = gameId;
      if (nowUnlocked && !wasUnlocked) cur.unlockedAt = now;
      result = cur;
    } else {
      result = { userId, gameId, achievementId, progress, unlocked: shouldUnlock, unlockedAt: shouldUnlock? now : null, updatedAt: now };
      s.achievements.push(result);
    }
    if (s.achievements.length>10000) s.achievements=s.achievements.slice(-10000);
  });
  return result;
}

export async function bulkUpsertAchievements(userId: string, updates: Array<{gameId:string, achievementId:string, progress:number, unlocked?:boolean}>): Promise<UserAchievement[]> {
  const out: UserAchievement[] = [];
  for (const u of updates) {
    const r = await upsertAchievementProgress(userId, u.gameId, u.achievementId, u.progress, u.unlocked);
    out.push(r);
  }
  return out;
}

export async function getUserStats(userId: string): Promise<{totalUnlocked:number, totalPoints:number, perGame: Record<string,{unlocked:number,total:number}>}> {
  const all = await listUserAchievements(userId);
  // need definitions to calc points
  try {
    const { ACHIEVEMENTS } = await import('../achievements');
    const map = new Map(ACHIEVEMENTS.map(a=>[a.id,a]));
    let points=0;
    const perGame: Record<string,{unlocked:number,total:number}> = {};
    for (const a of ACHIEVEMENTS) {
      perGame[a.gameId] = perGame[a.gameId] || {unlocked:0, total:0};
      perGame[a.gameId].total++;
    }
    for (const ua of all) if (ua.unlocked) {
      const def = map.get(ua.achievementId);
      if (def) points+= def.points;
      if (perGame[ua.gameId]) perGame[ua.gameId].unlocked++;
    }
    return { totalUnlocked: all.filter(x=>x.unlocked).length, totalPoints: points, perGame };
  } catch { return { totalUnlocked: all.filter(x=>x.unlocked).length, totalPoints: 0, perGame: {} } }
}

export async function incrementGameStats(userId: string, gameId: string, timeSeconds=0): Promise<UserGameStats> {
  const now = new Date().toISOString();
  if (getMode()==="postgres") {
    await migrate();
    await pgQuery('INSERT INTO user_game_stats (user_id, game_id, plays, time_seconds, last_played_at, updated_at) VALUES ($1,$2,1,$3,$4,$4) ON CONFLICT (user_id, game_id) DO UPDATE SET plays=user_game_stats.plays+1, time_seconds=user_game_stats.time_seconds+EXCLUDED.time_seconds, last_played_at=EXCLUDED.last_played_at, updated_at=EXCLUDED.updated_at', [userId, gameId, timeSeconds, now]);
    const rows = await pgQuery<UserGameStats>('SELECT user_id as "userId", game_id as "gameId", plays, time_seconds as "timeSeconds", last_played_at as "lastPlayedAt", updated_at as "updatedAt" FROM user_game_stats WHERE user_id=$1 AND game_id=$2', [userId, gameId]);
    return rows[0];
  }
  let out!: UserGameStats;
  await withLocalLock(async (s:any)=>{
    s.gameStats = s.gameStats || [];
    let cur = s.gameStats.find((x:any)=> x.userId===userId && x.gameId===gameId);
    if (!cur) { cur = { userId, gameId, plays:1, timeSeconds, lastPlayedAt: now, updatedAt: now }; s.gameStats.push(cur); }
    else { cur.plays++; cur.timeSeconds+= timeSeconds; cur.lastPlayedAt=now; cur.updatedAt=now; }
    out=cur as UserGameStats;
  });
  return out;
}

export async function getUserGameStats(userId: string, gameId: string): Promise<UserGameStats | null> {
  if (getMode()==="postgres") {
    await migrate();
    const rows = await pgQuery<UserGameStats>('SELECT user_id as "userId", game_id as "gameId", plays, time_seconds as "timeSeconds", last_played_at as "lastPlayedAt", updated_at as "updatedAt" FROM user_game_stats WHERE user_id=$1 AND game_id=$2', [userId, gameId]);
    return rows[0]||null;
  }
  const s= await readLocal();
  return (s.gameStats||[]).find(x=> x.userId===userId && x.gameId===gameId) || null;
}

export async function listUserGameStats(userId: string): Promise<UserGameStats[]> {
  if (getMode()==="postgres") {
    await migrate();
    return pgQuery<UserGameStats>('SELECT user_id as "userId", game_id as "gameId", plays, time_seconds as "timeSeconds", last_played_at as "lastPlayedAt", updated_at as "updatedAt" FROM user_game_stats WHERE user_id=$1 ORDER BY last_played_at DESC', [userId]);
  }
  const s= await readLocal();
  return (s.gameStats||[]).filter(x=> x.userId===userId).sort((a,b)=> (a.lastPlayedAt||'') < (b.lastPlayedAt||'') ? 1 : -1);
}
