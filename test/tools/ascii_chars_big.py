# -*- coding: utf-8 -*-
"""放大渲染指定编号角色的正面/侧面中立帧（文字点阵）。
用法：python ascii_chars_big.py 1 6 10 14 18 19
"""
import glob
import os
import sys

import numpy as np
from PIL import Image

SRC = 'C:/Users/Lenovo/WorkBuddy/text_game/AssetLibrary/武侠修仙/动作表'
FX, COLS = 64, 6
ROW_FRONT, ROW_SIDE = 10, 8


def ch(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    lum = (r + g + b) / 3
    if mx - mn < 24:
        return '@' if lum > 205 else ('+' if lum > 130 else ('=' if lum > 70 else '#'))
    if r > g and r > b:
        return 'S' if (g > b + 24 and lum > 145) else 'R'
    if g >= r and g >= b:
        return 'C' if b > r + 20 else 'G'
    return 'B'


def cell(im, cw, chh):
    a = np.asarray(im.convert("RGBA")).astype(int)
    h, w = a.shape[:2]
    out = []
    for j in range(chh):
        y0 = int(j * h / chh); y1 = max(y0 + 1, int((j + 1) * h / chh))
        line = []
        for i in range(cw):
            x0 = int(i * w / cw); x1 = max(x0 + 1, int((i + 1) * w / cw))
            blk = a[y0:y1, x0:x1]
            op = blk[:, :, 3] > 28
            line.append('.' if op.mean() < 0.2 else ch(*[int(v) for v in blk[op][:, :3].mean(0)]))
        out.append(''.join(line))
    return out


def neutral(im, row):
    best, bw = 0, 10 ** 9
    for c in range(COLS):
        bb = im.crop((c * FX, row * FX, c * FX + FX, row * FX + FX)).getbbox()
        if bb and (bb[2] - bb[0]) < bw:
            bw, best = bb[2] - bb[0], c
    return best


files = sorted(glob.glob(os.path.join(SRC, '*.png')))
idxs = [int(x) for x in sys.argv[1:]] or [1]
CW, CH = 22, 31
for base in range(0, len(idxs), 3):
    band = idxs[base:base + 3]
    lab = ''
    for k in band:
        lab += ('#%d %s' % (k, os.path.basename(files[k - 1])[:10])).ljust(CW * 2 + 4)[:CW * 2 + 4]
    print(lab)
    arts = []
    for k in band:
        im = Image.open(files[k - 1])
        nf, ns = neutral(im, ROW_FRONT), neutral(im, ROW_SIDE)
        arts.append((cell(im.crop((nf * FX, ROW_FRONT * FX, nf * FX + FX, ROW_FRONT * FX + FX)), CW, CH),
                     cell(im.crop((ns * FX, ROW_SIDE * FX, ns * FX + FX, ROW_SIDE * FX + FX)), CW, CH)))
    for r in range(CH):
        print(''.join((a[0][r] + ' | ' + a[1][r]) .ljust(CW * 2 + 4) for a in arts))
    print()
