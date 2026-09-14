# -*- coding: utf-8 -*-
"""把每个图块的「宽度轮廓」压成一行数字，用来判读形状。

思路：本环境读不了图片像素，但能读文本。人形轮廓有极典型的宽度特征：
  窄（头）→ 收（颈）→ 突然变宽（肩/袖）→ 中段平 → 底部收或分叉（腿/袍摆）。
把每行不透明像素数归一成 0~9 的数字串，人形一眼可辨；柱子是「上宽下宽、无颈」，
树/云是「连续凸起」。
"""
import os
import sys
import numpy as np
from PIL import Image

D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'assets', 'sliced')
STEP = 24          # 把高度采成 24 段
only = sys.argv[1:]


def profile(path):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im)
    mask = a[:, :, 3] > 24
    H, W = mask.shape
    rows = []
    for i in range(STEP):
        y0 = int(i * H / STEP)
        y1 = max(y0 + 1, int((i + 1) * H / STEP))
        rows.append(mask[y0:y1].sum(1).max() if y1 > y0 else 0)
    mx = max(rows) or 1
    return ''.join(str(int(round(r / mx * 9))) for r in rows), mx, W, H


def main():
    files = sorted(f for f in os.listdir(D) if f.endswith('.png') and not f.startswith('_'))
    print('file'.ljust(30), 'w x h'.ljust(11), 'maxW', '  宽度轮廓 上→下（0=无，9=最宽）')
    for f in files:
        if only and not any(o in f for o in only):
            continue
        s, mx, W, H = profile(os.path.join(D, f))
        print(f.ljust(30), (f'{W}x{H}').ljust(11), str(mx).rjust(4), ' ', s)


main()
