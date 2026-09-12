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
css/iso.css     # 等距版样式（UI 层 pointer-events 穿透）
js/iso.js       # 等距版逻辑：坐标转换/深度排序/点击移动/NPC对话/小地图
battle/         # 俯视角战斗版（index.html + css/ + js/data.js + js/game.js）
legacy/         # 文字版《凡人修仙录》
assets/         # 素材
```

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
