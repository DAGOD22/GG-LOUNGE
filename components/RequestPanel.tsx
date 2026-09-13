'use client'
import { MessageSquare, ArrowUpRight, Sparkles, ThumbsUp } from 'lucide-react'

export function RequestPanel({ requests, requestVotes, newReqTitle, setNewReqTitle, submitRequest, upvoteRequest }: any){
  return (
    <div style={{marginTop:18,border:'1px solid var(--line)',borderRadius:16,background:'var(--panel)',padding:14}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
        <p className="eyebrow" style={{margin:0,display:'flex',alignItems:'center',gap:6}}><MessageSquare size={12}/> REQUEST A GAME — upvote what you want</p>
        <a href="/request-game" style={{fontSize:12,fontWeight:800,display:'inline-flex',alignItems:'center',gap:6,color:'var(--foreground)',textDecoration:'none'}}>Full request page <ArrowUpRight size={12}/></a>
      </div>
      <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
        <input value={newReqTitle} onChange={e=> setNewReqTitle(e.target.value)} placeholder="Type a game you want…" style={{flex:1,minWidth:220,padding:'10px 12px',borderRadius:999,border:'1px solid var(--line)',background:'var(--surface)',color:'var(--foreground)',outline:'none'}} onKeyDown={e=> (e.key==='Enter'&&submitRequest())} />
        <button onClick={submitRequest} style={{padding:'10px 16px',borderRadius:999,background:'var(--lime)',color:'#0b0d12',border:'1px solid var(--lime)',fontWeight:900,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}><Sparkles size={14}/> Request</button>
      </div>
      {requests.length>0 ? (
        <div style={{display:'grid',gap:8,marginTop:14,maxHeight:260,overflowY:'auto',paddingRight:4}}>
          {requests.slice(0,8).map((r:any)=> (
            <div key={r.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:12,border:'1px solid var(--line)',background:'var(--surface)'}}>
              <span style={{flex:1,minWidth:0}}><strong style={{fontSize:13}}>{r.title}</strong> <span style={{fontSize:11,color:'var(--muted)',marginLeft:6}}>{r.status}</span></span>
              <span style={{fontSize:12,fontWeight:800,display:'flex',alignItems:'center',gap:4}}><ThumbsUp size={12}/> {r.votes}</span>
              <button disabled={requestVotes.includes(r.id)} onClick={()=> upvoteRequest(r.id)} style={{padding:'6px 10px',borderRadius:999,border: requestVotes.includes(r.id)?'1px solid var(--line)':'1px solid var(--lime)',background: requestVotes.includes(r.id)?'transparent':'var(--lime)',color: requestVotes.includes(r.id)?'var(--muted)':'#0b0d12',fontWeight:900,fontSize:11,cursor: requestVotes.includes(r.id)?'default':'pointer'}}>{requestVotes.includes(r.id)?'Voted':'Upvote'}</button>
            </div>
          ))}
        </div>
      ) : <p style={{marginTop:12,color:'var(--muted)',fontSize:13}}>No requests yet — be the first to ask for a game.</p>}
    </div>
  )
}
