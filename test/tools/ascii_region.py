# -*- coding: utf-8 -*-
"""把源图的指定矩形区域渲染成文字点阵。
用法：python ascii_region.py <图片> <x0> <y0> <x1> <y1> <step>
"""
import os
import sys

import numpy as np
from PIL import Image


def ch(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    lum = (r + g + b) / 3
    sat = mx - mn
    if sat < 22:
        if lum > 215: return 'W'
        if lum > 170: return 'w'
        if lum > 112: return '='
        if lum > 62:  return '+'
        return '#'
    if b >= r and b >= g:
        if lum > 196 and b - r > 24: return '.'
        if b - r > 60 and lum < 150: return 'b'
        return '~'
    if g >= r and g >= b:
        if b - g > 30: return '~'
        return 'G' if lum > 95 else 'g'
    if r - b > 52:
        if g > b + 34 and r - g > 46: return 'o'
        return 'R'
    return 'm'


p = sys.argv[1]
x0, y0, x1, y1, step = (int(v) for v in sys.argv[2:7])
im = Image.open(p).convert("RGB").crop((x0, y0, x1, y1))
a = np.asarray(im).astype(int)
H, W = a.shape[:2]
print(f"===== 区域 ({x0},{y0})-({x1},{y1})  {W}x{H}  step={step} =====")
print('    ' + ''.join(str(((x // step) + x0 // step) % 10) if (x // step) % 10 == 0 else ' '
                         for x in range(0, W, step)))
for y in range(0, H, step):
    line = []
    for x in range(0, W, step):
        blk = a[y:y + step, x:x + step].reshape(-1, 3)
        med = np.median(blk, axis=0)
        line.append(ch(int(med[0]), int(med[1]), int(med[2])))
    print(f"{y0 + y:4d}" + ''.join(line))
print("图例: .天蓝 ~蓝 w浅 W亮 =中灰 +暗灰 #黑 G绿 g深绿 o橙棕 R红 m品红 b深蓝")
