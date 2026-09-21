import {test,expect} from '@playwright/test';
const origin=process.env.TEST_BASE_URL||'http://127.0.0.1:3000';
test('Suika community edition starts and drops fruit with all external networking blocked',async({page})=>{
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin||/^(blob:|data:)/.test(r.request().url())?r.continue():r.abort());
  const errors:string[]=[],missing:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
  await page.goto('/games/suika/index.html');await page.getByRole('button',{name:'GAME START',exact:true}).click();
  const canvas=page.locator('canvas').first();await expect(canvas).toBeVisible();const before=await canvas.screenshot();await canvas.click({position:{x:150,y:100}});await page.waitForTimeout(600);expect((await canvas.screenshot()).equals(before)).toBe(false);expect(missing).toEqual([]);expect(errors).toEqual([]);
});
test('Piano Tiles has real local canvas gameplay, not an external embed',async({page})=>{
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/games/piano-tiles/index.html');const canvas=page.locator('canvas');await expect(canvas).toBeVisible();
  await page.waitForTimeout(100);const target=await canvas.evaluate((el:HTMLCanvasElement)=>{const ctx=el.getContext('2d')!;const y=Math.floor(el.height*.625);for(let col=0;col<4;col++){const x=Math.floor((col+.5)*el.width/4);const p=ctx.getImageData(x,y,1,1).data;if(p[3]>200&&p[0]<100)return{x,y};}return null;});expect(target).not.toBeNull();await canvas.click({position:target!});await expect(page.locator('.fail')).toBeHidden();await expect(page.locator('iframe')).toHaveCount(0);expect(errors).toEqual([]);
});
