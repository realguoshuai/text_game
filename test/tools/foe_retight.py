# -*- coding: utf-8 -*-
"""把 foes_atlas 每帧收紧到「最大连通块」的包围盒：
  - 去掉帧内多余空白（原来 golem_attack_down 框 297x194 内容只有 81x14）
  - 若一帧里并进了 2 个分离的姿势，只保留像素最多的那块（去掉碎片）
输出候选 JSON 到 _analysis/foes_atlas_tight.json 并打印报告，不覆盖原文件。
"""
import json, os
import numpy as np
from PIL import Image
from scipy import ndimage

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ATLAS = os.path.join(BASE, 'assets', 'foes_atlas.png')
JSN = os.path.join(BASE, 'assets', 'foes_atlas.json')
OUT = os.path.join(BASE, '_analysis', 'foes_atlas_tight.json')

im = Image.open(ATLAS).convert('RGBA')
A = np.array(im.split()[3])  # alpha
data = json.load(open(JSN, encoding='utf-8'))
rect = data.get('rect', data)

new = {}
print('%-24s %-13s %-13s %-6s %s' % ('key', 'old rect', 'tight box', 'blobs', 'note'))
print('-' * 84)
for k, r in rect.items():
    sx, sy, w, h = r
    sub = A[sy:sy + h, sx:sx + w]
    mask = sub > 8
    if not mask.any():
        new[k] = r
        print('%-24s %-13s %-13s %-6s EMPTY keep' % (k, '%dx%d' % (w, h), '-', 0))
        continue
    lab, n = ndimage.label(mask)
    if n == 0:
        new[k] = r
        print('%-24s %-13s %-13s %-6d EMPTY keep' % (k, '%dx%d' % (w, h), '-', 0))
        continue
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    big = int(np.argmax(sizes)) + 1
    ys, xs = np.where(lab == big)
    x0, x1 = xs.min(), xs.max() + 1
    y0, y1 = ys.min(), ys.max() + 1
    cw, ch = x1 - x0, y1 - y0
    note = ''
    if n > 1:
        note = 'merged x%d -> keep largest %dx%d' % (n, cw, ch)
    if cw < 12 or ch < 12:
        note = (note + '  SMALL!').strip()
    new[k] = [sx + x0, sy + y0, cw, ch]
    print('%-24s %-13s %-13s %-6d %s' % (k, '%dx%d' % (w, h), '%dx%d' % (cw, ch), n, note))

json.dump({'rect': new}, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('\n-> %s' % OUT)

# per-base 汇总（收紧后按内容尺寸）
from collections import defaultdict
agg = defaultdict(list)
for k, (x, y, w, h) in new.items():
    agg[k.split('_')[0]].append((w, h))
print('\n--- tightened per-base ---')
for b, arr in agg.items():
    ws = [a[0] for a in arr]; hs = [a[1] for a in arr]
    print('%-10s n=%2d  W %3d..%3d  H %3d..%3d' % (b, len(arr), min(ws), max(ws), min(hs), max(hs)))
