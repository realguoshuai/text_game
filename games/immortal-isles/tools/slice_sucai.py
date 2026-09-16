# -*- coding: utf-8 -*-
"""批量切图：对 sucai/ 下每张场景图跑「抠底 → 连通域 → 自适应切颈 → 重建」，
输出到 games/immortal-isles/assets/sliced_<tag>/，每张附标注总览图。
同时输出每张图的「主体 bbox / 轮廓占比 / 是否浮空岛」结构报告。
"""
import os, json
from collections import Counter
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SRC = r"C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/sucai"
ROOT = r"C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/test"
ANALYSIS = os.path.join(ROOT, "_analysis")
os.makedirs(ANALYSIS, exist_ok=True)

MIN_AREA = 900          # 2816px 宽的大图，小噪点阈值抬高
SPLIT_MIN = 20000
SEED_MIN = 4000

def disk(r):
    y, x = np.ogrid[-r:r + 1, -r:r + 1]
    return (x * x + y * y) <= r * r

files = sorted(f for f in os.listdir(SRC) if f.lower().endswith((".jpg", ".jpeg", ".png")))
summary = []

for idx, fn in enumerate(files, start=1):
    tag = f"s{idx}"
    im = Image.open(os.path.join(SRC, fn)).convert("RGB")
    rgb = np.asarray(im).astype(int)
    H, W, _ = rgb.shape

    # 背景色：四角 + 边缘条带主色
    edge = np.concatenate([rgb[0:8].reshape(-1, 3), rgb[-8:].reshape(-1, 3),
                           rgb[:, 0:8].reshape(-1, 3), rgb[:, -8:].reshape(-1, 3)])
    BG = np.array(Counter(map(tuple, edge)).most_common(1)[0][0])

    dist = np.abs(rgb - BG).max(axis=2)
    alpha = np.clip((dist - 10) * 255.0 / 26.0, 0, 255)
    fg = dist > 30
    fg = ndimage.binary_opening(fg, np.ones((5, 5), bool))
    fg = ndimage.binary_closing(fg, np.ones((5, 5), bool))

    # 主体 bbox
    ys, xs = np.where(fg)
    if len(xs):
        bx0, bx1, by0, by1 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    else:
        bx0 = by0 = 0; bx1, by1 = W - 1, H - 1
    bw, bh = bx1 - bx0 + 1, by1 - by0 + 1

    # 轮廓形状：主体在 bbox 内的填充率（低=细长/散，高=实心块）
    fill = float(fg[by0:by1+1, bx0:bx1+1].mean())
    # 上下半填充率（判断是否「上窄下宽」的浮空岛：岛底尖、岛顶宽）
    half = bh // 2
    top_fill = float(fg[by0:by0+half, bx0:bx1+1].mean())
    bot_fill = float(fg[by0+half:by1+1, bx0:bx1+1].mean())

    lab, n = ndimage.label(fg, np.ones((3, 3), bool))
    objs = ndimage.find_objects(lab)

    outlab = np.zeros(fg.shape, np.int32)
    nid = 0
    split_log = []
    for i, sl in enumerate(objs, start=1):
        if sl is None:
            continue
        m = (lab[sl] == i)
        area = int(m.sum())
        if area < MIN_AREA:
            continue
        hh, ww = m.shape
        if max(ww, hh) >= 500 and area >= SPLIT_MIN:
            done = False
            for r in (8, 14, 20, 28, 38, 50, 64):
                er = ndimage.binary_erosion(m, structure=disk(r))
                if er.sum() == 0:
                    break
                l2, n2 = ndimage.label(er, np.ones((3, 3), bool))
                seeds = [k for k in range(1, n2 + 1) if (l2 == k).sum() >= SEED_MIN]
                if len(seeds) >= 2:
                    view = outlab[sl]
                    cnt = 0
                    for k in seeds:
                        rec = ndimage.binary_propagation(l2 == k, mask=m)
                        if rec.sum() < MIN_AREA:
                            continue
                        nid += 1
                        view[rec] = nid
                        cnt += 1
                    split_log.append((i, area, r, cnt))
                    done = True
                    break
            if done:
                continue
        nid += 1
        outlab[sl][m] = nid

    objs2 = ndimage.find_objects(outlab)
    pieces = []
    for j, sl in enumerate(objs2, start=1):
        if sl is None:
            continue
        m = (outlab[sl] == j)
        a = int(m.sum())
        if a < MIN_AREA:
            continue
        pieces.append((j, sl, a))

    OUTD = os.path.join(ROOT, "assets", f"sliced_{tag}")
    os.makedirs(OUTD, exist_ok=True)
    rgba = np.dstack([rgb.astype(np.uint8), alpha.astype(np.uint8)])
    pieces.sort(key=lambda t: -t[2])
    manifest = []
    for order, (j, sl, a) in enumerate(pieces):
        ysl, xsl = sl
        m = (outlab[sl] == j)
        out = rgba[ysl.start:ysl.stop, xsl.start:xsl.stop].copy()
        out[~m, 3] = 0
        w, h = xsl.stop - xsl.start, ysl.stop - ysl.start
        mx = max(w, h)
        cls = "scene" if mx >= 500 else "building" if mx >= 220 else "prop" if mx >= 110 else "deco"
        name = f"{cls}_{order:03d}_{w}x{h}.png"
        Image.fromarray(out, "RGBA").save(os.path.join(OUTD, name))
        manifest.append(dict(file=name, cls=cls, order=order, x=int(xsl.start), y=int(ysl.start),
                             w=int(w), h=int(h), area=a))

    with open(os.path.join(OUTD, "manifest.json"), "w", encoding="utf-8") as fp:
        json.dump(dict(source=fn, tag=tag, imageSize=[W, H], bg=[int(v) for v in BG],
                       count=len(manifest), pieces=manifest), fp, ensure_ascii=False, indent=1)

    ov = im.copy()
    d = ImageDraw.Draw(ov)
    for m in manifest:
        col = (220, 30, 30) if m["cls"] == "scene" else (30, 120, 240) if m["cls"] == "building" else (20, 170, 60)
        d.rectangle([m["x"], m["y"], m["x"] + m["w"], m["y"] + m["h"]], outline=col, width=4)
        d.text((m["x"] + 5, m["y"] + 5), str(m["order"]), fill=(255, 255, 0))
    ov.save(os.path.join(OUTD, "_overview_labeled.png"))
    th = ov.copy(); th.thumbnail((900, 900)); th.save(os.path.join(ANALYSIS, f"{tag}_overview_small.png"))

    cls_cnt = dict(Counter(m["cls"] for m in manifest))
    row = dict(tag=tag, file=fn, size=[W, H], bg=[int(v) for v in BG],
               pieces=len(manifest), classes=cls_cnt,
               contentBBox=[bx0, by0, bw, bh], contentFill=round(fill, 3),
               topFill=round(top_fill, 3), bottomFill=round(bot_fill, 3),
               splitEvents=split_log)
    summary.append(row)
    print(f"[{tag}] {fn[:44]}")
    print(f"     pieces={len(manifest)} {cls_cnt} bg={list(BG)}")
    print(f"     contentBBox={[bx0,by0,bw,bh]} fill={fill:.2f} top={top_fill:.2f} bot={bot_fill:.2f} splits={split_log}")

with open(os.path.join(ANALYSIS, "sucai_slice_summary.json"), "w", encoding="utf-8") as fp:
    json.dump(summary, fp, ensure_ascii=False, indent=2)
print("\nsaved ->", ANALYSIS)
