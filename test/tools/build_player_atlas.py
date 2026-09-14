# -*- coding: utf-8 -*-
"""
把「武侠修仙免费包」的某位角色动作表，转成本游戏要的 6 列 × 5 行 × 64px 玩家图集。

游戏侧规格（js/game.js 的 SHEET 常量）：
  行 0 = down（正面走）   行 1 = right（右走）   行 2 = left（左走）
  行 3 = up（背面走）     行 4 = 备用（正面站立待机）
  每行 6 帧，单帧 64×64，整表 384×320，PNG 带 alpha。

免费包行号（0 基，见 AssetLibrary/武侠修仙/INDEX.md）：
  7 = 向下行走   8 = 向左行走（向右时水平镜像）   9 = 向上行走   10 = 正面站立
包内没有独立的「向右走」行，所以右向由左向整格水平镜像得到。

每行都会把「包围盒最窄」的帧转到第 0 帧：游戏站立时取第 0 帧，
这样站着不会是劈叉/抬腿的中间姿势（对循环动画无影响）。

用法：
  python build_player_atlas.py                  # 用下面 PICK 指定的角色
  python build_player_atlas.py --list CHOICE    # 生成 20 人编号总览，便于换人
  python build_player_atlas.py 20               # 用第 20 号角色（总览里的编号）
"""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageOps

SRC = 'C:/Users/Lenovo/WorkBuddy/text_game/AssetLibrary/武侠修仙/动作表'
DEST = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # -> test/
OUT_ATLAS = os.path.join(DEST, 'assets', 'char_player.png')
OUT_PREVIEW = 'C:/Users/Lenovo/WorkBuddy/text_game/2d_game_assets_raw/char_player_preview.png'
OUT_CHOICE = 'C:/Users/Lenovo/WorkBuddy/text_game/2d_game_assets_raw/角色可选_20位编号.png'

FX, COLS, ROWS = 64, 6, 13
SRC_ROW = {'down': 7, 'left': 8, 'up': 9, 'idle': 10}
# 默认主角：官方 Godot 示例的默认角色（包内 1 号）
PICK = '001-1787889793963-frames64-oldfix2.png'


def sheets():
    return sorted(glob.glob(os.path.join(SRC, '*.png')))


def neutral_index(im, row):
    """该行里包围盒最窄（双脚并拢、姿势最中性）的一帧"""
    best, bw = 0, 10 ** 9
    for c in range(COLS):
        bb = im.crop((c * FX, row * FX, c * FX + FX, row * FX + FX)).getbbox()
        if bb is None:
            continue
        w = bb[2] - bb[0]
        if w < bw:
            bw, best = w, c
    return best


def row_frames(im, row, mirror=False):
    """取一行 6 帧，并把中立帧旋到第 0 帧；mirror=True 时逐格水平镜像"""
    n = neutral_index(im, row)
    out = []
    for c in range(COLS):
        sc = (c + n) % COLS
        cell = im.crop((sc * FX, row * FX, sc * FX + FX, row * FX + FX))
        if mirror:
            cell = ImageOps.mirror(cell)
        out.append(cell)
    return out


def build(sheet_name):
    p = os.path.join(SRC, sheet_name)
    if not os.path.exists(p):
        raise SystemExit('找不到动作表：' + p)
    src = Image.open(p).convert('RGBA')
    if src.size != (FX * COLS, FX * ROWS):
        raise SystemExit('%s 尺寸异常 %s，应为 %d×%d' % (sheet_name, src.size, FX * COLS, FX * ROWS))
    atlas = Image.new('RGBA', (FX * COLS, FX * 5), (0, 0, 0, 0))
    plan = [('down', False), ('left', True), ('left', False), ('up', False), ('idle', False)]
    for r, (key, mirror) in enumerate(plan):
        for c, cell in enumerate(row_frames(src, SRC_ROW[key], mirror)):
            atlas.paste(cell, (c * FX, r * FX))
    os.makedirs(os.path.dirname(OUT_ATLAS), exist_ok=True)
    atlas.save(OUT_ATLAS, optimize=True)
    print('主角图集 -> %s  %dx%d  %.1f KB' % (OUT_ATLAS, atlas.size[0], atlas.size[1],
                                            os.path.getsize(OUT_ATLAS) / 1024))
    print('   源角色: %s' % sheet_name)
    print('   行序  : 0正面走 1右走(镜像) 2左走 3背面走 4正面站立(备用)')

    # 四向预览（3 倍放大 + 行标），便于人工核对方向对不对
    S = 3
    prev = Image.new('RGBA', (COLS * FX * S, 5 * FX * S + 5 * 26), (24, 32, 48, 255))
    d = ImageDraw.Draw(prev)
    labels = ['down 正面', 'right 右（镜像）', 'left 左', 'up 背面', 'idle 备用']
    for r in range(5):
        d.text((6, r * (FX * S + 26) + 6), labels[r], fill=(255, 230, 166, 255))
        for c in range(COLS):
            cell = atlas.crop((c * FX, r * FX, c * FX + FX, r * FX + FX)).resize((FX * S, FX * S), Image.NEAREST)
            prev.paste(cell, (c * FX * S, r * (FX * S + 26) + 24), cell)
    os.makedirs(os.path.dirname(OUT_PREVIEW), exist_ok=True)
    prev.save(OUT_PREVIEW)
    print('四向预览 -> %s  %dx%d' % (OUT_PREVIEW, prev.size[0], prev.size[1]))


def contact():
    """20 位角色编号总览（正面站立 + 背面站立），供用户一句话换人"""
    fs = sheets()
    S, PAD, TXT = 2, 8, 22
    cw, ch = FX * 2 * S, FX * S
    cols = 5
    rows = (len(fs) + cols - 1) // cols
    W = cols * (cw + PAD) + PAD
    H = rows * (ch + TXT + PAD) + PAD + 30
    img = Image.new('RGBA', (W, H), (22, 28, 42, 255))
    d = ImageDraw.Draw(img)
    d.text((PAD, 8), '武侠修仙免费包 20 位角色（编号=总览序号，报数字即可换主角）', fill=(255, 230, 166, 255))
    for i, f in enumerate(fs):
        src = Image.open(f).convert('RGBA')
        nf = neutral_index(src, SRC_ROW['idle'])
        nb = neutral_index(src, SRC_ROW['left'])
        front = src.crop((nf * FX, SRC_ROW['idle'] * FX, nf * FX + FX, SRC_ROW['idle'] * FX + FX))
        side = src.crop((nb * FX, SRC_ROW['left'] * FX, nb * FX + FX, SRC_ROW['left'] * FX + FX))
        r, c = divmod(i, cols)
        x = PAD + c * (cw + PAD)
        y = 30 + PAD + r * (ch + TXT + PAD)
        d.rectangle([x - 1, y - 1, x + cw, y + ch], outline=(90, 110, 150, 255))
        for k, cell in enumerate((front, side)):
            big = cell.resize((FX * S, FX * S), Image.NEAREST)
            img.paste(big, (x + k * FX * S, y + (ch - FX * S) // 2), big)
        d.text((x + 3, y + ch + 4), '%2d  %s' % (i + 1, os.path.basename(f)[:11]), fill=(180, 220, 255, 255))
    os.makedirs(os.path.dirname(OUT_CHOICE), exist_ok=True)
    img.save(OUT_CHOICE)
    print('编号总览 -> %s  %dx%d' % (OUT_CHOICE, W, H))


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == '--list':
        contact()
    else:
        if args:
            i = int(args[0]) - 1
            fs = sheets()
            if not 0 <= i < len(fs):
                raise SystemExit('编号超范围，共 %d 位' % len(fs))
            build(os.path.basename(fs[i]))
        else:
            build(PICK)
