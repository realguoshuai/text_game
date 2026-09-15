# 仙岛寻踪 · 素材引用清单

> `test/` 这版游戏到底引用了哪些素材、从哪来、授权是什么、哪些文件是死重。
> 运行时清单**不是读代码猜的**，是拿本地 `http.server` 的访问日志对出来的（浏览器真实请求了什么）。
> 复查工具：`node test/tools/asset_audit.js`（引用 × 存在 × git 入库 三方对齐）。

---

## 一、运行时真正加载的（11 个文件，合计 2.26MB，全部已入库）

线上只要这 11 个文件在，游戏就是完整的。逐个核过 git 跟踪状态，无遗漏。

| # | 路径 | 体积 | 用途 | 缓存版本 |
|---|---|---|---|---|
| 1 | `test/index.html` | 13KB | 页面骨架、HUD、触屏/横屏样式 | — |
| 2 | `test/js/game.js` | 112KB | 引擎（地图、战斗、怪物 AI、手机适配） | — |
| 3 | `test/assets/maps.json` | 62KB | 4 张地图：`qingxuan` 青玄山门 / `lingquan` 灵泉灵瀑 / `beilin` 碑林石阵 / `dungeon` 幽冥地宫（Kenney 地牢素材测试） | `?v=1` |
| 4 | `test/assets/tiles_atlas.webp` | 121KB | 地图瓦片与物件图集（`deco_*` / `prop_*` / `building_*`） | `?v=1` |
| 5 | `test/assets/tiles_atlas.json` | 2KB | 瓦片图集索引 `{rect}` | `?v=1` |
| 6 | `test/assets/chars_atlas.webp` | 183KB | 主角 11 套外形图集 | `?v=3` |
| 7 | `test/assets/chars_atlas.json` | <1KB | 主角帧索引 | `?v=3` |
| 8 | `test/assets/heroes.json` | 2KB | 主角外形清单 + 素材包授权 | `?v=1` |
| 9 | `test/assets/foes_atlas.webp` | 680KB | 怪物图集（9 只：牛魔×2 / 游方×3 / 蛇妖×2 / 铠甲卫 / 小僵尸），由 PNG 转有损 q90 | `?v=1` |
| 10 | `test/assets/foes_atlas.json` | 10KB | 怪物帧索引（每只每个动作的帧矩形） | `?v=2` |
| 11 | `test/assets/beasts.json` | 11KB | 怪物属性 / 刷怪格 / 动作帧率 | `?v=1` |

加载顺序与进度权重写在 `game.js` 的 `LOAD_PLAN` 里（第 252 行）。

**改素材后要做两件事**：
1. 把对应行的 `?v=N` 加一（否则玩家浏览器吃旧缓存，你自己本地刷新也未必看得出来）；
2. 把 `weight` 改成文件实际 KB 数 —— 这些权重是进度条分母，不跟着改会出现"在下大图、进度条却几乎不动"的假卡。**本次已同步**（`foes_atlas.png` 从 883 涨到 1167 却没同步，另一个是 `maps.json` 标 4KB 实际 62KB）。

> 历史坑：`tiles_atlas.png` / `maps.json` 原本**没有**版本号，换图后没法做缓存失效。本次一并补上 `?v=1`。

### 1.1 新增：幽冥地宫（Kenney 等距微缩地牢）

第四张地图 `dungeon` 使用了 **Kenney Isometric Mini Dungeon**（CC0）素材。为了保持实验性接入的灵活性，这些素材未打入 `tiles_atlas`，而是作为独立 PNG 由 `game.js` 的 `piece()` 回退加载，并在 `LOAD_PLAN` 中预加载。

| 路径 | 体积 | 用途 |
|---|---|---|
| `test/assets/dungeon/stoneTile_N.png` 等 15 张 | 约 130KB 合计 | 地宫地面、石墙、拱门、柱子、木桶、宝箱、桌椅、木桥 |

授权：`ImmortalGame/地形包/等距微缩地牢/License.txt` —— CC0，可商用，建议署名 Kenney。

---

## 二、代码里出现、但不是文件路径的名字（6 个，无需处理）

`game.js` 的 `HEROES` 表里这几个是 **`chars_atlas.json` 里的帧键**，并不是独立文件：

```
vamp_31.png  vamp_32.png  vamp_33.png     ninja_41.png  ninja_42.png  ninja_43.png
```

它们的像素在 `chars_atlas.png` 里，靠 `chars_atlas.json` 的 rect 定位。
`node test/tools/asset_audit.js` 早先会把这 6 个报成"文件缺失"，已加规则排除（名字能在 `assets/*.json` 里找到的一律当帧键）。

---

## 三、非运行时、但必须留在版本控制里

| 路径 | 体积 | 为什么不能删 |
|---|---|---|
| `test/assets/chars_base.png` / `.json` | 249KB | 主角图集**基线**。`build_chars_atlas.py` 每次从它重拼 `chars_atlas.png`，删了新外形就再也拼不回来 |
| `test/tools/foes_base.png` / `.json` | 1043KB | 怪物图集基线，同上（`build_beasts_atlas.py` 幂等重建的起点） |
| `test/assets/char_hero.png` + `npc_5/10/14/18/20.png` | 6 个 / 249KB | 单个动作表（384×320），是 `build_atlas.py` 生成 `chars_base.png` 的**输入**。同时这 6 个名字还被 `maps.json` 的 NPC 当帧键用（`char: 'npc_18'`），所以运行时日志里看不到它们，但它们非留不可 |
| `test/tools/hero_packs.json` | 3KB | 主角包登记表 |
| `test/tools/beast_packs.json` | 8KB | 怪物包登记表（`_spec` 里写了 sheet/frames 两种形态的规矩） |
| `test/assets/CREDITS.txt` | 1KB | 随包发布的出处与授权说明 |

> ⚠ 判据提醒：**"访问日志里没被请求" ≠ "可以删"**。日志只能证明哪些文件是运行时依赖，
> 上面这些是构建链路的输入，删了当时看不出问题，下次重建图集才会炸。本次差点把这 6 个误判成死文件。

---

## 四、磁盘上占地方但运行时用不到

**已入库、属仓库冗余（6.5MB）**

- `test/assets/sliced/` — 57 个 / 6.5MB，`tiles_atlas.png` 的切片工作目录。运行时只用合并后的 atlas，这 6.5MB 对线上毫无贡献，只是把仓库撑大。
- `test/assets/char_hero.png` + `npc_5/10/14/18/20.png` — 6 个 / 249KB，单文件版主角图，已被 `chars_atlas.png` 取代。**死文件**，日志里从不被请求。

**未入库、属中间产物（约 48MB，只占本地磁盘）**

- `test/assets/sliced_s1` ~ `sliced_s4` — 234 个 / 47.8MB，四张 AI 场景大图的切片产物。
- `test/assets/foes/` — 13 个 / 139KB，旧版散图，已被 `foes_atlas.png` 取代。
- `test/assets/sliced/_overview_labeled.png` / `_pieces_contact.png` — 切片审阅图。

这些被 `.gitignore` 挡在版本控制外是**对的**，不用管。

---

## 五、素材包出处与授权

统一授权（各包内 `License.txt` / `Licens.txt` 全部指向同一个地址）：

> **CraftPix Freebie** — <https://craftpix.net/file-licenses/>
> 可商用、可修改、可随游戏分发、无需署名；**禁止再分发素材源文件**；**禁止用于 AI 训练**。

| 登记 id | 本地来源目录 | 单位 | 形态 | 具体包 |
|---|---|---|---|---|
| `craftpix-vampire` | `sucai/craftpix-net-506778-free-vampire-pixel-art-sprite-sheets` | 31 / 32 / 33 血族 | sheet | CraftPix 免费吸血鬼包，素材 id **506778** |
| `craftpix-shinobi` | `sucai/craftpix-net-453698-free-shinobi-sprites-pixel-art` | 41 格斗家 / 42 武士 / 43 忍者 | sheet | CraftPix 免费忍者包，素材 id **453698** |
| `craftpix-minotaur` | `sucai/怪物` | 牛魔·褐角 / 灰角 | sheet | CraftPix Minotaur |
| `craftpix-humanoid` | `sucai/人形怪` | 游方刀客 / 弓手 / 统领(精英) | sheet | CraftPix Samurai |
| `craftpix-gorgon` | `sucai/蛇妖` | 蛇妖·碧鳞 / 紫鳞 | sheet | CraftPix Gorgon |
| `craftpix-knight` | `sucai/人形铠甲怪` | 铠甲卫 | sheet | CraftPix Knight |
| `craftpix-zombie` | `sucai/小僵尸/PNG` | 小僵尸 | **frames**（逐帧独立 PNG） | CraftPix Zombie |

**来源标识现状（值得补记）**

- 两个角色包保留了原始下载目录名，`506778` / `453698` 就是 CraftPix 的素材 id，需要回查产品页时用这个 id 在 `craftpix.net/freebies` 检索。
- 五个怪物包目录名已被改成中文，包内只剩通用的 `License.txt`，**原始产品页链接已丢失**。目前不影响使用（授权口径一致），但如果以后要写署名声明或核对授权范围，会缺一个凭证。
- 建议：以后往 `sucai/` 丢新包时**保留原始下载目录名**，或在登记表的 `license` 字段里直接写上产品页 URL。

**地图素材**：`tiles_atlas.png` 由 AI 生成（Gemini）的等距场景大图经 `tools/slice_sheet.py` 连通域切图得到，原始大图归档在 `sucai/`（不入库）。

**另有两处素材不在 `test/` 这条线上**：

- `sucai/` 下的 Gemini 场景大图（主殿遗迹、院落建筑等）—— `immortal-game/` 那条线在用。
- 仓库根的 `人物角色/`（6 个题材角色包，162 文件 / 12.2MB）—— 未接入任何游戏，也未入库。

---

## 六、以后新增/替换素材的检查清单

1. 素材包丢进 `sucai/`，**目录名保留原始下载名**（别改名，见上面"产品页链接已丢失"）。
2. 在 `test/tools/hero_packs.json` 或 `beast_packs.json` 里补一条登记（`_spec` 写了各字段含义）。
3. 跑对应构建器：主角 `add_craftpix_heroes.py` / 怪物 `build_beasts_atlas.py`。
4. 把 `game.js` 的 `LOAD_PLAN` 里对应 `?v=` 加一、`weight` 改成实际 KB。
5. `node test/tools/asset_audit.js` —— 看引用全部命中、运行时文件均已入库。
6. `node test/tools/headless_check.js` —— 18 个用例回归。
7. 最后拿服务访问日志核一次**真实请求**（浏览器请求过什么，才算数）。
