import {materialPackUrls} from '../../content/materials/battlefield';
import {bundleUrls} from './asset-bundles';
import * as THREE from 'three';
export interface LoadProgress {percent:number;stage:string;completed:number;total:number;error?:string;}
export const nextPaint=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
export class LoadingCoordinator {
 private percent=0;
 constructor(private report:(p:LoadProgress)=>void){}
 update(percent:number,stage:string,completed=0,total=1){this.percent=Math.max(this.percent,Math.min(99,percent));this.report({percent:Math.floor(this.percent),stage,completed,total});}
 complete(){this.percent=100;this.report({percent:100,stage:'场景已就绪',completed:1,total:1});}
}
// A per-build loading manager tracks actual decode completion, with no success timeout.
export function loadingManager(onProgress?:(loaded:number,total:number)=>void){
 let failed:string[]=[];let finish:()=>void=()=>{};let reject:(e:Error)=>void=()=>{};
 const ready=new Promise<void>((ok,no)=>{finish=ok;reject=no;});
 let started=false;
 const manager=new THREE.LoadingManager(()=>failed.length?reject(new Error(`资源加载失败：${failed.join('、')}`)):finish(),(_url,loaded,total)=>onProgress?.(loaded,total),url=>failed.push(url));
 manager.onStart=()=>{started=true;};queueMicrotask(()=>{if(!started)finish();});
 return {manager,ready};
}

import manifest from './asset-manifest.json';
import {interiorMaterialPackUrls} from '../../content/materials/interiors';
const WEAPON_ICONS=['/ui/weapons/m16.png','/ui/weapons/m4a1.png','/ui/weapons/akm.png','/ui/weapons/mk14.png','/ui/weapons/awm.png','/ui/weapons/uzi.png','/ui/weapons/vector.png','/ui/weapons/ump45.png','/ui/weapons/mp5.png','/ui/weapons/m870.png','/ui/weapons/m249.png'];

/**
 * Exact URL list `preloadWorld` downloads. Exported so tests can prove that the
 * pharaoh pack only rides along when the map asks for `assetBundle==='pharaoh-v1'`
 * (the four classic maps and the training blockout get zero extra downloads).
 */
export function preloadUrls(res:32|64|128,sky:string,voxelMap=false,assetBundle?:string):string[]{
 const pack=bundleUrls(assetBundle,res);
 if(voxelMap)return [...materialPackUrls(res),...interiorMaterialPackUrls(),...pack,...WEAPON_ICONS,`/skies/${sky}.jpg`];
 return [...new Set([...materialPackUrls(res),...manifest[res===128?'64':String(res) as '32'|'64'],...(res>=64?manifest['32'].filter(u=>!manifest['64'].includes(u.replace('/32/','/64/'))):[]),...pack,`/skies/${sky}.jpg`])];
}

export async function preloadWorld(res:32|64|128,sky:string,progress:(p:LoadProgress)=>void,voxelMap=false,assetBundle?:string){
 THREE.Cache.enabled=true;const urls=preloadUrls(res,sky,voxelMap,assetBundle);let next=0,loaded=0;
 const worker=async()=>{while(next<urls.length){const url=urls[next++];await new Promise<void>((resolve,reject)=>{const cached=THREE.Cache.get(`image:${url}`) as HTMLImageElement|undefined;if(cached){resolve();return;}const image=new Image();image.onload=()=>{image.decode().then(()=>{THREE.Cache.add(`image:${url}`,image);resolve();}).catch(()=>reject(new Error(`图像解码失败：${url}`)));};image.onerror=()=>reject(new Error(`资源下载失败：${url}`));image.src=url;});loaded++;progress({percent:Math.floor(loaded/urls.length*60),stage:'下载与解码必要资源',completed:loaded,total:urls.length});}};
 await Promise.all(Array.from({length:6},worker));
}

import type { MapDef } from '../../maps/types';
import type { TerrainData } from '../world/terrain-field';
export function prepareTerrain(map:MapDef,signal:AbortSignal,onProgress?:(p:LoadProgress)=>void):Promise<TerrainData>{
 return new Promise((resolve,reject)=>{const worker=new Worker(new URL('../world/terrain-worker.ts',import.meta.url),{type:'module'});const abort=()=>{worker.terminate();reject(new Error('加载已取消'));};signal.addEventListener('abort',abort,{once:true});const finish=()=>{signal.removeEventListener('abort',abort);worker.terminate();};worker.onmessage=event=>{if(event.data.progress){const p=event.data.progress;onProgress?.({percent:62+Math.floor(p.ratio*8),stage:p.stage,completed:p.completed,total:p.total});return;}finish();if(event.data.error)reject(new Error(event.data.error));else resolve(event.data.data);};worker.onerror=event=>{finish();reject(new Error(`地形生成失败：${event.message}`));};worker.postMessage(map);});
}
