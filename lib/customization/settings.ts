import { ANIMATED_CURSOR_IDS } from './cursor-presets';
export const SETTINGS_KEY = 'ggl_customization_v1';
export const RELEASE_NAME = 'new upadted version';
export type Colors = { background: string; surface: string; panel: string; text: string; muted: string; accent: string; secondary: string };
export const THEMES: Record<string, { name: string; mode: 'dark' | 'light'; colors: Colors }> = {
  lounge: { name: 'Original Lounge', mode: 'dark', colors: { background:'#0b0d12',surface:'#14161a',panel:'#141720',text:'#f4f2ec',muted:'#9699a8',accent:'#d7f34a',secondary:'#7d6bff' } },
  arctic: { name: 'Arctic', mode: 'light', colors: { background:'#f2f5fa',surface:'#ffffff',panel:'#e8edf5',text:'#152238',muted:'#506176',accent:'#245edb',secondary:'#7851ce' } },
  midnight: { name: 'Midnight', mode: 'dark', colors: { background:'#080e21',surface:'#101a34',panel:'#182544',text:'#edf3ff',muted:'#a4b4d5',accent:'#79b8ff',secondary:'#b5a2ff' } },
  cyber: { name: 'Cyberpunk', mode: 'dark', colors: { background:'#140c21',surface:'#20102f',panel:'#2b1642',text:'#fff0ff',muted:'#c0a5d2',accent:'#fb79dd',secondary:'#62f5e9' } },
  forest: { name: 'Forest', mode: 'dark', colors: { background:'#0b1713',surface:'#10251d',panel:'#183427',text:'#e9fff2',muted:'#a1beae',accent:'#a7ed83',secondary:'#58cbc2' } },
  ember: { name: 'Ember', mode: 'dark', colors: { background:'#1c1110',surface:'#2a1a17',panel:'#39241e',text:'#fff2e7',muted:'#cfada0',accent:'#ffb077',secondary:'#fa799d' } },
};
export const WALLPAPERS = [
  { id:'none', name:'No wallpaper', kind:'none', preview:'linear-gradient(135deg,#0b0d12,#242a36)' },
  { id:'aurora', name:'Aurora', kind:'gradient', preview:'radial-gradient(ellipse at 15% 20%,#267f75,transparent 65%),radial-gradient(ellipse at 85% 80%,#643591,transparent 70%),#080f20' },
  { id:'sunset', name:'Sunset', kind:'gradient', preview:'radial-gradient(ellipse at 70% 25%,#dc7052,transparent 55%),linear-gradient(145deg,#231435,#51376f 60%,#172347)' },
  { id:'ocean', name:'Deep ocean', kind:'gradient', preview:'radial-gradient(ellipse at 40% 0%,#146b7c,transparent 65%),linear-gradient(135deg,#061a32,#102f45)' },
  { id:'grid', name:'Neon grid', kind:'grid', preview:'linear-gradient(140deg,#161c37,#362051)' },
  { id:'mountains', name:'Moonrise', kind:'image', src:'/backgrounds/moonrise.svg', preview:'linear-gradient(160deg,#101d44,#867bab)' },
  { id:'aurora-video', name:'Aurora · video', kind:'video', src:'/backgrounds/aurora.webm', poster:'/backgrounds/aurora-poster.svg', preview:'linear-gradient(150deg,#075b59,#070b22,#553974)' },
  { id:'orbit-video', name:'Orbit · video', kind:'video', src:'/backgrounds/orbit.webm', poster:'/backgrounds/orbit-poster.svg', preview:'radial-gradient(circle,#4f4287,#0a1028 65%)' },
] as const;
export type KeyBinding = { code: string; key: string; ctrl: boolean; alt: boolean; shift: boolean; meta: boolean };
export type Settings = {
  version: 1;
  cloak: { enabled: boolean; title: string; icon: string };
  panic: { enabled: boolean; binding: KeyBinding; destination: string; whileTyping: boolean };
  theme: { preset: string; mode: 'dark' | 'light'; colors: Colors };
  background: { preset: string; mediaId: string; mediaKind: 'image' | 'video'; mediaName: string; dim: number; blur: number; fit: 'cover' | 'contain'; respectMotion: boolean };
  cursor: { preset: string; image: string; size: number; trail: boolean; speed: number };
  reactive: { enabled: boolean; style: 'ripples' | 'particles' | 'constellation'; intensity: number; pointer: boolean };
};
export function defaults(): Settings { return {
  version:1,
  cloak:{enabled:false,title:'My workspace',icon:'📚'},
  panic:{enabled:false,binding:{code:'Backquote',key:'`',ctrl:false,alt:false,shift:false,meta:false},destination:'about:blank',whileTyping:false},
  theme:{preset:'lounge',mode:'dark',colors:{...THEMES.lounge.colors}},
  background:{preset:'none',mediaId:'',mediaKind:'image',mediaName:'',dim:38,blur:0,fit:'cover',respectMotion:true},
  cursor:{preset:'system',image:'',size:32,trail:false,speed:0.6},
  reactive:{enabled:false,style:'ripples',intensity:50,pointer:true},
}; }
const text=(v:unknown,fallback:string,max=200)=> typeof v==='string' ? v.slice(0,max) : fallback;
const bool=(v:unknown,fallback:boolean)=>typeof v==='boolean'?v:fallback;
const num=(v:unknown,fallback:number,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
const oneOf=<T extends string>(v:unknown,values:readonly T[],fallback:T):T=>values.includes(v as T)?v as T:fallback;
const obj=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};
export function normalizeDestination(value: string, base = 'https://gg-lounge.vercel.app'): string {
  const raw=value.trim();
  if(raw==='about:blank')return raw;
  if(!raw)throw new Error('Enter a destination URL or about:blank.');
  const withScheme=/^[a-z][a-z\d+.-]*:/i.test(raw)||raw.startsWith('/')?raw:'https://'+raw;
  const url=new URL(withScheme,base);
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Use an HTTP/HTTPS URL without credentials, or about:blank.');
  return url.href;
}
export function iconHref(input:string,base='https://gg-lounge.vercel.app'):string {
  const v=input.trim();
  if(/^data:image\/(?:png|jpeg|webp|gif|x-icon|vnd.microsoft.icon);base64,[a-z\d+/=]+$/i.test(v)&&v.length<=180000)return v;
  if(/^(https?:\/\/|\/|[a-z\d.-]+\.[a-z]{2,}(?:[/:?]|$))/i.test(v)) { const u=new URL(/^(https?:|\/)/i.test(v)?v:'https://'+v,base);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)throw new Error('Invalid favicon URL.');return u.href; }
  if(!v||v.length>24||/[<>]|javascript:|data:/i.test(v))throw new Error('Use a favicon URL, an uploaded image, or a short emoji.');
  const escaped=v.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
  return 'data:image/svg+xml,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><text x="32" y="48" text-anchor="middle" font-size="48">${escaped}</text></svg>`);
}
/** legacy static-cursor ids from earlier releases → animated equivalents */
const LEGACY_CURSOR_MAP: Record<string, string> = { crosshair: 'sonar', dot: 'lounge', ring: 'halo' };

export function sanitizeSettings(input:unknown):Settings {
  const d=defaults(),v=obj(input),c=obj(v.cloak),p=obj(v.panic),b=obj(p.binding),t=obj(v.theme),bg=obj(v.background),cu=obj(v.cursor),r=obj(v.reactive);
  const colors={...d.theme.colors};const supplied=obj(t.colors);
  for(const k of Object.keys(colors) as (keyof Colors)[])if(typeof supplied[k]==='string'&&/^#[0-9a-f]{6}$/i.test(supplied[k]))colors[k]=supplied[k];
  let icon=text(c.icon,d.cloak.icon,180000);try{iconHref(icon)}catch{icon=d.cloak.icon;}
  let destination=text(p.destination,d.panic.destination,2048);try{normalizeDestination(destination)}catch{destination='about:blank';}
  const code=text(b.code,d.panic.binding.code,64).replace(/[^a-z\d_-]/gi,'');
  return {version:1,
    cloak:{enabled:bool(c.enabled,false),title:text(c.title,d.cloak.title,120),icon},
    panic:{enabled:bool(p.enabled,false),destination,whileTyping:bool(p.whileTyping,false),binding:{code,key:text(b.key,d.panic.binding.key,60),ctrl:bool(b.ctrl,false),alt:bool(b.alt,false),shift:bool(b.shift,false),meta:bool(b.meta,false)}},
    theme:{preset:oneOf(t.preset,[...Object.keys(THEMES),'custom'],'lounge'),mode:oneOf(t.mode,['dark','light'],'dark'),colors},
    background:{preset:oneOf(bg.preset,[...WALLPAPERS.map(x=>x.id),'upload'],'none'),mediaId:text(bg.mediaId,'',80),mediaKind:oneOf(bg.mediaKind,['image','video'],'image'),mediaName:text(bg.mediaName,'',160),dim:num(bg.dim,38,0,90),blur:num(bg.blur,0,0,24),fit:oneOf(bg.fit,['cover','contain'],'cover'),respectMotion:bool(bg.respectMotion,true)},
    cursor:{preset:oneOf(LEGACY_CURSOR_MAP[cu.preset as string] ?? cu.preset,['system','custom',...ANIMATED_CURSOR_IDS],'system'),image:/^data:image\/png;base64,[a-z\d+/=]+$/i.test(text(cu.image,'',180000))?cu.image:'',size:num(cu.size,32,16,64),trail:bool(cu.trail,false),speed:num(cu.speed,0.6,0,1)},
    reactive:{enabled:bool(r.enabled,false),style:oneOf(r.style,['ripples','particles','constellation'],'ripples'),intensity:num(r.intensity,50,10,100),pointer:bool(r.pointer,true)},
  };
}
export function bindingFromEvent(e:Pick<KeyboardEvent,'code'|'key'|'ctrlKey'|'altKey'|'shiftKey'|'metaKey'>):KeyBinding {
  return {code:e.code,key:e.key,ctrl:e.ctrlKey&&!e.code.startsWith('Control'),alt:e.altKey&&!e.code.startsWith('Alt'),shift:e.shiftKey&&!e.code.startsWith('Shift'),meta:e.metaKey&&!e.code.startsWith('Meta')};
}
export function matchesBinding(e:KeyboardEvent,b:KeyBinding):boolean {
  if(e.repeat||e.isComposing)return false;const k=bindingFromEvent(e);
  return (b.code?k.code===b.code:k.key===b.key)&&k.ctrl===b.ctrl&&k.alt===b.alt&&k.shift===b.shift&&k.meta===b.meta;
}
export function bindingLabel(b:KeyBinding):string {const key=b.code==='Space'?'Space':b.code.replace(/^(Key|Digit)/,'').replace(/Left$|Right$/,'')||b.key;return [b.ctrl?'Ctrl':'',b.alt?'Alt':'',b.shift?'Shift':'',b.meta?'⌘ / Meta':'',key].filter(Boolean).join(' + ');}
export function isTypingTarget(target:EventTarget|null):boolean {const el=target as Element|null;return Boolean(el?.closest?.('input,textarea,select,[contenteditable="true"],[role="textbox"]'));}
export function accentInk(hex:string):string {const rgb=hex.slice(1).match(/../g)?.map(x=>parseInt(x,16)/255)||[1,1,1];const [r,g,b]=rgb.map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4));return .2126*r+.7152*g+.0722*b>.35?'#0b0d12':'#ffffff';}
export function cursorValue(cursor:Settings['cursor'],accent:string):string {
  if(cursor.preset==='system')return '';
  if(ANIMATED_CURSOR_IDS.includes(cursor.preset))return '';
  if(cursor.preset==='crosshair')return 'crosshair';
  if(cursor.preset==='custom')return cursor.image?`url("${cursor.image}") ${Math.round(cursor.size/2)} ${Math.round(cursor.size/2)}, auto`:'';
  const ring=cursor.preset==='ring';const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><circle cx="16" cy="16" r="${ring?9:5}" fill="${ring?'none':accent}" stroke="#09101c" stroke-width="${ring?5:3}"/><circle cx="16" cy="16" r="${ring?9:5}" fill="${ring?'none':accent}" stroke="${accent}" stroke-width="2"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 16 16, auto`;
}
