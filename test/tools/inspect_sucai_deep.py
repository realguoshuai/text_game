# -*- coding: utf-8 -*-
"""深入分析 sucai/ 五张图：
1) 两两相似度（判断是否同场景变体）
2) 画面分区色彩/天空地图（我不看图也能知道哪儿有什么）
3) 对角线自相关 → 估等距地砖网格间距（判断能否切砖复用）
4) 生成缩略图与拼板，便于人工核对
"""
import os, json, itertools
from collections import Counter
import numpy as np
from PIL import Image, ImageDraw, ImageFont

SRC = r"C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/sucai"
OUT = r"C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/immortal-isles/_analysis"
os.makedirs(OUT, exist_ok=True)

files = sorted(f for f in os.listdir(SRC) if f.lower().endswith((".jpg", ".jpeg", ".png")))
imgs = {}
for f in files:
    im = Image.open(os.path.join(SRC, f)).convert("RGB")
    imgs[f] = im

# ---------- 1) 两两相似度 ----------
print("=== 1) 两两相似度（越小越像，0=相同）===")
small = {f: np.asarray(im.resize((160, 88))).astype(float) for f, im in imgs.items()}
sim = []
for a, b in itertools.combinations(files, 2):
    d = float(np.abs(small[a] - small[b]).mean())
    sim.append((d, a[:38], b[:38]))
for d, a, b in sorted(sim):
    print(f"  diff={d:7.2f}  {a}  <->  {b}")

# ---------- 2) 分区色彩地图 ----------
print("\n=== 2) 分区色彩地图（6列x3行；SKY=天空色 / 其余给主色RGB+亮度）===")
region_json = {}
for f, im in imgs.items():
    a = np.asarray(im).astype(int)
    H, W, _ = a.shape
    edge = np.concatenate([a[0:6].reshape(-1, 3), a[-6:].reshape(-1, 3),
                           a[:, 0:6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bgc = np.array(Counter(map(tuple, edge)).most_common(1)[0][0])
    NC, NR = 6, 3
    cw, ch = W // NC, H // NR
    grid = []
    for r in range(NR):
        row = []
        for c in range(NC):
            blk = a[r*ch:(r+1)*ch, c*cw:(c+1)*cw].reshape(-1, 3)[::11, :]
            isbg = float((np.abs(blk - bgc).max(1) < 20).mean())
            col = Counter(map(tuple, blk)).most_common(1)[0][0]
            lum = int(np.mean(col))
            row.append(dict(bg=round(isbg, 2), rgb=[int(x) for x in col], lum=lum))
        grid.append(row)
    region_json[f] = grid
    print(f"\n-- {f}")
    for r in range(NR):
        cells = []
        for c in range(NC):
            g = grid[r][c]
            cells.append("SKY " if g["bg"] > 0.6 else f"{g['rgb'][0]:3d},{g['rgb'][1]:3d},{g['rgb'][2]:3d}/L{g['lum']:3d}")
        print("   r%d: %s" % (r, " | ".join(cells)))

# ---------- 3) 对角线自相关 → 等距网格间距 ----------
print("\n=== 3) 等距网格间距估计（对角线自相关峰值）===")
grid_json = {}
for f, im in imgs.items():
    a = np.asarray(im.convert("L").resize((704, 384))).astype(float)
    a = a - a.mean()
    H, W = a.shape
    # 沿等距两轴（斜率 ±1/2）取样线，求平均自相关
    best = {}
    for name, (sx, sy) in {"isoX(+1/2)": (2, 1), "isoY(-1/2)": (2, -1)}.items():
        acc = np.zeros(60)
        n = 0
        for y0 in range(0, H, 13):
            xs = np.arange(0, W)
            ys = (y0 + (xs - W // 2) * sy / sx).astype(int)
            ok = (ys >= 0) & (ys < H)
            if ok.sum() < 200:
                continue
            line = a[ys[ok], xs[ok]]
            line = line - line.mean()
            ac = np.correlate(line, line, "full")[len(line)-1:]
            ac = ac / (ac[0] + 1e-9)
            acc[:60] += ac[:60]
            n += 1
        if n:
            acc /= n
            # 找 8..50 内第一个显著峰
            pk = None
            for k in range(8, 50):
                if acc[k] > acc[k-1] and acc[k] >= acc[k+1] and acc[k] > 0.18:
                    pk = (k, round(float(acc[k]), 3))
                    break
            best[name] = pk
    grid_json[f] = best
    print(f"  {f[:38]:40s} {best}")

# ---------- 4) 缩略图 + 拼板 ----------
tiles = []
TW, TH = 460, 251
for f, im in imgs.items():
    tiles.append((f, im.resize((TW, TH), Image.LANCZOS)))
cols = 2
rows = (len(tiles) + cols - 1) // cols
sheet = Image.new("RGB", (cols*TW, rows*(TH+20)), (24, 24, 28))
d = ImageDraw.Draw(sheet)
for i, (f, t) in enumerate(tiles):
    x = (i % cols) * TW
    y = (i // cols) * (TH + 20)
    sheet.paste(t, (x, y+20))
    d.text((x+6, y+4), f, fill=(255, 230, 160))
sheet.save(os.path.join(OUT, "sucai_contact_sheet.png"))
print("\n已存拼板: _analysis/sucai_contact_sheet.png", sheet.size)

with open(os.path.join(OUT, "sucai_deep.json"), "w", encoding="utf-8") as fp:
    json.dump(dict(regions=region_json, gridPitch=grid_json), fp, ensure_ascii=False, indent=2)
