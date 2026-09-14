# -*- coding: utf-8 -*-
"""核验 sucai/ 下的新素材：格式 / 背景 / 是否等距图集 / 主色 / 结构倾向
纯本地计算，不联网。输出便于判断「能不能直接拿来拼地图 / 当背景」。
"""
import os, json
from collections import Counter
import numpy as np
from PIL import Image

SRC = r"C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/sucai"
OUT = r"C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/immortal-isles/_analysis"
os.makedirs(OUT, exist_ok=True)


def bands(proj, thr):
    b = []
    s = None
    for i, v in enumerate(proj):
        if v > thr and s is None:
            s = i
        elif v <= thr and s is not None:
            b.append((int(s), int(i - 1)))
            s = None
    if s is not None:
        b.append((int(s), int(len(proj) - 1)))
    return b


report = []
for fn in sorted(os.listdir(SRC)):
    if not fn.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        continue
    fp = os.path.join(SRC, fn)
    im = Image.open(fp)
    mode, size = im.mode, im.size
    with open(fp, "rb") as f:
        magic = f.read(4)
    is_jpeg = magic[:2] == b"\xff\xd8"

    rgb = im.convert("RGB")
    a = np.asarray(rgb).astype(int)
    H, W, _ = a.shape
    sub = a.reshape(-1, 3)[::13, :]

    # 背景 = 四角+边缘主色
    edge = np.concatenate([a[0:4].reshape(-1, 3), a[-4:].reshape(-1, 3),
                           a[:, 0:4].reshape(-1, 3), a[:, -4:].reshape(-1, 3)])
    bg = Counter(map(tuple, edge)).most_common(1)[0]
    bgc = np.array(bg[0])
    bgfrac = float((np.abs(a - bgc).max(2) < 12).mean())

    # 等效配色数（量化到 5bit 再数）
    q = (sub // 8)
    uniq = len(Counter(map(tuple, q)))

    # 边缘硬度：像素风 = 硬边（梯度分布双峰）；平滑插画 = 大量小梯度
    g = np.asarray(rgb.convert("L")).astype(float)
    gx = np.abs(np.diff(g, axis=1))
    hard = float((gx > 40).mean())
    soft = float(((gx > 3) & (gx < 25)).mean())

    # 是否隐藏等距网格：对非背景像素做行/列投影找规整间隔
    mx = a.max(2); mn = a.min(2)
    nonbg = (mx - mn > 14) | (np.abs(a - bgc).max(2) > 30)
    colsum = nonbg.sum(0); rowsum = nonbg.sum(1)
    cb = bands(colsum, H * 0.02)
    rb = bands(rowsum, W * 0.02)

    # 天空占比（背景主色出现率）+ 中心区是否也被背景占据（判断是否存在中央空洞/虚空间隙）
    report.append(dict(
        file=fn, size=[W, H], mode=mode, realFormat="JPEG" if is_jpeg else "PNG",
        bg=[int(x) for x in bg[0]], bgFrac=round(bgfrac, 3),
        approxColors=uniq, hardEdgeRatio=round(hard, 3), softEdgeRatio=round(soft, 3),
        colBands=len(cb), rowBands=len(rb),
        colBandWidths=sorted([e - s + 1 for s, e in cb], reverse=True)[:8],
        rowBandHeights=sorted([e - s + 1 for s, e in rb], reverse=True)[:8],
    ))
    # 存缩略图，便于用户对照
    th = im.copy()
    th.thumbnail((720, 720))
    th.convert("RGB").save(os.path.join(OUT, os.path.splitext(fn)[0][:40] + "_thumb.png"))
    print(f"[ok] {fn}  {W}x{H} {mode} {'JPEG' if is_jpeg else 'PNG'} bg={bg[0]} bgFrac={bgfrac:.2f} colors~{uniq}")

with open(os.path.join(OUT, "sucai_report.json"), "w", encoding="utf-8") as f:
    json.dump(report, f, ensure_ascii=False, indent=2)
print("\n--- JSON ---")
print(json.dumps(report, ensure_ascii=False, indent=2))
