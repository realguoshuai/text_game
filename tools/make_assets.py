# -*- coding: utf-8 -*-
"""程序化生成古风修仙风占位素材（国风配色：青瓦 / 朱红 / 竹青 / 水墨金）
输出目录：assets/tiles  assets/characters  assets/ui
所有图带透明通道，4 倍超采样后缩小，边缘平滑。
若你有更合适的 CC0 素材（Kenney / OpenGameArt / Summer Engine），直接同名覆盖即可，游戏会自动使用。
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets')
S = 4  # 超采样倍数


def new(w, h):
    return Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0)), ImageDraw.Draw(Image.new('RGBA', (w * S, h * S)))


def canvas(w, h):
    img = Image.new('RGBA', (w * S, h * S), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def save(img, w, h, rel):
    path = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((w, h), Image.LANCZOS).save(path)
    print('生成', rel, img.size, '->', (w, h))


def diamond(d, cx, cy, hw, hh, fill, outline=None, width=1):
    pts = [(cx, cy - hh), (cx + hw, cy), (cx, cy + hh), (cx - hw, cy)]
    d.polygon(pts, fill=fill, outline=outline, width=width)
    return pts


# ---------------------------------------------------------------- 地面瓦片
def make_ground():
    W, H = 128, 32          # 两张 64x32：0=土地 1=青石板
    img, d = canvas(W, H)
    for i in range(2):
        ox = i * 64
        base = (106, 90, 66) if i == 0 else (138, 130, 114)   # 土黄 / 青石
        dark = (94, 80, 58) if i == 0 else (124, 116, 100)
        diamond(d, (ox + 32) * S, 16 * S, 32 * S, 16 * S, base, outline=dark, width=1 * S)
        # 纹理
        if i == 0:
            for k in range(26):                                 # 泥土颗粒 + 草点
                x = ox * S + (k * 37 % 62) * S // 1
                y = (4 + (k * 53 % 24)) * S
                d.point((x, y), fill=(88, 76, 54, 255))
            for k in range(6):
                x = ox * S + (6 + k * 9) * S
                y = (10 + (k * 7 % 12)) * S
                d.line([(x, y), (x, y - 4 * S)], fill=(74, 104, 58, 255), width=1 * S)
        else:
            for k in range(1, 4):                               # 石缝
                d.line([((ox + 32 - 32 + k * 16) * S, (16 - k * 4) * S),
                        ((ox + 32 + k * 16) * S, (16 - 8 + k * 4) * S)],
                       fill=(116, 108, 94, 255), width=1 * S)
            for k in range(10):
                x = ox * S + (k * 41 % 58) * S
                y = (8 + (k * 31 % 16)) * S
                d.point((x, y), fill=(120, 132, 104, 200))       # 苔痕
    save(img, W, H, 'tiles/ground.png')


# ---------------------------------------------------------------- 建筑
def make_building():
    W, H = 192, 168
    img, d = canvas(W, H)
    cx, base_y, hw, hh, hgt = 96, 132, 80, 40, 52
    # 侧墙
    d.polygon([((cx - hw) * S, base_y * S), (cx * S, (base_y + hh) * S),
               (cx * S, (base_y + hh - hgt) * S), ((cx - hw) * S, (base_y - hgt) * S)],
              fill=(112, 84, 55, 255))
    d.polygon([(cx * S, (base_y + hh) * S), ((cx + hw) * S, base_y * S),
               ((cx + hw) * S, (base_y - hgt) * S), (cx * S, (base_y + hh - hgt) * S)],
              fill=(138, 104, 66, 255))
    # 朱红立柱
    for px, py in [(cx - hw + 8, base_y - 6), (cx + hw - 8, base_y - 6), (cx, base_y + hh - 8)]:
        d.rectangle([(px - 3) * S, (py - hgt + 6) * S, (px + 3) * S, (py + 4) * S], fill=(166, 58, 42, 255))
    # 门（正面）
    d.polygon([((cx - 12) * S, (base_y + hh - 14) * S), ((cx + 12) * S, (base_y + hh - 14) * S),
               ((cx + 12) * S, (base_y + hh - 2) * S), ((cx - 12) * S, (base_y + hh - 2) * S)],
              fill=(38, 26, 16, 255))
    # 窗
    for sx in (cx - 44, cx + 30):
        d.rectangle([sx * S, (base_y - hgt + 18) * S, (sx + 16) * S, (base_y - hgt + 32) * S],
                    fill=(224, 190, 120, 220), outline=(90, 66, 40, 255), width=1 * S)
    # 屋顶（青瓦）
    ry = base_y - hgt
    diamond(d, cx * S, (ry + hh // 2) * S, (hw + 10) * S, (hh + 6) * S, (72, 96, 112, 255),
            outline=(44, 62, 76, 255), width=1 * S)
    # 瓦垄
    for k in range(-3, 4):
        d.line([((cx + k * 20) * S, (ry - 2) * S), ((cx + k * 20 + 26) * S, (ry + hh + 2) * S)],
               fill=(58, 80, 96, 200), width=1 * S)
    # 屋脊
    d.line([((cx - hw - 6) * S, (ry + hh // 2) * S), ((cx + hw + 6) * S, (ry + hh // 2) * S)],
           fill=(52, 70, 84, 255), width=2 * S)
    # 飞檐（左右上翘）
    d.polygon([((cx - hw - 10) * S, (ry + hh // 2 - 2) * S), ((cx - hw + 6) * S, (ry + hh // 2 - 8) * S),
               ((cx - hw + 4) * S, (ry + hh // 2 + 2) * S)], fill=(64, 88, 104, 255))
    d.polygon([((cx + hw + 10) * S, (ry + hh // 2 - 2) * S), ((cx + hw - 6) * S, (ry + hh // 2 - 8) * S),
               ((cx + hw - 4) * S, (ry + hh // 2 + 2) * S)], fill=(64, 88, 104, 255))
    # 檐下红灯笼
    for lx in (cx - 34, cx + 34):
        d.ellipse([(lx - 5) * S, (ry + hh - 2) * S, (lx + 5) * S, (ry + hh + 18) * S], fill=(198, 60, 48, 235))
        d.rectangle([(lx - 2) * S, (ry + hh - 8) * S, (lx + 2) * S, (ry + hh - 2) * S], fill=(230, 200, 120, 255))
    save(img, W, H, 'tiles/buildings.png')


# ---------------------------------------------------------------- 装饰（松 / 灯笼）
def make_decorations():
    W, H = 192, 96           # 两帧：0=松树 1=灯笼
    img, d = canvas(W, H)
    # 帧 0：迎客松
    cx, by = 48, 88
    d.ellipse([(cx - 16) * S, (by - 6) * S, (cx + 16) * S, (by + 4) * S], fill=(0, 0, 0, 60))
    d.polygon([((cx - 4) * S, by * S), ((cx + 4) * S, by * S), ((cx + 2) * S, (by - 34) * S),
               ((cx - 2) * S, (by - 34) * S)], fill=(92, 64, 40, 255))
    d.line([(cx * S, (by - 20) * S), ((cx - 14) * S, (by - 30) * S)], fill=(92, 64, 40, 255), width=3 * S)
    d.line([(cx * S, (by - 26) * S), ((cx + 14) * S, (by - 34) * S)], fill=(92, 64, 40, 255), width=3 * S)
    for ox, oy, r in [(-12, -44, 15), (12, -46, 14), (0, -58, 16), (-6, -36, 12), (10, -36, 11)]:
        d.ellipse([((cx + ox - r) * S), ((by + oy - r) * S), ((cx + ox + r) * S), ((by + oy + r) * S)],
                  fill=(38, 82, 48, 255))
    d.ellipse([((cx - 12) * S), ((by - 66) * S), ((cx + 6) * S), ((by - 52) * S)], fill=(56, 108, 62, 255))
    # 帧 1：石灯柱 + 红灯笼
    cx = 144
    d.ellipse([(cx - 12) * S, (by - 6) * S, (cx + 12) * S, (by + 4) * S], fill=(0, 0, 0, 60))
    d.rectangle([(cx - 6) * S, (by - 6) * S, (cx + 6) * S, by * S], fill=(120, 116, 104, 255))
    d.rectangle([(cx - 3) * S, (by - 52) * S, (cx + 3) * S, (by - 6) * S], fill=(96, 80, 60, 255))
    d.ellipse([(cx - 22) * S, (by - 58) * S, (cx + 22) * S, (by - 14) * S], fill=(255, 150, 90, 45))
    d.ellipse([(cx - 11) * S, (by - 55) * S, (cx + 11) * S, (by - 25) * S], fill=(200, 58, 46, 255),
              outline=(150, 36, 28, 255), width=1 * S)
    d.rectangle([(cx - 6) * S, (by - 56) * S, (cx + 6) * S, (by - 53) * S], fill=(232, 200, 120, 255))
    d.rectangle([(cx - 6) * S, (by - 27) * S, (cx + 6) * S, (by - 24) * S], fill=(232, 200, 120, 255))
    save(img, W, H, 'tiles/decorations.png')


# ---------------------------------------------------------------- 角色
def chibi(d, robe, robe_dark, trim, hair, extra='sword'):
    cx, foot = 32, 92
    # 影
    d.ellipse([(cx - 14) * S, (foot - 6) * S, (cx + 14) * S, (foot + 4) * S], fill=(0, 0, 0, 70))
    # 袍
    d.polygon([((cx - 11) * S, foot * S), ((cx + 11) * S, foot * S),
               ((cx + 8) * S, (foot - 34) * S), ((cx - 8) * S, (foot - 34) * S)], fill=robe)
    d.polygon([((cx + 2) * S, foot * S), ((cx + 11) * S, foot * S),
               ((cx + 8) * S, (foot - 34) * S), ((cx + 3) * S, (foot - 34) * S)], fill=robe_dark)
    # 腰带
    d.rectangle([(cx - 9) * S, (foot - 20) * S, (cx + 9) * S, (foot - 16) * S], fill=trim)
    # 袖
    d.ellipse([(cx - 18) * S, (foot - 32) * S, (cx - 6) * S, (foot - 14) * S], fill=robe_dark)
    d.ellipse([(cx + 6) * S, (foot - 32) * S, (cx + 18) * S, (foot - 14) * S], fill=robe_dark)
    # 手
    d.ellipse([(cx - 13) * S, (foot - 18) * S, (cx - 7) * S, (foot - 12) * S], fill=(240, 210, 174, 255))
    d.ellipse([(cx + 7) * S, (foot - 18) * S, (cx + 13) * S, (foot - 12) * S], fill=(240, 210, 174, 255))
    # 头
    d.ellipse([(cx - 13) * S, (foot - 60) * S, (cx + 13) * S, (foot - 34) * S], fill=(240, 210, 174, 255))
    # 发
    d.pieslice([(cx - 13) * S, (foot - 62) * S, (cx + 13) * S, (foot - 36) * S], 180, 360, fill=hair)
    d.rectangle([(cx - 13) * S, (foot - 52) * S, (cx - 9) * S, (foot - 44) * S], fill=hair)
    d.rectangle([(cx + 9) * S, (foot - 52) * S, (cx + 13) * S, (foot - 44) * S], fill=hair)
    # 眼 / 嘴
    d.ellipse([(cx - 7) * S, (foot - 51) * S, (cx - 3) * S, (foot - 47) * S], fill=(40, 32, 26, 255))
    d.ellipse([(cx + 3) * S, (foot - 51) * S, (cx + 7) * S, (foot - 47) * S], fill=(40, 32, 26, 255))
    d.line([(cx - 2) * S, (foot - 43) * S, (cx + 2) * S, (foot - 43) * S], fill=(180, 120, 100, 255), width=1 * S)
    return cx, foot


def make_characters():
    W, H = 64, 96
    # 玩家：青衫道袍 + 束发 + 背剑
    img, d = canvas(W, H)
    d.line([(46) * S, (18) * S, (26) * S, (58) * S], fill=(70, 78, 88, 255), width=4 * S)   # 背剑
    d.line([(46) * S, (18) * S, (50) * S, (14) * S], fill=(214, 176, 92, 255), width=3 * S)
    cx, foot = chibi(d, (63, 111, 143, 255), (48, 86, 114, 255), (214, 176, 92, 255), (42, 34, 28, 255))
    d.ellipse([(cx - 5) * S, (foot - 70) * S, (cx + 5) * S, (foot - 62) * S], fill=(42, 34, 28, 255))  # 发髻
    d.rectangle([(cx - 7) * S, (foot - 66) * S, (cx + 7) * S, (foot - 64) * S], fill=(214, 176, 92, 255))  # 玉簪
    save(img, W, H, 'characters/player.png')

    # 商人：褐袍 + 小帽 + 钱袋
    img, d = canvas(W, H)
    cx, foot = chibi(d, (140, 96, 52, 255), (112, 76, 40, 255), (196, 152, 68, 255), (54, 40, 30, 255))
    d.ellipse([(cx - 12) * S, (foot - 66) * S, (cx + 12) * S, (foot - 56) * S], fill=(64, 48, 34, 255))  # 帽
    d.ellipse([(cx - 4) * S, (foot - 72) * S, (cx + 4) * S, (foot - 64) * S], fill=(196, 152, 68, 255))
    d.ellipse([(cx + 8) * S, (foot - 22) * S, (cx + 18) * S, (foot - 8) * S], fill=(176, 132, 76, 255))  # 钱袋
    d.line([(cx + 9) * S, (foot - 22) * S, (cx + 17) * S, (foot - 22) * S], fill=(214, 176, 92, 255), width=1 * S)
    save(img, W, H, 'characters/npc_merchant.png')

    # 村民/弟子：灰布衣 + 头巾
    img, d = canvas(W, H)
    cx, foot = chibi(d, (122, 122, 108, 255), (98, 98, 86, 255), (150, 150, 132, 255), (48, 42, 34, 255))
    d.polygon([((cx - 13) * S, (foot - 56) * S), ((cx + 13) * S, (foot - 56) * S),
               ((cx + 10) * S, (foot - 64) * S), ((cx - 10) * S, (foot - 64) * S)], fill=(150, 150, 132, 255))
    save(img, W, H, 'characters/npc_villager.png')


# ---------------------------------------------------------------- UI
def make_panel():
    W, H = 512, 256
    img, d = canvas(W, H)
    d.rounded_rectangle([2 * S, 2 * S, (W - 2) * S, (H - 2) * S], radius=12 * S,
                        fill=(24, 17, 9, 225), outline=(168, 137, 78, 255), width=2 * S)
    d.rounded_rectangle([8 * S, 8 * S, (W - 8) * S, (H - 8) * S], radius=9 * S,
                        outline=(120, 96, 54, 160), width=1 * S)
    # 四角云纹
    for (ax, ay, sx, sy) in [(18, 18, 1, 1), (W - 18, 18, -1, 1), (18, H - 18, 1, -1), (W - 18, H - 18, -1, -1)]:
        d.arc([(ax - 16 * sx - 8) * S, (ay - 8) * S, (ax + 8) * S, (ay + 8) * S], 0, 360,
              fill=(168, 137, 78, 200), width=2 * S)
        d.ellipse([(ax - 4) * S, (ay - 4) * S, (ax + 4) * S, (ay + 4) * S], outline=(168, 137, 78, 180), width=1 * S)
    # 水墨淡痕
    d.ellipse([(60) * S, (H - 60) * S, (200) * S, (H - 10) * S], fill=(70, 90, 96, 26))
    d.ellipse([(300) * S, (10) * S, (470) * S, (70) * S], fill=(120, 100, 60, 22))
    save(img, W, H, 'ui/panel.png')


def make_icons():
    W, H = 256, 64          # 4 格：剑诀 / 灵力弹 / 身法 / 护体
    img, d = canvas(W, H)
    # 1 剑诀
    cx = 32
    d.rounded_rectangle([(cx - 20) * S, (12) * S, (cx + 20) * S, (52) * S], radius=6 * S,
                        fill=(40, 32, 18, 200), outline=(168, 137, 78, 255), width=1 * S)
    d.line([(cx - 8) * S, (46) * S, (cx + 10) * S, (18) * S], fill=(214, 238, 255, 255), width=4 * S)
    d.line([(cx - 11) * S, (44) * S, (cx - 6) * S, (49) * S], fill=(214, 176, 92, 255), width=3 * S)
    # 2 灵力弹
    cx = 96
    d.rounded_rectangle([(cx - 20) * S, (12) * S, (cx + 20) * S, (52) * S], radius=6 * S,
                        fill=(40, 32, 18, 200), outline=(168, 137, 78, 255), width=1 * S)
    d.ellipse([(cx - 14) * S, (18) * S, (cx + 14) * S, (46) * S], fill=(80, 170, 255, 90))
    d.ellipse([(cx - 8) * S, (24) * S, (cx + 8) * S, (40) * S], fill=(140, 210, 255, 240))
    d.ellipse([(cx - 3) * S, (28) * S, (cx + 2) * S, (33) * S], fill=(255, 255, 255, 240))
    # 3 身法
    cx = 160
    d.rounded_rectangle([(cx - 20) * S, (12) * S, (cx + 20) * S, (52) * S], radius=6 * S,
                        fill=(40, 32, 18, 200), outline=(168, 137, 78, 255), width=1 * S)
    for k, off in enumerate((-10, 0, 10)):
        d.arc([(cx - 14) * S, (18 + off // 2) * S, (cx + 10) * S, (34 + off // 2) * S], 300, 120,
              fill=(160, 230, 180, 230), width=2 * S)
    d.polygon([(cx + 4) * S, (24) * S, (cx + 16) * S, (32) * S, (cx + 4) * S, (40) * S], fill=(200, 240, 210, 240))
    # 4 护体
    cx = 224
    d.rounded_rectangle([(cx - 20) * S, (12) * S, (cx + 20) * S, (52) * S], radius=6 * S,
                        fill=(40, 32, 18, 200), outline=(168, 137, 78, 255), width=1 * S)
    d.polygon([(cx) * S, (16) * S, (cx + 14) * S, (24) * S, (cx + 12) * S, (40) * S,
               (cx) * S, (50) * S, (cx - 12) * S, (40) * S, (cx - 14) * S, (24) * S],
              fill=(214, 176, 92, 235), outline=(250, 226, 160, 255), width=1 * S)
    d.arc([(cx - 7) * S, (24) * S, (cx + 7) * S, (40) * S], 0, 360, fill=(120, 90, 40, 200), width=2 * S)
    save(img, W, H, 'ui/icons.png')


if __name__ == '__main__':
    make_ground()
    make_building()
    make_decorations()
    make_characters()
    make_panel()
    make_icons()
    print('全部素材生成完毕 ->', OUT)
