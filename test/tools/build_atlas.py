# -*- coding: utf-8 -*-
"""
build_atlas.py —— 把零散 PNG 打包成三张图集，减少首屏请求数

为什么做这件事：
    首屏慢主要慢在「请求数」而不是「字节数」。每个文件都要单独发一次请求，
    而浏览器对同域并发有上限（通常 6），43 个图块 + 6 张角色图 = 49 次请求，
    排队本身就要好几秒。打成 3 张图后：49 -> 3。

三个包：
    tiles_atlas.png   43 个地图图块（地面 + 建筑/道具/装饰）   2026x291 宽的长条
    chars_atlas.png    6 张角色动作表（主角 1 + 兼任 NPC 的 5），3 列 x 2 行 @384x320
    foes_atlas.png    12 只妖兽（来自同仓库 2D 坊市游戏）

像素数据原样搬运，不缩放、不量化 —— 画质零损失。
（试过限量调色板：256 色只省 15% 体积，却会在天空/水面上引入色带，不值。）

输出：
    <atlas>.png  +  <atlas>.json   { 名字: [x, y, w, h] }
"""
import argparse
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
SHOT = os.path.dirname(HERE)                      # .../test
ASSETS = os.path.join(SHOT, 'assets')
SLICED = os.path.join(ASSETS, 'sliced')
FOES = os.path.join(ASSETS, 'foes')

PAD = 4
MAX_W = 2048


def shelf_pack(items, max_w=MAX_W, pad=PAD):
    """按高度降序逐行摆放（shelf packing）。返回 (摆放表, 画布宽, 画布高)。"""
    order = sorted(items, key=lambda kv: (-kv[1].height, -kv[1].width))
    placed, x, y, row_h = [], 0, 0, 0
    for name, im in order:
        w, h = im.size
        if x + w + pad > max_w:
            x, y, row_h = 0, y + row_h + pad, 0
        placed.append((name, x, y, w, h, im))
        x += w + pad
        row_h = max(row_h, h)
    used_w = max((px + w for _, px, _, w, _, _ in placed), default=0) + pad
    return placed, used_w, y + row_h + pad


def write_atlas(tag, items, out_png, out_json):
    if not items:
        print('  !! %s 无素材，跳过' % tag)
        return None
    placed, W, H = shelf_pack(items)
    sheet = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    meta = {}
    for name, x, y, w, h, im in placed:
        sheet.paste(im, (x, y))
        meta[name] = [x, y, w, h]
    sheet.save(out_png, optimize=True)
    json.dump(meta, open(out_json, 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    old = sum(os.path.getsize(os.path.join(os.path.dirname(os.path.join(ASSETS, n)), ''))
              if os.path.isabs(n) else 0 for n in [])  # placeholder, 下面单独统计
    size = os.path.getsize(out_png)
    print('  %-16s %4d 项 -> %dx%d  %6.0f KB  (1 个请求)' %
          (os.path.basename(out_png), len(meta), W, H, size / 1024))
    return {'count': len(meta), 'bytes': size, 'json': meta}


# ---------------- 1) 地图图块 ----------------
def build_tiles():
    print('[1/3] 地图图块')
    d = json.load(open(os.path.join(ASSETS, 'maps.json'), encoding='utf-8'))
    names = set(d['tilePalette'].values())
    for m in d['maps']:
        for o in m['objects']:
            names.add(o['piece'])
        # groundTop：build_ground_tops.py 派生的「无接缝顶面瓦 + 变体」
        for vs in (m.get('groundTop') or {}).values():
            names.update(vs)
    items, missing, total = [], [], 0
    # 有自己独立图集的来源，不受主图集管辖 —— 这里跳过，否则同一张图会同时进
    # 两个图集、首屏体积白涨。新增「自带图集的素材来源」时把前缀加进来即可。
    OWN_ATLAS = ('dungeon/', 'flare/')
    for n in sorted(names):
        # 地宫素材有独立的 dungeon_atlas（build_dungeon_atlas.py），这里跳过，
        # 否则 55 张墙/家具会白白塞进 tiles 图集、把首屏体积抬上去。
        # flare/ 是 import_tmx.py 导出的外来地图（Flare 战役关卡），自带
        # flare_atlas（见该脚本），同理跳过。
        if n.startswith(OWN_ATLAS):
            continue
        p = os.path.join(SLICED, n)
        if not os.path.exists(p):
            p = os.path.join(ASSETS, n)      # ground/ 等派生素材直接放在 assets 下
        if os.path.exists(p):
            items.append((n, Image.open(p).convert('RGBA')))
            total += os.path.getsize(p)
        else:
            missing.append(n)
    r = write_atlas('tiles', items, os.path.join(ASSETS, 'tiles_atlas.png'),
                    os.path.join(ASSETS, 'tiles_atlas.json'))
    if missing:
        print('  !! 缺 %d 个: %s' % (len(missing), ', '.join(missing[:6])))
    return total, r


# ---------------- 2) 角色动作表 ----------------
def build_chars():
    """6 张 384x320 的动作表，按 3 列 x 2 行摆成一张 1152x640。
    不用 shelf packing：规格完全一致，规则网格最省空间、出问题也好对坐标。"""
    print('[2/3] 角色动作表')
    files = ['char_hero.png', 'npc_5.png', 'npc_10.png', 'npc_14.png', 'npc_18.png', 'npc_20.png']
    items, total, cols = [], 0, 3
    size = None
    for f in files:
        p = os.path.join(ASSETS, f)
        if not os.path.exists(p):
            print('  !! 缺', f)
            continue
        im = Image.open(p).convert('RGBA')
        size = im.size
        items.append((f, im))
        total += os.path.getsize(p)
    if not items:
        return 0, None
    cw, ch = size
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * cw, rows * ch), (0, 0, 0, 0))
    meta = {}
    for i, (name, im) in enumerate(items):
        x, y = (i % cols) * cw, (i // cols) * ch
        sheet.paste(im, (x, y))
        meta[name] = [x, y, cw, ch]
    out = os.path.join(ASSETS, 'chars_atlas.png')
    sheet.save(out, optimize=True)
    json.dump(meta, open(os.path.join(ASSETS, 'chars_atlas.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    print('  %-16s %4d 项 -> %dx%d  %6.0f KB  (1 个请求)' %
          ('chars_atlas.png', len(meta), cols * cw, rows * ch, os.path.getsize(out) / 1024))
    return total, {'count': len(meta), 'bytes': os.path.getsize(out), 'json': meta}


# ---------------- 3) 妖兽 ----------------
def build_foes():
    print('[3/3] 妖兽')
    if not os.path.isdir(FOES):
        print('  !! 没有 assets/foes/，先跑 slice_foes.py')
        return 0, None
    items, total = [], 0
    for f in sorted(os.listdir(FOES)):
        if not f.endswith('.png'):
            continue
        p = os.path.join(FOES, f)
        items.append((f, Image.open(p).convert('RGBA')))
        total += os.path.getsize(p)
    r = write_atlas('foes', items, os.path.join(ASSETS, 'foes_atlas.png'),
                    os.path.join(ASSETS, 'foes_atlas.json'))
    return total, r


def main():
    ap = argparse.ArgumentParser(description='重建图集。')
    ap.add_argument('--only', default='all', choices=['all', 'tiles', 'chars', 'foes'],
                    help='只重建其中一个。⚠ 本脚本的 chars / foes 分支已过时——它们现在分别由 '
                         'build_chars_atlas.py 与 build_beasts_atlas.py 负责，直接全量跑会把'
                         '角色与怪物图集打回精简版。日常只跑 --only tiles。')
    args = ap.parse_args()

    t0 = t1 = t2 = 0
    tiles = chars = foes = None
    if args.only in ('all', 'tiles'):
        t0, tiles = build_tiles()
    if args.only in ('all', 'chars'):
        t1, chars = build_chars()
    if args.only in ('all', 'foes'):
        t2, foes = build_foes()
    print()
    print('分散总计 : %6.0f KB / %d 个请求' % ((t0 + t1 + t2) / 1024,
          (tiles or {}).get('count', 0) + (chars or {}).get('count', 0) + (foes or {}).get('count', 0)))
    print('图集总计 : %6.0f KB / 3 个请求' % (
        ((tiles or {}).get('bytes', 0) + (chars or {}).get('bytes', 0) + (foes or {}).get('bytes', 0)) / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
