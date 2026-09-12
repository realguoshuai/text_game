# -*- coding: utf-8 -*-
"""v4：替换全部程序化素材为 AI 素材
1) ground.png  —— 石板路面纹理裁两块 2:1 区域 + 菱形蒙版（64×32×2 帧，帧0加暖土色区分）
2) characters  —— player / npc_merchant / npc_villager（白底抠图，高 128px）
3) ui/panel.png —— 水墨 UI 底板（抠底裁边）
4) ui/icons.png —— 4 格技能图标条（256×64）
5) ui/avatar.png —— 圆形头像（128×128）
6) decorations.png 追加帧 18：灵晶簇（FreePixel 晶石矿物）
"""
import os
from collections import deque
from PIL import Image, ImageDraw, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = os.path.join(ROOT, '_gen')
AST = os.path.join(ROOT, 'assets')
FP = r'C:\Users\Lenovo\WorkBuddy\text_game\AssetLibrary\FreePixel'

TS = {
    'ground':  'seamless_top_down_texture_of_d_2026-09-12T23-52-56',
    'player':  '2D_game_character_sprite__chib_2026-09-12T23-53-16',
    'merchant':'2D_game_character_sprite__chib_2026-09-12T23-53-38',
    'villager':'2D_game_character_sprite__chib_2026-09-12T23-53-56',
    'panel':   'horizontal_game_UI_panel__wide_2026-09-12T23-54-17',
    'icons':   'game_skill_icon_sheet__four_sq_2026-09-12T23-54-38',
    'avatar':  'circular_game_avatar_portrait__2026-09-12T23-54-59',
}

def fname(key):
    for f in os.listdir(GEN):
        if TS[key] in f and not f.startswith('_'):
            return f
    raise FileNotFoundError(key)

def open_gen(key):
    return Image.open(os.path.join(GEN, fname(key))).convert('RGBA')

def erase_bottom(img, band=52):
    px = img.load()
    w, h = img.size
    for y in range(h - band, h):
        for x in range(w):
            px[x, y] = (0, 0, 0, 0)
    return img

def cutout(img, tol=40):
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

def crop_alpha(img, pad=4):
    l, t, r, b = img.getbbox()
    return img.crop((max(0, l-pad), max(0, t-pad), min(img.width, r+pad), min(img.height, b+pad)))

# ---- 1) 地面：纹理 + 菱形蒙版，两帧 ----
tex = open_gen('ground').convert('RGB')
FW, FH = 64, 32
sheet = Image.new('RGBA', (FW * 2, FH), (0, 0, 0, 0))
mask = Image.new('L', (FW * 4, FH * 4), 0)
dm = ImageDraw.Draw(mask)
dm.polygon([(FW*2, 0), (FW*4, FH*2), (FW*2, FH*4), (0, FH*2)], fill=255)
mask = mask.resize((FW, FH), Image.LANCZOS)
for k in range(2):
    ox, oy = (0 if k == 0 else 512), (64 if k == 0 else 384)
    region = tex.crop((ox, oy, ox + 512, oy + 256)).resize((FW, FH), Image.LANCZOS)
    if k == 0:  # 帧0：土地——压暗偏暖
        region = ImageEnhance.Brightness(region).enhance(0.82)
        r, g, b = region.split()
        r = r.point(lambda v: min(255, int(v * 1.12)))
        b = b.point(lambda v: int(v * 0.92))
        region = Image.merge('RGB', (r, g, b))
    region = region.convert('RGBA')
    region.putalpha(mask)
    sheet.paste(region, (k * FW, 0))
sheet.save(os.path.join(AST, 'tiles', 'ground.png'))
print('ground.png', sheet.size)

# ---- 2) 角色 ----
for key, out in [('player', 'player.png'), ('merchant', 'npc_merchant.png'), ('villager', 'npc_villager.png')]:
    im = erase_bottom(open_gen(key))
    im = crop_alpha(cutout(im), 2)
    s = 128 / im.height
    im = im.resize((int(im.width * s), 128), Image.LANCZOS)
    im.save(os.path.join(AST, 'characters', out))
    print(out, im.size)

# ---- 3) UI 底板 ----
p = erase_bottom(open_gen('panel'))
p = crop_alpha(cutout(p), 2)
p = ImageEnhance.Brightness(p).enhance(0.9)
p.save(os.path.join(AST, 'ui', 'panel.png'))
print('panel.png', p.size)

# ---- 4) 技能图标条：裁 bbox → 拉成 256×64 ----
ic = erase_bottom(open_gen('icons'))
ic = crop_alpha(cutout(ic), 2)
ic.resize((256, 64), Image.LANCZOS).save(os.path.join(AST, 'ui', 'icons.png'))
print('icons.png (256,64)')

# ---- 5) 头像：中心方裁 → 128 ----
av = erase_bottom(open_gen('avatar'))
av = crop_alpha(cutout(av), 0)
w, h = av.size
side = min(w, h)
av = av.crop(((w - side)//2, (h - side)//2, (w - side)//2 + side, (h - side)//2 + side))
av.resize((128, 128), Image.LANCZOS).save(os.path.join(AST, 'ui', 'avatar.png'))
print('avatar.png (128,128)')

# ---- 6) decorations 追加帧 18：灵晶簇（FreePixel） ----
dec = Image.open(os.path.join(AST, 'tiles', 'decorations.png')).convert('RGBA')
NF = dec.width // 96 + 1                          # 18 -> 19
new = Image.new('RGBA', (96 * NF, 96), (0, 0, 0, 0))
new.paste(dec, (0, 0))
cr = Image.open(os.path.join(FP, '地图-晶石矿物', 'crystal-cluster-blue.png')).convert('RGBA')
cr.thumbnail((90, 90), Image.LANCZOS)
new.paste(cr, (18 * 96 + (96 - cr.width) // 2, 96 - cr.height - 2), cr)
new.save(os.path.join(AST, 'tiles', 'decorations.png'))
print('decorations.png', new.size)
