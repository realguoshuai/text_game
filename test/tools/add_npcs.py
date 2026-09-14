# -*- coding: utf-8 -*-
"""往 maps.json 里注入 NPC 布点（位置自动吸附到可走格，并做多重校验）。

校验项：
  · 落点必须「可走」（属于 walkable 字符集）
  · 不能被实体物件压住（objects 里 solid != false 的占地）
  · 不能压住传送门及其落点
  · NPC 之间至少间隔 3 格，避免叠在一起
吸附策略：以给定锚点为中心，按半径逐圈找最近的合法格；找不到就报错（不静默跳过）。

用法：python add_npcs.py
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MAPS = os.path.join(ROOT, 'assets', 'maps.json')

# 角色：assets/npc_14.png 等（由 build_player_atlas.py 生成）
PLAN = {
    'qingxuan': [
        dict(ax=14, ay=24, char='npc_18', name='云鹤长老', face='down',
             line='山门新到的道友？碑林那边莫要走岔了。'),
        dict(ax=20, ay=22, char='npc_10', name='执事·青砚', face='left',
             line='灵泉的水，可洗剑，也可洗心。'),
        dict(ax=12, ay=14, char='npc_14', name='巡山弟子', face='right',
             line='近日山风紧，云路欲断，早些回殿。'),
        dict(ax=23, ay=30, char='npc_20', name='杂役·阿赤', face='up',
             line='这石阶我扫了三百年，还是扫不完。'),
    ],
    'lingquan': [
        dict(ax=14, ay=20, char='npc_14', name='守泉人', face='down',
             line='泉眼底下有东西，别伸手去探。'),
        dict(ax=19, ay=15, char='npc_20', name='采药童子', face='right',
             line='崖边的灵草，要等露水干了才摘。'),
        dict(ax=24, ay=11, char='npc_10', name='瀑下客', face='left',
             line='我在这儿坐了三年，就为听一记水声。'),
    ],
    'beilin': [
        dict(ax=10, ay=12, char='npc_10', name='碑下书生', face='down',
             line='每块碑上都刻着一个名字，可惜多半认不全了。'),
        dict(ax=16, ay=18, char='npc_18', name='守碑老者', face='left',
             line='碑不倒，人就不散。'),
        dict(ax=20, ay=26, char='npc_14', name='扫叶道人', face='up',
             line='落叶扫不尽，就当是给先人添些声息。'),
    ],
}


def main():
    d = json.load(open(MAPS, encoding='utf-8'))
    walkable, IDX = d['walkable'], {m['id']: m for m in d['maps']}
    total = 0
    for mid, plan in PLAN.items():
        mp = IDX[mid]
        solid = set()
        for o in mp['objects']:
            if o.get('solid') is False:
                continue
            for dy in range(o.get('fh', 1)):
                for dx in range(o.get('fw', 1)):
                    solid.add((o['x'] + dx, o['y'] + dy))
        banned = set(solid)
        for p in mp['portals']:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    banned.add((p['x'] + dx, p['y'] + dy))
            banned.add((p['spawnX'], p['spawnY']))

        def ok(x, y):
            return (0 <= x < mp['w'] and 0 <= y < mp['h']
                    and mp['ground'][y][x] in walkable and (x, y) not in banned)

        placed, out = [], []
        for it in plan:
            best = None
            for r in range(0, 14):
                cand = []
                for dx in range(-r, r + 1):
                    for dy in range(-r, r + 1):
                        if max(abs(dx), abs(dy)) != r:
                            continue
                        x, y = it['ax'] + dx, it['ay'] + dy
                        if not ok(x, y):
                            continue
                        if any((x - px) ** 2 + (y - py) ** 2 < 9 for px, py in placed):
                            continue
                        cand.append((abs(dx) + abs(dy), x, y))
                if cand:
                    cand.sort()
                    best = (cand[0][1], cand[0][2])
                    break
            if not best:
                raise SystemExit('[%s] %s 找不到合法落点（锚点 %d,%d）' % (mid, it['name'], it['ax'], it['ay']))
            x, y = best
            placed.append((x, y))
            out.append(dict(x=x, y=y, char=it['char'], name=it['name'], face=it['face'], line=it['line']))
            total += 1
        mp['npcs'] = out
        print('[%s] %s  NPC %d 个 -> %s' % (
            mid, mp['name'], len(out), ', '.join('%s(%d,%d)' % (o['name'], o['x'], o['y']) for o in out)))

    # 全量复核
    errs = []
    for mp in d['maps']:
        solid = {(o['x'] + dx, o['y'] + dy)
                 for o in mp['objects'] if o.get('solid') is not False
                 for dx in range(o.get('fw', 1)) for dy in range(o.get('fh', 1))}
        for o in mp.get('npcs', []):
            if mp['ground'][o['y']][o['x']] not in walkable:
                errs.append('%s NPC %s 落在不可走格' % (mp['id'], o['name']))
            if (o['x'], o['y']) in solid:
                errs.append('%s NPC %s 被实体压住' % (mp['id'], o['name']))
            if not os.path.exists(os.path.join(ROOT, 'assets', o['char'] + '.png')):
                errs.append('%s NPC %s 缺少图集 %s.png' % (mp['id'], o['name'], o['char']))
    print('校验:', '全部通过' if not errs else '; '.join(errs))
    if errs:
        raise SystemExit(1)

    json.dump(d, open(MAPS, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('已写 %s（NPC 共 %d）' % (os.path.relpath(MAPS, ROOT).replace('\\', '/'), total))


if __name__ == '__main__':
    main()
