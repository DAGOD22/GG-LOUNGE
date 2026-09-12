/**
 * GG Lounge — Achievement definitions (CrazyGames-style)
 * - 30 popular games, 6-8 achievements each (total ~200)
 * - Thematic: cookies baked, arrows fired, planets smashed, etc.
 * - Progress is tied to signed-in user and synced across devices via game_save + user_achievement
 * - GG Lounge can see progress (profile + in-game overlay)
 */

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond'

export interface Achievement {
  id: string
  gameId: string
  title: string
  description: string
  icon: string // emoji for now, rendered as text
  tier: AchievementTier
  target: number
  unit: string
  points: number
  rarity: 'common' | 'rare' | 'epic' | 'legendary'
}

export const ACHIEVEMENTS: Achievement[] = [
  // 1. Cookie Clicker — the classic idle
  { id: 'cc_first_cookie', gameId: 'cookie-clicker', title: 'First Crumb', description: 'Bake your first cookie', icon: '🍪', tier: 'bronze', target: 1, unit: 'cookies', points: 5, rarity: 'common' },
  { id: 'cc_100_cookies', gameId: 'cookie-clicker', title: 'Dough Starter', description: 'Bake 100 cookies', icon: '🥮', tier: 'bronze', target: 100, unit: 'cookies', points: 10, rarity: 'common' },
  { id: 'cc_1k_cookies', gameId: 'cookie-clicker', title: 'Baker', description: 'Bake 1,000 cookies', icon: '👩‍🍳', tier: 'silver', target: 1000, unit: 'cookies', points: 20, rarity: 'common' },
  { id: 'cc_10k_cookies', gameId: 'cookie-clicker', title: 'Factory Owner', description: 'Bake 10,000 cookies', icon: '🏭', tier: 'silver', target: 10000, unit: 'cookies', points: 30, rarity: 'rare' },
  { id: 'cc_100k_cookies', gameId: 'cookie-clicker', title: 'Cookie Industrialist', description: 'Bake 100,000 cookies', icon: '🌋', tier: 'gold', target: 100000, unit: 'cookies', points: 50, rarity: 'rare' },
  { id: 'cc_5_upgrades', gameId: 'cookie-clicker', title: 'Shopping Spree', description: 'Buy 5 upgrades', icon: '🛒', tier: 'bronze', target: 5, unit: 'upgrades', points: 15, rarity: 'common' },
  { id: 'cc_20_upgrades', gameId: 'cookie-clicker', title: 'Grandma\'s Blessing', description: 'Buy 20 upgrades', icon: '👵', tier: 'gold', target: 20, unit: 'upgrades', points: 40, rarity: 'epic' },
  { id: 'cc_cps_10', gameId: 'cookie-clicker', title: 'Conveyor Belt', description: 'Reach 10 cookies per second', icon: '⚡', tier: 'silver', target: 10, unit: 'cps', points: 25, rarity: 'rare' },

  // 2. Ragdoll Archers
  { id: 'ra_first_blood', gameId: 'ragdoll-archers', title: 'First Blood', description: 'Land your first headshot', icon: '🏹', tier: 'bronze', target: 1, unit: 'headshots', points: 5, rarity: 'common' },
  { id: 'ra_10_kills', gameId: 'ragdoll-archers', title: 'Sharpshooter', description: 'Get 10 kills', icon: '🎯', tier: 'bronze', target: 10, unit: 'kills', points: 10, rarity: 'common' },
  { id: 'ra_50_kills', gameId: 'ragdoll-archers', title: 'Bow Master', description: 'Get 50 kills', icon: '🏹‍🔥', tier: 'silver', target: 50, unit: 'kills', points: 25, rarity: 'rare' },
  { id: 'ra_100_arrows', gameId: 'ragdoll-archers', title: 'Arrow Rain', description: 'Fire 100 arrows', icon: '➶', tier: 'silver', target: 100, unit: 'arrows', points: 20, rarity: 'common' },
  { id: 'ra_25_headshots', gameId: 'ragdoll-archers', title: 'Anatomist', description: '25 headshots', icon: '🧠', tier: 'gold', target: 25, unit: 'headshots', points: 35, rarity: 'rare' },
  { id: 'ra_5_headshot_streak', gameId: 'ragdoll-archers', title: 'Unstoppable', description: '5 headshots in a row without missing', icon: '🔥', tier: 'gold', target: 5, unit: 'streak', points: 45, rarity: 'epic' },
  { id: 'ra_10_wins', gameId: 'ragdoll-archers', title: 'Duel Champion', description: 'Win 10 matches', icon: '👑', tier: 'platinum', target: 10, unit: 'wins', points: 50, rarity: 'epic' },

  // 3. Solar Smash
  { id: 'ss_first_planet', gameId: 'solar-smash', title: 'First Impact', description: 'Destroy your first planet', icon: '💥', tier: 'bronze', target: 1, unit: 'planets', points: 5, rarity: 'common' },
  { id: 'ss_5_planets', gameId: 'solar-smash', title: 'System Cleaner', description: 'Destroy 5 planets', icon: '🪐', tier: 'bronze', target: 5, unit: 'planets', points: 15, rarity: 'common' },
  { id: 'ss_10_planets', gameId: 'solar-smash', title: 'Galactic Menace', description: 'Destroy 10 planets', icon: '🌌', tier: 'silver', target: 10, unit: 'planets', points: 25, rarity: 'rare' },
  { id: 'ss_5_weapons', gameId: 'solar-smash', title: 'Arsenal', description: 'Try 5 different weapons', icon: '🔫', tier: 'silver', target: 5, unit: 'weapons', points: 20, rarity: 'common' },
  { id: 'ss_laser_planet', gameId: 'solar-smash', title: 'Death Ray', description: 'Destroy a planet with the laser', icon: '🔴', tier: 'gold', target: 1, unit: 'lasers', points: 30, rarity: 'rare' },
  { id: 'ss_blackhole', gameId: 'solar-smash', title: 'Event Horizon', description: 'Use the black hole', icon: '🕳️', tier: 'gold', target: 1, unit: 'blackholes', points: 35, rarity: 'epic' },
  { id: 'ss_50_planets', gameId: 'solar-smash', title: 'Universe Ender', description: 'Destroy 50 planets', icon: '☠️', tier: 'platinum', target: 50, unit: 'planets', points: 60, rarity: 'legendary' },

  // 4. Survival Race
  { id: 'sr_first_race', gameId: 'survival-race', title: 'Off the Line', description: 'Complete your first race', icon: '🏁', tier: 'bronze', target: 1, unit: 'races', points: 5, rarity: 'common' },
  { id: 'sr_100m', gameId: 'survival-race', title: 'Sprinter', description: 'Survive 100 meters', icon: '🏃', tier: 'bronze', target: 100, unit: 'meters', points: 10, rarity: 'common' },
  { id: 'sr_500m', gameId: 'survival-race', title: 'Marathon', description: 'Survive 500 meters', icon: '🏃‍♂️', tier: 'silver', target: 500, unit: 'meters', points: 20, rarity: 'rare' },
  { id: 'sr_5_races', gameId: 'survival-race', title: 'Persistent', description: 'Finish 5 races', icon: '🔁', tier: 'silver', target: 5, unit: 'races', points: 20, rarity: 'common' },
  { id: 'sr_no_crash_30s', gameId: 'survival-race', title: 'Flawless', description: 'Survive 30 seconds without crashing', icon: '✨', tier: 'gold', target: 30, unit: 'seconds', points: 30, rarity: 'rare' },
  { id: 'sr_1000m', gameId: 'survival-race', title: 'Untouchable', description: 'Survive 1000 meters', icon: '🚀', tier: 'platinum', target: 1000, unit: 'meters', points: 50, rarity: 'epic' },

  // 5. Drive Mad
  { id: 'dm_first_level', gameId: 'drive-mad', title: 'First Gear', description: 'Complete level 1', icon: '🚗', tier: 'bronze', target: 1, unit: 'levels', points: 5, rarity: 'common' },
  { id: 'dm_10_levels', gameId: 'drive-mad', title: 'Road Warrior', description: 'Complete 10 levels', icon: '🛣️', tier: 'silver', target: 10, unit: 'levels', points: 20, rarity: 'common' },
  { id: 'dm_25_levels', gameId: 'drive-mad', title: 'Mad Driver', description: 'Complete 25 levels', icon: '😈', tier: 'gold', target: 25, unit: 'levels', points: 35, rarity: 'rare' },
  { id: 'dm_no_flip', gameId: 'drive-mad', title: 'Perfect Balance', description: 'Complete a level without flipping', icon: '⚖️', tier: 'silver', target: 1, unit: 'flawless', points: 15, rarity: 'rare' },
  { id: 'dm_speedrun', gameId: 'drive-mad', title: 'Speed Demon', description: 'Finish a level in under 10 seconds', icon: '⏱️', tier: 'gold', target: 10, unit: 'seconds', points: 30, rarity: 'epic' },

  // 6. Slope
  { id: 'slope_100m', gameId: 'slope', title: 'Rolling', description: 'Travel 100 meters', icon: '🟢', tier: 'bronze', target: 100, unit: 'meters', points: 10, rarity: 'common' },
  { id: 'slope_500m', gameId: 'slope', title: 'Velocity', description: 'Travel 500 meters', icon: '💨', tier: 'silver', target: 500, unit: 'meters', points: 20, rarity: 'rare' },
  { id: 'slope_1000m', gameId: 'slope', title: 'Neon Legend', description: 'Travel 1000 meters', icon: '🌈', tier: 'gold', target: 1000, unit: 'meters', points: 35, rarity: 'rare' },
  { id: 'slope_5_games', gameId: 'slope', title: 'Addicted', description: 'Play 5 games', icon: '🔁', tier: 'bronze', target: 5, unit: 'games', points: 10, rarity: 'common' },
  { id: 'slope_dodge_10', gameId: 'slope', title: 'Matrix', description: 'Dodge 10 obstacles in a row', icon: '🕶️', tier: 'gold', target: 10, unit: 'dodges', points: 30, rarity: 'epic' },

  // 7. Retro Bowl
  { id: 'rb_first_td', gameId: 'retro-bowl', title: 'Touchdown!', description: 'Score your first touchdown', icon: '🏈', tier: 'bronze', target: 1, unit: 'touchdowns', points: 10, rarity: 'common' },
  { id: 'rb_5_tds', gameId: 'retro-bowl', title: 'End Zone', description: 'Score 5 touchdowns', icon: '🎯', tier: 'silver', target: 5, unit: 'touchdowns', points: 20, rarity: 'common' },
  { id: 'rb_win_game', gameId: 'retro-bowl', title: 'Winner', description: 'Win a game', icon: '🏆', tier: 'silver', target: 1, unit: 'wins', points: 15, rarity: 'common' },
  { id: 'rb_championship', gameId: 'retro-bowl', title: 'Champion', description: 'Win the Retro Bowl', icon: '👑', tier: 'platinum', target: 1, unit: 'bowls', points: 60, rarity: 'legendary' },
  { id: 'rb_200_yards', gameId: 'retro-bowl', title: 'Gunslinger', description: 'Throw for 200 yards in a game', icon: '💪', tier: 'gold', target: 200, unit: 'yards', points: 30, rarity: 'rare' },

  // 8. Stack
  { id: 'stack_10', gameId: 'stack', title: 'Foundation', description: 'Stack 10 blocks', icon: '🧱', tier: 'bronze', target: 10, unit: 'blocks', points: 10, rarity: 'common' },
  { id: 'stack_25', gameId: 'stack', title: 'High Rise', description: 'Stack 25 blocks', icon: '🏢', tier: 'silver', target: 25, unit: 'blocks', points: 20, rarity: 'rare' },
  { id: 'stack_50', gameId: 'stack', title: 'Skyscraper', description: 'Stack 50 blocks', icon: '🌇', tier: 'gold', target: 50, unit: 'blocks', points: 40, rarity: 'epic' },
  { id: 'stack_perfect_5', gameId: 'stack', title: 'Perfectionist', description: '5 perfect placements in a row', icon: '✨', tier: 'gold', target: 5, unit: 'perfects', points: 30, rarity: 'rare' },

  // 9. Drift Boss
  { id: 'db_100_drift', gameId: 'drift-boss', title: 'Sideways', description: 'Drift 100 meters', icon: '💨', tier: 'bronze', target: 100, unit: 'meters', points: 10, rarity: 'common' },
  { id: 'db_500_drift', gameId: 'drift-boss', title: 'Drift King', description: 'Drift 500 meters', icon: '👑', tier: 'silver', target: 500, unit: 'meters', points: 20, rarity: 'rare' },
  { id: 'db_10_games', gameId: 'drift-boss', title: 'Track Day', description: 'Play 10 games', icon: '🏁', tier: 'bronze', target: 10, unit: 'games', points: 15, rarity: 'common' },
  { id: 'db_no_crash', gameId: 'drift-boss', title: 'Clean Run', description: 'Survive 30 seconds without falling', icon: '🛡️', tier: 'gold', target: 30, unit: 'seconds', points: 30, rarity: 'epic' },

  // 10. Moto X3M
  { id: 'mx_first_level', gameId: 'moto-x3m', title: 'Kickstart', description: 'Complete first track', icon: '🏍️', tier: 'bronze', target: 1, unit: 'levels', points: 10, rarity: 'common' },
  { id: 'mx_5_levels', gameId: 'moto-x3m', title: 'Stunt Rider', description: 'Complete 5 levels', icon: '🤸', tier: 'silver', target: 5, unit: 'levels', points: 20, rarity: 'common' },
  { id: 'mx_flip', gameId: 'moto-x3m', title: 'Backflip', description: 'Do a backflip', icon: '🔄', tier: 'silver', target: 1, unit: 'flips', points: 15, rarity: 'rare' },
  { id: 'mx_3_stars', gameId: 'moto-x3m', title: 'Perfection', description: 'Get 3 stars on a level', icon: '⭐', tier: 'gold', target: 1, unit: 'stars', points: 25, rarity: 'rare' },

  // 11. Subway Surfers
  { id: 'ssurf_100_coins', gameId: 'subway-surfers', title: 'Coin Collector', description: 'Collect 100 coins', icon: '🪙', tier: 'bronze', target: 100, unit: 'coins', points: 10, rarity: 'common' },
  { id: 'ssurf_500_coins', gameId: 'subway-surfers', title: 'Vault', description: 'Collect 500 coins', icon: '💰', tier: 'silver', target: 500, unit: 'coins', points: 20, rarity: 'rare' },
  { id: 'ssurf_1000m', gameId: 'subway-surfers', title: 'Endless Runner', description: 'Run 1000 meters', icon: '🏃', tier: 'silver', target: 1000, unit: 'meters', points: 25, rarity: 'rare' },
  { id: 'ssurf_5_games', gameId: 'subway-surfers', title: 'Commuter', description: 'Play 5 runs', icon: '🚇', tier: 'bronze', target: 5, unit: 'runs', points: 10, rarity: 'common' },

  // 12. Geometry Dash
  { id: 'gd_first_level', gameId: 'geometry-dash', title: 'First Jump', description: 'Complete first level', icon: '🔷', tier: 'bronze', target: 1, unit: 'levels', points: 10, rarity: 'common' },
  { id: 'gd_10_attempts', gameId: 'geometry-dash', title: 'Persistence', description: 'Attempt a level 10 times', icon: '🔁', tier: 'bronze', target: 10, unit: 'attempts', points: 10, rarity: 'common' },
  { id: 'gd_no_death_30s', gameId: 'geometry-dash', title: 'Rhythm', description: 'Survive 30 seconds without dying', icon: '🎵', tier: 'silver', target: 30, unit: 'seconds', points: 20, rarity: 'rare' },
  { id: 'gd_complete_5', gameId: 'geometry-dash', title: 'Demon Slayer', description: 'Complete 5 levels', icon: '😈', tier: 'gold', target: 5, unit: 'levels', points: 40, rarity: 'epic' },

  // 13. 1v1.LOL
  { id: 'lol_first_kill', gameId: '1v1-lol', title: 'First Kill', description: 'Get your first elimination', icon: '💀', tier: 'bronze', target: 1, unit: 'kills', points: 10, rarity: 'common' },
  { id: 'lol_10_kills', gameId: '1v1-lol', title: 'Slayer', description: '10 kills', icon: '🔫', tier: 'silver', target: 10, unit: 'kills', points: 20, rarity: 'rare' },
  { id: 'lol_3_wins', gameId: '1v1-lol', title: 'Champion', description: 'Win 3 matches', icon: '🏆', tier: 'gold', target: 3, unit: 'wins', points: 30, rarity: 'epic' },
  { id: 'lol_build_50', gameId: '1v1-lol', title: 'Builder', description: 'Place 50 structures', icon: '🧱', tier: 'silver', target: 50, unit: 'builds', points: 20, rarity: 'common' },

  // 14. Hole.io
  { id: 'hole_5_kills', gameId: 'holeio', title: 'Appetizer', description: 'Eat 5 objects', icon: '🕳️', tier: 'bronze', target: 5, unit: 'eats', points: 10, rarity: 'common' },
  { id: 'hole_20_eats', gameId: 'holeio', title: 'Hungry', description: 'Eat 20 objects', icon: '🍽️', tier: 'silver', target: 20, unit: 'eats', points: 15, rarity: 'common' },
  { id: 'hole_win', gameId: 'holeio', title: 'Black Hole', description: 'Win a game', icon: '🌌', tier: 'gold', target: 1, unit: 'wins', points: 30, rarity: 'rare' },
  { id: 'hole_100_eats', gameId: 'holeio', title: 'Devourer', description: 'Eat 100 objects total', icon: '👹', tier: 'platinum', target: 100, unit: 'eats', points: 45, rarity: 'epic' },

  // 15. Drift Hunters
  { id: 'dh_5k_points', gameId: 'drift-hunters', title: 'Drifter', description: 'Score 5,000 drift points', icon: '💨', tier: 'bronze', target: 5000, unit: 'points', points: 15, rarity: 'common' },
  { id: 'dh_20k_points', gameId: 'drift-hunters', title: 'Smoke Show', description: 'Score 20,000 points', icon: '🌫️', tier: 'silver', target: 20000, unit: 'points', points: 25, rarity: 'rare' },
  { id: 'dh_upgrade_car', gameId: 'drift-hunters', title: 'Tuner', description: 'Upgrade your car', icon: '🔧', tier: 'bronze', target: 1, unit: 'upgrades', points: 10, rarity: 'common' },
  { id: 'dh_100k', gameId: 'drift-hunters', title: 'Legend', description: 'Score 100,000 points', icon: '👑', tier: 'gold', target: 100000, unit: 'points', points: 50, rarity: 'legendary' },

  // 16. Rooftop Snipers
  { id: 'rs_first_win', gameId: 'rooftop-snipers', title: 'Sniper', description: 'Win your first duel', icon: '🎯', tier: 'bronze', target: 1, unit: 'wins', points: 10, rarity: 'common' },
  { id: 'rs_5_wins', gameId: 'rooftop-snipers', title: 'Rooftop King', description: 'Win 5 duels', icon: '👑', tier: 'silver', target: 5, unit: 'wins', points: 20, rarity: 'rare' },
  { id: 'rs_10_headshots', gameId: 'rooftop-snipers', title: 'Deadeye', description: '10 headshots', icon: '🧠', tier: 'silver', target: 10, unit: 'headshots', points: 20, rarity: 'common' },

  // 17. World's Hardest Game
  { id: 'whg_level_1', gameId: 'worlds-hardest-game', title: 'Survivor', description: 'Beat level 1', icon: '😅', tier: 'bronze', target: 1, unit: 'levels', points: 15, rarity: 'common' },
  { id: 'whg_5_levels', gameId: 'worlds-hardest-game', title: 'Masochist', description: 'Beat 5 levels', icon: '😈', tier: 'silver', target: 5, unit: 'levels', points: 30, rarity: 'rare' },
  { id: 'whg_no_death', gameId: 'worlds-hardest-game', title: 'Flawless', description: 'Beat a level without dying', icon: '✨', tier: 'gold', target: 1, unit: 'flawless', points: 35, rarity: 'epic' },

  // 18. Fireboy & Watergirl
  { id: 'fw_first_level', gameId: 'fireboywatergirlforesttemple', title: 'Teamwork', description: 'Complete first level', icon: '🔥💧', tier: 'bronze', target: 1, unit: 'levels', points: 10, rarity: 'common' },
  { id: 'fw_5_levels', gameId: 'fireboywatergirlforesttemple', title: 'Elemental Duo', description: 'Complete 5 levels', icon: '🧩', tier: 'silver', target: 5, unit: 'levels', points: 25, rarity: 'rare' },
  { id: 'fw_collect_gems', gameId: 'fireboywatergirlforesttemple', title: 'Gem Hunter', description: 'Collect 50 gems', icon: '💎', tier: 'silver', target: 50, unit: 'gems', points: 20, rarity: 'common' },
  { id: 'fw_speedrun', gameId: 'fireboywatergirlforesttemple', title: 'Speedrun', description: 'Complete a level in under 60 seconds', icon: '⏱️', tier: 'gold', target: 60, unit: 'seconds', points: 30, rarity: 'epic' },

  // 19. Duck Life 2
  { id: 'dl_first_race', gameId: 'ducklife2', title: 'Quack Start', description: 'Win your first race', icon: '🦆', tier: 'bronze', target: 1, unit: 'races', points: 10, rarity: 'common' },
  { id: 'dl_5_wins', gameId: 'ducklife2', title: 'Champion Duck', description: 'Win 5 races', icon: '🏆', tier: 'silver', target: 5, unit: 'wins', points: 20, rarity: 'rare' },
  { id: 'dl_max_level', gameId: 'ducklife2', title: 'Super Duck', description: 'Max out a skill', icon: '💪', tier: 'gold', target: 1, unit: 'maxes', points: 35, rarity: 'epic' },
  { id: 'dl_10_races', gameId: 'ducklife2', title: 'Marathon Duck', description: 'Complete 10 races', icon: '🏁', tier: 'silver', target: 10, unit: 'races', points: 20, rarity: 'common' },

  // 20. Cluster Rush
  { id: 'cr_10_trucks', gameId: 'cluster-rush', title: 'Parkour', description: 'Jump 10 trucks', icon: '🚚', tier: 'bronze', target: 10, unit: 'trucks', points: 10, rarity: 'common' },
  { id: 'cr_50_trucks', gameId: 'cluster-rush', title: 'Truck Surfer', description: 'Jump 50 trucks', icon: '🏄', tier: 'silver', target: 50, unit: 'trucks', points: 25, rarity: 'rare' },
  { id: 'cr_no_fall', gameId: 'cluster-rush', title: 'Flawless Run', description: 'Complete a level without falling', icon: '✨', tier: 'gold', target: 1, unit: 'flawless', points: 30, rarity: 'epic' },

  // 21. Jetpack Joyride
  { id: 'jj_500m', gameId: 'jetpack-joyride', title: 'Jetpacker', description: 'Fly 500 meters', icon: '🚀', tier: 'bronze', target: 500, unit: 'meters', points: 15, rarity: 'common' },
  { id: 'jj_2000m', gameId: 'jetpack-joyride', title: 'Sky High', description: 'Fly 2000 meters', icon: '✈️', tier: 'silver', target: 2000, unit: 'meters', points: 25, rarity: 'rare' },
  { id: 'jj_100_coins', gameId: 'jetpack-joyride', title: 'Coin Magnet', description: 'Collect 100 coins', icon: '🪙', tier: 'bronze', target: 100, unit: 'coins', points: 10, rarity: 'common' },
  { id: 'jj_mission', gameId: 'jetpack-joyride', title: 'Mission Complete', description: 'Complete a mission', icon: '✅', tier: 'silver', target: 1, unit: 'missions', points: 20, rarity: 'common' },

  // 22. Tunnel Rush
  { id: 'tr_100m', gameId: 'tunnel-rush', title: 'Tunnel Vision', description: 'Travel 100 meters', icon: '🌀', tier: 'bronze', target: 100, unit: 'meters', points: 10, rarity: 'common' },
  { id: 'tr_500m', gameId: 'tunnel-rush', title: 'Speed Freak', description: 'Travel 500 meters', icon: '💨', tier: 'silver', target: 500, unit: 'meters', points: 20, rarity: 'rare' },
  { id: 'tr_no_crash_20s', gameId: 'tunnel-rush', title: 'Focus', description: 'Survive 20 seconds without crashing', icon: '🧘', tier: 'gold', target: 20, unit: 'seconds', points: 30, rarity: 'epic' },

  // 23. Doodle Jump
  { id: 'dj_1000_points', gameId: 'doodle-jump', title: 'Hopper', description: 'Score 1000 points', icon: '🦘', tier: 'bronze', target: 1000, unit: 'points', points: 10, rarity: 'common' },
  { id: 'dj_5000_points', gameId: 'doodle-jump', title: 'High Flyer', description: 'Score 5000 points', icon: '🚀', tier: 'silver', target: 5000, unit: 'points', points: 25, rarity: 'rare' },
  { id: 'dj_spring', gameId: 'doodle-jump', title: 'Boing', description: 'Use 5 springs', icon: '🌀', tier: 'bronze', target: 5, unit: 'springs', points: 10, rarity: 'common' },

  // 24. Temple Run 2
  { id: 'temple_500m', gameId: 'temple-run-2', title: 'Explorer', description: 'Run 500 meters', icon: '🏃', tier: 'bronze', target: 500, unit: 'meters', points: 10, rarity: 'common' },
  { id: 'temple_2000m', gameId: 'temple-run-2', title: 'Relic Hunter', description: 'Run 2000 meters', icon: '🗿', tier: 'silver', target: 2000, unit: 'meters', points: 25, rarity: 'rare' },
  { id: 'temple_100_coins', gameId: 'temple-run-2', title: 'Treasure', description: 'Collect 100 coins', icon: '🪙', tier: 'bronze', target: 100, unit: 'coins', points: 10, rarity: 'common' },
  { id: 'temple_no_crash', gameId: 'temple-run-2', title: 'Agile', description: 'Run 60 seconds without crashing', icon: '✨', tier: 'gold', target: 60, unit: 'seconds', points: 30, rarity: 'epic' },

  // 25. OvO
  { id: 'ovo_first_level', gameId: 'ovo', title: 'First Steps', description: 'Complete level 1', icon: '🦶', tier: 'bronze', target: 1, unit: 'levels', points: 10, rarity: 'common' },
  { id: 'ovo_10_levels', gameId: 'ovo', title: 'Flow State', description: 'Complete 10 levels', icon: '🌊', tier: 'silver', target: 10, unit: 'levels', points: 25, rarity: 'rare' },
  { id: 'ovo_speedrun', gameId: 'ovo', title: 'Speed Demon', description: 'Complete a level in under 30 seconds', icon: '⚡', tier: 'gold', target: 30, unit: 'seconds', points: 30, rarity: 'epic' },
  { id: 'ovo_no_death', gameId: 'ovo', title: 'Flawless', description: 'Complete a level without dying', icon: '💎', tier: 'gold', target: 1, unit: 'flawless', points: 35, rarity: 'epic' },

  // 26. Vex 8
  { id: 'vex_first_level', gameId: 'vex-8', title: 'Initiate', description: 'Complete Act 1', icon: '🏃', tier: 'bronze', target: 1, unit: 'levels', points: 10, rarity: 'common' },
  { id: 'vex_5_levels', gameId: 'vex-8', title: 'Ninja', description: 'Complete 5 levels', icon: '🥷', tier: 'silver', target: 5, unit: 'levels', points: 25, rarity: 'rare' },
  { id: 'vex_no_death', gameId: 'vex-8', title: 'Ghost', description: 'Complete a level without dying', icon: '👻', tier: 'gold', target: 1, unit: 'flawless', points: 35, rarity: 'epic' },
  { id: 'vex_10_levels', gameId: 'vex-8', title: 'Master', description: 'Complete 10 levels', icon: '👑', tier: 'platinum', target: 10, unit: 'levels', points: 50, rarity: 'legendary' },

  // 27. EaglercraftX
  { id: 'eag_10_blocks', gameId: 'eaglercraftx', title: 'Miner', description: 'Break 10 blocks', icon: '⛏️', tier: 'bronze', target: 10, unit: 'blocks', points: 10, rarity: 'common' },
  { id: 'eag_craft', gameId: 'eaglercraftx', title: 'Crafter', description: 'Craft your first item', icon: '🔨', tier: 'bronze', target: 1, unit: 'crafts', points: 10, rarity: 'common' },
  { id: 'eag_house', gameId: 'eaglercraftx', title: 'Builder', description: 'Build a house (place 50 blocks)', icon: '🏠', tier: 'silver', target: 50, unit: 'blocks', points: 20, rarity: 'rare' },
  { id: 'eag_diamond', gameId: 'eaglercraftx', title: 'Diamond Hunter', description: 'Find diamonds', icon: '💎', tier: 'gold', target: 1, unit: 'diamonds', points: 40, rarity: 'epic' },

  // 28. Backrooms
  { id: 'br_first_level', gameId: 'backrooms', title: 'NoClip', description: 'Enter the Backrooms', icon: '🚪', tier: 'bronze', target: 1, unit: 'entries', points: 10, rarity: 'common' },
  { id: 'br_5_minutes', gameId: 'backrooms', title: 'Wanderer', description: 'Survive 5 minutes', icon: '⏱️', tier: 'silver', target: 300, unit: 'seconds', points: 25, rarity: 'rare' },
  { id: 'br_find_exit', gameId: 'backrooms', title: 'Escapee', description: 'Find the exit', icon: '🚪✨', tier: 'gold', target: 1, unit: 'exits', points: 45, rarity: 'legendary' },

  // 29. Among Us
  { id: 'am_first_game', gameId: 'among-us', title: 'Crewmate', description: 'Complete your first game', icon: '👨‍🚀', tier: 'bronze', target: 1, unit: 'games', points: 10, rarity: 'common' },
  { id: 'am_5_tasks', gameId: 'among-us', title: 'Task Master', description: 'Complete 5 tasks', icon: '✅', tier: 'bronze', target: 5, unit: 'tasks', points: 10, rarity: 'common' },
  { id: 'am_impostor', gameId: 'among-us', title: 'Impostor', description: 'Win as impostor', icon: '🔪', tier: 'silver', target: 1, unit: 'wins', points: 25, rarity: 'rare' },
  { id: 'am_10_wins', gameId: 'among-us', title: 'Deceiver', description: 'Win 10 games', icon: '👑', tier: 'gold', target: 10, unit: 'wins', points: 40, rarity: 'epic' },

  // 30. Paper.io 2 (poki)
  { id: 'paper_10_percent', gameId: 'poki', title: 'Land Grab', description: 'Claim 10% of the map', icon: '🗺️', tier: 'bronze', target: 10, unit: 'percent', points: 10, rarity: 'common' },
  { id: 'paper_50_percent', gameId: 'poki', title: 'Conqueror', description: 'Claim 50% of the map', icon: '🏴', tier: 'silver', target: 50, unit: 'percent', points: 25, rarity: 'rare' },
  { id: 'paper_5_kills', gameId: 'poki', title: 'Tail Cutter', description: 'Eliminate 5 players', icon: '✂️', tier: 'silver', target: 5, unit: 'kills', points: 20, rarity: 'common' },
  { id: 'paper_win', gameId: 'poki', title: 'Paper Master', description: 'Win a game (100%)', icon: '👑', tier: 'platinum', target: 1, unit: 'wins', points: 50, rarity: 'epic' } ,

  // 31. Level Devil
  { id: 'ld_first_troll', gameId: 'level-devil', title: 'Trolled', description: 'Fall for your first hidden spike — welcome to Level Devil', icon: '😵', tier: 'bronze', target: 1, unit: 'trolls', points: 10, rarity: 'common' },
  { id: 'ld_5_trolls', gameId: 'level-devil', title: 'Paranoid', description: 'Survive 5 troll levels with eyes wide open', icon: '👀', tier: 'silver', target: 5, unit: 'levels', points: 20, rarity: 'rare' },
  { id: 'ld_10_levels', gameId: 'level-devil', title: 'Trust No One', description: 'Complete 10 levels without trusting the floor', icon: '🧠', tier: 'silver', target: 10, unit: 'levels', points: 25, rarity: 'rare' },
  { id: 'ld_no_death', gameId: 'level-devil', title: 'Flawless Trickster', description: 'Beat a level without dying', icon: '✨', tier: 'gold', target: 1, unit: 'flawless', points: 35, rarity: 'epic' },
  { id: 'ld_speedrun_30', gameId: 'level-devil', title: 'Speed Troll', description: 'Beat a level in under 30 seconds', icon: '⚡', tier: 'gold', target: 30, unit: 'seconds', points: 30, rarity: 'epic' },
  { id: 'ld_20_deaths', gameId: 'level-devil', title: 'Rage Quit? Never', description: 'Die 20 times and keep coming back', icon: '💀', tier: 'bronze', target: 20, unit: 'deaths', points: 15, rarity: 'common' },

  // 32. Idle Mining Empire
  { id: 'im_first_ore', gameId: 'idle-mining', title: 'First Nugget', description: 'Mine your first ore', icon: '⛏️', tier: 'bronze', target: 1, unit: 'ores', points: 5, rarity: 'common' },
  { id: 'im_1000_gold', gameId: 'idle-mining', title: 'Gold Rush', description: 'Earn 1,000 gold', icon: '💰', tier: 'bronze', target: 1000, unit: 'gold', points: 15, rarity: 'common' },
  { id: 'im_10_upgrades', gameId: 'idle-mining', title: 'Tycoon', description: 'Buy 10 mine upgrades', icon: '🛒', tier: 'silver', target: 10, unit: 'upgrades', points: 20, rarity: 'rare' },
  { id: 'im_deep_1000', gameId: 'idle-mining', title: 'Deep Diver', description: 'Dig 1000m deep', icon: '🕳️', tier: 'silver', target: 1000, unit: 'meters', points: 25, rarity: 'rare' },
  { id: 'im_prestige', gameId: 'idle-mining', title: 'Prestige', description: 'Prestige your mine once', icon: '🔄', tier: 'gold', target: 1, unit: 'prestiges', points: 40, rarity: 'epic' },
  { id: 'im_1m_gold', gameId: 'idle-mining', title: 'Millionaire Miner', description: 'Earn 1,000,000 gold', icon: '🏦', tier: 'platinum', target: 1000000, unit: 'gold', points: 60, rarity: 'legendary' },

  // 33. Stickman Hook
  { id: 'sh_first_swing', gameId: 'stickman-hook', title: 'First Swing', description: 'Complete first level with a single hook', icon: '🪝', tier: 'bronze', target: 1, unit: 'levels', points: 10, rarity: 'common' },
  { id: 'sh_10_levels', gameId: 'stickman-hook', title: 'Tarzan', description: 'Swing through 10 levels', icon: '🌴', tier: 'silver', target: 10, unit: 'levels', points: 20, rarity: 'rare' },
  { id: 'sh_no_fall', gameId: 'stickman-hook', title: 'Grip Master', description: 'Beat a level without falling', icon: '🧗', tier: 'silver', target: 1, unit: 'flawless', points: 25, rarity: 'rare' },
  { id: 'sh_speed_20', gameId: 'stickman-hook', title: 'Velocity', description: 'Beat a level in under 20 seconds', icon: '💨', tier: 'gold', target: 20, unit: 'seconds', points: 30, rarity: 'epic' },
  { id: 'sh_50_swings', gameId: 'stickman-hook', title: 'Swing King', description: 'Perform 50 grapple swings', icon: '🔄', tier: 'bronze', target: 50, unit: 'swings', points: 15, rarity: 'common' },

  // 34. Hextris
  { id: 'hx_first_spin', gameId: 'hextris', title: 'First Spin', description: 'Rotate hex for first line clear', icon: '⬡', tier: 'bronze', target: 1, unit: 'spins', points: 10, rarity: 'common' },
  { id: 'hx_500_points', gameId: 'hextris', title: 'Hex Apprentice', description: 'Score 500 points', icon: '🔷', tier: 'bronze', target: 500, unit: 'points', points: 15, rarity: 'common' },
  { id: 'hx_5000_points', gameId: 'hextris', title: 'Hex Master', description: 'Score 5,000 points', icon: '💠', tier: 'silver', target: 5000, unit: 'points', points: 25, rarity: 'rare' },
  { id: 'hx_10_combos', gameId: 'hextris', title: 'Combo Hex', description: 'Chain 10 combos in a row', icon: '✨', tier: 'gold', target: 10, unit: 'combos', points: 30, rarity: 'epic' },
  { id: 'hx_survive_60', gameId: 'hextris', title: 'Survivor', description: 'Survive 60 seconds', icon: '⏱️', tier: 'silver', target: 60, unit: 'seconds', points: 20, rarity: 'common' },
  { id: 'hx_20000', gameId: 'hextris', title: 'Hex Legend', description: 'Score 20,000 points', icon: '👑', tier: 'platinum', target: 20000, unit: 'points', points: 50, rarity: 'legendary' },

  // 35. 2048
  { id: 'tfe_first_512', gameId: '2048', title: 'Halfway Hero', description: 'Reach 512 tile', icon: '🔢', tier: 'bronze', target: 512, unit: 'tile', points: 10, rarity: 'common' },
  { id: 'tfe_1024', gameId: '2048', title: '1024!', description: 'Reach 1024 tile', icon: '🧮', tier: 'silver', target: 1024, unit: 'tile', points: 20, rarity: 'rare' },
  { id: 'tfe_2048', gameId: '2048', title: '2048!', description: 'Reach 2048 tile and win', icon: '🎉', tier: 'gold', target: 2048, unit: 'tile', points: 40, rarity: 'epic' },
  { id: 'tfe_4096', gameId: '2048', title: '4096 Overkill', description: 'Reach 4096 — beyond the game', icon: '🚀', tier: 'platinum', target: 4096, unit: 'tile', points: 60, rarity: 'legendary' },
  { id: 'tfe_10_games', gameId: '2048', title: 'Strategist', description: 'Play 10 games', icon: '♟️', tier: 'bronze', target: 10, unit: 'games', points: 10, rarity: 'common' },
  { id: 'tfe_no_undo', gameId: '2048', title: 'Pure Skill', description: 'Win without undo', icon: '✨', tier: 'gold', target: 1, unit: 'wins', points: 35, rarity: 'epic' },

  // 36. Chrome Dino
  { id: 'dino_100m', gameId: 'chrome-dino', title: 'First Dash', description: 'Run 100 meters as the dino', icon: '🦖', tier: 'bronze', target: 100, unit: 'meters', points: 10, rarity: 'common' },
  { id: 'dino_500m', gameId: 'chrome-dino', title: 'Desert Runner', description: 'Run 500 meters', icon: '🏜️', tier: 'silver', target: 500, unit: 'meters', points: 20, rarity: 'rare' },
  { id: 'dino_2000m', gameId: 'chrome-dino', title: 'Dino Legend', description: 'Run 2000 meters — no internet needed', icon: '🌋', tier: 'gold', target: 2000, unit: 'meters', points: 35, rarity: 'epic' },
  { id: 'dino_5_birds', gameId: 'chrome-dino', title: 'Duck!', description: 'Dodge 5 pterodactyls', icon: '🦅', tier: 'bronze', target: 5, unit: 'birds', points: 15, rarity: 'common' },
  { id: 'dino_no_crash_30', gameId: 'chrome-dino', title: 'Cactus Whisperer', description: 'Survive 30 seconds clean', icon: '🌵', tier: 'silver', target: 30, unit: 'seconds', points: 20, rarity: 'common' },

  // 37. Monkey Mart
  { id: 'mm_first_sale', gameId: 'monkey-mart', title: 'First Sale', description: 'Serve first customer', icon: '🐒', tier: 'bronze', target: 1, unit: 'sales', points: 10, rarity: 'common' },
  { id: 'mm_100_sales', gameId: 'monkey-mart', title: 'Shopkeeper', description: 'Make 100 sales', icon: '🛒', tier: 'silver', target: 100, unit: 'sales', points: 20, rarity: 'rare' },
  { id: 'mm_upgrade_5', gameId: 'monkey-mart', title: 'Expansion', description: 'Buy 5 shop upgrades', icon: '🏪', tier: 'silver', target: 5, unit: 'upgrades', points: 20, rarity: 'common' },
  { id: 'mm_10k_gold', gameId: 'monkey-mart', title: 'Banana Tycoon', description: 'Earn 10,000 coins', icon: '🍌', tier: 'gold', target: 10000, unit: 'coins', points: 35, rarity: 'epic' },
  { id: 'mm_no_wait', gameId: 'monkey-mart', title: 'Speed Service', description: 'Serve 10 customers with no wait', icon: '⚡', tier: 'gold', target: 10, unit: 'fast', points: 30, rarity: 'rare' },

  // 38. Krunker
  { id: 'kr_first_kill', gameId: 'krunker', title: 'First Blood', description: 'Get first Krunker kill', icon: '💥', tier: 'bronze', target: 1, unit: 'kills', points: 10, rarity: 'common' },
  { id: 'kr_25_kills', gameId: 'krunker', title: 'Fragger', description: 'Get 25 kills', icon: '🔫', tier: 'silver', target: 25, unit: 'kills', points: 25, rarity: 'rare' },
  { id: 'kr_5_wins', gameId: 'krunker', title: 'Lobby Legend', description: 'Win 5 matches', icon: '🏆', tier: 'gold', target: 5, unit: 'wins', points: 35, rarity: 'epic' },
  { id: 'kr_headshot_10', gameId: 'krunker', title: 'Head Hunter', description: 'Land 10 headshots', icon: '🎯', tier: 'silver', target: 10, unit: 'headshots', points: 20, rarity: 'common' },
  { id: 'kr_noscope', gameId: 'krunker', title: 'No Scope Hero', description: 'No-scope kill', icon: '👁️', tier: 'gold', target: 1, unit: 'noscopes', points: 30, rarity: 'epic' },

  // 39. SmashKarts
  { id: 'sk_first_race', gameId: 'smashkarts', title: 'Start Engines', description: 'Finish first SmashKarts race', icon: '🏁', tier: 'bronze', target: 1, unit: 'races', points: 10, rarity: 'common' },
  { id: 'sk_5_wins', gameId: 'smashkarts', title: 'Podium Finish', description: 'Win 5 races', icon: '🥇', tier: 'silver', target: 5, unit: 'wins', points: 25, rarity: 'rare' },
  { id: 'sk_10_kills', gameId: 'smashkarts', title: 'Demolition', description: 'Eliminate 10 players with weapons', icon: '💣', tier: 'silver', target: 10, unit: 'kills', points: 20, rarity: 'common' },
  { id: 'sk_powerup_20', gameId: 'smashkarts', title: 'Power Hungry', description: 'Collect 20 powerups', icon: '⚡', tier: 'bronze', target: 20, unit: 'powerups', points: 15, rarity: 'common' },
  { id: 'sk_no_hit_win', gameId: 'smashkarts', title: 'Flawless Victory', description: 'Win without getting hit', icon: '🛡️', tier: 'gold', target: 1, unit: 'flawless', points: 40, rarity: 'legendary' },

  // 40. Crossy Road
  { id: 'cr2_50_steps', gameId: 'crossyroad', title: 'Jaywalker', description: 'Hop 50 steps', icon: '🐥', tier: 'bronze', target: 50, unit: 'steps', points: 10, rarity: 'common' },
  { id: 'cr2_200_steps', gameId: 'crossyroad', title: 'Commuter', description: 'Hop 200 steps', icon: '🚶', tier: 'silver', target: 200, unit: 'steps', points: 20, rarity: 'rare' },
  { id: 'cr2_collect_20', gameId: 'crossyroad', title: 'Coin Collector', description: 'Collect 20 coins', icon: '🪙', tier: 'bronze', target: 20, unit: 'coins', points: 15, rarity: 'common' },
  { id: 'cr2_no_death_100', gameId: 'crossyroad', title: 'Careful Crosser', description: '100 steps without dying', icon: '✨', tier: 'gold', target: 100, unit: 'steps', points: 30, rarity: 'epic' },
  { id: 'cr2_unlock_char', gameId: 'crossyroad', title: 'Wardrobe', description: 'Unlock a new character', icon: '🎭', tier: 'silver', target: 1, unit: 'unlocks', points: 20, rarity: 'common' },

  // 41. Flappy Bird
  { id: 'fb_first_pipe', gameId: 'flappy-bird', title: 'First Pipe', description: 'Pass your first pipe', icon: '🐦', tier: 'bronze', target: 1, unit: 'pipes', points: 10, rarity: 'common' },
  { id: 'fb_10_pipes', gameId: 'flappy-bird', title: 'Flapper', description: 'Pass 10 pipes', icon: '🌬️', tier: 'silver', target: 10, unit: 'pipes', points: 20, rarity: 'rare' },
  { id: 'fb_30_pipes', gameId: 'flappy-bird', title: 'Sky Master', description: 'Pass 30 pipes in one run', icon: '☁️', tier: 'gold', target: 30, unit: 'pipes', points: 35, rarity: 'epic' },
  { id: 'fb_5_games', gameId: 'flappy-bird', title: 'Addicted', description: 'Play 5 games', icon: '🔁', tier: 'bronze', target: 5, unit: 'games', points: 10, rarity: 'common' },
  { id: 'fb_no_crash_20', gameId: 'flappy-bird', title: 'Zen Bird', description: 'Survive 20 pipes without crashing', icon: '🧘', tier: 'gold', target: 20, unit: 'pipes', points: 30, rarity: 'rare' },

  // 42. Run 3
  { id: 'r3_level_1', gameId: 'run-3', title: 'First Gap', description: 'Beat level 1 in the tunnel', icon: '🏃', tier: 'bronze', target: 1, unit: 'levels', points: 10, rarity: 'common' },
  { id: 'r3_10_levels', gameId: 'run-3', title: 'Space Runner', description: 'Beat 10 levels', icon: '🌌', tier: 'silver', target: 10, unit: 'levels', points: 25, rarity: 'rare' },
  { id: 'r3_no_fall', gameId: 'run-3', title: 'Grip', description: 'Beat a level without falling into space', icon: '🛸', tier: 'gold', target: 1, unit: 'flawless', points: 30, rarity: 'epic' },
  { id: 'r3_20_levels', gameId: 'run-3', title: 'Infinite Runner', description: 'Beat 20 levels', icon: '♾️', tier: 'platinum', target: 20, unit: 'levels', points: 50, rarity: 'legendary' },
  { id: 'r3_collect_50', gameId: 'run-3', title: 'Hoarder', description: 'Collect 50 power cells', icon: '🔋', tier: 'bronze', target: 50, unit: 'cells', points: 15, rarity: 'common' },

  // 43. Happy Wheels
  { id: 'hw_first_level', gameId: 'happy-wheels', title: 'First Blood', description: 'Beat first level (or die spectacularly)', icon: '🩸', tier: 'bronze', target: 1, unit: 'levels', points: 10, rarity: 'common' },
  { id: 'hw_5_levels', gameId: 'happy-wheels', title: 'Survivor', description: 'Beat 5 levels', icon: '🦽', tier: 'silver', target: 5, unit: 'levels', points: 25, rarity: 'rare' },
  { id: 'hw_no_limb', gameId: 'happy-wheels', title: 'Flesh Wound', description: 'Finish a level missing a limb', icon: '🦾', tier: 'gold', target: 1, unit: 'wins', points: 35, rarity: 'epic' },
  { id: 'hw_20_deaths', gameId: 'happy-wheels', title: 'Ragdoll Science', description: 'Die 20 times for science', icon: '💀', tier: 'bronze', target: 20, unit: 'deaths', points: 15, rarity: 'common' },
  { id: 'hw_perfect', gameId: 'happy-wheels', title: 'Unscathed', description: 'Win without losing limbs', icon: '✨', tier: 'platinum', target: 1, unit: 'flawless', points: 45, rarity: 'legendary' },

  // 44. Wordle
  { id: 'wd_first_win', gameId: 'wordle', title: 'Wordsmith', description: 'Guess your first word correctly', icon: '📝', tier: 'bronze', target: 1, unit: 'wins', points: 10, rarity: 'common' },
  { id: 'wd_5_wins', gameId: 'wordle', title: 'Vocabulary', description: 'Win 5 games', icon: '📚', tier: 'silver', target: 5, unit: 'wins', points: 20, rarity: 'rare' },
  { id: 'wd_no_hint_win', gameId: 'wordle', title: 'Pure Brain', description: 'Win in 2 guesses', icon: '🧠', tier: 'gold', target: 1, unit: 'wins', points: 35, rarity: 'epic' },
  { id: 'wd_streak_3', gameId: 'wordle', title: 'Streak Starter', description: 'Win 3 in a row', icon: '🔥', tier: 'gold', target: 3, unit: 'streak', points: 30, rarity: 'rare' },
  { id: 'wd_20_games', gameId: 'wordle', title: 'Librarian', description: 'Play 20 games', icon: '🏛️', tier: 'bronze', target: 20, unit: 'games', points: 15, rarity: 'common' },

  // 45. Granny
  { id: 'gr_escape', gameId: 'granny', title: 'Escape!', description: 'Escape Granny’s house', icon: '🏚️', tier: 'gold', target: 1, unit: 'escapes', points: 40, rarity: 'epic' },
  { id: 'gr_5_minutes', gameId: 'granny', title: 'Hiding Expert', description: 'Survive 5 minutes', icon: '⏳', tier: 'silver', target: 300, unit: 'seconds', points: 25, rarity: 'rare' },
  { id: 'gr_find_key', gameId: 'granny', title: 'Key Hunter', description: 'Find the padlock key', icon: '🔑', tier: 'bronze', target: 1, unit: 'keys', points: 15, rarity: 'common' },
  { id: 'gr_no_sound', gameId: 'granny', title: 'Silent Escape', description: 'Escape without making a sound', icon: '🤫', tier: 'platinum', target: 1, unit: 'stealth', points: 50, rarity: 'legendary' },
  { id: 'gr_10_games', gameId: 'granny', title: 'Frequent Visitor', description: 'Play 10 times and live', icon: '👵', tier: 'bronze', target: 10, unit: 'games', points: 10, rarity: 'common' },

  // 46. Snow Rider 3D
  { id: 'sr3d_500m', gameId: 'snow-rider-3d', title: 'Fresh Powder', description: 'Ride 500 meters', icon: '🏂', tier: 'bronze', target: 500, unit: 'meters', points: 15, rarity: 'common' },
  { id: 'sr3d_2000m', gameId: 'snow-rider-3d', title: 'Alpine Legend', description: 'Ride 2000 meters', icon: '🏔️', tier: 'silver', target: 2000, unit: 'meters', points: 25, rarity: 'rare' },
  { id: 'sr3d_10_gifts', gameId: 'snow-rider-3d', title: 'Gift Hunter', description: 'Collect 10 gifts', icon: '🎁', tier: 'bronze', target: 10, unit: 'gifts', points: 20, rarity: 'common' },
  { id: 'sr3d_no_crash_30', gameId: 'snow-rider-3d', title: 'Carve', description: 'Ride 30 seconds without crashing', icon: '❄️', tier: 'gold', target: 30, unit: 'seconds', points: 30, rarity: 'epic' },
  { id: 'sr3d_50_tricks', gameId: 'snow-rider-3d', title: 'Stylish', description: 'Land 50 tricks', icon: '🤸', tier: 'silver', target: 50, unit: 'tricks', points: 20, rarity: 'common' },

  // 47. N-GON
  { id: 'ng_first_level', gameId: 'n-gon', title: 'N-Goner', description: 'Beat first portal', icon: '🔺', tier: 'bronze', target: 1, unit: 'levels', points: 10, rarity: 'common' },
  { id: 'ng_10_levels', gameId: 'n-gon', title: 'Geometer', description: 'Beat 10 levels', icon: '📐', tier: 'silver', target: 10, unit: 'levels', points: 25, rarity: 'rare' },
  { id: 'ng_no_death_5', gameId: 'n-gon', title: 'Precision Portal', description: 'Clear 5 levels without dying', icon: '✨', tier: 'gold', target: 5, unit: 'flawless', points: 35, rarity: 'epic' },
  { id: 'ng_speedrun', gameId: 'n-gon', title: 'Quick Maths', description: 'Beat a level in under 30 seconds', icon: '⚡', tier: 'gold', target: 30, unit: 'seconds', points: 30, rarity: 'rare' },
  { id: 'ng_20_levels', gameId: 'n-gon', title: 'The Theorem', description: 'Beat 20 levels', icon: '🏆', tier: 'platinum', target: 20, unit: 'levels', points: 50, rarity: 'legendary' },

  // 48. Minecraft Classic
  { id: 'mc_first_block', gameId: 'minecraft-classic', title: 'Punch a Tree', description: 'Break your first block', icon: '🌳', tier: 'bronze', target: 1, unit: 'blocks', points: 10, rarity: 'common' },
  { id: 'mc_100_blocks', gameId: 'minecraft-classic', title: 'Miner', description: 'Break 100 blocks', icon: '⛏️', tier: 'silver', target: 100, unit: 'blocks', points: 20, rarity: 'rare' },
  { id: 'mc_build_50', gameId: 'minecraft-classic', title: 'Builder', description: 'Place 50 blocks', icon: '🏗️', tier: 'silver', target: 50, unit: 'blocks', points: 20, rarity: 'common' },
  { id: 'mc_house', gameId: 'minecraft-classic', title: 'Home Sweet Home', description: 'Build a house', icon: '🏠', tier: 'gold', target: 1, unit: 'houses', points: 35, rarity: 'epic' },
  { id: 'mc_diamond', gameId: 'minecraft-classic', title: 'Diamond Seeker', description: 'Dig down and find the diamond layer', icon: '💎', tier: 'platinum', target: 1, unit: 'finds', points: 50, rarity: 'legendary' },

  // 49. Draw Climber
  { id: 'dc_first_draw', gameId: 'draw-climber', title: 'First Legs', description: 'Draw your first wobbly legs', icon: '✏️', tier: 'bronze', target: 1, unit: 'draws', points: 10, rarity: 'common' },
  { id: 'dc_10_levels', gameId: 'draw-climber', title: 'Artist', description: 'Beat 10 levels', icon: '🎨', tier: 'silver', target: 10, unit: 'levels', points: 20, rarity: 'rare' },
  { id: 'dc_speed_20', gameId: 'draw-climber', title: 'Speed Sketch', description: 'Beat a level in under 20 seconds', icon: '⚡', tier: 'gold', target: 20, unit: 'seconds', points: 30, rarity: 'epic' },
  { id: 'dc_no_retry', gameId: 'draw-climber', title: 'One Shot', description: 'Beat a level first try', icon: '✨', tier: 'silver', target: 1, unit: 'flawless', points: 25, rarity: 'rare' },
  { id: 'dc_30_draws', gameId: 'draw-climber', title: 'Sketcher', description: 'Draw 30 times', icon: '🖌️', tier: 'bronze', target: 30, unit: 'draws', points: 15, rarity: 'common' },

  // 50. Piano Tiles
  { id: 'pt_first_song', gameId: 'piano-tiles', title: 'First Note', description: 'Complete your first song', icon: '🎹', tier: 'bronze', target: 1, unit: 'songs', points: 10, rarity: 'common' },
  { id: 'pt_50_tiles', gameId: 'piano-tiles', title: 'Tapper', description: 'Tap 50 black tiles', icon: '🎵', tier: 'bronze', target: 50, unit: 'tiles', points: 15, rarity: 'common' },
  { id: 'pt_500_tiles', gameId: 'piano-tiles', title: 'Virtuoso', description: 'Tap 500 tiles without missing', icon: '🎼', tier: 'silver', target: 500, unit: 'tiles', points: 25, rarity: 'rare' },
  { id: 'pt_no_miss_30', gameId: 'piano-tiles', title: 'Perfect Pitch', description: 'Hit 30 tiles in a row', icon: '✨', tier: 'gold', target: 30, unit: 'perfect', points: 35, rarity: 'epic' },
  { id: 'pt_5_stars', gameId: 'piano-tiles', title: 'Maestro', description: 'Get 5 stars on a song', icon: '⭐', tier: 'platinum', target: 1, unit: 'stars', points: 45, rarity: 'legendary' },

  // BONUS: Extra hidden & mastery for existing favorites (makes old ones not horrible)
  { id: 'cc_1m_cookies', gameId: 'cookie-clicker', title: 'Cookieverse', description: 'Bake 1,000,000 cookies — the factory never sleeps', icon: '🌌', tier: 'diamond', target: 1000000, unit: 'cookies', points: 100, rarity: 'legendary' },
  { id: 'cc_golden_cookie', gameId: 'cookie-clicker', title: 'Golden Touch', description: 'Click a golden cookie', icon: '🌟', tier: 'gold', target: 1, unit: 'golden', points: 35, rarity: 'epic' },
  { id: 'slope_2500m', gameId: 'slope', title: 'Beyond Neon', description: 'Travel 2,500 meters — are you even human?', icon: '🚀', tier: 'diamond', target: 2500, unit: 'meters', points: 70, rarity: 'legendary' },
  { id: 'stack_100', gameId: 'stack', title: 'Heaven Piercer', description: 'Stack 100 blocks perfectly', icon: '🏙️', tier: 'diamond', target: 100, unit: 'blocks', points: 80, rarity: 'legendary' },
  { id: 'gd_100_attempts', gameId: 'geometry-dash', title: 'Masochist', description: 'Attempt a level 100 times', icon: '😵', tier: 'platinum', target: 100, unit: 'attempts', points: 50, rarity: 'epic' },
  { id: 'hole_500_eats', gameId: 'holeio', title: 'Consume Everything', description: 'Eat 500 objects in total', icon: '🕳️✨', tier: 'diamond', target: 500, unit: 'eats', points: 80, rarity: 'legendary' },

]

export function getAchievementsForGame(gameId: string): Achievement[] {
  return ACHIEVEMENTS.filter(a => a.gameId === gameId)
}

export function getAchievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find(a => a.id === id)
}

export const GAMES_WITH_ACHIEVEMENTS = Array.from(new Set(ACHIEVEMENTS.map(a => a.gameId)))

export const RARITY_COLOR: Record<string, string> = {
  common: '#9ca3af',
  rare: '#60a5fa',
  epic: '#a78bfa',
  legendary: '#facc15',
}
