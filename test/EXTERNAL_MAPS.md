# 外来地图来源与授权

这里的「外来地图」指的是**别人画/摆好、我们原样拿进来用**的等距地图，
由 `tools/import_tmx.py` 从 Tiled 工程（.tmx）直接转成游戏格式，
不是 `tools/gen_map.js` 那类程序化生成的图。

转换链：`.tmx` →（import_tmx.py）→ `assets/<prefix>/`（缩放后的散瓦）
→ `assets/<prefix>_atlas.{webp,json}`（图集，运行时真正加载的）
+ `assets/<prefix>_map.json`（地图条目）→（attach_imported.py）→ `maps.json`

> `assets/<prefix>/` 是中间物，不入库（见 .gitignore）；运行时只吃图集。
> 要重跑，得先按下面的链接把 `.tmx` 和它的 tileset 图放回 `sucai/_dl/`。

---

## 1. `kenney_hall` 玄石回廊 — 7×7

| | |
|---|---|
| 出处 | Kenney《Isometric Miniature Dungeon》包内附的官方 Tiled 样例 |
| 素材页 | https://kenney.nl/assets/isometric-miniature-dungeon |
| 授权 | **CC0 1.0**（公共领域：可商用、可改、免署名） |
| 原文件 | `Samples/Tiled Sample/` 下的 `.tmx` + `.tsx` + tileset 图 |
| 转出来的 | `assets/imported_atlas.webp` 22KB / `imported_map.json` |

内容是一间带弧形石墙、台阶、栅栏的小石殿（19 个实体件 + 32 格地砖）。
调色是 Kenney 原版的橙 + 米白，**刻意没做调色** —— 拿来当「原样引进」的对照样本。

## 2. `grasstest` 草地水池 — 25×25

| | |
|---|---|
| 出处 | Tiled 官方示例 `isometric_grass_and_water.tmx` |
| 原作者 | **Clint Bellanger** |
| 素材页 | https://opengameart.org/content/grass-and-water-tiles |
| 授权 | **CC-BY 3.0** —— ⚠️ **可商用、可改，但必须署名原作者** |
| 原文件 | https://github.com/mapeditor/tiled （examples/tiled 下的 `isometric_grass_and_water.*`） |
| 转出来的 | `assets/gr_iso_atlas.webp` 102KB / `gr_iso_map.json` |

25×25 的整块草地 + 若干有机形状的水塘，**水岸是作者手画的 24 张过渡块**
（这套图的价值全在这里）。导入时用 `--block 22,23` 把水格标成不可走，
可行走 558 格 / 52 格水面。

**署名要求**：CC-BY 3.0 要求在使用处署名。本仓库的署名即本文件
（以及 `gr_iso_map.json` 的 `note` 字段）。若将来对外发布游戏，
需要在游戏内或发布页保留「Grass and Water tiles — Clint Bellanger, CC-BY 3.0」。

---

## ⚠️ 一个反直觉的结论

「去网上找别人做好的等距地图，直接拿下来」这条路，**现成的完整关卡基本不存在**。
逐一验证过（2026-09-15）：

| 看过的 | 实际是什么 |
|---|---|
| Kenney Isometric 系列 4 个包（dungeon / library / city / blocks） | 全是**成套瓦片**，没有关卡 |
| Kenney `Samples/Tiled Sample` | 60×7 的演示长条，用来展示单张瓦片，不是能玩的地图 |
| OGA「400 Isometric Town Tiles」(SBS, CC0) | 瓦片目录，带手绘的材质过渡块 |
| Tiled 官方 `isometric_grass_and_water.tmx` | 25×25 的技术演示图（本仓库已引进） |
| **Flare**（开源 ARPG，素材最全的一个） | `tiled/` 下只有 `grassland_template.tmx` 一个**模板**；真正的 60+ 张关卡是它自家 `.txt` 格式（`mods/empyrean_campaign/maps/*.txt`），不是 Tiled |

所以免费圈子里真正富矿的是**两样东西**：
1. **成套瓦片**（Kenney / SBS）—— 用来盖自己的图；
2. **作者手画的过渡块 / autotile 集**（Clint 的水岸、SBS 的 Grass↔Sand autotile）
   —— 这才是「地面不像一格一格拼的」的正解。

拿来的完整图反而普遍偏"素"：`grasstest` 地形过渡远好过自生成图，但它是**纯地形**，
没有建筑、没有道具、没有 NPC —— 当底图可以，当"一个地方"还得自己往上摆东西。
