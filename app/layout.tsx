import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import GlobalSW from './global-sw'

export const metadata: Metadata = {
  title: 'GG-Lounge — Small games. Big energy.',
  description: 'GG-LOUNGE™ is an independent browser arcade featuring ten handpicked games. A production of GG-LOUNGE STUDIOS™.',
  generator: 'v0.app',
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
      <body className="antialiased">
        <GlobalSW />
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
