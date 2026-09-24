import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import {
  achievements,
  earnedBy,
  isGameplayEvent,
  supportsAchievements,
} from '../lib/achievements.ts'
import { defaults, parseAppearance, scenes } from '../lib/appearance.ts'
const source = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')

test('30 unique event achievements; no timer/launch awards', () => {
  assert.equal(achievements.length, 30)
  assert.equal(new Set(achievements.map((a) => a.slug)).size, 30)
  assert.ok(achievements.every((a) => a.target > 0 && a.xp > 0))
  assert.ok(
    !achievements.some((a) => /^(5m|10m|30m|45m|1h|2h|5h|tool)$/.test(a.slug)),
  )
  assert.ok(
    !source('app/member/page.tsx').includes('const started = Date.now()'),
  )
  assert.ok(
    !source('app/api/member/route.ts').includes(
      "body.action === 'achievement'",
    ),
  )
})
test('only supported, finite, bounded game metrics are accepted', () => {
  for (const event of [
    null,
    {},
    { game: 'stack', metric: 'height', value: '50' },
    { game: 'stack', metric: 'height', value: NaN },
    { game: 'stack', metric: 'height', value: Infinity },
    { game: 'stack', metric: 'height', value: -1 },
    { game: 'stack', metric: 'height', value: 1e99 },
    { game: 'community', metric: 'chat', value: 1 },
    { game: 'drive-mad', metric: 'height', value: 50 },
    { game: 'stack', metric: 'elapsed', value: 99999 },
  ])
    assert.equal(isGameplayEvent(event), false)
  assert.equal(
    isGameplayEvent({ game: 'stack', metric: 'height', value: 10 }),
    true,
  )
  assert.equal(supportsAchievements('drive-mad'), false)
  assert.equal(supportsAchievements('stack'), true)
})
test('thresholds unlock exactly on the outcome, including multiple crossed milestones', () => {
  assert.deepEqual(earnedBy({ game: 'stack', metric: 'height', value: 0 }), [])
  assert.deepEqual(
    earnedBy({ game: 'stack', metric: 'height', value: 9 }).map((a) => a.slug),
    ['stack-first'],
  )
  assert.deepEqual(
    earnedBy({ game: 'stack', metric: 'height', value: 10 }).map((a) => a.slug),
    ['stack-first', 'stack-10'],
  )
  assert.deepEqual(
    earnedBy({ game: 'stack', metric: 'perfectStreak', value: 3 }).map(
      (a) => a.slug,
    ),
    ['stack-perfect', 'stack-perfect-3'],
  )
  assert.equal(
    earnedBy({ game: 'cookie-clicker', metric: 'baked', value: 1e9 }).length,
    4,
  )
})
function bridge() {
  const messages = [],
    listeners = {}
  const parent = {
    postMessage: (data, origin) => messages.push({ data, origin }),
  }
  const window = {}
  const context = vm.createContext({
    window,
    parent,
    location: {
      pathname: '/games/stack/index.html',
      origin: 'https://lounge.test',
    },
    addEventListener: (type, fn) => (listeners[type] = fn),
  })
  vm.runInContext(source('public/games/gg-events.js'), context)
  const connect = (origin = 'https://lounge.test', sender = parent) =>
    listeners.message({
      origin,
      source: sender,
      data: {
        type: 'gg:connect',
        game: 'stack',
        targets: achievements.filter((a) => a.game === 'stack'),
      },
    })
  return { window, messages, connect }
}
test('bridge emits nothing for a launch, queues real early outcomes, validates parent and origin', () => {
  const b = bridge()
  assert.deepEqual(
    b.messages.map((m) => m.data.type),
    ['gg:ready'],
  )
  b.window.GGLounge.emit('height', 1)
  b.connect('https://untrusted.test')
  b.connect('https://lounge.test', {})
  assert.equal(b.messages.length, 1)
  b.connect()
  assert.equal(b.messages.length, 2)
  assert.equal(b.messages[1].data.value, 1)
  assert.equal(b.messages[1].origin, 'https://lounge.test')
})
test('bridge deduplicates outcomes and never sums scores or streaks across runs', () => {
  const b = bridge()
  b.connect()
  for (let i = 0; i < 100; i++) b.window.GGLounge.emit('height', 1)
  assert.equal(b.messages.length, 2)
  b.window.GGLounge.emit('height', 9)
  b.window.GGLounge.emit('height', 0)
  b.window.GGLounge.emit('height', 9)
  assert.equal(b.messages.length, 2)
  b.window.GGLounge.emit('height', 10)
  assert.equal(b.messages.length, 3)
  b.window.GGLounge.emit('perfectStreak', 2)
  b.window.GGLounge.emit('perfectStreak', 0)
  b.window.GGLounge.emit('perfectStreak', 2)
  assert.equal(b.messages.length, 4)
  b.window.GGLounge.emit('perfectStreak', 3)
  assert.equal(b.messages.length, 5)
  b.window.GGLounge.emit('height', NaN)
  b.window.GGLounge.emit('height', -1)
  assert.equal(b.messages.length, 5)
})
test('Stack hook counts only placed blocks and resets the perfect streak after an imperfect drop', () => {
  const html = source('public/games/stack/index.html')
  const classSource = html.slice(
    html.indexOf('class Game {'),
    html.indexOf('let game = new Game();'),
  )
  const outcomes = []
  const context = vm.createContext({
    window: {
      GGLounge: { emit: (metric, value) => outcomes.push({ metric, value }) },
    },
  })
  vm.runInContext(
    `${classSource};globalThis.place=Game.prototype.placeBlock`,
    context,
  )
  const state = {
    blocks: [{}, { mesh: {}, place: () => ({ placed: {}, bonus: true }) }],
    newBlocks: { remove() {} },
    placedBlocks: { add() {} },
    addBlock() {},
  }
  context.place.call(state)
  assert.deepEqual(outcomes, [
    { metric: 'height', value: 1 },
    { metric: 'perfectStreak', value: 1 },
  ])
  state.blocks[1].place = () => ({ placed: {}, bonus: false })
  context.place.call(state)
  assert.equal(state.perfectStreak, 0)
  const length = outcomes.length
  state.blocks[1].place = () => ({})
  context.place.call(state)
  assert.equal(outcomes.length, length)
})
test('mining only reports a successful resource gather and actual level-up', () => {
  const outcomes = []
  const context = vm.createContext({
    window: {
      GGLounge: { emit: (metric, value) => outcomes.push({ metric, value }) },
    },
    globals: {
      clickMulti: 1,
      pickaxeLevel: 1,
      resources: {
        stone: { amount: 0, xp: 1, strength: 1 },
        diamond: { amount: 0, xp: 20, strength: 10 },
      },
    },
    round: Math.round,
    gainXP() {},
  })
  vm.runInContext(source('public/games/idle-mining/game/mining.js'), context)
  context.gatherResource('diamond')
  assert.equal(outcomes.length, 0)
  context.gatherResource('stone')
  assert.deepEqual(outcomes, [{ metric: 'gathers', value: 1 }])
  assert.equal(context.globals.resources.stone.amount, 1)
})
test('appearance handles corrupt storage, unknown scenes, and out-of-range controls', () => {
  assert.deepEqual(parseAppearance(null), defaults)
  const settings = parseAppearance({
    scene: 'bogus',
    cursor: 'bogus',
    dim: Infinity,
    intensity: 999,
    mouse: 'yes',
    keyboard: false,
    paused: true,
  })
  assert.equal(settings.scene, 'original')
  assert.equal(settings.cursor, 'native')
  assert.equal(settings.dim, 48)
  assert.equal(settings.intensity, 100)
  assert.equal(settings.mouse, true)
  assert.equal(settings.keyboard, false)
  assert.equal(settings.paused, true)
  assert.equal(scenes.filter((s) => s.kind === 'video').length, 2)
  assert.ok(
    scenes
      .filter((s) => s.kind === 'photo')
      .every((s) => s.src.includes('w=3840&h=2160')),
  )
})
