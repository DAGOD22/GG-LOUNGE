import type { Metadata } from 'next'
import { Gamepad2, ShieldCheck, Eye, Trash2, Cookie, Lock, Mail } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Privacy Policy — GG-Lounge',
  description: 'Privacy policy for GG-Lounge — what we store, why, and how to delete it.',
}

export default function PrivacyPage() {
  return (
    <main className="lounge-shell">
      <div className="noise" aria-hidden="true" />
      <header className="site-header">
        <a href="/" className="brand"><span className="brand-mark"><Gamepad2 size={19} /></span><span>GG-LOUNGE<span className="tm">™</span></span></a>
        <nav className="header-nav"><a href="/">Library</a><a href="/apps">Apps</a><a href="/proxy">Proxy</a><a href="/terms">Terms</a></nav>
        <div className="header-status"><span className="live-dot" /> Privacy</div>
      </header>
      <section className="catalog" style={{ maxWidth: 860 }}>
        <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><ShieldCheck size={14} /> PRIVACY • LAST UPDATED 12 SEP 2026</p>
        <h1 style={{ fontSize: 'clamp(32px,5vw,52px)', letterSpacing: '-0.05em', marginTop: 8 }}>Privacy Policy</h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginTop: 8 }}>We built GG-Lounge for school — no ads, no trackers, no selling data. This page explains in plain English what we do store and how to delete it.</p>

        <div style={{ display: 'grid', gap: 16, marginTop: 28 }}>
          <Card icon={<Eye size={16} />} title="What we collect (and why)">
            <ul>
              <li><strong>Gate cookie `gg_gate`</strong> — HttpOnly HMAC that proves you entered the lounge password. 3 hours, then you re-enter. No personal data inside.</li>
              <li><strong>Anonymous ID `ggl_anon_id`</strong> — random string like `anon_abc123...` in localStorage so guest favorites/recently-played sync if you open another tab before login. Not linked to you.</li>
              <li><strong>Account (optional)</strong> — `username`, `favoriteFood` (used only for password reset), bcrypt password hash. No email. If you never register, we never ask.</li>
              <li><strong>Game activity</strong> — `favorites`, `recentlyPlayed`, `playCounts`, `requestVotes` — stored in localStorage + `/api/user-state` (if logged in) or `localStorage` only (guest). Used for Your Lounge, leaderboard, and requests.</li>
              <li><strong>IP + User-Agent for gate bans</strong> — only when you fail the gate 3× in a row we store `ip`/`user-agent` hash with an escalating ban (1m → perm). Never sold.</li>
            </ul>
          </Card>
          <Card icon={<Cookie size={16} />} title="Cookies & storage">
            <ul>
              <li>`gg_gate` — unlock, 10800s, HttpOnly, SameSite=Lax.</li>
              <li>`gg_bare` — which Bare server worked fastest, 86400s, so proxy is fast next time.</li>
              <li>`localStorage: ggl_fav, ggl_recent, ggl_playcounts, ggl_anon_id, ggl_yt_history` — all on your device, clearable in browser settings.</li>
            </ul>
            No Google Analytics cookies, no Facebook pixel. In production we only use Vercel Analytics (anonymized page views, no cookies).
          </Card>
          <Card icon={<Lock size={16} />} title="What we never do">
            <ul>
              <li>Never sell data, never show ads.</li>
              <li>Never log keystrokes or proxy browsing beyond standard server logs (IP, path, timestamp for abuse).</li>
              <li>Never read your files or other tabs.</li>
              <li>Piped/YouTube: video bytes are proxied same-origin via `/api/yt/media` — YouTube never sees your school IP directly when School Mode is on.</li>
            </ul>
          </Card>
          <Card icon={<Trash2 size={16} />} title="Delete everything">
            <ol>
              <li><strong>Guest:</strong> Clear site data in browser (Chrome: ⋮ → Settings → Privacy → Clear browsing data → Cached images + Cookies → gg-lounge) — or open DevTools → Application → Local Storage → delete `ggl_*` and cookies.</li>
              <li><strong>Logged in:</strong> Go to <a href="/admin" style={{ textDecoration: 'underline', color: 'var(--lime)' }}>/admin</a> → Request deletion, we delete `/api/user-state?id=YOUR_USERNAME` and auth row. Under Postgres it is hard-deleted.</li>
              <li><strong>Gate ban:</strong> bans auto-expire; perm bans can be appealed by contacting admin.</li>
            </ol>
            <p style={{ marginTop: 10, padding: 12, borderRadius: 12, background: 'rgba(215,243,74,.08)', border: '1px solid rgba(215,243,74,.2)', fontSize: 13 }}><strong>Under 13?</strong> Don't register. Play as guest — no personal info needed.</p>
          </Card>
          <Card icon={<Mail size={16} />} title="Contact & age">
            <p>This is a hobby project by <strong>Kai Chauhan — GG-Lounge Studios™</strong>. For privacy requests: open <a href="/request-game" style={{ textDecoration: 'underline' }}>Request page</a> and type "privacy". We respond within 7 days.</p>
            <p style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>If we change this policy, we bump the date above and post a banner on the lounge for 7 days. Material changes need you to re-enter the gate.</p>
          </Card>
        </div>

        <div style={{ marginTop: 28, padding: 16, borderRadius: 16, border: '1px solid var(--line)', background: 'var(--panel)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <ShieldCheck size={18} color="var(--lime)" />
          <span style={{ fontWeight: 800 }}>TL;DR: No email, no ads, no selling. Guest = local only. Login = username + food word. Delete anytime.</span>
          <a href="/terms" style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 999, background: 'var(--lime)', color: '#0b0d12', fontWeight: 900, textDecoration: 'none' }}>Read Terms →</a>
        </div>
      </section>
      <footer style={{ maxWidth: 860, margin: '40px auto 0', padding: '20px 38px', borderTop: '1px solid var(--line)', color: 'var(--muted)', fontSize: 11, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span>© 2026 GG-LOUNGE STUDIOS™</span><span><a href="/terms" style={{ textDecoration: 'underline' }}>Terms</a> • <a href="/privacy" style={{ textDecoration: 'underline' }}>Privacy</a> • <a href="/">Home</a></span>
      </footer>
    </main>
  )
}

function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: 18, borderRadius: 16, border: '1px solid var(--line)', background: 'var(--panel)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 900, marginBottom: 10 }}>{icon} {title}</div>
      <div style={{ color: 'var(--muted)', lineHeight: 1.6, fontSize: 13 }}>{children}</div>
    </div>
  )
}
