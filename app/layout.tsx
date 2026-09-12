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
  colorScheme: 'dark light',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d12' },
  ],
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-background" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="GG Lounge" />
        <meta name="application-name" content="GG Lounge" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ggl_theme');if(t){document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t==='light'?'light':'dark'}else if(window.matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.setAttribute('data-theme','light')} }catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">
        <GlobalSW />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/uv/uv.sw.js').catch(function(){});});}
          window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__gglDeferredPrompt=e;window.dispatchEvent(new CustomEvent('ggl:installable'));});`,
          }}
        />
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
