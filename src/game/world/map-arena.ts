import {ContactShadows} from './contact-shadows';
import * as THREE from 'three';
import type { MapDef } from '../../maps/types';
import type { Arena } from './arena';
import { buildVoxelMapData,type TerrainData } from './voxel-map-data';
import { buildPigAmbient } from './miao-village-decor';
import { renderVoxelMap,addSkybox } from './voxel-map-render';
import { renderLadders } from './ladders';
import { renderInteriorDecor } from './interior-decor';
import { renderPharaohDecor } from './pharaoh-decor';
import { loadingManager } from '../core/loading';
import { VoxelWorldQueries } from './voxel-world-queries';
import { BATTLEFIELDS } from '../../maps/battlefield-design';

function renderPharaohLamps(data:TerrainData,scene:THREE.Scene){
 if(!data.lamps?.length)return null;
 const geometry=new THREE.BoxGeometry(.22,.42,.22);
 const material=new THREE.MeshBasicMaterial({color:0xffb45e,toneMapped:false});
 const mesh=new THREE.InstancedMesh(geometry,material,data.lamps.length);
 mesh.name='pharaoh-static-lamps';mesh.frustumCulled=false;
 const dummy=new THREE.Object3D();
 for(let i=0;i<data.lamps.length;i++){const lamp=data.lamps[i];dummy.position.set(lamp.x,lamp.y,lamp.z);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);}
 mesh.instanceMatrix.needsUpdate=true;scene.add(mesh);return mesh;
}

/** 每图独立战术图色调：不是统一橄榄绿，而是地图本身的主色。 */
const MINIMAP_PALETTES: Record<string,[[number,number,number],[number,number,number],[number,number,number],[number,number,number],[number,number,number]]> = {
  docks: [[28,67,74],[45,58,57],[69,79,70],[104,108,92],[136,126,104]],
  broken_bridge: [[30,58,66],[67,56,44],[98,81,56],[135,112,78],[157,138,105]],
  garden: [[27,70,74],[54,67,49],[82,95,61],[118,124,85],[146,139,108]],
  airfield: [[36,64,66],[86,78,58],[116,105,76],[151,137,100],[174,160,124]],
  pharaoh: [[30,95,104],[166,137,88],[202,174,116],[228,211,165],[193,171,132]],
  miao_village: [[24,58,62],[52,76,62],[96,108,80],[140,137,110],[176,162,132]],
  training: [[34,66,68],[74,88,63],[110,113,84],[148,142,110],[172,160,128]],
};
export const PHARAOH_VEHICLE_PERFORMANCE=(kind:string)=>({
 motorcycle:{maxSpeed:120/3.6,accelScale:1.26},
 jeep:{maxSpeed:100/3.6,accelScale:1.23},
 apc:{maxSpeed:80/3.6,accelScale:1.29},
 ifv:{maxSpeed:60/3.6,accelScale:1.14},
 light_tank:{maxSpeed:55/3.6,accelScale:1.14},
 mbt:{maxSpeed:50/3.6,accelScale:1.22},
} as Record<string,{maxSpeed:number;accelScale:number}>)[kind];

export function buildMapArena(map:MapDef,sky='noon',res:32|64|128=32,prepared?:TerrainData):Arena {
 const data=prepared??buildVoxelMapData(map);if(data.id!==map.id)throw new Error('方块数据与地图不一致');const queries=new VoxelWorldQueries(data),scene=new THREE.Scene(),assets=loadingManager();const world=renderVoxelMap(data,res,assets.manager);const ladders=renderLadders(data.ladders??[],res,assets.manager);const decor=renderInteriorDecor(data.interiorDecor??[],assets.manager);const lamps=renderPharaohLamps(data,scene);
 const pigEntries=(map.extensions?.pigPositions as {x:number;z:number;yaw:number;color:number;phase:number}[]|undefined);
 const pigs=Array.isArray(pigEntries)&&pigEntries.length?buildPigAmbient(pigEntries,(x,z)=>queries.height(x,z)):null;
 if(pigs)scene.add(pigs.group);
 const pharaohDecor=map.decor?.length?renderPharaohDecor(map.decor.map(p=>({...p,y:(queries.height(p.x,p.z)||0)+p.y})),res,assets.manager):null;
 scene.add(world,ladders,decor);if(pharaohDecor)scene.add(pharaohDecor);addSkybox(scene,sky,map.size,assets.manager);
 const design=BATTLEFIELDS[map.id];
 if(design?.fog){scene.fog=new THREE.FogExp2(design.fog.color,design.fog.density);}
 if(map.id==='pharaoh'){
  // 埃及正午日照很强，但旧图的太阳/环境强度会把浅色石灰岩与细沙直接推到纯白。
  // 只为本图压低曝光并暖化直射光，保留金字塔顶的远景可读性。
  scene.traverse(o=>{
   if(o instanceof THREE.HemisphereLight)o.intensity=1.72;
   else if(o instanceof THREE.AmbientLight)o.intensity=.30;
   else if(o instanceof THREE.DirectionalLight&&o.name==='battlefield-sun'){o.intensity=2.35;o.color.setHex(0xffdfae);}
  });
  scene.backgroundIntensity=.86;
 }
 if(design){
  scene.traverse(o=>{
   if(o instanceof THREE.HemisphereLight&&Number.isFinite(design.hemiIntensity))o.intensity=design.hemiIntensity!;
   else if(o instanceof THREE.AmbientLight&&Number.isFinite(design.ambientIntensity))o.intensity=design.ambientIntensity!;
   else if(o instanceof THREE.DirectionalLight&&o.name==='battlefield-sun'&&Number.isFinite(design.sunIntensity))o.intensity=design.sunIntensity!;
  });
  if(Number.isFinite(design.backgroundIntensity))scene.backgroundIntensity=design.backgroundIntensity!;
 }
 scene.userData.collisionDetails=data.detailBoxes??[];
 // Dense authored villages already have baked voxel AO and sun shadows.
 // A transparent plane per wall, stair and furnishing adds heavy overdraw indoors.
 if(map.extensions?.interiorSystem!=='authored'){
  const contact=new Map<string,{x:number;z:number;y:number;w:number;d:number}>();
  for(const b of data.detailBoxes??[]){if(b.solid===false)continue;const old=contact.get(b.id);if(old){const x0=Math.min(old.x-old.w/2,b.x-b.w/2),x1=Math.max(old.x+old.w/2,b.x+b.w/2),z0=Math.min(old.z-old.d/2,b.z-b.d/2),z1=Math.max(old.z+old.d/2,b.z+b.d/2);old.x=(x0+x1)/2;old.z=(z0+z1)/2;old.w=x1-x0;old.d=z1-z0;}else contact.set(b.id,{x:b.x,z:b.z,y:b.bottom,w:b.w,d:b.d});}
  const staticShadows=new ContactShadows(scene,Math.max(1,contact.size+map.buildings.length));
  staticShadows.update([...contact.values()].map(b=>({...b,w:b.w+1.1,d:b.d+1.1})).concat(map.buildings.map(b=>{const xs=b.polygon.map(p=>p[0]),zs=b.polygon.map(p=>p[1]),x=(Math.min(...xs)+Math.max(...xs))/2,z=(Math.min(...zs)+Math.max(...zs))/2;return {x,z,y:queries.height(x,z)+.02,w:Math.max(...xs)-Math.min(...xs)+1.5,d:Math.max(...zs)-Math.min(...zs)+1.5};})));
 }
 const viewDistance=design?.viewDistance??(map.size>=800?1200:700);
 const bounds={minX:1,maxX:map.size-1,minZ:1,maxZ:map.size-1};
 const blockedAt=(x:number,z:number,r:number,feet:number,height=1.8)=>queries.blocked(x,z,r,feet,height);
 const makeSpawn=(team:'blue'|'orange')=>{const s=map.spawns.find(s=>s.team===team)!,x=s.x+s.w/2,z=s.y+s.d/2,dx=map.size/2-x,dz=map.size/2-z,length=Math.hypot(dx,dz)||1,back=Math.min(s.w,s.d)*.34;return {x:x-dx/length*back,z:z-dz/length*back,yaw:Math.atan2(-dx,-dz)};};
 const teamSpawns={blue:makeSpawn('blue'),orange:makeSpawn('orange')};
 const MINIMAP_RES=512;
 const minimapPlan=Array.from({length:MINIMAP_RES},(_,iz)=>Array.from({length:MINIMAP_RES},(_,ix)=>{const x=(ix+.5)/MINIMAP_RES*map.size,z=(iz+.5)/MINIMAP_RES*map.size;return queries.support(x,z,Infinity);}));
 // 战术图底图：按顶层材料上色，而不是只按高度分 5 个大色块。
 // 道路/屋顶/水面/沙地/植被因此各自可辨；材料色再叠极轻高度阴影。
 const minimapColors=new Uint8Array(MINIMAP_RES*MINIMAP_RES*4);
 const pal=MINIMAP_PALETTES[map.id]??MINIMAP_PALETTES.training;
 const width=data.width,depth=data.depth,height=data.height,minX=data.minX,minZ=data.minZ,minY=data.minY;
 for(let iz=0;iz<MINIMAP_RES;iz++)for(let ix=0;ix<MINIMAP_RES;ix++){
  const x=(ix+.5)/MINIMAP_RES*map.size,z=(iz+.5)/MINIMAP_RES*map.size;
  const cx=Math.max(0,Math.min(width-1,Math.floor(x)-minX)),cz=Math.max(0,Math.min(depth-1,Math.floor(z)-minZ)),cell=cz*width+cx;
  const topIdx=Math.max(0,Math.min(height-1,(data.columnTop?.[cell]??1)-1));
  const top=minY+topIdx;
  const mat=data.voxels[(cell*height)+topIdx]??0;
  let c:[number,number,number]=[184,156,112];
  if((data.water[cell]??-32768)>-1000&&top<=data.water[cell]+.1)c=[33,92,102];
  else if([4,79,100,119,120,121].includes(mat))c=[52,57,59];
  else if([80,81,82,106,107,108,109].includes(mat))c=[188,181,160];
  else if([72,73,74,75,76,102,103,104,105,77,78,117].includes(mat))c=map.id==='pharaoh'?[190,160,108]:[164,151,105];
  else if([1,19,20,21,9,39,40,95,96,116,118].includes(mat))c=map.id==='airfield'?[122,116,74]:[82,112,58];
  else if([5,29,30,31,32,35,36,51,53,54].includes(mat))c=[128,127,120];
  else if([6,13,34,44,45,46].includes(mat))c=[154,96,74];
  else if([84,88,89,112,113,18].includes(mat))c=[203,194,176];
  else if([87,92,110,111,7,37].includes(mat))c=[145,112,82];
  else if(mat>=122&&mat<=126)c=[104,72,45];
  else if(mat>=127&&mat<=129)c=[78,86,88];
  else if(mat>=130&&mat<=134)c=[132,136,134];
  else if(mat===135)c=[42,96,94];
  else if(mat>=136&&mat<=141)c=map.id==='miao_village'?[96,104,62]:[112,116,90];
  else if(mat>=142&&mat<=146)c=[62,92,54];
  else if(mat>=147&&mat<=151)c=[122,100,70];
  else if(mat>=152&&mat<=153)c=[64,78,104];
  else if([83,90,91,93,94,10,14,55,56,57,67].includes(mat))c=[95,99,98];
  else if([85,86,3,27,28,58,59].includes(mat))c=[145,132,112];
  else if([2,17,25,60].includes(mat))c=[156,133,98];
  else if([24].includes(mat))c=[120,105,82];
  // 1 m 高度阶梯只做极轻的坡向着色，让沙丘/台地/屋顶可读，不再大块纯色。
  const h=Number.isFinite(data.heights[cell])?data.heights[cell]:0;
  const hx=Number.isFinite(data.heights[cell+1])?data.heights[cell+1]:h;
  const hz=Number.isFinite(data.heights[cell+width])?data.heights[cell+width]:h;
  const shade=1+Math.max(-.06,Math.min(.06,((hx-h)+(hz-h))*.012));
  const o=(iz*MINIMAP_RES+ix)*4;minimapColors[o]=c[0]*shade;minimapColors[o+1]=c[1]*shade;minimapColors[o+2]=c[2]*shade;minimapColors[o+3]=255;
 }
 return {scene,colliders:[],targets:[],updateAmbient:pigs?.update,spawn:new THREE.Vector3(teamSpawns.blue.x,queries.navigationHeight(teamSpawns.blue.x,teamSpawns.blue.z),teamSpawns.blue.z),spawnYaw:teamSpawns.blue.yaw,bounds,name:map.name,mapId:map.id,
  capturePoints:map.capturePoints.map(p=>({id:p.id,x:p.x,z:p.y,r:p.radius,floorY:p.floorY,verticalTolerance:p.verticalTolerance,footprint:p.footprint})),teamSpawns,ferries:Array.isArray(map.extensions?.ferries)?(map.extensions!.ferries as Arena['ferries']):undefined,scoreRate:map.scoreRate??design?.scoreRate??1,navigationLayers:data.navLayers??3,navigationStep:design?.navigationStep,maxSupportY:data.minY+data.height,exposure:design?.exposure,viewDistance,vehicleCullDistance:0,dynamicVehicleRespawn:!!design?.dynamicVehicleRespawn,vehicleRespawnDelays:map.id==='miao_village'?{motorcycle:45000,jeep:60000,apc:90000}:undefined,matchSeconds:Number(map.extensions?.matchSeconds)||420,vehiclePerformance:map.id==='pharaoh'?PHARAOH_VEHICLE_PERFORMANCE:undefined,
  vehicles:map.vehiclePads.map((v,i)=>({id:`${v.vehicleId}-${i}`,kind:v.vehicleId,team:v.team,x:v.x,z:v.y,angle:v.angle*Math.PI/180})),
  vehiclePads:map.vehiclePads.map((v,i)=>({id:`${v.vehicleId}-${i}`,kind:v.vehicleId,team:v.team,x:v.x,z:v.y,angle:v.angle*Math.PI/180})),
  blocked:(x,z,r)=>blockedAt(x,z,r,queries.navigationHeight(x,z)),blockedAt,
  heightAt:(x,z)=>queries.height(x,z),navigationHeight:(x,z)=>queries.navigationHeight(x,z),supportAt:(x,z,max)=>queries.support(x,z,max),
  lineBlocked:(a,b)=>queries.line(a,b),rayDistance:(o,d,max)=>queries.ray(o,d,max),raySurface:(o,d,max)=>queries.rayHit(o,d,max),
  vehicleGroundAt:(x,z)=>queries.primary(x,z),
  footprintBlocked:(x,z,w,d,yaw,feet,height,terrain)=>queries.footprint(x,z,w,d,yaw,feet,height,terrain),
  setTextureResolution:async next=>{await Promise.all([world.userData.setTextureResolution(next),ladders.userData.setTextureResolution(next),...(pharaohDecor?[pharaohDecor.userData.setTextureResolution(next)]:[])]);},waterAt:(x,z,feet)=>queries.water(x,z,feet),waterExitAt:(x,z)=>queries.waterExit(x,z),minimapPlan,minimapColors,minimapPalette:pal,worldSize:map.size,navigationData:data.navigation,navLinks:data.navLinks,ladders:data.ladders??[],ready:Promise.all([assets.ready,world.userData.ready as Promise<void>,decor.userData.ready as Promise<void>,...(pharaohDecor?[pharaohDecor.userData.ready as Promise<void>]:[])]).then(()=>{}),raycastTargets:()=>null,reset:()=>{},
 };
}
