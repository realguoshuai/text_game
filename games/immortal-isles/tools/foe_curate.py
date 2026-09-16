# -*- coding: utf-8 -*-
"""生成「策展版」foes_atlas.json：
  1. 去掉噪点后取每帧真实内容包围盒（收紧空白）
  2. 判定垃圾帧（内容太小/太碎，多为盲切切到错误区域）
  3. 垃圾帧回退到同怪同朝向的待机帧（没有则回退 idle_down）
输出 _analysis/foes_atlas_curated.json + 报告，不覆盖原文件。
"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATLAS = os.path.join(BASE, 'assets', 'foes_atlas.png')
JSN = os.path.join(BASE, 'assets', 'foes_atlas.json')
OUT = os.path.join(BASE, '_analysis', 'foes_atlas_curated.json')

SPECK = 90        # 小于该面积连通块视为噪点
MIN_W, MIN_H, MIN_A = 34, 40, 1000   # 内容小于此视为垃圾帧

im = Image.open(ATLAS).convert('RGBA')
A = np.array(im.split()[3])
data = json.load(open(JSN, encoding='utf-8'))
rect = data.get('rect', data)
DIRS = ['down', 'right', 'left', 'up']


def content_box(r):
    sx, sy, w, h = r
    sub = A[sy:sy + h, sx:sx + w]
    mask = sub > 8
    lab, n = ndimage.label(mask)
    if n == 0:
        return None, 0
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    keep = np.zeros_like(mask)
    used = 0
    for i, s in enumerate(sizes):
        if s >= SPECK:
            keep |= (lab == i + 1)
            used += 1
    if not keep.any():
        return None, 0
    ys, xs = np.where(keep)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    return (sx + x0, sy + y0, x1 - x0, y1 - y0), used


tight = {}
junk = []
for k, r in rect.items():
    box, ncomp = content_box(r)
    if box is None:
        tight[k] = None
        junk.append((k, 'EMPTY'))
        continue
    x, y, w, h = box
    if w < MIN_W or h < MIN_H or w * h < MIN_A:
        tight[k] = None
        junk.append((k, '%dx%d(%d blobs)' % (w, h, ncomp)))
    else:
        tight[k] = box

# 几何离群：同怪待机帧宽度的中位数 * 1.8 视为「多个姿势并进一帧」的错切
import statistics
base_idle_w = {}
for base in set(k.split('_')[0] for k in rect.keys()):
    ws = [tight[k][2] for k in rect.keys()
          if k.startswith(base + '_idle_') and tight.get(k)]
    if ws:
        base_idle_w[base] = statistics.median(ws)
for k in list(tight.keys()):
    if not tight[k]:
        continue
    base = k.split('_')[0]
    med = base_idle_w.get(base)
    if med and tight[k][2] > med * 1.8:
        junk.append((k, 'wide %d > 1.8*med(%.0f) 疑似并帧' % (tight[k][2], med)))
        tight[k] = None

print('%-24s %-14s %-14s %s' % ('key', 'old', 'tight', 'status'))
print('-' * 74)
for k in sorted(rect.keys()):
    b = tight[k]
    st = 'ok' if b else 'JUNK -> fallback'
    print('%-24s %-14s %-14s %s' % (k, '%dx%d' % (rect[k][2], rect[k][3]),
                                    ('%dx%d' % (b[2], b[3])) if b else '-', st))

final = {}
for k in rect.keys():
    if tight[k]:
        final[k] = list(tight[k])
        continue
    parts = k.split('_')
    base, state, d = parts[0], parts[1], parts[-1] if len(parts) > 2 else 'down'
    order = ['%s_idle_%s' % (base, d), '%s_idle_down' % base]
    order += ['%s_idle_%s' % (base, dd) for dd in DIRS]
    order += ['%s_seed_%s' % (base, d)]
    picked = None
    for cand in order:
        if cand in tight and tight[cand]:
            picked = cand
            break
    if picked is None:
        # 再兜底：同 base 任意可用帧
        for kk in rect.keys():
            if kk.startswith(base + '_') and tight.get(kk):
                picked = kk
                break
    if picked:
        final[k] = list(tight[picked])
        print('  fallback %-22s -> %s' % (k, picked))
    else:
        final[k] = list(rect[k])

def _i(o):
    return int(o)

# 引擎读的是扁平结构 {frameKey:[x,y,w,h]}，与 assets/foes_atlas.json 一致
json.dump(final, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'), default=_i)
print('\njunk frames: %d / %d' % (len(junk), len(rect)))
print('-> %s' % OUT)

from collections import defaultdict
agg = defaultdict(list)
for k, v in final.items():
    agg[k.split('_')[0]].append((v[2], v[3]))
print('\n--- final per-base ---')
for b, arr in agg.items():
    ws = [a[0] for a in arr]; hs = [a[1] for a in arr]
    print('%-10s W %3d..%3d  H %3d..%3d' % (b, min(ws), max(ws), min(hs), max(hs)))
