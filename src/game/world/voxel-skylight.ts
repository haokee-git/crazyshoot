import * as THREE from 'three';
import {blockAt,isSolidBlock,type TerrainData} from './voxel-map-data';
import {VoxelWorldQueries} from './voxel-world-queries';

const RAY_MAX=32;
const HIT_EPS=.001;
const SKY_DIRECTIONS:readonly [THREE.Vector3,number][]=(()=>{
 const up=new THREE.Vector3(0,1,0);
 const list:[THREE.Vector3,number][]=[[up,2]];
 for(const [x,z] of [[.6,0],[-.6,0],[0,.6],[0,-.6]] as const)list.push([new THREE.Vector3(x,.8,z).normalize(),1]);
 return list;
})();

export function bakeVoxelSky(data:TerrainData):void{
 if(data.chunks.every(chunk=>chunk.transparent||chunk.skyLight?.length===chunk.block.length))return;
 const queries=new VoxelWorldQueries(data);
 const cache=new Map<number,number>();
 const pad=RAY_MAX+1;
 const baseX=data.minX-pad,baseY=data.minY-pad,baseZ=data.minZ-pad;
 const spanX=data.width+pad*2,spanY=data.height+pad*2,spanZ=data.depth+pad*2;
 const origin=new THREE.Vector3(),dir=new THREE.Vector3();
 const skyCell=(cx:number,cy:number,cz:number):number=>{
  if(isSolidBlock(blockAt(data,cx,cy,cz)))return 0;
  const bx=cx-baseX,by=cy-baseY,bz=cz-baseZ;
  const inRange=bx>=0&&bx<spanX&&by>=0&&by<spanY&&bz>=0&&bz<spanZ;
  const key=inRange?(bx*spanZ+bz)*spanY+by:-1;
  const cached=key>=0?cache.get(key):undefined;
  if(cached!==undefined)return cached;
  origin.set(cx+.5,cy+.5,cz+.5);
  let sum=0,weight=0;
  for(const [d,w] of SKY_DIRECTIONS){
   dir.copy(d);
   const hit=queries.ray(origin,dir,RAY_MAX);
   const open=!(hit<RAY_MAX-HIT_EPS);
   sum+=w*(open?1:Math.min(1,Math.max(0,hit)/12));
   weight+=w;
  }
  const sky=sum/weight;
  if(key>=0)cache.set(key,sky);
  return sky;
 };
 const t=new THREE.Vector3(),u=new THREE.Vector3(),n=new THREE.Vector3(),p=new THREE.Vector3();
 for(const chunk of data.chunks){
  if(chunk.transparent){chunk.skyLight=new Uint8Array(chunk.block.length).fill(255);continue;}
  if(chunk.skyLight?.length===chunk.block.length)continue;
  const sky=new Uint8Array(chunk.block.length);
  for(let i=0;i<chunk.block.length;i++){
   n.set(chunk.normal[i*3],chunk.normal[i*3+1],chunk.normal[i*3+2]);
   p.set(chunk.position[i*3],chunk.position[i*3+1],chunk.position[i*3+2]).addScaledVector(n,.12);
   const ax=Math.abs(n.x),ay=Math.abs(n.y),az=Math.abs(n.z);
   if(ay>=ax&&ay>=az){t.set(1,0,0);u.set(0,0,1);}else if(ax>=az){t.set(0,1,0);u.set(0,0,1);}else{t.set(1,0,0);u.set(0,1,0);}
   let sum=0;
   for(const su of [-.2,.2])for(const sv of [-.2,.2]){
    const x=p.x+t.x*su+u.x*sv,y=p.y+t.y*su+u.y*sv,z=p.z+t.z*su+u.z*sv;
    sum+=skyCell(Math.floor(x),Math.floor(y),Math.floor(z));
   }
   sky[i]=Math.round(sum/4*255);
  }
  chunk.skyLight=sky;
 }
}
