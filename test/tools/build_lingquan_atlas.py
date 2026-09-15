"""用 Kenney Isometric Landscape 素材重建灵泉图集。

输出：
  assets/lingquan_atlas.png / .webp / .json
  assets/lingquan/          （可选源 PNG，不入库）
"""
import os, json
from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(BASE, '..', '地形包', 'kenney_isometric_landscape', 'PNG')
OUT_DIR = os.path.join(BASE, 'assets')
SRC_OUT = os.path.join(OUT_DIR, 'lingquan')

# 友好键名 -> 源文件编号
def src(n):
    return os.path.join(SRC_DIR, f'landscapeTiles_{n:03d}.png')

TILES = {
    # 地面瓦片（按 maps.json 字符）
    'ling/grass.png':  src(11),   # 标准草地
    'ling/dirt.png':   src(21),   # 泥土
    'ling/moss.png':   src(22),   # 苔地（稍深草地）
    'ling/stone.png':  src(80),   # 石板/石地
    'ling/water.png':  src(60),   # 水域
    'ling/shore.png':  src(43),   # 水岸过渡

    # 装饰物件（solid:false）
    'ling/fountain.png':   src(85),   # 灵泉喷泉
    'ling/waterfall.png':  src(17),   # 瀑布/流泉
    'ling/tree.png':       src(69),   # 单棵小树
    'ling/trees.png':      src(70),   # 两棵小树
    'ling/hill.png':       src(36),   # 圆顶小山
    'ling/rock.png':       src(28),   # 岩石/尖顶山
}

TARGET_W = 120  # 与 TILE_W 一致，保证等距菱形对齐网格

def resize_to_width(im, w):
    h = int(im.height * (w / im.width))
    return im.resize((w, h), Image.Resampling.LANCZOS)

def build():
    os.makedirs(SRC_OUT, exist_ok=True)
    rects = {}
    images = []
    total_w = 0
    max_h = 0

    for key, path in TILES.items():
        im = Image.open(path).convert('RGBA')
        im = resize_to_width(im, TARGET_W)
        images.append((key, im))
        rects[key] = (total_w, 0, im.width, im.height)
        total_w += im.width
        max_h = max(max_h, im.height)

    atlas = Image.new('RGBA', (total_w, max_h), (0, 0, 0, 0))
    for key, im in images:
        x, y, w, h = rects[key]
        atlas.paste(im, (x, 0), im)

    png_path = os.path.join(OUT_DIR, 'lingquan_atlas.png')
    webp_path = os.path.join(OUT_DIR, 'lingquan_atlas.webp')
    json_path = os.path.join(OUT_DIR, 'lingquan_atlas.json')

    atlas.save(png_path, 'PNG')
    atlas.save(webp_path, 'WEBP', quality=90, method=6)

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(rects, f, ensure_ascii=False, indent=1)

    print('Built lingquan atlas:', png_path)
    print('  PNG ', os.path.getsize(png_path), 'WEBP', os.path.getsize(webp_path))
    print('  rects:', list(rects.keys()))

if __name__ == '__main__':
    build()
