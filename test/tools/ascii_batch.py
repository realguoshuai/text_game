# -*- coding: utf-8 -*-
"""批量 ASCII 渲染：python ascii_batch.py <maxw> <文件名...>"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("ap", os.path.join(HERE, "ascii_piece.py"))
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)

maxw = int(sys.argv[1])
for f in sys.argv[2:]:
    ap.show(f, maxw=maxw)
