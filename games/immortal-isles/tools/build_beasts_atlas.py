#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_beasts_atlas.py —— 怪物包统一接入器（灵泉灵瀑刷怪用）

与 build_chars_atlas.py 的分工：
  角色包（64 格、行=动作）走 build_chars_atlas.py；
  怪物包（128 格、单行、每文件一个动作）走本脚本。

流程（先校验、后出图，任一条不过就拒绝出图）：
  1) 读 games/immortal-isles/tools/beast_packs.json 登记表
  2) probe()  逐包逐怪校验：格尺寸 / 宽整除 / 帧数 / 各帧内容底边是否都落在格底
  3) select() 按 caps 抽样帧（一次性动作保留首末帧）
  4) anchor() 以 idle 第 0 帧内容中心为锚点，全动作共用同一位移 —— 绝不逐帧裁框居中
  5) 打包：保留既有 foes_atlas 内容，把新怪追加在下方，输出
       games/immortal-isles/assets/foes_atlas.png           （{rect, anims} 结构，旧 rect 原样保留）
       games/immortal-isles/assets/beasts.json              （引擎读取：怪物属性 + 帧数 + 锚点 + 刷怪点）

用法：
  python games/immortal-isles/tools/build_beasts_atlas.py --check     # 只校验，不写文件
  python games/immortal-isles/tools/build_beasts_atlas.py             # 校验并出图
"""
import json
import glob
import math
import os
import sys
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # ImmortalGame/
TEST = os.path.join(ROOT, 'test')
MANIFEST = os.path.join(TEST, 'tools', 'beast_packs.json')
# ⚠ 增量重建的坑：早先直接在 foes_atlas.png 上叠加，脚本跑第二遍就把 9 只怪又贴了一遍
#   （图集从 2931 高涨到 5385）。现在固定从 tools/foes_base.* 这份「老妖兽原始图集」重建，
#   产出永远只等于 基线 + 登记表里的一批怪，跑多少遍结果都一样。
BASE_PNG = os.path.join(TEST, 'tools', 'foes_base.png')
BASE_JSON = os.path.join(TEST, 'tools', 'foes_base.json')
ATLAS_PNG = os.path.join(TEST, 'assets', 'foes_atlas.png')
ATLAS_JSON = os.path.join(TEST, 'assets', 'foes_atlas.json')
BEASTS_JSON = os.path.join(TEST, 'assets', 'beasts.json')
GUTTER = 2          # 帧间留白，避免最近邻取整时串色
MAXW = 2048         # 打包画布宽度上限
BUDGET_KB = 1400    # 图集体积上限（超出就报错，逼着回去砍帧数）

errors = []
warns = []
ONESHOT = {'atk', 'atk2', 'hurt', 'dead'}   # 一次性动作：抽样必保首末帧
OPTIONAL = {'run', 'atk2'}                  # 可选动作：缺了不算错，引擎有回退链


def fail(msg):
    errors.append(msg)


def warn(msg):
    warns.append(msg)


def probe_sheet(path, cell_w, cell_h):
    """返回 (frames, info)。frames = [(cell_img, content_bbox)]，bbox 为格内坐标。"""
    if not os.path.exists(path):
        return None, 'missing'
    im = Image.open(path).convert('RGBA')
    w, h = im.size
    if h != cell_h:
        return None, 'height %d != %d' % (h, cell_h)
    if w % cell_w:
        return None, 'width %d not divisible by cell %d' % (w, cell_w)
    n = w // cell_w
    frames = []
    bottoms = []
    for i in range(n):
        cell = im.crop((i * cell_w, 0, (i + 1) * cell_w, cell_h))
        bb = cell.split()[3].getbbox()
        if bb is None:
            frames.append((cell, None))
            continue
        frames.append((cell, bb))
        bottoms.append(bb[3])
    return (frames, bottoms), None


def sample_idx(n, cap, oneshot):
    """等距抽样：n 帧里留下最多 cap 帧；一次性动作必保首末帧。"""
    if n <= cap:
        return list(range(n))
    if oneshot:
        idx = [round(i * (n - 1) / (cap - 1)) for i in range(cap)]
    else:
        # 循环动作不取最后一帧（通常与第 0 帧重复），在 [0, n-1) 上均匀取
        idx = [round(i * (n - 1) / cap) for i in range(cap)]
    out = []
    for i in idx:
        if not out or out[-1] != i:
            out.append(i)
    return out


# ---------------- frames 模式（每帧一个独立 PNG、画布紧贴内容） ----------------

def natural_key(name):
    """Idle10.png 必须排在 Idle2.png 后面 —— 按数字段做自然排序。"""
    out, cur = [], ''
    for ch in name:
        if ch.isdigit():
            cur += ch
        else:
            if cur:
                out.append((1, int(cur)))
                cur = ''
            out.append((0, ch))
    if cur:
        out.append((1, int(cur)))
    return out


def probe_frames(dirpath, patterns):
    """收集一个动作的帧文件。返回 (frames, err)，frames = [(img, bbox)]。
    frames 模式下每张图的画布就是内容本身（导出时被紧裁），所以 bbox 恒等于整幅 ——
    帧与帧之间的相对位置已经丢失，锚点必须逐帧重建。"""
    files = []
    for pat in (patterns or []):
        hit = sorted(glob.glob(os.path.join(dirpath, pat)), key=lambda p: natural_key(os.path.basename(p)))
        if hit:
            files = hit
            break
    if not files:
        return None, '没有匹配 %s 的帧文件' % (patterns,)
    frames = []
    for p in files:
        im = Image.open(p).convert('RGBA')
        bb = im.split()[3].getbbox()
        if bb is None:
            return None, '%s 是空帧' % os.path.basename(p)
        frames.append((im, bb))
    return frames, None


def color_anchor_x(im, rgb, tol):
    """颜色地标的水平重心（如僵尸的上衣）。紧裁素材重建锚点用 ——
    比整体重心稳：整体重心会被伸手 / 踢腿 / 倒地这些画面拉到别处。"""
    W, H = im.size
    px = im.load()
    r0, g0, b0 = rgb
    xs = []
    for y in range(H):
        for x in range(W):
            r, g, b, a = px[x, y]
            if a > 200 and abs(r - r0) <= tol and abs(g - g0) <= tol and abs(b - b0) <= tol:
                xs.append(x)
    if len(xs) < 30:
        return None
    return sum(xs) / float(len(xs))


def mass_anchor_x(im, bb):
    """兜底锚点：内容整体重心的水平位置。"""
    W = im.size[0]
    px = im.load()
    xs = []
    for y in range(bb[1], bb[3]):
        for x in range(bb[0], bb[2]):
            if px[x, y][3] > 64:
                xs.append(x)
    return (sum(xs) / float(len(xs))) if xs else (bb[0] + bb[2]) / 2.0


def build():
    man = json.load(open(MANIFEST, encoding='utf-8'))
    acts_def = man['acts']
    caps_def = man['caps']
    fps = man['fps']
    CELL = 128

    monsters = []
    for pack in man['packs']:
        pdir = os.path.join(ROOT, pack['dir'])
        if not os.path.isdir(pdir):
            fail('[%s] 目录不存在: %s' % (pack['id'], pack['dir']))
            continue
        frames_mode = (pack.get('mode') == 'frames')
        caps = dict(caps_def)
        caps.update(pack.get('caps') or {})
        anchor_spec = pack.get('anchor') or {}
        for m in pack['monsters']:
            src = os.path.join(pdir, m['src'])
            if not os.path.isdir(src):
                fail('[%s] 怪物目录不存在: %s/%s' % (pack['id'], pack['dir'], m['src']))
                continue
            acts_map = dict(acts_def)
            acts_map.update(pack.get('acts') or {})
            acts_map.update(m.get('acts') or {})
            mcaps = dict(caps)
            mcaps.update(m.get('caps') or {})
            tag = '[%s/%s]' % (pack['id'], m['src'])
            mm = dict(m)
            mm['pack'] = pack['id']
            mm['dir'] = pack['dir']
            mm['license'] = pack.get('license', '')

            if frames_mode:
                res = build_frames(src, mm, acts_map, mcaps, anchor_spec, fps, tag)
            else:
                res = build_sheet(src, mm, acts_map, mcaps, fps, tag, CELL)
            if res is None:
                continue
            monsters.append(res)
    return monsters


def build_sheet(src, m, acts_map, caps, fps, tag, CELL):
    """sheet 模式：单行精灵表，每帧内容底边落在格底。"""
    picked = {}
    for act, cands in acts_map.items():
        f = None
        for c in cands:
            p = os.path.join(src, c)
            if os.path.exists(p):
                f = p
                break
        if not f:
            if act in OPTIONAL:
                continue          # 可选动作：引擎会回退
            fail('%s 缺少必要动作 %s（候选 %s）' % (tag, act, cands))
            continue
        r, err = probe_sheet(f, CELL, CELL)
        if err:
            fail('%s %s: %s' % (tag, os.path.basename(f), err))
            continue
        frames, bottoms = r
        if not frames:
            fail('%s %s 没有有效帧' % (tag, os.path.basename(f)))
            continue
        # 底边必须统一落在格底（脚底）；否则说明素材不是按格底对齐的，硬接会浮空/陷地
        off = [b for b in bottoms if b is not None]
        if off and (max(off) - min(off)) > 2:
            fail('%s %s 各帧内容底边不齐: %s' % (tag, os.path.basename(f), sorted(set(off))))
            continue
        if off and min(off) < CELL - 3:
            warn('%s %s 内容底边在 y=%d（未贴格底），按格底对齐会浮空' % (
                tag, os.path.basename(f), min(off)))
        one = act in ONESHOT
        idx = sample_idx(len(frames), caps[act], one)
        if act == 'dead':
            # 消散尾帧（内容高度骤降）剔掉，否则倒地最后会"凭空消失"
            hs = [frames[i][1][3] - frames[i][1][1] if frames[i][1] else 0 for i in idx]
            hmax = max(hs) if hs else 0
            idx = [i for i, h in zip(idx, hs) if h >= hmax * 0.28] or idx
        picked[act] = [frames[i] for i in idx]
        picked['_' + act + '_n'] = len(frames)
    if not picked.get('idle'):
        fail('%s 连 idle 都没有，跳过' % tag)
        return None

    # ---- 锚点：idle 第 0 帧内容中心 -> 格中心；全动作共用 ----
    idle_cell, idle_bb = picked['idle'][0]
    if idle_bb is None:
        fail('%s idle 第 0 帧是空帧' % tag)
        return None
    icx = (idle_bb[0] + idle_bb[2]) / 2.0
    T = CELL / 2.0 - icx
    # 取所有动作的并集包围盒（平移后），左边界可为负 -> 画布要往外扩
    L = min(bb[0] for a in picked if a in acts_map for _, bb in picked[a] if bb) + T
    R = max(bb[2] for a in picked if a in acts_map for _, bb in picked[a] if bb) + T
    Tp = min(bb[1] for a in picked if a in acts_map for _, bb in picked[a] if bb)
    Bp = max(bb[3] for a in picked if a in acts_map for _, bb in picked[a] if bb)
    box = [int(min(0, L) - 1), max(0, int(Tp) - 1), 0, 0]
    box[2] = int(max(CELL, R) + 2) - box[0]
    box[3] = min(CELL, int(Bp) + 1) - box[1]
    ax = (CELL / 2.0 - box[0]) / float(box[2])
    # 体型基准取 walk 的中位内容高（武器不会像 idle/attack 那样举过头顶，
    # 也不会像 dead 那样躺平）—— 用并集高当基准会把角色缩得过小。
    ref_act = 'walk' if picked.get('walk') else 'idle'
    hs = sorted(bb[3] - bb[1] for _, bb in picked[ref_act] if bb)
    body_h = hs[len(hs) // 2] if hs else (Bp - Tp)
    return finish(m, tag, picked, box, ax, body_h, acts_map, fps, Bp - Tp, icx)


def build_frames(src, m, acts_map, caps, anchor_spec, fps, tag):
    """frames 模式：逐帧独立 PNG，无格无锚点 —— 需要预缩放 + 逐帧重建锚点 + 统一装箱。"""
    raw = {}
    for act, pats in acts_map.items():
        fs, err = probe_frames(src, pats)
        if err:
            if act in OPTIONAL:
                continue
            fail('%s 缺少必要动作 %s（%s）' % (tag, act, err))
            continue
        one = act in ONESHOT
        idx = sample_idx(len(fs), caps[act], one)
        if act == 'dead':
            hs = [fs[i][1][3] - fs[i][1][1] for i in idx]
            hmax = max(hs) if hs else 0
            idx = [i for i, h in zip(idx, hs) if h >= hmax * 0.28] or idx
        raw[act] = [fs[i] for i in idx]
        raw['_' + act + '_n'] = len(fs)
    if not raw.get('idle'):
        fail('%s 连 idle 都没有，跳过' % tag)
        return None

    # ---- 预缩放：源图是 ~370px 高的矢量原画，游戏里只画 body 这么高；
    #      交给引擎的最近邻缩 4 倍会把轮廓缩碎，这里用 LANCZOS 一次缩到位，
    #      引擎端就变成接近 1:1 贴图（fh 会≈框高）。基准取 walk 的中位内容高。----
    ref_act = 'walk' if raw.get('walk') else 'idle'
    hs = sorted(bb[3] - bb[1] for _, bb in raw[ref_act])
    raw_body_h = hs[len(hs) // 2]
    k = float(m['body']) / raw_body_h
    for act in list(raw):
        if act.startswith('_'):
            continue
        out = []
        for im0, _ in raw[act]:
            w = max(1, int(round(im0.width * k)))
            h = max(1, int(round(im0.height * k)))
            im1 = im0.resize((w, h), Image.LANCZOS)
            out.append((im1, im1.split()[3].getbbox()))
        raw[act] = out

    # ---- 逐帧锚点：颜色地标优先，找不到就退回整体重心 ----
    for act in list(raw):
        if act.startswith('_'):
            continue
        anchors = []
        for im1, bb in raw[act]:
            ax_ = None
            if anchor_spec.get('rgb'):
                ax_ = color_anchor_x(im1, anchor_spec['rgb'], anchor_spec.get('tol', 40))
            anchors.append(ax_ if ax_ is not None else mass_anchor_x(im1, bb))
        raw['_' + act + '_ax'] = anchors

    # ---- 统一装箱：所有帧的锚点落到同一条输出 x 上，内容底边落到同一条底线 ----
    lo = min(raw[act][i][1][0] - raw['_' + act + '_ax'][i]
             for act in raw if not act.startswith('_') for i in range(len(raw[act])))
    hi = max(raw[act][i][1][2] - raw['_' + act + '_ax'][i]
             for act in raw if not act.startswith('_') for i in range(len(raw[act])))
    maxh = max(raw[act][i][1][3] - raw[act][i][1][1]
               for act in raw if not act.startswith('_') for i in range(len(raw[act])))
    box_w = int(math.ceil(hi - lo)) + 2
    box_h = maxh + 2
    A = 1 - lo                       # 锚点在输出箱内的固定 x
    picked = {}
    for act in list(raw):
        if act.startswith('_'):
            continue
        cells = []
        for i, (im1, bb) in enumerate(raw[act]):
            px = int(round(A - raw['_' + act + '_ax'][i]))
            py = int(round(box_h - 1 - bb[3]))
            px = max(0, min(box_w - im1.width, px))
            py = max(0, min(box_h - im1.height, py))
            cell = Image.new('RGBA', (box_w, box_h), (0, 0, 0, 0))
            cell.alpha_composite(im1, (px, py))
            cells.append((cell, (px, py, px + im1.width, py + im1.height)))
        picked[act] = cells
        picked['_' + act + '_n'] = raw['_' + act + '_n']
    hs2 = sorted(bb[3] - bb[1] for _, bb in picked[ref_act])
    body_h = hs2[len(hs2) // 2] if hs2 else box_h
    cx0 = picked['idle'][0][1]
    m['prescale'] = round(k, 4)
    m['prescaleSrc'] = raw_body_h
    return finish(m, tag, picked, [0, 0, box_w, box_h], A / float(box_w), body_h,
                  acts_map, fps, box_h, (cx0[0] + cx0[2]) / 2.0, frames_mode=True)


def finish(m, tag, picked, box, ax, body_h, acts_map, fps, content_h, content_cx, frames_mode=False):
    """两种模式汇合：算 fh、装配 monsters 条目。"""
    bh = box[3]
    fh = int(round(m['body'] * bh / float(body_h)))
    if fh > 400:
        warn('%s fh=%d 偏大（框高 %d / 基准高 %d），检查素材是否留了大片空白' % (tag, fh, bh, body_h))
    entry = {
        'pack': m.get('pack', ''), 'src': m['src'], 'key': m['key'], 'cn': m['cn'],
        'dir': m.get('dir', ''), 'license': m.get('license', ''),
        'fh': fh, 'bodyH': body_h, 'hp': m['hp'], 'atk': m['atk'], 'def': m['def'],
        'exp': m['exp'], 'stones': m['stones'], 'mv': m['mv'],
        'elite': bool(m.get('elite')), 'spawn': m.get('spawn'), 'aggro': m.get('aggro'),
        'srcFace': m.get('srcFace', 'right'), 'mode': 'frames' if frames_mode else 'sheet',
        'ax': round(ax, 4), 'box': list(box), 'contentH': content_h, 'contentCX': round(content_cx, 1),
        'acts': {a: len(picked[a]) for a in picked if not a.startswith('_')},
        'srcActs': {a[1:-2]: picked[a] for a in list(picked) if a.startswith('_') and a.endswith('_n')},
        'fps': {a: fps[a] for a in picked if not a.startswith('_')},
        '_frames': {a: picked[a] for a in picked if not a.startswith('_')},
    }
    if m.get('prescale'):
        entry['prescale'] = m['prescale']
        entry['prescaleSrc'] = m.get('prescaleSrc')
    return entry


def pack_atlas(monsters, check_only):
    old_img = Image.open(BASE_PNG).convert('RGBA')
    old_json = json.load(open(BASE_JSON, encoding='utf-8'))
    old_rect = old_json.get('rect', old_json)
    old_anims = old_json.get('anims', {}) or {}
    ow, oh = old_img.size

    canvas = Image.new('RGBA', (max(MAXW, ow), oh + 4000), (0, 0, 0, 0))
    canvas.alpha_composite(old_img, (0, 0))
    anims = dict(old_anims)
    cx, cy = 0, oh + 10
    row_h = 0
    limit = max(MAXW, ow)
    for m in monsters:
        block = {}
        for act, frames in m['_frames'].items():
            rects = []
            for cell, bb in frames:
                if cy + m['box'][3] > canvas.height:
                    new = Image.new('RGBA', (canvas.width, canvas.height + 2000), (0, 0, 0, 0))
                    new.alpha_composite(canvas, (0, 0))
                    canvas = new
                piece = cell.crop((m['box'][0], m['box'][1], m['box'][0] + m['box'][2], m['box'][1] + m['box'][3]))
                if piece.size != (m['box'][2], m['box'][3]):
                    # 画布外扩部分补透明：用一块透明底再贴上
                    pad = Image.new('RGBA', (m['box'][2], m['box'][3]), (0, 0, 0, 0))
                    pad.alpha_composite(piece, (max(0, -m['box'][0]), 0))
                    piece = pad
                if cx + piece.width > limit:
                    cx = 0
                    cy += row_h + GUTTER
                    row_h = 0
                canvas.alpha_composite(piece, (cx, cy))
                rects.append([cx, cy, piece.width, piece.height])
                cx += piece.width + GUTTER
                row_h = max(row_h, piece.height)
            block[act] = rects
        if cx > 0:
            cx = 0
            cy += row_h + GUTTER
            row_h = 0
        anims[m['key']] = {
            'cn': m['cn'], 'side': 1, 'ax': m['ax'], 'srcFace': m.get('srcFace', 'right'),
            'box': m['box'], 'acts': block, 'fps': m['fps'],
        }
    used_h = cy
    canvas = canvas.crop((0, 0, limit, used_h))
    return canvas, old_rect, anims


def main():
    check_only = '--check' in sys.argv
    monsters = build()
    if errors:
        print('✗ 校验未通过，拒绝出图：')
        for e in errors:
            print('   - ' + e)
        return 2
    for w in warns:
        print('! ' + w)

    print('校验通过：%d 只怪' % len(monsters))
    tot = 0
    for m in monsters:
        n = sum(len(v) for v in m['_frames'].values())
        tot += n
        extra = ''
        if m['mode'] == 'frames':
            extra = '  [frames 预缩 %s→%dpx ×%.3f]' % (m.get('prescaleSrc'), m['bodyH'], m.get('prescale') or 0)
        if m.get('srcFace') == 'left':
            extra += ' [原画朝左]'
        print('  %-10s %-6s 框%dx%d 体型基准%3dpx fh=%3d ax=%.3f%s  帧: %s' % (
            m['key'], m['cn'], m['box'][2], m['box'][3], m['bodyH'], m['fh'], m['ax'], extra,
            ' '.join('%s%d' % (a, len(v)) for a, v in m['_frames'].items())))
    print('  合计帧数 %d' % tot)

    canvas, old_rect, anims = pack_atlas(monsters, check_only)
    bw0, bh0 = Image.open(BASE_PNG).size
    print('  图集尺寸 %dx%d（基线 %dx%d）' % (canvas.width, canvas.height, bw0, bh0))
    tmp = os.path.join(TEST, '_beasts_atlas.tmp.png')
    canvas.save(tmp, optimize=True)
    kb = os.path.getsize(tmp) / 1024.0
    print('  PNG 体积 %.0f KB（上限 %d KB）' % (kb, BUDGET_KB))
    if check_only:
        os.remove(tmp)
        print('--check：未写入任何文件')
        return 0
    if kb > BUDGET_KB:
        os.remove(tmp)
        print('✗ 图集超预算，请回去调 beast_packs.json 的 caps（抽帧更狠）')
        return 3

    canvas.save(ATLAS_PNG, optimize=True)
    json.dump({'rect': old_rect, 'anims': anims}, open(ATLAS_JSON, 'w', encoding='utf-8'),
              ensure_ascii=False, separators=(',', ':'))
    beasts = {
        '_spec': '由 games/immortal-isles/tools/build_beasts_atlas.py 从 games/immortal-isles/tools/beast_packs.json 生成，勿手改。',
        'atlas': 'foes_atlas.png',
        'keys': [m['key'] for m in monsters],
        'monsters': [{k: v for k, v in m.items() if not k.startswith('_')} for m in monsters],
    }
    json.dump(beasts, open(BEASTS_JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('✓ 已写出 %s / %s / %s' % (
        os.path.relpath(ATLAS_PNG, ROOT), os.path.relpath(ATLAS_JSON, ROOT), os.path.relpath(BEASTS_JSON, ROOT)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
