'use client';

import { useEffect, useState } from 'react';
import { Send, Upload, Sparkles, Gamepad2, ShieldCheck, Clock, CheckCircle2, AlertCircle, Image as ImageIcon, FileCode, ArrowRight, Trophy, MessageSquare, ThumbsUp, Star, Zap, Users } from 'lucide-react';
import { readFileAsDataUrl, uploadGameHtml } from '@/lib/upload-client';

type ReqRow = { id:string; title:string; votes:number; status:string; createdAt:string }

export default function RequestGame() {
  const [title, setTitle] = useState('');
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [htmlFile, setHtmlFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'ok'|'err'|''>('');
  const [recent, setRecent] = useState<ReqRow[]>([])
  const [filter, setFilter] = useState<'all'|'pending'|'approved'>('all')
  const [iconPreview, setIconPreview] = useState<string | null>(null)

  useEffect(()=>{
    fetch('/api/game-requests').then(r=> r.ok? r.json(): null).then((d:any)=>{
      if(d?.requests) setRecent(d.requests.slice(0,12).map((x:any)=> ({ id:String(x.id), title:x.title||x.game||'Unknown', votes:Number(x.votes||1), status:x.status||'pending', createdAt:x.createdAt||new Date().toISOString()})))
    }).catch(()=>{})
  },[])

  useEffect(()=>{
    if(!iconFile) { setIconPreview(null); return }
    const url = URL.createObjectURL(iconFile)
    setIconPreview(url)
    return ()=> URL.revokeObjectURL(url)
  },[iconFile])

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(''); setMessageType('')
    if (!title.trim() || !htmlFile) {
      setMessage('Give the game a title and choose its index.html file.');
      setMessageType('err')
      return;
    }
    setProgress({ done: 0, total: 1 });
    let icon: string | null = null;
    try {
      if (iconFile) icon = await readFileAsDataUrl(iconFile, 300 * 1024);
    } catch (err) {
      setProgress(null);
      setMessage(err instanceof Error ? err.message : 'Bad icon file.');
      setMessageType('err')
      return;
    }
    const result = await uploadGameHtml(
      htmlFile,
      { kind: 'request', title: title.trim(), icon },
      (done, total) => setProgress({ done, total }),
    );
    setProgress(null);
    if (!result.ok) {
      setMessage(result.error || 'Request failed. Try again.');
      setMessageType('err')
      return;
    }
    setTitle('');
    setIconFile(null);
    setHtmlFile(null);
    setIconPreview(null);
    ;(document.getElementById('request-form') as HTMLFormElement | null)?.reset();
    setMessage('Request submitted for admin review. Approved games are published permanently and you’ll see them in Library → Community.');
    setMessageType('ok')
    // refresh recent
    fetch('/api/game-requests').then(r=> r.ok? r.json(): null).then((d:any)=>{
      if(d?.requests) setRecent(d.requests.slice(0,12).map((x:any)=> ({ id:String(x.id), title:x.title||x.game||'Unknown', votes:Number(x.votes||1), status:x.status||'pending', createdAt:x.createdAt||new Date().toISOString()})))
    }).catch(()=>{})
  }

  const shown = recent.filter(r=> filter==='all' || r.status===filter)

  return (
    <main className="lounge-shell">
      <div className="noise" aria-hidden="true" />
      <header className="site-header">
        <a href="/" className="brand"><span className="brand-mark"><Gamepad2 size={19}/></span><span>GG-LOUNGE<span className="tm">™</span></span></a>
        <nav className="header-nav">
          <a href="/">Library</a>
          <a href="/apps">Apps</a>
          <a href="/proxy">Proxy</a>
          <a href="/request-game" style={{color:'var(--lime)',textDecoration:'underline',textUnderlineOffset:6}}>Request</a>
          <a href="/admin">Admin</a>
        </nav>
        <div className="header-status"><span className="live-dot"/>{recent.length} requests</div>
      </header>

      {/* Hero */}
      <section className="hero" id="top" style={{minHeight:420, paddingBottom:24}}>
        <div className="hero-copy">
          <p className="eyebrow" style={{background:'rgba(125,107,255,.12)', border:'1px solid rgba(125,107,255,.22)', padding:'6px 10px', borderRadius:999, display:'inline-flex'}}><MessageSquare size={14}/> COMMUNITY REQUESTS</p>
          <h1>Request<br/><em>a game.</em></h1>
          <p className="hero-text" style={{maxWidth:460}}>Have a self-contained <strong>index.html</strong> game? Upload it. Big files (up to 50MB) are chunked automatically — we publish approved games permanently to the lounge.</p>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:16}}>
            <a href="#form" className="hero-link" style={{background:'var(--violet)', color:'#fff', padding:'10px 18px', borderRadius:999, border:0, fontWeight:900, textDecoration:'none', display:'inline-flex', alignItems:'center', gap:8}}>Start request <ArrowRight size={14}/></a>
            <span style={{display:'inline-flex',alignItems:'center',gap:8, padding:'10px 14px', borderRadius:999, border:'1px solid var(--line)', background:'rgba(255,255,255,.06)', fontSize:12, fontWeight:700}}><ShieldCheck size={14} color="var(--lime)"/> Reviewed by admin • no spam</span>
          </div>
          <div className="hero-stats" style={{marginTop:26}}>
            <span><strong>{recent.length}</strong> total requests</span>
            <span><strong>{recent.filter(r=> r.status==='pending').length}</strong> pending</span>
            <span><strong>∞</strong> slots</span>
          </div>
        </div>
        <div className="spotlight" style={{background:'linear-gradient(145deg, rgba(125,107,255,.22), rgba(215,243,74,.16) 60%, rgba(255,108,131,.14)), #151821'}}>
          <div className="spotlight-top"><span style={{display:'flex',alignItems:'center',gap:6}}><Trophy size={12}/> HOW IT WORKS</span><span className="spotlight-tag" style={{background:'var(--violet)', color:'#fff'}}>3 STEPS</span></div>
          <div style={{display:'grid', gap:12, padding:'10px 0'}}>
            {[
              {n:'1', t:'Upload index.html', d:'Self-contained file, all assets inlined or relative.'},
              {n:'2', t:'Admin review', d:'We check for safety & quality — usually < 24h.'},
              {n:'3', t:'Goes live', d:'Approved games appear in Library → Community.'},
            ].map(s=> (
              <div key={s.n} style={{display:'flex',gap:12, alignItems:'center', padding:'12px 14px', borderRadius:14, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.08)'}}>
                <span style={{width:32, height:32, borderRadius:999, background:'var(--lime)', color:'#0b0d12', display:'grid', placeItems:'center', fontWeight:900, flexShrink:0}}>{s.n}</span>
                <div><strong style={{fontSize:13}}>{s.t}</strong><p style={{margin:'2px 0 0', fontSize:12, opacity:.7}}>{s.d}</p></div>
                <Clock size={14} style={{marginLeft:'auto', opacity:.4}}/>
              </div>
            ))}
          </div>
          <div className="spotlight-bottom" style={{marginTop:6}}><div><p className="card-kicker" style={{color:'var(--violet)'}}>TIP</p><p style={{fontSize:12, opacity:.8}}>Add a small icon (512×512) — it will be your game’s cover. Big HTML? We auto-chunk it.</p></div><span style={{width:44, height:44, borderRadius:999, background:'var(--violet)', color:'#fff', display:'grid', placeItems:'center'}}><Upload size={18}/></span></div>
        </div>
      </section>

      <section className="catalog" id="form" style={{paddingTop:16}}>
        <div style={{display:'grid', gridTemplateColumns:'1.1fr .9fr', gap:18, alignItems:'start'}}>
          {/* Form */}
          <section className="admin-panel" style={{padding:22, borderRadius:20, background:'linear-gradient(180deg, rgba(255,255,255,.04), rgba(255,255,255,.02))'}}>
            <div className="panel-heading" style={{marginBottom:14}}>
              <span className="panel-icon" style={{background:'rgba(125,107,255,.16)', color:'var(--violet)'}}><FileCode size={18}/></span>
              <div><h2 style={{fontSize:20}}>Submit your game</h2><p>Title + icon + index.html — we handle the rest.</p></div>
              <span style={{marginLeft:'auto', fontSize:11, padding:'5px 10px', borderRadius:999, background:'rgba(215,243,74,.14)', border:'1px solid rgba(215,243,74,.3)', fontWeight:800}}>50MB max</span>
            </div>

            <form id="request-form" onSubmit={submit} style={{display:'grid', gap:14}}>
              <div>
                <label htmlFor="title" style={{display:'flex',alignItems:'center',gap:6, marginBottom:6}}><Star size={12}/> Game title <span style={{opacity:.5, fontWeight:400, textTransform:'none', letterSpacing:0}}>(max 80)</span></label>
                <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={80} placeholder="My Awesome Game" style={{padding:'14px 16px', borderRadius:14, fontSize:15}} />
                <div style={{fontSize:11, opacity:.5, marginTop:6, display:'flex', justifyContent:'space-between'}}><span>Make it catchy — players see this in Library.</span><span>{title.length}/80</span></div>
              </div>

              <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14}}>
                <div>
                  <label htmlFor="icon" style={{display:'flex',alignItems:'center',gap:6, marginBottom:6}}><ImageIcon size={12}/> Favicon / icon <span style={{opacity:.5, fontWeight:400, textTransform:'none'}}>optional</span></label>
                  <label htmlFor="icon" style={{display:'flex',flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, padding:'18px 14px', borderRadius:14, border:'1px dashed rgba(255,255,255,.18)', background: iconPreview? 'transparent':'rgba(255,255,255,.03)', cursor:'pointer', textAlign:'center', minHeight:110, overflow:'hidden', position:'relative'}}>
                    {iconPreview ? <img src={iconPreview} alt="preview" style={{width:72, height:72, objectFit:'cover', borderRadius:14, border:'1px solid rgba(255,255,255,.12)'}}/> : <span style={{width:44, height:44, borderRadius:12, background:'rgba(125,107,255,.16)', color:'var(--violet)', display:'grid', placeItems:'center'}}><ImageIcon size={20}/></span>}
                    <span style={{fontSize:12, fontWeight:700}}>{iconFile? iconFile.name : 'Click to choose icon'}</span>
                    <span style={{fontSize:11, opacity:.6}}>512×512 PNG/WebP • &lt;300KB</span>
                    <input id="icon" type="file" accept="image/*" onChange={(e) => setIconFile(e.target.files?.[0] ?? null)} style={{position:'absolute', inset:0, opacity:0, cursor:'pointer'}}/>
                  </label>
                  {iconFile && <button type="button" onClick={()=> setIconFile(null)} style={{fontSize:11, marginTop:6, background:'none', border:0, color:'var(--coral)', cursor:'pointer', textDecoration:'underline'}}>Remove icon</button>}
                </div>
                <div>
                  <label htmlFor="html" style={{display:'flex',alignItems:'center',gap:6, marginBottom:6}}><FileCode size={12}/> index.html file <span style={{color:'var(--coral)', fontSize:10}}>* required</span></label>
                  <label htmlFor="html" style={{display:'flex',flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, padding:'18px 14px', borderRadius:14, border: htmlFile? '1px solid rgba(215,243,74,.35)': '1px solid rgba(255,255,255,.14)', background: htmlFile? 'rgba(215,243,74,.08)':'rgba(0,0,0,.22)', cursor:'pointer', textAlign:'center', minHeight:110, position:'relative'}}>
                    <span style={{width:44, height:44, borderRadius:12, background: htmlFile? 'var(--lime)':'rgba(255,255,255,.06)', color: htmlFile? '#0b0d12':'var(--muted)', display:'grid', placeItems:'center'}}><FileCode size={20}/></span>
                    <span style={{fontSize:12, fontWeight:800}}>{htmlFile? htmlFile.name : 'Choose index.html'}</span>
                    <span style={{fontSize:11, opacity:.6}}>{htmlFile? `${(htmlFile.size/1024/1024).toFixed(2)} MB` : 'Self-contained • all assets inlined'}</span>
                    <input id="html" type="file" accept=".html,text/html" required onChange={(e) => setHtmlFile(e.target.files?.[0] ?? null)} style={{position:'absolute', inset:0, opacity:0, cursor:'pointer'}}/>
                  </label>
                  <div style={{fontSize:10, opacity:.5, marginTop:6, display:'flex', alignItems:'center', gap:4}}><Zap size={10}/> Auto-chunked for big files — no manual splitting needed.</div>
                </div>
              </div>

              <button type="submit" disabled={!!progress} className="btn-primary" style={{padding:'14px 18px', borderRadius:14, fontSize:15, background:'var(--violet)', color:'#fff', boxShadow:'0 10px 30px rgba(125,107,255,.28)'}}>
                {progress ? (<><Upload size={16} className="spin" style={{animation:'spin .8s linear infinite'}}/> Uploading {progress.done}/{progress.total}…</>) : (<><Send size={16}/> Submit for review <ArrowRight size={14}/></>)}
              </button>
              {progress && (<div className="progress-bar" style={{height:10, background:'rgba(125,107,255,.14)'}}><div style={{ width: `${Math.round((progress.done / progress.total) * 100)}%`, background:'var(--violet)' }} /></div>)}
              {message && <p style={{padding:'12px 14px', borderRadius:12, background: messageType==='ok'? 'rgba(34,197,94,.12)':'rgba(255,92,92,.10)', border: messageType==='ok'? '1px solid rgba(34,197,94,.25)':'1px solid rgba(255,92,92,.22)', color: messageType==='ok'? '#86efac':'#fecaca', display:'flex', alignItems:'center', gap:8, fontSize:13, lineHeight:1.4}}>{messageType==='ok'? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}{message}</p>}
            </form>

            <div style={{marginTop:16, padding:'12px 14px', borderRadius:12, background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.06)', display:'flex', gap:10, alignItems:'center'}}>
              <Users size={16} style={{opacity:.6}}/><p style={{margin:0, fontSize:12, opacity:.7}}><strong>Community promise:</strong> No spam • No stolen games (original or properly credited) • Approved games stay forever in <em>Library → Community</em>.</p>
            </div>
          </section>

          {/* Recent requests sidebar */}
          <aside style={{display:'grid', gap:16, position:'sticky', top:12}}>
            <div className="admin-panel" style={{padding:18, borderRadius:18}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between', marginBottom:12}}>
                <h3 style={{margin:0, fontSize:15, display:'flex',alignItems:'center',gap:8}}><Clock size={14}/> Recent requests</h3>
                <span style={{fontSize:11, padding:'4px 8px', borderRadius:999, background:'rgba(255,255,255,.06)', border:'1px solid rgba(255,255,255,.08)'}}>{recent.length} total</span>
              </div>
              <div style={{display:'flex',gap:6, marginBottom:12}}>
                {(['all','pending','approved'] as const).map(f=> (
                  <button key={f} onClick={()=> setFilter(f)} style={{flex:1, padding:'7px 10px', borderRadius:999, border: filter===f? '1px solid var(--violet)':'1px solid rgba(255,255,255,.12)', background: filter===f? 'var(--violet)':'rgba(255,255,255,.04)', color: filter===f? '#fff':'var(--muted)', fontSize:11, fontWeight:800, textTransform:'capitalize', cursor:'pointer'}}>{f}</button>
                ))}
              </div>
              <div style={{display:'grid', gap:8, maxHeight:360, overflowY:'auto', paddingRight:4}}>
                {shown.length===0 && <p style={{padding:'18px 14px', borderRadius:12, border:'1px dashed rgba(255,255,255,.14)', textAlign:'center', opacity:.6, fontSize:13}}>No {filter!=='all'? filter:''} requests yet.</p>}
                {shown.map(r=> (
                  <div key={r.id} style={{display:'flex',alignItems:'center',gap:10, padding:'10px 12px', borderRadius:12, border:'1px solid rgba(255,255,255,.06)', background:'rgba(255,255,255,.02)'}}>
                    <span style={{width:36, height:36, borderRadius:10, background: r.status==='approved'? 'rgba(34,197,94,.16)': r.status==='pending'? 'rgba(255,190,70,.16)':'rgba(255,92,92,.16)', color: r.status==='approved'? '#22c55e': r.status==='pending'? '#f59e0b':'#ef4444', display:'grid', placeItems:'center', fontWeight:900, fontSize:11, flexShrink:0}}>{r.status==='approved'? <CheckCircle2 size={14}/>: r.status==='pending'? <Clock size={14}/>: <AlertCircle size={14}/>}</span>
                    <div style={{minWidth:0, flex:1}}>
                      <strong style={{fontSize:13, display:'block', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{r.title}</strong>
                      <span style={{fontSize:11, opacity:.55, display:'flex', alignItems:'center', gap:6}}><span style={{padding:'2px 6px', borderRadius:999, background:'rgba(255,255,255,.08)', fontSize:10, textTransform:'uppercase', letterSpacing:'.06em'}}>{r.status}</span> <ThumbsUp size={10}/> {r.votes}</span>
                    </div>
                  </div>
                ))}
              </div>
              <a href="/" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:6, marginTop:12, padding:'10px 12px', borderRadius:999, border:'1px solid rgba(255,255,255,.12)', background:'rgba(255,255,255,.04)', fontSize:12, fontWeight:700, textDecoration:'none'}}>Back to lounge <ArrowRight size={12}/></a>
            </div>

            <div style={{padding:'14px 16px', borderRadius:16, background:'linear-gradient(135deg, rgba(215,243,74,.14), rgba(125,107,255,.14))', border:'1px solid rgba(255,255,255,.08)'}}>
              <strong style={{display:'flex',alignItems:'center',gap:6, fontSize:13}}><Sparkles size={14} color="var(--violet)"/> Pro tip</strong>
              <p style={{margin:'6px 0 0', fontSize:12, opacity:.75, lineHeight:1.5}}>Make your icon 512×512 and your HTML self-contained (inline CSS/JS, no external CDNs). That way it works offline and passes review faster.</p>
            </div>
          </aside>
        </div>
      </section>

      <footer style={{maxWidth:1240, margin:'28px auto 0', padding:'18px 38px 30px', borderTop:'1px solid var(--line)', display:'flex', justifyContent:'space-between', gap:16, flexWrap:'wrap', opacity:.6, fontSize:11}}>
        <span>© 2026 GG-LOUNGE STUDIOS™</span><span>Requests • Community • Forever</span>
      </footer>
    </main>
  );
}
