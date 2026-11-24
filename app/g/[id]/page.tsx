import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { games } from '@/lib/games'
import { canonicalOrigin } from '@/lib/site-domains'
import { sessionLabel } from '@/lib/site-kit'
import { ReadingTime } from '@/components/SiteTools'
import { estimatedSessionMinutes, similarGames, whyThisGame } from '@/lib/site-extras'
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
  if(!g) return { title: 'Game not found', robots: { index: false, follow: false } }
  const base = canonicalOrigin()
  return {
    // No brand suffix: the layout template adds it, and adding it twice
    // produced "Slope — Play on GG Lounge | GG-Lounge" in search results.
    title: `${g.title} — Play Free Online`,
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
      <p style={{color:'#4b5563', lineHeight:1.6}}>
        {g.description} — {g.subtitle} <ReadingTime text={`${g.description} ${g.subtitle}`} />
      </p>
      {/* Two honest facts a landing page should carry: how long a go lasts, and
          a one-line reason this title is here at all. Both come from the same
          helpers the lobby uses, so the two pages cannot disagree. */}
      <p style={{color:'#6b7280', fontSize:13, fontWeight:600, margin:'4px 0 0'}}>
        A typical go lasts {sessionLabel(estimatedSessionMinutes(g.genre))}. {whyThisGame(g, { playCount: 0 })}.
      </p>
      {g.icon && <img src={g.icon} alt="" style={{width:'100%', maxWidth:480, aspectRatio:'1', objectFit:'cover', borderRadius:16, border:'1px solid #e5e7eb', marginTop:16}} />}
      <div style={{marginTop:20, display:'flex', gap:12}}>
        <Link href={`/?play=${encodeURIComponent(g.id)}`} style={{padding:'12px 20px', borderRadius:999, background:'#d7f34a', color:'#0b0d12', fontWeight:900, textDecoration:'none'}}>Play {g.title}</Link>
        <Link href="/" style={{padding:'12px 20px', borderRadius:999, border:'1px solid #e5e7eb', fontWeight:700, textDecoration:'none', color:'#111'}}>Back to lounge</Link>
      </div>
      {/* Internal links out of a dead-end landing page. Crawlers use these to
          discover the rest of the catalogue; visitors use them to keep playing. */}
      <nav aria-label="More games" style={{marginTop:26, borderTop:'1px solid #e5e7eb', paddingTop:16}}>
        <p style={{fontSize:11, letterSpacing:'.12em', color:'#6b7280', margin:'0 0 8px'}}>MORE {g.genre.toUpperCase()} GAMES</p>
        <ul style={{listStyle:'none', padding:0, margin:0, display:'flex', flexWrap:'wrap', gap:8}}>
          {similarGames(games, g, 6).map(other => (
            <li key={other.id}>
              <Link href={`/g/${other.id}`} style={{display:'inline-block', padding:'7px 13px', borderRadius:999, border:'1px solid #e5e7eb', color:'#111', fontSize:13, fontWeight:700, textDecoration:'none'}}>
                {other.title}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </main>
  )
}
