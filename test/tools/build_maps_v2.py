# -*- coding: utf-8 -*-
"""
v2 拼装器：把地图从"稀疏平地"改成"聚落式密排"。
相对 v1 的关键修正：
  1) 占地（fw/fh）按精灵实际像素宽反推 —— v1 给 120px 宽的殿堂标 fw=6，一个精灵吃掉 18 格实心，
     这才是"地图空"的真正原因。现在 120px≈1 格。
  2) 引入 solid:false 贴花（草丛/小石/云）→ 不挡路，可大面积铺满视觉留白。
  3) 聚落式布局：主殿/塔/市集/竹林/松林/石阵/水岸 分区成组放置，不再是散点。
  4) 新增可达性校验（BFS）：任何传送门/落点从本图入口必须走得到，防止物件堵路。
ground: '.'草地 ','苔草 '#'石板 ';'青石 '~'水 '-'深水 ' '虚空
"""
import os, json, random
from collections import deque

ROOT = r"C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/immortal-isles"
SLICED = os.path.join(ROOT, "assets", "sliced")
man = json.load(open(os.path.join(SLICED, "manifest.json"), encoding="utf-8"))
HAVE = {m["file"] for m in man["pieces"]}

TILE = {
    ".": "building_015_119x75.png",   # 草地
    ",": "building_012_120x77.png",   # 苔草
    "#": "building_014_119x77.png",   # 石板
    ";": "building_018_115x73.png",   # 青石
    "~": "building_017_118x75.png",   # 水
    "-": "building_016_119x76.png",   # 深水
}
WALKABLE = ".,#;"
WATER = "~-"

# ---- 角色化图块（fw/fh 按像素宽 / 120 反推，避免过度占地）----
MAIN_HALL = "building_006_120x168.png"    # 蓝顶主殿
TOWER     = "building_005_111x161.png"    # 高塔
PAGODA_S  = "building_009_73x133.png"     # 小塔
STELA     = "building_003_179x212.png"    # 巨碑（宽，占2格）
BIGTREE   = "building_004_168x198.png"    # 大树丛（宽，占2格）
PINE      = "building_007_141x136.png"    # 松
TREE      = "building_010_120x106.png"    # 树
BAMBOO    = "building_008_94x149.png"     # 竹
PINEROCK  = "building_013_77x122.png"     # 松石
ROCKS = ["prop_011_109x108.png", "prop_020_86x102.png", "prop_023_73x105.png", "prop_026_53x77.png"]
ROCK_S = ["prop_035_37x74.png", "prop_039_23x64.png", "prop_040_22x63.png"]
PILLAR = "prop_038_21x90.png"             # 栏柱
LANTERN = ["prop_036_30x64.png", "prop_035_37x74.png"]
BANNER = "prop_031_33x102.png"            # 幡旗
POLES = ["prop_028_37x95.png", "prop_043_17x60.png"]
MIDPROP = ["prop_019_91x98.png", "prop_022_88x88.png", "prop_027_91x55.png",
           "prop_029_77x66.png", "prop_032_61x62.png", "prop_033_66x61.png"]
FLATPROP = ["prop_024_78x58.png", "prop_030_80x59.png", "prop_025_77x58.png", "prop_042_45x35.png"]
DECALS = ["deco_034_44x43.png", "deco_037_42x28.png", "deco_041_28x39.png", "deco_046_25x23.png",
          "deco_048_12x43.png", "deco_049_36x17.png", "deco_050_20x21.png"]
CLOUDS = ["prop_044_95x40.png", "prop_045_88x41.png", "prop_047_67x39.png", "prop_051_50x26.png"]


class Map:
    def __init__(self, mid, name, w, h, seed, note=""):
        self.id, self.name, self.w, self.h = mid, name, w, h
        self.rng = random.Random(seed)
        self.note = note
        self.g = [[" "] * w for _ in range(h)]
        self.objs = []
        self.solid_cells = set()
        self.decal_cells = set()
        self.path_cells = set()
        self.reserved = set()
        self.portals = []
        self.spawn = None

    # ---------- 地形 ----------
    def island(self, cx, cy, rx, ry, ch=".", wobble=0.10):
        for y in range(self.h):
            for x in range(self.w):
                dx, dy = (x - cx) / rx, (y - cy) / ry
                r = (dx * dx + dy * dy) ** 0.5
                th = __import__("math").atan2(dy, dx)
                edge = 1.0 + wobble * __import__("math").sin(3 * th + 1.2) \
                            + 0.06 * __import__("math").sin(7 * th + 2.7)
                if r <= edge:
                    self.g[y][x] = ch
        return self

    def rect(self, x0, y0, x1, y1, ch, mark_path=False):
        for y in range(max(0, y0), min(self.h - 1, y1) + 1):
            for x in range(max(0, x0), min(self.w - 1, x1) + 1):
                if self.g[y][x] != " ":
                    self.g[y][x] = ch
                    if mark_path:
                        self.path_cells.add((x, y))
        return self

    def disc(self, cx, cy, r, ch, only_land=True):
        for y in range(self.h):
            for x in range(self.w):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                    if (not only_land) or self.g[y][x] != " ":
                        self.g[y][x] = ch
        return self

    def blob(self, cx, cy, r, ch, n=1):
        for _ in range(n):
            ox = self.rng.randint(-r, r)
            oy = self.rng.randint(-r, r)
            self.disc(cx + ox, cy + oy, self.rng.randint(2, max(2, r)), ch)
        return self

    def road(self, pts, ch="#", width=0, mark=True):
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            steps = max(abs(x1 - x0), abs(y1 - y0))
            for s in range(steps + 1):
                t = s / max(1, steps)
                x = int(round(x0 + (x1 - x0) * t))
                y = int(round(y0 + (y1 - y0) * t))
                for dx in range(-width, width + 1):
                    for dy in range(-width, width + 1):
                        if abs(dx) + abs(dy) <= width:
                            if 0 <= y + dy < self.h and 0 <= x + dx < self.w and self.g[y + dy][x + dx] != " ":
                                self.g[y + dy][x + dx] = ch
                                if mark:
                                    self.path_cells.add((x + dx, y + dy))
        return self

    # ---------- 物件 ----------
    def put(self, piece, x, y, fw=1, fh=1, solid=True, s=None):
        if not (0 <= x < self.w and 0 <= y < self.h):
            return False
        cells = [(x + dx, y + dy) for dy in range(fh) for dx in range(fw)]
        for c in cells:
            if c[0] >= self.w or c[1] >= self.h:
                return False
            if solid and (c in self.solid_cells or c in self.reserved):
                return False
            if (not solid) and (c in self.solid_cells or c in self.decal_cells):
                return False
        o = dict(piece=piece, x=x, y=y, fw=fw, fh=fh)
        if not solid:
            o["solid"] = False
        if s:
            o["s"] = s
        self.objs.append(o)
        if solid:
            self.solid_cells.update(cells)
        else:
            self.decal_cells.update(cells)
        return True

    def line_of(self, piece, pts, gap=1, solid=True, s=None):
        """沿路点列按间隔摆放（栏柱/灯笼），自动跳过被占格"""
        import math
        n = 0
        for i in range(len(pts) - 1):
            (x0, y0), (x1, y1) = pts[i], pts[i + 1]
            steps = max(abs(x1 - x0), abs(y1 - y0))
            for k in range(0, steps + 1, gap + 1):
                t = k / max(1, steps)
                x = int(round(x0 + (x1 - x0) * t))
                y = int(round(y0 + (y1 - y0) * t))
                if self.g[y][x] in (" ", "~", "-"):
                    continue
                if self.put(piece, x, y, 1, 1, solid, s):
                    n += 1
        return n

    def scatter(self, prob=0.30, solid_prob=0.0, avoid_path=True, pool=None):
        """在可走但空着的格子上撒贴花，填满视觉留白"""
        pool = pool or DECALS
        n_s = n_d = 0
        cells = [(x, y) for y in range(self.h) for x in range(self.w)]
        self.rng.shuffle(cells)
        for (x, y) in cells:
            if self.g[y][x] not in WALKABLE:
                continue
            if (x, y) in self.solid_cells or (x, y) in self.decal_cells or (x, y) in self.reserved:
                continue
            if avoid_path and (x, y) in self.path_cells:
                continue
            if self.rng.random() > prob:
                continue
            # 贴花：四邻不能有实心件，避免"长在墙上"
            if any((x + dx, y + dy) in self.solid_cells for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                continue
            if solid_prob > 0 and self.rng.random() < solid_prob:
                if self.put(self.rng.choice(ROCK_S), x, y, 1, 1, True):
                    n_s += 1
            else:
                if self.put(self.rng.choice(pool), x, y, 1, 1, False):
                    n_d += 1
        return n_s, n_d

    def clouds(self, n=8):
        rim = [(x, y) for y in range(self.h) for x in range(self.w)
               if self.g[y][x] != " " and any(
                   0 <= x + dx < self.w and 0 <= y + dy < self.h and self.g[y + dy][x + dx] == " "
                   for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2)))]
        self.rng.shuffle(rim)
        cnt = 0
        for (x, y) in rim:
            if cnt >= n:
                break
            if self.put(self.rng.choice(CLOUDS), x, y, 1, 1, False):
                cnt += 1
        return cnt

    def add_portal(self, x, y, to, spawnX, spawnY, label):
        self.portals.append(dict(x=x, y=y, to=to, spawnX=spawnX, spawnY=spawnY, label=label))
        return self

    # ---------- 吸附与可达性 ----------
    def walkable_cells(self):
        return {(x, y) for y in range(self.h) for x in range(self.w)
                if self.g[y][x] in WALKABLE and (x, y) not in self.solid_cells}

    def reach_from(self, sx, sy):
        if self.g[sy][sx] not in WALKABLE or (sx, sy) in self.solid_cells:
            return set()
        q = deque([(sx, sy)]); vis = {(sx, sy)}
        while q:
            x, y = q.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < self.w and 0 <= ny < self.h and (nx, ny) not in vis \
                        and self.g[ny][nx] in WALKABLE and (nx, ny) not in self.solid_cells:
                    vis.add((nx, ny)); q.append((nx, ny))
        return vis

    @staticmethod
    def _nearest(cands, ax, ay, ban=()):
        best, bd = None, 1e18
        for (x, y) in cands:
            if (x, y) in ban:
                continue
            d = (x - ax) ** 2 + (y - ay) ** 2
            if d < bd:
                bd, best = d, (x, y)
        return best

    def snap_spawn(self):
        """入口/落点若落在虚空或实心上，就近吸附到可走格"""
        pool = self.walkable_cells()
        if not pool:
            return
        if self.spawn not in pool:
            self.spawn = self._nearest(pool, self.spawn[0], self.spawn[1])
        for dx in range(-1, 2):
            for dy in range(-1, 2):
                self.reserved.add((self.spawn[0] + dx, self.spawn[1] + dy))

    def snap_portals(self):
        """传送门吸附到「从入口可达」的空格，并预留周边"""
        reach = self.reach_from(*self.spawn)
        for p in self.portals:
            cur = (p["x"], p["y"])
            if cur not in reach:
                nx = self._nearest(reach, p["x"], p["y"], ban=self.reserved)
                if nx is None:
                    continue
                p["x"], p["y"] = nx
            for dx in range(-1, 2):
                for dy in range(-1, 2):
                    self.reserved.add((p["x"] + dx, p["y"] + dy))

    def out(self):
        return dict(id=self.id, name=self.name, w=self.w, h=self.h,
                    ground=["".join(r) for r in self.g], objects=self.objs,
                    portals=self.portals, spawn=dict(x=self.spawn[0], y=self.spawn[1]),
                    note=self.note)


# ================= 地图 1：青玄山门（宗门主岛）=================
m1 = Map("qingxuan", "青玄山门", 34, 34, 101, "宗门主岛：主殿、双塔、市集幡旗、松竹环岛")
m1.island(17, 17, 15.2, 15.2)
m1.blob(6, 6, 4, ",", 3).blob(29, 27, 4, ",", 3).blob(28, 6, 3, ",", 2)
m1.road([(17, 3), (17, 30)], "#", 1)
m1.road([(17, 21), (5, 21), (4, 12)], ";", 0)
m1.road([(17, 21), (29, 21), (30, 12)], ";", 0)
m1.rect(14, 19, 20, 24, "#", mark_path=True)          # 山门广场
m1.disc(7, 28, 4, "~"); m1.disc(7, 28, 2, "-")        # 侧池
m1.disc(28, 28, 3, "~"); m1.disc(28, 28, 1, "-")
# 主殿群
m1.put(MAIN_HALL, 17, 4)
m1.put(PAGODA_S, 13, 5); m1.put(PAGODA_S, 21, 5)
m1.put(PILLAR, 14, 7, 1, 1); m1.put(PILLAR, 20, 7, 1, 1)
m1.put(LANTERN[0], 15, 8); m1.put(LANTERN[1], 19, 8)
m1.put(BANNER, 12, 8); m1.put(BANNER, 22, 8)
m1.put(STELA, 17, 12, 2, 1)                            # 中庭巨碑
m1.put(PILLAR, 15, 12); m1.put(PILLAR, 21, 12)
# 双塔
m1.put(TOWER, 9, 16); m1.put(TOWER, 25, 16)
m1.put(TREE, 7, 19); m1.put(TREE, 27, 19)
# 市集（广场两侧幡旗 + 灯笼成排）
m1.put(BANNER, 14, 25); m1.put(BANNER, 20, 25)
m1.put(BANNER, 14, 22); m1.put(BANNER, 20, 22)
m1.line_of(LANTERN[0], [(15, 26), (15, 30)], 2)
m1.line_of(LANTERN[1], [(19, 26), (19, 30)], 2)
m1.put(FLATPROP[0], 16, 26, 1, 1, False)
m1.put(FLATPROP[1], 18, 27, 1, 1, False)
m1.put(MIDPROP[0], 11, 24, 1, 1); m1.put(MIDPROP[1], 23, 24, 1, 1)
m1.put(MIDPROP[2], 11, 30, 1, 1); m1.put(MIDPROP[3], 23, 30, 1, 1)
# 松林 / 竹林
for (x, y) in [(4, 8), (6, 6), (3, 11), (7, 10), (5, 13)]:
    m1.put(PINE, x, y)
for (x, y) in [(29, 8), (31, 10), (28, 12), (30, 6)]:
    m1.put(BAMBOO, x, y)
    m1.put(PINEROCK, 31, 26)
# 石景
for (x, y) in [(12, 13), (23, 13), (26, 30), (8, 32), (31, 20)]:
    m1.put(m1.rng.choice(ROCKS), x, y)
m1.add_portal(17, 32, "lingquan", 10, 4, "灵泉灵瀑")
m1.add_portal(32, 17, "beilin", 4, 14, "碑林石阵")
m1.spawn = (17, 27)
m1.rect(16, 26, 18, 28, "#", mark_path=True)
m1.clouds(9)
m1.scatter(prob=0.34, solid_prob=0.12)

# ================= 地图 2：灵泉灵瀑（水岸）=================
m2 = Map("lingquan", "灵泉灵瀑", 32, 32, 202, "灵泉湖泊：竹海、松林、水岸栈桥、瀑布石阶")
m2.island(16, 16, 14.3, 14.3)
m2.blob(25, 6, 4, ",", 3).blob(6, 26, 4, ",", 3)
m2.disc(19, 15, 6, "~"); m2.disc(19, 15, 3, "-")      # 灵泉
m2.road([(10, 29), (10, 9), (15, 6)], "#", 1)
m2.road([(19, 9), (19, 24), (26, 27)], ";", 0)
m2.road([(10, 20), (4, 20)], ";", 0)
# 水岸栈桥（栏柱沿泉边）
m2.line_of(PILLAR, [(13, 14), (13, 20)], 1)
m2.line_of(PILLAR, [(15, 22), (23, 22)], 1)
m2.put(PINE, 8, 7); m2.put(PINE, 6, 9); m2.put(PINE, 11, 4)
m2.put(MIDPROP[1], 13, 11, 1, 1)                       # 泉心石台
m2.put(LANTERN[0], 14, 9); m2.put(LANTERN[1], 12, 15)
m2.put(LANTERN[0], 12, 21); m2.put(LANTERN[1], 14, 24)
# 竹海
for (x, y) in [(4, 12), (6, 14), (3, 16), (7, 18), (5, 20), (3, 22), (8, 24), (5, 25),
               (27, 10), (29, 12), (26, 14), (28, 16), (30, 6), (25, 5)]:
    m2.put(BAMBOO, x, y)
for (x, y) in [(25, 20), (28, 22), (26, 25), (9, 27), (7, 29), (13, 28)]:
    m2.put(m2.rng.choice(ROCKS), x, y, 1, 1)
m2.put(TREE, 21, 25); m2.put(TREE, 24, 27); m2.put(PINEROCK, 15, 27)
m2.put(TOWER, 26, 4)
m2.put(PAGODA_S, 3, 6)
m2.put(BANNER, 9, 27); m2.put(BANNER, 11, 27)
m2.put(MIDPROP[2], 22, 20, 1, 1); m2.put(MIDPROP[3], 21, 28, 1, 1)
m2.put(FLATPROP[2], 18, 25, 1, 1, False); m2.put(FLATPROP[3], 20, 23, 1, 1, False)
m2.add_portal(10, 30, "qingxuan", 17, 30, "青玄山门")
m2.add_portal(29, 24, "beilin", 4, 14, "碑林石阵")
m2.spawn = (10, 26)
m2.rect(9, 25, 11, 28, "#", mark_path=True)
m2.clouds(9)
m2.scatter(prob=0.34, solid_prob=0.12)

# ================= 地图 3：碑林石阵（石阵）=================
m3 = Map("beilin", "碑林石阵", 30, 30, 303, "碑林：巨碑、栏柱方阵、古松、石台")
m3.island(15, 15, 13.2, 13.2, "#")
m3.blob(5, 5, 3, ",", 2).blob(25, 24, 3, ",", 2).blob(24, 5, 3, ",", 2)
m3.road([(15, 2), (15, 27)], ";", 1)
m3.road([(3, 15), (27, 15)], ";", 1)
m3.rect(12, 11, 18, 17, ";", mark_path=True)           # 中央祭坛
m3.put(STELA, 14, 8, 2, 1)                             # 巨碑
m3.put(PILLAR, 12, 8); m3.put(PILLAR, 17, 8)
# 栏柱方阵（碑林本体）
for gy in (10, 13, 16, 19):
    for gx in (5, 8, 11, 19, 22, 25):
        m3.put(PILLAR, gx, gy + (1 if (gx + gy) % 3 == 0 else 0))
for gy in (22, 25):
    for gx in (7, 11, 15, 19, 23):
        m3.put(PILLAR, gx, gy)
m3.put(PAGODA_S, 25, 2); m3.put(PAGODA_S, 4, 2)
m3.put(TOWER, 27, 12); m3.put(TOWER, 2, 20)
m3.put(PINE, 3, 25); m3.put(PINE, 26, 26); m3.put(PINE, 6, 11)
m3.put(PINEROCK, 25, 20); m3.put(TREE, 20, 25)
m3.put(LANTERN[0], 13, 18); m3.put(LANTERN[1], 17, 18)
m3.put(LANTERN[0], 13, 6); m3.put(LANTERN[1], 17, 6)
m3.put(MIDPROP[0], 6, 22, 1, 1); m3.put(MIDPROP[2], 22, 22, 1, 1)
m3.put(FLATPROP[0], 15, 20, 1, 1, False); m3.put(FLATPROP[1], 14, 22, 1, 1, False)
for (x, y) in [(10, 6), (20, 6), (10, 27), (20, 27), (28, 22)]:
    m3.put(m3.rng.choice(ROCKS), x, y, 1, 1)
m3.add_portal(3, 15, "qingxuan", 30, 17, "青玄山门")
m3.add_portal(27, 23, "lingquan", 27, 24, "灵泉灵瀑")
m3.spawn = (15, 24)
m3.rect(14, 23, 16, 26, ";", mark_path=True)
m3.clouds(8)
m3.scatter(prob=0.30, solid_prob=0.14)

maps = [m1, m2, m3]

# ---- 吸附：入口先落位，传送门再吸附到「从入口可达」的格子 ----
for m in maps:
    m.snap_spawn()
for m in maps:
    m.snap_portals()
# ---- 跨图落点吸附：别人指过来的 spawn 必须落在本图可走格 ----
for t in maps:
    pool = t.walkable_cells()
    for m in maps:
        for p in m.portals:
            if p["to"] != t.id:
                continue
            c = (p["spawnX"], p["spawnY"])
            if c not in pool:
                nx = Map._nearest(pool, c[0], c[1])
                if nx:
                    p["spawnX"], p["spawnY"] = nx

# ================= 校验 =================
byid = {m.id: m for m in maps}
errs = []
for m in maps:
    for i, r in enumerate(m.g):
        if len(r) != m.w:
            errs.append(f"{m.id} row{i} len={len(r)} != {m.w}")

    # 物件合法性 + 重叠
    seen = {}
    for o in m.objs:
        if o["piece"] not in HAVE:
            errs.append(f"{m.id} missing piece {o['piece']}")
        for dy in range(o.get("fh", 1)):
            for dx in range(o.get("fw", 1)):
                c = (o["x"] + dx, o["y"] + dy)
                if not (0 <= c[0] < m.w and 0 <= c[1] < m.h):
                    errs.append(f"{m.id} object oob {o['piece']} {c}")
                    continue
                if o.get("solid", True):
                    if c in seen:
                        errs.append(f"{m.id} solid overlap at {c}: {o['piece']} / {seen[c]}")
                    seen[c] = o["piece"]

    # 可达性 BFS：入口必须能走到所有传送门
    def bfs(sx, sy):
        if m.g[sy][sx] not in WALKABLE or (sx, sy) in m.solid_cells:
            return set()
        q = deque([(sx, sy)])
        vis = {(sx, sy)}
        while q:
            x, y = q.popleft()
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if not (0 <= nx < m.w and 0 <= ny < m.h):
                    continue
                if (nx, ny) in vis:
                    continue
                if m.g[ny][nx] not in WALKABLE or (nx, ny) in m.solid_cells:
                    continue
                vis.add((nx, ny))
                q.append((nx, ny))
        return vis

    reach = bfs(*m.spawn)
    if not reach:
        errs.append(f"{m.id} spawn unreachable/solid {m.spawn}")
    for p in m.portals:
        c = (p["x"], p["y"])
        if m.g[p["y"]][p["x"]] not in WALKABLE:
            errs.append(f"{m.id} portal on non-walkable '{m.g[p['y']][p['x']]}' at {c}")
        if c in m.solid_cells:
            errs.append(f"{m.id} portal blocked by solid at {c}")
        if c not in reach:
            errs.append(f"{m.id} portal NOT reachable from spawn at {c}")
        if p["to"] not in byid:
            errs.append(f"{m.id} portal target missing {p['to']}")
            continue
    for p in m.portals:
        t = byid[p["to"]]
        c = (p["spawnX"], p["spawnY"])
        if not (0 <= c[0] < t.w and 0 <= c[1] < t.h):
            errs.append(f"{m.id}->{t.id} spawn oob {c}")
            continue
        if t.g[c[1]][c[0]] not in WALKABLE:
            errs.append(f"{m.id}->{t.id} spawn non-walkable '{t.g[c[1]][c[0]]}' at {c}")
        if c in t.solid_cells:
            errs.append(f"{m.id}->{t.id} spawn on solid at {c}")

out = dict(tileW=120, tileH=60, tilePalette=TILE, walkable=WALKABLE, water=WATER,
           start=dict(map="qingxuan", x=17, y=27), maps=[m.out() for m in maps])
json.dump(out, open(os.path.join(ROOT, "assets", "maps.json"), "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)

print("errors:", errs if errs else "none")
for m in maps:
    walk_cells = sum(1 for y in range(m.h) for x in range(m.w)
                     if m.g[y][x] in WALKABLE and (x, y) not in m.solid_cells)
    deco = sum(1 for o in m.objs if o.get("solid", True) is False)
    print(f"{m.id:9s} {m.name:5s} {m.w}x{m.h} 物件={len(m.objs):3d}（贴花{deco:3d}） "
          f"实心格={len(m.solid_cells):3d} 可走格={walk_cells:4d} 传送门={len(m.portals)}")
print("wrote assets/maps.json")
