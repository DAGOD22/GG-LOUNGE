/**
 * Client-side achievement inference — reads iframe localStorage / window to estimate progress
 * For CrazyGames-style: sign in → progress saved across devices
 * GG Lounge can see progress (via DB)
 */

export interface PendingAchievementUpdate {
  gameId: string
  achievementId: string
  progress: number
  unlocked?: boolean
}

// try to parse cookie clicker save — cookies are in Game.cookies or save string
function getCookieClickerProgress(win: any): Record<string, number> {
  try {
    // G stock uses win.Game
    if (win?.Game && typeof win.Game.cookies === 'number') {
      const cookies = Math.floor(win.Game.cookies || win.Game.cookiesEarned || 0)
      const cps = Math.floor(win.Game.cookiesPs || 0)
      const upgrades = win.Game.UpgradesOwned ?? win.Game.UpgradesById ? Object.values(win.Game.Upgrades||{}).filter((u:any)=> u.bought).length : 0
      return { cookies, cps, upgrades }
    }
    // fallback localStorage
    const raw = win.localStorage?.getItem('CookieClickerGame')
    if (raw) {
      // format is "2.052|...;..." — cookiesEarned is near start
      const parts = raw.split('|')
      const cookies = parseFloat(parts[0]) ? Math.floor(parseFloat(parts[0])) : 0
      return { cookies, cps: 0, upgrades: 0 }
    }
  } catch {}
  return {}
}

function getLocalInt(win: any, keys: string[]): number | null {
  for (const k of keys) {
    try {
      const v = win.localStorage?.getItem(k)
      if (v !== null) {
        const n = parseInt(v, 10)
        if (!isNaN(n)) return n
        try { const j = JSON.parse(v); if (typeof j === 'number') return j; if (j && typeof j.value === 'number') return j.value } catch {}
      }
    } catch {}
  }
  return null
}

// generic inference — returns progress map for achievements
export function inferAchievementUpdates(gameId: string, win: any, stats?: { plays:number, timeSeconds:number }): PendingAchievementUpdate[] {
  const updates: PendingAchievementUpdate[] = []
  const push = (id:string, prog:number, target:number) => {
    updates.push({ gameId, achievementId: id, progress: Math.min(prog, target), unlocked: prog >= target })
  }

  // always have stats
  const plays = stats?.plays || 1
  const time = stats?.timeSeconds || 0

  switch (gameId) {
    case 'cookie-clicker': {
      const cc = getCookieClickerProgress(win)
      const cookies = cc.cookies ?? Math.floor(time * 2) // fallback: ~2 cookies/sec avg
      const upgrades = cc.upgrades ?? Math.floor(time / 120)
      const cps = cc.cps ?? (cookies > 100 ? Math.floor(cookies/100) : 0)
      push('cc_first_cookie', cookies, 1)
      push('cc_100_cookies', cookies, 100)
      push('cc_1k_cookies', cookies, 1000)
      push('cc_10k_cookies', cookies, 10000)
      push('cc_100k_cookies', cookies, 100000)
      push('cc_5_upgrades', upgrades, 5)
      push('cc_20_upgrades', upgrades, 20)
      push('cc_cps_10', cps, 10)
      break
    }
    case 'ragdoll-archers': {
      const kills = getLocalInt(win, ['ra_kills','kills','score','ragdollArchersKills','archerKills']) ?? Math.floor(time/15)
      const arrows = getLocalInt(win, ['arrows','shots','ra_arrows']) ?? Math.floor(time/2)
      const headshots = Math.floor(kills * 0.3)
      const wins = Math.floor(plays * 0.6)
      push('ra_first_blood', headshots, 1)
      push('ra_10_kills', kills, 10)
      push('ra_50_kills', kills, 50)
      push('ra_100_arrows', arrows, 100)
      push('ra_25_headshots', headshots, 25)
      push('ra_5_headshot_streak', headshots >=5 ? 5 : headshots, 5)
      push('ra_10_wins', wins, 10)
      break
    }
    case 'solar-smash': {
      const planets = getLocalInt(win, ['planets','destroyed','solarPlanets','smashPlanets']) ?? Math.floor(time/20)
      const weapons = Math.min(5, Math.floor(time/60)+1)
      push('ss_first_planet', planets, 1)
      push('ss_5_planets', planets, 5)
      push('ss_10_planets', planets, 10)
      push('ss_5_weapons', weapons, 5)
      push('ss_laser_planet', planets>=1?1:0,1)
      push('ss_blackhole', planets>=2?1:0,1)
      push('ss_50_planets', planets, 50)
      break
    }
    case 'survival-race':
      push('sr_first_race', plays, 1)
      push('sr_100m', Math.floor(time*8), 100)
      push('sr_500m', Math.floor(time*8), 500)
      push('sr_5_races', plays, 5)
      push('sr_no_crash_30s', time>=30?30:time, 30)
      push('sr_1000m', Math.floor(time*8), 1000)
      break
    case 'drive-mad':
      push('dm_first_level', Math.min(plays,1),1)
      push('dm_10_levels', Math.floor(plays*2),10)
      push('dm_25_levels', Math.floor(plays*2),25)
      push('dm_no_flip', time>20?1:0,1)
      push('dm_speedrun', time>0? (time<10?1:0):0,1)
      break
    case 'slope':
      push('slope_100m', Math.floor(time*12),100)
      push('slope_500m', Math.floor(time*12),500)
      push('slope_1000m', Math.floor(time*12),1000)
      push('slope_5_games', plays,5)
      push('slope_dodge_10', Math.floor(time/5),10)
      break
    case 'retro-bowl':
      push('rb_first_td', Math.floor(time/30),1)
      push('rb_5_tds', Math.floor(time/30),5)
      push('rb_win_game', Math.floor(plays*0.5),1)
      push('rb_championship', Math.floor(plays*0.2),1)
      push('rb_200_yards', Math.floor(time*5),200)
      break
    case 'stack':
      push('stack_10', Math.floor(time/3),10)
      push('stack_25', Math.floor(time/3),25)
      push('stack_50', Math.floor(time/3),50)
      push('stack_perfect_5', Math.floor(time/20),5)
      break
    case 'drift-boss':
      push('db_100_drift', Math.floor(time*10),100)
      push('db_500_drift', Math.floor(time*10),500)
      push('db_10_games', plays,10)
      push('db_no_crash', Math.min(time,30),30)
      break
    case 'moto-x3m':
      push('mx_first_level', Math.min(plays,1),1)
      push('mx_5_levels', plays,5)
      push('mx_flip', Math.floor(time/20),1)
      push('mx_3_stars', Math.floor(plays*0.3),1)
      break
    case 'subway-surfers':
      push('ssurf_100_coins', Math.floor(time*4),100)
      push('ssurf_500_coins', Math.floor(time*4),500)
      push('ssurf_1000m', Math.floor(time*10),1000)
      push('ssurf_5_games', plays,5)
      break
    case 'geometry-dash':
      push('gd_first_level', Math.min(plays,1),1)
      push('gd_10_attempts', plays*3,10)
      push('gd_no_death_30s', Math.min(time,30),30)
      push('gd_complete_5', Math.floor(plays*0.4),5)
      break
    case '1v1-lol':
      push('lol_first_kill', Math.floor(time/20),1)
      push('lol_10_kills', Math.floor(time/20),10)
      push('lol_3_wins', Math.floor(plays*0.5),3)
      push('lol_build_50', Math.floor(time*2),50)
      break
    case 'holeio':
      push('hole_5_kills', Math.floor(time*2),5)
      push('hole_20_eats', Math.floor(time*2),20)
      push('hole_win', Math.floor(plays*0.3),1)
      push('hole_100_eats', Math.floor(time*2),100)
      break
    case 'drift-hunters':
      push('dh_5k_points', Math.floor(time*100),5000)
      push('dh_20k_points', Math.floor(time*100),20000)
      push('dh_upgrade_car', Math.floor(time/60),1)
      push('dh_100k', Math.floor(time*100),100000)
      break
    case 'rooftop-snipers':
      push('rs_first_win', Math.floor(plays*0.5),1)
      push('rs_5_wins', Math.floor(plays*0.5),5)
      push('rs_10_headshots', Math.floor(time/15),10)
      break
    case 'worlds-hardest-game':
      push('whg_level_1', Math.min(plays,1),1)
      push('whg_5_levels', Math.floor(plays*0.6),5)
      push('whg_no_death', time>30?1:0,1)
      break
    case 'fireboywatergirlforesttemple':
      push('fw_first_level', Math.min(plays,1),1)
      push('fw_5_levels', Math.floor(plays*1.2),5)
      push('fw_collect_gems', Math.floor(time*2),50)
      push('fw_speedrun', time>0?60:0,60)
      break
    case 'ducklife2':
      push('dl_first_race', Math.min(plays,1),1)
      push('dl_5_wins', Math.floor(plays*0.5),5)
      push('dl_max_level', Math.floor(time/120),1)
      push('dl_10_races', plays,10)
      break
    case 'cluster-rush':
      push('cr_10_trucks', Math.floor(time*2),10)
      push('cr_50_trucks', Math.floor(time*2),50)
      push('cr_no_fall', time>20?1:0,1)
      break
    case 'jetpack-joyride':
      push('jj_500m', Math.floor(time*10),500)
      push('jj_2000m', Math.floor(time*10),2000)
      push('jj_100_coins', Math.floor(time*3),100)
      push('jj_mission', Math.floor(time/60),1)
      break
    case 'tunnel-rush':
      push('tr_100m', Math.floor(time*12),100)
      push('tr_500m', Math.floor(time*12),500)
      push('tr_no_crash_20s', Math.min(time,20),20)
      break
    case 'doodle-jump':
      push('dj_1000_points', Math.floor(time*20),1000)
      push('dj_5000_points', Math.floor(time*20),5000)
      push('dj_spring', Math.floor(time/20),5)
      break
    case 'temple-run-2':
      push('temple_500m', Math.floor(time*10),500)
      push('temple_2000m', Math.floor(time*10),2000)
      push('temple_100_coins', Math.floor(time*3),100)
      push('temple_no_crash', Math.min(time,60),60)
      break
    case 'ovo':
      push('ovo_first_level', Math.min(plays,1),1)
      push('ovo_10_levels', Math.floor(plays*1.5),10)
      push('ovo_speedrun', time>0?30:0,30)
      push('ovo_no_death', time>20?1:0,1)
      break
    case 'vex-8':
      push('vex_first_level', Math.min(plays,1),1)
      push('vex_5_levels', Math.floor(plays*1.2),5)
      push('vex_no_death', time>20?1:0,1)
      push('vex_10_levels', Math.floor(plays*1.2),10)
      break
    case 'eaglercraftx':
      push('eag_10_blocks', Math.floor(time*1.5),10)
      push('eag_craft', Math.floor(time/60),1)
      push('eag_house', Math.floor(time*1.5),50)
      push('eag_diamond', Math.floor(time/180),1)
      break
    case 'backrooms':
      push('br_first_level', Math.min(plays,1),1)
      push('br_5_minutes', Math.min(time,300),300)
      push('br_find_exit', Math.floor(time/300),1)
      break
    case 'among-us':
      push('am_first_game', Math.min(plays,1),1)
      push('am_5_tasks', Math.floor(time*0.5),5)
      push('am_impostor', Math.floor(plays*0.2),1)
      push('am_10_wins', Math.floor(plays*0.3),10)
      break
    case 'poki':
      push('paper_10_percent', Math.floor(time*2),10)
      push('paper_50_percent', Math.floor(time*2),50)
      push('paper_5_kills', Math.floor(time/30),5)
      push('paper_win', Math.floor(plays*0.2),1)
      break
    default:
      // generic fallback for any other game with achievements
      push(gameId + '_play_5', plays, 5)
      break
  }
  return updates
}
