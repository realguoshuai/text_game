#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
灵泉灵瀑（lingquan）主题瓦片生成器。
等距网格: TILE_W=120, TILE_H=60；瓦片画布 120x76，菱形占顶部 60px，
前侧壁占 60..76px，与原版 tiles_atlas 的 building_0XX 保持同一透视。
生成地面瓦片 + 瀑布/莲花/灵石装饰物件，并打包成图集。
"""
import os
import json
import math
import random
from PIL import Image, ImageDraw, ImageColor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, 'assets', 'lingquan')
OUT_PNG = os.path.join(ROOT, 'assets', 'lingquan_atlas.png')
OUT_WEBP = os.path.join(ROOT, 'assets', 'lingquan_atlas.webp')
OUT_JSON = os.path.join(ROOT, 'assets', 'lingquan_atlas.json')

W, H = 120, 76          # 瓦片画布，菱形占 0..60，壁 60..76
TOP = 60                # 菱形底边 y
HALF_W, HALF_H = W // 2, 30   # 菱形半轴：水平 60，垂直 30

def iso_diamond():
    return [(HALF_W, 0), (W, HALF_H), (HALF_W, TOP), (0, HALF_H)]

def wall_poly():
    # 菱形底边 + 下延，形成前侧面
    return [(HALF_W, TOP), (W, HALF_H), (W, HALF_H + 16), (HALF_W, H), (0, HALF_H + 16), (0, HALF_H)]

def noise_dots(draw, count, color, bbox, radius=1, alpha=160):
    r, g, b = ImageColor.getrgb(color)
    for _ in range(count):
        x = random.randint(bbox[0], bbox[2] - 1)
        y = random.randint(bbox[1], bbox[3] - 1)
        draw.ellipse([x - radius, y - radius, x + radius, y + radius],
                     fill=(r, g, b, alpha))

def grass_tile(seed=0):
    random.seed(seed)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # 顶面渐变
    d.polygon(iso_diamond(), fill='#6fc45e')
    d.polygon(iso_diamond(), fill='#85d674')  # 再覆盖一层浅色做高光
    d.polygon([(HALF_W, 0), (W, HALF_H), (HALF_W, TOP)], fill='#9fe390')  # 上亮面
    # 暗面
    d.polygon([(HALF_W, TOP), (W, HALF_H), (W, HALF_H + 16), (HALF_W, H), (0, HALF_H + 16), (0, HALF_H)],
              fill='#4a9c40')
    # 纹理：小花
    noise_dots(d, 6, '#e8f5a3', (10, 8, W - 10, TOP - 8), radius=1, alpha=180)
    noise_dots(d, 5, '#b8e39c', (5, 5, W - 5, TOP - 5), radius=2, alpha=90)
    return im

def moss_tile(seed=0):
    random.seed(seed + 1)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon(iso_diamond(), fill='#4e8a4a')
    d.polygon([(HALF_W, 0), (W, HALF_H), (HALF_W, TOP)], fill='#619e5a')
    d.polygon(wall_poly(), fill='#356a32')
    # 树根/苔藓纹理
    noise_dots(d, 8, '#6aa860', (8, 6, W - 8, TOP - 6), radius=2, alpha=120)
    noise_dots(d, 5, '#2f5a2c', (10, 8, W - 10, TOP - 8), radius=1, alpha=110)
    return im

def dirt_tile(seed=0):
    random.seed(seed + 2)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon(iso_diamond(), fill='#a07d5a')
    d.polygon([(HALF_W, 0), (W, HALF_H), (HALF_W, TOP)], fill='#b89372')
    d.polygon(wall_poly(), fill='#7b6045')
    noise_dots(d, 10, '#c9a882', (8, 8, W - 8, TOP - 8), radius=1, alpha=120)
    noise_dots(d, 4, '#6d5139', (8, 8, W - 8, TOP - 8), radius=2, alpha=90)
    return im

def stone_tile(seed=0):
    random.seed(seed + 3)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon(iso_diamond(), fill='#8a9a9a')
    d.polygon([(HALF_W, 0), (W, HALF_H), (HALF_W, TOP)], fill='#a3b5b5')
    d.polygon(wall_poly(), fill='#6b7979')
    # 石头裂纹
    for _ in range(2):
        x1 = random.randint(25, 95); y1 = random.randint(12, 45)
        x2 = x1 + random.randint(-20, 20); y2 = y1 + random.randint(5, 20)
        d.line([(x1, y1), (x2, y2)], fill='#586565', width=1)
    return im

def shore_tile(seed=0):
    random.seed(seed + 4)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon(iso_diamond(), fill='#bdd8c2')
    d.polygon([(HALF_W, 0), (W, HALF_H), (HALF_W, TOP)], fill='#d5ebd6')
    d.polygon(wall_poly(), fill='#9abd9f')
    noise_dots(d, 7, '#8fb090', (10, 8, W - 10, TOP - 8), radius=2, alpha=100)
    noise_dots(d, 5, '#ffffff', (12, 10, W - 12, TOP - 10), radius=1, alpha=60)
    return im

def water_tile(seed=0):
    random.seed(seed + 5)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon(iso_diamond(), fill='#3ba9b8')
    d.polygon([(HALF_W, 0), (W, HALF_H), (HALF_W, TOP)], fill='#5ec9d4')
    d.polygon(wall_poly(), fill='#2a8794')
    # 水纹（浅色弧线）
    for i in range(3):
        yy = 18 + i * 12 + random.randint(-2, 2)
        d.arc([25, yy, 95, yy + 8], start=0, end=180, fill='#8fe8f0', width=1)
    return im

def water2_tile(seed=0):
    random.seed(seed + 6)
    im = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon(iso_diamond(), fill='#359ba8')
    d.polygon([(HALF_W, 0), (W, HALF_H), (HALF_W, TOP)], fill='#57bcc6')
    d.polygon(wall_poly(), fill='#257a85')
    d.arc([30, 22, 90, 28], start=0, end=180, fill='#9df0f7', width=1)
    d.arc([22, 34, 100, 42], start=0, end=180, fill='#8be6ee', width=1)
    return im

def waterfall_object():
    im = Image.new('RGBA', (120, 220), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # 瀑布主体
    d.polygon([(30, 20), (90, 20), (96, 210), (24, 210)], fill='#d4f7fa')
    # 水幕纹理
    for i in range(7):
        x = 40 + i * 9
        w = 3 + i % 3
        d.polygon([(x, 25), (x + w, 25), (x + w - 2, 208), (x - 2, 208)],
                  fill='#a8eaf0')
    # 泡沫/水雾
    noise_dots(d, 20, '#ffffff', (25, 170, 95, 215), radius=2, alpha=120)
    noise_dots(d, 14, '#ffffff', (28, 130, 92, 210), radius=3, alpha=80)
    # 顶部岩石框
    d.polygon([(20, 0), (100, 0), (95, 28), (25, 28)], fill='#6b8080')
    d.polygon([(20, 0), (60, 0), (42, 28), (25, 28)], fill='#8c9f9f')
    # 底部水潭溅起
    d.polygon([(30, 205), (90, 205), (110, 218), (10, 218)], fill='#8fe8f0')
    return im

def lotus_object():
    im = Image.new('RGBA', (52, 34), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # 荷叶
    d.ellipse([0, 10, 48, 30], fill='#4caf78')
    d.polygon([(24, 10), (48, 20), (24, 30)], fill='#6fd89a')
    # 荷花
    d.polygon([(24, 2), (32, 14), (24, 18), (16, 14)], fill='#f48fb1')
    d.polygon([(24, 2), (28, 10), (20, 10)], fill='#f06292')
    return im

def spirit_stone_object():
    im = Image.new('RGBA', (44, 52), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(22, 0), (42, 14), (34, 50), (10, 50), (2, 14)], fill='#8ba8a8')
    d.polygon([(22, 0), (32, 10), (28, 48), (14, 48), (12, 10)], fill='#a8c4c4')
    d.polygon([(22, 4), (26, 12), (24, 18), (18, 12)], fill='#d1f7f7')
    return im

def tiny_rock_object():
    im = Image.new('RGBA', (28, 22), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.polygon([(14, 0), (26, 8), (20, 20), (8, 20), (2, 8)], fill='#8a9a8a')
    d.polygon([(14, 0), (20, 6), (16, 18), (10, 18), (8, 6)], fill='#a3b5b5')
    return im

def save_sources(tiles):
    os.makedirs(SRC_DIR, exist_ok=True)
    for name, im in tiles.items():
        im.save(os.path.join(SRC_DIR, name.replace('/', '_') + '.png'))

def pack(tiles):
    # 单排打包，留 2px 间隙
    n = len(tiles)
    total_w = n * (W + 2) + 2
    total_h = 256  # 取 256 高，所有物件高度不超过 220
    atlas = Image.new('RGBA', (total_w, total_h), (0, 0, 0, 0))
    rect = {}
    x = 2
    for key, im in tiles.items():
        h = im.height
        atlas.paste(im, (x, 0), im)
        rect[key + '.png'] = [x, 0, im.width, h]
        x += im.width + 2
    # 居中显示：物件从顶部 y=0 开始贴，实际使用按 w/h 即可
    atlas.save(OUT_PNG)
    try:
        atlas.save(OUT_WEBP, 'WEBP', lossless=False, quality=92)
    except Exception:
        print('WebP save failed, keep PNG')
    json.dump(rect, open(OUT_JSON, 'w'), indent=2)
    print('saved', OUT_PNG, OUT_WEBP, OUT_JSON)
    print('tiles:', ', '.join(rect.keys()))

if __name__ == '__main__':
    random.seed(7)
    tiles = {
        'ling/grass': grass_tile(0),
        'ling/grass2': grass_tile(1),
        'ling/moss': moss_tile(0),
        'ling/dirt': dirt_tile(0),
        'ling/stone': stone_tile(0),
        'ling/shore': shore_tile(0),
        'ling/water': water_tile(0),
        'ling/water2': water2_tile(0),
        'ling/waterfall': waterfall_object(),
        'ling/lotus': lotus_object(),
        'ling/spirit_stone': spirit_stone_object(),
        'ling/rock': tiny_rock_object(),
    }
    save_sources(tiles)
    pack(tiles)
