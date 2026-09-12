import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import GlobalSW from './global-sw'

export const metadata: Metadata = {
  title: {
    default: 'GG-Lounge — 200+ Unblocked Games',
    template: '%s | GG-Lounge',
  },
  description: '200+ unblocked browser games — Slope, Retro Bowl, Stack, Hole.io, Moto X3M, 1v1.LOL and more. Fast, no login, proxy-unblocked for school.',
  keywords: ['unblocked games','slope','retro bowl','stack','hole.io','moto x3m','1v1.lol','proxy games','school games','GG Lounge'],
  authors: [{ name: 'GG-Lounge Studios', url: 'https://gg-lounge.example.com' }],
  creator: 'GG-Lounge Studios',
  publisher: 'GG-Lounge Studios',
  formatDetection: { email: false, address: false, telephone: false },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://gg-lounge.vercel.app'),
  alternates: { canonical: '/' },
  openGraph: {
    title: 'GG-Lounge — 200+ Unblocked Games',
    description: '200+ unblocked games for school — fast, proxy-powered, no login.',
    url: '/',
    siteName: 'GG-Lounge',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'GG Lounge — 200+ Unblocked Games' }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GG-Lounge — 200+ Unblocked Games',
    description: '200+ unblocked games, proxy-powered.',
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
        <link rel="preconnect" href="https://tomphttp.outv1.workers.dev" />
        <link rel="preconnect" href="https://pipedapi.tokhmi.xyz" />
        <link rel="preconnect" href="https://www.google.com" />
        <link rel="dns-prefetch" href="https://bare.noblocc.uk" />
        <link rel="apple-touch-icon" href="/apple-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="GG Lounge" />
        <meta name="application-name" content="GG Lounge" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('ggl_theme');if(t){document.documentElement.setAttribute('data-theme',t);document.documentElement.style.colorScheme=t==='light'?'light':'dark'}else if(window.matchMedia('(prefers-color-scheme: light)').matches){document.documentElement.setAttribute('data-theme','light')} }catch(e){}})();`,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: 'GG-Lounge',
              url: process.env.NEXT_PUBLIC_SITE_URL || 'https://gg-lounge.example.com',
              description: '200+ unblocked browser games',
              publisher: { '@type': 'Organization', name: 'GG-Lounge Studios' },
              potentialAction: { '@type': 'SearchAction', target: '/?q={search_term_string}', 'query-input': 'required name=search_term_string' },
            }),
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
