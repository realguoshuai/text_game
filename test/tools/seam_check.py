# -*- coding: utf-8 -*-
"""格线体检：在渲染图上量「等距格边有没有露出背景」。

原理
    等距投影下，屏幕上的一条水平扫描线 y=const 对应网格的一条反对角线
    (mx+my=const)，线上相邻格子中心的间距恰好是 TILE_W*Z。
    所以只要取一条完全落在同类地面（比如整片水、整片草地）里的对角线，
    沿它采样亮度，看有没有以 TILE_W*Z 为周期的暗谷，就能判定格线。
    比"截图看一眼"可靠：格线细到 1px 时肉眼在缩略图上根本看不出来。

用法
    python tools/seam_check.py bixiao _bixiao.png 0.34
    python tools/seam_check.py bixiao _bixiao.png 0.34 --char '~'

判定
    暗谷 = 比该段亮度中位数低 DIP 以上的像素。若暗谷之间的间距集中在
    TILE_W*Z 附近（容差 2px），就报告「有格线」并给出周期与谷深度。
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TILE_W, TILE_H = 120, 60
HW, HH = TILE_W / 2, TILE_H / 2
DIP = 6.0  # 暗谷阈值（0~255 亮度）


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('map_id')
    ap.add_argument('png')
    ap.add_argument('z', type=float, nargs='?', default=0.34)
    ap.add_argument('--char', default=None, help='只检该地面字符，默认取面积最大的地面字符')
    a = ap.parse_args()

    mj = json.load(open(os.path.join(ROOT, 'assets', 'maps.json'), encoding='utf-8'))
    mp = next((m for m in mj['maps'] if m['id'] == a.map_id), None)
    if not mp:
        print('无此地图')
        return 1
    g = mp['ground']
    w, h = mp['w'], mp['h']

    cnt = {}
    for row in g:
        for ch in row:
            cnt[ch] = cnt.get(ch, 0) + 1
    tgt = a.char or max((c for c, n in cnt.items() if c != ' '), key=lambda c: cnt[c])
    print('目标地面字符 %r  共 %d 格' % (tgt, cnt.get(tgt, 0)))

    im = np.asarray(Image.open(a.png).convert('RGB')).astype(np.float32)
    lum = im.mean(axis=2)
    vh, vw = lum.shape
    ox = h * HW * a.z + 50
    oy = 50 + int(120 * a.z)

    # 找一条完全由 tgt 组成、且足够长的反对角线
    best = None
    for c in range(0, w + h - 1):
        cells = [(x, c - x) for x in range(w) if 0 <= c - x < h]
        run, cur = [], []
        for cell in cells:
            if g[cell[1]][cell[0]] == tgt:
                cur.append(cell)
            else:
                if len(cur) > len(run):
                    run = cur
                cur = []
        if len(cur) > len(run):
            run = cur
        if len(run) > (len(best[2]) if best else 0):
            best = (c, len(cells), run)
    if best is None or len(best[2]) < 4:
        print('找不到足够长的连续 %r 对角线，换 --char' % tgt)
        return 1
    c, _, run = best
    print('取反对角线 mx+my=%d，连续 %d 格' % (c, len(run)))

    # 屏幕坐标：格顶 y=(mx+my)*HH*Z+oy，格心再往下 HH*Z
    sy = int(round(c * HH * a.z + oy + HH * a.z))
    if not (0 <= sy < vh):
        print('扫描线越界 y=%d' % sy)
        return 1
    xs = [int(round((mx - my) * HW * a.z + ox)) for mx, my in run]
    x0, x1 = min(xs) + 6, max(xs) - 6
    if x1 - x0 < 40:
        print('可用线段太短')
        return 1
    seg = lum[sy, x0:x1]
    med = float(np.median(seg))
    dips = np.where(seg < med - DIP)[0]
    print('扫描线 y=%d  x=%d..%d  中位数亮度 %.1f  std %.2f' % (sy, x0, x1, med, float(seg.std())))
    if len(dips) < 2:
        print('  暗谷 %d 个 -> 无周期格线' % len(dips))
        return 0
    gaps = np.diff(dips)
    gaps = gaps[gaps > 3]
    period = TILE_W * a.z
    if len(gaps) == 0:
        print('  暗谷 %d 个但间距 <3px（噪声）' % len(dips))
        return 0
    near = gaps[np.abs(gaps - period) <= 2.5]
    depth = float(med - seg[dips].min())
    print('  暗谷 %d 个  最深 %.1f  间距命中格宽(%.1f)的 %d/%d' % (
        len(dips), depth, period, len(near), len(gaps)))
    if len(gaps) >= 3 and len(near) / float(len(gaps)) > 0.5:
        print('  >>> 判定：有格线（周期 %.1fpx，深度 %.1f）' % (period, depth))
        return 2
    print('  >>> 判定：无规律格线')
    return 0


if __name__ == '__main__':
    sys.exit(main())
