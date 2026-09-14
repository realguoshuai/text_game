# -*- coding: utf-8 -*-
"""
把 FreePixel 免费素材（freepixel.art，免费商用、无需署名）打成游戏用的图集。

输入：AssetLibrary/FreePixel/<分类>/<名字>.png   （200x200 透明 PNG）
输出：ImmortalGame/assets/foes.png   妖兽（3 列 × 4 行，每格 200px）
      ImmortalGame/assets/props.png  地图道具（6 列 × 8 行，每格 200px）

为什么用「统一网格 + 底部对齐」而不是紧凑排布：
  紧凑排布要把每张的坐标写进游戏（多一个 json/表），图集和表一旦不同步，
  画出来就是错位的怪图 —— 这种 bug 很隐蔽。统一网格下游戏端只需要
  「格边长 200、第几列第几行」，不需要任何坐标表；代价只是图集大 ~70%
  （量化后约 300KB，一次性加载，可接受）。

每张都按 alpha 裁掉透明边，然后**底边居中**贴进格子：
  这样游戏里按「脚底」锚点画就行（drawImage(..., x - S/2, y - S, S, S)），
  而且各物件的相对大小天然来自原画（树自然比石头大）。

用法：
  python build_free_assets.py [素材库根目录]
"""
import math
import os
import sys
import json

from PIL import Image

SRC_ROOT = sys.argv[1] if len(sys.argv) > 1 else \
    'C:/Users/Lenovo/WorkBuddy/text_game/AssetLibrary/FreePixel'
OUT_DIR = os.path.dirname(os.path.abspath(__file__))

CELL = 200          # 格子边长（= 素材原始画布尺寸，内容不会被放大）
MARGIN = 2          # 内容底边距格子底边的留白

# ⚠ 以下顺序 = 图集里的格序号（从 0 开始，行优先）。
#    game.js 里的同名数组必须与此完全一致，否则会画错怪。
FOES = [
    ('wolf',          '怪物', 'wolf-pack-alpha.png'),      # 0  青狼妖
    ('wolf_elite',    '怪物', 'hellhound.png'),            # 1
    ('spider',        '怪物', 'spider-queen.png'),         # 2  玄纹蛛
    ('spider_elite',  '怪物', 'spider-broodmother.png'),   # 3
    ('toad',          '怪物', 'fire-salamander.png'),      # 4  焚天螈
    ('toad_elite',    '怪物', 'toxic-salamander.png'),     # 5
    ('ghost',         '怪物', 'toxic-wraith.png'),         # 6  阴煞
    ('ghost_elite',   '怪物', 'wraith.png'),               # 7
    ('serpent',       '怪物', 'sea-serpent.png'),          # 8  玄蛟
    ('serpent_elite', '怪物', 'armored-snake.png'),        # 9
    ('boss1',         '怪物', 'demon-lord.png'),           # 10 妖王
    ('boss2',         '怪物', 'dragon-red-boss.png'),      # 11 妖皇
]
FOE_COLS = 6

# 顺序同样要与 game.js 的 PROP_ORDER 一致
PROPS = [
    # 高物件（树 / 塔 / 像 / 门 / 坛 / 井）
    ('tree_giant',    '地图-夜景器械', 'giant-tree-lush-midnight.png'),
    ('tree_maple',    '地图-夜景器械', 'maple-tree-autumn-midnight.png'),
    ('tree_pine',     '地图-夜景器械', 'pine-tree-spring-midnight.png'),
    ('tree_willow',   '地图-夜景器械', 'willow-tree-lush-midnight.png'),
    ('tree_dead',     '地图-夜景器械', 'dead-tree-autumn-midnight.png'),
    ('tree_crystal',  '地图-夜景器械', 'crystal-tree-lush-midnight.png'),
    ('bamboo',        '地图-夜景器械', 'bamboo-cluster-midnight.png'),
    ('tower_ruin',    '地图-夜景器械', 'ruined-tower-midnight.png'),
    ('tower_stone',   '地图-夜景器械', 'stone-castle-tower-midnight.png'),
    ('tower_wizard',  '地图-夜景器械', 'wizard-tower-midnight.png'),
    ('mausoleum',     '地图-夜景器械', 'graveyard-mausoleum-midnight.png'),
    ('arch_dark',     '地图-夜景器械', 'stone-archway-midnight.png'),
    ('arch_stone',    '地图-晶石矿物', 'stone-archway.png'),
    ('gate_stone',    '地图-中式地标', 'stone-gate.png'),
    ('gate_bamboo',   '地图-中式地标', 'bamboo-gate.png'),
    ('statue_dragon', '地图-中式地标', 'dragon-statue-jade.png'),
    ('statue_lion',   '地图-中式地标', 'lion-statue-guardian.png'),
    ('statue_demon',  '地图-夜景器械', 'statue-demon-gargoyle-midnight.png'),
    ('well',          '地图-中式地标', 'well-stone.png'),
    ('hut',           '地图-夜景器械', 'well-stone-midnight.png'),
    ('altar',         '地图-夜景器械', 'altar-dark-ritual-midnight.png'),
    ('fountain',      '地图-夜景器械', 'fountain-of-magic-glowing-midnight.png'),
    ('crystal_stand', '地图-夜景器械', 'save-point-crystal-midnight.png'),
    ('geode',         '地图-夜景器械', 'crystal-geode-midnight.png'),
    # 地面小物件
    ('rock_moss',     '地图-夜景器械', 'mossy-rock-midnight.png'),
    ('rock_gray',     '地图-夜景器械', 'gray-boulder-midnight.png'),
    ('rock_pile',     '地图-夜景器械', 'rock-pile-small-midnight.png'),
    ('rock_moss_lit', '地图-晶石矿物', 'mossy-rock.png'),
    ('cairn',         '地图-中式地标', 'cairn-stones.png'),
    ('grass_tuft',    '地图-夜景器械', 'tall-grass-tuft-midnight.png'),
    ('mush_blue',     '地图-夜景器械', 'mushroom-cluster-glowing-blue-midnight.png'),
    ('mush_red',      '地图-夜景器械', 'mushroom-cluster-red-midnight.png'),
    ('crystal_purple', '地图-晶石矿物', 'crystal-cluster-purple.png'),
    ('crystal_blue',  '地图-晶石矿物', 'crystal-cluster-blue.png'),
    ('crystal_green', '地图-晶石矿物', 'crystal-cluster-green.png'),
    ('lantern_red',   '地图-中式地标', 'lantern-paper-red.png'),
    ('lantern_yellow', '地图-中式地标', 'lantern-paper-yellow.png'),
    ('brazier',       '地图-夜景器械', 'brazier-flaming-midnight.png'),
    ('torch',         '地图-夜景器械', 'wall-torch-lit-midnight.png'),
    ('campfire',      '地图-夜景器械', 'campfire-burning-midnight.png'),
    ('bones',         '地图-中式地标', 'bone-pile.png'),
    ('skulls',        '地图-中式地标', 'skull-pile.png'),
    ('web_sac',       '地图-中式地标', 'cave-spider-egg-sac.png'),
    ('wisp',          '怪物', 'wisp.png'),
    ('wisp_gold',     '怪物', 'will-o-wisp.png'),
    ('obelisk',       '地图-中式地标', 'ancient-obelisk.png'),
    ('vine',          '地图-夜景器械', 'vine-wall-midnight.png'),
]
PROP_COLS = 6


def load_trimmed(cat, name):
    p = os.path.join(SRC_ROOT, cat, name)
    im = Image.open(p).convert('RGBA')
    bbox = im.split()[3].getbbox()
    if bbox is None:
        raise ValueError('全透明: ' + p)
    return im.crop(bbox)


def build(listing, cols, out_png, label):
    items = []
    boxes = {}                                          # 名字 -> 在最终图集里的绝对包围盒 [x,y,w,h]
    for name, cat, fname in listing:
        try:
            items.append((name, load_trimmed(cat, fname)))
        except Exception as e:
            print('  !! 跳过 %-16s %s' % (name, e))
    rows = math.ceil(len(items) / cols)
    sheet = Image.new('RGBA', (cols * CELL, rows * CELL), (0, 0, 0, 0))
    for i, (name, img) in enumerate(items):
        w, h = img.size
        if w > CELL or h > CELL - MARGIN:                    # 理论上不会发生，防呆
            k = min(CELL / w, (CELL - MARGIN) / h)
            img = img.resize((max(1, int(w * k)), max(1, int(h * k))), Image.NEAREST)
            w, h = img.size
        cx = (i % cols) * CELL
        cy = (i // cols) * CELL
        # 底边居中：脚底落在格子底边（留 MARGIN 空），游戏按脚底锚点画
        dx = cx + (CELL - w) // 2
        dy = cy + CELL - h - MARGIN
        sheet.paste(img, (dx, dy))
        boxes[name] = [dx, dy, w, h]
    png = os.path.join(OUT_DIR, out_png)
    # 像素画 alpha 只有 0/255（无羽化），量化成 256 色板几乎无损，体积省约 70%
    sheet.quantize(colors=256, method=Image.FASTOCTREE).save(png, optimize=True)
    # 把每张的绝对包围盒写成 json，游戏端直接按坐标切，免网格换算、零同步风险
    with open(os.path.join(OUT_DIR, out_png.replace('.png', '.json')), 'w', encoding='utf-8') as f:
        json.dump(boxes, f, ensure_ascii=False, indent=0)
    kb = os.path.getsize(png) / 1024
    print('%s: %d 张  格子 %dpx  %d列 x %d行  %dx%d  %.0f KB'
          % (label, len(items), CELL, cols, rows, cols * CELL, rows * CELL, kb))
    print('   顺序: ' + ' '.join(n for n, _ in items))


if __name__ == '__main__':
    print('素材源:', SRC_ROOT)
    build(FOES, FOE_COLS, 'foes.png', '妖兽图集')
    build(PROPS, PROP_COLS, 'props.png', '道具图集')
