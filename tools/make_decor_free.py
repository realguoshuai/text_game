# -*- coding: utf-8 -*-
"""从本地 FreePixel 国风素材（text_game/AssetLibrary/FreePixel）合成 decorations.png
输出：assets/tiles/decorations.png —— 横排 12 帧，每帧 96×96，透明底
帧表（与 js/iso.js 的 DECOR_FRAME 对应）：
  0 willow(垂柳)  1 pine(青松)  2 bamboo(竹丛)  3 lanternR(红灯笼)  4 lanternY(黄灯笼)
  5 lion(石狮)    6 well(水井)  7 brazier(火盆) 8 dummy(练功桩)     9 gate(石牌坊)
  10 dragon(玉龙像) 11 statue(武雕像)
midnight 系原图偏暗，统一提亮 + 提饱和到白天观感。
来源：freepixel.art（text_game/AssetLibrary/FreePixel，授权见 assets/CREDITS.txt）
"""
import os
from PIL import Image, ImageEnhance

FP = r'C:\Users\Lenovo\WorkBuddy\text_game\AssetLibrary\FreePixel'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'tiles', 'decorations.png')
FRAME = 96

# (相对路径, 是否提亮)
SRC = [
    ('地图-夜景器械/willow-tree-lush-midnight.png', True),   # 0 垂柳
    ('地图-夜景器械/pine-tree-spring-midnight.png', True),   # 1 青松
    ('地图-晶石矿物/bamboo-cluster.png', False),             # 2 竹丛
    ('地图-中式地标/lantern-paper-red.png', False),          # 3 红灯笼
    ('地图-中式地标/lantern-paper-yellow.png', False),       # 4 黄灯笼
    ('地图-中式地标/lion-statue-guardian.png', False),       # 5 石狮
    ('地图-中式地标/well-stone.png', False),                 # 6 水井
    ('地图-夜景器械/brazier-flaming-midnight.png', True),    # 7 火盆
    ('地图-夜景器械/training-dummy-midnight.png', True),     # 8 练功桩
    ('地图-中式地标/stone-gate.png', False),                 # 9 石牌坊
    ('地图-中式地标/dragon-statue-jade.png', False),         # 10 玉龙像
    ('地图-中式地标/hero-statue-stone.png', False),          # 11 武雕像
]

def load(rel, brighten):
    im = Image.open(os.path.join(FP, rel)).convert('RGBA')
    if brighten:
        im = ImageEnhance.Brightness(im).enhance(1.9)
        im = ImageEnhance.Color(im).enhance(1.25)
    im.thumbnail((FRAME - 6, FRAME - 6), Image.LANCZOS)   # 等比缩到 90 内
    return im

strip = Image.new('RGBA', (FRAME * len(SRC), FRAME), (0, 0, 0, 0))
for i, (rel, br) in enumerate(SRC):
    im = load(rel, br)
    # 底边居中贴到帧内（等距渲染以帧底边为落地点）
    x = i * FRAME + (FRAME - im.width) // 2
    y = FRAME - im.height - 2
    strip.paste(im, (x, y), im)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
strip.save(OUT)
print('saved', OUT, strip.size)

# 素材来源说明
credits = os.path.join(ROOT, 'assets', 'CREDITS.txt')
with open(credits, 'w', encoding='utf-8') as f:
    f.write("""素材来源与授权
================
1) assets/tiles/decorations.png 各帧裁自 FreePixel（freepixel.art）环境道具包，
   本地库：text_game/AssetLibrary/FreePixel（地图-中式地标 / 地图-夜景器械 / 地图-晶石矿物）。
   midnight 系列做了提亮处理（Brightness 1.9 / Color 1.25）。
2) 其余素材（ground/buildings/characters/ui）由 tools/make_assets.py 程序化生成，无第三方版权。
3) 替换更精细素材：同名 PNG 覆盖 assets/ 下文件即可，游戏零改动。
""")
print('credits written')
