import {getWeapon} from '../../content/weapons/catalog';

/** Exact under-damped spring: an impulse changes velocity, never teleports pose. */
export class RecoilSpring {
 value=0;velocity=0;
 constructor(readonly frequency:number,readonly damping:number){}
 reset(){this.value=0;this.velocity=0;}
 impulse(peak:number){this.velocity+=peak*this.frequency*2.2;}
 update(dt:number){
  const w=this.frequency,z=this.damping,d=w*Math.sqrt(1-z*z),e=Math.exp(-z*w*dt),c=Math.cos(d*dt),s=Math.sin(d*dt);
  const x=this.value,v=this.velocity,b=(v+z*w*x)/d;
  this.value=e*(x*c+b*s);this.velocity=e*(v*c-(z*w*v+w*w*x)/d*s);
 }
}
export interface RecoilImpulse {vertical:number;horizontal:number;back:number;pitch:number;yaw:number;roll:number;}
const DEG=Math.PI/180;
const CAMERA_PITCH_GAIN = 2.2;
const CAMERA_YAW_GAIN = 1.5;
const GUN_BACK_GAIN = 1.45;
const GUN_ANGLE_GAIN = 1.35;
const PROFILES:Record<string,[number,number,number]>={
 m16:[.27,.29,.020],m4a1:[.25,.23,.018],akm:[.45,.34,.027],mp5:[.20,.17,.016],
 mk14:[.50,.26,.027],awm:[.88,.19,.040],amr:[1.45,.24,.060],uzi:[.18,.21,.017],vector:[.18,.19,.016],
 ump45:[.27,.23,.021],m870:[.69,.26,.045],m249:[.32,.32,.024],
 rpg:[1.55,.22,.075],flamethrower:[.05,.05,.004],
};
export class WeaponRecoil {
 readonly pitch=new RecoilSpring(24,.78);readonly yaw=new RecoilSpring(20,.72);
 private readonly rollShake = new RecoilSpring(46, .7);
 private sinceShot=10;private bias=0;private count=0;private weapon='';
 get cameraRoll(){return this.rollShake.value;}
 reset(){this.pitch.reset();this.yaw.reset();this.rollShake.reset();this.sinceShot=10;this.bias=0;this.count=0;this.weapon='';}
 update(dt:number){this.sinceShot+=dt;this.pitch.update(dt);this.yaw.update(dt);if(this.weapon==='m249')this.rollShake.update(dt);}
 fire(weapon:string,ads:boolean,crouched:boolean,random:()=>number=Math.random,prone=false):RecoilImpulse{
  if(weapon!==this.weapon){this.reset();this.weapon=weapon;}
  if(this.sinceShot>.32){this.count=0;this.bias=(random()-.5)*.5;}
  const [v,h,back]=PROFILES[weapon]??PROFILES.m16;
  // Short correlated groups feel like grip pressure, without a fixed left/right loop.
  this.bias=Math.max(-.8,Math.min(.8,this.bias*.58+(random()*2-1)*.48));
  const side=this.bias*.62+(random()*2-1)*.48,variation=.82+random()*.36;
  const proneScale=getWeapon(weapon)?.bipod ? .28 : .48;
  const stance=prone?proneScale:crouched?.76:1,first=this.count===0?1.08:1;
  const strength=stance*(weapon==='m249'?1.15:1);
  const scale=strength*(ads?1:.65);
  const vertical=v*variation*first*scale*DEG*CAMERA_PITCH_GAIN;
  const horizontal=h*side*scale*DEG*CAMERA_YAW_GAIN;
  if(weapon==='m249')this.rollShake.impulse((side<0?-1:1)*.28*DEG*stance*variation);
  this.pitch.impulse(vertical);this.yaw.impulse(horizontal);this.sinceShot=0;this.count++;
  return {
    vertical,
    horizontal,
    back: back*(.86+random()*.28)*strength*GUN_BACK_GAIN,
    pitch: (.65+v)*variation*DEG*strength*GUN_ANGLE_GAIN,
    yaw: side*.7*DEG*strength*GUN_ANGLE_GAIN,
    roll: -side*.9*DEG*strength*GUN_ANGLE_GAIN,
  };
 }
}
