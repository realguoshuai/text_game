# -*- coding: utf-8 -*-
"""对切好的图块做「主色量化 + 原图位置」统计，推断用途，供拼图决策。"""
import os, json
from collections import Counter
import numpy as np
from PIL import Image

OUT = 'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/test/assets/sliced'
man = json.load(open(os.path.join(OUT, 'manifest.json'), encoding='utf-8'))

def domi(a, m, topn=3):
    px = a[m][:, :3]
    if len(px) == 0:
        return [], 0.0, (0, 0, 0)
    q = (px // 24).astype(np.int32)
    key = q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2]
    cnt = Counter(key.tolist())
    tot = len(px)
    out = []
    for k, c in cnt.most_common(topn):
        sel = key == k
        mean = px[sel].mean(0).astype(int).tolist()
        out.append((tuple(mean), round(c / tot, 2)))
    # 饱和度
    f = px.astype(float)
    mx = f.max(1); mn = f.min(1)
    sat = float(((mx - mn) / np.maximum(mx, 1e-6)).mean())
    return out, round(sat, 2), tuple(f.mean(0).astype(int).tolist())

rows = []
for p in man['pieces']:
    im = Image.open(os.path.join(OUT, p['file'])).convert('RGBA')
    a = np.asarray(im)
    m = a[:, :, 3] > 128
    top, sat, mean = domi(a, m)
    rows.append(dict(file=p['file'], x=p['x'], y=p['y'], w=p['w'], h=p['h'],
                     area=p['area'], asp=round(p['w'] / max(1, p['h']), 2),
                     mean=mean, sat=sat, top=top))

# 按原图位置排序，暴露版面聚类
rows.sort(key=lambda r: (r['y'] // 130, r['x']))
print('x,y = 该图块在原图中的左上角；top = 主色(占比)')
print(f"{'file':30s} {'x':>5} {'y':>5} {'w':>4} {'h':>4} {'asp':>5} {'sat':>5}  top colors")
for r in rows:
    t = ' '.join(f"{c}×{f}" for c, f in r['top'])
    print(f"{r['file']:30s} {r['x']:5d} {r['y']:5d} {r['w']:4d} {r['h']:4d} {r['asp']:5.2f} {r['sat']:5.2f}  {t}")
json.dump(rows, open(os.path.join(OUT, '_analysis.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1, default=str)
print('\ntotal', len(rows))
