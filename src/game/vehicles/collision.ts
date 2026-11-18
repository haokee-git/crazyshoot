import * as THREE from 'three';
export interface VehiclePart {anchor:THREE.Object3D;box:THREE.Box3;}
export function captureVehicleParts(root:THREE.Group){
 root.updateMatrixWorld(true);
 const guns=root.userData.machineGuns as THREE.Object3D[]|undefined;
 const anchors=[root,...(root.userData.wheels??[]),root.userData.turret,root.userData.barrel].filter(Boolean);
 const parts:VehiclePart[]=[];
 root.traverse(object=>{
  const mesh=object as THREE.Mesh;
  if(!mesh.isMesh)return;
  let anchor:THREE.Object3D|null=mesh.parent;
  while(anchor&&!anchors.includes(anchor)){
   // Rotating gun attachments are visual and ballistic. Infantry can step over them.
   if(guns?.includes(anchor))return;
   anchor=anchor.parent;
  }
  anchor??=root;
  mesh.geometry.computeBoundingBox();
  const local=anchor.matrixWorld.clone().invert().multiply(mesh.matrixWorld);
  const box=mesh.geometry.boundingBox!.clone().applyMatrix4(local),size=box.getSize(new THREE.Vector3());
  if(size.x*size.y*size.z>.00008)parts.push({anchor,box});
 });
 return parts;
}
function segmentBoxDistance(a:THREE.Vector3,b:THREE.Vector3,box:THREE.Box3){const p=[a.x,a.y,a.z],d=[b.x-a.x,b.y-a.y,b.z-a.z],lo=[box.min.x,box.min.y,box.min.z],hi=[box.max.x,box.max.y,box.max.z],ts=[0,1];for(let i=0;i<3;i++)if(Math.abs(d[i])>1e-8)for(const v of [lo[i],hi[i]]){const t=(v-p[i])/d[i];if(t>0&&t<1)ts.push(t);}ts.sort((a,b)=>a-b);let best=Infinity;for(let j=1;j<ts.length;j++){const mid=(ts[j-1]+ts[j])/2;let aa=0,ab=0,constant=0;for(let i=0;i<3;i++){const v=p[i]+d[i]*mid,bound=v<lo[i]?lo[i]:v>hi[i]?hi[i]:null;if(bound===null)continue;const c=p[i]-bound;aa+=d[i]*d[i];ab+=c*d[i];constant+=c*c;}const t=aa?THREE.MathUtils.clamp(-ab/aa,ts[j-1],ts[j]):mid;best=Math.min(best,aa*t*t+2*ab*t+constant);}return best;}
/** Parts are rigid in their anchor's frame. Group them once so each query
 * transforms the capsule/ray once per moving anchor, rather than once per mesh. */
interface CollisionGroup {anchor:THREE.Object3D;boxes:THREE.Box3[];bounds:THREE.Box3;world:THREE.Matrix4;inverse:THREE.Matrix4;valid:boolean;}
const groupsByModel=new WeakMap<THREE.Group,{parts:VehiclePart[];groups:CollisionGroup[]}>();
function collisionGroups(model:THREE.Group):CollisionGroup[]{
 const parts=(model.userData.collisionParts??[]) as VehiclePart[],cached=groupsByModel.get(model);
 if(cached?.parts===parts)return cached.groups;
 const groups:CollisionGroup[]=[],byAnchor=new Map<THREE.Object3D,CollisionGroup>();
 for(const part of parts){let group=byAnchor.get(part.anchor);if(!group){group={anchor:part.anchor,boxes:[],bounds:new THREE.Box3(),world:new THREE.Matrix4(),inverse:new THREE.Matrix4(),valid:false};byAnchor.set(part.anchor,group);groups.push(group);}group.boxes.push(part.box);group.bounds.union(part.box);}
 groupsByModel.set(model,{parts,groups});return groups;
}
const aLocal=new THREE.Vector3(),bLocal=new THREE.Vector3(),originLocal=new THREE.Vector3(),directionLocal=new THREE.Vector3(),hitLocal=new THREE.Vector3();
function inverseFor(group:CollisionGroup){
 if(!group.valid||!group.world.equals(group.anchor.matrixWorld)){
  group.world.copy(group.anchor.matrixWorld);group.inverse.copy(group.world).invert();group.valid=true;
 }
 return group.inverse;
}
function segmentNearBox(a:THREE.Vector3,b:THREE.Vector3,box:THREE.Box3,r:number){
 return Math.min(a.x,b.x)<=box.max.x+r&&Math.max(a.x,b.x)>=box.min.x-r&&
  Math.min(a.y,b.y)<=box.max.y+r&&Math.max(a.y,b.y)>=box.min.y-r&&
  Math.min(a.z,b.z)<=box.max.z+r&&Math.max(a.z,b.z)>=box.min.z-r;
}
/** Allocation-free slab intersection with a local axis-aligned box. */
function localRayBox(origin:THREE.Vector3,dir:THREE.Vector3,box:THREE.Box3,max:number){
 let lo=0,hi=max;
 for(const axis of ['x','y','z'] as const){
  const o=origin[axis],d=dir[axis],min=box.min[axis],upper=axis==='y'&&box.max.y-box.min.y<.001?box.min.y+.001:box.max[axis];
  if(Math.abs(d)<1e-10){if(o<min||o>upper)return Infinity;continue;}
  let first=(min-o)/d,last=(upper-o)/d;if(first>last){const t=first;first=last;last=t;}
  lo=Math.max(lo,first);hi=Math.min(hi,last);if(lo>hi)return Infinity;
 }
 return lo;
}
export function vehicleBlocks(model:THREE.Group,x:number,z:number,r:number,feet:number,height:number){
 model.updateMatrixWorld(true);
 for(const group of collisionGroups(model)){
  const inverse=inverseFor(group);
  aLocal.set(x,feet+r,z).applyMatrix4(inverse);bLocal.set(x,feet+height-r,z).applyMatrix4(inverse);
  if(!segmentNearBox(aLocal,bLocal,group.bounds,r))continue;
  for(const box of group.boxes)if(segmentNearBox(aLocal,bLocal,box,r)&&segmentBoxDistance(aLocal,bLocal,box)<r*r-.00001)return true;
 }
 return false;
}
export function vehicleSupport(model:THREE.Group,x:number,z:number,maxY:number){
 model.updateMatrixWorld(true);let support=-Infinity;const start=Number.isFinite(maxY)?maxY:100;
 for(const group of collisionGroups(model)){
  const inverse=inverseFor(group);
  originLocal.set(x,start+.001,z).applyMatrix4(inverse);directionLocal.set(0,-1,0).transformDirection(inverse);
  if(!Number.isFinite(localRayBox(originLocal,directionLocal,group.bounds,200)))continue;
  for(const box of group.boxes){
   if(box.containsPoint(originLocal))continue;
   const distance=localRayBox(originLocal,directionLocal,box,200);if(!Number.isFinite(distance))continue;
   const point=hitLocal.copy(directionLocal).multiplyScalar(distance).add(originLocal).applyMatrix4(group.anchor.matrixWorld);
   if(point.y<=maxY+.015)support=Math.max(support,point.y);
  }
 }
 return support;
}
