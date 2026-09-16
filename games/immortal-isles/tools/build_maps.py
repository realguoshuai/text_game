# -*- coding: utf-8 -*-
"""
用切好的图块拼装多张独立地图，输出 assets/maps.json。
- ground: 字符网格。'.'草地 ','苔草 '#'石板 ';'青石 '~'水 '-'深水 ' '虚空(透出天空)
- objects: {piece, x, y, fw, fh, dy} —— x,y 为占地左上格；锚点=占地中心格的地面中心，bottom-center 对齐
- portals: {x, y, to, spawnX, spawnY, label} —— 踩上即切换地图
"""
import os, json

ROOT = 'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/test'
SLICED = os.path.join(ROOT, 'assets', 'sliced')
man = json.load(open(os.path.join(SLICED, 'manifest.json'), encoding='utf-8'))
HAVE = {m['file'] for m in man['pieces']}

# 地砖调色板（实测：菱形 119~120 x 高 60，板厚 ~14）
TILE = {
    '.': 'building_015_119x75.png',   # 草地（主色 109,157,89 占42%）
    ',': 'building_012_120x77.png',   # 苔草（黄绿 171,199,88）
    '#': 'building_014_119x77.png',   # 石板（米灰 180,180,150）
    ';': 'building_018_115x73.png',   # 青石（灰白 184,186,172）
    '~': 'building_017_118x75.png',   # 水（青 79,225,224）
    '-': 'building_016_119x76.png',   # 深水（青 78,206,210）
}
WALKABLE = set('. ,#;'.split(',')) | {'.', ',', '#', ';'}


def ellipse(W, H, cx, cy, rx, ry, fill='.', around=None):
    g = [[' '] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0:
                g[y][x] = fill
    return g


def setg(g, x, y, ch):
    if 0 <= y < len(g) and 0 <= x < len(g[0]):
        g[y][x] = ch


def rect(g, x0, y0, x1, y1, ch):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            setg(g, x, y, ch)


def disc(g, cx, cy, r, ch):
    for y in range(len(g)):
        for x in range(len(g[0])):
            if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                setg(g, x, y, ch)


def rows(g):
    return [''.join(r) for r in g]


maps = []

# ---------------- 地图 1：青玄山门 ----------------
W = H = 26
g = ellipse(W, H, 12.5, 13, 11.5, 11.5, '.')
# 竖向主道 + 山门广场
rect(g, 12, 4, 13, 22, '#')
rect(g, 10, 4, 15, 7, '#')
rect(g, 11, 18, 14, 20, '#')
# 侧院
rect(g, 5, 10, 8, 13, ';')
rect(g, 17, 12, 20, 15, ';')
# 水池
disc(g, 6, 19, 3, '~')
disc(g, 19, 19, 2, '-')
objs = [
    dict(piece='building_006_120x168.png', x=10, y=2, fw=6, fh=3),    # 主殿（蓝顶）
    dict(piece='building_005_111x161.png', x=4, y=7, fw=3, fh=3),     # 宝塔
    dict(piece='building_009_73x133.png', x=3, y=14, fw=2, fh=3),     # 副塔
    dict(piece='building_010_120x106.png', x=21, y=9, fw=2, fh=2),    # 侧屋
    dict(piece='building_007_141x136.png', x=21, y=20, fw=2, fh=2),   # 松树
    dict(piece='building_013_77x122.png', x=2, y=19, fw=1, fh=2),     # 树
    dict(piece='building_008_94x149.png', x=8, y=16, fw=1, fh=2),     # 竹
    dict(piece='prop_035_37x74.png', x=11, y=10, fw=1, fh=1),         # 灯笼
    dict(piece='prop_035_37x74.png', x=14, y=13, fw=1, fh=1),
    dict(piece='prop_036_30x64.png', x=11, y=17, fw=1, fh=1),
    dict(piece='prop_036_30x64.png', x=14, y=8, fw=1, fh=1),
    dict(piece='prop_038_21x90.png', x=9, y=4, fw=1, fh=1),           # 栏柱
    dict(piece='prop_038_21x90.png', x=16, y=4, fw=1, fh=1),
    dict(piece='prop_024_78x58.png', x=9, y=12, fw=1, fh=1),          # 石板
    dict(piece='prop_024_78x58.png', x=15, y=15, fw=1, fh=1),
    dict(piece='prop_025_77x58.png', x=17, y=17, fw=1, fh=1),         # 草皮
    dict(piece='prop_044_95x40.png', x=2, y=3, fw=1, fh=1),           # 云
    dict(piece='prop_045_88x41.png', x=22, y=5, fw=1, fh=1),
    dict(piece='prop_047_67x39.png', x=1, y=9, fw=1, fh=1),
    dict(piece='prop_051_50x26.png', x=20, y=1, fw=1, fh=1),
]
maps.append(dict(
    id='qingxuan', name='青玄山门', w=W, h=H, ground=rows(g), objects=objs,
    portals=[
        dict(x=12, y=24, to='lingquan', spawnX=10, spawnY=4, label='灵泉灵瀑'),
        dict(x=24, y=13, to='beilin', spawnX=4, spawnY=11, label='碑林石阵'),
    ],
    note='宗门主岛：主殿、宝塔、山道'))

# ---------------- 地图 2：灵泉灵瀑 ----------------
W = H = 26
g = ellipse(W, H, 12.5, 12.5, 11.5, 11.5, '.')
disc(g, 16, 15, 5, '~')          # 灵泉
disc(g, 16, 15, 2, '-')
rect(g, 10, 5, 11, 20, '#')      # 石阶
rect(g, 11, 5, 17, 5, '#')
disc(g, 6, 8, 3, ',')
objs = [
    dict(piece='building_008_94x149.png', x=3, y=4, fw=1, fh=2),      # 竹丛
    dict(piece='building_008_94x149.png', x=6, y=4, fw=1, fh=2),
    dict(piece='building_007_141x136.png', x=20, y=4, fw=2, fh=2),    # 松
    dict(piece='building_004_168x198.png', x=2, y=13, fw=3, fh=3),    # 树丛
    dict(piece='building_013_77x122.png', x=21, y=20, fw=1, fh=2),
    dict(piece='building_010_120x106.png', x=19, y=15, fw=2, fh=2),
    dict(piece='building_021_112x88.png', x=12, y=9, fw=2, fh=2),     # 石台
    dict(piece='prop_023_73x105.png', x=8, y=10, fw=1, fh=1),         # 石雕
    dict(piece='prop_026_53x77.png', x=12, y=19, fw=1, fh=1),         # 石
    dict(piece='prop_042_45x35.png', x=17, y=11, fw=1, fh=1),
    dict(piece='prop_042_45x35.png', x=19, y=18, fw=1, fh=1),
    dict(piece='prop_030_80x59.png', x=5, y=18, fw=1, fh=1),
    dict(piece='prop_019_91x98.png', x=14, y=12, fw=1, fh=1),
    dict(piece='prop_025_77x58.png', x=9, y=14, fw=1, fh=1),
    dict(piece='deco_034_44x43.png', x=13, y=6, fw=1, fh=1),
    dict(piece='prop_044_95x40.png', x=1, y=2, fw=1, fh=1),
    dict(piece='prop_045_88x41.png', x=23, y=2, fw=1, fh=1),
    dict(piece='prop_047_67x39.png', x=1, y=22, fw=1, fh=1),
    dict(piece='prop_051_50x26.png', x=24, y=12, fw=1, fh=1),
    dict(piece='prop_044_95x40.png', x=8, y=24, fw=1, fh=1),
]
maps.append(dict(
    id='lingquan', name='灵泉灵瀑', w=W, h=H, ground=rows(g), objects=objs,
    portals=[
        dict(x=10, y=2, to='qingxuan', spawnX=12, spawnY=22, label='青玄山门'),
        dict(x=22, y=18, to='beilin', spawnX=4, spawnY=11, label='碑林石阵'),
    ],
    note='灵泉湖泊：竹丛、松林、石台'))

# ---------------- 地图 3：碑林石阵 ----------------
W = H = 24
g = ellipse(W, H, 11.5, 11.5, 10.5, 10.5, '#')
rect(g, 10, 2, 11, 20, ';')
rect(g, 3, 3, 8, 8, ';')
disc(g, 6, 17, 3, ',')
disc(g, 17, 6, 3, ',')
objs = [
    dict(piece='building_003_179x212.png', x=9, y=3, fw=4, fh=4),     # 巨碑
    dict(piece='building_009_73x133.png', x=15, y=3, fw=2, fh=3),     # 石塔
    dict(piece='building_007_141x136.png', x=3, y=9, fw=2, fh=2),     # 古松
    dict(piece='building_013_77x122.png', x=19, y=13, fw=1, fh=2),
    dict(piece='building_021_112x88.png', x=5, y=12, fw=2, fh=2),     # 石台
    dict(piece='prop_023_73x105.png', x=13, y=10, fw=1, fh=1),        # 石雕
    dict(piece='prop_026_53x77.png', x=16, y=15, fw=1, fh=1),
    dict(piece='prop_042_45x35.png', x=8, y=15, fw=1, fh=1),
    dict(piece='prop_042_45x35.png', x=14, y=19, fw=1, fh=1),
    dict(piece='prop_030_80x59.png', x=19, y=9, fw=1, fh=1),
    dict(piece='prop_038_21x90.png', x=9, y=8, fw=1, fh=1),           # 栏柱
    dict(piece='prop_038_21x90.png', x=12, y=8, fw=1, fh=1),
    dict(piece='prop_039_23x64.png', x=9, y=13, fw=1, fh=1),
    dict(piece='prop_039_23x64.png', x=12, y=13, fw=1, fh=1),
    dict(piece='prop_024_78x58.png', x=10, y=17, fw=1, fh=1),
    dict(piece='prop_025_77x58.png', x=7, y=19, fw=1, fh=1),
    dict(piece='prop_044_95x40.png', x=1, y=1, fw=1, fh=1),
    dict(piece='prop_045_88x41.png', x=21, y=1, fw=1, fh=1),
    dict(piece='prop_047_67x39.png', x=1, y=20, fw=1, fh=1),
    dict(piece='prop_051_50x26.png', x=20, y=21, fw=1, fh=1),
]
maps.append(dict(
    id='beilin', name='碑林石阵', w=W, h=H, ground=rows(g), objects=objs,
    portals=[
        dict(x=2, y=11, to='qingxuan', spawnX=22, spawnY=13, label='青玄山门'),
        dict(x=20, y=17, to='lingquan', spawnX=22, spawnY=17, label='灵泉灵瀑'),
    ],
    note='碑林：巨碑、石塔、栏柱阵'))

# ---------------- 校验 + 输出 ----------------
def solid_cells(mp):
    s = set()
    for o in mp['objects']:
        for ddy in range(o.get('fh', 1)):
            for ddx in range(o.get('fw', 1)):
                s.add((o['x'] + ddx, o['y'] + ddy))
    return s


byid = {mp['id']: mp for mp in maps}
errs = []
for mp in maps:
    sol = solid_cells(mp)
    for i, r in enumerate(mp['ground']):
        if len(r) != mp['w']:
            errs.append(f"{mp['id']} row{i} len={len(r)} != {mp['w']}")
    for o in mp['objects']:
        if o['piece'] not in HAVE:
            errs.append(f"{mp['id']} missing piece {o['piece']}")
        if not (0 <= o['x'] < mp['w'] and 0 <= o['y'] < mp['h']):
            errs.append(f"{mp['id']} object out of bounds {o}")
    for p in mp['portals']:
        ch = mp['ground'][p['y']][p['x']]
        if ch in (' ', '~', '-'):
            errs.append(f"{mp['id']} portal on non-walkable '{ch}' at {p['x']},{p['y']}")
        if (p['x'], p['y']) in sol:
            errs.append(f"{mp['id']} portal blocked by solid at {p['x']},{p['y']}")
        if p['to'] not in byid:
            errs.append(f"{mp['id']} portal target missing {p['to']}")
            continue
        t = byid[p['to']]
        sx, sy = p['spawnX'], p['spawnY']
        if not (0 <= sx < t['w'] and 0 <= sy < t['h']):
            errs.append(f"{mp['id']}->{t['id']} spawn out of bounds {sx},{sy}")
            continue
        c2 = t['ground'][sy][sx]
        if c2 in (' ', '~', '-'):
            errs.append(f"{mp['id']}->{t['id']} spawn non-walkable '{c2}' at {sx},{sy}")
        if (sx, sy) in solid_cells(t):
            errs.append(f"{mp['id']}->{t['id']} spawn on solid at {sx},{sy}")
        if p['to'] not in {m['id'] for m in maps if m['id'] != mp['id']} and p['to'] == mp['id']:
            errs.append(f"{mp['id']} self portal")

ST = dict(map='qingxuan', x=12, y=20)
_s = byid[ST['map']]
if _s['ground'][ST['y']][ST['x']] in (' ', '~', '-'):
    errs.append(f"start non-walkable '{_s['ground'][ST['y']][ST['x']]}'")
if (ST['x'], ST['y']) in solid_cells(_s):
    errs.append('start on solid')

out = dict(tileW=120, tileH=60, tilePalette=TILE, walkable='.,#;',
           water='~-', start=ST, maps=maps)
os.makedirs(os.path.join(ROOT, 'assets'), exist_ok=True)
json.dump(out, open(os.path.join(ROOT, 'assets', 'maps.json'), 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('errors:', errs if errs else 'none')
for mp in maps:
    print(f"{mp['id']:10s} {mp['name']:6s} {mp['w']}x{mp['h']} objects={len(mp['objects'])} portals={len(mp['portals'])}")
print('wrote assets/maps.json')
