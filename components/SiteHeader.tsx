'use client'
/**
 * The site header.
 *
 * Lifted out of app/page.tsx, which was a 774-line client component holding the
 * whole lounge — catalogue state, URL routing, auth, requests and every piece of
 * chrome. The header is the largest block in it that owns no state at all: it
 * renders a nav, the account slot and four buttons, and every value it shows is
 * passed in. Extracting it makes the page shorter and, more usefully, makes the
 * header testable without mounting the entire catalogue.
 *
 * The prop list is deliberately explicit rather than a spread of the page's
 * state: the header should not be able to read things it has no business showing.
 */
import { Cloud, Download, Gamepad2, LogIn, LogOut, Menu, Moon, Sun, Trophy, User, Wifi, WifiOff, X } from 'lucide-react'

export type HeaderUser = { id: string; username: string } | null

export function SiteHeader({
  mobileNavOpen,
  setMobileNavOpen,
  authUser,
  achUnlocked,
  achTotal,
  online,
  gameCount,
  theme,
  installable,
  onOpenAchievements,
  onSignIn,
  onLogOut,
  onToggleTheme,
  onInstall,
}: {
  mobileNavOpen: boolean
  setMobileNavOpen: (update: (value: boolean) => boolean) => void
  authUser: HeaderUser
  achUnlocked: number | undefined
  achTotal: number | undefined
  online: boolean
  gameCount: number
  theme: 'dark' | 'light'
  installable: boolean
  onOpenAchievements: () => void
  onSignIn: () => void
  onLogOut: () => void
  onToggleTheme: () => void
  onInstall: () => void
}) {
  const closeNav = () => setMobileNavOpen(() => false)
  return (
    <header className="site-header">
      <a href="#top" className="brand" aria-label="GG-Lounge home">
        <span className="brand-mark">
          <Gamepad2 size={19} />
        </span>
        <span className="brand-name">GG-LOUNGE<span className="tm">™</span></span>
      </a>
      <button className="mobile-toggle" aria-label="Open menu" aria-expanded={mobileNavOpen} onClick={() => setMobileNavOpen(v => !v)}>{mobileNavOpen ? <X size={16} /> : <Menu size={16} />}</button>
      <nav className={`header-nav ${mobileNavOpen ? 'mobile-open' : ''}`} aria-label="Primary navigation">
        <a href="#games" onClick={closeNav}>Library</a>
        <a href="/apps" onClick={closeNav}>Apps</a>
        <a href="/gg-gpt" onClick={closeNav}>GG-GPT</a>
        <a href="/proxy" onClick={closeNav}>Proxy</a>
        <a href="/tools" onClick={closeNav}>Tools</a>
        <button onClick={() => { onOpenAchievements(); setMobileNavOpen(() => false) }} style={{ background: 'none', border: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 800 }}><Trophy size={12} /> Achievements</button>
        <a href="#about" onClick={closeNav}>Studio</a>
        <a href="/request-game" onClick={closeNav}>Request a game</a>
        <a href="/admin" onClick={closeNav}>Admin</a>
      </nav>
      <div className="header-actions">
        <button className={authUser ? 'icon-button header-achievements is-active' : 'icon-button header-achievements'} onClick={onOpenAchievements} aria-label="Achievements" title={authUser ? `${achUnlocked || 0}/${achTotal || '--'} unlocked` : 'View achievements — sign in to save'}><Trophy size={16} />{authUser && achUnlocked ? <span className="header-badge">{achUnlocked}</span> : null}</button>
        <div className="header-status">
          {online ? <Wifi size={12} /> : <WifiOff size={12} color="var(--coral)" />}
          <span className="live-dot" style={{ background: online ? 'var(--lime)' : 'var(--coral)' }} /> {gameCount} titles
        </div>
        {authUser ? (
          <span className="header-user">
            <User size={14} /> {authUser.username}
            <span className="header-user-sync"><Cloud size={10} /> Synced</span>
            <button className="header-user-logout" onClick={onLogOut} aria-label="Log out" title="Log out"><LogOut size={12} /></button>
          </span>
        ) : (
          <button className="header-signin" onClick={onSignIn}><LogIn size={14} /> <span>Sign in</span></button>
        )}
        <button className="icon-button" onClick={onToggleTheme} aria-label="Toggle theme" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {installable && <button className="header-install" onClick={onInstall}><Download size={14} /> <span>Install</span></button>}
      </div>
    </header>
  )
}
