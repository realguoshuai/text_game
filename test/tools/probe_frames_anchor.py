#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
probe_frames_anchor.py —— 「每帧一个 PNG（画布按内容紧裁）」类素材的锚点探针。

背景：CraftPix 的某些包（如小僵尸）不提供 sprite sheet，而是把每个动作导出成
一串单独 PNG，且每张画布的尺寸都紧贴内容 —— 导出时把「原画布偏移」丢掉了，
于是帧与帧之间的相对位置信息全部丢失。直接按左边缘对齐会看到角色在走 / 跑 /
倒地时整只左右乱窜。

本脚本的作用：把几种候选锚点的**帧间离散度**量出来，并生成并排对照条，
交给眼睛判定哪种对齐最像「原地动画」。

用法：
  python test/tools/probe_frames_anchor.py <动作目录> <动作前缀1> [前缀2 ...]
例：
  python test/tools/probe_frames_anchor.py sucai/小僵尸/PNG/Zombie1/animation Idle Walk Run Attack Hurt Dead
输出：
  _anchor_probe.png   —— 每种锚点一行，每行动作的帧按该锚点对齐后并排
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFont

FONT = 'C:/Windows/Fonts/msyh.ttc'


def natural(name):
    n = ''.join(c for c in name if c.isdigit())
    return int(n) if n else 0


def mask_brown(px):
    r, g, b, a = px
    return a > 200 and r > 110 and 25 < r - g < 70 and 15 < g - b < 70   # 上衣（躯干）


def mask_blue(px):
    r, g, b, a = px
    return a > 200 and b > 110 and b > r + 45 and b > g + 25              # 短裤（骨盆）


def anchors(im):
    """返回几种候选锚点（帧内 x 像素）与内容信息。"""
    W, H = im.size
    px = im.load()
    all_x, brown_x, blue_x = [], [], []
    ys = []
    for y in range(H):
        hit = False
        for x in range(W):
            p = px[x, y]
            if p[3] > 64:
                hit = True
                all_x.append(x)
            if mask_brown(p):
                brown_x.append(x)
            if mask_blue(p):
                blue_x.append(x)
        if hit:
            ys.append(y)
    if not ys:
        return None
    t, b = min(ys), max(ys)
    hh = max(1, b - t)
    head_x = [x for y in range(t, t + int(hh * 0.25)) for x in range(W) if px[x, y][3] > 64]
    mid_x = [x for y in range(t + int(hh * 0.45), t + int(hh * 0.75)) for x in range(W) if px[x, y][3] > 64]
    avg = lambda a: (sum(a) / len(a)) if a else None
    return {
        'all': avg(all_x), 'brown': avg(brown_x), 'blue': avg(blue_x),
        'head': avg(head_x), 'mid': avg(mid_x), 'top': t, 'bottom': b,
    }


def main():
    d = sys.argv[1]
    groups = sys.argv[2:] or ['Idle', 'Walk', 'Run']
    files = {}
    for g in groups:
        fs = [f for f in os.listdir(d) if f.startswith(g) and f.lower().endswith('.png')]
        files[g] = sorted(fs, key=natural)
    imgs = {g: [Image.open(os.path.join(d, f)).convert('RGBA') for f in fs] for g, fs in files.items()}
    A = {g: [anchors(i) for i in ims] for g, ims in imgs.items()}

    CANDS = ['all', 'brown', 'blue', 'mid']
    print('%-8s %-38s %s' % ('动作', '各帧锚点（all/brown/blue/mid）', '离散度'))
    for g in groups:
        row = []
        for k in CANDS:
            vs = [round(a[k]) for a in A[g] if a[k] is not None]
            row.append('%s rng=%d' % (','.join(map(str, vs)), (max(vs) - min(vs)) if vs else -1))
        print('%-8s %s' % (g, '  |  '.join(row)))

    # ---- 对照条：每行 = 一种锚点，格宽取该动作最大帧宽 ----
    SCALE = 0.55
    CW = int(max(i.width for ims in imgs.values() for i in ims) * SCALE) + 12
    CH = int(max(i.height for ims in imgs.values() for i in ims) * SCALE) + 24
    font = ImageFont.truetype(FONT, 14)
    fsm = ImageFont.truetype(FONT, 13)
    rows = []
    for k in CANDS:
        for g in groups:
            cells = []
            for im, a in zip(imgs[g], A[g]):
                if a[k] is None:
                    cells.append(None)
                    continue
                small = im.resize((max(1, int(im.width * SCALE)), max(1, int(im.height * SCALE))), Image.LANCZOS)
                # 把锚点对到格中心：粘贴点 = 格左 + (格中心 - 锚点缩放后位置)
                off = int(CW / 2 - a[k] * SCALE)
                cells.append((small, off))
            rows.append(('%s / %s' % (k, g), cells))
    out = Image.new('RGBA', (CW * 10 + 20, CH * len(rows) + 40), (24, 26, 36, 255))
    d2 = ImageDraw.Draw(out)
    d2.text((10, 10), '锚点候选对照：每格中心 = 该锚点（all=整体重心 brown=上衣躯干 blue=短裤骨盆 mid=腰段）',
            font=font, fill=(230, 238, 255))
    y = 34
    for label, cells in rows:
        d2.text((10, y), label, font=fsm, fill=(150, 200, 255))
        for c, cell in enumerate(cells):
            if cell is None:
                continue
            small, off = cell
            out.alpha_composite(small, (c * CW + off, y + 20 + (CH - 24 - small.height)))
        y += CH
    out.convert('RGB').save('_anchor_probe.png')
    print('\n已写出 _anchor_probe.png（%d x %d）' % out.size)


if __name__ == '__main__':
    main()
