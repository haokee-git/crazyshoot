import type {MapDef} from '../../maps/types';
import {buildPyramid} from './pharaoh-pyramid';
import {buildSphinx} from './pharaoh-sphinx';
import {buildTunnel} from './pharaoh-tunnel';

/**
 * World-building operations handed to the pharaoh monument builders. Everything
 * written through these helpers lands in the same TerrainData used by rendering,
 * collision, support, navigation and bullet DDA — there is no second world.
 */
export interface PharaohOps {
  ground(x:number,z:number):number;
  put(x:number,y:number,z:number,id:number):void;
  column(x:number,z:number,y0:number,y1:number,id:number):void;
  box(x0:number,z0:number,x1:number,z1:number,y0:number,y1:number,id:number):void;
  carve(x0:number,z0:number,x1:number,z1:number,y0:number,y1:number):void;
  detail(id:string,cx:number,cz:number,w:number,d:number,y:number,h:number,material:number,angle?:number,solid?:boolean):void;
  setPrimary(x:number,z:number,y:number):void;
  addLamp(x:number,y:number,z:number):void;
}

/** Build the three authored monuments in one pass, before buildings/covers. */
export function buildPharaohStructures(map:MapDef,ops:PharaohOps){
  if(map.id!=='pharaoh')return;
  buildPyramid(ops);
  buildSphinx(ops);
  buildTunnel(ops);
  // A 端洞口与金字塔东门之间曾被隧道覆土岩脊封死（x399..408/y5 实心）。
  // 这里只重开真实通道并补 1m 顶板，不产生隐形墙。
  ops.carve(256,597,271,603,5,8.5);
  ops.box(256,597,271,603,8.5,9.5,81);
  // 墓室/储藏/塌陷间/雕像廊的内部环线：两处 3m 门洞把单口死路变成真环路。
  ops.carve(160,620,166,625,5,9.5);
  ops.carve(208,620,215,625,5,9.5);
}
