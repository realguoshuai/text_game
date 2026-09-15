# -*- coding: utf-8 -*-
"""
prep_floor.py —— 把 CC0 写实地表瓦加工成「可按地形名取用、且互不打架的无缝顶面瓦」

来源（授权：CC0 / 公共领域，可商用、可改、免署名）
    Screaming Brain Studios —— Isometric Floor Tiles
      https://opengameart.org/content/isometric-floor-tiles
      https://opengameart.org/sites/default/files/sbs_-_isometric_floor_tiles_-_small_128x64.zip
      https://opengameart.org/sites/default/files/sbs_-_floor_tile_update_1_-_autotiles.zip
    解包后把 Worldmap 三张表（1 Forests / 2 Ground - Dry / 2 Ground - Rocky）按
    128x64 切成单块，放进 SRC_DIR（本仓库落在 test/_cc0/tiles/，临时目录不入库）。
    切块+抠黑底由 tools/_cc0_tiles.py 完成。

为什么不能直接用
    ① 这套瓦是「写实照片纹理」，块与块之间亮度差很大 —— 随机混用会在草地上拼出
       一块块补丁。逐块把平均亮度搬到统一目标（保留块内明暗层次），补丁就没了。
    ② 不同块在格边相接处纹理不同，会露出「贴片边缘」。复用 build_ground_tops 的
       思路：k > FEATHER_K 起把颜色渐隐到该地形的统一底色 —— 所有变体在格边完全
       同色，密缝铺开无缝，纹理差异只留在格心。
    ③ 原始草地偏黄橄榄绿、石板偏暖，和现有青绿场景件（松/竹/苔石）不是一路。
       按 TARGET 统一色相 + HSV 降饱和压亮，整幅才是一个调子。

产出
    assets/floor/<name>_<nn>.png          128x64，标准 2:1 菱形，天生密铺无缝
    --map <id> 时把 char -> [文件...] 写回 maps.json 的 groundTop

用法
    python tools/prep_floor.py                       # 只出图
    python tools/prep_floor.py --map bixiao          # 出图 + 写回 groundTop
    python tools/prep_floor.py --posterize 7         # 逐通道量化，靠向像素风
"""
import argparse
import json
import os
import zlib

import numpy as np
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ASSETS = os.path.join(ROOT, 'assets')
SRC_DIR = os.path.join(ROOT, '_cc0', 'tiles')
OUTDIR = os.path.join(ASSETS, 'floor')

FEATHER_K = 0.55     # 从 k 多少开始向底色渐隐（格心保留纹理，格边完全同色）
FEATHER_MAX = 0.45   # 到 k=1 时的最大混入比例（留一点残差，纯平会显得"塑料"）
WATER_WAVE = 0.105   # 水面波纹幅度
GAUSS = 4.0          # 高通用的高斯半径
GRAIN = 5.0          # 细颗粒的最终标准差（0~255 刻度）：统一幅度，变体才可互换
CHROMA_GRAIN = 0.55  # 颗粒里保留多少原始色偏（1=原样，0=纯灰噪）

# 地形 -> 加工参数。target 是与场景件对齐的「统一底色」，也是密铺时的格边颜色。
# 键 = 本图（bixiao）自己的一套字符，见 tools/gen_map.js 顶部的说明。
TERRAIN = {
    'g': dict(name='grass', src='grass', idx=[0, 3, 4, 6, 7, 13, 15, 16, 17],
              target=(102, 130, 84), sat=0.70, val=1.00),
    # 亮草甸：同一个来源、更亮的目标底色，用来在地面上切出成片的明暗草场。
    # 底色差必须"看得见但不过界" —— 差太多两块就成两张皮，看不出是一个地形。
    'm': dict(name='meadow', src='grass', idx=[0, 4, 11, 15, 16, 17],
              target=(133, 155, 93), sat=0.66, val=1.02),
    's': dict(name='soil', src='dry', idx=[0, 1, 2, 5, 12, 13],
              target=(124, 120, 100), sat=0.50, val=1.00),
    'p': dict(name='stone', src='rocky', idx=[2, 4, 6, 7, 10],
              target=(148, 152, 150), sat=0.24, val=1.00),
}
# 水：CC0 这套没有水瓦，自己生成纯色 + 波纹。
# 三档：岸沫（最亮）→ 浅水 → 深水（最暗）。水必须有"岸亮、湖心暗"的渐变带才读得出
# 深度；只有两档时，色调拉开则边界是一条台阶、色调拉近则整片平掉，两头都不行。
WATER = {
    'r': dict(name='water_rim', target=(80, 148, 150), variants=4),
    'h': dict(name='shallow', target=(48, 112, 126), variants=4),
    'd': dict(name='deep', target=(23, 62, 80), variants=4),
}

# ---------------------------------------------------------------- 崖壁立方瓦
# 引擎的 drawGround：陆格的南/东邻是虚空时，这一格**不用** groundTop，而是退回
# tilePalette 里那块原始瓦 —— 也就是"顶面 + 两侧崖壁"的立方体，岛缘的厚度就是它画的。
# 本图有虚空，所以岛缘那一圈必定走这条路；如果 tilePalette 还指向旧素材，
# 岛缘就会镶一圈「纯色板绿 / 霓虹青」（正是用户点名的问题），包着里面的新地面。
# 解：把原始立方体的侧壁留下、顶面换成同款 CC0 瓦，重铸成"崖壁立方瓦"，
#     再把本图这套新字符的 tilePalette 指过去。旧素材一个字节都不动。
CUBE_SRC = {
    'g': 'building_015_119x75.png',
    's': 'building_012_120x77.png',
    'p': 'building_014_119x77.png',
    'm': 'building_018_115x73.png',
    'd': 'building_017_118x75.png',
    'h': 'building_016_119x76.png',
    'r': 'building_016_119x76.png',   # 岸沫没有独立原画，借浅水的崖壁
}
CUBE_DIR = os.path.join(ASSETS, 'sliced')


def diamond_k(w, h):
    """归一化菱形坐标：k=0 格心，k=1 菱形边界（标准 2:1 菱形正好铺满画布）"""
    ys, xs = np.mgrid[0:h, 0:w]
    cx, cy = (w - 1) / 2.0, (h - 1) / 2.0
    return np.abs(xs - cx) / cx + np.abs(ys - cy) / cy


def feather_weight(k):
    return np.clip((k - FEATHER_K) / (1.0 - FEATHER_K), 0.0, 1.0) * FEATHER_MAX


def hsv_tune(rgb, alpha, sat, val):
    """只调 HSV 的 S/V —— 色相交给 target 混色决定，逐块调色相会各偏各的。"""
    im = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8), 'RGBA')
    hsv = np.asarray(im.convert('HSV')).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * sat, 0, 255)
    hsv[:, :, 2] = np.clip(hsv[:, :, 2] * val, 0, 255)
    back = Image.fromarray(hsv.astype(np.uint8), 'HSV').convert('RGB')
    return np.asarray(back).astype(np.float32)


def tone_tile(path, target, sat, val, posterize):
    """把一块写实瓦"重铸"成与场景件同一路的画风。

    做法只有一条主线：**高通 + 定幅**。
      · hp = 原图 - 高斯模糊(原图) —— 减掉块内的低频明暗，只留细颗粒。
        这是"随机铺不露格子"的真正关键。只做均值/方差归一化是不够的：每块瓦
        内部的低频起伏（这块左上偏暗、那块右下偏亮）照样会被渲染成一个菱形色斑，
        铺出来是一地菱形的"补丁"，而且瓦越平、补丁越明显（第一版就是这么翻车的）。
        去掉低频之后，所有变体在大尺度上完全等价，只剩细颗粒的差异。
      · 把 hp 的标准差统一拉到 GRAIN —— 每块瓦的"颗粒粗细"一致，互换无痕。
      · 颗粒里保留 CHROMA_GRAIN 比例的原始色偏，免得变成纯灰噪（照片瓦的彩噪
        在描边卡通道具旁边非常刺眼，所以要压到很低）。
    """
    arr = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32)
    h, w = arr.shape[:2]
    k = diamond_k(w, h)
    rgb, alpha = arr[:, :, :3], arr[:, :, 3]
    tgt = np.array(target, np.float32)

    blurred = np.asarray(Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), 'RGB')
                         .filter(ImageFilter.GaussianBlur(GAUSS))).astype(np.float32)
    hp = rgb - blurred
    solid = alpha > 16
    sd = float(hp[solid].std()) if solid.any() else 1.0
    hp = hp / max(sd, 1e-3) * GRAIN

    lum_hp = hp.mean(axis=2, keepdims=True)
    hp = lum_hp + (hp - lum_hp) * CHROMA_GRAIN
    rgb = tgt[None, None, :] + hp
    rgb = hsv_tune(rgb, alpha, sat, val)

    # 格边渐隐到统一底色（二次保险：即使某块源瓦四角自带明暗，也不会露边）
    fw = feather_weight(k)[:, :, None]
    rgb = rgb * (1.0 - fw) + tgt * fw

    if posterize > 1:
        step = 255.0 / (posterize - 1)
        rgb = np.round(np.clip(rgb, 0, 255) / step) * step

    out = np.zeros((h, w, 4), np.uint8)
    out[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[:, :, 3] = alpha.astype(np.uint8)
    return out


def water_tile(w, h, target, variant, posterize):
    """水：纯色 + 细波纹 + 低频包络，格边回归纯色。

    第一版只叠了低频噪声 → 渲染出来是一块**完全平**的青色，像剪纸，完全没有
    "水"的读感。水面必须有波纹这种有方向性的高频细节，才立得住。
    波纹幅度、包络、相位逐变体不同（同一朵浪花每格重复 = 规整图案，比不做更假）。
    """
    rng = np.random.default_rng(zlib.crc32(('water%d' % variant).encode()) & 0x7FFFFFFF)
    ys, xs = np.mgrid[0:h, 0:w].astype(np.float32)

    def sines(f_lo, f_hi, n):
        s = np.zeros((h, w), np.float32)
        for _ in range(n):
            a = rng.uniform(f_lo, f_hi) * (1 if rng.random() < 0.5 else -1)
            b = rng.uniform(f_lo, f_hi) * (1 if rng.random() < 0.5 else -1)
            s += np.sin(xs * a + ys * b + rng.uniform(0, 6.2832))
        return s / n

    # 两级波纹：粗纹给"涌"、细纹给"粼"。只有细纹像噪点，只有粗纹像色带。
    rip = sines(0.045, 0.095, 2) * 0.68 + sines(0.150, 0.280, 3) * 0.32

    low = (rng.random((5, 9)).astype(np.float32) * 2.0 - 1.0)
    env = np.asarray(Image.fromarray(((low * 0.5 + 0.5) * 255).astype(np.uint8))
                     .resize((w, h), Image.BICUBIC)).astype(np.float32) / 255.0
    env = 0.45 + env * 0.55                    # 波纹成片出现、成片消失

    k = diamond_k(w, h)
    fw = feather_weight(k)[:, :, None]
    tgt = np.array(target, np.float32)
    rgb = tgt[None, None, :] * (1.0 + (rip * env)[:, :, None] * WATER_WAVE)
    rgb = rgb * (1.0 - fw) + tgt * fw

    if posterize > 1:
        step = 255.0 / (posterize - 1)
        rgb = np.round(np.clip(rgb, 0, 255) / step) * step

    out = np.zeros((h, w, 4), np.uint8)
    out[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    out[:, :, 3] = 255
    return out


def cube_tile(orig_path, top_path, darken=0.22):
    """原始「顶面+崖壁」立方体 → 换顶面（CC0 瓦）、留崖壁。

    几何：立方体的顶面就是一个标准 2:1 菱形，宽 = 图宽 W，高 = W/2，贴在图顶。
      119x75 的瓦：菱形占 y=0..59，崖壁落在 y≈30..74 的两侧，正好差 15px。
    做法：把 CC0 顶面缩到 (W, W/2) 盖在菱形上；菱形边界向内 1~2px 做透明渐变，
    再在边界内侧压一圈暗边，补回被盖掉的原画"棱线"，崖壁以下原样不动。
    """
    cube = Image.open(orig_path).convert('RGBA')
    cw, ch = cube.size
    ht = int(round(cw / 2.0))
    top = Image.open(top_path).convert('RGBA').resize((cw, ht), Image.LANCZOS)

    ys, xs = np.mgrid[0:ht, 0:cw].astype(np.float32)
    ccx, ccy = (cw - 1) / 2.0, (ht - 1) / 2.0
    k = np.abs(xs - ccx) / ccx + np.abs(ys - ccy) / ccy

    a = np.clip((1.0 - k) / 0.025, 0.0, 1.0)[:, :, None]        # 菱形内=1，边界 1~2px 渐隐
    c = np.asarray(cube).astype(np.float32)
    t = np.asarray(top).astype(np.float32)
    rgb = c[:ht, :, :3] * (1.0 - a) + t[:, :, :3] * a
    # 棱线：菱形边界内侧压暗，替代被盖掉的原始顶面边缘高光/暗边
    rgb *= (1.0 - darken * np.clip((k - 0.84) / 0.16, 0.0, 1.0))[:, :, None]
    c[:ht, :, :3] = np.clip(rgb, 0, 255)
    return c.astype(np.uint8)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--map', default=None, help='把 groundTop 写回该地图')
    ap.add_argument('--src', default=SRC_DIR)
    ap.add_argument('--outdir', default=OUTDIR)
    ap.add_argument('--posterize', type=int, default=0,
                    help='逐通道量化级数（0=不量化）。给 6~8 能明显靠向像素风')
    
    args = ap.parse_args()

    os.makedirs(args.outdir, exist_ok=True)
    mapping = {}
    print('源: %s' % args.src)
    print('出图: %s   posterize=%s  GRAIN=%.1f CHROMA_GRAIN=%.2f' % (args.outdir, args.posterize or 'off', GRAIN, CHROMA_GRAIN))
    print()

    for ch, cfg in TERRAIN.items():
        made = []
        for n in cfg['idx']:
            fn = os.path.join(args.src, '%s_%02d.png' % (cfg['src'], n))
            if not os.path.exists(fn):
                print('  缺源瓦 %s' % fn)
                continue
            arr = tone_tile(fn, cfg['target'], cfg['sat'], cfg['val'], args.posterize)
            out_name = '%s_%02d.png' % (cfg['name'], n)
            Image.fromarray(arr, 'RGBA').save(os.path.join(args.outdir, out_name), optimize=True)
            made.append('floor/' + out_name)
        mapping[ch] = made
        print('  %-3r %-8s <- %s ×%d   底色 %s' % (ch, cfg['name'], cfg['src'], len(made), cfg['target']))

    wh = None
    for ch, cfg in WATER.items():
        made = []
        for i in range(cfg['variants']):
            if wh is None:
                # 以陆地瓦的尺寸为准，保证水陆格完全对齐
                probe = mapping['g'][0].split('/', 1)[1]
                with Image.open(os.path.join(args.outdir, probe)) as im:
                    wh = im.size
            arr = water_tile(wh[0], wh[1], cfg['target'], i, args.posterize)
            out_name = '%s_%d.png' % (cfg['name'], i)
            Image.fromarray(arr, 'RGBA').save(os.path.join(args.outdir, out_name), optimize=True)
            made.append('floor/' + out_name)
        mapping[ch] = made
        print('  %-3r %-8s 生成 ×%d   底色 %s' % (ch, cfg['name'], len(made), cfg['target']))

    # 崖壁立方瓦：岛缘那一圈走的就是它，见文件头 CUBE_SRC 的说明。
    palette = {}
    for ch, src in CUBE_SRC.items():
        fn = os.path.join(CUBE_DIR, src)
        if not os.path.exists(fn):
            print('  缺立方瓦源 %s' % fn)
            continue
        top_probe = mapping[ch][0].split('/', 1)[1]
        arr = cube_tile(fn, os.path.join(args.outdir, top_probe))
        out_name = '%s_cube.png' % (TERRAIN[ch]['name'] if ch in TERRAIN else WATER[ch]['name'])
        Image.fromarray(arr, 'RGBA').save(os.path.join(args.outdir, out_name), optimize=True)
        palette[ch] = 'floor/' + out_name
        print('  %-3r %-8s 崖壁瓦 <- %s' % (ch, out_name, src))

    if args.map:
        mj_path = os.path.join(ASSETS, 'maps.json')
        mj = json.load(open(mj_path, encoding='utf-8'))
        hit = None
        for m in mj['maps']:
            if m['id'] == args.map:
                hit = m
                m['groundTop'] = mapping
        if hit is None:
            print('找不到地图 %r' % args.map)
            return 1
        pal = mj.setdefault('tilePalette', {})
        for ch, fn in palette.items():
            if ch in pal and pal[ch] != fn:
                print('  ⚠ tilePalette[%r] 原为 %s，将覆盖' % (ch, pal[ch]))
            pal[ch] = fn
        wset = set(mj.get('water', ''))
        for ch in WATER:
            wset.add(ch)
        mj['water'] = ''.join(sorted(wset))
        # walkable 是全局的，同样只**新增**本图这套字符，不动别人的。
        wset = set(mj.get('walkable', ''))
        for ch in TERRAIN:
            wset.add(ch)
        mj['walkable'] = ''.join(sorted(wset))
        json.dump(mj, open(mj_path, 'w', encoding='utf-8'),
                  ensure_ascii=False, separators=(',', ':'))
        print()
        print('已把 groundTop 写入 maps.json 的 %r（%d 个字符）  water=%r  walkable=%r'
              % (args.map, len(mapping), mj['water'], mj['walkable']))
    else:
        print()
        print(json.dumps(mapping, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
