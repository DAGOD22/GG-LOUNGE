'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, Gamepad2, Heart, Maximize2, Play, Search, ShieldCheck, Sparkles, Trophy, X, Zap } from 'lucide-react'

type Game = { id: string; title: string; subtitle: string; description: string; genre: string; tone: string; mark: string; color: string; path: string; icon?: string; featured?: boolean }

const games: Game[] = [
  { id: 'cookie-clicker', title: 'Cookie Clicker', subtitle: 'Bake a bigger future.', description: 'Start with one tiny click and build an unstoppable cookie empire.', genre: 'Idle', tone: 'Cozy chaos', mark: 'CC', color: 'cookie', path: '/games/cookie-clicker/index.html', featured: true },
  { id: 'drive-mad', title: 'Drive Mad', subtitle: 'Keep it together.', description: 'Flip, fly, and find your line through a physics playground that hates straight roads.', genre: 'Racing', tone: 'Physics', mark: 'DM', color: 'drive', path: '/games/drive-mad/index.html' },
  { id: 'idle-mining', title: 'Idle Mining', subtitle: 'Dig deeper. Get richer.', description: 'Turn a quiet patch of earth into a sparkling underground operation.', genre: 'Idle', tone: 'Tycoon', mark: 'IM', color: 'mining', path: '/games/idle-mining/index.html' },
  { id: 'level-devil', title: 'Level Devil', subtitle: 'Trust nothing.', description: 'A platformer where every level has a trick, and every trick has teeth.', genre: 'Platformer', tone: 'Tricky', mark: 'LD', color: 'devil', path: '/games/level-devil/index.html' },
  { id: 'stack', title: 'Stack', subtitle: 'Build the perfect tower.', description: 'Drop each block with precision and chase a tower that never stops climbing.', genre: 'Arcade', tone: 'Precision', mark: 'ST', color: 'stack', path: '/games/stack/index.html' },
  { id: 'youtube', title: 'YouTube', subtitle: 'Unblocked. No ads. Just play.', description: 'An unblocked video lounge with search, trending, watch, and comments — built to work on school networks.', genre: 'Video', tone: 'Explore', mark: 'YT', color: 'youtube', path: '/games/youtube/index.html' },
  { id: 'stickman-hook', title: 'Stickman Hook', subtitle: 'Swing into action.', description: 'Hook, swing, and launch through a kinetic obstacle course.', genre: 'Arcade', tone: 'Momentum', mark: 'SH', color: 'stack', path: '/games/stickman-hook/index.html' },
  { id: 'ragdoll-archers', title: 'Ragdoll Archers', subtitle: 'Aim. Fire. Bounce.', description: 'Take aim in a physics-packed archery arena full of ricochets.', genre: 'Arcade', tone: 'Physics', mark: 'RA', color: 'drive', path: '/games/ragdoll-archers/index.html' },
  { id: 'hextris', title: 'Hextris', subtitle: 'Spin. Match. Survive.', description: 'A hypnotic hexagonal puzzle where every move tightens the pressure.', genre: 'Puzzle', tone: 'Flow state', mark: 'HX', color: 'hextris', path: '/games/hextris/index.html' },
  { id: '2048', title: '2048', subtitle: 'Join the numbers.', description: 'Slide, merge, and think ahead in the classic number puzzle.', genre: 'Puzzle', tone: 'Strategy', mark: '20', color: 'twenty', path: '/games/2048/index.html' },
  { id: 'solar-smash', title: 'Solar Smash', subtitle: 'Break the impossible.', description: 'Unleash cosmic-scale destruction in a spectacular planetary sandbox.', genre: 'Simulation', tone: 'Cosmic', mark: 'SS', color: 'devil', path: '/games/solar-smash/index.html' },
  { id: 'drift-boss', title: 'Drift Boss', subtitle: 'One road. No brakes.', description: 'Hold the perfect line through an endless neon road and chase your best run.', genre: 'Racing', tone: 'Reflex', mark: 'DB', color: 'drive', path: '/games/drift-boss/index.html' },
  { id: 'moto-x3m', title: 'Moto X3M', subtitle: 'Ride the impossible.', description: 'Launch, flip, and land your way through explosive motorcycle stunt courses.', genre: 'Racing', tone: 'Stunts', mark: 'MX', color: 'drive', path: '/games/moto-x3m/index.html' },
  { id: 'subway-surfers', title: 'Subway Surfers', subtitle: 'Run without limits.', description: 'Dash through the city, dodge the tracks, and chase a higher score.', genre: 'Arcade', tone: 'Reflex', mark: 'SS', color: 'youtube', path: '/games/subway-surfers/index.html' },
  { id: 'survival-race', title: 'Survival Race', subtitle: 'Race the danger.', description: 'Keep your wheels steady and survive a relentless run of hazards.', genre: 'Racing', tone: 'Reflex', mark: 'SR', color: 'drive', path: '/games/survival-race/index.html' },
  { id: 'geometry-dash', title: 'Geometry Dash', subtitle: 'Jump the rhythm.', description: 'Sync your timing to the beat and clear a precision platforming gauntlet.', genre: 'Platformer', tone: 'Rhythm', mark: 'GD', color: 'hextris', path: '/games/geometry-dash/index.html' },
  { id: 'poki', title: 'Paper.io 2', subtitle: 'Claim it all.', description: 'The real Paper.io 2 — loop out, capture territory, cut rival tails.', genre: 'Arcade', tone: 'Battle', mark: 'P2', color: 'youtube', path: '/games/poki/index.html' },
  { id: 'vex-8', title: 'Vex 8', subtitle: 'Run the gauntlet.', description: 'Wall-jump, slide, and sprint through a sharp new platforming challenge.', genre: 'Platformer', tone: 'Precision', mark: 'V8', color: 'devil', path: '/games/vex-8/index.html' },
  { id: 'eaglercraftx', title: 'EaglercraftX', subtitle: 'Minecraft in a tab.', description: 'The real EaglercraftX 1.8 client — singleplayer and multiplayer Minecraft, right in the browser.', genre: 'Sandbox', tone: 'Blocky', mark: 'EX', color: 'mining', path: '/games/eaglercraftx/index.html' },
  { id: 'backrooms', title: 'Backrooms', subtitle: 'You noclipped.', description: 'The real Unity backrooms explorer — wander the humming halls of Level 0.', genre: 'Sandbox', tone: 'Horror', mark: 'BR', color: 'twenty', path: '/games/backrooms/index.html' },
  { id: 'slope', title: 'Slope', subtitle: 'Roll at full speed.', description: 'Steer a glowing ball down a deadly neon slope — how far can you ride?', genre: 'Arcade', tone: 'Reflex', mark: 'SL', color: 'hextris', path: '/games/slope/index.html' },
  { id: 'retro-bowl', title: 'Retro Bowl', subtitle: 'Sunday, simplified.', description: 'The beloved retro football sim — call plays, win bowls.', genre: 'Arcade', tone: 'Retro', mark: 'RB', color: 'drive', path: '/games/retro-bowl/index.html' },
  { id: 'ovo', title: 'OvO', subtitle: 'Move like water.', description: 'A slick parkour platformer — slide, dive and flow through precision levels.', genre: 'Platformer', tone: 'Precision', mark: 'OO', color: 'stack', path: '/games/ovo/index.html' },
  { id: 'temple-run-2', title: 'Temple Run 2', subtitle: 'Run for your life.', description: 'The classic endless runner — escape the temple with the gold.', genre: 'Arcade', tone: 'Reflex', mark: 'TR', color: 'cookie', path: '/games/temple-run-2/index.html' },
  { id: 'tunnel-rush', title: 'Tunnel Rush', subtitle: 'Dodge at light speed.', description: 'Blast through a spinning 3D tunnel of obstacles.', genre: 'Arcade', tone: 'Reflex', mark: 'TU', color: 'devil', path: '/games/tunnel-rush/index.html' },
  { id: 'doodle-jump', title: 'Doodle Jump', subtitle: 'Bounce forever.', description: 'Hop up an endless page of platforms in the one-thumb classic.', genre: 'Arcade', tone: 'Retro', mark: 'DJ', color: 'mining', path: '/games/doodle-jump/index.html' },
  { id: 'cluster-rush', title: 'Cluster Rush', subtitle: 'Jump truck to truck.', description: 'First-person parkour across speeding trucks — don’t fall.', genre: 'Platformer', tone: 'Precision', mark: 'CR', color: 'drive', path: '/games/cluster-rush/index.html' },
  { id: 'jetpack-joyride', title: 'Jetpack Joyride', subtitle: 'Fly. Dodge. Profit.', description: 'Blast through the lab with a machine-gun jetpack.', genre: 'Arcade', tone: 'Reflex', mark: 'JJ', color: 'youtube', path: '/games/jetpack-joyride/index.html' },
  { id: 'drift-hunters', title: 'Drift Hunters', subtitle: 'Slide everything.', description: 'Tune your ride and chain drifts across huge 3D tracks.', genre: 'Racing', tone: 'Drift', mark: 'DH', color: 'drive', path: '/games/drift-hunters/index.html' },
  { id: 'rooftop-snipers', title: 'Rooftop Snipers', subtitle: 'Two idiots. One roof.', description: 'Knock your opponent off the roof in this chaotic 2-player duel.', genre: 'Arcade', tone: 'Chaos', mark: 'RS', color: 'cookie', path: '/games/rooftop-snipers/index.html' },
  { id: 'worlds-hardest-game', title: 'World’s Hardest Game', subtitle: 'It means it.', description: 'Dodge the blue dots and beat the most rage-inducing maze ever.', genre: 'Puzzle', tone: 'Rage', mark: 'WH', color: 'devil', path: '/games/worlds-hardest-game/index.html' },
  { id: 'fireboywatergirlforesttemple', title: 'Fireboy & Watergirl', subtitle: 'Two players, one temple.', description: 'Solve puzzles together in the Forest Temple — the co-op classic.', genre: 'Puzzle', tone: 'Co-op', mark: 'FW', color: 'stack', path: '/games/fireboywatergirlforesttemple/index.html' },
  { id: 'impossiblequiz', title: 'The Impossible Quiz', subtitle: 'Think outside the box.', description: 'Trick questions, bombs and pure chaos — answer carefully.', genre: 'Puzzle', tone: 'Chaos', mark: 'IQ', color: 'twenty', path: '/games/impossiblequiz/index.html' },
  { id: 'ducklife2', title: 'Duck Life 2', subtitle: 'Train your duck.', description: 'Race, swim and fly your duck to championship glory.', genre: 'Simulation', tone: 'Cute', mark: 'DL', color: 'mining', path: '/games/ducklife2/index.html' },
  { id: 'escapingtheprison', title: 'Escaping the Prison', subtitle: 'Choose wisely.', description: 'The Henry Stickmin classic — pick your escape route.', genre: 'Puzzle', tone: 'Story', mark: 'EP', color: 'stack', path: '/games/escapingtheprison/index.html' },
  { id: 'stealingthediamond', title: 'Stealing the Diamond', subtitle: 'Go big.', description: 'Henry Stickmin returns — steal the Tunisian Diamond your way.', genre: 'Puzzle', tone: 'Story', mark: 'SD', color: 'twenty', path: '/games/stealingthediamond/index.html' },
  { id: 'fancypantsadventures', title: 'Fancy Pants', subtitle: 'Run fancy.', description: 'The legendary stick-figure platformer with the smoothest moves.', genre: 'Platformer', tone: 'Retro', mark: 'FP', color: 'youtube', path: '/games/fancypantsadventures/index.html' },
  { id: 'papaspizzaria', title: 'Papa’s Pizzeria', subtitle: 'Top. Bake. Serve.', description: 'Run the pizzeria — take orders, bake pizzas, keep customers happy.', genre: 'Simulation', tone: 'Cute', mark: 'PP', color: 'cookie', path: '/games/papaspizzaria/index.html' },
  { id: 'papasburgeria', title: 'Papa’s Burgeria', subtitle: 'Flip and stack.', description: 'Grill, stack and serve the perfect burgers.', genre: 'Simulation', tone: 'Cute', mark: 'PB', color: 'cookie', path: '/games/papasburgeria/index.html' },
  { id: 'riddleschool', title: 'Riddle School', subtitle: 'Escape class.', description: 'Point, click and puzzle your way out of school.', genre: 'Puzzle', tone: 'Story', mark: 'RD', color: 'stack', path: '/games/riddleschool/index.html' },
  { id: 'bloxors', title: 'Bloxors', subtitle: 'Roll the block.', description: 'Tip the block onto the goal without falling off the edge.', genre: 'Puzzle', tone: 'Strategy', mark: 'BX', color: 'stack', path: '/games/bloxors/index.html' },
  { id: 'basket-random', title: 'Basket Random', subtitle: 'Chaos basketball.', description: 'Floppy 2-player hoops — first to 5 wins.', genre: 'Arcade', tone: 'Chaos', mark: 'BK', color: 'drive', path: '/games/basket-random/index.html' },
  { id: 'boxing-random', title: 'Boxing Random', subtitle: 'Floppy fists.', description: 'Wobbly 2-player boxing — knock them out.', genre: 'Arcade', tone: 'Chaos', mark: 'BO', color: 'devil', path: '/games/boxing-random/index.html' },
  { id: 'alienhominid', title: 'Alien Hominid', subtitle: 'Run-and-gun classic.', description: 'Blast through the FBI as the little yellow alien.', genre: 'Arcade', tone: 'Retro', mark: 'AH', color: 'mining', path: '/games/alienhominid/index.html' },
  { id: 'awesometanks2', title: 'Awesome Tanks 2', subtitle: 'Upgrade and destroy.', description: 'Blast through enemy tanks and upgrade your ride.', genre: 'Arcade', tone: 'Battle', mark: 'AT', color: 'drive', path: '/games/awesometanks2/index.html' },
  { id: 'baldis-basics', title: 'Baldi’s Basics', subtitle: 'Math. Horror. Run.', description: 'Collect notebooks and escape Baldi in the cult horror hit.', genre: 'Arcade', tone: 'Horror', mark: 'BB', color: 'twenty', path: '/games/baldis-basics/index.html' },
  { id: 'bad-ice-cream', title: 'Bad Ice Cream', subtitle: 'Chill out.', description: 'Maze-munching arcade fun — grab fruit, dodge enemies.', genre: 'Arcade', tone: 'Retro', mark: 'BI', color: 'hextris', path: '/games/bad-ice-cream/index.html' },
  { id: 'crossyroad', title: 'Crossy Road', subtitle: 'Why did it cross?', description: 'Hop across roads and rivers — don’t get flattened.', genre: 'Arcade', tone: 'Reflex', mark: 'XO', color: 'mining', path: '/games/crossyroad/index.html' },
  { id: 'cubefield', title: 'Cubefield', subtitle: 'Dodge the cubes.', description: 'Fly through an endless field of cubes at breakneck speed.', genre: 'Arcade', tone: 'Reflex', mark: 'CB', color: 'stack', path: '/games/cubefield/index.html' },
  { id: 'edge-surf', title: 'Edge Surf', subtitle: 'Ride the waves.', description: 'The endless surfer — dodge obstacles and grab coins.', genre: 'Arcade', tone: 'Reflex', mark: 'ES', color: 'hextris', path: '/games/edge-surf/index.html' },
  { id: 'flappy-bird', title: 'Flappy Bird', subtitle: 'Just one more tap.', description: 'The original rage-tap classic — thread the pipes.', genre: 'Arcade', tone: 'Reflex', mark: 'FB', color: 'youtube', path: '/games/flappy-bird/index.html' },
  { id: 'fruitninja', title: 'Fruit Ninja', subtitle: 'Slice everything.', description: 'Swipe-slice fruit combos and dodge the bombs.', genre: 'Arcade', tone: 'Reflex', mark: 'FN', color: 'devil', path: '/games/fruitninja/index.html' },
  { id: 'getaway-shootout', title: 'Getaway Shootout', subtitle: 'Race to escape.', description: 'Chaotic 2-player showdowns — grab the getaway first.', genre: 'Arcade', tone: 'Chaos', mark: 'GS', color: 'twenty', path: '/games/getaway-shootout/index.html' },
  { id: 'google-feud', title: 'Google Feud', subtitle: 'Guess the autocomplete.', description: 'Quiz party game — guess how the internet finishes the sentence.', genre: 'Puzzle', tone: 'Party', mark: 'GF', color: 'stack', path: '/games/google-feud/index.html' },
  { id: 'hackertype', title: 'Hacker Type', subtitle: 'Look like a hacker.', description: 'Mash keys, hack the mainframe, look awesome.', genre: 'Arcade', tone: 'Fun', mark: 'HT', color: 'mining', path: '/games/hackertype/index.html' },
  { id: 'knife-master', title: 'Knife Master', subtitle: 'Hit the target.', description: 'Time your throws and stick every knife.', genre: 'Arcade', tone: 'Reflex', mark: 'KM', color: 'devil', path: '/games/knife-master/index.html' },
  { id: 'thisistheonlylevel', title: 'This Is The Only Level', subtitle: 'One level. Many lies.', description: 'Same stage, new twist every time — think fast.', genre: 'Platformer', tone: 'Puzzle', mark: 'TO', color: 'stack', path: '/games/thisistheonlylevel/index.html' },
  { id: 'tiny-fishing', title: 'Tiny Fishing', subtitle: 'Cast and relax.', description: 'Hook fish, upgrade your rod, dive deeper.', genre: 'Idle', tone: 'Chill', mark: 'TF', color: 'hextris', path: '/games/tiny-fishing/index.html' },
  { id: 'wordle', title: 'Wordle', subtitle: 'Six tries.', description: 'Guess the 5-letter word in six tries — the daily classic.', genre: 'Puzzle', tone: 'Strategy', mark: 'WO', color: 'mining', path: '/games/wordle/index.html' },
  { id: 'fnaw', title: 'FNaW', subtitle: 'Nights at Winston’s.', description: 'A Five Nights fan game — survive the night shift as the janitor.', genre: 'Arcade', tone: 'Horror', mark: 'NW', color: 'twenty', path: '/games/fnaw/index.html' },
  { id: 'stack-bump-3d', title: 'Stack Bump 3D', subtitle: 'Smash the stack.', description: 'Bounce through spinning helix stacks.', genre: 'Arcade', tone: 'Reflex', mark: 'SB', color: 'twenty', path: '/games/stack-bump-3d/index.html' },
  { id: 'death-run-3d', title: 'Death Run 3D', subtitle: 'Outrun death.', description: 'Sprint through a neon tunnel of moving walls.', genre: 'Arcade', tone: 'Reflex', mark: 'DR', color: 'devil', path: '/games/death-run-3d/index.html' },
  { id: 'a-dance-of-fire-and-ice', title: 'A Dance of Fire and Ice', subtitle: 'One-button rhythm.', description: 'Guide two orbiting planets down a strict rhythm path.', genre: 'Platformer', tone: 'Rhythm', mark: 'DF', color: 'youtube', path: '/games/a-dance-of-fire-and-ice/index.html' },
  { id: 'n-gon', title: 'n-gon', subtitle: 'Physics playground.', description: 'A deep physics sandbox shooter — bend gravity, build, destroy.', genre: 'Sandbox', tone: 'Chaos', mark: 'NG', color: 'stack', path: '/games/n-gon/index.html' },
  { id: 'achievementunlocked', title: 'Achievement Unlocked', subtitle: 'Unlock everything.', description: 'The meta game about unlocking achievements — including this one.', genre: 'Platformer', tone: 'Meta', mark: 'AU', color: 'twenty', path: '/games/achievementunlocked/index.html' },
  { id: 'cell-machine', title: 'Cell Machine', subtitle: 'Program cells.', description: 'Build self-replicating machines from logic cells.', genre: 'Puzzle', tone: 'Strategy', mark: 'CM', color: 'mining', path: '/games/cell-machine/index.html' },
  { id: 'mario', title: 'Mario', subtitle: 'Wahoo.', description: 'The classic platforming adventure — stomp, jump, save the day.', genre: 'Platformer', tone: 'Retro', mark: 'M!', color: 'devil', path: '/games/mario/index.html' },
  { id: 'bobtherobber2', title: 'Bob the Robber 2', subtitle: 'Steal quietly.', description: 'Sneak past guards and grab the loot.', genre: 'Puzzle', tone: 'Stealth', mark: 'B2', color: 'stack', path: '/games/bobtherobber2/index.html' },
  { id: 'learntofly', title: 'Learn to Fly', subtitle: 'Penguins can fly.', description: 'Launch the penguin, upgrade, fly farther.', genre: 'Arcade', tone: 'Retro', mark: 'LF', color: 'hextris', path: '/games/learntofly/index.html' },
  { id: 'learntofly2', title: 'Learn to Fly 2', subtitle: 'Fly farther.', description: 'Bigger launches, better gear, dumber penguin.', genre: 'Arcade', tone: 'Retro', mark: 'L2', color: 'youtube', path: '/games/learntofly2/index.html' },
  { id: 'breakingthebank', title: 'Breaking the Bank', subtitle: 'Get rich quick.', description: 'Henry Stickmin’s first heist — pick your tool.', genre: 'Puzzle', tone: 'Story', mark: 'BT', color: 'stack', path: '/games/breakingthebank/index.html' },
  { id: 'among-us', title: 'Among Us', subtitle: 'Find the impostor.', description: 'The social deduction hit — finish tasks, eject the impostor.', genre: 'Arcade', tone: 'Party', mark: 'AM', color: 'devil', path: '/games/among-us/index.html' },
  { id: 'elasticman', title: 'Elastic Man', subtitle: 'Stretch his face.', description: 'The viral silly toy — pull, stretch and giggle.', genre: 'Arcade', tone: 'Fun', mark: 'EM', color: 'cookie', path: '/games/elasticman/index.html' },
  { id: 'chrome-dino', title: 'Chrome Dino', subtitle: 'No internet? No problem.', description: 'The offline runner — jump cacti, dodge pterodactyls.', genre: 'Arcade', tone: 'Retro', mark: 'CD', color: 'stack', path: '/games/chrome-dino/index.html' },
  { id: 'core-ball', title: 'Core Ball', subtitle: 'Thread the core.', description: 'Time your shots into the spinning core — don’t touch.', genre: 'Arcade', tone: 'Reflex', mark: 'CO', color: 'hextris', path: '/games/core-ball/index.html' },
  { id: 'monkey-mart', title: 'Monkey Mart', subtitle: 'Monkey business.', description: 'Run a grocery store with monkey staff — stock shelves, serve customers.', genre: 'Simulation', tone: 'Cute', mark: 'MM', color: 'mining', path: '/games/monkey-mart/index.html' },
  { id: 'proxy', title: 'Proxy', subtitle: 'Browse unblocked.', description: 'The lounge\'s built-in unblocked browser — Poki, Google, anything.', genre: 'Proxy', tone: 'Tool', mark: 'PX', color: 'twenty', path: '/proxy' },
  { id: 'minecraft-classic', title: 'Minecraft Classic', subtitle: 'The original, in a tab.', description: 'Mojang’s official Classic build — place and break blocks with friends.', genre: 'Sandbox', tone: 'Blocky', mark: 'MC', color: 'mining', path: '/games/minecraft-classic/index.html' },
  { id: 'minecraftbeta', title: 'Minecraft Beta', subtitle: 'Survive the night.', description: 'A playable beta-style Minecraft — mine, build, survive.', genre: 'Sandbox', tone: 'Blocky', mark: 'MB', color: 'mining', path: '/games/minecraftbeta/index.html' },
  { id: 'riddleschool2', title: 'Riddle School 2', subtitle: 'Escape again.', description: 'Point, click and puzzle your way out — the sequel.', genre: 'Puzzle', tone: 'Story', mark: 'R2', color: 'stack', path: '/games/riddleschool2/index.html' },
  { id: 'riddleschool3', title: 'Riddle School 3', subtitle: 'No skipping class.', description: 'The third escape — trickier puzzles, funnier endings.', genre: 'Puzzle', tone: 'Story', mark: 'R3', color: 'stack', path: '/games/riddleschool3/index.html' },
  { id: 'bad-ice-cream-2', title: 'Bad Ice Cream 2', subtitle: 'Double chill.', description: 'More mazes, more fruit, more chaos — solo or co-op.', genre: 'Arcade', tone: 'Retro', mark: 'I2', color: 'hextris', path: '/games/bad-ice-cream-2/index.html' },
  { id: 'bad-ice-cream-3', title: 'Bad Ice Cream 3', subtitle: 'Triple chill.', description: 'The iciest one yet — 40 levels of fruity mayhem.', genre: 'Arcade', tone: 'Retro', mark: 'I3', color: 'hextris', path: '/games/bad-ice-cream-3/index.html' },
  { id: 'slope-2', title: 'Slope 2', subtitle: 'Faster. Steeper.', description: 'The sequel to the endless neon slope — even less mercy.', genre: 'Arcade', tone: 'Reflex', mark: 'S2', color: 'hextris', path: '/games/slope-2/index.html' },
  { id: 'slope-ball', title: 'Slope Ball', subtitle: 'Roll the slope.', description: 'A slope-style ball roller with fresh tracks and traps.', genre: 'Arcade', tone: 'Reflex', mark: 'BL', color: 'stack', path: '/games/slope-ball/index.html' },
  { id: 'flashtetris', title: 'Tetris Flash', subtitle: 'Stack ’em, classic style.', description: 'The timeless Flash block-stacker — clear lines, chase the score.', genre: 'Puzzle', tone: 'Retro', mark: 'TF', color: 'twenty', path: '/games/flashtetris/index.html' },
  { id: 'twitch-tetris', title: 'Tetris', subtitle: 'Pure blocks.', description: 'A clean modern Tetris — spin, drop, clear.', genre: 'Puzzle', tone: 'Retro', mark: 'TE', color: 'twenty', path: '/games/twitch-tetris/index.html' },
  { id: 'ducklife1', title: 'Duck Life', subtitle: 'Train your duck.', description: 'The original — run, swim and fly to racing glory.', genre: 'Simulation', tone: 'Cute', mark: 'D1', color: 'mining', path: '/games/ducklife1/index.html' },
  { id: 'ducklife3', title: 'Duck Life 3', subtitle: 'Evolve your duck.', description: 'Bigger races, tougher training, champion ducks.', genre: 'Simulation', tone: 'Cute', mark: 'D3', color: 'mining', path: '/games/ducklife3/index.html' },
  { id: 'basketball-stars', title: 'Basketball Stars', subtitle: 'Ball is life.', description: 'Fast 1v1 hoops — shoot, steal and dunk on your rival.', genre: 'Arcade', tone: 'Chaos', mark: 'BS', color: 'drive', path: '/games/basketball-stars/index.html' },
  { id: 'stickman-golf', title: 'Stickman Golf', subtitle: 'Fore!', description: 'Fling the stickman through crazy golf courses.', genre: 'Arcade', tone: 'Fun', mark: 'SG', color: 'mining', path: '/games/stickman-golf/index.html' },
  { id: 'stickman-boost', title: 'Stickman Boost', subtitle: 'Hold on tight.', description: 'High-speed stickman runner — jump, slide, survive.', genre: 'Arcade', tone: 'Reflex', mark: 'ST', color: 'stack', path: '/games/stickman-boost/index.html' },
  { id: 'fnaf', title: 'Five Nights at Freddy’s', subtitle: 'Survive five nights.', description: 'The original FNAF — watch the cameras, save power, keep them out.', genre: 'Arcade', tone: 'Horror', mark: 'F1', color: 'twenty', path: '/games/fnaf/index.html' },
  { id: 'happy-wheels', title: 'Happy Wheels', subtitle: 'Brutal ragdoll racing.', description: 'The legendary obstacle racer — finish in one piece. Probably not.', genre: 'Platformer', tone: 'Chaos', mark: 'HW', color: 'devil', path: '/games/happy-wheels/index.html' },
  { id: 'run-3', title: 'Run 3', subtitle: 'Don’t fall off.', description: 'Run, skate and float through the tunnels of space.', genre: 'Platformer', tone: 'Reflex', mark: 'RN', color: 'stack', path: '/games/run-3/index.html' },
  { id: 'red-ball-4', title: 'Red Ball 4', subtitle: 'Roll to the rescue.', description: 'All three volumes — bounce, squash and outsmart the squares.', genre: 'Platformer', tone: 'Retro', mark: 'R4', color: 'devil', path: '/games/red-ball-4/index.html' },
  { id: 'plants-vs-zombies', title: 'Plants vs Zombies', subtitle: 'Hold the lawn.', description: 'The classic lawn defense — pea-shooters vs the horde.', genre: 'Arcade', tone: 'Strategy', mark: 'PV', color: 'mining', path: '/games/plants-vs-zombies/index.html' },
  { id: 'snow-rider-3d', title: 'Snow Rider 3D', subtitle: 'Shred the mountain.', description: 'Dodge trees and grab gifts on an endless snowy ride.', genre: 'Arcade', tone: 'Reflex', mark: 'SN', color: 'hextris', path: '/games/snow-rider-3d/index.html' },
  { id: 'granny', title: 'Granny', subtitle: 'Don’t make a sound.', description: 'Escape Granny’s house in 5 days — quietly.', genre: 'Arcade', tone: 'Horror', mark: 'GR', color: 'twenty', path: '/games/granny/index.html' },
]
const filters = ['All games', 'Idle', 'Arcade', 'Puzzle', 'Racing', 'Platformer', 'Simulation', 'Sandbox', 'Video', 'Community', 'Proxy', 'Favorites']
const pubColors = ['cookie', 'drive', 'mining', 'devil', 'stack', 'hextris', 'twenty', 'youtube']

type PublishedListing = { id: string; title: string; icon: string | null }

export default function Page() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All games')
  const [favorites, setFavorites] = useState<string[]>([])
  const [activeGame, setActiveGame] = useState<Game | null>(null)
  const [published, setPublished] = useState<Game[]>([])

  useEffect(() => {
    fetch('/api/games')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { games?: PublishedListing[] } | null) => {
        if (!d?.games) return
        setPublished(
          d.games.map((g, i) => ({
            id: 'pub-' + g.id,
            title: g.title,
            subtitle: 'Community upload.',
            description: 'Published by the lounge community.',
            genre: 'Community',
            tone: 'Fresh',
            mark: g.title.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || 'GG',
            color: pubColors[i % pubColors.length],
            path: '/games/' + g.id,
            icon: g.icon || undefined,
          })),
        )
      })
      .catch(() => {})
  }, [])

  const allGames = useMemo(() => [...games, ...published], [published])
  const visibleGames = useMemo(
    () =>
      allGames.filter(
        (game) =>
          `${game.title} ${game.genre} ${game.tone}`.toLowerCase().includes(query.toLowerCase()) &&
          (filter === 'All games' || game.genre === filter || (filter === 'Favorites' && favorites.includes(game.id))),
      ),
    [allGames, favorites, filter, query],
  )

  function launch(game: Game) {
    setActiveGame(game)
  }
  function toggleFavorite(id: string) {
    setFavorites((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  return (
    <main className="lounge-shell">
      <div className="noise" aria-hidden="true" />
      <header className="site-header">
        <a href="#top" className="brand" aria-label="GG-Lounge home">
          <span className="brand-mark">
            <Gamepad2 size={19} />
          </span>
          <span>
            GG-LOUNGE<span className="tm">™</span>
          </span>
        </a>
        <nav className="header-nav" aria-label="Primary navigation">
          <a href="#games">Library</a>
          <a href="#about">Studio</a>
          <a href="/request-game">Request a game</a>
          <a href="/admin">Admin</a>
        </nav>
        <div className="header-status">
          <span className="live-dot" /> {allGames.length} titles / open all night
        </div>
      </header>
      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">
            <Sparkles size={14} /> THE INDEPENDENT ARCADE
          </p>
          <h1>
            Stay a while.
            <br />
            <em>Play forever.</em>
          </h1>
          <p className="hero-text">A handpicked, no-filler collection of browser games for the minutes between everything.</p>
          <a className="hero-link" href="#games">
            Enter the lounge <ArrowUpRight size={15} />
          </a>
          <div className="hero-stats">
            <span>
              <strong>{allGames.length}</strong> games
            </span>
            <span>
              <strong>∞</strong> replay value
            </span>
            <span>
              <strong>01</strong> lounge
            </span>
          </div>
        </div>
        <div className="spotlight">
          <div className="spotlight-top">
            <span>SPOTLIGHT / 001</span>
            <span className="spotlight-tag">FEATURED</span>
          </div>
          <div className="spotlight-art">
            <div className="orbit orbit-a" />
            <div className="orbit orbit-b" />
            <span className="spotlight-mark">CC</span>
            <span className="spotlight-caption">
              SWEET
              <br />
              DESTRUCTION
            </span>
          </div>
          <div className="spotlight-bottom">
            <div>
              <p className="card-kicker">IDLE · COZY CHAOS</p>
              <h2>Cookie Clicker</h2>
              <p>One click away from a very sweet problem.</p>
            </div>
            <button className="circle-play" onClick={() => launch(games[0])} aria-label="Play Cookie Clicker">
              <Play size={18} fill="currentColor" />
            </button>
          </div>
        </div>
      </section>
      <section className="catalog" id="games">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE ARCADE FLOOR</p>
            <h2>
              Pick your poison<span>.</span>
            </h2>
          </div>
          <div className="collection-note">
            <Trophy size={16} />
            <span>
              <strong>{visibleGames.length.toString().padStart(2, '0')}</strong> available now
            </span>
          </div>
        </div>
        <div className="toolbar">
          <div className="search-wrap">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, genres, moods" aria-label="Search games" />
          </div>
          <div className="filter-tabs" role="tablist" aria-label="Filter games">
            {filters.map((item) => (
              <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item}>
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="game-grid">
          {visibleGames.map((game, index) => (
            <article className={`game-card ${game.color}`} key={game.id}>
              <button
                className="favorite-button"
                onClick={() => toggleFavorite(game.id)}
                aria-label={`${favorites.includes(game.id) ? 'Remove' : 'Add'} ${game.title} ${favorites.includes(game.id) ? 'from' : 'to'} favorites`}
              >
                <Heart size={17} fill={favorites.includes(game.id) ? 'currentColor' : 'none'} />
              </button>
              <div className="game-art">
                {game.icon ? (
                  <img className="game-icon" src={game.icon} alt="" />
                ) : (
                  <span className="game-mark">{game.mark}</span>
                )}
                <small>{String(index + 1).padStart(2, '0')}</small>
              </div>
              <div className="game-info">
                <div>
                  <p className="card-kicker">
                    {game.genre} · {game.tone}
                  </p>
                  <h3>{game.title}</h3>
                  <p>{game.description}</p>
                </div>
                <button className="play-button" onClick={() => launch(game)}>
                  <Play size={13} fill="currentColor" /> Launch
                </button>
              </div>
            </article>
          ))}
        </div>
        {visibleGames.length === 0 && (
          <div className="empty-state">
            <Zap size={22} />
            <h3>No games found</h3>
            <p>Try a different search or clear the filter.</p>
          </div>
        )}
      </section>
      <footer id="about">
        <div className="footer-top">
          <div className="footer-brand">
            <span className="brand-mark">
              <Gamepad2 size={17} />
            </span>
            <strong>
              GG-LOUNGE<span className="tm">™</span>
            </strong>
          </div>
          <span className="footer-rule" />
          <p>
            Made by <strong>Kai Chauhan</strong>
          </p>
        </div>
        <div className="footer-bottom">
          <span>© 2026 GG-LOUNGE STUDIOS™. All rights reserved.</span>
          <span>A Production of GG-LOUNGE STUDIOS™</span>
          <span>Games remain property of their respective creators.</span>
        </div>
      </footer>
      <a className="admin-fab" href="/admin" aria-label="Open admin console">
        <ShieldCheck size={19} />
        <span>Admin</span>
      </a>
      {activeGame && (
        <div className="game-modal" role="dialog" aria-modal="true" aria-label={`${activeGame.title} game`}>
          <div className="modal-bar">
            <div>
              <span className="modal-kicker">NOW PLAYING</span>
              <strong>{activeGame.title}</strong>
            </div>
            <div className="modal-actions">
              <button onClick={() => document.querySelector<HTMLIFrameElement>('.game-frame')?.requestFullscreen()} aria-label="Fullscreen">
                <Maximize2 size={18} />
              </button>
              <button onClick={() => setActiveGame(null)} aria-label="Close game">
                <X size={20} />
              </button>
            </div>
          </div>
          <iframe className="game-frame" src={activeGame.path} title={activeGame.title} allow="fullscreen; autoplay; gamepad; keyboard-map" />
        </div>
      )}
    </main>
  )
}
