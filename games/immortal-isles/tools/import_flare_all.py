# -*- coding: utf-8 -*-
"""
批量把选中的 Flare 地图导入游戏（按"每张图一个轻条目 + 按 campaign×theme 共用图集"策略）。

为什么按 (parent, theme) 分组共用一套图集（prefix = flare_<theme>_<parent>）：
  - import_tmx.py 的瓦片文件名只按「basename + 裁剪位置」编（grassland_0_0.png），
    若把不同 campaign 的同名瓦片集（empyrean/grassland.png vs alpha/grassland.png
    内容不同）塞进同一套图集会静默覆盖、地图渲染错位且无报错。
  - 同 campaign 的图共用自己那套 tileset，内容一致 → 同 prefix 内追加（--append）永远安全。
  - 实测：132 张里 (theme, basename) 有 10 组跨 campaign 内容不一致（boss_chest.png 等），
    但 per-(parent,theme) 组内 0 处不一致 → 此分组 100% 安全。

引擎侧：地图条目带 atlas 字段（=prefix），game.js 的 mapAtlas 在玩家点进图时才按
flare_<theme>_<parent> 命名约定懒注册 EXTRA 条目并加载 assets/<prefix>_atlas.webp|.json，
首屏不背这 100+ 套图集。

用法：
  python tools/import_flare_all.py                  # 导入 keep_ids.json 里的全部
  python tools/import_flare_all.py --subset=pilot.json   # 只导入 pilot.json 列出的 id（先验证用）
"""
import os, sys, json, glob, subprocess, xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # .../games/immortal-isles
ASSETS = os.path.join(ROOT, 'assets')
# sucai 在仓库上级 text_game/sucai（2026-09-16 重组后从这里往上 3 级；向上探测防目录再挪）
_TILED_CANDIDATES = [
    os.path.abspath(os.path.join(ROOT, '..', '..', 'sucai', '_dl', 'flare', 'tiled')),
    os.path.abspath(os.path.join(ROOT, '..', '..', '..', 'sucai', '_dl', 'flare', 'tiled')),
]
TILED = next((p for p in _TILED_CANDIDATES if os.path.isdir(p)), _TILED_CANDIDATES[0])
KEEP = os.path.join(ROOT, '.workbuddy', '_flare_thumbs', 'keep_ids.json')
REGION = {'grass': '主世界', 'cave': '洞窟界', 'dungeon': '地牢界', 'ruins': '遗迹界', 'snow': '雪原界'}
THEME_ORDER = [('snowplains', 'snow'), ('ruins', 'ruins'), ('dungeon', 'dungeon'),
               ('cave', 'cave'), ('grassland', 'grass')]


def sanitize(s):
    s = s.lower()
    s = __import__('re').sub(r'[^a-z0-9]+', '_', s)
    return s.strip('_') or 'x'


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


def id_of(tmx):
    parent = os.path.basename(os.path.dirname(tmx))
    base = os.path.splitext(os.path.basename(tmx))[0]
    return 'flare_%s_%s_%s' % (theme_of(tmx), sanitize(parent), sanitize(base))


def name_of(tmx):
    base = os.path.splitext(os.path.basename(tmx))[0]
    return base.replace('_', ' ').title()


def main():
    subset = None
    for a in sys.argv[1:]:
        if a.startswith('--subset='):
            subset = a.split('=', 1)[1]
    if subset:
        want = set(json.load(open(subset, encoding='utf-8')))
        print('子集模式：只导入 %s 里的 %d 张' % (subset, len(want)))
    else:
        want = set(json.load(open(KEEP, encoding='utf-8')))
        print('全量模式：导入 keep_ids.json 里的 %d 张' % len(want))

    id2tmx = {}
    for tmx in glob.glob(os.path.join(TILED, '**', '*.tmx'), recursive=True):
        rel = tmx.replace('\\', '/')
        if '/rules/' in rel or rel.endswith('_template.tmx'):
            continue
        iid = id_of(tmx)
        if iid in want:
            id2tmx[iid] = tmx
    print('命中本地 tmx：%d / %d' % (len(id2tmx), len(want)))
    miss = want - set(id2tmx)
    if miss:
        print('  ! 以下 id 找不到对应 tmx（忽略）：%s' % ', '.join(sorted(miss)))

    # 按 (parent, theme) 分组，同组共用一套图集
    groups = {}
    for iid, tmx in id2tmx.items():
        th = iid.split('_')[1]
        parent = os.path.basename(os.path.dirname(tmx))
        groups.setdefault((parent, th), []).append((iid, tmx))

    ok, fail = 0, 0
    for (parent, th), items in sorted(groups.items()):
        prefix = 'flare_%s_%s' % (th, sanitize(parent))
        for i, (iid, tmx) in enumerate(sorted(items)):
            cmd = [sys.executable, os.path.join(HERE, 'import_tmx.py'), tmx,
                   '--id', iid, '--name', name_of(tmx), '--prefix', prefix,
                   '--walk-layer=background', '--skip-layer=collision',
                   '--solid-layer=collision', '--trust-collision', '--block-tileset=water']
            if i > 0:
                cmd.append('--append')
            print('\n=== [%d/%d] %s  prefix=%s%s' % (i + 1, len(items), iid, prefix,
                                                   '  (+--append)' if i > 0 else ''))
            rc = subprocess.run(cmd).returncode
            if rc == 0:
                ok += 1
            else:
                fail += 1
                print('  !! 导入失败：%s' % iid)
    print('\n导入完成：成功 %d，失败 %d' % (ok, fail))

    # 写 manifest（attach_imported.py 用它对每张图定 region）
    manifest = [{'id': iid, 'region': REGION.get(iid.split('_')[1], '?'),
                 'theme': iid.split('_')[1]} for iid in sorted(id2tmx)]
    json.dump(manifest, open(os.path.join(ASSETS, 'flare_manifest.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('已写 assets/flare_manifest.json（%d 条）' % len(manifest))

    # 图集体积报告（超 2MB 提醒，弱机/首屏友好）
    print('\n图集体积：')
    big = 0
    for fn in sorted(glob.glob(os.path.join(ASSETS, 'flare_*_atlas.webp'))) + \
            sorted(glob.glob(os.path.join(ASSETS, 'flare_*_atlas.png'))):
        kb = os.path.getsize(fn) / 1024
        flag = '  ⚠ 偏大' if kb > 2048 else ''
        if kb > 2048:
            big += 1
        print('  %-44s %6.0f KB%s' % (os.path.basename(fn), kb, flag))
    if big:
        print('⚠ %d 套图集 > 2MB，进图时会懒加载（不影响首屏），但单张偏大可考虑再拆。' % big)


if __name__ == '__main__':
    main()
