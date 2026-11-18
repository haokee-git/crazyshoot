import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {captureVehicleParts,vehicleBlocks,vehicleSupport,type VehiclePart} from '../src/game/vehicles/collision';
import {rayBoxDistance} from '../src/game/world/queries';

// Reference implementation before the per-anchor broad phase. Compare the
// actual collision contract, including rotated moving parts and support height.
function distance(a:THREE.Vector3,b:THREE.Vector3,box:THREE.Box3){
 const p=[a.x,a.y,a.z],d=[b.x-a.x,b.y-a.y,b.z-a.z],lo=[box.min.x,box.min.y,box.min.z],hi=[box.max.x,box.max.y,box.max.z],ts=[0,1];
 for(let i=0;i<3;i++)if(Math.abs(d[i])>1e-8)for(const v of [lo[i],hi[i]]){const t=(v-p[i])/d[i];if(t>0&&t<1)ts.push(t)}ts.sort((a,b)=>a-b);let best=Infinity;
 for(let j=1;j<ts.length;j++){const mid=(ts[j-1]+ts[j])/2;let aa=0,ab=0,c=0;for(let i=0;i<3;i++){const v=p[i]+d[i]*mid,bound=v<lo[i]?lo[i]:v>hi[i]?hi[i]:null;if(bound===null)continue;const k=p[i]-bound;aa+=d[i]*d[i];ab+=k*d[i];c+=k*k}const t=aa?THREE.MathUtils.clamp(-ab/aa,ts[j-1],ts[j]):mid;best=Math.min(best,aa*t*t+2*ab*t+c)}return best;
}
function oldBlocks(m:THREE.Group,x:number,z:number,r:number,y:number,h:number){m.updateMatrixWorld(true);for(const part of m.userData.collisionParts as VehiclePart[]){const inv=part.anchor.matrixWorld.clone().invert(),a=new THREE.Vector3(x,y+r,z).applyMatrix4(inv),b=new THREE.Vector3(x,y+h-r,z).applyMatrix4(inv);if(distance(a,b,part.box)<r*r-.00001)return true}return false}
function oldSupport(m:THREE.Group,x:number,z:number,maxY:number){m.updateMatrixWorld(true);let top=-Infinity;const start=Number.isFinite(maxY)?maxY:100;for(const part of m.userData.collisionParts as VehiclePart[]){const inv=part.anchor.matrixWorld.clone().invert(),o=new THREE.Vector3(x,start+.001,z).applyMatrix4(inv),dir=new THREE.Vector3(0,-1,0).transformDirection(inv),b=part.box;if(b.containsPoint(o))continue;const d=rayBoxDistance(o,dir,{x:(b.min.x+b.max.x)/2,z:(b.min.z+b.max.z)/2,w:b.max.x-b.min.x,d:b.max.z-b.min.z,rot:0,bottom:b.min.y,top:b.max.y-b.min.y<.001?b.min.y+.001:b.max.y},200);if(!Number.isFinite(d))continue;const p=o.addScaledVector(dir,d).applyMatrix4(part.anchor.matrixWorld);if(p.y<=maxY+.015)top=Math.max(top,p.y)}return top}
function model(){const root=new THREE.Group(),turret=new THREE.Group(),wheel=new THREE.Group();root.add(turret,wheel);turret.position.set(.2,1.5,.1);wheel.position.set(1,.3,1);root.userData.turret=turret;root.userData.wheels=[wheel];for(const [parent,x,y,z,w,h,d] of [[root,0,.6,0,2.4,1.2,4.8],[root,.8,1,1,1,.4,2],[turret,0,.4,0,1.8,.8,2],[turret,0,.4,1.8,.2,.2,2],[wheel,0,0,0,.5,.7,.7]] as const){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d));m.position.set(x,y,z);parent.add(m)}root.userData.collisionParts=captureVehicleParts(root);return {root,turret,wheel}}

describe('vehicle infantry collision broad phase',()=>{
 it('matches the original precise checks as hull and moving anchors rotate',()=>{
  const {root,turret,wheel}=model();let state=1911;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296};
  for(let i=0;i<2400;i++){
   if(i%40===0){root.position.set(random()*4,random()*2,random()*4);root.rotation.set((random()-.5)*.4,random()*6,(random()-.5)*.4);turret.rotation.y=random()*6;wheel.rotation.x=random()*6}
   const x=root.position.x+(random()-.5)*9,z=root.position.z+(random()-.5)*9,y=root.position.y+(random()-.25)*4,r=.2+random()*.3,h=.8+random()*1.3;
   expect(vehicleBlocks(root,x,z,r,y,h)).toBe(oldBlocks(root,x,z,r,y,h));
   const actual=vehicleSupport(root,x,z,y+2),expected=oldSupport(root,x,z,y+2);
   if(Number.isFinite(expected))expect(actual).toBeCloseTo(expected,8);else expect(actual).toBe(expected);
  }
 });
});
