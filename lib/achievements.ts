/** Only instrumented game outcomes belong here. No elapsed-time or launch awards. */
export type Achievement = {
  slug: string
  title: string
  description: string
  game: string
  metric: string
  target: number
  xp: number
}
const group = (
  game: string,
  metric: string,
  entries: [string, string, string, number, number][],
): Achievement[] =>
  entries.map(([slug, title, description, target, xp]) => ({
    slug,
    title,
    description,
    game,
    metric,
    target,
    xp,
  }))
export const achievements: Achievement[] = [
  ...group('cookie-clicker', 'clicks', [
    [
      'first-batch',
      'Made from Scratch',
      'Click the big cookie for the first time.',
      1,
      10,
    ],
    [
      'cookie-100-clicks',
      'Click Chemistry',
      'Make 100 cookie clicks in one ascension.',
      100,
      25,
    ],
    [
      'cookie-1000-clicks',
      'Golden Fingers',
      'Make 1,000 cookie clicks in one ascension.',
      1000,
      75,
    ],
  ]),
  ...group('cookie-clicker', 'baked', [
    [
      'cookie-100',
      'Fresh out of the Oven',
      'Bake 100 cookies in one ascension.',
      100,
      15,
    ],
    [
      'cookie-10000',
      'Dough Business',
      'Bake 10,000 cookies in one ascension.',
      10000,
      35,
    ],
    [
      'cookie-million',
      'Cookie Millionaire',
      'Bake 1,000,000 cookies in one ascension.',
      1000000,
      100,
    ],
    [
      'cookie-billion',
      'Billionaire Baker',
      'Bake 1,000,000,000 cookies in one ascension.',
      1000000000,
      200,
    ],
  ]),
  ...group('cookie-clicker', 'buildings', [
    [
      'cookie-building',
      'Hire Some Help',
      'Buy your first cookie building.',
      1,
      15,
    ],
    [
      'cookie-10-buildings',
      'Factory Floor',
      'Own 10 cookie buildings after a purchase.',
      10,
      30,
    ],
    [
      'cookie-100-buildings',
      'Industrial Revolution',
      'Own 100 cookie buildings after a purchase.',
      100,
      100,
    ],
  ]),
  ...group('stack', 'height', [
    [
      'stack-first',
      'Solid Foundation',
      'Successfully place a block in Stack.',
      1,
      10,
    ],
    [
      'stack-10',
      'Above the Noise',
      'Place 10 blocks in a single tower.',
      10,
      30,
    ],
    [
      'stack-25',
      'Skyline Architect',
      'Place 25 blocks in a single tower.',
      25,
      75,
    ],
    ['stack-50', 'Stratosphere', 'Place 50 blocks in a single tower.', 50, 150],
  ]),
  ...group('stack', 'perfectStreak', [
    [
      'stack-perfect',
      'Pixel Perfect',
      'Make a perfectly aligned Stack placement.',
      1,
      20,
    ],
    [
      'stack-perfect-3',
      'In the Zone',
      'Land 3 perfect placements in a row.',
      3,
      50,
    ],
    [
      'stack-perfect-5',
      'Unshakeable',
      'Land 5 perfect placements in a row.',
      5,
      100,
    ],
  ]),
  ...group('fable-devil', 'cleared', [
    [
      'devil-first',
      'Trust Issues',
      'Clear your first FableDevil level.',
      1,
      20,
    ],
    ['devil-3', 'Trick Reader', 'Clear 3 different FableDevil levels.', 3, 40],
    [
      'devil-5',
      'Outsmart the Devil',
      'Clear 5 different FableDevil levels.',
      5,
      75,
    ],
    [
      'devil-10',
      'No Trap Can Hold Me',
      'Clear 10 different FableDevil levels.',
      10,
      150,
    ],
  ]),
  ...group('fable-devil', 'comeback', [
    [
      'devil-comeback',
      'The Comeback',
      'Clear a level after dying on it this session.',
      1,
      30,
    ],
  ]),
  ...group('idle-mining', 'gathers', [
    [
      'mining-first',
      'Groundbreaker',
      'Successfully mine your first resource this session.',
      1,
      10,
    ],
    [
      'mining-100',
      'Pickaxe Rhythm',
      'Mine resources 100 times in one session.',
      100,
      40,
    ],
    [
      'mining-500',
      'Deep Work',
      'Mine resources 500 times in one session.',
      500,
      100,
    ],
  ]),
  ...group('idle-mining', 'level', [
    [
      'mining-level-3',
      'Below the Surface',
      'Level up to mining level 3.',
      3,
      25,
    ],
    [
      'mining-level-10',
      'Core Knowledge',
      'Level up to mining level 10.',
      10,
      75,
    ],
    [
      'mining-level-25',
      'Diamond Mind',
      'Level up to mining level 25.',
      25,
      150,
    ],
  ]),
  ...group('community', 'chat', [
    ['chat', 'Open Channel', 'Send a non-empty message to the lounge.', 1, 10],
  ]),
  ...group('community', 'note', [
    ['note', 'Second Brain', 'Save a non-empty note to your account.', 1, 10],
  ]),
]
export const gameNames: Record<string, string> = {
  'cookie-clicker': 'Cookie Clicker',
  stack: 'Stack',
  'fable-devil': 'FableDevil',
  'idle-mining': 'Idle Mining',
  community: 'Community',
}
export type GameplayEvent = { game: string; metric: string; value: number }
export function isGameplayEvent(value: unknown): value is GameplayEvent {
  if (!value || typeof value !== 'object') return false
  const e = value as GameplayEvent
  return (
    typeof e.game === 'string' &&
    typeof e.metric === 'string' &&
    typeof e.value === 'number' &&
    Number.isFinite(e.value) &&
    e.value >= 0 &&
    e.value <= Number.MAX_SAFE_INTEGER &&
    e.game !== 'community' &&
    achievements.some((a) => a.game === e.game && a.metric === e.metric)
  )
}
export function earnedBy(event: GameplayEvent) {
  return achievements.filter(
    (a) =>
      a.game === event.game &&
      a.metric === event.metric &&
      event.value >= a.target,
  )
}
export function supportsAchievements(game: string) {
  return game !== 'community' && achievements.some((a) => a.game === game)
}
