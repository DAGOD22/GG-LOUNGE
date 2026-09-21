import type { Metadata } from 'next'
import { games } from '@/lib/games'
import Link from 'next/link'

export function generateStaticParams(){
  return games.map(g=> ({ id: g.id }))
}
export function generateMetadata({params}:{params:{id:string}}): Metadata {
  const g = games.find(x=> x.id===params.id)
  if(!g) return { title: 'Game not found — GG Lounge' }
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://gg-lounge.vercel.app'
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
export default function Page({params}:{params:{id:string}}){
  const g = games.find(x=> x.id===params.id)
  if(!g) return <main style={{padding:40}}>Not found — <Link href="/">Go home</Link></main>
  const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://gg-lounge.vercel.app'
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
