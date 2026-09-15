import json
import random
import os

ROOT = r'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/test'
MAPS_PATH = os.path.join(ROOT, 'assets/maps.json')

W, H = 28, 28

# 读取现有 maps.json
data = json.load(open(MAPS_PATH, 'r', encoding='utf-8'))

# 移除旧的 dungeon 地图（如果存在）
data['maps'] = [m for m in data['maps'] if m['id'] != 'dungeon']

# tilePalette 扩展：保留原有字符，新增地牢字符
# 原有：. , # ; ~ - D P
PAL = data.get('tilePalette', {})
PAL.update({
    'D': 'dungeon/stoneTile_N.png',       # 石砖地面
    'P': 'dungeon/planks_N.png',          # 木板地面
    'R': 'dungeon/dirtTiles_N.png',       # 泥土地面
    'M': 'dungeon/stoneMissingTiles_N.png',  # 破损地面
})
data['tilePalette'] = PAL
data['walkable'] = '.,#;DPRM'   # 这些地面可行走

# 构建地面网格：默认石砖
GND = [['D' for _ in range(W)] for _ in range(H)]

# 对象列表
OBJS = []

def add_obj(piece, x, y, fw=1, fh=1, solid=False, dy=0):
    OBJS.append({
        'piece': piece,
        'x': x, 'y': y,
        'fw': fw, 'fh': fh,
        'solid': solid,
        'dy': dy
    })

# ------------------------------------------------------------------
# 房间定义 (x0,y0,x1,y1) 为闭区间
# ------------------------------------------------------------------
rooms = [
    # 入口大厅，左下近屏幕
    {'id': 'hall', 'rect': (3, 18, 11, 25), 'floor': 'D'},
    # 走廊：从大厅北门向东上延伸
    {'id': 'corridor', 'rect': (11, 12, 15, 18), 'floor': 'P'},
    # 餐厅/休息区，右侧
    {'id': 'dining', 'rect': (15, 10, 23, 18), 'floor': 'D'},
    # 储藏室，右上
    {'id': 'storage', 'rect': (17, 2, 23, 9), 'floor': 'D'},
    # 侧厅/书房，左上
    {'id': 'study', 'rect': (3, 8, 11, 15), 'floor': 'D'},
]

# 门洞：((x,y), 'N/E/S/W')
doors = [
    ((7, 18), 'N'),   # 大厅北门 -> 走廊
    ((15, 15), 'E'),  # 走廊东门 -> 餐厅
    ((19, 9), 'N'),   # 餐厅北门 -> 储藏室
    ((7, 15), 'E'),   # 侧厅东门 -> 大厅
]

# 地面填充：按房间铺不同地面，走廊木板
for r in rooms:
    x0, y0, x1, y1 = r['rect']
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            GND[y][x] = r['floor']

# 辅助：检查一个边界格是否是门洞
def is_door(x, y):
    for (dx, dy), d in doors:
        if dx == x and dy == y:
            return d
    return None

# 围房间墙
for r in rooms:
    x0, y0, x1, y1 = r['rect']
    # 北墙 y=y0, x=x0..x1
    for x in range(x0, x1 + 1):
        d = is_door(x, y0)
        if d == 'N':
            add_obj('dungeon/stoneWallArchway_N.png', x, y0, solid=False)
        elif d == 'S':
            add_obj('dungeon/stoneWallArchway_S.png', x, y0, solid=False)
        elif d == 'E':
            add_obj('dungeon/stoneWallArchway_E.png', x, y0, solid=False)
        elif d == 'W':
            add_obj('dungeon/stoneWallArchway_W.png', x, y0, solid=False)
        else:
            add_obj('dungeon/stoneWall_N.png', x, y0, solid=True)
    # 南墙 y=y1, x=x0..x1
    for x in range(x0, x1 + 1):
        d = is_door(x, y1)
        if d == 'N':
            add_obj('dungeon/stoneWallArchway_N.png', x, y1, solid=False)
        elif d == 'S':
            add_obj('dungeon/stoneWallArchway_S.png', x, y1, solid=False)
        elif d == 'E':
            add_obj('dungeon/stoneWallArchway_E.png', x, y1, solid=False)
        elif d == 'W':
            add_obj('dungeon/stoneWallArchway_W.png', x, y1, solid=False)
        else:
            add_obj('dungeon/stoneWall_S.png', x, y1, solid=True)
    # 西墙 x=x0, y=y0..y1
    for y in range(y0, y1 + 1):
        d = is_door(x0, y)
        if d:
            add_obj(f'dungeon/stoneWallArchway_{d}.png', x0, y, solid=False)
        else:
            add_obj('dungeon/stoneWall_W.png', x0, y, solid=True)
    # 东墙 x=x1, y=y0..y1
    for y in range(y0, y1 + 1):
        d = is_door(x1, y)
        if d:
            add_obj(f'dungeon/stoneWallArchway_{d}.png', x1, y, solid=False)
        else:
            add_obj('dungeon/stoneWall_E.png', x1, y, solid=True)
    # 四个墙角：先移除同格直墙，再用 corner 覆盖
    corners = [
        (x0, y0, 'dungeon/stoneWallCorner_N.png'),
        (x1, y0, 'dungeon/stoneWallCorner_E.png'),
        (x0, y1, 'dungeon/stoneWallCorner_W.png'),
        (x1, y1, 'dungeon/stoneWallCorner_S.png'),
    ]
    for cx, cy, _ in corners:
        OBJS[:] = [o for o in OBJS if not (o['x'] == cx and o['y'] == cy)]
    for cx, cy, piece in corners:
        add_obj(piece, cx, cy, solid=True)

# 装饰：在一些直墙段替换为窗/破墙/ aged 墙，增加变化
wall_positions = [(o['x'], o['y']) for o in OBJS if o['piece'] == 'dungeon/stoneWall_N.png']
random.seed(42)
# 随机把部分北墙换成窗或 aged 墙
for x, y in random.sample(wall_positions, min(4, len(wall_positions))):
    o = next(o for o in OBJS if o['x'] == x and o['y'] == y and o['piece'] == 'dungeon/stoneWall_N.png')
    o['piece'] = random.choice(['dungeon/stoneWallAged_N.png', 'dungeon/stoneWallWindow_N.png', 'dungeon/stoneWallHole_N.png'])

# ------------------------------------------------------------------
# 家具摆放（只在房间内、非墙、非门洞位置）
# ------------------------------------------------------------------
def in_room(x, y, r):
    x0, y0, x1, y1 = r['rect']
    return x0 < x < x1 and y0 < y < y1

# 收集所有 solid 位置
solid_set = set((o['x'], o['y']) for o in OBJS if o.get('solid'))
door_set = set((x, y) for (x, y), d in doors)

def free_spots(r):
    x0, y0, x1, y1 = r['rect']
    spots = []
    for y in range(y0 + 1, y1):
        for x in range(x0 + 1, x1):
            if (x, y) not in solid_set and (x, y) not in door_set:
                spots.append((x, y))
    return spots

rng = random.Random(123)

# 大厅：放几根石柱 + 木梁架 + 宝箱
hall = rooms[0]
spots = free_spots(hall)
rng.shuffle(spots)
# 中央木梁架（需要 2x2 空间，放 4 根柱子 + 梁）
for x, y in spots[:]:
    if x in (6, 8) and y in (20, 22):
        add_obj('dungeon/woodenSupports_N.png', x, y, solid=False)
# 横梁：视觉上跨在大厅上方，放在稍远处（y 更小）
for x in range(5, 10):
    add_obj('dungeon/woodenSupportBeams_N.png', x, 18, solid=False)
# 宝箱靠南墙
add_obj('dungeon/chestClosed_N.png', 5, 24, solid=False)
add_obj('dungeon/chestOpen_N.png', 9, 24, solid=False)

# 走廊：放些木桶
for x, y in [(12, 14), (13, 16), (14, 13)]:
    add_obj('dungeon/barrel_N.png', x, y, solid=False)

# 餐厅：圆桌 + 椅子 + 长桌
dining = rooms[1]
dspots = free_spots(dining)
rng.shuffle(dspots)
for i, (x, y) in enumerate(dspots):
    if i == 0:
        add_obj('dungeon/tableRoundChairs_N.png', x, y, solid=False)
    elif i == 1:
        add_obj('dungeon/tableShortChairs_N.png', x, y, solid=False)
    elif i == 2:
        add_obj('dungeon/barrelsStacked_N.png', x, y, solid=False)
    elif i == 3:
        add_obj('dungeon/woodenCrates_N.png', x, y, solid=False)
    elif i == 4:
        add_obj('dungeon/chair_N.png', x, y, solid=False)
    elif i == 5:
        add_obj('dungeon/chestClosed_N.png', x, y, solid=False)
    elif i < 9:
        add_obj('dungeon/woodenCrate_N.png', x, y, solid=False)
    else:
        break

# 储藏室：大量箱子 + 木桶
storage = rooms[2]
sspots = free_spots(storage)
rng.shuffle(sspots)
for i, (x, y) in enumerate(sspots):
    if i < 4:
        add_obj('dungeon/barrels_N.png', x, y, solid=False)
    elif i < 8:
        add_obj('dungeon/woodenCrates_N.png', x, y, solid=False)
    elif i < 11:
        add_obj('dungeon/chestClosed_N.png', x, y, solid=False)
    elif i < 14:
        add_obj('dungeon/barrel_N.png', x, y, solid=False)
    else:
        break

# 书房：书桌 + 椅子 + 书架感（用石柱代替书架）
study = rooms[3]
stspots = free_spots(study)
rng.shuffle(stspots)
for i, (x, y) in enumerate(stspots):
    if i == 0:
        add_obj('dungeon/tableShort_N.png', x, y, solid=False)
    elif i == 1:
        add_obj('dungeon/chair_N.png', x, y, solid=False)
    elif i == 2:
        add_obj('dungeon/chestClosed_N.png', x, y, solid=False)
    elif i < 6:
        add_obj('dungeon/stoneColumn_N.png', x, y, solid=False)
    else:
        break

# 外部区域：加些碎石/破损地面/石阶，营造废弃感
for _ in range(12):
    x, y = rng.randint(0, W - 1), rng.randint(0, H - 1)
    if (x, y) in solid_set:
        continue
    # 只在房间外部
    inside = any(in_room(x, y, r) for r in rooms)
    if inside:
        continue
    # 避免堵门/堵走廊
    if (x, y) in door_set:
        continue
    GND[y][x] = rng.choice(['R', 'M'])

# ------------------------------------------------------------------
# 传送门：放在大厅中央偏南，返回青玄山门
# ------------------------------------------------------------------
portals = [{
    'x': 7, 'y': 22,
    'to': 'qingxuan',
    'tx': 17, 'ty': 27,
    'label': '返回青玄山门'
}]

# 玩家初始位置：大厅入口
start_x, start_y = 7, 23

# 转换为字符串行
ground_str = [''.join(row) for row in GND]

# 构建地图对象
new_map = {
    'id': 'dungeon',
    'name': '幽冥地宫',
    'note': 'Kenney 等距地牢素材重制：围合房间、走廊、拱门与室内家具',
    'w': W,
    'h': H,
    'ground': ground_str,
    'objects': OBJS,
    'portals': portals,
    'npcs': []
}

data['maps'].append(new_map)

# 写回（保留缩进，减少 diff 噪音）
json.dump(data, open(MAPS_PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('dungeon map regenerated: %dx%d, %d objects, %d portals, start=(%d,%d)' % (W, H, len(OBJS), len(portals), start_x, start_y))
