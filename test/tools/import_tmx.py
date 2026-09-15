# -*- coding: utf-8 -*-
"""
Tiled 地图导入器：.tmx/.tsx -> 本游戏的 maps.json 地图条目 + 图集。

为什么要有这个：
    这次的任务是「不要自己生成地图，去网上拿别人的」。
    问题是网上的免费等距地图**全是 Tiled 工程**（.tmx）——Tiled 是行业标准，
    别人做好的关卡都以它发布。所以「拿下来」能不能兑现，取决于有没有这个转换器：
    有，则以后任何人分享的 Tiled 等距地图都能一条命令进游戏；
    没有，就永远只能拿素材、自己摆——也就是用户明确否掉的那条路。

支持范围（覆盖 Tiled 导出的常见形态）：
    · 层数据 encoding=csv / base64（可带 zlib、gzip 压缩）
    · 外部 .tsx tileset、内联 tileset
    · 两种瓦片组织：整张 sheet（有 columns/tilecount）+ 图集式（每个 tile 一个 image，
      像 Kenney 的 Tiled Sample 那样）
    · 每 tileset 的 tileoffset（isometric 定位全靠它）
    · 透明色键 trans（'008080' 这类没抠底的图，导入时直接抠掉）

用法：
    python tools/import_tmx.py <map.tmx> --id <图id> --name <显示名>
        [--prefix imported] [--tile 120] [--walk-layer <层名>] [--pad 0] [--dry]

产出：
    assets/<prefix>/<文件名>.png    缩放后的瓦（图集源）
    assets/<prefix>_atlas.webp      图集
    assets/<prefix>_atlas.json      索引 { "<prefix>/文件名.png": [x,y,w,h] }
    assets/<prefix>_map.json        地图条目（贴进 maps.json 的 maps 数组即可）

几何：引擎 TILE_W=120 / TILE_H=60（2:1 等距），物件 1:1 像素、底边居中贴格底点。
      Tiled 的等距瓦片锚点与之天然一致（都是"菱形底点"），所以只要把瓦缩放到
      目标 tile 宽度、保留 tileoffset 的纵向位移，就能对齐。
"""
import os, sys, json, base64, zlib, gzip, math, shutil, argparse, re
import xml.etree.ElementTree as ET
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # .../test
ASSETS = os.path.join(ROOT, 'assets')


# ------------------------------------------------------------------ Tiled 解析

def _layer_data(node):
    """返回该层的 gid 列表（行优先）。"""
    de = node.find('data')
    if de is None:
        return []
    if de.get('encoding') == 'csv':
        return [int(v) for v in de.text.replace('\n', '').replace('\r', '').split(',') if v.strip()]
    raw = ''.join(de.text.split())
    if de.get('encoding') == 'base64':
        buf = base64.b64decode(raw + '=' * ((4 - len(raw) % 4) % 4))
        comp = de.get('compression')
        if comp == 'zlib':
            buf = zlib.decompress(buf)
        elif comp == 'gzip':
            buf = gzip.decompress(buf)
        else:
            raise SystemExit('不支持的压缩: %r（只做了 zlib/gzip）' % comp)
    elif de.get('encoding') == 'xml':
        return [int(t.get('gid', 0)) for t in de.findall('tile')]
    else:
        raise SystemExit('不支持的 encoding: %r' % de.get('encoding'))
    return [int.from_bytes(buf[i:i + 4], 'little') for i in range(0, len(buf), 4)]


def load_tileset(node, base_dir):
    """把 <tileset> 节点（内联或外部 .tsx）统一成一个 dict。"""
    src = node.get('source')
    path = None
    if src:
        path = os.path.join(base_dir, src)
        root = ET.parse(path).getroot()
        root_dir = os.path.dirname(path)
    else:
        root = node
        root_dir = base_dir
    first = int(node.get('firstgid', 1))
    tw, th = int(root.get('tilewidth')), int(root.get('tileheight'))
    cols = int(root.get('columns') or 0)
    off = root.find('tileoffset')
    offx, offy = (int(off.get('x', 0)), int(off.get('y', 0))) if off is not None else (0, 0)
    trans = None
    tiles = {}          # tileid -> image path（图集式）
    sheet = None        # 整张 sheet
    img = root.find('image')
    if img is not None:
        sheet = os.path.join(root_dir, img.get('source').replace('/', os.sep))
        trans = img.get('trans')
    for t in root.findall('tile'):
        im = t.find('image')
        if im is not None:
            tiles[int(t.get('id'))] = os.path.join(root_dir, im.get('source').replace('/', os.sep))
            trans = trans or im.get('trans')
    return dict(first=first, name=root.get('name') or 'set', tw=tw, th=th, cols=cols,
                off=(offx, offy), tiles=tiles, sheet=sheet, trans=trans)


def resolve(ts, gid):
    """gid -> (图片路径, 该图片内的裁剪框 or None)。"""
    tid = gid - ts['first']
    if ts['tiles']:
        return ts['tiles'][tid], None
    col = tid % ts['cols'] if ts['cols'] else 0
    row = tid // ts['cols'] if ts['cols'] else 0
    return ts['sheet'], (col * ts['tw'], row * ts['th'], ts['tw'], ts['th'])


def key_of(trans):
    """把 '008080' 之类的透明色键转成 RGB 元组。"""
    if not trans:
        return None
    t = trans.lstrip('#')
    if len(t) == 6:
        return tuple(int(t[i:i + 2], 16) for i in (0, 2, 4))
    if len(t) == 8:   # AARRGGBB
        return tuple(int(t[i:i + 2], 16) for i in (2, 4, 6))
    return None


# ------------------------------------------------------------------ 主流程

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('tmx')
    ap.add_argument('--id', required=True, help='地图 id（maps.json 里用）')
    ap.add_argument('--name', default=None)
    ap.add_argument('--prefix', default='imported', help='图集前缀 / 素材目录名')
    ap.add_argument('--tile', type=int, default=120, help='目标格宽（引擎 TILE_W=120）')
    ap.add_argument('--walk-layer', default=None, help='哪一层决定"能走"；默认取瓦最多的那层')
    ap.add_argument('--skip-layer', default='', help='完全不绘制的层（逗号分隔）。Flare 的 collision 是碰撞标记层，画出来会满屏乱瓦')
    ap.add_argument('--solid-layer', default=None, help='该层"有瓦"的格判为不可走（落成虚空）。Flare 用 collision 层表达碰撞，语义正好相反')
    ap.add_argument('--pad', type=int, default=0, help='内容外扩几格')
    ap.add_argument('--block', default='', help='不让走的瓦（本 tileset 内的 tile id，支持区间，如 22,23 或 144-207=水）')
    ap.add_argument('--block-tileset', default='',
                    help='按 tileset 名整组判为不可走（逗号分隔，如 water）。'
                         '比 --block 写 gid 区间更好维护：Flare 的水面是独立 tileset，名字一眼可辨')
    ap.add_argument('--spawn', default=None,
                    help='出生点 x,y（引擎格，相对裁剪后的图）。默认自动取"四邻皆可走、离图心最近"的格 —— '
                         '导入图的可走区常是岛屿/半岛，硬编码 (W//2,H-1) 会掉进海里')
    ap.add_argument('--note', default='')
    ap.add_argument('--dry', action='store_true', help='只解析不写文件')
    a = ap.parse_args()

    tmx = os.path.abspath(a.tmx)
    base = os.path.dirname(tmx)
    r = ET.parse(tmx).getroot()
    MW, MH = int(r.get('width')), int(r.get('height'))
    TW, TH = int(r.get('tilewidth')), int(r.get('tileheight'))
    if r.get('orientation') != 'isometric':
        print('!! 警告：orientation=%r，不是 isometric，位置会不对' % r.get('orientation'))
    if abs(TW / TH - 2.0) > 0.02:
        print('!! 警告：tile %dx%d 不是 2:1，塞进 TILE_H=TILE_W/2 的引擎会歪' % (TW, TH))
    scale = a.tile / float(TW)
    print('地图 %s  %dx%d 格  tile %dx%d  ->  缩放 ×%.5f' % (os.path.basename(tmx), MW, MH, TW, TH, scale))
    print('  引擎格 %d x %d' % (a.tile, int(round(TH * scale))))

    sets = [load_tileset(ts, base) for ts in r.findall('tileset')]
    sets.sort(key=lambda s: s['first'])
    for s in sets:
        kind = '图集式(%d 个 tile 各自一个 png)' % len(s['tiles']) if s['tiles'] else ('sheet %s' % os.path.basename(s['sheet'] or '?'))
        print('  tileset %-24s firstgid=%-4d tile %dx%d offset=(%d,%d)  %s'
              % (s['name'], s['first'], s['tw'], s['th'], s['off'][0], s['off'][1], kind))

    layers = []
    for ln in r.findall('layer'):
        g = _layer_data(ln)
        if len(g) != MW * MH:
            print('!! 层 %r 数据长度 %d != %dx%d，跳过' % (ln.get('name'), len(g), MW, MH))
            continue
        layers.append((ln.get('name') or 'layer', g))
    if not layers:
        raise SystemExit('没有可用的层')

    skip = set(x.strip() for x in a.skip_layer.split(',') if x.strip())
    unknown = skip - set(n for n, _ in layers)
    if unknown:
        print('  ! --skip-layer 里这些层不存在: %s' % ','.join(sorted(unknown)))
    drawn = [(n, g) for n, g in layers if n not in skip] or layers
    if skip:
        print('  跳过图层（不绘制）: %s' % ','.join(sorted(skip & set(n for n, _ in layers))))

    # 内容外接框（去掉大面积的空白，Tiled 的图幅经常远大于实际内容）
    xs, ys = [], []
    for _, g in drawn:
        for i, v in enumerate(g):
            if v:
                xs.append(i % MW); ys.append(i // MW)
    if not xs:
        raise SystemExit('这张图是空的')
    x0, x1 = max(0, min(xs) - a.pad), min(MW - 1, max(xs) + a.pad)
    y0, y1 = max(0, min(ys) - a.pad), min(MH - 1, max(ys) + a.pad)
    W, H = x1 - x0 + 1, y1 - y0 + 1
    print('  内容范围 x[%d..%d] y[%d..%d] -> 裁成 %dx%d' % (x0, x1, y0, y1, W, H))

    # 哪层决定"能走"
    walk_layer = a.walk_layer
    if not walk_layer:
        walk_layer = max(drawn, key=lambda kv: sum(1 for v in kv[1] if v))[0]
        print('  未指定 --walk-layer，取瓦最多的层: %r' % walk_layer)

    # 收集要用的贴图
    need = {}     # (src_path, crop) -> 输出文件名
    def imgname(path):
        return re.sub(r'[^A-Za-z0-9_.-]', '_', os.path.basename(path))

    for _, g in drawn:
        for v in g:
            if not v:
                continue
            s = [t for t in sets if t['first'] <= v][-1]
            p, crop = resolve(s, v)
            need[(p, crop)] = imgname(p)
    # 同名不同源时加序号
    seen = {}
    for (p, crop), nm in list(need.items()):
        if nm in seen and seen[nm] != (p, crop):
            stem, ext = os.path.splitext(nm)
            k = 2
            while '%s_%d%s' % (stem, k, ext) in seen:
                k += 1
            need[(p, crop)] = '%s_%d%s' % (stem, k, ext)
        seen[need[(p, crop)]] = (p, crop)
    print('  需要 %d 张贴图' % len(need))

    outdir = os.path.join(ASSETS, a.prefix)
    atlas_img = os.path.join(ASSETS, '%s_atlas.webp' % a.prefix)
    atlas_json = os.path.join(ASSETS, '%s_atlas.json' % a.prefix)
    map_json = os.path.join(ASSETS, '%s_map.json' % a.prefix)

    if a.dry:
        print('\n--dry：不写文件')
        return

    if os.path.exists(outdir):
        shutil.rmtree(outdir)
    os.makedirs(outdir)

    # 每张源图用哪个 tileset 的透明色键
    trans_of = {}
    for t in sets:
        if t['sheet']:
            trans_of.setdefault(t['sheet'], t['trans'])
        for v in t['tiles'].values():
            trans_of.setdefault(v, t['trans'])

    # 切/缩/抠底
    cache = {}
    for (p, crop), nm in need.items():
        im = Image.open(p).convert('RGBA')
        if crop:
            im = im.crop((crop[0], crop[1], crop[0] + crop[2], crop[1] + crop[3]))
        ck = key_of(trans_of.get(p))
        if ck:
            px = im.load()
            for yy in range(im.height):
                for xx in range(im.width):
                    rr, gg, bb, aa = px[xx, yy]
                    if aa > 0 and abs(rr - ck[0]) < 6 and abs(gg - ck[1]) < 6 and abs(bb - ck[2]) < 6:
                        px[xx, yy] = (0, 0, 0, 0)
        # 裁掉透明边。Flare 的格高（384）是"槽位高度"，地面瓦的真实内容只占底部 96px，
        # 整格缩放会让每次 drawImage 白白画 4 倍透明像素 —— 在无 GPU 的软渲染下慢到不可用。
        # 引擎的底边对齐靠 by（物件底边基准），所以裁掉多少底部余量就原样补回 dy。
        bb = im.getbbox()
        gap = 0
        if bb:
            gap = im.height - bb[3]          # 底部余量（原图像素）
            im = im.crop(bb)
        nw, nh = max(1, int(round(im.width * scale))), max(1, int(round(im.height * scale)))
        im = im.resize((nw, nh), Image.LANCZOS)
        im.save(os.path.join(outdir, nm))
        cache[(p, crop)] = (nm, nw, nh, gap)

    # 图集
    files = sorted(os.listdir(outdir))
    imgs = [(f, Image.open(os.path.join(outdir, f)).convert('RGBA')) for f in files]
    pad = 2
    cols = max(1, int(math.ceil(math.sqrt(len(imgs)))))
    cw = max(i.width for _, i in imgs); ch = max(i.height for _, i in imgs)
    rows = (len(imgs) + cols - 1) // cols
    at = Image.new('RGBA', (cols * cw + (cols + 1) * pad, rows * ch + (rows + 1) * pad), (0, 0, 0, 0))
    rect = {}
    for i, (f, im) in enumerate(imgs):
        x = pad + (i % cols) * (cw + pad); y = pad + (i // cols) * (ch + pad)
        at.paste(im, (x, y))
        rect['%s/%s' % (a.prefix, f)] = [x, y, im.width, im.height]
    try:
        at.save(atlas_img)
        ext = 'webp'
    except Exception as e:
        print('  webp 存不了(%s)，退回 png' % e)
        atlas_img = atlas_img.replace('.webp', '.png'); at.save(atlas_img); ext = 'png'
    json.dump(rect, open(atlas_json, 'w', encoding='utf-8'), ensure_ascii=False)

    # 地图条目
    GRASS = 'k'    # 无贴图的"隐形可行走"字符：PAL 里不登记 -> 引擎不画，但算能走

    # --block 支持 22,23 与 144-207 两种写法
    block = set()
    for part in a.block.split(','):
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            lo, hi = part.split('-', 1)
            block.update(range(int(lo), int(hi) + 1))
        else:
            block.add(int(part))

    # --block-tileset：整组 tileset 判为不可走（水/岩浆/深渊这类"看着是地、其实不让走"的组）
    block_sets = set()
    for tn in a.block_tileset.split(','):
        tn = tn.strip()
        if tn:
            block_sets.add(tn)
    if block_sets:
        miss = block_sets - set(s['name'] for s in sets)
        if miss:
            print('  ! --block-tileset 里这些 tileset 不存在: %s' % ','.join(sorted(miss)))
        for s in sets:
            if s['name'] in block_sets:
                nxt = min((t['first'] for t in sets if t['first'] > s['first']), default=10 ** 9)
                block.update(range(s['first'], nxt))
        print('  整组不可走: %s' % ','.join(sorted(block_sets)))

    ground = []
    wl = [n for n, _ in layers].index(walk_layer)
    sl = None
    if a.solid_layer:
        names = [n for n, _ in layers]
        if a.solid_layer in names:
            sl = names.index(a.solid_layer)
        else:
            print('  ! --solid-layer %r 不存在，忽略' % a.solid_layer)
    for y in range(y0, y1 + 1):
        row = ''
        for x in range(x0, x1 + 1):
            # 碰撞层有瓦 -> 该格不可走（Flare 用 collision 层画碰撞区，语义与 walk_layer 相反）
            if sl is not None and layers[sl][1][y * MW + x]:
                row += ' '
                continue
            v = layers[wl][1][y * MW + x]
            if not v:
                row += ' '
                continue
            # 水面之类"看着是地、其实不让走"的瓦，直接落成虚空字符。
            # 必须在导入期判掉：ground 是引擎唯一的可走性来源（物件 solid 只挡格子，
            # 但水面不是"挡路的物件"，它本身就是路）。
            # block 同时认绝对 gid（v）与 tileset 内相对 id（v-first）：--block 写成
            # 区间时两种口径都可能被用户拿来用，认两种比认一种少踩坑。
            s = [t for t in sets if t['first'] <= v][-1]
            row += ' ' if (v in block or (v - s['first']) in block) else GRASS
        ground.append(row)
    objects = []
    for lname, g in layers:
        if lname in skip:
            continue
        for i, v in enumerate(g):
            if not v:
                continue
            mx, my = i % MW, i // MW
            if not (x0 <= mx <= x1 and y0 <= my <= y1):
                continue
            s = [t for t in sets if t['first'] <= v][-1]
            p, crop = resolve(s, v)
            nm = cache[(p, crop)][0]
            cnw, cnh = cache[(p, crop)][1], cache[(p, crop)][2]
            oy = 0
            fw, fh = 1, 1
            # ---- Tiled 的"复合瓦"（声明尺寸本身横跨多格）----------------------
            # 例：Flare 的 tiled_grassland_2x2 声明 384x192，就是一张 2x2 格的圆石台。
            # 这类瓦 Tiled 按"左下锚点"摆放：盖住 x..x+N-1 与 y-(M-1)..y。
            # 当 1x1 画会整体偏半格，把旁边"本该被它盖住所以留空"的格子露成黑缺口
            # （arrival.tmx 源图 (16,18)/(17,18) 全三层皆空，就是被石台盖住的）。
            #
            # 判别必须两道一起过，单看尺寸会把"高槽位放高精灵"的瓦误判：
            #   · 声明尺寸横竖都 >1 格（water 192x192 = 1x2 宽度不跨格 → 排除）
            #   · 内容真把声明框填满 ≥95%（trees 声明 384x768 但内容只占 0.44 高 → 排除；
            #     grassland 192x384 只占 0.25 高 → 排除）
            # 误判的代价是把整排崖壁/树整体上移 N 格，比留个缺口严重得多，所以从严。
            if s['tw'] >= 2 * TW and s['th'] >= 2 * TH:
                fillw = cnw / float(s['tw'] * scale)
                fillh = cnh / float(s['th'] * scale)
                if fillw >= 0.95 and fillh >= 0.95:
                    fw = int(round(s['tw'] / float(TW)))
                    fh = int(round(s['th'] / float(TH)))
                    oy = -(fh - 1)
            # 每一层（含决定可走的那层）的瓦都当物件画 —— 别把"地面层"当隐形：
            # Tiled 里的地面经常不是菱形平瓦，而是 64x64 / 256x512 这类"带厚度的方块"
            # （草地岸、石地台、地板板），当隐形地面处理会整层消失。
            # 层序 = Tiled 的绘制序（先下后上），引擎按稳定排序保序，所以照文件顺序 append。
            #
            # dy：Tiled 的 tileoffset.y 是"瓦片相对格子的纵向像素位移"（正=往下），
            # 引擎的 dy 是同一含义（底边基准），所以直接传 —— 但要跟着缩放走，
            # 否则 scale != 1 时偏移还是原图尺度，整张图会整体错位。
            # gnd=1：这一层的瓦是"地面"，引擎不必让它参与深度排序（见 game.js 的 draw）。
            # 外来大图里 95% 的物件是地面瓦（flare 36x38 有 1370 个），
            # 混进排序列表会把每帧的排序与对象分配拖垮。
            objects.append(dict(piece='%s/%s' % (a.prefix, nm),
                                x=mx - x0, y=my - y0 + oy, fw=fw, fh=fh,
                                solid=(lname != walk_layer),
                                # 补回裁 bbox 时去掉的底部余量，保证底边仍对齐格底
                                dy=int(round(s['off'][1] * scale)) + int(round(cache[(p, crop)][3] * scale)),
                                gnd=(1 if lname == walk_layer else 0)))

    # ---------------------------------------------------------------- 出生点
    # 导入图的可走区经常是岛屿 / 半岛 / 环形，硬编码 (W//2, H-1) 大概率掉进水里，
    # 玩家一出生就在虚空中被卡死（引擎不会报错，只是动不了）。
    # 默认策略：优先"四邻皆可走"的格（远离崖边/水边，BFS 寻路不会一开局就贴墙），
    # 同档里取离图心最近的 —— 稳定、可复现，且不需要理解来源图的任何语义。
    walk = [[c != ' ' for c in row] for row in ground]
    if a.spawn:
        sx, sy = (int(v) for v in a.spawn.split(','))
        if not (0 <= sx < W and 0 <= sy < H) or not walk[sy][sx]:
            raise SystemExit('--spawn %d,%d 不是可走格（图 %dx%d）' % (sx, sy, W, H))
    else:
        best, sx, sy = None, W // 2, H // 2
        for y in range(H):
            for x in range(W):
                if not walk[y][x]:
                    continue
                nb = sum(1 for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                         if 0 <= x + dx < W and 0 <= y + dy < H and walk[y + dy][x + dx])
                key = (-nb, (x - W / 2.0) ** 2 + (y - H / 2.0) ** 2)
                if best is None or key < best:
                    best, sx, sy = key, x, y
        if best is None:
            raise SystemExit('这张图没有任何可走格 —— 检查 --walk-layer / --solid-layer / --block')
        print('  出生点 %d,%d（四邻可走=%d，离图心 %.1f 格）'
              % (sx, sy, -best[0], best[1] ** 0.5))

    entry = dict(id=a.id, name=a.name or a.id, note=a.note or ('由 %s 导入' % os.path.basename(tmx)),
                 w=W, h=H, ground=ground, objects=objects,
                 spawn=dict(x=sx, y=sy), home=dict(x=sx, y=sy), portals=[])
    # homeFromMap：告诉引擎"这个 home 是施工方挑过的，能用就用"。
    # 不设这个标记时，引擎会用"离图心最近的可走格"自己算 —— 对自带图够用，
    # 对外来图（岛/半岛/环形）会把出生点放到湖边或崖壁上。
    entry['homeFromMap'] = True
    # 虚空底色 = 来源 Tiled 工程的 backgroundcolor。引擎的默认背景是浅蓝天，
    # 但外来图的美术前提常常是「整张图浮在深色虚空上」（Flare 的草原图就是崖下深谷），
    # 用浅蓝填空隙会露出一块块白洞。来源图自己声明了底色就照搬（Tiled 不设则无此属性）。
    bgc = (r.get('backgroundcolor') or '').strip()
    if bgc:
        entry['voidColor'] = bgc
    print('  虚空底色: %s' % (entry.get('voidColor') or '（未声明，用引擎默认天空）'))
    json.dump(entry, open(map_json, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

    print()
    print('写好:')
    print('  %s  (%d 张瓦)' % (os.path.relpath(outdir, ROOT), len(imgs)))
    print('  %s' % os.path.relpath(atlas_img, ROOT))
    print('  %s' % os.path.relpath(atlas_json, ROOT))
    print('  %s   %dx%d  物件 %d  可行走格 %d' % (os.path.relpath(map_json, ROOT), W, H,
          len(objects), sum(r.count(GRASS) for r in ground)))
    print()
    print('接入还要手动做三件事：')
    print('  1. maps.json 的 maps 数组里加 %r 这个条目（直接用上面那个 json）' % a.id)
    print('  2. maps.json 的 walkable 字符串里加上 %r' % GRASS)
    print('  3. game.js 的 LOAD_PLAN 里加载 %s + %s（atlas 名 %r）'
          % (os.path.basename(atlas_img), os.path.basename(atlas_json), a.prefix))


main()
