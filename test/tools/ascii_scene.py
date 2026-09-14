# -*- coding: utf-8 -*-
"""把整张场景图渲染成文字点阵，用于在无图形环境下判断画面内容与布局。
用法：python ascii_scene.py <图片路径> [step]
"""
import os
import sys

import numpy as np
from PIL import Image


def ch(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    lum = (r + g + b) / 3
    sat = mx - mn
    if sat < 22:                       # 灰阶
        if lum > 215: return 'W'
        if lum > 170: return 'w'
        if lum > 112: return '='
        if lum > 62:  return '+'
        return '#'
    if b >= r and b >= g:              # 蓝系
        if lum > 196 and b - r > 24:  return '.'    # 天空/背景浅蓝 → 留白
        if b - r > 60 and lum < 150:  return 'b'    # 深蓝（深水/影）
        return '~'                                   # 蓝（水/瓦）
    if g >= r and g >= b:              # 绿系
        if b - g > 30: return '~'                    # 偏蓝的青
        return 'G' if lum > 95 else 'g'              # 草绿 / 深绿
    # 红系
    if r - b > 52:
        if g > b + 34 and r - g > 46: return 'o'     # 橙棕（木/土）
        return 'R'                                    # 红
    return 'm'                                        # 品红/紫粉


def main():
    p = sys.argv[1]
    step = int(sys.argv[2]) if len(sys.argv) > 2 else 12
    im = Image.open(p).convert("RGB")
    a = np.asarray(im).astype(int)
    H, W = a.shape[:2]
    print(f"===== {os.path.basename(p)}  {W}x{H}  step={step} =====")
    # 列标尺（每 10 格标一次列号，便于定位）
    hdr = ''.join(str((x // step // 10) % 10) if (x // step) % 10 == 0 else ' ' for x in range(0, W, step))
    print('    ' + hdr)
    for y in range(0, H, step):
        line = []
        for x in range(0, W, step):
            blk = a[y:y + step, x:x + step].reshape(-1, 3)
            # 多数表决：取该块的代表色（中位数）
            med = np.median(blk, axis=0)
            line.append(ch(int(med[0]), int(med[1]), int(med[2])))
        print(f"{y:4d}" + ''.join(line))
    print("图例: ~天蓝 b深蓝 c青 G绿 g深绿 o橙棕 R红 m品红 W亮 w浅 =中灰 +暗灰 #黑")


if __name__ == '__main__':
    main()
