'use client';
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { Settings2 } from 'lucide-react';
import { AnimatedCursor } from './AnimatedCursor';
import { defaults, sanitizeSettings, SETTINGS_KEY, THEMES, WALLPAPERS, iconHref, normalizeDestination, matchesBinding, isTypingTarget, accentInk, cursorValue, type Settings } from '@/lib/customization/settings';
import { getMedia } from '@/lib/customization/media';
import { watchFrameEvents } from '@/lib/customization/frame-events';
import { ReactiveBackdrop, REACTIVE_EVENT } from './ReactiveBackdrop';
import { CustomizationDialog } from './CustomizationDialog';
import { PanicDoc } from '@/components/live/PanicDoc';

type Context={settings:Settings;ready:boolean;update:(fn:(previous:Settings)=>Settings)=>void;openSettings:()=>void;reset:()=>void;capturing:boolean;setCapturing:(value:boolean)=>void;saveError:string;mediaError:string;runPanic:()=>void;panicDoc:boolean;closePanicDoc:()=>void;};
const CustomizationContext=createContext<Context|null>(null);
export function useCustomization(){const ctx=useContext(CustomizationContext);if(!ctx)throw new Error('CustomizationProvider is missing.');return ctx;}

export function CustomizationProvider({children}:{children:ReactNode}) {
  const [settings,setSettings]=useState<Settings>(defaults),[ready,setReady]=useState(false),[open,setOpen]=useState(false),[capturing,setCapturing]=useState(false),[saveError,setSaveError]=useState(''),[mediaError,setMediaError]=useState(''),[mediaUrl,setMediaUrl]=useState(''),[systemReduced,setSystemReduced]=useState(false),[panicDoc,setPanicDoc]=useState(false);
  const state=useRef(settings),captureRef=useRef(false),openRef=useRef(false),documents=useRef(new Set<Document>()),pointer=useRef({x:0,y:0}),video=useRef<HTMLVideoElement>(null);
  // Latest-value refs, assigned in an effect so a discarded render cannot leave
  // them pointing at state that never committed.
  const panicDocRef=useRef(false),closePanicDocRef=useRef<()=>void>(()=>{});
  useLayoutEffect(()=>{state.current=settings;captureRef.current=capturing;openRef.current=open;},[settings,capturing,open]);
  const update=useCallback((fn:(previous:Settings)=>Settings)=>setSettings(previous=>{const value=sanitizeSettings(fn(previous));state.current=value;return value;}),[]);
  const openSettings=useCallback(()=>{if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});setOpen(true);},[]);
  const reset=useCallback(()=>{setSettings(defaults());setSaveError('');setMediaError('');},[]);
  useEffect(()=>{try{const raw=localStorage.getItem(SETTINGS_KEY);if(raw)setSettings(sanitizeSettings(JSON.parse(raw)));else if(localStorage.getItem('ggl_theme')==='light'){const d=defaults();d.theme={preset:'arctic',mode:'light',colors:{...THEMES.arctic.colors}};setSettings(d);}}catch{setSaveError('Saved settings were unreadable. Defaults are active.');}setReady(true);
    const storage=(e:StorageEvent)=>{if(e.key!==SETTINGS_KEY)return;try{setSettings(e.newValue?sanitizeSettings(JSON.parse(e.newValue)):defaults());}catch{}};window.addEventListener('storage',storage);return()=>window.removeEventListener('storage',storage);
  },[]);
  useEffect(()=>{if(!ready)return;try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(settings));localStorage.setItem('ggl_theme',settings.theme.mode);setSaveError('');}catch{setSaveError('Preferences could not be saved. Browser storage may be disabled or full.');}},[settings,ready]);
  useEffect(()=>{const query=matchMedia('(prefers-reduced-motion: reduce)');const change=()=>setSystemReduced(query.matches);change();query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
  const reduced=settings.background.respectMotion&&systemReduced;

  useEffect(()=>{if(!ready)return;const root=document.documentElement,c=settings.theme.colors;root.dataset.theme=settings.theme.mode;root.style.colorScheme=settings.theme.mode;const values:Record<string,string>={'--background':c.background,'--surface':c.surface,'--surface2':c.panel,'--panel':c.panel,'--foreground':c.text,'--muted':c.muted,'--muted2':c.muted,'--lime':c.accent,'--violet':c.secondary,'--coral':settings.theme.preset==='lounge'?'#ff6c83':c.secondary,'--line':settings.theme.mode==='light'?'rgba(30,40,60,.17)':'rgba(230,235,255,.14)','--accent-ink':accentInk(c.accent)};for(const [key,value] of Object.entries(values))root.style.setProperty(key,value);
    root.dataset.ggBackground=String(settings.background.preset!=='none'||settings.reactive.enabled||settings.cursor.trail);root.dataset.ggReady='true';
  },[settings.theme,settings.background.preset,settings.reactive.enabled,settings.cursor.trail,ready]);

  useEffect(()=>{if(!ready||!settings.cloak.enabled)return;let baseTitle=document.title;const originals=new Map<HTMLLinkElement,{href:string;type:string|null;sizes:string|null}>();let extra:HTMLLinkElement|null=null;let closed=false,queued=false;
    let href:string;try{href=iconHref(settings.cloak.icon,location.origin);}catch{return;}
    const apply=()=>{queued=false;if(closed)return;if(document.title!==settings.cloak.title){baseTitle=document.title;document.title=settings.cloak.title;}
      const icons=[...document.head.querySelectorAll<HTMLLinkElement>('link[rel="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]')];if(!icons.length){extra=document.createElement('link');extra.rel='icon';extra.dataset.ggCloak='true';document.head.append(extra);icons.push(extra);}
      for(const link of icons){if(!originals.has(link))originals.set(link,{href:link.getAttribute('href')||'',type:link.getAttribute('type'),sizes:link.getAttribute('sizes')});if(link.getAttribute('href')!==href)link.setAttribute('href',href);if(link.hasAttribute('type'))link.removeAttribute('type');if(link.getAttribute('sizes')!=='any')link.setAttribute('sizes','any');}
    };
    const observer=new MutationObserver(()=>{if(!queued){queued=true;queueMicrotask(apply);}});observer.observe(document.head,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['href','type','sizes']});apply();
    return()=>{closed=true;observer.disconnect();if(document.title===settings.cloak.title)document.title=baseTitle;for(const [link,old] of originals){if(!link.isConnected)continue;link.setAttribute('href',old.href);old.type===null?link.removeAttribute('type'):link.setAttribute('type',old.type);old.sizes===null?link.removeAttribute('sizes'):link.setAttribute('sizes',old.sizes);}extra?.remove();};
  },[ready,settings.cloak.enabled,settings.cloak.title,settings.cloak.icon]);

  useEffect(()=>{let cancelled=false,url='';setMediaUrl('');setMediaError('');if(settings.background.preset!=='upload'||!settings.background.mediaId)return;
    getMedia(settings.background.mediaId).then(value=>{if(cancelled)return;if(!value)throw new Error('The saved background file is missing from this browser. Please upload it again.');url=URL.createObjectURL(value.blob);setMediaUrl(url);}).catch(error=>{if(!cancelled)setMediaError(error.message||'Unable to read the saved background.');});
    return()=>{cancelled=true;if(url)URL.revokeObjectURL(url);};
  },[settings.background.preset,settings.background.mediaId]);
  const wallpaper=WALLPAPERS.find(x=>x.id===settings.background.preset)||WALLPAPERS[0];
  const uploaded=settings.background.preset==='upload';const isVideo=uploaded?settings.background.mediaKind==='video':wallpaper.kind==='video';const source=uploaded?mediaUrl:('src' in wallpaper?wallpaper.src:'');const poster='poster' in wallpaper?wallpaper.poster:undefined;
  useEffect(()=>{const el=video.current;if(!el)return;let stopped=false;const play=()=>{if(stopped)return;if(reduced||document.hidden)el.pause();else el.play().catch(()=>{if(!stopped)setMediaError('Video autoplay was blocked. Open Customize → Background and choose “Play background”.');});};play();document.addEventListener('visibilitychange',play);return()=>{stopped=true;document.removeEventListener('visibilitychange',play);el.pause();};},[source,isVideo,reduced]);

  const applyCursor=useCallback((doc:Document)=>{try{let style=doc.querySelector<HTMLStyleElement>('style[data-gg-cursor]');const cursor=cursorValue(state.current.cursor,state.current.theme.colors.accent);if(!cursor){style?.remove();return;}if(!style){style=doc.createElement('style');style.dataset.ggCursor='true';(doc.head||doc.documentElement).append(style);}const text=`html, body, body * {cursor:${cursor} !important;} input:not([type=button]):not([type=submit]), textarea, [contenteditable=true] {cursor:text !important;}`;if(style.textContent!==text)style.textContent=text;}catch{}},[]);
  useEffect(()=>{for(const doc of documents.current){if(!doc.defaultView){documents.current.delete(doc);continue;}applyCursor(doc);}},[settings.cursor,settings.theme.colors.accent,applyCursor]);
  /**
   * Silence the game without destroying it.
   *
   * The redirect mode deletes every frame so a game's beforeunload prompt
   * cannot trap the redirect. The fake-document mode must NOT do that: the
   * whole promise is that the game resumes exactly where it left off, which is
   * impossible once the frame is gone. So this pauses and mutes instead, and
   * restores both on the way out.
   */
  const hushGame=useCallback(()=>{
    const restore:{el:HTMLMediaElement;muted:boolean;paused:boolean}[]=[];
    const loops:{win:Window;raf:typeof requestAnimationFrame;caf:typeof cancelAnimationFrame;pending:FrameRequestCallback[]}[]=[];
    for(const doc of documents.current){
      try{
        doc.exitPointerLock?.();
        for(const el of doc.querySelectorAll<HTMLMediaElement>('audio,video')){
          restore.push({el,muted:el.muted,paused:el.paused});
          el.muted=true;
          try{el.pause();}catch{}
        }
      }catch{}
      // Most browser games run their whole simulation inside requestAnimationFrame.
      // Parking that loop freezes the game — not just its sound — which is the
      // difference between "paused" and "still playing behind the document".
      try{
        const win=doc.defaultView as (Window&{__ggParked?:boolean})|null;
        if(win&&!win.__ggParked&&typeof win.requestAnimationFrame==='function'){
          const raf=win.requestAnimationFrame.bind(win);
          const caf=win.cancelAnimationFrame.bind(win);
          const pending:FrameRequestCallback[]=[];
          win.requestAnimationFrame=((callback:FrameRequestCallback)=>{pending.push(callback);return pending.length;}) as typeof win.requestAnimationFrame;
          win.cancelAnimationFrame=(()=>{}) as typeof win.cancelAnimationFrame;
          win.__ggParked=true;
          loops.push({win,raf,caf,pending});
        }
      }catch{}
    }
    return ()=>{
      // Resume the loop where it stopped: the parked callback is the game's own
      // next frame, so replaying it picks up exactly where it was.
      for(const {win,raf,caf,pending} of loops){
        try{
          win.requestAnimationFrame=raf;
          win.cancelAnimationFrame=caf;
          delete (win as Window&{__ggParked?:boolean}).__ggParked;
          const last=pending[pending.length-1];
          if(last)raf(last);
        }catch{}
      }
      for(const {el,muted,paused} of restore){try{el.muted=muted;if(!paused)void el.play().catch(()=>{});}catch{}}
    };
  },[]);

  const runPanic=useCallback(()=>{
    const current=state.current;
    // Every mode closes the floating windows first: a mini-player or a co-op
    // room left running behind a fake document is the fastest way to be caught.
    window.dispatchEvent(new CustomEvent('ggl:panic'));
    try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(current));}catch{}
    if(current.panic.mode==='doc'){
      // Hush exactly once and keep the undo. Calling it twice would record the
      // already-muted state as the thing to restore, and the game would come
      // back silent.
      resumeRef.current?.();
      resumeRef.current=hushGame();
      setPanicDoc(true);
      return;
    }
    let destination:string;try{destination=normalizeDestination(current.panic.destination,location.origin);}catch{return;}
    window.onbeforeunload=null;
    for(const doc of documents.current){try{if(doc.defaultView)doc.defaultView.onbeforeunload=null;for(const el of doc.querySelectorAll<HTMLMediaElement>('audio,video'))el.pause();doc.exitPointerLock?.();}catch{}}
    // Remove frames so a game's beforeunload prompt cannot trap a panic redirect.
    for(const frame of document.querySelectorAll('iframe'))frame.remove();
    window.addEventListener('beforeunload',event=>event.stopImmediatePropagation(),{capture:true,once:true});
    if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
    window.location.replace(destination);
  },[hushGame]);

  const resumeRef=useRef<(()=>void)|null>(null);
  const closePanicDoc=useCallback(()=>{
    setPanicDoc(false);
    resumeRef.current?.();
    resumeRef.current=null;
  },[]);
  useEffect(()=>{const requested=()=>{if(state.current.panic.enabled&&!captureRef.current)runPanic();};window.addEventListener('ggl:panic-request',requested);return()=>window.removeEventListener('ggl:panic-request',requested);},[runPanic]);
  useEffect(()=>{if(!ready)return;const cleanup=watchFrameEvents(window,(event)=>{
      if(captureRef.current||event.isComposing)return;const current=state.current;
      if(panicDocRef.current){
        // The fake document owns the keyboard. The one exception is the panic
        // combo itself, which is how you leave.
        if(current.panic.enabled&&matchesBinding(event,current.panic.binding)){event.preventDefault();event.stopImmediatePropagation();closePanicDocRef.current();}
        return;
      }
      if(current.panic.enabled&&matchesBinding(event,current.panic.binding)&&(current.panic.whileTyping||!isTypingTarget(event.target))){event.preventDefault();event.stopImmediatePropagation();runPanic();return;}
      if(!event.repeat&&!openRef.current&&!isTypingTarget(event.target)&&current.reactive.enabled){const hue=Array.from(event.code||event.key).reduce((sum,c)=>sum+c.charCodeAt(0),0)%360;window.dispatchEvent(new CustomEvent(REACTIVE_EVENT,{detail:{kind:'key',hue,x:current.reactive.pointer&&pointer.current.x?pointer.current.x:innerWidth*(.25+Math.random()*.5),y:current.reactive.pointer&&pointer.current.y?pointer.current.y:innerHeight*(.2+Math.random()*.6)}}));}
    },(event,win)=>{let x=event.clientX,y=event.clientY;try{let frame=win;while(frame!==window&&frame.frameElement){const rect=frame.frameElement.getBoundingClientRect();x+=rect.left;y+=rect.top;frame=frame.parent;}}catch{}pointer.current={x,y};if(state.current.cursor.trail)window.dispatchEvent(new CustomEvent(REACTIVE_EVENT,{detail:{kind:'pointer',x,y,hue:165}}));},doc=>{documents.current.add(doc);applyCursor(doc);return()=>{documents.current.delete(doc);doc.querySelector("style[data-gg-cursor]")?.remove();};});
    return()=>{cleanup();documents.current.clear();};
  },[ready,runPanic,applyCursor]);
  useLayoutEffect(()=>{panicDocRef.current=panicDoc;closePanicDocRef.current=closePanicDoc;},[panicDoc,closePanicDoc]);
  return <CustomizationContext.Provider value={{settings,ready,update,openSettings,reset,capturing,setCapturing,saveError,mediaError,runPanic,panicDoc,closePanicDoc}}>
    <div className="gg-ambient" aria-hidden="true" data-testid="background-layer">
      <div className={`gg-wallpaper gg-scene-${wallpaper.kind}`} style={{background:!uploaded?wallpaper.preview:undefined,filter:`blur(${settings.background.blur}px)`,transform:settings.background.blur?'scale(1.08)':undefined}}>
        {source&&(isVideo?<video ref={video} data-testid="background-video" key={source} src={source} poster={poster} muted loop playsInline preload="auto" onError={()=>setMediaError('This video could not play. Try MP4 (H.264) or WebM.')} style={{objectFit:settings.background.fit}}/>:<img src={source} alt="" style={{objectFit:settings.background.fit}}/>)}
      </div>
      <div className="gg-wallpaper-dim" style={{background:settings.background.preset==='none'?'transparent':`rgba(0,0,0,${settings.background.dim/100})`}}/>
      <ReactiveBackdrop settings={settings} reduced={reduced}/>
    </div>
    <div className="gg-site-content">{children}</div>
    <button type="button" className="gg-customize-trigger" onClick={openSettings} aria-label="Customize lounge" title="Customize appearance, tab and panic key"><Settings2 size={17}/><span>Customize</span></button>
    <CustomizationDialog open={open} onClose={()=>{setOpen(false);setCapturing(false);}} onPlayVideo={()=>{video.current?.play().then(()=>setMediaError('')).catch(()=>setMediaError('Playback is blocked or the format is unsupported.'));}}/>
      {panicDoc&&<PanicDoc onExit={closePanicDoc}/>}
      <AnimatedCursor cursor={settings.cursor} />
  </CustomizationContext.Provider>;
}
