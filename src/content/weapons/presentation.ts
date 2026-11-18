import type {WeaponModelId} from './models';
export type Socket=[number,number,number];
export interface WeaponPresentationDef {family:'rifle'|'smg'|'sniper'|'shotgun'|'lmg'|'launcher';scale:number;rail:Socket;muzzle:Socket;gripRight:Socket;gripLeft:Socket;magazine:Socket;adsSeconds:number;}
const rifle=(railY:number,railZ:number,muzzleZ:number,extra:Partial<WeaponPresentationDef>={}):WeaponPresentationDef=>({family:'rifle',scale:.82,rail:[0,railY,railZ],muzzle:[0,.02,muzzleZ],gripRight:[.032,-.13,-.12],gripLeft:[-.035,-.035,.30],magazine:[0,-.21,.08],adsSeconds:.20,...extra});
/** Authoring coordinates, +Z points out of the barrel. No bounding-box fitting. */
export const WEAPON_PRESENTATION:Record<WeaponModelId,WeaponPresentationDef>={
 m16:rifle(.140,-.10,.74),m4a1:rifle(.146,-.04,.75),akm:rifle(.135,-.04,.74),
 mk14:rifle(.13,-.04,.75),awm:rifle(.125,-.04,.91,{family:'sniper',adsSeconds:.28,gripLeft:[-.035,-.035,.31]}),
 // AMR：更重更大，顶部导轨略高、枪口推到 1.05（枪口焰抬到制退器上沿），开镜更慢（反器材狙击枪的沉重操作感）。
 amr:rifle(.128,-.03,1.05,{family:'sniper',scale:.86,adsSeconds:.30,gripRight:[.035,-.14,-.17],gripLeft:[-.04,-.07,.42],magazine:[0,-.30,.09],muzzle:[0,.035,1.05]}),
 mp5:rifle(.125,-.035,.60,{family:'smg',scale:.9,adsSeconds:.16,gripLeft:[-.035,-.025,.24]}),
 uzi:rifle(.112,-.02,.37,{family:'smg',scale:1,adsSeconds:.16,gripRight:[.04,-.105,.06],gripLeft:[-.04,-.03,.20],magazine:[0,-.22,.06]}),
 vector:rifle(.14,.02,.53,{family:'smg',scale:.9,adsSeconds:.16,gripLeft:[-.035,-.12,.35],magazine:[0,-.25,.14]}),
 ump45:rifle(.11,.10,.55,{family:'smg',scale:.9,adsSeconds:.16,gripRight:[.035,-.13,-.02],gripLeft:[-.035,-.03,.36]}),
 m870:rifle(.12,0,.86,{family:'shotgun',adsSeconds:.24,gripRight:[.035,-.045,-.18],gripLeft:[-.035,-.03,.32]}),
 m249:rifle(.141,-.035,.93,{family:'lmg',adsSeconds:.30,gripLeft:[-.04,-.035,.4],magazine:[0,-.11,.28]}),
 // 发射器：瞄具座落在发射管/枪身顶部，枪口在战斗部/喷嘴前端（管轴 y=.02）。
 rpg:rifle(.092,-.02,.642,{family:'launcher',scale:.9,adsSeconds:.30,gripRight:[.032,-.125,-.08],gripLeft:[-.035,-.082,.20],magazine:[0,-.02,.40]}),
 flamethrower:rifle(.080,.02,.58,{family:'launcher',scale:.92,adsSeconds:.24,gripRight:[.032,-.145,0],gripLeft:[-.035,-.085,.30],magazine:[0,-.115,-.24]}),
};

/** Higher-power scopes show a larger aperture at full eye relief. */
export function scopeRelief(zoom:number){return .145-.0075*Math.min(8,Math.max(2,zoom));}

/** Shared by presentation obstruction probes and host-authoritative shooting. */
export function neutralMuzzleOffset(id:WeaponModelId,optic:string,ads:boolean):Socket{
 const d=WEAPON_PRESENTATION[id],s=d.scale;
 let x=.19,y=-.34,z=-.50;
 if(ads){const magnified=!['iron','red_dot','holo'].includes(optic),eyeY=optic==='iron'?.046:optic==='red_dot'?.054:optic==='holo'?.067:.066,eyeZ=optic==='iron'?.025:optic==='red_dot'?-.022:magnified?.105:.014,relief=optic==='iron'?.32:optic==='red_dot'?.25:optic==='holo'?.255:scopeRelief(Number.parseFloat(optic)||2)*s;
  x=-d.rail[0]*s;y=-(d.rail[1]+eyeY)*s;z=-relief-(-d.rail[2]+eyeZ)*s;
 }
 return[x+d.muzzle[0]*s,y+d.muzzle[1]*s,z-d.muzzle[2]*s];
}
