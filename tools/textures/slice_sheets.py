from PIL import Image, ImageDraw
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'public', 'textures', '32')
os.makedirs(OUT, exist_ok=True)

sheets = [
    ('image-c28edf67', 'gen_wall'),
    ('image-a151a26c', 'gen_brick'),
    ('image-d9f9c4a6', 'gen_metal'),
    ('image-dc53eedd', 'gen_surf'),
]
SIZE = 64
MARGIN = 7

for fname, prefix in sheets:
    src = Image.open(os.path.join(ROOT, 'dsh-image-gen', fname + '.png')).convert('RGB')
    W, H = src.size
    cells = []
    for row in range(4):
        for col in range(4):
            x0 = round(col * W / 4) + MARGIN
            x1 = round((col + 1) * W / 4) - MARGIN
            y0 = round(row * H / 4) + MARGIN
            y1 = round((row + 1) * H / 4) - MARGIN
            cell = src.crop((x0, y0, x1, y1)).resize((SIZE, SIZE), Image.LANCZOS)
            idx = row * 4 + col + 1
            name = f'{prefix}_{idx:02d}'
            cell.save(os.path.join(OUT, name + '.png'))
            cells.append((name, cell))
    sheet = Image.new('RGB', (4 * 148, 4 * 168), (22, 24, 24))
    d = ImageDraw.Draw(sheet)
    for i, (name, cell) in enumerate(cells):
        x = (i % 4) * 148 + 10
        y = (i // 4) * 168 + 8
        sheet.paste(cell.resize((128, 128), Image.NEAREST), (x, y))
        d.text((x, y + 132), name, fill=(220, 230, 225))
    sheet.save(os.path.join(ROOT, 'dsh-image-gen', prefix + '-contact.png'))
    print('sliced', prefix, len(cells))
