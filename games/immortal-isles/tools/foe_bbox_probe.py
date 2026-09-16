# -*- coding: utf-8 -*-
"""量测 foes_atlas 每帧的真实内容包围盒（alpha>8），判断是留白过大还是切片并帧。"""
import json, os
from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # .../test
ATLAS = os.path.join(BASE, 'assets', 'foes_atlas.png')
JSN = os.path.join(BASE, 'assets', 'foes_atlas.json')

im = Image.open(ATLAS).convert('RGBA')
W, H = im.size
print('atlas size:', W, H)
alpha = im.split()[3]

data = json.load(open(JSN, encoding='utf-8'))
rect = data.get('rect', data)

rows = []
for k, r in rect.items():
    sx, sy, w, h = r
    box = (sx, sy, sx + w, sy + h)
    sub = alpha.crop(box)
    bb = sub.getbbox()  # 非零区域
    if bb is None:
        rows.append((k, w, h, 0, 0, 'EMPTY'))
        continue
    x0, y0, x1, y1 = bb
    cw, ch = x1 - x0, y1 - y0
    fill = (cw / w) if w else 0
    rows.append((k, w, h, cw, ch, '%.2f' % fill))

rows.sort()
print('%-24s %7s %6s %7s %6s %5s' % ('key', 'rectW', 'rectH', 'contW', 'contH', 'fillW'))
for k, w, h, cw, ch, fill in rows:
    print('%-24s %7d %6d %7d %6d %5s' % (k, w, h, cw, ch, fill))

# 按 base 汇总内容尺寸范围
from collections import defaultdict
agg = defaultdict(list)
for k, w, h, cw, ch, fill in rows:
    if fill == 'EMPTY':
        continue
    agg[k.split('_')[0]].append((cw, ch, k))
print('\n--- per-base content bbox ---')
for b, arr in agg.items():
    ws = [a[0] for a in arr]; hs = [a[1] for a in arr]
    print('%-10s n=%2d  contW %d..%d  contH %d..%d' % (b, len(arr), min(ws), max(ws), min(hs), max(hs)))
