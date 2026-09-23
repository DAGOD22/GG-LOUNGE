import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/inter'
import './globals.css'
import './customization.css'
import { CustomizationProvider } from '@/components/customization/CustomizationProvider'
import GlobalSW from './global-sw'

export const metadata: Metadata = {
  title: {
    default: 'GG-Lounge — Browser Games',
    template: '%s | GG-Lounge',
  },
  description: 'A collection of local browser games, community requests and a shared Scramjet app launcher.',
  keywords: ['unblocked games','slope','retro bowl','stack','hole.io','moto x3m','1v1.lol','proxy games','school games','GG Lounge'],
  authors: [{ name: 'GG-Lounge Studios', url: 'https://gg-lounge.example.com' }],
  creator: 'GG-Lounge Studios',
  publisher: 'GG-Lounge Studios',
  formatDetection: { email: false, address: false, telephone: false },
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://gg-lounge.vercel.app')),
  alternates: { canonical: '/' },
  openGraph: {
    title: 'GG-Lounge — Browser Games',
    description: 'Local browser games for school — fast, proxy-powered, no login.',
    url: '/',
    siteName: 'GG-Lounge',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'GG Lounge — Browser Games' }],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GG-Lounge — Browser Games',
    description: 'Local browser games, proxy-powered.',
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
              url: process.env.NEXT_PUBLIC_SITE_URL || 'https://gg-lounge.example.com',
              description: 'Local browser games',
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
            __html: `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__gglDeferredPrompt=e;window.dispatchEvent(new CustomEvent('ggl:installable'));});`,
          }}
        />
        <CustomizationProvider>{children}</CustomizationProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
