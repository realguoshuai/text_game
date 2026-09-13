# 项目素材需求 & Meowa 提示词包

> 用途：给 `ImmortalGame/battle/`（2D 俯视角修仙打怪升级）补齐像素美术。
> 现状：该游戏目前**零素材**，纯 CSS/程序化绘制（无精灵图、无瓦片、无图标）。
> 对比：等距坊市游戏 `ImmortalGame/ImmortalGame/assets/` 已有角色/妖兽/道具/瓦片/UI，可作风格参照（暗金修仙、16-bit 像素）。

## Meowa 是什么（重要）
- 站点：**https://meowa.ai** —— 面向独立开发者的 **AI 游戏美术工作台**。
- 能生成：像素角色、精灵图包（sprite sheet）、道具、瓦片集（tileset）、UI、地图、音效。
- **关键限制**：是「按提示词生成」的工具，**不是免登录直接下载的素材库**。生成需**登录账号 + 额度**（新用户注册送 200 免费额度）。画廊/社区也需要登录或 JS 渲染，Agent 侧无法直接拉取成品 PNG。
- 所以下面的提示词是给你在 Meowa 登录后**直接粘贴生成**用的；生成后下载 PNG/精灵表，放进 `battle/assets/`，我再接进 `game.js`。

## 统一风格锚点（每个 prompt 都带上，保证整套一致）
```
16-bit pixel art, xianxia/wuxia cultivation game, dark-gold palette (#3a2c1a base, #d9b36b gold, #6b8c6b jade green, #8a2e2e cinnabar red), clean outlines, readable silhouettes, top-down 2D RPG perspective, game-ready sprite, transparent background
```

## 1. 主角修士（4 向行走精灵表）
- 类别：Characters → Sprite Pack（Animation Direction：walk down/up/left/right）
- Prompt：
```
top-down 2D RPG player sprite sheet, a young xianxia cultivator disciple in flowing robe,
4-direction walk cycle (down/up/left/right), 4 frames each, 32x32 per frame,
dark-gold cultivation palette, simple sword on back, readable silhouette, transparent background
```
- 产出：`char_cultivator.png`（4×4 网格，下/上/左/右各 4 帧）

## 2. 妖兽：妖狼（小怪）+ 妖狼王（Boss）
- 类别：Characters（怪物）→ Sprite Pack（4 向 + 攻击帧）
- 妖狼 Prompt：
```
top-down 2D RPG enemy sprite sheet, a shadow wolf demon (妖狼) with glowing red eyes,
4-direction walk + attack frames, 32x32 per frame, dark fur with cinnabar-red accents,
xianxia monster style, transparent background
```
- 妖狼王 Prompt：
```
top-down 2D RPG boss sprite sheet, Wolf Demon King (妖狼王) larger than normal wolf,
spiked armor, glowing eyes, 48x48 per frame, 4-direction + roar/attack frames,
dark-gold xianxia boss palette, transparent background
```
- 产出：`foe_wolf.png`、`foe_wolfking.png`

## 3. 瓦片集（tileset）
- 类别：Tilesets → Environment
- 坊市青石板街道：
```
top-down 2D RPG tileset, 32x32 tiles, ancient cultivation market stone-paved street,
flagstones in grey-gold, lantern glow accents, seamless, xianxia town palette
```
- 后山林地：
```
top-down 2D RPG tileset, 32x32 tiles, misty back-mountain forest floor,
mossy earth, scattered spirit herbs, jade-green and brown tones, xianxia wilderness
```
- 产出：`tiles_market.png`、`tiles_forest.png`（含地面/边缘/装饰子图）

## 4. 道具（props / pickups）
- 类别：Props
- 一次性生成包（Sprite Pack）：
```
top-down 2D RPG item icons / pickups, 32x32 each: spirit stone (灵石, glowing gem),
golden pill (金髓丸/丹药), blood-spirit herb (血灵草, red-leaf plant), treasure chest,
iron sword, wooden signpost. xianxia pixel style, transparent background, consistent palette
```
- 产出：`props.png`（含上述子图，配 `props.json` 坐标）

## 5. NPC（接引弟子 / 灵石商人 / 丹药铺主）
- 类别：Characters → Sprite Pack（idle + talk 帧）
- Prompt：
```
top-down 2D RPG NPC sprite sheet, three xianxia town NPCs:
(1) welcoming disciple (接引弟子) with sash, (2) spirit-stone merchant (灵石商人) with abacus,
(3) alchemy shopkeeper (丹药铺主) with gourd. 32x32 each, idle + talk frames,
dark-gold cultivation palette, transparent background
```
- 产出：`npc_town.png`

## 6. UI 图标
- 类别：GUI / UI
- Prompt：
```
pixel art UI icon set for xianxia RPG: HP heart, MP/spirit droplet, EXP star,
skill icons (flying sword 御剑, dash 血遁, guard 护体罡气), spirit-stone currency icon.
32x32 crisp icons, dark-gold game UI palette, transparent background
```
- 产出：`ui_icons.png`

## 接入工作流
1. 登录 https://meowa.ai → 选对应类别 → 粘贴上面 prompt（风格锚点已内置）。
2. 生成后下载 PNG（精灵表保持 4×4 / 4 向网格，便于代码切片）。
3. 放入 `ImmortalGame/ImmortalGame/battle/assets/`：
   - `char_cultivator.png`、`foes.png`、`tiles_*.png`、`props.png`、`npc_town.png`、`ui_icons.png`
4. 我来改 `battle/js/game.js`：用 `drawImage` 切片精灵表替换现在的程序化矩形，并按 `props.json`/帧定义接好动画。

## 替代方案（无需 Meowa 登录）
如果你不想自己登 Meowa，我也可以用我自己的图像生成能力**直接产出等效的起始像素素材**并接进 `battle/` 游戏——风格同样走暗金修仙 16-bit。你只要说一声「直接生成」，我就开做。

---
*注：以上资源仅用于个人非商业修仙小游戏；若 Meowa 生成物含第三方风格，请留意其使用条款。*
