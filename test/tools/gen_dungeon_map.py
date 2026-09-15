import json
import random
import os

ROOT = r'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/test'
MAPS_PATH = os.path.join(ROOT, 'assets/maps.json')

W, H = 28, 28

# 读取现有 maps.json
data = json.load(open(MAPS_PATH, 'r', encoding='utf-8'))
data['maps'] = [m for m in data['maps'] if m['id'] != 'dungeon']

# tilePalette 扩展
PAL = data.get('tilePalette', {})
PAL.update({
    'D': 'dungeon/stoneTile_N.png',           # 石砖地面（主厅/室内）
    'P': 'dungeon/planks_N.png',              # 木板地面（高台/餐厅/桥）
    'R': 'dungeon/dirtTiles_N.png',           # 泥土（废墟外围）
    'M': 'dungeon/stoneMissingTiles_N.png',   # 破损地面（废墟）
    'S': 'dungeon/stoneSteps_N.png',          # 石阶（可行走）
})
data['tilePalette'] = PAL
data['walkable'] = '.,#;DPRMS'   # S 也允许走

# 地面网格
GND = [['R' for _ in range(W)] for _ in range(H)]
OBJS = []


def add_obj(piece, x, y, fw=1, fh=1, solid=False, dy=0):
    OBJS.append({
        'piece': piece, 'x': x, 'y': y,
        'fw': fw, 'fh': fh, 'solid': solid, 'dy': dy
    })


def set_floor_rect(x0, y0, x1, y1, ch):
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            GND[y][x] = ch


def in_rect(x, y, x0, y0, x1, y1):
    return x0 <= x <= x1 and y0 <= y <= y1


# ------------------------------------------------------------------
# 区域划分：外层是泥土废墟，内部是完整石砖地宫
# ------------------------------------------------------------------
# 主地宫范围：外墙围成的大空间
DUNGEON_X0, DUNGEON_Y0 = 2, 2
DUNGEON_X1, DUNGEON_Y1 = 25, 25
set_floor_rect(DUNGEON_X0, DUNGEON_Y0, DUNGEON_X1, DUNGEON_Y1, 'D')

# 废墟角：西南角（x=2..7, y=19..25）崩塌成泥土/破损地面
set_floor_rect(2, 19, 7, 25, 'R')
set_floor_rect(3, 22, 6, 24, 'M')
set_floor_rect(2, 20, 4, 21, 'M')

# 入口大厅：南部居中，y=18..24, x=8..19
set_floor_rect(8, 18, 19, 24, 'D')

# 中央大厅：y=10..17, x=8..19
set_floor_rect(8, 10, 19, 17, 'D')

# 祭坛高台：北部居中，y=4..9, x=10..15，木板地面
set_floor_rect(10, 4, 15, 9, 'P')
# 高台前的台阶：y=10, x=11..14
for x in range(11, 15):
    GND[10][x] = 'S'

# 餐厅：东南角，x=20..24, y=18..24，木板地面
set_floor_rect(20, 18, 24, 24, 'P')
# 储藏室：东北角，x=20..24, y=4..13
set_floor_rect(20, 4, 24, 13, 'D')

# 连接储藏室和餐厅的走廊：x=20..24, y=14..16，木板
set_floor_rect(20, 14, 24, 16, 'P')

# 中央主道：木板路从入口直通祭坛台阶，一条醒目的「回家路」
for ry in range(11, 23):
    GND[ry][14] = 'P'

# 碎石过渡：在泥土废墟与主厅交界处撒一些破损石砖
rng = random.Random(2026)
for y in range(H):
    for x in range(W):
        if GND[y][x] == 'R' and rng.random() < 0.15:
            GND[y][x] = 'M'


# ------------------------------------------------------------------
# 墙体贴片辅助函数
# ------------------------------------------------------------------
def wall_n(x, y, kind='stoneWall', solid=True):
    add_obj(f'dungeon/{kind}_N.png', x, y, solid=solid)


def wall_s(x, y, kind='stoneWall', solid=True):
    add_obj(f'dungeon/{kind}_S.png', x, y, solid=solid)


def wall_w(x, y, kind='stoneWall', solid=True):
    add_obj(f'dungeon/{kind}_W.png', x, y, solid=solid)


def wall_e(x, y, kind='stoneWall', solid=True):
    add_obj(f'dungeon/{kind}_E.png', x, y, solid=solid)


def corner_nw(x, y):
    add_obj('dungeon/stoneWallCorner_N.png', x, y, solid=True)


def corner_ne(x, y):
    add_obj('dungeon/stoneWallCorner_E.png', x, y, solid=True)


def corner_sw(x, y):
    add_obj('dungeon/stoneWallCorner_W.png', x, y, solid=True)


def corner_se(x, y):
    add_obj('dungeon/stoneWallCorner_S.png', x, y, solid=True)


def arch_n(x, y):
    add_obj('dungeon/stoneWallArchway_N.png', x, y, solid=False)


def arch_s(x, y):
    add_obj('dungeon/stoneWallArchway_S.png', x, y, solid=False)


def arch_e(x, y):
    add_obj('dungeon/stoneWallArchway_E.png', x, y, solid=False)


def arch_w(x, y):
    add_obj('dungeon/stoneWallArchway_W.png', x, y, solid=False)


# ------------------------------------------------------------------
# 外墙：围合主地宫，带拱门 + 破损段
# ------------------------------------------------------------------
# 北墙 y=2
for x in range(3, 25):
    if x == 13:
        arch_n(x, 2)
    else:
        wall_n(x, 2)
# 南墙 y=25
for x in range(3, 25):
    if x == 14:
        arch_s(x, 25)
    else:
        wall_s(x, 25)
# 西墙 x=2
for y in range(3, 25):
    if y == 14:
        arch_w(2, y)
    elif 18 <= y <= 22:
        wall_w(2, y, kind='stoneWallBroken')
    else:
        wall_w(2, y)
# 东墙 x=25
for y in range(3, 25):
    if y == 17:
        arch_e(25, y)
    else:
        wall_e(25, y)

# 外墙角
corner_nw(2, 2)
corner_ne(25, 2)
corner_sw(2, 25)
corner_se(25, 25)


# ------------------------------------------------------------------
# 内部隔断：半墙/拱门/残破墙，让空间连通又有层次
# ------------------------------------------------------------------
# 中央大厅与入口大厅之间：只在东侧留半墙分隔，留出通透感
for x in range(8, 12):
    wall_n(x, 17, kind='stoneWallHalf', solid=True)
# 中央大厅北侧通往祭坛的拱门两侧：短柱 + 半墙
for x in range(9, 11):
    wall_n(x, 9, kind='stoneWallHalf', solid=True)
for x in range(15, 17):
    wall_n(x, 9, kind='stoneWallHalf', solid=True)

# 入口大厅东侧通往餐厅的大门：y=20..22 处用栅栏门
for y in range(20, 23):
    wall_e(19, y, kind='stoneWallGateOpen')

# 中央大厅东侧通往储藏室/餐厅的拱门：y=15
arch_e(19, 15)
# 拱门两侧小柱
wall_e(19, 14, kind='stoneWallColumnIn')
wall_e(19, 16, kind='stoneWallColumnIn')

# 储藏室与餐厅之间：半墙隔断
for x in range(20, 24):
    wall_s(x, 13, kind='stoneWallHalf', solid=True)

# 祭坛高台四周：矮护栏（半墙）
for x in range(10, 16):
    wall_n(x, 3, kind='stoneWallHalf', solid=True)
for y in range(4, 10):
    wall_w(9, y, kind='stoneWallHalf', solid=True)
    wall_e(16, y, kind='stoneWallHalf', solid=True)
# 祭坛高台南侧用台阶连接，两侧半墙收口
wall_e(9, 10, kind='stoneWallHalf')
wall_w(16, 10, kind='stoneWallHalf')

# 废墟角的残破内墙，营造崩塌感
for y in range(19, 25):
    wall_e(7, y, kind='stoneWallBroken')
for x in range(2, 7):
    wall_n(x, 19, kind='stoneWallBroken')


# ------------------------------------------------------------------
# 立柱：中央大厅 + 入口大厅，撑起"殿堂感"
# ------------------------------------------------------------------
columns = [
    (10, 13), (17, 13),
    (10, 21), (17, 21),
    (22, 6), (22, 21),
]
for x, y in columns:
    add_obj('dungeon/stoneColumn_N.png', x, y, solid=False)


# ------------------------------------------------------------------
# 家具：成簇摆放，避免填格子
# ------------------------------------------------------------------
def cluster(objs, cx, cy):
    """objs: list of (piece, dx, dy)"""
    for piece, dx, dy in objs:
        add_obj(piece, cx + dx, cy + dy, solid=False)


# 祭坛：中央长桌 + 椅子 + 宝箱
cluster([
    ('dungeon/tableShort_N.png', 0, 0),
    ('dungeon/chair_N.png', 0, 1),
    ('dungeon/chestClosed_N.png', 2, 0),
    ('dungeon/woodenCrate_N.png', -1, 1),
], 13, 6)

# 餐厅：圆桌 + 桌椅 + 木桶组
cluster([
    ('dungeon/tableRoundChairs_N.png', 0, 0),
    ('dungeon/tableShortChairs_N.png', 2, 1),
    ('dungeon/barrels_N.png', -1, 2),
    ('dungeon/barrel_N.png', 1, 2),
    ('dungeon/chair_N.png', 3, 0),
], 22, 20)

# 储藏室：角落堆箱 + 木桶
cluster([
    ('dungeon/woodenCrates_N.png', 0, 0),
    ('dungeon/chestClosed_N.png', 1, 1),
    ('dungeon/barrelsStacked_N.png', 3, 0),
    ('dungeon/woodenCrate_N.png', 2, 2),
], 22, 6)

# 入口大厅：迎客几张椅 + 宝箱
cluster([
    ('dungeon/chair_N.png', 0, 0),
    ('dungeon/chair_N.png', 2, 0),
    ('dungeon/chestOpen_N.png', 1, 1),
    ('dungeon/barrel_N.png', -1, 2),
], 13, 22)

# 废墟角：倒塌的木梁 + 宝箱
cluster([
    ('dungeon/woodenSupportBeams_N.png', 0, 0),
    ('dungeon/woodenSupports_N.png', 1, 0),
    ('dungeon/chestClosed_N.png', 0, 1),
    ('dungeon/barrel_N.png', 2, 1),
], 4, 22)


# ------------------------------------------------------------------
# 传送门 + 玩家起点
# ------------------------------------------------------------------
# 南/西/东三个拱门各设一个外传门（北门作装饰）；落点 = 目标图的安全格，
# 且与该图的返回门错开，避免「落地即回传」死循环。
portals = [
    { 'x': 14, 'y': 24, 'to': 'qingxuan', 'spawnX': 17, 'spawnY': 27, 'label': '青玄山门' },
    { 'x': 3,  'y': 14, 'to': 'lingquan', 'spawnX': 10, 'spawnY': 26, 'label': '灵泉灵瀑' },
    { 'x': 24, 'y': 17, 'to': 'beilin',   'spawnX': 15, 'spawnY': 24, 'label': '碑林石阵' }
]
start_x, start_y = 14, 22


# ------------------------------------------------------------------
# 构建地图对象
# ------------------------------------------------------------------
new_map = {
    'id': 'dungeon',
    'name': '幽冥地宫',
    'note': 'Kenney 风格重制：连续外墙围合、半墙分隔、立柱支撑、祭坛高台与废墟角',
    'w': W, 'h': H,
    'ground': [''.join(row) for row in GND],
    'objects': OBJS,
    'portals': portals,
    'spawn': { 'x': start_x, 'y': start_y }
}

data['maps'].append(new_map)
json.dump(data, open(MAPS_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('dungeon map regenerated: %dx%d, %d objects, %d portals, start=(%d,%d)' % (
    W, H, len(OBJS), len(portals), start_x, start_y))
