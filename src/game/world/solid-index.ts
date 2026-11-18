import * as THREE from 'three';
import {rayBoxDistance} from './queries';

/** Sparse half-grid details. Rendering and collision consume these exact boxes. */
export interface SolidBox {id:string;x:number;z:number;w:number;d:number;bottom:number;top:number;material:number;/** false = 只渲染不碰撞（草/帘子/装饰）。 */solid?:boolean;}
export interface SurfaceHit {y:number;id:string;normal:THREE.Vector3;velocity?:THREE.Vector3;}
export function capsuleBox(x:number,z:number,r:number,feet:number,height:number,b:SolidBox){
 const dx=Math.max(0,Math.abs(x-b.x)-b.w/2),dz=Math.max(0,Math.abs(z-b.z)-b.d/2);
 const lo=feet+r,hi=feet+Math.max(r,height-r);
 const dy=Math.max(0,b.bottom-hi,lo-b.top);
 return dx*dx+dz*dz+dy*dy<r*r-0.00001;
}
export class SolidIndex {
 private grid=new Map<string,SolidBox[]>();private found=new Set<SolidBox>();
 constructor(readonly boxes:SolidBox[],private cell=8){for(const b of boxes){if(b.solid===false)continue;for(let x=Math.floor((b.x-b.w/2)/cell);x<=Math.floor((b.x+b.w/2)/cell);x++)for(let z=Math.floor((b.z-b.d/2)/cell);z<=Math.floor((b.z+b.d/2)/cell);z++){const k=x+','+z,a=this.grid.get(k)??[];a.push(b);this.grid.set(k,a);}}}
 near(x:number,z:number,r=0){this.found.clear();for(let ix=Math.floor((x-r)/this.cell);ix<=Math.floor((x+r)/this.cell);ix++)for(let iz=Math.floor((z-r)/this.cell);iz<=Math.floor((z+r)/this.cell);iz++)for(const b of this.grid.get(ix+','+iz)??[])this.found.add(b);return this.found;}
 support(x:number,z:number,maxY:number){let y=-Infinity;for(const b of this.near(x,z))if(b.top<=maxY+.001&&Math.abs(x-b.x)<=b.w/2&&Math.abs(z-b.z)<=b.d/2)y=Math.max(y,b.top);return y;}
 blocked(x:number,z:number,r:number,feet:number,height=1.8){for(const b of this.near(x,z,r))if(capsuleBox(x,z,r,feet,height,b))return true;return false;}
 ray(origin:THREE.Vector3,dir:THREE.Vector3,max:number){let nearest=max,hit=false;const checked=new Set<SolidBox>();let x=Math.floor(origin.x/this.cell),z=Math.floor(origin.z/this.cell),t=0;const sx=Math.sign(dir.x),sz=Math.sign(dir.z),dx=dir.x?this.cell/Math.abs(dir.x):Infinity,dz=dir.z?this.cell/Math.abs(dir.z):Infinity;let tx=dir.x?((sx>0?x+1:x)*this.cell-origin.x)/dir.x:Infinity,tz=dir.z?((sz>0?z+1:z)*this.cell-origin.z)/dir.z:Infinity;while(t<=nearest){for(const b of this.grid.get(x+','+z)??[]){if(checked.has(b))continue;checked.add(b);const d=rayBoxDistance(origin,dir,{...b,rot:0},nearest);if(d<=nearest){nearest=d;hit=true;}}if(!Number.isFinite(Math.min(tx,tz)))break;if(tx<tz){t=tx;tx+=dx;x+=sx;}else{t=tz;tz+=dz;z+=sz;}}return hit?nearest:Infinity;}
 /** Same sweep as ray(), but also reports the hit box's face normal and material. */
 rayHit(origin:THREE.Vector3,dir:THREE.Vector3,max:number):{distance:number;normal:THREE.Vector3;material:number}|null{
  let nearest=max,found:SolidBox|null=null;const checked=new Set<SolidBox>();let x=Math.floor(origin.x/this.cell),z=Math.floor(origin.z/this.cell),t=0;const sx=Math.sign(dir.x),sz=Math.sign(dir.z),dx=dir.x?this.cell/Math.abs(dir.x):Infinity,dz=dir.z?this.cell/Math.abs(dir.z):Infinity;let tx=dir.x?((sx>0?x+1:x)*this.cell-origin.x)/dir.x:Infinity,tz=dir.z?((sz>0?z+1:z)*this.cell-origin.z)/dir.z:Infinity;
  while(t<=nearest){for(const b of this.grid.get(x+','+z)??[]){if(checked.has(b))continue;checked.add(b);const d=rayBoxDistance(origin,dir,{...b,rot:0},nearest);if(d<=nearest){nearest=d;found=b;}}if(!Number.isFinite(Math.min(tx,tz)))break;if(tx<tz){t=tx;tx+=dx;x+=sx;}else{t=tz;tz+=dz;z+=sz;}}
  if(!found)return null;
  const p=origin.clone().addScaledVector(dir,nearest),dxw=p.x-found.x,dzw=p.z-found.z;
  const toX=found.w/2-Math.abs(dxw),toZ=found.d/2-Math.abs(dzw),toTop=found.top-p.y,toBottom=p.y-found.bottom,toY=Math.min(toTop,toBottom);
  const normal=new THREE.Vector3();
  if(toX<=toZ&&toX<=toY)normal.set(dxw>=0?1:-1,0,0);
  else if(toZ<=toY)normal.set(0,0,dzw>=0?1:-1);
  else normal.set(0,toTop<toBottom?1:-1,0);
  return {distance:Math.max(0,nearest),normal,material:found.material};
 }
}
