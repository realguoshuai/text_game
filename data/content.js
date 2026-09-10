/* =========================================================
 * data/content.js —— 练气期扩展内容配置（纯数据，不含逻辑）
 * 与 realms/items/events/world 同构，全部由 UI / 核心层按 ID 动态读取：
 *   MISSIONS        宗门杂役任务（耗时 / 收益 / 监守自盗 / 煞气）
 *   SECT_EXCHANGE   宗门贡献兑换列表
 *   BLACKMARKET_JUNK 坊市旧货摊未鉴定货架（神识鉴定 / 盲买被坑）
 *   TRIAL           血月试炼（步数 / 进入境界 / 事件池 / 破阵结果）
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

GAME.DATA.CONTENT = {

    /* ============ 一、宗门杂役 ============ */
    MISSIONS: [
        {
            id:"herb_garden", name:"百草园执事", months:6, contrib:6,
            text:"入百草园打理灵田，月月得些辛苦钱，兼可私藏药苗。",
            reward: { stones:[20,40], items:[ { id:"herb_bainian", chance:1, qty:[1,1] } ] },
            // 监守自盗：耗 1 滴绿液催熟私藏药草，15% 被药园长老神识察觉
            steal: {
                liquid:1, gain:{ id:"herb_bainian", qty:1 },
                catchChance:0.15,
                penalty:[
                    { chance:0.5, type:"loseStones", amount:[40,80], text:"药园长老神识扫过，将你私藏灵药与部分身家一并罚没！" },
                    { chance:0.5, type:"age",        amount:[1,3],  text:"长老震怒，一记惩戒神通打得你伤及根基，折寿数载！" },
                ],
            },
        },
        {
            id:"mine_guard", name:"废弃灵矿守卫", months:12, contrib:12,
            text:"守一处废弃灵矿，所得矿料可换灵石，然地脉煞气侵体，气血上限受损。",
            reward: { stones:[50,90], items:[ { id:"ore", chance:1, qty:[1,2] } ] },
            onDone: { shaQi:3, maxHpLoss:5 },  // 地脉煞气：煞气 +3，气血上限 -5
        },
        {
            id:"mortal_heal", name:"世俗行医", months:24, contrib:18,
            text:"下山行医济世，灵石所得极薄，却平安无虞，可制得凡俗毒药。",
            reward: { stones:[20,40], items:[ { id:"poison_mortal", chance:1, qty:[1,1] } ] },
            onDone: {},
        },
    ],

    /* ============ 宗门贡献兑换 ============ */
    SECT_EXCHANGE: [
        { id:"artifact_frag", cost:10, name:"下品法器残片", desc:"贡献 10 兑换，可高价转售（不装备）。" },
        { id:"conceal_skill", cost:25, name:"中品敛气术",   desc:"贡献 25 兑换，修习 +1 敛气等级（黑市更易脱身）。" },
        { id:"fake_zhuji",    cost:40, name:"伪·筑基丹",     desc:"贡献 40 兑换一枚（冲关筑基用，药效虚浮）。" },
        // —— 筑基期材料兑换（巡逻/守矿战功直换） ——
        { id:"beast_soul",  cost:30, name:"妖兽精魄", desc:"战功 30 兑换，傀儡核心枢纽（筑基期材料）。" },
        { id:"spirit_wood", cost:20, name:"百年灵木", desc:"战功 20 兑换，傀儡骨架主材（筑基期材料）。" },
    ],

    /* ============ 地下黑市秘货轮换（筑基期材料） ============ */
    BLACK_ROTATION: {
        months: 3,   // 每 3 个月刷新一次
        goods: [
            { id:"beast_soul",      qtyRange:[1,3], price:35 },   // 妖兽精魄：限量 1~3 份
            { id:"tianhuo_crystal", qtyRange:[1,1], price:80 },   // 天火晶：常备 1 份
        ],
    },

    /* ============ 二、坊市旧货摊（未鉴定货架） ============ */
    /* needSpirit：鉴定所需神识阈值；realId：鉴定后真实产物（treasure=false 为废铁） */
    BLACKMARKET_JUNK: [
        { id:"junk_rusty",    price:40, needSpirit:8,  realId:"sword_fragment",   treasure:true  },
        { id:"junk_furnace",  price:55, needSpirit:10, realId:"ancient_fragment", treasure:true  },
        { id:"junk_skin",     price:35, needSpirit:7,  realId:"junk_scrap",       treasure:false },
    ],

    /* ============ 二·甲、黑市秘籍货架（魔道功法，修习沾染煞气） ============ */
    BLACK_SKILLS: [
        { id:"skill_guisha", price:520 },
        { id:"skill_dusha",  price:340 },
    ],

    /* ============ 四、血月试炼 ============ */
    TRIAL: {
        steps: 20,            // 固定 20 步探索倒计时
        enterRealm: 9,        // 进入条件：练气十层（index 9）及以上、寿元未尽
        cooldownMonths: 6,    // 出入一次后，须候 6 月方可再入（副本日常化：形成节奏）
        herbs: ["herb_tianling","herb_yumo","herb_zihou"],  // 三味主药（集齐可在洞府炼正品筑基丹）
        events: [
            { type:"gather", weight:34 },                              // 采集筑基丹主药
            { type:"combat", weight:40, monsters:["trial_elite_zheng","trial_elite_mo"] }, // 正魔精英截杀
            { type:"array",  weight:26 },                              // 古修遗迹破阵（神识/阵法检定）
        ],
        // 破阵事件结果（按 chance 抽取）
        array: [
            { chance:0.50, type:"loot",   text:"你以神识强破残阵，阵眼灵物入手！", table:[
                { id:"herb_qiannian",  chance:0.40, qty:[1,1] },
                { id:"talisman_huoqiu", chance:0.50, qty:[1,1] },
            ]},
            { chance:0.30, type:"damage", text:"阵法反噬，灵光透体！", hp:[20,40] },
            { chance:0.20, type:"stones", text:"残阵崩塌，你于瓦砾中拾得几枚灵石。", amount:[20,50] },
        ],
        // 高阶灵药黑市销赃价（远高于正规坊市，但会招来神识尾随）
        blackPrice: { herb_bainian:150, herb_qiannian:600 },
    },

    /* ============ 三、玄机子与夺舍对决（苍梧门篇大关卡） ============ */
    /* 触发：突破至练气四层（realmIndex=3）。多阶段事件流，由 js/moEvent.js 驱动。 */
    MODAIFU: {
        triggerRealm: 3,        // 突破至练气四层即触发
        enemySoul: 14,          // 敌方元神值（玄机子 + 余子童合体），阶段三吞噬判定基准
        stage1: {
            text:"玄机子骤然出手，一指点向你要穴——这是要废去你全身功力！",
            failHpRatio:0.50,   // 未佩护心镜则扣 50% 气血
            mirrorText:"护心镜一震，乌光四溅，你只略受震荡便稳住身形。",
            noMirrorText:"要穴被封，一股阴寒直透心脉，你气血骤失五成！",
        },
        stage2: {
            monster:"mo_daifu",
            text:"玄机子催动《魔银手》，肉身坚逾精钢——寻常利刃砍刺被尽数弹开，须以暗器、符箓或奇招破防！",
        },
        stage3: {
            text:"你气血耗尽，神识却借青木功护持未散，一头撞入识海——玄机子与余子童的元神正在撕扯厮杀！",
            baseChance:0.30,     // 基础吞噬成功率
            perLayer:0.10,      // 青木功每多一层加成
            bellBonus:0.30,     // 持有摄魂钟额外加成（镇魂）
            winText:"你以青木功为网，将两缕元神尽数吞下！神识大涨，玄机子毕生所学尽归你所有。",
            loseText:"元神反噬，你神识几近溃散，险些形神俱灭……",
        },
        reward: {
            changchunUp:6,      // 《青木功续篇》提升层数（4 -> 10）
            items:["yinhun_zhong","mo_xinwu"],  // 摄魂钟（随从页)*/催动激活玄傀）+ 玄机令（景阳城面见颜氏的敲门砖）
            yinduYears:2,       // 体内阴毒倒计时（年）
        },
        warmYang: {
            item:"nuan_yang_bao_yu",
            text:"景阳城玄机世家藏有【暖阳宝玉】，服之可驱阴毒——须在两年之内求得，否则道消身陨。",
        },
    },

    /* ============ 五、血色禁地大逃杀（练气中后期核心副本） ============ */
    /* 进入：练气十层以上。25 步倒计时，无自然回血，步数耗尽前须寻得【出口法阵】。
     * 由 js/forbidden_zone.js 驱动；战斗经 ctx.type="fzone" 回路由 afterCombat 结算。 */
    FZONE: {
        enterRealm: 9,          // 练气十层（index 9）
        cooldownMonths: 12,     // 三处药田被惊动后须候 12 月才复旧（副本日常化）
        herbs: ["herb_tianling","herb_yumo","herb_zihou"],
        // 三处药田：各由一头守护兽看守，闯入即战，胜则夺药（无迷雾、无步数、纯对战）
        fields: {
            herb_tianling: { label:"天灵药田", beast:"fz_beast_tian", guardian:"独角巨兽",
                text:"东山缓坡上，天灵草结着淡青灵果——一头独角巨兽卧在药畦之畔，腥风扑面。" },
            herb_yumo:     { label:"雨墨药田", beast:"fz_beast_yu",   guardian:"鳞甲水兽",
                text:"沼泽中央一方黑土，雨墨芝隐现乌光——一条鳞甲水兽自浊水中昂首，双目幽绿。" },
            herb_zihou:    { label:"紫喉药田", beast:"fz_beast_zi",   guardian:"乌紫巨猿",
                text:"背阴石隙间，紫喉草吐着妖异紫芒——一头通体乌紫的巨猿捶胸咆哮，震落碎石。" },
        },
        restCount: 2,           // 禁地内可调息疗伤的次数（替代原灵泉眼）
        restHealPct: 0.45,      // 每次调息回复的气血比例
        restMonths: 1,          // 每次调息耗去的月数
        reward: { contribPerHerb:20, fullSetContrib:100, fullSetPill:"pill_zhengpin",
            // 阶梯赏赐：未集齐三药也有像样回报（不必硬凑三药才不白干）
            partialReward: { 1: { contrib:30, stones:80 }, 2: { contrib:70, stones:200 } } },
    },

    /* ============ 洞府建设（长线养成） ============ */
    // 四类设施各三级；升级耗灵石 + 月数，高阶另需材料。等级自 0 起（0 = 未开辟）。
    HOME: {
        intro: "洞府乃修士安身立命之本。灵田供药、丹房成丹、藏经阁悟道、大阵御敌——四者皆须灵石与光阴，一寸寸攒起来。",
        facilities: [
            { id:"lingtian", name:"灵田", desc:"园中辟灵田，凡所种植皆能多收几株。",
              levels:[
                { stones:120,  months:2, effect:"种植收获 +1 株", yieldBonus:1 },
                { stones:360,  months:3, items:{ herb_ecao:3 }, effect:"种植收获 +2 株", yieldBonus:2 },
                { stones:900,  months:4, items:{ herb_qiannian:1, herb_ecao:5 }, effect:"种植收获 +3 株", yieldBonus:3 },
              ] },
            { id:"danfang", name:"丹房", desc:"炉火渐稳，成丹更省灵石，偶得双丹之喜。",
              levels:[
                { stones:150,  months:2, effect:"炼丹耗灵石 -10%，一成概率双丹", alchemyDiscount:0.10, doublePill:0.10 },
                { stones:420,  months:3, items:{ artifact_frag:2 }, effect:"炼丹耗灵石 -20%，两成概率双丹", alchemyDiscount:0.20, doublePill:0.20 },
                { stones:1000, months:4, items:{ artifact_frag:4, herb_qiannian:1 }, effect:"炼丹耗灵石 -30%，三成概率双丹", alchemyDiscount:0.30, doublePill:0.30 },
              ] },
            { id:"cangjing", name:"藏经阁", desc:"典籍齐备，闭门吐纳亦有所得。",
              levels:[
                { stones:180,  months:2, effect:"打坐修为 +1（每次）", meditateExp:1 },
                { stones:480,  months:3, items:{ artifact_frag:2 }, effect:"打坐修为 +2（每次）", meditateExp:2 },
                { stones:1100, months:4, items:{ yinhun_zhong:1 }, effect:"打坐修为 +3（每次）", meditateExp:3 },
              ] },
            { id:"hufa", name:"护山大阵", desc:"阵法护持洞府，气血自壮，行迹难寻。",
              levels:[
                { stones:250,  months:3, effect:"气血上限 +30，黑市被尾随概率 -8%", hpBonus:30,  tailReduce:0.08 },
                { stones:600,  months:3, items:{ talisman_jingang:2 }, effect:"气血上限 +60，黑市被尾随概率 -15%", hpBonus:60, tailReduce:0.15 },
                { stones:1400, months:5, items:{ talisman_jingang:4, artifact_frag:3 }, effect:"气血上限 +100，黑市被尾随概率 -25%", hpBonus:100, tailReduce:0.25 },
              ] },
        ],
    },

    /* ============ 秘闻（图鉴·见闻录：由剧情节点解锁） ============ */
    LORE: [
        { id:"lore_changchun", name:"青木功",     text:"玄机子所传《青木功》，本是魔道「苍梧门」外门弟子入门的粗浅功法。你练了许久才明白：它不快，但极韧——修为进得慢，根基却比谁都牢。" },
        { id:"lore_shichong",  name:"尸虫丸",     text:"玄机子以尸虫炼成的毒丸，服下后十二个月内须夺舍他人，否则虫噬心脉而亡。你至今记得那丸子入喉时的腥冷。" },
        { id:"lore_shengxian", name:"升仙令",     text:"那枚锈铁牌原是山中异人交托之物，托玄机子寻「有缘持令之人」。玄机子以重金与一条人命换来，却至死未能参透——「以令映纹，云开见径」八字，才是它真正的用处。" },
        { id:"lore_moyinshou", name:"魔银手",     text:"玄机子一身横练功夫，原是以活人手掌浸炼「魔银手」胚药熬出来的。药庐深处那口瓦瓮，你后来再没敢看第二眼。" },
        { id:"lore_tainan",    name:"苍南小会",   text:"七派每数十年于苍南谷设小会，以升仙大会遴选弟子。谷外设幻阵，无令者终生不得其门而入——持令者，云开见径。" },
        { id:"lore_xuese",     name:"血色禁地",   text:"禁地三处药田，各有守护妖兽盘踞。天灵果、玉髓芝、紫猴花，三位主药齐聚，方可炼正品筑基丹。历代死在里头的散修，比活出来的多十倍。" },
        { id:"lore_dongfu",    name:"洞府初成",   text:"修士安身立命，终须一处洞府。灵田、丹房、藏经阁、护山大阵——四者俱全者，方算在这乱世里扎下了根。" },
        { id:"lore_zhuji",     name:"筑基道成",   text:"练气十三层，层层皆是凡人的坎。跨过筑基，寿元延至二百岁，才算真正踏上了修仙路——而这条路，比你想的长得多。" },
    ],

    /* ============ 六、宗门生态（拜入青梧谷后解锁） ============ */
    /* 杂役执事分流 + 百草园管事「借鸡生蛋」。由 js/sect.js 驱动。 */
    SECT2: {
        sectId: "huangfenggu",
        mine: { months:6, stones:[60,100], maxHpLoss:4, contrib:8,
            text:"灵矿挖矿：地底灵脉煞气蚀骨，气血上限受损，然矿砂可换灵石。" },
        copy: { months:4, contrib:12, stones:[10,20],
            text:"传功阁抄书：替执事誊抄功法拓本，清贵安稳，贡献优厚。" },
        garden: {
            bribeContrib:60, bribeStones:200,   // 任职门槛：贡献 60 或 灵石 200 行贿执事长老
            dueMonths:6, quotaHerb:"herb_bainian", quotaQty:10,    // 每半年结上交 10 株常规草药
            settleContrib:10, kickPenalty:30,   // 按时上交得贡献；逾期褫夺管事并罚贡献
            catchChanceNoJob:0.15,               // 非管事的青梧谷弟子私催灵药：15% 被神识查获（散修旧路）
            springBonusChance:0.20,              // 灵眼之泉：管事专属，催熟 0% 泄露且两成概率双收
            /* —— 泄露值体系（暗田催熟累积）—— */
            leakPerCatalyze:10,                  // 每次无掩盖暗田催熟 +10 泄露
            leakWarn:80,                         // ≥80：红灯预警——长老神识将于下月掠过药园
            leakCaught:100,                      // ≥100：必被查获（下月掠园时罚药罚灵石）
            leakReset:40,                        // 查获后泄露值回落，留改过余地
            catchStones:[80,150],                // 查获罚没灵石区间
        },
    },
};
