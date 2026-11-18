import * as THREE from 'three';
import type {ShadowQuality} from '../core/settings';

const levels={
  fast:{pixels:1024,width:72,rate:12,radius:0,normalBias:.065,filter:THREE.BasicShadowMap},
  soft:{pixels:1536,width:94,rate:18,radius:2.7,normalBias:.05,filter:THREE.PCFShadowMap},
  fine:{pixels:2560,width:126,rate:24,radius:4.5,normalBias:.034,filter:THREE.PCFShadowMap},
};
type ShadowLevel=(typeof levels)[keyof typeof levels];

const configuredMaterials=new WeakSet<THREE.Material>();
const baseShadowSource=THREE.ShaderChunk.shadowmap_pars_fragment;
const pointShadowStart=baseShadowSource.indexOf('#if NUM_POINT_LIGHT_SHADOWS > 0',baseShadowSource.indexOf('float getShadow('));
const shadowSource=baseShadowSource.slice(0,pointShadowStart)
  .replace('interleavedGradientNoise( gl_FragCoord.xy ) * PI2','0.0')
  .replaceAll('return mix( 1.0, shadow, shadowIntensity );',`
    vec2 edge = min( shadowCoord.xy, 1.0 - shadowCoord.xy );
    float coverage = smoothstep( 0.0, 0.13, min( edge.x, edge.y ) );
    return mix( 1.0, shadow, shadowIntensity * coverage );`)+baseShadowSource.slice(pointShadowStart);

export function setSunShadowMesh(mesh:THREE.Mesh,cast=true){
  mesh.castShadow=cast;
  mesh.receiveShadow=true;
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
    if(configuredMaterials.has(material))continue;
    configuredMaterials.add(material);
    const compile=material.onBeforeCompile,cacheKey=material.customProgramCacheKey();
    material.onBeforeCompile=function(shader,renderer){
      compile.call(this,shader,renderer);
      shader.fragmentShader=shader.fragmentShader.replace('#include <shadowmap_pars_fragment>',shadowSource);
    };
    material.customProgramCacheKey=()=>cacheKey+'|battlefield-sun';
    material.needsUpdate=true;
  }
}

export function setSunShadowModel(root:THREE.Object3D){
  root.traverse(node=>{
    if((node as THREE.Mesh).isMesh)setSunShadowMesh(node as THREE.Mesh);
  });
}

/** One sun map, shared by static scenery and moving actors, refreshed only as needed. */
export class SunShadows{
  readonly direction:THREE.Vector3;
  private readonly right:THREE.Vector3;
  private readonly up:THREE.Vector3;
  private readonly anchor=new THREE.Vector3();
  private readonly focus=new THREE.Vector3();
  private readonly forward=new THREE.Vector3();
  private readonly poses=new Map<THREE.Object3D,{position:THREE.Vector3;rotation:THREE.Quaternion}>();
  private level:ShadowLevel|null=null;
  private quality:ShadowQuality='off';
  private nextUpdate=0;
  private needsMap=true;

  constructor(private readonly renderer:THREE.WebGLRenderer,private readonly light:THREE.DirectionalLight){
    this.direction=light.position.clone().normalize();
    this.right=new THREE.Vector3(0,1,0).cross(this.direction).normalize();
    this.up=this.direction.clone().cross(this.right);
    light.parent?.add(light.target);
    this.renderer.shadowMap.autoUpdate=false;
    light.shadow.autoUpdate=false;
  }

  get enabled(){return this.level!==null;}

  setQuality(quality:ShadowQuality){
    if(quality===this.quality)return;
    this.quality=quality;
    const level=quality==='off'?null:levels[quality]??null;
    this.level=level;
    this.light.castShadow=!!level;
    this.renderer.shadowMap.enabled=!!level;
    this.disposeMap();
    this.poses.clear();
    this.needsMap=true;
    this.nextUpdate=0;
    if(!level)return;
    const shadow=this.light.shadow;
    const pixels=Math.min(level.pixels,this.renderer.capabilities.maxTextureSize);
    shadow.mapSize.set(pixels,pixels);
    shadow.intensity=.92;
    shadow.bias=-.00015;
    shadow.normalBias=level.normalBias;
    shadow.radius=level.radius;
    const half=level.width/2,camera=shadow.camera;
    camera.left=-half;camera.right=half;camera.bottom=-half;camera.top=half;
    camera.near=.5;camera.far=200;
    camera.updateProjectionMatrix();
    this.renderer.shadowMap.type=level.filter;
  }

  update(camera:THREE.PerspectiveCamera,now:number,casters:Iterable<THREE.Object3D>){
    const level=this.level;
    if(!level||now<this.nextUpdate)return;
    this.nextUpdate=now+1000/level.rate;

    this.forward.set(0,0,-1).applyQuaternion(camera.quaternion);
    this.forward.y=0;
    this.forward.normalize();
    this.focus.copy(camera.position).addScaledVector(this.forward,level.width*.19);
    const moved=this.needsMap||this.focus.distanceToSquared(this.anchor)>(level.width*.105)**2;
    if(moved)this.moveMap(level.width/this.light.shadow.mapSize.x);

    const visible=[];
    let changed=moved;
    for(const object of casters){
      if(!object.visible||object.position.distanceToSquared(this.anchor)>level.width**2)continue;
      visible.push(object);
      const old=this.poses.get(object);
      if(!old||old.position.distanceToSquared(object.position)>.045**2||
        1-Math.abs(old.rotation.dot(object.quaternion))>.00045)changed=true;
    }
    if(!changed&&visible.length===this.poses.size)return;
    this.poses.clear();
    for(const object of visible)this.poses.set(object,{position:object.position.clone(),rotation:object.quaternion.clone()});
    this.needsMap=false;
    this.light.shadow.needsUpdate=true;
    this.renderer.shadowMap.needsUpdate=true;
  }

  private moveMap(texel:number){
    const snap=(axis:THREE.Vector3)=>Math.round(this.focus.dot(axis)/texel)*texel;
    this.anchor.copy(this.right).multiplyScalar(snap(this.right))
      .addScaledVector(this.up,snap(this.up)).addScaledVector(this.direction,this.focus.dot(this.direction));
    this.light.target.position.copy(this.anchor);
    this.light.position.copy(this.anchor).addScaledVector(this.direction,100);
  }

  private disposeMap(){
    const shadow=this.light.shadow;
    shadow.map?.dispose();
    shadow.map=null;
  }

  dispose(){this.disposeMap();}
}
