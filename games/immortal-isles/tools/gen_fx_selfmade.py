# -*- coding: utf-8 -*-
"""仙岛寻踪 · 程序化生成技能特效图集（不依赖任何外部素材）。

火球 / 爆炸 / 闪电 用 numpy 向量化绘制，输出 fx_atlas.{png,webp,json}，
格式与 build_fx_atlas.py 完全一致：
    { "_meta": {name:{n,fps,oneshot,h}}, "name_i":[x,y,w,h], ... }
引擎 drawFxSprite 按 name 取帧、绕速度角旋转（火球默认朝右、拖尾在左）。

用法
    python games/immortal-isles/tools/gen_fx_selfmade.py
"""
import os, json, math
import numpy as np
from PIL import Image

BASE = r'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame'
ASSETS = os.path.join(BASE, 'games/immortal-isles/assets')
PAD = 2


def gen_fireball(w, h, i, N):
    """朝右飞行的火球：白热核心→黄→橙→红边，左侧拖尾。每帧脉动跳动。"""
    arr = np.zeros((h, w, 4), dtype=np.float64)
    cx = w * 0.60 + math.sin(i * 1.3) * 1.5
    cy = h * 0.50
    R = w * 0.17 + math.sin(i * 2.1) * 2.0
    yy, xx = np.mgrid[0:h, 0:w]
    dx = xx - cx
    dy = yy - cy
    d = np.sqrt(dx * dx + dy * dy)
    # 向左的拖尾（运动方向向右，尾在后方）
    tail = np.where(dx < 0, np.exp(dx / (w * 0.16)) * np.exp(-(dy * dy) / (2 * (R * 0.55) ** 2)), 0.0)
    a = np.zeros_like(d)
    a = np.where(d < R * 0.35, 1.0, a)
    a = np.where((d >= R * 0.35) & (d < R * 0.7), 1.0 - (d - R * 0.35) / (R * 0.35) * 0.15, a)
    a = np.where((d >= R * 0.7) & (d < R * 1.0), 0.85 - (d - R * 0.7) / (R * 0.3) * 0.55, a)
    a = np.where((d >= R * 1.0) & (d < R * 1.7), np.exp(-(d - R) / (R * 0.7)) * 0.5, a)
    a = np.maximum(a, tail * 0.6)
    a = np.clip(a, 0, 1)
    t = np.clip(1.0 - d / (R * 1.7), 0, 1)
    t = np.maximum(t, tail * 0.85)
    cr = np.clip(255 * (0.62 + 0.38 * t), 0, 255)
    cg = np.clip(255 * (0.18 + 0.72 * t - 0.32 * np.clip((t - 0.6) / 0.4, 0, 1)), 0, 255)
    cb = np.clip(255 * (0.04 + 0.55 * t * t), 0, 255)
    rng = np.random.default_rng(1000 + i)
    al = a * 255 * (1 + (rng.random((h, w)) - 0.5) * 0.22)
    arr[:, :, 0] = cr
    arr[:, :, 1] = cg
    arr[:, :, 2] = cb
    arr[:, :, 3] = np.clip(al, 0, 255)
    return arr


def gen_blast(w, h, i, N):
    """中心爆炸：火环向外扩散 + 中心白闪 + 飞溅火花，后段淡出成烟。"""
    size = w
    arr = np.zeros((size, size, 4), dtype=np.float64)
    cx = cy = size / 2
    prog = (i + 1) / N
    R = size * 0.46 * prog
    yy, xx = np.mgrid[0:size, 0:size]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    ring = np.exp(-((d - R) ** 2) / (2 * (size * 0.05) ** 2))
    core = np.exp(-(d * d) / (2 * (size * 0.07) ** 2)) * (1 - prog * 0.3)
    fill = np.where(d < R, np.clip(1 - prog, 0, 1) * 0.55, 0.0)
    a = np.maximum(ring * 0.9, core)
    a = np.maximum(a, fill)
    rng = np.random.default_rng(2000 + i)
    for _ in range(20):
        ang = rng.random() * 2 * math.pi
        rr = rng.random() * R
        sx = cx + math.cos(ang) * rr
        sy = cy + math.sin(ang) * rr
        sd = np.sqrt((xx - sx) ** 2 + (yy - sy) ** 2)
        a = np.maximum(a, np.exp(-(sd * sd) / (2 * (size * 0.013) ** 2)) * 0.7 * (1 - prog))
    a *= np.clip(1.25 - prog * 0.6, 0, 1)
    a = np.clip(a, 0, 1)
    t = np.clip(1 - d / (size * 0.5), 0, 1)
    t = np.maximum(t, core)
    cr = np.clip(255 * (0.72 + 0.28 * t), 0, 255)
    cg = np.clip(255 * (0.22 + 0.62 * t - 0.22 * np.clip((t - 0.7) / 0.3, 0, 1)), 0, 255)
    cb = np.clip(255 * (0.04 + 0.42 * t * t), 0, 255)
    rng2 = np.random.default_rng(3000 + i)
    al = a * 255 * (1 + (rng2.random((size, size)) - 0.5) * 0.2)
    arr[:, :, 0] = cr
    arr[:, :, 1] = cg
    arr[:, :, 2] = cb
    arr[:, :, 3] = np.clip(al, 0, 255)
    return arr


def gen_lightning(w, h, i, N):
    """竖直落雷：锯齿主闪 + 黄白辉光 + 地面亮斑，每帧抖动闪烁。"""
    size = w
    arr = np.zeros((size, size, 4), dtype=np.float64)
    cx = size / 2
    rng = np.random.default_rng(4000 + i)
    pts = []
    x = cx
    for k in range(33):
        y = k * (size / 32)
        x += rng.random() * size * 0.11 - size * 0.055
        x = min(max(x, size * 0.28), size * 0.72)
        pts.append((x, y))
    yy, xx = np.mgrid[0:size, 0:size]
    dmin = np.full((size, size), 1e9)
    for (px, py) in pts:
        d = np.sqrt((xx - px) ** 2 + (yy - py) ** 2)
        dmin = np.minimum(dmin, d)
    glow = np.exp(-(dmin * dmin) / (2 * (size * 0.055) ** 2))
    core = np.exp(-(dmin * dmin) / (2 * (size * 0.013) ** 2))
    gb = np.exp(-((xx - cx) ** 2) / (2 * (size * 0.13) ** 2)) * np.exp(-((yy - size * 0.93) ** 2) / (2 * (size * 0.06) ** 2))
    a = np.maximum(glow * 0.7, core)
    a = np.maximum(a, gb * 0.9)
    a = np.clip(a, 0, 1)
    cr = np.clip(255 * (0.86 + 0.14 * core), 0, 255)
    cg = np.clip(255 * (0.68 + 0.32 * core), 0, 255)
    cb = np.clip(255 * (0.28 + 0.55 * core), 0, 255)
    al = a * 255
    arr[:, :, 0] = cr
    arr[:, :, 1] = cg
    arr[:, :, 2] = cb
    arr[:, :, 3] = np.clip(al, 0, 255)
    return arr


def to_img(arr):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')


def main():
    groups = [
        ('fireball', 48, 48, 8, 12.0, False, gen_fireball),
        ('blast', 128, 128, 10, 20.0, True, gen_blast),
        ('lightning', 128, 128, 8, 12.0, False, gen_lightning),
    ]
    rows = []
    for name, w, h, N, fps, oneshot, fn in groups:
        frames = [to_img(fn(w, h, i, N)) for i in range(N)]
        rows.append((name, frames, fps, oneshot, N))
    W = max(sum(f.width for f in fr) + PAD * (N + 1) for _, fr, _, _, N in rows)
    H = sum(max(f.height for f in fr) + PAD * 2 for _, fr, _, _, _ in rows)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    meta = {}
    rect = {}
    y = 0
    for name, frames, fps, oneshot, N in rows:
        row_h = max(f.height for f in frames) + PAD * 2
        x = PAD
        for i, fr in enumerate(frames):
            canvas.alpha_composite(fr, (x, y + PAD))
            rect['%s_%d' % (name, i)] = [x, y + PAD, fr.width, fr.height]
            x += fr.width + PAD
        meta[name] = {'n': N, 'fps': fps, 'oneshot': oneshot, 'h': row_h}
        y += row_h
    out = {'_meta': meta}
    out.update(rect)
    canvas.save(os.path.join(ASSETS, 'fx_atlas.png'), optimize=True)
    canvas.save(os.path.join(ASSETS, 'fx_atlas.webp'), 'WEBP', quality=90, method=6)
    json.dump(out, open(os.path.join(ASSETS, 'fx_atlas.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    for ext in ('png', 'webp', 'json'):
        p = os.path.join(ASSETS, 'fx_atlas.' + ext)
        print('fx_atlas.%-5s %.1fKB' % (ext, os.path.getsize(p) / 1024))
    print('图集 %dx%d 帧总数 %d' % (W, H, len(rect)))
    for name, frames, fps, oneshot, N in rows:
        ratios = []
        for f in frames:
            a = np.array(f)[:, :, 3]
            ratios.append(round(float(np.count_nonzero(a > 10)) / (a.shape[0] * a.shape[1]), 3))
        print('  %-9s 非空帧占比: %s' % (name, ratios))


if __name__ == '__main__':
    main()
