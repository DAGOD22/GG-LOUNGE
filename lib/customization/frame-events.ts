/** Keyboard events do not bubble out of iframes. Bind each accessible document,
 * rebind after navigation, and detach removed frames. Cross-origin frames are
 * deliberately not bypassed. No key contents are stored or sent anywhere. */
export function watchFrameEvents(root:Window,onKey:(event:KeyboardEvent,win:Window)=>void,onPointer:(event:PointerEvent,win:Window)=>void,onDocument?:(doc:Document)=>(()=>void)|void):()=>void {
  function watch(win:Window):()=>void {
    let doc:Document;try{doc=win.document;void doc.documentElement;}catch{return ()=>{};}
    if(!doc)return ()=>{};
    const releaseDocument=onDocument?.(doc);
    const key=(event:Event)=>onKey(event as KeyboardEvent,win),pointer=(event:Event)=>onPointer(event as PointerEvent,win);
    win.addEventListener('keydown',key,true);win.addEventListener('pointermove',pointer,{passive:true});
    const frames=new Map<HTMLIFrameElement,()=>void>();let queued=false,closed=false;
    const scan=()=>{queued=false;if(closed)return;for(const [frame,cleanup] of frames)if(!frame.isConnected){cleanup();frames.delete(frame);}
      for(const frame of doc.querySelectorAll('iframe')){if(frames.has(frame))continue;let inner=()=>{};const bind=()=>{inner();try{inner=frame.contentWindow?watch(frame.contentWindow):()=>{};}catch{inner=()=>{};}};frame.addEventListener('load',bind);frames.set(frame,()=>{frame.removeEventListener('load',bind);inner();});bind();}};
    const observer=new MutationObserver(records=>{if(!queued&&records.some(r=>[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&((n as Element).tagName==='IFRAME'||(n as Element).querySelector?.('iframe'))))){queued=true;queueMicrotask(scan);}});
    observer.observe(doc,{childList:true,subtree:true});scan();
    return ()=>{closed=true;releaseDocument?.();observer.disconnect();win.removeEventListener('keydown',key,true);win.removeEventListener('pointermove',pointer);for(const close of frames.values())close();frames.clear();};
  }
  return watch(root);
}
