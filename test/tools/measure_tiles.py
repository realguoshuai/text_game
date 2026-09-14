# -*- coding: utf-8 -*-
"""精确测量地砖图块的等距几何：菱形上顶点、最宽行(水平对角线)、厚度。用于反推网格尺寸。"""
import os
import numpy as np
from PIL import Image

OUT = 'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/test/assets/sliced'
CAND = ['building_015_119x75.png', 'building_012_120x77.png', 'building_017_118x75.png',
        'building_016_119x76.png', 'building_014_119x77.png', 'building_018_115x73.png']

for f in CAND:
    p = os.path.join(OUT, f)
    if not os.path.exists(p):
        print(f, 'MISSING'); continue
    a = np.asarray(Image.open(p).convert('RGBA'))
    m = a[:, :, 3] > 128
    rows = np.where(m.any(1))[0]
    if len(rows) == 0:
        print(f, 'EMPTY'); continue
    y0, y1 = rows[0], rows[-1]
    widths, spans = [], []
    for y in range(y0, y1 + 1):
        xs = np.where(m[y])[0]
        widths.append(xs.max() - xs.min() + 1 if len(xs) else 0)
        spans.append((xs.min(), xs.max()))
    widths = np.array(widths)
    wy = int(np.argmax(widths))
    wmax = int(widths[wy])
    span_w = spans[wy]
    # 上顶点行之后宽度单调增的终点即菱形最宽处
    print(f'{f}')
    print(f'   bbox {m.shape[1]}x{m.shape[0]}  opaque_rows y{y0}..{y1}')
    print(f'   最宽行 y={y0+wy}  width={wmax}  x {span_w[0]}..{span_w[1]}')
    print(f'   菱形上顶点->最宽行 高={wy}  =>  估算 菱形高={2*wy} 宽={wmax}  厚度≈{ (y1-y0+1) - 2*wy }')
