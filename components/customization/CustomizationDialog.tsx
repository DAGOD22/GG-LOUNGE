'use client';
import { CursorGallery } from './CursorGallery';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, Palette, Image as ImageIcon, MousePointer2, Keyboard, EyeOff, Upload, Check, RotateCcw, Sparkles } from 'lucide-react';
import { useCustomization } from './CustomizationProvider';
import { THEMES, WALLPAPERS, RELEASE_NAME, bindingFromEvent, bindingLabel, iconHref, normalizeDestination, type Colors, type KeyBinding } from '@/lib/customization/settings';
import { saveMedia, deleteMedia, imageData } from '@/lib/customization/media';
const tabs=[{id:'tab',label:'Tab cloak',icon:EyeOff},{id:'panic',label:'Panic key',icon:Keyboard},{id:'theme',label:'Themes',icon:Palette},{id:'background',label:'Background',icon:ImageIcon},{id:'cursor',label:'Cursor',icon:MousePointer2},{id:'reactive',label:'Key effects',icon:Sparkles}];
function Toggle({label,description,checked,onChange}:{label:string;description?:string;checked:boolean;onChange:(v:boolean)=>void}){return <label className="gg-toggle"><span><strong>{label}</strong>{description&&<small>{description}</small>}</span><input type="checkbox" role="switch" checked={checked} onChange={e=>onChange(e.target.checked)}/></label>;}
function Section({title,children,description}:{title:string;description?:string;children:ReactNode}){return <section className="gg-settings-section"><h3>{title}</h3>{description&&<p className="gg-help">{description}</p>}{children}</section>;}
export function CustomizationDialog({open,onClose,onPlayVideo}:{open:boolean;onClose:()=>void;onPlayVideo:()=>void}) {
  const {settings,update,reset,capturing,setCapturing,saveError,mediaError,runPanic}=useCustomization();
  const dialog=useRef<HTMLDialogElement>(null),[tab,setTab]=useState('tab'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[iconDraft,setIconDraft]=useState(settings.cloak.icon),[destination,setDestination]=useState(settings.panic.destination),[resetConfirm,setResetConfirm]=useState(false);
  useEffect(()=>setIconDraft(settings.cloak.icon.startsWith('data:')?'':settings.cloak.icon),[settings.cloak.icon]);
  useEffect(()=>setDestination(settings.panic.destination),[settings.panic.destination]);
  useEffect(()=>{const el=dialog.current;if(!el)return;if(open&&!el.open)el.showModal();if(!open&&el.open)el.close();if(open){const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;};}},[open]);
  useEffect(()=>{setError('');setResetConfirm(false);setCapturing(false);},[tab,setCapturing]);
  useEffect(()=>{
    if(!capturing)return;let pending:KeyBinding|null=null;
    const finish=(binding:KeyBinding)=>{update(s=>({...s,panic:{...s.panic,binding}}));setCapturing(false);};
    const down=(e:KeyboardEvent)=>{e.preventDefault();e.stopImmediatePropagation();if(e.repeat||e.isComposing)return;const value=bindingFromEvent(e);if(/^(Control|Shift|Alt|Meta)/.test(e.code)){pending=value;return;}pending=null;finish(value);};
    const up=(e:KeyboardEvent)=>{if(pending&&e.code===pending.code){e.preventDefault();e.stopImmediatePropagation();finish(pending);}};
    window.addEventListener('keydown',down,true);window.addEventListener('keyup',up,true);
    return()=>{window.removeEventListener('keydown',down,true);window.removeEventListener('keyup',up,true);};
  },[capturing,update,setCapturing]);
  const applyIcon=()=>{try{iconHref(iconDraft,location.origin);update(s=>({...s,cloak:{...s.cloak,icon:iconDraft.trim()}}));setError('');}catch(e){setError((e as Error).message);}};
  const applyDestination=()=>{try{normalizeDestination(destination,location.origin);update(s=>({...s,panic:{...s.panic,destination:destination.trim()}}));setError('');return true;}catch(e){setError((e as Error).message);return false;}};
  const uploadImage=async(file:File|undefined,kind:'favicon'|'cursor')=>{if(!file)return;setBusy(true);setError('');try{const image=await imageData(file,kind==='favicon'?64:32);update(s=>kind==='favicon'?{...s,cloak:{...s.cloak,icon:image}}:{...s,cursor:{...s.cursor,preset:'custom',image,size:32}});}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const uploadBackground=async(file:File|undefined)=>{if(!file)return;setBusy(true);setError('');const old=settings.background.mediaId;try{const media=await saveMedia(file);update(s=>({...s,background:{...s.background,preset:'upload',mediaId:media.id,mediaKind:media.kind,mediaName:media.name}}));if(old)deleteMedia(old).catch(()=>{});}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  const chooseTheme=(id:string)=>{const p=THEMES[id];update(s=>({...s,theme:{preset:id,mode:p.mode,colors:{...p.colors}}}));};
  const colorLabels:Record<keyof Colors,string>={background:'Page background',surface:'Surface',panel:'Cards & panels',text:'Text',muted:'Secondary text',accent:'Accent',secondary:'Secondary accent'};
  return <dialog ref={dialog} className="gg-customization" aria-labelledby="gg-customize-title" onCancel={()=>onClose()} onClose={()=>onClose()} onClick={e=>{if(e.target===dialog.current){const rect=dialog.current.getBoundingClientRect();if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)onClose();}}}>
    <header className="gg-settings-header"><div><p className="gg-overline">MAKE IT YOURS</p><h2 id="gg-customize-title">Your lounge. Your rules.</h2><p>Personalize this browser. Changes apply instantly.</p></div><button className="gg-icon-button" onClick={onClose} aria-label="Close customization"><X size={20}/></button></header>
    <div className="gg-settings-layout"><nav aria-label="Customization sections" className="gg-settings-nav">{tabs.map(({id,label,icon:Icon})=><button type="button" key={id} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}><Icon size={17}/>{label}</button>)}<span className="gg-local-badge">Stored on this device</span></nav>
      <div className="gg-settings-body" key={tab}>
      {(error||saveError)&&<p className="gg-settings-error" role="alert">{error||saveError}</p>}
      {busy&&<p role="status" className="gg-help">Checking and saving your file…</p>}
      {tab==='tab'&&<>
        <Section title="A tab that looks how you want" description="Choose any tab name and an icon. This changes the browser tab—not the address, history or network visibility.">
          <Toggle label="Enable tab cloaking" checked={settings.cloak.enabled} onChange={enabled=>update(s=>({...s,cloak:{...s.cloak,enabled}}))}/>
          <label className="gg-field">Tab name<input maxLength={120} value={settings.cloak.title} onChange={e=>update(s=>({...s,cloak:{...s.cloak,title:e.target.value}}))} placeholder="Type any tab name"/></label>
          <label className="gg-field">Favicon URL or emoji<input value={iconDraft} onChange={e=>setIconDraft(e.target.value)} placeholder={settings.cloak.icon.startsWith('data:')?'Uploaded image is active':'https://example.com/favicon.ico or 📚'} autoComplete="off" spellCheck={false}/></label>
          <div className="gg-action-row"><button className="gg-primary" onClick={applyIcon}>Apply favicon</button><label className="gg-file-button"><Upload size={15}/> Upload favicon<input aria-label="Upload favicon" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/x-icon,image/vnd.microsoft.icon" disabled={busy} onChange={e=>{void uploadImage(e.target.files?.[0],'favicon');e.target.value='';}}/></label></div>
          <div className="gg-tab-preview"><img alt="Favicon preview" src={iconHref(settings.cloak.icon)}/><span>{settings.cloak.title||'Untitled tab'}</span><X size={13}/></div>
          <p className="gg-help">Uploads become a local 64 × 64 icon. A remote favicon URL must be reachable from your browser; upload the image if it is blocked.</p>
        </Section>
        <Section title="Quick starts"><div className="gg-chip-row">{[{name:'Workspace',title:'My workspace',icon:'📚'},{name:'Notes',title:'Notes',icon:'📝'},{name:'Calendar',title:'Calendar',icon:'📅'},{name:'Blank',title:' ',icon:'⬜'}].map(p=><button key={p.name} className="gg-chip" onClick={()=>update(s=>({...s,cloak:{enabled:true,title:p.title,icon:p.icon}}))}>{p.icon} {p.name}</button>)}</div></Section>
      </>}
      {tab==='panic'&&<>
        <Section title="One shortcut. A different page." description="Redirect this tab instantly, including from same-origin game frames. Browser and operating-system reserved shortcuts cannot be overridden.">
          <Toggle label="Enable panic shortcut" checked={settings.panic.enabled} onChange={enabled=>update(s=>({...s,panic:{...s.panic,enabled}}))}/>
          <div className="gg-key-recorder"><span>Current shortcut</span><kbd>{bindingLabel(settings.panic.binding)}</kbd><button className="gg-primary" onClick={()=>setCapturing(!capturing)}>{capturing?'Cancel recording':'Record a key'}</button></div>
          {capturing&&<p role="status" className="gg-recording">Press a key or key combination now. To bind a modifier alone, press and release it. Escape can be recorded too.</p>}
          <label className="gg-field">Panic destination<input value={destination} onChange={e=>setDestination(e.target.value)} onBlur={()=>{if(destination!==settings.panic.destination)applyDestination();}} placeholder="https://example.com or about:blank" autoComplete="off" spellCheck={false}/></label>
          <div className="gg-action-row"><button className="gg-primary" onClick={applyDestination}>Save destination</button><button className="gg-secondary" onClick={()=>{setDestination('about:blank');update(s=>({...s,panic:{...s.panic,destination:'about:blank'}}));}}>Use a blank page</button></div>
          <Toggle label="Also trigger while typing" description="Off by default to avoid accidental redirects in search boxes, chat and forms." checked={settings.panic.whileTyping} onChange={whileTyping=>update(s=>({...s,panic:{...s.panic,whileTyping}}))}/>
          <p className="gg-help">Escape may first release a game’s mouse lock. Cross-origin embedded pages cannot forward their keys. Panic does not erase browser history. Unsaved progress may be lost.</p>
          <button className="gg-secondary" onClick={()=>{if(applyDestination())setTimeout(runPanic,0);}}>Test redirect — leaves this page</button>
        </Section>
      </>}
      {tab==='theme'&&<>
        <Section title="Find your palette" description="A familiar lounge, in your colors. Presets and custom colors apply across the site."><div className="gg-theme-grid">{Object.entries(THEMES).map(([id,p])=><button key={id} className="gg-theme-choice" aria-pressed={settings.theme.preset===id} onClick={()=>chooseTheme(id)} style={{background:p.colors.background,color:p.colors.text}}><span className="gg-theme-dots">{[p.colors.accent,p.colors.secondary,p.colors.panel].map((color,i)=><i key={i} style={{background:color}}/>)}</span><strong>{p.name}</strong>{settings.theme.preset===id&&<Check size={14}/>}</button>)}</div></Section>
        <Section title="Mix your own"><label className="gg-field">Control style<select value={settings.theme.mode} onChange={e=>update(s=>({...s,theme:{...s.theme,preset:'custom',mode:e.target.value as 'light'|'dark'}}))}><option value="dark">Dark controls</option><option value="light">Light controls</option></select></label><div className="gg-colors">{(Object.keys(colorLabels) as (keyof Colors)[]).map(key=><label key={key}><input type="color" aria-label={colorLabels[key]+' color'} value={settings.theme.colors[key]} onChange={e=>update(s=>({...s,theme:{...s.theme,preset:'custom',colors:{...s.theme.colors,[key]:e.target.value}}}))}/><span>{colorLabels[key]}<small>{settings.theme.colors[key]}</small></span></label>)}</div></Section>
      </>}
      {tab==='background'&&<>
        <Section title="Set the scene" description="Use a built-in wallpaper or video loop, or upload your own. Files stay in this browser’s local media store."><div className="gg-wallpaper-grid">{WALLPAPERS.map(p=><button key={p.id} aria-pressed={settings.background.preset===p.id} onClick={()=>update(s=>({...s,background:{...s.background,preset:p.id}}))}><span style={{background:p.preview}}/>{p.name}{settings.background.preset===p.id&&<Check size={13}/>}</button>)}</div>
          <label className="gg-upload-zone"><Upload size={24}/><strong>{busy?'Saving…':'Upload an image or video'}</strong><span>Images up to 15 MB · videos up to 100 MB</span><input aria-label="Upload background" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,video/mp4,video/webm,video/ogg,video/quicktime" disabled={busy} onChange={e=>{void uploadBackground(e.target.files?.[0]);e.target.value='';}}/></label>
          {settings.background.mediaId&&<div className="gg-uploaded"><span>{settings.background.mediaName}</span><button className="gg-chip" onClick={()=>update(s=>({...s,background:{...s.background,preset:'upload'}}))}>Use upload</button><button className="gg-chip" onClick={()=>{const id=settings.background.mediaId;update(s=>({...s,background:{...s.background,preset:s.background.preset==='upload'?'none':s.background.preset,mediaId:'',mediaName:''}}));deleteMedia(id).catch(e=>setError(e.message));}}>Delete file</button></div>}
          {mediaError&&<p role="alert" className="gg-settings-error">{mediaError}</p>}
          <label className="gg-range">Darken overlay <output>{settings.background.dim}%</output><input aria-label="Background darken overlay" type="range" min={0} max={90} value={settings.background.dim} onChange={e=>update(s=>({...s,background:{...s.background,dim:+e.target.value}}))}/></label>
          <label className="gg-range">Blur <output>{settings.background.blur}px</output><input aria-label="Background blur" type="range" min={0} max={24} value={settings.background.blur} onChange={e=>update(s=>({...s,background:{...s.background,blur:+e.target.value}}))}/></label>
          <label className="gg-field">Image / video fit<select value={settings.background.fit} onChange={e=>update(s=>({...s,background:{...s.background,fit:e.target.value as 'cover'|'contain'}}))}><option value="cover">Fill the screen</option><option value="contain">Show the whole image</option></select></label>
          <Toggle label="Respect reduced-motion preference" description="Pause video and visual effects when your device requests less animation." checked={settings.background.respectMotion} onChange={respectMotion=>update(s=>({...s,background:{...s.background,respectMotion}}))}/>
          <button className="gg-secondary" onClick={onPlayVideo}>Play background</button><p className="gg-help">Videos are always muted and loop. Background playback pauses in hidden tabs. Browser data clearing removes uploaded files; these uploads are not shared with other visitors.</p>
        </Section>
      </>}
      {tab==='cursor'&&<>
        <Section title="Animated cursors" description="Thirty-one hand-built pointer engines - including animated mascots (cat, dog, fox, bunny, ghost, bat, chick) with blinks, tail wags and pounce squashes -: soft-body jelly, particle comets, verlet snake chains, glitch RGB-split, sonar pings and more. They react to what you hover - links, text, media, drag handles - and pulse when you click.">
          <CursorGallery />
          <label className="gg-slider"><span>Size <b>{settings.cursor.size}px</b></span><input type="range" min={16} max={64} step={2} value={settings.cursor.size} onChange={e=>update(s=>({...s,cursor:{...s.cursor,size:Number(e.target.value)}}))} aria-label="Cursor size"/></label>
          <label className="gg-slider"><span>Follow speed <b>{Math.round(settings.cursor.speed*100)}%</b></span><input type="range" min={0} max={1} step={0.05} value={settings.cursor.speed} onChange={e=>update(s=>({...s,cursor:{...s.cursor,speed:Number(e.target.value)}}))} aria-label="Cursor follow speed"/></label>
          <Toggle label="Ribbon trail" description="A tapered light ribbon behind the pointer. Respects reduced motion." checked={settings.cursor.trail} onChange={trail=>update(s=>({...s,cursor:{...s.cursor,trail}}))}/>
          <Toggle label="GPU afterglow" description="WebGL motion-blur light streaks under the pointer. Auto-off with reduced motion or without WebGL." checked={settings.cursor.glow} onChange={glow=>update(s=>({...s,cursor:{...s.cursor,glow}}))}/>
        </Section>
        <Section title="System or your own" description="Prefer the native pointer or a static image? Games that lock the mouse can hide any cursor.">
          <div className="gg-chip-row">
            <button className="gg-chip" aria-pressed={settings.cursor.preset==='system'} onClick={()=>update(s=>({...s,cursor:{...s.cursor,preset:'system'}}))}>System cursor</button>
          </div>
          <label className="gg-upload-zone"><MousePointer2 size={24}/><strong>Upload a cursor image</strong><span>Up to 4 MB · resized to 32 × 32 · centered hotspot</span><input aria-label="Upload cursor" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif,image/x-icon,image/vnd.microsoft.icon" disabled={busy} onChange={e=>{void uploadImage(e.target.files?.[0],'cursor');e.target.value='';}}/></label>
          {settings.cursor.image&&<button className="gg-secondary" onClick={()=>update(s=>({...s,cursor:{...s.cursor,preset:'custom'}}))}><img src={settings.cursor.image} alt="Uploaded cursor" width={32} height={32}/> Use uploaded cursor</button>}
        </Section>
      </>}
      {tab==='reactive'&&<>
        <Section title="A background that responds" description="Create light pulses when you press keys—including inside local game frames. Typed text is never displayed or recorded.">
          <Toggle label="Key-sensitive background" checked={settings.reactive.enabled} onChange={enabled=>update(s=>({...s,reactive:{...s.reactive,enabled}}))}/>
          <label className="gg-field">Effect style<select value={settings.reactive.style} onChange={e=>update(s=>({...s,reactive:{...s.reactive,style:e.target.value as any}}))}><option value="ripples">Ripples</option><option value="particles">Particle burst</option><option value="constellation">Constellation</option></select></label>
          <label className="gg-range">Intensity <output>{settings.reactive.intensity}%</output><input aria-label="Key effect intensity" type="range" min={10} max={100} value={settings.reactive.intensity} onChange={e=>update(s=>({...s,reactive:{...s.reactive,intensity:+e.target.value}}))}/></label>
          <Toggle label="Follow the pointer" description="Place keyboard pulses near your cursor instead of across the screen." checked={settings.reactive.pointer} onChange={pointer=>update(s=>({...s,reactive:{...s.reactive,pointer}}))}/>
          <p className="gg-help">Close this panel and press a key to try it. Effects ignore typing in text fields, stop in hidden tabs, and cap particles for smoother games. Reduced-motion settings take priority.</p>
        </Section>
      </>}
      </div>
    </div>
    <footer className="gg-settings-footer"><span>{saveError?'Not saved':busy?'Saving file…':<><Check size={13}/> Automatically saved</>}<small>{RELEASE_NAME}</small></span><div className="gg-action-row"><button className="gg-reset" onClick={()=>{if(!resetConfirm){setResetConfirm(true);return;}const id=settings.background.mediaId;reset();if(id)deleteMedia(id).catch(()=>{});setResetConfirm(false);setError('');}}><RotateCcw size={13}/>{resetConfirm?'Confirm reset':'Reset preferences'}</button><button className="gg-primary" onClick={onClose}>Done</button></div></footer>
  </dialog>;
}
