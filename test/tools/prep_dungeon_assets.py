import os
from PIL import Image

SRC = r'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/地形包/等距微缩地牢/Isometric'
OUT = r'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/test/assets/dungeon'
TARGET_W = 120

# 基础名 -> 需要保留的朝向后缀。所有 Kenney 等距素材都有 N/E/S/W 四向。
BASES = {
    # 地面
    'stoneTile': ['N', 'E', 'S', 'W'],
    'dirtTiles': ['N', 'E', 'S', 'W'],
    'planks': ['N', 'E', 'S', 'W'],
    'planksBroken': ['N', 'E', 'S', 'W'],
    'planksHole': ['N', 'E', 'S', 'W'],
    'stoneMissingTiles': ['N', 'E', 'S', 'W'],
    'stoneSteps': ['N', 'E', 'S', 'W'],
    # 墙主体
    'stoneWall': ['N', 'E', 'S', 'W'],
    'stoneWallAged': ['N', 'E', 'S', 'W'],
    'stoneWallCorner': ['N', 'E', 'S', 'W'],
    'stoneWallColumnIn': ['N', 'E', 'S', 'W'],
    'stoneWallHalf': ['N', 'E', 'S', 'W'],
    # 门/窗/拱门
    'stoneWallArchway': ['N', 'E', 'S', 'W'],
    'stoneWallDoorClosed': ['N', 'E', 'S', 'W'],
    'stoneWallDoorOpen': ['N', 'E', 'S', 'W'],
    'stoneWallDoorBars': ['N', 'E', 'S', 'W'],
    'stoneWallWindow': ['N', 'E', 'S', 'W'],
    'stoneWallWindowBars': ['N', 'E', 'S', 'W'],
    'stoneWallHole': ['N', 'E', 'S', 'W'],
    'stoneWallBroken': ['N', 'E', 'S', 'W'],
    'stoneWallBrokenLeft': ['N', 'E', 'S', 'W'],
    'stoneWallBrokenRight': ['N', 'E', 'S', 'W'],
    'stoneWallGateClosed': ['N', 'E', 'S', 'W'],
    'stoneWallGateOpen': ['N', 'E', 'S', 'W'],
    # 柱/支撑
    'stoneColumn': ['N', 'E', 'S', 'W'],
    'stoneColumnWood': ['N', 'E', 'S', 'W'],
    'stoneWallColumn': ['N', 'E', 'S', 'W'],
    'woodenSupports': ['N', 'E', 'S', 'W'],
    'woodenSupportBeams': ['N', 'E', 'S', 'W'],
    'woodenSupportsBeam': ['N', 'E', 'S', 'W'],
    'woodenSupportsBlock': ['N', 'E', 'S', 'W'],
    # 家具
    'barrel': ['N', 'E', 'S', 'W'],
    'barrels': ['N', 'E', 'S', 'W'],
    'barrelsStacked': ['N', 'E', 'S', 'W'],
    'chair': ['N', 'E', 'S', 'W'],
    'chestClosed': ['N', 'E', 'S', 'W'],
    'chestOpen': ['N', 'E', 'S', 'W'],
    'tableRound': ['N', 'E', 'S', 'W'],
    'tableRoundChairs': ['N', 'E', 'S', 'W'],
    'tableRoundItemsChairs': ['N', 'E', 'S', 'W'],
    'tableShort': ['N', 'E', 'S', 'W'],
    'tableShortChairs': ['N', 'E', 'S', 'W'],
    'tableChairsBroken': ['N', 'E', 'S', 'W'],
    'woodenCrate': ['N', 'E', 'S', 'W'],
    'woodenCrates': ['N', 'E', 'S', 'W'],
    'woodenPile': ['N', 'E', 'S', 'W'],
    # 楼梯/桥/地面杂物
    'stairs': ['N', 'E', 'S', 'W'],
    'stairsAged': ['N', 'E', 'S', 'W'],
    'stairsCorner': ['N', 'E', 'S', 'W'],
    'stairsSpiral': ['N', 'E', 'S', 'W'],
    'bridge': ['N', 'E', 'S', 'W'],
    'bridgeBroken': ['N', 'E', 'S', 'W'],
    'stone': ['N', 'E', 'S', 'W'],
    'stoneStep': ['N', 'E', 'S', 'W'],
    'stoneSide': ['N', 'E', 'S', 'W'],
    'stoneSideUneven': ['N', 'E', 'S', 'W'],
    'stoneUneven': ['N', 'E', 'S', 'W'],
}

os.makedirs(OUT, exist_ok=True)

# 清理旧输出，避免残留已弃用的单朝向文件
for f in os.listdir(OUT):
    os.remove(os.path.join(OUT, f))

summary = []
for base, dirs in BASES.items():
    for d in dirs:
        fname = f'{base}_{d}.png'
        src = os.path.join(SRC, fname)
        if not os.path.exists(src):
            print('MISSING', fname)
            continue
        im = Image.open(src).convert('RGBA')
        w, h = im.size
        ratio = TARGET_W / w
        new_h = int(round(h * ratio))
        im2 = im.resize((TARGET_W, new_h), Image.Resampling.LANCZOS)
        out_path = os.path.join(OUT, fname)
        im2.save(out_path, 'PNG')
        summary.append((fname, w, h, TARGET_W, new_h, os.path.getsize(out_path)))

print('saved', len(summary), 'files to', OUT)
for row in summary:
    print('%s  %dx%d -> %dx%d  (%d bytes)' % row)
