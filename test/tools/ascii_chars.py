# -*- coding: utf-8 -*-
"""把「武侠修仙免费包」20 位角色的关键帧渲染成文字点阵。
用途：在无图形环境下核对主角长相、挑选 NPC 角色。
每格 = 该角色 R11(正面站立) / R9(侧面站立) 的中立帧，缩到 13×13 字符。
"""
import glob
import os
import sys

import numpy as np
from PIL import Image

SRC = 'C:/Users/Lenovo/WorkBuddy/text_game/AssetLibrary/武侠修仙/动作表'
FX = 64
COLS = 6
ROW_FRONT = 10   # 0 基：R11 正面站立
ROW_SIDE = 8     # 0 基：R9 侧面向左


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


def ascii_cell(im, cw=13, chh=13):
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
            line.append('.' if op.mean() < 0.22 else
                        ch(*[int(v) for v in blk[op][:, :3].mean(0)]))
        out.append(''.join(line))
    return out


def neutral(im, row):
    best, bw = 0, 10 ** 9
    for c in range(COLS):
        bb = im.crop((c * FX, row * FX, c * FX + FX, row * FX + FX)).getbbox()
        if bb and (bb[2] - bb[0]) < bw:
            bw, best = bb[2] - bb[0], c
    return best


def main():
    files = sorted(glob.glob(os.path.join(SRC, '*.png')))
    per_row = 5
    for base in range(0, len(files), per_row):
        band = files[base:base + per_row]
        lab = ''
        for k, f in enumerate(band):
            lab += ('#%d %s' % (base + k + 1, os.path.basename(f)[:9])).ljust(16)[:16]
        print(lab)
        arts = []
        for f in band:
            im = Image.open(f)
            nf, ns = neutral(im, ROW_FRONT), neutral(im, ROW_SIDE)
            arts.append((ascii_cell(im.crop((nf * FX, ROW_FRONT * FX, nf * FX + FX, ROW_FRONT * FX + FX)), 8, 13),
                         ascii_cell(im.crop((ns * FX, ROW_SIDE * FX, ns * FX + FX, ROW_SIDE * FX + FX)), 8, 13)))
        for r in range(13):
            line = ''
            for k in range(len(band)):
                line += (arts[k][0][r] + arts[k][1][r]).ljust(16)
            print(line)
        print()


if __name__ == '__main__':
    main()
