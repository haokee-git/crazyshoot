import * as THREE from 'three';
export type ArmorClass = 'soft' | 'light' | 'medium' | 'heavy';
export interface ProjectileDef {
  id:string;muzzleVelocity:number;gravityScale:number;drag:number;maxLife:number;maxRange:number;damage:number;
  falloffStart:number;minDamageScale:number;armor:'bullet'|'ap'|'he';lethalHit?:'torso'|'any';
  /** Hit-zone multipliers relative to the base damage. */
  limbScale?:number;armorScale?:number;
  /** 按装甲等级分档的系数（覆盖单一 armorScale）；soft 走软目标逻辑。 */
  armorClassScale?:Partial<Record<Exclude<ArmorClass,'soft'>,number>>;
  splash?:number;splashInner?:number;splashDamage?:number;
  /** 载具武器散布（半角，弧度）：首发值 / 每发增量 / 上限 / 回落速度（弧度每秒）。 */
  spread?:number;spreadGrowth?:number;spreadMax?:number;spreadRecover?:number;spreadRecoverDelay?:number;
}
// Game balance values in metres/seconds, not claims about measured real ammunition.
export const AMMO:Record<string,ProjectileDef>={
 rifle:{id:'rifle',muzzleVelocity:720,gravityScale:1,drag:0,maxLife:1.5,maxRange:350,damage:26,falloffStart:55,minDamageScale:.55,armor:'bullet',limbScale:.7},
 smg:{id:'smg',muzzleVelocity:360,gravityScale:1,drag:0,maxLife:1,maxRange:130,damage:21,falloffStart:25,minDamageScale:.4,armor:'bullet'},
 sniper:{id:'sniper',muzzleVelocity:850,gravityScale:1,drag:0,maxLife:2,maxRange:500,damage:95,falloffStart:200,minDamageScale:.8,armor:'bullet',limbScale:.7},
 // AMR anti-materiel rifle: 150 per hit on armoured hulls (100 x 1.5) with no range
 // falloff, so its 5-round magazine kills APC/IFV in 3, light tank in 5, MBT in 7.
 amr:{id:'amr',muzzleVelocity:880,gravityScale:1,drag:0,maxLife:2,maxRange:550,damage:100,falloffStart:240,minDamageScale:1,armor:'bullet',armorScale:1.5},
 pellet:{id:'pellet',muzzleVelocity:320,gravityScale:1,drag:0,maxLife:.3,maxRange:65,damage:14,falloffStart:12,minDamageScale:.15,armor:'bullet',limbScale:.7},
 vehicle_mg:{id:'vehicle_mg',muzzleVelocity:690,gravityScale:1,drag:0,maxLife:1.4,maxRange:280,damage:34,falloffStart:55,minDamageScale:.55,armor:'bullet',spread:.15*Math.PI/180,spreadGrowth:.01*Math.PI/180,spreadMax:.6*Math.PI/180,spreadRecover:.5*Math.PI/180,spreadRecoverDelay:.5},
 // 30 mm 机关炮：连射主武器，穿甲按轻/中/重装甲分档；HE 对主战几乎无效。
 ac30_ap:{id:'ac30_ap',muzzleVelocity:300,gravityScale:1,drag:0,maxLife:2.2,maxRange:520,damage:32,falloffStart:260,minDamageScale:.85,armor:'ap',armorClassScale:{light:.40,medium:.18,heavy:.13},spread:.05*Math.PI/180,spreadGrowth:.012*Math.PI/180,spreadMax:.25*Math.PI/180,spreadRecover:.4*Math.PI/180,spreadRecoverDelay:.8},
 ac30_he:{id:'ac30_he',muzzleVelocity:240,gravityScale:1,drag:0,maxLife:2,maxRange:420,damage:24,falloffStart:200,minDamageScale:.8,armor:'he',armorClassScale:{light:.30,medium:.12,heavy:.06},splash:8,splashInner:2,splashDamage:48,spread:.05*Math.PI/180,spreadGrowth:.012*Math.PI/180,spreadMax:.25*Math.PI/180,spreadRecover:.4*Math.PI/180,spreadRecoverDelay:.8},
 ap:{id:'ap',muzzleVelocity:230,gravityScale:1,drag:0,maxLife:4,maxRange:650,damage:360,falloffStart:300,minDamageScale:.8,armor:'ap',splash:15,splashInner:5,splashDamage:112,spread:.03*Math.PI/180,spreadGrowth:0,spreadMax:.03*Math.PI/180,spreadRecover:0},
 he:{id:'he',muzzleVelocity:180,gravityScale:1,drag:0,maxLife:4,maxRange:500,damage:240,falloffStart:250,minDamageScale:.75,armor:'he',splash:20,splashInner:5,splashDamage:158,spread:.03*Math.PI/180,spreadGrowth:0,spreadMax:.03*Math.PI/180,spreadRecover:0},
};
export function blastDamage(distance:number,inner:number,outer:number,peak:number){
 const falloff=THREE.MathUtils.clamp((distance-inner)/Math.max(.01,outer-inner),0,1);
 return peak*Math.pow(1-falloff,1.45);
}
export function trajectory(origin:THREE.Vector3,velocity:THREE.Vector3,def:ProjectileDef,time:number,out=new THREE.Vector3()){
 if(!def.drag)return out.copy(origin).addScaledVector(velocity,time).addScaledVector(new THREE.Vector3(0,-9.81*def.gravityScale,0),time*time/2);
 const k=def.drag,f=(1-Math.exp(-k*time))/k;return out.copy(origin).addScaledVector(velocity,f).addScaledVector(new THREE.Vector3(0,-9.81*def.gravityScale,0),(time-f)/k);
}
export const IMPACT_STREAK_SECONDS=.055;
export interface Projectile {
 active:boolean;visibleFor:number;id:number;shooter:string;origin:THREE.Vector3;velocity:THREE.Vector3;
 position:THREE.Vector3;age:number;distance:number;def:ProjectileDef;
 effect?:{id:number;delay:number;stopDistance?:number};
}
export class ProjectilePool {
 readonly items:Projectile[]=[];
 private id=0;
 private end=new THREE.Vector3();
 private dir=new THREE.Vector3();
 constructor(readonly capacity=512){}

 spawn(shooter:string,origin:THREE.Vector3,direction:THREE.Vector3,def:ProjectileDef,effectId?:number){
  let p=this.items.find(p=>!p.active&&p.visibleFor<=0);
  if(!p&&this.items.length<this.capacity){
   p={active:false,visibleFor:0,id:0,shooter:'',origin:new THREE.Vector3(),velocity:new THREE.Vector3(),
      position:new THREE.Vector3(),age:0,distance:0,def};
   this.items.push(p);
  }
  p??=this.items.find(p=>!p.active);
  if(!p)return null;
  Object.assign(p,{active:true,visibleFor:0,id:++this.id,shooter,age:0,distance:0,def});
  // A short presentation buffer lets the authoritative impact reach guests before a nearby tracer.
  p.effect=effectId===undefined?undefined:{id:effectId,delay:2/60};
  p.origin.copy(origin);
  p.position.copy(origin);
  p.velocity.copy(direction).normalize().multiplyScalar(def.muzzleVelocity);
  return p;
 }

 update(dt:number,sweep:(p:Projectile,dir:THREE.Vector3,length:number)=>number,onHit:(p:Projectile)=>void){
  for(const p of this.items){
   if(!p.active){p.visibleFor=Math.max(0,p.visibleFor-dt);continue;}
   if(p.effect&&p.effect.delay>0){p.effect.delay-=dt;continue;}
   const age=Math.min(p.age+dt,p.def.maxLife);
   trajectory(p.origin,p.velocity,p.def,age,this.end);
   this.dir.subVectors(this.end,p.position);
   const full=this.dir.length(),len=Math.min(full,p.def.maxRange-p.distance);
   if(full<1e-9){p.active=false;continue;}
   this.dir.multiplyScalar(1/full);
   const hit=sweep(p,this.dir,len);
   if(Number.isFinite(hit)&&hit<=len){
    p.position.addScaledVector(this.dir,hit);
    p.distance+=hit;
    p.age+=(age-p.age)*hit/full;
    p.active=false;
    p.visibleFor=p.def.armor==='bullet'?IMPACT_STREAK_SECONDS:0;
    onHit(p);
   }else{
    p.position.addScaledVector(this.dir,len);
    p.distance+=len;
    p.age=age;
    if(age>=p.def.maxLife||p.distance>=p.def.maxRange)p.active=false;
   }
  }
 }
}
