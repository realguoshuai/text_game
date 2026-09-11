/* =========================================================
 * data/items.js —— 物品字典 + 炼丹配方（纯数据）
 *
 * 物品字段：id / name / quality / type / price / desc
 *   type: currency 货币 | pill 丹药 | herb 药材 | material 瓶中物
 *         artifact 法器 | talisman 符箓
 *   use    服用效果（丹药）
 *   equip  装备加成（法器，仅可装一件）
 *   combat 战斗中使用效果（符箓）
 *
 * 背包只存 { 物品ID: 数量 }，所有属性查此表。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

GAME.DATA.ITEMS = {

    // —— 货币 ——
    spirit_stone: { id:"spirit_stone", name:"灵石", quality:"凡品", type:"currency", price:1, desc:"修仙界硬通货，炼丹开炉亦需灵石。" },

    // —— 承露瓶产出（特殊材料，不入市、不可出售） ——
    liquid_green:  { id:"liquid_green",  name:"承露瓶绿液",  quality:"极品", type:"material", price:0, desc:"瓶中日月所凝，一滴可催熟百年灵药，五滴可催千年。" },
    herb_bainian:  { id:"herb_bainian",  name:"百年灵药",    quality:"灵品", type:"herb",     price:40, desc:"绿液催熟所成，炼丹主材。亦可生嚼，草木清气小幅增修为——然药力暴烈、连服渐抗，远不及炼丹之效。", use:{ eatExp:5, eatMonths:1 } },
    herb_qiannian: { id:"herb_qiannian", name:"千年灵药",    quality:"上品", type:"herb",     price:200, desc:"五滴绿液方可催熟，筑基丹必需主药。妖兽腹中偶有遗存。药性更猛，生嚼进益多于百年灵药，仍逊于丹药。", use:{ eatExp:15, eatMonths:1 } },

    // —— 丹药 ——
    pill_huanglong:{ id:"pill_huanglong", name:"黄龙丹", quality:"灵品", type:"pill", price:80,  desc:"药力浑厚，修为 +25。",   use:{ exp:25 } },
    pill_jinsui:   { id:"pill_jinsui",    name:"金髓丸", quality:"上品", type:"pill", price:220, desc:"易筋洗髓，修为 +80。",   use:{ exp:80 } },
    pill_zhuji:    { id:"pill_zhuji",     name:"筑基丹", quality:"极品", type:"pill", price:800, desc:"冲关筑基之凭。突破筑基时自动消耗一枚。", use:{ zhuji:true } },
    pill_yanshou:  { id:"pill_yanshou",   name:"延寿丹", quality:"极品", type:"pill", price:600, desc:"夺天地造化以续命，寿元大限 +10 年。练气期唯一续命之法。", use:{ ageBonus:10 } },

    // —— 符箓（仅战斗中使用） ——
    talisman_huoshe: { id:"talisman_huoshe", name:"火蛇符", quality:"灵品", type:"talisman", price:55, desc:"战斗中使用，火蛇噬敌，造成 35 点伤害。", combat:{ dmg:35 } },
    talisman_hushen: { id:"talisman_hushen", name:"护身符", quality:"灵品", type:"talisman", price:70, desc:"战斗中使用，获得 40 点护身罡气。",       combat:{ shield:40 } },

    // —— 法器（仅可装备一件） ——
    artifact_qingwen: { id:"artifact_qingwen", name:"苍岚铁剑", quality:"灵品", type:"artifact", price:180, desc:"低阶法器，攻击 +6。",           equip:{ atk:6 } },
    artifact_xuangui: { id:"artifact_xuangui", name:"玄龟盾",   quality:"灵品", type:"artifact", price:160, desc:"防御 +5，神识 +2。",            equip:{ def:5, spirit:2 } },
    artifact_qingyuan:{ id:"artifact_qingyuan",name:"清元剑诀残剑", quality:"上品", type:"artifact", price:450, desc:"前辈遗剑，攻击 +12，神识 +3。", equip:{ atk:12, spirit:3 } },

    // —— 新增（练气期扩展）：符箓（瞬发、不耗灵力，阴招斗法） ——
    talisman_huoqiu:  { id:"talisman_huoqiu",  name:"火球符", quality:"灵品", type:"talisman", price:50, desc:"战斗中使用，一团烈火轰出，造成 32 点伤害，无需耗法力。", combat:{ dmg:32 } },
    talisman_dici:    { id:"talisman_dici",    name:"地刺符", quality:"灵品", type:"talisman", price:45, desc:"战斗中使用，地刺破土而出，造成 26 点伤害。",                 combat:{ dmg:26 } },
    talisman_shenxing:{ id:"talisman_shenxing", name:"神行符", quality:"灵品", type:"talisman", price:60, desc:"身怀此符可破神识尾随：遭追踪时焚符御风，十拿九稳脱身。", combat:{}, use:{ escape:true } },

    // —— 新增：凡俗毒药（世俗行医所得，战斗首回合涂抹使敌持续中毒） ——
    poison_mortal:    { id:"poison_mortal",    name:"凡俗毒囊", quality:"凡品", type:"poison", price:30, desc:"战斗首回合可捏碎涂抹，使对手每回合流失气血（持续 3 回合）。", combat:{ poison:{ turns:3, dmg:6 } } },

    // —— 新增：杂役 / 黑市 / 试炼相关物品 ——
    ore:              { id:"ore",              name:"低阶矿石",     quality:"凡品", type:"material", price:30,  desc:"废弃灵矿中所采，可售于坊市换些许灵石。" },
    artifact_frag:    { id:"artifact_frag",    name:"下品法器残片", quality:"灵品", type:"material", price:120, desc:"贡献兑换所得，残破却仍蕴灵气，可高价转售。" },
    conceal_skill:    { id:"conceal_skill",    name:"中品敛气术",   quality:"上品", type:"skill",    price:400, desc:"修习即 +1 敛气等级，可敛去煞气与灵息，黑市交易更易脱身。", use:{ conceal:1 } },
    fake_zhuji:       { id:"fake_zhuji",       name:"伪·筑基丹",    quality:"中品", type:"pill",     price:300, desc:"鱼目混珠之物。冲关筑基时可蒙混，然药力虚浮：成功率大减、反噬更烈。", use:{ fakeZhuji:true } },

    // —— 新增：旧货摊鉴定产物 ——
    junk_rusty:       { id:"junk_rusty",       name:"锈蚀铁片",     quality:"凡品", type:"junk", price:15, desc:"无名摊上淘来的锈蚀铁片，鉴定前不知价值。" },
    junk_furnace:     { id:"junk_furnace",     name:"残破丹炉",     quality:"凡品", type:"junk", price:20, desc:"缺了炉腿的破丹炉，鉴定前谁也不知好坏。" },
    junk_skin:        { id:"junk_skin",        name:"无名兽皮",     quality:"凡品", type:"junk", price:25, desc:"一张字迹漫漶的兽皮，鉴定前难以辨读。" },
    junk_scrap:       { id:"junk_scrap",       name:"废铁",         quality:"凡品", type:"junk", price:5,  desc:"鉴定后才知，不过是块不值钱的废铁。" },
    sword_fragment:   { id:"sword_fragment",   name:"高阶剑诀残卷", quality:"上品", type:"skill", price:380, desc:"旧货摊深处淘得！前人遗下剑诀残卷，研习后攻击 +15、神识 +2（功法，不占法器槽）。", use:{ atkBonus:15, spiritBonus:2 } },
    ancient_fragment: { id:"ancient_fragment", name:"古宝残片",     quality:"上品", type:"artifact", price:300, desc:"古修遗物残片，攻击 +10，防御 +3。",                       equip:{ atk:10, def:3 } },

    // —— 新增：血月试炼三味主药 + 正品筑基丹 ——
    herb_tianling:    { id:"herb_tianling",    name:"天灵果", quality:"灵品", type:"herb", price:60, desc:"血月试炼中所采筑基主药之一。" },
    herb_yumo:        { id:"herb_yumo",        name:"玉髓芝", quality:"灵品", type:"herb", price:60, desc:"血月试炼中所采筑基主药之一。" },
    herb_zihou:       { id:"herb_zihou",        name:"紫猴花", quality:"灵品", type:"herb", price:60, desc:"血月试炼中所采筑基主药之一。" },
    pill_zhengpin:    { id:"pill_zhengpin",    name:"正品筑基丹", quality:"极品", type:"pill", price:1000, desc:"三味主药于洞府炼成，药效醇厚。冲关筑基成功率 +50%、反噬伤害减免 80%。", use:{ zhengpin:true } },

    // —— 新增（苍梧门篇）：暗技与武学连携 ——
    mirror_short_sword:{ id:"mirror_short_sword", name:"反光短剑", quality:"灵品", type:"tool",      price:90,  desc:"眨眼剑法所耗之物。白日斗法中挥之折射日光，可令敌双目眩晕。" },
    yudai_soft_sword: { id:"yudai_soft_sword",  name:"玉带软剑", quality:"上品", type:"dark_weapon", price:260, desc:"柔可绕指的暗器，战前可装备。开战首回合无声刺出，先伤敌一分。", firstStrike:14 },
    dujin_tong:       { id:"dujin_tong",        name:"淬毒筒",   quality:"上品", type:"dark_weapon", price:300, desc:"暗藏毒筒，战前可装备。开战首回合喷毒，敌身中见血封喉之毒持续流失气血。", bleed:{ turns:3, dmg:5 } },
    mirror_armor:     { id:"mirror_armor",      name:"护心镜",   quality:"灵品", type:"armor",      price:200, desc:"护身法器，防御 +4。玄机子点穴暗算时若佩之，可卸去大半劲力。", equip:{ def:4 } },

    // —— 新增（苍梧门篇）：玄机子与铁奴玄傀相关 ——
    yinhun_zhong:     { id:"yinhun_zhong",      name:"摄魂钟", quality:"极品", type:"material", price:0,   desc:"玄机子遗物。以自身精血催动，可激活铁奴【玄傀】为你所用。" },
    changchun_xp:     { id:"changchun_xp",      name:"青木功续篇", quality:"极品", type:"skill", price:0,   desc:"玄机子毕生心得。修习后青木功层数大涨，命中与异常抗性更固。", use:{ changchunUp:6 } },
    nuan_yang_bao_yu: { id:"nuan_yang_bao_yu",  name:"暖阳宝玉", quality:"极品", type:"material", price:500, desc:"景阳城玄机世家所藏。服之可驱体内阴毒，免道消身陨之厄。", use:{ cureYindu:true } },
    pill_huichun:     { id:"pill_huichun",      name:"回春散", quality:"灵品", type:"pill", price:80,  desc:"凡俗与修士皆宜的疗伤药散。服之气血回复 60 点——禁地之外，疗伤全靠它与打坐行功。", use:{ heal:60 } },

    // —— 新增（景阳城·玄机世家篇） ——
    mo_xinwu:         { id:"mo_xinwu",          name:"玄机令", quality:"上品", type:"material", price:0,   desc:"一枚乌铁腰牌，玄机子随身之物。凭此可面见玄机世家遗孀颜氏。" },
    xiangjia_gongjuan:{ id:"xiangjia_gongjuan", name:"玄龟功完整残卷", quality:"极品", type:"skill", price:0, desc:"玄机子遗箧中搜出的武学全篇。依法修习，皮膜筋骨坚如象甲，防御 +6。", use:{ defBonus:6 } },
    shengxian_ling:   { id:"shengxian_ling",    name:"升仙令", quality:"极品", type:"treasure", price:0,   desc:"沾满泥垢的生锈铁牌，锈迹下隐现云纹。持之可径直拜入青梧谷，亦可看破苍南谷外的幻阵。" },
    mo_shouzha:       { id:"mo_shouzha",        name:"玄机子手札", quality:"极品", type:"treasure", price:0,   desc:"玄机子亲笔所记。末页绘一幅山形图，旁注二字：苍南；另录破阵口诀——「以令映纹，云开见径」。持此可参悟【升仙令】真正的用法。" },

    // —— 新增（苍南小会·散修坊市） ——
    talisman_dingshen:{ id:"talisman_dingshen", name:"定身符", quality:"灵品", type:"talisman", price:70,  desc:"战斗中使用，符光落地，定住敌手身形两回合。", combat:{ stun:2 } },
    talisman_jingang: { id:"talisman_jingang",  name:"金刚符", quality:"灵品", type:"talisman", price:90,  desc:"战斗中使用，金光罩体，获得 60 点护身罡气。",   combat:{ shield:60 } },
    artifact_qingyun: { id:"artifact_qingyun",  name:"青云剑", quality:"上品", type:"artifact", price:600, desc:"下品法器，攻击 +18，速度 +3。", equip:{ atk:18, speed:3 }, maxDur:14 },
    artifact_wujin:   { id:"artifact_wujin",    name:"乌金盾", quality:"上品", type:"artifact", price:520, desc:"下品法器，防御 +10。",                         equip:{ def:10 }, maxDur:16 },
    skill_yufeng:     { id:"skill_yufeng",      name:"御风诀", quality:"上品", type:"skill", price:300, desc:"青木功所载轻身法诀。修习后身法提速 +4，兼得驭风之能：斗法三成闪避、赶路每程省 1 月。（需青木功五层）", use:{ speedBonus:4, learnSpell:"yufeng_shu" } },
    skill_kongwu:     { id:"skill_kongwu",      name:"控物术", quality:"上品", type:"skill", price:320, desc:"以神识御物的基础法术。修习后神识 +4；可同时驾驭两件法器，斗法时法器飞斩。（需青木功六层）", use:{ spiritBonus:4, learnSpell:"kongwu_shu" } },
    skill_huoqiushu:  { id:"skill_huoqiushu",   name:"火球术", quality:"上品", type:"skill", price:400, desc:"五行基础攻击法术。修习后可在斗法中施放【术法·火球术】（45 伤害，冷却 2 回合）。亦可以此术焚尸灭迹。（需青木功四层）", use:{ learnSpell:"huoqiu_shu" } },

    // —— 新增（练气中后期·四阶仙法） ——
    skill_tianyan:    { id:"skill_tianyan",     name:"天眼术", quality:"上品", type:"skill", price:450, desc:"神识探查法门。修习后遭遇强敌可先行看破其气血底细与随身宝物成色。（需青木功七层）", use:{ learnSpell:"tianyan_shu" } },
    skill_lianqi:     { id:"skill_lianqi",      name:"敛气术残卷", quality:"上品", type:"skill", price:380, desc:"敛息匿境之法。修习后对外示人的境界压低四层，劫匪强敌不易盯上。（需青木功五层）", use:{ learnSpell:"lianqi_shu" } },

    // —— 新增（坊市/黑市/掉落）：可习技能秘籍 ——
    skill_bingzhui:   { id:"skill_bingzhui",    name:"冰锥术", quality:"上品", type:"skill", price:360, desc:"五行基础攻击法术。修习后斗法中可施放【术法·冰锥术】（38 伤害，冷却 2 回合）。（需青木功四层）", use:{ learnSpell:"bingzhui_shu" } },
    skill_guisha:     { id:"skill_guisha",      name:"鬼煞术", quality:"极品", type:"skill", price:520, desc:"魔道杀伐之术。修习后斗法中可施放【术法·鬼煞术】（55 伤害，冷却 3 回合）；修习沾染煞气。（需青木功六层）", use:{ learnSpell:"guisha_shu", shaQi:8 } },
    skill_dusha:      { id:"skill_dusha",       name:"毒沙掌", quality:"上品", type:"skill", price:340, desc:"黑市狠辣掌法。修习后斗法中可施放【术法·毒沙掌】（42 伤害，冷却 3 回合）。（需青木功四层）", use:{ learnSpell:"dusha_zhang" } },
    skill_manli:      { id:"skill_manli",       name:"蛮力诀", quality:"灵品", type:"skill", price:0,   desc:"妖兽炼体残篇，落自妖兽尸身。依法修习，筋骨粗壮，攻击 +3（永久）。", use:{ atkBonus:3 } },
    skill_yaoshou:    { id:"skill_yaoshou",     name:"妖兽炼体诀", quality:"灵品", type:"skill", price:0, desc:"妖兽吐纳之法，落自妖兽尸身。依法修习，皮膜坚厚，气血上限 +30（永久）。", use:{ maxHpBonus:30 } },

    // —— 新增（练气中后期）：暗器 / 灵药 / 符箓 ——
    zimu_ren:         { id:"zimu_ren",          name:"子母刃", quality:"上品", type:"dark_weapon", price:420, desc:"子刃藏于母刃，专走死角。战前装备，斗法中两成攻势直击死角，必成重创。", },
    herb_ecao:        { id:"herb_ecao",         name:"恶臭草", quality:"凡品", type:"material", price:15, desc:"奇臭无比的杂草，臭气可盖住灵药药香。百草园暗田催熟时消耗一株，可掩去灵机波动，泄露值不增。" },
    talisman_chuansong:{ id:"talisman_chuansong", name:"传送符", quality:"上品", type:"talisman", price:260, desc:"上古逃命符。血气激发可瞬移百里——血色禁地中随时可用，保你连人带货全身而退。", use:{ teleport:true } },

    // —— 筑基期二阶基础材料（傀儡炼制 / 洞府生产 / 坊市黑市闭环） ——
    // 注：中阶灵石统一复用 mid_stone（与传送阵阵眼供能同物），此处给出权威定义，不再另立 mid_spirit_stone。
    mid_stone:       { id:"mid_stone",       name:"中阶灵石", quality:"极品", type:"material", price:100, desc:"中阶灵石蕴含灵气远胜下品。100 枚低阶灵石方可兑换 1 枚，传送阵阵眼供能所需。" },
    beast_soul:      { id:"beast_soul",      name:"妖兽精魄", quality:"灵品", type:"material", price:35, desc:"二阶妖兽神魂残留，机关傀儡的核心枢纽。狩猎二阶妖兽有几率拘得。" },
    spirit_wood:     { id:"spirit_wood",     name:"百年灵木", quality:"灵品", type:"material", price:25, desc:"坚韧灵木枝干，傀儡骨架主材。玄傀伐木或承露瓶催熟可得。" },
    iron_ore:        { id:"iron_ore",        name:"玄铁矿石", quality:"凡品", type:"material", price:15, desc:"地底玄铁原矿，用于傀儡机括锻造。下矿开采或坊市铁匠铺可得。（噬金虫须喂金石矿料，非此矿。）" },
    tianhuo_crystal: { id:"tianhuo_crystal", name:"天火晶",   quality:"上品", type:"material", price:80, desc:"火系地脉结晶，用于高阶巨猿傀儡与法宝胚胎。魔修尸身或黑市可得。" },
    yin_hun_soul:    { id:"yin_hun_soul",    name:"阴魂精魄", quality:"极品", type:"material", price:0,  desc:"魔修丹田所凝阴魂，傀儡阴煞核心。斩杀魔道筑基修士方有几率到手。" },

    // —— 新增（丹方激活系列）：六色新丹，须先习得对应「丹方」方可开炉 ——
    pill_ningyuan:   { id:"pill_ningyuan",   name:"凝元丹", quality:"灵品", type:"pill", price:120, desc:"筑基通用精进之丹，药力温和。服之修为 +40。", use:{ exp:40 } },
    pill_juling:     { id:"pill_juling",     name:"聚灵丹", quality:"灵品", type:"pill", price:120, desc:"凝灵聚气，疗伤圣品。服之气血回复 120 点——禁地之外重伤可恃。", use:{ heal:120 } },
    pill_qingxin:    { id:"pill_qingxin",    name:"清心丹", quality:"上品", type:"pill", price:260, desc:"清心宁神，稳守灵台。服之心境 +5（突破手感更顺）。", use:{ mind:5 } },
    pill_xugu:       { id:"pill_xugu",       name:"续骨丹", quality:"上品", type:"pill", price:300, desc:"续筋接骨，根基愈牢。服之气血上限 +25（永久）。", use:{ maxHpBonus:25 } },
    pill_huasha:     { id:"pill_huasha",     name:"化煞丹", quality:"灵品", type:"pill", price:150, desc:"以清灵药力涤荡地脉煞气。服之煞气 -20（矿役/杀伐后最宜）。", use:{ shaQi:-20 } },
    pill_yanghun:    { id:"pill_yanghun",    name:"养魂丹", quality:"上品", type:"pill", price:320, desc:"温养神魂，识海渐扩。服之神识 +10（御物搜神更利）。", use:{ spiritBonus:10 } },

    // —— 丹方卷轴（type:recipe）：拾得/购入即研习化入识海，不入储物袋；对应丹药方可开炉 ——
    recipe_ningyuan: { id:"recipe_ningyuan", name:"凝元丹方", quality:"灵品", type:"recipe", price:150, learns:"pill_ningyuan", desc:"凝元丹炼制之法（灵药×2）。黑市/奇遇/副本可得。" },
    recipe_juling:   { id:"recipe_juling",   name:"聚灵丹方", quality:"灵品", type:"recipe", price:150, learns:"pill_juling",   desc:"聚灵丹炼制之法（灵药×2＋恶臭草）。黑市/奇遇/副本可得。" },
    recipe_qingxin: { id:"recipe_qingxin",  name:"清心丹方", quality:"上品", type:"recipe", price:280, learns:"pill_qingxin",  desc:"清心丹炼制之法（千年灵药＋灵药）。黑市/奇遇/副本可得。" },
    recipe_xugu:     { id:"recipe_xugu",     name:"续骨丹方", quality:"上品", type:"recipe", price:320, learns:"pill_xugu",     desc:"续骨丹炼制之法（千年灵药×2＋金砂）。黑市/奇遇/副本可得。" },
    recipe_huasha:   { id:"recipe_huasha",   name:"化煞丹方", quality:"灵品", type:"recipe", price:180, learns:"pill_huasha",   desc:"化煞丹炼制之法（天灵草＋玉魔花）。黑市/奇遇/副本可得。" },
    recipe_yanghun:  { id:"recipe_yanghun",  name:"养魂丹方", quality:"上品", type:"recipe", price:340, learns:"pill_yanghun",  desc:"养魂丹炼制之法（妖兽精魄＋天火晶）。黑市/奇遇/副本可得。" },
};

/* —— 炼丹配方表：按优先级从高到低排列，炼丹时依次匹配 ——
 * （高阶丹优先消耗药材，避免攒筑基丹材料时被低阶丹抢走） */
GAME.DATA.RECIPES = [
    { pill:"pill_zhengpin",  herbs:{ herb_tianling:1, herb_yumo:1, herb_zihou:1 }, stones:100 }, // 血月试炼三药炼正品筑基丹（优先，避免被低阶丹抢走药材）
    { pill:"pill_yanshou",   herbs:{ herb_qiannian:1, herb_bainian:1 },         stones:300 },
    { pill:"pill_zhuji",     herbs:{ herb_qiannian:1, herb_bainian:2 },         stones:200 },
    { pill:"pill_jinsui",    herbs:{ herb_bainian:3 },                          stones:50  },
    { pill:"pill_huanglong", herbs:{ herb_bainian:1 },                          stones:20  },
    // —— 丹方激活系列：须先习得对应「丹方」方可开炉（黑市/奇遇/副本概率获得） ——
    { pill:"pill_ningyuan",  herbs:{ herb_bainian:2 },                 stones:30,  recipe:"recipe_ningyuan" },
    { pill:"pill_juling",    herbs:{ herb_bainian:2, herb_ecao:1 },    stones:30,  recipe:"recipe_juling" },
    { pill:"pill_qingxin",   herbs:{ herb_qiannian:1, herb_bainian:1 }, stones:80, recipe:"recipe_qingxin" },
    { pill:"pill_xugu",      herbs:{ herb_qiannian:2, jinshi:1 },      stones:120, recipe:"recipe_xugu" },
    { pill:"pill_huasha",    herbs:{ herb_tianling:1, herb_yumo:1 },   stones:60,  recipe:"recipe_huasha" },
    { pill:"pill_yanghun",   herbs:{ beast_soul:1, tianhuo_crystal:1 }, stones:120, recipe:"recipe_yanghun" },
];
