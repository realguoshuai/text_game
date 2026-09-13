# -*- coding: utf-8 -*-
"""生成 assets/tiles/ground.png：12 帧 64x64 全出血地块纹理。
帧 0-7 = 青草地（绿底 + 草叶/斑点/小花），帧 8-11 = 青石板（灰蓝 Cobbles + 苔痕落叶）。
用法：python tools/gen_ground_grass.py
"""
import os, random
from PIL import Image, ImageDraw

W = H = 64
N = 12
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "tiles", "ground.png")

def lerp(a, b, t):
    return tuple(int(a[i] * (1 - t) + b[i] * t) for i in range(3))

def grass_frame(rng):
    im = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(im)
    base = (rng.randint(88, 102), rng.randint(124, 140), rng.randint(52, 64))
    top, bot = lerp(base, (255, 255, 255), 0.10), lerp(base, (0, 0, 0), 0.22)
    for y in range(H):
        d.line([(0, y), (W, y)], fill=lerp(top, bot, y / (H - 1)) + (255,))
    # 草叶与斑点
    for _ in range(300):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        s = rng.uniform(0.7, 1.3)
        col = tuple(min(255, int(base[i] * s)) for i in range(3)) + (150,)
        if rng.random() < 0.4:
            d.line([(x, y), (x + rng.uniform(-1.2, 1.2), y - rng.uniform(2, 5))], fill=col, width=1)
        else:
            r = rng.uniform(0.5, 1.5)
            d.ellipse([x - r, y - r, x + r, y + r], fill=col)
    # 深色土斑（轻，避免脏感）
    for _ in range(rng.randint(2, 4)):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(1.5, 3)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(70, 90, 42, 55))
    # 小花
    for _ in range(rng.randint(0, 3)):
        x, y = rng.uniform(2, W - 2), rng.uniform(2, H - 2)
        col = rng.choice([(242, 242, 168), (232, 186, 224), (248, 248, 248), (250, 210, 130)])
        d.ellipse([x - 1, y - 1, x + 1, y + 1], fill=col + (235,))
    return im

def stone_frame(rng):
    im = Image.new("RGBA", (W, H))
    d = ImageDraw.Draw(im)
    base = (rng.randint(74, 84), rng.randint(84, 94), rng.randint(98, 110))
    d.rectangle([0, 0, W, H], fill=lerp(base, (0, 0, 0), 0.45) + (255,))   # 石缝底色
    row_h, stone_w = 10, 16
    for ry, y0 in enumerate(range(-row_h, H + row_h, row_h)):
        off = (ry % 2) * (stone_w // 2) + rng.randint(-2, 2)
        for x0 in range(-stone_w, W + stone_w, stone_w):
            sx, sy = x0 + off + rng.randint(-1, 1), y0 + rng.randint(-1, 1)
            sw, sh = stone_w - 3 + rng.randint(-2, 2), row_h - 3 + rng.randint(-1, 1)
            s = rng.uniform(0.85, 1.25)
            col = tuple(min(255, int(base[i] * s)) for i in range(3)) + (255,)
            d.rounded_rectangle([sx, sy, sx + sw, sy + sh], radius=3, fill=col,
                                outline=lerp(base, (0, 0, 0), 0.55) + (255,))
            # 石面高光/暗部
            hl = tuple(min(255, int(base[i] * 1.25)) for i in range(3)) + (70,)
            d.line([(sx + 2, sy + 2), (sx + sw - 2, sy + 2)], fill=hl)
    # 苔痕与落叶
    for _ in range(rng.randint(8, 14)):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        r = rng.uniform(1.5, 3.5)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(74, 96, 52, rng.randint(60, 120)))
    for _ in range(rng.randint(2, 5)):
        x, y = rng.uniform(0, W), rng.uniform(0, H)
        col = rng.choice([(196, 120, 60), (176, 96, 48)])
        d.ellipse([x - 2, y - 1, x + 2, y + 1], fill=col + (200,))
    return im

def main():
    strip = Image.new("RGBA", (W * N, H))
    rng = random.Random(20260913)
    for i in range(N):
        f = grass_frame(rng) if i < 8 else stone_frame(rng)
        strip.paste(f, (i * W, 0))
    strip.save(OUT)
    print("saved:", os.path.abspath(OUT), strip.size)

if __name__ == "__main__":
    main()
