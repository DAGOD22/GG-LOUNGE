'use client';
import { useEffect, useRef } from 'react';
import type { Settings } from '@/lib/customization/settings';
export const REACTIVE_EVENT='ggl:ambient-input';
type Spark={x:number;y:number;born:number;hue:number;kind:'key'|'pointer';};
export function ReactiveBackdrop({settings,reduced}:{settings:Settings;reduced:boolean}) {
  const canvas=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const el=canvas.current;if(!el||reduced||(!settings.reactive.enabled&&!settings.cursor.trail))return;
    const ctx=el.getContext('2d');if(!ctx)return;
    let width=innerWidth,height=innerHeight,raf=0,active=true,lastPointer=0,lastFrame=0;const sparks:Spark[]=[];
    const resize=()=>{width=innerWidth;height=innerHeight;const dpr=Math.min(devicePixelRatio||1,1.5);el.width=Math.round(width*dpr);el.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);};resize();
    const frame=(time:number)=>{raf=0;if(!active)return;if(time-lastFrame<25){raf=requestAnimationFrame(frame);return;}lastFrame=time;ctx.clearRect(0,0,width,height);
      for(let i=sparks.length-1;i>=0;i--){const s=sparks[i],age=(time-s.born)/1000,life=s.kind==='key'?1.3:.45;if(age>life){sparks.splice(i,1);continue;}const alpha=(1-age/life)*.65*settings.reactive.intensity/50;ctx.strokeStyle=`hsla(${s.hue},90%,72%,${Math.min(alpha,.8)})`;ctx.fillStyle=ctx.strokeStyle;ctx.lineWidth=1.5;
        if(s.kind==='pointer'){ctx.beginPath();ctx.arc(s.x,s.y,Math.max(1,5-age*8),0,Math.PI*2);ctx.fill();}
        else if(settings.reactive.style==='ripples'){for(let ring=0;ring<3;ring++){ctx.beginPath();ctx.arc(s.x,s.y,10+age*(110+ring*45),0,Math.PI*2);ctx.stroke();}}
        else {const count=settings.reactive.style==='particles'?16:8;for(let j=0;j<count;j++){const a=j/count*Math.PI*2+s.hue,rad=age*110;const x=s.x+Math.cos(a)*rad,y=s.y+Math.sin(a)*rad;ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();if(settings.reactive.style==='constellation'){ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(x,y);ctx.stroke();}}}
      }
      if(sparks.length)raf=requestAnimationFrame(frame);
    };
    const input=(event:Event)=>{if(document.hidden)return;const detail=(event as CustomEvent).detail;const now=performance.now();if(detail.kind==='pointer'&&(!settings.cursor.trail||now-lastPointer<28))return;if(detail.kind==='key'&&!settings.reactive.enabled)return;lastPointer=now;
      sparks.push({x:detail.x??width*.5,y:detail.y??height*.45,hue:detail.hue??170,born:now,kind:detail.kind});if(sparks.length>70)sparks.shift();el.dataset.pulses=String((Number(el.dataset.pulses)||0)+1);if(!raf)raf=requestAnimationFrame(frame);
    };
    const visibility=()=>{if(document.hidden){sparks.length=0;cancelAnimationFrame(raf);raf=0;ctx.clearRect(0,0,width,height);}};
    window.addEventListener(REACTIVE_EVENT,input);window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);
    return()=>{active=false;cancelAnimationFrame(raf);window.removeEventListener(REACTIVE_EVENT,input);window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);ctx.clearRect(0,0,width,height);};
  },[settings.reactive.enabled,settings.reactive.style,settings.reactive.intensity,settings.cursor.trail,reduced]);
  return <canvas ref={canvas} className="gg-reactive-canvas" data-testid="reactive-background" aria-hidden="true"/>;
}
