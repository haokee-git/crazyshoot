from PIL import Image, ImageDraw
import random, os

SIZE = 64
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'textures', '32')
os.makedirs(OUT, exist_ok=True)

def clamp(v): return max(0, min(255, int(v)))

def tint(base, d):
    return (clamp(base[0]+d), clamp(base[1]+d), clamp(base[2]+d))

def grain(img, amount=5, seed=1):
    rnd = random.Random(seed)
    px = img.load()
    for y in range(SIZE):
        for x in range(SIZE):
            r,g,b = px[x,y][:3]
            d = rnd.randint(-amount, amount)
            px[x,y] = (clamp(r+d), clamp(g+d), clamp(b+d), 255)

def save(img, name):
    img.convert('RGB').save(os.path.join(OUT, name + '.png'))
    print('wrote', name)

def concrete(name, base, seam, panel=32, seed=2):
    img = Image.new('RGB', (SIZE,SIZE), base)
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed)
    for y in range(0, SIZE, panel):
        for x in range(0, SIZE, panel):
            d.rectangle([x,y,x+panel-1,y+panel-1], outline=seam)
    grain(img, 7, seed)
    for _ in range(18):
        x,y = rnd.randrange(SIZE), rnd.randrange(SIZE)
        r = rnd.randrange(2, 10)
        d.ellipse([x-r,y-r//2,x+r,y+r//2], fill=tint(base, -rnd.randrange(3,12)))
    for _ in range(5):
        x,y = rnd.randrange(SIZE), rnd.randrange(SIZE)
        d.line([x,y,x+rnd.randrange(-8,9),y+rnd.randrange(-8,9)], fill=tint(base,-18))
    save(img, name)

def brick(name, base, mortar, seed=3, brick_w=16, brick_h=8):
    img = Image.new('RGB', (SIZE,SIZE), mortar)
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed)
    for row, y in enumerate(range(0, SIZE, brick_h)):
        off = (brick_w//2) if row % 2 else 0
        for x in range(-brick_w, SIZE+brick_w, brick_w):
            bx = x + off
            col = tint(base, rnd.randint(-14, 14))
            d.rectangle([bx+1, y+1, bx+brick_w-2, y+brick_h-2], fill=col)
            if rnd.random() < 0.2:
                d.line([bx+2,y+brick_h-3,bx+brick_w-3,y+brick_h-3], fill=tint(col,-20))
    grain(img, 5, seed)
    save(img, name)

def corrugated(name, base, rib=4, seed=4, rust=0):
    img = Image.new('RGB', (SIZE,SIZE), base)
    d = ImageDraw.Draw(img)
    for x in range(0, SIZE, rib):
        d.rectangle([x,0,x+1,SIZE-1], fill=tint(base, 10))
        d.rectangle([x+2,0,x+3,SIZE-1], fill=tint(base, -12))
    grain(img, 4, seed)
    rnd = random.Random(seed)
    for _ in range(rust):
        x = rnd.randrange(SIZE)
        y = rnd.randrange(SIZE)
        r = rnd.randrange(1, 4)
        d.ellipse([x-r,y-r*3,x+r,y+r*3], fill=(110,70,44))
    save(img, name)

def plaster(name, base, seed=5):
    img = Image.new('RGB', (SIZE,SIZE), base)
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed)
    for _ in range(40):
        x,y = rnd.randrange(SIZE), rnd.randrange(SIZE)
        r = rnd.randrange(3, 13)
        d.ellipse([x-r,y-r,x+r,y+r], fill=tint(base, rnd.randint(-8,8)))
    grain(img, 8, seed)
    for _ in range(7):
        x,y = rnd.randrange(SIZE), rnd.randrange(SIZE)
        d.line([x,y,x+rnd.randrange(-12,13),y+rnd.randrange(-12,13)], fill=tint(base,-24))
    save(img, name)

def wood(name, base, seed=6):
    img = Image.new('RGB', (SIZE,SIZE), base)
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed)
    for x in range(0, SIZE, 8):
        d.line([x,0,x,SIZE-1], fill=tint(base,-25))
        d.line([x+1,0,x+1,SIZE-1], fill=tint(base,8))
        for _ in range(5):
            y = rnd.randrange(SIZE)
            d.line([x+2,y,x+6,y+rnd.randrange(-2,3)], fill=tint(base,-18))
        if rnd.random() < 0.6:
            cx, cy = x+4, rnd.randrange(SIZE)
            d.ellipse([cx-1,cy-1,cx+1,cy+1], fill=tint(base,-35))
    grain(img, 4, seed)
    save(img, name)

def roof_tiles(name, base, seed=7):
    img = Image.new('RGB', (SIZE,SIZE), base)
    d = ImageDraw.Draw(img)
    rnd = random.Random(seed)
    for y in range(0, SIZE, 8):
        d.line([0,y,SIZE-1,y], fill=tint(base,-35))
        for x in range(0, SIZE, 8):
            d.arc([x,y,x+8,y+8], 180, 360, fill=tint(base,10))
    grain(img, 5, seed)
    save(img, name)

def corrugated_roof(name, base, seed=8):
    img = Image.new('RGB', (SIZE,SIZE), base)
    d = ImageDraw.Draw(img)
    for y in range(0, SIZE, 4):
        d.line([0,y,SIZE-1,y], fill=tint(base,12))
        d.line([0,y+1,SIZE-1,y+1], fill=tint(base,-16))
    grain(img, 3, seed)
    save(img, name)

def warning(name, seed=9):
    img = Image.new('RGB', (SIZE,SIZE), (218,170,20))
    d = ImageDraw.Draw(img)
    for i in range(-SIZE, SIZE*2, 16):
        d.polygon([(i,0),(i+8,0),(i-24,SIZE),(i-32,SIZE)], fill=(28,30,28))
    grain(img, 6, seed)
    save(img, name)

def glass(name, base, seed=10):
    img = Image.new('RGB', (SIZE,SIZE), base)
    d = ImageDraw.Draw(img)
    for x in range(0, SIZE, 16):
        d.rectangle([x,0,x+1,SIZE-1], fill=(40,48,46))
        d.line([x+12,0,x+4,SIZE-1], fill=tint(base,16))
    grain(img, 3, seed)
    save(img, name)

concrete('concrete_panel', (118,118,110), (84,86,82), 32, 11)
concrete('concrete_panel_light', (148,146,136), (108,108,102), 32, 12)
brick('brick_gray', (104,104,98), (132,130,120), 13)
brick('brick_red_old', (112,64,52), (142,122,104), 14)
corrugated('metal_siding_blue', (74,98,112), 4, 15, 0)
corrugated('metal_siding_green', (88,104,82), 4, 16, 2)
corrugated('metal_siding_rust', (108,82,62), 4, 17, 18)
plaster('plaster_cream', (178,166,142), 18)
plaster('plaster_white', (190,190,178), 19)
wood('wood_planks_old', (104,84,60), 20)
roof_tiles('roof_tile_gray', (82,86,82), 21)
corrugated_roof('roof_corrugated', (92,98,92), 22)
warning('warning_stripe', 23)
glass('glass_strip', (52,68,68), 24)
