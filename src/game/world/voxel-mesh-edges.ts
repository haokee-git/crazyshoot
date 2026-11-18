import type {VoxelChunkData} from './voxel-map-data';

function edgeLine(position:Float32Array,start:number,end:number){
  const a=start*3,b=end*3;
  const axis=position[a]!==position[b]?0:position[a+1]!==position[b+1]?1:2;
  const u=(axis+1)%3,v=(axis+2)%3;
  return {axis,key:`${axis}:${position[a+u]}:${position[a+v]}`,from:position[a+axis],to:position[b+axis]};
}

function firstGreater(values:number[],value:number){
  let low=0,high=values.length;
  while(low<high){
    const middle=(low+high)>>>1;
    if(values[middle]<=value)low=middle+1;
    else high=middle;
  }
  return low;
}

/** Align edges of greedy quads across material, detail and chunk boundaries. */
export function stitchVoxelEdges(chunks:VoxelChunkData[]){
  const endpoints=new Map<string,Set<number>>();
  for(const {position} of chunks){
    for(let face=0;face<position.length/3;face+=4){
      for(let corner=0;corner<4;corner++){
        const edge=edgeLine(position,face+corner,face+(corner+1)%4);
        let line=endpoints.get(edge.key);
        if(!line){line=new Set();endpoints.set(edge.key,line);}
        line.add(edge.from);line.add(edge.to);
      }
    }
  }
  const lines=new Map<string,number[]>();
  for(const [key,ends] of endpoints)if(ends.size>2)lines.set(key,[...ends].sort((a,b)=>a-b));

  return chunks.map(chunk=>{
    const {position,normal,uv,color,block}=chunk;
    const positions=Array.from(position),normals=Array.from(normal),uvs=Array.from(uv);
    const colors=Array.from(color),blocks=Array.from(block),indices:number[]=[];
    const addVertex=(x:number,y:number,z:number,face:number)=>{
      const index=positions.length/3,offset=face*3;
      positions.push(x,y,z);
      normals.push(normal[offset],normal[offset+1],normal[offset+2]);
      colors.push(color[offset],color[offset+1],color[offset+2]);
      uvs.push(normal[offset]!==0?z:x,normal[offset+1]!==0?z:y);
      blocks.push(block[face]);
      return index;
    };
    for(let face=0;face<position.length/3;face+=4){
      const boundary:number[]=[];
      for(let corner=0;corner<4;corner++){
        const start=face+corner,end=face+(corner+1)%4;
        boundary.push(start);
        const {axis,key,from,to}=edgeLine(position,start,end);
        const coordinates=lines.get(key);
        if(!coordinates)continue;
        const min=Math.min(from,to),max=Math.max(from,to);
        const splits:number[]=[];
        for(let i=firstGreater(coordinates,min);i<coordinates.length&&coordinates[i]<max;i++)splits.push(coordinates[i]);
        if(from>to)splits.reverse();
        for(const coordinate of splits){
          const offset=start*3;
          const x=axis===0?coordinate:position[offset];
          const y=axis===1?coordinate:position[offset+1];
          const z=axis===2?coordinate:position[offset+2];
          boundary.push(addVertex(x,y,z,face));
        }
      }
      if(boundary.length===4){
        indices.push(face,face+1,face+2,face,face+2,face+3);
        continue;
      }
      // A center fan uses every boundary segment without making degenerate triangles.
      const i=face*3,j=i+6;
      const center=addVertex((position[i]+position[j])*.5,(position[i+1]+position[j+1])*.5,(position[i+2]+position[j+2])*.5,face);
      for(let corner=0;corner<boundary.length;corner++)indices.push(center,boundary[corner],boundary[(corner+1)%boundary.length]);
    }
    if(positions.length===position.length)return chunk;
    return {position:new Float32Array(positions),normal:new Float32Array(normals),uv:new Float32Array(uvs),
      color:new Float32Array(colors),block:new Float32Array(blocks),index:new Uint32Array(indices),transparent:chunk.transparent};
  });
}
