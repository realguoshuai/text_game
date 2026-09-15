import json, os, copy

ROOT = r'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/test'
MAPS_PATH = os.path.join(ROOT, 'assets', 'maps.json')

def make_map():
    W, H = 18, 18
    # 地面：外圈 ~ = 虚空（不可走），内圈 D = 石砖地
    ground = []
    for y in range(H):
        row = ''
        for x in range(W):
            if x == 0 or x == W - 1 or y == 0 or y == H - 1:
                row += '~'
            elif 4 <= x <= 13 and 9 <= y <= 13:
                row += 'P'  # 一片木板平台/祭坛区
            else:
                row += 'D'
        ground.append(row)

    objects = []

    def add(piece, x, y, solid=True):
        objects.append({'piece': 'dungeon/' + piece, 'x': x, 'y': y, 'fw': 1, 'fh': 1, 'solid': solid})

    # 外墙（内圈边缘）
    for x in range(1, W - 1):
        add('stoneWall_N.png', x, 1, True)
        add('stoneWall_N.png', x, H - 2, True)
    for y in range(2, H - 2):
        add('stoneWall_N.png', 1, y, True)
        add('stoneWall_N.png', W - 2, y, True)

    # 四个角用 corner
    add('stoneWallCorner_N.png', 1, 1, True)
    add('stoneWallCorner_N.png', W - 2, 1, True)
    add('stoneWallCorner_N.png', 1, H - 2, True)
    add('stoneWallCorner_N.png', W - 2, H - 2, True)

    # 门/拱门（底边中央开个口，并在口两侧换 arch）
    door_x = W // 2
    # 移除刚才在 door_x 位置放的墙（用 arch 替代）
    objects = [o for o in objects if not (o['piece'] == 'dungeon/stoneWall_N.png' and o['x'] == door_x and o['y'] == H - 2)]
    add('stoneWallArchway_N.png', door_x, H - 2, False)  # 拱门不挡路，当作出入口视觉

    # 内部柱子
    for x, y in [(4, 4), (13, 4), (4, 7), (13, 7)]:
        add('stoneColumn_N.png', x, y, True)

    # 内部杂物（不挡路）
    add('barrels_N.png', 6, 5, False)
    add('barrel_N.png', 7, 5, False)
    add('chestClosed_N.png', 11, 5, False)
    add('tableRound_N.png', 9, 11, False)
    add('chair_N.png', 8, 11, False)
    add('chair_N.png', 10, 11, False)
    add('bridge_N.png', door_x, 14, False)

    return {
        'id': 'dungeon',
        'name': '幽冥地宫',
        'note': 'Kenney 等距地牢素材测试图：石砖地面、石墙、拱门、木台与杂物',
        'w': W,
        'h': H,
        'ground': ground,
        'objects': objects,
        'portals': [
            {
                'x': door_x,
                'y': H - 3,
                'to': 'qingxuan',
                'spawnX': 17,
                'spawnY': 27,
                'label': '返回青玄山门'
            }
        ],
        'spawn': {'x': door_x, 'y': H - 4}
    }

def main():
    with open(MAPS_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # 新增 tilePalette 字符（不覆盖原有字符）
    data['tilePalette']['D'] = 'dungeon/stoneTile_N.png'
    data['tilePalette']['P'] = 'dungeon/planks_N.png'
    # walkable 追加 D 和 P
    if 'D' not in data['walkable']:
        data['walkable'] += 'D'
    if 'P' not in data['walkable']:
        data['walkable'] += 'P'

    # 去重：如果已存在 dungeon 地图则替换，否则追加
    maps = data['maps']
    existing = [i for i, m in enumerate(maps) if m['id'] == 'dungeon']
    if existing:
        maps[existing[0]] = make_map()
    else:
        maps.append(make_map())

    with open(MAPS_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print('maps.json updated: added dungeon map, tilePalette D/P')

if __name__ == '__main__':
    main()
