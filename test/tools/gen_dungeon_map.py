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
    'D': 'dungeon/stoneTile_N.png',           # 平整石砖（房间内地面，安静底色）
    'T': 'dungeon/stoneUneven_N.png',         # 石块路（凸起，通道/路网，视觉引导）
    'P': 'dungeon/planks_N.png',              # 木板地面（高台/餐厅/走廊）
    'R': 'dungeon/dirtTiles_N.png',           # 泥土（旧，保留兼容）
    'X': 'dungeon/dirtTiles_N.png',           # 外围泥土（不可走：点了也过不去）
    'M': 'dungeon/stoneMissingTiles_N.png',   # 破损地面（废墟角，可走）
    'S': 'dungeon/stoneSteps_N.png',          # 石阶（可行走）
})
data['tilePalette'] = PAL
data['walkable'] = '.,#;DPRTMS'   # D/T/P/M/S 均可走；X 不在表内=不可走

# 地面网格
GND = [['X' for _ in range(W)] for _ in range(H)]  # 外圈默认=不可走泥土
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


# ------------------------------------------------------------------
# 地面分层（可通行区域与上一版完全一致，仅重排纹理）：
#   外围 X 泥土（不可走） > 房间 D 平整石砖 > 路网 T 凸起石块路
#   > 高台/餐厅/走廊 P 木板 > 废墟角 M 破损石砖 > 台阶 S
# ------------------------------------------------------------------
DUNGEON_X0, DUNGEON_Y0 = 2, 2
DUNGEON_X1, DUNGEON_Y1 = 25, 25
set_floor_rect(DUNGEON_X0, DUNGEON_Y0, DUNGEON_X1, DUNGEON_Y1, 'T')  # 内部先铺路网底色

# 房间：平整石砖，和路网拉开材质层次
set_floor_rect(8, 10, 19, 17, 'D')    # 中央大厅
set_floor_rect(8, 18, 19, 24, 'D')    # 入口大厅
set_floor_rect(20, 4, 24, 13, 'D')    # 储藏室

# 祭坛高台 + 台阶
set_floor_rect(10, 4, 15, 9, 'P')
for x in range(11, 15):
    GND[10][x] = 'S'

# 餐厅 + 储藏/餐厅之间的木板走廊
set_floor_rect(20, 18, 24, 24, 'P')
set_floor_rect(20, 14, 24, 16, 'P')

# 废墟角：西南角崩塌成破损地面（仍可走）
set_floor_rect(3, 22, 6, 24, 'M')
set_floor_rect(2, 20, 4, 21, 'M')

# 十字主路网（石块路，把四道拱门串起来，玩家一眼看清「能走的路」）
for y in range(11, 23):
    GND[y][13] = 'T'
    GND[y][14] = 'T'                  # 南北主道（入口拱门 -> 祭坛台阶）
for x in range(3, 25):
    GND[15][x] = 'T'
    GND[16][x] = 'T'                  # 东西主道（西拱门 -> 东拱门）

# 废墟角与主厅之间的过渡带撒破损石砖，强化「年久失修」
rng = random.Random(2026)
for y in range(19, 26):
    for x in range(2, 8):
        if GND[y][x] == 'T' and rng.random() < 0.35:
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
# 外墙：石墙为主，隔几格插风化墙/窗栏，统一灰石色系、避免单调
# ------------------------------------------------------------------
def outer_kind(i):
    # 每 4 格一面风化墙，节奏稳定
    return 'stoneWallAged' if i % 4 == 2 else 'stoneWall'


# 北墙 y=2（带一扇窗栏）
for i, x in enumerate(range(3, 25)):
    if x == 13:
        arch_n(x, 2)
    elif x == 8:
        wall_n(x, 2, kind='stoneWallWindowBars')
    else:
        wall_n(x, 2, kind=outer_kind(i))
# 南墙 y=25
for i, x in enumerate(range(3, 25)):
    if x == 14:
        arch_s(x, 25)
    else:
        wall_s(x, 25, kind=outer_kind(i))
# 西墙 x=2（中段破损带，端头用 Left/Right 收边）
for i, y in enumerate(range(3, 25)):
    if y == 14:
        arch_w(2, y)
    elif y == 18:
        wall_w(2, y, kind='stoneWallBrokenLeft')
    elif 19 <= y <= 21:
        wall_w(2, y, kind='stoneWallBroken')
    elif y == 22:
        wall_w(2, y, kind='stoneWallBrokenRight')
    else:
        wall_w(2, y, kind=outer_kind(i))
# 东墙 x=25
for i, y in enumerate(range(3, 25)):
    if y == 17:
        arch_e(25, y)
    elif y == 8:
        wall_e(25, y, kind='stoneWallHole')
    else:
        wall_e(25, y, kind=outer_kind(i))

# 外墙角
corner_nw(2, 2)
corner_ne(25, 2)
corner_sw(2, 25)
corner_se(25, 25)


# ------------------------------------------------------------------
# 内部隔断：半墙/拱门/残破墙，让空间连通又有层次（与上版一致）
# ------------------------------------------------------------------
for x in range(8, 12):
    wall_n(x, 17, kind='stoneWallHalf', solid=True)
for x in range(9, 11):
    wall_n(x, 9, kind='stoneWallHalf', solid=True)
for x in range(15, 17):
    wall_n(x, 9, kind='stoneWallHalf', solid=True)

# 入口大厅东侧通往餐厅的大门：栅栏门
for y in range(20, 23):
    wall_e(19, y, kind='stoneWallGateOpen')

# 中央大厅东侧通往储藏室的拱门
arch_e(19, 15)
wall_e(19, 14, kind='stoneWallColumnIn')
wall_e(19, 16, kind='stoneWallColumnIn')

# 储藏室与餐厅之间：半墙隔断
for x in range(20, 24):
    wall_s(x, 13, kind='stoneWallHalf', solid=True)

# 祭坛高台四周矮护栏
for x in range(10, 16):
    wall_n(x, 3, kind='stoneWallHalf', solid=True)
for y in range(4, 10):
    wall_w(9, y, kind='stoneWallHalf', solid=True)
    wall_e(16, y, kind='stoneWallHalf', solid=True)
wall_e(9, 10, kind='stoneWallHalf')
wall_w(16, 10, kind='stoneWallHalf')

# 废墟角残破内墙
for y in range(19, 25):
    wall_e(7, y, kind='stoneWallBroken')
for x in range(2, 7):
    wall_n(x, 19, kind='stoneWallBroken')


# ------------------------------------------------------------------
# 立柱：中央大厅石柱撑起殿堂感，入口换木柱（材质对比但不跳色）
# ------------------------------------------------------------------
columns = [
    (10, 13), (17, 13),
    (10, 21), (17, 21),
    (22, 6), (22, 21),
]
for x, y in columns:
    add_obj('dungeon/stoneColumn_N.png', x, y, solid=False)
# 入口大厅一对木柱
add_obj('dungeon/stoneColumnWood_N.png', 9, 19, solid=False)
add_obj('dungeon/stoneColumnWood_N.png', 18, 19, solid=False)


# ------------------------------------------------------------------
# 家具/装饰：成簇摆放，废墟角专门做「崩塌残骸」氛围
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

# 餐厅：圆桌 + 桌椅 + 木桶组；地面点缀破洞木板
cluster([
    ('dungeon/tableRoundChairs_N.png', 0, 0),
    ('dungeon/tableShortChairs_N.png', 2, 1),
    ('dungeon/barrels_N.png', -1, 2),
    ('dungeon/barrel_N.png', 1, 2),
    ('dungeon/chair_N.png', 3, 0),
], 22, 20)
add_obj('dungeon/planksBroken_N.png', 21, 21, solid=False)
add_obj('dungeon/planksHole_N.png', 23, 23, solid=False)

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

# 废墟角：倒塌残骸全家桶（破桌椅/木堆/塌梁/螺旋梯遗迹）
cluster([
    ('dungeon/woodenSupportBeams_N.png', 0, 0),
    ('dungeon/woodenSupports_N.png', 1, 0),
    ('dungeon/chestClosed_N.png', 0, 1),
    ('dungeon/barrel_N.png', 2, 1),
    ('dungeon/tableChairsBroken_N.png', -1, -1),
    ('dungeon/woodenPile_N.png', 1, 2),
], 4, 22)
add_obj('dungeon/stairsSpiral_N.png', 3, 24, solid=False)


# ------------------------------------------------------------------
# 传送门 + 玩家起点（坐标与上版完全一致，玩法不变）
# ------------------------------------------------------------------
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
    'note': '视觉重制 v3：平整石砖房间 + 凸起石块路网 + 木板高台分层，风化墙/窗栏/残骸营造废墟氛围',
    'w': W, 'h': H,
    'ground': [''.join(row) for row in GND],
    'objects': OBJS,
    'portals': portals,
    'spawn': { 'x': start_x, 'y': start_y },
    'home': { 'x': start_x, 'y': start_y }   # 直达 ?map=dungeon 时的出生点（引擎读 home）
}

data['maps'].append(new_map)
json.dump(data, open(MAPS_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('dungeon map regenerated: %dx%d, %d objects, %d portals, start=(%d,%d)' % (
    W, H, len(OBJS), len(portals), start_x, start_y))
