export type TextureResolution=32|64|128;
export const textureResolution=(value:unknown):TextureResolution=>Number(value)===128?128:Number(value)===32?32:64;
import manifest from '../../../public/textures/battlefield-v4/manifest.json';
import {INTERIOR_AVERAGES,INTERIOR_BLOCK_TEXTURES,INTERIOR_TEXTURE_NAMES,interiorUrl,type InteriorTextureName} from './interiors';
import {PHARAOH_BLOCK_TEXTURES,PHARAOH_MATERIAL_RECORDS,isPharaohMaterial,pharaohMaterialUrl,type PharaohTextureResolution} from './pharaoh';
import {MIAO_BLOCK_TEXTURES,MIAO_MATERIAL_RECORDS,isMiaoMaterial,miaoMaterialUrl,type MiaoTextureResolution} from './miao-village';
export const BLOCK_TEXTURES:Record<number,string>={
 1:'grass_olive',2:'earth_dry',3:'bedrock',4:'asphalt_fine',5:'concrete_poured',6:'brick_red',7:'timber_weathered',8:'bark_dark',9:'foliage_olive',10:'metal_galvanized',11:'window_industrial',12:'sand_packed',13:'roof_slate',14:'steel_corroded',15:'asphalt_oil',16:'water_fresh',17:'earth_dry',18:'plaster_stained',
 19:'grass_dry',20:'moss_soil',21:'forest_floor',22:'gravel_pale',23:'aggregate_dark',24:'mud_rutted',25:'earth_dry',26:'sand_packed',27:'limestone',28:'bedrock',29:'concrete_cracked',30:'concrete_rubble',31:'plaster_grey',32:'plaster_stained',33:'brick_grey',34:'brick_red',35:'concrete_panel',36:'dock_timber',37:'timber_weathered',38:'bark_pale',39:'foliage_olive',40:'foliage_dry',41:'container_blue',42:'container_olive',43:'container_rust',44:'roof_red',45:'roof_patched',46:'roof_tar',47:'asphalt_aggregate',48:'asphalt_cracked',49:'asphalt_oil',50:'gravel_pale',51:'floor_plate',52:'hazard_stripe',53:'steel_grate',54:'steel_corroded',55:'container_grey',56:'sandbag_olive',57:'sandbag_tan',58:'retaining_stone',59:'retaining_stone',60:'concrete_rubble',61:'brick_grey',62:'crate_military',63:'dock_timber',64:'water_harbour',65:'water_river',66:'water_drain',67:'metal_blue',
 ...INTERIOR_BLOCK_TEXTURES,
 ...PHARAOH_BLOCK_TEXTURES,
 ...MIAO_BLOCK_TEXTURES,
};
const INTERIOR_NAMES=new Set<string>(INTERIOR_TEXTURE_NAMES);
const INTERIOR_AVERAGE=new Map<string,[number,number,number]>(INTERIOR_TEXTURE_NAMES.map(name=>[name,INTERIOR_AVERAGES[name as InteriorTextureName]]));
/** 160 block-material layers: classic 0-67, interiors 68-71, pharaoh 72-121, miao 122-153. */
export const MATERIAL_SLOTS=160;
/** Classic + pharaoh records merged; `materialMean` reads `average` from here. */
export const MATERIAL_RECORDS:ReadonlyMap<string,{average:number[]}>=new Map<string,{average:number[]}>([
 ...manifest.textures.map(t=>[t.name,{average:t.average}] as const),
 ...PHARAOH_MATERIAL_RECORDS,
 ...MIAO_MATERIAL_RECORDS,
]);
export const materialUrl=(name:string,res:TextureResolution)=>INTERIOR_NAMES.has(name)?interiorUrl(name as InteriorTextureName):isPharaohMaterial(name)?pharaohMaterialUrl(name,res as PharaohTextureResolution):isMiaoMaterial(name)?miaoMaterialUrl(name,res as MiaoTextureResolution):`/textures/battlefield-v4/${res}/${name}.png`;
export const isWaterMaterial=(id:number)=>id===16||id>=64&&id<=66||id===98||id===135;
export const materialOpacity=(id:number)=>id===11?.38:isWaterMaterial(id)?.68:1;
export function materialMean(id:number):[number,number,number]{const name=BLOCK_TEXTURES[id];const interior=name?INTERIOR_AVERAGE.get(name):undefined;if(interior)return interior;const m=MATERIAL_RECORDS.get(name??'');return (m?.average as [number,number,number]|undefined)??(isWaterMaterial(id)?[70,98,105]:[112,116,110]);}
/** Classic battlefield pack only: maps without `assetBundle==='pharaoh-v1'` download exactly these URLs. */
export function materialPackUrls(res:TextureResolution){return manifest.textures.map(t=>materialUrl(t.name,res));}
export function zoneHash(x:number,z:number,seed=0){let h=Math.imul(Math.floor((x+3*Math.sin(z*.09))/12)+seed*13,374761393)^Math.imul(Math.floor((z+3*Math.sin(x*.08))/12)-seed*7,668265263);h=Math.imul(h^(h>>>13),1274126177);return (h^(h>>>16))>>>0;}
export function terrainVariant(id:number,_x:number,_z:number,_seed=0){return id;}

const CLASSIC_MATERIALS:Record<string,string>={plaster:'plaster_grey',asphalt_clean:'asphalt_fine',asphalt_pixel:'asphalt_aggregate',asphalt_stained:'asphalt_oil',asphalt_worn:'asphalt_cracked',brick_red:'brick_red',brick_gray:'brick_grey',brick_red_old:'brick_grey',concrete_clean:'concrete_poured',concrete_pixel:'concrete_panel',concrete_stained:'concrete_cracked',concrete_wall:'concrete_panel',concrete_panel:'concrete_panel',roof_tile:'roof_slate',roof_corrugated:'roof_patched',grass_dirt:'grass_olive',terrain_grass_soft:'grass_dry',dirt:'earth_dry',rock:'bedrock',wood_planks:'timber_weathered',steel_corrugated:'metal_galvanized',steel_rust:'steel_corroded',container_blue:'container_blue',container_olive:'container_olive',container_green:'container_olive',container_red:'container_rust',container_rust:'container_rust',sandbags:'sandbag_tan',window_dark:'window_industrial',glass_strip:'window_industrial',tarp:'sandbag_olive',metal_door:'container_grey',foliage:'foliage_olive'};
export function classicMaterialUrl(name:string,res:TextureResolution){return CLASSIC_MATERIALS[name]?materialUrl(CLASSIC_MATERIALS[name],res):`/textures/${res}/${name}.png`;}
