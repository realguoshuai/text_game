import os
from PIL import Image

SRC = r'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/地形包/等距微缩地牢/Isometric'
OUT = r'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/test/assets/dungeon'
TARGET_W = 120

FILES = [
    # 地面
    'stoneTile_N.png',
    'dirtTiles_N.png',
    'planks_N.png',
    # 墙
    'stoneWall_N.png',
    'stoneWallAged_N.png',
    'stoneWallCorner_N.png',
    'stoneWallDoorClosed_N.png',
    'stoneWallArchway_N.png',
    # 道具
    'barrel_N.png',
    'barrels_N.png',
    'chestClosed_N.png',
    'stoneColumn_N.png',
    'tableRound_N.png',
    'chair_N.png',
    'bridge_N.png',
]

os.makedirs(OUT, exist_ok=True)
summary = []
for f in FILES:
    src = os.path.join(SRC, f)
    if not os.path.exists(src):
        print('MISSING', f)
        continue
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    ratio = TARGET_W / w
    new_h = int(round(h * ratio))
    im2 = im.resize((TARGET_W, new_h), Image.Resampling.LANCZOS)
    out_path = os.path.join(OUT, f)
    im2.save(out_path, 'PNG')
    summary.append((f, w, h, TARGET_W, new_h, os.path.getsize(out_path)))

print('saved', len(summary), 'files to', OUT)
for row in summary:
    print('%s  %dx%d -> %dx%d  (%d bytes)' % row)
