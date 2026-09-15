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
import hashlib
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MAPS = os.path.join(ROOT, 'assets', 'maps.json')
# 要挂进来的图（顺序 = 地图速切按钮里的顺序）
#   两张 Flare 图共用同一套图集（flare_atlas）—— import_tmx.py 第一次导 arrival 时
#   清空重建，之后每张都带 --append 把瓦并进去。加第三张照做即可。
WANT = ['flare_arrival_map.json', 'flare_harbor_map.json']
# 要下掉的图：
#   kenney_hall 只有 7x7 —— 本游戏地图都是 28~36 格，差了一个数量级，一张小房间挂在虚空里；
#   grasstest 虽 25x25，但 625 个物件全是地面瓦，没有建筑/道具/NPC，像底图不像"一个地方"。
# 两张都被否掉，这里清掉，免得有人以为它们还能用。
DROP = ['kenney_hall', 'grasstest']


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

    # 2) 下掉不再要的图（--check 时只报不动）
    for mid in DROP:
        old = next((i for i, m in enumerate(maps) if m['id'] == mid), -1)
        if old < 0:
            continue
        if check:
            print('[待下架] %s' % mid)
        else:
            gone = maps.pop(old)
            print('[下架] %-12s %s  %dx%d' % (gone['id'], gone.get('name', ''), gone['w'], gone['h']))

    # 3) 逐张挂载（写轻条目：地形数据留在 <id>_map.json 里，由引擎按需取）
    for fn in WANT:
        src = os.path.join(ROOT, 'assets', fn)
        if not os.path.exists(src):
            print('[skip] 缺少 %s' % fn)
            continue
        mp = json.load(open(src, encoding='utf-8'))
        mp.setdefault('npcs', [])
        # 去掉 ground/objects（占这张图 99% 的体积），其余元信息全留 ——
        # 引擎要 name/note/w/h 建按钮，要 spawn/home/voidColor/homeFromMap 定初始站位与底色。
        light = {k: v for k, v in mp.items() if k not in ('ground', 'objects')}
        # 图集名 = 瓦片键的前缀（'flare/xxx.png' -> 'flare'），引擎按它决定进图前补载哪套图集
        pre = (mp.get('objects') or [{}])[0].get('piece', '')
        light['atlas'] = pre.split('/')[0] if '/' in pre else 'flare'
        # 内容 md5 前 8 位当版本号：地形一改缓存键自动变，比手改 ?v= 靠谱
        light['src'] = 'assets/%s?v=%s' % (fn, hashlib.md5(open(src, 'rb').read()).hexdigest()[:8])
        old = next((i for i, m in enumerate(maps) if m['id'] == mp['id']), -1)
        tag = '更新' if old >= 0 else '新增'
        if old >= 0:
            maps[old] = light
        else:
            maps.append(light)
        print('[%s] %-12s %-8s %dx%d  物件 %-5d  轻条目 %.1fKB（地形外置 %s）'
              % (tag, light['id'], light['name'], light['w'], light['h'],
                 len(mp.get('objects') or []),
                 len(json.dumps(light, ensure_ascii=False, separators=(',', ':'))) / 1024, fn))

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
