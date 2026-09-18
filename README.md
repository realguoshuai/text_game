# 修仙小游戏集 · 网页版

一个仓库跑四个游戏，全部是**纯原生 Canvas 2D + Vanilla JS，零依赖、零构建**。
推送到 `main` 分支即自动发布（GitHub Pages）—— 根地址就是统一入口页：

**https://realguoshuai.github.io/text_game/**

| 游戏 | 线上地址 | 类型 | 一句话 |
|---|---|---|---|
| **仙岛寻踪** ★主力 | https://realguoshuai.github.io/text_game/games/immortal-isles/ | 等距 · 多地图 · 动作 | 浮空仙岛之间无缝流转：斩妖、装备、境界、坊市、三档存档 |
| **修仙坊市** | https://realguoshuai.github.io/text_game/games/immortal-market/ | 等距 · 探索 | 45° 等距坊市：点击移动、NPC 对话、任务/小地图/时辰，无战斗 |
| **凡人修仙录 · 实时版** | https://realguoshuai.github.io/text_game/games/mortal-cultivator/ | 实时 · 割草 | 剑/刀/雷三位修士任选，走位斩妖兽，突破三选一构筑流派 |
| **凡人问道录** | https://realguoshuai.github.io/text_game/games/mortal-quest/ | 文字 · 养成 | 文字修仙养成：历练、炼丹、宗门、秘境（最早的一版） |

### 旧地址兼容

重组前的老链接照旧可用 —— 这四个目录里各只有一个跳转页（`<meta http-equiv="refresh">`），不是游戏本体：

| 老地址 | 跳转到 |
|---|---|
| `/immortal-game/` | `games/immortal-market/` |
| `/legacy/` | `games/mortal-quest/` |
| `/realtime/` | `games/mortal-cultivator/` |
| `/test/` | `games/immortal-isles/` |

## 目录结构

```
index.html                 # 统一入口页（四张卡片，暗金修仙风）
games/
  immortal-isles/          # 仙岛寻踪 —— 主力，等距多地图 ARPG
    js/game.js             #   单文件引擎（约 9000 行）
    assets/                #   图集 PNG/WebP + JSON 元数据 + 地图数据
    tools/                 #   素材生成脚本 + 无头自测
    ASSETS.md              #   素材清单与授权
    EXTERNAL_MAPS.md       #   外来地图来源与接入说明
  immortal-market/         # 修仙坊市（等距单图）→ 详见其 README.md
  mortal-cultivator/       # 凡人修仙录 · 实时版（index.html + game.js + style.css）
  mortal-quest/            # 凡人问道录（文字版）→ 详见其 README.md
immortal-game/ legacy/ realtime/ test/    # 旧地址跳转页（各 1 个 index.html）
DEV_NOTES.md               # 开发笔记：踩坑记录 & 后续计划
ASSETS_Meowa_Prompts.md    # 素材生成提示词
```

## 各游戏要点

### 仙岛寻踪 · `games/immortal-isles/`（主力）

等距多地图动作 RPG。单文件引擎 `js/game.js`（约 9000 行），无框架、无构建。

- **地图**：`assets/maps.json` 汇总现役的全部地图（16 张，尺寸 28×28 ~ 120×118），
  其中一部分是把别人画好的 Tiled 等距工程切图拼装进来的，来源、授权与下架记录见 `EXTERNAL_MAPS.md`；
  踩上光门即在场景间淡入淡出切换，**跨图无缝流转**。
- **等距投影**：`HW=60 / HH=30`，`screenX=(mx−my)×HW×Z+camX`，`screenY=(mx+my)×HH×Z+camY`；
  绘制按 `mx+my` 深度排序，视野裁剪按 `k=x+y` 二分。
- **战斗**：点怪即锁定 + 自动追击 + 自动平A；`faceToward()` 是"面向目标"的唯一入口
  （同时决定命中扇形用的 `face` 与绘制用的 `sideFace`）。
- **成长**：五档境界（炼气 → 筑基 → 金丹 → 元婴 → 化神）；突破抬高属性底子并回满气血。
- **装备**：装备是**实例**（id / 品质 / 词缀），品质只改数值与边框色；玄铁令可重铸词缀
  （只重掷词缀，品质与器型纹丝不动）。
- **坊市**：丹药 / 符箓 / 秘宝 / 耗材 / 现货装备 + 寄售（一键回收凡品），**只在城镇可交易**，
  货架品质随境界解锁。
- **存档**：三个档位（`isles.slot.1/2/3`），15 秒 + 换图 + 关页自动存，且只写当前档位。
- **手机**：默认取最广视野，一指摇杆 + 一指技能；画布双指捏合缩放默认关闭（防误触）。
- 素材与授权见 `ASSETS.md`；素材生成与无头自测脚本在 `tools/`。

### 修仙坊市 · `games/immortal-market/`

等距单图坊市（`index.html` + `js/iso.js` + `css/iso.css`）：点击移动、与书生/商贩等 NPC 对话、
任务链、小地图、时辰，**无战斗**。同目录 `js/game.js` 内还留着早期 2D 俯视角战斗版的引擎源码
（当前无独立入口页）。玩法与数据口径见其 `README.md`。

### 凡人修仙录 · 实时版 · `games/mortal-cultivator/`

`index.html` + `game.js` + `style.css` 三文件。剑/刀/雷三位修士任选，实时走位斩妖兽，
境界由炼气至化神，每次突破三选一构筑流派。

> 操作：WASD / 方向键移动，J / 空格发飞剑；手机端左半屏拖动 = 浮动摇杆，右半屏点按 = 出剑。

### 凡人问道录 · `games/mortal-quest/`

最早的文字版《凡人修仙录》——境界、物品、技能、宗门、秘境等原始数据与事件链，
拆分在 `data/` 下（`realms*.js` / `items*.js` / `skills.js` / `events.js` / `dungeon_*.js` …）。
后来几个游戏沿用了它的部分口径（例如 2D 坊市版的境界表与它逐条一致）。

## 素材与授权

- 素材以 **AI 生成 + Pillow 后处理**（抠底 / 去水印 / 拼帧 / 调色）产出的图集为主，
  部分国风装饰裁自 FreePixel（freepixel.art）。
- 部分作品目录下的 `assets/CREDITS.txt`（如 `games/immortal-market/assets/CREDITS.txt`、
  `games/immortal-isles/assets/CREDITS.txt`）记录该作素材的来源与授权，转载或商用前请先读。
- **换素材**：用同名 PNG 覆盖 `assets/` 下文件即可，代码零改动；
  素材缺失或加载失败时游戏自动回退占位符，仍可运行。
- 推荐来源（CC0 / CC-BY）：OpenGameArt「Isometric Floor Tiles / Isometric Town Tiles」、
  Kenney 等距素材包、2DPIXX Free 2D Isometric Fantasy Pack。

## 本地运行

直接双击 `index.html`（入口页）即可，或起一个静态服务：

```bash
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

> 游戏内的图集与地图数据通过 `fetch` 加载，**建议用服务方式打开**（`file://` 下部分浏览器会拦截跨源请求）。

## 开发与发布

- 入口脚本的 `?v=N` **每次改动都要递增**：线上 CDN 带 `Cache-Control: max-age=600`，
  不升版本号会吃到旧代码最长 10 分钟。
- 改完先 `node --check <改动的 js>` 自检，再**显式列出路径** `git add <清单>` 提交（不要 `git add .`）。
- 推送到 `main` 后约 30~45 秒构建完成；用 `git ls-remote origin main` 核对远端 HEAD 确认已生效。
- 踩坑记录、应急恢复命令与后续计划见 `DEV_NOTES.md`。
