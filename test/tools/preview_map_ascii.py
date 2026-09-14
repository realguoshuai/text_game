# -*- coding: utf-8 -*-
"""离线复刻 js/game.js 的绘制，用来在无图形环境下核对「屏幕上到底有什么」。

为什么不直接截图：本环境读不了图片像素，但能读文本。这里按引擎里**逐字照抄**的
摆放数学把地砖与物件合成成一张图，再转成文字点阵打印出来 —— 这样能直接看清
某个位置放了什么、有没有多余的东西。

用法：
  python preview_map_ascii.py <mapId> <中心格x> <中心格y> [视口宽px] [视口高px] [点阵步长]
  python preview_map_ascii.py qingxuan 17 27 1200 640 8      # 起点附近，8px 一个字符
  python preview_map_ascii.py qingxuan 17 27 1200 640 8 --save out.png
"""
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, 'assets')
TILE_W, TILE_H = 120, 60
HW, HH = TILE_W // 2, TILE_H // 2

# 与 ascii_piece.py 一致的颜色族，便于对照阅读
def ch_of(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    lum = (r + g + b) / 3
    if lum < 45:
        return '#'
    if mx - mn < 26:
        return '@' if lum > 195 else ('+' if lum > 120 else '=')
    if r > g and r > b:
        if g > b + 24 and r - b > 60:
            return 'S' if lum > 150 else 'W'
        return 'R'
    if g >= r and g >= b:
        return 'C' if b > r + 20 else 'G'
    return 'B'


def load_maps():
    with open(os.path.join(ASSETS, 'maps.json'), encoding='utf-8') as f:
        return json.load(f)


def build(data, mp, cx, cy, W, H, with_objects=True, with_npcs=True):
    """按引擎的相机数学合成一张 W x H 的图"""
    img = Image.new('RGBA', (W, H), (169, 214, 238, 255))     # 天空底色
    camX = W / 2 - (cx - cy) * HW
    camY = H / 2 - (cx + cy) * HH

    def iso(mx, my):
        return ((mx - my) * HW + camX, (mx + my) * HH + camY)

    PAL = data['tilePalette']

    # 1) 地面
    for y in range(mp['h']):
        row = mp['ground'][y]
        for x in range(mp['w']):
            f = PAL.get(row[x])
            if not f:
                continue
            p = os.path.join(ASSETS, 'sliced', f)
            if not os.path.exists(p):
                continue
            t = Image.open(p).convert('RGBA')
            px, py = iso(x, y)
            if px < -TILE_W * 1.6 or px > W + TILE_W * 1.6 or py < -TILE_H * 4 or py > H + TILE_H * 4:
                continue
            s = TILE_W / t.width
            t = t.resize((TILE_W, max(1, int(t.height * s))), Image.NEAREST)
            img.alpha_composite(t, (int(px - TILE_W / 2), int(py)))

    # 2) 物件：与引擎同样的深度排序，同序合成即等价
    items = []
    if with_objects:
        for o in mp['objects']:
            items.append(((o['x'] + (o.get('fw', 1) - 1)) + (o['y'] + (o.get('fh', 1) - 1)) + 0.5, o, None))
    if with_npcs:
        for n in mp.get('npcs', []):
            items.append((n['x'] + n['y'] + 0.01, None, n))
    items.sort(key=lambda t: t[0])

    for _, o, n in items:
        if n is not None:
            continue                      # NPC 是 64px 像素画，这里只标个位置
        p = os.path.join(ASSETS, 'sliced', o['piece'])
        if not os.path.exists(p):
            continue
        t = Image.open(p).convert('RGBA')
        ax = o['x'] + (o.get('fw', 1) - 1) / 2
        ay = o['y'] + (o.get('fh', 1) - 1) / 2
        px, py = iso(ax, ay)
        bx, by = px, py + HH + o.get('dy', 0)
        img.alpha_composite(t, (int(round(bx - t.width / 2)), int(round(by - t.height))))
    return img


def to_ascii(img, step):
    a = np.asarray(img.convert('RGBA')).astype(int)
    h, w = a.shape[:2]
    out = []
    for y in range(0, h, step):
        line = []
        for x in range(0, w, step):
            blk = a[y:y + step, x:x + step]
            px = blk[:, :, :3].reshape(-1, 3).mean(0)
            line.append(ch_of(int(px[0]), int(px[1]), int(px[2])))
        out.append(''.join(line))
    return out


def main():
    data = load_maps()
    mid = sys.argv[1] if len(sys.argv) > 1 else 'qingxuan'
    cx = float(sys.argv[2]) if len(sys.argv) > 2 else 17
    cy = float(sys.argv[3]) if len(sys.argv) > 3 else 27
    W = int(sys.argv[4]) if len(sys.argv) > 4 else 1200
    H = int(sys.argv[5]) if len(sys.argv) > 5 else 640
    step = int(sys.argv[6]) if len(sys.argv) > 6 else 8
    mp = next(m for m in data['maps'] if m['id'] == mid)

    img = build(data, mp, cx, cy, W, H)
    print('# map=%s "%s"  中心格=(%g,%g)  视口=%dx%d  步长=%dpx/字符' % (mid, mp['name'], cx, cy, W, H, step))
    print('# 该视口内的物件：')
    for o in mp['objects']:
        ax = o['x'] + (o.get('fw', 1) - 1) / 2
        ay = o['y'] + (o.get('fh', 1) - 1) / 2
        px, py = (ax - ay) * HW + W / 2 - (cx - cy) * HW, (ax + ay) * HH + H / 2 - (cx + cy) * HH
        if -120 < px < W + 120 and -160 < py < H + 160:
            print('#   %-30s grid(%g,%g) 屏幕(%d,%d) solid=%s fw=%s fh=%s' % (
                o['piece'], o['x'], o['y'], px, py, o.get('solid', True), o.get('fw', 1), o.get('fh', 1)))
    print()
    for line in to_ascii(img, step):
        print(line)

    if '--save' in sys.argv:
        p = sys.argv[sys.argv.index('--save') + 1]
        img.convert('RGB').save(p)
        print('\n# 合成图已存 -> ' + p)


main()
