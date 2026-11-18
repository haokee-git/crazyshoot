#!/usr/bin/env python3
"""CRAZYSHOOT · miao-v1 material pack generator.

Original, procedural, deterministic. No photo sampling, no downloads, no CDN.
Every block material is authored on a toroidal 32 px grid (the 32 tier is the
native pixel-art tier); 64 and 128 are generated natively at those resolutions
with proportionally finer grain so they are not upscales.

Outputs
  public/textures/miao-v1/{32,64,128}/<name>.png      32 block finishes + 4 atlases
  public/textures/miao-v1/manifest.json               records (palette / average / hash / seam)
  docs/map-miao-village/materials/*.png               tiling + seam + contact sheets
  docs/map-miao-village/materials/README.md           method + palette notes

Usage
  python3 tools/maps/miao-village-textures.py
  python3 tools/maps/miao-village-textures.py --check
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public" / "textures" / "miao-v1"
DOCS = ROOT / "docs" / "map-miao-village" / "materials"
TIERS = (32, 64, 128)
ATLAS_CELLS = 4
FONT = "/System/Library/Fonts/STHeiti Medium.ttc"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------
def hx(s: str):
    s = s.lstrip("#")
    return [int(s[i:i + 2], 16) for i in (0, 2, 4)]


def periodic_noise(n: int, cells: int, seed: int, octaves: int = 3, gain: float = 0.5):
    """Wrapping value noise; always seamless on both axes."""
    total = np.zeros((n, n), dtype=np.float64)
    amp = 1.0
    norm = 0.0
    for o in range(octaves):
        c = max(2, int(round(cells * (2 ** o))))
        lat = np.random.default_rng(seed + o * 101).random((c, c))
        xs = (np.arange(n) + 0.5) / n * c
        ys = (np.arange(n) + 0.5) / n * c
        x0 = np.floor(xs).astype(int)
        y0 = np.floor(ys).astype(int)
        fx = xs - x0
        fy = ys - y0
        fx = fx * fx * (3 - 2 * fx)
        fy = fy * fy * (3 - 2 * fy)
        x1 = (x0 + 1) % c
        y1 = (y0 + 1) % c
        v00 = lat[np.ix_(y0 % c, x0 % c)]
        v10 = lat[np.ix_(y0 % c, x1)]
        v01 = lat[np.ix_(y1, x0 % c)]
        v11 = lat[np.ix_(y1, x1)]
        v = (v00 * (1 - fx) + v10 * fx) * (1 - fy) + (v01 * (1 - fx) + v11 * fx) * fy
        total += v * amp
        norm += amp
        amp *= gain
    return total / norm


def fbm(n: int, cells: int, seed: int, octaves: int = 3):
    return periodic_noise(n, cells, seed, octaves)


def smooth(a, b, v):
    t = np.clip((v - a) / (b - a + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def idx_from(field: np.ndarray, palette_len: int) -> np.ndarray:
    # No random per-pixel dither: it would break the toroidal seam. Ordered
    # quantization alone keeps the pattern periodic on every edge.
    f = (field - field.min()) / (field.max() - field.min() + 1e-9)
    return np.clip((f * (palette_len - 1e-6)).astype(int), 0, palette_len - 1)


def to_rgb(idx: np.ndarray, palette) -> np.ndarray:
    p = np.asarray([hx(c) for c in palette], dtype=np.uint8)
    return p[idx]


def uv(n: int):
    u = (np.arange(n) + 0.5) / n
    return np.meshgrid(u, u)


def wrap_line(y: np.ndarray, n: int, width: float):
    """Periodic line mask at fractional coordinate y."""
    d = np.abs(((y + 0.5) % 1) - 0.5) * n
    return d < width


def grain(n: int, seed: int, freq: int, vertical: bool = True, warp: float = 0.12):
    u, v = uv(n)
    noise = fbm(n, 4, seed, 4)
    t = (v if vertical else u) * freq + noise * warp * freq
    g = np.sin(t * np.pi * 2)
    return g


def strokes(n: int, seed: int, count: int, length: float, thickness: float):
    rng = np.random.default_rng(seed)
    out = np.zeros((n, n), dtype=np.float64)
    for _ in range(count):
        x = rng.uniform(0, n)
        y = rng.uniform(0, n)
        dx = rng.uniform(-thickness, thickness) * 0.2
        dy = rng.uniform(0.4, 1.0) * length * (n / 64)
        steps = max(2, int(dy * 2))
        for i in range(steps):
            yy = int((y + dy * i / steps) % n)
            xx = int((x + dx * i) % n)
            out[yy % n, xx % n] = max(out[yy % n, xx % n], 0.65 + 0.35 * (i / steps))
    return out


def masonry(n: int, seed: int, rows: int, cols: int, mortar: float):
    rng = np.random.default_rng(seed)
    u, v = uv(n)
    out = np.zeros((n, n), dtype=np.float64)
    rh = 1.0 / rows
    cw = 1.0 / cols
    for r in range(rows):
        off = (0.5 if r % 2 else 0.0) * cw
        for c in range(cols + 1):
            x0 = (c * cw + off) % 1.0
            x1 = x0 + cw
            y0 = r * rh
            y1 = y0 + rh
            if y0 <= v[0, 0] < y1:
                pass
            # horizontal span with wrap
            dx = ((u - x0) % 1.0)
            inside = (dx < cw) & (v >= y0) & (v < y1)
            if np.any(inside):
                edge = np.minimum(np.minimum(dx, cw - dx) * n, np.minimum((v - y0) / rh, (y1 - v) / rh) * n * rows / max(1, rows))
                tone = 0.45 + 0.35 * rng.random() + 0.22 * fbm(n, 5, seed + r * 13 + c, 3)
                out = np.where(inside, np.where(edge > mortar, tone, 0.0), out)
    return out


def cobbles(n: int, seed: int, cells: int):
    rng = np.random.default_rng(seed)
    pts = rng.random((cells * cells, 3))
    pts[:, 0] *= n
    pts[:, 1] *= n
    u, v = uv(n)
    u = u * n
    v = v * n
    d = np.full((n, n), 1e9)
    tone = np.zeros((n, n))
    for px, py, t in pts:
        dx = np.abs(u - px)
        dx = np.minimum(dx, n - dx)
        dy = np.abs(v - py)
        dy = np.minimum(dy, n - dy)
        dd = dx * dx + dy * dy
        m = dd < d
        d = np.where(m, dd, d)
        tone = np.where(m, t, tone)
    return 0.35 + tone * 0.45 + 0.25 * np.sqrt(d) / (n / cells * 0.5)


def weave(n: int, seed: int, freq: int, cross: bool = True):
    u, v = uv(n)
    a = np.sin(u * freq * np.pi * 2)
    b = np.sin(v * freq * np.pi * 2)
    w = a * 0.6 + b * 0.4 if cross else a
    return 0.5 + 0.5 * w * 0.5 + 0.2 * fbm(n, 6, seed, 2)


def leaves(n: int, seed: int, cells: int, scale: float = 1.0):
    u, v = uv(n)
    f = fbm(n, cells, seed, 4)
    g = fbm(n, cells * 2, seed + 17, 3)
    m = smooth(0.45, 0.72, f + 0.22 * g)
    vein = np.abs(np.sin((u + 0.25 * g) * np.pi * 2 * max(1, int(round(7 * scale))))) * 0.12
    return np.clip(m - vein + 0.25, 0, 1.2)


def water(n: int, seed: int):
    u, v = uv(n)
    waves = (
        np.sin((u * 3 + v * 1.2) * np.pi * 2 + 0.6) * 0.22
        + np.sin((u * -1.4 + v * 2.1) * np.pi * 2 + 1.9) * 0.18
        + np.sin((u * 5 + v * 3.4) * np.pi * 2 + 3.4) * 0.10
    )
    return 0.45 + waves + 0.12 * fbm(n, 6, seed, 3)


# ---------------------------------------------------------------------------
# block material definitions
# ---------------------------------------------------------------------------
BLOCKS = [
    # id, name, family, palette, generator, params
    (122, "fir_dark_oiled", "wood", ["#2b1b10", "#3b2617", "#4d321f", "#5d3d25", "#6c482c", "#7b5533", "#8d6540", "#a0744b"],
     "wood", {"seed": 122, "freq": 7, "vertical": True, "warp": .18, "oil": .86}),
    (123, "fir_honey_worn", "wood", ["#4a2e1b", "#5b3a22", "#6d472a", "#7f5533", "#91633c", "#a37346", "#b28252", "#bf9060"],
     "wood", {"seed": 123, "freq": 6, "vertical": True, "warp": .2, "oil": 1.0}),
    (124, "fir_grey_weathered", "wood", ["#272621", "#32302a", "#3d3b33", "#48463c", "#535146", "#5e5c50", "#69675a", "#757264"],
     "wood", {"seed": 124, "freq": 5, "vertical": True, "warp": .24, "oil": .94}),
    (125, "wood_plank_floor", "wood", ["#2a1c13", "#3a281b", "#4b3322", "#5b3f29", "#6c4b31", "#7d593a", "#8f6846", "#9e7652"],
     "plank", {"seed": 125, "planks": 5}),
    (126, "wood_lattice", "wood", ["#1b130d", "#2a1e14", "#3b2a1b", "#4c3723", "#5e452c", "#725437", "#8a6845", "#a37d54"],
     "lattice", {"seed": 126, "cells": 4}),
    (127, "tile_blue_grey", "tile", ["#252b2c", "#333b3c", "#424c4d", "#525d5e", "#657071", "#7a8585", "#8f9998", "#a3acab"],
     "tile", {"seed": 127, "rows": 4, "cols": 5, "moss": .0}),
    (128, "tile_grey_weathered", "tile", ["#2d2e2b", "#3d3f3a", "#4e5049", "#606259", "#737568", "#87897a", "#9b9d8c", "#adb09e"],
     "tile", {"seed": 128, "rows": 4, "cols": 5, "moss": .12}),
    (129, "tile_moss_edges", "tile", ["#2b3028", "#3b4236", "#4b5343", "#5c6551", "#6d765f", "#7f886d", "#929a7b", "#a5ac89"],
     "tile", {"seed": 129, "rows": 4, "cols": 5, "moss": .42}),
    (130, "stone_rubble_wall", "stone", ["#171815", "#21231e", "#2c2f28", "#373a31", "#43463b", "#4f5245", "#5c5f50", "#696c5b"],
     "rubble", {"seed": 130}),
    (131, "stone_cut_grey", "stone", ["#1b1d1b", "#252825", "#303430", "#3c413c", "#494e47", "#565c53", "#646b5f", "#737a6d"],
     "masonry", {"seed": 131, "rows": 4, "cols": 3, "mortar": .7}),
    (132, "paving_bluestone", "stone", ["#1a2022", "#242b2d", "#2f3739", "#3a4446", "#465153", "#536062", "#616e70", "#718082"],
     "flagstone", {"seed": 132, "rows": 3, "cols": 3}),
    (133, "paving_cobble", "stone", ["#20211e", "#2b2d29", "#373a34", "#44473f", "#51554b", "#5f6458", "#6d7365", "#7c8373"],
     "cobble", {"seed": 133, "cells": 6}),
    (134, "paving_wet", "stone", ["#171d1f", "#20282a", "#2a3335", "#343e40", "#3f494b", "#4a5557", "#566162", "#626e6f"],
     "wet", {"seed": 134}),
    (135, "water_jade_river", "water", ["#1d3432", "#233f3c", "#294b47", "#305752", "#37645d", "#3f7168", "#487e74", "#558b80"],
     "water", {"seed": 135}),
    (136, "earth_compacted", "earth", ["#3f3023", "#503d2c", "#624c36", "#745a40", "#86684b", "#987756", "#aa8763", "#ba9671"],
     "earth", {"seed": 136, "cells": 5}),
    (137, "mud_paddy", "earth", ["#32291f", "#433628", "#544432", "#65533c", "#766246", "#877151", "#98805d", "#a98f6a"],
     "mud", {"seed": 137}),
    (138, "grass_mountain", "vegetation", ["#26331f", "#324229", "#3e5232", "#4b613b", "#587045", "#667f50", "#758e5c", "#849d69"],
     "grass", {"seed": 138, "density": 1.0}),
    (139, "rice_young", "vegetation", ["#345a26", "#3f6b2d", "#4b7d35", "#588f3e", "#66a147", "#75b252", "#86c260", "#9ad174"],
     "rice", {"seed": 139, "gold": False}),
    (140, "rice_gold", "vegetation", ["#5c5420", "#6f6428", "#827431", "#95853a", "#a89745", "#baa952", "#ccbb62", "#dccd77"],
     "rice", {"seed": 140, "gold": True}),
    (141, "vegetable_dark", "vegetation", ["#22301d", "#2d3f26", "#394e2f", "#455d38", "#526c42", "#607b4d", "#6e8a59", "#7d9a66"],
     "veg", {"seed": 141}),
    (142, "bamboo_leaf", "vegetation", ["#24351f", "#2f4427", "#3b542f", "#486438", "#567443", "#64854e", "#72965a", "#81a668"],
     "leaves", {"seed": 142, "cells": 4, "scale": 1.5}),
    (143, "bamboo_culm", "vegetation", ["#5b5b2f", "#6c6c38", "#7d7d42", "#8e8e4d", "#9f9f58", "#b0b064", "#c1c172", "#d2d282"],
     "culm", {"seed": 143}),
    (144, "foliage_maple", "vegetation", ["#3d2416", "#552f1b", "#6d3a20", "#854726", "#9d552d", "#b66637", "#c97844", "#d98e58"],
     "leaves", {"seed": 144, "cells": 5, "scale": 1.1}),
    (145, "foliage_camphor", "vegetation", ["#1f3320", "#294327", "#34532f", "#406338", "#4d7342", "#5b834d", "#6a9359", "#7aa366"],
     "leaves", {"seed": 145, "cells": 4, "scale": 1.3}),
    (146, "reed_river", "vegetation", ["#4c4a2c", "#5f5c35", "#726e40", "#85804b", "#989257", "#aba264", "#bcb374", "#ccc486"],
     "reeds", {"seed": 146}),
    (147, "straw_thatch", "straw", ["#4f3f23", "#63502c", "#776136", "#8b7341", "#9f854e", "#b3975c", "#c7aa6c", "#d9bd7e"],
     "thatch", {"seed": 147}),
    (148, "brick_grey_old", "masonry", ["#38342f", "#4a453e", "#5c564d", "#6e675c", "#80786c", "#928a7d", "#a49b8d", "#b4ab9c"],
     "brick", {"seed": 148}),
    (149, "plaster_lime_worn", "masonry", ["#6e6a5d", "#807c6e", "#928e7f", "#a4a090", "#b6b2a1", "#c8c4b2", "#d9d5c3", "#e8e4d2"],
     "plaster", {"seed": 149}),
    (150, "bamboo_wicker", "craft", ["#4b3a22", "#5e4a2b", "#715a35", "#846b40", "#977c4b", "#aa8d57", "#bd9e64", "#cfaf73"],
     "wicker", {"seed": 150}),
    (151, "ceramic_brown", "craft", ["#3f2519", "#523021", "#653c29", "#784832", "#8b553b", "#9e6245", "#b06f4f", "#c27d5a"],
     "ceramic", {"seed": 151}),
    (152, "cloth_indigo", "cloth", ["#1a2534", "#223247", "#2b405b", "#354e6f", "#405d83", "#4d6d96", "#5b7da9", "#6c8fbb"],
     "cloth", {"seed": 152, "warp": 8}),
    (153, "cloth_madder", "cloth", ["#4a1e22", "#5e262b", "#722f35", "#863940", "#9a444b", "#ae5056", "#c05d63", "#cf6d72"],
     "cloth", {"seed": 153, "warp": 8}),
]

ATLASES = [
    ("miao_atlas_signs", "signs", 161),
    ("miao_atlas_market", "market", 162),
    ("miao_atlas_textile", "textile", 163),
    ("miao_atlas_festival", "festival", 164),
]

SIGN_NAMES = ["苗绣", "蜡染", "银饰", "酸汤", "竹编", "米酒", "客栈", "糍粑", "腊肉", "茶叶", "药材", "茶舍", "绣坊", "酒坊", "布庄", "油坊"]


# ---------------------------------------------------------------------------
# block generators
# ---------------------------------------------------------------------------
def gen(family, n, P, p):
    u, v = uv(n)
    if family == "wood":
        g = grain(n, p["seed"], p["freq"] * n // 32, p["vertical"], p["warp"])
        f = fbm(n, 5, p["seed"] + 3, 3)
        idx = idx_from(g * .7 + f * .3 + .1, len(P))
        if p.get("oil", 1) < 1:
            idx = (idx * p["oil"]).astype(int)
        return idx
    if family == "plank":
        planks = p["planks"]
        band = np.floor(v * planks)
        seam = wrap_line(v * planks, n, 1.0)
        tone = np.random.default_rng(p["seed"]).random(planks)
        base = tone[band.astype(int) % planks]
        g = grain(n, p["seed"], 18 * n // 32, True, .1)
        f = fbm(n, 6, p["seed"] + 4, 3)
        idx = idx_from(base * .5 + g * .25 + f * .25, len(P))
        idx[seam] = 0
        return idx
    if family == "lattice":
        cell = p["cells"]
        a = np.abs(((u * cell) % 1) - 0.5)
        b = np.abs(((v * cell) % 1) - 0.5)
        line = (a > 0.40) | (b > 0.40)
        diag = np.abs(((u + v) * cell * 2) % 1 - 0.5) < 0.12
        f = fbm(n, 6, p["seed"], 2)
        idx = idx_from(f * .4 + .2, len(P))
        idx[line] = len(P) - 1
        idx[diag & ~line] = max(0, len(P) - 3)
        return idx
    if family == "tile":
        rows, cols = p["rows"], p["cols"]
        row = np.floor(v * rows)
        off = (row % 2) * 0.5
        col = np.floor(((u + off / cols) * cols))
        tile = ((row * 7 + col * 13) % 5) / 5.0
        mortar = wrap_line(v * rows, n, 1.0) | wrap_line((u + off / cols) * cols, n, 1.0)
        f = fbm(n, 6, p["seed"] + row.astype(int) * 3, 3)
        idx = idx_from(tile * .55 + f * .45, len(P))
        idx[mortar] = 0
        if p["moss"] > 0:
            moss = fbm(n, 9, p["seed"] + 33, 3) > (1.02 - p["moss"])
            idx[moss] = min(len(P) - 1, 2)
        return idx
    if family == "rubble":
        f = fbm(n, 5, p["seed"], 4)
        g = cobbles(n, p["seed"] + 5, 5)
        crack = np.abs(np.sin((u * 6 + v * 3 + f * 0.8) * np.pi * 2)) < 0.045
        idx = idx_from(f * .35 + g * .65, len(P))
        idx[crack] = 0
        return idx
    if family == "masonry":
        return idx_from(masonry(n, p["seed"], p["rows"], p["cols"], p["mortar"]), len(P))
    if family == "flagstone":
        m = masonry(n, p["seed"], p["rows"], p["cols"], .55)
        f = fbm(n, 7, p["seed"] + 1, 3)
        idx = idx_from(m * .7 + f * .3, len(P))
        return idx
    if family == "cobble":
        return idx_from(cobbles(n, p["seed"], p["cells"]), len(P))
    if family == "wet":
        f = fbm(n, 6, p["seed"], 4)
        stone = masonry(n, p["seed"] + 9, 3, 3, .8)
        idx = idx_from(stone * .55 + f * .45, len(P))
        return idx
    if family == "water":
        w = water(n, p["seed"])
        f = fbm(n, 7, p["seed"] + 2, 2)
        return idx_from(w * .75 + f * .25, len(P))
    if family == "earth":
        f = fbm(n, 5, p["seed"], 4)
        s = fbm(n, 11, p["seed"] + 8, 2)
        return idx_from(f * .8 + s * .2, len(P))
    if family == "mud":
        f = fbm(n, 4, p["seed"], 3)
        wet = fbm(n, 8, p["seed"] + 5, 3)
        return idx_from(f * .65 + wet * .35, len(P))
    if family == "grass":
        f = fbm(n, 6, p["seed"], 4)
        s = strokes(n, p["seed"] + 1, int(120 * p["density"] * n / 64), 3.0, .8)
        return idx_from(f * .6 + s * .4, len(P))
    if family == "rice":
        f = fbm(n, 5, p["seed"], 3)
        row = np.abs(np.sin(v * np.pi * 2 * 5 + f * 2)) < .22
        s = strokes(n, p["seed"] + 2, 140, 3.4, .7)
        idx = idx_from(f * .35 + s * .35 + row * .3, len(P))
        if p["gold"]:
            idx = np.clip(idx + 1, 0, len(P) - 1)
        return idx
    if family == "veg":
        f = fbm(n, 5, p["seed"], 3)
        row = np.abs(np.sin(u * np.pi * 2 * 4 + f)) < .25
        return idx_from(f * .55 + row * .45, len(P))
    if family == "leaves":
        l = leaves(n, p["seed"], p["cells"], p["scale"])
        s = fbm(n, 9, p["seed"] + 11, 2)
        return idx_from(l * .8 + s * .2, len(P))
    if family == "culm":
        seg = np.abs(np.sin(v * np.pi * 2 * 4 + fbm(n, 4, p["seed"], 2) * 1.5)) < .12
        g = grain(n, p["seed"], 10, True, .05)
        idx = idx_from(g * .5 + .5, len(P))
        idx[seg] = 0
        return idx
    if family == "reeds":
        s = strokes(n, p["seed"], 90, 5.0, .6)
        f = fbm(n, 5, p["seed"] + 1, 3)
        return idx_from(s * .7 + f * .3, len(P))
    if family == "thatch":
        s = strokes(n, p["seed"], 130, 4.0, .8)
        f = fbm(n, 7, p["seed"] + 1, 2)
        return idx_from(s * .65 + f * .35, len(P))
    if family == "brick":
        m = masonry(n, p["seed"], 5, 2, .7)
        f = fbm(n, 6, p["seed"] + 1, 2)
        return idx_from(m * .8 + f * .2, len(P))
    if family == "plaster":
        f = fbm(n, 4, p["seed"], 4)
        stains = fbm(n, 8, p["seed"] + 7, 3)
        crack = np.abs(np.sin((u * 4 + v * 2 + f) * np.pi * 2)) < .03
        idx = idx_from(f * .6 + stains * .4, len(P))
        idx[crack] = max(0, len(P) - 4)
        return idx
    if family == "wicker":
        return idx_from(weave(n, p["seed"], 6, True), len(P))
    if family == "ceramic":
        bands = np.abs(np.sin(v * np.pi * 2 * 3)) < .18
        f = fbm(n, 6, p["seed"], 3)
        idx = idx_from(f * .7 + .15, len(P))
        idx[bands] = len(P) - 1
        return idx
    if family == "cloth":
        w = weave(n, p["seed"], p["warp"], True)
        motif = (np.abs(((u * 4 + v * 4) % 1) - .5) < .2) ^ (np.abs(((u * 4 - v * 4) % 1) - .5) < .2)
        idx = idx_from(w * .7 + motif.astype(float) * .3, len(P))
        return idx
    raise ValueError(family)


# ---------------------------------------------------------------------------
# atlases
# ---------------------------------------------------------------------------
def cell_box(i):
    col, row = i % 4, i // 4
    s = 128 // 4
    return col * s, row * s, s


def atlas_panel(kind, i):
    S = 128
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if kind == "signs":
        col, row, s = cell_box(i)
        d.rectangle([col, row, col + s - 1, row + s - 1], fill=(52, 34, 20, 255))
        d.rectangle([col + 2, row + 2, col + s - 3, row + s - 3], fill=(96, 66, 38, 255))
        d.rectangle([col + 3, row + 3, col + s - 4, row + s - 4], outline=(160, 120, 70, 255))
        try:
            font = ImageFont.truetype(FONT, 14)
        except Exception:
            font = ImageFont.load_default()
        text = SIGN_NAMES[i % len(SIGN_NAMES)]
        d.text((col + s / 2, row + s / 2), text, font=font, fill=(236, 220, 184, 255), anchor="mm")
    elif kind == "market":
        col, row, s = cell_box(i)
        d.rectangle([col, row, col + s - 1, row + s - 1], fill=(56, 44, 30, 255))
        d.rectangle([col + 2, row + 2, col + s - 3, row + s - 3], fill=(88, 70, 46, 255))
        cx, cy = col + s / 2, row + s / 2
        if i % 4 == 0:  # basket
            d.ellipse([cx - 10, cy - 4, cx + 10, cy + 10], fill=(120, 90, 52, 255), outline=(60, 40, 22, 255))
            for k in range(-8, 9, 4):
                d.line([cx + k, cy - 3, cx + k, cy + 9], fill=(78, 55, 32, 255))
        elif i % 4 == 1:  # jars
            d.rectangle([cx - 9, cy - 8, cx + 9, cy + 10], fill=(92, 48, 30, 255), outline=(42, 22, 14, 255))
            d.rectangle([cx - 6, cy - 12, cx + 6, cy - 7], fill=(120, 68, 40, 255))
        elif i % 4 == 2:  # sacks
            d.ellipse([cx - 11, cy - 6, cx + 11, cy + 10], fill=(150, 128, 82, 255), outline=(70, 56, 32, 255))
            d.line([cx - 8, cy - 6, cx + 8, cy - 6], fill=(90, 74, 44, 255))
        else:  # cloth
            d.rectangle([cx - 11, cy - 10, cx + 11, cy + 10], fill=(44, 58, 84, 255), outline=(24, 32, 50, 255))
            d.line([cx - 8, cy - 6, cx + 8, cy + 8], fill=(120, 140, 170, 255))
            d.line([cx + 8, cy - 6, cx - 8, cy + 8], fill=(160, 90, 70, 255))
    elif kind == "textile":
        col, row, s = cell_box(i)
        base = [(28, 38, 58), (52, 34, 30), (34, 44, 34), (48, 46, 60)][i % 4]
        d.rectangle([col, row, col + s - 1, row + s - 1], fill=base + (255,))
        for k in range(0, s, 4):
            c = (150, 170, 200, 255) if (k // 4 + i) % 2 else (190, 100, 80, 255)
            d.line([col + k, row, col + k, row + s - 1], fill=c)
        step = 8
        for y in range(row + 4, row + s - 3, step):
            for x in range(col + 4, col + s - 3, step):
                if ((x + y) // step + i) % 2:
                    d.rectangle([x, y, x + 3, y + 3], fill=(220, 205, 170, 255))
    else:  # festival
        col, row, s = cell_box(i)
        d.rectangle([col, row, col + s - 1, row + s - 1], fill=(26, 32, 40, 255))
        cx, cy = col + s / 2, row + s / 2
        if i % 4 == 0:  # lusheng
            d.line([cx, cy - 12, cx, cy + 12], fill=(150, 110, 70, 255), width=3)
            for k in (-6, 0, 6):
                d.line([cx, cy - 10, cx + k, cy + 4], fill=(180, 140, 90, 255), width=2)
        elif i % 4 == 1:  # drum
            d.ellipse([cx - 10, cy - 8, cx + 10, cy + 8], fill=(120, 60, 40, 255), outline=(60, 30, 20, 255))
            d.ellipse([cx - 4, cy - 3, cx + 4, cy + 3], fill=(170, 110, 70, 255))
        elif i % 4 == 2:  # maple leaf
            for a in range(0, 360, 45):
                r = np.deg2rad(a)
                d.line([cx, cy, cx + np.cos(r) * 11, cy + np.sin(r) * 11], fill=(170, 80, 50, 255), width=3)
            d.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=(210, 140, 80, 255))
        else:  # embroidery diamond
            d.polygon([(cx, cy - 12), (cx + 12, cy), (cx, cy + 12), (cx - 12, cy)], outline=(200, 180, 120, 255))
            d.polygon([(cx, cy - 6), (cx + 6, cy), (cx, cy + 6), (cx - 6, cy)], fill=(150, 70, 60, 255))
    return img


def build_atlas(kind):
    out = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    for i in range(16):
        panel = atlas_panel(kind, i)
        col, row, s = cell_box(i)
        out.alpha_composite(panel, (col, row))
    return out


# ---------------------------------------------------------------------------
# metrics + output
# ---------------------------------------------------------------------------
def seam_metrics(rgb: np.ndarray):
    h, w, _ = rgb.shape
    left = rgb[:, 0, :].astype(np.int16)
    right = rgb[:, -1, :].astype(np.int16)
    top = rgb[0, :, :].astype(np.int16)
    bottom = rgb[-1, :, :].astype(np.int16)
    wrap = float(np.mean(np.abs(left - right))) + float(np.mean(np.abs(top - bottom)))
    wrap /= 2
    dx = np.mean(np.abs(rgb[:, 1:, :].astype(np.int16) - rgb[:, :-1, :].astype(np.int16)))
    dy = np.mean(np.abs(rgb[1:, :, :].astype(np.int16) - rgb[:-1, :, :].astype(np.int16)))
    neighbor = float(dx + dy) / 2
    return {"wrapDelta": round(wrap, 3), "neighborDelta": round(neighbor, 3), "wrapRatio": round(wrap / (neighbor + 1e-6), 3)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args()
    if args.check:
        print("check mode: generating in memory")
    OUT.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)
    records = []
    for cid, name, family, palette, genname, params in BLOCKS:
        tiers = {}
        for n in TIERS:
            data = gen(genname, n, palette, params)
            rgb = to_rgb(data, palette)
            img = Image.fromarray(rgb.astype(np.uint8), "RGB")
            path = OUT / str(n) / f"{name}.png"
            if not args.check:
                path.parent.mkdir(parents=True, exist_ok=True)
                img.save(path, optimize=True)
            tiers[n] = rgb
        # seam evidence on 64
        seam = seam_metrics(tiers[64])
        avg = [int(round(v)) for v in tiers[64].reshape(-1, 3).mean(axis=0)]
        master = hashlib.sha256(tiers[128].tobytes() + bytes([cid])).hexdigest()
        detail64 = float(np.mean(np.abs(tiers[64].astype(np.int16) - np.repeat(np.repeat(tiers[32], 2, 0), 2, 1).astype(np.int16))))
        detail128 = float(np.mean(np.abs(tiers[128].astype(np.int16) - np.repeat(np.repeat(tiers[64], 2, 0), 2, 1).astype(np.int16))))
        records.append({
            "name": name,
            "family": family,
            "palette": palette,
            "paletteColors": len(palette),
            "average": avg,
            "nativeGrid": 32,
            "files": {str(n): f"/textures/miao-v1/{n}/{name}.png" for n in TIERS},
            "source": "tools/maps/miao-village-textures.py",
            "masterSha256": master,
            "atlas": False,
            "seam": seam,
            "detailVs32": {"64": round(detail64, 3), "128": round(detail128, 3)},
            "generator": {"family": genname, **params},
        })
        # tiling evidence for 32 tier
        t = Image.fromarray(tiers[32].astype(np.uint8), "RGB")
        tile = Image.new("RGB", (64, 64))
        for y in range(2):
            for x in range(2):
                tile.paste(t, (x * 32, y * 32))
        if not args.check:
            tile.save(DOCS / f"tile_{name}.png")
    for name, kind, seed in ATLASES:
        panels = build_atlas(kind)
        for n in TIERS:
            img = panels.resize((n, n), Image.NEAREST) if n != 128 else panels
            if not args.check:
                (OUT / str(n)).mkdir(parents=True, exist_ok=True)
                img.save(OUT / str(n) / f"{name}.png", optimize=True)
        rgb = np.asarray(panels.convert("RGB"))
        records.append({
            "name": name,
            "family": "atlas",
            "palette": [],
            "paletteColors": 0,
            "average": [int(round(v)) for v in rgb.reshape(-1, 3).mean(axis=0)],
            "nativeGrid": 32,
            "files": {str(n): f"/textures/miao-v1/{n}/{name}.png" for n in TIERS},
            "source": "tools/maps/miao-village-textures.py",
            "masterSha256": hashlib.sha256(rgb.tobytes() + bytes([seed])).hexdigest(),
            "atlas": True,
            "seam": None,
            "detailVs32": {"64": 0, "128": 0},
            "generator": {"family": kind, "cells": 4},
        })
    manifest = {
        "version": 1,
        "pack": "miao-v1",
        "generatedBy": "tools/maps/miao-village-textures.py",
        "nativeGrid": 32,
        "tiers": list(TIERS),
        "colorSpace": "sRGB",
        "sampling": "nearest",
        "blockRange": [122, 153],
        "textures": records,
    }
    if not args.check:
        (OUT / "manifest.json").write_text(json.dumps(manifest, indent=1))
        # contact sheet
        sheet = Image.new("RGB", (8 * 32, 4 * 32), (24, 26, 24))
        for i, (cid, name, *_rest) in enumerate(BLOCKS):
            im = Image.open(OUT / "32" / f"{name}.png").convert("RGB")
            sheet.paste(im, ((i % 8) * 32, (i // 8) * 32))
        sheet = sheet.resize((512, 256), Image.NEAREST)
        sheet.save(DOCS / "contact_sheet_32.png")
        readme = [
            "# miao-v1 材质包",
            "",
            "原创程序化生成，无照片、无外部下载；32/64/128 三档都是原生分辨率（不是放大）。",
            "每张 32 底色板 ≤8 色，全部在环面域上生成，左右/上下 wrap 无缝。",
            "",
            "| id | name | family | palette | mean RGB |",
            "|---:|---|---|---|---|",
        ]
        for r in records[:32]:
            readme.append(f"| {122 + len(readme) - 9} | {r['name']} | {r['family']} | {r['paletteColors']} | {tuple(r['average'])} |")
        readme += [
            "",
            "验收：`npx vitest run tests/miao-assets.test.ts`；接缝指标见 `manifest.json` 的 `seam`。",
            "运行：`python3 tools/maps/miao-village-textures.py`（本机使用 bundled Python 3.12 + Pillow 12 + numpy 2.3）。",
        ]
        (DOCS / "README.md").write_text("\n".join(readme))
    print(json.dumps({"blocks": len(BLOCKS), "atlases": len(ATLASES), "records": len(records), "tiers": list(TIERS)}, indent=1))


if __name__ == "__main__":
    main()
