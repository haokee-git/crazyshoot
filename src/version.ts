import pkg from '../package.json';
declare const __BUILD_ID__:string;
export const VERSION=pkg.version;
export const BUILD_ID=typeof __BUILD_ID__==='string'?__BUILD_ID__:'test';
export const MAP_REVISION='voxel-halfgrid-v14';
export const MATERIAL_REVISION=8;
export const BUILD_INFO={version:VERSION,buildId:BUILD_ID,mapRevision:MAP_REVISION,materialRevision:MATERIAL_REVISION};
