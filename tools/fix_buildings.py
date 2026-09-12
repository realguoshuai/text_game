# -*- coding: utf-8 -*-
"""重建 buildings.png：对带水印的 0/1 号（接引台/聚宝阁）先擦右下角水印区，再抠底拼帧。
decorations.png 与夜景地面已在前一步完成，本脚本不重复处理。"""
import os
from collections import deque
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = os.path.join(ROOT, '_gen')
AST = os.path.join(ROOT, 'assets', 'tiles')

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
        seen[i] = 1
        if not near(c):
            continue
        px[x, y] = (c[0], c[1], c[2], 0)
        q.extend(((x+1, y), (x-1, y), (x, y+1), (x, y-1)))
    return img

def crop_alpha(img, pad=6):
    l, t, r, b = img.getbbox()
    return img.crop((max(0, l-pad), max(0, t-pad), min(img.width, r+pad), min(img.height, b+pad)))

def fit(img, fw, fh):
    s = min((fw - 8) / img.width, (fh - 8) / img.height)
    return img.resize((max(1, int(img.width * s)), max(1, int(img.height * s))), Image.LANCZOS)

gens = sorted([f for f in os.listdir(GEN) if f.endswith('.png') and not f.startswith('_')])
bld_idx = [0, 1, 2, len(gens) - 1]
WM = {0, 1}                                   # 带水印的图：擦右下角
FW, FH = 256, 224
strip = Image.new('RGBA', (FW * 4, FH), (0, 0, 0, 0))
for k, idx in enumerate(bld_idx):
    im = Image.open(os.path.join(GEN, gens[idx])).convert('RGBA')
    if idx in WM:
        w, h = im.size
        px = im.load()
        for y in range(int(h * 0.88), h):
            for x in range(int(w * 0.52), w):
                px[x, y] = (0, 0, 0, 0)
    im = crop_alpha(cutout(im))
    im = fit(im, FW, FH)
    strip.paste(im, (k * FW + (FW - im.width) // 2, FH - im.height - 4), im)
    print('frame', k, gens[idx][:40], im.size)
strip.save(os.path.join(AST, 'buildings.png'))
print('buildings.png rebuilt', strip.size)
