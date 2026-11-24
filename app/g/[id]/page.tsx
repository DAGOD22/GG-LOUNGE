import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { games } from '@/lib/games'
import { canonicalOrigin } from '@/lib/site-domains'
import Link from 'next/link'

export function generateStaticParams(){
  return games.map(g=> ({ id: g.id }))
}
/**
 * Route params are a Promise in Next 16. Reading `params.id` synchronously
 * yielded `undefined`, so `find` never matched and this page rendered "Not
 * found" for *every* game while still answering 200 — the landing pages that
 * exist for link unfurls were dead for the whole catalogue and the status code
 * hid it. Both handlers await now.
 */
export async function generateMetadata({params}:{params:Promise<{id:string}>}): Promise<Metadata> {
  const { id } = await params
  const g = games.find(x=> x.id===id)
  // A real 404 (see below) still gets rendered HTML, so say noindex explicitly.
  if(!g) return { title: 'Game not found — GG Lounge', robots: { index: false, follow: false } }
  const base = canonicalOrigin()
  return {
    title: `${g.title} — Play on GG Lounge`,
    description: g.description,
    openGraph: {
      title: g.title,
      description: g.description,
      images: [base + (g.icon||'')],
      type: 'website',
      url: base + '/g/' + g.id
    },
    twitter: { card: 'summary_large_image', title: g.title, description: g.description, images: [base + (g.icon||'')] }
  }
}
export default async function Page({params}:{params:Promise<{id:string}>}){
  const { id } = await params
  const g = games.find(x=> x.id===id)
  // Unknown ids answer a real 404 instead of a 200 with a sad message.
  if(!g) notFound()
  const base = canonicalOrigin()
  const jsonLd = {
    '@context':'https://schema.org',
    '@type':'VideoGame',
    name: g.title,
    description: g.description,
    genre: g.genre,
    image: base + (g.icon || ''),
    url: base + '/g/' + g.id,
    applicationCategory: 'Game',
    operatingSystem: 'Web Browser',
    offers: { '@type':'Offer', price:'0', priceCurrency:'USD', availability:'https://schema.org/InStock' },
    author: { '@type':'Organization', name: 'GG-Lounge Studios' }
  }
  return (
    <main style={{maxWidth:720, margin:'40px auto', padding:'0 20px', fontFamily:'system-ui'}}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd)}} />
      <p style={{fontSize:12, letterSpacing:'.12em', color:'#6b7280'}}>GG-LOUNGE • {g.genre.toUpperCase()} / {g.tone.toUpperCase()}</p>
      <h1 style={{fontSize:36, letterSpacing:'-.03em', margin:'8px 0'}}>{g.title}</h1>
      <p style={{color:'#4b5563', lineHeight:1.6}}>{g.description} — {g.subtitle}</p>
      {g.icon && <img src={g.icon} alt="" style={{width:'100%', maxWidth:480, aspectRatio:'1', objectFit:'cover', borderRadius:16, border:'1px solid #e5e7eb', marginTop:16}} />}
      <div style={{marginTop:20, display:'flex', gap:12}}>
        <Link href={`/?play=${encodeURIComponent(g.id)}`} style={{padding:'12px 20px', borderRadius:999, background:'#d7f34a', color:'#0b0d12', fontWeight:900, textDecoration:'none'}}>Play {g.title}</Link>
        <Link href="/" style={{padding:'12px 20px', borderRadius:999, border:'1px solid #e5e7eb', fontWeight:700, textDecoration:'none', color:'#111'}}>Back to lounge</Link>
      </div>
      <p style={{marginTop:16, fontSize:12, color:'#6b7280'}}>This page is crawlable SEO landing for {g.title}. Play starts in the lounge modal.</p>
    </main>
  )
}
