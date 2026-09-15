# 外来地图来源与授权

这里的「外来地图」指**别人画好/摆好、我们原样拿进来用**的等距地图，
由 `tools/import_tmx.py` 从 Tiled 工程（.tmx）直接转成游戏格式，
不是 `tools/gen_map.js` 那类程序化生成的图。

转换链：`.tmx` →（import_tmx.py）→ `assets/<prefix>/`（缩放后的散瓦）
→ `assets/<prefix>_atlas.{webp,json}`（图集，运行时真正加载的）
+ `assets/<prefix>_map.json`（地图条目）→（attach_imported.py）→ `maps.json`

> `assets/<prefix>/` 是中间物，不入库（见 .gitignore）；运行时只吃图集。
> 要重跑，得先按下面的链接把 `.tmx` 和 tileset 图放回 `sucai/_dl/`。

---

## ★ 尺寸这一关（2026-09-15 补，踩过的坑）

本游戏现有地图全是 **28~36 格见方**：青玄山门 34、灵泉灵瀑 32、碑林石阵 30、
幽冥地宫 28、碧霄灵谷 36。外来图**先量尺寸**，再谈别的。

最早拿的两张就是没过这一关：

| 拿来的 | 尺寸 | 为什么不能用 |
|---|---|---|
| `kenney_hall` 玄石回廊 | **7×7** | 差一个数量级，就是一间小石殿挂在虚空里 |
| `grasstest` 草地水池 | 25×25 | 尺寸勉强接近，但 625 个物件**全是地面瓦**，没建筑没道具没 NPC —— 是底图，不是"一个地方" |

**两张已下架**（见 `attach_imported.py` 的 `DROP` 列表；对应图集与地图 json 已从 git 移除）。
素材本身不差，其中 Clint 的手绘水岸将来可用于修 `bixiao` 的岸线 ——
源文件仍在 `sucai/_dl/`，随时可重新导入。

**拿图前先问三句**：① 多少格？② 和 28~36 是一个量级吗？③ 里面有东西吗（不只是地形）？

---

## 1. `flare_arrival` 远航之岸 — 36×38

| | |
|---|---|
| 出处 | **Flare**（开源 ARPG）战役开场关卡 `arrival` |
| 项目 | https://github.com/flareteam/flare-game |
| 原文件 | `tiled/empyrean_campaign/arrival.tmx` + `tiled/tilesheets/*.png` |
| 授权 | **CC-BY-SA 3.0** ⚠️ **见下方警告** |
| 授权文件 | 仓库根 `LICENSE.txt`（CC BY-SA 3.0 全文） |
| 规格 | 原图 40×40 格，导进去裁成 36×38；等距 192×96 → ×0.625 缩到引擎的 120×60 |
| 图层 | `background` 地面 / `object` 物件 / `collision` 碰撞标记 |
| 转换参数 | `--walk-layer=background --skip-layer=collision --solid-layer=collision --trust-collision --block-tileset=water` |
| 转化出来 | `assets/flare_arrival_map.json` 130KB / 1370 物件 / 586 可行走格（瓦并进公用图集，见 §2） |
| 出生点 | (19,19)，由导入器自动挑（四邻皆可走、离图心最近、优先陆地） |

内容是一整个**崖壁围合的山谷**：岩石崖壁有厚度（立方瓦做出立体感）、
草地有纹理变化、松树灌木自然散布、中间还有水塘。地形过渡和植被层次都是手摆的，
观感远超程序化生成的图。

### 授权警告（CC-BY-SA 3.0）

- **BY**：必须署名 —— 「Flare (flareteam/flare-game), CC-BY-SA 3.0」
- **SA（ShareAlike）**：**改编作品必须以相同许可发布**。

把素材嵌进游戏，游戏整体是否构成"改编作品"在法理上有争议，但**保守解读下，
游戏需要整体以 CC-BY-SA 3.0 发布**（等于允许他人自由再分发、甚至商用你的游戏）。

**结论**：自己玩、学习、内部看 —— 没问题。
**打算对外发布或商业化 —— 先换成 CC0 素材**（Kenney 全系 CC0），
或联系作者单独授权。别闷头用。

---

## 2. `flare_harbor` 殒落港湾 — 39×38

| | |
|---|---|
| 出处 | **Flare** 战役关卡 `perdition_harbor` |
| 原文件 | `tiled/empyrean_campaign/perdition_harbor.tmx`（瓦表与 arrival 是同一批） |
| 授权 | **CC-BY-SA 3.0** ⚠️ 同上 |
| 规格 | 原图 40×40 格，导进去裁成 39×38；等距 192×96 → ×0.625 |
| 转换参数 | 同 §1（含 `--trust-collision`），另加 **`--append`**（瓦并进 arrival 那套图集） |
| 转化出来 | `assets/flare_harbor_map.json` 129KB / 1329 物件 / 481 可行走格（全域连通） |
| 出生点 | (18,21)，同样是导入器自动挑的 |

内容是一处**有人居住的渔村小港**：两座木屋、两座木栈桥、圆石台、木栅栏、
齐整的花圃、水塘，以及崖壁围出来的半岛。与「远航之岸」的无人荒野正好互照 ——
同一位美术、同一套瓦，摆出来却是"聚落"而不是"野外"，观感重复度很低。

> 挑图时先看了 `perdition_harbor` 的原始统计：`background` 层有 389 格是水瓦，
> 一度以为"可走区只剩 90 格，太小"。**实测后是 438 格** —— 那 389 格里
> 有 348 格本来就带 `collision`，只有 41 格是"水但没标碰撞"。
> 教训：算可走区别只数"某一层有多少瓦"，要按 `有地面瓦 且 collision 为空` 算。
>
> ★ **那 41 格就是后来"桥上过不去"的病根** —— 它们是桥下的水，作者用"不画 collision"
> 留出的过道。修法见下方「静默杀手 ⑤」。修后 438 → **481 格、4 个连通块 → 1 个**。

---

## ★ 一套图集服务多张图（`--append`）

Flare 的瓦表是**整项目共用的大图**（`grassland.png` 被几十个 gid 共用），
所以第二张图九成的瓦和第一张重叠。再挂一整套图集 = 首屏白多下几百 KB。

用法：**第一张不带 `--append`（清空重建），之后每张都带。**

```bash
# 1) 第一张：重建图集目录
python tools/import_tmx.py <arrival.tmx> --prefix flare --id flare_arrival ...
# 2) 第二张起：把本图的瓦并进同一个目录
python tools/import_tmx.py <perdition_harbor.tmx> --prefix flare --id flare_harbor ... --append
```

结果：`assets/flare/` 188 张瓦（102 + 86 新增），`flare_atlas.webp` 910KB
—— 只多 86 张瓦（+205KB），而不是多一整套图集。

**⚠ 前提：瓦文件名必须带裁剪坐标。** 原先名字只取源图文件名（`grassland.png`），
靠"同名加序号"区分不同 gid，而序号取决于该次导入的 dict 迭代顺序 ——
两次导入必然错位，**后导入的瓦会静默覆盖先导入的瓦**：图集照常加载、不报错、
不白屏，但前一张图整片错乱。现在名字是 `grassland_0_384.png`
（源图名 + 裁剪左上角），同名 == 同一张瓦，追加才安全。

**改了命名规则就得把老图重新导一遍**（键名全变了），并重跑 `attach_imported.py`。

两张图的验收都在跑批里（`外来地图 远航之岸` + `外来地图 殒落港湾`），
**必须同时通过**才算图集没串。

---

## ★ 按需加载：大图集与外来地形都不进首屏（2026-09-15 晚）

加图加爽了会撞上一件事：**每加一张图，所有人的开屏都更慢一点**。
实测（改之前）：首屏串行加载 11 个文件共 **3.02MB**，其中 `flare_atlas.webp` 940KB
+ `dungeon_atlas.webp` 547KB —— 这两套只有切到对应地图才用得上，却让
「只想在山门走两步」的人先等 1.5MB。

改法（全在 `js/game.js`）：

| 机制 | 在哪 | 干什么 |
|---|---|---|
| `EXTRA` 表 | 文件顶部 | 声明「按需图集」：一套 = 图 + 索引两项，键名对齐 `ATLAS` 的键 |
| `expandPlan(data)` | boot 里、`maps.json` 到位那一刻 | `?map=` 直接指向该图 → 把它的图集与地形**推进首屏池**（进度条照走） |
| `preloadExtras()` | `ready` 之后 2.5 秒 | 空闲串行预取 —— 用户点按钮时通常已就绪；`?preload=0` 可关 |
| `goTo(id,…)` | 所有切图入口（按钮/传送门/调试 API） | 切图守卫：目标图资源没就绪就当场补载（屏幕下方小胶囊带百分比），就绪时零开销 |
| `initCore()` / `applyMapData()` | 同上 | 常量提前装；外置地形并回地图条目 |

地形也一并外置了：`maps.json` 里的外来图只剩**轻条目**
（id/name/note/w/h/spawn/home/voidColor/homeFromMap/atlas/src），
`ground`/`objects` 留在 `<id>_map.json`，`src` 后面挂**内容 md5 前 8 位**当版本号
（地形一改缓存键自动变，比手改 `?v=` 靠谱）。`attach_imported.py` 负责这个转换。
于是 `maps.json` 从 **329KB → 63KB**。

**结果：首屏 3.02MB → 1.19MB（-61%）。** `?map=dungeon` 这种"首屏就要进那张图"的情况
是 1.73MB（该载的照载）。

⚠️ **时序坑（踩过）**：`finishMap` 靠全局 `WALK` 判断可走、`nearWalkable` 靠它兜底找出生点。
原来这些常量在「全部加载结束」时才赋值，而按需地形可能**更早**到位 —— 于是整张图被算成
「全不可走」，出生点退化成 `{0,0}`，玩家被吸附到地图角落（实测落在 **5,2**，而不是施工方
挑的 19,19）。所以 `maps.json` 一到手就先 `initCore()` 装常量，再 `expandPlan()`。

验收三条（都在跑批里）：
- `首屏体积 不含大图集` —— 自带图首屏 1000~1400KB，且 dungeon/flare 都**未载**
- `首屏含目标图图集` —— `?map=dungeon` 必须 >1600KB 且 dungeon 已载
- `按需切图 外来图` / `按需切图 地宫` —— 首屏之后当场补载：图集到位、出生点站得住、提示收掉

---

## ⚠️ 修正：Flare 才是真富矿（早先的结论是错的）

2026-09-15 早些时候本文件写过「Flare 的 `tiled/` 下只有一个模板，真关卡是
它自家 `.txt` 格式，不是 Tiled」。**那个结论错了** —— 当时我只列了
`tiled/grassland/` 一个子目录就下了判断。

实际情况：`tiled/` 下有 **130+ 个 `.tmx`**，全是真关卡。

| 目录 | 数量 | 例子 |
|---|---|---|
| `tiled/empyrean_campaign/` | ~60 | `arrival` `perdition_harbor` `black_oak_city` `fort_amir` `lake_kuuma` |
| `tiled/iron_labyrinth/` | ~40 | `room1..room18` `treasure_room` `iron_labyrinth_f1..f3` |
| `tiled/alpha_demo/` | ~25 | `ancient_temple` `averguard_academy` `cave1` `white_wind` |
| `tiled/{cave,dungeon,ruins,snowplains}/` | — | 各题材模板 + ruleset |

**全部是 `orientation=isometric` + `tilewidth/tileheight = 192/96`（2:1）**，
与本引擎 `TILE_W/TILE_H = 120/60` 完全同构，`import_tmx.py` 直接能吃
（`--tile 120` 即缩放 ×0.625）。

题材覆盖草地 / 洞窟 / 地牢 / 遗迹 / 雪山，另带 `2x2` 大物件图集（树、建筑）。

**尺寸速查**（拿图时按需挑；脚本 `sucai/_dl/_flare_scan.py` 可批量量）：

| 格数 | 关卡 |
|---|---|
| 28×28 | `iron_labyrinth/room1`、`warp_room` |
| 32×32 | `ruins/ruins_template` |
| 36~40 | **`empyrean_campaign/arrival`（已引入）**、`perdition_harbor`、`hyperspace` |
| 48×48 | `goblin_cave` |
| 60×60 | `salted_field`、`goblin_camp` |
| 64×64 | `frontier_outpost`、`river_encampment`、`warp_zone` |
| 80×80+ | `nazia_highlands`、`fort_amir`、`black_oak_city`、`stormrock_ruins` |

> 早先对 Kenney / SBS / Tiled 官方的结论仍然成立：免费圈里**成套瓦片**和
> **作者手绘的过渡块 / autotile** 是好东西，但**完整关卡去 Flare 拿**。

### 关于 Flare 的图集坐标（踩坑记录）

Flare 的瓦片有两套坐标，**别用错**：

- `tiled/tilesheets/*.png` + `.tmx` 里的内联 tileset —— **网格排布，自洽**
  （图片尺寸 = `columns × tilewidth` × `rows × tileheight`，内容贴在格子底部）。
  **`import_tmx.py` 用的是这套**。
- `mods/*/tilesetdefs/*.txt` 里的 `tile=<gid>,<srcX>,<srcY>,<w>,<h>,<offX>,<offY>`
  —— 指到 Flare **打包后**的图（`images/tilesets/*.png`，排布与上面那张不同），
  Flare 引擎运行时才用它。gid=16 在网格里是 `(0,0)`、在 tilesetdef 里却是
  `(1061,2698)`，**两者不通用**。

判断网格自洽的办法：用 alpha 通道做行/列投影，内容带应整齐地落在每格底部
（本仓库 `sucai/_dl/_flare_bands.py` 就是干这个的）。

---

## ★ 外来图的五个"静默杀手"（2026-09-15 补，都不是报错，是悄悄不能用）

接入外来图和接入自己生成的图最大的区别：**自己生成的图我全都知道长什么样，
别人的图我什么都不知道**。下面这五类问题不抛异常、不白屏，截图看起来也"有画面"，
但玩起来是坏的。前四个 `import_tmx.py` 现在都自动处理了；第五个（桥）要靠
`--trust-collision` 参数打开 —— **参数漏了就是那个毛病**（所以它写进了标准命令行）。
第⑥节不是杀手，是给你肉眼扫一遍的探针。

### ① 整张图走不动 —— `maps.json` 的 `walkable` 少了 `'k'`

导入器用 `'k'` 当「隐形可走」（`PAL` 不登记 → 引擎不画，但算能走）。
`walkable` 字符串里没有 `'k'` 的话，整张图表面正常、鼠标点了不动、WASD 无反应。
`attach_imported.py` 会自动把 `'k'` 并进去，**别手写 maps.json**。

### ② 出生点掉进水里 / 虚空

导入器早先硬编码 `spawn = (W//2, H-1)`（图心中间、最下一行）—— 对"整幅铺满"的图没问题，
但外来图的可走区常是**岛 / 半岛 / 环形**，那一格大概率是水或虚空。
表现是玩家一进来就卡死不动。

现在改成：**优先"四邻皆可走"的格（远离崖边、BFS 不会一开局就贴墙），同档里取离图心最近的**，
并写入 `home` + 打上 `homeFromMap: true`。
引擎侧（`game.js` 加载 `MAPS` 处）看到 `homeFromMap` 且该格确实合法就直接采用；
没有这个标记的图（游戏自带的 5 张）仍走原来的 `nearWalkable()`（离图心最近的可走格）——
**所以这个改动对既有地图零影响**。

`--spawn x,y` 可手工指定（非法会直接报错退出，不会静默生效）。

### ③ 缝隙露出白色破洞 —— 忘了带"虚空底色"

Flare 的草原图美术前提是**悬崖下方一片深谷**：崖壁瓦自己就画着黑色谷底，
而地图四周和内部空隙是**没有瓦**的。本引擎的默认背景是浅蓝天，
于是那些空隙变成一块块刺眼的白洞（最开始那两张 `kenney_hall` / `grasstest` 也一样）。

修法：读来源 `.tmx` 的 `backgroundcolor`（Flare 的 arrival 声明了 `#000000`），
写进地图条目的 `voidColor`；引擎 `drawSky()` 见到 `voidColor` 就整幅填它（不画云）。
来源图没声明就照旧走天空渐变。

### ④ ★ Tiled 的"复合瓦"锚点 —— 会露黑缺口（这条最隐蔽）

Tiled 允许瓦片尺寸**大于网格**。Flare 的 `tiled_grassland_2x2` 就是一张
**384×192 = 2×2 格**的圆石台，在 `arrival.tmx` 里放在 (16,19)。

这类瓦 Tiled 按**左下锚点**摆放：盖住 `x..x+N-1` 与 `y-(M-1)..y`。
当 1×1 画会整体偏半格，把旁边**"本来就是要给它盖住、所以源图里留空"**的格子露出来 ——
`arrival.tmx` 的源格 (16,18)/(17,18) 三层全空（`bg=0 ob=0 co=0`），
就是因为被石台盖着。锚点错 → 草地上出现一个 2 格的黑缺口。

判别条件是**两道一起过**（单看尺寸会误伤"高槽位放高精灵"的瓦）：

| 条件 | 作用 |
|---|---|
| 声明尺寸横竖都 >1 格 | 排除 `water`（192×192 = 1×2，宽度不跨格） |
| 内容真把声明框填满 ≥95% | 排除 `trees`（声明 384×768 但内容只占 0.44 高）、`grassland`（只占 0.25 高）、`tall structures`（0.38~0.56） |

两道都过才按 `fw = tw/TW`、`fh = th/TH` 设 `fw/fh`，并把 `y` 上移 `fh-1`。
`arrival.tmx` 里命中的**只有那 1 张石台**（`gnd=917 / big=1`）。

> 误判的代价是把整排崖壁/树整体上移 N 格，比留个缺口严重得多，所以判别从严。

### ⑤ ★ 看着是路却走不动（桥）—— 图层语义搞反了（这条坑最深）

**症状**：木栈桥画得好好的、和海面分得清清楚楚，人却站在桥头过不去，点桥对面也不动。
更迷惑的是它**不是全图走不动**——陆地能走，只是被水隔成互不相通的两三块，
所以看起来像"寻路算法坏了"，其实是地图数据把桥判死了。

**根因有两层，缺一不可**：

1. **Flare 的图层语义和直觉相反**：真正挡路的是 `collision` 层（树/墙/崖壁，
   `arrival.tmx` 里 453 个 collision 标记全落在这些物件上）；而 `object` 层**只是美术**
   —— 桥、斜坡、矮草、圆石台全在里面，**本来就该走上去**。
   旧导入器把 object 层一律 `solid=True`，等于让玩家绕着桥走。
2. **桥下的水面格没有 collision 标记**（作者用"不画 collision"来留过道），
   而旧参数 `--block-tileset=water` 一刀切把所有 water tileset 的格子判死 →
   **桥面整段落水**。`perdition_harbor` 实测 41 个这样的格，`arrival` 只 1 个
   —— 所以港湾坏得最明显。

**修法**：导入时加 `--trust-collision`。

| 参数 | 语义 |
|---|---|
| `--trust-collision` | collision 层说了算：**object 层一律 `solid=False`**，某格有背景瓦且 collision 为空 = 可走（不再按 tileset 判死） |
| `--block-tileset=water` | 与上者同用时降级为"**只用于剪枝时当水面**"，不再直接判死格子 |

配套还做了两件收尾（都属于"顺手把死区清掉"）：

- **孤立水面 / 孤格落成虚空**：既没地面瓦、又和主可走区不连通的水面格，
  以及四周都不通的单格，直接剪掉 —— 否则它们会在地图上留一圈"能站但走不到"的假路。
- **出生点第三顺位**：同样"四邻可走"时优先陆地（`tset_of` 记住每格背景瓦属于哪个 tileset，
  是 water 就往后排），避免出生点落在桥上。

**效果**（`flare_harbor` 39×38）：

| | 可走格 | 连通块 | 出生点 |
|---|---|---|---|
| 修前 | 438 | **4 块**（桥断） | 18,21 |
| 修后 | **481** | **1 块**（全域连通） | 18,21 |

**验收：`?autotest=crossing`** —— 这条专治"看着有路走不到"，断言的是**性质**不是坐标：

```
{"map":"flare_harbor","walk":481,"reach":481,"isolated":0,
 "far":"4,4","farDist":35,"arrived":true,"clickAccepted":true}
```

`walk` = `walkable()` 认了的格数；`reach` = 从玩家脚下 BFS 真的走得到的格数；
**`isolated` = 两者之差，必须为 0** —— 不为 0 就是那些"看着能站、点上去不动"的格子。
`farDist` 是最远那一格的距离，`arrived` = 真的从出生点走到了那里（跨桥）。
正式用例已进 `headless_check.js`（「外来地图 港湾跨桥连通」/「彼岸全域连通」两张图各一条）。

**换新图时的自查**（离线、秒级，不用开浏览器）：

```
python tools/walk_audit.py <地图 id>                 # 连通块分析：碎成几块、孤立格几个
python tools/walk_audit.py <地图 id> --overlay _w.png   # 叠色图：绿=能走 橙=有地但被挡 红=无地面瓦
```

### ⑥ 肉眼自查：右上角缩略图就是这类问题的探针

`?autotest=minimap` 之外，缩略图平时就是排查外来图最省事的工具：
底图 1 像素 1 格，绿=能走 / 深灰=挡路 / 蓝=水 / 透明=虚空，
桥、断崖、断开的可走区**一眼就能看见**（断桥会在缩略图上呈现为一条明显的空白豁口）。
点缩略图任意一格即可寻路过去；点不可走的格会打红叉并提示"那边过不去"。

相关调试参数（都是 URL query）：

| 参数 | 作用 |
|---|---|
| `?mm=1` / `?mm=0` | 强制展开 / 收起缩略图。手机端默认收起，无头截图时点不了按钮，靠它核对展开态 |
| `?autotest=minimap` | 缩略图程序化验收：画布比例、四类格数、底图非空、主角标记落点、折叠来回切、点缩略图能否走 |
| `?autotest=crossing` | 「看着有路走不动」验收：可走区必须**全域连通**（`isolated == 0`），并真的跨桥走到最远格 |

两条都进了 `tools/headless_check.js` 跑批（共 32 条）。

### 验收：`?autotest=importmap`

新加的接入验收自测，把上面几条量化成 `#probe`，跑批里一眼能看出是哪一类坏：

```
node tools/probe.js "map=<id>&autotest=importmap"
```

```json
{"map":"flare_arrival","w":36,"h":38,"obj":1370,"gnd":917,"solid":0,"big":1,
 "walk":586,"voidCells":782,"voidColor":"#000000",
 "spawnDeclared":"18,19","spawnOnWalkable":true,"atSpawn":true,
 "targetFound":true,"clickAccepted":true,"reached":true,"moved":true}
```

`solid` = 挂在 object 层上的"被挡"格数。**用 `--trust-collision` 后应为 0**
（挡路的全在 collision 层，那部分落成虚空、不计入 `solid`）；这个数不是 0 就说明
object 层还在误挡（见「静默杀手 ⑤」）。
`walk` = 可走格数；`big` = 被认成复合瓦的物件数；`atSpawn` = 玩家真的站在声明的出生点
（说明整条链没被 snap 走）；`reached` = 点了一格远处的可走格后确实走到了（**这条不过 = 图不能玩**）。
正式用例已进 `tools/headless_check.js`（「外来地图 远航之岸」/「殒落港湾」/「港湾跨桥连通」）。

---

## 拿新图的完整流程（备忘）

1. 量尺寸：看 `.tmx` 的 `<map width= height=>`（或跑 `sucai/_dl/_flare_scan.py`）
2. 下 `.tmx` → `sucai/_dl/flare/tiled/<mod>/`，把 `../tilesheets/*.png` 放到
   `sucai/_dl/flare/tiled/tilesheets/` —— **必须保持相对层级**（tmx 里写的是 `../tilesheets/xxx.png`）
3. 导入（`--prefix` = 图集名，多张图共用一个；`--id` = 地图名）：
   - **第一张**（重建图集目录）：
     `python tools/import_tmx.py <tmx> --id=<id> --name=<中文名> --prefix=<前缀> --walk-layer=background --skip-layer=collision --solid-layer=collision --trust-collision --block-tileset=water`
   - **之后每张**：同上，末尾加 **`--append`**（瓦并进已有图集，见上文「一套图集服务多张图」）
   - `--solid-layer=collision`：Flare 的 collision 层**语义相反**（有瓦 = 不可走），且不能画出来
   - `--trust-collision`：**别漏**。collision 层说了算，object 层一律当美术（桥/斜坡/矮草本就要走上去）。
     漏了它 = 整张图的可走区被砍一圈，桥过不去（见「静默杀手 ⑤」）
   - `--block-tileset=water`：配合 `--trust-collision` 时只用于**剪枝**（判定哪些水格该落成虚空），
     不再直接判死格子 —— 否则桥下水面会把桥面一起判没
   - 出生点、虚空底色、复合瓦锚点都是自动的，看它打印的「出生点 / 虚空底色」两行确认
4. **离线核对可走性**（秒级，强烈建议）：`python tools/walk_audit.py <地图 id>`
   —— 直接给出**连通块数量**，必须是 `1`（多块 = 有地方看着能走其实走不到）。
   要肉眼看就加 `--overlay _w.png` 出一张叠色图（绿=能走 橙=有地但被挡 红=无地面瓦）。
5. 离线核对几何：`python tools/render_map_json.py <地图 id> 0.4 _r_<id>.png`（秒级；
   图集前缀脚本自己从地图档的 piece 名反推，不用手填）
6. 挂载：`tools/attach_imported.py` 的 `WANT` 加上 `<id>_map.json`，跑一遍
   （别手写 maps.json：`'k'`、`homeFromMap`、`atlas`、`src` 都由它带进去。
   它写的是**轻条目** —— 地形留在 `<id>_map.json` 里按需取，见上面「按需加载」那节）
7. 引擎：在 `js/game.js` 的 `EXTRA` 里声明这套新图集（照 `flare` 那条抄，键名对齐
   `ATLAS`），**不要** push 进 `LOAD_PLAN` —— 那等于让所有人首屏等它。
   若这张图和已有的图共用一套图集（导入时带了 `--append`），则什么都不用加。
8. 版本号：升 `index.html` 的 `game.js?v=`；`maps.json?v=` 也要升（内容变了）。
   图集 `?v=` 只在**图集内容**变了时才升；外来地形的版本号是自动的（内容 md5）。
9. 验收：`node tools/probe.js "map=<id>&autotest=importmap"` 先单条看 `#probe`，
   再 `node tools/probe.js "map=<id>&autotest=crossing"` 确认**全域连通**（`isolated` 必须 0），
   最后 `node tools/headless_check.js` 跑全套；改过加载链路就顺带跑
   `?autotest=bootstats` 与 `?autotest=lazygoto&goto=<id>` 确认首屏没变胖、按需能补上。

> **截图别用「离线渲染就够了」当借口**：`render_map_json.py` 只验几何，
> 看不出出生点掉水、走不动、虚空底色这些"引擎侧"的问题。
> 无头实机截图在弱机上是**秒级**的（`--virtual-time-budget=20000` 约 2~3 秒出图）——
> 如果截图跑了好几分钟，先怀疑 `?warm=N` 这类要塞几百帧全量仿真的自测参数，
> 以及上一轮 Chrome 没退干净在抢 profile 锁，别急着下"图太大渲染不动"的结论。
