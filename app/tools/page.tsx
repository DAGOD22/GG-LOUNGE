import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowUpRight, Gamepad2 } from 'lucide-react'

import { ToolsPage } from '@/components/tools/ToolsPage'
import { TOOLS } from '@/lib/tools/registry'
import './tools.css'

/**
 * The tools page is a server component that only carries metadata and the
 * header; everything interactive lives in `<ToolsPage />`, which is a client
 * component. Keeping the metadata on the server means the page still has a real
 * title and description for search engines and link previews, which a fully
 * client-rendered page tends to lose.
 */
export const metadata: Metadata = {
  // The layout appends " | GG-Lounge", so putting it here too would print it
  // twice — which is exactly what the first deploy of this page did.
  title: 'Free Browser Tools — QR Generator, Calculator & 98 More',
  description: `One hundred utilities that run entirely in your browser: a QR code generator, calculator, unit and colour converters, timers, hashers, text tools and more. Nothing you type is uploaded.`,
  keywords: [
    'qr code generator', 'online calculator', 'unit converter', 'color picker',
    'password generator', 'base64', 'json formatter', 'free browser tools',
  ],
  alternates: { canonical: '/tools' },
  openGraph: {
    title: 'GG Tools — 100 free browser utilities',
    description: `${TOOLS.length} tools, no sign-up and no uploads: QR codes, a calculator, converters, timers and developer panels.`,
    url: '/tools',
  },
}

export default function Page() {
  return (
    <main id="main-content">
      <header className="site-header">
        <Link className="brand" href="/"><span className="brand-mark"><Gamepad2 size={17} /></span><span>GG-LOUNGE<span className="tm">™</span></span></Link>
        <nav className="header-nav" aria-label="Primary navigation">
          <Link href="/">Library</Link>
          <Link href="/apps">Apps</Link>
          <Link href="/proxy">Proxy</Link>
          <Link href="/tools" aria-current="page">Tools</Link>
          <Link href="/gg-gpt">GG-GPT</Link>
          <Link href="/request-game">Request</Link>
        </nav>
        <div className="header-actions">
          <Link className="header-signin" href="/">Back to the lounge <ArrowUpRight size={13} /></Link>
        </div>
      </header>
      <ToolsPage />
      <noscript>
        {/* The tools are all client-side, so a visitor without JavaScript gets
            the directory as links rather than an empty shell. */}
        <section style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
          <h1>GG Tools</h1>
          <p>These tools need JavaScript. Here is the full list so you know what is here:</p>
          <ul>{TOOLS.map(tool => <li key={tool.id}>{tool.name} — {tool.blurb}</li>)}</ul>
        </section>
      </noscript>
    </main>
  )
}
