# -*- coding: utf-8 -*-
"""仙岛寻踪 · 程序化生成物品图标图集（不依赖任何外部素材）。

六种物品，各画一帧 64×64 图标：
    jinchuang  金创药    回复 35% 气血    小怪常见
    xiaohuan   小还丹    回复 55% 气血    中怪
    dahuan     大还丹    回复 100% 气血   精英 / 稀有小怪
    yaodan     妖丹      材料，攒着换灵石  所有怪
    lingshi    灵石      货币（现有）     所有怪
    xuantie    玄铁令    稀有贵重         精英

输出（**单张图**，两种倍率上下两行）
    assets/items_atlas.png / .webp  —— 尺寸 398×205：第 0 行 1×（64px，地上掉落物用），
                                       第 1 行起 2×（128px，背包格子用）
    assets/items_atlas.json         —— { "_meta": {...}, "items": {...},
                                          "<name>": [x,y,64,64], "<name>_big": [x,y,128,128] }

★★ 为什么两种倍率必须**同图**（别改回两张文件）
   第一版是 `items_atlas.png`(1×) + `items_atlas_big.png`(2×) 两张，json 的 `_big` 矩形按
   2× 图坐标空间写。但运行时只会下 1× 那张 —— 代码拿 2× 的矩形去裁 1× 图，于是帧高按 128
   算而图里只有 64（图标压成一半高）、第二格起 sx 直接越界裁到隔壁。**全程不报错**，
   只表现为「背包里图标不对/像没显示」。合并成一张 = 从结构上消灭"两套坐标系"。

★ 三条硬约束（第一版踩过，改前先读）
  ① **内容框必须统一到 ~44px**。第一版各画各的（22~43px），放进背包格子大小乱跳。
     解：全部画完之后按内容框居中归一化，统一缩放到 TARGET_BOX。
  ② **描边要分内外**。第一版只在外圈补 `#2a1f1a` 一圈硬黑，边缘发糊。
     解：外圈 1px 近黑（立得住）+ 内部按亮度做暗部加深（有体积感）。
  ③ **明暗必须有明确分界**，不能只靠渐变 —— 64px 显示成 40px 时渐变全糊成一团。
     解：每个物体都画「亮面多边形 + 暗面多边形」两块实色，再叠一层柔和高光。

用法
    python games/immortal-isles/tools/gen_items_atlas.py
"""
import os, json, math
import numpy as np
from PIL import Image

BASE = r'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame'
ASSETS = os.path.join(BASE, 'games/immortal-isles/assets')

S = 64            # 单帧尺寸
TARGET_BOX = 46   # 内容框归一化后的目标边长（留 9px 边距，等距菱形里也不出格）
PAD = 2

INK = (34, 22, 20, 255)          # 外描边（近黑）
HILITE = (255, 252, 240, 255)


def C(col):
    """颜色统一成 4 元组：允许只写 RGB（三种写法混用时最容易踩的坑）。"""
    if len(col) == 3:
        return (col[0], col[1], col[2], 255)
    return tuple(col)

# ---------------------------------------------------------------- 绘制原语

def _canvas():
    return np.zeros((S, S, 4), dtype=np.float64)


def _ellipse(a, cx, cy, rx, ry, color, alpha=1.0, feather=1.0):
    color = C(color)
    yy, xx = np.mgrid[0:S, 0:S]
    d = np.sqrt(((xx - cx) / max(rx, 1e-6)) ** 2 + ((yy - cy) / max(ry, 1e-6)) ** 2)
    scale = max(rx, ry)
    m = np.clip((1.0 - d) * scale / max(feather, 1e-6), 0, 1)
    for c in range(4):
        a[:, :, c] = a[:, :, c] * (1 - m * alpha) + color[c] * m * alpha
    return a


def _rect(a, x0, y0, x1, y1, color, alpha=1.0):
    color = C(color)
    yy, xx = np.mgrid[0:S, 0:S]
    m = ((xx >= x0) & (xx < x1) & (yy >= y0) & (yy < y1)).astype(np.float64)
    for c in range(4):
        a[:, :, c] = a[:, :, c] * (1 - m * alpha) + color[c] * m * alpha
    return a


def _poly(a, pts, color, alpha=1.0):
    """多边形填充（偶奇扫描线）。"""
    color = C(color)
    yy, xx = np.mgrid[0:S, 0:S]
    inside = np.zeros((S, S), dtype=bool)
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        if y0 == y1:
            continue
        cond = ((y0 <= yy) & (yy < y1)) | ((y1 <= yy) & (yy < y0))
        with np.errstate(divide='ignore', invalid='ignore'):
            xint = x0 + (yy - y0) * (x1 - x0) / (y1 - y0)
        inside ^= cond & (xx < xint)
    m = inside.astype(np.float64)
    for c in range(4):
        a[:, :, c] = a[:, :, c] * (1 - m * alpha) + color[c] * m * alpha
    return a


def _over(a, color, mask, alpha=1.0):
    color = C(color)
    for c in range(4):
        a[:, :, c] = a[:, :, c] * (1 - mask * alpha) + color[c] * mask * alpha
    return a


def _stroke(a, pts, color, w=0.9, alpha=0.8, close=False):
    """折线描边（逐点画小圆）。"""
    color = C(color)
    seq = list(pts) + ([pts[0]] if close else [])
    for i in range(len(seq) - 1):
        (x0, y0), (x1, y1) = seq[i], seq[i + 1]
        n = int(max(abs(x1 - x0), abs(y1 - y0))) * 3
        for t in range(n + 1):
            px = x0 + (x1 - x0) * t / max(n, 1)
            py = y0 + (y1 - y0) * t / max(n, 1)
            _ellipse(a, px, py, w, w, color, alpha)


def _sphere(a, cx, cy, R, dark, base, light, gate=0.72, hx=-0.36, hy=-0.36):
    dark, base, light = C(dark), C(base), C(light)
    """球体着色：亮面/暗面实色分块 + 柔和高光。这是 64px 下最清楚的做法。"""
    yy, xx = np.mgrid[0:S, 0:S]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / R
    inside = (d <= 1.0)
    # 法线近似（球面 → 光照）
    nx = (xx - cx) / R
    ny = (yy - cy) / R
    lit = np.clip(1.0 - np.sqrt((nx - hx) ** 2 + (ny - hy) ** 2) * 0.78, 0.0, 1.0)
    for c in range(3):
        col = np.where(lit > gate, light[c],
                       np.where(lit > 0.30, base[c], dark[c]))
        a[:, :, c] = np.where(inside, col, a[:, :, c])
    a[:, :, 3] = np.where(inside, 255, a[:, :, 3])
    # 柔和高光（压在实色上，避免死板）
    hi = inside & (lit > gate)
    _over(a, tuple(light[:3]) + (255,), (hi & (d < 0.62)).astype(np.float64), 0.35)
    return a


def _finish_outline(a, alpha_thr=40):
    """外圈 1px 近黑描边：让图标在浅色/深色格子里都立得住。"""
    solid = a[:, :, 3] > alpha_thr
    grow = np.zeros_like(solid)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            grow |= np.roll(np.roll(solid, dy, axis=0), dx, axis=1)
    ring = grow & (~solid)
    for c in range(3):
        a[:, :, c] = np.where(ring, INK[c], a[:, :, c])
    a[:, :, 3] = np.where(ring, 235, a[:, :, 3])
    return a


# ---------------------------------------------------------------- 六种物品

def gen_jinchuang():
    """金创药：白瓷小瓶 + 红布塞 + 朱砂标签。回复 35%。
    结构：瓶身（亮左/暗右两实块）→ 收口椭圆 → 布塞 → 朱砂标签 → 高光条。"""
    a = _canvas()
    PORC = (240, 236, 224)
    PORC_D = (176, 170, 156)
    PORC_L = (255, 254, 248)
    CORK = (172, 98, 62)
    CORK_D = (114, 58, 34)
    SEAL = (198, 60, 52)
    # 瓶身：左边亮、右边暗（两个实色多边形，分界在 x=32）
    _poly(a, [(21, 26), (32, 24), (32, 53), (23, 53)], PORC_L)          # 亮面
    _poly(a, [(32, 24), (43, 26), (41, 53), (32, 53)], PORC_D)          # 暗面
    _ellipse(a, 32, 53, 9.2, 3.0, PORC_D)                                # 底收口
    _ellipse(a, 32, 26, 10.5, 3.4, PORC)                                 # 肩部
    _poly(a, [(23, 27), (32, 25), (32, 34), (24, 35)], PORC_L, 0.9)      # 肩亮
    # 瓶颈 + 布塞
    _poly(a, [(27, 15), (37, 15), (37, 25), (27, 25)], PORC)
    _poly(a, [(27, 15), (32, 15), (32, 25), (27, 25)], PORC_L, 0.8)
    _ellipse(a, 32, 15, 6.6, 2.8, CORK)
    _ellipse(a, 32, 16, 4.8, 1.8, CORK_D)
    _poly(a, [(27, 20), (37, 20), (37, 24), (27, 24)], CORK, 0.85)
    _poly(a, [(27, 20), (32, 20), (32, 24), (27, 24)], CORK_D, 0.35)
    # 朱砂标签
    _rect(a, 25, 36, 39, 46, SEAL, 0.95)
    _rect(a, 27, 38, 37, 44, (252, 226, 212), 0.85)
    _rect(a, 30, 39.5, 34, 42.5, SEAL, 0.9)
    # 竖向高光
    _rect(a, 25, 29, 27, 50, HILITE, 0.34)
    return a


def gen_xiaohuan():
    """小还丹：朱红药丸 + 金色弦纹。回复 55%。"""
    a = _canvas()
    _sphere(a, 32, 32, 19, (128, 34, 36), (206, 72, 66), (248, 138, 122), gate=0.70)
    yy, xx = np.mgrid[0:S, 0:S]
    d = np.sqrt((xx - 32) ** 2 + (yy - 32) ** 2) / 19.0
    ang = np.arctan2(yy - 32, xx - 32)
    # 两道金色弦纹（实色块，不是细线 —— 缩到 40px 还看得见）
    GOLD = (238, 194, 92, 255)
    for k, r0 in enumerate([0.42, 0.74]):
        band = ((np.abs(d - r0) <= 0.085) & (d <= 1.0)).astype(np.float64)
        _over(a, GOLD, band * (d <= 1.0), 0.92)
    # 顶部小叶（丹丸的小把）
    _ellipse(a, 32, 12, 3.4, 2.0, (86, 132, 74, 255), 0.95)
    _ellipse(a, 32, 12, 3.4, 2.0, (150, 196, 128, 255), 0.35)
    edge = ((d > 0.95) & (d <= 1.04)).astype(np.float64)
    _over(a, INK, edge, 0.55)
    return a


def gen_dahuan():
    """大还丹：紫金丹药 + 三道灵纹 + 外圈丹光。回复 100%。"""
    a = _canvas()
    yy, xx = np.mgrid[0:S, 0:S]
    R = 19.0
    d = np.sqrt((xx - 32) ** 2 + (yy - 32) ** 2) / R
    # 外圈丹光（在球体之前画）
    glow = np.exp(-((d - 1.06) ** 2) / (2 * 0.16 ** 2))
    _over(a, (176, 138, 255, 255), np.clip(glow, 0, 1) * (d > 0.86), 0.55)
    _sphere(a, 32, 32, R, (74, 44, 128), (128, 90, 198), (194, 162, 246), gate=0.70)
    ang = np.arctan2(yy - 32, xx - 32)
    GOLD = (244, 210, 124, 255)
    for k, r0 in enumerate([0.30, 0.56, 0.82]):
        band = ((np.abs(d - r0) <= 0.072) & (d <= 1.0)).astype(np.float64)
        _over(a, GOLD, band, 0.9)
    # 丹丸顶上的「金冠」三尖
    for dx in (-7, 0, 7):
        _poly(a, [(32 + dx, 9), (32 + dx + 3.2, 15), (32 + dx - 3.2, 15)], GOLD, 0.95)
    edge = ((d > 0.95) & (d <= 1.04)).astype(np.float64)
    _over(a, INK, edge, 0.6)
    return a


def gen_yaodan():
    """妖丹：青碧兽丹 + 内部游丝 + 裂纹。材料。"""
    a = _canvas()
    _sphere(a, 32, 33, 18.5, (30, 98, 90), (74, 174, 146), (156, 232, 210), gate=0.72)
    yy, xx = np.mgrid[0:S, 0:S]
    d = np.sqrt((xx - 32) ** 2 + (yy - 33) ** 2) / 18.5
    ang = np.arctan2(yy - 33, xx - 32)
    # 内部游丝（两道亮弧）
    for k in range(2):
        r0 = 0.36 + k * 0.26
        band = (np.abs(d - r0) <= 0.055).astype(np.float64)
        stripe = (np.sin(ang * 2.0 + k * 2.1) > 0.30).astype(np.float64)
        _over(a, (220, 255, 246, 255), band * stripe * (d <= 1.0), 0.65)
    # 裂纹（硬折线，缩图也看得见）
    _stroke(a, [(42, 21), (36, 30), (41, 38), (34, 46)], INK, 0.85, 0.72)
    # 底部暗影（让丹丸坐得住）
    shadow = ((d > 0.72) & (yy > 40)).astype(np.float64)
    _over(a, (18, 60, 56, 255), shadow, 0.35)
    edge = ((d > 0.95) & (d <= 1.04)).astype(np.float64)
    _over(a, INK, edge, 0.6)
    return a


def gen_lingshi():
    """灵石：青蓝棱形晶石，左亮右暗 + 顶面高光。货币。"""
    a = _canvas()
    CL = (198, 240, 255)     # 顶面（最亮）
    C1 = (146, 220, 246)     # 左亮面
    C2 = (78, 158, 206)      # 右面
    C3 = (42, 100, 150)      # 右暗面
    # 六棱柱的固定造型：中心 (32,32)，上尖端 y=13，下尖端 y=53
    top = (32, 13)
    ul, ur = (20, 23), (44, 23)
    ll, lr = (20, 43), (44, 43)
    bot = (32, 53)
    _poly(a, [top, ur, lr, bot, ll, ul], C2)             # 整体先铺中间色
    _poly(a, [top, ul, ll, bot, (32, 33)], C1)           # 左半亮面
    _poly(a, [top, ur, lr, bot, (32, 33)], C2)           # 右半
    _poly(a, [top, ur, (32, 33), ul], CL)                # 顶面最亮
    _poly(a, [(32, 33), lr, bot], C3)                    # 右下暗块
    # 棱线（实色描边，保证缩图可读）
    _stroke(a, [top, ur, lr, bot, ll, ul], INK, 0.85, 0.78, close=True)
    _stroke(a, [top, (32, 33), bot], INK, 0.75, 0.6)
    _stroke(a, [(32, 33), ul], INK, 0.7, 0.45)
    _stroke(a, [(32, 33), ur], INK, 0.7, 0.45)
    # 内发光（中心偏左上的一团柔光）
    yy, xx = np.mgrid[0:S, 0:S]
    beam = np.exp(-((xx - 29.0) ** 2) / 210.0) * np.exp(-((yy - 28.0) ** 2) / 320.0)
    _over(a, (240, 254, 255, 255), np.clip(beam, 0, 1), 0.34)
    return a


def gen_xuantie():
    """玄铁令：黑铁令牌 + 暗金边 + 中央「令」纹。稀有。"""
    a = _canvas()
    IRON = (104, 112, 124)
    IRON_D = (48, 54, 64)
    IRON_L = (162, 172, 184)
    GOLD = (204, 164, 80)
    GOLD_L = (248, 220, 140)
    # 牌身（上圆下方的令牌形）
    _poly(a, [(21, 20), (43, 20), (45, 26), (45, 51), (19, 51), (19, 26)], IRON)
    _ellipse(a, 32, 20, 11.0, 5.4, IRON)
    # 左亮 / 右暗（竖直分界，实色）
    _poly(a, [(22, 21), (32, 18), (32, 50), (20, 50), (20, 26)], IRON_L, 0.50)
    _poly(a, [(32, 18), (43, 21), (44, 26), (44, 50), (32, 50)], IRON_D, 0.58)
    # 暗金边（左右两根竖条 + 底横条，粗一点才看得见）
    _rect(a, 19.0, 24, 21.0, 51, GOLD, 0.85)
    _rect(a, 43.0, 24, 45.0, 51, GOLD, 0.85)
    _rect(a, 19.0, 49.0, 45.0, 51, GOLD, 0.85)
    # 顶部金环
    for i in range(80):
        t = i / 79.0
        ang = math.pi * (1.0 + t)
        px = 32 + math.cos(ang) * 11.0
        py = 20 + math.sin(ang) * 5.4
        _ellipse(a, px, py, 1.1, 1.1, GOLD_L, 0.85)
    # 中央「令」纹：人字头 + 一点 + 两横 + 竖钩（笔画加粗到 2px 以上）
    _stroke(a, [(24.5, 29.5), (32, 23.5), (39.5, 29.5)], GOLD_L, 1.25, 0.95)
    _rect(a, 30.6, 30.5, 33.4, 33.5, GOLD_L, 0.95)
    _rect(a, 24.0, 34.0, 40.0, 36.4, GOLD_L, 0.95)
    _rect(a, 26.0, 38.0, 38.0, 40.4, GOLD_L, 0.95)
    _rect(a, 29.4, 41.5, 34.6, 46.5, GOLD_L, 0.95)
    _rect(a, 31.6, 43.0, 33.0, 48.5, IRON_D, 0.95)
    # 高光
    _ellipse(a, 26, 26, 3.2, 2.2, HILITE, 0.28)
    return a


SPEC = [
    ('jinchuang', gen_jinchuang, '金创药', 'heal', 0.35, '常见 · 小怪掉落'),
    ('xiaohuan',  gen_xiaohuan,  '小还丹', 'heal', 0.55, '中品 · 中怪掉落'),
    ('dahuan',    gen_dahuan,    '大还丹', 'heal', 1.00, '上品 · 精英掉落'),
    ('yaodan',    gen_yaodan,    '妖丹',   'mat',  0,    '材料 · 可换灵石'),
    ('lingshi',   gen_lingshi,   '灵石',   'mat',  0,    '货币'),
    ('xuantie',   gen_xuantie,   '玄铁令', 'rare', 0,    '稀有 · 精英专属'),
]


def to_img(arr):
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), 'RGBA')


def bbox(img):
    a = np.array(img)[:, :, 3]
    ys, xs = np.nonzero(a > 20)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def normalize(img):
    """① 描边 → ② 按内容框裁切 → ③ 等比缩放到 TARGET_BOX → ④ 居中放回 S×S。
    这一步是「尺寸统一」的关键：六张图标不管原本画多大，出来都是同一视觉重量。"""
    a = np.array(img).astype(np.float64)
    _finish_outline(a)
    img = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), 'RGBA')
    b = bbox(img)
    if not b:
        return img, None
    x0, y0, x1, y1 = b
    crop = img.crop((x0, y0, x1, y1))
    w, h = crop.size
    k = TARGET_BOX / max(w, h)
    nw, nh = max(1, int(round(w * k))), max(1, int(round(h * k)))
    # 缩到整数倍附近再用最近邻，保住硬边
    crop = crop.resize((nw, nh), Image.LANCZOS)
    out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    out.alpha_composite(crop, ((S - nw) // 2, (S - nh) // 2))
    return out, (nw, nh)


def main():
    frames = []
    for name, fn, cn, kind, val, note in SPEC:
        raw = to_img(fn())
        img, size = normalize(raw)
        frames.append((name, img, cn, kind, val, note, size))

    # ★★ 两种倍率**打包进同一张图**（第 0 行 1× 给地上掉落，第 1 行 2× 给背包格子）。
    #
    # 为什么必须合并（2026-09-17 用户报「拾取药品，背包中不显示」的真因）：
    #   第一版把 1× 存 `items_atlas.png`、2× 另存 `items_atlas_big.png`，而 json 里的
    #   `<name>_big` 矩形是按 **2× 图** 的坐标空间写的。运行时 LOAD_PLAN 只下 1× 那张，
    #   代码却拿 `_big` 的矩形去裁 1× 图 —— 于是：
    #     · 帧高按 128 算、实际图里只有 64 → 图标被压成一半高（46px 格子塞进 24px 图）
    #     · 第二格起 sx=136/268… 早已超出 398 宽的合理范围，裁出来是隔壁图或空白
    #   表现就是「背包里图标不对 / 像没显示」，而且**不报任何错**。
    #   拆成两张文件等于埋了「两套坐标系」的雷，合并成一张从结构上消灭它，
    #   顺带少一次网络请求。
    BIG = 2
    cw = S + PAD                 # 1× 行里每帧的步进
    cwB = S * BIG + PAD          # 2× 行里每帧的步进
    W = max(cw * len(frames) + PAD, cwB * len(frames) + PAD)
    rowH_small = S + PAD
    H = rowH_small + (S * BIG + PAD * 2)      # 上：1× 行  下：2× 行
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    rect, rect_big = {}, {}
    x, xb = PAD, PAD
    for name, img, cn, kind, val, note, size in frames:
        canvas.alpha_composite(img, (x, PAD))
        rect[name] = [x, PAD, S, S]
        big = img.resize((S * BIG, S * BIG), Image.NEAREST)
        canvas.alpha_composite(big, (xb, rowH_small + PAD))
        rect_big[name + '_big'] = [xb, rowH_small + PAD, S * BIG, S * BIG]
        x += cw
        xb += cwB

    items = {name: {'cn': cn, 'kind': kind, 'val': val, 'note': note}
             for name, img, cn, kind, val, note, size in frames}
    out = {'_meta': {'size': S, 'big': BIG, 'box': TARGET_BOX,
                     'rowBig': rowH_small + PAD, 'atlasH': H,
                     'note': '程序化生成，见 tools/gen_items_atlas.py'},
           'items': items}
    out.update(rect)
    out.update(rect_big)

    # 只用这一张（png 给运行时，webp 给小体积备选）—— 不再产出 items_atlas_big.png，
    # 从源头杜绝"两套坐标系"。旧文件若还在，下面收尾时删掉。
    canvas.save(os.path.join(ASSETS, 'items_atlas.png'), optimize=True)
    canvas.save(os.path.join(ASSETS, 'items_atlas.webp'), 'WEBP', quality=92, method=6)
    json.dump(out, open(os.path.join(ASSETS, 'items_atlas.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    stale = os.path.join(ASSETS, 'items_atlas_big.png')
    if os.path.exists(stale):
        os.remove(stale)
        print('  已删除过期的 items_atlas_big.png（已合并进单张图集）')

    print('=== 输出 ===')
    for f in ('items_atlas.png', 'items_atlas.webp', 'items_atlas.json'):
        p = os.path.join(ASSETS, f)
        print('  %-22s %7.1fKB' % (f, os.path.getsize(p) / 1024))
    print('单张图集 %dx%d（上 1× / 下 2×）' % (W, H))
    print('=== 逐帧自检（内容框应统一为 %d 附近）===' % TARGET_BOX)
    ok = True
    for name, img, cn, kind, val, note, size in frames:
        a = np.array(img)[:, :, 3]
        cov = float(np.count_nonzero(a > 20)) / (S * S)
        b = bbox(img)
        bw, bh = (b[2] - b[0], b[3] - b[1]) if b else (0, 0)
        flag = '' if max(bw, bh) >= TARGET_BOX - 1 else '  ⚠ 偏小'
        if flag:
            ok = False
        print('  %-10s %-4s %-4s 内容 %2dx%-2d 占比 %.3f%s'
              % (name, cn, kind, bw, bh, cov, flag))
    print('尺寸统一: %s' % ('✓ 全部达标' if ok else '✗ 有偏小项'))


if __name__ == '__main__':
    main()
