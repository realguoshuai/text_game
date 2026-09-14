# -*- coding: utf-8 -*-
"""
把「武侠修仙免费包」的任意角色动作表，转成本游戏要的 6 列 × 5 行 × 64px 图集。
主角与 NPC 共用同一套规格与同一份代码，只是源角色和输出路径不同。

游戏侧规格（js/game.js 的 SHEET 常量）：
  行 0 = down（正面走）   行 1 = right（右走）   行 2 = left（左走）
  行 3 = up（背面走）     行 4 = 正面站立（待机）
  每行 6 帧，单帧 64×64，整表 384×320，PNG 带 alpha。

免费包行号（0 基，见 AssetLibrary/武侠修仙/INDEX.md）：
  7 = 向下行走   8 = 向左行走（向右时水平镜像）   9 = 向上行走   10 = 正面站立
包内没有独立的「向右走」行，所以右向由左向整格水平镜像得到。

每行都会把「包围盒最窄」的帧转到第 0 帧：站立时取第 0 帧，
这样站着不会是劈叉/抬腿的中间姿势（对循环动画无影响）。

用法：
  python build_player_atlas.py                 # 主角（默认角色）+ 4 名 NPC，全量重建
  python build_player_atlas.py --hero 6        # 换第 6 号角色当主角并重建
  python build_player_atlas.py --list          # 生成 20 人编号总览，便于挑人
"""
import glob
import os
import sys

from PIL import Image, ImageDraw, ImageOps

SRC = 'C:/Users/Lenovo/WorkBuddy/text_game/AssetLibrary/武侠修仙/动作表'
DEST = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # -> test/
OUT_HERO = os.path.join(DEST, 'assets', 'char_hero.png')
RAW = 'C:/Users/Lenovo/WorkBuddy/text_game/2d_game_assets_raw'

FX, COLS, ROWS = 64, 6, 13
SRC_ROW = {'down': 7, 'left': 8, 'up': 9, 'idle': 10}

# 主角：官方 Godot 示例的默认角色（包内 1 号），深色头发 + 红道袍
HERO = 1
# NPC：四人四色，尽量拉开辨识度（绿袍 / 蓝衫 / 白衣 / 赤袍）
NPC_PICKS = [14, 10, 18, 20]
# 游戏内「主角外形」可切换的编号（须与 js/game.js 的 HERO_OPTIONS 一致）。
# 这些角色同时兼任 NPC，所以只建一份图集，游戏侧用两个名字引用同一文件。
HERO_CHOICES = [HERO, 5, 10, 14, 18, 20]


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


def build(sheet_name, out_png, preview=None, label=''):
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
    os.makedirs(os.path.dirname(out_png), exist_ok=True)
    atlas.save(out_png, optimize=True)
    print('图集 -> %-46s %dx%d  %.1f KB  (%s)' % (
        os.path.relpath(out_png, DEST).replace('\\', '/'), atlas.size[0], atlas.size[1],
        os.path.getsize(out_png) / 1024, label or sheet_name))

    if preview:
        S = 3
        prev = Image.new('RGBA', (COLS * FX * S, 5 * FX * S + 5 * 26), (24, 32, 48, 255))
        d = ImageDraw.Draw(prev)
        labels = ['down 正面', 'right 右（镜像）', 'left 左', 'up 背面', 'idle 待机']
        for r in range(5):
            d.text((6, r * (FX * S + 26) + 6), labels[r], fill=(255, 230, 166, 255))
            for c in range(COLS):
                cell = atlas.crop((c * FX, r * FX, c * FX + FX, r * FX + FX)).resize((FX * S, FX * S), Image.NEAREST)
                prev.paste(cell, (c * FX * S, r * (FX * S + 26) + 24), cell)
        os.makedirs(os.path.dirname(preview), exist_ok=True)
        prev.save(preview)
        print('   预览 -> %s' % preview)


def contact():
    """20 位角色编号总览（正面站立 + 侧面站立），供用户一句话换人"""
    fs = sheets()
    S, PAD, TXT = 2, 8, 22
    cw, ch = FX * 2 * S, FX * S
    cols = 5
    rows = (len(fs) + cols - 1) // cols
    W = cols * (cw + PAD) + PAD
    H = rows * (ch + TXT + PAD) + PAD + 30
    img = Image.new('RGBA', (W, H), (22, 28, 42, 255))
    d = ImageDraw.Draw(img)
    d.text((PAD, 8), '武侠修仙免费包 20 位角色（编号=总览序号；主角与 NPC 均可按编号指定）', fill=(255, 230, 166, 255))
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
        tag = '  <主角' if i + 1 == HERO else ('  <NPC' if i + 1 in NPC_PICKS else '')
        d.text((x + 3, y + ch + 4), '%2d  %s%s' % (i + 1, os.path.basename(f)[:11], tag),
               fill=(180, 220, 255, 255))
    os.makedirs(RAW, exist_ok=True)
    p = os.path.join(RAW, '角色可选_20位编号.png')
    img.save(p)
    print('编号总览 -> %s  %dx%d' % (p, W, H))


def build_all(hero=HERO):
    fs = sheets()
    build(os.path.basename(fs[hero - 1]), OUT_HERO,
          os.path.join(RAW, 'char_hero_preview.png'), label='主角 #%d' % hero)
    # NPC 图集 + 主角外形候选（去重；主角自己已写成 char_hero.png）
    for k in sorted((set(NPC_PICKS) | set(HERO_CHOICES)) - {hero}):
        out = os.path.join(DEST, 'assets', 'npc_%d.png' % k)
        tag = 'NPC' if k in NPC_PICKS else '外形候选'
        build(os.path.basename(fs[k - 1]), out,
              os.path.join(RAW, 'npc_%d_preview.png' % k), label='%s #%d' % (tag, k))
    print('行序  : 0正面走 1右走(镜像) 2左走 3背面走 4正面站立(待机)')
    print('主角可选: ' + ', '.join('%d号 -> %s' % (
        k, 'assets/char_hero.png' if k == HERO else 'assets/npc_%d.png' % k) for k in HERO_CHOICES))


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == '--list':
        contact()
    elif args and args[0] == '--hero':
        hero = int(args[1])
        build(os.path.basename(sheets()[hero - 1]), OUT_HERO,
              os.path.join(RAW, 'char_hero_preview.png'), label='主角 #%d' % hero)
    else:
        build_all()
