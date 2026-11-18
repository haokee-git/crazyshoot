import type {LightingQuality} from '../rendering/lighting-presets';
import {isLightingQuality} from '../rendering/lighting-presets';

export type ShadowQuality='off'|'fast'|'soft'|'fine';
export type {LightingQuality};

export interface Settings {
  sensitivity:number;
  adsSensitivity:number;
  invertY:boolean;
  adsHold:boolean;
  crouchHold:boolean;
  proneHold:boolean;
  fov:number;
  shake:number;
  volume:number;
  frameLimit:number;
  msaa:number;
  particles:number;
  lightingQuality:LightingQuality;
  motionBlur:boolean;
}

const settingsRevision=3;

const defaults:Settings={
  sensitivity:1,adsSensitivity:.85,invertY:false,adsHold:false,crouchHold:false,proneHold:false,fov:75,shake:.6,volume:.5,
  frameLimit:0,msaa:2,particles:32,
  lightingQuality:'medium',motionBlur:true,
};

function migrateLightingQuality(saved:Record<string,unknown>,legacy:string|null):LightingQuality{
  if(isLightingQuality(saved.lightingQuality))return saved.lightingQuality;
  const sun=saved.sunShadows;
  if(sun==='off')return saved.contactShadows||saved.ambientOcclusion||saved.glow==='soft'||saved.glow==='strong'?'low':'off';
  if(sun==='fast')return'low';
  if(sun==='soft')return'medium';
  if(sun==='fine')return'high';
  if(legacy==='low'||legacy==='medium'||legacy==='high')return legacy;
  return defaults.lightingQuality;
}

function loadSettings():Settings{
  try{
    const saved=JSON.parse(localStorage.getItem('crazyshoot.settings')||'{}') as Partial<Settings>&{rev?:number;sunShadows?:string;contactShadows?:boolean;ambientOcclusion?:boolean;glow?:string};
    // Older clients stored these controls together. Use them only to seed the individual values.
    const legacy=new URLSearchParams(location.search).get('quality')??localStorage.getItem('crazyshoot.quality');
    const display=legacy==='high'?{particles:64}:
      legacy==='medium'?{particles:64}:
      legacy==='low'?{particles:24}:{};
    // Old saves included the former ADS default even when only graphics changed.
    const adsHold=saved.crouchHold===undefined&&saved.proneHold===undefined?false:saved.adsHold;
    // 30 was the former default cap, so pre-revision saves that still carry it never chose it; give them the new default.
    const frameLimit=saved.rev===undefined&&saved.frameLimit===30?defaults.frameLimit:saved.frameLimit;
    const {renderScale:_rs,outputScale:_os,fogScale:_fg,sunShadows:_ss,contactShadows:_cs,ambientOcclusion:_ao,glow:_gl,rev:_rev,...rest}=saved as Record<string,unknown>;
    return {...defaults,...display,...(rest as Partial<Settings>),
      lightingQuality:migrateLightingQuality(saved,legacy),
      motionBlur:typeof saved.motionBlur==='boolean'?saved.motionBlur:defaults.motionBlur,
      frameLimit:frameLimit??defaults.frameLimit,
      adsHold:adsHold??defaults.adsHold};
  }catch{
    return {...defaults};
  }
}

let settings=loadSettings();
export const getSettings=()=>settings;
export function saveSettings(next:Settings){
  const clean:Settings={
    sensitivity:next.sensitivity,adsSensitivity:next.adsSensitivity,invertY:next.invertY,
    adsHold:next.adsHold,crouchHold:next.crouchHold,proneHold:next.proneHold,
    fov:next.fov,shake:next.shake,volume:next.volume,frameLimit:next.frameLimit,
    msaa:next.msaa,particles:next.particles,
    lightingQuality:isLightingQuality(next.lightingQuality)?next.lightingQuality:defaults.lightingQuality,
    motionBlur:typeof next.motionBlur==='boolean'?next.motionBlur:defaults.motionBlur,
  };
  settings=clean;
  try{localStorage.setItem('crazyshoot.settings',JSON.stringify({...clean,rev:settingsRevision}));}catch{}
}
