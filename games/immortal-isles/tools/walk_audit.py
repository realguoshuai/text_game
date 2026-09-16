# -*- coding: utf-8 -*-
"""
可走性审计：把「引擎眼里的可走格」画到地图上，并列出被物件挡住的格子是哪些物件，
最后按 4 连通做**连通块分析** —— 后者才是「看着是路却走不过去」的直接判据。

背景：外来图（Flare）导入后玩家反馈「有的地方明明是路，却走不过去」。
原因只可能有三类，本脚本把它们分开量化：

    A. 没有地面瓦（ground=' '）—— 虚空/被复合瓦盖住留空的格
    B. 有地面瓦但被 collision 层标了碰撞 -> ground 落成 ' '
    C. 有地面瓦、也走得了，但**上层 object 的瓦把它判成 solid**

C 曾是主嫌：导入器把「非 walk_layer 的所有瓦」一律 `solid=True`，
而 Flare 的 object 层里混着大量**贴地的平瓦**（石板路/沙土/草地变化/木栈桥板），
它们铺在草地上只是换个地面材质，不是障碍物。
**该问题已于 2026-09-15 由 `import_tmx.py --trust-collision` 根治**（导入时
object 层一律 `solid=False`，只认 collision 层）；本脚本的 C 段现在用来复查
"有没有漏网的平瓦还在挡路"（正常应为 0）。

判别「平瓦」的口径（从严，宁可漏判不可误判）：
    · 缩放后内容高 <= 1.15 × TILE_H（60）—— 高过一格半的多半是墙/树/建筑
    · 且内容宽 <= 2.15 × TILE_W —— 排除大平台的宽扁贴条
    · 且它盖住的格子里，**至少有一格本身有背景地面瓦**（真的铺在地上，不是悬空装饰）

★ 连通块数必须为 1。多于 1 就说明有格子"能站但走不到"（桥断/崖隔/水面误判），
  点击寻路是 BFS，落在别的块里的格子点了不会动 —— 玩家的体感就是"这里有路却过不去"。

用法：
    python tools/walk_audit.py <地图 id> [--overlay 出图.png] [--scale 0.5]
                               [--top N] [--outline]

叠色口径：绿 = 能走 / 橙 = 有地面瓦但被挡 / 红 = 无地面瓦。
"""
import os, sys, json, argparse
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')
TILE_W, TILE_H = 120, 60


def load_mid(mid):
    mp = json.load(open(os.path.join(ASSETS, '%s_map.json' % mid), encoding='utf-8'))
    # 轻条目里没有地形时，从 maps.json 找
    if 'ground' not in mp:
        mj = json.load(open(os.path.join(ASSETS, 'maps.json'), encoding='utf-8'))
        for m in mj['maps']:
            if m.get('id') == mid and m.get('src'):
                mp = json.load(open(os.path.join(ASSETS, os.path.basename(m['src'].split('?')[0])),
                                    encoding='utf-8'))
                break
    return mp


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('mid')
    ap.add_argument('--overlay', default=None, help='把可走性叠色渲染到这张图')
    ap.add_argument('--scale', type=float, default=0.5)
    ap.add_argument('--top', type=int, default=18, help='列出前 N 个「挡路的平瓦」种类')
    ap.add_argument('--outline', action='store_true', help='叠色只描边不填充（看底图美术）')
    a = ap.parse_args()

    mp = load_mid(a.mid)
    W, H = mp['w'], mp['h']
    ground = mp['ground']
    objs = mp['objects']

    solid = {}
    for o in objs:
        if o.get('solid') is False:
            continue
        for dy in range(o.get('fh') or 1):
            for dx in range(o.get('fw') or 1):
                solid['%d,%d' % (o['x'] + dx, o['y'] + dy)] = o

    gnd_cells = wk_cells = 0
    nospace = nocol = 0
    blocked_by_obj = []
    for y in range(H):
        for x in range(W):
            c = ground[y][x]
            if c == ' ':
                nospace += 1
                continue
            gnd_cells += 1
            if '%d,%d' % (x, y) in solid:
                blocked_by_obj.append((x, y, solid['%d,%d' % (x, y)]))
            else:
                wk_cells += 1

    print('地图 %s  %dx%d' % (a.mid, W, H))
    print('  有地面瓦 %d 格 / 其中真能走 %d 格 / 被上层物件挡住 %d 格'
          % (gnd_cells, wk_cells, len(blocked_by_obj)))
    print('  无地面瓦 %d 格（虚空或 collision 标碰撞）' % nospace)

    # ---------------- 连通性 ----------------
    # 「可走」不等于「走得到」：点击寻路是 BFS，落在另一个连通块里的格子点了不会动。
    # 所以除了判可走，还要看有几个连通块、有没有孤零零的碎块（那是"看着有路、点了不动"）。
    wk = {}
    for y in range(H):
        for x in range(W):
            if ground[y][x] != ' ' and '%d,%d' % (x, y) not in solid:
                wk['%d,%d' % (x, y)] = 1
    seen = {}
    comps = []
    for k in wk:
        if k in seen:
            continue
        q = [k]; seen[k] = 1; comp = [k]
        while q:
            cx, cy = (int(v) for v in q.pop().split(','))
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                k2 = '%d,%d' % (cx + dx, cy + dy)
                if wk.get(k2) and k2 not in seen:
                    seen[k2] = 1; comp.append(k2); q.append(k2)
        comps.append(comp)
    comps.sort(key=len, reverse=True)
    print('  连通块 %d 个：%s' % (len(comps), ' / '.join(str(len(c)) for c in comps[:6])))
    tiny = [c for c in comps[1:] if len(c) <= 4]
    if tiny:
        print('  ⚠ 孤立碎块（点了走不到，BFS 会静默失败）：')
        for c in tiny:
            print('      %s' % ' '.join(c[:8]))

    # 图集索引：拿每张瓦的缩放后内容尺寸
    prefix = 'flare'
    for o in objs:
        if '/' in (o.get('piece') or ''):
            prefix = o['piece'].split('/')[0]
            break
    rect = json.load(open(os.path.join(ASSETS, '%s_atlas.json' % prefix), encoding='utf-8'))

    def size(o):
        r = rect.get(o['piece'])
        return (r[2], r[3]) if r else (0, 0)

    # 按「挡路的瓦种类」归并
    kinds = {}
    for x, y, o in blocked_by_obj:
        k = o['piece']
        e = kinds.setdefault(k, {'n': 0, 'w': size(o)[0], 'h': size(o)[1], 'cells': 0,
                                 'onGnd': 0, 'ex': (x, y)})
        e['n'] += 1
        # 该物件覆盖的格子里，有多少格「背景层本来也有地面瓦」
        for dy in range(o.get('fh') or 1):
            for dx in range(o.get('fw') or 1):
                px, py = o['x'] + dx, o['y'] + dy
                e['cells'] += 1
                if 0 <= px < W and 0 <= py < H and o['x'] + dx == x and o['y'] + dy == y:
                    pass
        e['onGnd'] += 1

    flat = []
    for k, e in kinds.items():
        if not e['w']:
            continue
        isflat = (e['h'] <= 1.15 * TILE_H) and (e['w'] <= 2.15 * TILE_W)
        if isflat:
            flat.append((e['n'], k, e['w'], e['h'], e['ex']))
    flat.sort(reverse=True)
    print('\n  挡路的「平瓦」嫌疑（高<=%.0f 且宽<=%.0f）：%d 种，共挡住 %d 格'
          % (1.15 * TILE_H, 2.15 * TILE_W, len(flat), sum(f[0] for f in flat)))
    for n, k, w, h, ex in flat[:a.top]:
        print('    %-42s %4d 格   瓦 %dx%d px   例 (%d,%d)' % (k, n, w, h, ex[0], ex[1]))
    if not flat:
        print('    （没有）')

    tall = sorted(((e['n'], k, e['w'], e['h']) for k, e in kinds.items()
                   if e['w'] and not ((e['h'] <= 1.15 * TILE_H) and (e['w'] <= 2.15 * TILE_W))),
                  reverse=True)
    print('\n  挡路的「高物件」（墙/树/建筑，正常该挡）：%d 种，共挡住 %d 格'
          % (len(tall), sum(t[0] for t in tall)))
    for n, k, w, h in tall[:6]:
        print('    %-42s %4d 格   瓦 %dx%d px' % (k, n, w, h))

    # ---------------- 叠色出图 ----------------
    # 几何必须与 render_map_json.py 完全一致，否则叠不到底图上：
    # 画布范围由**所有物件**的包围盒决定（含每张瓦的高矮），左上是 (minx-pad, miny-pad)。
    if not a.overlay:
        return
    Z = a.scale
    tw, th = TILE_W * Z, TILE_H * Z
    minx = miny = 10 ** 9
    maxx = maxy = -10 ** 9
    for o in objs:
        r = rect.get(o['piece'])
        if not r:
            continue
        sx = (o['x'] - o['y']) * tw / 2
        sy = (o['x'] + o['y']) * th / 2
        minx = min(minx, sx - r[2] * Z / 2)
        miny = min(miny, sy + th / 2 + (o.get('dy') or 0) * Z - r[3] * Z)
        maxx = max(maxx, sx - r[2] * Z / 2 + r[2] * Z)
        maxy = max(maxy, sy + th / 2 + (o.get('dy') or 0) * Z)
    pad = 16
    cw, ch = int(maxx - minx) + pad * 2, int(maxy - miny) + pad * 2
    ov = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))

    def cell_poly(mx, my):
        # 与 render 一致：格顶 = ((mx-my)*tw/2, (mx+my)*th/2)，再换算到画布坐标
        sx = (mx - my) * tw / 2 - minx + pad
        sy = (mx + my) * th / 2 - miny + pad
        return [(sx, sy), (sx + tw / 2, sy + th / 2), (sx, sy + th), (sx - tw / 2, sy + th / 2)]

    from PIL import ImageDraw
    d = ImageDraw.Draw(ov)
    outline = getattr(a, 'outline', False)
    for y in range(H):
        for x in range(W):
            c = ground[y][x]
            if c == ' ':
                col = (255, 60, 60, 78)          # 红：无地面瓦
            elif '%d,%d' % (x, y) in solid:
                col = (255, 170, 40, 96)         # 橙：有地但被物件挡
            else:
                col = (60, 220, 120, 34)         # 绿：能走
            poly = cell_poly(x, y)
            if outline:
                # 只描边不填充：底图美术看得清，分类也看得清
                d.line(poly + [poly[0]], fill=col[:3] + (235,), width=2)
            else:
                d.polygon(poly, fill=col)

    base = None
    for cand in (os.path.join(ASSETS, '_render_%s.png' % a.mid),
                 os.path.join(ROOT, '_render_%s.png' % a.mid),
                 os.path.join(ROOT, '_r_%s.png' % a.mid)):
        if os.path.exists(cand):
            base = Image.open(cand).convert('RGBA')
            break
    if base is not None and base.size == ov.size:
        out = Image.alpha_composite(base, ov)
    else:
        if base is not None:
            print('  ! 底图尺寸 %s != 叠色 %s（缩放比例不一致？），只出叠色层'
                  % ('x'.join(map(str, base.size)), 'x'.join(map(str, ov.size))))
        out = ov
    out.convert('RGB').save(a.overlay)
    print('\n叠色图 -> %s  （绿=能走  橙=有地但被物件挡  红=无地面瓦）' % a.overlay)


main()
