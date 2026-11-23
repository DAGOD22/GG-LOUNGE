/**
 * Accounts, sessions, per-user state and per-game saves.
 */
import { randomUUID, scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { getMode, pgQuery, migrate } from "./connection";
import { withLocalLock, readLocal, writeLocal } from "./local-store";
import { isStrongPassword } from "./core";
import type { UserState, AuthUser, AuthSession, GameSave } from "./core";

// --- Per-user state ---
export async function getUserState(id:string): Promise<UserState|null>{
  if(getMode()==="postgres"){
    try{
      const rows = await pgQuery<{payload:string}>('SELECT payload FROM user_state WHERE id=$1',[id])
      if(rows[0]?.payload) return JSON.parse(rows[0].payload as string)
    }catch{}
    return null
  }
  const s = await readLocal() as any
  const map = (s.userStates||{}) as Record<string,UserState>
  return map[id]||null
}
export async function setUserState(id:string, state: Omit<UserState,'id'|'updatedAt'>): Promise<UserState>{
  const full: UserState = { id, ...state, updatedAt: new Date().toISOString() }
  if(getMode()==="postgres"){
    try{
      await pgQuery('CREATE TABLE IF NOT EXISTS user_state (id TEXT PRIMARY KEY, payload TEXT NOT NULL, updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW())')
      await pgQuery('INSERT INTO user_state (id,payload) VALUES ($1,$2) ON CONFLICT (id) DO UPDATE SET payload=EXCLUDED.payload, updatedAt=NOW()',[id, JSON.stringify(full)])
    }catch{}
    return full
  }
  await withLocalLock(async (store:any)=>{
    store.userStates = store.userStates || {}
    store.userStates[id]=full
  })
  return full
}

function hashPassword(password:string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return salt + ':' + hash
}
function verifyPassword(password:string, stored:string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    if(!salt || !hash) return false
    const derived = scryptSync(password, salt, 64).toString('hex')
    const a = Buffer.from(hash, 'hex')
    const b = Buffer.from(derived, 'hex')
    if(a.length !== b.length) return false
    return timingSafeEqual(a,b)
  } catch { return false }
}
function normFood(s:string){ return s.trim().toLowerCase().replace(/\s+/g,' ') }
function hashFood(food:string): string {
  const n = normFood(food)
  const salt = randomBytes(8).toString('hex')
  const hash = scryptSync(n, salt, 32).toString('hex')
  return salt+':'+hash
}
function verifyFood(food:string, stored:string, norm:string|undefined): boolean {
  const n = normFood(food)
  if(norm && n===norm) return true
  try{
    const [salt, hash] = stored.split(':')
    if(!salt||!hash) return false
    const derived = scryptSync(n, salt, 32).toString('hex')
    return timingSafeEqual(Buffer.from(hash,'hex'), Buffer.from(derived,'hex'))
  }catch{ return false }
}

export async function createAuthUser(username:string, password:string, favoriteFood:string): Promise<AuthUser>{
  const usernameTrim = username.trim()
  const usernameLower = usernameTrim.toLowerCase()
  if(!/^[a-z0-9_]{3,20}$/.test(usernameLower)) throw new Error('Username must be 3-20 letters, numbers or _')
  const pwErr = isStrongPassword(password)
  if (pwErr) throw new Error(pwErr)
  if(!favoriteFood.trim()) throw new Error('Favorite food is required')
  if(getMode()==="postgres"){
    await migrate()
    const exists = await pgQuery<{id:string}>('SELECT id FROM auth_user WHERE username_lower=$1 LIMIT 1',[usernameLower])
    if(exists.length) throw new Error('Username taken')
    const id=randomUUID()
    const passwordHash=hashPassword(password)
    const favoriteFoodHash=hashFood(favoriteFood)
    const favoriteFoodNorm=normFood(favoriteFood)
    const createdAt=new Date().toISOString()
    await pgQuery('INSERT INTO auth_user (id, username, username_lower, password_hash, favorite_food_hash, favorite_food_norm, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',[id, usernameTrim, usernameLower, passwordHash, favoriteFoodHash, favoriteFoodNorm, createdAt])
    return { id, username: usernameTrim, usernameLower, passwordHash, favoriteFoodHash, favoriteFoodNorm, createdAt }
  }
  let user!: AuthUser
  await withLocalLock(async (s:any) => {
    if(s.users.find((u:any)=> u.usernameLower===usernameLower)) throw new Error('Username taken')
    const id=randomUUID()
    const passwordHash=hashPassword(password)
    const favoriteFoodHash=hashFood(favoriteFood)
    const favoriteFoodNorm=normFood(favoriteFood)
    const createdAt=new Date().toISOString()
    user={ id, username: usernameTrim, usernameLower, passwordHash, favoriteFoodHash, favoriteFoodNorm, createdAt }
    s.users.push(user)
  })
  return user
}
export async function findAuthUserByUsername(username:string): Promise<AuthUser|null>{
  const lower=username.trim().toLowerCase()
  if(getMode()==="postgres"){
    await migrate()
    const rows=await pgQuery<any>('SELECT id, username, username_lower as "usernameLower", password_hash as "passwordHash", favorite_food_hash as "favoriteFoodHash", favorite_food_norm as "favoriteFoodNorm", created_at as "createdAt" FROM auth_user WHERE username_lower=$1 LIMIT 1',[lower])
    return rows[0] as AuthUser || null
  }
  const s=await readLocal() as any
  return s.users.find((u:any)=> u.usernameLower===lower) || null
}
export async function findAuthUserById(id:string): Promise<AuthUser|null>{
  if(getMode()==="postgres"){
    await migrate()
    const rows=await pgQuery<any>('SELECT id, username, username_lower as "usernameLower", password_hash as "passwordHash", favorite_food_hash as "favoriteFoodHash", favorite_food_norm as "favoriteFoodNorm", created_at as "createdAt" FROM auth_user WHERE id=$1 LIMIT 1',[id])
    return rows[0] as AuthUser || null
  }
  const s=await readLocal() as any
  return s.users.find((u:any)=> u.id===id) || null
}
export async function verifyAuthUser(username:string, password:string): Promise<AuthUser|null>{
  const u=await findAuthUserByUsername(username)
  if(!u) return null
  if(!verifyPassword(password, u.passwordHash)) return null
  return u
}
export async function verifyFavoriteFood(username:string, food:string): Promise<boolean>{
  const u=await findAuthUserByUsername(username)
  if(!u) return false
  return verifyFood(food, u.favoriteFoodHash, u.favoriteFoodNorm)
}
export async function resetAuthPassword(username:string, newPassword:string): Promise<void>{
  const pwErr = isStrongPassword(newPassword)
  if (pwErr) throw new Error(pwErr)
  const hash=hashPassword(newPassword)
  if(getMode()==="postgres"){
    await migrate()
    await pgQuery('UPDATE auth_user SET password_hash=$2 WHERE username_lower=$1',[username.trim().toLowerCase(), hash])
    return
  }
  await withLocalLock(async (s:any)=>{
    const u=s.users.find((x:any)=> x.usernameLower===username.trim().toLowerCase())
    if(u) u.passwordHash=hash
  })
}
export async function createSession(userId:string): Promise<AuthSession>{
  const token=randomBytes(32).toString('hex')
  const createdAt=new Date().toISOString()
  const expiresAt=new Date(Date.now()+ 30*24*3600*1000).toISOString()
  const sess:AuthSession={ token, userId, createdAt, expiresAt }
  if(getMode()==="postgres"){
    await migrate()
    await pgQuery('INSERT INTO auth_session (token, user_id, created_at, expires_at) VALUES ($1,$2,$3,$4)',[token, userId, createdAt, expiresAt])
    return sess
  }
  await withLocalLock(async (s:any) => {
    s.sessions.push(sess)
    s.sessions=s.sessions.slice(-500)
  })
  return sess
}
export async function getSession(token:string): Promise<AuthSession|null>{
  if(!token) return null
  if(getMode()==="postgres"){
    await migrate()
    const rows=await pgQuery<any>('SELECT token, user_id as "userId", created_at as "createdAt", expires_at as "expiresAt" FROM auth_session WHERE token=$1 LIMIT 1',[token])
    const r=rows[0] as AuthSession
    if(!r) return null
    if(new Date(r.expiresAt) < new Date()){ await pgQuery('DELETE FROM auth_session WHERE token=$1',[token]); return null }
    return r
  }
  const s=await readLocal() as any
  const sess=s.sessions.find((x:any)=> x.token===token) as AuthSession|null
  if(!sess) return null
  if(new Date(sess.expiresAt) < new Date()){ s.sessions=s.sessions.filter((x:any)=> x.token!==token); await writeLocal(s); return null }
  return sess
}
export async function deleteSession(token:string): Promise<void>{
  if(getMode()==="postgres"){ await migrate(); await pgQuery('DELETE FROM auth_session WHERE token=$1',[token]); return }
  await withLocalLock(async (s:any)=>{
    s.sessions=s.sessions.filter((x:any)=> x.token!==token)
  })
}
export async function getUserFromToken(token:string): Promise<AuthUser|null>{
  const sess=await getSession(token)
  if(!sess) return null
  return findAuthUserById(sess.userId)
}
export async function getSave(userId:string, gameId:string): Promise<GameSave|null>{
  if(getMode()==="postgres"){
    await migrate()
    const rows=await pgQuery<any>('SELECT user_id as "userId", game_id as "gameId", data, updated_at as "updatedAt" FROM game_save WHERE user_id=$1 AND game_id=$2 LIMIT 1',[userId, gameId])
    return rows[0] as GameSave||null
  }
  const s=await readLocal() as any
  return s.saves.find((x:any)=> x.userId===userId && x.gameId===gameId) || null
}
export async function setSave(userId:string, gameId:string, data:string): Promise<GameSave>{
  const updatedAt=new Date().toISOString()
  const save:GameSave={ userId, gameId, data: data.slice(0, 500_000), updatedAt }
  if(getMode()==="postgres"){
    await migrate()
    await pgQuery('INSERT INTO game_save (user_id, game_id, data, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id, game_id) DO UPDATE SET data=EXCLUDED.data, updated_at=EXCLUDED.updated_at',[userId, gameId, save.data, updatedAt])
    return save
  }
  await withLocalLock(async (s:any) => {
    const idx=s.saves.findIndex((x:any)=> x.userId===userId && x.gameId===gameId)
    if(idx>=0) s.saves[idx]=save
    else s.saves.push(save)
    if(s.saves.length>5000) s.saves=s.saves.slice(-5000)
  })
  return save
}
export async function listSaves(userId:string): Promise<GameSave[]>{
  if(getMode()==="postgres"){
    await migrate()
    return pgQuery<any>('SELECT user_id as "userId", game_id as "gameId", updated_at as "updatedAt" FROM game_save WHERE user_id=$1 ORDER BY updated_at DESC',[userId]) as Promise<GameSave[]>
  }
  const s=await readLocal() as any
  return s.saves.filter((x:any)=> x.userId===userId).map((x:any)=> ({ userId:x.userId, gameId:x.gameId, updatedAt:x.updatedAt }))
}
