# -*- coding: utf-8 -*-
"""
扫描「武侠修仙免费包」20 位角色动作表，为挑选玩家角色提供数据依据。

为什么需要：本环境读不了图片像素（Read 图片会被过滤），无法肉眼判断性别/造型，
只能用可计算的轮廓与配色指标做初筛 —— 主要看三件事：
  1. 行走行是否真的齐 6 帧（R8/R9/R10）
  2. 正面站立帧的身形比例：裙摆外扩（越像裙=越可能女修）、肩宽、发量
  3. 主色（袍色/发色）
输出一张表，人工据此拍板。
"""
import glob
import os
import sys

import numpy as np
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else \
    'C:/Users/Lenovo/WorkBuddy/text_game/AssetLibrary/武侠修仙/动作表'
FX = 64
COLS, ROWS = 6, 13
ROW_DOWN, ROW_LEFT, ROW_UP = 7, 8, 9     # 0 基行号：下 / 左 / 上 行走
ROW_FRONT_IDLE = 10                      # 0 基：正面站立（静止）


def cells(im, row):
    out = []
    for c in range(COLS):
        box = (c * FX, row * FX, c * FX + FX, row * FX + FX)
        cell = im.crop(box)
        out.append(cell if cell.getbbox() else None)
    return out


def band_widths(alpha, n=8):
    """把角色高度切成 n 段，返回每段的最大不透明宽度（归一化到 1）"""
    ys, xs = np.where(alpha > 8)
    if len(ys) == 0:
        return None
    y0, y1 = ys.min(), ys.max()
    span = max(1, y1 - y0)
    ws = []
    for i in range(n):
        a = y0 + span * i // n
        b = y0 + span * (i + 1) // n
        m = alpha[a:max(b, a + 1)] > 8
        w = 0
        if m.any():
            cols = np.where(m.any(axis=0))[0]
            w = cols.max() - cols.min() + 1
        ws.append(int(w))
    mx = max(ws) or 1
    return [w / mx for w in ws], (y1 - y0 + 1)


def main():
    files = sorted(glob.glob(os.path.join(SRC, '*.png')))
    print('共 %d 张动作表\n' % len(files))
    hdr = '%-24s %-9s %-7s %-6s %-6s %-7s %-9s %s' % (
        '文件名(编号)', '走行帧数', '身高px', '头宽', '脚宽', '裙摆比', '发色占比', '主色 top3')
    print(hdr)
    print('-' * len(hdr))
    for f in files:
        name = os.path.basename(f)
        im = Image.open(f).convert('RGBA')
        if im.size != (FX * COLS, FX * ROWS):
            print('%-24s 尺寸异常 %s' % (name[:24], im.size))
            continue
        walk = [sum(1 for c in cells(im, r) if c) for r in (ROW_DOWN, ROW_LEFT, ROW_UP)]
        c0 = cells(im, ROW_FRONT_IDLE)[0]
        if c0 is None:
            print('%-24s 正面站立帧为空' % name[:24])
            continue
        a = np.asarray(c0)[:, :, 3]
        rgb = np.asarray(c0.convert('RGB')).astype(int)
        res = band_widths(a)
        if res is None:
            print('%-24s 全透明' % name[:24])
            continue
        ws, h = res
        head_w = ws[0]
        foot_w = ws[7]
        waist_w = max(ws[4], 1e-6)
        flare = foot_w / waist_w                      # >1.25 视为裙摆外扩
        # 发色：顶部 22% 高度内偏暗像素占比
        ys, xs = np.where(a > 8)
        y0 = ys.min()
        top = slice(y0, y0 + int(h * 0.22) + 1)
        sub = rgb[top]
        suba = a[top] > 8
        if suba.sum() == 0:
            hair = 0.0
        else:
            lum = sub.mean(2)
            dark = ((lum < 92) & suba).sum()
            hair = dark / suba.sum()
        # 主色：角色像素量化到 32 级
        mask = a > 8
        px = rgb[mask]
        q = (px // 32 * 32)
        cols, cnt = np.unique(q.reshape(-1, 3), axis=0, return_counts=True)
        order = np.argsort(-cnt)[:3]
        tops = ' '.join('#%02x%02x%02x:%d%%' % (cols[i][0], cols[i][1], cols[i][2],
                                               round(100 * cnt[i] / cnt.sum()))
                        for i in order)
        print('%-24s %-9s %-7d %-6.2f %-6.2f %-7.2f %-9.2f %s' % (
            name[:24], '/'.join(map(str, walk)), h, head_w, foot_w, flare, hair, tops))


if __name__ == '__main__':
    main()
