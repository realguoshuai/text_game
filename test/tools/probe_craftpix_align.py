# -*- coding: utf-8 -*-
"""量测 CraftPix 素材在原始 128x128 格内的摆位，用于决定对齐锚点策略。

关心三件事：
  1. 各帧 bbox 的底边 (y1) 是否稳定 —— 决定能否直接整格缩放（保留美术对齐）
  2. 水平中心 (cx) 是否稳定
  3. 各动作帧数
"""
import os
from PIL import Image

SUCAI = r'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/sucai'
CELL = 128
PACKS = [
    ('craftpix-net-506778-free-vampire-pixel-art-sprite-sheets',
     ['Converted_Vampire', 'Countess_Vampire', 'Vampire_Girl']),
    ('craftpix-net-453698-free-shinobi-sprites-pixel-art',
     ['Fighter', 'Samurai', 'Shinobi']),
]
ACTS = ['Idle', 'Walk', 'Run', 'Attack_1', 'Attack_2', 'Dead']


def probe(folder_path, act):
    p = os.path.join(folder_path, act + '.png')
    if not os.path.exists(p):
        return None
    im = Image.open(p).convert('RGBA')
    n = max(1, im.width // CELL)
    ys, cxs, ws, hs = [], [], [], []
    for i in range(n):
        cell = im.crop((i * CELL, 0, (i + 1) * CELL, CELL))
        bb = cell.getchannel('A').getbbox()
        if bb is None:
            continue
        x0, y0, x1, y1 = bb
        ys.append(y1 - 1)          # 底边（含端点）
        cxs.append((x0 + x1 - 1) / 2.0)
        ws.append(x1 - x0)
        hs.append(y1 - y0)
    if not ys:
        return None
    return {'n': n, 'y1': ys, 'cx': cxs, 'w': ws, 'h': hs}


def rng(v):
    return '%.0f~%.0f' % (min(v), max(v)) if v else '-'


for pack, sets in PACKS:
    for s in sets:
        d = os.path.join(SUCAI, pack, s)
        if not os.path.isdir(d):
            print('(missing) %s/%s' % (pack, s))
            continue
        print('=== %s' % s)
        for act in ACTS:
            r = probe(d, act)
            if not r:
                print('   %-10s (no file)' % act)
                continue
            print('   %-10s frames=%-2d  底边=%-9s 水平中心=%-12s 宽=%-9s 高=%-9s'
                  % (act, r['n'], rng(r['y1']), rng(r['cx']), rng(r['w']), rng(r['h'])))
