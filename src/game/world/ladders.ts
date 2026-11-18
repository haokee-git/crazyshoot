import * as THREE from 'three';
import type {LadderDef} from '../../maps/battlefield-design';
import {materialUrl,type TextureResolution} from '../../content/materials/battlefield';

const names=['ladder_galvanized','ladder_olive','ladder_rusted','ladder_dark'];
function configure(texture:THREE.Texture){
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.NearestFilter;
  texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.anisotropy=8;
  return texture;
}

export function renderLadders(ladders:LadderDef[],res:TextureResolution,manager?:THREE.LoadingManager){
  const group=new THREE.Group();
  group.name='functional-ladders';
  const loader=new THREE.TextureLoader(manager),materials=new Map<number,THREE.MeshLambertMaterial>();
  for(const ladder of ladders){
    let material=materials.get(ladder.variant);
    if(!material){
      const texture=configure(loader.load(materialUrl(names[ladder.variant%4],res)));
      material=new THREE.MeshLambertMaterial({map:texture,alphaTest:.5,side:THREE.DoubleSide,depthWrite:true,alphaToCoverage:true});
      materials.set(ladder.variant,material);
    }
    const geometry=new THREE.PlaneGeometry(.86,ladder.top-ladder.bottom),uv=geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++)uv.setY(i,uv.getY(i)*(ladder.top-ladder.bottom));
    const mesh=new THREE.Mesh(geometry,material);
    mesh.name=`ladder:${ladder.id}`;
    mesh.position.set(ladder.x+ladder.normalX*.015,(ladder.bottom+ladder.top)/2,ladder.z+ladder.normalZ*.015);
    mesh.rotation.y=ladder.normalX?ladder.normalX*Math.PI/2:ladder.normalZ<0?Math.PI:0;
    mesh.userData.ladder=ladder;
    group.add(mesh);
  }
  let revision=0;
  group.userData.setTextureResolution=async(next:TextureResolution)=>{
    const request=++revision;
    if(next===res)return;
    const variants=[...materials.keys()];
    const results=await Promise.allSettled(variants.map(variant=>loader.loadAsync(materialUrl(names[variant%4],next))));
    const failure=results.find(r=>r.status==='rejected');
    if(failure||request!==revision||!group.parent){
      for(const result of results)if(result.status==='fulfilled')result.value.dispose();
      if(failure?.status==='rejected')throw failure.reason;
      return;
    }
    results.forEach((result,index)=>{
      if(result.status!=='fulfilled')return;
      const material=materials.get(variants[index])!;
      material.map?.dispose();material.map=configure(result.value);
    });
    res=next;
  };
  return group;
}
