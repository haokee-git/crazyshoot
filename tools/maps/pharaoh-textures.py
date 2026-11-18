#!/usr/bin/env python3
"""CRAZYSHOOT · pharaoh-v1 material pack generator.

Deterministic and re-runnable. Every pattern is authored procedurally on a
toroidal domain, so all three tiers tile seamlessly on both axes. The 32 tier
is authored on the native 32x32 pixel grid; the 64 and 128 tiers are generated
natively at those resolutions (finer grain, thinner mortar, sharper chips --
never an upscale, never residual noise).

Outputs
  public/textures/pharaoh-v1/{32,64,128}/<name>.png   96 RGB PNGs
  public/textures/pharaoh-v1/manifest.json            32 records (30 block + 2 atlas)
  docs/map-pharaoh/materials/tiles/*.png              2x2 tiling check per texture
  docs/map-pharaoh/materials/seams/*.png              50% offset seam check per texture
  docs/map-pharaoh/materials/contact_sheet_*.png      tier contact sheets

Usage
  python3 tools/maps/pharaoh-textures.py            # regenerate everything
  python3 tools/maps/pharaoh-textures.py --check    # verify without writing
"""
from __future__ import annotations

import argparse
import hashlib
import json
import zlib
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "textures" / "pharaoh-v1"
DOCS = ROOT / "docs" / "map-pharaoh" / "materials"
TIERS = (32, 64, 128)
ATLAS_CELLS = 4  # 4x4 cells per decoration atlas

# ---------------------------------------------------------------------------
# tiny numeric helpers (all periodic in [0,1))
# ---------------------------------------------------------------------------


def smoothstep(e0: float, e1: float, x):
    t = np.clip((x - e0) / (e1 - e0 + 1e-12), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def xy(n: int):
    u = (np.arange(n, dtype=np.float64) + 0.5) / n
    return np.meshgrid(u, u)


def _vnoise_oct(n: int, cx: int, cy: int, seed: int):
    cx = max(2, int(cx))
    cy = max(2, int(cy))
    lat = np.random.default_rng(seed).random((cy, cx))
    xs = (np.arange(n) + 0.5) / n * cx
    ys = (np.arange(n) + 0.5) / n * cy
    x0 = np.floor(xs).astype(np.int64)
    y0 = np.floor(ys).astype(np.int64)
    fx = xs - x0
    fy = ys - y0
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    x0m, x1m = x0 % cx, (x0 + 1) % cx
    y0m, y1m = y0 % cy, (y0 + 1) % cy
    v00 = lat[np.ix_(y0m, x0m)]
    v10 = lat[np.ix_(y0m, x1m)]
    v01 = lat[np.ix_(y1m, x0m)]
    v11 = lat[np.ix_(y1m, x1m)]
    fxn = fx[None, :]
    fyn = fy[:, None]
    return (v00 * (1 - fxn) + v10 * fxn) * (1 - fyn) + (v01 * (1 - fxn) + v11 * fxn) * fyn


def vnoise(n: int, cx: int, cy: int | None = None, seed: int = 0, octaves: int = 1, gain: float = 0.5):
    """Periodic value noise. Feature counts are clamped so 32 stays pixel-crisp."""
    cy = cx if cy is None else cy
    total = np.zeros((n, n), dtype=np.float64)
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        cxi = min(max(2, int(round(cx))), max(2, n // 2))
        cyi = min(max(2, int(round(cy))), max(2, n // 2))
        total += amp * _vnoise_oct(n, cxi, cyi, seed + 97 * o)
        norm += amp
        amp *= gain
        cx *= 2
        cy *= 2
    return total / norm


def worley(n: int, cells: int, seed: int, rows: int = 32):
    """Toroidal Worley noise -> F1, F2, vector to the nearest feature point."""
    cells = max(3, min(int(cells), max(3, n // 4)))
    pts = np.random.default_rng(seed).random((cells * cells, 2))
    u = (np.arange(n) + 0.5) / n
    f1 = np.zeros((n, n), dtype=np.float64)
    f2 = np.zeros((n, n), dtype=np.float64)
    dxn = np.zeros((n, n), dtype=np.float64)
    dyn = np.zeros((n, n), dtype=np.float64)
    near_out = np.zeros((n, n), dtype=np.int32)
    for y0 in range(0, n, rows):
        ys = u[y0 : y0 + rows]
        X = np.broadcast_to(u[None, :], (len(ys), n))
        Y = np.broadcast_to(ys[:, None], (len(ys), n))
        dx = ((X[..., None] - pts[None, None, :, 0] + 0.5) % 1.0) - 0.5
        dy = ((Y[..., None] - pts[None, None, :, 1] + 0.5) % 1.0) - 0.5
        d = np.sqrt(dx * dx + dy * dy)
        order = np.argpartition(d, 2, axis=-1)[..., :2]
        two = np.take_along_axis(d, order, axis=-1)
        swap = two[..., 0] > two[..., 1]
        first = np.where(swap, two[..., 1], two[..., 0])
        second = np.where(swap, two[..., 0], two[..., 1])
        near = np.where(swap, order[..., 1], order[..., 0])
        f1[y0 : y0 + len(ys)] = first
        f2[y0 : y0 + len(ys)] = second
        dxn[y0 : y0 + len(ys)] = np.take_along_axis(dx, near[..., None], axis=-1)[..., 0]
        dyn[y0 : y0 + len(ys)] = np.take_along_axis(dy, near[..., None], axis=-1)[..., 0]
        near_out[y0 : y0 + len(ys)] = near
    return f1, f2, dxn, dyn, near_out


def shade(field, count: int, lo=None, hi=None, gamma: float = 1.0):
    f = np.asarray(field, dtype=np.float64)
    if lo is None:
        lo = np.quantile(f, 0.03)
    if hi is None:
        hi = np.quantile(f, 0.97)
    f = np.clip((f - lo) / (hi - lo + 1e-9), 0.0, 1.0) ** gamma
    return np.minimum((f * count).astype(np.int32), count - 1)


def shade_range(field, lo_idx: int, hi_idx: int, lo=None, hi=None, gamma: float = 1.0):
    return lo_idx + shade(field, hi_idx - lo_idx + 1, lo=lo, hi=hi, gamma=gamma)


def shade_abs(field, count: int, lo: float = 0.0, hi: float = 1.0):
    """Absolute (non-adaptive) ramp mapping for masks already in [lo,hi]."""
    f = np.clip((np.asarray(field, dtype=np.float64) - lo) / (hi - lo + 1e-9), 0.0, 1.0)
    return np.minimum((f * count).astype(np.int32), count - 1)


def grad(count: int, *anchors):
    """Evenly spaced colours sampled through RGB anchors (piecewise linear)."""
    anchors = np.asarray(anchors, dtype=np.float64)
    positions = np.linspace(0.0, 1.0, len(anchors))
    out = []
    for i in range(count):
        t = i / (count - 1)
        j = int(np.searchsorted(positions, t, side="right") - 1)
        j = min(max(j, 0), len(anchors) - 2)
        t0, t1 = positions[j], positions[j + 1]
        k = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
        c = anchors[j] * (1 - k) + anchors[j + 1] * k
        out.append(tuple(int(round(v)) for v in c))
    # keep colours distinct so paletteColors is honest
    seen, uniq = set(), []
    for c in out:
        if c not in seen:
            seen.add(c)
            uniq.append(c)
    return uniq


def pal(*entries):
    """Flatten literal RGB tuples and generated ramps into one palette."""
    out = []
    for e in entries:
        if isinstance(e, list) or isinstance(e, tuple) and e and isinstance(e[0], tuple):
            out.extend(e)
        else:
            out.append(tuple(int(v) for v in e))
    seen, uniq = set(), []
    for c in out:
        if c not in seen:
            seen.add(c)
            uniq.append(c)
    return uniq


def wrap_mask(n: int, draw_fn, width: int = 1) -> np.ndarray:
    """Rasterise into a 3x3 canvas then fold -> shapes wrap across the seam."""
    big = Image.new("L", (3 * n, 3 * n), 0)
    d = ImageDraw.Draw(big)
    draw_fn(d, n)
    a = np.asarray(big) > 0
    mask = np.zeros((n, n), dtype=bool)
    for oy in range(3):
        for ox in range(3):
            mask |= a[oy * n : (oy + 1) * n, ox * n : (ox + 1) * n]
    return mask


def crack_mask(n: int, seed: int, lines: int = 3, width: int | None = None) -> np.ndarray:
    rng = np.random.default_rng(seed)
    width = max(1, n // 96) if width is None else width
    seg = max(2.2, n / 14.0)

    def draw(d, n, mask_img=False):
        for _ in range(lines):
            x, y = rng.random(2) * n
            ang = rng.random() * 2 * np.pi
            for _ in range(int(n / seg * 1.4) + 3):
                ang += rng.normal(0, 0.62)
                nx_, ny_ = x + np.cos(ang) * seg, y + np.sin(ang) * seg
                steps = max(2, int(seg * 2))
                for t in range(steps + 1):
                    px = int(round(x + (nx_ - x) * t / steps)) % n
                    py = int(round(y + (ny_ - y) * t / steps)) % n
                    d.ellipse([px + n - width, py + n - width, px + n + width, py + n + width], fill=255)
                x, y = nx_, ny_

    return wrap_mask(n, draw)


def blur3(mask: np.ndarray) -> np.ndarray:
    """Cheap 3x3 dilation used for crack shadows / wet rims (wrapping)."""
    m = mask.astype(np.float32)
    out = m.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            if dx == dy == 0:
                continue
            out = np.maximum(out, np.roll(np.roll(m, dy, axis=0), dx, axis=1))
    return out > 0.5


def masonry(n, cols, rows, mortar_px, seed, jitter=0.025):
    X, Y = xy(n)
    wob = jitter * (vnoise(n, cols * 3, rows * 3, seed, 2) - 0.5)
    vv = (Y + wob * 0.7) % 1.0
    row = np.floor(vv * rows).astype(np.int32)
    shift = (row % 2) * 0.5
    uu = (X + wob * 0.5 + shift) % 1.0
    col = np.floor(uu * cols).astype(np.int32)
    fx = (uu * cols) % 1.0
    fy = (vv * rows) % 1.0
    dxp = np.minimum(fx, 1 - fx) * n / cols
    dyp = np.minimum(fy, 1 - fy) * n / rows
    mortar = (dxp < mortar_px) | (dyp < mortar_px)
    return dict(X=X, Y=Y, row=row, col=col, mortar=mortar, fx=fx, fy=fy, dxp=dxp, dyp=dyp)


def tone_of(row, col, seed):
    return ((row.astype(np.int64) * 37 + col.astype(np.int64) * 91 + seed) % 101) / 100.0


def norm01(field, lo=0.02, hi=0.98):
    f = np.asarray(field, dtype=np.float64)
    a, b = np.quantile(f, [lo, hi])
    return np.clip((f - a) / (b - a + 1e-9), 0.0, 1.0)


def clustered(field, count, levels=5, seed=0, grain=0.14, lo=0.02, hi=0.98):
    """Hard-edged pixel clusters: quantise a field into `levels` flat steps and
    scatter a few single-pixel grains so large fills still read as pixel art
    instead of soft airbrush gradients."""
    f = norm01(field, lo, hi)
    b = np.minimum((f * levels).astype(np.int32), levels - 1)
    base = np.rint(b * (count - 1) / max(1, levels - 1)).astype(np.int32)
    r = np.random.default_rng(seed).random(f.shape)
    idx = base + (r < grain).astype(np.int32) - (r > 1 - grain).astype(np.int32)
    return np.clip(idx, 0, count - 1)


def hash01(values):
    v = np.asarray(values, dtype=np.int64)
    return ((v * 2654435761) % 1000003 % 1000) / 1000.0


# ---------------------------------------------------------------------------
# palettes
# ---------------------------------------------------------------------------

SAND = grad(14, (196, 172, 122), (204, 180, 130), (210, 186, 136), (216, 192, 142), (222, 198, 148))
SAND_RIPPLE = grad(16, (196, 170, 120), (203, 178, 128), (209, 184, 134), (215, 190, 140), (221, 196, 146))
SAND_COMPACT = grad(12, (194, 170, 122), (202, 178, 130), (208, 184, 136), (214, 190, 142), (218, 196, 148))
SAND_GRAVEL = pal(
    grad(10, (192, 168, 120), (200, 176, 128), (208, 184, 136), (214, 190, 142), (220, 196, 148)),
    grad(8, (168, 156, 132), (184, 172, 146), (196, 184, 158), (206, 194, 168), (214, 202, 178)),
)
LIMESTONE_DUST = grad(14, (148, 142, 126), (176, 168, 148), (200, 190, 168), (218, 209, 186), (236, 228, 208))
EARTH_CRACKED = pal(
    [(120, 100, 76), (136, 114, 88)],
    grad(14, (150, 128, 100), (166, 144, 114), (180, 158, 126), (192, 171, 139), (202, 182, 150)),
)
MUD_WET = pal(
    grad(12, (108, 98, 82), (120, 110, 92), (132, 122, 102), (144, 134, 114), (156, 146, 126), (168, 158, 138)),
    [(140, 140, 130), (152, 152, 142), (164, 164, 154), (176, 176, 166)],
)
ASPHALT_BURIED = pal(
    grad(5, (40, 40, 42), (58, 58, 60), (78, 78, 80), (98, 97, 95), (118, 116, 112)),
    grad(13, (150, 132, 100), (180, 160, 124), (208, 190, 154), (226, 210, 176), (240, 228, 200)),
)
WATER_SHALLOW = pal(
    grad(20, (22, 62, 66), (28, 80, 82), (36, 98, 98), (46, 116, 112), (58, 134, 126), (72, 152, 142), (90, 168, 156), (110, 184, 170), (134, 200, 186), (164, 216, 202)),
)
LIMESTONE_SHELL = grad(16, (163, 155, 140), (173, 165, 150), (183, 175, 160), (191, 183, 168), (199, 191, 176))
SANDSTONE_BLOCK = pal(
    [(140, 116, 86), (148, 122, 92)],
    grad(14, (150, 124, 92), (172, 146, 110), (192, 164, 124), (210, 182, 142), (226, 200, 162), (236, 212, 176)),
)
ROCK_STRATA = grad(18, (82, 72, 60), (104, 88, 68), (128, 108, 82), (150, 128, 96), (172, 148, 112), (150, 132, 112), (178, 158, 132), (198, 176, 146), (120, 104, 88))
GRANITE_DARK = pal(
    [(34, 34, 38), (46, 46, 50)],
    grad(9, (60, 60, 64), (78, 78, 82), (98, 98, 102), (120, 120, 124), (144, 144, 146), (168, 168, 170)),
    [(196, 196, 194), (214, 214, 210), (226, 226, 222)],
    [(180, 152, 142), (166, 134, 126)],
)
TOMB_PLASTER = pal(
    [(118, 100, 80), (140, 120, 96), (158, 138, 112)],
    grad(15, (172, 160, 138), (192, 180, 156), (210, 198, 174), (224, 214, 192), (238, 230, 210)),
)
RELIEF_FRAGMENT = pal(
    [(104, 82, 60), (126, 100, 74)],
    grad(16, (140, 114, 86), (162, 136, 102), (184, 158, 120), (204, 178, 140), (220, 196, 158), (232, 210, 174)),
    [(240, 224, 192), (156, 140, 112)],
)
STONE_SOOT = pal(
    grad(6, (38, 36, 34), (54, 50, 46), (72, 66, 60), (94, 86, 78), (118, 106, 94)),
    grad(12, (136, 122, 104), (156, 138, 116), (172, 154, 130), (188, 170, 144), (204, 186, 158), (216, 200, 172)),
)
MUDBRICK = pal(
    [(88, 66, 46), (104, 80, 56)],
    grad(15, (118, 92, 64), (140, 112, 80), (160, 130, 94), (178, 148, 110), (194, 164, 124), (208, 180, 140)),
    [(214, 198, 152), (224, 210, 168)],
)
PLASTER_OCHRE = pal(
    [(118, 84, 56), (138, 98, 64)],
    grad(14, (152, 112, 70), (176, 134, 88), (196, 154, 104), (214, 174, 122), (228, 192, 142), (238, 210, 166)),
)
PLASTER_WHITE = pal(
    [(142, 132, 116), (158, 148, 132), (172, 162, 146)],
    grad(12, (190, 184, 170), (206, 200, 186), (220, 214, 200), (232, 226, 214), (242, 238, 228), (248, 244, 236)),
)
PALM_WOOD = pal(
    [(70, 48, 30), (86, 60, 38)],
    grad(14, (100, 70, 44), (120, 86, 54), (138, 102, 66), (156, 118, 78), (174, 136, 94), (192, 154, 110)),
)
TERRACOTTA = pal(
    [(112, 56, 36), (132, 68, 42)],
    grad(13, (148, 78, 48), (168, 94, 58), (186, 110, 70), (202, 128, 84), (216, 146, 100), (228, 162, 116)),
    [(236, 184, 142), (196, 132, 92)],
)
BASKET_WEAVE = pal(
    [(104, 82, 46), (122, 98, 56)],
    grad(15, (136, 110, 64), (156, 128, 78), (174, 146, 94), (190, 164, 110), (206, 182, 128), (218, 196, 146)),
)
METAL_FADED = pal(
    grad(8, (40, 60, 58), (54, 76, 72), (70, 94, 88), (88, 112, 104), (108, 130, 120), (130, 148, 136)),
    grad(5, (140, 66, 40), (162, 84, 52), (184, 104, 66), (200, 124, 84)),
    grad(4, (104, 104, 102), (132, 132, 128), (160, 160, 156)),
    [(196, 196, 190), (72, 84, 82), (186, 176, 158)],
)
PALM_BARK = pal(
    [(62, 56, 46), (78, 70, 56)],
    grad(16, (94, 84, 68), (112, 100, 82), (132, 118, 98), (150, 136, 114), (166, 152, 128), (180, 166, 142)),
)
PALM_LEAF = pal(
    [(34, 58, 32), (44, 72, 38)],
    grad(14, (56, 88, 44), (72, 106, 52), (88, 124, 62), (106, 142, 72), (124, 158, 84), (142, 172, 96), (160, 184, 110)),
    [(178, 196, 130), (196, 206, 148), (84, 112, 60)],
)
REED_GRASS = pal(
    [(58, 68, 40), (72, 84, 46)],
    grad(16, (84, 100, 54), (102, 118, 62), (120, 136, 72), (140, 152, 84), (158, 168, 96), (176, 184, 110), (194, 200, 130)),
    [(208, 212, 150), (168, 156, 96)],
)
OASIS_SOIL = pal(
    [(48, 42, 32), (62, 54, 40)],
    grad(12, (76, 66, 50), (96, 84, 62), (114, 100, 74), (132, 116, 88), (146, 132, 104)),
    [(54, 66, 46), (70, 84, 56), (88, 100, 68), (104, 116, 82)],
)
PAVEMENT_OIL = pal(
    grad(10, (108, 106, 100), (126, 124, 118), (144, 142, 136), (162, 160, 154), (180, 178, 172), (196, 194, 188)),
    grad(6, (36, 35, 36), (48, 47, 48), (62, 60, 62), (78, 74, 78)),
    [(70, 68, 84), (88, 84, 102), (104, 100, 122), (88, 96, 104)],
)
RUBBER_WORN = pal(
    [(38, 38, 40), (50, 50, 52)],
    grad(12, (62, 62, 64), (78, 78, 80), (94, 94, 96), (110, 110, 112), (126, 126, 128), (146, 146, 148)),
    [(164, 164, 164), (96, 90, 84), (80, 76, 72)],
)
ENAMEL_SUN = pal(
    grad(7, (176, 172, 156), (196, 192, 176), (214, 210, 196), (228, 224, 210), (238, 234, 222)),
    grad(4, (146, 170, 158), (166, 188, 176), (186, 206, 194)),
    grad(4, (140, 66, 42), (164, 86, 56), (186, 108, 72), (204, 130, 88)),
    [(120, 116, 108), (152, 148, 140), (92, 88, 82), (64, 62, 58)],
)

CLOTH_PAL = pal(
    [(232, 220, 192), (212, 198, 168), (190, 172, 138)],
    [(148, 58, 46), (172, 82, 60), (194, 108, 82)],
    [(56, 74, 102), (78, 100, 130), (102, 126, 156)],
    [(72, 94, 72), (96, 118, 92), (124, 144, 114)],
    [(60, 50, 38), (94, 78, 58), (126, 106, 80)],
    [(176, 138, 74), (204, 168, 102), (224, 196, 138), (242, 232, 208)],
)
MURAL_PAL = pal(
    [(150, 124, 92), (172, 146, 112), (192, 168, 132), (210, 188, 152), (228, 208, 176)],
    [(44, 60, 106), (64, 84, 134), (88, 110, 158)],
    [(146, 54, 42), (172, 78, 58), (196, 104, 82)],
    [(190, 142, 52), (212, 168, 82), (228, 190, 114)],
    [(38, 34, 32), (60, 54, 48), (86, 78, 66)],
    [(228, 220, 200), (244, 238, 224)],
    [(58, 82, 70), (84, 108, 92)],
    [(120, 96, 68), (146, 120, 88)],
)

SAND_ULTRAFINE = grad(14, (202, 178, 128), (208, 184, 134), (214, 190, 140), (220, 196, 146), (226, 202, 152))
SAND_RIPPLE_SOFT = grad(16, (198, 174, 124), (205, 180, 130), (211, 186, 136), (217, 192, 142), (223, 198, 148))
SAND_COMPACT_DARK = grad(12, (190, 166, 118), (198, 174, 126), (204, 180, 132), (210, 186, 138), (216, 192, 144))
SAND_DAMP = pal(
    grad(12, (188, 166, 126), (195, 173, 133), (201, 179, 139), (207, 185, 145), (213, 191, 151)),
    [(190, 186, 164), (198, 194, 172)],
)
SANDSTONE_FINE = grad(16, (150, 126, 96), (164, 140, 108), (178, 154, 122), (192, 168, 136), (204, 181, 150), (214, 192, 162))
LIMESTONE_PALE = grad(16, (176, 168, 154), (184, 176, 162), (192, 184, 170), (200, 192, 178), (208, 200, 186), (214, 207, 194))
LIMESTONE_WEATHERED = pal(
    grad(16, (146, 138, 124), (156, 148, 134), (166, 158, 144), (176, 168, 154), (186, 178, 164), (194, 186, 172)),
    [(132, 124, 110), (140, 132, 118)],
)
ROCK_STRATA_PALE = grad(18, (126, 114, 98), (140, 128, 110), (154, 142, 124), (168, 156, 138), (182, 170, 152), (196, 184, 166), (150, 138, 120), (164, 152, 134))
MUDBRICK_PALE = grad(18, (146, 124, 96), (158, 136, 108), (170, 148, 120), (182, 160, 132), (194, 172, 144), (204, 183, 156), (176, 162, 128))
MUDBRICK_DARK = grad(18, (92, 72, 52), (104, 84, 63), (116, 96, 74), (128, 108, 85), (140, 120, 96), (152, 132, 108), (116, 100, 80))
PLASTER_OCHRE_WORN = grad(16, (148, 116, 82), (158, 126, 92), (168, 136, 102), (178, 146, 112), (188, 156, 122), (198, 168, 134), (178, 144, 108))
PLASTER_WHITE_CLEAN = grad(15, (194, 188, 174), (202, 196, 182), (210, 204, 190), (218, 212, 198), (226, 220, 206), (234, 228, 216))
PALM_WOOD_OLD = grad(16, (94, 74, 54), (108, 88, 67), (122, 102, 80), (136, 116, 94), (150, 130, 108), (164, 144, 122), (120, 100, 78))
TERRACOTTA_PALE = grad(17, (158, 102, 76), (170, 116, 88), (182, 130, 100), (194, 144, 114), (206, 158, 128), (216, 171, 140), (186, 134, 106))
OASIS_GRASS = grad(16, (70, 90, 52), (82, 102, 60), (94, 114, 68), (106, 126, 78), (118, 138, 88), (130, 150, 98), (142, 162, 108))
OASIS_MUD = pal(
    grad(12, (48, 44, 34), (60, 54, 42), (72, 64, 50), (84, 76, 58), (96, 86, 68), (108, 98, 78), (120, 110, 88), (132, 122, 100), (144, 134, 112), (156, 146, 124)),
    [(56, 70, 46), (70, 86, 56), (84, 100, 66), (98, 114, 76), (64, 78, 52), (78, 92, 60)],
)
REED_DRY = grad(20, (124, 106, 66), (136, 118, 76), (148, 130, 86), (160, 142, 98), (172, 154, 110), (184, 166, 122), (196, 178, 134), (208, 190, 148), (148, 130, 82), (160, 142, 94))
ASPHALT_CLEAN = grad(16, (54, 54, 56), (66, 66, 68), (78, 78, 80), (90, 90, 92), (102, 102, 104), (114, 114, 116), (126, 126, 128), (138, 138, 140), (150, 150, 152), (162, 162, 164))
PAVEMENT_PLAIN = grad(20, (116, 114, 108), (126, 124, 118), (136, 134, 128), (146, 144, 138), (156, 154, 148), (166, 164, 158), (176, 174, 168), (186, 184, 178), (196, 194, 188), (204, 202, 196))
ENAMEL_WORN = pal(
    grad(7, (168, 164, 148), (182, 178, 162), (196, 192, 176), (208, 204, 190), (220, 216, 202)),
    grad(4, (140, 158, 148), (154, 172, 162), (168, 186, 176)),
    grad(4, (132, 74, 52), (150, 90, 66), (168, 106, 80), (184, 122, 94)),
    [(120, 114, 104), (146, 140, 130), (88, 84, 78), (180, 172, 158)],
)
PLANT_PAL = pal(
    grad(8, (56, 78, 42), (68, 92, 52), (80, 106, 62), (94, 120, 72), (108, 134, 84), (122, 148, 96), (136, 162, 108)),
    [(44, 60, 36), (60, 76, 46), (76, 92, 56), (96, 112, 68)],
    [(124, 100, 62), (148, 124, 78), (168, 144, 96)],
    [(190, 168, 120), (208, 190, 148), (224, 210, 178), (244, 236, 214)],
)
GOODS_PAL = pal(
    grad(6, (120, 86, 58), (142, 104, 72), (162, 124, 90), (180, 144, 110), (198, 164, 130)),
    [(140, 64, 46), (164, 82, 60), (186, 104, 78), (204, 128, 100)],
    [(176, 142, 76), (196, 164, 96), (214, 184, 118), (230, 204, 146)],
    [(58, 74, 96), (80, 98, 122), (108, 126, 148)],
    [(236, 228, 208), (214, 206, 186), (160, 150, 130)],
)


# ---------------------------------------------------------------------------
# block material generators
# ---------------------------------------------------------------------------


def gen_sand_fine(n, P, seed):
    macro = 0.46 * vnoise(n, 5, 5, seed, 2) + 0.30 * vnoise(n, 13, 13, seed + 2, 2)
    f = macro + 0.24 * vnoise(n, 27, 27, seed + 4, 2)
    idx = clustered(f, len(P), levels=5, seed=seed + 21, grain=0.17)
    r = np.random.default_rng(seed + 31).random((n, n))
    idx = np.where(r < 0.030, np.minimum(idx + 1, len(P) - 1), idx)
    idx = np.where(r > 0.975, np.maximum(idx - 1, 0), idx)
    return idx


def gen_sand_ripple(n, P, seed):
    X, Y = xy(n)
    warp = (vnoise(n, 3, 3, seed, 3) - 0.5) * 1.15 + (vnoise(n, 7, 7, seed + 5, 2) - 0.5) * 0.45
    phase = Y * 6.0 + 0.26 * np.sin(2 * np.pi * (X * 2.0 + warp * 1.25)) + 0.15 * warp
    r = 0.5 + 0.5 * np.sin(2 * np.pi * phase)
    f = 0.74 * r + 0.18 * vnoise(n, 15, 15, seed + 9, 2) + 0.08 * vnoise(n, 2, 3, seed + 11, 2)
    idx = clustered(f, len(P), levels=6, seed=seed + 12, grain=0.10)
    return idx


def gen_sand_compact(n, P, seed):
    f = 0.52 * vnoise(n, 6, 6, seed, 3) + 0.28 * vnoise(n, 17, 17, seed + 3, 2) + 0.20 * vnoise(n, 2, 3, seed + 8, 2)
    idx = clustered(f, len(P), levels=6, seed=seed + 9, grain=0.18)
    return idx


def gen_sand_gravel(n, P, seed):
    sand_field = 0.55 * vnoise(n, 8, 8, seed + 1, 2) + 0.45 * vnoise(n, 21, 21, seed + 2, 2)
    sand_idx = clustered(sand_field, 10, levels=5, seed=seed + 31, grain=0.18)
    f1a, _, dxa, dya, ia = worley(n, 7, seed + 10)
    f1b, _, dxb, dyb, ib = worley(n, 15, seed + 20)
    r1 = 0.075 * (0.60 + 0.7 * vnoise(n, 5, 5, seed + 4, 2))
    r2 = 0.040 * (0.55 + 0.9 * vnoise(n, 10, 10, seed + 5, 2))
    m1 = f1a < r1
    m2 = f1b < r2
    body = np.where(m1, 11 + (hash01(ia) * 4).astype(np.int32),
                    np.where(m2, 11 + (hash01(ib) * 4).astype(np.int32), -1))
    idx = np.where(body >= 0, body, sand_idx)
    din = np.where(m1, dxa, dxb)
    diny = np.where(m1, dya, dyb)
    hi = (body >= 0) & ((din * 0.6 + diny * 0.8) < -0.004)
    idx = np.where(hi, 16 + (hash01(np.where(m1, ia, ib)) * 2).astype(np.int32), idx)
    outline = ((f1a >= r1) & (f1a < r1 + 1.2 / n)) | ((f1b >= r2) & (f1b < r2 + 1.0 / n))
    idx = np.where(outline, 10, idx)
    return idx


def gen_limestone_dust(n, P, seed):
    f = 0.46 * vnoise(n, 2, 5, seed, 3) + 0.30 * vnoise(n, 9, 15, seed + 3, 2) + 0.24 * vnoise(n, 24, 24, seed + 5, 2)
    idx = clustered(f, len(P), levels=5, seed=seed + 7, grain=0.15)
    r = np.random.default_rng(seed + 8).random((n, n))
    idx = np.where(r < 0.02, np.minimum(idx + 1, len(P) - 1), idx)
    return idx


def gen_earth_cracked(n, P, seed):
    f1, f2, _, _, pid = worley(n, 4, seed + 3)
    gap = f2 - f1
    crack = gap < 1.25 / n
    f1b, f2b, _, _, _ = worley(n, 8, seed + 9)
    crack2 = ((f2b - f1b) < 0.7 / n) & (vnoise(n, 3, 3, seed + 20, 2) > 0.60)
    plate = 2 + (hash01(pid) * (len(P) - 2)).astype(np.int32)
    grain = np.random.default_rng(seed + 14).random((n, n))
    plate = np.clip(plate + (grain < 0.12).astype(np.int32) - (grain > 0.93).astype(np.int32), 2, len(P) - 1)
    idx = np.where(crack2, 1, plate)
    idx = np.where(crack, 0, idx)
    return idx


def gen_mud_wet(n, P, seed):
    X, Y = xy(n)
    damp = norm01(0.62 * vnoise(n, 4, 4, seed, 2) + 0.46 * vnoise(n, 8, 8, seed + 2, 2))
    base = clustered(0.5 * vnoise(n, 9, 9, seed + 4, 3) + 0.5 * vnoise(n, 22, 22, seed + 5, 2), 12, levels=5, seed=seed + 6, grain=0.14)
    idx = np.where(damp > 0.62, np.minimum(base + 1, 11), base)
    puddle = damp > 0.74
    sheen = puddle & ((0.5 + 0.5 * np.sin(2 * np.pi * (Y * 4.0 + 0.4 * vnoise(n, 3, 3, seed + 7, 2)))) > 0.62)
    idx = np.where(sheen, 12 + (hash01(np.floor(X * 7) + np.floor(Y * 7) * 11) * 4).astype(np.int32), idx)
    rim = blur3(puddle) & ~puddle
    idx = np.where(rim, np.maximum(idx - 2, 0), idx)
    grit = np.random.default_rng(seed + 9).random((n, n))
    idx = np.where(grit < 0.022, np.minimum(idx + 2, 11), idx)
    return idx


def gen_asphalt_buried(n, P, seed):
    cover = norm01(0.58 * vnoise(n, 3, 3, seed, 3) + 0.48 * vnoise(n, 7, 7, seed + 2, 2))
    sandmask = cover > 0.56
    asph = clustered(0.6 * vnoise(n, 21, 21, seed + 4, 2) + 0.4 * vnoise(n, 9, 9, seed + 5, 2), 5, levels=4, seed=seed + 6, grain=0.20)
    sand = 5 + clustered(0.6 * vnoise(n, 10, 10, seed + 7, 2) + 0.4 * vnoise(n, 24, 24, seed + 8, 2), len(P) - 5, levels=5, seed=seed + 9, grain=0.16)
    idx = np.where(sandmask, sand, asph)
    edge = blur3(sandmask) & ~sandmask
    idx = np.where(edge, 3, idx)
    agg = np.random.default_rng(seed + 11).random((n, n)) < 0.09
    idx = np.where(agg & ~sandmask, 4, idx)
    f1, f2, _, _, _ = worley(n, 12, seed + 12)
    idx = np.where(((f2 - f1) < 1.1 / n) & ~sandmask, 0, idx)
    return idx


def gen_water_shallow(n, P, seed):
    X, Y = xy(n)
    warp = (vnoise(n, 3, 3, seed, 3) - 0.5) * 0.9
    wave = 0.5 + 0.5 * np.sin(2 * np.pi * (X * 3.0 + Y * 2.0 + 0.30 * warp))
    f1, f2, _, _, _ = worley(n, 11, seed + 6)
    gap = f2 - f1
    f = 0.36 * wave + 0.40 * vnoise(n, 11, 11, seed + 2, 2) + 0.24 * vnoise(n, 2, 3, seed + 4, 2)
    idx = 5 + clustered(f, 10, levels=5, seed=seed + 5, grain=0.16)
    idx = np.where(wave < 0.14, np.maximum(idx - 1, 4), idx)
    idx = np.where(gap < 1.5 / n, 15, idx)
    idx = np.where(gap < 0.8 / n, 17, idx)
    ripple = np.sin(2 * np.pi * (X * 9.0 - Y * 4.0 + 0.35 * warp))
    idx = np.where(ripple > 0.93, 14, idx)
    crest = np.sin(2 * np.pi * (X * 5.0 - Y * 2.0 + 0.25 * warp))
    idx = np.where(crest > 0.975, 17, idx)
    return idx


def gen_limestone_shell(n, P, seed):
    """Quarried limestone face: no joints, fine grain and very faint horizontal
    bedding. The pyramid terraces stack thousands of 1 m faces, so any mortar
    grid reads as dark outlined bricks from a distance; contrast stays inside
    +-10 RGB and layer lines are only 1-2 px at the authored resolution.
    """
    X, Y = xy(n)
    base = 0.46 * vnoise(n, 13, 13, seed, 2) + 0.34 * vnoise(n, 27, 27, seed + 2, 2) + 0.20 * vnoise(n, 5, 5, seed + 3, 2)
    # broad, extremely low-amplitude sedimentary tone bands (4 per tile)
    yb = (Y * 4.0 + 0.03 * (vnoise(n, 3, 3, seed + 4, 2) - 0.5)) % 1.0
    band = 0.045 * (0.5 - yb)
    idx = 2 + clustered(base + band, len(P) - 2, levels=5, seed=seed + 7, grain=0.13)
    # thin bedding lines, resolution-aware (1-2 px), one to two palette steps
    dist = np.minimum(yb, 1.0 - yb)
    thin = dist < 1.6 / n
    idx = np.where(thin, np.maximum(idx - 3, 0), idx)
    # sparse single-pixel pitting (never lines)
    pits = np.random.default_rng(seed + 21).random((n, n)) < (0.012 if n >= 64 else 0.006)
    idx = np.where(pits, np.maximum(idx - 1, 0), idx)
    return idx


def gen_sandstone_block(n, P, seed):
    m = masonry(n, 2, 4, max(1, n // 96), seed, jitter=0.035)
    chisel = 0.5 + 0.5 * np.sin(2 * np.pi * (m["X"] * 7.0 + m["Y"] * 2.0 + 0.4 * vnoise(n, 4, 4, seed + 8, 2)))
    surf = 0.44 * vnoise(n, 19, 19, seed + 3, 2) + 0.34 * vnoise(n, 6, 6, seed + 4, 2) + 0.22 * vnoise(n, 2, 2, seed + 5, 1)
    t = tone_of(m["row"], m["col"], seed + 7)
    f = 0.20 + 0.50 * surf + 0.12 * chisel * 0.35 + 0.14 * t
    idx = shade_range(f, 2, len(P) - 1)
    top = (m["fy"] < 0.5) & (m["dyp"] < 2.2)
    bottom = (m["fy"] >= 0.5) & (m["dyp"] < 2.2)
    idx = np.where(top & ~m["mortar"], np.minimum(idx + 1, len(P) - 1), idx)
    idx = np.where(bottom & ~m["mortar"], np.maximum(idx - 1, 2), idx)
    idx = np.where(m["mortar"], 0, idx)
    chips = np.random.default_rng(seed + 23).random((n, n)) < (0.015 if n >= 64 else 0.008)
    idx = np.where(chips, 1, idx)
    return idx


def gen_rock_strata(n, P, seed):
    rng = np.random.default_rng(seed + 2)
    weights = rng.dirichlet(np.ones(9) * 1.2)
    cum = np.cumsum(weights)
    cum /= cum[-1]
    X, Y = xy(n)
    warp = (vnoise(n, 3, 5, seed, 2) - 0.5) * 0.026
    vv = np.clip((Y + warp) % 1.0, 0.0, 0.999999)
    band = np.minimum(np.searchsorted(cum, vv, side="right"), 8)
    tones = rng.random(9)
    lam = 0.5 + 0.5 * np.sin(2 * np.pi * (Y * (0.22 * n) + 0.8 * warp * 25))
    f = 0.50 * (0.35 + 0.6 * tones[band]) + 0.22 * lam + 0.28 * vnoise(n, 15, 15, seed + 3, 2)
    f += 0.045 * np.sin(2 * np.pi * (X * 5.0 + Y * 2.0))
    idx = clustered(f, len(P), levels=6, seed=seed + 5, grain=0.10)
    dist = np.min(np.abs(vv[..., None] - cum[None, None, :]), axis=-1) * n
    idx = np.where(dist < 1.1, np.minimum(idx, 2), idx)
    cross = np.sin(2 * np.pi * (X * 4.0 + Y * 7.0 + 0.2 * vnoise(n, 5, 5, seed + 8, 2)))
    idx = np.where((cross > 0.985) & (band % 3 == 0), np.minimum(idx + 2, len(P) - 1), idx)
    return idx


def gen_granite_dark(n, P, seed):
    base = 0.50 * vnoise(n, 4, 4, seed, 3) + 0.30 * vnoise(n, 11, 11, seed + 2, 2) + 0.20 * vnoise(n, 2, 2, seed + 3, 2)
    idx = shade_range(base, 2, 12)
    rng = np.random.default_rng(seed + 7)
    r = rng.random((n, n))
    p = 0.075 if n == 32 else 0.085 if n == 64 else 0.09
    idx = np.where(r < p * 0.55, 13, idx)
    idx = np.where((r >= p * 0.55) & (r < p * 0.78), 14, idx)
    idx = np.where((r >= p * 0.78) & (r < p), 15, idx)
    idx = np.where(r > 1 - p * 0.7, 0, idx)
    idx = np.where((r > 1 - p * 0.35) & (r <= 1 - p * 0.2), 1, idx)
    return idx


def gen_tomb_plaster(n, P, seed):
    X, Y = xy(n)
    plc = 0.5 * vnoise(n, 5, 5, seed, 3) + 0.3 * vnoise(n, 13, 13, seed + 2, 2) + 0.2 * vnoise(n, 3, 3, seed + 3, 2)
    idx = 4 + clustered(plc, len(P) - 4, levels=5, seed=seed + 4, grain=0.15)
    flake = norm01(0.7 * vnoise(n, 6, 6, seed + 5, 2) + 0.45 * vnoise(n, 14, 14, seed + 6, 2)) > 0.80
    under = 2 + (hash01(np.floor(X * 5) + np.floor(Y * 5) * 7) * 2).astype(np.int32)
    idx = np.where(flake, under, idx)
    idx = np.where(blur3(flake) & ~flake, 1, idx)
    cracks = crack_mask(n, seed + 30, lines=3)
    idx = np.where(blur3(cracks) & ~cracks, np.maximum(idx - 2, 0), idx)
    idx = np.where(cracks, 0, idx)
    return idx


def gen_relief_fragment(n, P, seed):
    X, Y = xy(n)
    reg = np.floor(Y * 3.0).astype(np.int32)
    fy = (Y * 3.0) % 1.0
    H = np.full((n, n), 0.18)
    frame = np.minimum(fy, 1 - fy)
    H += 0.30 * np.exp(-((frame - 0.035) / 0.022) ** 2)
    H -= 0.22 * np.exp(-((frame - 0.085) / 0.020) ** 2)
    inner = smoothstep(0.10, 0.13, frame)
    mx = (X * 4.0) % 1.0
    diamond = np.abs(mx - 0.5) + 0.55 * np.abs(fy - 0.5)
    carved = smoothstep(0.34, 0.30, diamond)
    H -= 0.20 * carved * inner
    H += 0.10 * smoothstep(0.30, 0.32, diamond) * (1 - smoothstep(0.36, 0.38, diamond)) * inner
    H += 0.05 * (vnoise(n, 21, 21, seed + 3, 2) - 0.5)
    wear = norm01(0.6 * vnoise(n, 6, 6, seed + 7, 2) + 0.5 * vnoise(n, 13, 13, seed + 8, 2))
    H *= np.where(wear > 0.72, 0.55, 1.0)
    gy, gx = np.gradient(H)
    light = -(gx * 0.7 + gy * 1.0) * (n / 32) * 7.0
    f = 0.42 + 0.60 * H + 0.50 * light + 0.12 * vnoise(n, 25, 25, seed + 4, 2)
    idx = clustered(f, len(P), levels=7, seed=seed + 6, grain=0.11)
    r = np.random.default_rng(seed + 12).random((n, n))
    idx = np.where(r < 0.02, np.maximum(idx - 1, 0), idx)
    cracks = crack_mask(n, seed + 13, lines=2, width=1)
    idx = np.where(cracks, 0, idx)
    return idx


def gen_stone_soot(n, P, seed):
    X, Y = xy(n)
    m = masonry(n, 2, 3, max(1, n // 96), seed + 2, jitter=0.03)
    tone = tone_of(m["row"], m["col"], seed + 5)
    surf = 0.5 * vnoise(n, 15, 15, seed + 3, 2) + 0.3 * vnoise(n, 6, 6, seed + 4, 2) + 0.2 * vnoise(n, 2, 2, seed + 6, 2)
    stonef = 0.35 + 0.45 * surf + 0.20 * tone
    stone = 6 + clustered(stonef, len(P) - 6, levels=5, seed=seed + 7, grain=0.14)
    soot = norm01(0.55 * vnoise(n, 4, 4, seed + 8, 3) + 0.45 * vnoise(n, 9, 9, seed + 9, 2))
    up = smoothstep(0.30, 0.0, m["fy"])
    joint = smoothstep(2.2 / n, 0.0, np.minimum(m["dxp"], m["dyp"]))
    soot_mask = (soot > 0.78) | (joint > 0.74)
    dark = np.clip(0.25 + 0.45 * soot + 0.30 * up + 0.30 * joint, 0, 1)
    soot_idx = 5 - np.minimum((dark * 5).astype(np.int32), 4)
    idx = np.where(soot_mask, soot_idx, stone)
    idx = np.where(m["mortar"], 2, idx)
    warm = (~soot_mask) & (vnoise(n, 8, 8, seed + 10, 2) > 0.66)
    idx = np.where(warm, len(P) - 1, idx)
    return idx


def gen_mudbrick(n, P, seed):
    m = masonry(n, 3, 5, max(1.6, n / 32.0), seed + 3, jitter=0.045)
    surf = 0.46 * vnoise(n, 17, 17, seed + 2, 2) + 0.32 * vnoise(n, 7, 7, seed + 3, 2) + 0.22 * vnoise(n, 2, 2, seed + 4, 2)
    t = tone_of(m["row"], m["col"], seed + 11)
    f = 0.28 + 0.52 * surf + 0.20 * t
    idx = shade_range(f, 2, len(P) - 1)
    idx = np.where(m["mortar"], 0, idx)
    idx = np.where(m["mortar"], 0, idx)
    straw = np.random.default_rng(seed + 13).random((n, n)) < (0.020 if n >= 64 else 0.010)
    straw = straw & ~m["mortar"]
    straw = straw | np.roll(straw, 1, axis=1)
    idx = np.where(straw, len(P) - 1 - (np.arange(n)[None, :] % 2), idx)
    chip = np.random.default_rng(seed + 14).random((n, n)) < (0.012 if n >= 64 else 0.006)
    idx = np.where(chip & ~m["mortar"], 1, idx)
    return idx


def gen_plaster_ochre(n, P, seed):
    trowel = 0.30 * vnoise(n, 3, 16, seed, 2) + 0.40 * vnoise(n, 9, 9, seed + 2, 2) + 0.30 * vnoise(n, 2, 2, seed + 3, 1)
    base = 2 + clustered(trowel, len(P) - 2, levels=5, seed=seed + 4, grain=0.14)
    worn = norm01(0.6 * vnoise(n, 5, 5, seed + 5, 2) + 0.5 * vnoise(n, 12, 12, seed + 6, 2)) > 0.72
    idx = np.where(worn, np.minimum(base + 2, len(P) - 1), base)
    grime = np.random.default_rng(seed + 7).random((n, n)) < 0.02
    idx = np.where(grime, np.maximum(base - 1, 0), idx)
    return idx


def gen_plaster_white_old(n, P, seed):
    X, Y = xy(n)
    base = 4 + clustered(0.5 * vnoise(n, 5, 5, seed, 2) + 0.32 * vnoise(n, 13, 13, seed + 2, 2) + 0.18 * vnoise(n, 3, 3, seed + 3, 2), len(P) - 4, levels=4, seed=seed + 4, grain=0.08)
    grime = norm01(vnoise(n, 3, 16, seed + 5, 2)) > 0.90
    idx = np.where(grime, 4, base)
    chip = norm01(0.6 * vnoise(n, 9, 9, seed + 6, 2) + 0.5 * vnoise(n, 20, 20, seed + 7, 2)) > 0.91
    idx = np.where(blur3(chip) & ~chip, 3, idx)
    idx = np.where(chip, 1, idx)
    cracks = crack_mask(n, seed + 17, lines=2)
    idx = np.where(cracks, 2, idx)
    return idx


def gen_palm_wood(n, P, seed):
    X, Y = xy(n)
    grain = 0.5 * vnoise(n, 3, 4, seed, 2) + 0.5 * vnoise(n, 2, 22, seed + 2, 2)
    lines = 0.5 + 0.5 * np.sin(2 * np.pi * (Y * 12.0 + 0.28 * grain * 6.0))
    f = 0.52 * lines + 0.28 * grain + 0.20 * vnoise(n, 14, 14, seed + 4, 2)
    idx = clustered(f, len(P), levels=6, seed=seed + 5, grain=0.12)
    kx, ky, kr = 0.24, 0.32, 0.055
    dx = ((X - kx + 0.5) % 1.0) - 0.5
    dy = ((Y - ky + 0.5) % 1.0) - 0.5
    d = np.hypot(dx, dy * 0.6)
    knot = np.exp(-((d / kr) ** 2) ** 1.4)
    rings = 0.5 + 0.5 * np.sin(2 * np.pi * (d / kr * 2.2))
    idx = np.where(knot > 0.28, np.where(rings > 0.5, 2, 6), idx)
    return idx


def gen_terracotta(n, P, seed):
    X, Y = xy(n)
    coil = 0.5 + 0.5 * np.sin(2 * np.pi * (Y * 5.0 + 0.16 * vnoise(n, 4, 4, seed, 2) * 3))
    f = 0.30 * coil + 0.44 * vnoise(n, 9, 9, seed + 2, 2) + 0.26 * vnoise(n, 22, 22, seed + 3, 2)
    idx = 2 + clustered(f, len(P) - 2, levels=5, seed=seed + 4, grain=0.12)
    rng = np.random.default_rng(seed + 10)
    temper = rng.random((n, n))
    idx = np.where(temper < (0.018 if n >= 64 else 0.010), len(P) - 1, idx)
    idx = np.where(temper > 0.972, 0, idx)
    chips = norm01(0.65 * vnoise(n, 8, 8, seed + 12, 2) + 0.5 * vnoise(n, 18, 18, seed + 13, 2)) > 0.79
    idx = np.where(chips, 15 + (hash01(np.floor(X * 5) + seed) * 2).astype(np.int32), idx)
    crack = crack_mask(n, seed + 14, lines=2, width=1)
    idx = np.where(crack, 1, idx)
    return idx


def gen_basket_weave(n, P, seed):
    X, Y = xy(n)
    cells = 8
    fx = (X * cells) % 1.0
    fy = (Y * cells) % 1.0
    cx = np.floor(X * cells).astype(np.int32)
    cy = np.floor(Y * cells).astype(np.int32)
    over = ((cx + cy) % 2) == 0
    prof_x = 1 - np.abs(fx - 0.5) * 2
    prof_y = 1 - np.abs(fy - 0.5) * 2
    p = np.where(over, prof_x, prof_y)
    edge_x = np.minimum(fx, 1 - fx) < 0.07
    edge_y = np.minimum(fy, 1 - fy) < 0.07
    shadow = np.where(over, edge_y, edge_x)
    fiber = np.where(over, np.sin(2 * np.pi * (Y * cells * 3.0)), np.sin(2 * np.pi * (X * cells * 3.0)))
    f = 0.34 + 0.52 * p - 0.30 * shadow + 0.07 * fiber + 0.10 * vnoise(n, 9, 9, seed + 2, 2)
    idx = shade(f, len(P))
    idx = np.where(edge_x & edge_y, np.maximum(idx - 2, 0), idx)
    return idx


def gen_metal_faded(n, P, seed):
    X, Y = xy(n)
    paint = 2 + clustered(0.5 * vnoise(n, 6, 6, seed, 2) + 0.5 * vnoise(n, 16, 16, seed + 2, 2), 6, levels=4, seed=seed + 3, grain=0.10)
    # horizontal panel seam with a rivet row
    seam = np.abs(((Y - 0.5 + 0.5) % 1.0) - 0.5)
    seam = smoothstep(0.018, 0.006, seam)
    idx = np.where(seam > 0.5, 1, paint)
    for rx in (0.0625, 0.1875, 0.3125, 0.4375, 0.5625, 0.6875, 0.8125, 0.9375):
        dx = ((X - rx + 0.5) % 1.0) - 0.5
        dy = ((Y - 0.5 + 0.5) % 1.0) - 0.5
        d = np.hypot(dx, dy)
        idx = np.where(d < 0.030, 13, idx)
        idx = np.where((d >= 0.030) & (d < 0.040), 1, idx)
        idx = np.where((d < 0.020) & ((dx * 0.6 + dy * 0.85) < -0.004), 14, idx)
    chip = norm01(0.66 * vnoise(n, 9, 9, seed + 6, 2) + 0.46 * vnoise(n, 20, 20, seed + 7, 2)) > 0.86
    rust = 8 + (hash01(np.floor(X * 9) + np.floor(Y * 9) * 5 + seed) * 4).astype(np.int32)
    idx = np.where(chip, rust, idx)
    idx = np.where(blur3(chip) & ~chip, 2, idx)
    scratch = np.sin(2 * np.pi * (X * 3.0 + Y * 14.0 + 0.2 * vnoise(n, 6, 6, seed + 8, 2))) > 0.975
    idx = np.where(scratch & ~chip, 7, idx)
    return idx


def gen_palm_bark(n, P, seed):
    X, Y = xy(n)
    warp = (vnoise(n, 3, 2, seed, 2) - 0.5) * 0.10
    ridge = 0.5 + 0.35 * np.sin(2 * np.pi * (X * 7.0 + warp * 3.0)) + 0.15 * np.sin(2 * np.pi * (X * 13.0 + warp * 5.0) + 1.7)
    fiber = vnoise(n, 26, 3, seed + 2, 2)
    f = 0.38 * ridge + 0.38 * fiber + 0.24 * vnoise(n, 9, 9, seed + 3, 2)
    idx = clustered(f, len(P), levels=5, seed=seed + 5, grain=0.14)
    idx = np.where(ridge < 0.22, np.maximum(idx - 2, 0), idx)
    gx = np.floor(X * 2.0)
    gy = np.floor(Y * 4.0)
    h = hash01(gx * 11 + gy * 7 + seed)
    lx = ((X * 2.0) % 1.0) - (0.25 + 0.5 * hash01(gx + gy * 17 + seed))
    ly = ((Y * 4.0) % 1.0) - 0.5
    dash = (h > 0.40) & (np.abs(lx) < 0.26) & (np.abs(ly) < 0.055)
    idx = np.where(blur3(dash) & ~dash, np.maximum(idx - 2, 0), idx)
    idx = np.where(dash, 1, idx)
    idx = np.where(dash & (ly > 0.0), 2, idx)
    return idx


def gen_palm_leaf(n, P, seed):
    X, Y = xy(n)
    rach = 0.5 + 0.055 * np.sin(2 * np.pi * (Y * 2.0 + 0.2))
    d = ((X - rach + 0.5) % 1.0) - 0.5
    ad = np.abs(d)
    phase = Y * 10.0 + ad * 3.4
    blade = 0.5 + 0.5 * np.sin(2 * np.pi * phase)
    blade = smoothstep(0.40, 0.55, blade)
    rachis = np.exp(-((d / 0.030) ** 2))
    gap = (1 - blade) * smoothstep(0.05, 0.10, ad)
    tip = smoothstep(0.26, 0.46, ad)
    f = 0.26 + 0.40 * blade - 0.26 * gap + 0.34 * rachis + 0.16 * tip * blade
    f += 0.05 * np.sin(2 * np.pi * (Y * 30.0 + ad * 12.0))
    idx = clustered(f, len(P), levels=6, seed=seed + 6, grain=0.08)
    idx = np.where(rachis > 0.45, np.minimum(idx + 2, len(P) - 1), idx)
    idx = np.where(gap > 0.5, np.maximum(idx - 2, 2), idx)
    return idx


def gen_reed_grass(n, P, seed):
    X, Y = xy(n)
    warp = 0.10 * (vnoise(n, 4, 4, seed, 2) - 0.5)
    col = (X * 9.0 + warp) % 1.0
    edge = np.abs(col - 0.5)
    blade = smoothstep(0.48, 0.36, edge)
    cid = np.floor(X * 9.0)
    tone = hash01(cid + seed)
    sheath = np.abs(((Y * 3.0 + tone * 0.7) % 1.0)) < 0.06
    f = 0.20 + 0.46 * blade + 0.20 * tone + 0.18 * vnoise(n, 3, 9, seed + 2, 2)
    f -= 0.20 * sheath.astype(np.float64)
    f += 0.08 * (0.5 + 0.5 * np.sin(2 * np.pi * (Y * 1.0 + X * 0.2)))
    idx = clustered(f, len(P), levels=6, seed=seed + 5, grain=0.10)
    idx = np.where(sheath, np.maximum(idx - 2, 0), idx)
    dry = np.random.default_rng(seed + 9).random((n, n)) < 0.02
    idx = np.where(dry & (blade > 0.5), len(P) - 2, idx)
    return idx


def gen_oasis_soil(n, P, seed):
    f = 0.42 * vnoise(n, 5, 5, seed, 3) + 0.32 * vnoise(n, 13, 13, seed + 2, 2) + 0.26 * vnoise(n, 2, 2, seed + 3, 2)
    idx = shade_range(f, 0, 11)
    algae = smoothstep(0.62, 0.80, 0.6 * vnoise(n, 4, 4, seed + 5, 3) + 0.5 * vnoise(n, 9, 9, seed + 6, 2))
    idx = np.where(algae > 0.5, 12 + shade_abs(algae, 4, 0.5, 1.0), idx)
    specks = np.random.default_rng(seed + 8).random((n, n)) < (0.030 if n >= 64 else 0.016)
    idx = np.where(specks, 11, idx)
    twig = crack_mask(n, seed + 12, lines=2, width=1)
    idx = np.where(twig, 3, idx)
    return idx


def gen_pavement_oil(n, P, seed):
    X, Y = xy(n)
    base = clustered(0.5 * vnoise(n, 8, 8, seed, 2) + 0.3 * vnoise(n, 21, 21, seed + 2, 2) + 0.2 * vnoise(n, 3, 3, seed + 3, 2), 10, levels=5, seed=seed + 4, grain=0.14)
    oil = norm01(0.62 * vnoise(n, 3, 3, seed + 5, 2) + 0.5 * vnoise(n, 6, 6, seed + 6, 2)) > 0.67
    tone = hash01(np.floor(X * 5) + np.floor(Y * 5) * 9 + seed)
    idx = np.where(oil, 10 + (tone * 4).astype(np.int32), base)
    rim = blur3(oil) & ~oil
    idx = np.where(rim, 16 + (hash01(np.floor(X * 7) + seed) * 3).astype(np.int32), idx)
    scuff = norm01(vnoise(n, 3, 16, seed + 9, 2)) > 0.78
    idx = np.where(scuff & ~oil, np.maximum(base - 1, 0), idx)
    agg = np.random.default_rng(seed + 11).random((n, n)) < 0.06
    idx = np.where(agg & ~oil & ~rim, np.minimum(base + 2, 9), idx)
    return idx


def gen_rubber_worn(n, P, seed):
    X, Y = xy(n)
    rid = 0.5 + 0.5 * np.sin(2 * np.pi * (Y * 8.0 + 0.42 * np.abs(X - 0.5) * 2))
    prof = smoothstep(0.22, 0.45, rid) * (1 - smoothstep(0.74, 0.94, rid))
    f = 0.26 + 0.56 * prof + 0.10 * vnoise(n, 11, 11, seed + 2, 2) + 0.08 * vnoise(n, 3, 3, seed + 3, 2)
    idx = shade(f, len(P))
    groove = rid < 0.16
    idx = np.where(groove, np.maximum(idx - 2, 0), idx)
    scuff = smoothstep(0.72, 0.86, vnoise(n, 5, 16, seed + 6, 2))
    idx = np.where(scuff > 0.5, np.minimum(idx + 2, len(P) - 1), idx)
    crack = crack_mask(n, seed + 10, lines=2, width=1)
    idx = np.where(crack, 1, idx)
    return idx


def gen_enamel_sun(n, P, seed):
    X, Y = xy(n)
    bleach = 0.5 + 0.5 * np.sin(2 * np.pi * (Y * 1.0 + 0.2 * vnoise(n, 3, 3, seed, 2)))
    base = clustered(0.55 * vnoise(n, 7, 7, seed + 2, 2) + 0.28 * bleach + 0.17 * vnoise(n, 18, 18, seed + 3, 2), 5, levels=3, seed=seed + 4, grain=0.05)
    band = Y < 0.10
    idx = np.where(band, 5 + (hash01(np.floor(X * 8) + seed) * 3).astype(np.int32), base)
    chip = norm01(0.66 * vnoise(n, 9, 9, seed + 6, 2) + 0.46 * vnoise(n, 20, 20, seed + 7, 2)) > 0.925
    idx = np.where(chip, 12 + (hash01(np.floor(X * 6) + seed) * 2).astype(np.int32), idx)
    idx = np.where(blur3(chip) & ~chip, 8 + (hash01(np.floor(X * 5) + seed) * 2).astype(np.int32), idx)
    crazing = crack_mask(n, seed + 15, lines=1, width=1)
    idx = np.where(crazing & ~chip, 10, idx)
    return idx


def gen_sand_ultrafine(n, P, seed):
    f = 0.40 * vnoise(n, 9, 9, seed, 2) + 0.36 * vnoise(n, 31 if n >= 64 else 15, 31 if n >= 64 else 15, seed + 1, 2)
    f += 0.24 * vnoise(n, 3, 3, seed + 2, 1)
    return clustered(f, len(P), levels=4, seed=seed + 3, grain=0.07)


def gen_sand_ripple_soft(n, P, seed):
    X, Y = xy(n)
    warp = (vnoise(n, 3, 4, seed, 2) - 0.5) * 0.5
    phase = Y * 4.0 + 0.18 * np.sin(2 * np.pi * (X * 2.0 + warp)) + 0.10 * warp
    r = 0.5 + 0.5 * np.sin(2 * np.pi * phase)
    f = 0.66 * r + 0.28 * vnoise(n, 13, 13, seed + 2, 2) + 0.06 * vnoise(n, 2, 3, seed + 3, 2)
    return clustered(f, len(P), levels=5, seed=seed + 4, grain=0.05)


def gen_sand_damp(n, P, seed):
    X, Y = xy(n)
    damp = norm01(0.6 * vnoise(n, 4, 4, seed, 2) + 0.5 * vnoise(n, 9, 9, seed + 2, 2))
    base = clustered(0.55 * vnoise(n, 11, 11, seed + 3, 2) + 0.45 * vnoise(n, 25, 25, seed + 4, 2), 12, levels=4, seed=seed + 5, grain=0.06)
    idx = np.where(damp > 0.66, np.minimum(base + 1, 11), base)
    sheen = (damp > 0.78) & ((0.5 + 0.5 * np.sin(2 * np.pi * (Y * 3.0 + 0.3 * vnoise(n, 3, 3, seed + 6, 2)))) > 0.60)
    idx = np.where(sheen, 12 + (hash01(np.floor(X * 6) + np.floor(Y * 6) * 7 + seed) * 2).astype(np.int32), idx)
    return idx


def gen_sandstone_fine(n, P, seed):
    X, Y = xy(n)
    cross = 0.5 + 0.5 * np.sin(2 * np.pi * (X * 5.0 + Y * 3.0 + 0.25 * vnoise(n, 6, 6, seed, 2)))
    f = 0.46 * cross + 0.34 * vnoise(n, 15, 15, seed + 2, 2) + 0.20 * vnoise(n, 4, 4, seed + 3, 2)
    return clustered(f, len(P), levels=4, seed=seed + 4, grain=0.07)


def gen_limestone_pale(n, P, seed):
    X, Y = xy(n)
    base = 0.55 * vnoise(n, 7, 7, seed, 2) + 0.30 * vnoise(n, 21, 21, seed + 2, 2) + 0.15 * vnoise(n, 3, 3, seed + 3, 2)
    yb = (Y * 3.0 + 0.03 * (vnoise(n, 3, 3, seed + 4, 2) - 0.5)) % 1.0
    idx = 1 + clustered(base + 0.03 * (0.5 - yb), len(P) - 1, levels=4, seed=seed + 5, grain=0.08)
    dist = np.minimum(yb, 1.0 - yb)
    idx = np.where(dist < 1.4 / n, np.maximum(idx - 2, 0), idx)
    return idx


def gen_limestone_weathered(n, P, seed):
    X, Y = xy(n)
    base = 0.50 * vnoise(n, 5, 5, seed, 2) + 0.30 * vnoise(n, 13, 13, seed + 2, 2) + 0.20 * vnoise(n, 2, 2, seed + 3, 2)
    idx = 2 + clustered(base, len(P) - 2, levels=4, seed=seed + 4, grain=0.09)
    pits = norm01(0.6 * vnoise(n, 9, 9, seed + 5, 2) + 0.5 * vnoise(n, 20, 20, seed + 6, 2)) > 0.72
    idx = np.where(pits, (hash01(np.floor(X * 7) + np.floor(Y * 7) * 5 + seed) * 2).astype(np.int32), idx)
    idx = np.where(blur3(pits) & ~pits, 1, idx)
    return idx


def gen_oasis_grass(n, P, seed):
    blade = 0.50 * vnoise(n, 9, 3, seed, 2) + 0.50 * vnoise(n, 18, 4, seed + 2, 2)
    patches = norm01(0.6 * vnoise(n, 5, 5, seed + 3, 2) + 0.5 * vnoise(n, 11, 11, seed + 4, 2))
    f = 0.48 * blade + 0.30 * patches + 0.22 * vnoise(n, 3, 3, seed + 5, 2)
    idx = clustered(f, len(P), levels=4, seed=seed + 6, grain=0.07)
    idx = np.where(patches > 0.72, np.minimum(idx + 2, len(P) - 1), idx)
    return idx


def gen_asphalt_clean(n, P, seed):
    f = 0.45 * vnoise(n, 13, 13, seed, 2) + 0.35 * vnoise(n, 29, 29, seed + 2, 2) + 0.20 * vnoise(n, 2, 2, seed + 3, 2)
    idx = clustered(f, len(P), levels=4, seed=seed + 4, grain=0.10)
    agg = np.random.default_rng(seed + 5).random((n, n)) < (0.03 if n >= 64 else 0.015)
    idx = np.where(agg, np.minimum(idx + 2, len(P) - 1), idx)
    return idx


def gen_pavement_plain(n, P, seed):
    f = 0.50 * vnoise(n, 7, 7, seed, 2) + 0.30 * vnoise(n, 19, 19, seed + 2, 2) + 0.20 * vnoise(n, 2, 2, seed + 3, 2)
    idx = clustered(f, len(P), levels=4, seed=seed + 4, grain=0.09)
    agg = np.random.default_rng(seed + 5).random((n, n)) < 0.03
    idx = np.where(agg, np.minimum(idx + 2, len(P) - 1), idx)
    return idx


# ---------------------------------------------------------------------------
# decoration atlases (4x4 cells, each cell authored as flat pixel art)
# ---------------------------------------------------------------------------


def _cell_bg(c, color, P):
    im = Image.new("RGB", (c, c), color)
    return im, ImageDraw.Draw(im)


def cloth_panel(i, S, P):
    """One complete 2x2-cell decoration panel (S x S), 4 panels per atlas."""
    sc = max(1, S // 32)
    cream, cream2, cream3 = P[0], P[1], P[2]
    red, red2, red3 = P[3], P[4], P[5]
    blue, blue2, blue3 = P[6], P[7], P[8]
    green, green2, green3 = P[9], P[10], P[11]
    ink, ink2, ink3 = P[12], P[13], P[14]
    gold, gold2, gold3, pale = P[15], P[16], P[17], P[18]
    im = Image.new("RGB", (S, S), cream)
    d = ImageDraw.Draw(im)
    if i == 0:  # red/cream awning with hem
        for k in range(0, S, sc * 8):
            d.rectangle([k, 0, k + sc * 4 - 1, S - 1], fill=red)
            d.line([k, 0, k, S - 1], fill=red2)
            d.line([k + sc * 4 - 1, 0, k + sc * 4 - 1, S - 1], fill=cream2)
        for y in range(0, S, sc * 6):
            d.line([0, y, S - 1, y], fill=cream2)
        d.rectangle([0, 0, S - 1, sc * 2], fill=cream3)
        d.rectangle([0, S - sc * 3, S - 1, S - 1], fill=cream3)
    elif i == 1:  # indigo/cream awning with scalloped hem
        for k in range(0, S, sc * 8):
            d.rectangle([k, 0, k + sc * 4 - 1, S - 1], fill=blue)
            d.line([k, 0, k, S - 1], fill=blue2)
            d.line([k + sc * 4 - 1, 0, k + sc * 4 - 1, S - 1], fill=cream2)
        for y in range(0, S, sc * 7):
            d.line([0, y, S - 1, y], fill=cream3)
        for x in range(0, S, sc * 4):
            d.ellipse([x, S - sc * 5, x + sc * 4, S + sc * 1], fill=cream)
    elif i == 2:  # wall of hanging banners
        d.rectangle([0, 0, S - 1, S - 1], fill=ink3)
        for bi in range(4):
            bx = (bi % 2) * (S // 2)
            by = (bi // 2) * (S // 2)
            col = (red2, green, blue2, gold)[bi]
            d.rectangle([bx + sc * 2, by + sc * 2, bx + S // 2 - sc * 2, by + S // 2 - sc * 3], fill=col, outline=ink, width=sc)
            cx = bx + S // 4
            cy = by + S // 5
            d.ellipse([cx - sc * 4, cy - sc * 4, cx + sc * 4, cy + sc * 4], outline=gold, width=sc * 2)
            d.line([cx - sc * 4, cy, cx + sc * 4, cy], fill=gold3, width=sc)
            d.line([cx, cy - sc * 4, cx, cy + sc * 4], fill=gold3, width=sc)
            for fx in range(bx + sc * 3, bx + S // 2 - sc * 2, sc * 2):
                d.line([fx, by + S // 2 - sc * 3, fx, by + S // 2 - sc], fill=col)
    else:  # patchwork market cloth
        d.rectangle([0, 0, S - 1, S - 1], fill=cream3)
        quads = (red3, blue3, green3, gold3)
        for qi in range(4):
            qx = (qi % 2) * (S // 2)
            qy = (qi // 2) * (S // 2)
            d.rectangle([qx, qy, qx + S // 2 - 1, qy + S // 2 - 1], fill=quads[qi])
        step = sc * 4
        for y in range(0, S // 2, step):
            for x in range(0, S // 2, step):
                if ((x // step) + (y // step)) % 2:
                    d.rectangle([x, y, x + step - 1, y + step - 1], fill=cream2)
        pts = []
        x = S // 2
        up = True
        while x < S:
            pts.append((x, S // 4 - sc * 2 if up else S // 4 + sc * 2))
            up = not up
            x += sc * 2
        d.line(pts, fill=cream, width=sc)
        for k, y in enumerate(range(S // 2, S, sc * 3)):
            d.line([0, y, S // 2 - 1, y], fill=(gold, red, ink2)[k % 3])
        for x in range(S // 2, S, sc * 3):
            d.line([x, S // 2, x, S - 1], fill=ink3)
    return im


def _jar(d, x, y, s, w, g, ink):
    d.ellipse([x, y + s // 3, x + s, y + s], fill=w, outline=ink, width=max(1, s // 16))
    d.rectangle([x + s // 3, y + s // 6, x + s * 2 // 3, y + s // 3], fill=w, outline=ink, width=max(1, s // 16))
    d.line([x + s // 4, y + s // 2, x + s // 4 + max(1, s // 16), y + s * 4 // 5], fill=g, width=max(1, s // 16))


def _lamp(d, x, y, s, w, g, ink):
    d.ellipse([x, y + s // 2, x + s, y + s * 9 // 10], fill=g, outline=ink, width=max(1, s // 16))
    d.polygon([(x + s * 3 // 4, y + s * 3 // 5), (x + s, y + s // 2), (x + s * 4 // 5, y + s * 4 // 5)], fill=w)
    d.ellipse([x + s // 2 - s // 12, y + s * 3 // 5 - s // 12, x + s // 2 + s // 12, y + s * 3 // 5 + s // 12], fill=ink)


def _brazier(d, x, y, s, w, g, ink):
    d.ellipse([x, y + s // 3, x + s, y + s * 2 // 3], fill=w, outline=ink, width=max(1, s // 16))
    d.rectangle([x + s // 4, y + s // 2, x + s * 3 // 4, y + s * 3 // 5], fill=g)
    d.line([x + s // 5, y + s * 3 // 5, x + s // 5, y + s * 5 // 6], fill=ink, width=max(1, s // 16))
    d.line([x + s * 4 // 5, y + s * 3 // 5, x + s * 4 // 5, y + s * 5 // 6], fill=ink, width=max(1, s // 16))
    d.polygon([(x + s // 2, y + s // 8), (x + s * 3 // 5, y + s // 4), (x + s // 2, y + s // 3), (x + s * 2 // 5, y + s // 4)], fill=g)


def _basket(d, x, y, s, w, g, ink):
    d.ellipse([x + s // 8, y + s // 3, x + s * 7 // 8, y + s * 9 // 10], fill=w, outline=ink, width=max(1, s // 16))
    for yy in range(y + s // 2, y + s * 9 // 10, max(2, s // 10)):
        d.line([x + s // 8, yy, x + s * 7 // 8, yy], fill=g)
    d.arc([x + s // 4, y + s // 8, x + s * 3 // 4, y + s * 2 // 3], 195, 345, fill=ink, width=max(1, s // 16))


def mural_panel(i, S, P):
    """One complete 2x2-cell mural/objects panel (S x S)."""
    sc = max(1, S // 32)
    sandstone = P[0]
    stone1, stone2, stone3, stone4 = P[1], P[2], P[3], P[4]
    blue, blue2, blue3 = P[5], P[6], P[7]
    red, red2, red3 = P[8], P[9], P[10]
    gold, gold2, gold3 = P[11], P[12], P[13]
    ink, ink2, ink3 = P[14], P[15], P[16]
    cream, pale = P[17], P[18]
    green, green2 = P[19], P[20]
    wood, wood2 = P[21], P[22]
    im = Image.new("RGB", (S, S), sandstone)
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(700 + i)
    for _ in range(max(10, S // 2)):
        px = int(rng.integers(0, S))
        py = int(rng.integers(0, S))
        d.point((px, py), fill=stone1 if rng.random() < 0.6 else stone3)
    if i == 0:  # painted frieze with lotus petals
        d.rectangle([0, 0, S - 1, S // 7], fill=blue2)
        d.rectangle([0, S // 7, S - 1, S // 5], fill=gold)
        d.rectangle([0, S - S // 7, S - 1, S - 1], fill=red)
        d.rectangle([0, S - S // 5, S - 1, S - S // 7], fill=gold3)
        for x in range(0, S, S // 4):
            d.polygon([(x + S // 40, S * 5 // 6), (x + S // 8, S // 3), (x + S * 3 // 20, S * 5 // 6)], fill=cream, outline=ink)
            d.line([x + S // 8, S // 3, x + S // 8, S * 5 // 6], fill=red3)
            d.ellipse([x + S // 20, S // 4, x + S * 3 // 20, S * 2 // 5], fill=gold3, outline=ink)
    elif i == 1:  # star ceiling
        d.rectangle([0, 0, S - 1, S - 1], fill=blue)
        d.rectangle([0, 0, S - 1, S // 10], fill=gold3)
        d.rectangle([0, S - S // 10, S - 1, S - 1], fill=gold3)
        for y in range(S // 6, S, S // 4):
            for x in range(S // 8, S, S // 4):
                d.polygon([(x, y - S // 16), (x + S // 32, y), (x, y + S // 16), (x - S // 32, y)], fill=gold2)
                d.point((x, y), fill=cream)
    elif i == 2:  # winged emblem panel
        d.rectangle([0, 0, S - 1, S - 1], fill=stone2)
        d.rectangle([0, 0, S - 1, S // 12], fill=blue3)
        d.rectangle([0, S - S // 12, S - 1, S - 1], fill=red3)
        for k in range(4):
            yy = S // 3 + k * S // 12
            d.line([(S // 8, yy), (S // 2, yy + S // 24), (S * 7 // 8, yy)], fill=blue2, width=sc)
            d.line([(S // 8, yy + sc), (S // 2, yy + S // 24 + sc), (S * 7 // 8, yy + sc)], fill=cream, width=max(1, sc - 1))
        d.ellipse([S * 2 // 5, S * 2 // 5, S * 3 // 5, S * 3 // 5], fill=cream, outline=gold, width=sc * 2)
        d.ellipse([S // 2 - sc * 2, S // 2 - sc * 2, S // 2 + sc * 2, S // 2 + sc * 2], fill=ink)
    else:  # framed object medallions (jar / lamp / brazier / basket)
        draws = (_jar, _lamp, _brazier, _basket)
        for oi in range(4):
            ox = (oi % 2) * (S // 2)
            oy = (oi // 2) * (S // 2)
            d.rectangle([ox + sc, oy + sc, ox + S // 2 - sc, oy + S // 2 - sc], fill=stone3, outline=ink3, width=sc)
            draws[oi](d, ox + S // 8, oy + S // 8, S // 4, wood2, gold2, ink)
    return im


def plant_panel(i, S, P):
    """Painted botanical panels for oasis/bazaar walls (opaque decor, no cutout)."""
    sc = max(1, S // 32)
    greens = P[0:8]
    dark = P[8:12]
    browns = P[12:15]
    sands = P[15:19]
    im = Image.new("RGB", (S, S), sands[1])
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(900 + i)
    for _ in range(max(12, S * S // 28)):
        d.point((int(rng.integers(0, S)), int(rng.integers(0, S))), fill=sands[0] if rng.random() < 0.6 else sands[2])
    if i == 0:  # palm frond
        for k in range(6):
            y = S // 8 + k * S // 8
            d.line([(S // 7, y + S // 10), (S // 2, y - S // 12), (S * 6 // 7, y + S // 10)], fill=greens[k % len(greens)], width=sc * 2)
            d.line([(S // 7, y + S // 10 + sc), (S // 2, y - S // 12 + sc), (S * 6 // 7, y + S // 10 + sc)], fill=dark[k % len(dark)], width=max(1, sc))
        d.line([(S // 2, 0), (S // 2, S)], fill=browns[1], width=sc * 2)
        d.line([(S // 2 + sc, 0), (S // 2 + sc, S)], fill=browns[0], width=max(1, sc))
    elif i == 1:  # reed clump
        for k in range(9):
            x = S // 10 + k * S // 10
            top = S // 5 + (k % 3) * S // 12
            d.line([(x, S), (x + (k % 2) * sc, top)], fill=greens[k % len(greens)], width=sc)
            d.line([(x + sc, S), (x + sc + (k % 2) * sc, top + sc)], fill=dark[k % len(dark)], width=max(1, sc // 2))
            d.ellipse([x - sc, top - sc * 2, x + sc * 2, top + sc], fill=greens[(k + 3) % len(greens)])
        d.rectangle([0, S - sc * 3, S - 1, S - 1], fill=browns[2])
    elif i == 2:  # desert shrubs
        for k in range(5):
            cx = S // 8 + k * S // 5
            cy = S // 2 + (k % 2) * S // 6
            for a in range(7):
                ang = a / 7 * 2 * np.pi
                d.line([(cx, cy), (cx + int(np.cos(ang) * S // 7), cy + int(np.sin(ang) * S // 9))], fill=dark[a % len(dark)], width=sc)
            d.ellipse([cx - S // 10, cy - S // 10, cx + S // 10, cy + S // 10], fill=greens[k % len(greens)])
            d.line([(cx, cy), (cx, S)], fill=browns[1], width=max(1, sc))
    else:  # grass tuft
        for k in range(16):
            x = S // 16 + k * S // 16
            h = S // 3 + (k * 37 % (S // 3))
            d.line([(x, S), (x + (k % 3 - 1) * sc * 2, S - h)], fill=greens[k % len(greens)], width=max(1, sc))
            d.line([(x + sc, S), (x + sc + (k % 3 - 1) * sc * 2, S - h + sc)], fill=dark[k % len(dark)], width=1)
        d.rectangle([0, S - sc * 2, S - 1, S - 1], fill=sands[0])
    return im


def goods_panel(i, S, P):
    """Painted market/tomb goods panels: pottery, baskets, cloth rolls, spice sacks."""
    sc = max(1, S // 32)
    wood = P[0:6]
    clay = P[6:10]
    gold = P[10:14]
    cloth = P[14:17]
    cream = P[17:20]
    im = Image.new("RGB", (S, S), cream[1])
    d = ImageDraw.Draw(im)
    rng = np.random.default_rng(950 + i)
    for _ in range(max(10, S * S // 32)):
        d.point((int(rng.integers(0, S)), int(rng.integers(0, S))), fill=cream[2] if rng.random() < 0.6 else cream[0])
    # shelf line for every panel
    d.rectangle([0, S - sc * 4, S - 1, S - 1], fill=wood[1])
    d.line([0, S - sc * 4, S - 1, S - sc * 4], fill=wood[3], width=sc)
    if i == 0:  # pottery row
        for k in range(3):
            _jar(d, S // 12 + k * S // 3, S // 4, S // 4, clay[k % len(clay)], gold[1], wood[0])
    elif i == 1:  # basket stack
        _basket(d, S // 10, S // 3, S // 3, wood[2], gold[0], wood[0])
        _basket(d, S // 2, S // 5, S // 4, wood[3], gold[1], wood[0])
        d.rectangle([S // 2, S - sc * 5, S * 5 // 6, S - sc * 4], fill=wood[2])
    elif i == 2:  # textile rolls
        for k in range(3):
            y = S // 5 + k * S // 4
            d.rounded_rectangle([S // 8, y, S * 7 // 8, y + S // 8], radius=sc * 2, fill=cloth[k % len(cloth)], outline=cream[0], width=sc)
            d.line([S // 8 + sc, y + sc, S * 7 // 8 - sc, y + sc], fill=cream[0], width=1)
            d.ellipse([S // 8, y, S // 8 + S // 8, y + S // 8], fill=cloth[(k + 1) % len(cloth)])
    else:  # spice sacks and a crate
        d.rectangle([S // 8, S // 2, S // 2, S - sc * 4], fill=wood[2], outline=wood[0], width=sc)
        d.line([S // 8, S // 2 + S // 8, S // 2, S // 2 + S // 8], fill=wood[0], width=sc)
        for k in range(2):
            x = S * 5 // 8 + k * S // 5
            d.ellipse([x, S // 2 + k * S // 10, x + S // 5, S - sc * 4], fill=gold[k * 2], outline=wood[0], width=sc)
            d.line([x + sc * 2, S // 2 + S // 8 + k * S // 10, x + S // 5 - sc * 2, S // 2 + S // 8 + k * S // 10], fill=wood[0], width=1)
    return im


def build_atlas(n, panel_fn, P):
    c = n // ATLAS_CELLS
    panel_size = 2 * c
    atlas = Image.new("RGB", (n, n), P[0])
    for pi in range(4):
        panel = panel_fn(pi, panel_size, P)
        for sy in range(2):
            for sx in range(2):
                cell = panel.crop((sx * c, sy * c, (sx + 1) * c, (sy + 1) * c))
                atlas.paste(cell, ((pi % 2) * 2 * c + sx * c, (pi // 2) * 2 * c + sy * c))
    arr = np.asarray(atlas, dtype=np.uint8)
    flat = arr.reshape(-1, 3).astype(np.int32)
    pal_arr = np.asarray(P, dtype=np.int32)
    dist = ((flat[:, None, :] - pal_arr[None, :, :]) ** 2).sum(axis=-1)
    idx = np.argmin(dist, axis=-1).reshape(n, n)
    return idx.astype(np.int32)


# ---------------------------------------------------------------------------
# registry
# ---------------------------------------------------------------------------

BLOCKS = [
    (72, "sand_fine", "desert", SAND, gen_sand_fine),
    (73, "sand_ripple", "desert", SAND_RIPPLE, gen_sand_ripple),
    (74, "sand_compact", "desert", SAND_COMPACT, gen_sand_compact),
    (75, "sand_gravel", "desert", SAND_GRAVEL, gen_sand_gravel),
    (76, "limestone_dust", "desert", LIMESTONE_DUST, gen_limestone_dust),
    (77, "earth_cracked", "desert", EARTH_CRACKED, gen_earth_cracked),
    (78, "mud_wet", "desert", MUD_WET, gen_mud_wet),
    (79, "asphalt_buried", "desert", ASPHALT_BURIED, gen_asphalt_buried),
    (80, "limestone_shell", "ancient", LIMESTONE_SHELL, gen_limestone_shell),
    (81, "sandstone_block", "ancient", SANDSTONE_BLOCK, gen_sandstone_block),
    (82, "rock_strata", "ancient", ROCK_STRATA, gen_rock_strata),
    (83, "granite_dark", "ancient", GRANITE_DARK, gen_granite_dark),
    (84, "tomb_plaster", "ancient", TOMB_PLASTER, gen_tomb_plaster),
    (85, "relief_fragment", "ancient", RELIEF_FRAGMENT, gen_relief_fragment),
    (86, "stone_soot", "ancient", STONE_SOOT, gen_stone_soot),
    (87, "mudbrick", "bazaar", MUDBRICK, gen_mudbrick),
    (88, "plaster_ochre", "bazaar", PLASTER_OCHRE, gen_plaster_ochre),
    (89, "plaster_white_old", "bazaar", PLASTER_WHITE, gen_plaster_white_old),
    (90, "palm_wood", "bazaar", PALM_WOOD, gen_palm_wood),
    (91, "terracotta", "bazaar", TERRACOTTA, gen_terracotta),
    (92, "basket_weave", "bazaar", BASKET_WEAVE, gen_basket_weave),
    (93, "metal_faded", "bazaar", METAL_FADED, gen_metal_faded),
    (94, "palm_bark", "oasis", PALM_BARK, gen_palm_bark),
    (95, "palm_leaf", "oasis", PALM_LEAF, gen_palm_leaf),
    (96, "reed_grass", "oasis", REED_GRASS, gen_reed_grass),
    (97, "oasis_soil", "oasis", OASIS_SOIL, gen_oasis_soil),
    (98, "water_shallow", "oasis", WATER_SHALLOW, gen_water_shallow),
    (99, "enamel_sun", "service", ENAMEL_SUN, gen_enamel_sun),
    (100, "pavement_oil", "service", PAVEMENT_OIL, gen_pavement_oil),
    (101, "rubber_worn", "service", RUBBER_WORN, gen_rubber_worn),
    (102, "sand_ultrafine", "desert", SAND_ULTRAFINE, gen_sand_ultrafine),
    (103, "sand_ripple_soft", "desert", SAND_RIPPLE_SOFT, gen_sand_ripple_soft),
    (104, "sand_compact_dark", "desert", SAND_COMPACT_DARK, gen_sand_compact),
    (105, "sand_damp", "desert", SAND_DAMP, gen_sand_damp),
    (106, "sandstone_fine", "ancient", SANDSTONE_FINE, gen_sandstone_fine),
    (107, "limestone_pale", "ancient", LIMESTONE_PALE, gen_limestone_pale),
    (108, "limestone_weathered", "ancient", LIMESTONE_WEATHERED, gen_limestone_weathered),
    (109, "rock_strata_pale", "ancient", ROCK_STRATA_PALE, gen_rock_strata),
    (110, "mudbrick_pale", "bazaar", MUDBRICK_PALE, gen_mudbrick),
    (111, "mudbrick_dark", "bazaar", MUDBRICK_DARK, gen_mudbrick),
    (112, "plaster_ochre_worn", "bazaar", PLASTER_OCHRE_WORN, gen_plaster_ochre),
    (113, "plaster_white_clean", "bazaar", PLASTER_WHITE_CLEAN, gen_plaster_white_old),
    (114, "palm_wood_old", "bazaar", PALM_WOOD_OLD, gen_palm_wood),
    (115, "terracotta_pale", "bazaar", TERRACOTTA_PALE, gen_terracotta),
    (116, "oasis_grass", "oasis", OASIS_GRASS, gen_oasis_grass),
    (117, "oasis_mud", "oasis", OASIS_MUD, gen_oasis_soil),
    (118, "reed_dry", "oasis", REED_DRY, gen_reed_grass),
    (119, "asphalt_clean", "service", ASPHALT_CLEAN, gen_asphalt_clean),
    (120, "pavement_plain", "service", PAVEMENT_PLAIN, gen_pavement_plain),
    (121, "enamel_worn", "service", ENAMEL_WORN, gen_enamel_sun),
]

ATLASES = [
    ("atlas_cloth_signs", "atlas", CLOTH_PAL, cloth_panel),
    ("atlas_murals_objects", "atlas", MURAL_PAL, mural_panel),
    ("atlas_plants", "atlas", PLANT_PAL, plant_panel),
    ("atlas_market_goods", "atlas", GOODS_PAL, goods_panel),
]

PALETTES = {name: P for _, name, _, P, _ in BLOCKS}
PALETTES.update({name: P for name, _, P, _ in ATLASES})
GENERATORS = {name: fn for _, name, _, _, fn in BLOCKS}
ATLAS_GENERATORS = {name: fn for name, _, _, fn in ATLASES}


def _style_for(family: str, n: int):
    """Contrast/noise budget per family and tier. The 32/64 tiers are calmer than
    128 on purpose: a 1 m voxel face repeats hundreds of times, so tile-scale
    brightness patches and per-pixel noise read as obvious repaint."""
    low_budget, low_colors, high_budget, high_colors, flatten_low, flatten_high, smooth_low, smooth_high = FAMILY_STYLE[family]
    if n <= 32:
        return low_budget - 1, low_colors, flatten_low, min(0.55, smooth_low * 1.25)
    if n <= 64:
        return low_budget, low_colors, flatten_low * 0.85, smooth_low
    return high_budget, high_colors, flatten_high, smooth_high


FAMILY_STYLE = {
    # family:      low rgb, low colors, high rgb, high colors, flatten32, flatten128, smooth32, smooth128
    "desert": (12, 13, 17, 15, 0.95, 0.55, 0.34, 0.10),
    "ancient": (14, 14, 19, 17, 0.80, 0.48, 0.18, 0.06),
    "bazaar": (14, 14, 19, 17, 0.78, 0.48, 0.20, 0.06),
    "oasis": (14, 15, 19, 18, 0.78, 0.48, 0.22, 0.06),
    "service": (15, 14, 20, 18, 0.75, 0.45, 0.20, 0.06),
}


def calm(rgb: np.ndarray, budget: float, colors: int, flatten: float, smooth: float) -> np.ndarray:
    """Flatten tile-scale brightness patches, denoise a little, cap the channel
    deviation to +-budget RGB and reduce to `colors` flat pixel-art colours."""
    n = rgb.shape[0]
    a = rgb.astype(np.float64)
    mean = a.reshape(-1, 3).mean(axis=0)
    small = Image.fromarray(rgb).resize((4, 4), Image.BOX)
    low = np.asarray(small.resize((n, n), Image.BILINEAR), dtype=np.float64)
    a = a - flatten * (low - mean)
    if smooth > 0:
        base = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
        med = np.asarray(base.filter(ImageFilter.MedianFilter(3)), dtype=np.float64)
        a = a * (1.0 - smooth) + med * smooth
    dev = a - mean
    peak = float(np.max(np.abs(dev)))
    if peak > budget:
        dev *= budget / peak
    a = np.clip(mean + dev, 0, 255)
    quant = Image.fromarray(a.round().astype(np.uint8)).quantize(colors=colors, method=Image.MEDIANCUT, dither=Image.NONE)
    out = np.asarray(quant.convert("RGB"), dtype=np.uint8)
    d2 = out.astype(np.float64) - mean
    peak2 = float(np.max(np.abs(d2)))
    if peak2 > budget:
        out = np.clip(mean + d2 * (budget / peak2), 0, 255).round().astype(np.uint8)
    return out


FAMILY_OF = {name: family for _, name, family, _, _ in BLOCKS}


def render(name: str, n: int) -> np.ndarray:
    seed = zlib.crc32(name.encode("utf-8")) & 0x7FFFFFFF
    if name in GENERATORS:
        idx = GENERATORS[name](n, PALETTES[name], seed)
        rgb = to_rgb(name, idx)
        budget, colors, flatten, smooth = _style_for(FAMILY_OF[name], n)
        return calm(rgb, budget, colors, flatten, smooth)
    idx = build_atlas(n, ATLAS_GENERATORS[name], PALETTES[name])
    return np.asarray(to_rgb(name, idx), dtype=np.uint8)


def to_rgb(name: str, idx: np.ndarray) -> np.ndarray:
    P = np.asarray(PALETTES[name], dtype=np.uint8)
    return P[np.clip(idx, 0, len(P) - 1)]


# ---------------------------------------------------------------------------
# quality metrics and contact sheets
# ---------------------------------------------------------------------------


def colour_set(rgb: np.ndarray):
    flat = rgb.reshape(-1, 3)
    return {tuple(int(v) for v in c) for c in np.unique(flat, axis=0)}


def seam_metrics(rgb: np.ndarray):
    """A seam is only a defect when the wrap step is an outlier against the
    texture's own strongest internal gradients. Comparing against the 99th
    percentile of interior gradients keeps structural lines that legitimately
    straddle the tile border (mortar courses, weave strands) from false-alarming.
    """
    a = rgb.astype(np.int16)
    h, w = rgb.shape[:2]
    wrap = (np.abs(a[:, 0] - a[:, -1]).mean() + np.abs(a[0, :] - a[-1, :]).mean()) / 2
    grads = np.concatenate(
        [np.abs(np.diff(a, axis=1)).ravel(), np.abs(np.diff(a, axis=0)).ravel()]
    )
    p99 = float(np.quantile(grads, 0.99))
    mean_grad = float(grads.mean())
    off = np.roll(np.roll(rgb, w // 2, axis=1), h // 2, axis=0).astype(np.int16)
    owrap = (np.abs(off[:, 0] - off[:, -1]).mean() + np.abs(off[0, :] - off[-1, :]).mean()) / 2
    return {
        "wrapDelta": round(float(wrap), 3),
        "neighborDelta": round(mean_grad, 3),
        "neighborP99": round(p99, 3),
        "wrapRatio": round(float(wrap / max(p99, 1.0)), 3),
        "offsetWrapDelta": round(float(owrap), 3),
        "offsetWrapRatio": round(float(owrap / max(p99, 1.0)), 3),
    }


def png_bytes(rgb: np.ndarray) -> bytes:
    import io

    im = Image.fromarray(rgb.astype(np.uint8), mode="RGB")
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def upscale(img: Image.Image, factor: int):
    return img.resize((img.width * factor, img.height * factor), Image.NEAREST)


def make_checks(name: str, rgb: np.ndarray, tier: int, factor: int):
    im = Image.fromarray(rgb, mode="RGB")
    tile = upscale(im, factor)
    big = Image.new("RGB", (tile.width * 2, tile.height * 2))
    for oy in range(2):
        for ox in range(2):
            big.paste(tile, (ox * tile.width, oy * tile.height))
    (DOCS / "tiles").mkdir(parents=True, exist_ok=True)
    big.save(DOCS / "tiles" / f"{name}_{tier}_2x2.png")

    shifted = np.roll(np.roll(rgb, rgb.shape[1] // 2, axis=1), rgb.shape[0] // 2, axis=0)
    sim = Image.fromarray(shifted, mode="RGB")
    stile = upscale(sim, factor)
    sbig = Image.new("RGB", (stile.width * 2, stile.height * 2))
    for oy in range(2):
        for ox in range(2):
            sbig.paste(stile, (ox * stile.width, oy * stile.height))
    (DOCS / "seams").mkdir(parents=True, exist_ok=True)
    sbig.save(DOCS / "seams" / f"{name}_{tier}_offset50.png")


def contact_sheet(records, tier: int, factor: int, path: Path):
    cols = 8
    cell = 128
    label_h = 16
    gap = 8
    rows = (len(records) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cell + gap) + gap, rows * (cell + label_h + gap) + gap), (26, 24, 22))
    d = ImageDraw.Draw(sheet)
    font = None
    for candidate in (
        "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        try:
            font = ImageFont.truetype(candidate, 11)
            break
        except Exception:
            continue
    if font is None:
        font = ImageFont.load_default()
    for i, rec in enumerate(records):
        x = gap + (i % cols) * (cell + gap)
        y = gap + (i // cols) * (cell + label_h + gap)
        im = Image.fromarray(rec["rgb"], mode="RGB").resize((cell, cell), Image.NEAREST)
        sheet.paste(im, (x, y))
        d.text((x, y + cell + 2), f"{rec['id'] if rec['id'] else ''} {rec['name']}", fill=(232, 226, 210), font=font)
    sheet.save(path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()

    for tier in TIERS:
        (OUT / str(tier)).mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)
    (DOCS / "tiles").mkdir(exist_ok=True)
    (DOCS / "seams").mkdir(exist_ok=True)

    records = []
    rendered = {}
    for mat_id, name, family, P, _ in BLOCKS:
        entry = {"id": mat_id, "name": name, "family": family}
        records.append(entry)
    for name, family, P, _ in ATLASES:
        entry = {"id": 0, "name": name, "family": family, "atlas": True}
        records.append(entry)

    all_ok = True
    sheet_records = {32: [], 64: [], 128: []}
    for rec in records:
        name = rec["name"]
        tiers = {}
        for tier in TIERS:
            rgb = render(name, tier)
            tiers[tier] = rgb
            rendered[(name, tier)] = rgb
            data = png_bytes(rgb)
            target = OUT / str(tier) / f"{name}.png"
            if args.check:
                if not target.exists() or target.read_bytes() != data:
                    print(f"CHECK FAIL {target}")
                    all_ok = False
            else:
                target.write_bytes(data)
            sheet_records[tier].append({"id": rec.get("id", 0), "name": name, "rgb": rgb})
        # seam / tiling evidence at both shipped mid and max tiers
        make_checks(name, tiers[32], 32, 4)
        make_checks(name, tiers[64], 64, 2)
        make_checks(name, tiers[128], 128, 2)
        used = sorted(colour_set(tiers[128]))
        metrics = seam_metrics(tiers[128])
        if len(used) < 12 or len(used) > 24:
            print(f"PALETTE WARN {name}: {len(used)} colours")
            all_ok = False
        if not rec.get("atlas") and (metrics["wrapRatio"] > 1.15 or metrics["offsetWrapRatio"] > 1.15):
            print(f"SEAM WARN {name}: {metrics}")
            all_ok = False
        rec["palette"] = [v for c in used for v in c]
        rec["paletteColors"] = len(used)
        rec["average"] = [int(round(v)) for v in np.asarray(tiers[128]).reshape(-1, 3).mean(axis=0)]
        rec["nativeGrid"] = 32
        rec["files"] = {str(t): f"/textures/pharaoh-v1/{t}/{name}.png" for t in TIERS}
        rec["source"] = f"tools/maps/pharaoh-textures.py#{name}"
        rec["masterSha256"] = hashlib.sha256(png_bytes(tiers[128])).hexdigest()
        rec["seam"] = metrics
        rec["detailVs32"] = {
            "64": round(float(np.abs(tiers[64].astype(np.int16) - np.repeat(np.repeat(tiers[32], 2, 0), 2, 1).astype(np.int16)).mean()), 3),
            "128": round(float(np.abs(tiers[128].astype(np.int16) - np.repeat(np.repeat(tiers[32], 4, 0), 4, 1).astype(np.int16)).mean()), 3),
        }
        if rec.get("atlas"):
            rec["atlas"] = True
        print(
            f"{name:22s} col={rec['paletteColors']:2d} mean={tuple(rec['average'])} "
            f"seam={metrics['wrapRatio']:.2f}/{metrics['offsetWrapRatio']:.2f} "
            f"tierdiff={rec['detailVs32']['64']:.1f}/{rec['detailVs32']['128']:.1f}"
        )

    manifest = {
        "version": 1,
        "generator": "tools/maps/pharaoh-textures.py (procedural periodic pixel-art, deterministic)",
        "nativeGrid": 32,
        "tiers": list(TIERS),
        "textures": records,
    }
    manifest_path = OUT / "manifest.json"
    body = json.dumps(manifest, indent=1, ensure_ascii=False, sort_keys=False) + "\n"
    if args.check:
        if not manifest_path.exists() or manifest_path.read_text() != body:
            print("CHECK FAIL manifest.json")
            all_ok = False
    else:
        manifest_path.write_text(body)

    for tier in TIERS:
        factor = {32: 4, 64: 2, 128: 1}[tier]
        contact_sheet(sheet_records[tier], tier, factor, DOCS / f"contact_sheet_{tier}.png")
    contact_sheet(sheet_records[128], 128, 1, DOCS / "contact_sheet.png")

    print(f"done: {len(records)} patterns, {len(records) * len(TIERS)} PNGs, ok={all_ok}")
    return 0 if all_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
