# -*- coding: utf-8 -*-
"""
批量把 Flare 全部 Tiled 地图的可走掩码解出来（本地预览挑图用，不建图集/不入库）。

与 import_flare_all.py 用同一套 id 命名（flare_<theme>_<父目录>_<基名>），
这样生成的 <id>_mask.json 能直接对应后面「要保留的图」做完整导入。

产出：assets/flare_*_mask.json  （每张图一个，含 ground 掩码 + 出生点 + 主题）
      assets/flare_masks_manifest.json（汇总，供缩略图生成器与人工挑图）

用法：
  python tools/gen_flare_masks.py            # 全量解掩码
  python tools/gen_flare_masks.py --dry      # 只列会处理哪些
"""
import os, sys, json, subprocess, glob, re
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)                       # .../test
ASSETS = os.path.join(ROOT, 'assets')
TILED = os.path.abspath(os.path.join(ROOT, '..', '..', 'sucai', '_dl', 'flare', 'tiled'))
IMP = os.path.join(HERE, 'import_tmx.py')
PY = sys.executable

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


def main():
    dry = '--dry' in sys.argv
    tmxfiles = glob.glob(os.path.join(TILED, '**', '*.tmx'), recursive=True)
    entries = []
    for tmx in tmxfiles:
        rel = tmx.replace('\\', '/')
        if '/rules/' in rel:
            continue
        if rel.endswith('_template.tmx'):
            continue
        th = theme_of(tmx)
        if th is None:
            print('  ! 解析失败，跳过: %s' % rel)
            continue
        base = os.path.splitext(os.path.basename(tmx))[0]
        parent = os.path.basename(os.path.dirname(tmx))
        mid = 'flare_%s_%s_%s' % (th, sanitize(parent), sanitize(base))
        name = base.replace('_', ' ')
        entries.append(dict(tmx=tmx, theme=th, region=REGION[th], id=mid, name=name))

    from collections import Counter
    c = Counter(e['theme'] for e in entries)
    print('扫描到 %d 张可玩地图（按主题）：' % len(entries))
    for th in ('grass', 'cave', 'dungeon', 'ruins', 'snow'):
        if c.get(th):
            print('  %-7s %d 张' % (th, c[th]))

    if dry:
        for e in entries:
            print('  %s  [%s] %s' % (e['id'], e['theme'], e['name']))
        return

    ok, fail = [], []
    for e in entries:
        cmd = [PY, IMP, e['tmx'], '--id', e['id'], '--name', e['name'],
               '--prefix', 'flare_' + e['theme'],
               '--trust-collision', '--block-tileset', 'water', '--skip-layer', 'collision',
               '--mask-only']
        r = subprocess.run(cmd, capture_output=True, text=True)
        if r.returncode == 0:
            ok.append(e)
        else:
            fail.append((e['id'], (r.stderr or r.stdout)[-300:]))
            print('  [x] %s 失败: %s' % (e['id'], (r.stderr or r.stdout)[-200:]))

    manifest = [{k: e[k] for k in ('id', 'theme', 'region', 'name', 'tmx')}
                for e in ok]
    json.dump(manifest, open(os.path.join(ASSETS, 'flare_masks_manifest.json'), 'w', encoding='utf-8'),
              ensure_ascii=False, indent=1)
    print('\n完成：成功 %d，失败 %d' % (len(ok), len(fail)))
    print('manifest -> assets/flare_masks_manifest.json（%d 条）' % len(manifest))
    if fail:
        print('失败清单：')
        for fid, msg in fail:
            print('  %s -> %s' % (fid, msg.replace('\n', ' | ')))


if __name__ == '__main__':
    main()
