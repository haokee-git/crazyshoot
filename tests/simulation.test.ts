import {mappedKeyDown,canonicalKeyCodes} from '../src/game/core/input';
import { describe,it,expect } from 'vitest';
import * as THREE from 'three';
import { advanceAxis,hullYawRate,advanceVehicleSpeed,angleDelta,pedestrianImpactDamage } from '../src/game/vehicles/controller';
import { AMMO,ProjectilePool,trajectory,blastDamage } from '../src/game/combat/projectiles';
import { rayBoxDistance,WorldQueries } from '../src/game/world/queries';
import { SimulationClock,RenderScheduler,unsimulatedGapMs } from '../src/game/core/simulation-clock';
import { PlayerController } from '../src/game/player/controller';
import { WeaponRecoil } from '../src/game/weapons/recoil';
import {WEAPONS} from '../src/content/weapons/catalog';
import { SunShadows } from '../src/game/world/sun-shadows';
import {planVehicleRoute} from '../src/game/ai/vehicle-navigation';
import type { Arena } from '../src/game/world/arena';
const ground=new WorldQueries([{x:0,z:5,w:4,d:.03,rot:0,bottom:0,top:3}],()=>0);
describe('authoritative world queries',()=>{
 it('hits a 3cm wall without skipping it and respects vertical extent',()=>{expect(ground.ray(new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),100)).toBeCloseTo(4.985,4);expect(ground.ray(new THREE.Vector3(0,100,0),new THREE.Vector3(0,0,1),100)).toBe(Infinity);});
 it('supports the top only when reachable and allows walking below a bridge',()=>{const q=new WorldQueries([{x:0,z:0,w:4,d:4,rot:0,bottom:2,top:2.5}],()=>-3);expect(q.support(0,0,0)).toBe(-3);expect(q.support(0,0,2.6)).toBe(2.5);expect(q.blocked(0,0,.3,-3)).toBe(false);});
 it('catches a grazing bilinear terrain peak between segment sample points',()=>{const q=new WorldQueries([], (x,z)=>x-x*z/4),dir=new THREE.Vector3(1,0,1).normalize();const distance=q.ray(new THREE.Vector3(0,.99999,0),dir,4);expect(distance).toBeCloseTo((2-Math.sqrt(.00004))*Math.SQRT2,5);});
 it('uses rotated 3D hull bounds',()=>{expect(rayBoxDistance(new THREE.Vector3(0,1,-10),new THREE.Vector3(0,0,1),{x:0,z:0,w:2,d:6,rot:Math.PI/2,bottom:0,top:2})).toBeCloseTo(9);});
});
describe('tracked driving and finite turret mechanics',()=>{
 it('turns W+A/W+D and S+A/S+D in opposite yaw directions',()=>{expect(hullYawRate(3,1,6,true)).toBeGreaterThan(0);expect(hullYawRate(3,-1,6,true)).toBeLessThan(0);expect(hullYawRate(-3,1,6,true)).toBeLessThan(0);expect(hullYawRate(-3,-1,6,true)).toBeGreaterThan(0);});
 it('uses actual forward inertia and permits stopped track rotation',()=>{expect(hullYawRate(2,1,6,true)).toBeGreaterThan(0);expect(hullYawRate(0,1,6,true)).toBeGreaterThan(0);expect(hullYawRate(0,1,13,false)).toBe(0);});
 it('keeps momentum after releasing the throttle and widens fast turns',()=>{
  expect(advanceVehicleSpeed(12,0,19,.5,false)).toBeGreaterThan(11);
  expect(advanceVehicleSpeed(12,-1,19,.5,false)).toBeGreaterThan(8);
  expect(hullYawRate(18,1,19,false)).toBeLessThan(hullYawRate(6,1,19,false)/2);
 });
 it('routes an armored hull around a wall too narrow for it to pass through',()=>{
  const q=new WorldQueries([{x:20,z:20,w:22,d:1,rot:0,bottom:0,top:3}],()=>0);
  const arena={bounds:{minX:0,maxX:40,minZ:0,maxZ:40},navigationHeight:()=>0,
    footprintBlocked:q.footprintBlocked.bind(q)} as unknown as Arena;
  const path=planVehicleRoute(arena,{x:20,z:8},{x:20,z:32},{w:2.8,d:5.3,h:2.3},3);
  expect(path.at(-1)).toEqual({x:20,z:32});
  expect(path.some(p=>p.x<=8||p.x>=32)).toBe(true);
 });
 it('takes shortest rotation across pi and stays within acceleration/speed/limits',()=>{const a={angle:Math.PI-.02,velocity:0};advanceAxis(a,-Math.PI+.02,1/60,.8,1.6,-Infinity,Infinity,true);expect(a.velocity).toBeCloseTo(1.6/60);expect(Math.abs(angleDelta(a.angle,Math.PI-.02))).toBeLessThan(.001);const p={angle:0,velocity:0};for(let i=0;i<600;i++)advanceAxis(p,2,1/60,.45,.9,-.16,.48);expect(p.angle).toBeCloseTo(.48);});
});
it('only pushes at parking speeds and gives fatal impacts at 40 km/h in either direction',()=>{
 expect(pedestrianImpactDamage(2)).toBe(0);
 expect(pedestrianImpactDamage(8)).toBeGreaterThan(0);
 expect(pedestrianImpactDamage(39.9/3.6)).toBeLessThan(100);
 expect(pedestrianImpactDamage(40/3.6)).toBeGreaterThanOrEqual(100);
 expect(pedestrianImpactDamage(-40/3.6)).toBeGreaterThanOrEqual(100);
});
it('reduces standing recoil for crouch and prone, with a stronger prone reduction for every equipped bipod',()=>{
 const shot=(weapon:string,crouched:boolean,prone:boolean)=>new WeaponRecoil().fire(weapon,true,crouched,()=>.5,prone);
 const standing=shot('m16',false,false).vertical,crouched=shot('m16',true,false).vertical,prone=shot('m16',false,true).vertical;
 expect(standing).toBeGreaterThan(crouched);
 expect(crouched).toBeGreaterThan(prone);
 expect(WEAPONS.filter(weapon=>weapon.bipod).map(weapon=>weapon.id)).toEqual(expect.arrayContaining(['mk14','m249']));
 for(const weapon of WEAPONS){
  const standing=shot(weapon.id,false,false).vertical;
  expect(shot(weapon.id,true,false).vertical/standing).toBeCloseTo(.76);
  expect(shot(weapon.id,false,true).vertical/standing).toBeCloseTo(weapon.bipod ? .28 : .48);
 }
});

describe('projectile flight',()=>{
 it.each([10,50,100])('has finite travel time and gravity at %dm',range=>{const def=AMMO.ap,t=range/def.muzzleVelocity,p=trajectory(new THREE.Vector3(0,10,0),new THREE.Vector3(0,0,def.muzzleVelocity),def,t);expect(p.z).toBeCloseTo(range);expect(p.y).toBeCloseTo(10-4.905*t*t);});
 it('has matching impact positions at 20/30/60 fps, sweeps a thin wall and reuses pool entries',()=>{const outcomes:number[][]=[];for(const fps of [20,30,60]){const pool=new ProjectilePool(1),clock=new SimulationClock(),def={...AMMO.ap,muzzleVelocity:100};let impact:THREE.Vector3|undefined;pool.spawn('a',new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),def);for(let i=0;i<fps;i++)clock.advance(1/fps,dt=>pool.update(dt,(p,d,len)=>ground.ray(p.position,d,len),p=>impact=p.position.clone()));expect(impact).toBeDefined();outcomes.push(impact!.toArray());pool.spawn('b',new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1),def);expect(pool.items.length).toBe(1);}expect(outcomes[0]).toEqual(outcomes[1]);expect(outcomes[1]).toEqual(outcomes[2]);});
 it('keeps HE lethal within five metres and falls to zero at twenty',()=>{
  const {splash,splashInner,splashDamage}=AMMO.he;
  const damage=(distance:number)=>blastDamage(distance,splashInner!,splash!,splashDamage!);
  expect(damage(5)).toBeGreaterThanOrEqual(100);
  expect(damage(12)).toBeLessThan(100);
  expect(damage(19)).toBeGreaterThan(0);
  expect(damage(20)).toBe(0);
 });
 it('never redirects an in-flight shot when intention changes',()=>{const pool=new ProjectilePool();const dir=new THREE.Vector3(0,0,1);const p=pool.spawn('tank',new THREE.Vector3(0,2,0),dir,AMMO.ap)!;dir.set(1,0,0);pool.update(.05,()=>Infinity,()=>{});expect(p.position.x).toBe(0);expect(p.position.z).toBeGreaterThan(0);});
});
describe('player movement',()=>{
 const make=()=>{const q=new WorldQueries([],()=>0);const arena={heightAt:()=>0,blocked:()=>false,blockedAt:()=>false,bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100}} as unknown as Arena;const p=new PlayerController(new THREE.PerspectiveCamera());p.position.set(0,0,0);return {p,arena};};
 it('does not automatically jump again while holding jump',()=>{const {p,arena}=make();const input={down:(k:string)=>k==='Space',consumeLook:()=>({x:0,y:0})};let max=0;for(let i=0;i<120;i++){p.update(1/60,input,arena,true);max=Math.max(max,p.position.y);}expect(max).toBeGreaterThan(1);expect(p.grounded).toBe(true);});
 it('slows aimed movement and keeps a visible walking gait',()=>{
  const {p,arena}=make();p.aiming=true;p.sprintAllowed=false;
  let sway=0;
  for(let i=0;i<120;i++){
   p.update(1/60,{down:k=>k==='KeyW'||k==='ShiftLeft',consumeLook:()=>({x:0,y:0})},arena,true);
   sway=Math.max(sway,Math.abs(p.bob));
  }
  expect(Math.hypot(p.velocity.x,p.velocity.z)).toBeCloseTo(2.35,3);
  expect(sway).toBeGreaterThan(.025);
 });
 it('sprint converges to 7.9m/s without an extra multiplier',()=>{const {p,arena}=make();for(let i=0;i<160;i++)p.update(1/60,{down:k=>k==='KeyW'||k==='ShiftLeft',consumeLook:()=>({x:0,y:0})},arena,true);expect(Math.hypot(p.velocity.x,p.velocity.z)).toBeCloseTo(7.9,2);});
});


describe('paused match clock',()=>{
 it('only advances match time for the part of a frame that is actually simulated',()=>{
  const step=1/60;
  expect(unsimulatedGapMs(1/60,step)).toBe(0);
  expect(unsimulatedGapMs(.5,step)).toBe(0);
  expect(unsimulatedGapMs(.6,step)).toBeCloseTo(100,6);
  // A tab frozen for a minute must not consume a minute of match time; only the
  // 0.5 s catch-up budget is simulated.
  expect(unsimulatedGapMs(60,step)).toBeCloseTo(59_500,6);
  const deadline=1_000_000+300_000;
  expect(deadline+unsimulatedGapMs(60,step)).toBeCloseTo(deadline+59_500,6);
 });
});

describe('render scheduling',()=>{it('maintains 30fps without accumulating RAF timestamp jitter',()=>{const limiter=new RenderScheduler();let frames=0;for(let i=0;i<3600;i++){const now=i*1000/60+Math.sin(i*1.7)*.65;if(limiter.due(now,30))frames++;}expect(frames).toBeGreaterThanOrEqual(1799);expect(frames).toBeLessThanOrEqual(1801);});});

describe('semantic rebinding',()=>{
 it('replaces default movement both locally and on the network',()=>{const bindings=new Map([['KeyW','KeyY'],['KeyS','KeyS']]);expect(mappedKeyDown(new Set(['KeyW']),bindings,'KeyW')).toBe(false);expect(canonicalKeyCodes(new Set(['KeyW']),bindings)).toEqual([]);expect(mappedKeyDown(new Set(['KeyY']),bindings,'KeyW')).toBe(true);expect(canonicalKeyCodes(new Set(['KeyY']),bindings)).toEqual(['KeyW']);});
 it('does not turn a rebound crouch shortcut into two actions',()=>{const bindings=new Map([['KeyW','KeyC'],['ControlLeft','ControlLeft']]);const keys=new Set(['KeyC']);expect(mappedKeyDown(keys,bindings,'KeyW')).toBe(true);expect(mappedKeyDown(keys,bindings,'KeyC')).toBe(false);expect(canonicalKeyCodes(keys,bindings)).toEqual(['KeyW']);});
 it('does not leak legacy crouch/sprint alternatives after rebinding',()=>{const bindings=new Map([['ControlLeft','KeyU'],['ShiftLeft','KeyI']]),keys=new Set(['KeyC','ControlRight','ShiftRight']);expect(canonicalKeyCodes(keys,bindings)).toEqual([]);expect(mappedKeyDown(keys,bindings,'KeyC')).toBe(false);expect(mappedKeyDown(keys,bindings,'ShiftRight')).toBe(false);});
 it('keeps the default forward command unchanged',()=>{const bindings=new Map([['KeyW','KeyW'],['ShiftLeft','ShiftLeft']]);expect(canonicalKeyCodes(new Set(['KeyW','ShiftLeft']),bindings)).toEqual(['KeyW','ShiftLeft']);});
});


it('reuses the sun shadow map while stationary and throttles updates for moving casters',()=>{
 const shadowMap={enabled:false,autoUpdate:true,needsUpdate:false,type:THREE.BasicShadowMap};
 const renderer={shadowMap,capabilities:{maxTextureSize:4096}} as unknown as THREE.WebGLRenderer;
 const light=new THREE.DirectionalLight();
 light.position.set(-120,100,80);
 const camera=new THREE.PerspectiveCamera(),actor=new THREE.Object3D();
 const shadows=new SunShadows(renderer,light);
 shadows.setQuality('fast');
 expect(shadowMap.enabled).toBe(true);
 expect(light.shadow.mapSize.x).toBe(1024);
 shadows.update(camera,0,[actor]);
 expect(shadowMap.needsUpdate).toBe(true);
 shadowMap.needsUpdate=false;
 shadows.update(camera,100,[actor]);
 expect(shadowMap.needsUpdate).toBe(false);
 actor.position.x=1;
 shadows.update(camera,110,[actor]);
 expect(shadowMap.needsUpdate).toBe(false);
 shadows.update(camera,200,[actor]);
 expect(shadowMap.needsUpdate).toBe(true);
 shadows.setQuality('off');
 expect(light.castShadow).toBe(false);
 expect(shadowMap.enabled).toBe(false);
});
