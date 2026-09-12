'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowUpRight, Gamepad2, Heart, Maximize2, Play, Search, ShieldCheck, Sparkles, Trophy, X, Zap, LayoutGrid, Rows3, Shuffle, ExternalLink, Copy, AlertCircle, Loader2, ChevronLeft, ChevronRight, Sun, Moon, Download, Flag, Flame, Crown, Gift, Monitor, Keyboard, Bug, ThumbsUp, Globe, MessageSquare, Star, Timer, WifiOff, Wifi } from 'lucide-react'

type Game = { id: string; title: string; subtitle: string; description: string; genre: string; tone: string; mark: string; color: string; path: string; icon?: string; featured?: boolean }

const games: Game[] = [
  { id: 'cookie-clicker', title: 'Cookie Clicker', subtitle: 'Bake a bigger future.', description: 'Start with one tiny click and build an unstoppable cookie empire.', genre: 'Idle', tone: 'Cozy chaos', mark: 'CC', color: 'cookie', path: '/games/cookie-clicker/index.html', featured: true },
  { id: 'drive-mad', title: 'Drive Mad', subtitle: 'Keep it together.', description: 'Flip, fly, and find your line through a physics playground that hates straight roads.', genre: 'Racing', tone: 'Physics', mark: 'DM', color: 'drive', path: '/games/drive-mad/index.html', featured: true },
  { id: 'idle-mining', title: 'Idle Mining', subtitle: 'Dig deeper. Get richer.', description: 'Turn a quiet patch of earth into a sparkling underground operation.', genre: 'Idle', tone: 'Tycoon', mark: 'IM', color: 'mining', path: '/games/idle-mining/index.html' },
  { id: 'level-devil', title: 'Level Devil', subtitle: 'Trust nothing.', description: 'A platformer where every level has a trick, and every trick has teeth.', genre: 'Platformer', tone: 'Tricky', mark: 'LD', color: 'devil', path: '/games/level-devil/index.html' },
  { id: 'stack', title: 'Stack', subtitle: 'Build the perfect tower.', description: 'Drop each block with precision and chase a tower that never stops climbing.', genre: 'Arcade', tone: 'Precision', mark: 'ST', color: 'stack', path: '/games/stack/index.html', featured: true },  { id: 'stickman-hook', title: 'Stickman Hook', subtitle: 'Swing into action.', description: 'Hook, swing, and launch through a kinetic obstacle course.', genre: 'Arcade', tone: 'Momentum', mark: 'SH', color: 'stack', path: '/games/stickman-hook/index.html' },
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
  { id: 'monkey-mart', title: 'Monkey Mart', subtitle: 'Monkey business.', description: 'Run a grocery store with monkey staff — stock shelves, serve customers.', genre: 'Simulation', tone: 'Cute', mark: 'MM', color: 'mining', path: '/games/monkey-mart/index.html' },  { id: 'minecraft-classic', title: 'Minecraft Classic', subtitle: 'The original, in a tab.', description: 'Mojang’s official Classic build — place and break blocks with friends.', genre: 'Sandbox', tone: 'Blocky', mark: 'MC', color: 'mining', path: '/games/minecraft-classic/index.html' },
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
  { id: 'hole-io', title: 'Hole.io', subtitle: 'Eat the city.', description: 'Local unblocked hole-eater — swallow buildings, grow huge, own the map. No CDN, pure canvas.', genre: 'Arcade', tone: 'Battle', mark: 'HO', color: 'mining', path: '/games/hole-io/index.html', featured: true },
  { id: '1v1-lol', title: '1v1.LOL', subtitle: 'Build. Aim. Eliminate.', description: 'Proxied 1v1.LOL — full building & shooting, via lounge tunnel. Hidden proxy, no block shown.', genre: 'Arcade', tone: 'Battle', mark: '1V', color: 'devil', path: '/games/1v1-lol/index.html' },
  { id: 'krunker', title: 'Krunker', subtitle: 'FPS in a tab.', description: 'Proxied Krunker.io — fast FPS multiplayer via encrypted tunnel. WS & all features.', genre: 'Arcade', tone: 'Battle', mark: 'KR', color: 'stack', path: '/games/krunker/index.html' },
  { id: 'smashkarts', title: 'SmashKarts', subtitle: 'Drive. Smash. Win.', description: 'Proxied SmashKarts.io — kart chaos with weapons, full multiplayer.', genre: 'Racing', tone: 'Battle', mark: 'SK', color: 'drive', path: '/games/smashkarts/index.html' },
  { id: 'ev-io', title: 'Ev.io', subtitle: 'Sci-fi shooter.', description: 'Proxied Ev.io — halo-style FPS, ranked & all maps, tunnelled.', genre: 'Arcade', tone: 'Battle', mark: 'EV', color: 'hextris', path: '/games/ev-io/index.html' },
  { id: 'shell-shockers', title: 'Shell Shockers', subtitle: 'Egg warfare.', description: 'Proxied Shell Shockers — egg FPS, all eggs & weapons, via lounge.', genre: 'Arcade', tone: 'Battle', mark: 'SS', color: 'cookie', path: '/games/shell-shockers/index.html' },
  { id: 'agar-io', title: 'Agar.io', subtitle: 'Eat or be eaten.', description: 'Proxied Agar.io — eat cells, split, full multiplayer unblocked.', genre: 'Arcade', tone: 'Battle', mark: 'AG', color: 'hextris', path: '/games/agar-io/index.html' },
  { id: 'slither-io', title: 'Slither.io', subtitle: 'Slither big.', description: 'Proxied Slither.io — grow the snake, trap others, full online.', genre: 'Arcade', tone: 'Battle', mark: 'SL', color: 'mining', path: '/games/slither-io/index.html' },
  { id: 'paper-io-2-3d', title: 'Paper.io 3D', subtitle: 'Paint the map.', description: 'Proxied Paper.io territory — capture land, cut tails, via tunnel.', genre: 'Arcade', tone: 'Battle', mark: 'PA', color: 'youtube', path: '/games/paper-io-2-3d/index.html' },
  { id: 'stumble-guys', title: 'Stumble Guys', subtitle: 'Fall, run, win.', description: 'Proxied Stumble Guys — 32-player knockout chaos, all maps.', genre: 'Arcade', tone: 'Battle', mark: 'SG', color: 'devil', path: '/games/stumble-guys/index.html' },
  { id: 'dune-dash', title: 'Dune Dash', subtitle: 'Sand sprint.', description: 'Desert runner — dash over dunes, dodge rocks. Classroom Center hit.', genre: 'Racing', tone: 'Desert', mark: 'DD', color: 'drive', path: '/games/dune-dash/index.html' },
  { id: 'vibes', title: 'Vibes', subtitle: 'Chill flow.', description: 'Vibes — rhythmic dodge, stay in the pulse.', genre: 'Arcade', tone: 'Flow', mark: 'VB', color: 'hextris', path: '/games/vibes/index.html' },
  { id: 'vortex-tunnel', title: 'Vortex Tunnel', subtitle: 'Spin fast.', description: 'Vortex Tunnel — spin through the neon vortex.', genre: 'Arcade', tone: 'Reflex', mark: 'VT', color: 'hextris', path: '/games/vortex-tunnel/index.html' },
  { id: 'rooftop-run', title: 'Rooftop Run', subtitle: 'Parkour above city.', description: "Rooftop Run — jump roofs, don't fall.", genre: 'Platformer', tone: 'Precision', mark: 'RR', color: 'stack', path: '/games/rooftop-run/index.html' },
  { id: 'hop-fighters', title: 'Hop Fighters', subtitle: 'Hop & punch.', description: 'Hop Fighters — hop, kick, K.O.', genre: 'Arcade', tone: 'Battle', mark: 'HF', color: 'devil', path: '/games/hop-fighters/index.html' },
  { id: 'first-aarc', title: 'First Aarc', subtitle: 'Aim true.', description: 'First Aarc — bow aim, hit targets.', genre: 'Arcade', tone: 'Precision', mark: 'FA', color: 'mining', path: '/games/first-aarc/index.html' },
  { id: 'baseball-bros', title: 'Baseball Bros', subtitle: 'Hit homers.', description: 'Baseball Bros — swing, hit, run bases.', genre: 'Arcade', tone: 'Sports', mark: 'BB', color: 'drive', path: '/games/baseball-bros/index.html' },
  { id: 'pumpkill-64', title: 'Pumpkill 64', subtitle: 'Spooky hunt.', description: 'Pumpkill 64 — collect pumpkins, avoid ghosts.', genre: 'Arcade', tone: 'Horror', mark: 'PK', color: 'twenty', path: '/games/pumpkill-64/index.html' },
  { id: 'gta-simulator', title: 'GTA Simulator', subtitle: 'City free roam.', description: 'GTA Simulator — drive, drift, evade.', genre: 'Racing', tone: 'Urban', mark: 'GT', color: 'twenty', path: '/games/gta-simulator/index.html' },
  { id: 'gunspin', title: 'Gunspin', subtitle: 'Spin to win.', description: 'Gunspin — shoot recoil to fly.', genre: 'Arcade', tone: 'Physics', mark: 'GS', color: 'devil', path: '/games/gunspin/index.html' },
  { id: 'football-bros', title: 'Football Bros', subtitle: 'Score goals.', description: 'Football Bros — pass, shoot, score.', genre: 'Arcade', tone: 'Sports', mark: 'FB', color: 'mining', path: '/games/football-bros/index.html' },
  { id: 'real-pool-3d', title: 'Real Pool 3D', subtitle: 'Bank shots.', description: 'Real Pool 3D — aim, shoot, sink.', genre: 'Arcade', tone: 'Precision', mark: 'RP', color: 'mining', path: '/games/real-pool-3d/index.html' },
  { id: 'steep-descent', title: 'Steep Descent', subtitle: 'Downhill rush.', description: 'Steep Descent — ski steep, dodge trees.', genre: 'Racing', tone: 'Snow', mark: 'SD', color: 'hextris', path: '/games/steep-descent/index.html' },
  { id: 'steal-brainrot', title: 'Steal Brainrot', subtitle: 'Meme chaos.', description: 'Steal Brainrot — collect memes, avoid brainrot.', genre: 'Arcade', tone: 'Chaos', mark: 'SB', color: 'youtube', path: '/games/steal-brainrot/index.html' },
  { id: 'rocket-goal-io', title: 'Rocket Goal', subtitle: 'Boost & score.', description: 'Rocket Goal — boost cars, score goals.', genre: 'Arcade', tone: 'Sports', mark: 'RG', color: 'drive', path: '/games/rocket-goal-io/index.html' },
  { id: 'they-are-coming', title: 'They Are Coming', subtitle: 'Survive horde.', description: 'They Are Coming — survive zombie horde.', genre: 'Arcade', tone: 'Horror', mark: 'TA', color: 'twenty', path: '/games/they-are-coming/index.html' },
  { id: 'drift-race', title: 'Drift Race', subtitle: 'Slide corners.', description: 'Drift Race — drift through neon city.', genre: 'Racing', tone: 'Drift', mark: 'DR', color: 'drive', path: '/games/drift-race/index.html' },
  { id: 'sandbox', title: 'Sandbox', subtitle: 'Build anything.', description: 'Sandbox — place blocks, build worlds.', genre: 'Sandbox', tone: 'Creative', mark: 'SB', color: 'mining', path: '/games/sandbox/index.html' },
  { id: 'crazy-crash-landing', title: 'Crazy Crash', subtitle: 'Crash safely?', description: 'Crazy Crash Landing — steer, land, survive.', genre: 'Arcade', tone: 'Chaos', mark: 'CC', color: 'devil', path: '/games/crazy-crash-landing/index.html' },
  { id: 'car-simulator', title: 'Car Simulator', subtitle: 'Drive free.', description: 'Car Simulator — open world drive.', genre: 'Racing', tone: 'Sim', mark: 'CS', color: 'drive', path: '/games/car-simulator/index.html' },
  { id: 'monster-truck', title: 'Monster Truck', subtitle: 'Crush cars.', description: 'Monster Truck — crush, jump, win.', genre: 'Racing', tone: 'Crush', mark: 'MT', color: 'devil', path: '/games/monster-truck/index.html' },
  { id: 'cyber-cars', title: 'Cyber Cars', subtitle: 'Neon race.', description: 'Cyber Cars — futuristic neon racing.', genre: 'Racing', tone: 'Neon', mark: 'CC', color: 'hextris', path: '/games/cyber-cars/index.html' },
  { id: 'volley-random', title: 'Volley Random', subtitle: 'Wobbly volley.', description: 'Volley Random — floppy volleyball to 5.', genre: 'Arcade', tone: 'Chaos', mark: 'VR', color: 'stack', path: '/games/volley-random/index.html' },
  { id: 'soccer-random', title: 'Soccer Random', subtitle: 'Floppy football.', description: 'Soccer Random — wobbly soccer chaos.', genre: 'Arcade', tone: 'Chaos', mark: 'SR', color: 'drive', path: '/games/soccer-random/index.html' },
  { id: 'dash-arena', title: 'Dash Arena', subtitle: 'Dash battle.', description: 'Dash Arena — dash, bump, last stand.', genre: 'Arcade', tone: 'Battle', mark: 'DA', color: 'youtube', path: '/games/dash-arena/index.html' },
  { id: 'stick-war', title: 'Stick War', subtitle: 'Command stick.', description: 'Stick War — command army, win war.', genre: 'Arcade', tone: 'Strategy', mark: 'SW', color: 'stack', path: '/games/stick-war/index.html' },
  { id: 'real-car-driving', title: 'Real Car Driving', subtitle: 'Real physics.', description: 'Real Car Driving — realistic drive.', genre: 'Racing', tone: 'Sim', mark: 'RC', color: 'drive', path: '/games/real-car-driving/index.html' },
  { id: 'drive-online', title: 'Drive Online', subtitle: 'Multiplayer drive.', description: 'Drive Online — cruise with friends.', genre: 'Racing', tone: 'Social', mark: 'DO', color: 'drive', path: '/games/drive-online/index.html' },
  { id: 'extreme-racing', title: 'Extreme Racing', subtitle: 'Extreme speed.', description: 'Extreme Racing — nitro, jump, win.', genre: 'Racing', tone: 'Reflex', mark: 'ER', color: 'devil', path: '/games/extreme-racing/index.html' },
  { id: 'monster-survival', title: 'Monster Survival', subtitle: 'Survive night.', description: 'Monster Survival — survive monsters.', genre: 'Arcade', tone: 'Horror', mark: 'MS', color: 'twenty', path: '/games/monster-survival/index.html' },
  { id: 'cheese-chompers-3d', title: 'Cheese Chompers 3D', subtitle: 'Chomp cheese.', description: 'Cheese Chompers — chase cheese, avoid cats.', genre: 'Arcade', tone: 'Cute', mark: 'CC', color: 'cookie', path: '/games/cheese-chompers-3d/index.html' },
  { id: 'spiral-roll', title: 'Spiral Roll', subtitle: 'Roll spiral.', description: 'Spiral Roll — roll ball down spiral.', genre: 'Arcade', tone: 'Reflex', mark: 'SR', color: 'hextris', path: '/games/spiral-roll/index.html' },
  { id: 'shape-transform', title: 'Shape Transform', subtitle: 'Morph & fit.', description: 'Shape Transform — morph to fit gaps.', genre: 'Puzzle', tone: 'Reflex', mark: 'ST', color: 'stack', path: '/games/shape-transform/index.html' },
  { id: 'mr-dude', title: 'Mr Dude', subtitle: 'Dude run.', description: 'Mr Dude — run, jump, dodge.', genre: 'Platformer', tone: 'Fun', mark: 'MD', color: 'cookie', path: '/games/mr-dude/index.html' },
  { id: 'obby-shooter', title: 'Obby Shooter', subtitle: 'Obby + gun.', description: 'Obby Shooter — parkour and shoot.', genre: 'Arcade', tone: 'Battle', mark: 'OS', color: 'devil', path: '/games/obby-shooter/index.html' },
  { id: 'helix-jump', title: 'Helix Jump', subtitle: 'Fall through.', description: 'Helix Jump — drop ball through helix.', genre: 'Arcade', tone: 'Reflex', mark: 'HJ', color: 'hextris', path: '/games/helix-jump/index.html' },
  { id: 'obby-snowboard', title: 'Obby Snowboard', subtitle: 'Snow obby.', description: 'Obby Snowboard — board through obby.', genre: 'Arcade', tone: 'Snow', mark: 'OS', color: 'hextris', path: '/games/obby-snowboard/index.html' },
  { id: 'ninja-parkour', title: 'Ninja Parkour', subtitle: 'Wall run.', description: 'Ninja Parkour — wall run, leap.', genre: 'Platformer', tone: 'Precision', mark: 'NP', color: 'stack', path: '/games/ninja-parkour/index.html' },
  { id: 'color-puzzle', title: 'Color Puzzle', subtitle: 'Sort colors.', description: 'Color Puzzle — sort tubes by color.', genre: 'Puzzle', tone: 'Brain', mark: 'CP', color: 'hextris', path: '/games/color-puzzle/index.html' },
  { id: 'red-vs-blue', title: 'Red vs Blue', subtitle: 'Team battle.', description: 'Red vs Blue — battle arena.', genre: 'Arcade', tone: 'Battle', mark: 'RB', color: 'devil', path: '/games/red-vs-blue/index.html' },
  { id: 'build-defend', title: 'Build & Defend', subtitle: 'Build base.', description: 'Build & Defend — build, defend wave.', genre: 'Sandbox', tone: 'Strategy', mark: 'BD', color: 'mining', path: '/games/build-defend/index.html' },
  { id: 'basket-bros', title: 'Basket Bros', subtitle: 'Dunk duel.', description: 'Basket Bros — 2P basketball chaos.', genre: 'Arcade', tone: 'Sports', mark: 'BB', color: 'drive', path: '/games/basket-bros/index.html' },
  { id: 'bad-simulator', title: 'Bad Simulator', subtitle: 'Be bad.', description: 'Bad Simulator — cause chaos.', genre: 'Arcade', tone: 'Chaos', mark: 'BS', color: 'twenty', path: '/games/bad-simulator/index.html' },
  { id: 'war-the-knights', title: 'War The Knights', subtitle: 'Knight war.', description: 'War The Knights — slash, defend castle.', genre: 'Arcade', tone: 'Battle', mark: 'WK', color: 'devil', path: '/games/war-the-knights/index.html' },
  { id: 'raven-shooting', title: 'Raven Shooting', subtitle: 'Shoot ravens.', description: 'Raven Shooting — aim, shoot ravens.', genre: 'Arcade', tone: 'Aim', mark: 'RS', color: 'stack', path: '/games/raven-shooting/index.html' },
  { id: 'summer', title: 'Summer Vibes', subtitle: 'Beach fun.', description: 'Summer — beach run, collect shells.', genre: 'Arcade', tone: 'Chill', mark: 'SU', color: 'cookie', path: '/games/summer/index.html' },
  { id: 'ks2-cs', title: 'KS2 CS', subtitle: 'Tactical shoot.', description: 'KS2 CS — tactical shooter.', genre: 'Arcade', tone: 'Battle', mark: 'CS', color: 'stack', path: '/games/ks2-cs/index.html' },
  { id: 'gta-mods', title: 'GTA Mods', subtitle: 'Modded city.', description: 'GTA Mods — modded GTA fun.', genre: 'Racing', tone: 'Mods', mark: 'GM', color: 'twenty', path: '/games/gta-mods/index.html' },
  { id: 'cb-clicker', title: 'CB Clicker', subtitle: 'Click billions.', description: 'CB Clicker — click to billions.', genre: 'Idle', tone: 'Clicker', mark: 'CB', color: 'cookie', path: '/games/cb-clicker/index.html' },
  { id: 'moto-x3m-winter', title: 'Moto X3M Winter', subtitle: 'Icy stunts.', description: 'Moto X3M Winter — icy stunt racing.', genre: 'Racing', tone: 'Winter', mark: 'MX', color: 'hextris', path: '/games/moto-x3m-winter/index.html' },
  { id: 'a-small-world-cup', title: 'A Small World Cup', subtitle: 'Tap-timing soccer', description: 'Tap to shoot, bend, score — physics cup. 6X classic.', genre: 'Arcade', tone: 'Sports', mark: 'SW', color: 'drive', path: '/games/a-small-world-cup/index.html' },
  { id: 'bitlife-simulator', title: 'BitLife Simulator', subtitle: 'Live a life', description: 'Choose paths — jobs, crime, wealth. Full sim.', genre: 'Simulation', tone: 'Life', mark: 'BL', color: 'mining', path: '/games/bitlife-simulator/index.html' },
  { id: 'big-tower-tiny-square', title: 'Big Tower Tiny Square', subtitle: 'Precision parkour', description: 'Tiny square, huge tower — wall-jump perfection.', genre: 'Platformer', tone: 'Precision', mark: 'BT', color: 'stack', path: '/games/big-tower-tiny-square/index.html' },
  { id: 'house-of-hazards', title: 'House of Hazards', subtitle: 'Home chaos', description: 'House tasks while others sabotage — couch co-op.', genre: 'Arcade', tone: 'Chaos', mark: 'HH', color: 'twenty', path: '/games/house-of-hazards/index.html' },
  { id: 'ball-blast', title: 'Ball Blast', subtitle: 'Blast numbers', description: 'Shoot cannon, pop falling numbered balls.', genre: 'Arcade', tone: 'Reflex', mark: 'BB', color: 'hextris', path: '/games/ball-blast/index.html' },
  { id: 'rocket-league-2d', title: 'Rocket League 2D', subtitle: 'Car soccer', description: 'Drive, jump, boost — score in 2D arena.', genre: 'Arcade', tone: 'Sports', mark: 'RL', color: 'drive', path: '/games/rocket-league-2d/index.html' },
  { id: 'vex-6', title: 'Vex 6', subtitle: 'Parkour 6', description: 'The hardest Vex — lasers, saws, new acts.', genre: 'Platformer', tone: 'Hardcore', mark: 'V6', color: 'stack', path: '/games/vex-6/index.html' },
  { id: 'noob-survival', title: 'Noob Survival', subtitle: 'Craft & survive', description: 'Noob vs zombies — mine, craft, shelter.', genre: 'Sandbox', tone: 'Survival', mark: 'NS', color: 'mining', path: '/games/noob-survival/index.html' },
  { id: 'car-king-arena-2', title: 'Car King Arena 2', subtitle: 'Arena smash', description: 'Arena cars — smash, stunt, collect.', genre: 'Racing', tone: 'Arena', mark: 'CK', color: 'drive', path: '/games/car-king-arena-2/index.html' },
  { id: 'basketball-physics', title: 'Basketball Physics', subtitle: 'Ragdoll hoops', description: 'Ragdoll 2P — floppy shots to 11.', genre: 'Arcade', tone: 'Sports', mark: 'BP', color: 'drive', path: '/games/basketball-physics/index.html' },
  { id: '12-minibattles', title: '12 MiniBattles', subtitle: 'Party mayhem', description: '12 silly 2P battles — thumb war to roto.', genre: 'Arcade', tone: 'Party', mark: '12', color: 'youtube', path: '/games/12-minibattles/index.html' },
  { id: 'miner-dash', title: 'Miner Dash', subtitle: 'Dash & dig', description: 'Dash, dig, dodge lava in caves.', genre: 'Platformer', tone: 'Reflex', mark: 'MD', color: 'mining', path: '/games/miner-dash/index.html' },
  { id: 'draw-climber', title: 'Draw Climber', subtitle: 'Draw legs', description: 'Draw legs to climb walls — creative climb.', genre: 'Arcade', tone: 'Creative', mark: 'DC', color: 'stack', path: '/games/draw-climber/index.html' },
  { id: 'car-crash-test', title: 'Car Crash Test', subtitle: 'Wreck it', description: 'Launch cars, crash, ragdoll physics.', genre: 'Simulation', tone: 'Crash', mark: 'CT', color: 'devil', path: '/games/car-crash-test/index.html' },
  { id: 'geometry-rash', title: 'Geometry Rash', subtitle: 'Rhythm rush', description: 'One-button rash — jump, fly, wave to beat.', genre: 'Rhythm', tone: 'Wave', mark: 'GR', color: 'cookie', path: '/games/geometry-rash/index.html' },
  { id: 'escape-masters', title: 'Escape Masters', subtitle: 'Escape puzzle', description: 'Escape rooms — find keys, codes, doors.', genre: 'Puzzle', tone: 'Escape', mark: 'EM', color: 'hextris', path: '/games/escape-masters/index.html' },
  { id: 'fall-guys', title: 'Fall Guys', subtitle: 'Wobbly race', description: 'Wobbly race — 32 knock-out, final crown.', genre: 'Arcade', tone: 'Party', mark: 'FG', color: 'youtube', path: '/games/fall-guys/index.html' },
  { id: 'paper-minecraft', title: 'Paper Minecraft', subtitle: '2D craft', description: 'Paper Minecraft — mine, craft, build 2D.', genre: 'Sandbox', tone: 'Craft', mark: 'PM', color: 'mining', path: '/games/paper-minecraft/index.html' },
  { id: 'gold-miner', title: 'Gold Miner', subtitle: 'Hook gold', description: 'Swing hook, grab gold, avoid rocks.', genre: 'Arcade', tone: 'Physics', mark: 'GM', color: 'cookie', path: '/games/gold-miner/index.html' },
  { id: 'grindcraft-remastered', title: 'Grindcraft Remastered', subtitle: 'Grind & craft', description: 'Chop, mine, craft tools — prestige.', genre: 'Idle', tone: 'Craft', mark: 'GC', color: 'mining', path: '/games/grindcraft-remastered/index.html' },
  { id: 'happy-glass', title: 'Happy Glass', subtitle: 'Draw water', description: 'Draw lines to fill glass — pour physics.', genre: 'Puzzle', tone: 'Physics', mark: 'HG', color: 'cookie', path: '/games/happy-glass/index.html' },
  { id: 'snowball-io', title: 'Snowball.io', subtitle: 'Roll & push', description: 'Roll snowball, push foes off arena.', genre: 'Arcade', tone: 'Battle', mark: 'SI', color: 'hextris', path: '/games/snowball-io/index.html' },
  { id: 'jelly-truck', title: 'Jelly Truck', subtitle: 'Wobbly drive', description: 'Jelly truck — soft-body drive, deliver.', genre: 'Racing', tone: 'Physics', mark: 'JT', color: 'drive', path: '/games/jelly-truck/index.html' },
  { id: 'short-life', title: 'Short Life', subtitle: 'Ragdoll pain', description: 'Dodge saws, spikes — survive office.', genre: 'Arcade', tone: 'Ragdoll', mark: 'SL', color: 'devil', path: '/games/short-life/index.html' },
  { id: 'minecraft-skyblock', title: 'Minecraft Skyblock', subtitle: 'Sky block', description: 'Skyblock — one block expands to island.', genre: 'Sandbox', tone: 'Craft', mark: 'MS', color: 'mining', path: '/games/minecraft-skyblock/index.html' },
  { id: 'tower-defense', title: 'Tower Defense', subtitle: 'Defend path', description: 'Place towers, stop waves — upgrade.', genre: 'Strategy', tone: 'Defense', mark: 'TD', color: 'stack', path: '/games/tower-defense/index.html' },
  { id: 'mr-bullet', title: 'Mr Bullet', subtitle: 'Trick shots', description: 'Ricochet bullets — puzzles to kill.', genre: 'Puzzle', tone: 'Aim', mark: 'MB', color: 'devil', path: '/games/mr-bullet/index.html' },
  { id: 'stick-archers-battle', title: 'Stick Archers Battle', subtitle: 'Archery duel', description: 'Aim wind, headshot stick archers.', genre: 'Arcade', tone: 'Aim', mark: 'SA', color: 'stack', path: '/games/stick-archers-battle/index.html' },
  { id: 'swords-and-sandals', title: 'Swords & Sandals', subtitle: 'Gladiator', description: 'Gladiator fights — upgrade gear, arena.', genre: 'Arcade', tone: 'Battle', mark: 'SS', color: 'devil', path: '/games/swords-and-sandals/index.html' },
  { id: 'sling-drift', title: 'Sling Drift', subtitle: 'Drift sling', description: 'Hold to sling drift — never brake.', genre: 'Racing', tone: 'Drift', mark: 'SD', color: 'drive', path: '/games/sling-drift/index.html' },
  { id: 'piano-tiles', title: 'Piano Tiles', subtitle: 'Tap black', description: 'Tap black tiles, avoid white — speed.', genre: 'Rhythm', tone: 'Tap', mark: 'PT', color: 'hextris', path: '/games/piano-tiles/index.html' },
  { id: 'wheelie-bike', title: 'Wheelie Bike', subtitle: 'Wheelie only', description: 'Hold wheelie, balance, collect.', genre: 'Racing', tone: 'Balance', mark: 'WB', color: 'drive', path: '/games/wheelie-bike/index.html' },
  { id: 'pixel-shooter', title: 'Pixel Shooter', subtitle: 'Pixel FPS', description: 'Pixel shooter — blocky war, online.', genre: 'Shooter', tone: 'FPS', mark: 'PS', color: 'stack', path: '/games/pixel-shooter/index.html' },
  { id: 'qwop', title: 'QWOP', subtitle: 'Run cursed', description: 'QWOP — run 100m with QWOP keys.', genre: 'Arcade', tone: 'Ragdoll', mark: 'QW', color: 'devil', path: '/games/qwop/index.html' },
  { id: 'dune-surfer', title: 'Dune Surfer', subtitle: 'Surf dunes', description: 'Surf dunes, grind, flip — desert.', genre: 'Racing', tone: 'Surf', mark: 'DS', color: 'hextris', path: '/games/dune-surfer/index.html' },
  { id: 'the-final-earth-2', title: 'The Final Earth 2', subtitle: 'City in space', description: 'Build colony on tiny world — space city.', genre: 'Simulation', tone: 'City', mark: 'FE', color: 'mining', path: '/games/the-final-earth-2/index.html' },
  { id: 'uno', title: 'Uno', subtitle: 'Card classic', description: 'Uno — match color/number, +4 win.', genre: 'Puzzle', tone: 'Cards', mark: 'UN', color: 'cookie', path: '/games/uno/index.html' },
  { id: 'sonic-the-hedgehog', title: 'Sonic Hedgehog', subtitle: 'Speed run', description: 'Sonic — loops, rings, chaos.', genre: 'Platformer', tone: 'Speed', mark: 'SO', color: 'devil', path: '/games/sonic-the-hedgehog/index.html' },
  { id: 'there-is-no-game', title: 'There Is No Game', subtitle: 'Meta puzzle', description: 'Narrator says there is no game — break it.', genre: 'Puzzle', tone: 'Meta', mark: 'NG', color: 'stack', path: '/games/there-is-no-game/index.html' },
  { id: 'zombie-outbreak-arena', title: 'Zombie Outbreak Arena', subtitle: 'Survive horde', description: 'Horde arena — shoot, loot, survive.', genre: 'Shooter', tone: 'Survival', mark: 'ZO', color: 'twenty', path: '/games/zombie-outbreak-arena/index.html' },
  { id: 'one-escape', title: 'One Escape', subtitle: 'Stealth prison', description: 'Stealth escape — guards, keys, vents.', genre: 'Puzzle', tone: 'Stealth', mark: 'OE', color: 'stack', path: '/games/one-escape/index.html' },
  { id: 'run-rabbit-run', title: 'Run Rabbit Run', subtitle: 'Carrot chase', description: 'Rabbit run — forest dash, carrots.', genre: 'Platformer', tone: 'Runner', mark: 'RR', color: 'cookie', path: '/games/run-rabbit-run/index.html' },
  { id: 'car-driving', title: 'Car Driving', subtitle: 'City drive', description: 'City driving — traffic, park.', genre: 'Racing', tone: 'Sim', mark: 'CD', color: 'drive', path: '/games/car-driving/index.html' },
  { id: 'spiders', title: 'Spiders', subtitle: 'Web swing', description: 'Swing as spider — webs, prey.', genre: 'Arcade', tone: 'Swing', mark: 'SP', color: 'mining', path: '/games/spiders/index.html' },
  { id: 'short-ride', title: 'Short Ride', subtitle: 'Bike pain', description: 'Bike through pain parkour — saws.', genre: 'Racing', tone: 'Ragdoll', mark: 'SR', color: 'devil', path: '/games/short-ride/index.html' },
  { id: 'the-little-giant', title: 'The Little Giant', subtitle: 'Grow giant', description: 'Twin-stick — stomp, grow bigger.', genre: 'Arcade', tone: 'Grow', mark: 'LG', color: 'stack', path: '/games/the-little-giant/index.html' },
  { id: 'swerve', title: 'SWERVE', subtitle: 'Swerve pad', description: 'Swerve, collect, stay on track.', genre: 'Arcade', tone: 'Reflex', mark: 'SW', color: 'hextris', path: '/games/swerve/index.html' },
]
const filters = ['All games', 'Idle', 'Arcade', 'Puzzle', 'Racing', 'Platformer', 'Simulation', 'Sandbox', 'Community', 'Battle', 'Favorites']
const pubColors = ['cookie', 'drive', 'mining', 'devil', 'stack', 'hextris', 'twenty', 'youtube']

type PublishedListing = { id: string; title: string; icon: string | null }

const FEATURED_IDS = ['cookie-clicker','stack','drive-mad','moto-x3m','among-us','retro-bowl','hole-io']

// --- 10 Feature Helpers ---
const CONTROLS_LEGEND: Record<string,string> = {
  Arcade: 'Arrows / WASD to move • Space to jump/action • R to restart',
  Platformer: 'Arrows / WASD • Space to jump • Shift to run • R to restart',
  Racing: 'Arrows / WASD to steer • Space to brake • R to reset',
  Puzzle: 'Mouse + keyboard • Arrows to move • R/Enter to restart',
  Idle: 'Mouse clicks • Space to speed',
  Simulation: 'Mouse + WASD • Scroll to zoom',
  Sandbox: 'WASD to move • Space to jump • E to interact',
  Battle: 'WASD to move • Mouse to aim • Space/Click to shoot',
  Community: 'WASD / Arrows • Space • Enter',
  default: 'Arrows / WASD • Space • Enter • R to restart'
}
function hashDay(str:string){ let h=0; for(let i=0;i<str.length;i++) h=(h*31+str.charCodeAt(i))>>>0; return h }
function gameOfDayIndex(len:number, dateStr?:string){ const d=dateStr|| new Date().toISOString().slice(0,10); return hashDay(d)%len }
const PROXY_TILES = [
  { id:'yt', label:'YouTube', sub:'Watch unblocked', href:'/proxy', icon:'▶', color:'#ff2e63', url:'https://www.youtube.com' },
  { id:'gg', label:'Google', sub:'Search anything', href:'/proxy', icon:'G', color:'#4285f4', url:'https://www.google.com' },
  { id:'dc', label:'Discord', sub:'Chat & calls', href:'/proxy', icon:'◈', color:'#5865f2', url:'https://discord.com/app' },
  { id:'tk', label:'TikTok', sub:'Shorts feed', href:'/proxy', icon:'♪', color:'#00f2ea', url:'https://www.tiktok.com' },
]
type RequestItem = { id:string; title:string; votes:number; status:string }


export default function Page() {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All games')
  const [favorites, setFavorites] = useState<string[]>([])
  const [activeGame, setActiveGame] = useState<Game | null>(null)
  const [published, setPublished] = useState<Game[]>([])
  const [spotIdx, setSpotIdx] = useState(0)
  const [view, setView] = useState<'shelves'|'grid'>('shelves')
  const [frameLoading, setFrameLoading] = useState(true)
  const [frameError, setFrameError] = useState<string | null>(null)
  const [showControls, setShowControls] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [recentlyPlayed, setRecentlyPlayed] = useState<string[]>([])
  // 10 features state
  const [theme, setTheme] = useState<'dark'|'light'>('dark')
  const [online, setOnline] = useState(true)
  const [installPrompt, setInstallPrompt] = useState<any>(null)
  const [installable, setInstallable] = useState(false)
  const [playCounts, setPlayCounts] = useState<Record<string,number>>({})
  const [requests, setRequests] = useState<RequestItem[]>([])
  const [requestVotes, setRequestVotes] = useState<string[]>([])
  const [newReqTitle, setNewReqTitle] = useState('')
  const [reportSent, setReportSent] = useState(false)
  const [leaderTab, setLeaderTab] = useState<'today'|'week'>('today')

  const featuredGames = useMemo(()=> games.filter(g=> FEATURED_IDS.includes(g.id)), [])

  useEffect(() => {
    const id = setInterval(()=> setSpotIdx(i=> (i+1)%featuredGames.length), 5000)
    return ()=> clearInterval(id)
  }, [featuredGames.length])

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

  // Load favorites from localStorage + theme + playCounts + requests votes
  useEffect(()=>{
    try{
      const f = JSON.parse(localStorage.getItem('ggl_fav')||'[]')
      if(Array.isArray(f)) setFavorites(f)
      const r = JSON.parse(localStorage.getItem('ggl_recent')||'[]')
      if(Array.isArray(r)) setRecentlyPlayed(r)
      const th = localStorage.getItem('ggl_theme') as 'dark'|'light'|null
      if(th) setTheme(th)
      const pc = JSON.parse(localStorage.getItem('ggl_playcounts')||'{}')
      if(pc && typeof pc==='object') setPlayCounts(pc)
      const rv = JSON.parse(localStorage.getItem('ggl_req_votes')||'[]')
      if(Array.isArray(rv)) setRequestVotes(rv)
    }catch{}
    setOnline(typeof navigator!=='undefined' ? navigator.onLine : true)
    const onOnline=()=> setOnline(true)
    const onOffline=()=> setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const onInstallable = ()=> setInstallable(true)
    window.addEventListener('ggl:installable', onInstallable as any)
    const dp = (window as any).__gglDeferredPrompt
    if(dp) { setInstallPrompt(dp); setInstallable(true) }
    const handler = (e:any)=>{ e.preventDefault(); setInstallPrompt(e); setInstallable(true) }
    window.addEventListener('beforeinstallprompt', handler as any)
    return ()=> { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); window.removeEventListener('ggl:installable', onInstallable as any); window.removeEventListener('beforeinstallprompt', handler as any) }
  },[])
  useEffect(()=>{ try{localStorage.setItem('ggl_fav', JSON.stringify(favorites))}catch{} },[favorites])
  useEffect(()=>{ try{localStorage.setItem('ggl_recent', JSON.stringify(recentlyPlayed.slice(0,12)))}catch{} },[recentlyPlayed])
  useEffect(()=>{ try{ localStorage.setItem('ggl_playcounts', JSON.stringify(playCounts))}catch{}},[playCounts])
  useEffect(()=>{ try{ localStorage.setItem('ggl_req_votes', JSON.stringify(requestVotes))}catch{}},[requestVotes])
  useEffect(()=>{ try{ localStorage.setItem('ggl_theme', theme); document.documentElement.setAttribute('data-theme', theme); }catch{}},[theme])
  // fetch requests for upvote list
  useEffect(()=>{
    fetch('/api/game-requests').then(r=> r.ok? r.json(): null).then((d:any)=>{
      if(d?.requests) setRequests(d.requests.map((x:any)=> ({ id:String(x.id), title:x.title||x.game||x.name||'Unknown', votes: Number(x.votes||x.upvotes||0), status: x.status||'pending'})))
    }).catch(()=>{})
  },[])

  const allGames = useMemo(() => [...games, ...published], [published])
  const visibleGames = useMemo(
    () =>
      allGames.filter(
        (game) =>
          `${game.title} ${game.genre} ${game.tone} ${game.description}`.toLowerCase().includes(query.toLowerCase()) &&
          (filter === 'All games' || game.genre === filter || (filter === 'Favorites' && favorites.includes(game.id))),
      ),
    [allGames, favorites, filter, query],
  )

  const grouped = useMemo(()=>{
    const map: Record<string, Game[]> = {}
    for(const g of visibleGames){
      const k = g.genre
      if(!map[k]) map[k]=[]
      map[k].push(g)
    }
    // sort keys by count descending, but keep All order stable
    return Object.entries(map).sort((a,b)=> b[1].length - a[1].length)
  }, [visibleGames])

  const spotlight = featuredGames[spotIdx] || games[0]
  const gameOfDay = useMemo(()=> {
    const idx = gameOfDayIndex(allGames.length)
    return allGames[idx] || games[0]
  }, [allGames])
  const filterCounts = useMemo(()=>{
    const m: Record<string,number>={}
    for(const f of filters){
      if(f==='All games') m[f]= allGames.filter(g=> `${g.title} ${g.genre} ${g.tone} ${g.description}`.toLowerCase().includes(query.toLowerCase())).length
      else if(f==='Favorites') m[f]= allGames.filter(g=> favorites.includes(g.id) && `${g.title} ${g.genre} ${g.tone} ${g.description}`.toLowerCase().includes(query.toLowerCase())).length
      else m[f]= allGames.filter(g=> g.genre===f && `${g.title} ${g.genre} ${g.tone} ${g.description}`.toLowerCase().includes(query.toLowerCase())).length
    }
    return m
  }, [allGames, favorites, query])
  const leaderboard = useMemo(()=>{
    const entries = allGames.map(g=> ({ game:g, count: playCounts[g.id]||0})).sort((a,b)=> b.count - a.count).slice(0,5)
    // if no plays, fall back to featured order
    if(entries.every(e=> e.count===0)) return featuredGames.slice(0,5).map((g,i)=> ({ game:g, count: 5-i}))
    return entries
  }, [allGames, playCounts])

  function launch(game: Game) {
    setActiveGame(game)
    setFrameLoading(true)
    setFrameError(null)
    setShowControls(false)
    setShowLegend(false)
    setReportSent(false)
    setRecentlyPlayed(prev=> [game.id, ...prev.filter(x=> x!==game.id)].slice(0,12))
    setPlayCounts(prev=> ({ ...prev, [game.id]: (prev[game.id]||0)+1 }))
    // also fire visit beacon best-effort
    try{ fetch('/api/visit', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ gameId: game.id }) }).catch(()=>{}) }catch{}
  }
  function toggleFavorite(id: string) {
    setFavorites((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }
  function shufflePick(){
    const pool = visibleGames.length? visibleGames: allGames
    const pick = pool[Math.floor(Math.random()*pool.length)]
    if(pick) launch(pick)
  }
  function toggleTheme(){ setTheme(t=> t==='dark'?'light':'dark') }
  async function doInstall(){
    const dp:any = installPrompt || (window as any).__gglDeferredPrompt
    if(dp && dp.prompt){ try{ dp.prompt(); const r= await dp.userChoice; if(r) { setInstallable(false); setInstallPrompt(null); (window as any).__gglDeferredPrompt=null } }catch{} return }
    // fallback: hint
    alert('To install: open browser menu → Install app / Add to Home Screen')
  }
  function reportBroken(){
    if(!activeGame) return
    const key='ggl_reported_'+activeGame.id
    try{ localStorage.setItem(key,'1') }catch{}
    setReportSent(true)
    fetch('/api/report', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ gameId: activeGame.id, title: activeGame.title })}).catch(()=>{})
    // also store locally for admin view
    try{
      const arr = JSON.parse(localStorage.getItem('ggl_reports')||'[]')
      arr.push({ id: activeGame.id, title: activeGame.title, at: Date.now() })
      localStorage.setItem('ggl_reports', JSON.stringify(arr.slice(-50)))
    }catch{}
  }
  async function submitRequest(){
    const title = newReqTitle.trim()
    if(!title) return
    const optimistic = { id: 'local-'+Date.now(), title, votes:1, status:'pending'}
    setRequests(r=> [optimistic, ...r].slice(0,20))
    setRequestVotes(v=> [...v, optimistic.id])
    setNewReqTitle('')
    try{
      const res = await fetch('/api/game-requests', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ title })})
      if(res.ok){ const d= await res.json(); if(d?.request) setRequests(r=> r.map(x=> x.id===optimistic.id ? { id:String(d.request.id), title:d.request.title, votes: Number(d.request.votes||1), status:d.request.status||'pending'}: x)) }
    }catch{}
  }
  async function upvoteRequest(id:string){
    if(requestVotes.includes(id)) return
    setRequestVotes(v=> [...v, id])
    setRequests(rs=> rs.map(r=> r.id===id? {...r, votes:r.votes+1}: r))
    try{ await fetch('/api/game-requests/'+id+'/upvote', { method:'POST' }).catch(()=> fetch('/api/game-requests', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ upvoteId:id })})) }catch{}
    // fallback local
    try{ await fetch('/api/report', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ upvoteRequestId:id })}) }catch{}
  }
  function openProxyTile(url:string){ window.location.href = '/proxy?url='+encodeURIComponent(url) }

  function handleFrameLoad(){
    setFrameLoading(false)
    setFrameError(null)
    const iframe = frameRef.current
    if(!iframe) return
    // focus iframe for keyboard immediately
    try{ iframe.focus() }catch{}
    try{
      const doc = iframe.contentDocument
      const win = iframe.contentWindow as Window & { UnityLoader?: unknown } | null
      if(!doc) return
      // Inject robust responsive patch — fills most of screen, no cut-off, preserves aspect via contain
      const style = doc.createElement('style')
      style.setAttribute('data-ggl-patch','1')
      style.textContent = `
        html,body{margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#0b0d12!important;overscroll-behavior:none!important}
        /* Every known Unity / GameMaker / generic container fills viewport absolute */
        #gameContainer,#unityContainer,#unity-container,.webgl-content,#content,#gm4html5_div_id{display:flex!important;align-items:center!important;justify-content:center!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-height:100vh!important;max-width:100vw!important;max-height:100vh!important;margin:0!important;transform:none!important;left:auto!important;top:auto!important;overflow:hidden!important;background:#0b0d12!important}
        .gm4html5_div_class{width:100%!important;height:100%!important;max-width:100vw!important;max-height:100vh!important;display:flex!important;align-items:center!important;justify-content:center!important;margin:0!important;padding:0!important}
        canvas,#canvas,#unity-canvas{width:100%!important;height:100%!important;max-width:100vw!important;max-height:100vh!important;object-fit:contain!important;display:block!important;margin:auto!important;image-rendering:auto!important}
        /* ensure GameMaker canvas scales: it has pixel width/height attrs, CSS contain will keep aspect without cut-off */
        #loader,.loader,#unity-loading-bar{position:absolute!important;inset:0!important;display:flex!important;align-items:center!important;justify-content:center!important;flex-direction:column!important;z-index:2!important}
      `
      if(doc.head) doc.head.appendChild(style)
      // Also inject a tiny resize helper that keeps canvas focused and traps bonk
      const helper = doc.createElement('script')
      helper.textContent = `
        (function(){
          // trap Slope's bonk anti-frame: swallow message before it bubbles to parent
          // (parent also ignores bonk)
          try{
            var origPM = window.parent && window.parent.postMessage;
            // intercept in child: don't actually post bonk
            var _pm = window.postMessage;
            window.addEventListener('message', function(e){ if(e.data==='bonk') e.stopImmediatePropagation(); }, true);
            // override parent post for bonk only if needed - rewire window.parent.postMessage to noop for bonk
            if(window.parent !== window.self){
              try{
                var p = window.parent;
                var orig = p.postMessage.bind(p);
                p.postMessage = function(msg,t){ if(msg==='bonk') return; return orig(msg,t); }
              }catch(e){}
            }
          }catch(e){}
          function fit(){
            var c = document.querySelector('canvas');
            if(c){ c.setAttribute('tabindex','0'); }
          }
          window.addEventListener('resize', fit);
          fit();
          // focus after short delay for keyboard
          setTimeout(function(){
            var c=document.querySelector('canvas'); if(c) try{c.focus();}catch(e){}
          }, 400);
        })();
      `
      try{ if(doc.body) doc.body.appendChild(helper); else doc.documentElement.appendChild(helper) }catch{}
      // Force focus canvas from parent side too
      const c = doc.querySelector('canvas') as HTMLCanvasElement | null
      if(c) { c.setAttribute('tabindex','0'); setTimeout(()=> { try{ c.focus(); }catch{}; try{ iframe.focus(); }catch{} }, 350) }
      // Detect broken CDN / missing files → surface mirror tip
      setTimeout(()=>{
        try{
          const txt = (doc.body?.innerText||'').slice(0,2500)
          const hasCanvas = !!doc.querySelector('canvas')
          if(!hasCanvas && /404|Failed to download|NOT FOUND|cdn|blocked|cannot fetch|NetworkError/i.test(txt) && txt.length<2500){
            setFrameError('This game failed to load its files. Try switching its mirror ( ⋮ → CDN inside the game), or open it in the Lounge Proxy.')
          } else if(!hasCanvas && txt.trim().length>0 && txt.trim().length<400 && /unavailable|updating|missing/i.test(txt)){
            // let game own overlay handle it
          } else if(!hasCanvas && doc.body && doc.body.children.length===0){
            setFrameError('The game looks empty — its files may be blocked on this network. Try opening in a new tab or via Proxy.')
          }
        }catch{}
      }, 5000)
    }catch(e){
      // cross-origin (should not happen as same-origin), ignore
    }
  }

  function sendKey(code: string, type: 'keydown'|'keyup'){
    const iframe = frameRef.current
    if(!iframe?.contentWindow || !iframe.contentDocument) return
    const win = iframe.contentWindow
    const doc = iframe.contentDocument
    const target = (doc.querySelector('canvas') as HTMLElement) || doc.body || doc.documentElement
    const key = code.replace('Arrow','').replace('Key','').replace('Digit','')
    // map code to key
    const keyMap: Record<string,string> = { ArrowUp:'ArrowUp', ArrowDown:'ArrowDown', ArrowLeft:'ArrowLeft', ArrowRight:'ArrowRight', Space:' ', Enter:'Enter' }
    const k = keyMap[code] || (code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : key)
    const opts: KeyboardEventInit = { key: k, code, bubbles:true, cancelable:true }
    try{ target.dispatchEvent(new KeyboardEvent(type, opts)) }catch{}
    try{ win.dispatchEvent(new KeyboardEvent(type, opts)) }catch{}
    try{ doc.dispatchEvent(new KeyboardEvent(type, opts)) }catch{}
  }
  function holdKey(code: string){
    sendKey(code,'keydown')
    // auto release after 160ms (tap)
    setTimeout(()=> sendKey(code,'keyup'), 160)
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
          <a href="/apps">Apps</a>
          <a href="/proxy">Proxy</a>
          <a href="#about">Studio</a>
          <a href="/request-game">Request a game</a>
          <a href="/admin">Admin</a>
        </nav>
        <div style={{display:'flex',alignItems:'center',gap:10}}>
          <div className="header-status" style={{display:'flex',alignItems:'center',gap:6}}>
            {online ? <Wifi size={12}/> : <WifiOff size={12} color="var(--coral)"/>}
            <span className="live-dot" style={{background: online?'var(--lime)':'var(--coral)'}} /> {allGames.length} titles
          </div>
          <button onClick={toggleTheme} aria-label="Toggle theme" title={theme==='dark'?'Switch to light mode':'Switch to dark mode'} style={{width:36,height:36,borderRadius:999,border:'1px solid var(--line)',background:'rgba(255,255,255,.06)',color:'var(--foreground)',display:'grid',placeItems:'center',cursor:'pointer'}}>
            {theme==='dark' ? <Sun size={16}/> : <Moon size={16}/>}
          </button>
          {installable && <button onClick={doInstall} style={{padding:'7px 10px',borderRadius:999,border:'1px solid var(--lime)',background:'var(--lime)',color:'#0b0d12',fontWeight:900,fontSize:12,display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}><Download size={14}/> Install</button>}
        </div>
      </header>
      {!online && <div style={{margin:'10px 18px 0',padding:'10px 14px',borderRadius:12,background:'rgba(255,92,92,.12)',border:'1px solid rgba(255,92,92,.3)',display:'flex',alignItems:'center',gap:8,color:'var(--foreground)',fontSize:13}}><WifiOff size={16}/> You’re offline — installed games and cached pages still work.</div>}
      {installable && <div style={{margin:'12px 18px 0',padding:'12px 14px',borderRadius:14,background:'linear-gradient(135deg, rgba(204,255,0,.18), rgba(0,242,234,.14))',border:'1px solid rgba(204,255,0,.35)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <span style={{display:'flex',alignItems:'center',gap:10,fontWeight:800,fontSize:13}}><span style={{width:32,height:32,borderRadius:999,background:'var(--lime)',display:'grid',placeItems:'center',color:'#0b0d12'}}><Download size={16}/></span> Install GG Lounge — play offline & launch like an app</span>
        <span style={{display:'flex',gap:8}}><button onClick={doInstall} style={{padding:'8px 14px',borderRadius:999,background:'#0b0d12',color:'#fff',border:'1px solid rgba(255,255,255,.15)',fontWeight:800,cursor:'pointer'}}>Install</button><button onClick={()=> setInstallable(false)} style={{padding:'8px 10px',borderRadius:999,background:'transparent',border:'1px solid var(--line)',color:'var(--foreground)',cursor:'pointer'}}>Dismiss</button></span>
      </div>}
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
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:14}}>
            <a className="hero-link" href="#games">
              Enter the lounge <ArrowUpRight size={15} />
            </a>
            <button onClick={shufflePick} className="btn-ghost" style={{padding:'8px 14px',fontSize:13}}>
              <Shuffle size={14}/> Surprise me
            </button>
            <button onClick={()=> launch(gameOfDay)} style={{padding:'8px 12px',borderRadius:999,border:'1px solid var(--line)',background:'rgba(255,255,255,.06)',color:'var(--foreground)',fontWeight:800,fontSize:12,display:'flex',alignItems:'center',gap:6,cursor:'pointer'}}>
              <Gift size={14}/> Game of the Day: {gameOfDay.title}
            </button>
          </div>
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
            <span>SPOTLIGHT / {(String(spotIdx+1).padStart(2,'0'))}</span>
            <span className="spotlight-tag">FEATURED</span>
          </div>
          <div className="spotlight-art" onClick={()=> launch(spotlight)} role="button" tabIndex={0} onKeyDown={e=> e.key==='Enter'&&launch(spotlight)} style={{cursor:'pointer'}}>
            <div className="orbit orbit-a" />
            <div className="orbit orbit-b" />
            <span className="spotlight-mark">{spotlight.mark}</span>
            <span className="spotlight-caption">
              {spotlight.tone.toUpperCase()}<br/>{spotlight.genre.toUpperCase()}
            </span>
          </div>
          <div className="spotlight-bottom">
            <div>
              <p className="card-kicker">{spotlight.genre} · {spotlight.tone}</p>
              <h2>{spotlight.title}</h2>
              <p>{spotlight.subtitle}</p>
            </div>
            <button className="circle-play" onClick={() => launch(spotlight)} aria-label={`Play ${spotlight.title}`}>
              <Play size={18} fill="currentColor" />
            </button>
          </div>
          <div style={{display:'flex',gap:6,justifyContent:'center',marginTop:10}}>
            {featuredGames.map((_,i)=> <span key={i} style={{width: i===spotIdx?22:8,height:6,borderRadius:99,background: i===spotIdx?'var(--lime)':'rgba(255,255,255,.22)',transition:'all .3s',display:'block'}}/>)}
          </div>
        </div>
      </section>

      {/* Game of the Day + Proxy Quick Bar */}
      <section className="catalog" style={{paddingTop:14,paddingBottom:6}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))',gap:14}}>
          <div style={{border:'1px solid var(--line)',borderRadius:16,overflow:'hidden',background:'linear-gradient(135deg, rgba(204,255,0,.14), rgba(126,91,255,.14))',padding:14,display:'flex',gap:14,alignItems:'center'}}>
            <div style={{width:64,height:64,borderRadius:14,background:'var(--panel)',border:'1px solid var(--line)',display:'grid',placeItems:'center',fontWeight:900,fontSize:22,flexShrink:0}}>{gameOfDay.mark}</div>
            <div style={{minWidth:0,flex:1}}>
              <p className="eyebrow" style={{margin:0,fontSize:10,letterSpacing:'.14em',display:'flex',alignItems:'center',gap:6}}><Crown size={12}/> GAME OF THE DAY — {new Date().toLocaleDateString('en-AU',{month:'short',day:'numeric'})}</p>
              <h3 style={{margin:'4px 0 2px',fontSize:18,letterSpacing:'-0.03em'}}>{gameOfDay.title}</h3>
              <p style={{margin:0,color:'var(--muted)',fontSize:13,lineHeight:1.4}}>{gameOfDay.subtitle} · {gameOfDay.genre} · {gameOfDay.tone}</p>
            </div>
            <button onClick={()=> launch(gameOfDay)} style={{padding:'10px 16px',borderRadius:999,background:'var(--lime)',color:'#0b0d12',border:'1px solid var(--lime)',fontWeight:900,cursor:'pointer',display:'flex',alignItems:'center',gap:6,whiteSpace:'nowrap'}}><Play size={14} fill="currentColor"/> Play now</button>
          </div>
          <div style={{border:'1px solid var(--line)',borderRadius:16,overflow:'hidden',background:'var(--panel)',padding:12}}>
            <p className="eyebrow" style={{margin:'0 0 10px',fontSize:10,display:'flex',alignItems:'center',gap:6}}><Globe size={12}/> PROXY QUICK-BAR — open anywhere</p>
            <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
              {PROXY_TILES.map(tile=> (
                <button key={tile.id} onClick={()=> openProxyTile(tile.url)} style={{border:'1px solid var(--line)',borderRadius:12,padding:'12px 8px',background:'rgba(255,255,255,.04)',cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:6, textAlign:'center'}}>
                  <span style={{width:36,height:36,borderRadius:999,background: tile.color, color:'#fff', display:'grid',placeItems:'center',fontWeight:900,fontSize:16}}>{tile.icon}</span>
                  <strong style={{fontSize:12,lineHeight:1}}>{tile.label}</strong>
                  <span style={{fontSize:10,color:'var(--muted)'}}>{tile.sub}</span>
                </button>
              ))}
            </div>
            <a href="/proxy" style={{display:'inline-flex',alignItems:'center',gap:6,marginTop:10,fontSize:12,fontWeight:700,color:'var(--foreground)',textDecoration:'none'}}>Open Proxy <ArrowUpRight size={12}/></a>
          </div>
        </div>
      </section>

      {/* Leaderboard + Your Lounge */}
      <section className="catalog" style={{paddingTop:8,paddingBottom:6}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))',gap:14}}>
          <div style={{border:'1px solid var(--line)',borderRadius:16,background:'var(--panel)',padding:14}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <p className="eyebrow" style={{margin:0,display:'flex',alignItems:'center',gap:6}}><Flame size={12}/> LEADERBOARD — most played</p>
              <span style={{display:'flex',gap:6}}>
                <button onClick={()=> setLeaderTab('today')} style={{padding:'5px 9px',borderRadius:999,border: leaderTab==='today'?'1px solid var(--lime)':'1px solid var(--line)',background: leaderTab==='today'?'var(--lime)':'transparent',color: leaderTab==='today'?'#0b0d12':'var(--foreground)',fontWeight:800,fontSize:11,cursor:'pointer'}}>Today</button>
                <button onClick={()=> setLeaderTab('week')} style={{padding:'5px 9px',borderRadius:999,border: leaderTab==='week'?'1px solid var(--lime)':'1px solid var(--line)',background: leaderTab==='week'?'var(--lime)':'transparent',color: leaderTab==='week'?'#0b0d12':'var(--foreground)',fontWeight:800,fontSize:11,cursor:'pointer'}}>Week</button>
              </span>
            </div>
            <div style={{display:'grid',gap:8}}>
              {leaderboard.map((e,i)=> (
                <button key={e.game.id} onClick={()=> launch(e.game)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 10px',borderRadius:12,border:'1px solid var(--line)',background:'rgba(255,255,255,.03)',cursor:'pointer',textAlign:'left'}}>
                  <span style={{width:28,height:28,borderRadius:999,background: i===0?'var(--lime)': i===1?'#cbd5e1': i===2?'#fdba74':'rgba(255,255,255,.08)',color: i<3?'#0b0d12':'var(--foreground)',display:'grid',placeItems:'center',fontWeight:900,fontSize:12}}>{i+1}</span>
                  <span style={{width:36,height:36,borderRadius:10,background:'var(--line)',display:'grid',placeItems:'center',fontWeight:900,fontSize:12,flexShrink:0}}>{e.game.mark}</span>
                  <span style={{flex:1,minWidth:0}}><strong style={{display:'block',fontSize:13,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{e.game.title}</strong><span style={{fontSize:11,color:'var(--muted)'}}>{e.game.genre} · {e.count} plays</span></span>
                  <Play size={14} fill="currentColor"/>
                </button>
              ))}
            </div>
          </div>
          <div style={{border:'1px solid var(--line)',borderRadius:16,background:'var(--panel)',padding:14}}>
            <p className="eyebrow" style={{margin:'0 0 10px',display:'flex',alignItems:'center',gap:6}}><Star size={12}/> YOUR LOUNGE — favorites & history</p>
            {favorites.length===0 && recentlyPlayed.length===0 && <p style={{color:'var(--muted)',fontSize:13}}>Favorite games with ♥ and they’ll live here. Played games appear in history automatically.</p>}
            {favorites.length>0 && <>
              <p style={{fontSize:12,fontWeight:800,margin:'0 0 8px',display:'flex',alignItems:'center',gap:6}}><Heart size={12} fill="var(--coral)" color="var(--coral)"/> Favorites ({favorites.length})</p>
              <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:8,scrollbarWidth:'none'}}>
                {allGames.filter(g=> favorites.includes(g.id)).map(g=> (
                  <button key={g.id} onClick={()=> launch(g)} style={{minWidth:120,border:'1px solid var(--line)',borderRadius:12,padding:10,background:'rgba(255,255,255,.04)',cursor:'pointer',textAlign:'left',flexShrink:0}}>
                    <span style={{width:28,height:28,borderRadius:8,background:'var(--lime)',color:'#0b0d12',display:'grid',placeItems:'center',fontWeight:900,fontSize:12}}>{g.mark}</span>
                    <strong style={{display:'block',marginTop:6,fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{g.title}</strong>
                    <span style={{fontSize:10,color:'var(--muted)'}}>{g.genre}</span>
                  </button>
                ))}
              </div>
            </>}
            {recentlyPlayed.length>0 && <>
              <p style={{fontSize:12,fontWeight:800,margin:'10px 0 8px',display:'flex',alignItems:'center',gap:6}}><Timer size={12}/> Recent ({recentlyPlayed.length})</p>
              <div style={{display:'flex',gap:8,overflowX:'auto',paddingBottom:4,scrollbarWidth:'none'}}>
                {allGames.filter(g=> recentlyPlayed.includes(g.id)).slice(0,8).map(g=> (
                  <button key={g.id} onClick={()=> launch(g)} style={{minWidth:120,border:'1px solid var(--line)',borderRadius:12,padding:10,background:'rgba(255,255,255,.04)',cursor:'pointer',textAlign:'left',flexShrink:0}}>
                    <span style={{width:28,height:28,borderRadius:8,background:'var(--line)',display:'grid',placeItems:'center',fontWeight:900,fontSize:12}}>{g.mark}</span>
                    <strong style={{display:'block',marginTop:6,fontSize:12,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{g.title}</strong>
                    <span style={{fontSize:10,color:'var(--muted)'}}>{g.genre}</span>
                  </button>
                ))}
              </div>
              <button onClick={()=> setRecentlyPlayed([])} style={{marginTop:8,fontSize:11,background:'none',border:0,color:'var(--muted)',textDecoration:'underline',cursor:'pointer'}}>Clear history</button>
            </>}
          </div>
        </div>
      </section>

      {/* Recently played */}
      {recentlyPlayed.length>0 && (
        <section className="catalog" style={{paddingTop:8,paddingBottom:10}}>
          <div className="section-heading" style={{marginBottom:14}}>
            <div><p className="eyebrow">CONTINUE PLAYING</p><h3 style={{margin:'6px 0 0',fontSize:20,letterSpacing:'-0.04em'}}>Pick up where you left off</h3></div>
            <button onClick={()=> setRecentlyPlayed([])} style={{fontSize:12,color:'rgba(255,255,255,.5)',background:'none',border:0,cursor:'pointer',textDecoration:'underline'}}>Clear</button>
          </div>
          <div className="shelf-track">
            {allGames.filter(g=> recentlyPlayed.includes(g.id)).slice(0,12).map(g=> (
              <button key={g.id} className={`shelf-card ${g.color}`} onClick={()=> launch(g)}>
                <span className="shelf-mark">{g.mark}</span>
                <span className="shelf-title">{g.title}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="catalog" id="games">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE ARCADE FLOOR</p>
            <h2>Pick your poison<span>.</span></h2>
          </div>
          <div className="collection-note">
            <Trophy size={16} />
            <span><strong>{visibleGames.length.toString().padStart(2, '0')}</strong> available now</span>
          </div>
        </div>
        <div className="toolbar">
          <div className="search-wrap">
            <Search size={17} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, genres, moods" aria-label="Search games" />
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
            <div className="view-toggle" role="group" aria-label="View toggle">
              <button className={view==='shelves'?'active':''} onClick={()=> setView('shelves')} aria-label="Shelves view"><Rows3 size={16}/> Shelves</button>
              <button className={view==='grid'?'active':''} onClick={()=> setView('grid')} aria-label="Grid view"><LayoutGrid size={16}/> Grid</button>
            </div>
            <button onClick={shufflePick} className="btn-mini" title="Random game"><Shuffle size={14}/> Shuffle</button>
          </div>
        </div>
        <div className="filter-tabs" role="tablist" aria-label="Filter games">
          {filters.map((item) => (
            <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)} role="tab" aria-selected={filter === item}>
              {item} <span style={{opacity:.7,fontWeight:700,marginLeft:4,fontSize:11}}>({filterCounts[item]??0})</span>
            </button>
          ))}
        </div>

        {/* Content */}
        {view === 'shelves' && filter==='All games' && !query ? (
          <div className="shelves">
            {grouped.map(([genre, list])=> (
              <div key={genre} className="shelf">
                <div className="shelf-head">
                  <h3>{genre} <span>{list.length}</span></h3>
                  <div className="shelf-actions">
                    <button className="shelf-nav" aria-label={`Scroll ${genre} left`} onClick={e=>{ const tr = (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement); if(tr) tr.scrollBy({left:-380,behavior:'smooth'})}}><ChevronLeft size={16}/></button>
                    <button className="shelf-nav" aria-label={`Scroll ${genre} right`} onClick={e=>{ const tr = (e.currentTarget.parentElement?.parentElement?.nextElementSibling as HTMLElement); if(tr) tr.scrollBy({left:380,behavior:'smooth'})}}><ChevronRight size={16}/></button>
                    <button className="btn-mini" onClick={()=> setFilter(genre)}>View all</button>
                  </div>
                </div>
                <div className="shelf-track">
                  {list.map((game, index)=> (
                    <article className={`shelf-card-art ${game.color}`} key={game.id}>
                      <button className="favorite-button" onClick={()=> toggleFavorite(game.id)} aria-label={`${favorites.includes(game.id)?'Remove':'Add'} ${game.title}`}><Heart size={15} fill={favorites.includes(game.id)?'currentColor':'none'}/></button>
                      <div className="shelf-art" onClick={()=> launch(game)} role="button" tabIndex={0} onKeyDown={e=> e.key==='Enter'&&launch(game)}>
                        {game.icon ? <img className="game-icon" src={game.icon} alt="" style={{width:56,height:56}}/> : <span className="game-mark" style={{fontSize:32}}>{game.mark}</span>}
                        <small>{String(index+1).padStart(2,'0')}</small>
                      </div>
                      <div className="shelf-info">
                        <p className="card-kicker" style={{fontSize:9}}>{game.genre} · {game.tone}</p>
                        <h4 onClick={()=> launch(game)}>{game.title}</h4>
                        <p>{game.description}</p>
                        <button className="play-button" onClick={()=> launch(game)}><Play size={12} fill="currentColor"/> Play</button>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ))}
            {grouped.length===0 && <div className="empty-state"><Zap size={22}/><h3>No games found</h3><p>Try a different search or clear the filter.</p></div>}
          </div>
        ) : (
          <>
            <div className={query || filter!=='All games' ? 'game-grid' : 'game-grid'}>
              {visibleGames.map((game, index) => (
                <article className={`game-card ${game.color}`} key={game.id}>
                  <button
                    className="favorite-button"
                    onClick={() => toggleFavorite(game.id)}
                    aria-label={`${favorites.includes(game.id) ? 'Remove' : 'Add'} ${game.title} ${favorites.includes(game.id) ? 'from' : 'to'} favorites`}
                  >
                    <Heart size={17} fill={favorites.includes(game.id) ? 'currentColor' : 'none'} />
                  </button>
                  <div className="game-art" onClick={()=> launch(game)} role="button" tabIndex={0} onKeyDown={e=> e.key==='Enter'&&launch(game)} style={{cursor:'pointer'}}>
                    {game.icon ? (
                      <img className="game-icon" src={game.icon} alt="" />
                    ) : (
                      <span className="game-mark">{game.mark}</span>
                    )}
                    <small>{String(index + 1).padStart(2, '0')}</small>
                  </div>
                  <div className="game-info">
                    <div>
                      <p className="card-kicker">{game.genre} · {game.tone}</p>
                      <h3>{game.title}</h3>
                      <p>{game.description}</p>
                    </div>
                    <div style={{display:'flex',gap:8}}>
                      <button className="play-button" onClick={() => launch(game)}><Play size={13} fill="currentColor" /> Launch</button>
                      {favorites.includes(game.id) && <span style={{alignSelf:'center',fontSize:11,color:'var(--coral)',display:'flex',alignItems:'center',gap:4}}><Heart size={12} fill="currentColor"/> Saved</span>}
                    </div>
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
          </>
        )}
      {/* Requests + Upvotes */}
        <div style={{marginTop:18,border:'1px solid var(--line)',borderRadius:16,background:'var(--panel)',padding:14}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
            <p className="eyebrow" style={{margin:0,display:'flex',alignItems:'center',gap:6}}><MessageSquare size={12}/> REQUEST A GAME — upvote what you want</p>
            <a href="/request-game" style={{fontSize:12,fontWeight:800,display:'inline-flex',alignItems:'center',gap:6,color:'var(--foreground)',textDecoration:'none'}}>Full request page <ArrowUpRight size={12}/></a>
          </div>
          <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
            <input value={newReqTitle} onChange={e=> setNewReqTitle(e.target.value)} placeholder="Type a game you want…" style={{flex:1,minWidth:220,padding:'10px 12px',borderRadius:999,border:'1px solid var(--line)',background:'rgba(255,255,255,.06)',color:'var(--foreground)',outline:'none'}} onKeyDown={e=> e.key==='Enter'&&submitRequest()} />
            <button onClick={submitRequest} style={{padding:'10px 16px',borderRadius:999,background:'var(--lime)',color:'#0b0d12',border:'1px solid var(--lime)',fontWeight:900,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}><Sparkles size={14}/> Request</button>
          </div>
          {requests.length>0 ? (
            <div style={{display:'grid',gap:8,marginTop:14,maxHeight:260,overflowY:'auto',paddingRight:4}}>
              {requests.slice(0,8).map(r=> (
                <div key={r.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:12,border:'1px solid var(--line)',background:'rgba(255,255,255,.03)'}}>
                  <span style={{flex:1,minWidth:0}}><strong style={{fontSize:13}}>{r.title}</strong> <span style={{fontSize:11,color:'var(--muted)',marginLeft:6}}>{r.status}</span></span>
                  <span style={{fontSize:12,fontWeight:800,display:'flex',alignItems:'center',gap:4}}><ThumbsUp size={12}/> {r.votes}</span>
                  <button disabled={requestVotes.includes(r.id)} onClick={()=> upvoteRequest(r.id)} style={{padding:'6px 10px',borderRadius:999,border: requestVotes.includes(r.id)?'1px solid var(--line)':'1px solid var(--lime)',background: requestVotes.includes(r.id)?'transparent':'var(--lime)',color: requestVotes.includes(r.id)?'var(--muted)':'#0b0d12',fontWeight:900,fontSize:11,cursor: requestVotes.includes(r.id)?'default':'pointer'}}>{requestVotes.includes(r.id)?'Voted':'Upvote'}</button>
                </div>
              ))}
            </div>
          ) : <p style={{marginTop:12,color:'var(--muted)',fontSize:13}}>No requests yet — be the first to ask for a game.</p>}
        </div>
      </section>
      <footer id="about">
        <div className="footer-top">
          <div className="footer-brand">
            <span className="brand-mark">
              <Gamepad2 size={17} />
            </span>
            <strong>GG-LOUNGE<span className="tm">™</span></strong>
          </div>
          <span className="footer-rule" />
          <p>Made by <strong>Kai Chauhan</strong></p>
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
        <div className="game-modal" role="dialog" aria-modal="true" aria-label={`${activeGame.title} game`} onClick={(e)=>{ if(e.target===e.currentTarget) setActiveGame(null)}}>
          <div className="modal-bar">
            <div style={{display:'flex',alignItems:'center',gap:12,minWidth:0}}>
              <span className={`game-badge ${activeGame.color}`}>{activeGame.mark}</span>
              <div style={{minWidth:0,overflow:'hidden'}}>
                <span className="modal-kicker">NOW PLAYING — {activeGame.genre.toUpperCase()} / {activeGame.tone.toUpperCase()}</span>
                <strong style={{display:'flex',alignItems:'center',gap:8,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{activeGame.title} {favorites.includes(activeGame.id) && <Heart size={14} fill="var(--coral)" color="var(--coral)"/>}</strong>
              </div>
            </div>
            <div className="modal-actions">
              <button className={`controls-toggle ${showControls?'active':''}`} onClick={()=> setShowControls(v=>!v)} title="Toggle touch controls" aria-label="Toggle touch controls" style={{width:'auto',padding:'0 12px',fontSize:11,fontWeight:900,letterSpacing:'.06em'}}><Gamepad2 size={14}/> {showControls?'Hide':'Controls'}</button>
              <button onClick={()=> setShowLegend(v=>!v)} title="Controls legend" aria-label="Controls legend" style={{width:'auto',padding:'0 10px',fontSize:11,fontWeight:800,display:'flex',alignItems:'center',gap:6,border: showLegend?'1px solid var(--lime)':'1px solid var(--line)',background: showLegend?'var(--lime)':'rgba(255,255,255,.06)',color: showLegend?'#0b0d12':'var(--foreground)',borderRadius:999,cursor:'pointer'}}><Keyboard size={14}/> {showLegend?'Hide':'How to play'}</button>
              <button onClick={reportBroken} disabled={reportSent} title={reportSent?'Reported':'Report broken'} aria-label="Report broken" style={{width:'auto',padding:'0 10px',fontSize:11,fontWeight:800,display:'flex',alignItems:'center',gap:6,border:'1px solid var(--line)',background: reportSent?'rgba(255,92,92,.18)':'rgba(255,255,255,.06)',color: reportSent?'var(--coral)':'var(--foreground)',borderRadius:999,cursor: reportSent?'default':'pointer',opacity: reportSent?.6:1}}><Bug size={14}/> {reportSent?'Reported':'Report'}</button>
              <button onClick={()=> { if(navigator.clipboard) navigator.clipboard.writeText(location.origin + activeGame.path); }} title="Copy link" aria-label="Copy link"><Copy size={16}/></button>
              <button onClick={()=> window.open(activeGame.path, '_blank')} title="Open in new tab" aria-label="Open in new tab"><ExternalLink size={16}/></button>
              <button onClick={()=> toggleFavorite(activeGame.id)} title={favorites.includes(activeGame.id)?'Remove favorite':'Add favorite'} aria-label="Favorite"><Heart size={16} fill={favorites.includes(activeGame.id)?'currentColor':'none'}/></button>
              <button onClick={() => { const el = wrapRef.current || frameRef.current; if(el) (el as HTMLElement).requestFullscreen?.()?.catch(()=> frameRef.current?.requestFullscreen?.()); else frameRef.current?.requestFullscreen?.(); }} aria-label="Fullscreen"><Maximize2 size={18} /></button>
              <button onClick={() => setActiveGame(null)} aria-label="Close game"><X size={20} /></button>
            </div>
          </div>
          <div className="frame-wrap" ref={wrapRef} onClick={()=> { try{ frameRef.current?.focus(); const c=(frameRef.current?.contentDocument?.querySelector('canvas') as HTMLElement); c?.focus(); }catch{} }}>
            {showLegend && (
              <div style={{position:'absolute',top:10,left:10,right:10,zIndex:6,padding:'12px 14px',borderRadius:12,background:'rgba(11,13,18,.92)',border:'1px solid var(--line)',backdropFilter:'blur(8px)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
                <span style={{display:'flex',alignItems:'center',gap:8,fontSize:12,fontWeight:800}}><Keyboard size={14}/> {CONTROLS_LEGEND[activeGame?.genre||'default'] || CONTROLS_LEGEND.default}</span>
                <span style={{display:'flex',alignItems:'center',gap:8,fontSize:11,color:'var(--muted)'}}><Monitor size={12}/> Tap Fullscreen for best view • <button onClick={()=> setShowLegend(false)} style={{background:'none',border:0,color:'var(--foreground)',textDecoration:'underline',cursor:'pointer',fontSize:11}}>Close</button></span>
              </div>
            )}
            {reportSent && (
              <div style={{position:'absolute',top: showLegend? 66:10, left:'50%', transform:'translateX(-50%)', zIndex:6, padding:'8px 12px', borderRadius:999, background:'rgba(255,92,92,.16)', border:'1px solid rgba(255,92,92,.35)', fontSize:12, fontWeight:800, display:'flex',alignItems:'center',gap:6}}>
                <Flag size={12}/> Thanks — reported as broken. We’ll check the mirror.
              </div>
            )}
            {frameLoading && (
              <div className="frame-loader">
                <Loader2 size={28} className="spin"/>
                <p>Loading {activeGame.title}…</p>
                <span>This game fills the lounge window. If it hangs, try “Open in new tab” or the Proxy — some school networks block game CDNs.</span>
              </div>
            )}
            {frameError && (
              <div className="frame-error">
                <AlertCircle size={22}/>
                <p>{frameError}</p>
                <div style={{display:'flex',gap:8,flexWrap:'wrap',justifyContent:'center'}}>
                  <button className="btn-mini" onClick={()=> { setFrameError(null); setFrameLoading(true); if(frameRef.current) frameRef.current.src = frameRef.current.src; }}>Retry</button>
                  <button className="btn-mini" onClick={()=> window.open(activeGame.path,'_blank')}>Open in new tab</button>
                  <a className="btn-mini" href="/proxy">Try in Proxy</a>
                  <button className="btn-mini" onClick={()=> setActiveGame(null)}>Close</button>
                </div>
              </div>
            )}
            <iframe
              ref={frameRef}
              className="game-frame"
              src={activeGame.path}
              title={activeGame.title}
              allow="fullscreen; autoplay; gamepad; keyboard-map; clipboard-read; clipboard-write; encrypted-media; picture-in-picture; web-share"
              allowFullScreen
              onLoad={handleFrameLoad}
              onError={()=> setFrameError('Failed to load game file.')}
            />
            <div className={`touch-controls ${showControls?'show':''}`} aria-hidden={!showControls}>
              <div className="touch-pad" role="group" aria-label="Direction pad">
                <span style={{width:52}}/>
                <button aria-label="Up" onTouchStart={(e)=>{e.preventDefault(); holdKey('ArrowUp')}} onMouseDown={()=> holdKey('ArrowUp')} onContextMenu={e=> e.preventDefault()}>▲</button>
                <span style={{width:52}}/>
                <button aria-label="Left" onTouchStart={(e)=>{e.preventDefault(); holdKey('ArrowLeft')}} onMouseDown={()=> holdKey('ArrowLeft')} onContextMenu={e=> e.preventDefault()}>◀</button>
                <button aria-label="Down" onTouchStart={(e)=>{e.preventDefault(); holdKey('ArrowDown')}} onMouseDown={()=> holdKey('ArrowDown')} onContextMenu={e=> e.preventDefault()}>▼</button>
                <button aria-label="Right" onTouchStart={(e)=>{e.preventDefault(); holdKey('ArrowRight')}} onMouseDown={()=> holdKey('ArrowRight')} onContextMenu={e=> e.preventDefault()}>▶</button>
              </div>
              <div className="touch-action" role="group" aria-label="Action buttons">
                <button onTouchStart={(e)=>{e.preventDefault(); holdKey('Space')}} onMouseDown={()=> holdKey('Space')} onContextMenu={e=> e.preventDefault()}>SPACE</button>
                <button onTouchStart={(e)=>{e.preventDefault(); holdKey('KeyW')}} onMouseDown={()=> holdKey('KeyW')} onContextMenu={e=> e.preventDefault()}>W</button>
                <button onTouchStart={(e)=>{e.preventDefault(); holdKey('Enter')}} onMouseDown={()=> holdKey('Enter')} onContextMenu={e=> e.preventDefault()}>↵</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}