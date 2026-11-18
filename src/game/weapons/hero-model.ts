import * as THREE from 'three';
import {setDaylightMaterial} from '../world/daylight';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {buildWeaponModel,type WeaponModelId} from '../../content/weapons/models';
import {WEAPON_PRESENTATION} from '../../content/weapons/presentation';
/** Bake rigid opaque pieces to one draw; retain the magazine as an explicit anchor. */
export function mergeOpaque(root:THREE.Group){
 root.updateMatrixWorld(true);const inverse=root.matrixWorld.clone().invert(),parts:THREE.BufferGeometry[]=[],meshes:THREE.Mesh[]=[];
 root.traverse(o=>{if((o as THREE.Mesh).isMesh&&!Array.isArray((o as THREE.Mesh).material)&&!(o as THREE.Mesh<THREE.BufferGeometry,THREE.Material>).material.transparent&&o.visible)meshes.push(o as THREE.Mesh);});
 for(const m of meshes){const g=m.geometry.index?m.geometry.toNonIndexed():m.geometry.clone();g.applyMatrix4(inverse.clone().multiply(m.matrixWorld));g.deleteAttribute('uv');g.clearGroups();const source=m.material as THREE.MeshStandardMaterial,color=source.color??new THREE.Color('white'),n=g.getAttribute('position').count,cs=new Float32Array(n*3),surface=new Float32Array(n*2);for(let i=0;i<n;i++){cs.set([color.r,color.g,color.b],i*3);surface[i*2]=source.roughness??.8;surface[i*2+1]=source.metalness??0;}g.setAttribute('color',new THREE.BufferAttribute(cs,3));g.setAttribute('surfaceResponse',new THREE.BufferAttribute(surface,2));parts.push(g);m.geometry.dispose();m.removeFromParent();}
 if(parts.length){const geometry=mergeGeometries(parts,false)!;parts.forEach(g=>g.dispose());const material=new THREE.MeshStandardMaterial({vertexColors:true});
  material.onBeforeCompile=s=>{
   s.vertexShader='attribute vec2 surfaceResponse;flat varying vec2 vSurface;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvSurface=surfaceResponse;');
   s.fragmentShader='flat varying vec2 vSurface;\n'+s.fragmentShader
    .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=vSurface.x;')
    .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=vSurface.y;');
  };
  material.customProgramCacheKey=()=>'hero-merged';setDaylightMaterial(material);root.add(new THREE.Mesh(geometry,material));}
}
export function buildHeroWeapon(id:WeaponModelId){
 const model=buildWeaponModel(id);model.scale.setScalar(1);const def=WEAPON_PRESENTATION[id],magazine=new THREE.Group();magazine.name='magazine-anchor';model.updateMatrixWorld(true);const pieces:THREE.Mesh[]=[];
 model.traverse(o=>{if((o as THREE.Mesh).isMesh)pieces.push(o as THREE.Mesh);});
 for(const m of pieces){const p=(m.geometry as any).parameters??{};if(m.name==='muzzleFlash'||id==='m16'&&m.position.y>.12&&m.position.z<.12){m.removeFromParent();m.geometry.dispose();continue;}
  if(m.geometry.type==='BoxGeometry'&&Math.min(p.width,p.height,p.depth)>.035&&Math.max(p.width,p.height,p.depth)>.09){m.geometry.dispose();m.geometry=new RoundedBoxGeometry(p.width,p.height,p.depth,1,.003);}
  else if(m.geometry.type==='CylinderGeometry'&&p.radialSegments>3){m.geometry.dispose();m.geometry=new THREE.CylinderGeometry(p.radiusTop,p.radiusBottom,p.height,24,1,p.openEnded);}
  const mat=(m.material as THREE.MeshStandardMaterial).clone();if(Math.max(mat.color.r,mat.color.g,mat.color.b)>.25&&mat.color.b>mat.color.r*.9)mat.color.multiplyScalar(.35);mat.flatShading=false;m.material=mat;
  // Keep author-created moving magazine or identify the authored magazine region.
  const world=new THREE.Vector3();m.getWorldPosition(world);
  if(id!=='m870'&&(m.parent?.name==='magazine'||(world.y<-.14&&world.z>0&&world.z<.32&&Math.abs(world.x)<.09))){magazine.attach(m);}
 }
 const rail=new THREE.Mesh(new RoundedBoxGeometry(.066,.024,.16,1,.002),new THREE.MeshStandardMaterial({color:0x303638,roughness:.65}));rail.position.set(def.rail[0],def.rail[1]-.012,def.rail[2]);model.add(rail);
 mergeOpaque(model);mergeOpaque(magazine);model.add(magazine);model.userData.magazine=magazine;return model;
}
