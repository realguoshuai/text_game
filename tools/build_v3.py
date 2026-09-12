# -*- coding: utf-8 -*-
"""v3：夜市补齐——buildings 扩到 6 帧（+联排商铺原/镜像），decorations 扩到 18 帧
（+灯笼串/幌子/货箱堆/荷塘小桥）。全部 AI 图统一抠底+擦水印。
已知原图（按时间戳）：
  接引台 23-31-39(黑底,水印)  聚宝阁 23-32-06(棕底,水印)  丹房 23-32-32(白底)
  器坊   23-35-06(白底)       货摊   23-33-25(透明)       茶摊 23-33-49(透明)
  联排   23-46-51(白底)       灯笼串 23-47-12(白底)       幌子 23-47-31(白底)
  货箱   23-47-53(白底)       荷塘   23-48-12(白底)
"""
import os
from collections import deque
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = os.path.join(ROOT, '_gen')
AST = os.path.join(ROOT, 'assets', 'tiles')

TS = {
    'jieyintai': '2026-09-12T23-31-39', 'jubaoge': '2026-09-12T23-32-06',
    'danfang': '2026-09-12T23-32-32', 'qifang': '2026-09-12T23-35-06',
    'stall': '2026-09-12T23-33-25', 'tea': '2026-09-12T23-33-49',
    'rowshop': '2026-09-12T23-46-51', 'string': '2026-09-12T23-47-12',
    'banner': '2026-09-12T23-47-31', 'crates': '2026-09-12T23-47-53',
    'pond': '2026-09-12T23-48-12',
}
WM_ERASE = {'jieyintai', 'jubaoge'}       # 已知带水印（右下）

def fname(key):
    pre = '2D_game_sprite__isometric_45_d_'
    for f in os.listdir(GEN):
        if f.startswith(pre) and TS[key] in f and not f.startswith('_'):
            return f
    raise FileNotFoundError(key)

def erase_watermark(img):
    w, h = img.size
    px = img.load()
    for y in range(h - 52, h):                       # 底部通栏（水印多在底部）
        for x in range(w):
            px[x, y] = (0, 0, 0, 0)
    for y in range(int(h * 0.86), h):                # 右下角
        for x in range(int(w * 0.52), w):
            px[x, y] = (0, 0, 0, 0)
    return img

def cutout(img, tol=38):
    w, h = img.size
    px = img.load()
    corners = [px[0, 0], px[w-1, 0], px[0, h-1], px[w-1, h-1]]
    br = sum(c[0] for c in corners) // 4
    bg = sum(c[1] for c in corners) // 4
    bb = sum(c[2] for c in corners) // 4
    seen = bytearray(w * h)
    q = deque()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h:
            continue
        i = y * w + x
        if seen[i]:
            continue
        c = px[x, y]
        seen[i] = 1
        if not (abs(c[0]-br) < tol and abs(c[1]-bg) < tol and abs(c[2]-bb) < tol):
            continue
        px[x, y] = (c[0], c[1], c[2], 0)
        q.extend(((x+1, y), (x-1, y), (x, y+1), (x, y-1)))
    return img

def crop_alpha(img, pad=6):
    l, t, r, b = img.getbbox()
    return img.crop((max(0, l-pad), max(0, t-pad), min(img.width, r+pad), min(img.height, b+pad)))

def fit(img, fw, fh):
    s = min((fw - 6) / img.width, (fh - 6) / img.height)
    return img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)

def load_key(key, wm=False):
    im = Image.open(os.path.join(GEN, fname(key))).convert('RGBA')
    if wm or key in WM_ERASE:
        im = erase_watermark(im)
    return crop_alpha(cutout(im))

# ---- buildings.png：6 帧 ----
FW, FH = 256, 224
strip = Image.new('RGBA', (FW * 6, FH), (0, 0, 0, 0))
frames = ['jieyintai', 'jubaoge', 'danfang', 'qifang', 'rowshop', 'rowshop']
for k, key in enumerate(frames):
    im = load_key(key)
    if key == 'rowshop' and k == 5:
        im = im.transpose(Image.FLIP_LEFT_RIGHT)     # 镜像当第 6 帧
    im = fit(im, FW, FH)
    strip.paste(im, (k * FW + (FW - im.width) // 2, FH - im.height - 4), im)
strip.save(os.path.join(AST, 'buildings.png'))
print('buildings.png', strip.size)

# ---- decorations.png：14 -> 18 帧 ----
DEC = 96
dec = Image.open(os.path.join(AST, 'decorations.png')).convert('RGBA')
NF = dec.width // DEC + 4                          # 14 -> 18
new = Image.new('RGBA', (DEC * NF, DEC), (0, 0, 0, 0))
new.paste(dec, (0, 0))
for k, key in enumerate(['string', 'banner', 'crates', 'pond']):
    im = load_key(key)
    im = fit(im, 92, 92)
    x = (14 + k) * DEC + (DEC - im.width) // 2
    new.paste(im, (x, DEC - im.height - 2), im)
new.save(os.path.join(AST, 'decorations.png'))
print('decorations.png', new.size)
