# -*- coding: utf-8 -*-
"""
把 CraftPix 免费素材包（128x128 横版侧视）转成「仙岛寻踪」主角图集可用的 6x5@64 动作表。

关键换算
  - 素材单格 128x128，角色实高 70~84px；现有主角单格 64x64，实高 35px —— 大致 2 倍。
  - 因此对内容做 50% 降采样即可与现有角色同量级（实高 35~42px / 像素块 2px）。
  - 对齐规则沿用现有素材：内容底边贴 cell 底边（脚底），水平居中于 x=32。

朝向
  - 这些包只有左右两个侧视朝向。映射：down/right/up 用原图，left 用水平翻转。
  - 即上下移动时角色仍呈侧身，这是只有两侧素材时的必然妥协。

幂等性
  - 全程基于 test/assets/chars_base.{png,json}（原始 1152x640 六角色版本，随仓库一起入库）重建，
    所以重复运行不会叠加、不会把上一轮的新角色烤进图里。
  - 输出覆盖写 test/assets/chars_atlas.png（3 列 x 4 行 = 1152x1280）与 chars_atlas.json。

素材授权：CraftPix Freebie，可商用/可修改/可随游戏分发，禁止再分发源文件本身。
因此本脚本只把素材烘进游戏图集，原始 PNG 始终留在 gitignore 的 sucai/ 里。
"""
import os, json
from PIL import Image

BASE = r'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame'
SUCAI = os.path.join(BASE, 'sucai')
ASSETS = os.path.join(BASE, 'test/assets')
OUT_PNG = os.path.join(ASSETS, 'chars_atlas.png')
OUT_JSON = os.path.join(ASSETS, 'chars_atlas.json')
BK_PNG = os.path.join(ASSETS, 'chars_base.png')
BK_JSON = os.path.join(ASSETS, 'chars_base.json')

CELL_SRC = 128
CELL_DST = 64
COLS = 6
SHEET_W = COLS * CELL_DST      # 384
SHEET_H = 5 * CELL_DST         # 320
ROW_W = 3                      # 图集每行放 3 张动作表

# 编号 -> (素材包目录, 角色目录, 输出 key, 动作表来源)
NEW_HEROES = [
    # CraftPix 免费吸血鬼包 #506778
    ('craftpix-net-506778-free-vampire-pixel-art-sprite-sheets', 'Converted_Vampire', 'vamp_31.png'),
    ('craftpix-net-506778-free-vampire-pixel-art-sprite-sheets', 'Countess_Vampire',  'vamp_32.png'),
    ('craftpix-net-506778-free-vampire-pixel-art-sprite-sheets', 'Vampire_Girl',      'vamp_33.png'),
    # CraftPix 免费忍者包 #453698
    ('craftpix-net-453698-free-shinobi-sprites-pixel-art', 'Fighter', 'ninja_41.png'),
    ('craftpix-net-453698-free-shinobi-sprites-pixel-art', 'Samurai', 'ninja_42.png'),
    ('craftpix-net-453698-free-shinobi-sprites-pixel-art', 'Shinobi', 'ninja_43.png'),
]


def even_indices(n, want=COLS):
    """把 n 帧均匀取成 want 帧；n 不足时循环补足。"""
    if n <= 0:
        return [0] * want
    return [round(i * (n - 1) / (want - 1)) for i in range(want)]


def frames_of(path, want=COLS):
    im = Image.open(path).convert('RGBA')
    n = max(1, im.width // CELL_SRC)
    out = []
    for i in even_indices(n, want):
        idx = max(0, min(i, n - 1))
        cell = im.crop((idx * CELL_SRC, 0, (idx + 1) * CELL_SRC, CELL_SRC))
        bb = cell.getchannel('A').getbbox()
        if bb is None:
            out.append(None)
            continue
        body = cell.crop(bb)
        out.append(body.resize((max(1, round(body.width / 2)),
                                max(1, round(body.height / 2))), Image.NEAREST))
    return out, n


def build_sheet(folder_path):
    """生成一张 384x320 的 6列x5行 动作表。"""
    walk, nw = frames_of(os.path.join(folder_path, 'Walk.png'))
    atk, na = frames_of(os.path.join(folder_path, 'Attack_1.png'))

    sheet = Image.new('RGBA', (SHEET_W, SHEET_H), (0, 0, 0, 0))
    rows = [
        (0, walk, False),   # down
        (1, walk, False),   # right
        (2, walk, True),    # left（水平翻转）
        (3, walk, False),   # up
        (4, atk,  False),   # 第 5 行：攻击帧，当前引擎未使用，留给后续技能系统
    ]
    for row, frs, flip in rows:
        for col in range(COLS):
            cell = Image.new('RGBA', (CELL_DST, CELL_DST), (0, 0, 0, 0))
            spr = frs[col]
            if spr is not None:
                if flip:
                    spr = spr.transpose(Image.FLIP_LEFT_RIGHT)
                x = round(CELL_DST / 2 - spr.width / 2)
                y = max(0, CELL_DST - spr.height)
                cell.alpha_composite(spr, (x, y))
            sheet.alpha_composite(cell, (col * CELL_DST, row * CELL_DST))
    return sheet, nw, na


def main():
    if not (os.path.exists(BK_PNG) and os.path.exists(BK_JSON)):
        raise SystemExit('缺少原始备份 _backup_chars_atlas.png/.json，无法幂等重建')

    base = Image.open(BK_PNG).convert('RGBA')
    rect = json.load(open(BK_JSON, encoding='utf-8'))
    print('原始图集 %s，已跟踪角色 %d 个' % (base.size, len(rect)))

    rows = (len(NEW_HEROES) + ROW_W - 1) // ROW_W
    out = Image.new('RGBA', (base.width, base.height + rows * SHEET_H), (0, 0, 0, 0))
    out.alpha_composite(base, (0, 0))

    for i, (pack, folder, key) in enumerate(NEW_HEROES):
        r, c = divmod(i, ROW_W)
        x, y = c * SHEET_W, base.height + r * SHEET_H
        sheet, nw, na = build_sheet(os.path.join(SUCAI, pack, folder))
        out.alpha_composite(sheet, (x, y))
        rect[key] = [x, y, SHEET_W, SHEET_H]
        print('  + %-14s walk=%d帧 attack=%d帧 -> (%d,%d)' % (key, nw, na, x, y))

    out.save(OUT_PNG, optimize=True)
    json.dump(rect, open(OUT_JSON, 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))

    size = os.path.getsize(OUT_PNG)
    print('新图集 %s  %.1fKB  keys=%d' % (out.size, size / 1024, len(rect)))
    print('LOAD_PLAN weight 应填: chars=%d' % round(size / 1024))


if __name__ == '__main__':
    main()
