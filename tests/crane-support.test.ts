import {describe,it,expect} from 'vitest';
import {getMap} from '../src/maps';
import {buildVoxelMapData,blockAt,isSolidBlock} from '../src/game/world/voxel-map-data';

describe('docks crane foundations',()=>{
 it('connects every leg to the ground or seabed below it',()=>{
  const map=getMap('docks')!,data=buildVoxelMapData(map);
  const ground=(x:number,z:number)=>data.heights[(Math.floor(z)-data.minZ)*data.width+Math.floor(x)-data.minX];
  for(const crane of map.props.filter(p=>p.kind==='crane')){
   const base=ground(crane.x,crane.y),w=crane.w??8,d=crane.d??8;
   for(const dx of [-w*.4,w*.4])for(const dz of [-d*.4,d*.4])
    for(let z=Math.floor(crane.y+dz);z<Math.ceil(crane.y+dz+1);z++)for(let x=Math.floor(crane.x+dx);x<Math.ceil(crane.x+dx+1);x++)
     for(let y=Math.min(base,ground(x,z));y<base;y++)expect(isSolidBlock(blockAt(data,x,y,z)),`${crane.label} at ${x},${y},${z}`).toBe(true);
  }
 });
});
