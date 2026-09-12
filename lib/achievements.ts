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
  { id: 'paper_win', gameId: 'poki', title: 'Paper Master', description: 'Win a game (100%)', icon: '👑', tier: 'platinum', target: 1, unit: 'wins', points: 50, rarity: 'epic' },
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
