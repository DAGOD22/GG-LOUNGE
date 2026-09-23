'use client';
import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';
import { Settings2 } from 'lucide-react';
import { AnimatedCursor } from './AnimatedCursor';
import { defaults, sanitizeSettings, SETTINGS_KEY, THEMES, WALLPAPERS, iconHref, normalizeDestination, matchesBinding, isTypingTarget, accentInk, cursorValue, type Settings } from '@/lib/customization/settings';
import { getMedia } from '@/lib/customization/media';
import { watchFrameEvents } from '@/lib/customization/frame-events';
import { ReactiveBackdrop, REACTIVE_EVENT } from './ReactiveBackdrop';
import { CustomizationDialog } from './CustomizationDialog';

type Context={settings:Settings;ready:boolean;update:(fn:(previous:Settings)=>Settings)=>void;openSettings:()=>void;reset:()=>void;capturing:boolean;setCapturing:(value:boolean)=>void;saveError:string;mediaError:string;runPanic:()=>void;};
const CustomizationContext=createContext<Context|null>(null);
export function useCustomization(){const ctx=useContext(CustomizationContext);if(!ctx)throw new Error('CustomizationProvider is missing.');return ctx;}

export function CustomizationProvider({children}:{children:ReactNode}) {
  const [settings,setSettings]=useState<Settings>(defaults),[ready,setReady]=useState(false),[open,setOpen]=useState(false),[capturing,setCapturing]=useState(false),[saveError,setSaveError]=useState(''),[mediaError,setMediaError]=useState(''),[mediaUrl,setMediaUrl]=useState(''),[systemReduced,setSystemReduced]=useState(false);
  const state=useRef(settings),captureRef=useRef(false),openRef=useRef(false),documents=useRef(new Set<Document>()),pointer=useRef({x:0,y:0}),video=useRef<HTMLVideoElement>(null);
  state.current=settings;captureRef.current=capturing;openRef.current=open;
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
  const runPanic=useCallback(()=>{const current=state.current;let destination:string;try{destination=normalizeDestination(current.panic.destination,location.origin);}catch{return;}
    try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(current));}catch{}window.onbeforeunload=null;
    for(const doc of documents.current){try{if(doc.defaultView)doc.defaultView.onbeforeunload=null;for(const el of doc.querySelectorAll<HTMLMediaElement>('audio,video'))el.pause();doc.exitPointerLock?.();}catch{}}
    // Remove frames so a game's beforeunload prompt cannot trap a panic redirect.
    for(const frame of document.querySelectorAll('iframe'))frame.remove();
    window.addEventListener('beforeunload',event=>event.stopImmediatePropagation(),{capture:true,once:true});
    if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});window.location.replace(destination);
  },[]);
  useEffect(()=>{const requested=()=>{if(state.current.panic.enabled&&!captureRef.current)runPanic();};window.addEventListener('ggl:panic-request',requested);return()=>window.removeEventListener('ggl:panic-request',requested);},[runPanic]);
  useEffect(()=>{if(!ready)return;const cleanup=watchFrameEvents(window,(event)=>{
      if(captureRef.current||event.isComposing)return;const current=state.current;
      if(current.panic.enabled&&matchesBinding(event,current.panic.binding)&&(current.panic.whileTyping||!isTypingTarget(event.target))){event.preventDefault();event.stopImmediatePropagation();runPanic();return;}
      if(!event.repeat&&!openRef.current&&!isTypingTarget(event.target)&&current.reactive.enabled){const hue=Array.from(event.code||event.key).reduce((sum,c)=>sum+c.charCodeAt(0),0)%360;window.dispatchEvent(new CustomEvent(REACTIVE_EVENT,{detail:{kind:'key',hue,x:current.reactive.pointer&&pointer.current.x?pointer.current.x:innerWidth*(.25+Math.random()*.5),y:current.reactive.pointer&&pointer.current.y?pointer.current.y:innerHeight*(.2+Math.random()*.6)}}));}
    },(event,win)=>{let x=event.clientX,y=event.clientY;try{let frame=win;while(frame!==window&&frame.frameElement){const rect=frame.frameElement.getBoundingClientRect();x+=rect.left;y+=rect.top;frame=frame.parent;}}catch{}pointer.current={x,y};if(state.current.cursor.trail)window.dispatchEvent(new CustomEvent(REACTIVE_EVENT,{detail:{kind:'pointer',x,y,hue:165}}));},doc=>{documents.current.add(doc);applyCursor(doc);return()=>{documents.current.delete(doc);doc.querySelector("style[data-gg-cursor]")?.remove();};});
    return()=>{cleanup();documents.current.clear();};
  },[ready,runPanic,applyCursor]);
  return <CustomizationContext.Provider value={{settings,ready,update,openSettings,reset,capturing,setCapturing,saveError,mediaError,runPanic}}>
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
      <AnimatedCursor cursor={settings.cursor} />
  </CustomizationContext.Provider>;
}
