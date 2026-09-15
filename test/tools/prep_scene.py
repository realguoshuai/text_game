# -*- coding: utf-8 -*-
"""场景件预处理：从 FreePixel 源「选料 → 复制 → 裁到内容 bbox → 调色入调」。

做四件事
    1) 选料：从工作区的 FreePixel 素材包里挑出修仙题材用得上的件，复制到 assets/scene/；
    2) 裁 bbox：原图是 200x200 画布、内容只占中间一小块。留白不裁掉的话，
       物件会「浮」在格子上方（引擎是按精灵底边中点对齐格底边中点的）；
    3) 夜景件提亮：带 midnight 后缀的是夜景版，暗部发蓝，直接放进日间场景会脏；
    4) 调色入调：部分素材（秋枫/水晶/捕蝇草/符文石）饱和度和明度都远高于场景基准，
       摆进青绿冷调的谷地里非常跳。对它们做降饱和 + 压亮 + 轻微偏冷。

幂等
    每一步都从源目录重新开始，不读上一次的产物，所以重复跑结果完全一致
    （不会因为跑两次就把颜色压成灰的）。

用法
    python tools/prep_scene.py
"""
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SCENE = os.path.join(ROOT, 'assets', 'scene')
WS = 'C:/Users/Lenovo/WorkBuddy/text_game'
FP = os.path.join(WS, 'AssetLibrary', 'FreePixel')
SAMPLE = os.path.join(WS, '_fp_sample')

# 源目录标记 -> (文件名, 落地名)
SOURCES = [
    ('d', ['hot-spring', 'bamboo-gate', 'stone-gate', 'lion-statue-guardian',
           'ancient-obelisk', 'runestone-glowing', 'cairn-stones', 'broken-pillar',
           'well-stone', 'lantern-paper-red', 'lantern-paper-yellow', 'venus-flytrap',
           'dragon-statue-jade', 'hero-statue-stone']),
    ('m', ['bamboo-cluster', 'crystal-cluster-green', 'gray-boulder', 'mossy-rock',
           'stone-archway', 'stone-pillar']),
    ('n', ['campfire-burning-midnight', 'bridge-stone-midnight', 'tall-grass-tuft-midnight',
           'rock-pile-small-midnight', 'fountain-of-magic-glowing-midnight',
           'dead-tree-autumn-midnight', 'mushroom-cluster-glowing-blue-midnight',
           'wall-torch-lit-midnight']),
]
EXTRA = [  # (源文件名, 落地名)
    ('japane-torii-gate-shrine-entrance-001', 'torii-gate'),
    ('maple-tree-autumn', 'maple-tree-autumn'),
    ('pine-tree-lush', 'pine-tree-lush'),
    ('stone-archway', 'stone-archway-a'),
]

# 上一轮产出过、这轮不要了 —— 必须显式删，否则旧文件会一直躺在 assets/scene/
# （图集只打 maps.json 引用到的件，所以不影响线上体积，但容易看花眼）
REMOVE = ['bamboo-forest', 'zen-rock-garden', 'giant-tree-lush',
          'crystal-cluster', 'crystal-cluster-blue', 'crystal-cluster-purple',
          'sky-floating-rock-chunk']

# 从「场景大图」里抠出可当物件用的小图。
#
# 背景
#     _fp_sample 里的 japane-*-010 是 480x270 的场景插画（整片竹林带一条草地），
#     直接当物件摆进地图就是一个 200x200 的矩形贴片 —— 之前 bixiao 的竹苑
#     满屏方块，就是这个原因。但它也是手头唯一真正的「竹子」，所以不弃用，
#     改成按列分布把它拆成单丛：实测 x 6~94 与 x142~200 各是一丛，中间是空档；
#     y≥165 是全宽草地（要切掉，否则底部露一条矩形草地）。
CROPS = [  # (源文件名, 落地名, (x0, y0, x1, y1), 是否镜像)
    ('japane-bamboo-forest-tall-grass-010', 'bamboo-clump-a', (6, 0, 94, 168), False),
    ('japane-bamboo-forest-tall-grass-010', 'bamboo-clump-b', (6, 0, 94, 168), True),
    ('japane-bamboo-forest-tall-grass-010', 'bamboo-clump-c', (142, 0, 200, 168), False),
]
DIRS = {'d': os.path.join(FP, '地图-中式地标'),
        'm': os.path.join(FP, '地图-晶石矿物'),
        'n': os.path.join(FP, '地图-夜景器械')}

# 暖光源件不做提亮（篝火/火把/喷泉本来就该亮）
KEEP_COLOR = ('campfire', 'wall-torch', 'fountain', 'runestone', 'lantern')

# 入调表：落地名(前缀) -> (饱和倍率, 明度倍率, 冷偏移量)
# 只列「明显跳出场景」的件；石头/竹子/松树本身就在场景色域里，不动。
TUNE = {
    'maple-tree-autumn': (0.52, 0.86, 0.05),
    'dead-tree-autumn-midnight': (0.60, 0.90, 0.04),
    'crystal-cluster-blue': (0.46, 0.84, 0.03),
    'crystal-cluster-green': (0.50, 0.86, 0.03),
    'crystal-cluster-purple': (0.48, 0.84, 0.03),
    'crystal-cluster': (0.48, 0.85, 0.03),
    'venus-flytrap': (0.50, 0.88, 0.04),
    'runestone-glowing': (0.62, 0.92, 0.03),
    'hot-spring': (0.72, 0.94, 0.02),
    'mushroom-cluster-glowing-blue-midnight': (0.62, 0.90, 0.02),
    'torii-gate': (0.70, 0.93, 0.02),
    'dragon-statue-jade': (0.72, 0.94, 0.02),
    # 竹丛是从场景大图里抠的，顶梢叶色偏黄绿荧光，压一压才融进草地
    'bamboo-clump': (0.78, 0.93, 0.02),
}


def tune(rgb, sat=1.0, val=1.0, cool=0.0):
    """降饱和 + 压亮 + 轻微偏冷（往场景的青绿色温靠）。

    用 HSV 做，保持色相：只改 S/V，橙红枫树还是枫树，只是不再是荧光橙。
    """
    a = rgb.astype(np.float32) / 255.0
    mx = a.max(axis=2)
    mn = a.min(axis=2)
    d = mx - mn

    s = np.where(mx > 1e-6, d / np.maximum(mx, 1e-6), 0.0)
    v = mx
    s2 = np.clip(s * sat, 0, 1)
    v2 = np.clip(v * val, 0, 1)

    # hue（0~6）
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    h = np.zeros_like(mx)
    m = d > 1e-6
    h = np.where(m & (mx == r), np.mod((g - b) / np.maximum(d, 1e-6), 6.0), h)
    h = np.where(m & (mx == g), (b - r) / np.maximum(d, 1e-6) + 2.0, h)
    h = np.where(m & (mx == b), (r - g) / np.maximum(d, 1e-6) + 4.0, h)

    i0 = np.floor(h).astype(np.int32) % 6
    f = h - np.floor(h)
    p = v2 * (1 - s2)
    q = v2 * (1 - f * s2)
    t = v2 * (1 - (1 - f) * s2)
    cond = [i0 == 0, i0 == 1, i0 == 2, i0 == 3, i0 == 4, i0 == 5]
    out = np.zeros_like(a)
    out[:, :, 0] = np.select(cond, [v2, q, p, p, t, v2], default=v2)
    out[:, :, 1] = np.select(cond, [t, v2, v2, q, p, p], default=v2)
    out[:, :, 2] = np.select(cond, [p, p, t, v2, v2, q], default=v2)
    if cool:
        out[:, :, 2] = np.clip(out[:, :, 2] + cool * (1.0 - out[:, :, 2]), 0, 1)
        out[:, :, 0] = np.clip(out[:, :, 0] * (1 - cool * 0.6), 0, 1)
    return (np.clip(out, 0, 1) * 255).astype(np.uint8)


def lift(rgb, amt=0.20, desat_blue=0.94):
    """阴影提亮：暗部抬得多、高光几乎不动，避免整块发灰。"""
    out = rgb.astype(np.float32)
    t = 1.0 - out / 255.0
    out = out + (255.0 - out) * (amt * t * t)
    out[:, :, 2] *= desat_blue
    return np.clip(out, 0, 255).astype(np.uint8)


def main():
    os.makedirs(SCENE, exist_ok=True)
    for n in REMOVE:
        p = os.path.join(SCENE, n + '.png')
        if os.path.exists(p):
            os.remove(p)
            print('  删除旧件 ' + n)
    picked = []          # (源路径, 落地名)
    for tag, names in SOURCES:
        d = DIRS[tag]
        if not os.path.isdir(d):
            print('缺源目录: ' + d)
            return 1
        for n in names:
            picked.append((os.path.join(d, n + '.png'), n, None, False))
    for src, dst in EXTRA:
        picked.append((os.path.join(SAMPLE, src + '.png'), dst, None, False))
    for src, dst, box, mir in CROPS:
        picked.append((os.path.join(SAMPLE, src + '.png'), dst, box, mir))

    print('%-42s %-12s -> %-12s %s' % ('落地名', '源尺寸', '落地尺寸', '处理'))
    miss = 0
    for sp, dst, box, mir in picked:
        if not os.path.exists(sp):
            print('  缺源素材: ' + os.path.basename(sp))
            miss += 1
            continue
        im = Image.open(sp).convert('RGBA')
        orig = (im.width, im.height)
        note0 = []
        if box:
            im = im.crop(box)
            note0.append('抠%dx%d' % (im.width, im.height))
        if mir:
            im = im.transpose(Image.FLIP_LEFT_RIGHT)
            note0.append('镜像')
        arr = np.asarray(im)
        al = arr[:, :, 3]
        ys, xs = np.where(al > 8)
        if len(ys) == 0:
            print('  全透明: ' + dst)
            continue
        l, t, r, b = int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())
        l, t = max(0, l - 1), max(0, t - 1)
        r, b = min(im.width - 1, r + 1), min(im.height - 1, b + 1)
        crop = arr[t:b + 1, l:r + 1].copy()

        note = list(note0)
        if (r - l + 1, b - t + 1) != (im.width, im.height):
            note.append('裁%d/%d' % (orig[0] - (r - l + 1), orig[1] - (b - t + 1)))
        if 'midnight' in dst and not any(k in dst for k in KEEP_COLOR):
            crop[:, :, :3] = lift(crop[:, :, :3])
            note.append('提亮')
        sat, val, cool = TUNE.get(dst, (1.0, 1.0, 0.0))
        if (sat, val, cool) != (1.0, 1.0, 0.0):
            crop[:, :, :3] = tune(crop[:, :, :3], sat, val, cool)
            note.append('入调%.2f/%.2f' % (sat, val))

        out = Image.fromarray(crop)
        out.save(os.path.join(SCENE, dst + '.png'), optimize=True)
        print('%-42s %-12s -> %-12s %s' % (
            dst, '%dx%d' % orig, '%dx%d' % out.size, ' '.join(note) or '（原样）'))

    files = [f for f in os.listdir(SCENE) if f.endswith('.png')]
    tot = sum(os.path.getsize(os.path.join(SCENE, f)) for f in files)
    print('\nassets/scene/ 共 %d 件, %.0f KB%s' % (len(files), tot / 1024,
                                                 ('  缺源 %d 个' % miss) if miss else ''))
    return 1 if miss else 0


if __name__ == '__main__':
    sys.exit(main())
