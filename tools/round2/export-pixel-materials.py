"""Native pixel-art tiers. Sample authored detail contours directly at64/128.
Do not pin high-tier contours to the32 grid or replace them with residual noise.
All tiers share authored layout/hues; limited tier palettes avoid blended blur.
"""
from pathlib import Path
from PIL import Image,ImageStat,ImageDraw,ImageFont
import json,hashlib,statistics
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'public/textures/battlefield-v4';SRC=ROOT/'art/materials-v3';OLD=ROOT/'public/textures/battlefield-v1'
manifest=json.loads((OLD/'manifest.json').read_text());OUT.mkdir(exist_ok=True);(OUT/'masters').mkdir(exist_ok=True)
for n in (32,64,128):(OUT/str(n)).mkdir(exist_ok=True)
primary={'grass_olive':'grass','earth_dry':'earth','concrete_poured':'concrete','timber_weathered':'wood','brick_red':'brick','metal_galvanized':'steel','foliage_olive':'foliage','asphalt_fine':'asphalt','limestone':'rock','container_blue':'container','roof_slate':'roof','sandbag_olive':'sandbag','crate_military':'crate','water_fresh':'water','hazard_stripe':'hazard','steel_grate':'grate'}
variants={
 'grass_dry':('grass',(8,5,-3)),'forest_floor':('grass',(-7,-5,-1)),'moss_soil':('grass',(-3,3,-2)),
 'mud_rutted':('earth',(-12,-8,-4)),'sand_packed':('earth',(35,38,28)),
 'asphalt_aggregate':('asphalt',(4,4,4)),'asphalt_cracked':('asphalt',(2,2,2)),'asphalt_oil':('asphalt',(-3,-3,-3)),
 'gravel_pale':('rock',(12,12,8)),'aggregate_dark':('rock',(-20,-20,-18)),'bedrock':('rock',(-8,-8,-6)),'concrete_rubble':('rock',(3,3,1)),
 'concrete_cracked':('concrete',(-10,-9,-7)),'concrete_panel':('concrete',(-4,-4,-3)),'plaster_grey':('concrete',(-5,-2,1)),'plaster_stained':('concrete',(-7,-5,-2)),
 'brick_grey':('brick','gray'),'retaining_stone':('brick','stone'),
 'metal_blue':('steel',(-8,3,12)),'steel_corroded':('steel','rust'),'floor_plate':('steel',(-15,-15,-13)),
 'roof_red':('roof','rust'),'roof_patched':('roof',(12,11,9)),'roof_tar':('asphalt',(-5,-5,-5)),
 'window_industrial':('steel',(-28,-12,-2)),
 'container_olive':('container','olive'),'container_rust':('container','rust'),'container_grey':('container','gray'),
 'sandbag_tan':('sandbag',(24,15,0)),'dock_timber':('wood',(-8,-6,-3)),
 'bark_dark':('wood',(-27,-22,-14)),'bark_pale':('wood',(25,25,20)),
 'foliage_dry':('foliage',(10,8,-3)),
 'water_harbour':('water',(-4,-25,-18)),'water_river':('water',(-2,-10,-8)),'water_drain':('water',(4,-24,-26)),
}
def sample_grid(raw,n):
    out=Image.new(raw.mode,(n,n));src=raw.load();dst=out.load()
    for y in range(n):
        for x in range(n):dst[x,y]=src[int(x*raw.width/n),int(y*raw.height/n)]
    return out

def periodic(im,n):
    p=im.load();band=1
    for y in range(n):
        for x in range(n-band,n):p[x,y]=p[0,y]
    for x in range(n):
        for y in range(n-band,n):p[x,y]=p[x,0]
    return im

def shift(raw,tint):
    if tint is None:return raw
    p=raw.load();out=Image.new('RGB',raw.size);q=out.load()
    for y in range(raw.height):
        for x in range(raw.width):
            c=p[x,y];lum=round(c[0]*.2126+c[1]*.7152+c[2]*.0722)
            if tint=='gray':v=(lum+15,lum+18,lum+19)
            elif tint=='stone':v=(lum+24,lum+23,lum+15)
            elif tint=='rust':v=(lum+42,lum-1,lum-20)
            elif tint=='olive':v=(lum+5,lum+10,lum-16)
            else:v=tuple(c[i]+tint[i] for i in range(3))
            q[x,y]=tuple(max(0,min(255,int(a))) for a in v)
    return out

records=[]
for entry in manifest['textures']:
    name=entry['name'];family=entry['family'];tint=None
    if name in primary:template=primary[name]
    elif name in variants:template,tint=variants[name]
    elif family=='ladder':template='ladder'
    else:raise RuntimeError('Missing pixel design: '+name)
    if template=='ladder':
        raw=Image.open(OLD/'source/ladder-atlas-v1.png').convert('RGBA');i=entry['sourceCell'];x,y=i%2,i//2;raw=raw.crop((round(x*raw.width/2)+1,round(y*raw.height/2)+1,round((x+1)*raw.width/2)-1,round((y+1)*raw.height/2)-1));source='public/textures/battlefield-v1/source/ladder-atlas-v1.png#'+str(i)
    else:raw=Image.open(SRC/(template+'.png')).convert('RGB');source='art/materials-v3/'+template+'.png'
    # Palette is selected from the authored32 grid, never from averaged microtexture.
    design32=shift(sample_grid(raw,32).convert('RGB'),tint)
    palette=design32.quantize(colors=12,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE)
    colors=palette.getpalette();used=len(palette.getcolors());colors=colors[:used*3]+colors[:3]*(256-used);palette.putpalette(colors)
    files={};images={};detail_file=SRC/'detail128'/(template+'.png');detail=None
    if detail_file.exists():detail=Image.open(detail_file).convert('RGB')
    for n in (32,64,128):
        sampled=shift(sample_grid(detail if detail is not None and n>32 else raw,n).convert('RGB'),tint)
        image=(sampled.quantize(colors=16 if n==64 else 24,method=Image.Quantize.MEDIANCUT,dither=Image.Dither.NONE) if detail is not None and n>32 else sampled.quantize(palette=palette,dither=Image.Dither.NONE)).convert('RGB')
        if family=='ladder':
            image=image.convert('RGBA');alpha=sample_grid(raw,n).getchannel('A').point(lambda a:255 if a>=128 else 0);image.putalpha(alpha)
        else:
            image=periodic(image,n)
        image.save(OUT/str(n)/(name+'.png'),optimize=True);images[n]=image;files[str(n)]='/textures/battlefield-v4/'+str(n)+'/'+name+'.png'
        assert len(image.convert('RGB').getcolors(256) or [])<=(12 if n==32 else 36)
        if family!='ladder':
            p=image.load();assert all(p[0,y]==p[n-1,y] for y in range(n));assert all(p[x,0]==p[x,n-1] for x in range(n))
    images[32].save(OUT/'masters'/(name+'-native32.png'))
    if family!='ladder':
        for n in (32,64,128):
            tile=images[n].resize((128,128),Image.Resampling.NEAREST);preview=Image.new('RGB',(512,512))
            for y in range(4):
                for x in range(4):preview.paste(tile,(x*128,y*128))
            preview.save(OUT/'masters'/(name+'-'+str(n)+'-4x4.png'))
    records.append({**entry,'source':source,'masterSha256':hashlib.sha256(images[32].tobytes()).hexdigest(),'palette':colors[:used*3],'paletteColors':used,'nativeGrid':32,'detailSource':str(detail_file.relative_to(ROOT)) if detail is not None else None,'detailVsUpscale':{str(n):round(sum(a!=b for a,b in zip(images[n].convert('RGB').getdata(),images[n//2].convert('RGB').resize((n,n),Image.Resampling.NEAREST).getdata()))/(n*n),4) for n in (64,128)},'average':[round(x) for x in ImageStat.Stat(images[32].convert('RGB')).mean],'files':files})
(OUT/'manifest.json').write_text(json.dumps({'version':4,'generator':'built-in image_gen native pixel-cluster designs','rasterizer':'integer-grid sampling;64/128 preserve authored fine contours directly;12/16/24-color palettes;no residual noise or32-grid contour pinning;periodic boundaries','textures':records},ensure_ascii=False,indent=2)+'\n')
print(len(records),'native pixel materials;168PNGs;native32palette<=12;64/128 authored contours;periodic edges verified')
# Native resolution inspection, nearest-neighbor enlarged without smoothing.
names=['grass_olive','earth_dry','concrete_poured','timber_weathered','brick_red','metal_galvanized','limestone','foliage_olive','asphalt_fine'];sheet=Image.new('RGB',(1344,660),(231,234,227));draw=ImageDraw.Draw(sheet)
try:font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',14)
except:font=ImageFont.load_default()
for i,name in enumerate(names):
    x=(i%3)*448+10;y=(i//3)*220+8;draw.text((x,y),name,fill=(35,50,42),font=font)
    for j,n in enumerate((32,64,128)):
        im=Image.open(OUT/str(n)/(name+'.png')).convert('RGB').resize((128,128),Image.Resampling.NEAREST);sheet.paste(im,(x+j*144,y+32));draw.text((x+j*144,y+168),str(n)+' px',fill=(45,62,50),font=font)
sheet.save(ROOT/'docs/refinement-2026-11-07/material-tiers.png')

names=['asphalt_fine','earth_dry','metal_galvanized','concrete_poured']
proof=Image.new('RGB',(816,1200),(231,234,227));draw=ImageDraw.Draw(proof)
for i,name in enumerate(names):
    y=i*300;draw.text((12,y+8),name,fill=(35,50,42),font=font)
    for j,n in enumerate((32,64,128)):
        x=12+j*268;im=Image.open(OUT/str(n)/(name+'.png')).resize((256,256),Image.Resampling.NEAREST);proof.paste(im,(x,y+34));draw.text((x+6,y+260),str(n)+'px',fill='white',stroke_width=2,stroke_fill='black',font=font)
proof.save(ROOT/'docs/refinement-2026-11-07/detail-tiers.png')
