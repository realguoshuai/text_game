/* =========================================================
 * data/realms.js —— 境界配置表（纯数据，禁止逻辑）
 *
 * 字段说明：
 *   needExp      突破本层所需修为（圆满线）
 *   breakChance  突破成功率
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
    /* —— 筑基期拆为九层（index 13~21）：练气十三层(index12)→筑基一层仍走 ZHUJI 筑基丹链 ——
     * 筑基一层~九层为常规修为突破；寿元统一 200 岁；神识随层暴涨（呼应《大衍决》神识暴涨）。
     * 阶段划分（供魔道入侵终局判定）：前期 1~3 / 中期 4~6 / 后期 7~8 / 九层圆满。 */
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

/* 筑基丹链触发边界：练气十三层(index12)→筑基一层(index13) 走 GAME.DATA.ZHUJI 专用数值。
 * core.breakthrough 据此判定 isZhuji，故拆层后不依赖 realm 名。 */
GAME.DATA.ZHUJI_GATE_INDEX = 12;

/* 结丹门槛：筑基九层(index21)之后即结丹一层(index22)。当前 REALMS 仅到筑基九层，
 * 结丹境界尚未实现；此常量与 isJiedan 仅为后续功能（如拍卖会）提供统一解锁判定，
 * 待 REALMS 扩展至结丹后自动生效（届时 index22+ 自然落入新境界）。 */
GAME.DATA.JIEDAN_GATE_INDEX = 22;
GAME.DATA.isJiedan = function (p) { return !!p && p.realmIndex >= GAME.DATA.JIEDAN_GATE_INDEX; };
GAME.DATA.isZhuji  = function (p) { return !!p && p.realmIndex > GAME.DATA.ZHUJI_GATE_INDEX; };

/* 大境界（major realm）：0=练气，1=筑基。供战斗「境界绝对压制」计算双方阶层差。
 * 仅含练气/筑基两阶；未来接入结丹时扩展为按 index 区间映射。 */
GAME.DATA.majorRealm = function (idx) { return idx >= 13 ? 1 : 0; };

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
    pill:     { chance:0.25, perPill:0.25, perExtra:0.20, cap:1.0 },  // 筑基丹：每多服一枚 +25%，失败保底每档 +20%
    zhengpin: { chance:0.45, perPill:0.45, perExtra:0.20, cap:1.0 },  // 正品筑基丹：45% 起步同链
    fake:     { chance:0.15, deathChance:0.40, dmgMul:1.3 }, // 伪丹：15%，失败 40% 身陨
};
