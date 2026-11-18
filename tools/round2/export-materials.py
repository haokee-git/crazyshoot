"""Game-asset raster export: one preserved master per material, three resolutions.
Generated masters are immutable. Edge texels use periodic boundary conditions at
export (also after downsampling), so filtering/mips cannot expose a border seam.
"""
from pathlib import Path
from PIL import Image,ImageStat,ImageEnhance
import json,hashlib
ROOT=Path(__file__).resolve().parents[2]
OLD=ROOT/'public/textures/battlefield-v1';OUT=ROOT/'public/textures/battlefield-v2';SRC=ROOT/'art/materials-v2'
manifest=json.loads((OLD/'manifest.json').read_text());(OUT/'masters').mkdir(parents=True,exist_ok=True)
for size in (32,64,128):(OUT/str(size)).mkdir(exist_ok=True)
base={
 'grass_olive':('grass',(106,124,70)),'grass_dry':('grass',(112,125,76)),'forest_floor':('grass',(101,116,69)),'moss_soil':('grass',(103,121,70)),
 'earth_dry':('earth',(130,103,77)),'mud_rutted':('earth',(111,98,78)),'sand_packed':('earth',(171,156,122)),
 'concrete_poured':('concrete',(157,155,146)),'concrete_cracked':('concrete',(150,150,141)),'concrete_panel':('concrete',(157,155,146)),
 'plaster_grey':('concrete',(166,166,156)),'plaster_stained':('concrete',(160,158,147)),
 'limestone':('rock',(143,145,137)),'bedrock':('rock',(138,140,134)),'concrete_rubble':('rock',(141,140,129)),
 'gravel_pale':('rock',(146,144,133)),'aggregate_dark':('rock',(130,130,122)),
 'brick_red':('brick',(149,88,65)),'brick_grey':('brick',(137,135,123)),
 'timber_weathered':('wood',(138,115,83)),'dock_timber':('wood',(130,111,86)),
 'metal_galvanized':('steel',(135,143,143)),'metal_blue':('steel',(100,124,133)),
 'foliage_olive':('foliage',(81,106,60)),'foliage_dry':('foliage',(92,111,65)),
 'asphalt_fine':('asphalt',(78,83,84)),'asphalt_aggregate':('asphalt',(79,84,84)),'asphalt_cracked':('asphalt',(77,82,82)),'asphalt_oil':('asphalt',(76,81,82)),
}
def periodic(im):
 if im.mode=='RGBA':return im
 p=im.load();n=im.width
 for y in range(n):
  avg=tuple(round((p[0,y][c]+p[n-1,y][c])/2) for c in range(3));p[0,y]=p[n-1,y]=avg
 for x in range(n):
  avg=tuple(round((p[x,0][c]+p[x,n-1][c])/2) for c in range(3));p[x,0]=p[x,n-1]=avg
 return im
records=[];previews=[]
for entry in manifest['textures']:
 name=entry['name'];family=entry['family']
 if name in base:
  master,palette=base[name];raw=Image.open(SRC/(master+'.png')).convert('RGB');mean=ImageStat.Stat(raw).mean
  # Author-defined palette variants, all sampled from the exact same source structure.
  channels=raw.split();raw=Image.merge('RGB',tuple(ch.point(lambda v,c=c:max(0,min(255,round((v-mean[c])*1.3+palette[c])))) for c,ch in enumerate(channels)))
  source='art/materials-v2/'+master+'.png'
 else:
  raw=Image.open(OLD/'source'/(family+'-atlas-v1.png')).convert('RGBA' if family=='ladder' else 'RGB');grid=2 if family in ('ladder','water') else 4;i=entry['sourceCell'];x,y=i%grid,i//grid
  raw=raw.crop((round(x*raw.width/grid)+1,round(y*raw.height/grid)+1,round((x+1)*raw.width/grid)-1,round((y+1)*raw.height/grid)-1));source='public/textures/battlefield-v1/source/'+family+'-atlas-v1.png#'+str(i)
 master=periodic(raw.resize((128,128),Image.Resampling.LANCZOS));master.save(OUT/'masters'/(name+'.png'))
 files={}
 for size in (32,64,128):
  image=periodic(master.resize((size,size),Image.Resampling.BOX));image.save(OUT/str(size)/(name+'.png'),optimize=True);files[str(size)]='/textures/battlefield-v2/'+str(size)+'/'+name+'.png'
 record={**entry,'source':source,'masterSha256':hashlib.sha256(master.tobytes()).hexdigest(),'average':[round(x) for x in ImageStat.Stat(master.convert('RGB')).mean],'files':files};records.append(record)
 if family!='ladder':
  repeated=Image.new('RGB',(512,512));tile=master.convert('RGB')
  for y in range(4):
   for x in range(4):repeated.paste(tile,(x*128,y*128))
  if family!='ladder':repeated.save(OUT/'masters'/(name+'-4x4.png'))
 for size in (32,64,128):
  im=Image.open(OUT/str(size)/(name+'.png'));assert im.size==(size,size)
  if family!='ladder':
   px=im.load();assert all(px[0,y]==px[size-1,y] for y in range(size));assert all(px[x,0]==px[x,size-1] for x in range(size))
manifest={'version':2,'generator':'built-in image_gen; preserved prior image_gen specialty masters','rasterizer':'128 master -> BOX 64/32; periodic boundary texels, no independent regeneration','textures':records}
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(len(records),'materials,',len(records)*3,'raster assets; periodic boundaries verified')
