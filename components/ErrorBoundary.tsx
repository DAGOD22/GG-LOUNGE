'use client'
import React from 'react'

export class ErrorBoundary extends React.Component<{ children: React.ReactNode, fallback?: React.ReactNode, resetKey?: string }, { hasError: boolean, error?: Error }> {
  constructor(props: any){ super(props); this.state = { hasError: false } }
  static getDerivedStateFromError(error: Error){ return { hasError: true, error } }
  componentDidCatch(error: Error, info: any){ console.error('[ErrorBoundary]', error, info) }
  /**
   * A boundary that has caught an error stays caught for the life of the
   * component, so choosing a different game after one crashed left the person
   * staring at "Something went wrong" until they reloaded the whole page. When
   * `resetKey` changes — the game id — the boundary clears itself.
   */
  componentDidUpdate(previous: { resetKey?: string }){
    if(this.state.hasError && previous.resetKey !== this.props.resetKey) this.setState({ hasError: false, error: undefined })
  }
  render(){
    if(this.state.hasError){
      return this.props.fallback || (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, margin: 16 }}>
          <h3 style={{ margin: '0 0 8px', color: 'var(--foreground)' }}>Something went wrong</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>{this.state.error?.message || 'Unexpected error'}</p>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: '0 0 12px', opacity: .8 }}>Your saved games and settings are untouched.</p>
          <button onClick={()=> this.setState({ hasError: false })} style={{ padding: '8px 14px', borderRadius: 999, background: 'var(--lime)', color: '#0b0d12', border: 0, fontWeight: 900, cursor: 'pointer' }}>Try again</button>
          <button onClick={()=> location.reload()} style={{ marginLeft: 8, padding: '8px 14px', borderRadius: 999, background: 'transparent', border: '1px solid var(--line)', color: 'var(--foreground)', cursor: 'pointer' }}>Reload page</button>
        </div>
      )
    }
    return this.props.children
  }
}
