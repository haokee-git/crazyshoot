import type {ShadowQuality} from '../core/settings';

export type LightingQuality='off'|'low'|'medium'|'high'|'ultra';

export interface LightingPreset {
  readonly label:string;
  readonly description:string;
  readonly sunShadows:ShadowQuality;
  readonly contactShadows:boolean;
  readonly ambientOcclusion:boolean;
  readonly ambientOcclusionScale:number;
  readonly glow:'off'|'soft'|'strong';
  readonly fogScale:number;
  readonly cinematic:boolean;
}

export const LIGHTING_PRESETS:Readonly<Record<LightingQuality,LightingPreset>>=Object.freeze({
  off:Object.freeze({
    label:'无',description:'无阴影与附加光照效果，最省电。',
    sunShadows:'off',contactShadows:false,ambientOcclusion:false,ambientOcclusionScale:1,glow:'off',fogScale:1.35,cinematic:false,
  }),
  low:Object.freeze({
    label:'低',description:'清晰近影，适合低性能设备。',
    sunShadows:'fast',contactShadows:false,ambientOcclusion:false,ambientOcclusionScale:1,glow:'off',fogScale:1.15,cinematic:false,
  }),
  medium:Object.freeze({
    label:'中',description:'柔和阴影 + 接触阴影 + 环境遮蔽。',
    sunShadows:'soft',contactShadows:true,ambientOcclusion:true,ambientOcclusionScale:1,glow:'soft',fogScale:1,cinematic:false,
  }),
  high:Object.freeze({
    label:'高',description:'更远更细的阴影 + 明显晕光。',
    sunShadows:'fine',contactShadows:true,ambientOcclusion:true,ambientOcclusionScale:1,glow:'strong',fogScale:.82,cinematic:false,
  }),
  ultra:Object.freeze({
    label:'极致',description:'级联柔影、HDR 泛光、GTAO、可选动态模糊。需要 HDR 渲染支持，性能开销最大。',
    sunShadows:'off',contactShadows:true,ambientOcclusion:true,ambientOcclusionScale:.65,glow:'off',fogScale:.9,cinematic:true,
  }),
});

export const LIGHTING_QUALITIES:readonly LightingQuality[]=Object.freeze(Object.keys(LIGHTING_PRESETS) as LightingQuality[]);

export function isLightingQuality(value:unknown):value is LightingQuality{
  return typeof value==='string'&&Object.hasOwn(LIGHTING_PRESETS,value);
}

export function lightingPreset(quality:LightingQuality):LightingPreset{
  return LIGHTING_PRESETS[quality];
}
