'use client'
import { useEffect, useState } from 'react'
import { Ban, Clock, Skull, Activity, ShieldAlert } from 'lucide-react'

export default function BannedPage(){
  const [gate, setGate] = useState<{ banned:boolean, expiresAt:string|null, left:number } | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(()=>{
    fetch('/api/gate', { cache:'no-store' }).then(r=> r.json()).then((d:any)=>{
      if(d?.banned){
        const until = d.expiresAt || null
        const left = until ? Math.max(0, Math.ceil((new Date(until).getTime() - Date.now())/1000)) : 86400*365
        // check if gate-banned (reason gate or gateBanned flag)
        if(d.gateBanned || (d.reason && String(d.reason).includes('gate'))){
          setGate({ banned:true, expiresAt: until, left })
        }
      }
      setLoaded(true)
    }).catch(()=> setLoaded(true))
  },[])
  useEffect(()=>{
    if(!gate) return
    const id=setInterval(()=>{
      setGate(g=>{
        if(!g) return g
        const left = g.expiresAt ? Math.max(0, Math.ceil((new Date(g.expiresAt).getTime() - Date.now())/1000)) : 0
        if(left<=0 && g.expiresAt) location.reload()
        return { ...g, left }
      })
    },1000)
    return ()=> clearInterval(id)
  },[gate])

  function fmt(s:number){
    if(s >= 86400*365) return 'PERMANENT'
    if(s >= 86400) return `${Math.ceil(s/86400)}d`
    if(s >= 3600) return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
    if(s >= 60) return `${Math.floor(s/60)}m ${s%60}s`
    return `${s}s`
  }

  if(gate?.banned){
    const isPerm = !gate.expiresAt || gate.left >= 86400*365
    return (
      <main style={{ minHeight:'100vh', background:'#05070a', color:'#fecaca', display:'grid', placeItems:'center', padding:20, fontFamily:'ui-monospace, monospace' }}>
        <style>{`@keyframes flicker{0%,19%,21%,23%,25%,54%,56%,100%{opacity:1}20%,24%,55%{opacity:.45}} @keyframes scan{0%{transform:translateY(-100%)}100%{transform:translateY(100%)}}`}</style>
        <div style={{ position:'absolute', inset:0, opacity:.08, backgroundImage:'linear-gradient(rgba(239,68,68,.15) 1px, transparent 1px), linear-gradient(90deg, rgba(239,68,68,.1) 1px, transparent 1px)', backgroundSize:'40px 40px' }} />
        <div style={{ width:'min(560px,100%)', background:'linear-gradient(180deg, rgba(239,68,68,.12), rgba(0,0,0,.5))', border:'1px solid rgba(239,68,68,.35)', borderRadius:18, overflow:'hidden', backdropFilter:'blur(16px)', boxShadow:'0 20px 80px rgba(0,0,0,.6)', position:'relative' }}>
          <div style={{ height:3, background:'repeating-linear-gradient(90deg, #ef4444 0 12px, #991b1b 12px 24px)', animation:'scan 1s linear infinite' }} />
          <div style={{ padding:22 }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
              <span style={{ width:44, height:44, borderRadius:12, background:'#ef4444', color:'#fff', display:'grid', placeItems:'center' }}><Ban size={20}/></span>
              <div>
                <div style={{ fontFamily:'Orbitron, monospace', fontWeight:900, letterSpacing:'.06em', display:'flex', gap:8, alignItems:'center' }}><Skull size={16}/> SIGNAL JAMMED // NODE LOCKED <span style={{ fontSize:10, padding:'3px 7px', borderRadius:999, background:'#000', border:'1px solid rgba(239,68,68,.3)', color:'#fecaca' }}>KAI PROTOCOL</span></div>
                <div style={{ fontSize:11, letterSpacing:'.12em', color:'#fca5a5', fontWeight:800, marginTop:2, display:'flex', gap:6, alignItems:'center' }}><Clock size={10}/> GATE LOCKOUT • ESCALATING • {isPerm ? 'PERMANENT' : fmt(gate.left)+' LEFT'}</div>
              </div>
            </div>
            <div style={{ height:10, borderRadius:999, background:'rgba(0,0,0,.5)', border:'1px solid rgba(239,68,68,.2)', overflow:'hidden', marginTop:12 }}>
              <div style={{ height:'100%', width:'100%', background:'repeating-linear-gradient(90deg, #ef4444 0 10px, #7f1d1d 10px 20px)', opacity:.85 }} />
            </div>
            <p style={{ margin:'12px 0 0', color:'#fecaca', fontSize:12, lineHeight:1.6, opacity:.9 }}>
              Too many invalid access phrases. Your IP is jammed. This escalates silently each time you fail 3 times — you’ll only learn the schedule by triggering it.
            </p>
            <div style={{ marginTop:12, display:'flex', gap:8, flexWrap:'wrap', fontSize:11, fontWeight:800 }}>
              <span style={{ padding:'6px 10px', borderRadius:999, background:'rgba(0,0,0,.4)', border:'1px solid rgba(239,68,68,.3)', color:'#fecaca', display:'inline-flex', gap:6, alignItems:'center' }}><Activity size={12}/> {isPerm ? 'PERMANENTLY LOCKED' : `RETRY IN ${fmt(gate.left)}`}</span>
              <span style={{ padding:'6px 10px', borderRadius:999, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.1)', color:'#fff', opacity:.7 }}>1m → 5m → 10m → 30m → 60m → 120m → 1d → 3d → 7d → 30d → ∞</span>
            </div>
            {!isPerm && <p style={{ marginTop:10, fontSize:10, color:'rgba(254,202,202,.6)', letterSpacing:'.08em' }}>Timer auto-reloads on expiry. Don’t brute-force the void.</p>}
          </div>
        </div>
      </main>
    )
  }

  // default admin ban fallback (loading or not gate)
  return (
    <main className="admin-shell">
      <section className="admin-login">
        <div className="admin-lock" style={{ background: loaded && gate?.banned ? '#ef4444' : undefined }}>
          <Ban />
        </div>
        <p className="eyebrow">GG-LOUNGE™ / MODERATION</p>
        <h1>You’re banned.</h1>
        <p>This visitor was blocked by a lounge admin. If you think this is a mistake, talk to the admin who runs this lounge.</p>
        <a className="admin-back" href="/gate">Back to gate</a>
      </section>
    </main>
  )
}
