'use client'
import { useEffect, useRef, useState } from 'react'
import {
  Check,
  Image as ImageIcon,
  Keyboard,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Video,
} from 'lucide-react'
import {
  defaults,
  parseAppearance,
  scenes,
  type Appearance,
} from '@/lib/appearance'
import { ReactiveBackground, CursorEffect } from './reactive-background'
import { LoungeDialog } from './lounge-dialog'

export function AppearanceStudio() {
  const [settings, setSettings] = useState<Appearance>(defaults)
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('all')
  const [reduced, setReduced] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [mediaError, setMediaError] = useState('')
  const [storageError, setStorageError] = useState(false)
  const video = useRef<HTMLVideoElement>(null)
  const scene = scenes.find((s) => s.id === settings.scene) || scenes[0]
  const stopped = settings.paused || reduced || playing
  const update = (patch: Partial<Appearance>) =>
    setSettings((s) => ({ ...s, ...patch }))
  useEffect(() => {
    try {
      setSettings(
        parseAppearance(
          JSON.parse(localStorage.getItem('gg:appearance:v1') || '{}'),
        ),
      )
    } catch {
      /* safe defaults */
    }
    setReady(true)
    const preference = matchMedia('(prefers-reduced-motion: reduce)')
    const motion = () => setReduced(preference.matches)
    const game = (event: Event) =>
      setPlaying((event as CustomEvent<boolean>).detail)
    motion()
    preference.addEventListener('change', motion)
    window.addEventListener('gg:playing', game)
    return () => {
      preference.removeEventListener('change', motion)
      window.removeEventListener('gg:playing', game)
    }
  }, [])
  useEffect(() => {
    if (!ready) return
    document.documentElement.dataset.scene = settings.scene
    try {
      localStorage.setItem('gg:appearance:v1', JSON.stringify(settings))
      setStorageError(false)
    } catch {
      setStorageError(true)
    }
  }, [settings, ready])
  useEffect(() => {
    setMediaError('')
  }, [settings.scene])
  useEffect(() => {
    const element = video.current
    if (!element) return
    let disposed = false
    const visibility = () => {
      if (stopped || document.hidden) element.pause()
      else
        element.play().catch(() => {
          if (!disposed)
            setMediaError(
              'Autoplay is unavailable. Showing the still preview instead.',
            )
        })
    }
    visibility()
    document.addEventListener('visibilitychange', visibility)
    return () => {
      disposed = true
      element.pause()
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [scene.id, stopped])
  return (
    <>
      <div
        className="lounge-background"
        aria-hidden="true"
        style={{ background: scene.colors }}
      >
        {scene.kind === 'photo' && (
          <img
            key={scene.id}
            className="scene-media"
            src={mediaError ? scene.poster : scene.src}
            alt=""
            onError={(e) => {
              if (mediaError) e.currentTarget.style.visibility = 'hidden'
              setMediaError(
                'The 4K photo could not load. Showing its lightweight preview; try another scene or reconnect.',
              )
            }}
          />
        )}
        {scene.kind === 'video' && (
          <video
            ref={video}
            key={scene.id}
            className="scene-media"
            src={scene.src}
            poster={scene.poster}
            muted
            loop
            playsInline
            preload="metadata"
            onError={() =>
              setMediaError(
                'Video playback is unavailable. Showing the still preview instead.',
              )
            }
          />
        )}
        {scene.kind === 'reactive' && (
          <ReactiveBackground settings={settings} stopped={stopped} />
        )}
        {scene.kind !== 'default' && (
          <div
            className="scene-scrim"
            style={{ background: `rgba(5,8,16,${settings.dim / 100})` }}
          />
        )}
      </div>
      <CursorEffect kind={settings.cursor} stopped={stopped} />
      <button className="appearance-launch" onClick={() => setOpen(true)}>
        <SlidersHorizontal size={16} />
        <span>Make it yours</span>
        <i />
      </button>
      <LoungeDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Set the atmosphere."
        eyebrow="GG-LOUNGE / APPEARANCE STUDIO"
      >
        <div className="studio-intro">
          <p>
            Your lounge. Your wavelength.
            <br />
            <span>Changes preview instantly and stay on this browser.</span>
          </p>
          <Sparkles size={27} />
        </div>
        <div className="scene-preview" style={{ background: scene.colors }}>
          {scene.poster && <img src={scene.poster} alt="" />}
          <div>
            <span>NOW SETTING THE MOOD</span>
            <h3>{scene.title}</h3>
            <p>{scene.subtitle}</p>
          </div>
          <span className="preview-tag">
            {scene.kind === 'reactive'
              ? 'LIVE / REACTIVE'
              : ['photo', 'video'].includes(scene.kind)
                ? '3840 × 2160'
                : 'ORIGINAL'}
          </span>
        </div>
        <div className="studio-section-heading">
          <h3>Choose your scene</h3>
          <span>{scenes.length} curated atmospheres</span>
        </div>
        <div className="studio-tabs" aria-label="Background types">
          {[
            ['all', 'All scenes'],
            ['reactive', 'Reactive'],
            ['photo', '4K photos'],
            ['video', '4K videos'],
          ].map(([id, name]) => (
            <button
              key={id}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="scene-grid">
          {scenes
            .filter((s) => tab === 'all' || tab === s.kind)
            .map((s) => (
              <button
                key={s.id}
                className="scene-option"
                aria-pressed={settings.scene === s.id}
                onClick={() => update({ scene: s.id })}
              >
                <span
                  className={`scene-thumb thumb-${s.id}`}
                  style={{ background: s.colors }}
                >
                  {s.poster && <img loading="lazy" src={s.poster} alt="" />}
                  <span className="scene-kind">
                    {s.kind === 'video' ? (
                      <Video size={13} />
                    ) : s.kind === 'photo' ? (
                      <ImageIcon size={13} />
                    ) : (
                      <Sparkles size={13} />
                    )}
                    {s.kind === 'video' || s.kind === 'photo'
                      ? '4K'
                      : s.kind === 'reactive'
                        ? 'LIVE'
                        : 'GG'}
                  </span>
                  {settings.scene === s.id && (
                    <span className="scene-check">
                      <Check size={14} />
                    </span>
                  )}
                </span>
                <strong>{s.title}</strong>
                <small>{s.subtitle}</small>
              </button>
            ))}
        </div>
        {scene.credit && (
          <p className="media-credit">
            Photography via{' '}
            <a href={scene.credit} target="_blank" rel="noreferrer">
              Unsplash ↗
            </a>
            . 4K loads on selection; requires a connection.
          </p>
        )}
        {scene.kind === 'video' && (
          <p className="media-credit">
            Original abstract motion · native 3840 × 2160 · 24 fps · muted. Only
            the selected film loads.
          </p>
        )}
        <div className="studio-section-heading">
          <h3>A little more you</h3>
          <MousePointer2 size={17} />
        </div>
        <div className="cursor-options">
          {(['native', 'halo', 'crosshair', 'comet'] as const).map((cursor) => (
            <button
              key={cursor}
              aria-pressed={settings.cursor === cursor}
              onClick={() => update({ cursor })}
            >
              <span className={`cursor-sample sample-${cursor}`}>
                {cursor === 'native'
                  ? '↖'
                  : cursor === 'crosshair'
                    ? '+'
                    : '◌'}
              </span>
              <span>{cursor === 'native' ? 'System' : cursor}</span>
            </button>
          ))}
        </div>
        <p className="media-credit">
          Cursor accents stay in the lounge; your game cursor is untouched.
        </p>
        <div className="studio-controls">
          <label className="range-control">
            <span>
              Scene dimming <b>{settings.dim}%</b>
            </span>
            <input
              type="range"
              min="0"
              max="85"
              value={settings.dim}
              onChange={(e) => update({ dim: +e.target.value })}
            />
          </label>
          <label className="range-control">
            <span>
              Reaction intensity <b>{settings.intensity}%</b>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={settings.intensity}
              onChange={(e) => update({ intensity: +e.target.value })}
            />
          </label>
          <label className="studio-toggle">
            <MousePointer2 size={17} />
            <span>
              Follow your cursor
              <small>Magnetic movement and click ripples</small>
            </span>
            <input
              type="checkbox"
              checked={settings.mouse}
              onChange={(e) => update({ mouse: e.target.checked })}
            />
          </label>
          <label className="studio-toggle">
            <Keyboard size={17} />
            <span>
              Feel every key
              <small>Soft pulses, never flashes. Ignores text fields.</small>
            </span>
            <input
              type="checkbox"
              checked={settings.keyboard}
              onChange={(e) => update({ keyboard: e.target.checked })}
            />
          </label>
        </div>
        <p className="studio-hint">
          Try a reactive scene, move your mouse, then press a key outside a text
          field. Input is never stored. Effects pause during gameplay and in
          hidden tabs.
        </p>
        {reduced && (
          <p className="studio-status" role="status">
            Reduced motion is on in your system. Animated scenes stay still and
            cursor effects are disabled.
          </p>
        )}
        {mediaError && (
          <p className="studio-status" role="status">
            {mediaError}
          </p>
        )}
        {storageError && (
          <p className="studio-status" role="status">
            Browser storage is unavailable. Settings last for this visit only.
          </p>
        )}
        <div className="studio-footer">
          <button onClick={() => setSettings({ ...defaults })}>
            <RotateCcw size={14} /> Reset
          </button>
          <button onClick={() => update({ paused: !settings.paused })}>
            {settings.paused ? <Play size={14} /> : <Pause size={14} />}
            {settings.paused ? 'Resume motion' : 'Pause motion'}
          </button>
          <button className="studio-done" onClick={() => setOpen(false)}>
            Looks good <Check size={15} />
          </button>
        </div>
      </LoungeDialog>
    </>
  )
}
