import {describe,expect,it} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import manifest from '../public/textures/interiors/manifest.json';
import {BLOCK_TEXTURES} from '../src/content/materials/battlefield';
import {
 INTERIOR_BLOCK_TEXTURES,
 INTERIOR_TEXTURE_NAMES,
 INTERIOR_TEXTURE_RES,
 interiorMaterialPackUrls,
 interiorUrl,
 type InteriorTextureName,
} from '../src/content/materials/interiors';

interface ExpectedTexture{kind:string;width:number;height:number;tileable:boolean;}
const EXPECTED:Record<string,ExpectedTexture>={
 plaster:{kind:'wall',width:64,height:64,tileable:true},
 'concrete-floor':{kind:'floor',width:64,height:64,tileable:true},
 'wood-planks':{kind:'floor',width:64,height:64,tileable:true},
 rug:{kind:'rug',width:64,height:32,tileable:false},
 'wall-art':{kind:'art',width:64,height:64,tileable:false},
 'industrial-sign':{kind:'sign',width:64,height:64,tileable:false},
 'wall-map':{kind:'map',width:64,height:64,tileable:false},
};
const PNG_SIGNATURE='89504e470d0a1a0a';

interface PngImage{width:number;height:number;bitDepth:number;colorType:number;interlace:number;colors:number;mean:[number,number,number];}

function paeth(a:number,b:number,c:number){
 const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
 return pa<=pb&&pa<=pc?a:pb<=pc?b:c;
}

/** Minimal 8-bit RGB PNG reader: enough to verify size, palette count and mean colour. */
function decodePng(file:string):PngImage{
 const bytes=fs.readFileSync(file);
 if(bytes.subarray(0,8).toString('hex')!==PNG_SIGNATURE)throw new Error(`${file}: not a PNG`);
 let offset=8,width=0,height=0,bitDepth=0,colorType=0,interlace=0;
 const idat:Buffer[]=[];
 while(offset+8<=bytes.length){
  const length=bytes.readUInt32BE(offset);
  const type=bytes.toString('ascii',offset+4,offset+8);
  const data=bytes.subarray(offset+8,offset+8+length);
  if(type==='IHDR'){
   width=data.readUInt32BE(0);height=data.readUInt32BE(4);
   bitDepth=data[8];colorType=data[9];interlace=data[12];
  }else if(type==='IDAT')idat.push(data);
  else if(type==='IEND')break;
  offset+=12+length;
 }
 if(bitDepth!==8||colorType!==2)throw new Error(`${file}: expected 8-bit RGB (bitDepth=${bitDepth}, colorType=${colorType})`);
 const channels=3,rowLength=width*channels,stride=rowLength+1;
 const raw=zlib.inflateSync(Buffer.concat(idat));
 if(raw.length<height*stride)throw new Error(`${file}: truncated pixel data`);
 const pixels=Buffer.alloc(height*rowLength);
 for(let y=0;y<height;y++){
  const filter=raw[y*stride],source=raw.subarray(y*stride+1,y*stride+1+rowLength);
  const row=pixels.subarray(y*rowLength,(y+1)*rowLength);
  const previous=y>0?pixels.subarray((y-1)*rowLength,y*rowLength):null;
  for(let i=0;i<rowLength;i++){
   const left=i>=channels?row[i-channels]:0;
   const up=previous?previous[i]:0;
   const upLeft=previous&&i>=channels?previous[i-channels]:0;
   let value=source[i];
   if(filter===1)value+=left;
   else if(filter===2)value+=up;
   else if(filter===3)value+=Math.floor((left+up)/2);
   else if(filter===4)value+=paeth(left,up,upLeft);
   else if(filter!==0)throw new Error(`${file}: unsupported PNG filter ${filter}`);
   row[i]=value&255;
  }
 }
 const unique=new Set<number>();
 const sum=[0,0,0];
 const count=width*height;
 for(let i=0;i<pixels.length;i+=channels){
  const r=pixels[i],g=pixels[i+1],b=pixels[i+2];
  unique.add((r<<16)|(g<<8)|b);
  sum[0]+=r;sum[1]+=g;sum[2]+=b;
 }
 return {width,height,bitDepth,colorType,interlace,colors:unique.size,mean:[sum[0]/count,sum[1]/count,sum[2]/count]};
}

const publicFile=(url:string)=>path.join(process.cwd(),'public',url);

describe('interior material pack v1',()=>{
 it('ships seven 64 px RGB textures matching the manifest dimensions, palette and averages',()=>{
  expect(manifest.version).toBe(1);
  expect(manifest.res).toBe(64);
  expect(manifest.pack).toBe('interiors');
  expect(manifest.textures).toHaveLength(7);
  expect(new Set(manifest.textures.map(texture=>texture.name)).size).toBe(7);
  expect(manifest.textures.map(texture=>texture.name).sort()).toEqual([...INTERIOR_TEXTURE_NAMES].sort());
  expect(INTERIOR_TEXTURE_RES).toBe(64);
  for(const texture of manifest.textures){
   const spec=EXPECTED[texture.name];
   expect(spec,`unexpected manifest texture ${texture.name}`).toBeDefined();
   expect(texture.kind).toBe(spec.kind);
   expect(texture.width).toBe(spec.width);
   expect(texture.height).toBe(spec.height);
   expect(texture.tileable).toBe(spec.tileable);
   const url=texture.files['64'];
   expect(url.startsWith('/textures/interiors/64/')).toBe(true);
   expect(url).toBe(`/textures/interiors/64/${texture.name}.png`);
   const file=publicFile(url);
   expect(fs.existsSync(file),`missing ${url}`).toBe(true);
   const bytes=fs.readFileSync(file);
   expect(bytes.subarray(0,8).toString('hex'),`${texture.name} PNG signature`).toBe(PNG_SIGNATURE);
   expect(bytes.readUInt32BE(16),`${texture.name} PNG width`).toBe(spec.width);
   expect(bytes.readUInt32BE(20),`${texture.name} PNG height`).toBe(spec.height);
   const image=decodePng(file);
   expect(image.width).toBe(spec.width);
   expect(image.height).toBe(spec.height);
   expect(image.bitDepth).toBe(8);
   expect(image.colorType).toBe(2); // RGB, no alpha channel
   expect(image.interlace).toBe(0);
   expect(image.colors,`${texture.name} unique RGB colours`).toBeGreaterThanOrEqual(16);
   expect(image.colors,`${texture.name} unique RGB colours`).toBeLessThanOrEqual(24);
   expect(texture.paletteColors).toBe(image.colors);
   expect(texture.average).toHaveLength(3);
   for(let channel=0;channel<3;channel++)expect(Math.abs(texture.average[channel]-image.mean[channel]),`${texture.name} average channel ${channel}`).toBeLessThanOrEqual(2);
  }
 });

 it('wires the seven files into voxel layers 68-70 and the preload list',()=>{
  const names=new Set(manifest.textures.map(texture=>texture.name));
  for(const name of INTERIOR_TEXTURE_NAMES)names.add(name);
  expect(BLOCK_TEXTURES[68]).toBe('plaster');
  expect(BLOCK_TEXTURES[69]).toBe('concrete-floor');
  expect(BLOCK_TEXTURES[70]).toBe('wood-planks');
  expect(INTERIOR_BLOCK_TEXTURES[68]).toBe('plaster');
  expect(INTERIOR_BLOCK_TEXTURES[69]).toBe('concrete-floor');
  expect(INTERIOR_BLOCK_TEXTURES[70]).toBe('wood-planks');
  for(const id of [68,69,70])expect(names.has(BLOCK_TEXTURES[id]),`BLOCK_TEXTURES[${id}] = ${BLOCK_TEXTURES[id]} is not in the manifest`).toBe(true);
  const urls=interiorMaterialPackUrls();
  expect(urls).toHaveLength(7);
  expect(new Set(urls).size).toBe(7);
  const manifestFiles=new Set(manifest.textures.map(texture=>texture.files['64']));
  for(const url of urls){
   expect(url.startsWith('/textures/interiors/64/')).toBe(true);
   expect(manifestFiles.has(url),`${url} is not listed in the manifest`).toBe(true);
   expect(fs.existsSync(publicFile(url)),`missing ${url}`).toBe(true);
  }
  expect([...manifestFiles].sort()).toEqual([...urls].sort());
  for(const name of INTERIOR_TEXTURE_NAMES)expect(interiorUrl(name as InteriorTextureName)).toBe(`/textures/interiors/64/${name}.png`);
 });
});
