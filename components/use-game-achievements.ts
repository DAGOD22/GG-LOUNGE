'use client'
import { useEffect, useRef, useState } from 'react'
import { authClient } from '@/lib/auth-client'
import {
  achievements,
  earnedBy,
  isGameplayEvent,
  type GameplayEvent,
} from '@/lib/achievements'

type Saved = { slugs: string[]; pending: GameplayEvent[] }
const empty = (): Saved => ({ slugs: [], pending: [] })
function read(key: string): Saved {
  try {
    const data = JSON.parse(localStorage.getItem(key) || '{}')
    return {
      slugs: Array.isArray(data.slugs)
        ? data.slugs.filter((s: unknown) =>
            achievements.some((a) => a.slug === s),
          )
        : [],
      pending: Array.isArray(data.pending)
        ? data.pending.filter(isGameplayEvent).slice(0, 100)
        : [],
    }
  } catch {
    return empty()
  }
}
export function useGameAchievements(game: string | undefined) {
  const session = authClient.useSession()
  const userId = session.data?.user.id
  const frame = useRef<HTMLIFrameElement>(null)
  const memory = useRef(new Map<string, Saved>())
  const [slugs, setSlugs] = useState<string[]>([])
  const [notices, setNotices] = useState<string[]>([])
  const [syncStatus, setSyncStatus] = useState('Saved on this browser')
  useEffect(() => {
    const key = `gg:achievements:v2:${userId || 'guest'}`
    let state = memory.current.get(key) || read(key),
      disposed = false,
      syncing = false
    memory.current.set(key, state)
    setSlugs(state.slugs)
    setNotices([])
    const persist = () => {
      setSlugs([...state.slugs])
      try {
        localStorage.setItem(key, JSON.stringify(state))
      } catch {
        setSyncStatus('Storage unavailable — kept for this visit')
      }
    }
    async function sync() {
      if (!userId || syncing || disposed) return
      syncing = true
      try {
        while (state.pending.length && !disposed) {
          const batch = [...state.pending]
          const response = await fetch('/api/achievements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ events: batch }),
          })
          if (!response.ok) throw new Error('Sync failed')
          if (disposed) return
          state.pending = state.pending.filter((e) => !batch.includes(e))
          persist()
        }
        if (disposed) return
        setSyncStatus(
          state.pending.length ? 'Waiting to sync' : 'Saved to your account',
        )
      } catch {
        if (!disposed) setSyncStatus('Saved locally · reconnect to sync')
      } finally {
        syncing = false
      }
    }
    if (userId) {
      setSyncStatus('Connecting to your account…')
      fetch('/api/achievements')
        .then((r) => {
          if (!r.ok) throw new Error()
          return r.json()
        })
        .then((data) => {
          if (disposed) return
          state.slugs = [...new Set([...state.slugs, ...data.slugs])]
          persist()
          void sync()
        })
        .catch(() => {
          if (!disposed) setSyncStatus('Saved locally · account unavailable')
        })
    } else setSyncStatus('Guest progress · saved on this browser')
    function connect() {
      frame.current?.contentWindow?.postMessage(
        {
          type: 'gg:connect',
          game,
          targets: achievements.filter((a) => a.game === game),
        },
        location.origin,
      )
    }
    function receive(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.game !== game
      )
        return
      if (event.data.type === 'gg:ready') {
        connect()
        return
      }
      if (event.data.type !== 'gg:gameplay' || !isGameplayEvent(event.data))
        return
      const outcome: GameplayEvent = {
        game: event.data.game,
        metric: event.data.metric,
        value: event.data.value,
      }
      const fresh = earnedBy(outcome).filter(
        (a) => !state.slugs.includes(a.slug),
      )
      if (!fresh.length) return
      state.slugs.push(...fresh.map((a) => a.slug))
      if (userId) state.pending.push(outcome)
      persist()
      setNotices((queue) => [...queue, ...fresh.map((a) => a.slug)])
      void sync()
    }
    function storage(event: StorageEvent) {
      if (event.key !== key) return
      const other = read(key)
      state.slugs = [...new Set([...state.slugs, ...other.slugs])]
      setSlugs([...state.slugs])
    }
    const iframe = frame.current
    iframe?.addEventListener('load', connect)
    window.addEventListener('message', receive)
    window.addEventListener('storage', storage)
    window.addEventListener('online', sync)
    window.addEventListener('focus', sync)
    connect()
    return () => {
      disposed = true
      iframe?.removeEventListener('load', connect)
      window.removeEventListener('message', receive)
      window.removeEventListener('storage', storage)
      window.removeEventListener('online', sync)
      window.removeEventListener('focus', sync)
    }
  }, [game, userId])
  const current = notices[0]
  useEffect(() => {
    if (!current) return
    const timer = window.setTimeout(
      () => setNotices((queue) => queue.slice(1)),
      4800,
    )
    return () => window.clearTimeout(timer)
  }, [current])
  return {
    frame,
    slugs,
    syncStatus,
    notice: achievements.find((a) => a.slug === current),
    dismiss: () => setNotices((queue) => queue.slice(1)),
  }
}
