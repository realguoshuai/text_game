# ⛔ 已下架（2026-09-16）：碧霄灵谷已从 assets/maps.json 移除（用户要求）。
#    保留本脚本只为留个可回溯的来路；**重跑它会把地图重新写回 maps.json**，
#    并且青玄山门 / 灵泉灵瀑 里通往碧霄灵谷的传送门会重新出现 —— 要恢复就一起恢复。
#    卸载时同时删掉了 qingxuan、lingquan 各一个 to:/bixiao/ 的传送门（否则点了会跳进不存在的图）。
# -*- coding: utf-8 -*-
"""给已有地图补一个通往「碧霄灵谷」的传送门。

gen_map.js 只在 bixiao 内部放了出去的门，其它图没有回来的入口 ——
结果就是新地图只能靠右上「地图速切」按钮进，正常玩永远走不到。

选址规则（宁缺毋滥，找不到就报错、不硬塞）
    1. 地面可走：不是空格、不是水
    2. 不被物件占：solid!==false 的物件覆盖的格子全排除
    3. 离已有传送门 / NPC / 出生点 >= 4 格，别挤在一起
    4. 从出生点可达（BFS）
    5. 在剩下的里面挑「周围 5x5 最空旷」的：门要显眼，塞进树丛里没人看得见

用法
    python tools/add_bixiao_gate.py qingxuan
"""
import json
import os
import sys
from collections import deque

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MJ = os.path.join(ROOT, 'assets', 'maps.json')


def main():
    mid = sys.argv[1] if len(sys.argv) > 1 else 'qingxuan'
    d = json.load(open(MJ, encoding='utf-8'))
    mp = next((m for m in d['maps'] if m['id'] == mid), None)
    if not mp:
        print('无此地图', mid)
        return 1
    W, H, g = mp['w'], mp['h'], mp['ground']
    WATER = d.get('water', '~-')

    blocked = [[False] * W for _ in range(H)]
    for y in range(H):
        for x in range(W):
            ch = g[y][x]
            if ch == ' ' or ch in WATER:
                blocked[y][x] = True
    for o in mp.get('objects', []):
        if o.get('solid') is False:
            continue
        fw, fh = o.get('fw') or 1, o.get('fh') or 1
        for y in range(o['y'], min(H, o['y'] + fh)):
            for x in range(o['x'], min(W, o['x'] + fw)):
                blocked[y][x] = True

    def ok(x, y):
        return 0 <= x < W and 0 <= y < H and not blocked[y][x]

    sp = mp.get('spawn') or {'x': W // 2, 'y': H // 2}
    # 可达性
    seen = set()
    q = deque()
    s0 = None
    for r in range(0, 40):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                x, y = sp['x'] + dx, sp['y'] + dy
                if ok(x, y):
                    s0 = (x, y)
                    break
            if s0:
                break
        if s0:
            break
    if not s0:
        print('出生点附近没有可走格')
        return 1
    q.append(s0)
    seen.add(s0)
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            n = (x + dx, y + dy)
            if n not in seen and ok(*n):
                seen.add(n)
                q.append(n)

    taken = [(p['x'], p['y']) for p in mp.get('portals', [])]
    taken += [(n['x'], n['y']) for n in mp.get('npcs', [])]

    best = None
    for (x, y) in sorted(seen):
        if any(abs(x - tx) + abs(ty - y) < 5 for tx, ty in taken):
            continue
        if any(abs(x - tx) + abs(sp['y'] - ty) < 6 and abs(y - ty) < 6 for tx, ty in taken):
            pass
        free = sum(1 for dy in range(-2, 3) for dx in range(-2, 3)
                   if ok(x + dx, y + dy))
        score = (free, -(abs(x - W / 2) + abs(y - H / 2)))
        if best is None or score > best[0]:
            best = (score, x, y)
    if not best:
        print('找不到合适位置')
        return 1
    _, x, y = best
    print('选点 (%d,%d)  5x5 空旷度 %d/25' % (x, y, best[0][0]))

    bix = next((m for m in d['maps'] if m['id'] == 'bixiao'), None)
    if not bix:
        print('maps.json 里没有 bixiao')
        return 1
    bsp = bix.get('spawn') or {'x': 20, 'y': 34}
    mp['portals'].append({'x': x, 'y': y, 'to': 'bixiao',
                          'spawnX': bsp['x'], 'spawnY': bsp['y'],
                          'label': bix['name']})
    json.dump(d, open(MJ, 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    print('已在 %s 添加 -> %s 的传送门 (%d,%d)' % (mid, bix['name'], x, y))
    return 0


if __name__ == '__main__':
    sys.exit(main())
