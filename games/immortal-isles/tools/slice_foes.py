# -*- coding: utf-8 -*-
"""
slice_foes.py —— 妖兽图集切片（就地取材）

素材来自同仓库的 2D 坊市游戏：
    ImmortalGame/immortal-game/assets/foes.png  (1200x400, P 模式带 alpha)
    ImmortalGame/immortal-game/assets/foes.json (12 个 [x,y,w,h] 矩形)

本脚本负责：
  1. 按矩形裁出 12 只妖兽，裁掉四周透明边（保留完整外形）
  2. 按「目标身高」用最近邻等比缩放（像素画不允许插值，否则发糊）
  3. 输出到 games/immortal-isles/assets/foes/<name>.png（透明 PNG）
  4. 生成带标注的对照图 + 一份清单，供人工核对切得对不对

为什么要裁透明边：foes.json 的矩形是「大致框」，各边留白不等。
不裁的话，绘制时按「图高对齐脚底」就会让不同妖兽的落地位置参差不齐。
"""
import json
import os
import sys

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # .../ImmortalGame/test
REPO = os.path.dirname(ROOT)                       # .../ImmortalGame
SRC = os.path.join(REPO, 'immortal-game', 'assets', 'foes.png')
RECTS = os.path.join(REPO, 'immortal-game', 'assets', 'foes.json')
DEST = os.path.join(ROOT, 'assets', 'foes')
PREVIEW = os.path.join(HERE, '..', '_analysis')

# 目标身高（屏幕像素，游戏里角色 64px 帧按 2x 绘制 = 128px 高）
# 小怪略矮于主角、精英略高、boss 明显更大 —— 一眼能看出威胁等级
TARGET_H = {
    'boss': 172,
    'elite': 132,
    'normal': 106,
}


def tier(name):
    if name.startswith('boss'):
        return 'boss'
    if name.endswith('_elite'):
        return 'elite'
    return 'normal'


def trim_alpha(im):
    bbox = im.getchannel('A').getbbox()
    return im.crop(bbox) if bbox else im


def diagnostics(im, name):
    """判断是像素画还是平滑插画：像素画颜色数少、硬边比例高。"""
    rgb = im.convert('RGB')
    px = list(rgb.getdata())
    uniq = len(set(px))
    g = rgb.convert('L')
    w, h = g.size
    data = list(g.getdata())
    # 横向相邻差 > 24 视为一条硬边
    hard = tot = 0
    for y in range(h):
        row = data[y * w:(y + 1) * w]
        for x in range(1, w):
            tot += 1
            if abs(row[x] - row[x - 1]) > 24:
                hard += 1
    return uniq, (hard / tot if tot else 0)


def main():
    if not os.path.exists(SRC):
        print('找不到素材：', SRC)
        return 1
    sheet = Image.open(SRC).convert('RGBA')
    rects = json.load(open(RECTS, encoding='utf-8'))
    os.makedirs(DEST, exist_ok=True)

    print('源图集 %s  %s' % (os.path.basename(SRC), sheet.size))
    print('%-16s %-7s %-12s %-12s %-9s %-7s %s' %
          ('name', 'tier', 'rect', 'trimmed', 'colors', 'hard', '输出'))
    print('-' * 78)

    manifest = {}
    for name, (x, y, w, h) in rects.items():
        cell = sheet.crop((x, y, x + w, y + h))
        cell = trim_alpha(cell)
        cw, ch = cell.size
        uniq, hard = diagnostics(cell, name)

        th = TARGET_H[tier(name)]
        scale = th / ch
        tw = max(1, int(round(cw * scale)))
        out = cell.resize((tw, th), Image.NEAREST)
        dst = os.path.join(DEST, name + '.png')
        out.save(dst, optimize=True)

        manifest[name] = {'file': 'foes/%s.png' % name, 'w': tw, 'h': th,
                          'tier': tier(name), 'srcRect': [x, y, w, h]}
        print('%-16s %-7s %-12s %-12s %-9d %-7.2f %dx%d' %
              (name, tier(name), '%dx%d' % (w, h), '%dx%d' % (cw, ch), uniq, hard, tw, th))

    json.dump(manifest, open(os.path.join(DEST, 'manifest.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('\n写出 %d 个妖兽 PNG -> assets/foes/  + manifest.json' % len(manifest))

    # ---- 带标注对照图（人工核对用）----
    os.makedirs(PREVIEW, exist_ok=True)
    pad, label_h, cols = 12, 18, 6
    cellw = max(m['w'] for m in manifest.values()) + pad * 2
    cellh = max(m['h'] for m in manifest.values()) + pad * 2 + label_h
    rows = (len(manifest) + cols - 1) // cols
    sheet_out = Image.new('RGBA', (cols * cellw, rows * cellh), (24, 32, 52, 255))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet_out)
    for i, (name, m) in enumerate(manifest.items()):
        cx, cy = (i % cols) * cellw, (i // cols) * cellh
        im = Image.open(os.path.join(DEST, name + '.png'))
        sheet_out.alpha_composite(im, (cx + (cellw - m['w']) // 2, cy + pad))
        d.text((cx + 6, cy + cellh - label_h + 2), name, fill=(240, 227, 194, 255))
    pv = os.path.join(PREVIEW, 'foes_contact.png')
    sheet_out.save(pv)
    print('对照图 ->', os.path.relpath(pv, REPO))
    return 0


if __name__ == '__main__':
    sys.exit(main())
