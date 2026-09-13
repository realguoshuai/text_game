# -*- coding: utf-8 -*-
"""把 css/iso.css 与 js/iso.js 内联进 index.html，产出手机友好的单文件版。

背景：GitHub Pages 在国内访问不稳，手机端二次请求 js 常年 pending。
本脚本用「标记注释」定位旧内联块并整体替换，可反复运行（幂等）。

用法：
    python tools/build_index_inline.py          # 默认处理上级目录（ImmortalGame/ImmortalGame/）
    python tools/build_index_inline.py <dir>    # 显式指定目录
"""
import re
import sys
from pathlib import Path

here = Path(__file__).resolve().parent
root = Path(sys.argv[1]) if len(sys.argv) > 1 else here.parent

html_path = root / "index.html"
css_path = root / "css" / "iso.css"
js_path = root / "js" / "iso.js"

html = html_path.read_text(encoding="utf-8")
css = css_path.read_text(encoding="utf-8")
js = js_path.read_text(encoding="utf-8")

for name, body in (("css/iso.css", css), ("js/iso.js", js)):
    if "</script>" in body or "</style>" in body:
        raise SystemExit(f"ERROR: {name} 内含 </script> 或 </style>，直接内联会截断 HTML，先改写源文件。")

CSS_MARK = "/* ===== 内联自 css/iso.css"
JS_MARK = "/* ===== 内联自 js/iso.js"

# 幂等替换：<style> + 标记 ... </style>  /  <script> + 标记 ... </script>
html, n_css = re.subn(
    rf"(<style>\s*{re.escape(CSS_MARK)}).*?(</style>)",
    lambda m: m.group(1) + f"（源文件为准，改动后运行 tools/build_index_inline.py 同步） ===== */\n{css}\n" + m.group(2),
    html, flags=re.DOTALL)
html, n_js = re.subn(
    rf"(<script>\s*{re.escape(JS_MARK)}).*?(\n</script>)",
    lambda m: m.group(1) + f"（源文件为准，改动后运行 tools/build_index_inline.py 同步） ===== */\n{js}\n" + m.group(2),
    html, flags=re.DOTALL)

if n_css != 1 or n_js != 1:
    raise SystemExit(f"ERROR: 标记定位失败 css={n_css} js={n_js}，index.html 结构可能被改动，请人工检查。")

html_path.write_text(html, encoding="utf-8")
print(f"OK: inlined css({len(css)}B) + js({len(js)}B) -> {html_path} ({len(html)}B)")
