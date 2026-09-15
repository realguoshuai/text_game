# -*- coding: utf-8 -*-
"""
build_ground_tops.py —— 从「带侧壁的整块地形瓦」派生出「无接缝顶面瓦 + 变体」

为什么做这件事
    现有地面瓦（building_015 等）本质是 FreePixel 的「独立地块」：一块 120x60
    的菱形上表面，底下还压着 13~17px 的泥土侧壁；而且菱形最外一圈明显偏暗
    （实测 k>0.95 处亮度骤降 22~30%），那是地块的描边。当地图整片铺同一层高的
    地块时，每格边缘都会露出来 —— 视觉上就是满屏的「砖块网格」：草地的斜纹、
    水面的一格一格，都是这个原因。水瓦更麻烦：它的「岸带」从 k≈0.50 就开始变暗，
    整片水域铺出来是几十个独立小水塘。

两种处理，按瓦片类型分开
    陆地（KS=0.90）—— 三角波镜像延展：
        k > KS 的像素换成源半径 ks_eff = KS * tri(k / KS) 处的像素，
        把内圈纹理在半径方向来回折返地铺满整张菱形，抹掉最外圈的描边。
    水（不走延展）—— 直接纯化：
        原水纹的中心有一块高光斑，镜像复制后会变成「每格中央一个亮斑」，
        格感反而更重。所以水面只取核心区中位色，叠一层极缓的低频起伏。
    菱形之外（侧壁所在）一律置为透明。

变体与「格边回归」（关键约束）
    派生 N 个变体时，明度差异一律乘上边缘渐隐 edge_fade(k)：格心附近完全生效、
    到菱形边界衰减为 0。原因是相邻两格若取了不同变体，只要边界像素都等于原色，
    拼起来就无缝；差异只留在格心，看着就是地面上自然的明暗斑块，而不是补丁格。
    随机撒点同理，只落在 k<0.78 的内圈。

注意
    - 只改 RGB、保留原 alpha，边缘抗锯齿不被破坏（改成硬边反而会露缝）。
    - 随机数用固定 seed（CRC32），重复运行结果一致（幂等）。

用法
    python tools/build_ground_tops.py --map qingxuan
    python tools/build_ground_tops.py --chars ".,#;~-"

产出
    assets/ground/<原名>_top0.png ~ _topN.png
    并把 char -> [文件名...] 的映射写回 assets/maps.json 对应地图的 groundTop 字段
"""
import argparse
import json
import os
import random
import zlib

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, 'assets')
SLICED = os.path.join(ASSETS, 'sliced')
OUTDIR = os.path.join(ASSETS, 'ground')

KS_LAND = 0.90     # 陆地：只抹最外圈描边（实测暗边在 k>0.95，留一点余量）
FADE_K = 0.78      # 变体差异的生效边界：k<=FADE_K 全量，到 k=1 衰减为 0
VARIANTS = 4       # 陆地每个字符派生几个变体
JITTER = 0.016     # 明度微扰幅度（必须小：整格 3% 在绿色上就是肉眼可见的色块）
WATER_WAVE = 0.030 # 水面的低频起伏幅度
MIN_ALPHA = 128    # 只动实体像素，边缘半透明像素原样保留


def diamond(hh, w, tile_h):
    """归一化菱形坐标：k=0 格心，k=1 菱形边界"""
    ys, xs = np.mgrid[0:hh, 0:w]
    cx, cy = (w - 1) / 2.0, (tile_h - 1) / 2.0
    u = np.abs(xs - cx) / cx
    v = np.abs(ys - cy) / cy
    return xs, ys, cx, cy, u + v


def edge_fade(k):
    return np.clip((1.0 - k) / (1.0 - FADE_K), 0.0, 1.0)


def load(path, tile_h):
    arr = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)
    arr = arr[:min(arr.shape[0], tile_h)]
    return arr


def top_face(path, tile_h, ks):
    """陆地：取菱形顶面 + 三角波镜像延展。返回 (rgb, alpha, k, fade)"""
    arr = load(path, tile_h)
    hh, w = arr.shape[0], arr.shape[1]
    xs, ys, cx, cy, k = diamond(hh, w, tile_h)

    rgb = arr[:, :, :3].copy()
    alpha = arr[:, :, 3].copy()
    alpha[k > 1.0] = 0.0                      # 菱形之外是侧壁，整块丢弃
    alpha[k <= 1.0] = 255.0                   # 菱形内拉满：留半透明会在密铺时叠出浅色缝

    kr = k / ks
    kr = 1.0 - np.abs(np.mod(kr, 2.0) - 1.0)  # 三角波：超出 ks 后向回折返
    ks_eff = kr * ks
    t = np.where(k > 1e-6, ks_eff / np.maximum(k, 1e-6), 1.0)
    sx = np.clip(np.round(cx + (xs - cx) * t), 0, w - 1).astype(np.int32)
    sy = np.clip(np.round(cy + (ys - cy) * t), 0, hh - 1).astype(np.int32)
    m = (k > ks) & (alpha >= MIN_ALPHA)
    rgb[m] = rgb[sy[m], sx[m]]
    return rgb, alpha, k, edge_fade(k)


def water_face(path, tile_h):
    """水：丢掉原水纹，改取核心区中位色 + 极缓的低频起伏"""
    arr = load(path, tile_h)
    hh, w = arr.shape[0], arr.shape[1]
    _, _, _, _, k = diamond(hh, w, tile_h)

    alpha = arr[:, :, 3].copy()
    alpha[k > 1.0] = 0.0
    alpha[k <= 1.0] = 255.0                   # 同上：菱形内拉满，密铺才不留浅色缝
    core = (k < 0.35) & (arr[:, :, 3] > 200)
    base = np.median(arr[:, :, :3][core], axis=0) if core.any() else arr[:, :, :3].reshape(-1, 3).mean(0)

    rng = np.random.default_rng(zlib.crc32(os.path.basename(path).encode()) & 0x7FFFFFFF)
    low = (rng.random((7, 14)).astype(np.float32) * 2.0 - 1.0)
    big = np.asarray(Image.fromarray(((low * 0.5 + 0.5) * 255).astype(np.uint8))
                     .resize((w, hh), Image.BICUBIC)).astype(np.float32) / 255.0 * 2.0 - 1.0

    f = edge_fade(k)
    rgb = np.clip(base[None, None, :] * (1.0 + big[:, :, None] * WATER_WAVE * f[:, :, None]), 0, 255)
    return rgb, alpha, k, f


def make_variant(rgb, alpha, k, fade, tint, seed, spots):
    """明度微扰（按边缘渐隐加权）+ 内圈撒斑点"""
    out = np.clip(rgb * (1.0 + (tint - 1.0) * fade[:, :, None]), 0, 255)
    hh, w = alpha.shape
    if spots:
        rnd = random.Random(seed)
        solid = alpha >= MIN_ALPHA
        placed = 0
        for _ in range(spots * 16):
            if placed >= spots:
                break
            x = rnd.randrange(1, w - 1)
            y = rnd.randrange(1, hh - 1)
            if not solid[y, x] or k[y, x] > FADE_K:
                continue
            gain = rnd.choice((1.13, 1.07, 0.88, 0.93))
            r = rnd.choice((1, 1, 2))
            y0, y1 = max(0, y - r), min(hh, y + r + 1)
            x0, x1 = max(0, x - r), min(w, x + r + 1)
            sub = out[y0:y1, x0:x1]
            for c in range(3):
                sub[:, :, c] = sub[:, :, c] * gain
            placed += 1
    out = np.clip(out, 0, 255)

    res = np.zeros((hh, w, 4), dtype=np.uint8)
    res[:, :, :3] = out.astype(np.uint8)
    res[:, :, 3] = alpha.astype(np.uint8)
    return Image.fromarray(res, 'RGBA')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--map', default=None, help='只处理该地图用到的地面字符')
    ap.add_argument('--chars', default=None, help='直接给字符集，例如 ".,#;~-"')
    ap.add_argument('--variants', type=int, default=VARIANTS)
    ap.add_argument('--outdir', default=OUTDIR)
    args = ap.parse_args()

    mj_path = os.path.join(ASSETS, 'maps.json')
    mj = json.load(open(mj_path, encoding='utf-8'))
    tile_h = mj['tileH']
    pal = mj['tilePalette']
    water = mj.get('water', '')

    chars = set()
    if args.chars:
        chars |= (set(args.chars) - {' '})
    if args.map:
        hit = False
        for m in mj['maps']:
            if m['id'] == args.map:
                hit = True
                for row in m['ground']:
                    chars |= (set(row) - {' '})
        if not hit:
            print('找不到地图 %r' % args.map)
            return 1
    if not chars:
        print('没有要处理的字符，用 --map 或 --chars 指定')
        return 1

    os.makedirs(args.outdir, exist_ok=True)
    mapping = {}
    print('tile_h=%d  陆地KS=%.2f 边缘渐隐k=%.2f  变体数=%d' % (tile_h, KS_LAND, FADE_K, args.variants))
    print()
    for ch in sorted(chars):
        fn = pal.get(ch)
        if not fn:
            print('  %-3r 跳过：tilePalette 里没有这个字符' % ch)
            continue
        src = os.path.join(SLICED, fn)
        if not os.path.exists(src):
            src = os.path.join(ASSETS, fn)
        if not os.path.exists(src):
            print('  %-3r 跳过：找不到素材 %s' % (ch, fn))
            continue

        is_water = ch in water
        if is_water:
            rgb, alpha, k, fade = water_face(src, tile_h)
            n_var = 1
        else:
            rgb, alpha, k, fade = top_face(src, tile_h, KS_LAND)
            n_var = args.variants

        base = os.path.splitext(os.path.basename(fn))[0]
        # 先清掉上一轮的旧变体：变体数调小（比如水从 4 张减到 1 张）时，
        # 残留文件会一直躺在目录里，白占仓库体积、也让人误以为还在用。
        for f in os.listdir(args.outdir):
            if f.startswith(base + '_top') and f.endswith('.png'):
                os.remove(os.path.join(args.outdir, f))
        names = []
        for i in range(n_var):
            if i == 0:
                tint, spots = 1.0, 0
            else:
                tint = 1.0 + (JITTER if i % 2 else -JITTER) * (1.0 if i == 1 else 0.7)
                spots = 6
            im = make_variant(rgb, alpha, k, fade, tint,
                              seed=zlib.crc32(('%s|%d' % (fn, i)).encode()) & 0x7FFFFFFF,
                              spots=spots)
            out_name = '%s_top%d.png' % (base, i)
            im.save(os.path.join(args.outdir, out_name), optimize=True)
            names.append('ground/' + out_name)
        mapping[ch] = names
        print('  %-3r %s %-30s -> %d 张  %s' % (
            ch, '水  ' if is_water else '陆地', fn, len(names), names[0]))

    if args.map:
        for m in mj['maps']:
            if m['id'] == args.map:
                m['groundTop'] = mapping
        json.dump(mj, open(mj_path, 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
        print()
        print('已把 groundTop 写入 maps.json 的 %r' % args.map)
    else:
        print()
        print(json.dumps(mapping, ensure_ascii=False, indent=1))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
