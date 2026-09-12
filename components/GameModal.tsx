'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { Heart, Maximize2, X, Copy, ExternalLink, Gamepad2, Keyboard, Monitor, Bug, Flag, AlertCircle, Loader2, Save } from 'lucide-react'
import type { Game } from '@/lib/games'
import { CONTROLS_LEGEND } from '@/lib/games'

export function GameModal({
  game,
  isFavorite,
  onToggleFavorite,
  onClose,
  authUser,
}: {
  game: Game
  isFavorite: boolean
  onToggleFavorite: (id: string) => void
  onClose: () => void
  authUser: { id: string; username: string } | null
}) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [frameLoading, setFrameLoading] = useState(true)
  const [frameError, setFrameError] = useState<string | null>(null)
  const [showControls, setShowControls] = useState(false)
  const [showLegend, setShowLegend] = useState(false)
  const [reportSent, setReportSent] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'offline'>('idle')
  const pendingSaveRef = useRef<string | null>(null)
  const saveAppliedRef = useRef(false)
  const lastSaveDataRef = useRef<string | null>(null)
  const saveAbortRef = useRef<AbortController | null>(null)

  // Fix 3: improved collect/save with diff and no reload loop
  const collectSaveFromFrame = useCallback((): string | null => {
    const iframe = frameRef.current
    if (!iframe?.contentWindow) return null
    try {
      const win = iframe.contentWindow as any
      const ls: Record<string, string> = {}
      // try to get from iframe window
      try {
        const len = win.localStorage.length
        for (let i = 0; i < len; i++) {
          const k = win.localStorage.key(i)
          if (k) {
            const v = win.localStorage.getItem(k)
            if (v !== null) ls[k] = v
          }
        }
      } catch {}
      // fallback to document view if empty (same-origin should be same)
      if (Object.keys(ls).length === 0) {
        const docLs = iframe.contentDocument?.defaultView?.localStorage
        if (docLs) {
          for (let i = 0; i < docLs.length; i++) {
            const k = docLs.key(i)
            if (k) ls[k] = docLs.getItem(k) || ''
          }
        }
      }
      if (Object.keys(ls).length === 0) return null
      return JSON.stringify({ localStorage: ls, _ts: Date.now() })
    } catch {
      return null
    }
  }, [])

  const applySaveToFrame = useCallback((dataStr: string) => {
    const iframe = frameRef.current
    if (!iframe?.contentWindow || !iframe.contentDocument) return false
    try {
      const win = iframe.contentWindow as any
      const parsed = JSON.parse(dataStr)
      const ls = parsed.localStorage || parsed
      if (!ls || typeof ls !== 'object') return false
      for (const [k, v] of Object.entries(ls)) {
        try {
          win.localStorage.setItem(k, String(v))
        } catch {}
        try {
          iframe.contentDocument?.defaultView?.localStorage.setItem(k, String(v))
        } catch {}
      }
      // notify game that storage changed without reload
      try {
        win.dispatchEvent(new StorageEvent('storage', { key: null } as any))
      } catch {}
      saveAppliedRef.current = true
      setSaveStatus('saved')
      return true
    } catch {
      return false
    }
  }, [])

  const pushSave = useCallback(async () => {
    if (!authUser || !game) return
    const data = collectSaveFromFrame()
    if (!data) return
    // Fix 3: diff check — don't POST if same as last
    if (data === lastSaveDataRef.current) return
    // also skip if data is tiny (no real save)
    try {
      const parsed = JSON.parse(data)
      const count = Object.keys(parsed.localStorage || {}).length
      if (count === 0) return
    } catch {}
    lastSaveDataRef.current = data
    setSaveStatus('saving')
    // abort previous if still pending
    if (saveAbortRef.current) saveAbortRef.current.abort()
    const abort = new AbortController()
    saveAbortRef.current = abort
    try {
      const r = await fetch('/api/save/' + encodeURIComponent(game.id), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data }),
        signal: abort.signal,
      })
      if (r.ok) setSaveStatus('saved')
      else setSaveStatus('offline')
    } catch (e: any) {
      if (e?.name !== 'AbortError') setSaveStatus('offline')
    }
  }, [authUser, game, collectSaveFromFrame])

  // Fetch pending save when game opens — Fix 3: apply before game reads, no reload loop
  useEffect(() => {
    if (!authUser || !game) return
    saveAppliedRef.current = false
    pendingSaveRef.current = null
    lastSaveDataRef.current = null
    setSaveStatus('idle')
    const abort = new AbortController()
    fetch('/api/save/' + encodeURIComponent(game.id), { signal: abort.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: any) => {
        if (d?.save?.data) {
          pendingSaveRef.current = d.save.data
          lastSaveDataRef.current = d.save.data
          // try apply immediately if iframe already loaded
          if (frameRef.current?.contentDocument) {
            applySaveToFrame(d.save.data)
            pendingSaveRef.current = null
          }
        }
      })
      .catch(() => {})
    return () => abort.abort()
  }, [authUser, game, applySaveToFrame])

  // Fix 3+5: autosave only when visible, diff-aware, properly cleaned
  useEffect(() => {
    if (!authUser || !game) return
    // push every 7s, but only if document visible and game focused
    const id = window.setInterval(() => {
      if (document.visibilityState === 'hidden') return
      pushSave()
    }, 7000)
    const onVis = () => {
      if (document.visibilityState === 'hidden') pushSave()
    }
    const onBeforeUnload = () => {
      // use sendBeacon for reliability
      const data = collectSaveFromFrame()
      if (data && data !== lastSaveDataRef.current && authUser) {
        try {
          navigator.sendBeacon('/api/save/' + encodeURIComponent(game.id), JSON.stringify({ data }))
        } catch {
          pushSave()
        }
      }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('beforeunload', onBeforeUnload)
      if (saveAbortRef.current) saveAbortRef.current.abort()
    }
  }, [authUser, game, pushSave, collectSaveFromFrame])

  const handleFrameLoad = useCallback(() => {
    setFrameLoading(false)
    setFrameError(null)
    const iframe = frameRef.current
    if (!iframe) return

    // Fix 3: apply pending save *without* reload — inject before game init if possible
    if (pendingSaveRef.current && !saveAppliedRef.current) {
      const ok = applySaveToFrame(pendingSaveRef.current)
      if (ok) {
        pendingSaveRef.current = null
        // don't reload — many games already read localStorage on load, but we already wrote before they did if we were fast enough
        // if game already initialized, dispatching storage event is enough
      }
    }

    // Fix 5: focus iframe/canvas reliably, no leaks
    try {
      iframe.focus()
    } catch {}
    try {
      const doc = iframe.contentDocument
      const win = iframe.contentWindow as any
      if (!doc) return
      // robust responsive patch — fill screen without cut-off
      if (!doc.querySelector('style[data-ggl-patch]')) {
        const style = doc.createElement('style')
        style.setAttribute('data-ggl-patch', '1')
        style.textContent = `
        html,body{margin:0!important;padding:0!important;width:100%!important;height:100%!important;overflow:hidden!important;background:#0b0d12!important;overscroll-behavior:none!important}
        #gameContainer,#unityContainer,#unity-container,.webgl-content,#content,#gm4html5_div_id{display:flex!important;align-items:center!important;justify-content:center!important;position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-height:100vh!important;max-width:100vw!important;max-height:100vh!important;margin:0!important;transform:none!important;overflow:hidden!important;background:#0b0d12!important}
        .gm4html5_div_class{width:100%!important;height:100%!important;max-width:100vw!important;max-height:100vh!important;display:flex!important;align-items:center!important;justify-content:center!important;margin:0!important;padding:0!important}
        canvas,#canvas,#unity-canvas{width:100%!important;height:100%!important;max-width:100vw!important;max-height:100vh!important;object-fit:contain!important;display:block!important;margin:auto!important}
        #loader,.loader,#unity-loading-bar{position:absolute!important;inset:0!important;display:flex!important;align-items:center!important;justify-content:center!important;flex-direction:column!important;z-index:2!important}
      `
        if (doc.head) doc.head.appendChild(style)
      }
      // helper to trap Slope bonk and focus canvas
      if (!doc.querySelector('script[data-ggl-helper]')) {
        const helper = doc.createElement('script')
        helper.setAttribute('data-ggl-helper', '1')
        helper.textContent = `
        (function(){
          try{
            window.addEventListener('message', function(e){ if(e.data==='bonk') e.stopImmediatePropagation(); }, true);
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
          setTimeout(function(){
            var c=document.querySelector('canvas'); if(c) try{c.focus();}catch(e){}
          }, 400);
        })();
      `
        try {
          if (doc.body) doc.body.appendChild(helper)
          else doc.documentElement.appendChild(helper)
        } catch {}
      }
      const c = doc.querySelector('canvas') as HTMLCanvasElement | null
      if (c) {
        c.setAttribute('tabindex', '0')
        setTimeout(() => {
          try {
            c.focus()
          } catch {}
          try {
            iframe.focus()
          } catch {}
        }, 350)
      }
      // detect broken CDN / missing files — less false positive
      setTimeout(() => {
        try {
          const txt = (doc.body?.innerText || '').slice(0, 2500)
          const hasCanvas = !!doc.querySelector('canvas')
          const hasGame = !!doc.querySelector('iframe,canvas,embed,object,#gameContainer')
          if (!hasCanvas && !hasGame && doc.body && doc.body.children.length === 0) {
            setFrameError('The game looks empty — its files may be blocked on this network. Try opening in a new tab or via Proxy.')
          } else if (!hasCanvas && !hasGame && /404|Failed to download|NOT FOUND|cannot fetch|NetworkError/i.test(txt) && txt.length < 2500 && txt.length > 20) {
            setFrameError('This game didn’t load. Try again or open in a new tab.')
          }
        } catch {}
      }, 5000)
    } catch {}
  }, [applySaveToFrame])

  function reportBroken() {
    if (!game) return
    const key = 'ggl_reported_' + game.id
    try {
      localStorage.setItem(key, '1')
    } catch {}
    setReportSent(true)
    fetch('/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gameId: game.id, title: game.title }),
    }).catch(() => {})
    try {
      const arr = JSON.parse(localStorage.getItem('ggl_reports') || '[]')
      arr.push({ id: game.id, title: game.title, at: Date.now() })
      localStorage.setItem('ggl_reports', JSON.stringify(arr.slice(-50)))
    } catch {}
  }

  function sendKey(code: string, type: 'keydown' | 'keyup') {
    const iframe = frameRef.current
    if (!iframe?.contentWindow || !iframe.contentDocument) return
    const win = iframe.contentWindow
    const doc = iframe.contentDocument
    const target = (doc.querySelector('canvas') as HTMLElement) || doc.body || doc.documentElement
    const keyMap: Record<string, string> = { ArrowUp: 'ArrowUp', ArrowDown: 'ArrowDown', ArrowLeft: 'ArrowLeft', ArrowRight: 'ArrowRight', Space: ' ', Enter: 'Enter' }
    const k = keyMap[code] || (code.startsWith('Key') ? code.slice(3).toLowerCase() : code.startsWith('Digit') ? code.slice(5) : code)
    const opts: KeyboardEventInit = { key: k, code, bubbles: true, cancelable: true }
    try {
      target.dispatchEvent(new KeyboardEvent(type, opts))
    } catch {}
    try {
      win.dispatchEvent(new KeyboardEvent(type, opts))
    } catch {}
    try {
      doc.dispatchEvent(new KeyboardEvent(type, opts))
    } catch {}
  }
  function holdKey(code: string) {
    sendKey(code, 'keydown')
    setTimeout(() => sendKey(code, 'keyup'), 160)
  }

  return (
    <div className="game-modal" role="dialog" aria-modal="true" aria-label={`${game.title} game — ${game.genre} ${game.tone}`} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span className={`game-badge ${game.color}`}>{game.mark}</span>
          <div style={{ minWidth: 0, overflow: 'hidden' }}>
            <span className="modal-kicker">NOW PLAYING — {game.genre.toUpperCase()} / {game.tone.toUpperCase()}</span>
            <strong style={{ display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {game.title} {isFavorite && <Heart size={14} fill="var(--coral)" color="var(--coral)" />}
            </strong>
          </div>
        </div>
        <div className="modal-actions">
          {authUser && (
            <button
              onClick={pushSave}
              title="Save now to cloud"
              aria-label="Save to cloud"
              style={{
                width: 'auto',
                padding: '0 10px',
                fontSize: 11,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid var(--line)',
                background: saveStatus === 'saved' ? 'rgba(34,197,94,.14)' : 'rgba(215,243,74,.14)',
                color: 'var(--foreground)',
                borderRadius: 999,
                cursor: 'pointer',
              }}
            >
              <Save size={14} /> {saveStatus === 'saved' ? 'Saved' : saveStatus === 'saving' ? 'Saving…' : 'Save'}
            </button>
          )}
          <button
            className={`controls-toggle ${showControls ? 'active' : ''}`}
            onClick={() => setShowControls((v) => !v)}
            title="Toggle touch controls"
            aria-label="Toggle touch controls"
            style={{ width: 'auto', padding: '0 12px', fontSize: 11, fontWeight: 900, letterSpacing: '.06em' }}
          >
            <Gamepad2 size={14} /> {showControls ? 'Hide' : 'Controls'}
          </button>
          <button
            onClick={() => setShowLegend((v) => !v)}
            title="Controls legend"
            aria-label="Controls legend"
            style={{
              width: 'auto',
              padding: '0 10px',
              fontSize: 11,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: showLegend ? '1px solid var(--lime)' : '1px solid var(--line)',
              background: showLegend ? 'var(--lime)' : 'rgba(255,255,255,.06)',
              color: showLegend ? '#0b0d12' : 'var(--foreground)',
              borderRadius: 999,
              cursor: 'pointer',
            }}
          >
            <Keyboard size={14} /> {showLegend ? 'Hide' : 'How to play'}
          </button>
          <button
            onClick={reportBroken}
            disabled={reportSent}
            title={reportSent ? 'Reported' : 'Report broken'}
            aria-label="Report broken"
            style={{
              width: 'auto',
              padding: '0 10px',
              fontSize: 11,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              border: '1px solid var(--line)',
              background: reportSent ? 'rgba(255,92,92,.18)' : 'rgba(255,255,255,.06)',
              color: reportSent ? 'var(--coral)' : 'var(--foreground)',
              borderRadius: 999,
              cursor: reportSent ? 'default' : 'pointer',
              opacity: reportSent ? 0.6 : 1,
            }}
          >
            <Bug size={14} /> {reportSent ? 'Reported' : 'Report'}
          </button>
          <button onClick={() => { if (navigator.clipboard) navigator.clipboard.writeText(location.origin + game.path) }} title="Copy link" aria-label="Copy link">
            <Copy size={16} />
          </button>
          <button onClick={() => window.open(game.path, '_blank')} title="Open in new tab" aria-label="Open in new tab">
            <ExternalLink size={16} />
          </button>
          <button onClick={() => onToggleFavorite(game.id)} title={isFavorite ? 'Remove favorite' : 'Add favorite'} aria-label="Favorite">
            <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
          </button>
          <button
            onClick={() => {
              const el = wrapRef.current || frameRef.current
              if (el) (el as HTMLElement).requestFullscreen?.()?.catch(() => frameRef.current?.requestFullscreen?.())
              else frameRef.current?.requestFullscreen?.()
            }}
            aria-label="Fullscreen"
          >
            <Maximize2 size={18} />
          </button>
          <button onClick={onClose} aria-label="Close game">
            <X size={20} />
          </button>
        </div>
      </div>
      <div
        className="frame-wrap"
        ref={wrapRef}
        onClick={() => {
          try {
            frameRef.current?.focus()
            const c = frameRef.current?.contentDocument?.querySelector('canvas') as HTMLElement
            c?.focus()
          } catch {}
        }}
      >
        {showLegend && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              right: 10,
              zIndex: 6,
              padding: '12px 14px',
              borderRadius: 12,
              background: 'rgba(11,13,18,.92)',
              border: '1px solid var(--line)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              flexWrap: 'wrap',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800 }}>
              <Keyboard size={14} /> {CONTROLS_LEGEND[game?.genre || 'default'] || CONTROLS_LEGEND.default}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: 'var(--muted)' }}>
              <Monitor size={12} /> Tap Fullscreen for best view •{' '}
              <button onClick={() => setShowLegend(false)} style={{ background: 'none', border: 0, color: 'var(--foreground)', textDecoration: 'underline', cursor: 'pointer', fontSize: 11 }}>
                Close
              </button>
            </span>
          </div>
        )}
        {reportSent && (
          <div
            style={{
              position: 'absolute',
              top: showLegend ? 66 : 10,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 6,
              padding: '8px 12px',
              borderRadius: 999,
              background: 'rgba(255,92,92,.16)',
              border: '1px solid rgba(255,92,92,.35)',
              fontSize: 12,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Flag size={12} /> Thanks — we’ll fix it soon.
          </div>
        )}
        {frameLoading && (
          <div className="frame-loader">
            <Loader2 size={28} className="spin" />
            <p>Loading {game.title}…</p>
            <span>If it hangs, try opening in a new tab.</span>
          </div>
        )}
        {frameError && (
          <div className="frame-error">
            <AlertCircle size={22} />
            <p>{frameError}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <button className="btn-mini" onClick={() => { setFrameError(null); setFrameLoading(true); if (frameRef.current) frameRef.current.src = frameRef.current.src }}>
                Retry
              </button>
              <button className="btn-mini" onClick={() => window.open(game.path, '_blank')}>
                Open in new tab
              </button>
              <a className="btn-mini" href="/proxy">
                Try in Proxy
              </a>
              <button className="btn-mini" onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        )}
        <iframe
          ref={frameRef}
          className="game-frame"
          src={game.path}
          title={game.title}
          allow="fullscreen; autoplay; gamepad; keyboard-map; clipboard-read; clipboard-write; encrypted-media; picture-in-picture; web-share"
          allowFullScreen
          onLoad={handleFrameLoad}
          onError={() => setFrameError('Failed to load game file.')}
        />
        <div className={`touch-controls ${showControls ? 'show' : ''}`} aria-hidden={!showControls}>
          <div className="touch-pad" role="group" aria-label="Direction pad">
            <span style={{ width: 52 }} />
            <button aria-label="Up" onTouchStart={(e) => { e.preventDefault(); holdKey('ArrowUp') }} onMouseDown={() => holdKey('ArrowUp')} onContextMenu={(e) => e.preventDefault()}>
              ▲
            </button>
            <span style={{ width: 52 }} />
            <button aria-label="Left" onTouchStart={(e) => { e.preventDefault(); holdKey('ArrowLeft') }} onMouseDown={() => holdKey('ArrowLeft')} onContextMenu={(e) => e.preventDefault()}>
              ◀
            </button>
            <button aria-label="Down" onTouchStart={(e) => { e.preventDefault(); holdKey('ArrowDown') }} onMouseDown={() => holdKey('ArrowDown')} onContextMenu={(e) => e.preventDefault()}>
              ▼
            </button>
            <button aria-label="Right" onTouchStart={(e) => { e.preventDefault(); holdKey('ArrowRight') }} onMouseDown={() => holdKey('ArrowRight')} onContextMenu={(e) => e.preventDefault()}>
              ▶
            </button>
          </div>
          <div className="touch-action" role="group" aria-label="Action buttons">
            <button onTouchStart={(e) => { e.preventDefault(); holdKey('Space') }} onMouseDown={() => holdKey('Space')} onContextMenu={(e) => e.preventDefault()}>
              SPACE
            </button>
            <button onTouchStart={(e) => { e.preventDefault(); holdKey('KeyW') }} onMouseDown={() => holdKey('KeyW')} onContextMenu={(e) => e.preventDefault()}>
              W
            </button>
            <button onTouchStart={(e) => { e.preventDefault(); holdKey('Enter') }} onMouseDown={() => holdKey('Enter')} onContextMenu={(e) => e.preventDefault()}>
              ↵
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
