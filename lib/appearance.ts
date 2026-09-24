export type Scene = {
  id: string
  title: string
  subtitle: string
  kind: 'default' | 'photo' | 'video' | 'reactive'
  colors: string
  src?: string
  poster?: string
  credit?: string
}
export const scenes: Scene[] = [
  {
    id: 'original',
    title: 'The original',
    subtitle: 'The classic lounge',
    kind: 'default',
    colors: 'linear-gradient(140deg,#222338,#101016 65%)',
  },
  {
    id: 'aurora',
    title: 'Aurora silk',
    subtitle: 'Fluid light · mouse + keys',
    kind: 'reactive',
    colors: 'linear-gradient(140deg,#112c4e,#406878,#8276ca)',
  },
  {
    id: 'constellation',
    title: 'Deep space',
    subtitle: 'Magnetic stars · mouse + keys',
    kind: 'reactive',
    colors: 'radial-gradient(ellipse at 65% 30%,#52548c,#0a1029 70%)',
  },
  {
    id: 'ripple',
    title: 'Liquid signal',
    subtitle: 'Electric ripples · mouse + keys',
    kind: 'reactive',
    colors:
      'repeating-radial-gradient(ellipse at 70% 60%,#1c4060 0,#11182a 18%,#455478 20%,#11182a 23%)',
  },
  {
    id: 'coast',
    title: 'At the edge',
    subtitle: '4K photo · mountain coast',
    kind: 'photo',
    colors: '#314b52',
    src: 'https://images.unsplash.com/photo-1751554908151-27ff8eac347d?auto=format&fit=crop&w=3840&h=2160&q=85',
    poster: '/backgrounds/photo-0.jpg',
    credit: 'https://unsplash.com/photos/eR54mSiITFU',
  },
  {
    id: 'forest',
    title: 'Golden silence',
    subtitle: '4K photo · alpine forest',
    kind: 'photo',
    colors: '#23423a',
    src: 'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=3840&h=2160&q=85',
    poster: '/backgrounds/photo-2.jpg',
    credit: 'https://unsplash.com/s/photos/forest-mountain',
  },
  {
    id: 'aurora-film',
    title: 'Northern current',
    subtitle: '4K video · abstract spiral',
    kind: 'video',
    colors: '#25435d',
    src: '/backgrounds/aurora-flow.mp4',
    poster: '/backgrounds/aurora-flow.jpg',
  },
  {
    id: 'dusk-film',
    title: 'Chromatic dusk',
    subtitle: '4K video · color drift',
    kind: 'video',
    colors: '#643863',
    src: '/backgrounds/chromatic-dusk.mp4',
    poster: '/backgrounds/chromatic-dusk.jpg',
  },
]
export type Appearance = {
  scene: string
  cursor: 'native' | 'halo' | 'crosshair' | 'comet'
  intensity: number
  dim: number
  mouse: boolean
  keyboard: boolean
  paused: boolean
}
export const defaults: Appearance = {
  scene: 'original',
  cursor: 'native',
  intensity: 65,
  dim: 48,
  mouse: true,
  keyboard: true,
  paused: false,
}
export function parseAppearance(value: unknown): Appearance {
  if (!value || typeof value !== 'object') return { ...defaults }
  const data = value as Record<string, unknown>
  const number = (key: 'intensity' | 'dim') =>
    typeof data[key] === 'number' && Number.isFinite(data[key])
      ? Math.max(0, Math.min(key === 'dim' ? 85 : 100, data[key] as number))
      : defaults[key]
  return {
    scene: scenes.some((s) => s.id === data.scene)
      ? (data.scene as string)
      : defaults.scene,
    cursor: ['native', 'halo', 'crosshair', 'comet'].includes(
      data.cursor as string,
    )
      ? (data.cursor as Appearance['cursor'])
      : 'native',
    intensity: number('intensity'),
    dim: number('dim'),
    mouse: typeof data.mouse === 'boolean' ? data.mouse : true,
    keyboard: typeof data.keyboard === 'boolean' ? data.keyboard : true,
    paused: data.paused === true,
  }
}
