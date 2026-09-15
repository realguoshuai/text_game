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
| 转换参数 | `--walk-layer=background --skip-layer=collision --solid-layer=collision --block-tileset=water` |
| 转出来的 | `assets/flare_atlas.webp` 689KB / `flare_map.json` 124KB / 1370 物件 / 583 可行走格 |
| 出生点 | (19,19)，由导入器自动挑（四邻皆可走、离图心最近） |

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

## ★ 外来图的四个"静默杀手"（2026-09-15 补，都不是报错，是悄悄不能用）

接入外来图和接入自己生成的图最大的区别：**自己生成的图我全都知道长什么样，
别人的图我什么都不知道**。下面这四类问题不抛异常、不白屏，截图看起来也"有画面"，
但玩起来是坏的。`import_tmx.py` 现在把前三个都自动处理了，第四个要人工看一眼。

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
`arrival.tmx` 里命中的**只有那 1 张石台**（`gnd=917 / solid=453 / big=1`）。

> 误判的代价是把整排崖壁/树整体上移 N 格，比留个缺口严重得多，所以判别从严。

### 验收：`?autotest=importmap`

新加的接入验收自测，把上面几条量化成 `#probe`，跑批里一眼能看出是哪一类坏：

```
node tools/_one.js "map=<id>&autotest=importmap" 30000
```

```json
{"map":"flare_arrival","w":36,"h":38,"obj":1370,"gnd":917,"solid":453,"big":1,
 "walk":583,"voidCells":785,"voidColor":"#000000",
 "spawnDeclared":"19,19","spawnOnWalkable":true,"atSpawn":true,
 "targetFound":true,"clickAccepted":true,"reached":true,"moved":true}
```

`big` = 被认成复合瓦的物件数；`atSpawn` = 玩家真的站在声明的出生点（说明整条链没被 snap 走）；
`reached` = 点了一格远处的可走格后确实走到了（**这条不过 = 图不能玩**）。
正式用例已进 `tools/headless_check.js`（「外来地图 远航之岸」）。

---

## 拿新图的完整流程（备忘）

1. 量尺寸：看 `.tmx` 的 `<map width= height=>`（或跑 `sucai/_dl/_flare_scan.py`）
2. 下 `.tmx` → `sucai/_dl/flare/tiled/<mod>/`，把 `../tilesheets/*.png` 放到
   `sucai/_dl/flare/tiled/tilesheets/` —— **必须保持相对层级**（tmx 里写的是 `../tilesheets/xxx.png`）
3. 导入：
   `python tools/import_tmx.py <tmx> --id=<id> --name=<中文名> --prefix=<前缀> --walk-layer=background --skip-layer=collision --solid-layer=collision --block-tileset=water`
   - `--solid-layer=collision`：Flare 的 collision 层**语义相反**（有瓦 = 不可走），且不能画出来
   - `--block-tileset=water`：把整个 water tileset 判为不可走（collision 层没盖全时会漏水）
   - 出生点、虚空底色、复合瓦锚点都是自动的，看它打印的「出生点 / 虚空底色」两行确认
4. 离线核对几何：`python tools/render_map_json.py <前缀> 0.4 _r_<前缀>.png`（秒级）
5. 挂载：`tools/attach_imported.py` 的 `WANT` 加上 `<前缀>_map.json`，跑一遍
   （别手写 maps.json：`'k'` 与 `homeFromMap` 都由它带进去）
6. 引擎：`js/game.js` 的 `LOAD_PLAN` push 图集两项 + `ATLAS` 声明加一项 +
   `boot()` 里按引用取值（`piece()` 已是通用查表，不用改）
7. 版本号：升 `maps.json?v=`、`index.html` 的 `game.js?v=`，LOAD_PLAN 权重按真实 KB 改
8. 验收：`node tools/_one.js "map=<id>&autotest=importmap" 30000` 先单条看 `#probe`，
   再 `node tools/headless_check.js` 跑全套

> **截图别用「离线渲染就够了」当借口**：`render_map_json.py` 只验几何，
> 看不出出生点掉水、走不动、虚空底色这些"引擎侧"的问题。
> 无头实机截图在弱机上是**秒级**的（`--virtual-time-budget=20000` 约 2~3 秒出图）——
> 如果截图跑了好几分钟，先怀疑 `?warm=N` 这类要塞几百帧全量仿真的自测参数，
> 以及上一轮 Chrome 没退干净在抢 profile 锁，别急着下"图太大渲染不动"的结论。
