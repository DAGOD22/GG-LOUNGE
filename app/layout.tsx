import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/inter'
import './globals.css'
import './customization.css'
import './banner.css'
import './chatverse.css'
import { CustomizationProvider } from '@/components/customization/CustomizationProvider'
import { PresenceProvider } from '@/components/live/PresenceProvider'
import { GameBridgeProvider } from '@/components/live/GameBridge'
import GlobalSW from './global-sw'

/**
 * Titles and descriptions are the only SEO surface a search engine is obliged
 * to believe, so they say exactly what the site is. The old text ("a collection
 * of local browser games") was short enough that Bing filled the gap by pulling
 * a sentence from whichever game page it crawled last, which is why the result
 * snippet read like one game instead of like the site.
 */
const SITE_TITLE = 'GG-Lounge — Unblocked Browser Games, Web Proxy & Indie Arcade (250+ Games)'
const SITE_DESCRIPTION =
  'Play 250+ self-hosted, ad-free browser games instantly — no installs, no sign-up. Every title runs on GG-Lounge’s own CDN, with a built-in web proxy, custom themes, a tab cloaker and GG-GPT, the games assistant that knows what you have actually played.'
const SITE_KEYWORDS = [
  'unblocked games',
  'browser games',
  'free online games',
  'ad-free games',
  'self-hosted games',
  'indie arcade',
  'web proxy',
  'unblocked proxy',
  'school games',
  'classroom games',
  'tab cloaker',
  'tab disguise',
  'custom themes',
  'game site themes',
  'no download games',
  'HTML5 games',
  'slope',
  'retro bowl',
  'cookie clicker',
  'moto x3m',
  'geometry dash',
  'drift hunters',
  'GG Lounge',
]

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: '%s | GG-Lounge',
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  authors: [{ name: 'GG-Lounge Studios', url: 'https://gg-lounge.vercel.app' }],
  creator: 'GG-Lounge Studios',
  publisher: 'GG-Lounge Studios',
  formatDetection: { email: false, address: false, telephone: false },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://gg-lounge.vercel.app')),
  alternates: { canonical: '/' },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
    siteName: 'GG-Lounge',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'GG-Lounge — 250+ unblocked browser games' }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: ['/og-image.png'],
  },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } },
  verification: { google: process.env.NEXT_PUBLIC_GOOGLE_VERIFICATION || undefined },
  category: 'games',
  generator: 'GG-Lounge',
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
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="preconnect" href="https://www.bing.com" />
        <link rel="preconnect" href="https://www.google.com" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="GG Lounge" />
        <meta name="application-name" content="GG Lounge" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var r=document.documentElement,s=JSON.parse(localStorage.getItem('ggl_customization_v1')||'null'),t=s&&s.theme;var mode=t&&t.mode==='light'?'light':localStorage.getItem('ggl_theme')==='light'?'light':'dark';r.dataset.theme=mode;r.style.colorScheme=mode;if(t&&t.colors){var map={background:'--background',surface:'--surface',panel:'--panel',text:'--foreground',muted:'--muted',accent:'--lime',secondary:'--violet'};Object.keys(map).forEach(function(k){var v=t.colors[k];if(typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v))r.style.setProperty(map[k],v)})}}catch(e){}})();`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'GG-Lounge',
              alternateName: 'GG Lounge',
              url: process.env.NEXT_PUBLIC_SITE_URL || 'https://gg-lounge.vercel.app',
              description: SITE_DESCRIPTION,
              publisher: { '@type': 'Organization', name: 'GG-Lounge Studios' },
              potentialAction: { '@type': 'SearchAction', target: '/?q={search_term_string}', 'query-input': 'required name=search_term_string' },
            }),
          }}
        />
      </head>
      <body className="antialiased">
        {/* First tab stop on every page. Without it, a keyboard user has to
            tab through the whole header — nav, account, theme, install — before
            reaching the catalogue, on every single navigation. */}
        <a className="skip-link" href="#main-content">Skip to the games</a>
        <GlobalSW />
        <script
          dangerouslySetInnerHTML={{
            __html: `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__gglDeferredPrompt=e;window.dispatchEvent(new CustomEvent('ggl:installable'));});`,
          }}
        />
        <CustomizationProvider><GameBridgeProvider><PresenceProvider>{children}</PresenceProvider></GameBridgeProvider></CustomizationProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
