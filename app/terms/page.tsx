import type { Metadata } from 'next'
import { Gamepad2, Scale, AlertTriangle, Shield, FileText, Gavel, Mail } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Terms of Service — GG-Lounge',
  description: 'Terms for GG-Lounge — acceptable use, proxy, and liability.',
}

export default function TermsPage() {
  return (
    <main className="lounge-shell">
      <div className="noise" aria-hidden="true" />
      <header className="site-header">
        <a href="/" className="brand"><span className="brand-mark"><Gamepad2 size={19} /></span><span>GG-LOUNGE<span className="tm">™</span></span></a>
        <nav className="header-nav"><a href="/">Library</a><a href="/apps">Apps</a><a href="/proxy">Proxy</a><a href="/privacy">Privacy</a></nav>
        <div className="header-status"><span className="live-dot" /> Terms</div>
      </header>
      <section className="catalog" style={{ maxWidth: 860 }}>
        <p className="eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Scale size={14} /> TERMS • 12 SEP 2026 • AUSTRALIA</p>
        <h1 style={{ fontSize: 'clamp(32px,5vw,52px)', letterSpacing: '-0.05em', marginTop: 8 }}>Terms of Service</h1>
        <p style={{ color: 'var(--muted)', lineHeight: 1.6, marginTop: 8 }}>By using proxy/apps/games, you agree to these. Plain English, no lawyer fog. If you are under 13, play as guest only and get a teacher/parent ok.</p>

        <div style={{ display: 'grid', gap: 16, marginTop: 28 }}>
          <Card icon={<FileText size={16} />} title="1. What GG-Lounge is">
            <p>GG-Lounge is a hand-picked browser arcade + unblocked proxy (Ultraviolet/Bare) + Piped-powered YouTube client. We host open-source game builds in <code>/public/games/*</code> and proxy third-party sites so school filters see only <code>gg-lounge.*</code>. We are <strong>not</strong> affiliated with Slope, Retro Bowl, 1v1.LOL, YouTube, TikTok, Discord, etc. Those marks belong to their owners.</p>
          </Card>
          <Card icon={<Shield size={16} />} title="2. Acceptable use">
            <ul>
              <li>Public lounge — no password required. Just open and play.</li>
              <li>Proxy is for unblocking educational Brescia + your own accounts. Don't use it to harass, spam, phish, scrape at scale, or break your school's AUP. We log `x-forwarded-for` + path for abuse only and will block abusers.</li>
              <li>You are responsible for your school's rules. If your school forbids proxies, don't use this there.</li>
            </ul>
          </Card>
          <Card icon={<Gavel size={16} />} title="3. Accounts (no email)">
            <p>Register with <code>username + password + favoriteFood</code> (food is for `Reset`). We bcrypt passwords. Don't pick someone else's name, don't share passwords, don't try to log in as `admin`. One account per person. We may delete inactive or abusive accounts.</p>
          </Card>
          <Card icon={<AlertTriangle size={16} />} title="4. Games, YouTube, proxy — no warranties">
            <ul>
              <li>Games in <code>/public/games</code> are provided as-is. We try to keep them working but we don't own them.</li>
              <li>YouTube via Piped: we re-serve metadata/streams from community Piped instances (`tokhmi.xyz`, `moomoo.me`, etc). If a Piped instance serves wrong data, not our fault. School Mode proxies bytes same-origin — slower but unblockable.</li>
              <li>Proxy (Ultraviolet/Bare) rewrites sites. Some sites break (banking, SSO). Don't use proxy for sensitive logins if you don't trust the rewrite.</li>
              <li>No uptime promise. Free Bare/Piped can be down. We fallback automatically but not guaranteed.</li>
            </ul>
          </Card>
          <Card icon={<Shield size={16} />} title="5. Liability & age">
            <ul>
              <li>Service is free, as-is, no warranty. To the extent permitted in South Australia, we are not liable for indirect loss, school discipline, or data loss if `DATABASE_URL` is unset (local JSON mode — deploys wipe guest progress).</li>
              <li>Under 13: guest only. 13-18: need parent/teacher permission per your school.</li>
              <li>We may change, throttle, or sunset any game/proxy/Piped instance at any time to keep the lounge fast.</li>
            </ul>
          </Card>
          <Card icon={<Mail size={16} />} title="6. Contact & changes">
            <p>Operator: <strong>Kai Chauhan — GG-Lounge Studios™</strong>, Adelaide SA, AU. We post material term changes as a banner for 7 days + bump this date. Continued use = acceptance.</p>
          </Card>
          <Card icon={<FileText size={16} />} title="7. Privacy">
            <p>See <a href="/privacy" style={{ color: 'var(--lime)', textDecoration: 'underline' }}>Privacy Policy</a> for what we store (anon ID, optional account, playCounts) and how to delete. By using the lounge you agree to that too.</p>
          </Card>
        </div>

        <div style={{ marginTop: 28, padding: 16, borderRadius: 16, border: '1px solid var(--line)', background: 'var(--panel)', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <Scale size={18} color="var(--lime)" />
          <span style={{ fontWeight: 800 }}>TL;DR: Don't abuse proxy, don't be a jerk, no warranty, AU law.</span>
          <a href="/privacy" style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 999, background: 'var(--panel)', border: '1px solid var(--line)', fontWeight: 800, textDecoration: 'none' }}>Privacy →</a>
        </div>
      </section>
      <footer style={{ maxWidth: 860, margin: '40px auto 0', padding: '20px 38px', borderTop: '1px solid var(--line)', color: 'var(--muted)', fontSize: 11, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span>© 2026 GG-LOUNGE STUDIOS™ • Adelaide, SA</span><span><a href="/privacy" style={{ textDecoration: 'underline' }}>Privacy</a> • <a href="/terms" style={{ textDecoration: 'underline' }}>Terms</a> • <a href="/">Home</a></span>
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
