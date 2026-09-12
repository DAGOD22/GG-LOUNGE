'use client'
import { useEffect, useState, useRef } from 'react'
import { Shield, Zap, Eye, EyeOff, Lock, Unlock, Terminal, Cpu, Globe, AlertTriangle, Ban, Clock, Skull, Activity } from 'lucide-react'

export default function GatePage(){
  const [pw, setPw] = useState('')
  const [show, setShow] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [banned, setBanned] = useState<{ until: string | null, left: number } | null>(null)
  const [glitch, setGlitch] = useState(false)
  const [typed, setTyped] = useState('')
  const fullTitle = 'GG-LOUNGE // NEURAL GATE'
  const inputRef = useRef<HTMLInputElement>(null)
  const [caps, setCaps] = useState(false)

  // typewriter for title
  useEffect(()=>{
    let i=0
    const id=setInterval(()=>{
      setTyped(fullTitle.slice(0,i+1))
      i++
      if(i>fullTitle.length) clearInterval(id)
    }, 45)
    return ()=> clearInterval(id)
  },[])

  // check if already banned via gate status
  useEffect(()=>{
    fetch('/api/gate', { cache:'no-store' }).then(r=> r.json()).then((d:any)=>{
      if(d?.banned && d?.gateBanned){
        const until = d.expiresAt || null
        const left = until ? Math.max(0, Math.ceil((new Date(until).getTime() - Date.now())/1000)) : 86400*365
        setBanned({ until, left })
      }
    }).catch(()=>{})
    // focus
    setTimeout(()=> inputRef.current?.focus(), 400)
  },[])

  // banned countdown
  useEffect(()=>{
    if(!banned) return
    const id=setInterval(()=>{
      setBanned(b=>{
        if(!b) return b
        const left = b.until ? Math.max(0, Math.ceil((new Date(b.until).getTime() - Date.now())/1000)) : 0
        if(left<=0 && b.until) { location.reload() }
        return { ...b, left }
      })
    },1000)
    return ()=> clearInterval(id)
  },[banned])

  function formatLeft(s:number){
    if(s >= 86400*365) return 'PERMANENT'
    if(s >= 86400) return `${Math.ceil(s/86400)}d ${Math.ceil((s%86400)/3600)}h`
    if(s >= 3600) return `${Math.floor(s/3600)}h ${Math.floor((s%3600)/60)}m`
    if(s >= 60) return `${Math.floor(s/60)}m ${s%60}s`
    return `${s}s`
  }

  async function submit(e?: React.FormEvent){
    e?.preventDefault()
    if(!pw.trim() || loading || banned) return
    setLoading(true); setErr(null); setGlitch(false)
    try{
      const r = await fetch('/api/gate/verify', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ password: pw }) })
      const d = await r.json().catch(()=> ({}))
      if(r.ok && d.ok){
        // success — glitch to unlock
        setErr(null)
        document.documentElement.style.setProperty('--gate-flash', '#22c55e')
        // redirect to next param or /
        const params = new URLSearchParams(window.location.search)
        const next = params.get('next') || '/'
        // small god animation then go
        setTimeout(()=> { window.location.href = next }, 650)
        return
      }
      if(d.banned){
        const until = d.expiresAt || null
        const left = d.retryAfter || (until ? Math.ceil((new Date(until).getTime()-Date.now())/1000) : 60)
        setBanned({ until, left })
        setErr(null)
        setGlitch(true); setTimeout(()=> setGlitch(false), 600)
        return
      }
      // wrong
      setErr('ACCESS DENIED // INVALID PHRASE')
      setGlitch(true); setTimeout(()=> setGlitch(false), 520)
      // shake
      if(navigator.vibrate) navigator.vibrate(120)
    } catch{
      setErr('NODE ERROR // TRY AGAIN')
      setGlitch(true)
    } finally{
      setLoading(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if(e.getModifierState('CapsLock')) setCaps(true); else setCaps(false)
    if(e.key === 'Enter') submit()
  }
  const onKeyUp = (e: React.KeyboardEvent) => setCaps(e.getModifierState('CapsLock'))

  return (
    <main style={{ minHeight:'100vh', background:'#05070a', color:'#e6f1ff', position:'relative', overflow:'hidden', display:'grid', placeItems:'center', padding:16, fontFamily:'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&family=Orbitron:wght@700;900&display=swap');
        @keyframes glitch-1 { 0% { transform: translate(0) } 20% { transform: translate(-2px,1px) } 40% { transform: translate(-1px,-1px) } 60% { transform: translate(2px,1px) } 80% { transform: translate(1px,-1px) } 100% { transform: translate(0) } }
        @keyframes glitch-2 { 0% { clip-path: inset(0 0 0 0) } 20% { clip-path: inset(20% 0 40% 0) } 40% { clip-path: inset(60% 0 10% 0) } 60% { clip-path: inset(10% 0 70% 0) } 80% { clip-path: inset(40% 0 30% 0) } 100% { clip-path: inset(0 0 0 0) } }
        @keyframes scan { 0% { transform: translateY(-100%) } 100% { transform: translateY(100%) } }
        @keyframes flicker { 0%,19%,21%,23%,25%,54%,56%,100% { opacity:1 } 20%,24%,55% { opacity:.45 } }
        @keyframes gridMove { 0% { background-position: 0 0 } 100% { background-position: 0 40px } }
        @keyframes pulse { 0%,100% { box-shadow: 0 0 20px rgba(34,197,94,.35), 0 0 60px rgba(34,197,94,.15) } 50% { box-shadow: 0 0 30px rgba(34,197,94,.6), 0 0 90px rgba(34,197,94,.25) } }
        .gate-shell { width:min(560px, 100%); position:relative; z-index:2; }
        .gate-card { position:relative; background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.02)); border:1px solid rgba(34,197,94,.28); border-radius:18px; overflow:hidden; backdrop-filter: blur(16px); box-shadow: 0 20px 80px rgba(0,0,0,.65), 0 0 0 1px rgba(34,197,94,.12) inset; }
        .gate-card.glitch { animation: glitch-1 .32s steps(2,end) }
        .gate-top { height:36px; display:flex; align-items:center; justify-content:space-between; padding:0 14px; background: rgba(0,0,0,.45); border-bottom:1px solid rgba(34,197,94,.18); font-size:11px; letter-spacing:.14em; font-weight:800; color: #22c55e }
        .gate-grid { position:absolute; inset:0; z-index:0; opacity:.22; background-image: linear-gradient(rgba(34,197,94,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,.09) 1px, transparent 1px); background-size:40px 40px; animation: gridMove 4s linear infinite; pointer-events:none; }
        .scanline { position:absolute; left:0; right:0; height:2px; background: linear-gradient(90deg, transparent, rgba(34,197,94,.85), transparent); opacity:.55; animation: scan 3.2s linear infinite; pointer-events:none; z-index:1; }
        .noise { position:absolute; inset:0; opacity:.035; pointer-events:none; background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 140 140' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E"); }
        .glitch-title { font-family: Orbitron, JetBrains Mono, monospace; font-weight:900; font-size:clamp(18px, 4vw, 22px); letter-spacing:.06em; line-height:1; position:relative; display:inline-block; }
        .glitch-title::before, .glitch-title::after { content: attr(data-text); position:absolute; left:0; top:0; width:100%; overflow:hidden; pointer-events:none; }
        .glitch-title::before { color:#ff0033; clip-path: inset(0 0 50% 0); transform: translate(-1px,0); opacity:.7; animation: glitch-2 2s infinite linear alternate-reverse; }
        .glitch-title::after { color:#00e5ff; clip-path: inset(50% 0 0 0); transform: translate(1px,0); opacity:.7; animation: glitch-2 2.2s infinite linear alternate-reverse; }
        .kbd { font-size:10px; padding:2px 6px; border-radius:6px; border:1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.06); color:#a7f3d0; }
      `}</style>

      {/* bg */}
      <div className="gate-grid" />
      <div className="scanline" />
      <div className="noise" />
      {/* ambient orbs */}
      <div style={{ position:'absolute', width:600, height:600, left:'-10%', top:'-18%', background:'radial-gradient(400px 300px at 40% 30%, rgba(34,197,94,.18), transparent 70%)', pointerEvents:'none', filter:'blur(2px)' }} />
      <div style={{ position:'absolute', width:700, height:700, right:'-12%', bottom:'-20%', background:'radial-gradient(500px 400px at 70% 60%, rgba(124,92,255,.16), transparent 70%)', pointerEvents:'none' }} />

      <div className="gate-shell">
        {/* header badge */}
        <div style={{ display:'flex', justifyContent:'center', marginBottom:14 }}>
          <span style={{ display:'inline-flex', alignItems:'center', gap:8, padding:'6px 12px', borderRadius:999, background:'rgba(0,0,0,.5)', border:'1px solid rgba(34,197,94,.25)', color:'#22c55e', fontSize:11, fontWeight:900, letterSpacing:'.12em', backdropFilter:'blur(8px)' }}>
            <Activity size={12} className="animate-pulse" /> KAI CORE // VERIFICATION LAYER
            <span style={{ width:7, height:7, borderRadius:999, background:'#22c55e', boxShadow:'0 0 10px #22c55e' }} />
            ONLINE
          </span>
        </div>

        <div className={`gate-card ${glitch ? 'glitch' : ''}`}>
          <div className="gate-top">
            <span style={{ display:'flex', alignItems:'center', gap:8 }}><Terminal size={14}/> NODE: GG-LOUNGE-01</span>
            <span style={{ display:'flex', alignItems:'center', gap:6, opacity:.8 }}><Cpu size={12}/> SECURE GATE</span>
          </div>

          <div style={{ padding:22, position:'relative' }}>
            {/* title */}
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:6 }}>
              <span style={{ width:44, height:44, borderRadius:12, background:'linear-gradient(135deg,#22c55e,#16a34a)', color:'#00100a', display:'grid', placeItems:'center', boxShadow:'0 8px 24px rgba(34,197,94,.45)', animation:'pulse 2s infinite' }}><Shield size={20}/></span>
              <div>
                <div className="glitch-title" data-text={typed}>{typed}<span style={{ opacity:.6, fontWeight:400 }} className="animate-pulse">_</span></div>
                <div style={{ fontSize:11, letterSpacing:'.16em', color:'#6ee7b7', fontWeight:800, marginTop:2, display:'flex', gap:8, alignItems:'center' }}>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><Lock size={10}/> VOID-LOCK v2.1</span>
                  <span style={{ opacity:.35 }}>•</span>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:4 }}><Clock size={10}/> 3H SESSION</span>
                </div>
              </div>
            </div>

            <p style={{ margin:'10px 0 14px', color:'#a7f3d0', fontSize:12, lineHeight:1.6, opacity:.9 }}>
              This lounge is sealed. Enter the <span style={{ color:'#fff', background:'rgba(34,197,94,.18)', padding:'1px 6px', borderRadius:6, border:'1px solid rgba(34,197,94,.3)' }}>access phrase</span> to decrypt. Your device stays unlocked for <b style={{ color:'#fff' }}>3 hours</b>. No phrase is ever sent in plain text — verification happens server-side.
            </p>

            {banned ? (
              <div style={{ padding:16, borderRadius:14, background:'linear-gradient(135deg, rgba(239,68,68,.14), rgba(239,68,68,.06))', border:'1px solid rgba(239,68,68,.35)', boxShadow:'0 10px 40px rgba(239,68,68,.18)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, color:'#fecaca', fontWeight:900, fontSize:13, letterSpacing:'.04em' }}>
                  <span style={{ width:36, height:36, borderRadius:999, background:'#ef4444', color:'#fff', display:'grid', placeItems:'center' }}><Ban size={16}/></span>
                  SIGNAL JAMMED // NODE LOCKED
                  <span style={{ marginLeft:'auto', display:'inline-flex', alignItems:'center', gap:6, padding:'4px 8px', borderRadius:999, background:'rgba(0,0,0,.35)', border:'1px solid rgba(239,68,68,.3)', fontSize:11 }}><Skull size={12}/> KAI PROTOCOL</span>
                </div>
                <div style={{ marginTop:10, display:'grid', gridTemplateColumns:'1fr auto', gap:12, alignItems:'center' }}>
                  <div style={{ height:10, borderRadius:999, background:'rgba(0,0,0,.45)', border:'1px solid rgba(239,68,68,.2)', overflow:'hidden' }}>
                    <div style={{ height:'100%', width:'100%', background:'repeating-linear-gradient(90deg, #ef4444 0 10px, #991b1b 10px 20px)', opacity:.9, animation:'gridMove 1s linear infinite' }} />
                  </div>
                  <span style={{ fontSize:11, fontWeight:900, padding:'4px 8px', borderRadius:999, background:'#0b0d12', color:'#fecaca', border:'1px solid rgba(239,68,68,.3)' }}>{formatLeft(banned.left)}</span>
                </div>
                <p style={{ margin:'10px 0 0', color:'#fecaca', fontSize:11, lineHeight:1.5, opacity:.9 }}>
                  Too many invalid phrases. Your IP is temporarily jammed. This is escalating — don’t brute force the void. Retry after the timer.
                </p>
                <div style={{ marginTop:10, display:'flex', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:10, padding:'4px 8px', borderRadius:999, background:'rgba(0,0,0,.35)', border:'1px solid rgba(255,255,255,.1)', color:'#fecaca' }}><AlertTriangle size={10}/> 3 fails = lockout</span>
                  <span style={{ fontSize:10, padding:'4px 8px', borderRadius:999, background:'rgba(0,0,0,.35)', border:'1px solid rgba(255,255,255,.1)', color:'#fff', opacity:.7 }}>Escalation hidden</span>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} style={{ display:'grid', gap:10 }}>
                <label style={{ display:'grid', gap:6, fontSize:11, fontWeight:800, letterSpacing:'.1em', color:'#6ee7b7' }}>
                  ACCESS PHRASE
                  <span style={{ position:'relative', display:'flex', alignItems:'center' }}>
                    <Lock size={14} style={{ position:'absolute', left:12, color: glitch ? '#ef4444' : '#22c55e', opacity:.9 }} />
                    <input
                      ref={inputRef}
                      value={pw}
                      onChange={e=> setPw(e.target.value)}
                      onKeyDown={onKeyDown}
                      onKeyUp={onKeyUp}
                      type={show ? 'text' : 'password'}
                      placeholder="•••••••••••••••••••••"
                      autoComplete="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      style={{ width:'100%', padding:'13px 42px 13px 36px', borderRadius:12, background: glitch ? 'rgba(239,68,68,.08)' : 'rgba(0,0,0,.5)', border: glitch ? '1px solid rgba(239,68,68,.45)' : '1px solid rgba(34,197,94,.35)', color:'#eafff3', outline:'none', fontSize:14, fontWeight:700, letterSpacing:'.02em', boxShadow: glitch ? '0 0 0 3px rgba(239,68,68,.15)' : '0 0 0 3px rgba(34,197,94,.08)', transition:'all .18s' }}
                    />
                    <button type="button" onClick={()=> setShow(v=>!v)} style={{ position:'absolute', right:10, width:28, height:28, display:'grid', placeItems:'center', borderRadius:8, border:'1px solid rgba(255,255,255,.1)', background:'rgba(255,255,255,.06)', color:'#a7f3d0', cursor:'pointer' }}>
                      {show ? <EyeOff size={14}/> : <Eye size={14}/>}
                    </button>
                  </span>
                  {caps && <span style={{ fontSize:10, color:'#fbbf24', display:'flex', alignItems:'center', gap:4 }}><AlertTriangle size={10}/> Caps Lock on</span>}
                </label>

                {err && (
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 12px', borderRadius:12, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', color:'#fecaca', fontSize:12, fontWeight:800, letterSpacing:'.02em', animation:'flicker .4s' }}>
                    <AlertTriangle size={14}/> {err}
                  </div>
                )}

                <button type="submit" disabled={loading || !pw.trim()} style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:10, padding:'13px 16px', borderRadius:12, background: loading || !pw.trim() ? 'rgba(34,197,94,.25)' : 'linear-gradient(135deg,#22c55e,#16a34a)', color: loading || !pw.trim() ? 'rgba(255,255,255,.6)' : '#00100a', border:'1px solid rgba(34,197,94,.5)', fontWeight:900, fontSize:13, letterSpacing:'.06em', cursor: loading || !pw.trim() ? 'not-allowed' : 'pointer', boxShadow: '0 10px 30px rgba(34,197,94,.3)', transition:'all .18s' }}>
                  {loading ? <><span style={{ width:14, height:14, borderRadius:999, border:'2px solid rgba(0,0,0,.2)', borderTopColor:'#00100a', display:'inline-block', animation:'spin 1s linear infinite' }} /> DECRYPTING…</> : <><Zap size={16}/> DECRYPT // UNLOCK 3H <Unlock size={14}/></>}
                </button>

                <div style={{ display:'flex', gap:6, flexWrap:'wrap', justifyContent:'center', marginTop:2 }}>
                  <span className="kbd"><Shield size={10}/> HMAC-SIGNED</span>
                  <span className="kbd"><Globe size={10}/> 3H DEVICE KEY</span>
                  <span className="kbd"><Cpu size={10}/> NO FRONTEND SECRET</span>
                </div>
              </form>
            )}

            <div style={{ marginTop:14, display:'flex', justifyContent:'space-between', gap:10, flexWrap:'wrap', fontSize:10, letterSpacing:'.12em', color:'rgba(167,243,208,.6)', fontWeight:800 }}>
              <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}><Activity size={10}/> KAI PROTOCOL • VER 01</span>
              <span style={{ opacity:.5 }}>SECURE TUNNEL • SAME-ORIGIN • ENCRYPTED</span>
            </div>
          </div>

          {/* bottom bar */}
          <div style={{ height:3, background:'linear-gradient(90deg, #22c55e, #06b6d4, #7c3aed, #22c55e)', backgroundSize:'200% 100%', animation:'gridMove 3s linear infinite', opacity:.9 }} />
        </div>

        <p style={{ textAlign:'center', marginTop:10, fontSize:10, letterSpacing:'.14em', color:'rgba(167,243,208,.45)', fontWeight:800 }}>
          GG-LOUNGE™ // VOID-LOCK • ENCRYPTED
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </main>
  )
}
