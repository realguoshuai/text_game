# -*- coding: utf-8 -*-
"""
把 import_tmx.py 产出的 <prefix>_map.json + <prefix>_atlas.{webp,json} 渲成图，
用来在接进引擎之前先核对几何（比跑无头截图快两个数量级）。

用法：
    python tools/render_map_json.py <prefix> [scale] [out.png]

几何必须和 js/game.js 的绘制严格一致，否则这里过了、进游戏还是歪：
    isoToScreen(mx,my) = ((mx-my)*TILE_W/2, (mx+my)*TILE_H/2)      # 返回"格顶"
    物件底边 y = iso.y + TILE_H/2 + dy*Z                            # HH = TILE_H/2
    水平居中：left = iso.x - w/2
"""
import os, sys, json
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
TILE_W, TILE_H = 120, 60


def main():
    prefix = sys.argv[1] if len(sys.argv) > 1 else 'imported'
    Z = float(sys.argv[2]) if len(sys.argv) > 2 else 1.0
    out = sys.argv[3] if len(sys.argv) > 3 else '_render_%s.png' % prefix

    mp = json.load(open(os.path.join(ASSETS, '%s_map.json' % prefix), encoding='utf-8'))
    atlas_img = os.path.join(ASSETS, '%s_atlas.webp' % prefix)
    if not os.path.exists(atlas_img):
        atlas_img = atlas_img.replace('.webp', '.png')
    rect = json.load(open(os.path.join(ASSETS, '%s_atlas.json' % prefix), encoding='utf-8'))
    atlas = Image.open(atlas_img).convert('RGBA')

    W, H = mp['w'], mp['h']
    tw, th = TILE_W * Z, TILE_H * Z

    # 先算画布范围
    minx = miny = 10 ** 9
    maxx = maxy = -10 ** 9
    for o in mp['objects']:
        r = rect.get(o['piece'])
        if not r:
            continue
        sx = (o['x'] - o['y']) * tw / 2
        sy = (o['x'] + o['y']) * th / 2
        left = sx - r[2] * Z / 2
        top = sy + th / 2 + (o.get('dy') or 0) * Z - r[3] * Z
        minx = min(minx, left); miny = min(miny, top)
        maxx = max(maxx, left + r[2] * Z); maxy = max(maxy, top + r[3] * Z)
    pad = 16
    cw, ch = int(maxx - minx) + pad * 2, int(maxy - miny) + pad * 2
    canvas = Image.new('RGBA', (cw, ch), (26, 30, 24, 255))

    miss = set()
    for o in mp['objects']:
        r = rect.get(o['piece'])
        if not r:
            miss.add(o['piece']); continue
        sx = (o['x'] - o['y']) * tw / 2
        sy = (o['x'] + o['y']) * th / 2
        left = sx - r[2] * Z / 2 - minx + pad
        top = sy + th / 2 + (o.get('dy') or 0) * Z - r[3] * Z - miny + pad
        sub = atlas.crop((r[0], r[1], r[0] + r[2], r[1] + r[3]))
        if Z != 1.0:
            sub = sub.resize((max(1, int(r[2] * Z)), max(1, int(r[3] * Z))), Image.LANCZOS)
        canvas.alpha_composite(sub, (int(left), int(top)))

    canvas.convert('RGB').save(out)
    print('%s  %dx%d 格  物件 %d  画布 %dx%d  ->  %s'
          % (mp['id'], W, H, len(mp['objects']), cw, ch, out))
    if miss:
        print('!! 图集里找不到:', list(miss)[:8])


main()
