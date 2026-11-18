import {browserExecutable} from './browser';
import {chromium,Page} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args=new Set(process.argv.slice(2));
const phase=[...args].find(a=>a.startsWith('--phase='))?.split('=')[1]??'all';
const outDir=[...args].find(a=>!a.startsWith('--'))??`tmp/lighting-audit-${Date.now()}`;
fs.mkdirSync(outDir,{recursive:true});
const ev=(page:Page,code:string):Promise<any>=>page.evaluate(`(${code})()`);
const shot=(page:Page,name:string)=>page.locator('canvas.game-canvas').screenshot({path:path.join(outDir,name)});
const failures:string[]=[];
const fail=(id:string,detail:unknown)=>{failures.push(`${id}: ${JSON.stringify(detail)}`);};
const url=(q:string)=>`http://127.0.0.1:5174/game.html?${q}&audit=1`;
const STATE_FN=`()=>{const g=window.__game;
 const world=g.arena?.scene?.getObjectByName('minecraft-voxel-world');
 const ao=world?.userData?.lightingState?.();
 const contact=g.arena?.scene?.getObjectByName('battlefield-contact-shadows');
 const r=g.renderer;
 return {effective:g.lightingDebug(),shadowMapEnabled:r.shadowMap.enabled,shadowMapType:r.shadowMap.type,
  sunQuality:g.sunShadows?.level??null,sunEnabled:g.sunShadows?.enabled??null,
  contactVisible:!!contact?.visible,dynContactVisible:!!g.shadows?.mesh?.visible,
  voxelAo:ao??null,glow:g.presentation?.material?.uniforms?.glowStrength?.value??null,
  cinematic:g.presentation?.cinematicActive??false,pipeline:g.presentation?.lightingDebugState?.()??null,
  lighting:g.cinematicLighting?.state?.()??null,
  canvas:{w:r.domElement.width,h:r.domElement.height}};}`;
const stateOf=(page:Page)=>ev(page,STATE_FN);
const setQuality=async(page:Page,q:string,motionBlur?:boolean)=>{
 await ev(page,`()=>{window.__game.pauseLocal();}`);
 await page.waitForSelector('.pause-menu',{timeout:10000});
 await page.locator('.pause-menu').getByRole('button',{name:'设置',exact:true}).click();
 await page.waitForSelector('text=光影质量',{timeout:10000});
 await page.locator('label:has-text("光影质量") select').selectOption(q);
 if(motionBlur!==undefined&&q==='ultra'){
  const box=page.locator('label:has-text("动态模糊") input[type=checkbox]');
  if(await box.count())await box.setChecked(motionBlur);
 }
 await page.getByRole('button',{name:'关闭设置'}).click();
 await ev(page,`()=>{window.__game.paused=false;}`);
 await page.waitForTimeout(300);
};
const pose=async(page:Page,x:number,y:number,z:number,yaw:number,pitch:number)=>{
 await ev(page,`()=>{const g=window.__game;const c=g.controller;
  c.position.set(${x},${y},${z});c.velocity.set(0,0,0);c.yaw=${yaw};c.pitch=${pitch};}`);
 await page.waitForTimeout(200);
};
const yawPitchTo=(dx:number,dy:number,dz:number)=>({yaw:Math.atan2(-dx,-dz),pitch:Math.asin(dy/Math.hypot(dx,dy,dz))});
const EXPECTED:Record<string,{sunEnabled:boolean,sunPixels:number|null,contact:boolean,ao:boolean,glow:number,cinematic:boolean}>={
 off:{sunEnabled:false,sunPixels:null,contact:false,ao:false,glow:0,cinematic:false},
 low:{sunEnabled:true,sunPixels:1024,contact:false,ao:false,glow:0,cinematic:false},
 medium:{sunEnabled:true,sunPixels:1536,contact:true,ao:true,glow:0.25,cinematic:false},
 high:{sunEnabled:true,sunPixels:2560,contact:true,ao:true,glow:0.43,cinematic:false},
 ultra:{sunEnabled:false,sunPixels:null,contact:true,ao:true,glow:0,cinematic:true},
};
const TIER_ORDER=['off','low','medium','high','ultra'] as const;

async function openGame(browser:any,q:string,viewport={width:1280,height:720}){
 const page=await browser.newPage({viewport});
 const errors:string[]=[];
 page.on('pageerror',(e:Error)=>errors.push(e.message));
 page.on('console',(m:any)=>{const t=m.text();
  if(m.type()==='error'||(m.type()==='warning'&&/THREE|Shader|WebGL|GL_|framebuffer|program/i.test(t))){
   if(!/THREE\.Clock|Multiple instances/i.test(t))errors.push(`[${m.type()}] ${t}`);}});
 await page.addInitScript('window.__name = (v) => v');
 await page.goto(url(q));
 await page.waitForTimeout(700);
 await page.locator('.lobby-solo').click();
 await page.waitForFunction(()=>!!(window as any).__game,null,{timeout:90000});
 await page.waitForFunction(()=>!document.querySelector('.game-loading'),null,{timeout:90000});
 return {page,errors};
}

const browser=await chromium.launch({headless:true,executablePath:browserExecutable()});

{
 const {page,errors}=await openGame(browser,'map=garden&prep=999&bots=0&seed=1106');
 await page.waitForTimeout(1500);
 const cam=await ev(page,`()=>{const g=window.__game;const p=g.controller.position;
  return {x:p.x,z:p.z,y:g.arena.heightAt(p.x,p.z)+0.1,sun:g.sunDirection.toArray()};}`);

 await ev(page,`()=>{window.__game.pauseLocal();}`);
 await page.waitForSelector('.pause-menu',{timeout:10000});
 await page.locator('.pause-menu').getByRole('button',{name:'设置',exact:true}).click();
 await page.waitForSelector('text=光影质量',{timeout:10000});

 const ui=await ev(page,`()=>{
  const labels=[...document.querySelectorAll('label')].map(l=>(l.childNodes[0]?.textContent??'').trim());
  const light=[...document.querySelectorAll('label')].find(l=>(l.childNodes[0]?.textContent??'').includes('光影质量'));
  const sel=light?.querySelector('select');
  return {labels,options:sel?[...sel.options].map(o=>({v:o.value,t:o.textContent})):null,
   motion:!![...document.querySelectorAll('label')].find(l=>(l.textContent??'').includes('动态模糊'))};}`);
 const mustNot=['太阳光影','接触阴影','环境遮蔽','高光晕光','场景渲染比例','画布像素倍率','远景雾'];
 for(const bad of mustNot)if(ui.labels.some((l:string)=>l.includes(bad)))fail('ui-legacy-control',bad);
 if(!ui.options||ui.options.length!==5)fail('ui-lighting-options',ui.options);
 else for(const [i,q] of TIER_ORDER.entries())if(ui.options[i].v!==q)fail('ui-option-value',{i,q:ui.options[i]});
 if(ui.motion)fail('ui-motion-visible-nonultra',ui.motion);

 const sel=page.locator('label:has-text("光影质量") select');
 const tierReport:Record<string,unknown>={};
 for(const q of TIER_ORDER){
  await sel.selectOption(q);
  await page.waitForTimeout(450);
  const st=await stateOf(page);
  tierReport[q]=st;
  const e=EXPECTED[q];
  const okEffective=st.effective?.effective===q||(q==='ultra'&&!st.cinematic&&st.effective?.effective==='high');
  if(!okEffective)fail('tier-effective',{q,effective:st.effective});
  if(st.effective?.quality!==q)fail('tier-quality',{q,dbg:st.effective});
  if(st.cinematic!==e.cinematic)fail('tier-cinematic',{q,st});
  const sunPix=st.sunQuality?.pixels??null;
  if(sunPix!==e.sunPixels)fail('tier-sun',{q,sun:st.sunQuality});
  if(st.sunEnabled!==e.sunEnabled)fail('tier-sunenabled',{q,st});
  if(st.contactVisible!==e.contact)fail('tier-contact',{q,st});
  if(!!st.voxelAo?.enabled!==e.ao)fail('tier-ao',{q,ao:st.voxelAo});
  if(Math.abs((st.glow??0)-e.glow)>0.02)fail('tier-glow',{q,glow:st.glow});
  if(st.shadowMapEnabled!==(q!=='off'))fail('tier-shadowmap',{q,enabled:st.shadowMapEnabled});
 }
 await sel.selectOption('ultra');
 await page.waitForTimeout(300);
 const motion=await ev(page,`()=>!![...document.querySelectorAll('label')].find(l=>(l.textContent??'').includes('动态模糊'))`);
 if(!motion)fail('ui-motion-ultra',motion);
 fs.writeFileSync(path.join(outDir,'ui-state.json'),JSON.stringify({ui,tierReport},null,2));

 const s1=await stateOf(page);
 const expectW=await page.evaluate('Math.floor(window.innerWidth*window.devicePixelRatio)');
 const expectH=await page.evaluate('Math.floor(window.innerHeight*window.devicePixelRatio)');
 if(s1.canvas.w!==expectW||s1.canvas.h!==expectH)fail('dpr1-size',{canvas:s1.canvas,expectW,expectH});
 if(s1.pipeline&&(s1.pipeline.world.width!==expectW||s1.pipeline.world.height!==expectH))fail('dpr1-world',s1.pipeline);

 await page.getByRole('button',{name:'关闭设置'}).click();
 await ev(page,`()=>{window.__game.paused=false;}`);
 await page.waitForTimeout(300);

 const away=yawPitchTo(-cam.sun[0]*0.4-1,0.06,-cam.sun[2]*0.4+0.3);
 for(const q of TIER_ORDER){
  await setQuality(page,q,q==='ultra'?true:undefined);
  await pose(page,cam.x,cam.y,cam.z,away.yaw,away.pitch);
  await shot(page,`tier-${q}.png`);
 }
 await setQuality(page,'ultra',true);
 await page.waitForTimeout(2200);
 await ev(page,`()=>{const s=document.createElement('style');s.id='audit-hide';
  s.textContent='.game-hud,.nameplate-layer,.prep-overlay,.pause-backdrop{display:none!important}';
  document.head.appendChild(s);}`);
 const interior=await ev(page,`async()=>{const m=await import('/src/maps/index.ts');
  const vd=await import('/src/game/world/voxel-map-data.ts');
  const T=await import('/node_modules/three/build/three.module.js');
  const def=m.getMap('garden');const g=window.__game;
  const open=new Set(def.buildings.filter(b=>b.roof==='open'||b.enterable===false).map(b=>b.id));
  const data=vd.buildVoxelMapData(def);
  const ray=(x,y,z,dx,dy,dz,max)=>g.arena.rayDistance(new T.Vector3(x,y,z),new T.Vector3(dx,dy,dz),max)??max;
  const inside=(plan,door,d=2.5)=>{
   if(door.side==='south')return{x:door.cx,z:plan.z0+d};
   if(door.side==='north')return{x:door.cx,z:plan.z1-d};
   if(door.side==='west')return{x:plan.x0+d,z:door.cz};
   return{x:plan.x1-d,z:door.cz};};
  for(const plan of data.interiors??[]){
   if(open.has(plan.id)||!plan.doors?.length)continue;
   for(const door of plan.doors){
    const p=inside(plan,door);
    const floor=g.arena.supportAt?.(p.x,p.z,(plan.base??0)+2)??plan.base;
    if(!Number.isFinite(floor))continue;
    if(g.arena.playerBlocked?.(p.x,p.z,.45,floor+.1))continue;
    const up=ray(p.x,floor+1.6,p.z,0,1,0,6);
    if(!(up>.1&&up<6))continue;
    return {x:p.x,y:floor,z:p.z,up,door:{x:door.cx,z:door.cz,y:(door.y0+door.y1)/2}};
   }
  }return null;}`);
 if(!interior)fail('interior-spot','none found');
 else{
  const doorAim=yawPitchTo(interior.door.x-interior.x,interior.door.y-(interior.y+1.6),interior.door.z-interior.z);
  await pose(page,interior.x,interior.y+0.1,interior.z,doorAim.yaw,doorAim.pitch);
  await page.waitForTimeout(2000);
  await shot(page,'ultra-interior.png');
  const inSt=await ev(page,`()=>{const g=window.__game;return {probe:g.cinematicLighting?.state?.(),occ:g.sunOccluded,
   cam:{p:g.controller.position.toArray(),cam:g.camera.position.toArray()}};}`);
  inSt.spot=interior;
  fs.writeFileSync(path.join(outDir,'ultra-interior-state.json'),JSON.stringify(inSt,null,2));
  if(!inSt.probe?.enabled)fail('lighting-active',inSt);
  if(inSt.probe?.env!==true)fail('lighting-env',inSt);
  if(!Number.isFinite(inSt.probe?.sky)||!Number.isFinite(inSt.probe?.exposure))fail('lighting-probe-finite',inSt);
  if((inSt.probe?.sky??1)>0.75)fail('interior-sky-high',inSt);
 }

 const sunAim=yawPitchTo(cam.sun[0],cam.sun[1],cam.sun[2]);
 const occSpot=await ev(page,`async()=>{const m=await import('/src/maps/index.ts');
  const T=await import('/node_modules/three/build/three.module.js');
  const def=m.getMap('garden');const g=window.__game;
  const s=g.sunDirection;const sxz=Math.hypot(s.x,s.z)||1;
  const ox=-s.x/sxz*1.8,oz=-s.z/sxz*1.8;
  for(const b of def.buildings){
   if(b.roof==='open')continue;
   const pts=b.polygon;
   for(let i=0;i<pts.length;i++){
    const a=pts[i],c=pts[(i+1)%pts.length];
    const mx=(a[0]+c[0])/2,mz=(a[1]+c[1])/2;
    const cx=mx+ox,cz=mz+oz;
    const y=g.arena.heightAt(cx,cz);
    if(!Number.isFinite(y))continue;
    if(g.arena.playerBlocked?.(cx,cz,.45,y+.1))continue;
    const hit=g.arena.rayDistance(new T.Vector3(cx,y+1.6,cz),s,500);
    if(hit!==undefined&&hit<499.999&&hit<80)return{x:cx,z:cz,y,hit};
   }}return null;}`);
 if(!occSpot)fail('occluded-spot','none found');
 else{
  await pose(page,occSpot.x,occSpot.y+0.1,occSpot.z,sunAim.yaw,sunAim.pitch);
  await page.waitForTimeout(500);
  const occ=await ev(page,`()=>window.__game.sunOccluded`);
  if(occ!==true)fail('sun-occlusion',{occ,spot:occSpot});
  await shot(page,'ultra-occluded-sun.png');
 }

 await pose(page,cam.x,cam.y,cam.z,sunAim.yaw,sunAim.pitch);
 await page.waitForTimeout(600);
 const sunState=await ev(page,`()=>{const c=window.__game.presentation.cinematicPipeline;
  const u=c?.compositeMaterial?.uniforms;return {uv:u?.sunUv?.value?.toArray(),vis:u?.sunVis?.value};}`);
 fs.writeFileSync(path.join(outDir,'ultra-sun-state.json'),JSON.stringify(sunState,null,2));
 if(sunState&&(!sunState.uv||Math.abs(sunState.uv[0]-0.5)>0.15||Math.abs(sunState.uv[1]-0.5)>0.35))fail('sun-projection',sunState);
 if(!sunState||!(sunState.vis>0.05))fail('sun-visible',sunState);
 await shot(page,'ultra-facing-sun.png');
 const awaySun=yawPitchTo(-cam.sun[0],0,-cam.sun[2]);
 await pose(page,cam.x,cam.y,cam.z,awaySun.yaw,0);
 await page.waitForTimeout(400);
 const backSun=await ev(page,`()=>window.__game.presentation.cinematicPipeline?.compositeMaterial?.uniforms?.sunVis?.value`);
 if((backSun??1)>0.05)fail('sun-away',backSun);

 const veh=await ev(page,`()=>{const g=window.__game;
  const order=['mbt','light_tank','ifv','apc','jeep'];
  const vs=(g.vehicles??[]).filter(v=>!v.destroyed);
  const v=order.map(k=>vs.find(v=>v.kind===k)).find(Boolean)??vs[0];
  return v?{x:v.x,z:v.z,y:v.model.position.y,yaw:v.yaw??v.model.rotation.y??0,kind:v.kind}:null;}`);
 if(veh){
  const a=veh.yaw+Math.PI*0.78;
  const px=veh.x+Math.sin(a)*6.5,pz=veh.z+Math.cos(a)*6.5;
  const py=await ev(page,`()=>window.__game.arena.heightAt(${px},${pz})`);
  const aim=yawPitchTo(veh.x-px,(veh.y+1.1)-(py+1.6),veh.z-pz);
  await pose(page,px,py+0.1,pz,aim.yaw,aim.pitch);
  const framed=await ev(page,`()=>{const g=window.__game;const T=g.camera;
   const order=['mbt','light_tank','ifv','apc','jeep'];
   const vs=(g.vehicles??[]).filter(v=>!v.destroyed);
   const v=order.map(k=>vs.find(v=>v.kind===k)).find(Boolean)??vs[0];
   const c=v.model.position.clone();c.y+=1;c.project(T);
   return {ndc:[c.x,c.y,c.z],inside:Math.abs(c.x)<1&&Math.abs(c.y)<1,kind:v.kind};}`);
  if(!framed.inside)fail('vehicle-framing',framed);
  await shot(page,'ultra-vehicle.png');
 }else fail('vehicle-spot','no vehicles');

 const corner=await ev(page,`async()=>{const m=await import('/src/maps/index.ts');
  const def=m.getMap('garden');const g=window.__game;
  for(const c of def.covers??[]){
   const cx=c.x??c.position?.[0],cz=c.y??c.position?.[1];
   if(!Number.isFinite(cx))continue;
   const py=g.arena.heightAt(cx-2.5,cz-2.5);
   return {x:cx,z:cz,px:cx-2.5,pz:cz-2.5,py};
  }return null;}`);
 if(corner){
  const aim=yawPitchTo(corner.x-corner.px,-1.2,corner.z-corner.pz);
  await pose(page,corner.px,corner.py+0.1,corner.pz,aim.yaw,aim.pitch);
  await ev(page,`()=>{const c=window.__game.presentation.cinematicPipeline;c.lightingMaterial.uniforms.aoStrength.value=0.65;}`);
  await page.waitForTimeout(200);
  await shot(page,'ultra-ao-on.png');
  await ev(page,`()=>{const c=window.__game.presentation.cinematicPipeline;c.lightingMaterial.uniforms.aoStrength.value=0;}`);
  await page.waitForTimeout(200);
  await shot(page,'ultra-ao-off.png');
  await ev(page,`()=>{const c=window.__game.presentation.cinematicPipeline;c.lightingMaterial.uniforms.aoStrength.value=0.65;}`);
 }

 const hideStyle=`()=>{const s=document.createElement('style');s.id='audit-hide';
  s.textContent='.game-hud,.nameplate-layer,.prep-overlay,.pause-backdrop{display:none!important}';
  document.head.appendChild(s);}`;
 const unhide=`()=>{document.getElementById('audit-hide')?.remove();}`;
 const rotateOn=`()=>{const g=window.__game;const orig=g.renderFrame.bind(g);
  g.renderFrame=(n)=>{g.controller.yaw+=0.045;orig(n);};
  window.__auditUnwind=()=>{g.renderFrame=orig;};}`;
 const rotateOff=`()=>{window.__auditUnwind?.();delete window.__auditUnwind;}`;

 await pose(page,cam.x,cam.y,cam.z,away.yaw,0);
 await ev(page,rotateOn);
 await page.waitForTimeout(350);
 const blurSeq:any={during:await ev(page,`()=>window.__game.presentation.cinematicPipeline?.blurMaterial?.uniforms?.strength?.value??0`)};
 await shot(page,'ultra-motion.png');
 await ev(page,rotateOff);
 if(!(blurSeq.during>0))fail('motion-blur-strength',blurSeq);

 await ev(page,unhide);
 await setQuality(page,'ultra',false);
 await ev(page,hideStyle);
 await pose(page,cam.x,cam.y,cam.z,away.yaw,0);
 await ev(page,rotateOn);
 await page.waitForTimeout(350);
 blurSeq.offDuring=await ev(page,`()=>window.__game.presentation.cinematicPipeline?.blurMaterial?.uniforms?.strength?.value??-1`);
 await shot(page,'ultra-motion-off.png');
 await ev(page,rotateOff);
 if(blurSeq.offDuring!==0)fail('motion-blur-off-strength',blurSeq);
 fs.writeFileSync(path.join(outDir,'ultra-motion-state.json'),JSON.stringify(blurSeq,null,2));
 await ev(page,unhide);
 await setQuality(page,'ultra',true);
 await ev(page,hideStyle);
 const blurAfter=await ev(page,`async()=>{const g=window.__game;
  const vals=[];const orig=g.renderFrame.bind(g);
  g.renderFrame=(n)=>{orig(n);vals.push(g.presentation.cinematicPipeline?.blurMaterial?.uniforms?.strength?.value);};
  g.presentation.requestMotionReset();
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  g.renderFrame=orig;return vals.slice(0,3);}`);
 if(blurAfter[0]!==0)fail('motion-reset-strength',blurAfter);
 const blurPause=await ev(page,`async()=>{const g=window.__game;
  const vals=[];const orig=g.renderFrame.bind(g);
  g.renderFrame=(n)=>{orig(n);vals.push(g.presentation.cinematicPipeline?.blurMaterial?.uniforms?.strength?.value);};
  g.pauseLocal();
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  g.paused=false;g.renderFrame=orig;return vals.slice(0,3);}`);
 if(blurPause[0]!==0)fail('motion-pause-strength',blurPause);

 const fb=await ev(page,`()=>{const g=window.__game;const c=g.presentation.cinematicPipeline;
  if(!c)return {skipped:true};const r=g.renderer;const gl=r.getContext();const out={};
  for(const [k,t] of Object.entries({world:c.world,lighting:c.lighting,work:c.work,hands:c.hands})){
   r.setRenderTarget(t);out[k]=gl.checkFramebufferStatus(gl.FRAMEBUFFER);}
  r.setRenderTarget(null);out.samples=c.world.samples;out.lightingSamples=c.lighting.samples;
  out.ok=Object.entries(out).filter(([k])=>!k.endsWith('amples')).every(([,v])=>v===36053);return out;}`);
 if(!fb.ok&&!fb.skipped)fail('framebuffer',fb);
 fs.writeFileSync(path.join(outDir,'framebuffer.json'),JSON.stringify(fb,null,2));

 await ev(page,`()=>{const g=window.__game;g.forceStart();g.armed=true;g.viewmodel.setEquipped(true);}`);
 await page.waitForTimeout(400);
 await pose(page,cam.x,cam.y,cam.z,away.yaw,0);
 await shot(page,'ultra-weapon.png');
 const baseFov=await ev(page,`()=>window.__game.camera.fov`);
 const adsReady=()=>((window as any).__game?.viewmodel?.adsAmount??0)>0.95;
 for(let attempt=0;attempt<3;attempt++){
  await ev(page,`()=>{const g=window.__game;g.paused=false;g.overlayOpen=false;g.input.mouse.right=false;g.adsIntent=false;}`);
  await page.waitForTimeout(150);
  await ev(page,`()=>{const g=window.__game;g.input.pointerLocked=true;g.input.mouse.right=true;}`);
  const ok=await page.waitForFunction(adsReady,null,{timeout:3000}).then(()=>true).catch(()=>false);
  if(ok)break;
 }
 const adsState=await ev(page,`async()=>{const g=window.__game;
  const seq=[];
  for(let i=0;i<8;i++){seq.push(g.adsIntent);await new Promise(r=>setTimeout(r,40));}
  return{ads:g.viewmodel?.adsAmount??0,fov:g.camera.fov,phase:g.phase,dead:g.dead,paused:g.paused,
   overlay:g.overlayOpen,mapOpen:g.mapOpen,locked:g.input.pointerLocked,right:g.input.mouse.right,
   suspended:g.hostSuspended,winner:String(g.winner),seq,armed:g.armed,
   adsIntent:g.adsIntent,aiming:g.controller?.aiming,driving:!!g.drivingId};}`);
 if(!(adsState.ads>.95&&adsState.fov<baseFov-1))fail('ads-state',{adsState,baseFov});
 await shot(page,'ultra-weapon-ads.png');
 await ev(page,`()=>{const g=window.__game;g.input.mouse.right=false;g.input.pointerLocked=false;g.adsIntent=false;}`);
 await page.waitForTimeout(300);

 const corpse=await ev(page,`()=>{const g=window.__game;const c=g.cinematicShadows;
  if(!c)return{skipped:true};
  const V=g.controller.position.constructor;
  const base=c.counts;
  for(let i=0;i<100;i++){
   const id='audit-corpse-'+i;
   g.createBody(id,'blue',g.controller.position.clone(),0,false,new V(0,0,0),0,false);
   g.removeBody(id,g.bodies.get(id));
  }
  return{base,after:c.counts};}`);
 if(!corpse.skipped&&(corpse.base.meshes!==corpse.after.meshes||corpse.base.materials!==corpse.after.materials))fail('corpse-tracking',corpse);

 await ev(page,unhide);

 const cycles:any[]=[];
 for(let i=0;i<3;i++){
  const states:any[]=[];
  for(const q of ['ultra','off','high','ultra'] as const){
   await setQuality(page,q,q==='ultra'?true:undefined);
   const st=await stateOf(page);
   states.push({q,effective:st.effective?.effective,cinematic:st.cinematic,shadowMap:st.shadowMapEnabled,glow:st.glow,ao:st.voxelAo?.enabled});
   if(q==='off'&&(st.cinematic||st.effective?.effective!=='off'))fail('cycle-off-state',states.at(-1));
   if(q==='high'&&(st.cinematic||st.effective?.effective!=='high'))fail('cycle-high-state',states.at(-1));
   if(q==='ultra'&&!st.cinematic&&st.effective?.effective==='ultra')fail('cycle-ultra-state',states.at(-1));
  }
  const mem=await ev(page,`()=>({mem:window.__game.renderer.info.memory,progs:window.__game.renderer.info.programs?.length})`);
  cycles.push({cycle:i,states,mem});
 }
 fs.writeFileSync(path.join(outDir,'cycles.json'),JSON.stringify(cycles,null,2));
 const tex=cycles.map((c)=>c.mem.mem.textures);
 if(tex[2]>tex[0]+12)fail('texture-leak',tex);

 for(const q of ['high','ultra'] as const){
  await setQuality(page,q,q==='ultra'?true:undefined);
  await page.waitForTimeout(400);
  const frames=await ev(page,`async()=>{const g=window.__game;
   const out=[];const orig=g.renderFrame.bind(g);
   g.renderFrame=(n)=>{orig(n);out.push({t:performance.now(),calls:g.renderer.info.render.calls,tris:g.renderer.info.render.triangles});};
   await new Promise((res)=>{let n=0;const tick=()=>{if(++n>=130){g.renderFrame=orig;res(0);}else requestAnimationFrame(tick);};requestAnimationFrame(tick);});
   g.renderFrame=orig;return out.slice(-120);}`);
  fs.writeFileSync(path.join(outDir,`frames-${q}.json`),JSON.stringify(frames,null,2));
 }

 const fallback=await ev(page,`async()=>{const g=window.__game;const ext=g.renderer.extensions;
  const orig=ext.has.bind(ext);ext.has=(n)=>n==='EXT_color_buffer_float'?false:orig(n);
  g.applyGraphics();await new Promise(r=>setTimeout(r,300));
  const st=g.lightingDebug();
  ext.has=orig;return {effective:st.effective,status:st.status,cinematic:g.presentation.cinematicActive};}`);
 fs.writeFileSync(path.join(outDir,'fallback.json'),JSON.stringify(fallback,null,2));
 if(fallback.effective!=='high'||fallback.cinematic||!fallback.status)fail('hdr-fallback',fallback);
 await ev(page,`()=>window.__game.applyGraphics()`);

 if(errors.length)fail('console-errors',errors.slice(0,20));
 await page.close();
}

if(phase==='all'){
{
 const ctx=await browser.newContext({viewport:{width:800,height:450},deviceScaleFactor:2});
 const page=await ctx.newPage();
 const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
 await page.addInitScript('window.__name = (v) => v');
 await page.goto(url('map=garden&prep=999&bots=0&seed=1106'));
 await page.waitForTimeout(700);
 await page.locator('.lobby-solo').click();
 await page.waitForFunction(()=>!!(window as any).__game,null,{timeout:90000});
 await page.waitForFunction(()=>!document.querySelector('.game-loading'),null,{timeout:90000});
 await setQuality(page,'ultra',true);
 await page.waitForTimeout(600);
 const st=await stateOf(page);
 if(st.canvas.w!==1600||st.canvas.h!==900)fail('dpr2-canvas',st.canvas);
 if(st.pipeline?.world&&(st.pipeline.world.width!==1600||st.pipeline.world.height!==900))fail('dpr2-world',st.pipeline);
 await shot(page,'dpr2-ultra.png');
 fs.writeFileSync(path.join(outDir,'dpr2-state.json'),JSON.stringify(st,null,2));
 if(errors.length)fail('dpr2-errors',errors.slice(0,10));
 await ctx.close();
}
{
 const ctx=await browser.newContext({viewport:{width:801,height:451},deviceScaleFactor:1.5});
 const page=await ctx.newPage();
 const errors:string[]=[];page.on('pageerror',(e:Error)=>errors.push(e.message));
 await page.addInitScript('window.__name = (v) => v');
 await page.goto(url('map=garden&prep=999&bots=0&seed=1106'));
 await page.waitForTimeout(700);
 await page.locator('.lobby-solo').click();
 await page.waitForFunction(()=>!!(window as any).__game,null,{timeout:90000});
 await page.waitForFunction(()=>!document.querySelector('.game-loading'),null,{timeout:90000});
 await setQuality(page,'ultra',true);
 await page.waitForTimeout(600);
 const st=await stateOf(page);
 if(st.canvas.w!==1201||st.canvas.h!==676)fail('dpr15-canvas',st.canvas);
 if(st.pipeline?.world&&(st.pipeline.world.width!==1201||st.pipeline.world.height!==676))fail('dpr15-world',st.pipeline);
 await shot(page,'dpr15-ultra.png');
 fs.writeFileSync(path.join(outDir,'dpr15-state.json'),JSON.stringify(st,null,2));
 if(errors.length)fail('dpr15-errors',errors.slice(0,10));
 await ctx.close();
}
const smoke:any={};
for(const q of ['map=docks','map=broken_bridge','map=garden','map=airfield','map=pharaoh','']){
 const {page,errors}=await openGame(browser,`prep=999&bots=0&seed=1106${q?'&'+q:''}`);
 await page.waitForTimeout(1200);
 await setQuality(page,'ultra',true);
 await page.waitForTimeout(1200);
 const st=await stateOf(page);
 const name=q?q.split('=')[1]:'training';
 smoke[name]={st,errors:errors.slice(0,15)};
 if(errors.length)fail(`smoke-${name}`,errors.slice(0,10));
 if(st.effective?.effective!=='ultra'&&st.effective?.effective!=='high')fail(`smoke-${name}-tier`,st.effective);
 await shot(page,`smoke-${name}.png`);
 await page.close();
}
fs.writeFileSync(path.join(outDir,'smoke.json'),JSON.stringify(smoke,null,2));
}

await browser.close();
fs.writeFileSync(path.join(outDir,'failures.json'),JSON.stringify(failures,null,2));
if(failures.length){console.log(`FAILURES(${failures.length}):`);for(const f of failures)console.log(' -',f);process.exitCode=1;}
else console.log(`PASS: lighting regression evidence in ${outDir}`);
