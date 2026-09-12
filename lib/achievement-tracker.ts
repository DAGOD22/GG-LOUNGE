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
    case 'level-devil': {
      const deaths = getLocalInt(win, ['ld_deaths','deaths']) ?? Math.floor(time/8)
      const levels = getLocalInt(win, ['ld_levels','levels']) ?? Math.floor(time/40)
      push('ld_first_troll', deaths >= 1 ? 1 : 0, 1)
      push('ld_5_trolls', levels, 5)
      push('ld_10_levels', levels, 10)
      push('ld_no_death', levels >=1 && deaths === 0 ? 1 : 0, 1)
      push('ld_speedrun_30', time >0 && time < 30 && levels >=1 ? 1 : 0, 1)
      push('ld_20_deaths', deaths, 20)
      break
    }
    case 'idle-mining': {
      const gold = getLocalInt(win, ['im_gold','gold','coins']) ?? Math.floor(time*5 + plays*100)
      const depth = getLocalInt(win, ['depth','meters']) ?? Math.floor(time*3)
      const upgrades = getLocalInt(win, ['upgrades']) ?? Math.floor(time/60)
      push('im_first_ore', plays, 1); push('im_1000_gold', gold, 1000); push('im_10_upgrades', upgrades, 10); push('im_deep_1000', depth, 1000); push('im_prestige', getLocalInt(win, ['prestige']) ?? 0, 1); push('im_1m_gold', gold, 1000000); break
    }
    case 'stickman-hook': { const levels = getLocalInt(win, ['sh_levels','levels']) ?? Math.floor(time/20); const swings = getLocalInt(win, ['swings']) ?? Math.floor(time/1.5); push('sh_first_swing', levels, 1); push('sh_10_levels', levels, 10); push('sh_no_fall', levels >=1 ? 1 : 0, 1); push('sh_speed_20', time>0 && time<20 ? 1 : 0, 1); push('sh_50_swings', swings, 50); break }
    case 'hextris': { const pts = getLocalInt(win, ['hx_score','score']) ?? Math.floor(time*10); const combos = getLocalInt(win, ['combos']) ?? Math.floor(time/12); push('hx_first_spin', 1, 1); push('hx_500_points', pts, 500); push('hx_5000_points', pts, 5000); push('hx_10_combos', combos, 10); push('hx_survive_60', time, 60); push('hx_20000', pts, 20000); break }
    case '2048': { const tile = getLocalInt(win, ['bestTile','maxTile']) ?? (time > 120 ? 1024 : 512); push('tfe_first_512', tile >=512 ? 512 : 0, 512); push('tfe_1024', tile >=1024 ? 1024 : 0, 1024); push('tfe_2048', tile >=2048 ? 2048 : 0, 2048); push('tfe_4096', tile >=4096 ? 4096 : 0, 4096); push('tfe_10_games', plays, 10); push('tfe_no_undo', tile >=512 ? 1 : 0, 1); break }
    case 'chrome-dino': { const m = getLocalInt(win, ['dino_dist','distance','score']) ?? Math.floor(time*8); push('dino_100m', m, 100); push('dino_500m', m, 500); push('dino_2000m', m, 2000); push('dino_5_birds', Math.floor(time/20), 5); push('dino_no_crash_30', time, 30); break }
    case 'monkey-mart': { const sales = getLocalInt(win, ['sales']) ?? Math.floor(time/3); const coins = getLocalInt(win, ['coins']) ?? Math.floor(time*8); push('mm_first_sale', sales, 1); push('mm_100_sales', sales, 100); push('mm_upgrade_5', Math.floor(time/90), 5); push('mm_10k_gold', coins, 10000); push('mm_no_wait', sales >=10 ? 10 : 0, 10); break }
    case 'krunker': { const kills = getLocalInt(win, ['kills']) ?? Math.floor(time/10); push('kr_first_kill', kills, 1); push('kr_25_kills', kills, 25); push('kr_5_wins', getLocalInt(win, ['wins']) ?? Math.floor(plays/2), 5); push('kr_headshot_10', Math.floor(kills*0.3), 10); push('kr_noscope', kills >=5 ? 1 : 0, 1); break }
    case 'smashkarts': { const wins = getLocalInt(win, ['wins']) ?? Math.floor(plays/3); push('sk_first_race', 1, 1); push('sk_5_wins', wins, 5); push('sk_10_kills', Math.floor(time/8), 10); push('sk_powerup_20', Math.floor(time/6), 20); push('sk_no_hit_win', wins >=1 ? 1 : 0, 1); break }
    case 'crossyroad': { const steps = getLocalInt(win, ['steps','score']) ?? Math.floor(time*4); push('cr2_50_steps', steps, 50); push('cr2_200_steps', steps, 200); push('cr2_collect_20', Math.floor(time/2), 20); push('cr2_no_death_100', steps, 100); push('cr2_unlock_char', Math.floor(plays/2), 1); break }
    case 'flappy-bird': { const pipes = getLocalInt(win, ['pipes','score']) ?? Math.floor(time/2); push('fb_first_pipe', pipes, 1); push('fb_10_pipes', pipes, 10); push('fb_30_pipes', pipes, 30); push('fb_5_games', plays, 5); push('fb_no_crash_20', pipes, 20); break }
    case 'run-3': { const lv = getLocalInt(win, ['levels']) ?? Math.floor(time/30); push('r3_level_1', lv, 1); push('r3_10_levels', lv, 10); push('r3_no_fall', lv >=1 ? 1 : 0, 1); push('r3_20_levels', lv, 20); push('r3_collect_50', Math.floor(time/2), 50); break }
    case 'happy-wheels': { const wins = getLocalInt(win, ['wins','levels']) ?? Math.floor(plays/2); const deaths = getLocalInt(win, ['deaths']) ?? Math.floor(time/15); push('hw_first_level', wins, 1); push('hw_5_levels', wins, 5); push('hw_no_limb', wins >=1 ? 1 : 0, 1); push('hw_20_deaths', deaths, 20); push('hw_perfect', wins >=1 ? 1 : 0, 1); break }
    case 'wordle': { const w = getLocalInt(win, ['wins']) ?? Math.floor(plays/2); push('wd_first_win', w, 1); push('wd_5_wins', w, 5); push('wd_no_hint_win', w >=1 ? 1 : 0, 1); push('wd_streak_3', Math.floor(w/3), 3); push('wd_20_games', plays, 20); break }
    case 'granny': { push('gr_escape', getLocalInt(win, ['escapes']) ?? 0, 1); push('gr_5_minutes', time, 300); push('gr_find_key', getLocalInt(win, ['keys']) ?? (time>60?1:0), 1); push('gr_no_sound', 0, 1); push('gr_10_games', plays, 10); break }
    case 'snow-rider-3d': { const m = getLocalInt(win, ['distance','meters']) ?? Math.floor(time*8); push('sr3d_500m', m, 500); push('sr3d_2000m', m, 2000); push('sr3d_10_gifts', Math.floor(time/12), 10); push('sr3d_no_crash_30', time, 30); push('sr3d_50_tricks', Math.floor(time/4), 50); break }
    case 'n-gon': { const lv = getLocalInt(win, ['levels']) ?? Math.floor(time/25); push('ng_first_level', lv, 1); push('ng_10_levels', lv, 10); push('ng_no_death_5', lv, 5); push('ng_speedrun', time>0 && time<30 ? 1 : 0, 1); push('ng_20_levels', lv, 20); break }
    case 'minecraft-classic': { const br = getLocalInt(win, ['blocks']) ?? Math.floor(time*2); push('mc_first_block', 1, 1); push('mc_100_blocks', br, 100); push('mc_build_50', Math.floor(br*0.6), 50); push('mc_house', Math.floor(time/180), 1); push('mc_diamond', Math.floor(time/300), 1); break }
    case 'draw-climber': { const lv = getLocalInt(win, ['levels']) ?? Math.floor(time/20); push('dc_first_draw', 1, 1); push('dc_10_levels', lv, 10); push('dc_speed_20', time>0 && time<20 ? 1 : 0, 1); push('dc_no_retry', lv >=1 ? 1 : 0, 1); push('dc_30_draws', Math.floor(time/4), 30); break }
    case 'piano-tiles': { const tiles = getLocalInt(win, ['tiles','score']) ?? Math.floor(time*4); push('pt_first_song', plays, 1); push('pt_50_tiles', tiles, 50); push('pt_500_tiles', tiles, 500); push('pt_no_miss_30', Math.min(tiles,30), 30); push('pt_5_stars', Math.floor(plays/3), 1); break }
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
