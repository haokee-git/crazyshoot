import {browserExecutable} from './browser';
import {chromium,Page} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir=process.argv[2]||`tmp/water-cycles-${Date.now()}`;
fs.mkdirSync(outDir,{recursive:true});
const ev=(page:Page,code:string):Promise<any>=>page.evaluate(`(${code})()`);
const failures:string[]=[];
const fail=(id:string,detail:unknown)=>{failures.push(`${id}: ${JSON.stringify(detail)}`);};
const url=(q:string)=>`http://127.0.0.1:5174/game.html?${q}&audit=1`;

const setQuality=async(page:Page,q:string)=>{
 await ev(page,`()=>{window.__game.pauseLocal();}`);
 await page.waitForSelector('.pause-menu >> visible=true',{timeout:15000});
 await page.locator('.pause-menu').getByRole('button',{name:'设置',exact:true}).click();
 await page.waitForSelector('text=光影质量',{timeout:10000});
 await page.locator('label:has-text("光影质量") select').selectOption(q);
 await page.getByRole('button',{name:'关闭设置'}).click();
 await ev(page,`()=>{window.__game.paused=false;}`);
 await page.waitForTimeout(400);
};

const browser=await chromium.launch({headless:true,executablePath:browserExecutable()});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const errors:string[]=[];
page.on('pageerror',(e:Error)=>errors.push(e.message));
page.on('console',(m:any)=>{const t=m.text();if(/THREE\.Clock|Multiple instances/i.test(t))return;if(m.type()==='error'||(m.type()==='warning'&&/THREE|Shader|WebGL|GL_|framebuffer|program|feedback/i.test(t)))errors.push(`[${m.type()}] ${t}`);});
await page.addInitScript('window.__name = (v) => v');
await page.goto(url('map=docks&prep=999&bots=0&seed=1106&res=64'));
await page.waitForTimeout(700);
await page.locator('.lobby-solo').click();
await page.waitForFunction(()=>!!(window as any).__game,null,{timeout:90000});
await page.waitForFunction(()=>!document.querySelector('.game-loading'),null,{timeout:90000});
await page.waitForTimeout(1500);

await setQuality(page,'ultra');
await page.waitForTimeout(2000);

const spot=await ev(page,`()=>{const g=window.__game;
 for(let r=0;r<=18;r+=3)for(let a=0;a<16;a++){
  const x=246+Math.cos(a/16*Math.PI*2)*r,z=120+Math.sin(a/16*Math.PI*2)*r;
  const y=g.arena.heightAt(x,z);
  if(!Number.isFinite(y))continue;
  const w=g.arena.waterAt?.(x+8,z+4);
  if(!w)continue;
  return {x,y,z,wx:x+8,wz:z+4,ws:w.surface};
 }return null;}`);
if(!spot)fail('shore-spot','no shoreline found');

const warm=await ev(page,`()=>{const g=window.__game;
 g.renderFrame(performance.now());
 const p=g.presentation.cinematicPipeline;
 return {canvas:{w:g.renderer.domElement.width,h:g.renderer.domElement.height},
  world:{w:p.world?.width,h:p.world?.height},
  info:{geo:g.renderer.info.memory.geometries,tex:g.renderer.info.memory.textures,prog:g.renderer.info.programs?.length??-1},
  water:p.waterState};}`);
fs.writeFileSync(path.join(outDir,'warm-state.json'),JSON.stringify(warm,null,2));
if(!warm.water?.active)fail('warm-water',warm.water);

const rows:any[]=[];
const RES=[32,128,64];
for(let i=0;i<8;i++){
 const res=RES[i%3];
 for(const q of ['off','high','ultra']){
  await setQuality(page,q);
  const st=await ev(page,`()=>{const g=window.__game;
   const root=g.arena.scene.getObjectByName('minecraft-voxel-world');
   const src=root?root.children.filter(c=>c.name==='voxel-water-glass').map(c=>c.visible):[];
   return {sources:src,water:g.presentation.cinematicPipeline?.waterState,
    canvas:{w:g.renderer.domElement.width,h:g.renderer.domElement.height}};}`);
  if(q==='ultra'){
   if(!(st.water?.active))fail(`cycle${i}-ultra-inactive`,st.water);
   if(!st.sources.some((v:boolean)=>v===false))fail(`cycle${i}-ultra-sources`,st.sources);
  }else if(st.sources.some((v:boolean)=>v===false))fail(`cycle${i}-${q}-sources-not-restored`,st.sources);
  if(st.canvas.w!==warm.canvas.w||st.canvas.h!==warm.canvas.h)fail(`cycle${i}-${q}-canvas`,st.canvas);
 }
 const texSwap=await ev(page,`async()=>{const g=window.__game;
  const root=g.arena.scene.getObjectByName('minecraft-voxel-world');
  const src=root.children.find(c=>c.name==='voxel-water-glass');
  const mat=src.material;
  const oldAlbedo=mat.userData.arrayTexture,oldSurface=mat.userData.surfaceTexture;
  let disposedAlbedo=0,disposedSurface=0;
  oldAlbedo?.addEventListener?.('dispose',()=>disposedAlbedo++);
  oldSurface?.addEventListener?.('dispose',()=>disposedSurface++);
  await g.setTextureResolution(${res});
  const newAlbedo=src.material.userData.arrayTexture,newSurface=src.material.userData.surfaceTexture;
  const u=g.presentation.cinematicPipeline;
  u.refreshWaterTextures(g.scene);
  return {res:${res},oldDisposed:{albedo:disposedAlbedo,surface:disposedSurface},
   swapped:newAlbedo!==oldAlbedo,surfaceSwapped:newSurface!==oldSurface};}`);
 fs.writeFileSync(path.join(outDir,`cycle${i}-texswap.json`),JSON.stringify(texSwap,null,2));
 if(!texSwap.swapped)fail(`cycle${i}-tex-identity`,texSwap);
 if(texSwap.oldDisposed.albedo<1||texSwap.oldDisposed.surface<1)fail(`cycle${i}-tex-dispose`,texSwap);
 const info=await ev(page,`()=>{const g=window.__game;g.renderFrame(performance.now());
  const src=g.arena.scene.getObjectByName('minecraft-voxel-world')?.children.find(c=>c.name==='voxel-water-glass');
  const w=g.presentation.cinematicPipeline?.waterState;
  return {i:${i},res:${res},geo:g.renderer.info.memory.geometries,tex:g.renderer.info.memory.textures,
   prog:g.renderer.info.programs?.length??-1,
   blockMapFollows:w?.blockMap===src.material.userData.arrayTexture.uuid,
   water:w};}`);
 rows.push(info);
 if(info.blockMapFollows!==true)fail(`cycle${i}-blockmap`,info);
}

if(spot){
 const fresh=await ev(page,`()=>{const g=window.__game;
  cancelAnimationFrame(g.raf);g.disposed=true;
  const spot=${JSON.stringify(spot)};
  const yawTo=(dx,dz)=>Math.atan2(-dx,-dz);
  const away=yawTo(spot.wx-spot.x,spot.wz-spot.z)+Math.PI;
  const c=g.controller;
  c.position.set(spot.x,spot.y+.1,spot.z);c.velocity.set(0,0,0);
  const cam=g.camera;
  const run=(yaw)=>{cam.rotation.set(0,yaw,0);g.renderFrame(performance.now());
   return g.presentation.cinematicPipeline.waterState;};
  const a=run(away);
  const b=run(yawTo(spot.wx-spot.x,spot.wz-spot.z));
  const d=run(away);
  const e=run(yawTo(spot.wx-spot.x,spot.wz-spot.z));
  return {a:{active:a?.frameActive,mirror:a?.hasMirror},b:{active:b?.frameActive,mirror:b?.hasMirror},
   d:{active:d?.frameActive,mirror:d?.hasMirror},e:{active:e?.frameActive,mirror:e?.hasMirror}};}`);
 fs.writeFileSync(path.join(outDir,'freshness.json'),JSON.stringify(fresh,null,2));
 if(!fresh.b.active||fresh.b.mirror!==1)fail('freshness-toward',fresh);
 if(fresh.d.active)fail('freshness-away',fresh);
 if(!fresh.e.active)fail('freshness-return',fresh);
}

const final=await ev(page,`()=>{const g=window.__game;const r=g.renderer;const gl=r.getContext();
 const p=g.presentation.cinematicPipeline;
 const out={glError:gl.getError(),fb:{}};
 for(const [k,t] of Object.entries({world:p.world,lighting:p.lighting,work:p.work,hands:p.hands})){
  r.setRenderTarget(t);out.fb[k]=gl.checkFramebufferStatus(gl.FRAMEBUFFER);}
 r.setRenderTarget(null);
 out.info={geo:r.info.memory.geometries,tex:r.info.memory.textures,prog:r.info.programs?.length??-1};
 out.water=p.waterState;
 return out;}`);
fs.writeFileSync(path.join(outDir,'final-state.json'),JSON.stringify(final,null,2));
if(final.glError!==0)fail('gl-error',final.glError);
for(const [k,v]of Object.entries(final.fb))if(v!==36053)fail(`fb-${k}`,v);
fs.writeFileSync(path.join(outDir,'cycles.json'),JSON.stringify({warm:warm.info,rows,final:final.info},null,2));
if(errors.length)fail('console-errors',errors.slice(0,20));
fs.writeFileSync(path.join(outDir,'failures.json'),JSON.stringify(failures,null,2));
await browser.close();
console.log(`water-cycles output: ${outDir}`);
if(failures.length){console.log(`FAILURES(${failures.length}):`);for(const f of failures)console.log(' -',f);process.exitCode=1;}else console.log('PASS');
