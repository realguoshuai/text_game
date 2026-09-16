# 凡人修仙录 · 坊市行（2D 版）

2D 俯视角修仙 RPG。数值体系（境界/物品/任务）承自同仓库 `legacy/` 的文字版《凡人修仙录》，画面玩法为坊市行走 + 后山斩妖。**纯原生 Canvas 2D，零依赖、零构建、单页运行。**

> 线上地址：https://realguoshuai.github.io/text_game/
> 文字版仍可访问：https://realguoshuai.github.io/text_game/legacy/

## 目录结构

```
2d_game/
├── index.html        # 入口页面（HUD/对话框/面板/标题画面）
├── css/style.css     # 暗金修仙风样式
├── js/
│   ├── data.js       # 数据层：境界表(照搬 legacy/realms.js)、物品、NPC、任务、妖兽
│   └── game.js       # 主引擎：地图预渲染/战斗/任务/商店/突破/存档/小地图
└── README.md
```

## 操作

| 按键 | 功能 |
|---|---|
| WASD / 方向键 | 移动 |
| 鼠标左键 / J | 挥剑（朝鼠标方向） |
| Q | 剑力潮·飞剑（需在器坊购《御剑术残卷》） |
| Shift | 血遁（短距冲遁 + 短暂无敌） |
| R | 护体罡气（减伤 60%，需购《罡气诀残卷》） |
| E | 对话 / 采集血灵草 |
| C / B | 角色面板 / 背包 |
| Esc | 关闭面板 |

## 玩法闭环

1. 与接引弟子（头顶 `!`）对话接主线 → 开启采药 / 讨伐任务链
2. 南口出坊市采血灵草，东门进后山猎场斩妖狼
3. 灵石在丹药铺 / 器坊 / 杂货摊消费，材料卖给灵石商人
4. 修为圆满（角色面板 C）→ 突破境界，成功率与反噬数值沿用文字版 `REALMS` 表
5. 讨伐妖狼王得青锋剑；摆法师可花 30 灵石卜卦（下次突破 +10% 成功率）

## 数据来源与口径

- `js/data.js` 中 `REALMS` 境界表与 `legacy/data/realms.js` **逐条一致**（needExp / breakChance / failDamage / atk / def / spirit 等）
- 丹药（黄龙丹 / 金髓丸）数值沿用 `legacy/data/items.js` 口径
- 2D 版新增：血灵草、妖狼牙、妖狼皮、符箓、技能书（为采集/商店/技能解锁玩法服务）

## 弱机友好设计

- 整图 2560×1920 预渲染一次，每帧只 blit 可视区
- 妖兽上限 10 只、粒子上限 80、dt 钳制 50ms
- 小地图每 0.5s 低频重绘
- 存档走 localStorage（每 20s 自动 + 关页时），设置面板可删档重来

## 本地运行

直接双击 `index.html` 即可；或：

```bash
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

## 部署（GitHub Pages）

本目录内容即线上源码（无构建步骤），推送到 `main` 分支根目录即自动发布。
