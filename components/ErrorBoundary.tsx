'use client'
import React from 'react'

export class ErrorBoundary extends React.Component<{ children: React.ReactNode, fallback?: React.ReactNode }, { hasError: boolean, error?: Error }> {
  constructor(props: any){ super(props); this.state = { hasError: false } }
  static getDerivedStateFromError(error: Error){ return { hasError: true, error } }
  componentDidCatch(error: Error, info: any){ console.error('[ErrorBoundary]', error, info) }
  render(){
    if(this.state.hasError){
      return this.props.fallback || (
        <div style={{ padding: 24, textAlign: 'center', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 16, margin: 16 }}>
          <h3 style={{ margin: '0 0 8px', color: 'var(--foreground)' }}>Something went wrong</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, margin: '0 0 12px' }}>{this.state.error?.message || 'Unexpected error'}</p>
          <button onClick={()=> this.setState({ hasError: false })} style={{ padding: '8px 14px', borderRadius: 999, background: 'var(--lime)', color: '#0b0d12', border: 0, fontWeight: 900, cursor: 'pointer' }}>Try again</button>
          <button onClick={()=> location.reload()} style={{ marginLeft: 8, padding: '8px 14px', borderRadius: 999, background: 'transparent', border: '1px solid var(--line)', color: 'var(--foreground)', cursor: 'pointer' }}>Reload page</button>
        </div>
      )
    }
    return this.props.children
  }
}
