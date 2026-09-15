# -*- coding: utf-8 -*-
"""
把 import_tmx.py 产出的 <prefix>_map.json 挂进 assets/maps.json 的 maps 数组。

设计要点
--------
1. **幂等**：按 id 覆盖，重复跑不会出现两张同名图。
2. **不动别人**：只追加/替换目标条目，其余地图的键序与内容保持不变。
3. **walkable 补字符**：import_tmx.py 用 'k' 当「隐形可走」（PAL 不登记 → 引擎不画，
   但 WALK 里有它 → 算能走）。所以必须把 'k' 并进全局 walkable 字符串，
   否则外来地图整张都走不动（表现为鼠标点了不动、WASD 无反应）。
4. **版本号**：maps.json 是带 ?v= 缓存的，改完必须让调用方一起升版本。

用法
----
  python tools/attach_imported.py                 # 挂 imported_map.json + gr_iso_map.json
  python tools/attach_imported.py --check         # 只看现状，不写
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPS = os.path.join(ROOT, 'assets', 'maps.json')
# 要挂进来的图（顺序 = 地图速切按钮里的顺序）
WANT = ['imported_map.json', 'gr_iso_map.json']


def main():
    check = '--check' in sys.argv
    data = json.load(open(MAPS, encoding='utf-8'))
    maps = data['maps']

    # 1) walkable 补 'k'
    walk = data.get('walkable', '')
    if 'k' not in walk:
        data['walkable'] = walk + 'k'
        print('[walkable] %r -> %r' % (walk, data['walkable']))
    else:
        print('[walkable] 已含 k，不动')

    # 2) 逐张挂载
    for fn in WANT:
        src = os.path.join(ROOT, 'assets', fn)
        if not os.path.exists(src):
            print('[skip] 缺少 %s' % fn)
            continue
        mp = json.load(open(src, encoding='utf-8'))
        # import_tmx.py 给的字段直接可用；补两个引擎需要的默认值
        mp.setdefault('npcs', [])
        old = next((i for i, m in enumerate(maps) if m['id'] == mp['id']), -1)
        if old >= 0:
            maps[old] = mp
            print('[更新] %-12s %s  %dx%d' % (mp['id'], mp['name'], mp['w'], mp['h']))
        else:
            maps.append(mp)
            print('[新增] %-12s %s  %dx%d' % (mp['id'], mp['name'], mp['w'], mp['h']))

    if check:
        print('\n--check：未写盘')
        return
    # ⚠ 必须保持单行紧凑格式：maps.json 原本就是一行 62KB 的紧凑 JSON，
    #   用 indent 重排会把整个文件变成上千行 diff，看不出真正改了什么。
    with open(MAPS, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print('\n写入 %s：maps=%d，%.0f KB'
          % (os.path.relpath(MAPS, ROOT), len(maps), os.path.getsize(MAPS) / 1024))


if __name__ == '__main__':
    main()
