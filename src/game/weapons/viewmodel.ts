import {RecoilSpring,type RecoilImpulse} from './recoil';
import { OPTICS as OPTIC_OPTIONS } from '../../content/weapons/catalog';
import { disposeObject } from '../core/resources';
import * as THREE from 'three';
import type {WeaponModelId} from '../../content/weapons/models';
import {WEAPON_PRESENTATION,neutralMuzzleOffset,scopeRelief} from '../../content/weapons/presentation';
import type {OpticId} from '../../content/weapons/catalog';
import {buildHeroWeapon} from './hero-model';
import {buildOptic,type OpticDef} from './optics';
import {FirstPersonArms} from './arms';
import type {MantleState,MotionState} from '../player/motion';

function makeFlashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 128, 128);
  g.save();
  g.translate(64, 64);
  g.globalCompositeOperation = 'lighter';
  // hot irregular core
  const core = g.createRadialGradient(2, -2, 1, 0, 0, 40);
  core.addColorStop(0, 'rgba(255,255,250,1)');
  core.addColorStop(0.18, 'rgba(255,250,214,0.98)');
  core.addColorStop(0.46, 'rgba(255,196,92,0.72)');
  core.addColorStop(0.78, 'rgba(255,112,22,0.26)');
  core.addColorStop(1, 'rgba(255,80,0,0)');
  g.fillStyle = core;
  g.beginPath();
  g.ellipse(0, 0, 40, 34, 0.2, 0, Math.PI * 2);
  g.fill();
  // a handful of soft, unequal flame lobes (no perfect star)
  const lobes = [
    { a: -0.25, len: 44, w: 15, alpha: 0.55 },
    { a: 0.55, len: 30, w: 12, alpha: 0.45 },
    { a: 1.45, len: 38, w: 13, alpha: 0.4 },
    { a: 2.5, len: 26, w: 10, alpha: 0.32 },
    { a: 3.55, len: 34, w: 12, alpha: 0.36 },
    { a: 4.6, len: 24, w: 9, alpha: 0.3 },
  ];
  for (const l of lobes) {
    g.save();
    g.rotate(l.a);
    const lg = g.createRadialGradient(0, -l.len * 0.55, 1, 0, -l.len * 0.55, l.len * 0.7);
    lg.addColorStop(0, `rgba(255,238,176,${l.alpha})`);
    lg.addColorStop(0.4, `rgba(255,160,52,${l.alpha * 0.7})`);
    lg.addColorStop(1, 'rgba(255,90,0,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.ellipse(0, -l.len * 0.55, l.w, l.len * 0.6, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // tiny embers
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 28 + Math.random() * 26;
    g.fillStyle = `rgba(255,220,150,${0.35 + Math.random() * 0.4})`;
    g.beginPath();
    g.arc(Math.cos(a) * r, Math.sin(a) * r, 0.8 + Math.random() * 1.4, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  return t;
}
const FLASH_TEX = makeFlashTexture();
export const MUZZLE_FLASH_TEXTURE = FLASH_TEX;

// Camera-space carry poses are the center of the stride cycle.
const HIP_POSITION=new THREE.Vector3(.19,-.34,-.50);
const SPRINT_CARRY={
 rifle:{position:new THREE.Vector3(.065,-.34,-.43),pitch:.15,yaw:1.00,roll:-.25},
 compact:{position:new THREE.Vector3(.095,-.35,-.40),pitch:.15,yaw:1.03,roll:-.23},
 heavy:{position:new THREE.Vector3(.07,-.36,-.47),pitch:.13,yaw:.95,roll:-.23},
};

export class WeaponViewmodel {
 readonly scene=new THREE.Scene();readonly camera=new THREE.PerspectiveCamera(70,1,.02,10);
 readonly group=new THREE.Group();readonly muzzle=new THREE.Object3D();
 private readonly arms=new FirstPersonArms();private flash:THREE.Sprite;
 private gunRoot=new THREE.Group();private optic:OpticDef;private magazine=new THREE.Group();
 private weaponId:WeaponModelId='m16';private opticId:OpticId='red_dot';private zoom=1;
 private ads=false;private adsT=0;private sprintT=0;private obstruction=0;private obstructionTarget=0;
 private reloading=false;private reloadTime=0;private reloadDuration=2.2;private readonly kickBack=new RecoilSpring(42,.64);private readonly kickPitch=new RecoilSpring(32,.66);private readonly kickYaw=new RecoilSpring(28,.72);private readonly kickRoll=new RecoilSpring(30,.64);private flashTime=0;
 private phase=0;private speed=0;private sway=new THREE.Vector2();private mantle:MantleState|null=null;
  private lean=0;private readonly leanAxis=new THREE.Vector3(0,0,1);private readonly leanPivot=new THREE.Vector3();private readonly leanRoll=new THREE.Quaternion();
  private readonly aimAxis=new THREE.Vector3(0,0,-1);private readonly aimForward=new THREE.Vector3();private readonly aimFix=new THREE.Quaternion();private readonly aimScratch=new THREE.Quaternion();
 private readonly targetPos=new THREE.Vector3();private readonly targetQuat=new THREE.Quaternion();
 private readonly keyLight=new THREE.DirectionalLight(0xffedda,1.8);
 private readonly lightRotation=new THREE.Quaternion();
 private state:MotionState='idle';private worldCamera:THREE.PerspectiveCamera;
 constructor(camera:THREE.PerspectiveCamera){
  this.worldCamera=camera;this.group.name='weapon-viewmodel';this.scene.add(this.group,this.arms.root);
  this.scene.add(new THREE.HemisphereLight(0xe6edf0,0x515449,1.3));this.keyLight.position.set(-2,4,3);this.scene.add(this.keyLight);const fill=new THREE.DirectionalLight(0xb6d6e6,.5);fill.position.set(3,1,-2);this.scene.add(fill);
  this.flash=new THREE.Sprite(new THREE.SpriteMaterial({map:MUZZLE_FLASH_TEXTURE,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));this.flash.scale.set(.16,.16,1);this.flash.visible=false;
  this.group.add(this.muzzle,this.flash);this.optic=buildOptic('iron');this.setWeapon('m16','red_dot');this.setEquipped(false);
 }
 setWeapon(id:WeaponModelId,opticId:OpticId='iron'){
  if(this.weaponId===id&&this.opticId===opticId&&this.gunRoot.children.length)return;
  disposeObject(this.gunRoot);disposeObject(this.optic.group);this.weaponId=id;this.opticId=opticId;
  const def=WEAPON_PRESENTATION[id];this.gunRoot=buildHeroWeapon(id);this.gunRoot.rotation.y=Math.PI;this.group.add(this.gunRoot);this.magazine=this.gunRoot.userData.magazine;
  this.optic=buildOptic(opticId);this.optic.group.position.set(def.rail[0],def.rail[1],-def.rail[2]);this.group.add(this.optic.group);
  this.group.scale.setScalar(def.scale);this.muzzle.position.set(def.muzzle[0],def.muzzle[1],-def.muzzle[2]);this.flash.position.copy(this.muzzle.position);this.zoom=this.optic.zoom;
  for(const spring of [this.kickBack,this.kickPitch,this.kickYaw,this.kickRoll])spring.reset();this.adsT=0;this.sprintT=0;this.reloading=false;this.reloadTime=0;this.group.position.copy(HIP_POSITION);this.group.quaternion.identity();
 }
 applyRecoil(shot:RecoilImpulse){this.kickBack.impulse(shot.back);this.kickPitch.impulse(shot.pitch);this.kickYaw.impulse(shot.yaw);this.kickRoll.impulse(shot.roll);}
 get adsZoom(){return this.zoom;}get adsAmount(){return this.adsT;}get motionState(){return this.state;}
 get blocked(){return this.obstructionTarget>.55;}
 get opticDefinition(){return this.optic;}
 adjustZoom(direction:number){const option=OPTIC_OPTIONS.find(o=>o.id===this.opticId);if(option?.adjustable)this.zoom=THREE.MathUtils.clamp(this.zoom+direction,option.minZoom,option.maxZoom);}
 setEquipped(on:boolean){this.group.visible=on;this.arms.root.visible=on;}
 setAds(on:boolean){this.ads=on;}
 setSunLighting(direction:THREE.Vector3,shade:number){
  this.keyLight.position.copy(direction).applyQuaternion(this.lightRotation.copy(this.worldCamera.quaternion).invert());
  this.keyLight.intensity=THREE.MathUtils.lerp(1.8,.38,shade);
 }
 setObstruction(value:number){this.obstructionTarget=THREE.MathUtils.clamp(value,0,1);}
 setMotion(speed:number,mantle:MantleState|null){this.speed=speed;this.mantle=mantle;}
 get isReloading(){return this.reloading;}get reloadProgress(){return this.reloading?Math.min(1,this.reloadTime/this.reloadDuration):0;}
 fire(){if(this.reloading||!this.group.visible||this.blocked||this.mantle)return false;this.flashTime=.045;this.flash.visible=true;this.flash.material.rotation=Math.random()*Math.PI*2;return true;}
 reload(duration=2.2){if(this.reloading||this.mantle)return false;this.reloading=true;this.reloadTime=0;this.reloadDuration=duration;return true;}
 addSway(dx:number,dy:number){this.sway.x=THREE.MathUtils.clamp(this.sway.x+dx*.00012,-.018,.018);this.sway.y=THREE.MathUtils.clamp(this.sway.y+dy*.00010,-.012,.012);}
 /**
  * -1 = lean left, 1 = lean right. Recorded only: the camera already rides the
  * lean arc, so the eye and the gun are translated together in world space and
  * the gun stays centred in screen space — no local roll or slide remains here.
  */
 setLean(value:number){this.lean=THREE.MathUtils.clamp(value,-1,1);}
 get leanAmount(){return this.lean;}
 update(dt:number,bob:number,sprinting:boolean,firing=false,gaitPhase?:number){
  const def=WEAPON_PRESENTATION[this.weaponId];this.phase+=dt*(5+Math.min(this.speed,7)*1.2);
  this.obstruction=THREE.MathUtils.damp(this.obstruction,this.obstructionTarget,10,dt);
  this.adsT=THREE.MathUtils.damp(this.adsT,this.ads&&!this.blocked&&!this.reloading&&!this.mantle?1:0,3/def.adsSeconds,dt);
  const raiseForShot=firing&&this.sprintT>.02;
  const carrying=sprinting&&this.speed>.25&&!firing&&!this.ads&&!this.reloading&&!this.mantle&&!this.blocked;
  this.sprintT=raiseForShot?0:THREE.MathUtils.damp(this.sprintT,carrying?1:0,carrying?10:15,dt);
  this.sway.multiplyScalar(Math.exp(-dt*10));this.kickBack.update(dt);this.kickPitch.update(dt);this.kickYaw.update(dt);this.kickRoll.update(dt);this.flashTime-=dt;this.flash.visible=this.flashTime>0;
  if(this.reloading){this.reloadTime+=dt;if(this.reloadTime>=this.reloadDuration){this.reloading=false;this.magazine.position.set(0,0,0);this.magazine.rotation.set(0,0,0);}}
  if(this.mantle)this.reloading=false;
  const reload=Math.sin(Math.PI*Math.min(1,this.reloadProgress)),e=this.adsT,s=this.sprintT;
  const carry=def.family==='smg'?SPRINT_CARRY.compact:def.family==='sniper'||def.family==='lmg'||def.family==='shotgun'?SPRINT_CARRY.heavy:SPRINT_CARRY.rifle;
  const stepPhase=gaitPhase??this.phase,side=Math.sin(stepPhase*.5),step=Math.cos(stepPhase);
  const runWeight=s*Math.min(1,this.speed/7.4);
  const walkWeight=Math.min(1,this.speed/5.3)*(1-e)*(1-s);
  this.targetPos.copy(HIP_POSITION).lerp(carry.position,s);
  this.targetPos.x+=Math.cos(this.phase*.5)*.014*walkWeight+side*.027*runWeight;
  this.targetPos.y+=Math.sin(this.phase)*.009*walkWeight+step*.025*runWeight;
  this.targetPos.z+=Math.sin(stepPhase)*.021*runWeight;
  const eye=this.optic.eye.clone().add(this.optic.group.position).multiplyScalar(def.scale),ads=new THREE.Vector3(-eye.x,-eye.y,-(this.zoom>1?scopeRelief(this.zoom)*def.scale:this.optic.relief)-eye.z);
  this.targetPos.lerp(ads,e);
  const steps=Math.min(1,this.speed/2.35);
  this.targetPos.x+=this.sway.x*(1-e*.75)+Math.cos(stepPhase*.5)*.0016*steps*e;
  this.targetPos.y+=this.sway.y*(1-e*.75)+bob*.065*e-reload*.11-this.obstruction*.07;
  this.targetPos.z+=this.kickBack.value*(1-e*.30)+this.obstruction*.40;
  const pitch=carry.pitch*s+Math.sin(stepPhase-.38)*.065*runWeight+reload*.25+this.obstruction*1.15;
  const yaw=carry.yaw*s+Math.sin(stepPhase*.5+.68)*.13*runWeight+reload*.20;
  const roll=carry.roll*s+side*.07*runWeight+Math.cos(this.phase*.5)*.012*walkWeight-reload*.18;
  const free=(1-e)*(1-e);
  const opticsScale=1/Math.sqrt(this.zoom);
  const aimPitch=(Math.sin(stepPhase)*.0035*steps+this.sway.y*.16+this.kickPitch.value*.22)*e*opticsScale;
  const aimYaw=(Math.sin(stepPhase*.5)*.0043*steps+this.sway.x*.16+this.kickYaw.value*.24)*e*opticsScale;
  this.targetQuat.setFromEuler(new THREE.Euler(pitch*(1-e)+this.kickPitch.value*free+aimPitch,yaw*(1-e)+this.kickYaw.value*free+aimYaw,roll*(1-e)+this.kickRoll.value*free,'YXZ'));
  this.targetPos.x+=this.kickYaw.value*.18*(1-e*.5);
  // 歪头：上半身（手+枪）绕前向轴滚 20°（腰射绕自身原点、开镜绕镜片眼点），
  // 镜头则沿腰部枢轴圆弧平移（PlayerController.updateCamera），两者叠加。
  if(Math.abs(this.lean)>.002){
    const leanRoll=this.leanRoll.setFromAxisAngle(this.leanAxis,-this.lean*THREE.MathUtils.degToRad(20));
    this.leanPivot.copy(this.targetPos).multiplyScalar(1-e);
    this.targetPos.sub(this.leanPivot).applyQuaternion(leanRoll).add(this.leanPivot);
    this.targetQuat.premultiply(leanRoll);
    this.targetPos.x+=this.lean*.07*(1-e);
    this.targetPos.y-=Math.abs(this.lean)*.02*(1-e);
  }
  // The first shot uses the raised muzzle in the same simulation step.
  // Aiming: pin the muzzle axis to the camera axis so the sight stays centred.
  if(e>.01){
    this.aimForward.set(0,0,-1).applyQuaternion(this.targetQuat).normalize();
    const error=this.aimForward.angleTo(this.aimAxis);
    if(error>1e-5){
      this.aimFix.setFromUnitVectors(this.aimForward,this.aimAxis);
      if(e<1){this.aimScratch.copy(this.aimFix);this.aimFix.identity().slerp(this.aimScratch,e);}
      this.targetQuat.premultiply(this.aimFix);
      this.targetPos.applyQuaternion(this.aimFix);
    }
  }
  const blend=raiseForShot?1:1-Math.exp(-dt*24);this.group.position.lerp(this.targetPos,blend);this.group.quaternion.slerp(this.targetQuat,blend);
  if(this.magazine){this.magazine.position.y=-reload*.19;this.magazine.rotation.x=reload*.28;}
  this.group.updateMatrixWorld(true);
  const socket=(p:[number,number,number])=>this.group.localToWorld(new THREE.Vector3(p[0],p[1],-p[2]));
  let right=socket(def.gripRight),left=socket(def.gripLeft);
  if(reload>.01){const magazine=socket(def.magazine);magazine.y-=reload*.16;left.lerp(magazine,Math.min(1,reload*2));}
  this.state=this.mantle?'mantle':this.blocked?'blocked':this.reloading?'reload':this.ads?'ads':carrying?'sprint':this.speed>.2?'walk':'idle';
  if(this.mantle){const t=this.mantle.elapsed/this.mantle.duration,edge=new THREE.Vector3().fromArray(this.mantle.edge);this.worldCamera.updateMatrixWorld(true);this.worldCamera.worldToLocal(edge);const reach=Math.sin(Math.PI*Math.min(1,t*1.3));right.lerp(edge.clone().add(new THREE.Vector3(.19,.025,.02)),reach);left.lerp(edge.clone().add(new THREE.Vector3(-.19,.025,.02)),reach);this.gunRoot.visible=false;this.optic.group.visible=false;}else{this.gunRoot.visible=true;this.optic.group.visible=true;}
  this.arms.update(right,left,this.group.quaternion);
  this.camera.aspect=this.worldCamera.aspect;this.camera.fov=THREE.MathUtils.lerp(70,55,e);this.camera.updateProjectionMatrix();
  const lens=this.optic.lens;
  if(lens){
    const axis=this.localAim(new THREE.Vector3());
    const ratio=Math.tan(THREE.MathUtils.degToRad(this.camera.fov/2))/Math.tan(THREE.MathUtils.degToRad(this.worldCamera.fov/2));
    const inverse=lens.matrixWorld.clone().invert();
    const origin=new THREE.Vector3().applyMatrix4(inverse);
    const ray=new THREE.Vector3(axis.x*ratio,axis.y*ratio,axis.z).transformDirection(inverse);
    const distance=-origin.z/Math.min(-.001,ray.z);
    const point=origin.addScaledVector(ray,distance);
    const material=lens.material as THREE.ShaderMaterial;
    material.uniforms.reticleCenter.value.set(point.x,point.y);
  }
 }
 localAim(out:THREE.Vector3){return out.set(0,0,-1).applyQuaternion(this.group.quaternion);}
 obstructionProbe(out:THREE.Vector3,ads:boolean){out.fromArray(neutralMuzzleOffset(this.weaponId,this.opticId,ads));this.worldCamera.updateMatrixWorld(true);return this.worldCamera.localToWorld(out);}
 getMuzzleWorld(out:THREE.Vector3){this.group.updateMatrixWorld(true);this.muzzle.getWorldPosition(out);this.worldCamera.updateMatrixWorld(true);return this.worldCamera.localToWorld(out);}
 setWorldTexture(texture:THREE.Texture,size:THREE.Vector2){const mat=this.optic.lens?.material as THREE.ShaderMaterial|undefined;if(mat){mat.uniforms.worldMap.value=texture;mat.uniforms.screenSize.value.copy(size);mat.uniforms.scopeBlend.value=this.adsT;mat.depthWrite=this.zoom>1&&this.adsT>.45;}}
 render(renderer:THREE.WebGLRenderer){renderer.clearDepth();renderer.render(this.scene,this.camera);}
 dispose(){disposeObject(this.scene,true);}
}
