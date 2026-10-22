# 结丹六机制扩展 · 设计稿（先定设计，未实现）

> 状态：设计阶段（未写代码、未提交）。用户确认后按"分阶段落地"实施。
> 范围：结丹期（REALMS 索引 16 初期 / 17 中期 / 18 后期）。当前 `realms.js` 顶境即「结丹后期」，故六机制均为**结丹阶段内容**。
> 铁律：去原著化 —— 全文不出现《凡人修仙传》专有名词（梵圣真魔功 / 明王诀 / 星宫 / 逆星盟 / 小寰岛 等一律映射为本作架空词，见下表）。

---

## 0. 去原著化映射表（凡人 IP → 本作架空）

| 凡人 IP 词 | 本作架空映射 | 落点机制 | 说明 |
|---|---|---|---|
| 梵圣真魔功 | **赤明魔体诀**（魔道六宗体修传承功法） | ① 体修分支 | 肉身成圣向的魔道功法，偏 atk/def |
| 明王诀 | **不动镇魂诀**（镇魂守心神识功法） | ② 神识夺舍心魔 | 御心魔、抗夺舍的核心防御术 |
| 星宫 | **星阙**（碎星海正道统治势力） | ④ 阵营声望 | 碎星海正道阵营，对标原「星宫」 |
| 逆星盟 | **乱星盟**（碎星海魔道/散修反星阙联盟） | ④ 阵营声望 | 碎星海魔道阵营，与星阙对立 |
| 小寰岛 | **寰尘岛**（碎星海隐秘灵岛） | ⑤ 长闭关洞府大阵 | 长闭关 + 周天星斗大阵所在地 |

> 凡例：所有功法/地名/门派名均为本作既有命名风格（大衍决 / 流烟步 / 颠倒五行阵 / 碎星海 / 魔道六宗 / 七大派 / 青梧谷）。若某映射词用户想换，评审阶段替换即可。

---

## 1. 现状锚点（设计必须挂在这些"唯一出口"上，不得另开平行结构）

| 出口 | 位置 | 用途 |
|---|---|---|
| `GAME.State.getStats()` | `js/state.js:333` | **属性唯一派生出口**（atk/def/speed/spirit 由境界底子+装备+加成聚合） |
| `GAME.DATA.foundationMaxSpirit(p)` | `data/realms_foundation.js:76` | **神识上限唯一出口**（供傀儡/御物承载检定） |
| `GAME.Breakthrough.plan(p)` | `js/breakthrough.js:70`（`isJiedan` 分支 78/87/117/160/275） | **突破成功率唯一出口** |
| `GAME.Core.passTime(months)` / `GAME.Time.seclude(id)` | `js/time.js:141` | **时间/闭关唯一出口**（档位 short/mid/long/epic） |
| `GAME.Puppet` | `js/puppet.js` | **傀儡唯一模块**（`build/activate/PUPPET_VOLLEY_PER`） |
| `p.pendingEvent` + `chooseEventOption` | `js/core.js:659/872` | **事件抉择框架**（心魔劫即用此） |
| `GAME.DATA.FORMATIONS` + `Cave2.setFormation` | `js/cave2.js:52/147` | **洞府大阵数据/布阵出口** |
| `GAME.Cave2` / `GAME.Home.tailReduce()` | `js/cave2.js`、`js/blackmarket.js:147` | 洞府与"行迹难寻"计算 |
| `UI.log` + 见闻录右栏 | `js/ui.js`、`index.html:510` | 文本出口；`data/content.js` 已有「秘闻」pool 由 `Codex.unlockLore` 解锁 |
| 宗门贡献 / 煞气→神识尾随 | `demon_war_events.js:79`、`blackmarket.js` | 既有 faction/追猎雏形 |

> 既有相关系统（种子）：`心魔劫`（突破触发，`core.js:650`）、`玄机子与夺舍对决`（多阶段 set-piece，`data/content.js:127`）、`神识尾随`（煞气高触发，`smoke2`）、`护山大阵`（颠倒五行阵残阵 / 大五行阵，`cave2.js`）、`傀儡工坊`（单类操控，`puppet.js`）、`见闻录`+`秘闻`pool。六机制 = **把这些种子扩成体系**，不是从零造。

---

## 2. 六机制设计

### ① 体修分支（结丹初期 16 选择）
- **意图**：结丹突破成功时，玩家在「法修 / 体修」间择一，决定后续成长取向。法修=神识/御物向（现状默认），体修=肉身/攻防向（新增）。
- **门槛**：`GAME.Breakthrough.plan` 在 `isJiedan && 突破落地 && realmIndex 刚到 16` 时，置 `p.pendingEvent = {eventId:"choose_path", resume:"afterJiedan"}`，经 `chooseEventOption` 写 `p.cultivationPath = 'fa' | 'ti'`。
- **数据模型**：
  - `p.cultivationPath`（缺省 `'fa'`）。
  - `getStats()`（state.js:333）在 `'ti'` 时：atk/def/maxhp 乘以体修系数（建议 +25% 攻防、+15% 血），speed 略降；spirit 不变（避免破功法平衡）。
  - `foundationMaxSpirit`（realms_foundation.js:76）在 `'ti'` 时给一个**下限折让**（如 ×0.7），使体修少驭傀、法修多驭傀——形成取舍。
- **功法**：`赤明魔体诀`（梵圣真魔功映射）= `GAME.DATA.SPELLS.chiming_moti`（passive：`atkBonus`+、`spiritBonus` 微弱、`魔体`标记→突破反噬 ×0.85）。来源：结丹期魔道六宗遭遇/宗门大比。
- **UI**：修行·功法面板加「道途：法修/体修」状态与已习体修功法；选道在突破后弹抉择（复用 pendingEvent）。
- **测试**：`smoke_jiedan` 增「选体修→getStats().atk 高于法修同境界」「foundationMaxSpirit('ti') < ('fa')」；断言 `赤明魔体诀` 入 `p.spells` 且降反噬。

### ② 神识夺舍心魔（结丹全程，强度随境升）
- **意图**：把既有「心魔劫」与「玄机子夺舍」扩成结丹期的**识海威胁体系**——心魔随结丹更深更难压，且高煞气/因果会招来「夺舍残魂」主动来袭。
- **门槛**：持续性。突破心魔劫（`core.js:650`）在 `isJiedan` 时提高心境门槛、放大反噬；新增 `p.xinmoLevel` 记录已渡过心魔次数。
- **夺舍机制**：`GAME.Core.passTime` 内（借既有 `p.tracking`/煞气框架）按 `p.sha`/`p.causal` 掷骰，触发 `p.pendingEvent={eventId:"seize_attempt"}`：三选项（以 `不动镇魂诀` 镇之 / 借护山大阵逼退 / 反夺其元神·高风险）。复用 `chooseEventOption` 与 `玄机子` 的元神撕扯逻辑。
- **功法**：`不动镇魂诀`（明王诀映射）= `GAME.DATA.SPELLS.budong_zhenhun`（学自藏经阁/宗门讲经）：心魔劫反噬 ×0.6、夺舍来袭判定 `immuneChance` 40%（非满免，区别于 `bonds.js` 的 `xinmoImmunity` 全免）。
- **UI**：功法面板可习 `不动镇魂诀`；夺舍来袭用既有抉择弹窗样式（暗红边框，同 `index.html:313` 玄机子面板）。
- **测试**：`smoke2`/`smoke_jiedan` 增「结丹心魔劫所需心境 > 筑基」「`不动镇魂诀` 使反噬下降」「高煞气 passTime 后 `pendingEvent.seize_attempt` 出现概率可控（用探针桩）」。

### ③ 傀儡大军（结丹初期+，随神识上限扩张）
- **意图**：把「单类操控」扩成**混编军团**——同时上弓箭+巨狼+巨猿，并随结丹神识暴涨提升总承载。
- **数据模型**：
  - 新增结丹档傀儡：`GAME.DATA.PUPPETS.zhenji`（战阵傀儡，合击）、`GAME.DATA.PUPPETS.heji`（合击傀儡），来源 魔道六宗遭遇/宗门大比。
  - `p.puppetArmy = [{type,count}]`（取代单 `puppetsActive` 语义；保留 `puppetsActive/puppetsSp` 作为战斗展开后的快照）。
  - `GAME.Puppet.compose(list)` 计算总 `spiritCost`，超 `maxSpirit()` 截断（沿用 `activate` 的承载检定逻辑）。
- **出口**：`GAME.Puppet.activate` 改为接受编制；`combat.js:186` 齐射改为对 `puppetArmy` 各类型 `Σ count×PUPPET_VOLLEY_PER`。
- **神识上限**：`foundationMaxSpirit`（realms_foundation.js:76）在结丹段阶梯抬升（如 16→120、17→150、18→180），使「体修少、法修多」的取舍落实。
- **UI**：傀儡工坊面板增「编制」管理（每种 N 具 + 总占用条）。
- **测试**：`smoke_jiedan` 增「混编总伤 = Σ 类型×数量×PUPPET_VOLLEY_PER」「总占用超上限被截断」「结丹 maxSpirit > 筑基」。

### ④ 阵营声望追杀（碎星海阶段，结丹后期 18+ 主线化）
- **意图**：在既有「宗门贡献 / 煞气→神识尾随」之上，建立**三阵营声望**（正道·星阙 / 魔道·乱星盟 / 散修·碎星海），低声望招致该阵营「追杀令」。
- **数据模型**：
  - `p.factionStanding = { xingque:0, luanxing:0, sanxiu:0 }`（范围 -100~100，0 中立）。
  - `GAME.Faction.repute(p, faction, delta)`（唯一写入口）：杀该阵营修士 +正敌对、-本阵营；吃煞气/因果联动。
  - `GAME.Faction.huntCheck(p)` 在 `passTime` 内掷骰：standing < -阈值（如 -40）且该阵营有「追杀令」→ `p.pendingEvent={eventId:"hunt_"+faction}`（逃/战/贿三选项，复用 `tracking` 样式）。
- **出口**：新增 `GAME.Faction` 模块；`passTime` 调 `Faction.tick(p)`（与 `preview` 同步显示「追杀令剩余」）。
- **UI**：身家/宗门面板增「三阵营声望」三色条 + 「追杀令」状态徽记。
- **测试**：`smoke_sect`/`smoke_jiedan` 增「杀魔道修士→星阙+ / 乱星盟-」「standing<-40 passTime 后 hunt 事件出现（探针桩）」「贿/战/逃三分支均收敛无悬空 pendingEvent」。

### ⑤ 长闭关洞府大阵（碎星海·寰尘岛，结丹后期）
- **意图**：把「闭关」与「大阵」合成**安全长修模式**——在激活大阵下 long/epic 闭关，获得增益且免疫外界追猎打断，但消耗阵盘/灵石维持。
- **数据模型**：
  - `GAME.DATA.FORMATIONS` 增 `zhouxing`（周天星斗大阵，cost 高、repelChance 0.95，仅在碎星海·寰尘岛可布），映射「小寰岛」。
  - `p.formation` 沿用 `Cave2.setFormation`；新增 `p.formationUpkeep`（阵盘/灵石月耗）。
- **出口**：`GAME.Time.seclude(id)` 在 `p.formation` 激活且 `id==='epic'` 时走「阵法闭关」分支：① 额外 +心境（每 4 月 +1→每 3 月 +1）；② 抑制 `seize_attempt`/`hunt_*` 中断（`pendingEvent` 不挂）；③ `foundationMaxSpirit` 当月额外 +；④ 扣 `formationUpkeep`，不足则阵散（降级为普通闭关并提示）。
- **UI**：洞府面板显示大阵状态 + 长关增益预览（复用 `Time.preview`）。
- **测试**：`smoke_time`/`smoke_jiedan` 增「epic+周天星斗阵→心境增速提升、闭关期间无 seize/hunt pendingEvent」「阵盘耗尽自动降级」「非碎星海不可布周天星斗阵」。

### ⑥ 见闻录文本池（全局，结丹/碎星海 丰富化）
- **意图**：建一个**按情境抽样的文本池**，关键转折自动在见闻录落一段 flavor，避免"一次性手写台词"。
- **数据模型**：
  - `GAME.DATA.CHRONICLE = { jiedan_reached:[...], xinghai_arrival:[...], modao_join:[...], hunt_issued:[...], ti_path_chosen:[...], seize_repelled:[...] }`。
  - `GAME.Chronicle.surface(tag, p)` 纯函数：按 tag 取池、依 `p` 某些字段（境界/阵营）做轻量变体，返回字符串。
- **出口**：在既有关键过渡点（结丹突破落地、入碎星海、被发追杀令、选体修、夺舍被镇）调用 `GAME.Chronicle.surface(tag,p)` 并经 `UI.log(..., 'lore')` 入见闻录；复用 `Codex.unlockLore` 的秘闻解锁范式。
- **UI**：无新面板，丰富右栏见闻录；可在「图鉴·见闻录」(index.html:262) 看到已触发条目。
- **测试**：`smoke_*` 增「surface('jiedan_reached') 返回非空且来自正确池」「同 tag 多次抽样不越界」「关键转折点确实写入见闻录（桩 `UI.log` 校验）」。

---

## 3. 实施顺序（风险由低到高，每步可独立验证 + 独立 smoke）

1. **⑥ 见闻录文本池**（纯新增，零平衡风险）→ 立 `GAME.Chronicle` + `CHRONICLE` 数据 + 5~6 个抽样点。
2. **⑤ 长闭关洞府大阵**（扩既有 formation+seclude，闭区间改动）→ 加 `zhouxing` + seclude 阵法分支。
3. **④ 阵营声望追杀**（新模块但孤立）→ `GAME.Faction` + standing/hunt + UI 三色条。
4. **③ 傀儡大军**（扩既有 Puppet）→ 混编编制 + 结丹神识阶梯。
5. **① 体修分支**（动 `getStats`/`foundationMaxSpirit`，平衡敏感）→ 道途选择 + 体修系数 + 赤明魔体诀。
6. **② 神识夺舍心魔**（动突破核心 `core.js`，最高风险，最后做）→ 心魔升阶 + 夺舍来袭 + 不动镇魂诀。

> 每步完成即 `node --check` 全仓 + 跑相关 smoke；不跨步合并，确保任一步可独立回滚。

---

## 4. 纪律红线（落地时不可破）

- 属性只走 `getStats()`；神识上限只走 `foundationMaxSpirit`；突破只走 `Breakthrough.plan`；时间只走 `Time.seclude/passTime`；傀儡只走 `Puppet`；事件抉择只走 `pendingEvent`+`chooseEventOption`。
- 全仓 CRLF（Python 脚本 `.replace("\n","\r\n")` 读写）；根 `package.json` 有 `"type":"module"`，smoke 测试放 `test/` 且 `test/package.json={"type":"commonjs"}`。
- 去原著化：任何文件不得出现 梵圣真魔功/明王诀/星宫/逆星盟/小寰岛 等《凡人》词，一律用映射表架空词。
- 提交前先 `node --check`；推送等用户明确「提交推送」再执行（显式路径 `git add`，绝不 `git add .`）。

---

## 5. 待评审确认的开放问题

1. 体修系数取 +25% 攻防 / +15% 血 / 神识 ×0.7 是否合适？（平衡需试玩校准）
2. 阵营声望「追杀令」阈值 -40、三阵营是否够（还是只做 星阙/乱星盟 两阵营对立）？
3. 周天星斗大阵是否**仅碎星海·寰尘岛**可布，还是结丹后期任意洞府皆可？
4. 夺舍来袭的 `immuneChance` 40% 是否过强（对比 `bonds` 全免）？
5. 六机制是否一次性全做，还是先落地 ①③⑥ 三个低风险再评审？

---

## 6. 实施记录（2026-10-21 全部落地，未提交）

> 用户对 §5 拍板「全做，按助手建议参数」。实施顺序 ⑥→⑤→④→③→①→②（风险低到高）。

| # | 机制 | 新增/改动文件 | smoke |
|---|---|---|---|
| ⑥ | 见闻录文本池 | `js/chronicle.js`（新建） | `smoke_chronicle` 15/0 |
| ⑤ | 长闭关洞府大阵 | `js/cave2.js` `js/time.js` `js/ui.js` | `smoke_formation` 34/0 |
| ④ | 阵营声望追杀 | `js/faction.js`（新建）`data/wild_dungeons.js` `js/core.js` `js/ui.js` `css/style.css` | `smoke_faction` 44/0 |
| ③ | 傀儡大军 | `js/puppet.js` `js/combat.js` `js/ui.js` | `smoke_puppet_army` 31/0 |
| ① | 体修分支 | `js/path.js`（新建）`js/state.js` `data/realms_foundation.js` `js/core.js` `js/breakthrough.js` `js/ui.js` `index.html` | `smoke_cultivation_path` 59/0 |
| ② | 神识夺舍心魔 | `js/seize.js`（新建）`js/core.js` `js/breakthrough.js` `js/state.js` `js/ui.js` `data/skills.js` `data/items.js` `data/content.js` `data/wild_dungeons.js` `index.html` | `smoke_seize` 74/0 |

**落地时对设计稿的修正（实现与初稿的差异）**：
1. 大阵月耗 120 → **20**（长关 144 月原需 17280 灵石，不可持续）。
2. 寰尘岛门槛改为「结丹后期(reqRealm 16) + 碎星海 + 2000 灵石」，与大挪移令传送阵线**平行**，不占传送阵通关资源。
3. `Puppet.MAX_CONTROL` 定为**总数上限 24**（原代码从未定义该常量 → `activate(undefined)` 只放 1 具，属既有 latent bug，已修）。
4. 法修定为**基准**（三系数全 1，老存档零回归），体修是「用神识换筋骨」的主动选择。
5. 赤明魔体诀 / 不动镇魂诀分别走**黑市 / 拍卖会**，均为结丹(req 16)门槛；前者限体修（`tiOnly`）。
6. 夺舍来袭每 **6 个月**一掷（非年），基础 8% + 煞气封顶 +25% + 因果 +15%；事件挂起期间世界暂停（不叠加侵染）。
7. 顺带兑现一处旧空头承诺：`bonds.js` 写入的 `p.xinmoImmunity` 此前无任何消费，现由心魔劫入口读取（尘缘已斩者不入劫）。
8. 「杀正道→星阙掉声望」分支不成立（本作无正道 NPC 可杀），改由 修魔功 / 斩魔道 / 煞气累积 三向驱动声望。

**测试总量**：新增 5 套 257 断言；全仓 29 套 smoke 全绿（约 1500+ 断言），`node --check` 全绿，新文件已统一 CRLF。
