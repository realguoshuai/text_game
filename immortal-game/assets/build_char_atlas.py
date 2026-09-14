#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从「Ronin Pixel Forge · 武侠修仙免费包」生成游戏用的角色图集。

用法：
  1. 下载免费包并解压到某个目录（默认 ../_assets_probe/extracted）：
       https://frameronin.com/free-character-library/wuxia-xianxia-free-pack.zip
     包里是 20 张 384×832 的动作表（6 列 × 13 行，单帧 64×64）。
  2. pip install Pillow
  3. python assets/build_char_atlas.py [解压目录]
  4. 产物：assets/char_sword.png / char_thunder.png / char_blade.png
     规格 384×320 = 6 列 × 5 行 × 64，行序见下（game.js 的 SPRITE_ROWS 依赖此顺序）。

源表行号（0 基，已实测核对）：
  3  正面待机   7  正面行走   8  侧面行走（朝左，朝右时镜像）   9  背面行走   12  背面待机
  注意 4/6 是只有 3 帧的残行，不能用。

另外：每一行会把「包围盒最窄」的一帧（双脚并拢，最中性的姿势）旋转到第 0 帧，
这样游戏里站立时直接取第 0 帧就不会是劈叉 / 抬腿的姿势。旋转对循环动画无影响
（循环的旋转仍是同一个循环）。
"""
import glob
import os
import sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '_assets_probe', 'extracted')
OUT = HERE

SRC_ROWS = [3, 7, 8, 9, 12]          # 正面待机 / 正面走 / 侧面走 / 背面走 / 背面待机
PICK = [                             # 输出名 -> 免费包里的文件名前缀（按主色调挑的三位）
    ('sword',   '1787919847862'),    # 蓝袍白发 -> 御剑仙
    ('thunder', '1787896671002'),    # 紫袍     -> 雷法真君
    ('blade',   '1787901929352'),    # 赤袍     -> 赤焰刀客
]


def find(prefix):
    for p in sorted(glob.glob(os.path.join(SRC, '*.png'))):
        if os.path.basename(p).startswith(prefix):
            return p
    raise SystemExit('免费包里找不到 %s 开头的 PNG，解压目录对吗？%s' % (prefix, SRC))


def neutral_index(im, r):
    """该行里包围盒最窄（双脚并拢）的一帧"""
    best, bw = 0, 10 ** 9
    for c in range(6):
        bb = im.crop((c * 64, r * 64, c * 64 + 64, r * 64 + 64)).getbbox()
        if bb is None:
            continue
        w = bb[2] - bb[0]
        if w < bw:
            bw, best = w, c
    return best


def main():
    for cid, prefix in PICK:
        src = Image.open(find(prefix)).convert('RGBA')
        if src.size != (384, 832):
            raise SystemExit('%s 尺寸异常：%s，应为 384×832' % (prefix, src.size))
        atlas = Image.new('RGBA', (6 * 64, 5 * 64), (0, 0, 0, 0))
        for out_r, src_r in enumerate(SRC_ROWS):
            n = neutral_index(src, src_r)
            for c in range(6):
                sc = (c + n) % 6
                atlas.paste(src.crop((sc * 64, src_r * 64, sc * 64 + 64, src_r * 64 + 64)),
                            (c * 64, out_r * 64))
        dst = os.path.join(OUT, 'char_%s.png' % cid)
        atlas.save(dst, optimize=True)
        print('%-8s -> %-18s %.1f KB' % (cid, os.path.basename(dst), os.path.getsize(dst) / 1024))


if __name__ == '__main__':
    main()
