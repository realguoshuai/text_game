"""离线等距渲染器：直接读 maps.json + 图集，按引擎的投影与排序规则出图。

用途：改地图数据后秒级自检，不必等无头浏览器截图（那台机器上要 10 分钟）。
不追求与游戏逐像素一致，追求"布局、密度、连通性一眼可判"。

用法:
  python tools/iso_preview.py                     # 默认渲染 bixiao
  python tools/iso_preview.py qingxuan            # 指定地图
  python tools/iso_preview.py bixiao 0.30 out.png
"""
import json
import os
import sys

from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, 'assets')

TILE_W, TILE_H = 120, 60
HW, HH = TILE_W / 2, TILE_H / 2
TOP_OVER = 1.06
TOP_OVER_WATER = 1.14
SKY_TOP, SKY_MID, SKY_BOT = (169, 214, 238), (215, 236, 249), (244, 251, 254)


def load():
    maps = json.load(open(os.path.join(ASSETS, 'maps.json'), encoding='utf-8'))
    idx = json.load(open(os.path.join(ASSETS, 'tiles_atlas.json'), encoding='utf-8'))
    atlas = Image.open(os.path.join(ASSETS, 'tiles_atlas.png')).convert('RGBA')
    return maps, atlas, idx


def tile_hash(x, y):
    """与引擎 tileHash 同规则，保证变体选择一致。"""
    h = (x * 73856093) ^ (y * 19349663)
    return (h & 0x7FFFFFFF)


def render(map_id, out, Z=0.30, pad=50, show_marks=True, ground_only=False, only=None, floor_dir=None):
    """only: 只画这些地面字符（其余当空格）—— 用来把地面按层拆开看，
    定位"这片怪颜色到底是谁"时比盯着综合图猜快得多。"""
    maps, atlas, idx = load()
    mp = next((m for m in maps['maps'] if m['id'] == map_id), None)
    if not mp:
        print('无此地图: ' + map_id)
        return 1
    if only is not None:
        mp = dict(mp)
        mp['ground'] = [''.join(c if c in only else ' ' for c in row) for row in mp['ground']]
        mp['objects'] = []
    PAL = maps['tilePalette']
    GT = mp.get('groundTop') or {}
    W_CLR = maps.get('water', '~-')

    cache, raw_cache = {}, {}

    def raw_piece(name):
        """原始尺寸（不缩放）。地面瓦必须走这条：预缩放会先把菱形边缘插成半透明，
        之后再用最近邻也救不回来。"""
        if name in raw_cache:
            return raw_cache[name]
        im = None
        if name.startswith('@'):
            fp = os.path.join(floor_dir or '', name[1:])
            if floor_dir and os.path.exists(fp):
                im = Image.open(fp).convert('RGBA')
        else:
            p = os.path.join(ASSETS, name)
            if os.path.exists(p):
                im = Image.open(p).convert('RGBA')
            elif name in idx:
                x, y, w, h = idx[name]
                im = atlas.crop((x, y, x + w, y + h))
        raw_cache[name] = im
        return im

    def piece(name):
        if name in cache:
            return cache[name]
        im = raw_piece(name)
        if im is not None and Z != 1.0:
            nw, nh = max(1, round(im.width * Z)), max(1, round(im.height * Z))
            im = im.resize((nw, nh), Image.LANCZOS)
        cache[name] = im
        return im

    def iso(mx, my):
        return ((mx - my) * HW * Z, (mx + my) * HH * Z)

    w, h = mp['w'], mp['h']
    # 视口：覆盖整张等距菱形 + 物件高度余量
    vw = int(round((w + h) * HW * Z)) + pad * 2
    vh = int(round((w + h) * HH * Z)) + pad * 2 + int(220 * Z)
    ox = (h) * HW * Z + pad
    oy = pad + int(120 * Z)

    def grid(i):
        """格顶屏幕坐标（含视口偏移）"""
        sx, sy = iso(i[0], i[1])
        return sx + ox, sy + oy

    cv = Image.new('RGBA', (vw, vh), (0, 0, 0, 0))
    # 天空渐变
    sky = Image.new('RGBA', (1, vh))
    sd = ImageDraw.Draw(sky)
    for i in range(vh):
        t = i / max(1, vh - 1)
        if t < 0.5:
            k = t / 0.5
            c = tuple(int(SKY_TOP[j] + (SKY_MID[j] - SKY_TOP[j]) * k) for j in range(3))
        else:
            k = (t - 0.5) / 0.5
            c = tuple(int(SKY_MID[j] + (SKY_BOT[j] - SKY_MID[j]) * k) for j in range(3))
        sd.point((0, i), fill=c + (255,))
    cv.paste(sky.resize((vw, vh)), (0, 0))

    # ---------- 地面 ----------
    tw, th = TILE_W * Z, TILE_H * Z
    gcache = {}
    for y in range(h):
        row = mp['ground'][y]
        for x in range(w):
            ch = row[x]
            f = PAL.get(ch)
            if not f:
                continue
            name, top = f, False
            vs = GT.get(ch)
            if vs:
                flat = bool(mp.get('noSideWall'))
                if ch in W_CLR:
                    nb = [mp['ground'][yy][xx] for xx, yy in ((x+1, y), (x-1, y), (x, y+1), (x, y-1))
                          if 0 <= xx < w and 0 <= yy < h]
                    if flat or all(n in W_CLR and PAL.get(n) for n in nb):
                        # ⚠ 这里原本取 vs[0]：全湖只用第 0 号变体，整片水就是同一张图
                        #   反复贴 —— 湖面因此有"瓷砖感"。必须按格 hash 挑变体。
                        name, top = vs[tile_hash(x, y) % len(vs)], True
                else:
                    sb = mp['ground'][y + 1][x] if y + 1 < h else ' '
                    se = row[x + 1] if x + 1 < w else ' '
                    if flat or (PAL.get(sb) and PAL.get(se)):
                        name, top = vs[tile_hash(x, y) % len(vs)], True
            im = raw_piece(name)
            if im is None:
                continue
            px, py = grid((x, y))
            is_water = top and ch in W_CLR
            over = TOP_OVER_WATER if is_water else TOP_OVER
            dw = tw * (over if top else 1.0)
            dh = im.height * (dw / im.width)
            key = (name, round(dw), round(dh), is_water)
            sc = gcache.get(key)
            if sc is None:
                # 水面用最近邻：平滑缩放会在菱形边缘插出一圈半透明像素，
                # 与背景混色后就是满湖格线。水是近乎纯色，最近邻的硬边拼起来看不出接缝。
                rs = Image.NEAREST if is_water else Image.LANCZOS
                sc = im.resize((max(1, int(dw)), max(1, int(dh))), rs)
                gcache[key] = sc
            cv.paste(sc, (int(px - dw / 2), int(py)), sc)

    # ---------- 物件（与引擎同排序键） ----------
    items = []
    for o in ([] if ground_only else mp.get('objects', [])):
        k = (o['x'] + (o.get('fw') or 1) - 1) + (o['y'] + (o.get('fh') or 1) - 1) + 0.5
        items.append((k, o))
    items.sort(key=lambda t: t[0])
    for k, o in items:
        im = piece(o['piece'])
        if im is None:
            continue
        ax = o['x'] + ((o.get('fw') or 1) - 1) / 2
        ay = o['y'] + ((o.get('fh') or 1) - 1) / 2
        px, py = grid((ax, ay))
        by = py + HH * Z + (o.get('dy') or 0) * Z
        cv.paste(im, (int(px - im.width / 2), int(by - im.height)), im)

    # ---------- 标记 ----------
    if show_marks:
        dr = ImageDraw.Draw(cv)
        for pt in mp.get('portals', []):
            px, py = grid((pt['x'], pt['y']))
            cy = py + HH * Z
            dr.ellipse([px - 8 * Z * 3, cy - 8 * Z * 3, px + 8 * Z * 3, cy + 8 * Z * 3],
                       outline=(0, 160, 255, 255), width=3)
        sp = mp.get('spawn')
        if sp:
            px, py = grid((sp['x'], sp['y']))
            dr.ellipse([px - 5, py - 5, px + 5, py + 5], fill=(255, 60, 60, 255))
        for n in mp.get('npcs', []):
            px, py = grid((n['x'], n['y']))
            dr.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(255, 220, 60, 255))

    cv.convert('RGB').save(out)
    print('%s  %dx%d  Z=%.2f' % (out, vw, vh, Z))
    # 统计
    cnt = {}
    for row in mp['ground']:
        for ch in row:
            cnt[ch] = cnt.get(ch, 0) + 1
    print('  地面字符: ' + json.dumps(cnt))
    print('  物件 %d  NPC %d  传送门 %d' % (len(mp.get('objects', [])), len(mp.get('npcs', [])),
                                          len(mp.get('portals', []))))
    return 0


if __name__ == '__main__':
    mid = sys.argv[1] if len(sys.argv) > 1 else 'bixiao'
    args = [s for s in sys.argv[2:] if not s.startswith('--')]
    z = float(args[0]) if args else 0.30
    out = args[1] if len(args) > 1 else os.path.join(ROOT, '_iso_%s.png' % mid)
    only = None
    for s in sys.argv[2:]:
        if s.startswith('--only='):
            only = set(s.split('=', 1)[1]) | {' '}
    sys.exit(render(mid, out, z, ground_only='--ground-only' in sys.argv, only=only))
