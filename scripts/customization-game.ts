// Shared early bootstrap for standalone local game pages. Same-origin embedded
// games delegate panic to the lounge; standalone tabs have the same protections.
import { SETTINGS_KEY, defaults, sanitizeSettings, iconHref, normalizeDestination, matchesBinding, isTypingTarget, cursorValue } from '../lib/customization/settings';
let settings=defaults(),panicActive=false;
function hostWindow():Window {let host:Window=window;try{while(host.parent!==host&&host.parent.location.origin===location.origin)host=host.parent;}catch{}return host;}
const host=hostWindow(),standalone=host===window;
let originalTitle=document.title;const icons=new Map<HTMLLinkElement,string|null>();
function apply(){
  if(!standalone)return;
  // Wait for the game's real title before cloaking; otherwise assigning title
  // during head parsing creates a second title and loses the restore value.
  if(document.readyState==='loading'&&!document.querySelector('title'))return;
  if(settings.cloak.enabled){if(document.title!==settings.cloak.title){originalTitle=document.title;document.title=settings.cloak.title;}let href:string;try{href=iconHref(settings.cloak.icon,location.origin);}catch{return;}let link=document.querySelector<HTMLLinkElement>('link[data-gg-standalone-icon]');if(!link){link=document.createElement('link');link.rel='icon';link.dataset.ggStandaloneIcon='true';document.head.append(link);}if(link.href!==href)link.href=href;for(const other of document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]')){if(other===link)continue;if(!icons.has(other))icons.set(other,other.getAttribute('href'));if(other.href!==href)other.href=href;}}
  else {document.querySelector('link[data-gg-standalone-icon]')?.remove();for(const [link,href] of icons)if(link.isConnected){href===null?link.removeAttribute('href'):link.setAttribute('href',href);}icons.clear();}
  let style=document.querySelector<HTMLStyleElement>('style[data-gg-standalone-cursor]');const value=cursorValue(settings.cursor,settings.theme.colors.accent);if(!value){style?.remove();return;}if(!style){style=document.createElement('style');style.dataset.ggStandaloneCursor='true';document.head.append(style);}const css=`html,body,body *{cursor:${value}!important}input,textarea,[contenteditable=true]{cursor:text!important}`;if(style.textContent!==css)style.textContent=css;
}
function read(){const previous=settings;try{settings=sanitizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null'));}catch{settings=defaults();}if(standalone&&previous.cloak.enabled&&!settings.cloak.enabled&&document.title===previous.cloak.title)document.title=originalTitle;apply();}
read();
window.addEventListener('storage',e=>{if(e.key===SETTINGS_KEY)read();});
// Capture is installed before the game adds its own beforeunload handlers.
window.addEventListener('beforeunload',event=>{if(panicActive){event.stopImmediatePropagation();event.returnValue='';}},true);
window.addEventListener('keydown',event=>{
  if(!settings.panic.enabled||!matchesBinding(event,settings.panic.binding)||(!settings.panic.whileTyping&&isTypingTarget(event.target)))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!standalone&&host.document.documentElement.dataset.ggReady==='true'){host.dispatchEvent(new CustomEvent('ggl:panic-request'));return;}
  let destination:string;try{destination=normalizeDestination(settings.panic.destination,location.origin);}catch{return;}
  panicActive=true;host.onbeforeunload=null;
  for(const media of document.querySelectorAll<HTMLMediaElement>('audio,video'))media.pause();
  for(const frame of host.document.querySelectorAll('iframe'))frame.remove();
  host.location.replace(destination);
},true);
if(standalone){new MutationObserver(apply).observe(document.head,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['href','rel','type']});document.addEventListener('DOMContentLoaded',apply,{once:true});}
