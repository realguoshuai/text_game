# -*- coding: utf-8 -*-
"""给 assets/sliced/ 里每个图块做编目：尺寸/形状/主色族 → 推断用途分类。
同时输出带编号的图块接触表（contact sheet），便于人工核对/纠正。
产物：assets/sliced/catalog.json + assets/sliced/_pieces_contact.png
"""
import os, json
from collections import Counter
import numpy as np
from PIL import Image, ImageDraw

ROOT = r"C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/immortal-isles"
SL = os.path.join(ROOT, "assets", "sliced")
OUT_JSON = os.path.join(SL, "catalog.json")
OUT_SHEET = os.path.join(SL, "_pieces_contact.png")


def family(r, g, b):
    lum = (r + g + b) / 3
    chroma = max(r, g, b) - min(r, g, b)
    if lum < 58:
        return "dark"
    if chroma < 20:
        if lum > 185:
            return "lightstone"
        if lum > 118:
            return "stone"
        return "darkstone"
    if g > r + 8 and g > b + 8:
        return "green"
    if b > r + 22:
        return "blue"
    if r > g > b:
        if r > 140 and g > 105 and b < 118:
            return "gold"
        if r > 118 and g < 112 and b < 112:
            return "red"
        return "wood"
    if r > 150 and g > 150 and b < 150:
        return "pale_yellow"
    return "other"


rows = []
for fn in sorted(os.listdir(SL)):
    if not fn.lower().endswith(".png") or fn.startswith("_"):
        continue
    im = Image.open(os.path.join(SL, fn)).convert("RGBA")
    a = np.asarray(im)
    al = a[:, :, 3]
    m = al > 128
    area = int(m.sum())
    if area == 0:
        continue
    ys, xs = np.where(m)
    w, h = int(xs.max() - xs.min() + 1), int(ys.max() - ys.min() + 1)
    fill = area / float(w * h)
    px = a[:, :, :3][m]
    q = (px // 26) * 26
    top = Counter(map(tuple, q)).most_common(4)
    fams = []
    for (c, cnt) in top:
        fams.append((family(int(c[0]), int(c[1]), int(c[2])), round(cnt / len(px), 2)))
    # 合并同族
    merged = {}
    for f, p in fams:
        merged[f] = round(merged.get(f, 0) + p, 2)
    order = sorted(merged.items(), key=lambda t: -t[1])
    primary = order[0][0] if order else "other"
    sec = dict(order[:3])

    # 形状推断
    ar = w / float(h)
    shape = "square"
    if ar > 2.05:
        shape = "flat_wide"
    elif ar > 1.2:
        shape = "iso_flat"        # 等距扁菱形（地砖/草皮）
    elif ar < 0.72:
        shape = "tall"            # 塔/树/柱
    # 用途推断
    if 108 <= w <= 128 and 64 <= h <= 92 and ar > 1.2:
        use = "ground_tile"
    elif h >= 130 and ar < 0.95:
        use = "tower_tree"
    elif max(w, h) >= 95 and primary in ("blue", "red", "gold", "lightstone"):
        use = "building"
    elif primary == "green" and ar > 0.8:
        use = "foliage"
    elif max(w, h) <= 48:
        use = "deco"
    elif primary in ("lightstone", "stone", "darkstone"):
        use = "rock"
    else:
        use = "prop"
    rows.append(dict(file=fn, w=w, h=h, area=area, fill=round(fill, 2),
                     aspect=round(ar, 2), shape=shape, use=use,
                     primary=primary, families=sec,
                     top_rgb=[int(x) for x in top[0][0]]))

rows.sort(key=lambda r: (r["use"], -r["area"]))
json.dump(dict(count=len(rows), pieces=rows), open(OUT_JSON, "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

print(f"{'file':28s} {'w x h':10s} {'fill':5s} {'shape':10s} {'use':12s} primary  families")
for r in rows:
    print(f"{r['file']:28s} {r['w']:3d}x{r['h']:<4d} {r['fill']:5.2f} {r['shape']:10s} {r['use']:12s} "
          f"{r['primary']:12s} {r['families']}")

print("\nuse counts:", dict(Counter(r["use"] for r in rows)))

# ---------------- 接触表 ----------------
CELL = 150
cols = 10
rowsn = (len(rows) + cols - 1) // cols
sheet = Image.new("RGB", (cols * CELL, rowsn * CELL), (26, 26, 32))
d = ImageDraw.Draw(sheet)
for i, r in enumerate(rows):
    cx = (i % cols) * CELL
    cy = (i // cols) * CELL
    im = Image.open(os.path.join(SL, r["file"])).convert("RGBA")
    scale = min((CELL - 26) / im.width, (CELL - 26) / im.height, 1.0)
    tw, th = max(1, int(im.width * scale)), max(1, int(im.height * scale))
    im = im.resize((tw, th), Image.NEAREST)
    bg = Image.new("RGBA", (CELL, CELL - 22), (58, 54, 72, 255))
    bg.paste(im, ((CELL - tw) // 2, (CELL - 22 - th) // 2), im)
    sheet.paste(bg.convert("RGB"), (cx, cy + 22))
    d.text((cx + 4, cy + 4), f"{i}:{r['use'][:9]}", fill=(255, 226, 120))
    d.text((cx + 4, cy + 12), r["file"].split(".")[0][:22], fill=(150, 200, 255))
sheet.save(OUT_SHEET)
print("contact sheet ->", OUT_SHEET, sheet.size)
for i, r in enumerate(rows):
    print(f"  [{i:2d}] {r['file']}")
