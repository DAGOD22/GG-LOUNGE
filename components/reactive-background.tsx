'use client'
import { useEffect, useRef } from 'react'
import type { Appearance } from '@/lib/appearance'

/** One bounded canvas, no DOM particles, no recorded or transmitted keystrokes. */
export function ReactiveBackground({
  settings,
  stopped,
}: {
  settings: Appearance
  stopped: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    const ctx = canvas?.getContext('2d', { alpha: false })
    if (!canvas || !ctx) return
    let w = 0,
      h = 0,
      raf = 0,
      time = 0,
      last = 0,
      pointer = { x: 0.55, y: 0.4 },
      smooth = { ...pointer },
      energy = 0,
      hue = 185
    const stars = Array.from({ length: 85 }, (_, i) => ({
      x: Math.sin(i * 127.1) * 0.5 + 0.5,
      y: Math.cos(i * 311.7) * 0.5 + 0.5,
      size: 0.7 + (i % 4) * 0.35,
    }))
    const rings: { x: number; y: number; age: number; hue: number }[] = []
    const strength = settings.intensity / 100
    function resize() {
      w = innerWidth
      h = innerHeight
      // Cap DPR to keep large-screen effects inexpensive; photo/video assets are 4K.
      const dpr = Math.min(devicePixelRatio || 1, 1.5)
      canvas!.width = Math.round(w * dpr)
      canvas!.height = Math.round(h * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (stopped) draw(0)
    }
    function burst(x: number, y: number) {
      rings.push({ x, y, age: 0, hue })
      if (rings.length > 16) rings.shift()
      energy = Math.min(1, energy + 0.32)
      hue = (hue + 19) % 360
    }
    function move(e: PointerEvent) {
      if (settings.mouse) pointer = { x: e.clientX / w, y: e.clientY / h }
    }
    function click(e: PointerEvent) {
      if (settings.mouse) burst(e.clientX, e.clientY)
    }
    function key(e: KeyboardEvent) {
      // Never react to form entry, passwords, editing, or shortcuts.
      if (
        !settings.keyboard ||
        e.repeat ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target instanceof Element &&
          e.target.closest(
            'input,textarea,select,[contenteditable]:not([contenteditable="false"])',
          ))
      )
        return
      burst(w * (0.2 + Math.random() * 0.6), h * (0.2 + Math.random() * 0.6))
    }
    function glow(
      x: number,
      y: number,
      radius: number,
      color: string,
      alpha: number,
    ) {
      const g = ctx!.createRadialGradient(x, y, 0, x, y, Math.max(1, radius))
      g.addColorStop(0, `hsla(${color},${alpha})`)
      g.addColorStop(1, `hsla(${color},0)`)
      ctx!.fillStyle = g
      ctx!.fillRect(0, 0, w, h)
    }
    function draw(dt: number) {
      const c = ctx!
      smooth.x += (pointer.x - smooth.x) * 0.06
      smooth.y += (pointer.y - smooth.y) * 0.06
      energy *= Math.exp(-dt * 1.8)
      c.fillStyle = '#080d1c'
      c.fillRect(0, 0, w, h)
      const px = (smooth.x - 0.5) * 150 * strength,
        py = (smooth.y - 0.5) * 100 * strength
      glow(w * 0.65 + px, h * 0.35 + py, w * 0.65, '242,50%,40%', 0.32)
      if (settings.scene === 'aurora') {
        c.globalCompositeOperation = 'screen'
        for (let j = 0; j < 4; j++) {
          const gradient = c.createLinearGradient(0, h * 0.1, w, h * 0.9)
          gradient.addColorStop(
            0,
            `hsla(${165 + j * 18 + energy * 25},80%,58%,0)`,
          )
          gradient.addColorStop(
            0.45,
            `hsla(${170 + j * 24 + energy * 25},65%,58%,${(0.08 + strength * 0.15) / (j * 0.3 + 1)})`,
          )
          gradient.addColorStop(1, 'rgba(104,89,215,0)')
          c.fillStyle = gradient
          c.beginPath()
          for (let x = -20; x <= w + 20; x += 14) {
            const y =
              h * (0.27 + j * 0.105) +
              Math.sin((x / w) * 5 + time * 0.2 + j * 0.5) * h * 0.15 +
              Math.sin((x / w) * 9 - time * 0.13) * 30 +
              py
            if (x === -20) c.moveTo(x, y)
            else c.lineTo(x, y)
          }
          c.lineTo(w + 20, h + 20)
          c.lineTo(-20, h + 20)
          c.closePath()
          c.fill()
        }
        glow(
          w * 0.5 + px,
          h * 0.4 + py,
          w * 0.5,
          `${hue},60%,50%`,
          energy * 0.25,
        )
        c.globalCompositeOperation = 'source-over'
      } else if (settings.scene === 'constellation') {
        const points = stars.map((s, i) => ({
          x: s.x * w + Math.sin(time * 0.07 + i) * 16 + px * s.size * 0.25,
          y: s.y * h + Math.cos(time * 0.08 + i) * 12 + py * s.size * 0.25,
          size: s.size,
        }))
        for (let i = 0; i < points.length; i++) {
          const a = points[i],
            near = Math.hypot(a.x - smooth.x * w, a.y - smooth.y * h) < 190
          c.fillStyle = `rgba(205,222,255,${0.3 + strength * 0.4 + (near ? 0.25 : 0)})`
          c.beginPath()
          c.arc(a.x, a.y, a.size + energy, 0, Math.PI * 2)
          c.fill()
          for (let j = i + 1; j < points.length; j++) {
            const b = points[j],
              distance = Math.hypot(a.x - b.x, a.y - b.y)
            if (distance < 125) {
              c.strokeStyle = `rgba(133,169,241,${(1 - distance / 125) * (near ? 0.5 : 0.14) * strength})`
              c.beginPath()
              c.moveTo(a.x, a.y)
              c.lineTo(b.x, b.y)
              c.stroke()
            }
          }
        }
      } else {
        const x = w * smooth.x,
          y = h * smooth.y
        glow(x, y, w * 0.5, '185,65%,40%', 0.18 + energy * 0.15)
        for (let i = 0; i < 12; i++) {
          c.strokeStyle = `hsla(${195 + i * 4},70%,70%,${(0.04 + strength * 0.08) * (1 - i / 14)})`
          c.lineWidth = 1.2
          c.beginPath()
          c.ellipse(
            x,
            y,
            40 + i * 70 + Math.sin(time * 0.45) * 12,
            20 + i * 35,
            -0.28,
            0,
            Math.PI * 2,
          )
          c.stroke()
        }
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i]
        ring.age += dt
        if (ring.age >= 2) {
          rings.splice(i, 1)
          continue
        }
        c.strokeStyle = `hsla(${ring.hue},80%,78%,${(1 - ring.age / 2) * 0.45 * strength})`
        c.lineWidth = 1.5
        c.beginPath()
        c.arc(ring.x, ring.y, 10 + ring.age * 180, 0, Math.PI * 2)
        c.stroke()
      }
    }
    function tick(now: number) {
      const dt = Math.min((now - (last || now)) / 1000, 0.05)
      last = now
      time += dt
      draw(dt)
      raf = requestAnimationFrame(tick)
    }
    function visibility() {
      cancelAnimationFrame(raf)
      last = 0
      if (!document.hidden && !stopped) raf = requestAnimationFrame(tick)
    }
    resize()
    if (!stopped && !document.hidden) raf = requestAnimationFrame(tick)
    window.addEventListener('resize', resize)
    if (!stopped) {
      window.addEventListener('pointermove', move, { passive: true })
      window.addEventListener('pointerdown', click, { passive: true })
      window.addEventListener('keydown', key)
    }
    document.addEventListener('visibilitychange', visibility)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerdown', click)
      window.removeEventListener('keydown', key)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [
    settings.scene,
    settings.intensity,
    settings.mouse,
    settings.keyboard,
    stopped,
  ])
  return <canvas ref={ref} className="reactive-canvas" aria-hidden="true" />
}

export function CursorEffect({
  kind,
  stopped,
}: {
  kind: Appearance['cursor']
  stopped: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (kind === 'native' || stopped || !matchMedia('(pointer:fine)').matches)
      return
    let raf = 0,
      x = -100,
      y = -100,
      sx = x,
      sy = y,
      visible = false
    const node = ref.current!
    function move(e: PointerEvent) {
      x = e.clientX
      y = e.clientY
      visible = true
      node.dataset.active = String(
        e.target instanceof Element &&
          !!e.target.closest('a,button,input,select,textarea,[role="button"]'),
      )
      if (!raf) raf = requestAnimationFrame(tick)
    }
    function tick() {
      sx += (x - sx) * 0.22
      sy += (y - sy) * 0.22
      node.style.transform = `translate3d(${kind === 'crosshair' ? x : sx}px,${kind === 'crosshair' ? y : sy}px,0)`
      node.style.opacity = visible ? '1' : '0'
      raf =
        visible && Math.abs(x - sx) + Math.abs(y - sy) > 0.1
          ? requestAnimationFrame(tick)
          : 0
    }
    function leave() {
      visible = false
      node.style.opacity = '0'
    }
    window.addEventListener('pointermove', move, { passive: true })
    document.addEventListener('pointerleave', leave)
    window.addEventListener('blur', leave)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('pointermove', move)
      document.removeEventListener('pointerleave', leave)
      window.removeEventListener('blur', leave)
      node.style.opacity = '0'
    }
  }, [kind, stopped])
  return (
    <div
      ref={ref}
      className={`cursor-effect cursor-${kind}`}
      aria-hidden="true"
    >
      <i />
      <b />
    </div>
  )
}
