'use client'
import { useEffect } from 'react'

export default function GatePage() {
  useEffect(() => {
    window.location.replace('/')
  }, [])
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#05070a', color: '#e6f1ff', fontFamily: 'ui-monospace, monospace', padding: 16 }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 13, letterSpacing: '.14em', opacity: .6, fontWeight: 800 }}>GATE DISABLED — PUBLIC LOUNGE</p>
        <p style={{ marginTop: 8, fontSize: 12, opacity: .7 }}>Redirecting to <a href="/" style={{ color: '#22c55e', textDecoration: 'underline' }}>home</a>…</p>
      </div>
    </main>
  )
}
