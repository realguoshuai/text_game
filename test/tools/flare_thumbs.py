# -*- coding: utf-8 -*-
"""
本地批量预览 Flare 全部 Tiled 地图：算出「可走掩码」并渲染缩略图，
生成一套画廊（index.html + 每图一张小 png），供人工挑图。

和 import_tmx.py 解耦：这里【不裁瓦、不建图集、不读任何 tileset 图片】，
只解析 XML 层数据 + 按 import_tmx 的 --trust-collision --block-tileset water 语义
判可走，因此秒级/张、绝不因缺图崩。

语义（与游戏导入保持一致）：
  - 取「瓦最多的非碰撞层」当背景层；背景为空 = 虚空（透明）
  - collision 层有瓦的格 = 不可走（棕）
  - 背景属于 water tileset = 水面（蓝）
  - 其余背景 = 可走（绿）

产出（均在 .workbuddy/_flare_thumbs/，不入库）：
  index.html            画廊，按主题分组，每图标 编号/名称/尺寸/可走率
  <theme>/<id>.png      每图缩略图（1px/格，画廊里 pixelated 放大）
  index.json            编号 -> {id,name,theme,region,w,h,walk,walkPct}

用法：python tools/flare_thumbs.py
"""
import os, re, json, base64, zlib, gzip
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
TILED = os.path.abspath(os.path.join(ROOT, '..', '..', 'sucai', '_dl', 'flare', 'tiled'))
OUT = os.path.abspath(os.path.join(ROOT, '..', '.workbuddy', '_flare_thumbs'))

REGION = {'grass': '主世界', 'cave': '洞窟界', 'dungeon': '地牢界', 'ruins': '遗迹界', 'snow': '雪原界'}
THEME_ORDER = [('snowplains', 'snow'), ('ruins', 'ruins'), ('dungeon', 'dungeon'),
               ('cave', 'cave'), ('grassland', 'grass')]


def theme_of(tmx):
    try:
        root = ET.parse(tmx).getroot()
    except Exception:
        return None
    blob = []
    for ts in root.findall('tileset'):
        blob.append(os.path.basename(ts.get('source') or '').lower())
        blob.append((ts.get('name') or '').lower())
    text = ' '.join(blob)
    for kw, th in THEME_ORDER:
        if kw in text:
            return th
    return 'grass'


def sanitize(s):
    s = s.lower()
    s = re.sub(r'[^a-z0-9]+', '_', s)
    return s.strip('_') or 'x'


def layer_data(ln):
    de = ln.find('data')
    enc = de.get('encoding')
    comp = de.get('compression')
    text = (de.text or '').strip()
    if enc == 'csv':
        return [int(x) for x in text.replace('\n', '').split(',') if x.strip() != '']
    raw = base64.b64decode(text + '=' * (-len(text) % 4))   # 补足填充
    if comp == 'zlib':
        raw = zlib.decompress(raw)
    elif comp == 'gzip':
        raw = gzip.decompress(raw)
    n = len(raw) // 4
    return [int.from_bytes(raw[i * 4:i * 4 + 4], 'little') for i in range(n)]


def tileset_names(r, base):
    out = []
    for ts in r.findall('tileset'):
        first = int(ts.get('firstgid', 1))
        src = ts.get('source')
        if src:
            root = ET.parse(os.path.join(base, src)).getroot()
        else:
            root = ts
        out.append((first, (root.get('name') or 'set').lower()))
    out.sort()
    return out


def tileset_of(gid, names):
    if gid == 0:
        return None
    ts = None
    for first, nm in names:
        if gid >= first:
            ts = nm
    return ts


def parse(tmx):
    base = os.path.dirname(tmx)
    r = ET.parse(tmx).getroot()
    W, H = int(r.get('width')), int(r.get('height'))
    names = tileset_names(r, base)
    layers = [(ln.get('name'), layer_data(ln)) for ln in r.findall('layer')]
    bg = None
    bgc = -1
    for name, g in layers:
        if name == 'collision':
            continue
        c = sum(1 for x in g if x)
        if c > bgc:
            bgc = c
            bg = (name, g)
    collision = None
    for name, g in layers:
        if name == 'collision':
            collision = g
            break
    # 掩码上色：陆地形状才是挑图要看的（细到格的可走判定留给正式导入的 import_tmx）。
    # 有背景瓦 = 陆地(绿) / 水面(蓝)；虚空 = 透明。collision 层不在这里上色（易误判）。
    pix = []
    land = 0
    bg_grid = bg[1] if bg else []
    for y in range(H):
        for x in range(W):
            i = y * W + x
            gid = bg_grid[i] if i < len(bg_grid) else 0
            if gid == 0:
                pix.append((0, 0, 0, 0))          # 虚空
                continue
            tn = tileset_of(gid, names)
            if tn and 'water' in tn:
                pix.append((42, 95, 134, 255))      # 水（蓝）
            else:
                pix.append((127, 168, 107, 255))    # 陆地（绿）
                land += 1
    return dict(w=W, h=H, pix=pix, walk=land)


def main():
    import glob
    from PIL import Image
    tmxfiles = glob.glob(os.path.join(TILED, '**', '*.tmx'), recursive=True)
    recs = []
    for tmx in tmxfiles:
        rel = tmx.replace('\\', '/')
        if '/rules/' in rel or rel.endswith('_template.tmx'):
            continue
        th = theme_of(tmx)
        if th is None:
            continue
        base = os.path.splitext(os.path.basename(tmx))[0]
        parent = os.path.basename(os.path.dirname(tmx))
        mid = 'flare_%s_%s_%s' % (th, sanitize(parent), sanitize(base))
        name = base.replace('_', ' ')
        recs.append(dict(tmx=tmx, theme=th, region=REGION[th], id=mid, name=name))
    from collections import Counter
    c = Counter(e['theme'] for e in recs)
    print('扫描到 %d 张可玩地图：' % len(recs))
    for th in ('grass', 'cave', 'dungeon', 'ruins', 'snow'):
        if c.get(th):
            print('  %-7s %d 张' % (th, c[th]))

    os.makedirs(OUT, exist_ok=True)
    index = []
    for e in recs:
        try:
            d = parse(e['tmx'])
        except Exception as ex:
            print('  ! 解析失败 %s: %s' % (e['id'], ex))
            continue
        dstdir = os.path.join(OUT, e['theme'])
        os.makedirs(dstdir, exist_ok=True)
        img = Image.new('RGBA', (d['w'], d['h']))
        img.putdata(d['pix'])
        png = os.path.join(dstdir, e['id'] + '.png')
        img.save(png)
        pct = round(100.0 * d['walk'] / (d['w'] * d['h'] or 1))
        index.append(dict(id=e['id'], name=e['name'], theme=e['theme'], region=e['region'],
                           w=d['w'], h=d['h'], land=d['walk'], landPct=pct,
                           png=os.path.relpath(png, OUT).replace('\\', '/')))
        print('  ✓ %-40s %dx%d 陆地 %d%%' % (e['id'], d['w'], d['h'], pct))

    json.dump(index, open(os.path.join(OUT, 'index.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    write_gallery(index)
    print('\n完成：%d 张缩略图 -> %s' % (len(index), OUT))
    print('画廊：%s' % os.path.join(OUT, 'index.html'))


def write_gallery(index):
    by_region = {}
    for it in index:
        by_region.setdefault(it['region'], []).append(it)
    parts = []
    parts.append('<!doctype html><meta charset="utf-8">'
                 '<title>Flare 地图缩略图（挑图用）</title>'
                 '<style>body{background:#0c1018;color:#e8e0c8;font-family:system-ui,sans-serif;margin:0;padding:18px}'
                 'h1{font-size:20px;letter-spacing:2px;color:#ffd75e;margin:0 0 4px}'
                 '.sub{color:#9fb0c8;font-size:12px;margin-bottom:18px}'
                 '.region{margin:22px 0 10px;font-size:15px;color:#8bf3ff;letter-spacing:2px;'
                 'border-bottom:1px dashed rgba(139,243,255,.25);padding-bottom:6px}'
                 '.grid{display:flex;flex-wrap:wrap;gap:14px}'
                 '.card{width:168px;background:rgba(20,28,44,.7);border:1px solid rgba(120,146,190,.35);'
                 'border-radius:10px;padding:8px;cursor:pointer;transition:.12s}'
                 '.card:hover{border-color:#ffd75e;transform:translateY(-2px)}'
                 '.card sel{border-color:#ff7a7a}'
                 '.card.sel{border-color:#ff7a7a;box-shadow:0 0 10px rgba(255,122,122,.5)}'
                 '.thumb{width:150px;height:150px;object-fit:contain;image-rendering:pixelated;'
                 'background:#06080e;border-radius:6px;display:block;margin:0 auto}'
                 '.nm{font-size:12px;font-weight:600;margin-top:6px;line-height:1.3;height:2.6em;overflow:hidden}'
                 '.meta{font-size:10.5px;color:#9fb0c8;margin-top:2px}'
                 '.bar{position:fixed;left:0;right:0;bottom:0;background:rgba(10,14,24,.95);'
                 'border-top:1px solid rgba(214,178,96,.4);padding:10px 16px;font-size:13px;'
                 'display:flex;gap:14px;align-items:center}'
                 '.bar button{font-family:inherit;background:#28354e;color:#f0e3c2;border:1px solid #6e7ea0;'
                 'border-radius:8px;padding:7px 14px;cursor:pointer}'
                 '.bar button:hover{border-color:#ffd75e}'
                 '#sel{color:#ff9a9a;font-weight:600}'
                 '</style>')
    parts.append('<h1>Flare 地图缩略图 · 挑图用</h1>')
    parts.append('<div class="sub">点卡片选中（红框）=「想保留」；底部「导出选中」生成保留清单。'
                 '绿=可走 蓝=水 棕=不可走 透明=虚空。共 %d 张。</div>' % len(index))
    sel_js = ("var S={};function toggle(b,id){if(S[id]){delete S[id];b.classList.remove('sel')}"
              "else{S[id]=1;b.classList.add('sel')}document.getElementById('sel').textContent='已选 '+Object.keys(S).length+' 张'}"
              "function exp(){var ids=Object.keys(S);"
              "if(!ids.length){alert('还没选任何图');return}"
              "var txt=JSON.stringify(ids,null,1);"
              "var a=document.createElement('a');a.href='data:application/json,'+encodeURIComponent(txt);"
              "a.download='keep_flare.json';a.click()}"
              "function allsel(v){document.querySelectorAll('.card').forEach(function(c){"
              "var id=c.dataset.id;if(v){S[id]=1;c.classList.add('sel')}else{delete S[id];c.classList.remove('sel')}});"
              "document.getElementById('sel').textContent='已选 '+Object.keys(S).length+' 张'}")
    parts.append('<script>%s</script>' % sel_js)
    for region in sorted(by_region):
        items = sorted(by_region[region], key=lambda x: -x['landPct'])
        parts.append('<div class="region">%s（%d 张）</div>' % (region, len(items)))
        parts.append('<div class="grid">')
        for it in items:
            parts.append(
                '<div class="card" data-id="%s" onclick="toggle(this,\'%s\')">'
                '<img class="thumb" src="%s" loading="lazy">'
                '<div class="nm">%s</div>'
                '<div class="meta">%dx%d · 陆地 %d%%</div>'
                '</div>' % (it['id'], it['id'], it['png'], it['name'], it['w'], it['h'], it['landPct']))
        parts.append('</div>')
    parts.append('<div class="bar"><span id="sel">已选 0 张</span>'
                 '<button onclick="allsel(true)">全选本页</button>'
                 '<button onclick="allsel(false)">清空</button>'
                 '<button onclick="exp()">导出选中 → keep_flare.json</button></div>')
    open(os.path.join(OUT, 'index.html'), 'w', encoding='utf-8').write(''.join(parts))


if __name__ == '__main__':
    main()
