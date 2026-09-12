# 凡人修仙录 · 坊市（网页版）

同一个仓库跑两个页面，都是纯原生 Canvas 2D + Vanilla JS，零依赖、零构建。

| 入口 | 线上地址 | 内容 |
|---|---|---|
| **等距坊市**（默认） | https://realguoshuai.github.io/text_game/ | 45° 等距视角坊市：点击移动、点击 NPC 对话、任务/小地图/时辰，无战斗 |
| **战斗版** | https://realguoshuai.github.io/text_game/battle/ | 俯视角坊市行 RPG：斩妖、突破境界、商店、存档 |
| **文字版** | https://realguoshuai.github.io/text_game/legacy/ | 最初的文字版《凡人修仙录》（境界/物品/剧情原始代码） |

## 目录结构

```
index.html      # 等距坊市入口
css/iso.css     # 等距版样式（UI 层 pointer-events 穿透 + 手机端适配）
js/iso.js       # 等距版逻辑：坐标转换/深度排序/点击移动/NPC对话/小地图/素材回退
assets/         # 素材（当前由 tools/make_assets.py 程序化生成的古风占位图）
tools/          # 素材生成脚本（Pillow）
battle/         # 俯视角战斗版（index.html + css/ + js/data.js + js/game.js）
legacy/         # 文字版《凡人修仙录》
```

## 素材说明（assets/）

| 路径 | 内容 |
|---|---|
| assets/tiles/ground.png | 地面：横排 2 帧 64×32（土地 / 青石板） |
| assets/tiles/buildings.png | 等距建筑（青瓦+朱红柱+灯笼，透明底） |
| assets/tiles/decorations.png | 国风装饰：横排 12 帧 96×96（垂柳/青松/竹/红灯笼/黄灯笼/石狮/水井/火盆/练功桩/石牌坊/玉龙像/武雕像），裁自 FreePixel（freepixel.art），授权见 assets/CREDITS.txt |
| assets/characters/player.png / npc_merchant.png / npc_villager.png | Q版角色立绘 64×96 |
| assets/ui/panel.png | 水墨 UI 底板（自动铺状态栏/任务栏/对话框） |
| assets/ui/icons.png | 技能图标：横排 4 格 64×64（剑诀/灵力弹/身法/护体） |

- 全部由 `tools/make_assets.py`（Pillow，4 倍超采样）生成；`python tools/make_assets.py` 可重新生成。
- **换真素材**：用同名 PNG 覆盖即可，代码零改动；素材缺失/加载失败时游戏自动回退纯色占位符，保证可运行。
- 推荐来源（CC0）：OpenGameArt「Isometric Floor Tiles / Isometric Town Tiles」、Summer Engine「Chinese Cultivation Village House」、2DPIXX Free 2D Isometric Fantasy Pack、爱给网「水墨Q版仙侠UI」。

## 等距版要点

- 坐标转换：`screenX = (mapX - mapY) * (TILE_W/2) + W/2`，`screenY = (mapX + mapY) * (TILE_H/2) + H/4`；`screenToIso()` 为其逆向解（代码内有推导注释）
- 深度排序：建筑/景物/NPC/玩家按 `mapX + mapY` 升序绘制（建筑取最前角做键）
- 交互：先做 NPC 命中检测再落地寻路，命中即停止移动并弹对话
- 替换美术：代码头尾附 Sprite Sheet 接入注释（Kenney / OpenGameArt CC0 等距素材）

## 战斗版要点

- 境界表 `battle/js/data.js` 与 `legacy/data/realms.js` 逐条一致（needExp / breakChance / failDamage / atk / def / spirit）
- 坊市 NPC / 商店 / 任务链 / 后山斩妖 / 突破反噬 / localStorage 存档
- 操作：WASD 移动，左键或 J 挥剑，Q 飞剑，Shift 血遁，R 护体罡气，E 交互，C 角色，B 背包

## 本地运行

直接双击 `index.html`（等距版）或 `battle/index.html`（战斗版）；或起服务：

```bash
python -m http.server 8080
```
