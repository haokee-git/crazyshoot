import * as THREE from 'three';
import {CSM} from 'three/addons/csm/CSM.js';
import type {SunShadowEntry} from './cinematic-water';

export const PCSS_SHADOW_GLSL=`
vec2 csmVogel( float i, float n ) {
	float r = sqrt( ( i + 0.5 ) / n );
	float theta = i * 2.39996323;
	return vec2( cos( theta ), sin( theta ) ) * r;
}
float getCsmShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
	float shadow = 1.0;
	shadowCoord.xyz /= shadowCoord.w;
	shadowCoord.z += shadowBias;
	bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
	bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
	if ( frustumTest ) {
		vec2 texel = 1.0 / shadowMapSize;
		float receiver = shadowCoord.z;
		float blockerSum = 0.0;
		float blockerCount = 0.0;
		for ( int i = 0; i < 4; i ++ ) {
			vec2 offset = csmVogel( float( i ), 4.0 ) * ( 8.0 * texel.x );
			float depth = texture2D( shadowMap, shadowCoord.xy + offset ).r;
			if ( depth < receiver ) { blockerSum += depth; blockerCount += 1.0; }
		}
		if ( blockerCount < 0.5 ) {
			shadow = 1.0;
		} else {
			float blocker = blockerSum / blockerCount;
			float penumbra = clamp( ( receiver - blocker ) * shadowRadius, 0.75 * texel.x, 16.0 * texel.x );
			float sum = 0.0;
			for ( int i = 0; i < 8; i ++ ) {
				vec2 offset = csmVogel( float( i ), 8.0 ) * penumbra;
				float depth = texture2D( shadowMap, shadowCoord.xy + offset ).r;
				sum += step( receiver, depth );
			}
			shadow = sum / 8.0;
		}
	}
	vec2 edge = min( shadowCoord.xy, 1.0 - shadowCoord.xy );
	float coverage = smoothstep( 0.0, 0.13, min( edge.x, edge.y ) );
	return mix( 1.0, shadow, shadowIntensity * coverage );
}
`;

export function patchCsmLightsFragment(source:string):string{
  return source.replaceAll('getShadow( directionalShadowMap','getCsmShadow( directionalShadowMap');
}

interface SavedMaterialState {
  onBeforeCompile:THREE.Material['onBeforeCompile'];
  customProgramCacheKey:THREE.Material['customProgramCacheKey'];
  defines:Record<string,unknown>|undefined;
}

type SetupCapable={setupMaterial(material:THREE.Material):void};

export function attachCsmToMaterial(csm:SetupCapable,material:THREE.Material,patchedLightsBegin:string):()=>void{
  const saved:SavedMaterialState={
    onBeforeCompile:material.onBeforeCompile,
    customProgramCacheKey:material.customProgramCacheKey,
    defines:material.defines?{...material.defines}:undefined,
  };
  const priorCompile=saved.onBeforeCompile,priorKey=saved.customProgramCacheKey;
  csm.setupMaterial(material);
  const csmCompile=material.onBeforeCompile;
  material.onBeforeCompile=function(shader,renderer){
    priorCompile.call(this,shader,renderer);
    csmCompile.call(this,shader,renderer);
    shader.fragmentShader=PCSS_SHADOW_GLSL+'\n'+shader.fragmentShader.replace('#include <lights_fragment_begin>',patchedLightsBegin);
  };
  material.customProgramCacheKey=function(){return priorKey.call(this)+'|csm-pcss';};
  material.needsUpdate=true;
  return ()=>{
    material.onBeforeCompile=priorCompile;
    material.customProgramCacheKey=priorKey;
    material.defines=saved.defines?{...saved.defines}:undefined;
    material.needsUpdate=true;
  };
}

const CASCADE_NORMAL_BIAS=[.025,.04,.065];
const CASCADE_SPLITS=[36/220,92/220,1];
const SUN_ANGULAR_RADIUS=.00465;

export class CinematicShadows{
  private readonly csm:CSM;
  private readonly savedChunks:{begin:string;pars:string};
  private readonly savedSunIntensity:number;
  private readonly savedShadowType:THREE.ShadowMapType;
  private readonly releases=new Map<THREE.Material,{undo:()=>void;onDispose:()=>void}>();
  private readonly meshFlags=new Map<THREE.Mesh,{cast:boolean;receive:boolean}>();
  private readonly materialUsers=new Map<THREE.Material,Set<THREE.Mesh>>();
  private readonly meshMaterials=new Map<THREE.Mesh,THREE.Material[]>();
  private readonly pinnedMaterials=new Set<THREE.Material>();
  private readonly projState={fov:0,aspect:0,near:0,far:0};
  private patchedLightsBegin='';
  private disposed=false;
  private nextShadowUpdate=0;

  constructor(
    private readonly renderer:THREE.WebGLRenderer,
    private readonly scene:THREE.Scene,
    private readonly camera:THREE.PerspectiveCamera,
    private readonly sun:THREE.DirectionalLight,
    sunDirection:THREE.Vector3,
  ){
    this.savedChunks={begin:THREE.ShaderChunk.lights_fragment_begin,pars:THREE.ShaderChunk.lights_pars_begin};
    this.savedSunIntensity=sun.intensity;
    this.savedShadowType=renderer.shadowMap.type;
    this.csm=new CSM({
      camera,parent:scene,cascades:3,maxFar:220,mode:'custom',
      customSplitsCallback:(cascades:number,_near:number,_far:number,target:number[])=>{
        for(let i=0;i<cascades;i++)target.push(CASCADE_SPLITS[i]);
      },
      shadowMapSize:2048,
      shadowBias:-.0002,
      lightDirection:sunDirection.clone().normalize().negate(),
      lightIntensity:sun.intensity,
      lightNear:.5,lightFar:600,lightMargin:100,
    });
    this.csm.fade=true;
    this.patchedLightsBegin=patchCsmLightsFragment(THREE.ShaderChunk.lights_fragment_begin);
    for(let i=0;i<this.csm.lights.length;i++){
      const light=this.csm.lights[i];
      light.color.copy(sun.color);
      light.intensity=sun.intensity;
      light.shadow.normalBias=CASCADE_NORMAL_BIAS[i]??.04;
    }
    sun.intensity=0;
    renderer.shadowMap.enabled=true;
    renderer.shadowMap.autoUpdate=false;
    renderer.shadowMap.type=THREE.BasicShadowMap;
    this.registerModel(scene);
    this.syncProjection(true);
  }

  get lightDirection(){return this.csm.lightDirection;}

  private cachedShadowEntries?:SunShadowEntry[];
  get shadowEntries():readonly SunShadowEntry[]{
    if(!this.cachedShadowEntries){
      const csm=this.csm,camera=this.camera;
      this.cachedShadowEntries=this.csm.lights.map((light,i)=>({
        get map(){return light.shadow.map?.texture??null;},
        get matrix(){return light.shadow.matrix;},
        get distance(){return Math.min(camera.far,220)*(csm.breaks[i]??CASCADE_SPLITS[i]??1);},
        get bias(){return light.shadow.bias;},
      }));
    }
    return this.cachedShadowEntries;
  }

  private syncProjection(force=false){
    const c=this.camera,s=this.projState;
    if(force||s.fov!==c.fov||s.aspect!==c.aspect||s.near!==c.near||s.far!==c.far){
      s.fov=c.fov;s.aspect=c.aspect;s.near=c.near;s.far=c.far;
      this.csm.updateFrustums();
    }
  }

  private wantsMaterial(material:THREE.Material){
    return (material instanceof THREE.MeshStandardMaterial||material instanceof THREE.MeshLambertMaterial||material instanceof THREE.MeshPhongMaterial)&&!material.transparent;
  }

  private attachMaterial(material:THREE.Material){
    if(this.disposed||this.releases.has(material)||!this.wantsMaterial(material))return;
    const undo=attachCsmToMaterial(this.csm,material,this.patchedLightsBegin);
    const onDispose=()=>this.detachMaterial(material);
    material.addEventListener('dispose',onDispose);
    this.releases.set(material,{undo,onDispose});
  }

  private detachMaterial(material:THREE.Material){
    const entry=this.releases.get(material);
    if(!entry)return;
    entry.undo();
    material.removeEventListener('dispose',entry.onDispose);
    (this.csm as unknown as {shaders?:Map<THREE.Material,unknown>}).shaders?.delete(material);
    this.releases.delete(material);
    this.materialUsers.delete(material);
    this.pinnedMaterials.delete(material);
  }

  private maybeDetach(material:THREE.Material){
    if(!(this.materialUsers.get(material)?.size)&&!this.pinnedMaterials.has(material))this.detachMaterial(material);
  }

  registerMaterial(material:THREE.Material){
    this.attachMaterial(material);
    if(this.releases.has(material))this.pinnedMaterials.add(material);
  }

  get counts(){return {meshes:this.meshFlags.size,materials:this.releases.size};}

  registerModel(root:THREE.Object3D){
    root.traverse(node=>{
      const mesh=node as THREE.Mesh;
      if(!mesh.isMesh||mesh.userData.cinematicExclude)return;
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      const lit=materials.filter(m=>this.wantsMaterial(m));
      if(lit.length&&!this.meshFlags.has(mesh)){
        this.meshFlags.set(mesh,{cast:mesh.castShadow,receive:mesh.receiveShadow});
        mesh.castShadow=true;
        mesh.receiveShadow=true;
      }
      const previous=this.meshMaterials.get(mesh);
      if(previous)for(const m of previous)if(!lit.includes(m)){this.materialUsers.get(m)?.delete(mesh);this.maybeDetach(m);}
      for(const m of lit){
        let users=this.materialUsers.get(m);
        if(!users)this.materialUsers.set(m,users=new Set());
        users.add(mesh);
        this.attachMaterial(m);
      }
      this.meshMaterials.set(mesh,lit);
    });
  }

  unregisterModel(root:THREE.Object3D){
    if(this.disposed)return;
    root.traverse(node=>{
      const mesh=node as THREE.Mesh;
      if(!mesh.isMesh)return;
      const saved=this.meshFlags.get(mesh);
      if(saved){mesh.castShadow=saved.cast;mesh.receiveShadow=saved.receive;this.meshFlags.delete(mesh);}
      const previous=this.meshMaterials.get(mesh);
      if(previous){
        for(const m of previous){this.materialUsers.get(m)?.delete(mesh);this.maybeDetach(m);}
        this.meshMaterials.delete(mesh);
      }
    });
  }

  update(now=performance.now()){
    // Three large depth maps do not need to be redrawn at display refresh rate.
    // Keep the light matrices and their maps together between updates.
    if(now<this.nextShadowUpdate)return;
    this.nextShadowUpdate=now+1000/20;
    this.syncProjection();
    this.csm.update();
    for(const light of this.csm.lights){
      const cam=light.shadow.camera;
      const orthoWidth=Math.max(.001,cam.right-cam.left);
      light.shadow.radius=Math.tan(SUN_ANGULAR_RADIUS)*(cam.far-cam.near)/orthoWidth;
    }
    this.renderer.shadowMap.needsUpdate=true;
  }

  dispose(){
    if(this.disposed)return;
    this.disposed=true;
    this.csm.dispose();
    for(const material of [...this.releases.keys()])this.detachMaterial(material);
    for(const [mesh,saved] of this.meshFlags){mesh.castShadow=saved.cast;mesh.receiveShadow=saved.receive;}
    this.meshFlags.clear();
    this.materialUsers.clear();
    this.meshMaterials.clear();
    this.pinnedMaterials.clear();
    for(const light of this.csm.lights){light.shadow.map?.dispose();light.shadow.map=null;}
    this.csm.remove();
    THREE.ShaderChunk.lights_fragment_begin=this.savedChunks.begin;
    THREE.ShaderChunk.lights_pars_begin=this.savedChunks.pars;
    this.sun.intensity=this.savedSunIntensity;
    this.renderer.shadowMap.type=this.savedShadowType;
    this.renderer.shadowMap.enabled=false;
    this.renderer.shadowMap.needsUpdate=true;
  }
}
