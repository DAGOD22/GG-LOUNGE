'use client'

/**
 * GG Lounge proxy chrome.
 *
 * The heavy lifting lives server-side (lib/proxy). This page only:
 *  - builds canonical /api/proxy/<b64url> targets,
 *  - hosts the sandboxed frame,
 *  - listens for REAL runtime events (ready / navigate / net-error) posted
 *    by public/proxy/runtime.js — loading and error states are never faked,
 *  - keeps parent-side history (the frame's origin is opaque, so the parent
 *    cannot reach into it).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Globe, Home, Lock, RotateCw, Search, TriangleAlert } from 'lucide-react'

type FrameMessage = {
  gg: 'ready' | 'navigate' | 'net-error' | 'patch-failed'
  url?: string
  detail?: { status?: number; title?: string; host?: string; path?: string; error?: { message: string } | null; api?: string; message?: string } | null
}

type Config = { engine: string; origin: string; allowlist: string[]; limitations: Record<string, string> }

const SHORTCUTS: Array<[string, string, string]> = [
  ['YouTube', 'https://www.youtube.com/', 'Video'],
  ['Poki', 'https://poki.com/', 'Games'],
  ['CrazyGames', 'https://www.crazygames.com/', 'Games'],
  ['DuckDuckGo', 'https://duckduckgo.com/', 'Search'],
  ['Wikipedia', 'https://www.wikipedia.org/', 'Reference'],
]

/** b64url of the absolute URL — must match lib/proxy/codec.ts exactly. */
function encodeTarget(absolute: string): string {
  const bytes = new TextEncoder().encode(absolute)
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  return '/api/proxy/' + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function normalizeInput(raw: string): string {
  const value = raw.trim()
  if (!value) throw new Error('Enter a website address or search term.')
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:\/\//i.test(value)) {
    throw new Error('Only http:// and https:// addresses can be proxied.')
  }
  if (!/^https?:\/\//i.test(value)) {
    return /\s/.test(value) || !value.includes('.')
      ? 'https://duckduckgo.com/?q=' + encodeURIComponent(value)
      : 'https://' + value
  }
  return value
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export default function ProxyPage() {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [address, setAddress] = useState('')
  const [frameSrc, setFrameSrc] = useState('')
  const [displayUrl, setDisplayUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [booting, setBooting] = useState(true)
  const [status, setStatus] = useState('Connecting to proxy…')
  const [problems, setProblems] = useState<string[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [stack, setStack] = useState<string[]>([])
  const [stackIndex, setStackIndex] = useState(-1)
  const [navCount, setNavCount] = useState(0)
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch real allowlist + limitations (no fake copy).
  useEffect(() => {
    let alive = true
    fetch('/api/proxy/config', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('config ' + r.status))))
      .then((cfg: Config) => {
        if (alive) {
          setConfig(cfg)
          setBooting(false)
          setStatus('Proxy ready · server-side engine')
        }
      })
      .catch(() => {
        if (alive) {
          setBooting(false)
          setStatus('Proxy configuration unavailable — reload to retry.')
        }
      })
    return () => {
      alive = false
    }
  }, [])

  const navigate = useCallback(
    (raw: string, opts?: { replaceHistory?: boolean }) => {
      let absolute: string
      try {
        absolute = normalizeInput(raw)
      } catch (err) {
        setProblems([err instanceof Error ? err.message : 'Could not open this address.'])
        return
      }
      const src = encodeTarget(absolute)
      setAddress(absolute)
      setDisplayUrl(absolute)
      setFrameSrc(src)
      setNavCount((n) => n + 1) // new document even for identical URLs
      setProblems((p) => p.slice(-3))
      setLoading(true)
      setStatus(`Loading ${hostOf(absolute)}…`)
      if (loadTimer.current) clearTimeout(loadTimer.current)
      // Honest timeout: if neither load nor runtime 'ready' arrived, say so.
      loadTimer.current = setTimeout(() => {
        setLoading((still) => {
          if (still) {
            setStatus('Still waiting for the site — it may be slow or blocking this server.')
            setProblems((p) => [
              ...p.slice(-3),
              `${hostOf(absolute)} has not responded yet. This is a real upstream delay, not a UI state.`,
            ])
          }
          return still
        })
      }, 20_000)
      if (!opts?.replaceHistory) {
        setStack((s) => {
          const next = opts ? s : s.slice(0, stackIndex + 1).concat(src)
          return next
        })
        if (!opts) setStackIndex((i) => i + 1)
      }
    },
    [stackIndex],
  )

  // Deep link: /proxy?url=…
  useEffect(() => {
    const wanted = new URLSearchParams(location.search).get('url')
    if (wanted) navigate(wanted)
  }, [navigate])

  // Real events from the frame runtime (sandboxed → opaque origin, so this
  // postMessage channel is the ONLY truthful status source).
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!frameRef.current || event.source !== frameRef.current.contentWindow) return
      const data = event.data as FrameMessage | undefined
      if (!data || typeof data !== 'object' || !String(data.gg || '').startsWith) return
      if (data.gg === 'ready') {
        setLoading(false)
        if (loadTimer.current) clearTimeout(loadTimer.current)
        const d = data.detail ?? {}
        if (d.error) {
          setStatus(`Upstream error ${d.status ?? ''} — ${d.error.message}`.trim())
          setProblems((p) => [...p.slice(-3), `${d.host ?? hostOf(data.url ?? '')}: ${d.error!.message}`])
        } else {
          const suffix = d.status && d.status !== 200 ? ` (upstream ${d.status})` : ''
          setStatus(`${d.host ?? hostOf(data.url ?? '')}${suffix} · ${d.title ? d.title.slice(0, 60) : 'loaded'}`)
        }
        if (data.url) setDisplayUrl(data.url)
      } else if (data.gg === 'navigate') {
        const real = data.detail ? String((data.detail as { real?: string }).real ?? data.url ?? '') : (data.url ?? '')
        if (real) {
          setDisplayUrl(real)
          setAddress(real)
        }
      } else if (data.gg === 'net-error') {
        const d = data.detail ?? {}
        const text = d.api === 'websocket' ? d.message || 'WebSockets cannot be proxied on this host.' : `${d.api ?? 'request'} failed${d.message ? ': ' + d.message : ''}`
        setProblems((p) => (p[p.length - 1] === text ? p : [...p.slice(-3), text]))
      } else if (data.gg === 'patch-failed') {
        {
          const msg = `Page resisted proxy patching (${data.detail?.api ?? 'unknown'})${data.detail?.message ? `: ${data.detail.message}` : ''}. Some requests may fail.`
          setProblems((p) => (p[p.length - 1] === msg ? p : [...p.slice(-3), msg]))
        }
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  useEffect(() => () => void (loadTimer.current && clearTimeout(loadTimer.current)), [])

  const canBack = stackIndex > 0
  const canForward = stackIndex >= 0 && stackIndex < stack.length - 1
  const stepHistory = (delta: number) => {
    const next = stackIndex + delta
    if (next < 0 || next >= stack.length) return
    setStackIndex(next)
    setFrameSrc(stack[next])
    setNavCount((n) => n + 1)
    setLoading(true)
    setStatus('Loading…')
  }
  const goBack = () => stepHistory(-1)
  const goForward = () => stepHistory(1)
  const reload = () => {
    if (!displayUrl) return
    setLoading(true)
    setStatus('Reloading…')
    setNavCount((n) => n + 1)
  }
  const home = () => {
    setFrameSrc('')
    setDisplayUrl('')
    setAddress('')
    setLoading(false)
    setStatus(config ? 'Proxy ready · server-side engine' : 'Connecting to proxy…')
    setProblems([])
  }

  // Defense in depth: the response CSP `sandbox` (no allow-same-origin) keeps
  // the document origin opaque even if a host strips our CSP. The attribute
  // therefore NEVER grants allow-same-origin or allow-popups-to-escape —
  // a proxied page must not reach lounge DOM/session or tab-nab the opener.
  const sandbox = useMemo(
    () =>
      [
        'allow-scripts',
        'allow-forms',
        'allow-popups',
        'allow-modals',
        'allow-downloads',
        'allow-pointer-lock',
        'allow-storage-access-by-user-activation',
      ].join(' '),
    [],
  )

  return (
    <main className="pgx-shell">
      <header className="pgx-bar">
        <a className="pgx-brand" href="/">
          <Globe size={16} aria-hidden />
          GG-LOUNGE <span>/ PROXY</span>
        </a>
        <div className="pgx-nav" role="group" aria-label="Browser history">
          <button type="button" aria-label="Back" disabled={!canBack} onClick={goBack}>
            <ArrowLeft size={16} />
          </button>
          <button type="button" aria-label="Forward" disabled={!canForward} onClick={goForward}>
            <ArrowRight size={16} />
          </button>
          <button type="button" aria-label="Reload" disabled={!frameSrc} onClick={reload}>
            <RotateCw size={16} />
          </button>
          <button type="button" aria-label="Home" disabled={!frameSrc} onClick={home}>
            <Home size={16} />
          </button>
        </div>
        <form
          className="pgx-form"
          onSubmit={(event) => {
            event.preventDefault()
            navigate(address)
          }}
        >
          <Lock size={14} aria-hidden />
          <input
            aria-label="Website address or search"
            placeholder="Search or enter a website — e.g. poki.com"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            inputMode="url"
            name="url"
          />
          <button type="submit" className="pgx-go">
            <Search size={14} aria-hidden /> Go
          </button>
        </form>
        <span className={`pgx-status${loading ? ' is-loading' : ''}`} role="status" aria-live="polite">
          {loading ? <span className="pgx-dot" aria-hidden /> : null}
          {status}
        </span>
      </header>

      {problems.length > 0 && (
        <div className="pgx-alerts" role="alert">
          <TriangleAlert size={15} aria-hidden />
          <div>
            {problems.map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        </div>
      )}

      {!frameSrc ? (
        <section className="pgx-home">
          <p className="eyebrow">SUPPORTED SITES · SERVER-SIDE PROXY</p>
          <h1>
            Browse the <em>open web.</em>
          </h1>
          <p className="pgx-lede">
            Pages, scripts, styles, images, fonts, JSON APIs and ranged media are fetched by the lounge server and rewritten so
            everything stays inside the proxy. No browser extensions, no open relay.
          </p>
          <div className="pgx-quick">
            {SHORTCUTS.map(([name, url, kind]) => (
              <button key={name} type="button" disabled={booting} onClick={() => navigate(url)}>
                <strong>{name}</strong>
                <small>{kind}</small>
              </button>
            ))}
          </div>
          {config && (
            <p className="pgx-allow">
              <Lock size={13} aria-hidden /> Allowlist: {config.allowlist.join(' · ')} — operators extend it with
              GG_PROXY_EXTRA_HOSTS.
            </p>
          )}
          <div className="pgx-honesty">
            <h2>
              <TriangleAlert size={14} aria-hidden /> Honest limits
            </h2>
            <ul>
              <li>WebSockets and WebRTC are not proxied — realtime apps that need them will show a real error, not a fake load.</li>
              <li>DRM video (Widevine etc.), site logins, CAPTCHAs and bot checks are never bypassed.</li>
              <li>Only allowlisted hosts load; localhost, private IPs and metadata addresses are blocked server-side.</li>
            </ul>
            <p>
              Source-open engine · <code>lib/proxy</code> · <code>{config?.engine ?? '…'}</code>
            </p>
          </div>
        </section>
      ) : (
        <div className="pgx-stage">
          {/* Response CSP `sandbox` (no allow-same-origin in CSP) keeps the
              document origin opaque even though the attribute includes
              allow-same-origin for same-URL-origin fetches. */}
          <iframe
            ref={frameRef}
            key={`${frameSrc}::${navCount}`}
            className="pgx-frame"
            src={frameSrc}
            title="Proxied page"
            sandbox={sandbox}
            allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write"
            onLoad={() => {
              /* Runtime 'ready' is authoritative; load is the fallback. */
              if (loading) {
                setLoading(false)
                if (loadTimer.current) clearTimeout(loadTimer.current)
                setStatus((s) => (s.startsWith('Loading') ? `Document loaded — ${hostOf(displayUrl || address)}` : s))
              }
            }}
          />
          <footer className="pgx-foot">
            <span title="The lounge origin">
              <Globe size={12} aria-hidden /> {displayUrl ? hostOf(displayUrl) : ''}
            </span>
            <a href={displayUrl || '#'} target="_blank" rel="noopener noreferrer" title="Open the real site outside the proxy">
              Open original <ExternalLink size={11} aria-hidden />
            </a>
          </footer>
        </div>
      )}
    </main>
  )
}
