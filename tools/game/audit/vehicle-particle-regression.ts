import {chromium} from 'playwright';import {browserExecutable} from './browser';
const browser=await chromium.launch({headless:true,executablePath:browserExecutable()}),page=await browser.newPage(),errors:string[]=[];
page.on('pageerror',e=>errors.push(e.message));await page.addInitScript('window.__name=v=>v');
await page.goto('http://127.0.0.1:5174/game.html?map=broken_bridge&prep=999&bots=0&res=32&audit=1&quality=low');await page.waitForTimeout(700);await page.locator('.lobby-solo').click();await page.waitForFunction(()=>(window as any).__game?.activated,null,{timeout:120000});
const result=await page.evaluate(()=>{
 const g=(window as any).__game;g.forceStart();cancelAnimationFrame(g.raf);g.disposed=true;
 const names=['vehicle-damage-smoke','vehicle-damage-fire','vehicle-damage-sparks','vehicle-debris'];
 const read=()=>names.map(name=>{const m=g.scene.getObjectByName(name);return {name,visible:m.visible,count:m.count,capacity:m.instanceMatrix.count}});
 const idle=read(),v=g.vehicles[0];g.damageFx.explosion(v.model.position,1);g.damageFx.update(1/60,[]);const active=read();
 for(let i=0;i<180;i++)g.damageFx.update(1/60,[]);const expired=read();return{idle,active,expired};
});
console.log(JSON.stringify({result,errors},null,2));await browser.close();
if(errors.length||result.idle.some((x:any)=>x.visible)||result.active.slice(0,3).some((x:any)=>!x.visible||x.count<=0||x.count>=x.capacity)||result.expired.some((x:any)=>x.visible))process.exitCode=1;
