'use client'
import { User, X } from 'lucide-react'

export function AuthDialog({
  mode,
  form,
  setForm,
  error,
  loading,
  onAction,
  onClose,
  onSwitch,
}: {
  mode: 'login' | 'register' | 'reset'
  form: { username: string; password: string; favoriteFood: string; newPassword: string }
  setForm: (v: any) => void
  error: string
  loading: boolean
  onAction: () => void
  onClose: () => void
  onSwitch: (m: 'login' | 'register' | 'reset') => void
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sign in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(6,7,10,.72)',
        backdropFilter: 'blur(8px)',
        padding: 16,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: 18,
          padding: 18,
          boxShadow: '0 20px 60px rgba(0,0,0,.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 18, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={16} /> {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Reset password'}
          </h3>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 30,
              height: 30,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 999,
              border: '1px solid var(--line)',
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            <X size={14} />
          </button>
        </div>
        {mode !== 'reset' && (
          <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 12, lineHeight: 1.5 }}>
            Sign in with just username & password. Your progress saves to the cloud and works on any device.
          </p>
        )}
        {mode === 'reset' && <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 12 }}>Answer your security question to reset your password.</p>}
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}>
            USERNAME
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="e.g. kai123"
              maxLength={20}
              autoCapitalize="off"
              autoCorrect="off"
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--line)',
                background: 'rgba(255,255,255,.06)',
                color: 'var(--foreground)',
                outline: 'none',
              }}
            />
          </label>
          {mode !== 'reset' && (
            <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}>
              PASSWORD
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••"
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  background: 'rgba(255,255,255,.06)',
                  color: 'var(--foreground)',
                  outline: 'none',
                }}
              />
              {mode === 'register' && <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>6–64 characters, not too common.</span>}
            </label>
          )}
          {mode === 'register' && (
            <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}>
              FAVORITE FOOD — security question
              <input
                value={form.favoriteFood}
                onChange={(e) => setForm({ ...form, favoriteFood: e.target.value })}
                placeholder="e.g. pizza"
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--line)',
                  background: 'rgba(255,255,255,.06)',
                  color: 'var(--foreground)',
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>Asked once when you create your account. Needed to reset password.</span>
            </label>
          )}
          {mode === 'reset' && (
            <>
              <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}>
                FAVORITE FOOD
                <input
                  value={form.favoriteFood}
                  onChange={(e) => setForm({ ...form, favoriteFood: e.target.value })}
                  placeholder="Your answer"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--line)',
                    background: 'rgba(255,255,255,.06)',
                    color: 'var(--foreground)',
                    outline: 'none',
                  }}
                />
              </label>
              <label style={{ display: 'grid', gap: 6, fontSize: 11, fontWeight: 800, letterSpacing: '.06em' }}>
                NEW PASSWORD
                <input
                  type="password"
                  value={form.newPassword}
                  onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                  placeholder="New password"
                  style={{
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid var(--line)',
                    background: 'rgba(255,255,255,.06)',
                    color: 'var(--foreground)',
                    outline: 'none',
                  }}
                />
              </label>
            </>
          )}
          {error && (
            <div
              role="alert"
              style={{
                padding: '8px 10px',
                borderRadius: 10,
                background: 'rgba(255,92,92,.12)',
                border: '1px solid rgba(255,92,92,.3)',
                color: 'var(--foreground)',
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}
          <button
            disabled={loading}
            onClick={onAction}
            style={{
              padding: '11px 14px',
              borderRadius: 999,
              background: 'var(--lime)',
              color: '#0b0d12',
              border: '1px solid var(--lime)',
              fontWeight: 900,
              cursor: 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Reset password'}
          </button>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', fontSize: 11 }}>
            {mode === 'login' && (
              <>
                <button
                  onClick={() => onSwitch('register')}
                  style={{ background: 'none', border: 0, color: 'var(--foreground)', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  Create account
                </button>
                <span style={{ color: 'var(--muted)' }}>•</span>
                <button
                  onClick={() => onSwitch('reset')}
                  style={{ background: 'none', border: 0, color: 'var(--foreground)', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  Forgot password?
                </button>
              </>
            )}
            {mode === 'register' && (
              <button
                onClick={() => onSwitch('login')}
                style={{ background: 'none', border: 0, color: 'var(--foreground)', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Already have an account? Sign in
              </button>
            )}
            {mode === 'reset' && (
              <button
                onClick={() => onSwitch('login')}
                style={{ background: 'none', border: 0, color: 'var(--foreground)', textDecoration: 'underline', cursor: 'pointer' }}
              >
                Back to sign in
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
