# -*- coding: utf-8 -*-
"""AI 生成图后处理：
1) 洪水填充抠底（从四边出发，容差内视为背景 → 透明）
2) 裁剪到 alpha 包围盒
3) 拼 buildings.png：横排 4 帧（接引台/聚宝阁/丹房/器坊），每帧 256×224
4) 拼装饰追加帧：布棚货摊 / 茶摊 → 追加到 decorations.png 第 12/13 帧（96×96）
5) 夜景地面：ground.png 整体压暗偏蓝
"""
import os
from collections import deque
from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = os.path.join(ROOT, '_gen')
AST = os.path.join(ROOT, 'assets', 'tiles')

def cutout(img, tol=38):
    """从四边洪水填充抠掉近似底色。img RGBA。"""
    w, h = img.size
    px = img.load()
    # 背景色取四角平均
    corners = [px[0, 0], px[w-1, 0], px[0, h-1], px[w-1, h-1]]
    br = sum(c[0] for c in corners) // 4
    bg = sum(c[1] for c in corners) // 4
    bb = sum(c[2] for c in corners) // 4
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            q.append((x, y))
    def near(c):
        return abs(c[0] - br) < tol and abs(c[1] - bg) < tol and abs(c[2] - bb) < tol
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        c = px[x, y]
        if not near(c):
            seen[i] = 1
            continue
        seen[i] = 1
        px[x, y] = (c[0], c[1], c[2], 0)
        q.extend(((x+1, y), (x-1, y), (x, y+1), (x, y-1)))
    return img

def crop_alpha(img, pad=6):
    bbox = img.getbbox()
    if not bbox:
        return img
    l, t, r, b = bbox
    l = max(0, l - pad); t = max(0, t - pad)
    r = min(img.width, r + pad); b = min(img.height, b + pad)
    return img.crop((l, t, r, b))

def fit(img, fw, fh):
    s = min((fw - 8) / img.width, (fh - 8) / img.height)
    return img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)

# ---- 1) 抠底 ----
gens = sorted([f for f in os.listdir(GEN) if f.endswith('.png') and not f.startswith('_')])
print('gen files:', len(gens))
imgs = []
for i, f in enumerate(gens):
    im = Image.open(os.path.join(GEN, f)).convert('RGBA')
    im = cutout(im)
    im = crop_alpha(im)
    imgs.append(im)
    im.save(os.path.join(GEN, '_cut_%d.png' % i))
    print(i, f[:44], '->', im.size)

# ---- 2) buildings.png：帧序 [0]接引台 [1]聚宝阁 [2]丹房 [新]器坊 ----
bld_idx = [0, 1, 2, len(imgs) - 1]          # 最后一张是重出的白底器坊
FW, FH = 256, 224
strip = Image.new('RGBA', (FW * 4, FH), (0, 0, 0, 0))
for k, idx in enumerate(bld_idx):
    im = fit(imgs[idx], FW, FH)
    x = k * FW + (FW - im.width) // 2
    y = FH - im.height - 4
    strip.paste(im, (x, y), im)
strip.save(os.path.join(AST, 'buildings.png'))
print('buildings.png', strip.size)

# ---- 3) decorations.png 追加 2 帧（货摊/茶摊）----
dec_path = os.path.join(AST, 'decorations.png')
old = Image.open(dec_path).convert('RGBA')
NF = old.width // 96 + 2                     # 12 -> 14
new = Image.new('RGBA', (96 * NF, 96), (0, 0, 0, 0))
new.paste(old, (0, 0))
for k, idx in enumerate([4, 5]):             # 货摊 / 茶摊
    im = fit(imgs[idx], 92, 92)
    x = (12 + k) * 96 + (96 - im.width) // 2
    y = 96 - im.height - 2
    new.paste(im, (x, y), im)
new.save(dec_path)
print('decorations.png', new.size)

# ---- 4) 夜景地面：压暗偏蓝 ----
g = Image.open(os.path.join(AST, 'ground.png')).convert('RGBA')
r, gg, b, a = g.split()
r = r.point(lambda v: int(v * 0.42))
gg = gg.point(lambda v: int(v * 0.50))
b = b.point(lambda v: min(255, int(v * 0.78)))
Image.merge('RGBA', (r, gg, b, a)).save(os.path.join(AST, 'ground.png'))
print('ground tinted night')
