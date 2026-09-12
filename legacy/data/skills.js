/* =========================================================
 * data/skills.js —— 功法 / 武学配置（纯数据，不含逻辑）
 *
 * 苍梧门篇核心武学，全部由 combat.js / core.js 按 ID 动态读取：
 *   changchun         被动《青木功》——每层 +5% 命中、+10% 异常抗性
 *   luoyan            主动《流烟步》——耗 30% 气血本回合规避，下回合脱力
 *   blink_sword       消耗品连携《眨眼剑法》——耗反光短剑，白日使敌【目眩】
 *   yudai_soft_sword  战前装备《玉带软剑》——开战首回合瞬发暗器
 *   dujin_tong        战前装备《淬毒筒》——开战首回合喷毒，敌持续流血
 *
 * 注意：暗器首回合数值直接挂在物品 ITEMS 上（firstStrike / bleed），
 * 此处 SKILLS 只描述武学元信息，避免逻辑与数据双份维护。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

GAME.DATA.SKILLS = {

    changchun: {
        id:"changchun", name:"青木功", type:"passive",
        perLevel: { hit:0.05, resist:0.10 },  // 每层 +5% 命中率 / +10% 异常抗性
        desc:"苍梧门正宗内功，不主杀伐，专固根基、养神识。每修一层，命中率 +5%、对目眩/中毒等异常的抗性 +10%。",
    },

    luoyan: {
        id:"luoyan", name:"流烟步", type:"active",
        costHpRatio:0.30,   // 消耗当前气血 30%
        desc:"奇诡身法，耗三成气血强行避敌锋芒，本回合敌方攻击尽数落空；然身法反噬，下回合脱力难动。",
    },

    blink_sword: {
        id:"blink_sword", name:"眨眼剑法", type:"consumable",
        item:"mirror_short_sword",  // 消耗物品【反光短剑】
        blindTurns:2, blindHitPenalty:0.70, dayOnly:true,
        desc:"以【反光短剑】折射日光，白日斗法中晃敌双目，使其【目眩】两回合，命中率大减七成。",
    },

    yudai_soft_sword: {
        id:"yudai_soft_sword", name:"玉带软剑", type:"dark_gear",
        firstStrike:14,  // 开战首回合瞬发暗器伤害
        desc:"柔可绕指的暗器，战前可装备。开战首回合无声刺出，先伤敌一分。",
    },

    dujin_tong: {
        id:"dujin_tong", name:"淬毒筒", type:"dark_gear",
        bleed:{ turns:3, dmg:5 },  // 开战首回合喷毒，敌持续流血
        desc:"暗藏毒筒，战前可装备。开战首回合喷毒，敌身中见血封喉之毒，每回合流失气血。",
    },

    zimu_ren: {
        id:"zimu_ren", name:"子母刃", type:"dark_gear",
        critBonus:0.20,  // 斗法中两成攻势直取死角，必成重创（暴击率 +20%）
        desc:"子刃藏于母刃，招式再老也会露出死角。斗法中两成攻势直取死角，必成倍重创。",
    },

    wujin_shield_note: {
        id:"wujin_shield_note", name:"乌金盾（护盾吸收）", type:"artifact_note",
        startShield:30,  // 开战即张起乌金护盾，先行吸收伤害（配 artifact_wujin 使用）
        desc:"乌金盾防御 +10；开战时更自动张起 30 点乌金罡气，先行吸收伤害方及肉身。",
    },
};

/* —— 术法表：苍南小会习得的五行法术与神识法门，可在斗法中大显身手 ——
 * cd       冷却回合数（施放后须隔若干回合方可再用，按 round 绝对值记录）
 * req      参悟门槛：需《青木功》达到该层数方可修习（凡俗武学 → 修仙法术的分水岭）
 * dmg/cd   战斗攻击法术
 * dodge    被动闪避（御风决：敌方攻击 30% 落空）
 * travelDiscount 大地图行程折扣（御风决：每程 -1 月，最低 1 月）
 * maxArtifacts/spiritNeed 神识驭物（控物术：可同时驾驭 2 件法器，神识不足则无法装备）
 * disguise 敛气伪装（敛气术：对外示人的境界压低若干层，劫匪与强敌不易盯上）
 * 习得途径：对应法术书 items（use.learnSpell 指向此 id），由 core.takePill 校验 req。
 */
GAME.DATA.SPELLS = {
    huoqiu_shu: {
        id:"huoqiu_shu", name:"火球术", school:"五行·火",
        dmg:45, cd:2, req:4,
        desc:"五行基础攻击法术。一团赤红火球轰出，造成 45 点伤害，冷却 2 回合。（需青木功四层）",
    },
    yufeng_shu: {
        id:"yufeng_shu", name:"御风诀", school:"五行·风",
        dodge:0.30, travelDiscount:1, req:5,
        desc:"轻身驭风之法。斗法中三成攻势被你飘身避过；大地图赶路每程省 1 个月。（需青木功五层）",
    },
    kongwu_shu: {
        id:"kongwu_shu", name:"控物术", school:"神识·驭物",
        maxArtifacts:2, spiritNeed:12, slashRatio:0.5, req:6,
        desc:"神识驭器核心。可同时驾驭两件法器（神识低于法器需求则无从装备）；斗法时法器离手飞斩，附加攻击五成伤害。（需青木功六层）",
    },
    tianyan_shu: {
        id:"tianyan_shu", name:"天眼术", school:"神识·探查",
        req:7,
        desc:"主动探查神通。遭遇强敌时先行看破其气血底细与随身宝物成色，再定战避。（需青木功七层）",
    },
    lianqi_shu: {
        id:"lianqi_shu", name:"敛气术", school:"神识·匿息",
        disguise:4, req:5,
        desc:"收敛灵息、伪装境界之法。对外示人的修为压低四层，劫匪与强敌不易盯上你这份肥肉。（需青木功五层）",
    },

    // —— 新增（坊市/黑市可购、打怪可掉）：补完斗法手段 ——
    bingzhui_shu: {
        id:"bingzhui_shu", name:"冰锥术", school:"五行·水",
        dmg:38, cd:2, req:4,
        desc:"五行基础攻击法术。一柄冰锥激射而出，造成 38 点伤害，冷却 2 回合。（需青木功四层）",
    },
    guisha_shu: {
        id:"guisha_shu", name:"鬼煞术", school:"魔道·阴煞",
        dmg:55, cd:3, req:6, evil:true,
        desc:"阴煞之力凝成的杀伐之术。一道鬼气透体，造成 55 点伤害，冷却 3 回合。修习沾染煞气，正道修士侧目。（需青木功六层）",
    },
    dusha_zhang: {
        id:"dusha_zhang", name:"毒沙掌", school:"魔道·淬毒",
        dmg:42, cd:3, req:4, evil:true,
        desc:"掌中藏毒，拍中便是一蓬毒沙。造成 42 点伤害，冷却 3 回合。黑市流传的狠辣掌法。（需青木功四层）",
    },
};

/* —— 技能总录：技能中枢（技能页签）唯一数据源 ——
 * kind   ：法术 / 武学 / 功法
 * spell  ：对应 GAME.DATA.SPELLS 的术法 id（习得存于 p.spells）
 * skill  ：对应「秘籍」类物品 id（习得存于 p.skills[itemId]，被动加成）
 * gongfa ：功法（如青木功，存于 p.changchunLevel）
 * wuxue  ：苍梧门武学（如流烟步）
 * item   ：习得所需的秘籍物品 id（持有并点击研习）
 * source ：来路（坊市 / 黑市 / 打怪掉落 / 苍梧门）
 * req    ：参悟门槛（对应青木功层数，仅作提示；真正拦截在服药/习书时）
 */
GAME.DATA.SKILL_CODEX = [
    { kind:"法术", spell:"huoqiu_shu", item:"skill_huoqiushu", source:"坊市·岚州大城", req:4 },
    { kind:"法术", spell:"bingzhui_shu", item:"skill_bingzhui",  source:"坊市·岚州大城", req:4 },
    { kind:"法术", spell:"yufeng_shu",  item:"skill_yufeng",    source:"坊市·岚州大城", req:5 },
    { kind:"法术", spell:"lianqi_shu",  item:"skill_lianqi",    source:"坊市·岚州大城", req:5 },
    { kind:"法术", spell:"kongwu_shu",  item:"skill_kongwu",    source:"坊市·岚州大城", req:6 },
    { kind:"法术", spell:"tianyan_shu", item:"skill_tianyan",    source:"坊市·岚州大城", req:7 },
    { kind:"法术", spell:"guisha_shu",  item:"skill_guisha",     source:"黑市秘籍",       req:6, evil:true },
    { kind:"法术", spell:"dusha_zhang", item:"skill_dusha",      source:"黑市秘籍",       req:4, evil:true },
    { kind:"武学", skill:"skill_manli",   item:"skill_manli",   source:"打怪掉落·妖兽", req:0 },
    { kind:"武学", skill:"skill_yaoshou", item:"skill_yaoshou", source:"打怪掉落·妖兽", req:0 },
    { kind:"功法", gongfa:"changchun", source:"苍梧门·玄机子" },
    { kind:"功法", skill:"sword_fragment", item:"sword_fragment", source:"黑市·旧货摊鉴定", req:0 },
    { kind:"武学", wuxue:"luoyan",     source:"苍梧门" },
];
