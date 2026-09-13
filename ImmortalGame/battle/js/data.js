/* =========================================================
 * 2d_game/js/data.js —— 数据层
 *
 * 数据来源：承自 text_game/ImmortalGame/legacy（文字版《凡人修仙录》）
 *   - REALMS 境界表：与 legacy/data/realms.js 完全一致（数值不改）
 *   - ITEMS  物品：在 legacy/data/items.js 基础上补充野外采集物
 *   - 技能/NPC/任务：按 2D 版玩法重新编排（对话、采集、讨伐）
 * 纯数据，禁止逻辑。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

/* —— 境界表（照搬文字版，字段含义见 legacy/data/realms.js 头注） —— */
GAME.DATA.REALMS = [
    { name:"练气一层",  needExp:20,  breakChance:0.90, failDamage:8,  failExpLoss:0.15, deathChance:0.00, maxAge:100, atk:5,  def:2,  speed:6,  spirit:5,  meditateMonths:3, meditateExp:2 },
    { name:"练气二层",  needExp:40,  breakChance:0.85, failDamage:12, failExpLoss:0.15, deathChance:0.00, maxAge:100, atk:8,  def:4,  speed:6,  spirit:6,  meditateMonths:3, meditateExp:2 },
    { name:"练气三层",  needExp:70,  breakChance:0.80, failDamage:18, failExpLoss:0.20, deathChance:0.00, maxAge:100, atk:10, def:5,  speed:7,  spirit:7,  meditateMonths:3, meditateExp:2 },
    { name:"练气四层",  needExp:110, breakChance:0.72, failDamage:25, failExpLoss:0.20, deathChance:0.01, maxAge:100, atk:13, def:7,  speed:7,  spirit:8,  meditateMonths:4 },
    { name:"练气五层",  needExp:160, breakChance:0.65, failDamage:32, failExpLoss:0.20, deathChance:0.01, maxAge:100, atk:15, def:8,  speed:8,  spirit:9,  meditateMonths:4 },
    { name:"练气六层",  needExp:220, breakChance:0.58, failDamage:40, failExpLoss:0.25, deathChance:0.02, maxAge:100, atk:18, def:10, speed:8,  spirit:10, meditateMonths:4 },
    { name:"练气七层",  needExp:290, breakChance:0.50, failDamage:48, failExpLoss:0.25, deathChance:0.02, maxAge:100, atk:20, def:11, speed:9,  spirit:11, meditateMonths:5 },
    { name:"练气八层",  needExp:370, breakChance:0.42, failDamage:56, failExpLoss:0.25, deathChance:0.03, maxAge:100, atk:23, def:13, speed:9,  spirit:12, meditateMonths:5 },
    { name:"练气九层",  needExp:460, breakChance:0.35, failDamage:65, failExpLoss:0.30, deathChance:0.03, maxAge:100, atk:25, def:14, speed:10, spirit:13, meditateMonths:5 },
    { name:"练气十层",  needExp:560, breakChance:0.28, failDamage:75, failExpLoss:0.30, deathChance:0.04, maxAge:100, atk:28, def:16, speed:10, spirit:14, meditateMonths:6 },
    { name:"练气十一层",needExp:670, breakChance:0.22, failDamage:85, failExpLoss:0.30, deathChance:0.05, maxAge:100, atk:30, def:17, speed:11, spirit:15, meditateMonths:6 },
    { name:"练气十二层",needExp:790, breakChance:0.18, failDamage:95, failExpLoss:0.35, deathChance:0.06, maxAge:100, atk:33, def:19, speed:11, spirit:16, meditateMonths:6 },
    { name:"练气十三层",needExp:920, breakChance:0.15, failDamage:105,failExpLoss:0.35, deathChance:0.07, maxAge:100, atk:35, def:20, speed:12, spirit:17, meditateMonths:6 },
    { name:"筑基一层",  needExp:1100, breakChance:0.60, failDamage:110, failExpLoss:0.30, deathChance:0.02, maxAge:200, atk:40, def:25, speed:14, spirit:25, meditateMonths:8 },
    { name:"筑基二层",  needExp:1300, breakChance:0.55, failDamage:120, failExpLoss:0.30, deathChance:0.03, maxAge:200, atk:46, def:29, speed:15, spirit:27, meditateMonths:8 },
    { name:"筑基三层",  needExp:1500, breakChance:0.50, failDamage:130, failExpLoss:0.30, deathChance:0.03, maxAge:200, atk:52, def:33, speed:15, spirit:29, meditateMonths:8 },
    { name:"筑基四层",  needExp:1750, breakChance:0.45, failDamage:145, failExpLoss:0.35, deathChance:0.04, maxAge:200, atk:58, def:37, speed:16, spirit:31, meditateMonths:9 },
    { name:"筑基五层",  needExp:2000, breakChance:0.40, failDamage:160, failExpLoss:0.35, deathChance:0.04, maxAge:200, atk:64, def:41, speed:16, spirit:33, meditateMonths:9 },
    { name:"筑基六层",  needExp:2300, breakChance:0.35, failDamage:175, failExpLoss:0.35, deathChance:0.05, maxAge:200, atk:70, def:45, speed:17, spirit:35, meditateMonths:9 },
    { name:"筑基七层",  needExp:2600, breakChance:0.30, failDamage:190, failExpLoss:0.40, deathChance:0.05, maxAge:200, atk:76, def:49, speed:17, spirit:37, meditateMonths:10 },
    { name:"筑基八层",  needExp:2950, breakChance:0.26, failDamage:210, failExpLoss:0.40, deathChance:0.06, maxAge:200, atk:82, def:53, speed:18, spirit:39, meditateMonths:10 },
    { name:"筑基九层",  needExp:null, breakChance:null, failDamage:null, failExpLoss:0, deathChance:0, maxAge:200, atk:88, def:57, speed:18, spirit:41, meditateMonths:10 },
];

/* —— 物品字典（legacy 条目 + 2D 版野外采集物） ——
 * type: currency 货币 | pill 丹药 | herb 药材 | material 材料 | artifact 法器 | talisman 符箓 | book 技能书
 */
GAME.DATA.ITEMS = {
    spirit_stone:  { id:"spirit_stone",  name:"灵石",     quality:"凡品", type:"currency", price:1,   desc:"修仙界硬通货，炼丹开炉亦需灵石。" },

    /* —— 2D 版野外采集 / 妖兽掉落 —— */
    herb_xueling:  { id:"herb_xueling",  name:"血灵草",   quality:"凡品", type:"herb",     price:8,   desc:"生于后山阴处的赤纹小草，炼丹铺收购，是练气期弟子的第一桶金。" },
    wolf_fang:     { id:"wolf_fang",     name:"妖狼牙",   quality:"凡品", type:"material", price:12,  desc:"后山妖狼的獠牙，微有妖气。炼器铺收购，可换灵石。" },
    wolf_pelt:     { id:"wolf_pelt",     name:"妖狼皮",   quality:"凡品", type:"material", price:20,  desc:"剥制完整的妖狼皮，坊市皮货贩子照单全收。" },

    /* —— 丹药（数值沿用 legacy 口径） —— */
    pill_huanglong:{ id:"pill_huanglong",name:"黄龙丹",   quality:"灵品", type:"pill",     price:80,  desc:"药力浑厚，修为 +25。", use:{ exp:25 } },
    pill_jinsui:   { id:"pill_jinsui",   name:"金髓丸",   quality:"上品", type:"pill",     price:220, desc:"易筋洗髓，修为 +80。", use:{ exp:80 } },
    pill_jinchuang:{ id:"pill_jinchuang",name:"金创药",   quality:"凡品", type:"pill",     price:30,  desc:"外伤圣药，气血 +60。", use:{ hp:60 } },
    pill_huiqi:    { id:"pill_huiqi",    name:"回气散",   quality:"凡品", type:"pill",     price:25,  desc:"行气复原，灵力 +40。", use:{ mp:40 } },

    /* —— 符箓 —— */
    tal_fire:      { id:"tal_fire",      name:"火弹符",   quality:"凡品", type:"talisman", price:35,  desc:"激射火球，对前方妖兽造成一次重击（伤害 ≈ 攻击×3）。" },
    tal_guard:     { id:"tal_guard",     name:"护身符",   quality:"凡品", type:"talisman", price:40,  desc:"破碎时自动抵挡一次致命伤（使用后常驻，触发即毁）。" },

    /* —— 法器（装备，仅一件） —— */
    sword_qingfeng:{ id:"sword_qingfeng",name:"青锋剑",   quality:"灵品", type:"artifact", price:0,   desc:"接引弟子所赠的制式法剑，攻击 +8。", equip:{ atk:8 } },

    /* —— 技能书 —— */
    book_flying:   { id:"book_flying",   name:"御剑术残卷", quality:"灵品", type:"book",   price:150, desc:"习得「剑力潮」：Q 键射出飞剑，耗灵力 15。" },
    book_guard:    { id:"book_guard",    name:"罡气诀残卷", quality:"灵品", type:"book",   price:180, desc:"习得「护体罡气」：R 键护体 6 秒，减伤六成，耗灵力 25。" },
};

/* —— 技能栏（与截图 LMB/Q/Shift/R 对位） —— */
GAME.DATA.SKILLS2D = {
    attack: { name:"御剑",   key:"LMB",  cd:0.45, desc:"基础剑击" },
    flying: { name:"剑力潮", key:"Q",    cd:0.8,  mpCost:15, needBook:"book_flying", desc:"射出飞剑" },
    dash:   { name:"血遁",   key:"Shift",cd:2.0,  hpCost:0.05, desc:"短距冲遁，无敌 0.2 秒" },
    guard:  { name:"护体罡气", key:"R",  cd:15,   mpCost:25, dur:6, needBook:"book_guard", desc:"6 秒减伤 60%" },
};

/* —— NPC（坊市布局对应截图：坊市内各掌柜 + 接引弟子） ——
 * shop: 可交易的物品表；sellAll: 可按半价收购玩家背包中的材料/药材
 */
GAME.DATA.NPCS = [
    { id:"jieyin",  name:"接引弟子", role:"主线", x:1290, y:640, color:"#7fc4ff",
      talk:"师弟来得正好！宗门广收弟子，先去后山历练一番，再回来见我。",
      shop:null },
    { id:"danshi",  name:"炼丹师·丹药掌柜", role:"丹药铺", x:520, y:520, color:"#e07a6a",
      talk:"丹炉一开，灵气自来。金创药、回气散，练气期的保命本钱。",
      shop:["pill_jinchuang","pill_huiqi","pill_huanglong","pill_jinsui"] },
    { id:"qishi",   name:"炼器师·器坊掌柜", role:"器坊", x:980, y:380, color:"#d4ac2b",
      talk:"好剑配好汉。灵石够的话，我这青锋剑价钱公道——妖狼牙也收，算你便宜。",
      shop:["sword_qingfeng","book_flying","book_guard"], sellAll:true },
    { id:"lingshi", name:"灵石商人", role:"聚宝阁", x:640, y:820, color:"#8fd3ff",
      talk:"灵石通万物。你背包里的血灵草、妖狼皮，我照单全收。",
      shop:[], sellAll:true },
    { id:"zahuo",   name:"杂货孩子", role:"杂货摊", x:1580, y:760, color:"#9fd48a",
      talk:"哥！火弹符要不要？炸狼一炸一个准！",
      shop:["tal_fire","tal_guard"] },
    { id:"baisi",   name:"摆法师", role:"卜易摊", x:380, y:700, color:"#c9a0dc",
      talk:"（掐指）……嗯，你印堂发亮，今日宜杀狼。突破把握不大时，来找我卜一卦，或许能借三分气运。",
      shop:null, fortune:true },
];

/* —— 任务链 ——
 * objective: { type:'talk'|'collect'|'kill'|'realm', target, need }
 */
GAME.DATA.QUESTS = [
    { id:"q_main1", name:"初入青芸派", main:true,
      desc:"与坊市中的接引弟子对话。",
      objectives:[ { type:"talk", target:"jieyin", need:1 } ],
      reward:{ exp:20, stones:50 },
      next:["q_herb","q_wolf","q_realm3"] },
    { id:"q_herb", name:"探灵药园", main:false,
      desc:"后山生长着血灵草，采集 5 株交给丹药铺验看（E 键采集）。",
      objectives:[ { type:"collect", target:"herb_xueling", need:5 } ],
      reward:{ exp:30, items:{ pill_jinchuang:2 } } },
    { id:"q_wolf", name:"野狼之路", main:false,
      desc:"后山妖狼袭扰坊市，讨伐 5 头。",
      objectives:[ { type:"kill", target:"wolf", need:5 } ],
      reward:{ exp:40, stones:100 },
      next:["q_wolfking"] },
    { id:"q_wolfking", name:"狼王现世", main:false,
      desc:"妖狼王现身后山深处，斩之可安坊市。",
      objectives:[ { type:"kill", target:"wolfking", need:1 } ],
      reward:{ exp:120, items:{ sword_qingfeng:1 } } },
    { id:"q_realm3", name:"境界·练气三层", main:false,
      desc:"修为圆满后于角色面板（C）突破至练气三层。",
      objectives:[ { type:"realm", target:2, need:1 } ],
      reward:{ stones:200 } },
];

/* —— 妖兽图鉴 ——
 * 字段：hp/atk/def/exp/stones 掉灵石区间；drop 掉落表 {id:概率}
 */
GAME.DATA.FOES = {
    wolf:     { id:"wolf",     name:"妖狼",   hp:26,  atk:7,  def:1, speed:95, exp:8,  stones:[2,5],  drop:{ wolf_fang:0.45, wolf_pelt:0.15 }, r:16, color:"#6d5a44" },
    rat:      { id:"rat",      name:"赤目鼠", hp:16,  atk:5,  def:0, speed:110, exp:5, stones:[1,3],  drop:{ herb_xueling:0.25 }, r:12, color:"#8a4a3a" },
    snake:    { id:"snake",    name:"竹叶青", hp:20,  atk:9,  def:0, speed:85, exp:7,  stones:[2,4],  drop:{ herb_xueling:0.3 }, r:13, color:"#4a7a3a" },
    wolfking: { id:"wolfking", name:"妖狼王", hp:220, atk:16, def:4, speed:105, exp:80, stones:[40,80], drop:{ wolf_fang:1, wolf_pelt:0.6 }, r:24, color:"#3a2c20", boss:true },
};
