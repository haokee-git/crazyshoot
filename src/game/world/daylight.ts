import * as THREE from 'three';

export function surfaceResponse(name:string):[roughness:number,metalness:number]{
  if(/water/.test(name))return [.17,0];
  if(/window|glass/.test(name))return [.21,.1];
  if(/corroded|rust/.test(name))return [.76,.35];
  if(/metal|steel|container|floor_plate/.test(name))return [.43,.56];
  if(/asphalt|roof_tar/.test(name))return [.79,.02];
  if(/concrete|brick|plaster|stone|bedrock|limestone|slate|roof/.test(name))return [.88,0];
  return [.96,0];
}

export const daylightReflection={value:1};

/** One analytic sky reflection, with no environment texture or screen-space rays. */
export function addSkyReflection(shader:{fragmentShader:string;uniforms?:Record<string,{value:unknown}>}){
  if(shader.uniforms)shader.uniforms.daylightSky=daylightReflection;
  shader.fragmentShader='uniform float daylightSky;\n'+shader.fragmentShader.replace('#include <lights_fragment_end>',`
    #include <lights_fragment_end>
    vec3 reflectedView = reflect(-geometryViewDir, normal);
    vec3 reflectedWorld = transformDirectionByInverseViewMatrix(reflectedView, viewMatrix);
    float skyAmount = smoothstep(-0.16, 0.45, reflectedWorld.y);
    vec3 skyRadiance = mix(vec3(0.16, 0.15, 0.10), vec3(0.55, 0.76, 1.0), skyAmount);
    float fresnel = pow(1.0 - clamp(dot(normal, geometryViewDir), 0.0, 1.0), 5.0);
    vec3 reflectance = mix(vec3(0.04), diffuseColor.rgb, metalnessFactor);
    float gloss = 1.0 - roughnessFactor;
    reflectedLight.indirectSpecular += skyRadiance * mix(reflectance, vec3(0.68), fresnel) * gloss * gloss * 0.58 * daylightSky;
  `);
}

export function setDaylightMaterial(material:THREE.MeshStandardMaterial){
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    addSkyReflection(shader);
  };
  material.customProgramCacheKey=()=>key+'|analytic-daylight';
}

export function addSunDisc(scene:THREE.Scene,sun:THREE.DirectionalLight){
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=128;
  const ctx=canvas.getContext('2d')!,halo=ctx.createRadialGradient(64,64,0,64,64,64);
  halo.addColorStop(0,'rgba(255,248,225,1)');
  halo.addColorStop(.075,'rgba(255,248,225,1)');
  halo.addColorStop(.11,'rgba(255,240,211,.25)');
  halo.addColorStop(.42,'rgba(255,234,197,.045)');
  halo.addColorStop(1,'rgba(255,234,197,0)');
  ctx.fillStyle=halo;
  ctx.fillRect(0,0,128,128);
  const map=new THREE.CanvasTexture(canvas);
  map.colorSpace=THREE.SRGBColorSpace;
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({
    map,color:new THREE.Color(0xffedc7).multiplyScalar(3),transparent:true,
    depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,
  }));
  sprite.name='battlefield-sun-disc';
  sprite.renderOrder=-1;
  sprite.scale.set(64,64,1);
  const direction=sun.position.clone().normalize();
  sprite.position.copy(direction).multiplyScalar(535);
  sprite.onBeforeRender=(_renderer,_scene,camera)=>{
    // Move the billboard with the camera without touching scene geometry or its depth.
    sprite.matrixWorld.setPosition(
      camera.matrixWorld.elements[12]+direction.x*535,
      camera.matrixWorld.elements[13]+direction.y*535,
      camera.matrixWorld.elements[14]+direction.z*535,
    );
  };
  sprite.frustumCulled=false;
  scene.add(sprite);
}
