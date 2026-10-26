/* =========================================================
 * data/realms.js —— 境界配置表（纯数据，禁止逻辑）
 *
 * 字段说明：
 *   needExp      突破本层所需修为（圆满线）
 *   breakChance  突破成功率（无 expRamp 时即固定底子；有 expRamp 时＝修为圆满那一刻的底子）
 *   expRamp      [起手, 圆满]：底子随「当前修为 / needExp」线性攀升——刚到这一境只有起手那点数
 *   failDamage   失败反噬气血
 *   failExpLoss  失败溃散修为比例 (0~1)
 *   deathChance  失败当场道消身陨概率
 *   maxAge       此境界寿元大限（练气不延寿，筑基起大幅延长）
 *   atk/def/speed/spirit  斗法基础面板
 *   meditateMonths  打坐一次耗费的月数（按境界递增：低境省时，高境沉冗）
 *
 * 平衡设计：每次打坐 +1 修为。练气一层至筑基圆满总修为需求
 * 约 4680，若只靠打坐（100 岁内至多 168 点），百年苦修也未必能
 * 出练气四层——凡人流设定：不借外物，筑基无望。
 * 打坐耗时随修为提高（3→6→8 月），低境界不空耗寿元，体验更顺。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.DATA = GAME.DATA || {};

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
    /* —— 筑基期（index 13~15）：初期 / 中期 / 后期 三块（仅练气分 1~13 层）——
     * 练气十三层(index12)→筑基初期仍走 ZHUJI 筑基丹链；筑基三层为常规修为突破，寿元统一 200 岁。 */
    { name:"筑基初期",  needExp:3900, breakChance:0.50, expRamp:[0.10,0.50], failDamage:110, failExpLoss:0.30, deathChance:0.02, maxAge:200, atk:40,  def:25,  speed:14, spirit:25,  meditateMonths:8 },
    { name:"筑基中期",  needExp:6050, breakChance:0.42, expRamp:[0.12,0.42], failDamage:145, failExpLoss:0.35, deathChance:0.04, maxAge:200, atk:58,  def:37,  speed:16, spirit:31,  meditateMonths:9 },
    { name:"筑基后期",  needExp:null, breakChance:null, failDamage:400, failExpLoss:0.20, deathChance:0,    maxAge:200, atk:76,  def:49,  speed:17, spirit:37,  meditateMonths:10 },

    /* —— 结丹期（index 16~18）：初期 / 中期 / 后期 三块；筑基后期(index15) 经「结丹天堑」凝丹而成。
     * 寿元跃至 500 岁（呼应凡人流：结丹方脱凡胎）；斗法面板随块暴涨。
     * 筑基后期→结丹初期走 GAME.DATA.JIEDAN 专用数值（见下方 JIEDAN 表）；
     * 结丹内部各块为常规修为突破，沿用 realm.breakChance 等字段。 */
    { name:"结丹初期",  needExp:11500, breakChance:0.30, failDamage:260, failExpLoss:0.35, deathChance:0.06, maxAge:500, atk:120, def:80,  speed:22, spirit:60,  meditateMonths:12 },
    { name:"结丹中期",  needExp:17800, breakChance:0.18, failDamage:410, failExpLoss:0.42, deathChance:0.09, maxAge:500, atk:170, def:120, speed:28, spirit:85,  meditateMonths:12 },
    { name:"结丹后期",  needExp:null,  breakChance:null, failDamage:null, failExpLoss:0,    deathChance:0,    maxAge:500, atk:290, def:215, speed:38, spirit:145, meditateMonths:12 },

    /* —— 元婴期（index 19~21）：初期 / 中期 / 后期 三块；结丹后期(index18) 经「碎丹成婴」而入。
     * 寿元跃至千载（元婴方得长生之体）；斗法面板较结丹再翻数倍，结丹修士在其面前已如凡徒。
     * 结丹后期→元婴初期走 GAME.DATA.YUANING 专用数值（碎丹成婴三铺路，见下方 YUANING 表）；
     * 元婴内部各块为常规修为突破，沿用 breakChance 等字段。 */
    { name:"元婴初期",  needExp:26000, breakChance:0.22, failDamage:600, failExpLoss:0.40, deathChance:0.08, maxAge:1000, atk:380, def:280, speed:45, spirit:200, meditateMonths:24 },
    { name:"元婴中期",  needExp:45000, breakChance:0.14, failDamage:900, failExpLoss:0.45, deathChance:0.10, maxAge:1000, atk:540, def:400, speed:52, spirit:270, meditateMonths:24 },
    { name:"元婴后期",  needExp:null,  breakChance:null, failDamage:null, failExpLoss:0,    deathChance:0,    maxAge:1000, atk:750, def:560, speed:60, spirit:350, meditateMonths:24 },
];

/* 筑基丹链触发边界：练气十三层(index12)→筑基初期(index13) 走 GAME.DATA.ZHUJI 专用数值。
 * core.breakthrough 据此判定 isZhuji，故拆层后不依赖 realm 名。 */
GAME.DATA.ZHUJI_GATE_INDEX = 12;

/* 结丹门槛：筑基后期(index15)之后即结丹初期(index16)。
 * isJiedan / 拍卖会 / 碎星海 等均统一以 JIEDAN_GATE_INDEX 判定。 */
GAME.DATA.JIEDAN_GATE_INDEX = 16;
GAME.DATA.isJiedan = function (p) { return !!p && p.realmIndex >= GAME.DATA.JIEDAN_GATE_INDEX; };
GAME.DATA.isZhuji  = function (p) { return !!p && p.realmIndex > GAME.DATA.ZHUJI_GATE_INDEX; };
GAME.DATA.isYuanying = function (p) { return !!p && p.realmIndex >= GAME.DATA.YUANING_GATE_INDEX; };

/* 大境界（major realm）：0=练气，1=筑基。供战斗「境界绝对压制」计算双方阶层差。
 * 练气=0、筑基=1、结丹=2、元婴=3；各大境界均沿用 初期/中期/后期 三块递增。 */
GAME.DATA.majorRealm = function (idx) { return idx >= 19 ? 3 : (idx >= 16 ? 2 : (idx >= 13 ? 1 : 0)); };

/* —— 筑基冲关数值表（练气十三层 → 筑基专用，由 core.breakthrough 读取）——
 * 伪灵根裸冲：2% 成功，失败 80% 触发【经脉俱断】道消身陨——凡人流的天堑。
 * 筑基丹链：单枚 25%，失败后连服每多一枚累积 +20%（资源堆叠抹平资质劣势），服丹免死。
 * 正品筑基丹：45% 起步（血色禁地三药所炼），同样可连服累积。
 * 伪·筑基丹：15%，且失败仍有四成身陨之危——药效虚浮，反噬灼经脉。
 * 连服公式：成功率 = 基础 + 每多服一枚(perPill) + 每次历史失败保底(perExtra)，封顶 cap。
 * 四枚筑基丹连服：25% → 50% → 75% → 100%——还原沈牧四丹强冲筑基、必定功成的名场面。
 * 心境加成照常叠加（每 10 点 +2%），封顶 98%。
 */
GAME.DATA.ZHUJI = {
    bare:     { chance:0.05, deathChance:0.80, dmg:80 },   // 伪灵根裸冲：5% 成，失败 80% 身陨（玄傀护主可挡一次）
    pill:     { chance:0.25, perPill:0.25, perExtra:0.20, cap:1.0, dmgMul:0.8, deathMul:0 },  // 筑基丹：每多服一枚 +25%，失败保底每档 +20%；护脉反噬 -20%，服丹免死
    zhengpin: { chance:0.45, perPill:0.45, perExtra:0.20, cap:1.0, dmgMul:0.2, deathMul:0 },  // 正品筑基丹：45% 起步同链；反噬 -80%，服丹免死
    fake:     { chance:0.15, deathChance:0.40, dmgMul:1.3 }, // 伪丹：15%，失败 40% 身陨
};

/* 结丹天堑（筑基后期 index15 → 结丹初期 index16）专用数值，由 core.breakthrough 读取。
 * 无丹硬冲：3% 成、失败九成五身陨（原著结丹之难，百中无一）；
 * 凝丹（结丹丹）：35% 起，连服每多一枚累积 +20%、历史失败保底每档 +15%，服丹免死；
 * 正品凝丹：55% 起同链；伪凝丹：20% 且失败三成身陨。
 * 《三转归元功》结丹补偿另计（每转 +25%，上限 +75%）。 */
GAME.DATA.JIEDAN_GATE_SOURCE = 15;   // 筑基后期为结丹突破源（与 ZHUJI_GATE_INDEX=12 对应练气十三层同理）
GAME.DATA.JIEDAN = {
    bare:     { chance:0.03, deathChance:0.95, dmg:220 },   // 无丹硬冲：3% 成，失败九成五经脉俱断
    pill:     { chance:0.35, perPill:0.20, perExtra:0.15, cap:1.0, dmgMul:0.3, deathMul:0 },  // 凝丹：服丹免死
    zhengpin: { chance:0.55, perPill:0.20, perExtra:0.15, cap:1.0, dmgMul:0.2, deathMul:0 },  // 正品凝丹
    fake:     { chance:0.20, deathChance:0.30, dmgMul:1.3 }, // 伪凝丹：20%，失败三成身陨
};

/* 元婴天堑（结丹后期 index18 → 元婴初期 index19）专用数值，由 core.breakthrough 读取。
 * 无备硬凝：3% 成、失败六成身陨（元婴之难，犹胜结丹）；
 * 碎丹成婴不走丹链，而走「三铺路」事件（js/yuanying.js 的 yuanying_prep，择一写入 p.yuanyingPrep）：
 *   借灵药  herb  耗 1 株千年灵药 → 成功率 +15%、反噬 ×0.7
 *   寻护法  guard 耗 3000 灵石    → 成功率 +5%、反噬 ×0.5 且免身陨
 *   静养    mind  耗时 6 月、心境 +10 → 成功率 +8%（心境每 10 点另有 +2%）
 * 铺路加成由 Breakthrough.plan 读取 p.yuanyingPrep 统一结算，面板与结算同源。 */
GAME.DATA.YUANING_GATE_INDEX = 19;    // 元婴判定门槛（isYuanying 等统一以此为准）
GAME.DATA.YUANING_GATE_SOURCE = 18;   // 结丹后期为元婴突破源（与 ZHUJI_GATE_INDEX=12 对应练气十三层同理）
GAME.DATA.YUANING = {
    bare:   { chance:0.03, deathChance:0.60, dmg:600 },   // 无备硬凝：3% 成，失败六成身陨
    guardCost: 3000,                                      // 寻护法所需灵石
    herb:   { add:0.15, dmgMul:0.70 },                     // 借灵药：+15%，反噬 ×0.7
    guard:  { add:0.05, dmgMul:0.50, deathMul:0 },         // 寻护法：+5%，反噬减半且免死
    mind:   { add:0.08, mind:10, months:6 },               // 静养：+8%，另耗时 6 月、心境 +10
};
