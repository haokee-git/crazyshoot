import { browserExecutable } from './browser';
import { chromium } from 'playwright';import fs from 'node:fs';import path from 'node:path';
const outDir=process.argv[2]||`tmp/maps-regression-${Date.now()}`;
const shotsDir=path.join(outDir,'screenshots');
const b=await chromium.launch({headless:true,executablePath:browserExecutable()});
const rows:any[]=[];fs.mkdirSync(shotsDir,{recursive:true});
for(const map of ['docks','broken_bridge','garden','airfield','training']){
 const page=await b.newPage({viewport:{width:1280,height:720}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',e=>{if(e.type()==='error')errors.push(e.text().slice(0,500));});await page.addInitScript('window.__name=v=>v');
 await page.goto(`http://127.0.0.1:5174/game.html?map=${map}&prep=999&bots=1&size=12&seed=1106&quality=low&audit=1`);await page.waitForTimeout(700);await page.locator('.lobby-solo').click();await page.waitForFunction(()=>!!(window as any).__game?.worldReady,null,{timeout:60000});await page.waitForFunction(()=>!document.querySelector('.game-loading'));
 const prep=await page.evaluate(()=>{const g=(window as any).__game;g.renderer.render(g.scene,g.camera);return {calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,memory:g.renderer.info.memory};});
 await page.screenshot({path:path.join(shotsDir,`${map}-prep.png`)});
 const state=await page.evaluate(()=>{const g=(window as any).__game;g.forceStart();const nav=g.navigation,caps=g.caps;const reach=(p:any,c:any)=>{const r=Math.max(2,Math.min(8,c.r*.7));const pts=[[c.x,c.z],[c.x+r,c.z],[c.x-r,c.z],[c.x,c.z+r],[c.x,c.z-r],[c.x+r*.7,c.z+r*.7],[c.x-r*.7,c.z-r*.7]];return {center:!!nav?.reachable(p.x,p.z,c.x,c.z),ring:pts.slice(1).some(([x,z])=>!!nav?.reachable(p.x,p.z,x,z)),reachable:pts.some(([x,z])=>!!nav?.reachable(p.x,p.z,x,z))};};return {players:g.hosted.size+1,nav:[...['blue','orange']].map(team=>{const p=g.arena.teamSpawns?.[team]??g.arena.spawn;return {team,routes:caps.map((c:any)=>({id:c.id,...reach(p,c)}))};}),vehicles:g.vehicles.map((v:any)=>({id:v.id,y:v.model.position.y,h:g.arena.heightAt(v.x,v.z)}))};});
 await page.waitForTimeout(2200);await page.screenshot({path:path.join(shotsDir,`${map}-live.png`)});
 const live=await page.evaluate(()=>{const g=(window as any).__game;g.renderer.render(g.scene,g.camera);const b=g.arena.bounds,bots=[...g.hosted.values()].filter((h:any)=>h.bot);return {calls:g.renderer.info.render.calls,triangles:g.renderer.info.render.triangles,memory:g.renderer.info.memory,rigs:[...g.remotes.values()].filter((r:any)=>r.rig.root.visible).length,failed:g.frameFailed,bots:bots.length,botsOutside:bots.filter((h:any)=>h.controller.position.x<b.minX||h.controller.position.x>b.maxX||h.controller.position.z<b.minZ||h.controller.position.z>b.maxZ).length};});
 rows.push({map,prep,state,live,errors});fs.writeFileSync(path.join(outDir,'maps.json'),JSON.stringify(rows,null,2));await page.close();console.log(map,JSON.stringify({prep,live,errors}));
}
console.log(`maps-regression output: ${outDir}`);
await b.close();if(rows.some(r=>r.errors.length||r.live.failed||r.live.botsOutside>0||r.state.players!==24||r.state.nav.some((n:any)=>n.routes.some((c:any)=>!c.reachable))))process.exitCode=1;
