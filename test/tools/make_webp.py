# -*- coding: utf-8 -*-
"""
make_webp.py —— 把图集 PNG 转成运行时真正加载的 webp

背景
    build_atlas.py / build_chars_atlas.py / build_beasts_atlas.py 都只产出 PNG，
    而引擎 LOAD_PLAN 里加载的是 .webp。这一步以前靠手工敲命令，很容易漏 ——
    漏掉的表现是「图集明明重建了、页面还是旧的」，排查起来很费时间。
    另外 PNG 体积不能代表线上体积：同一张图集 PNG 786KB 而 webp 只有 105KB。

用法
    python tools/make_webp.py                    # 转默认那几张图集
    python tools/make_webp.py tiles_atlas        # 只转指定的
    python tools/make_webp.py --quality 90 tiles_atlas
"""
import argparse
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(os.path.dirname(HERE), 'assets')
DEFAULT = ['tiles_atlas', 'chars_atlas', 'foes_atlas', 'dungeon_atlas']


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('names', nargs='*', default=DEFAULT,
                    help='图集名（不含扩展名），默认 %s' % ' '.join(DEFAULT))
    ap.add_argument('--quality', type=int, default=86)
    args = ap.parse_args()

    for n in args.names:
        src = os.path.join(ASSETS, n + '.png')
        if not os.path.exists(src):
            print('  跳过 %-16s（没有对应 png）' % n)
            continue
        dst = os.path.join(ASSETS, n + '.webp')
        im = Image.open(src)
        im.save(dst, 'WEBP', quality=args.quality, method=6)
        print('  %-16s %4dx%-5d %6.0f KB -> %5.0f KB' % (
            n, im.width, im.height, os.path.getsize(src) / 1024.0,
            os.path.getsize(dst) / 1024.0))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
