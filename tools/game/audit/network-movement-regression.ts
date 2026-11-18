import fs from 'node:fs';
import {chromium} from 'playwright';
import {browserExecutable} from './browser';

const out=process.argv[2]??`tmp/network-movement-${Date.now()}`;
fs.mkdirSync(out,{recursive:true});
const launch={headless:true,executablePath:browserExecutable(),args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion']};
const browsers=await Promise.all([0,1,2].map(()=>chromium.launch(launch)));
const pages=await Promise.all(browsers.map(b=>b.newPage({viewport:{width:800,height:600}})));
const [host,...guests]=pages,errors:string[]=[],checks:any[]=[];
try{
 for(const [i,p] of pages.entries()){
  p.on('pageerror',e=>errors.push(`${i}: ${e.message}`));
  await p.addInitScript("window.__name=v=>v;localStorage.setItem('crazyshoot.bots','0')");
 }
 const url=(process.env.CRAZYSHOOT_BASE_URL??'http://127.0.0.1:5174')+`/game.html?map=docks&size=${process.env.CRAZYSHOOT_MOVEMENT_SIZE??4}&prep=999&seed=1106&audit=1&bots=${process.env.CRAZYSHOOT_MOVEMENT_BOTS??0}&quality=low`;
 await Promise.all(pages.map(p=>p.goto(url)));
 await host.locator('.lobby-primary').first().click();
 await host.waitForFunction(()=>/^\d{4}$/.test(document.querySelector('.lobby-code')?.textContent?.trim()??''));
 const code=(await host.locator('.lobby-code').textContent())!.trim();
 for(const p of guests){await p.locator('.lobby-input.code').fill(code);await p.locator('.lobby-secondary').click();}
 await host.waitForFunction(()=>{const b=document.querySelector('.lobby-primary.start') as HTMLButtonElement;return b&&!b.disabled;});
 await host.waitForTimeout(600);
 await host.locator('.lobby-primary.start').click();
 await Promise.all(pages.map(p=>p.waitForFunction(()=>(window as any).__game?.worldReady,null,{timeout:90000})));
 await host.evaluate(()=>(window as any).__game.forceStart());
 await Promise.all(guests.map(p=>p.waitForFunction(()=>(window as any).__game?.phase==='live')));
 for(const p of pages)await p.evaluate(()=>{
  const g=(window as any).__game;
  window.removeEventListener('blur',g.blurHandler);document.removeEventListener('visibilitychange',g.visibilityHandler);document.removeEventListener('pointerlockchange',g.lockHandler);document.removeEventListener('webkitpointerlockchange',g.lockHandler);
  g.paused=false;g.overlayOpen=false;g.input.pointerLocked=true;
  (window as any).movementTrace=[];(window as any).ackTrace=[];(window as any).snapshotViewJumps=[];
  const receive=g.receiveNet.bind(g);
  g.receiveNet=(data:any,from:string)=>{
   if(data.t==='snap'){
    const st=data.states?.find((s:any)=>s.id===g.localNetId),sample=g.predictedAtSeq.find((s:any)=>s.seq===st?.ackInput);
    if(sample)(window as any).ackTrace.push({at:performance.now(),seq:st.ackInput,error:Math.hypot(st.p[0]-sample.x,st.p[1]-sample.y,st.p[2]-sample.z),p:st.p,pred:[sample.x,sample.y,sample.z]});
   }
   const before=g.camera.position.clone(),yaw=g.camera.rotation.y,pitch=g.camera.rotation.x;
   receive(data,from);
   if(data.t==='snap'&&(window as any).movementMode)(window as any).snapshotViewJumps.push({position:g.camera.position.distanceTo(before),angle:Math.max(Math.abs(g.camera.rotation.y-yaw),Math.abs(g.camera.rotation.x-pitch))});
  };
  (window as any).observerTrace=[];
  const remotes=g.updateRemotes.bind(g);
  g.updateRemotes=(dt:number)=>{remotes(dt);if((window as any).observeMovement)(window as any).observerTrace.push({dt,actors:[...g.remotes.values()].filter((r:any)=>!r.id.startsWith('bot-')).map((r:any)=>({id:r.id,p:r.rig.root.position.toArray(),yaw:r.renderedYaw??r.yaw}))});};
  const simulate=g.simulate.bind(g);
  g.simulate=(dt:number)=>{
   const mode=(window as any).movementMode;
   if(mode){
    const t=((window as any).movementTick++),input=g.input;input.keys.clear();
    if(t<600)input.keys.add('KeyW');
    if(mode==='turn'&&t<600)input.mouse.dx+=t%120<60?5:-5;
    if(mode==='jump'&&t<600&&t%70<3)input.keys.add('Space');
    if(mode==='stance'&&t<600&&t%150<75)input.keys.add('ControlLeft');
   }
   simulate(dt);
   if(mode)(window as any).movementTrace.push({at:performance.now(),seq:g.inputSequence,p:g.controller.position.toArray(),eye:g.camera.position.toArray(),yaw:g.controller.yaw,offset:g.predictionOffset.toArray(),wire:[...g.net.links.values()].map((l:any)=>({state:l.stateChannel?.readyState,buffer:l.stateChannel?.bufferedAmount})),pending:g.pendingInputs.length,ack:g.lastReconciledInputSeq,grounded:g.controller.grounded});
  };
 });
 checks.push({id:'three-independent-browsers',pass:true,...await host.evaluate(()=>{const g=(window as any).__game;return {players:g.hosted.size+1,bots:[...g.hosted.values()].filter((h:any)=>h.bot).length};})});
 const ids=await Promise.all(guests.map(p=>p.evaluate(()=>(window as any).__game.localNetId)));
 for(const p of pages)await p.evaluate(({delay,jitter,drop,relay}:{delay:number;jitter:number;drop:boolean;relay:boolean})=>{
  const g=(window as any).__game,original=g.net.send.bind(g.net);let n=0;
  const send=(data:any)=>relay&&['inputs','snap'].includes(data.t)?g.net.signaling.relay(data,g.isHost?undefined:g.net.hostId):original(data);
  (window as any).movementDrop=drop;
  if(delay)g.net.send=(data:any)=>{if(data.t==='inputs'||data.t==='snap'){n++;if((window as any).movementDrop&&n%19===0)return;setTimeout(()=>send(data),delay+(n%5)*jitter);}else send(data);};
 },{delay:Number(process.env.CRAZYSHOOT_MOVEMENT_DELAY??0),jitter:Number(process.env.CRAZYSHOOT_MOVEMENT_JITTER??2),drop:process.env.CRAZYSHOOT_MOVEMENT_DROP==='1',relay:process.env.CRAZYSHOOT_MOVEMENT_TRANSPORT==='relay'});
 for(const mode of (process.env.CRAZYSHOOT_MOVEMENT_MODES??'straight,turn,jump,stance').split(',')){
  await Promise.all(pages.map(p=>p.evaluate(()=>{(window as any).observeMovement=false;})));
  await Promise.all(guests.map(p=>p.evaluate(()=>{(window as any).movementMode=null;(window as any).__game.input.clear();})));
  await host.evaluate((ids:string[])=>{
   const g=(window as any).__game,V=g.controller.position.constructor;
   g.protectedUntil=g.simulationNow+1000000;g.controller.teleport(new V(8,g.arena.navigationHeight(8,150),150),0);
   ids.forEach((id,i)=>{const h=g.hosted.get(id);h.protectedUntil=g.simulationNow+1000000;h.pendingInputs=[];h.controller.teleport(new V(15+i*7,g.arena.navigationHeight(15+i*7,150),150),0);h.yaw=0;h.input.clear();});
  },ids);
  await Promise.all(guests.map(p=>p.waitForFunction(()=>Math.abs((window as any).__game.controller.position.z-150)<.1)));
  await host.waitForTimeout(800);
  await Promise.all(guests.map(p=>p.evaluate(()=>{(window as any).__game.controller.yaw=0;})));
  await host.waitForTimeout(1200);
  await Promise.all(guests.map(p=>p.evaluate((mode:string)=>{(window as any).movementTrace=[];(window as any).ackTrace=[];(window as any).snapshotViewJumps=[];(window as any).movementTick=0;(window as any).movementMode=mode;},mode)));
  await Promise.all(pages.map(p=>p.evaluate(()=>{(window as any).observerTrace=[];(window as any).observeMovement=true;})));
  await host.waitForTimeout(12000);
  for(const [i,p] of guests.entries()){
   const trace=await p.evaluate(()=>({frames:(window as any).movementTrace,acks:(window as any).ackTrace,viewJumps:(window as any).snapshotViewJumps}));
   fs.writeFileSync(`${out}/${mode}-guest${i+1}.json`,JSON.stringify(trace));
   let worstReverse=0,worstStep=0;for(let j=1;j<trace.frames.length;j++){
    const a=trace.frames[j-1],b=trace.frames[j],dx=b.eye[0]-a.eye[0],dz=b.eye[2]-a.eye[2];
    if(b.seq-a.seq!==1)continue;
    if(j<580)worstReverse=Math.max(worstReverse,dx*Math.sin(b.yaw)+dz*Math.cos(b.yaw));
    worstStep=Math.max(worstStep,Math.hypot(dx,dz));
   }
   const maxViewSnap=Math.max(0,...trace.viewJumps.map((x:any)=>x.position)),maxViewAngle=Math.max(0,...trace.viewJumps.map((x:any)=>x.angle));
   const maxAckError=Math.max(0,...trace.acks.map((a:any)=>a.error)),maxPending=Math.max(0,...trace.frames.map((a:any)=>a.pending));
   const result={mode,guest:i+1,samples:trace.frames.length,distance:trace.frames[0]?.p[2]-trace.frames.at(-1)?.p[2],worstReverse,worstStep,maxAckError,maxPending,maxViewSnap,maxViewAngle,pass:maxViewSnap<1e-6&&maxViewAngle<1e-6&&trace.frames.length>360&&worstReverse<.04&&worstStep<.25&&maxAckError<.15&&maxPending<Math.max(60,Number(process.env.CRAZYSHOOT_MOVEMENT_DELAY??0)*.3)};
   checks.push(result);console.log(JSON.stringify(result));
  }
  for(const [node,p] of pages.entries()){
   const frames=await p.evaluate(()=>(window as any).observerTrace);
   fs.writeFileSync(`${out}/${mode}-observer${node}.json`,JSON.stringify(frames));
   let maxStep=0,maxAngle=0,worstReverse=0;
   for(let i=1;i<frames.length;i++)for(const a of frames[i-1].actors){
    const b=frames[i].actors.find((b:any)=>b.id===a.id);if(!b)continue;
    const dx=b.p[0]-a.p[0],dz=b.p[2]-a.p[2];maxStep=Math.max(maxStep,Math.hypot(dx,dz));
    maxAngle=Math.max(maxAngle,Math.abs(Math.atan2(Math.sin(b.yaw-a.yaw),Math.cos(b.yaw-a.yaw))));
    if(mode==='straight')worstReverse=Math.max(worstReverse,dx*Math.sin(b.yaw)+dz*Math.cos(b.yaw));
   }
   const result={mode,node,observer:true,samples:frames.length,maxStep,maxAngle,worstReverse,pass:frames.length>150&&maxStep<.5&&maxAngle<.35&&worstReverse<.04};
   checks.push(result);console.log(JSON.stringify(result));
  }
 }
}finally{await Promise.all(browsers.map(b=>b.close()));fs.writeFileSync(`${out}/report.json`,JSON.stringify({checks,errors},null,2));}
if(errors.length||checks.some(c=>!c.pass))process.exitCode=1;
