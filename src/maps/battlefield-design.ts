import type {MapDef,Cover,Vec2} from './types';
import {pharaohHeight} from './pharaoh-height';
import {miaoHeight} from './miao-village/height';
export interface LadderDef {id:string;x:number;z:number;normalX:number;normalZ:number;bottom:number;top:number;exitX:number;exitZ:number;variant:number;}
export interface PitDef {id:string;x0:number;z0:number;x1:number;z1:number;floor:number;top:number;ramp:'north'|'south'|'west'|'east';width:number;length:number;ladderSides:('north'|'south'|'west'|'east')[];}
export interface BattlefieldDesign {
 pits:PitDef[];
 lanes:Vec2[][];
 sniperPoints:{x:number;z:number;height:number;name:string}[];
 /** 手工地图：跳过 enhanceBattlefield 的自动撒掩体。 */
 handcrafted?:boolean;
 /** 仅本图使用的垂直范围（体素层数/内存预算）。 */
 vertical?:{minY:number;height:number};
 /** 地形分块边长（米），默认 64。 */
 chunkSize?:number;
 /** 导航支撑层数，默认 3。 */
 navigationLayers?:number;
 /** 导航栅格步长（米），默认 3；500 m 图可用 4。 */
 navigationStep?:number;
 /** applyBattlefieldGrading 的钳制范围，默认 [-6,14]。 */
 heightClamp?:[number,number];
 /** 是否启用动态载具刷新（旧图缺省 false）。 */
 dynamicVehicleRespawn?:boolean;
 /** 本图占点得分倍率，默认 1。 */
 scoreRate?:number;
 /** 世界顶点色乘子（暖化/压暗），缺省 [1,1,1]。 */
 worldTint?:[number,number,number];
 /** 世界 AO 强度，缺省 .32。 */
 worldAoStrength?:number;
 /** 相机远裁剪（米），默认 700。 */
 viewDistance?:number;
 exposure?:number;
 sunIntensity?:number;
 hemiIntensity?:number;
 ambientIntensity?:number;
 backgroundIntensity?:number;
 /** 本图雾参数。 */
 fog?:{color:string;density:number};
}
const clamp=(v:number,a:number,b:number)=>Math.max(a,Math.min(b,v));
const smooth=(a:number,b:number,v:number)=>{const t=clamp((v-a)/(b-a),0,1);return t*t*(3-2*t);};
const hill=(x:number,z:number,cx:number,cz:number,rx:number,rz:number,top:number,base:number)=>base+(top-base)*(1-smooth(.34,1,Math.hypot((x-cx)/rx,(z-cz)/rz)));
const plateau=(x:number,z:number,cx:number,cz:number,w:number,d:number,top:number,base:number,shoulder=30)=>{const distance=Math.hypot(Math.max(0,Math.abs(x-cx)-w/2),Math.max(0,Math.abs(z-cz)-d/2));return base+(top-base)*(1-smooth(0,shoulder,distance));};
export const BATTLEFIELDS:Record<string,BattlefieldDesign>={
 docks:{pits:[{id:'docks-drydock',x0:130,z0:140,x1:170,z1:164,floor:-5,top:2,ramp:'north',width:12,length:28,ladderSides:['west','east']}],sniperPoints:[{x:66,z:100,height:9,name:'西仓作业高台'},{x:80,z:180,height:6,name:'货场挡土台'}],lanes:[[[150,35],[150,112],[150,152],[150,192],[150,265]],[[70,45],[70,110],[85,150],[78,205],[110,255]],[[225,45],[225,120],[218,180],[225,250]]]},
 broken_bridge:{pits:[{id:'bridge-service-cut',x0:66,z0:116,x1:82,z1:132,floor:-2,top:3,ramp:'west',width:6,length:22,ladderSides:['east']}],sniperPoints:[{x:38,z:200,height:14,name:'西岭岩肩'},{x:108,z:194,height:8,name:'北岸收费平台'}],lanes:[[[150,35],[145,95],[130,128],[130,174],[140,212],[150,267]],[[242,55],[243,115],[243,150],[246,190],[222,245]],[[70,62],[60,108],[58,165],[64,210],[100,250]]]},
 garden:{pits:[{id:'garden-service-court',x0:148,z0:198,x1:168,z1:218,floor:0,top:5,ramp:'west',width:6,length:24,ladderSides:['east']},{id:'garden-retaining-cut',x0:118,z0:112,x1:134,z1:128,floor:3,top:8,ramp:'north',width:6,length:26,ladderSides:['east']}],sniperPoints:[{x:75,z:120,height:11,name:'西果园缓丘'},{x:200,z:108,height:12,name:'庄园高地据点'}],lanes:[[[25,150],[70,150],[110,160],[150,150],[205,150],[275,150]],[[45,205],[85,210],[125,218],[180,220],[220,200],[260,185]],[[45,94],[85,88],[125,86],[166,96],[205,106],[260,112]]]},
 airfield:{pits:[{id:'airfield-maintenance-pit',x0:170,z0:178,x1:184,z1:194,floor:-3,top:3,ramp:'west',width:6,length:24,ladderSides:['east']}],sniperPoints:[{x:230,z:210,height:8,name:'管制区土台'},{x:52,z:212,height:7,name:'机坪防护土堤'}],lanes:[[[150,35],[150,105],[150,128],[150,176],[150,190],[150,265]],[[70,45],[65,105],[75,145],[75,190],[90,250]],[[230,55],[230,110],[236,150],[235,192],[240,250]]]},
 pharaoh:{
  pits:[],lanes:[],sniperPoints:[{x:190,z:610,height:58,name:'金字塔顶'},{x:460,z:640,height:41,name:'狮身人面像头部'}],
  handcrafted:true,vertical:{minY:-12,height:72},chunkSize:160,navigationLayers:4,
  heightClamp:[-9,58],scoreRate:.5,viewDistance:1200,worldTint:[0.84,0.78,0.70],worldAoStrength:.19,fog:{color:'#d2ba96',density:.00135},
 },
 miao_village:{
  pits:[],lanes:[],sniperPoints:[{x:155,z:365,height:16,name:'鼓藏堂祭祀坪'},{x:384,z:348,height:11.5,name:'剧场舞台'}],
  handcrafted:true,vertical:{minY:-8,height:108},chunkSize:100,navigationLayers:5,navigationStep:4,
  heightClamp:[-8,88],scoreRate:.18,viewDistance:900,worldTint:[0.88,0.90,0.85],worldAoStrength:.30,
  fog:{color:'#a7b6b2',density:.00165},dynamicVehicleRespawn:true,
  exposure:1.05,sunIntensity:2.1,hemiIntensity:1.72,ambientIntensity:.34,backgroundIntensity:.9,
 },
};
export function battlefieldHeight(id:string,x:number,z:number){
 if(id==='docks'){let h=Math.max(2,plateau(x,z,66,100,34,40,9,2,32),plateau(x,z,80,180,34,34,6,2,30));h-=6*smooth(239,258,x);return h;}
 if(id==='broken_bridge'){const bank=Math.abs(z-150),ford=1-smooth(7,18,Math.abs(x-243));let h=-4+6*smooth(12,44,bank);h=h*(1-ford)+(-3+5*smooth(12,44,bank))*ford;if(bank>=20){const t=1-smooth(6,18,Math.abs(x-130));h=h*(1-t)+2*t;}if(bank>40)h=Math.max(h,hill(x,z,38,200,52,72,14,2),plateau(x,z,105,195,34,30,8,2,34),plateau(x,z,195,105,42,32,6,2,30));return h;}
 if(id==='garden'){return Math.max(3,hill(x,z,75,120,60,68,11,3),plateau(x,z,200,117,62,58,12,3,44),plateau(x,z,100,196,46,48,8,3,38),hill(x,z,232,224,54,46,7,3));}
 if(id==='airfield'){const edge=Math.min(x,z,300-x,300-z);let h=6*(1-smooth(5,36,edge));if(Math.abs(z-150)<=21&&x>48&&x<252)h=0;else h=Math.max(h,plateau(x,z,230,211,44,38,8,0,40),hill(x,z,52,212,46,43,7,0),plateau(x,z,70,90,44,38,5,0,34),plateau(x,z,152,196,44,42,3,0,22));return h;}
 if(id==='pharaoh')return pharaohHeight(x,z);
 if(id==='miao_village')return miaoHeight(x,z);
 return 0;
}
export function pitGrade(p:PitDef,x:number,z:number,input:number){const distance=Math.hypot(Math.max(0,p.x0-x,x-p.x1),Math.max(0,p.z0-z,z-p.z1));let h=distance<8?input+(p.top-input)*(1-smooth(0,8,distance)):input;
 if(x>=p.x0&&x<p.x1&&z>=p.z0&&z<p.z1)h=p.floor;
 const centerX=(p.x0+p.x1)/2,centerZ=(p.z0+p.z1)/2;
 const ramps=[p.ramp,...(p.id==='docks-drydock'?['south'] as const:[])];
 for(const side of ramps){const along=side==='north'?p.z0-z:side==='south'?z-p.z1:side==='west'?p.x0-x:x-p.x1,across=side==='north'||side==='south'?Math.abs(x-centerX):Math.abs(z-centerZ);if(along<0||along>p.length+12||across>p.width/2+3)continue;const target=p.floor+(p.top-p.floor)*clamp(along/p.length,0,1),end=smooth(p.length,p.length+12,along),weight=(1-smooth(p.width/2,p.width/2+3,across))*(1-end);h=h+(target-h)*weight;}
 return clamp(h,-6,14);
}
export function applyBattlefieldGrading(id:string,x:number,z:number,h:number){for(const pit of BATTLEFIELDS[id]?.pits??[])h=pitGrade(pit,x,z,h);const range=BATTLEFIELDS[id]?.heightClamp??[-6,14];return clamp(h,range[0],range[1]);}
export function pitLadders(p:PitDef):LadderDef[]{return p.ladderSides.map((side,index)=>{const x=side==='west'?p.x0:side==='east'?p.x1:Math.floor((p.x0+p.x1)/2)+.5,z=side==='north'?p.z0:side==='south'?p.z1:Math.floor((p.z0+p.z1)/2)+.5,nx=side==='west'?1:side==='east'?-1:0,nz=side==='north'?1:side==='south'?-1:0;return {id:`${p.id}-${side}`,x,z,normalX:nx,normalZ:nz,bottom:p.floor,top:p.top,exitX:x-nx*.8,exitZ:z-nz*.8,variant:([...p.id].reduce((a,c)=>a+c.charCodeAt(0),0)+index)%4};});}
export function insidePitWork(p:PitDef,x:number,z:number,margin=2){if(x>=p.x0-margin&&x<=p.x1+margin&&z>=p.z0-margin&&z<=p.z1+margin)return true;const sides=[p.ramp,...(p.id==='docks-drydock'?['south'] as const:[])];for(const side of sides){const along=side==='north'?p.z0-z:side==='south'?z-p.z1:side==='west'?p.x0-x:x-p.x1,across=side==='north'||side==='south'?Math.abs(x-(p.x0+p.x1)/2):Math.abs(z-(p.z0+p.z1)/2);if(along>=-margin&&along<=p.length+8&&across<=p.width/2+margin)return true;}return false;}
function nearSegment(x:number,z:number,a:Vec2,b:Vec2){const dx=b[0]-a[0],dz=b[1]-a[1],t=clamp(((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1),0,1);return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);}
export function enhanceBattlefield(map:MapDef):MapDef {const design=BATTLEFIELDS[map.id];if(!design)return map;if(design.handcrafted)return {...map,extensions:{...map.extensions,artStyle:'realistic-pixel-voxel',designedPits:0,handcrafted:true}};const reserved=(x:number,z:number,r=2)=>design.pits.some(p=>insidePitWork(p,x,z,r));
 const covers=map.covers.filter(c=>!reserved(c.x,c.y,Math.min(5,Math.hypot(c.w,c.d)/2+1)));
 const extras:Cover[]=[];let index=0;
 for(const lane of design.lanes)for(let i=1;i<lane.length;i++){const a=lane[i-1],b=lane[i],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);for(let dist=10;dist<len;dist+=18){const sign=index%2?1:-1,offset=7+(index%3),x=Math.round(a[0]+dx*dist/len-dz/len*offset*sign),z=Math.round(a[1]+dz*dist/len+dx/len*offset*sign);index++;if(reserved(x,z,5)||map.spawns.some(s=>x>s.x-4&&x<s.x+s.w+4&&z>s.y-4&&z<s.y+s.d+4)||map.buildings.some(q=>{const xs=q.polygon.map(p=>p[0]),zs=q.polygon.map(p=>p[1]);return x>Math.min(...xs)-4&&x<Math.max(...xs)+4&&z>Math.min(...zs)-4&&z<Math.max(...zs)+4;})||map.roads.some(r=>r.points.some((p,j)=>j>0&&nearSegment(x,z,r.points[j-1],p)<r.width/2+2)))continue;
 const kind:Cover['kind']=map.id==='garden'?index%3?'wall':'crate':map.id==='broken_bridge'?index%3?'rock':'sandbag':index%3?'barrier':'wreck';extras.push({id:`tactical-${map.id}-${index}`,kind,x,y:z,w:kind==='rock'?3:5,d:kind==='rock'?3:1.2,height:index%4===0?2:1,rot:Math.atan2(-dz,dx)*180/Math.PI});if(index%3===0)extras.push({id:`tactical-corner-${index}`,kind:'crate',x:x+3,y:z+2,w:2,d:2,height:2});
 }}
 // Concrete/stone shoulders give sniper terrain cover and a visible purpose.
 for(const [i,p] of design.sniperPoints.entries()){for(const sign of [-1,1])extras.push({id:`ridge-cover-${i}-${sign}`,kind:'sandbag',x:p.x+sign*5,y:p.z+5,w:5,d:1,height:1});}
 if(map.id==='airfield'){extras.push({id:'runway-cross-cover-west',kind:'barrier',x:138,y:144,w:5,d:1,height:1},{id:'runway-cross-cover-east',kind:'barrier',x:162,y:156,w:5,d:1,height:1});}
 return {...map,covers:[...covers,...extras],capturePoints:map.capturePoints.map(c=>map.id==='airfield'&&c.id==='B'?{...c,name:'跑道封锁区'}:c),extensions:{...map.extensions,artStyle:'realistic-pixel-voxel',maxTraversableHeightRange:30,designedPits:design.pits.length}};
}
