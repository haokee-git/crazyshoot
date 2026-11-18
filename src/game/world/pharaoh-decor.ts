/**
 * Pharaoh decoration planes: thin, non-colliding cloth/awning/sign/mural quads
 * that sample the two pharaoh atlases. They are rendered with one InstancedMesh
 * per atlas (2 draw calls for the whole map) and support runtime texture
 * resolution switches (32/64/128) without rebuilding the instances.
 *
 * `DecorPlane.rot` is authored in DEGREES around +Y (same convention as every
 * other MapDef angle). Planes are vertical and double-sided: a bazaar awning is
 * hung as a cloth sheet, a mural lies flat against its wall.
 */
import * as THREE from 'three';
import type {DecorPlane} from '../../maps/types';
import {PHARAOH_ATLAS_NAMES,pharaohAtlasUrl,type PharaohTextureResolution} from '../../content/materials/pharaoh';
import {MIAO_ATLAS_NAMES,miaoAtlasUrl} from '../../content/materials/miao-village';

const DEG=Math.PI/180;
export const PHARAOH_DECOR_ATLASES:readonly string[]=PHARAOH_ATLAS_NAMES;
export const ALL_DECOR_ATLASES:readonly string[]=[...PHARAOH_ATLAS_NAMES,...MIAO_ATLAS_NAMES];
const atlasUrl=(atlas:string,res:PharaohTextureResolution)=>MIAO_ATLAS_NAMES.includes(atlas)?miaoAtlasUrl(atlas,res):pharaohAtlasUrl(atlas,res);

interface DecorLayer {
  atlas:string;
  mesh:THREE.InstancedMesh;
  geometry:THREE.PlaneGeometry;
  material:THREE.MeshBasicMaterial;
  texture:THREE.Texture|null;
}

function configure(texture:THREE.Texture):THREE.Texture {
  texture.colorSpace=THREE.SRGBColorSpace;
  texture.magFilter=THREE.NearestFilter;
  texture.minFilter=THREE.NearestMipmapNearestFilter;
  texture.generateMipmaps=true;
  texture.anisotropy=4;
  texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
  return texture;
}

/** Per-instance atlas sub-rectangle: [u,v,uw,uh] packed into one vec4 attribute. */
function decorMaterial():THREE.MeshBasicMaterial {
  // Decor atlases are authored pixel art: render them unlit so shaded walls
  // cannot turn indigo festival panels into black rectangles.
  const material=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide,transparent:true,alphaTest:.04,toneMapped:false});
  material.polygonOffset=true;
  material.polygonOffsetFactor=-1;
  material.polygonOffsetUnits=-1;
  material.onBeforeCompile=shader=>{
    shader.vertexShader=`attribute vec4 decorRect;
varying vec4 vDecorRect;
`+shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
 vDecorRect=decorRect;`);
    shader.fragmentShader=`varying vec4 vDecorRect;
`+shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
 vec4 sampledDiffuseColor=texture2D(map,vMapUv*vDecorRect.zw+vDecorRect.xy);
 diffuseColor*=sampledDiffuseColor;
#endif`);
  };
  material.customProgramCacheKey=()=>'pharaoh-decor';
  return material;
}

/**
 * Build the decoration group for one map. `planes` comes straight from
 * MapDef.decor; unknown atlas names are ignored (the two shipped names are the
 * only valid values). Never touches collision/navigation data.
 */
export function renderPharaohDecor(planes:DecorPlane[],res:PharaohTextureResolution,manager?:THREE.LoadingManager):THREE.Group {
  const group=new THREE.Group();
  group.name='pharaoh-decor';
  let currentRes=res;
  let request=0;
  const layers:DecorLayer[]=[];

  const atlases=[...new Set(planes.map(p=>p.atlas))].filter(a=>ALL_DECOR_ATLASES.includes(a));
  for(const atlas of atlases){
    const draws=planes.filter(p=>p.atlas===atlas);
    if(!draws.length)continue;
    const geometry=new THREE.PlaneGeometry(1,1);
    const rect=new Float32Array(draws.length*4);
    const mesh=new THREE.InstancedMesh(geometry,decorMaterial(),draws.length);
    mesh.name=`pharaoh-decor-${atlas}`;
    mesh.castShadow=false;
    mesh.receiveShadow=false;
    mesh.frustumCulled=false;
    const dummy=new THREE.Object3D();
    for(let i=0;i<draws.length;i++){
      const plane=draws[i];
      dummy.position.set(plane.x,plane.y,plane.z);
      dummy.rotation.set(0,(plane.rot??0)*DEG,0);
      dummy.scale.set(Math.max(.01,plane.w),Math.max(.01,plane.h),1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i,dummy.matrix);
      const uv=plane.uv??[0,0,1,1];
      rect[i*4]=uv[0];rect[i*4+1]=uv[1];rect[i*4+2]=uv[2];rect[i*4+3]=uv[3];
    }
    mesh.instanceMatrix.needsUpdate=true;
    geometry.setAttribute('decorRect',new THREE.InstancedBufferAttribute(rect,4));
    mesh.computeBoundingSphere();
    group.add(mesh);
    layers.push({atlas,mesh,geometry,material:mesh.material as THREE.MeshBasicMaterial,texture:null});
  }

  const loader=new THREE.TextureLoader(manager);
  const ready=layers.length
    ?Promise.all(layers.map(async layer=>{
        const texture=configure(await loader.loadAsync(atlasUrl(layer.atlas,currentRes)));
        layer.texture=texture;
        layer.material.map=texture;
        layer.material.needsUpdate=true;
      })).then(()=>{})
    :Promise.resolve();
  group.userData.ready=ready;

  group.userData.setTextureResolution=async(next:PharaohTextureResolution)=>{
    if(next===currentRes)return;
    const revision=++request;
    const loaded=await Promise.all(layers.map(async layer=>[layer,configure(await new THREE.TextureLoader().loadAsync(atlasUrl(layer.atlas,next)))] as const));
    if(revision!==request){for(const [,texture] of loaded)texture.dispose();return;}
    for(const [layer,texture] of loaded){layer.texture?.dispose();layer.texture=texture;layer.material.map=texture;layer.material.needsUpdate=true;}
    currentRes=next;
  };

  group.userData.dispose=()=>{
    for(const layer of layers){layer.mesh.dispose();layer.geometry.dispose();layer.material.dispose();layer.texture?.dispose();}
    group.clear();
  };
  group.userData.planes=planes.length;
  group.userData.drawCalls=layers.length;
  return group;
}
