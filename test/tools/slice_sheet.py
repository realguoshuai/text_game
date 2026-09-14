# -*- coding: utf-8 -*-
"""
把 AI 生成的等距素材总图切成可复用图块。
关键：海岛之间被「云路 / 台阶 / 草地」等细连接连在一起，普通连通域会把它们并成巨块。
做法：对超大连通域做「自适应腐蚀切颈」——逐级加大腐蚀半径直到细连接断开，
      再用测地膨胀(binary_propagation)沿原掩膜重建，得到分离后的完整海岛。
输出：assets/sliced/*.png（透明软边）+ manifest.json + 标注总览图
"""
import os, json
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SRC = 'C:/Users/Lenovo/.workbuddy/clipboard-images/clipboard-2026-09-14T02-58-19-170Z-4f37f117.jpg'
ROOT = 'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/immortal-isles'
OUT = os.path.join(ROOT, 'assets', 'sliced')
os.makedirs(OUT, exist_ok=True)

BG = np.array([207, 235, 249], dtype=int)
MIN_AREA = 260
SPLIT_MIN = 3000          # 超过此面积的连通域尝试切颈
SEED_MIN = 900            # 腐蚀后保留的种子块最小面积

def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r

im = Image.open(SRC).convert('RGB')
rgb = np.asarray(im).astype(int)
H, W, _ = rgb.shape

dist = np.abs(rgb - BG).max(axis=2)
alpha = np.clip((dist - 10) * 255.0 / 26.0, 0, 255)
fg = dist > 30
fg = ndimage.binary_opening(fg, structure=np.ones((3, 3), bool))
fg = ndimage.binary_closing(fg, structure=np.ones((3, 3), bool))

struct8 = np.ones((3, 3), bool)
lab, n = ndimage.label(fg, structure=struct8)
objs = ndimage.find_objects(lab)
print('raw components:', n)

outlab = np.zeros(fg.shape, np.int32)
nid = 0
split_log = []
for i, sl in enumerate(objs, start=1):
    if sl is None:
        continue
    m = (lab[sl] == i)
    area = int(m.sum())
    if area < MIN_AREA:
        continue
    hh, ww = m.shape
    if max(ww, hh) >= 240 and area >= SPLIT_MIN:
        done = False
        for r in (8, 12, 16, 20, 25, 30, 36):
            er = ndimage.binary_erosion(m, structure=disk(r))
            if er.sum() == 0:
                break
            l2, n2 = ndimage.label(er, structure=struct8)
            seeds = [k for k in range(1, n2 + 1) if (l2 == k).sum() >= SEED_MIN]
            if len(seeds) >= 2:
                view = outlab[sl]
                cnt = 0
                for k in seeds:
                    rec = ndimage.binary_propagation(l2 == k, mask=m)
                    if rec.sum() < MIN_AREA:
                        continue
                    nid += 1
                    view[rec] = nid
                    cnt += 1
                split_log.append((i, area, r, cnt))
                done = True
                break
        if done:
            continue
    nid += 1
    outlab[sl][m] = nid

print('split events (comp, area, radius, pieces):', split_log)
objs2 = ndimage.find_objects(outlab)
pieces = []
for j, sl in enumerate(objs2, start=1):
    if sl is None:
        continue
    m = (outlab[sl] == j)
    a = int(m.sum())
    if a < MIN_AREA:
        continue
    pieces.append((j, sl, a))

print('kept pieces:', len(pieces))

rgba = np.dstack([rgb.astype(np.uint8), alpha.astype(np.uint8)])
pieces.sort(key=lambda t: -t[2])
manifest = []
for order, (j, sl, a) in enumerate(pieces):
    ys, xs = sl
    m = (outlab[sl] == j)
    out = rgba[ys.start:ys.stop, xs.start:xs.stop].copy()
    out[~m, 3] = 0
    w, h = xs.stop - xs.start, ys.stop - ys.start
    mx = max(w, h)
    cls = 'island' if mx >= 240 else 'building' if mx >= 110 else 'prop' if mx >= 45 else 'deco'
    name = f'{cls}_{order:03d}_{w}x{h}.png'
    Image.fromarray(out, 'RGBA').save(os.path.join(OUT, name))
    manifest.append(dict(file=name, cls=cls, order=order, x=int(xs.start), y=int(ys.start),
                         w=int(w), h=int(h), area=a, anchor='bottom-center'))

with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8') as f:
    json.dump(dict(source=os.path.basename(SRC), imageSize=[int(W), int(H)],
                   bg=[int(v) for v in BG], count=len(manifest), pieces=manifest),
              f, ensure_ascii=False, indent=1)

ov = im.copy()
d = ImageDraw.Draw(ov)
for m in manifest:
    d.rectangle([m['x'], m['y'], m['x'] + m['w'], m['y'] + m['h']], outline=(220, 30, 30), width=3)
    d.text((m['x'] + 4, m['y'] + 4), str(m['order']), fill=(255, 0, 0))
ov.save(os.path.join(OUT, '_overview_labeled.png'))

from collections import Counter
print('classes:', dict(Counter(m['cls'] for m in manifest)))
print('islands:', [(m['file'], m['x'], m['y']) for m in manifest if m['cls'] == 'island'])
print('saved ->', OUT)
