import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import './atmosphere.css'
import './proxy.css'
import { AppearanceStudio } from '@/components/appearance-studio'

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
        <AppearanceStudio />
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
