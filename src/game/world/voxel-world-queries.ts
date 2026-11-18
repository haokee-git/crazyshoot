import {SolidIndex,capsuleBox} from './solid-index';
import {boxesOverlapXZ} from './queries';
import * as THREE from 'three';
import { blockAt,isSolidBlock,type TerrainData } from './voxel-map-data';
import { isWaterMaterial } from '../../content/materials/battlefield';
import { buildWaterExitRoutes } from './water-navigation';
export class VoxelWorldQueries {
 readonly details:SolidIndex; constructor(readonly data:TerrainData){this.details=new SolidIndex(data.detailBoxes??[],data.id==='miao_village'?4:8);}
 private column(x:number,z:number){const ix=Math.floor(x)-this.data.minX,iz=Math.floor(z)-this.data.minZ;return ix<0||iz<0||ix>=this.data.width||iz>=this.data.depth?-1:iz*this.data.width+ix;}
 height(x:number,z:number){const k=this.column(x,z);return k<0?-Infinity:this.data.heights[k];}
 primary(x:number,z:number){const k=this.column(x,z);return k<0?-Infinity:this.data.primary[k];}
 support(x:number,z:number,maxY:number){const k=this.column(x,z);if(k<0)return -Infinity;const columnTop=this.data.columnTop?.[k]??this.data.height;const from=Math.min(this.data.minY+columnTop-1,this.data.minY+this.data.height-1,Math.floor(maxY+1e-5)-1);for(let y=from;y>=this.data.minY;y--)if(isSolidBlock(blockAt(this.data,x,y,z))&&!isSolidBlock(blockAt(this.data,x,y+1,z)))return Math.max(y+1,this.details.support(x,z,maxY));return Math.max(this.height(x,z),this.details.support(x,z,maxY));}
 navigationHeight(x:number,z:number){return this.support(x,z,this.primary(x,z)+1.06);}
 water(x:number,z:number,feet?:number){
  const k=this.column(x,z);
  if(k<0)return null;
  // 多高度水域（河流/梯田/渡船坞）：volumeSurface 优先，surfaceY 每块独立。
  const volumeSurface=this.data.volumeSurface?.[k];
  if(volumeSurface!==undefined&&volumeSurface>-32768){
   if((feet??this.navigationHeight(x,z))<=volumeSurface+.15)return {surface:volumeSurface,bottom:this.data.volumeBed?.[k]??volumeSurface-.3};
   return null;
  }
  const surface=this.data.water[k];
  if(surface===-32768||(feet??this.navigationHeight(x,z))>surface+.15)return null;
  const {voxels,height,minY}=this.data;
  let bottom=surface;
  while(bottom>minY&&isWaterMaterial(voxels[k*height+bottom-minY-1]))bottom--;
  return {surface,bottom};
 }
 waterExit(x:number,z:number){
  const k=this.column(x,z);
  if(k<0||this.data.water[k]===-32768)return null;
  const routes=this.data.waterExits??=buildWaterExitRoutes(this.data,this);
  const next=routes[k];
  return next<0?null:{x:this.data.minX+next%this.data.width+.5,z:this.data.minZ+Math.floor(next/this.data.width)+.5};
 }
 blocked(x:number,z:number,r:number,feet:number,height=1.8){
  if(this.details.blocked(x,z,r,feet,height))return true;
  for(let iz=Math.floor(z-r);iz<=Math.floor(z+r);iz++)for(let ix=Math.floor(x-r);ix<=Math.floor(x+r);ix++)for(let y=Math.floor(feet+.005);y<Math.ceil(feet+height-.005);y++)if(isSolidBlock(blockAt(this.data,ix,y,iz))&&capsuleBox(x,z,r,feet,height,{id:'voxel',x:ix+.5,z:iz+.5,w:1,d:1,bottom:y,top:y+1,material:1}))return true;
  return false;
 }
 footprint(x:number,z:number,w:number,d:number,yaw:number,feet:number,height:number,terrain?:{min:number;max:number}){
  const radius=Math.hypot(w,d)/2,top=feet+height;
  const hull={x,z,w,d,rot:yaw,bottom:feet,top};
  for(const b of this.details.near(x,z,radius)){
   if(!boxesOverlapXZ(hull,{...b,rot:0}))continue;
   if(!terrain){if(b.top>feet+.03&&b.bottom<top)return true;continue;}
   // A low obstacle at the downhill end must not disappear below the uphill clearance.
   const x0=b.x-b.w/2,x1=b.x+b.w/2,z0=b.z-b.d/2,z1=b.z+b.d/2;
   for(let iz=Math.floor(z0);iz<Math.ceil(z1);iz++)for(let ix=Math.floor(x0);ix<Math.ceil(x1);ix++){
    const bottom=this.primary(ix,iz)+.56;
    if(b.top<=bottom+.03||b.bottom>=bottom+height)continue;
    const left=Math.max(ix,x0),right=Math.min(ix+1,x1),near=Math.max(iz,z0),far=Math.min(iz+1,z1);
    if(boxesOverlapXZ(hull,{...b,rot:0,x:(left+right)/2,z:(near+far)/2,w:right-left,d:far-near}))return true;
   }
  }
  for(let iz=Math.floor(z-radius);iz<=Math.floor(z+radius);iz++)for(let ix=Math.floor(x-radius);ix<=Math.floor(x+radius);ix++){
   if(!boxesOverlapXZ(hull,{x:ix+.5,z:iz+.5,w:1,d:1,rot:0,bottom:feet,top}))continue;
   const floor=terrain?this.primary(ix,iz):feet;
   if(terrain&&(floor<terrain.min||floor>terrain.max))return true;
   const bottom=terrain?floor+.56:feet;
   for(let y=Math.floor(bottom+.03);y<Math.ceil(bottom+height-.01);y++)if(isSolidBlock(blockAt(this.data,ix,y,iz)))return true;
  }
  return false;
 }
 ray(origin:THREE.Vector3,dir:THREE.Vector3,max:number){const detailHit=this.details.ray(origin,dir,max);max=Math.min(max,detailHit);let x=Math.floor(origin.x),y=Math.floor(origin.y),z=Math.floor(origin.z),t=0;const sx=Math.sign(dir.x),sy=Math.sign(dir.y),sz=Math.sign(dir.z),dx=dir.x?1/Math.abs(dir.x):Infinity,dy=dir.y?1/Math.abs(dir.y):Infinity,dz=dir.z?1/Math.abs(dir.z):Infinity;let tx=dir.x?((sx>0?x+1:x)-origin.x)/dir.x:Infinity,ty=dir.y?((sy>0?y+1:y)-origin.y)/dir.y:Infinity,tz=dir.z?((sz>0?z+1:z)-origin.z)/dir.z:Infinity;
  while(t<=max){if(isSolidBlock(blockAt(this.data,x,y,z)))return Math.max(0,t);if(tx===Infinity&&ty===Infinity&&tz===Infinity)break;if(tx<=ty&&tx<=tz){t=tx;tx+=dx;x+=sx;}else if(ty<=tz){t=ty;ty+=dy;y+=sy;}else{t=tz;tz+=dz;z+=sz;}}return detailHit;
 }
 line(a:THREE.Vector3,b:THREE.Vector3){const direction=b.clone().sub(a),length=direction.length();return length>0&&this.ray(a,direction.multiplyScalar(1/length),length)<length-.025;}
 /** World ray plus the hit face normal and block material id, for bullet impacts. */
 rayHit(origin:THREE.Vector3,dir:THREE.Vector3,max:number):{distance:number;normal:THREE.Vector3;material:number}|null{
  const detailHit=this.details.rayHit(origin,dir,max),limit=detailHit?detailHit.distance:max;
  let x=Math.floor(origin.x),y=Math.floor(origin.y),z=Math.floor(origin.z),t=0;
  const sx=Math.sign(dir.x),sy=Math.sign(dir.y),sz=Math.sign(dir.z),dx=dir.x?1/Math.abs(dir.x):Infinity,dy=dir.y?1/Math.abs(dir.y):Infinity,dz=dir.z?1/Math.abs(dir.z):Infinity;
  let tx=dir.x?((sx>0?x+1:x)-origin.x)/dir.x:Infinity,ty=dir.y?((sy>0?y+1:y)-origin.y)/dir.y:Infinity,tz=dir.z?((sz>0?z+1:z)-origin.z)/dir.z:Infinity;
  let nx=-dir.x,ny=-dir.y,nz=-dir.z;
  while(t<=limit){
   const block=blockAt(this.data,x,y,z);
   if(isSolidBlock(block)){const length=Math.hypot(nx,ny,nz),scale=length>1e-6?1/length:0;return {distance:Math.max(0,t),normal:new THREE.Vector3(nx*scale,ny*scale,nz*scale),material:block};}
   if(tx===Infinity&&ty===Infinity&&tz===Infinity)break;
   if(tx<=ty&&tx<=tz){t=tx;tx+=dx;x+=sx;nx=-sx;ny=0;nz=0;}
   else if(ty<=tz){t=ty;ty+=dy;y+=sy;nx=0;ny=-sy;nz=0;}
   else{t=tz;tz+=dz;z+=sz;nx=0;ny=0;nz=-sz;}
  }
  return detailHit;
 }
}
