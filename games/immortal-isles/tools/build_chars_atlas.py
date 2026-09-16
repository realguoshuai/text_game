# -*- coding: utf-8 -*-
"""角色包统一集成脚本 —— 新增主角外形只需要跑这一个脚本。

用法
    python games/immortal-isles/tools/build_chars_atlas.py            # 校验 + 生成图集与 heroes.json
    python games/immortal-isles/tools/build_chars_atlas.py --check     # 只校验，不写任何文件

登记方式
    ① 把素材包解压进 ImmortalGame/sucai/
    ② 在 games/immortal-isles/tools/hero_packs.json 的 packs 里加一条（素材包 dir / cell / prefix / 角色清单）
    ③ 跑本脚本。校验不过会**拒绝出图**并说明哪里不合格，不会默默产出一张歪图集。

素材格式（统一规范）
    · 横版侧视 sprite sheet，透明底 PNG，一个动作一行、横向排列
    · 每个角色目录：Idle.png / Walk.png 必须有；Run / Attack_1 / Attack_2 / Dead 建议齐全
      （缺失会回退到 Walk.png 并打印 WARN，不阻断）
    · 各帧底边必须对齐（素材应已自行完成动画对齐）；不齐会报错阻断

对齐策略（改这版的原因）
    实测素材**每一帧内容底边都落在格底**，即素材自身已经对齐好了。所以这里
    **整格缩放到 64px 单格**，绝不裁剪内容再居中 —— 攻击帧手会伸出去、倒地帧会
    变宽，一旦按包围盒居中，帧间就会左右抽搐。只额外做一次统一平移，让待机姿态
    落在格中央 x=32；同一角色所有动作共用这个平移量，动作间的相对位移完整保留。

行语义（必须与 game.js 的 SIDE_ACT 一致）
    row0 idle  row1 walk  row2 run  row3 atkA  row4 atkB  row5 dead

输出
    games/immortal-isles/assets/chars_atlas.png / chars_atlas.json   —— 6x5 等距基础角色 + 每包追加 6x6 侧视动作表
    games/immortal-isles/assets/heroes.json                          —— 角色清单，引擎据此生成切换按钮（不再硬编码）

素材授权：仅把素材烘进游戏图集，原始 PNG 始终留在 gitignore 的 sucai/ 里，不入库。
"""
import os, sys, json
from PIL import Image

BASE = r'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame'
SUCAI = os.path.join(BASE, 'sucai')
ASSETS = os.path.join(BASE, 'games/immortal-isles/assets')
MANIFEST = os.path.join(BASE, 'games/immortal-isles/tools/hero_packs.json')
OUT_PNG = os.path.join(ASSETS, 'chars_atlas.png')
OUT_JSON = os.path.join(ASSETS, 'chars_atlas.json')
OUT_HEROES = os.path.join(ASSETS, 'heroes.json')
BK_PNG = os.path.join(ASSETS, 'chars_base.png')
BK_JSON = os.path.join(ASSETS, 'chars_base.json')

CELL_DST = 64
COLS = 6
ROW_W = 3

# key, 文件名, 中文名, 是否必需
ACTS = [
    ('idle', 'Idle.png',     '待机',  True),
    ('walk', 'Walk.png',     '行走',  True),
    ('run',  'Run.png',      '奔跑',  False),
    ('atkA', 'Attack_1.png', '攻击A', False),
    ('atkB', 'Attack_2.png', '攻击B', False),
    ('dead', 'Dead.png',     '倒地',  False),
]
BOT_TOL = 2          # 各帧底边允许的像素差
H_MIN, H_MAX = 18, 62   # 缩放后角色内容高度合理区间（主角基准为 35）


def even_indices(n, want=COLS):
    """把 n 帧均匀取成 want 帧，保证包含首尾帧（循环动画不丢关键姿态）。"""
    if n <= 1:
        return [0] * want
    return [round(i * (n - 1) / (want - 1)) for i in range(want)]


def probe(folder, cell_decl):
    """校验一个角色目录，返回 (info, errors, warns)。"""
    errs, warns, info = [], [], {}
    if not os.path.isdir(folder):
        return None, ['目录不存在：%s' % folder], []
    for key, fn, cn, need in ACTS:
        p = os.path.join(folder, fn)
        if not os.path.exists(p):
            (errs if need else warns).append(
                '缺少 %s（%s）' % (fn, cn) if need else '%s（%s）缺失，将回退到 Walk.png' % (fn, cn))
            info[key] = None
            continue
        im = Image.open(p).convert('RGBA')
        w, h = im.size
        if cell_decl and h != cell_decl:
            errs.append('%s 单格高 %d px，与声明的 cell=%d 不符' % (fn, h, cell_decl))
            info[key] = None
            continue
        if h <= 0 or w % h:
            errs.append('%s 宽 %d 不是单格 %d 的整数倍（帧数不整）' % (fn, w, h))
            info[key] = None
            continue
        n = w // h
        bots, hs = [], []
        for i in range(n):
            bb = im.crop((i * h, 0, (i + 1) * h, h)).getchannel('A').getbbox()
            if bb is None:
                continue
            bots.append(bb[3]); hs.append(bb[3] - bb[1])
        if not bots:
            errs.append('%s 整张全透明' % fn)
            info[key] = None
            continue
        spread = max(bots) - min(bots)
        scaled_h = round(max(hs) * CELL_DST / float(h))
        if spread > BOT_TOL:
            errs.append('%s 各帧底边不齐（差 %d px，容差 %d）—— 素材自身未做动画对齐，'
                        '强行集成会上下抖动' % (fn, spread, BOT_TOL))
        if not (H_MIN <= scaled_h <= H_MAX):
            warns.append('%s 缩放后内容高 %d px（常规 %d~%d），体型可能与现有角色不搭'
                         % (fn, scaled_h, H_MIN, H_MAX))
        info[key] = {'n': n, 'h': h, 'content_h': scaled_h, 'bot_spread': spread}
    return info, errs, warns


def load_cells(path, cell):
    im = Image.open(path).convert('RGBA')
    n = max(1, im.width // cell)
    return [im.crop((i * cell, 0, (i + 1) * cell, cell)) for i in range(n)]


def center_x64(small):
    """降采样后的内容中心 x；空帧返回 None。"""
    bb = small.getchannel('A').getbbox()
    if bb is None:
        return None
    return (bb[0] + bb[2] - 1) / 2.0


def shift_x(im, dx):
    if dx == 0:
        return im
    out = Image.new('RGBA', (CELL_DST, CELL_DST), (0, 0, 0, 0))
    x0, x1 = max(0, -dx), min(CELL_DST, CELL_DST - dx)
    if x0 < x1:
        out.paste(im.crop((x0, 0, x1, CELL_DST)), (x0 + dx, 0))
    return out


def build_sheet(folder, cell):
    """生成一张 384x384 的 6列x6行 动作表，返回 (sheet, 每动作帧数, 平移量)。"""
    act_cells, counts = {}, {}
    for key, fn, cn, need in ACTS:
        p = os.path.join(folder, fn)
        if not os.path.exists(p):
            p = os.path.join(folder, 'Walk.png')
        cells = load_cells(p, cell)
        act_cells[key] = cells
        counts[key] = len(cells)

    # 统一平移锚点：以 idle 的内容中心落回格中央为准
    dx = 0
    for probe_key in ('idle', 'walk'):
        cs = sorted(c for c in (center_x64(c.resize((CELL_DST, CELL_DST), Image.NEAREST))
                                for c in act_cells[probe_key]) if c is not None)
        if cs:
            dx = int(round(CELL_DST / 2 - cs[len(cs) // 2]))
            break

    sheet = Image.new('RGBA', (COLS * CELL_DST, len(ACTS) * CELL_DST), (0, 0, 0, 0))
    for row, (key, _fn, _cn, _need) in enumerate(ACTS):
        cells = act_cells[key]
        picks = even_indices(len(cells), COLS)
        if key == 'dead' and len(cells) >= 3:
            # 素材的 Dead 尾帧是"倒地后消散/下沉"，内容几乎空了。照原样采样会让角色
            # 倒地后凭空消失（看起来像 bug），所以先剔掉这些尾帧再均匀取 6 帧，
            # 让动画停在"躺平"而不是"消失"。
            hs = []
            for c in cells:
                bb = c.getchannel('A').getbbox()
                hs.append((bb[3] - bb[1]) if bb else 0)
            hmax = max(hs) or 1
            keep = [i for i, h in enumerate(hs) if h >= hmax * 0.28]
            if len(keep) >= 2:
                picks = [keep[round(i * (len(keep) - 1) / (COLS - 1))] for i in range(COLS)]
        for col in range(COLS):
            cell_img = cells[max(0, min(picks[col], len(cells) - 1))]
            small = cell_img.resize((CELL_DST, CELL_DST), Image.NEAREST)
            sheet.alpha_composite(shift_x(small, dx), (col * CELL_DST, row * CELL_DST))
    return sheet, counts, dx


def main():
    check_only = '--check' in sys.argv
    man = json.load(open(MANIFEST, encoding='utf-8'))
    packs = man.get('packs', [])

    jobs, fatal, warns_all = [], [], []
    seen_n = {}
    for pk in packs:
        print('###### %s  (%s)' % (pk.get('name', pk.get('id')), pk.get('dir')))
        pd = os.path.join(SUCAI, pk['dir'])
        if not os.path.isdir(pd):
            fatal.append('素材包目录不存在：sucai/%s' % pk['dir'])
            print('      目录不存在，跳过')
            continue
        for h in pk['heroes']:
            tag = '%s %s' % (h.get('label'), h.get('nick', ''))
            if h['n'] in seen_n:
                fatal.append('编号 %d 重复（%s 与 %s）' % (h['n'], seen_n[h['n']], tag))
            seen_n[h['n']] = tag
            folder = os.path.join(pd, h['folder'])
            info, errs, warns = probe(folder, pk.get('cell'))
            print('  %s' % tag)
            for key, fn, cn, need in ACTS:
                d = (info or {}).get(key)
                if d:
                    print('      %-5s %2d帧  缩放后内容高 %3d px  底边差 %d'
                          % (cn, d['n'], d['content_h'], d['bot_spread']))
                else:
                    print('      %-5s --' % cn)
            for w in warns:
                print('      WARN  %s' % w); warns_all.append('%s: %s' % (tag, w))
            for e in errs:
                print('      ERR   %s' % e); fatal.append('%s: %s' % (tag, e))
            if info:
                jobs.append((pk, h, folder, info))

    print()
    if fatal:
        print('校验未通过，拒绝出图（修好素材或改 hero_packs.json 后重跑）：')
        for f in fatal:
            print('  ✗ %s' % f)
        sys.exit(1)
    if warns_all:
        print('有 %d 条警告（不阻断）：' % len(warns_all))
        for w in warns_all:
            print('  ! %s' % w)
    print('校验通过：%d 个角色待集成' % len(jobs))
    if check_only:
        print('--check：未写任何文件')
        return

    if not (os.path.exists(BK_PNG) and os.path.exists(BK_JSON)):
        sys.exit('缺少基础图集 chars_base.png/.json，无法重建')

    base = Image.open(BK_PNG).convert('RGBA')
    rect = json.load(open(BK_JSON, encoding='utf-8'))
    rows = (len(jobs) + ROW_W - 1) // ROW_W
    sheeth = len(ACTS) * CELL_DST
    out = Image.new('RGBA', (base.width, base.height + rows * sheeth), (0, 0, 0, 0))
    out.alpha_composite(base, (0, 0))

    heroes = list(man.get('builtin', []))
    print()
    for i, (pk, h, folder, info) in enumerate(jobs):
        r, c = divmod(i, ROW_W)
        x, y = c * COLS * CELL_DST, base.height + r * sheeth
        sheet, counts, dx = build_sheet(folder, pk.get('cell', 128))
        out.alpha_composite(sheet, (x, y))
        key = '%s_%d.png' % (pk.get('prefix', pk['id']), h['n'])
        rect[key] = [x, y, COLS * CELL_DST, sheeth]
        heroes.append({'n': h['n'], 'file': key, 'label': h.get('label', str(h['n'])),
                       'nick': h.get('nick'), 'side': True, 'pack': pk.get('id')})
        trace = ' '.join('%s=%d' % (k, counts[k]) for k, _f, _c, _n in ACTS)
        print('  + %-14s dx=%+d  %s' % (key, dx, trace))

    out.save(OUT_PNG, optimize=True)
    json.dump(rect, open(OUT_JSON, 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    json.dump({
        'acts': [k for k, _f, _c, _n in ACTS],
        'heroes': heroes,
        'packs': [{'id': pk.get('id'), 'name': pk.get('name'), 'license': pk.get('license')}
                  for pk in packs]
    }, open(OUT_HEROES, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    size = os.path.getsize(OUT_PNG)
    print()
    print('图集 %s  %.1fKB  角色表 %d 张（含基础 %d）'
          % (out.size, size / 1024, len(rect), len(man.get('builtin', []))))
    print('heroes.json 共 %d 个可切换外形' % len(heroes))
    print('LOAD_PLAN weight 应填: chars=%d' % round(size / 1024))


if __name__ == '__main__':
    main()
