import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'GG-Lounge — Small games. Big energy.',
  description: 'GG-LOUNGE™ is an independent browser arcade featuring ten handpicked games. A production of GG-LOUNGE STUDIOS™.',
  generator: 'v0.app',
  manifest: '/manifest.webmanifest',
  applicationName: 'GG-Lounge',
  icons: {
    icon: '/api/gg/icon.svg?label=G&size=512',
    apple: '/api/gg/icon.svg?label=G&size=512',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#101016',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-background">
      <head>
        {/*
          gg-boot.js is the lounge's client-side engine: tab cloaking, panic key,
          themes, reactive backgrounds and the video-engine prefs. It loads first so
          the cloak + theme are applied before the first paint (no flash of "GG
          Lounge" in the tab strip), and it also runs inside the game/video iframes.
        */}
        <script src="/gg/gg-boot.js" />
      </head>
      <body className="antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
