# -*- coding: utf-8 -*-
"""技能特效图集打包 —— 把 flare-game 的 power 特效（火球/爆炸/闪电）打进 fx_atlas。

用法
    python games/immortal-isles/tools/build_fx_atlas.py

来源（gitignore 的原始素材，与 sucai/ 同策略不入库）
    ImmortalGame/.workbuddy/flare_preview/{fireball,blast,lightning}.{png,txt}
    txt 格式：frame=帧序,方向,x,y,w,h,锚x,锚y（8 方向）

输出
    games/immortal-isles/assets/fx_atlas.png / .webp / fx_atlas.json
    json = { "_meta": {name: {n, fps, oneshot, cell}}, "<name>_<帧序>": [x,y,w,h], ... }

每组特效取一个朝向（火球取横向最舒展的方向，爆炸/闪电取帧数最多的方向），
整组等比缩放到目标高度后按行排布；引擎绘制时把帧绕速度方向旋转，所以只需一个朝向。
"""
import os, json, re, sys
from PIL import Image

BASE = r'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame'
SRC = os.path.join(BASE, '.workbuddy/flare_preview')
ASSETS = os.path.join(BASE, 'games/immortal-isles/assets')

# name: (png, 目标最大边 px, oneshot)。目标边 = 该组缩放后最大帧的「高」。
FX = {
    'fireball':  ('fireball.png',  44,  False),   # 弹道飞行，循环播放
    'blast':     ('blast.png',    116,  True),    # 落地爆炸，一次播完
    'lightning': ('lightning.png', 116, False),   # 雷罡咒落雷，施法期间循环
}
PAD = 2
# flare 原版 duration 是「演出节奏」（爆炸 6 帧要 3.6s），放进实时战斗太拖沓，
# 这里按玩法手感覆盖：火球弹道转得快、爆炸半秒内炸完、落雷干脆。
FPS_OVERRIDE = {'fireball': 10.0, 'blast': 12.0, 'lightning': 8.0}


def parse_anim(path):
    """{anim: {(帧序,方向): [x,y,w,h,ox,oy]}}"""
    anims, cur = {}, None
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        if line[0] == '[' and line[-1] == ']':
            cur = line[1:-1]
            anims[cur] = {}
            continue
        k, _, v = line.partition('=')
        if cur is None or k.strip() != 'frame':
            continue
        p = [int(x) for x in v.split(',')]
        anims[cur][(p[0], p[1])] = p[2:]
    return anims


def pick_frames(cells, want_wide):
    """选一个朝向的帧序列：want_wide=按宽高比最横展选（火球弹道），否则按帧数最多选。"""
    by_dir = {}
    for (idx, d), c in cells.items():
        x, y, w, h, ox, oy = c
        if w > 2 and h > 2:
            by_dir.setdefault(d, []).append((idx, c))
    if not by_dir:
        raise RuntimeError('没有可用帧：%s' % path)
    if want_wide:
        best = max(by_dir, key=lambda d: max(c[2] / float(c[3]) for _, c in by_dir[d]))
    else:
        best = max(by_dir, key=lambda d: len(by_dir[d]))
    return [c for _, c in sorted(by_dir[best])]


def main():
    rect, meta, rows = {}, {}, []
    for name, (png, target_h, oneshot) in FX.items():
        txt = os.path.join(SRC, name + '.txt')
        im = Image.open(os.path.join(SRC, png)).convert('RGBA')
        cells = parse_anim(txt)['power']
        frames = pick_frames(cells, want_wide=(name == 'fireball'))
        scaled = []
        for (x, y, w, h, ox, oy) in frames:
            k = target_h / float(max(w, h)) if max(w, h) > target_h else target_h / float(max(w, h))
            nw, nh = max(1, round(w * k)), max(1, round(h * k))
            fr = im.crop((x, y, x + w, y + h)).resize((nw, nh), Image.NEAREST)
            scaled.append(fr)
        row_h = max(f.height for f in scaled) + PAD * 2
        row_w = sum(f.width for f in scaled) + PAD * (len(scaled) + 1)
        rows.append((name, scaled, row_w, row_h))
        dur = 0
        m = re.search(r'duration=(\d+)', open(txt, encoding='utf-8').read())
        if m:
            dur = int(m.group(1))
        meta[name] = {'n': len(scaled), 'fps': FPS_OVERRIDE.get(name) or
                      (round(1000.0 / dur, 2) if dur else 10.0),
                      'oneshot': oneshot, 'h': row_h}
        print('%-9s %d 帧  fps=%s  oneshot=%s  row=%dx%d'
              % (name, len(scaled), meta[name]['fps'], oneshot, row_w, row_h))

    W = max(r[2] for r in rows)
    H = sum(r[3] for r in rows)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    y = 0
    for name, scaled, row_w, row_h in rows:
        x = PAD
        for i, fr in enumerate(scaled):
            canvas.alpha_composite(fr, (x, y + PAD))
            rect['%s_%d' % (name, i)] = [x, y + PAD, fr.width, fr.height]
            x += fr.width + PAD
        y += row_h

    out = {'_meta': meta}
    out.update(rect)
    canvas.save(os.path.join(ASSETS, 'fx_atlas.png'), optimize=True)
    canvas.save(os.path.join(ASSETS, 'fx_atlas.webp'), 'WEBP', quality=90, method=6)
    json.dump(out, open(os.path.join(ASSETS, 'fx_atlas.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    for ext in ('png', 'webp', 'json'):
        p = os.path.join(ASSETS, 'fx_atlas.' + ext)
        print('fx_atlas.%-5s %.1fKB' % (ext, os.path.getsize(p) / 1024))
    print('图集尺寸: %dx%d  帧总数: %d' % (W, H, len(rect)))


if __name__ == '__main__':
    main()
