import {stitchVoxelEdges} from './voxel-mesh-edges';
import type {SolidBox} from './solid-index';
import type {NavigationData} from './navigation';
import {battlefieldHeight,applyBattlefieldGrading,BATTLEFIELDS,pitLadders,type LadderDef} from '../../maps/battlefield-design';
import {isWaterMaterial,terrainVariant,zoneHash} from '../../content/materials/battlefield';
import {pharaohGroundVariant,type PharaohGroundKind} from '../../content/materials/pharaoh';
import type { MapDef,Polygon } from '../../maps/types';
import {buildBuildingInterior} from './building-interior';
import type {BuildingInteriorPlan,InteriorDecorPlane,InteriorPropInfo} from './interior-types';
import {buildPharaohStructures} from './pharaoh-structures';
import {getMapWorldBuilder,registerMapWorldBuilder} from './map-structures';
import {miaoVillageBuilder} from './miao-village-structures';
registerMapWorldBuilder(miaoVillageBuilder);
import type { WaterVolume } from '../../maps/types';

export {BLOCK} from './voxel-blocks';
import {BLOCK} from './voxel-blocks';
export interface VoxelChunkData {position:Float32Array;normal:Float32Array;uv:Float32Array;color:Float32Array;block:Float32Array;index:Uint32Array;transparent:boolean;occlusion?:Uint8Array;skyLight?:Uint8Array;}
export interface TerrainData {detailBoxes?:SolidBox[];navigation?:NavigationData;ladders?:LadderDef[];waterVolumes?:WaterVolume[];volumeSurface?:Float32Array;volumeBed?:Float32Array;waterExits?:Int32Array;interiors?:BuildingInteriorPlan[];interiorProps?:InteriorPropInfo[];interiorDecor?:InteriorDecorPlane[];lamps?:{x:number;y:number;z:number}[];navLinks?:import('../../maps/types').NavLink[];navLayers?:number;chunkSize?:number;buildMs?:number;columnTop?:Uint16Array;tint?:[number,number,number];aoStrength?:number;id:string;size:number;step:1;minX:number;minZ:number;minY:number;width:number;depth:number;height:number;voxels:Uint8Array;heights:Float32Array;primary:Float32Array;water:Float32Array;chunks:VoxelChunkData[];}
export interface VoxelProgress {stage:string;completed:number;total:number;ratio:number;}
const clamp=(x:number,a:number,b:number)=>Math.max(a,Math.min(b,x));
const smooth=(a:number,b:number,x:number)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
export function inPolygon(x:number,z:number,poly:Polygon){let on=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])on=!on;}return on;}
export const isSolidBlock=(id:number)=>id!==BLOCK.AIR&&!isWaterMaterial(id);
const transparent=(id:number)=>isWaterMaterial(id)||id===BLOCK.GLASS;
export function blockAt(data:TerrainData,x:number,y:number,z:number){const ix=Math.floor(x)-data.minX,iz=Math.floor(z)-data.minZ,iy=Math.floor(y)-data.minY;if(ix<0||ix>=data.width||iz<0||iz>=data.depth||iy<0||iy>=data.height)return 0;return data.voxels[(iz*data.width+ix)*data.height+iy];}

/**
 * Doors created on formerly-solid buildings must not open straight into an
 * authored cover. Cut a 4 m-wide, head-height passage through half-grid detail
 * boxes in each door approach zone. Building furniture (ids with ':') is left
 * untouched because the furnishing pass already reserved these areas.
 */
function clearDoorApproaches(data:TerrainData){
 const zones:{r:{x0:number;z0:number;x1:number;z1:number};y0:number;y1:number}[]=[];
 for(const plan of data.interiors??[])for(const r of plan.doorClear)zones.push({r,y0:plan.base-1.5,y1:plan.base+4.5});
 if(!zones.length||!data.detailBoxes?.length)return;
 const eps=1e-6;let boxes=data.detailBoxes;
 for(const zone of zones){
  const next:SolidBox[]=[];
  for(const b of boxes){
   if(b.id.includes(':')){next.push(b);continue;}
   const bx0=b.x-b.w/2,bx1=b.x+b.w/2,bz0=b.z-b.d/2,bz1=b.z+b.d/2;
   const hit=bx0<zone.r.x1-eps&&bx1>zone.r.x0+eps&&bz0<zone.r.z1-eps&&bz1>zone.r.z0+eps&&b.top>zone.y0&&b.bottom<zone.y1;
   if(!hit){next.push(b);continue;}
   const ix0=Math.max(bx0,zone.r.x0),ix1=Math.min(bx1,zone.r.x1),iz0=Math.max(bz0,zone.r.z0),iz1=Math.min(bz1,zone.r.z1);
   const pieces:[number,number,number,number][]=[];
   if(bx0<ix0-eps)pieces.push([bx0,bz0,ix0,bz1]);
   if(ix1<bx1-eps)pieces.push([ix1,bz0,bx1,bz1]);
   if(bz0<iz0-eps)pieces.push([ix0,bz0,ix1,iz0]);
   if(iz1<bz1-eps)pieces.push([ix0,iz1,ix1,bz1]);
   for(const [x0,z0,x1,z1]of pieces){
    if(x1-x0<0.01||z1-z0<0.01)continue;
    next.push({...b,id:b.id+'-door',x:(x0+x1)/2,z:(z0+z1)/2,w:x1-x0,d:z1-z0});
   }
  }
  boxes=next;
 }
 data.detailBoxes=boxes;
}

/** Settle source water against the finished geometry, including passages below the surface. */
export function fillVoxelWater(data:TerrainData,surface:number,material:number,sources:Iterable<readonly [number,number]>){
 const {minX,minZ,minY,width,depth,height,voxels,water}=data;
 const ceiling=Math.min(height,surface-minY),queue:number[]=[];
 const visit=(x:number,y:number,z:number)=>{
  if(x<0||x>=width||z<0||z>=depth||y<0||y>=ceiling)return;
  const column=z*width+x,index=column*height+y;
  if(voxels[index]!==BLOCK.AIR)return;
  voxels[index]=material;
  water[column]=Math.max(water[column],y+minY+1);
  if(data.columnTop&&y+1>data.columnTop[column])data.columnTop[column]=y+1;
  queue.push(index);
 };
 for(const [x,z] of sources)visit(x-minX,surface-minY-1,z-minZ);
 for(let i=0;i<queue.length;i++){
  const index=queue[i],column=Math.floor(index/height),y=index%height,x=column%width,z=Math.floor(column/width);
  visit(x-1,y,z);visit(x+1,y,z);visit(x,y,z-1);visit(x,y,z+1);
  visit(x,y-1,z);visit(x,y+1,z);
 }
}

export function buildVoxelMapData(map:MapDef,report?:(p:VoxelProgress)=>void):TerrainData {
 const design=BATTLEFIELDS[map.id];
 const margin=32,width=map.size+margin*2,depth=width,minX=-margin,minZ=-margin,minY=design?.vertical?.minY??-8,height=design?.vertical?.height??32;
 const chunkSize=design?.chunkSize??64;
 const voxels=new Uint8Array(width*depth*height),heights=new Float32Array(width*depth),primary=new Float32Array(width*depth),water=new Float32Array(width*depth),columnTop=new Uint16Array(width*depth);water.fill(-32768);
 const data:TerrainData={id:map.id,size:map.size,step:1,minX,minZ,minY,width,depth,height,voxels,heights,primary,water,chunks:[],detailBoxes:[],interiors:[],interiorProps:[],interiorDecor:[],lamps:[],ladders:[],navLinks:map.navLinks,navLayers:design?.navigationLayers??3,chunkSize,columnTop,tint:design?.worldTint??[1,1,1],aoStrength:design?.worldAoStrength??.32};
 const worldBuilder=getMapWorldBuilder(map.id);
 const col=(x:number,z:number)=>{const ix=Math.floor(x)-minX,iz=Math.floor(z)-minZ;return ix<0||iz<0||ix>=width||iz>=depth?-1:iz*width+ix;};
 const put=(x:number,y:number,z:number,id:number)=>{const k=col(x,z),iy=Math.floor(y)-minY;if(k>=0&&iy>=0&&iy<height){voxels[k*height+iy]=id;const top=iy+1;if(top>columnTop[k])columnTop[k]=top;}};
 const column=(x:number,z:number,y0:number,y1:number,id:number)=>{const k=col(x,z);if(k<0)return;const a=clamp(Math.floor(y0)-minY,0,height),b=clamp(Math.ceil(y1)-minY,0,height);if(b>a){voxels.fill(id,k*height+a,k*height+b);if(b>columnTop[k])columnTop[k]=b;}};
 const box=(x0:number,z0:number,x1:number,z1:number,y0:number,y1:number,id:number)=>{for(let z=Math.floor(z0);z<Math.ceil(z1);z++)for(let x=Math.floor(x0);x<Math.ceil(x1);x++)column(x,z,y0,y1,id);};
 const ground=(x:number,z:number)=>heights[col(x,z)]??0;
 const bridge=(x:number,z:number)=>map.id==='broken_bridge'&&x>=124&&x<136&&z>=130&&z<170;
 const objectGround=(x:number,z:number)=>bridge(x,z)?2:ground(x,z);
 const rotatedBox=(cx:number,cz:number,w:number,d:number,y:number,h:number,id:number,angle=0)=>{const r=Math.hypot(w,d)/2,c=Math.cos(angle),s=Math.sin(angle);for(let z=Math.floor(cz-r);z<Math.ceil(cz+r);z++)for(let x=Math.floor(cx-r);x<Math.ceil(cx+r);x++){const dx=x+.5-cx,dz=z+.5-cz;if(Math.abs(dx*c-dz*s)<=w/2&&Math.abs(dx*s+dz*c)<=d/2)column(x,z,y,y+h,id);}};
 // Rasterize rotated details only on a local half-metre grid, then merge runs.
 const detail=(id:string,cx:number,cz:number,w:number,d:number,y:number,h:number,material:number,angle=0,solid=true)=>{
  // Half-grid details thinner than 0.5 m could fall between cell centres and vanish
  // (the stage tapestry did). Guarantee at least one half-metre cell of occupancy.
  const hw=Math.max(w/2,0.26),hd=Math.max(d/2,0.26);
  const radius=Math.hypot(hw,hd),c=Math.cos(angle),s=Math.sin(angle),rows=new Map<string,SolidBox>();
  for(let z=Math.floor((cz-radius)*2)/2;z<cz+radius;z+=.5){let start:number|null=null;
   const endRun=(end:number)=>{if(start===null)return;const key=start+':'+end,previous=rows.get(key);if(previous&&Math.abs(previous.z+previous.d/2-z)<.01){previous.d+=.5;previous.z+=.25;}else{const b={id,x:(start+end)/2,z:z+.25,w:end-start,d:.5,bottom:y,top:y+h,material,solid};data.detailBoxes!.push(b);rows.set(key,b);}start=null;};
   for(let x=Math.floor((cx-radius)*2)/2;x<cx+radius+.5;x+=.5){const dx=x+.25-cx,dz=z+.25-cz,on=Math.abs(dx*c-dz*s)<=hw&&Math.abs(dx*s+dz*c)<=hd;if(on&&start===null)start=x;else if(!on)endRun(x);}endRun(Math.ceil((cx+radius)*2)/2);
  }
 };
 const macro=(x:number,z:number)=>battlefieldHeight(map.id,x,z);
 const fountains=map.props.filter(p=>p.kind==='fountain').map(p=>({
  prop:p,x0:Math.floor(p.x-(p.w??8)/2),x1:Math.ceil(p.x+(p.w??8)/2),
  z0:Math.floor(p.y-(p.d??8)/2),z1:Math.ceil(p.y+(p.d??8)/2),surface:Math.floor(macro(p.x,p.y)),
 }));
 const pads=(worldBuilder?.handlesBuildings?[]:map.buildings.map(b=>{const xs=b.polygon.map(p=>p[0]),zs=b.polygon.map(p=>p[1]);return {x:(Math.min(...xs)+Math.max(...xs))/2,z:(Math.min(...zs)+Math.max(...zs))/2,w:(Math.max(...xs)-Math.min(...xs))/2+1,d:(Math.max(...zs)-Math.min(...zs))/2+1};}));
 if(!worldBuilder?.handlesBuildings){for(const v of map.vehiclePads)pads.push({x:v.x,z:v.y,w:5,d:7});for(const p of map.scenePads??[])pads.push({x:p.x,z:p.z,w:p.w/2,d:p.d/2});for(const spawn of map.spawns)pads.push({x:spawn.x+spawn.w/2,z:spawn.y+spawn.d/2,w:spawn.w/2+1,d:spawn.d/2+1});}
 // 据点必须是一块能同时站人的平台：断桥 A/C 这类被高度函数一刀切的据点，圆环半边落在
 // 崖下，站在低处的人看得见圈却占不了点（也会被判定成「圈里有不可逾越的高差」）。
 // 把高差过大的据点整平到圆心高度，并在圆外留一段缓坡；带喷泉盆地的据点跳过，
 // 否则会把水池填平。
 const capLevels:{x:number;z:number;r:number;blend:number;target:number}[]=[];
 for(const cap of map.capturePoints){
  if(map.props.some(p=>p.kind==='fountain'&&Math.hypot(p.x-cap.x,p.y-cap.y)<cap.radius+8))continue;
  let low=Infinity,high=-Infinity;
  for(let dz=-cap.radius;dz<=cap.radius;dz++)for(let dx=-cap.radius;dx<=cap.radius;dx++){
   if(dx*dx+dz*dz>cap.radius*cap.radius)continue;
   const h=macro(clamp(cap.x+dx,0,map.size),clamp(cap.y+dz,0,map.size));
   low=Math.min(low,h);high=Math.max(high,h);
  }
  if(high-low<=1.5)continue;
  capLevels.push({x:cap.x,z:cap.y,r:cap.radius,blend:Math.max(8,Math.min(20,Math.ceil(high-low)*2)),target:Math.floor(macro(cap.x,cap.y))});
 }
 const fillStone=map.assetBundle==='miao-v1'?130:BLOCK.STONE;
 const fillDirt=map.assetBundle==='miao-v1'?136:BLOCK.DIRT;
 const terrainMaterial=(kind:string)=>{
  const override=map.terrainMaterials?.[kind as keyof typeof map.terrainMaterials];
  if(override)return override;
  return kind==='grass'||kind==='flowers'?BLOCK.GRASS:kind==='asphalt'?BLOCK.ROAD:kind==='mud'?24:kind==='dirt'?BLOCK.DIRT:kind==='gravel'?22:kind==='sand'?BLOCK.SAND:kind==='wood'?BLOCK.WOOD:kind==='rubble'?60:kind==='stone'?27:BLOCK.CONCRETE;
 };
 const roadMaterial=(kind:string)=>{
  if(kind==='shoulder')return map.terrainMaterials?.gravel??22;
  if(kind==='runway'||kind==='taxiway')return BLOCK.CONCRETE;
  return map.terrainMaterials?.asphalt??BLOCK.ROAD;
 };
 const waterMaterial=map.terrainMaterials?.water??(map.id==='docks'?64:65);
 const maxBuildTop=design?.vertical?minY+height-2:24;
 const surfaceKind=(id:number):PharaohGroundKind|null=>{
  if([72,73,74,102,103,104,105].includes(id))return 'sand';
  if([75,76].includes(id))return 'gravel';
  if([80,81,82,106,107,108,109].includes(id))return 'stone';
  if([87,110,111].includes(id))return 'mudbrick';
  if([88,89,112,113,84].includes(id))return 'plaster';
  if([77,78,97,117].includes(id))return 'soil';
  if([95,96,116,118].includes(id))return 'vegetation';
  return null;
 };
 const surfaceVariant=(id:number,x:number,z:number)=>{
  if(map.id!=='pharaoh')return id;
  const kind=surfaceKind(id);
  return kind?pharaohGroundVariant(kind,zoneHash(x,z,map.order)):id;
 };
 const tops=new Uint8Array(width*depth);tops.fill(terrainMaterial(map.baseTerrain));
 for(let iz=0;iz<depth;iz++){const z=minZ+iz;for(let ix=0;ix<width;ix++){const x=minX+ix,k=iz*width+ix;let h=macro(clamp(x+.5,0,map.size),clamp(z+.5,0,map.size));for(const p of pads){const dist=Math.hypot(Math.max(0,Math.abs(x+.5-p.x)-p.w),Math.max(0,Math.abs(z+.5-p.z)-p.d));if(dist<10){const t=1-smooth(0,10,dist);h=h*(1-t)+macro(p.x,p.z)*t;}}
   for(const p of fountains){
    const distance=Math.hypot(Math.max(0,p.x0-x-.5,x+.5-p.x1),Math.max(0,p.z0-z-.5,z+.5-p.z1));
    h+=(p.surface-h)*(1-smooth(2,14,distance));
   }
   for(const c of capLevels){
    const distance=Math.hypot(x+.5-c.x,z+.5-c.z);
    if(distance>c.r+c.blend)continue;
    const t=distance<=c.r?1:1-smooth(c.r,c.r+c.blend,distance);
    h=h*(1-t)+c.target*t;
   }
   // 断桥北桥头引道：桥面 2m 与北岸镇区 7m 之间原本是 5 级 1m 垂直台阶，
   // 载具上不去，整条过桥路线断掉。沿桥头道路加一条 28m 长的缓坡（约 10°），
   // 横向 6m 内全坡、12m 外保持原台阶地形。
   if(map.id==='broken_bridge'&&x+.5>=118&&x+.5<=142&&z+.5>=166&&z+.5<=198){
    const ramp=2+5*smooth(168,196,z+.5);
    const lateral=1-smooth(6,12,Math.abs(x+.5-130));
    h=h*(1-lateral)+ramp*lateral;
   }
   // 东侧浅滩：给载具也做一条可通行浅滩通道（水底抬到 -2.6，水深 0.6m
   // 低于载具 1.05m 上限；两岸 25m 缓坡接入），桥被炸/绕后时载具可从这里过河。
   if(map.id==='broken_bridge'&&x+.5>=232&&x+.5<=260&&z+.5>=108&&z+.5<=198){
    const zz=z+.5;
    let target:number;
    if(zz<=135)target=2+(-2.6-2)*smooth(110,135,zz);
    else if(zz<=170)target=-2.6;
    else target=-2.6+(2-(-2.6))*smooth(170,195,zz);
    const lateral=1-smooth(8,14,Math.abs(x+.5-246));
    h=h*(1-lateral)+target*lateral;
   }
   h=Math.floor(applyBattlefieldGrading(map.id,x+.5,z+.5,h)+1e-5);heights[k]=primary[k]=h;tops[k]=surfaceVariant(terrainVariant(tops[k],x,z,map.order),x,z);
   column(x,z,minY,h-3,fillStone);column(x,z,h-3,h-1,fillDirt);column(x,z,h-1,h,tops[k]);
  }if(iz%16===0)report?.({stage:'生成方块地形',completed:iz,total:depth,ratio:.28*iz/depth});}
  // 作者地表保留下沉到逐格标志：patch 应用阶段记录“这格是刻意保留的人工场坪”，
  // 道路核心/肩带据此跳过材质覆盖（地形高度已在上游整平，不受影响）。用 1 B/格，
  // 不按材质 id 猜。surfacePriority 只决定重叠 patch 的胜负：高者胜，平手后 patch 胜，
  // 与既有的数组顺序语义一致。默认 -128 让任何显式优先级都能盖过基础地表。
  const preserve=new Uint8Array(width*depth),surfacePriority=new Int8Array(width*depth);surfacePriority.fill(-128);
  // 水体在道路之后才 settle；先记下水面/低洼格，任何道路（核心或肩带）都不得填色。
  const waterMask=new Uint8Array(width*depth);
  for(const patch of map.terrain)if(patch.kind==='water'){const xs=patch.polygon.map(p=>p[0]),zs=patch.polygon.map(p=>p[1]);for(let z=Math.floor(Math.min(...zs));z<=Math.ceil(Math.max(...zs));z++)for(let x=Math.floor(Math.min(...xs));x<=Math.ceil(Math.max(...xs));x++){const k=col(x,z);if(k>=0&&inPolygon(x+.5,z+.5,patch.polygon))waterMask[k]=1;}}
  for(const patch of map.terrain){if(patch.kind==='water')continue;const xs=patch.polygon.map(p=>p[0]),zs=patch.polygon.map(p=>p[1]),id=terrainMaterial(patch.kind),priority=clamp(Math.round(patch.surfacePriority??0),-127,127);for(let z=Math.floor(Math.min(...zs));z<=Math.ceil(Math.max(...zs));z++)for(let x=Math.floor(Math.min(...xs));x<=Math.ceil(Math.max(...xs));x++)if(inPolygon(x+.5,z+.5,patch.polygon)){const k=col(x,z);if(k<0||surfacePriority[k]>priority)continue;const variation=terrainVariant(id,x,z,map.order);const vv=surfaceVariant(variation,x,z);tops[k]=vv;put(x,heights[k]-1,z,vv);surfacePriority[k]=priority;preserve[k]=patch.preserveUnderRoads?1:0;}}
  // `verge:'compacted'` 的低对比压实变体：只换松散自然地表；草地/花/泥/石/混凝土/
  // 沥青/水一律保持原样（旧四图不设 verge，仍走 local）。压实 id 不再过 surfaceVariant，
  // 否则又会被 zoneHash 随机回沙/砾原色，肩带失去“压实”语义。
  const compactedSurface=(id:number):number|null=>{
   if(id===72||id===73||id===102||id===103||id===105)return 74;
   if(id===75||id===76)return 76;
   if(id===77||id===78||id===97||id===117)return 104;
   return null;
  };
  const waterCell=(k:number)=>waterMask[k]===1||heights[k]<-2;
  const paintRoadCell=(road:MapDef['roads'][number],x:number,z:number,k:number,distance:number,t:number,length:number)=>{
   const half=road.width/2,shoulder=Math.max(0,road.shoulder??0);
   if(distance>half+shoulder||waterCell(k))return;
   if(distance<=half){
    // 跑道/滑行道永远保持既有覆盖语义，不受作者地表保留阻挡；其余道路核心
    // 遇到 preserve 格直接跳过，连中线白漆也不落。
    const governed=road.kind==='runway'||road.kind==='taxiway';
    if(!governed&&preserve[k])return;
    // 作者当地铺装优先（集市/神庙/前庭的石/混凝土/砾石），否则按 kind 的沥青/混凝土。
    let id:number=road.surface?(map.terrainMaterials?.[road.surface]??terrainMaterial(road.surface)):roadMaterial(road.kind);
    // markings:false 的单段道路不画白漆；缺省保持旧行为（非 shoulder 画虚线）。
    if(road.markings!==false&&road.kind!=='shoulder'&&distance<.55&&Math.floor(t*length/6)%2===0)id=BLOCK.WHITE;
    id=surfaceVariant(terrainVariant(id,x,z,map.order),x,z);
    put(x,heights[k]-1,z,id);tops[k]=id;return;
   }
   // 肩带：只有作者显式给了宽度才画；local 保持底层材质不动，compacted 才换变体。
   if(shoulder<=0||preserve[k]||road.verge!=='compacted')return;
   const id=compactedSurface(tops[k]);if(id===null)return;
   put(x,heights[k]-1,z,id);tops[k]=id;
  };
  for(const road of map.roads){const reach=road.width/2+Math.max(0,road.shoulder??0);for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],dx=b[0]-a[0],dz=b[1]-a[1],l2=dx*dx+dz*dz,length=Math.sqrt(l2)||1;for(let z=Math.floor(Math.min(a[1],b[1])-reach);z<=Math.ceil(Math.max(a[1],b[1])+reach);z++)for(let x=Math.floor(Math.min(a[0],b[0])-reach);x<=Math.ceil(Math.max(a[0],b[0])+reach);x++){const t=clamp(((x+.5-a[0])*dx+(z+.5-a[1])*dz)/(l2||1),0,1),distance=Math.hypot(x+.5-a[0]-dx*t,z+.5-a[1]-dz*t);if(distance>reach)continue;const k=col(x,z);if(k<0)continue;paintRoadCell(road,x,z,k,distance,t,length);}}}
 if(map.id==='broken_bridge'){
  box(124,130,136,170,1,2,BLOCK.CONCRETE);for(let z=130;z<170;z++)for(let x=124;x<136;x++)primary[col(x,z)]=2;
  for(const x of [124,135])detail('bridge-guard-'+x,x+.5,150,1,36,2,1.5,BLOCK.STONE);
 }
 const worldOps={ground:(x:number,z:number)=>ground(x,z),put,column,box,carve:(x0:number,z0:number,x1:number,z1:number,y0:number,y1:number)=>box(x0,z0,x1,z1,y0,y1,BLOCK.AIR),detail,setPrimary:(x:number,z:number,y:number)=>{const k=col(x,z);if(k>=0)primary[k]=y;},addLamp:(x:number,y:number,z:number)=>{data.lamps!.push({x,y,z});},addLadder:(ladder:LadderDef)=>{data.ladders!.push(ladder);}};
 if(worldBuilder)worldBuilder.build(map,worldOps);
 if(map.id==='pharaoh'){
  const ops={ground:(x:number,z:number)=>ground(x,z),put,column,box,carve:(x0:number,z0:number,x1:number,z1:number,y0:number,y1:number)=>box(x0,z0,x1,z1,y0,y1,BLOCK.AIR),detail,setPrimary:(x:number,z:number,y:number)=>{const k=col(x,z);if(k>=0)primary[k]=y;},addLamp:(x:number,y:number,z:number)=>{data.lamps!.push({x,y,z});}};
  buildPharaohStructures(map,ops);
 }
 const buildingBounds=map.buildings.map(b=>{const xs=b.polygon.map(p=>p[0]),zs=b.polygon.map(p=>p[1]);return{x0:Math.floor(Math.min(...xs)),x1:Math.ceil(Math.max(...xs)),z0:Math.floor(Math.min(...zs)),z1:Math.ceil(Math.max(...zs))};});
 const coverRects=map.covers.map(c=>{const a=(c.rot??0)*Math.PI/180,cx=Math.cos(a),sx=Math.sin(a),hw=(Math.abs(c.w*cx)+Math.abs(c.d*sx))/2,hd=(Math.abs(c.w*sx)+Math.abs(c.d*cx))/2;return{x0:c.x-hw,x1:c.x+hw,z0:c.y-hd,z1:c.y+hd};});
 /**
  * `detail` 生成的是平底方块，而 `objectGround(c.x,c.y)` 只取 footprint 中心那一格：
  * 地面在 cover 占地范围内有坡度时，下坡侧的角落就悬在空中（花园玩家反馈的
  * 「一堆浮空的石头」）。按旋转后的 footprint 采样中心 + 4 角 + 4 边中点，取最低
  * 地面当新的底面；顶面高度一律不动，所以掩体高度 / 可站立性 / 狙击视野都不变。
  * 桥面按外扩 1 m 的桥体高度算：桥栏中心压在 x=124 的桥缘上，采样点会掉进桥下
  * 河床，不这样处理就会把护墙一路拽下去拉出石柱。
  * 下探最多 COVER_DROP_LIMIT 米：限幅后底下仍空出一大截，说明 footprint 整个跨过
  * 了断崖（石头从崖顶挑出），填了也遮不住悬空、只会长出一根石柱，保持原样。
  */
 const COVER_DROP_LIMIT=4;
 const bridgeDeck=(x:number,z:number)=>bridge(x,z)||bridge(x-1,z)||bridge(x+1,z)||bridge(x,z-1)||bridge(x,z+1);
 const coverFooting=(c:MapDef['covers'][number],base:number)=>{
  const a=(c.rot??0)*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a),hw=Math.max(.05,c.w/2-.05),hd=Math.max(.05,c.d/2-.05);
  // 与 detail() 的局部坐标一致：局部 (u,v) → 世界 (u·cos−v·sin, u·sin+v·cos)。
  const probes=[[0,0],[-hw,-hd],[hw,-hd],[-hw,hd],[hw,hd],[0,-hd],[0,hd],[-hw,0],[hw,0]];
  let low=Infinity;
  for(const [u,v] of probes){
   const x=c.x+u*cos-v*sin,z=c.y+u*sin+v*cos;
   if(col(x,z)<0)continue;
   low=Math.min(low,bridgeDeck(x,z)?2:ground(x,z));
  }
  if(!Number.isFinite(low)||low>=base)return base;
  const sunk=Math.max(base-COVER_DROP_LIMIT,low);
  return sunk-low>COVER_DROP_LIMIT?base:sunk;
 };
 const features=[...map.buildings,...map.covers,...map.props];let done=0;const featureDone=()=>{done++;report?.({stage:'搭建方块建筑与设施',completed:done,total:features.length,ratio:.28+.2*done/Math.max(1,features.length)});};
 if(!worldBuilder?.handlesBuildings)for(const [bi,b] of map.buildings.entries()){const xs=b.polygon.map(p=>p[0]),zs=b.polygon.map(p=>p[1]),x0=Math.floor(Math.min(...xs)),x1=Math.ceil(Math.max(...xs)),z0=Math.floor(Math.min(...zs)),z1=Math.ceil(Math.max(...zs)),cx=(x0+x1)/2,cz=(z0+z1)/2,base=ground(cx,cz),h=Math.max(4,Math.min(Math.round(b.height),24-base-(b.roof==='gable'||b.roof==='sawtooth'?4:1))),wall=/house|manor|church|store|office/.test(b.id)?([BLOCK.BRICK,33,31,32][zoneHash(cx,cz,map.order)%4]):([BLOCK.CONCRETE,29,35,67][zoneHash(cx,cz,map.order)%4]);
  box(x0,z0,x1,z1,base,base+1,BLOCK.CONCRETE);for(let zz=z0;zz<z1;zz++)for(let xx=x0;xx<x1;xx++)column(xx,zz,ground(xx,zz),base+1,BLOCK.CONCRETE);for(let z=z0;z<z1;z++)for(let x=x0;x<x1;x++)primary[col(x,z)]=base+1;
  // Every roofed building is hollow and enterable; open sheds keep their authored columns.
  const neighbors=buildingBounds.filter((_,index)=>index!==bi);
  const doorGround={south:ground(cx,z0-2),north:ground(cx,z1+2),west:ground(x0-2,cz),east:ground(x1+2,cz)};
  const interior=buildBuildingInterior({building:b,x0,z0,x1,z1,base,height:h,wallMaterial:wall,seed:zoneHash(cx,cz,map.order),neighbors,doorGround,obstacles:coverRects});
  for(const op of interior.ops)box(op.x0,op.z0,op.x1,op.z1,op.y0,op.y1,op.id);
  if(b.roof==='open'){const post=map.id==='pharaoh'?90:BLOCK.WOOD;for(let x=x0;x<x1;x+=6)for(const z of [z0,z1-1])column(x,z,base+1,base+h,post);for(let z=z0;z<z1;z+=6)for(const x of [x0,x1-1])column(x,z,base+1,base+h,post);box(x0,z0,x1,z0+1,base+1,base+h,wall);}
  for(const d of interior.details)detail(d.id,d.x,d.z,d.w,d.d,d.bottom,d.top-d.bottom,d.material,d.angle??0);
  for(const plan of [interior.plan])data.interiors!.push(plan);
  for(const prop of interior.props)data.interiorProps!.push(prop);
  for(const plane of interior.decor)data.interiorDecor!.push(plane);
  const glass=b.roof==='glass';if(b.roof==='gable'||b.roof==='sawtooth')for(let x=x0;x<x1;x++){const rise=Math.min(Math.max(0,maxBuildTop-base-h),4,Math.floor(Math.min(x-x0,x1-1-x)/3));box(x,z0,x+1,z1,base+h,base+h+rise+1,/manor|house|cottage|church/.test(b.id)?13:[44,45,46][zoneHash(cx,cz)%3]);}else if(b.roof!=='open')box(x0,z0,x1,z1,base+h,base+h+1,glass?BLOCK.GLASS:map.id==='pharaoh'?([87,88,89][zoneHash(cx,cz)%3]):[13,44,45,46][zoneHash(cx,cz)%4]);
  featureDone();
 }
 const miaoPack=map.assetBundle==='miao-v1';
 for(const c of map.covers){const base=objectGround(c.x,c.y),angle=(c.rot??0)*Math.PI/180,h=Math.max(0.25,c.height??(c.kind==='container'?3:c.kind==='hedge'?2:1.5));
  const footing=coverFooting(c,base);
  if(c.variant==='pier-deck'){detail(c.id??`pier-deck-${done}`,c.x,c.y,c.w,c.d,-1.1,Math.max(.25,c.height??.35),90,angle);}
  else if(c.variant==='pier-post'){const bottom=Math.min(base,-1.1);detail(c.id??`pier-post-${done}`,c.x,c.y,c.w,c.d,bottom,-1.1-bottom,90,angle);}
  else if(c.kind==='tree'){const x=Math.floor(c.x),z=Math.floor(c.y),variant=c.variant??'';const trunk=miaoPack?(variant==='bamboo'?143:124):(zoneHash(x,z)%3?BLOCK.BARK:38);const leaf=miaoPack?(variant==='maple'?144:variant==='bamboo'?142:145):(zoneHash(x,z)%5?BLOCK.LEAVES:40);column(x,z,base,base+(variant==='bamboo'?6:5),trunk);for(let y=base+3;y<base+(variant==='bamboo'?8:7);y++){const radius=y===base+6?1:Math.max(1,Math.round(c.w/2)+(variant==='bamboo'?0:0));for(let dz=-radius;dz<=radius;dz++)for(let dx=-radius;dx<=radius;dx++)if(Math.abs(dx)!==radius||Math.abs(dz)!==radius)put(x+dx,y,z+dz,leaf);} }
  else if(c.kind==='rock'){const rockBody=map.id==='pharaoh'?82:miaoPack?(c.variant==='miao-stone'?130:131):BLOCK.STONE,rockTop=map.id==='pharaoh'?86:miaoPack?131:BLOCK.STONE;const rockHeight=Math.max(2,Math.round(c.w*.55)),variant=zoneHash(c.x,c.y)%8;detail(c.id??`rock-${done}`,c.x,c.y,c.w,c.d,footing,base+1.5-footing,rockBody,angle);for(let y=1.5;y<rockHeight;y+=.5){const inset=Math.floor(y/2);detail(c.id??`rock-${done}`,c.x,c.y,Math.max(1,c.w-inset*2),Math.max(1,c.d-inset*2),base+y,Math.min(.5,rockHeight-y),y>rockHeight-1.5?rockTop:rockBody,angle);}
   // 6–8 种手工轮廓：偏移的崩块/半埋岩肩，不再是一层层对称金字塔。
   if(variant%3===0)detail(`${c.id??`rock-${done}`}-lobe`,c.x-c.w*.34,c.y+c.d*.18,c.w*.5,c.d*.55,footing,Math.min(rockHeight*.55,2.5),rockBody,angle+38);
   if(variant%4===0)detail(`${c.id??`rock-${done}`}-shard`,c.x+c.w*.42,c.y-c.d*.22,c.w*.32,c.d*.4,footing,Math.min(rockHeight*.75,3),rockBody,angle-24);
   if(variant%5===0)detail(`${c.id??`rock-${done}`}-cap`,c.x+c.w*.12,c.y-c.d*.08,c.w*.48,c.d*.44,base+Math.min(rockHeight*.55,2.2),.6,rockBody,angle+12);
  }
  else if(c.kind==='palm'){
   const x=Math.floor(c.x),z=Math.floor(c.y),trunk=Math.max(7,Math.min(13,Math.round(c.height??(9+zoneHash(x,z)%4))));
   column(x,z,base,base+trunk,94);detail(`${c.id??`palm-${done}`}-root`,c.x,c.y,.9,.9,base,.5,94,0);
   const crown=base+trunk;
   for(let tier=0;tier<3;tier++)for(let arm=0;arm<7;arm++){
    const a=arm*Math.PI*2/7+tier*.42+(zoneHash(x,z)%10)*.06;
    const reach=2.6-tier*.55,length=reach*1.15;
    detail(`${c.id??`palm-${done}`}-frond-${tier}-${arm}`,c.x+Math.cos(a)*length*.5,c.y+Math.sin(a)*length*.5,length,.55,crown+tier*.42-.25,.5,tier===1?40:95,a,false);
   }
   detail(`${c.id??`palm-${done}`}-crown`,c.x,c.y,1.4,1.4,crown-.2,.5,95,0,false);
  }
  else if(c.kind==='bush'||c.kind==='reeds'){
   const x=Math.floor(c.x),z=Math.floor(c.y),seed=zoneHash(x,z);
   if(c.kind==='bush'){
    for(let i=0;i<4;i++){const a=seed*.7+i*1.7,r=.4+(seed>>i&3)*.22;detail(`${c.id??`bush-${done}`}-${i}`,c.x+Math.cos(a)*r,c.y+Math.sin(a)*r,.9+((seed>>i)&1)*.4,.9,footing,Math.max(.8,Math.min(2,c.height??1.4)),miaoPack?(c.variant==='bamboo'?142:145):(i%2?95:96),a,false);}
   }else{
    for(let i=0;i<9;i++){const a=seed*.37+i*1.31,r=.35+((seed>>(i%5))&3)*.18,h2=Math.max(.8,Math.min(2.6,c.height??1.8))*(.7+((seed>>i)&3)*.1);detail(`${c.id??`reeds-${done}`}-${i}`,c.x+Math.cos(a)*r,c.y+Math.sin(a)*r,.42,.42,footing,h2,miaoPack?146:96,a,false);}
   }
  }
  else if(c.kind==='stall'){
   const id=c.id??`stall-${done}`,variant=c.variant??'pottery',wood=miaoPack?122:(variant==='dye'?92:variant==='tea'?90:variant==='produce'?92:90),fabric=miaoPack?(variant==='dye'?152:variant==='tea'?153:152):(variant==='dye'?91:variant==='spice'?92:variant==='tea'?87:88);
   for(const dx of [-c.w/2+.3,c.w/2-.3])for(const dz of [-c.d/2+.3,c.d/2-.3])detail(`${id}-post-${dx}-${dz}`,c.x+dx,c.y+dz,.3,.3,footing,2.5,wood,angle);
   detail(`${id}-counter`,c.x,c.y+c.d/2-.6,c.w-.6,.5,footing,1.05,fabric,angle);
   detail(`${id}-roof`,c.x,c.y,c.w+.5,c.d+.5,footing+2.45,.16,fabric,angle,false);
   if(variant==='pottery')for(let i=0;i<4;i++)detail(`${id}-pot-${i}`,c.x-c.w*.3+i*.45,c.y-c.d*.15,.5,.5,footing,.9,miaoPack?151:91,0);
   if(variant==='spice')for(let i=0;i<3;i++)detail(`${id}-sack-${i}`,c.x-c.w*.25+i*.5,c.y-c.d*.1,.6,.6,footing,.7,miaoPack?150:92,0);
   if(variant==='dye')for(let i=0;i<3;i++)detail(`${id}-cloth-${i}`,c.x-c.w*.3+i*.55,c.y-c.d*.35,.7,.1,footing+1.2,1.1,miaoPack?152:91,angle,false);
   if(variant==='tea')for(let i=0;i<2;i++)detail(`${id}-table-${i}`,c.x-c.w*.22+i*.5,c.y-c.d*.2,1.2,.8,footing,.75,miaoPack?125:90,angle);
  }
  else if(c.kind==='bench'){
   const id=c.id??`bench-${done}`,seat=miaoPack?125:BLOCK.WOOD,leg=miaoPack?122:BLOCK.WOOD;
   detail(`${id}-seat`,c.x,c.y,c.w,.48,footing+.42,.12,seat,angle);
   detail(`${id}-back`,c.x,c.y-c.d*.22,c.w,.12,footing+.5,.42,leg,angle);
   for(const dx of [-c.w/2+.25,c.w/2-.25])detail(`${id}-leg-${dx}`,c.x+dx,c.y,.16,.16,footing,footing+.42,leg);
  }
  else if(c.kind==='basket'){
   const id=c.id??`basket-${done}`,mat=miaoPack?150:BLOCK.WOOD;
   detail(`${id}-body`,c.x,c.y,c.w,c.d,footing,Math.max(.4,c.height??.7),mat,angle);
   detail(`${id}-rim`,c.x,c.y,c.w+.12,c.d+.12,footing+Math.max(.4,c.height??.7),.1,mat,angle);
  }
  else if(c.kind==='pottery'){
   const id=c.id??`pottery-${done}`,mat=miaoPack?151:BLOCK.BRICK;
   for(let i=0;i<3;i++){const px=c.x+(i-1)*.45,pz=c.y+(i%2)*.25;detail(`${id}-${i}`,px,pz,.42,.42,footing,.55+.1*(i%2),mat,0);detail(`${id}-${i}-lip`,px,pz,.3,.3,footing+.55+.1*(i%2),.12,mat,0);}
  }
  else if(c.kind==='drum'){
   const id=c.id??`drum-${done}`,mat=miaoPack?151:BLOCK.BRICK;
   detail(`${id}-body`,c.x,c.y,c.w,c.d,footing,.85,mat,0);
   detail(`${id}-head`,c.x,c.y,c.w+.08,c.d+.08,footing+.85,.1,miaoPack?152:BLOCK.WOOD,0);
   for(const dx of [-c.w*.4,c.w*.4])detail(`${id}-stand-${dx}`,c.x+dx,c.y,.16,c.d*.8,footing,.5,miaoPack?122:BLOCK.WOOD,0);
  }
  else if(c.kind==='canopy'){
   const id=c.id??`canopy-${done}`,top=footing+Math.max(3.5,c.height??5);
   for(const dx of [-c.w/2+.4,c.w/2-.4])for(const dz of [-c.d/2+.4,c.d/2-.4])detail(`${id}-col-${dx}-${dz}`,c.x+dx,c.y+dz,.4,.4,footing,top-footing,BLOCK.METAL,angle);
   detail(`${id}-roof`,c.x,c.y,c.w,c.d,top,.3,BLOCK.METAL,angle,false);
  }
  else if(c.kind==='dome'){
   const id=c.id??`dome-${done}`,r=Math.max(1.4,c.w/2),height=Math.max(1.5,c.height??3);
   for(let y=0;y<height;y+=.5){const rr=r*Math.sqrt(Math.max(.05,1-(y/height)**2));for(let a=0;a<8;a++){const px=c.x+Math.cos(a*Math.PI/4)*rr*.55,pz=c.y+Math.sin(a*Math.PI/4)*rr*.55;detail(`${id}-${y}-${a}`,px,pz,rr*.7,rr*.7,footing+y,.5,87,0);}}
  }
  else if(c.kind==='well'){
   const id=c.id??`well-${done}`,r=Math.max(1,c.w/2);
   for(let a=0;a<12;a++){const px=c.x+Math.cos(a*Math.PI/6)*r,pz=c.y+Math.sin(a*Math.PI/6)*r;detail(`${id}-rim-${a}`,px,pz,.65,.65,footing,.9,miaoPack?131:80,a*30);}
   detail(`${id}-water`,c.x,c.y,r*1.2,r*1.2,footing-.3,.35,miaoPack?135:69,0);
  }
  else if(c.kind==='pots'){
   const id=c.id??`pots-${done}`;for(let i=0;i<7;i++){const a=i*2.4+(zoneHash(c.x,c.y)%9)*.2,rr=.25+(i%3)*.32;detail(`${id}-${i}`,c.x+Math.cos(a)*rr,c.y+Math.sin(a)*rr,.45+(i%2)*.2,.45,footing+.45+(i%3)*.2,.45,miaoPack?151:91,a);}
  }
  else if(c.kind==='table'){
   const id=c.id??`table-${done}`;detail(`${id}-top`,c.x,c.y,c.w,c.d,footing,.14,miaoPack?125:90,angle);for(const dx of [-c.w/2+.2,c.w/2-.2])for(const dz of [-c.d/2+.2,c.d/2-.2])detail(`${id}-leg-${dx}-${dz}`,c.x+dx,c.y+dz,.18,.18,footing,.8,miaoPack?122:90,angle);
  }
  else if(c.kind==='sack'){
   const id=c.id??`sack-${done}`;for(let i=0;i<3;i++)detail(`${id}-${i}`,c.x+(i-1)*.55,c.y+(i%2)*.3,.7,.65,footing,.55+(i%2)*.25,miaoPack?150:92,0);
  }
  else if(c.kind==='tires'){
   const id=c.id??`tires-${done}`,r=Math.max(.45,c.w/2);for(let i=0;i<4;i++)detail(`${id}-${i}`,c.x+(i%2?r*.4:0),c.y+(i%2?0:r*.35),r*2,r*2,footing+i*.28,.3,i%2?BLOCK.DARK:101,0);
  }
  else if(c.kind==='column'){
   const r=Math.max(.65,c.w/2),baseH=Math.max(1,c.height??8),woodColumn=c.variant==='lusheng'||c.variant==='lantern',mat=miaoPack?(woodColumn?122:131):(zoneHash(c.x,c.y)%3?81:80);
   for(let z=Math.floor(c.y-r);z<=Math.ceil(c.y+r);z++)for(let x=Math.floor(c.x-r);x<=Math.ceil(c.x+r);x++)if(((x+.5-c.x)/r)**2+((z+.5-c.y)/r)**2<=1)column(x,z,base,base+baseH,mat);
   detail(`${c.id??`col-${done}`}-cap`,c.x,c.y,r*2+.4,r*2+.4,base+baseH-.5,.5,miaoPack?131:80,0);detail(`${c.id??`col-${done}`}-base`,c.x,c.y,r*2+.5,r*2+.5,base,.5,miaoPack?131:82,0);
   if(woodColumn){detail(`${c.id??`col-${done}`}-top`,c.x,c.y,r*2+.8,r*2+.8,base+baseH+.1,.5,miaoPack?151:91,0);detail(`${c.id??`col-${done}`}-lamp`,c.x,c.y,.3,.3,base+baseH+.6,.3,zoneHash(c.x,c.y)%2?BLOCK.WHITE:151,0,false);}
  }
  else if(c.kind==='architrave'){
   const id=c.id??`arch-${done}`,baseH=Math.max(2,c.height??9);
   detail(`${id}-beam`,c.x,c.y,c.w,c.d,baseH-1,1.2,81,(c.rot??0));
   detail(`${id}-cap`,c.x,c.y,c.w+.6,c.d+.6,baseH+.2,.5,80,(c.rot??0));
  }
  else if(c.kind==='obelisk'){
   const id=c.id??`ob-${done}`,h=Math.max(4,c.height??10),r0=Math.max(1,c.w/2);
   for(let y=0;y<h;y++){const half=Math.max(.5,r0*(1-y/h));for(let z=Math.floor(c.y-half);z<Math.ceil(c.y+half);z++)for(let x=Math.floor(c.x-half);x<Math.ceil(c.x+half);x++)column(x,z,base+y,base+y+1,83);}
   detail(`${id}-tip`,c.x,c.y,.5,.5,base+h,.8,83,0);
  }
  else if(c.kind==='colossus'){
   const id=c.id??`colossus-${done}`,w=Math.max(8,c.w),d=Math.max(7,c.d),h=Math.max(7,c.height??14);
   const x0=Math.floor(c.x-w/2),x1=Math.ceil(c.x+w/2),z0=Math.floor(c.y-d/2),z1=Math.ceil(c.y+d/2);
   // 半埋巨像头：下半身埋进石渣，上半是方形头壳；脸朝 +X（东）。
   for(let z=z0;z<z1;z++)for(let x=x0;x<x1;x++){
     const ex=Math.abs(x+.5-c.x)/(w/2),ez=Math.abs(z+.5-c.y)/(d/2);
     if(ex>.92||ez>.92)continue;
     const top=base+h*(ex<.58&&ez<.66?1:.78);
     column(x,z,base,base+top,80);
   }
   const face=x1;
   // 头巾侧翼/后脑（比脸更宽，半埋处只露出上缘）
   detail(`${id}-nemes-w`,c.x-w*.28,c.y,w*.32,d,base+h*.42,h*.38,108,0);
   detail(`${id}-nemes-e`,c.x+w*.28,c.y,w*.22,d,base+h*.42,h*.32,108,0);
   // 鼻梁、鼻头、眉骨、眼窝、嘴、耳
   detail(`${id}-brow`,face-.8,c.y,w*.10,d*.78,base+h*.66,h*.16,81,0);
   detail(`${id}-nose`,face+.9,c.y,2.8,3.4,base+h*.43,h*.22,81,0);
   detail(`${id}-eye-n`,face-.4,c.y+d*.28,1.2,2.0,base+h*.55,h*.12,86,0);
   detail(`${id}-eye-s`,face-.4,c.y-d*.28,1.2,2.0,base+h*.55,h*.12,86,0);
   detail(`${id}-mouth`,face-.2,c.y,1.0,4.2,base+h*.30,h*.06,86,0);
   detail(`${id}-chin`,face-.8,c.y,w*.08,d*.42,base+h*.20,h*.10,81,0);
   for(const side of [-1,1])detail(`${id}-ear-${side}`,c.x+w*.18,c.y+side*d*.43,2.0,2.2,base+h*.48,h*.16,83,0);
  }
  else if(c.kind==='silo'||c.kind==='fuel_tank'){for(let z=Math.floor(c.y-c.d/2);z<Math.ceil(c.y+c.d/2);z++)for(let x=Math.floor(c.x-c.w/2);x<Math.ceil(c.x+c.w/2);x++)if(((x+.5-c.x)/(c.w/2))**2+((z+.5-c.y)/(c.d/2))**2<1.1)column(x,z,base,base+Math.max(h,4),BLOCK.METAL);}
  else if(c.kind==='wreck'){const id=c.id??`wreck-${done}`;detail(id,c.x,c.y,c.w,c.d,footing,base+1.5-footing,BLOCK.DARK,angle);detail(id,c.x,c.y,c.w*.8,c.d*.85,base+1.5,.5,BLOCK.RUST,angle);detail(id,c.x,c.y,c.w*.5,c.d*.5,base+2,1,BLOCK.RUST,angle);}
  else {const id=c.kind==='hedge'?BLOCK.LEAVES:c.kind==='crate'?([62,36,37][zoneHash(c.x,c.y)%3]):c.kind==='sandbag'?(zoneHash(c.x,c.y)%2?56:57):c.kind==='container'?([41,42,43,55][zoneHash(c.x,c.y)%4]):c.kind==='dumpster'?BLOCK.METAL:BLOCK.STONE;detail(c.id??`cover-${done}`,c.x,c.y,c.w,c.d,footing,base+h-footing,id,angle);}
  featureDone();
 }
 for(const p of map.props){const base=objectGround(p.x,p.y),w=p.w??(p.kind==='barrels'||p.kind==='pallets'?3:8),d=p.d??(p.kind==='barrels'?2:p.kind==='pallets'?3:8),a=(p.rot??0)*Math.PI/180,x=p.x,z=p.y;
  if(p.kind==='crane'){
   // Each leg reaches its own terrain/seabed. A single centre height leaves
   // the waterside legs floating above the dock's sloping shore.
   for(const dx of [-w*.4,w*.4])for(const dz of [-d*.4,d*.4])
    for(let zz=Math.floor(z+dz);zz<Math.ceil(z+dz+1);zz++)for(let xx=Math.floor(x+dx);xx<Math.ceil(x+dx+1);xx++)
     column(xx,zz,Math.min(base,ground(xx,zz)),base+18,BLOCK.METAL);
   box(x-w/2,z-d/2,x+w/2,z-d/2+2,base+18,base+20,BLOCK.METAL);box(x-1,z-d/2,x+1,z+d/2,base+17,base+19,BLOCK.METAL);box(x-2,z-2,x+2,z+2,base+16,base+19,BLOCK.RUST);
  }
  else if(p.kind==='aircraft'){rotatedBox(x,z,4,d,base,3,BLOCK.METAL,a);rotatedBox(x,z,w,5,base+1,1,BLOCK.METAL,a);rotatedBox(x,z-d*.35,Math.max(7,w*.35),3,base+2,1,BLOCK.RUST,a);rotatedBox(x,z-d*.4,1,5,base+2,5,BLOCK.METAL,a);}
  else if(p.kind==='fountain'){
   const {x0,x1,z0,z1,surface}=fountains.find(f=>f.prop===p)!;
   for(let zz=z0;zz<z1;zz++)for(let xx=x0;xx<x1;xx++){
    const side=Math.min(xx-x0,x1-1-xx),end=Math.min(zz-z0,z1-1-zz),edge=Math.min(side,end);
    const steps=side<=2&&Math.abs(zz+.5-z)<=2||end<=2&&Math.abs(xx+.5-x)<=2;
    const floor=edge===0?surface+(steps?0:1):surface-(steps&&edge<=2?edge:3);
    column(xx,zz,minY,floor,BLOCK.STONE);
    column(xx,zz,floor,surface+1,BLOCK.AIR);
    heights[col(xx,zz)]=primary[col(xx,zz)]=floor;
   }
   box(x-1,z-1,x+1,z+1,surface-3,surface+3,BLOCK.STONE);
  }
  else if(p.kind==='lamp'){box(x,z,x+1,z+1,base,base+5,BLOCK.DARK);box(x-1,z-1,x+2,z+2,base+5,base+6,BLOCK.WHITE);}
  else if(p.kind==='tower'||p.kind==='radar'){for(const dx of [-3,3])for(const dz of [-3,3])box(x+dx,z+dz,x+dx+1,z+dz+1,base,base+12,BLOCK.METAL);box(x-4,z-4,x+5,z+5,base+12,base+14,BLOCK.CONCRETE);box(x-3,z-3,x+4,z+4,base+14,base+17,BLOCK.GLASS);}
  else if(p.kind==='gate'){for(const dx of [-w/2,w/2])box(x+dx,z,x+dx+2,z+2,base,base+5,BLOCK.STONE);box(x-w/2,z,x+w/2+2,z+2,base+5,base+6,BLOCK.METAL);}
  else if(p.kind==='fuel_tank'||p.kind==='silo'){rotatedBox(x,z,w,d,base,p.kind==='silo'?8:4,BLOCK.METAL,a);}
  else if(p.kind==='pipes'){box(x-w/2,z,x+w/2,z+1,base+1,base+2,BLOCK.METAL);for(const dx of [-w/2,w/2-1])box(x+dx,z,x+dx+1,z+1,base,base+2,BLOCK.METAL);}
  else if(p.kind==='sign'){box(x,z,x+1,z+1,base,base+4,BLOCK.WOOD);box(x-2,z,x+3,z+1,base+4,base+5,BLOCK.WOOD);}
  else if(p.kind==='barrels'||p.kind==='pallets'||p.kind==='gas_station'){detail(`prop-${done}`,x,z,w,d,base,p.kind==='gas_station'?2.5:1.5,p.kind==='pallets'?BLOCK.WOOD:BLOCK.RUST,a);}
  featureDone();
 }
 // Covers and props are sculpted after the buildings, so a canopy can grow back
 // through a fresh doorway. Re-open the physical door tunnel (wall depth plus
 // 1 m outside) once all authored features exist.
 for(const plan of data.interiors??[]){
  const depth=plan.interior.x0-plan.x0;
  for(const d of plan.doors){
   if(d.side==='south')box(d.a0,plan.z0-1,d.a1,plan.z0+depth,plan.base+1,plan.base+(map.id==='pharaoh'?5:4),BLOCK.AIR);
   else if(d.side==='north')box(d.a0,plan.z1-depth,d.a1,plan.z1+1,plan.base+1,plan.base+(map.id==='pharaoh'?5:4),BLOCK.AIR);
   else if(d.side==='west')box(plan.x0-1,d.a0,plan.x0+depth,d.a1,plan.base+1,plan.base+(map.id==='pharaoh'?5:4),BLOCK.AIR);
   else box(plan.x1-depth,d.a0,plan.x1+1,d.a1,plan.base+1,plan.base+(map.id==='pharaoh'?5:4),BLOCK.AIR);
  }
 }
 // 法老图：室内地面高出室外 1 m；给每栋可进入建筑门外铺 3 m 真实石坡，并把
 // primary 同步为坡面。载具现在能顺坡进室内，不是靠隐形禁行/空气墙。
 if(map.id==='pharaoh')for(const plan of data.interiors??[]){
  for(const d of plan.doors){
   for(let i=0;i<3;i++){
    const top=plan.base+(i+1)/3;
    let x0=0,x1=0,z0=0,z1=0;
    if(d.side==='south'){x0=d.a0;x1=d.a1;z0=plan.z0-3+i;z1=plan.z0-2+i;}
    else if(d.side==='north'){x0=d.a0;x1=d.a1;z0=plan.z1+1+i;z1=plan.z1+2+i;}
    else if(d.side==='west'){x0=plan.x0-3+i;x1=plan.x0-2+i;z0=d.a0;z1=d.a1;}
    else {x0=plan.x1+1+i;x1=plan.x1+2+i;z0=d.a0;z1=d.a1;}
    detail(`door-ramp-${plan.id}-${d.side}-${i}`,(x0+x1)/2,(z0+z1)/2,Math.max(.5,x1-x0),Math.max(.5,z1-z0),plan.base,top-plan.base,80,0);
    for(let z=Math.floor(z0);z<Math.ceil(z1);z++)for(let x=Math.floor(x0);x<Math.ceil(x1);x++){const k=col(x,z);if(k>=0)primary[k]=top;}
   }
  }
 }
 clearDoorApproaches(data);
 data.ladders??=[];
 for(const pit of BATTLEFIELDS[map.id]?.pits??[]){
  for(let z=pit.z0;z<pit.z1;z++)for(const x of [pit.x0-1,pit.x1])column(x,z,pit.floor,pit.top,29);
  for(let x=pit.x0;x<pit.x1;x++)for(const z of [pit.z0-1,pit.z1])column(x,z,pit.floor,pit.top,35);for(let x=pit.x0-1;x<=pit.x1;x++)for(const z of [pit.z0-1,pit.z1])put(x,pit.top-1,z,52);for(let z=pit.z0;z<pit.z1;z++)for(const x of [pit.x0-1,pit.x1])put(x,pit.top-1,z,52);
  // Re-open the authored ramp mouths after applying the retaining lining.
  const sides=[pit.ramp,...(pit.id==='docks-drydock'?['south'] as const:[])];
  for(const side of sides){const cx=(pit.x0+pit.x1)/2,cz=(pit.z0+pit.z1)/2;for(let offset=-pit.width/2;offset<pit.width/2;offset++){const x=side==='north'||side==='south'?Math.floor(cx+offset):side==='west'?pit.x0-1:pit.x1,z=side==='west'||side==='east'?Math.floor(cz+offset):side==='north'?pit.z0-1:pit.z1,k=col(x,z);if(k>=0){const h=heights[k];column(x,z,h,pit.top+3,BLOCK.AIR);column(x,z,h-1,h,51);}}}
  for(let z=pit.z0;z<pit.z1;z++)for(let x=pit.x0;x<pit.x1;x++)put(x,pit.floor-1,z,23);
  for(const ladder of pitLadders(pit)){data.ladders.push(ladder);const ax=ladder.x+ladder.normalX*.48,az=ladder.z+ladder.normalZ*.48;box(ax-.38,az-.38,ax+.38,az+.38,pit.floor,pit.top+2,BLOCK.AIR);box(ladder.exitX-.38,ladder.exitZ-.38,ladder.exitX+.38,ladder.exitZ+.38,pit.top,pit.top+3,BLOCK.AIR);}
 }
 // Keep the boundary wall on land so it does not cut across the river or the open sea.
 for(let t=0;t<map.size;t++)for(const [x,z] of [[t,0],[t,map.size-1],[0,t],[map.size-1,t]]){
  if(ground(x,z)<-2&&(map.id==='broken_bridge'||(map.id==='docks'||map.waterVolumes)&&(x===map.size-1||x===0||z===0||z===map.size-1)))continue;
  column(x,z,ground(x,z),ground(x,z)+2,fillStone);
 }
 for(const p of fountains.sort((a,b)=>b.surface-a.surface)){
  fillVoxelWater(data,p.surface,BLOCK.WATER,[[p.x0+2,p.z0+2]]);
 }
 // 多高度水域：河流/梯田共用 volumeSurface/volumeBed；深水才灌体素水，浅水只做数据+渲染薄板。
 if(map.waterVolumes?.length){
  const count=width*depth;data.waterVolumes=map.waterVolumes;
  const volumeSurface=new Float32Array(count).fill(-32768),volumeBed=new Float32Array(count).fill(-32768);
  data.volumeSurface=volumeSurface;data.volumeBed=volumeBed;
  for(const volume of map.waterVolumes){
   const xs:number[]=[],zs:number[]=[];
   if(volume.rect){for(let z=Math.floor(volume.rect.z0);z<=Math.ceil(volume.rect.z1);z++)for(let x=Math.floor(volume.rect.x0);x<=Math.ceil(volume.rect.x1);x++){if(x+.5<volume.rect.x0||x+.5>volume.rect.x1||z+.5<volume.rect.z0||z+.5>volume.rect.z1)continue;const k=col(x,z);if(k>=0){volumeSurface[k]=volume.surfaceY;volumeBed[k]=volume.bedY??volume.surfaceY-.3;}}}
   else if(volume.polygon){for(let z=Math.floor(minZ);z<minZ+depth;z++)for(let x=Math.floor(minX);x<minX+width;x++){if(!inPolygon(x+.5,z+.5,volume.polygon))continue;const k=col(x,z);if(k<0)continue;volumeSurface[k]=volume.surfaceY;volumeBed[k]=volume.bedY??heights[k];}}
   if(!volume.swim)continue;
   const sources:[number,number][]=[];
   for(let z=Math.floor(minZ);z<minZ+depth;z++)for(let x=Math.floor(minX);x<minX+width;x++){const k=col(x,z);if(k<0||volumeSurface[k]!==volume.surfaceY)continue;if(ground(x+.5,z+.5)<volume.surfaceY-.05)sources.push([x,z]);}
   fillVoxelWater(data,volume.surfaceY,volume.material??waterMaterial,sources);
  }
 }
 const waterAreas=map.terrain.filter(p=>p.kind==='water');
 if(waterAreas.length){
  const sources:[number,number][]=[];
  for(let z=minZ;z<minZ+depth;z++)for(let x=minX;x<minX+width;x++){
   if(ground(x,z)<-2&&(map.id==='docks'&&x>=map.size||waterAreas.some(p=>inPolygon(x+.5,z+.5,p.polygon))))sources.push([x,z]);
  }
  fillVoxelWater(data,-2,waterMaterial,sources);
 }
 if(map.id==='broken_bridge')for(let k=0;k<water.length;k++){
  if(water[k]===-32768)continue;
  const x=minX+k%width,z=minZ+Math.floor(k/width),bed=heights[k],top=tops[k];
  if((top===BLOCK.ROAD||top===BLOCK.CONCRETE||top===BLOCK.WHITE)&&blockAt(data,x,bed-1,z)===top)put(x,bed-1,z,24);
 }
 report?.({stage:'合并方块外表面',completed:0,total:Math.ceil(width/64)*Math.ceil(depth/64),ratio:.48});
 data.chunks=meshVoxelChunks(data,p=>report?.({stage:'合并方块外表面',completed:p.done,total:p.total,ratio:.48+.42*p.done/p.total}),chunkSize);
 return data;
}

export function meshVoxelChunks(data:TerrainData,report?:(p:{done:number;total:number})=>void,chunk=64):VoxelChunkData[]{
 const result:VoxelChunkData[]=[],total=Math.ceil(data.width/chunk)*Math.ceil(data.depth/chunk);let done=0;
 // At a material boundary, exactly one side owns the surface.
 const visibleFace=(a:number,b:number)=>a!==0&&(b===0||transparent(b)&&!transparent(a)||transparent(a)&&transparent(b)&&a>b);
 const key=(x:number,y:number,z:number)=>x+','+y+','+z;
 const detailCells=new Map<string,{x:number;y:number;z:number;id:number}>();
 const detailedVoxels=new Set<string>();
 for(const b of data.detailBoxes??[]){
  for(let z=Math.round((b.z-b.d/2)*2);z<Math.round((b.z+b.d/2)*2);z++)
   for(let y=Math.round(b.bottom*2);y<Math.round(b.top*2);y++)
    for(let x=Math.round((b.x-b.w/2)*2);x<Math.round((b.x+b.w/2)*2);x++){
     if(isSolidBlock(blockAt(data,x/2,y/2,z/2)))continue;
     detailCells.set(key(x,y,z),{x,y,z,id:b.material});
     detailedVoxels.add(key(Math.floor(x/2),Math.floor(y/2),Math.floor(z/2)));
    }
 }
 const voxelMaterial=(x:number,y:number,z:number)=>detailCells.get(key(x,y,z))?.id??blockAt(data,x/2,y/2,z/2);
 const sideMaterial=(m:number,axis:number)=>[BLOCK.GRASS,19,20,21].includes(Math.abs(m))&&!(axis===1&&m>0)?Math.sign(m)*BLOCK.GRASS_SIDE:m;
 type BufferSet={p:number[];n:number[];uv:number[];c:number[];block:number[];idx:number[]};
 const createBuffer=():BufferSet=>({p:[],n:[],uv:[],c:[],block:[],idx:[]});
 const emit=(dst:BufferSet,q:number[],axis:number,material:number,w:number,h:number)=>{
  const tint=data.tint??[1,1,1];
  const u=(axis+1)%3,v=(axis+2)%3,sign=Math.sign(material),du=[0,0,0],dv=[0,0,0];
  du[u]=w;dv[v]=h;
  const a=q.map((p,i)=>p+du[i]),b=q.map((p,i)=>p+du[i]+dv[i]),c=q.map((p,i)=>p+dv[i]);
  const base=dst.p.length/3,normal=[0,0,0];normal[axis]=sign;
  const shade=axis===1?(sign>0?1:.65):axis===0?.94:.86;
  for(const p of sign>0?[q,a,b,c]:[q,c,b,a]){
   dst.p.push(...p);dst.n.push(...normal);dst.uv.push(axis===0?p[2]:p[0],axis===1?p[2]:p[1]);dst.c.push(shade*tint[0],shade*tint[1],shade*tint[2]);dst.block.push(Math.abs(material));
  }
  dst.idx.push(base,base+1,base+2,base,base+2,base+3);
 };
 const finish=(s:BufferSet,transparent:boolean)=>{
  if(s.idx.length)result.push({position:new Float32Array(s.p),normal:new Float32Array(s.n),uv:new Float32Array(s.uv),color:new Float32Array(s.c),block:new Float32Array(s.block),index:new Uint32Array(s.idx),transparent});
 };
 const buffers=new Map<string,[BufferSet,BufferSet]>();
 for(let cz=0;cz<data.depth;cz+=chunk)for(let cx=0;cx<data.width;cx+=chunk){const w=Math.min(chunk,data.width-cx),d=Math.min(chunk,data.depth-cz);let top=0;if(data.columnTop){for(let zz=0;zz<d;zz++)for(let xx=0;xx<w;xx++){const t=data.columnTop[(cz+zz)*data.width+cx+xx];if(t>top)top=t;}}else top=data.height;const h=Math.max(1,Math.min(data.height,top));const origin=[data.minX+cx,data.minY,data.minZ+cz],dims=[w,h,d];const chunkKey=Math.floor(cx/chunk)+','+Math.floor(cz/chunk);let sets=buffers.get(chunkKey);if(!sets){sets=[createBuffer(),createBuffer()];buffers.set(chunkKey,sets);}
  for(let axis=0;axis<3;axis++){const u=(axis+1)%3,v=(axis+2)%3,mask=new Int16Array(dims[u]*dims[v]),x=[0,0,0];
   for(x[axis]=-1;x[axis]<dims[axis];x[axis]++){
    let n=0;
    for(x[v]=0;x[v]<dims[v];x[v]++)for(x[u]=0;x[u]<dims[u];x[u]++){
     const px=x[0]+origin[0],py=x[1]+origin[1],pz=x[2]+origin[2];
     const bx=px+Number(axis===0),by=py+Number(axis===1),bz=pz+Number(axis===2);
     const a=blockAt(data,px,py,pz),b=blockAt(data,bx,by,bz);
     const m=sideMaterial(x[axis]>=0&&visibleFace(a,b)?a:x[axis]+1<dims[axis]&&visibleFace(b,a)?-b:0,axis);
     mask[n++]=m;
     if(!m||(!detailedVoxels.has(key(px,py,pz))&&!detailedVoxels.has(key(bx,by,bz))))continue;
     mask[n-1]=0;
     for(let i=0;i<2;i++)for(let j=0;j<2;j++){
      const inner=[px*2,py*2,pz*2],outer=inner.slice();
      inner[u]+=i;inner[v]+=j;inner[axis]++;
      outer[u]+=i;outer[v]+=j;outer[axis]+=2;
      const own=m>0?inner:outer,neighbor=m>0?outer:inner;
      if(detailCells.has(key(own[0],own[1],own[2])))continue;
      if(!visibleFace(m>0?a:b,voxelMaterial(neighbor[0],neighbor[1],neighbor[2])))continue;
      emit(sets[transparent(Math.abs(m))?1:0],outer.map(value=>value/2),axis,m,.5,.5);
     }
    }
    let j=0;while(j<dims[v]){let i=0;while(i<dims[u]){const m=mask[j*dims[u]+i];if(!m){i++;continue;}let w=1;while(i+w<dims[u]&&mask[j*dims[u]+i+w]===m)w++;let h=1;outer:while(j+h<dims[v]){for(let k=0;k<w;k++)if(mask[(j+h)*dims[u]+i+k]!==m)break outer;h++;}
      const q=origin.slice();q[axis]+=x[axis]+1;q[u]+=i;q[v]+=j;
      emit(sets[transparent(Math.abs(m))?1:0],q,axis,m,w,h);
      for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++)mask[(j+yy)*dims[u]+i+xx]=0;i+=w;
    }j++;}
   }
  }
  done++;if(done%4===0||done===total)report?.({done,total});
 }
 // Half-grid details share the terrain chunk buffers: one draw call per chunk
 // instead of a second mesh per chunk. Details are opaque and use the same
 // material array, so merging is lossless.
 for(const cell of detailCells.values()){
  const point=[cell.x,cell.y,cell.z],chunkKey=Math.floor(cell.x/(chunk*2))+','+Math.floor(cell.z/(chunk*2));
  let pair=buffers.get(chunkKey);
  if(!pair){pair=[createBuffer(),createBuffer()];buffers.set(chunkKey,pair);}
  const dst=pair[0];
  for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
   const neighbor=point.slice();neighbor[axis]+=sign;
   if(!visibleFace(cell.id,voxelMaterial(neighbor[0],neighbor[1],neighbor[2])))continue;
   const q=point.map(value=>value/2);if(sign>0)q[axis]+=.5;
   emit(dst,q,axis,sign*cell.id,.5,.5);
  }
 }
 for(const [opaque,transparent] of buffers.values()){finish(opaque,false);finish(transparent,true);}
 const stitched=stitchVoxelEdges(result);
 // Bake how much of the local hemisphere is blocked at each exposed corner.
 for(const chunk of stitched){
  if(chunk.transparent)continue;
  const {position,normal}=chunk,occlusion=new Uint8Array(position.length/3);
  const point=[0,0,0];
  for(let vertex=0;vertex<occlusion.length;vertex++){
   const i=vertex*3,axis=normal[i]!==0?0:normal[i+1]!==0?1:2,u=(axis+1)%3,v=(axis+2)%3;
   point[axis]=Math.floor((position[i+axis]+normal[i+axis]*.05)*2);
   let occluded=0;
   for(const sideU of [-.22,.22])for(const sideV of [-.22,.22]){
    point[u]=Math.floor((position[i+u]+sideU)*2);point[v]=Math.floor((position[i+v]+sideV)*2);
    const id=voxelMaterial(point[0],point[1],point[2]);
    if(id!==0&&!transparent(id))occluded++;
   }
   occlusion[vertex]=Math.min(255,occluded*85);
  }
  chunk.occlusion=occlusion;
 }
 return stitched;
}
