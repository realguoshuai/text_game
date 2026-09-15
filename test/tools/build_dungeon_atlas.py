"""把 assets/dungeon/*.png 打包成单张图集，把 228 次零散请求压成 2 次（图集 + 索引）。
键名保留 'dungeon/文件名'，与 game.js 里 piece() 的查询名一致；
rect = [x, y, w, h]，w/h 用素材原尺寸，drawImage 用整幅子矩形，锚点（底边居中）与原独立 PNG 完全一致。
"""
import os, json
from PIL import Image

ROOT = r'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/test'
SRC = os.path.join(ROOT, 'assets/dungeon')
OUT_IMG = os.path.join(ROOT, 'assets/dungeon_atlas.webp')
OUT_JSON = os.path.join(ROOT, 'assets/dungeon_atlas.json')

files = sorted(f for f in os.listdir(SRC) if f.lower().endswith('.png'))
imgs = []
for f in files:
    im = Image.open(os.path.join(SRC, f)).convert('RGBA')
    imgs.append((f, im))

pad = 2
cols = 16
cell_w = max(im.width for _, im in imgs)
cell_h = max(im.height for _, im in imgs)
rows = (len(imgs) + cols - 1) // cols
atlas_w = cols * cell_w + (cols + 1) * pad
atlas_h = rows * cell_h + (rows + 1) * pad

atlas = Image.new('RGBA', (atlas_w, atlas_h), (0, 0, 0, 0))
rect = {}
for idx, (f, im) in enumerate(imgs):
    c = idx % cols
    r = idx // cols
    x = pad + c * (cell_w + pad)
    y = pad + r * (cell_h + pad)
    atlas.paste(im, (x, y))
    rect['dungeon/' + f] = [x, y, im.width, im.height]

# WebP 优先（体积小），不支持就退回 PNG（仍只有 1 次请求）
try:
    atlas.save(OUT_IMG)
    ext = 'webp'
except Exception as e:
    print('webp 保存失败，退回 png:', e)
    OUT_IMG = os.path.join(ROOT, 'assets/dungeon_atlas.png')
    atlas.save(OUT_IMG)
    ext = 'png'

json.dump(rect, open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False)
print('打包完成: %d 张 -> %s (%dx%d), 索引 %s, 单图集替代 %d 次请求'
      % (len(imgs), os.path.basename(OUT_IMG), atlas_w, atlas_h,
         os.path.basename(OUT_JSON), len(imgs)))
