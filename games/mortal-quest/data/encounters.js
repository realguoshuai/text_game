/* =========================================================
 * data/encounters.js —— 野外遭遇生态（纯数据，不含逻辑）
 *
 * 【为什么要有这张表】
 *   旧版野外历练只有三个死怪（铁齿狼 55 血 / 黑衣散修 / 铁齿狼王），
 *   练气十二层撞上的仍是同一只 55 血铁齿狼——打赢了也像踩死一只蚂蚁。
 *   本表把「谁会出现」与「它会掉什么」拆成两张表，由 js/encounter.js 裁定。
 *
 * 【ZONES】地图节点 → 区域档
 *   zone: wild 山野 | city 城池 | sect 宗门秘境 | sea 星海
 *   未列出的节点按 MAP.nodes.kind 兜底（cave→wild / mortal→city / immortal→sect）
 *
 * 【POOLS】区域 → 遭遇池
 *   band    [minRealm, maxRealm]：修为不在带内不出现（练气不该撞上筑基邪修）
 *   weight  权重
 *   elite   true 者战前会有「气机不弱」提示
 * 怪物条目统一带 lootClass（掉落阶级，见下）与 scalable（数值随动缩放）标记。
 *
 * 【LOOT_CLASS 掉落阶级】—— 严规：小怪不爆灵药，千年灵药绝禁野外
 *   beast   普通野兽/低阶妖虫：兽皮、碎骨、低阶矿石、少量灵石
 *   minion  低阶小怪/毛贼：符箓、低阶丹药、材料、灵石
 *   elite   精英/邪修/修士：符箓、中低阶丹药、法器残片、灵石
 *   boss    首领/高阶大妖：百年灵药、稀有法器残片、上品丹药
 *   校验在 js/encounter.js 的 lootFilter()：即便日后有人往数据里塞了
 *   千年灵药，也过不了这道闸（详见该函数注释）。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};
GAME.DATA.MONSTERS = GAME.DATA.MONSTERS || [];

/* ——————— ① 低阶材料（野兽身上的东西，仅此处产出） ——————— */
GAME.DATA.ITEMS.beast_hide = {
    id: "beast_hide", name: "妖兽皮毛", quality: "凡品", type: "material", price: 26,
    desc: "剥得整张的妖兽皮毛，毛根还带着血气。坊市收去做护甲内衬，值几枚灵石。",
};
GAME.DATA.ITEMS.beast_bone = {
    id: "beast_bone", name: "妖兽碎骨", quality: "凡品", type: "material", price: 12,
    desc: "妖兽的筋骨碎料，炼器铺子收去磨粉入炉，聊胜于无。",
};

/* ——————— ② 野外遭遇怪物（数值会在开战时按玩家境界随动缩放） ——————— */
GAME.DATA.MONSTERS.push(
    /* ===== 山野区（幽篁谷 / 青牛镇）：野狼、毛贼、低阶毒蛛 ===== */
    {
        id: "wild_yehu", name: "幽篁野狼 · 一阶妖兽", isBeast: true, tier: 1,
        hp: 70, atk: 11, def: 3, speed: 9, spirit: 4, exp: 24,
        stones: [6, 16], killChance: 0.06, loseAge: [0, 1], loseStonePct: [0.2, 0.4],
        scalable: true, lootClass: "beast", region: "wild",
        loot: [
            { id: "beast_hide", chance: 0.55, qty: [1, 1] },
            { id: "beast_bone", chance: 0.35, qty: [1, 2] },
            { id: "ore",        chance: 0.12, qty: [1, 1] },
        ],
        desc: "谷中狼群本就不少，这两年越发肥了，见人便红着眼睛扑上来。",
    },
    {
        id: "wild_shanzei", name: "剪径蟊贼 · 山道劫掠", human: true,
        hp: 88, atk: 13, def: 5, speed: 8, spirit: 7, exp: 28,
        stones: [12, 34], killChance: 0.12, loseAge: [0, 1], loseStonePct: [0.3, 0.6],
        scalable: true, lootClass: "minion", region: "wild",
        loot: [
            { id: "talisman_huoshe", chance: 0.16, qty: [1, 1] },
            { id: "pill_huichun",    chance: 0.18, qty: [1, 1] },
            { id: "beast_hide",      chance: 0.25, qty: [1, 1] },
            { id: "ore",             chance: 0.15, qty: [1, 1] },
        ],
        desc: "山道旁的蟊贼，手里那柄卷刃柴刀倒还拿得稳——只是道行浅得很。",
    },
    {
        id: "wild_duzhu", name: "山穴毒蛛 · 一阶妖虫", isBeast: true, tier: 1,
        hp: 62, atk: 12, def: 2, speed: 12, spirit: 5, exp: 22,
        stones: [5, 14], killChance: 0.08, loseAge: [0, 1], loseStonePct: [0.2, 0.4],
        scalable: true, lootClass: "beast", region: "wild",
        loot: [
            { id: "poison_mortal", chance: 0.30, qty: [1, 1] },
            { id: "beast_hide",    chance: 0.35, qty: [1, 1] },
            { id: "beast_bone",    chance: 0.30, qty: [1, 2] },
        ],
        desc: "石缝里爬出一只八足毒蛛，足尖泛着青黑——被它螫上一口，先麻后疼。",
    },

    /* ===== 城池区（景阳城 / 云京）：黑市劫修、世家护卫、炼尸 ===== */
    {
        id: "city_jiexiu", name: "黑市劫修 · 夜市尾随", human: true, cultivator: true,
        hp: 110, atk: 16, def: 6, speed: 11, spirit: 10, exp: 40,
        stones: [30, 80], killChance: 0.18, loseAge: [1, 2], loseStonePct: [0.4, 0.8],
        scalable: true, lootClass: "elite", region: "city",
        loot: [
            { id: "talisman_huoqiu", chance: 0.26, qty: [1, 1] },
            { id: "pill_huanglong",  chance: 0.18, qty: [1, 1] },
            { id: "artifact_frag",   chance: 0.14, qty: [1, 1] },
        ],
        desc: "巷口转出一名黑袍修士，指尖扣着符纸：「这条街的规矩，道友怕是还不懂。」",
    },
    {
        id: "city_huwei", name: "世家护卫 · 甲胄在身", human: true,
        hp: 130, atk: 15, def: 11, speed: 9, spirit: 8, exp: 42,
        stones: [40, 100], killChance: 0.16, loseAge: [1, 2], loseStonePct: [0.4, 0.7],
        scalable: true, lootClass: "elite", region: "city",
        loot: [
            { id: "talisman_hushen", chance: 0.22, qty: [1, 1] },
            { id: "pill_huichun",    chance: 0.24, qty: [1, 1] },
            { id: "artifact_frag",   chance: 0.12, qty: [1, 1] },
        ],
        desc: "门阀府邸的护院，甲叶铮亮，长刀横在街心——世家的人，可不管你是哪家修士。",
    },
    {
        id: "city_lianshi", name: "炼尸 · 阴气缠身", human: true, cultivator: true,
        hp: 150, atk: 17, def: 8, speed: 7, spirit: 5, exp: 46,
        stones: [35, 90], killChance: 0.20, loseAge: [1, 2], loseStonePct: [0.3, 0.6],
        scalable: true, lootClass: "elite", region: "city",
        loot: [
            { id: "poison_mortal", chance: 0.30, qty: [1, 1] },
            { id: "artifact_frag", chance: 0.16, qty: [1, 1] },
            { id: "beast_bone",    chance: 0.40, qty: [1, 2] },
        ],
        desc: "乱葬岗般的腥甜气里立着一具「东西」：指甲发黑，喉间漏出风箱般的声响。",
    },

    /* ===== 宗门秘境区（苍南谷 / 青梧谷 / 妖兽海眼）：墨蛟、婴鲤兽、魔道邪修 ===== */
    {
        id: "sect_mojiao", name: "墨蛟 · 一阶巅峰妖兽", isBeast: true, tier: 1,
        hp: 260, atk: 24, def: 14, speed: 13, spirit: 14, exp: 90,
        stones: [80, 180], killChance: 0.30, loseAge: [2, 4], loseStonePct: [0.5, 0.9],
        scalable: true, lootClass: "elite", region: "sect",
        loot: [
            { id: "beast_hide", chance: 0.70, qty: [1, 2] },
            { id: "beast_bone", chance: 0.60, qty: [1, 2] },
            { id: "talisman_huoqiu", chance: 0.22, qty: [1, 1] },
        ],
        desc: "潭水无风自起浪，一条丈许墨蛟破水而出，鳞甲上还挂着别家的法器碎片。",
    },
    {
        id: "sect_yingli", name: "婴鲤兽 · 一阶妖兽", isBeast: true, tier: 1,
        hp: 230, atk: 22, def: 10, speed: 17, spirit: 16, exp: 85,
        stones: [70, 160], killChance: 0.28, loseAge: [2, 4], loseStonePct: [0.5, 0.9],
        scalable: true, lootClass: "elite", region: "sect",
        loot: [
            { id: "beast_bone", chance: 0.60, qty: [1, 2] },
            { id: "ore",        chance: 0.35, qty: [1, 2] },
            { id: "talisman_hushen", chance: 0.20, qty: [1, 1] },
        ],
        desc: "溪面漾开一圈涟漪，婴鲤兽化作一线白影贴水而来，快得叫人眼花。",
    },
    {
        id: "sect_xiexiu", name: "魔道邪修 · 采补之流", human: true, cultivator: true,
        hp: 200, atk: 26, def: 12, speed: 12, spirit: 18, exp: 95,
        stones: [100, 220], killChance: 0.35, loseAge: [2, 5], loseStonePct: [0.6, 1.0],
        scalable: true, lootClass: "elite", region: "sect",
        loot: [
            { id: "talisman_dici",   chance: 0.30, qty: [1, 1] },
            { id: "pill_huanglong",  chance: 0.24, qty: [1, 1] },
            { id: "artifact_frag",   chance: 0.18, qty: [1, 2] },
        ],
        desc: "一名修士自树影里踱出，唇色乌青、眼底泛红：「道友这身气血，倒是难得的成色。」",
    },
    {
        id: "sect_zhuji_sanxiu", name: "筑基散修 · 独行客", human: true, cultivator: true, foundation: true,
        hp: 260, atk: 30, def: 16, speed: 13, spirit: 22, exp: 120,
        stones: [120, 260], killChance: 0.38, loseAge: [3, 6], loseStonePct: [0.6, 1.0],
        scalable: true, lootClass: "elite", region: "sect",
        loot: [
            { id: "talisman_jingang", chance: 0.26, qty: [1, 1] },
            { id: "pill_jinsui",      chance: 0.20, qty: [1, 1] },
            { id: "artifact_frag",    chance: 0.25, qty: [1, 2] },
        ],
        desc: "对方一身青袍洗得发白，剑穗却系得齐整——筑基独修，不肯与宗门为伍的那一类。",
    },

    /* ===== 高阶带：结丹、元婴境界各自的对号入座（低带怪名不该拖到元婴还叫"一阶"） ===== */
    {
        id: "sect_moxiu_jiedan", name: "血魔宗长老 · 结丹期", human: true, cultivator: true,
        hp: 520, atk: 60, def: 34, speed: 18, spirit: 45, exp: 260,
        stones: [300, 640], killChance: 0.35, loseAge: [4, 8], loseStonePct: [0.5, 0.9],
        scalable: true, lootClass: "elite", region: "sect",
        loot: [
            { id: "talisman_jingang", chance: 0.28, qty: [1, 1] },
            { id: "pill_jinsui",      chance: 0.30, qty: [1, 1] },
            { id: "artifact_frag",    chance: 0.30, qty: [1, 2] },
            { id: "tianhuo_crystal",  chance: 0.18, qty: [1, 1] },
        ],
        desc: "血魔宗的长老自云端落下，一袭黑袍无风自鼓：「散修也敢在苍南伸手？」",
    },
    {
        id: "city_moxiu_jiedan", name: "幽冥教执事 · 结丹期", human: true, cultivator: true,
        hp: 480, atk: 56, def: 30, speed: 20, spirit: 48, exp: 240,
        stones: [280, 600], killChance: 0.32, loseAge: [4, 8], loseStonePct: [0.5, 0.9],
        scalable: true, lootClass: "elite", region: "city",
        loot: [
            { id: "talisman_dici",   chance: 0.30, qty: [1, 1] },
            { id: "pill_jinsui",     chance: 0.26, qty: [1, 1] },
            { id: "artifact_frag",   chance: 0.28, qty: [1, 2] },
        ],
        desc: "皇城夜禁之后，一个执事模样的黑袍人拦住去路，袖口绣着幽冥教的血纹。",
    },
    {
        id: "sect_yuanying_sanxiu", name: "元婴散修 · 海外客", human: true, cultivator: true,
        hp: 900, atk: 96, def: 56, speed: 26, spirit: 78, exp: 420,
        stones: [500, 1000], killChance: 0.30, loseAge: [6, 12], loseStonePct: [0.5, 0.9],
        scalable: true, lootClass: "elite", region: "sect",
        loot: [
            { id: "talisman_shenxing", chance: 0.24, qty: [1, 1] },
            { id: "pill_xugu",         chance: 0.26, qty: [1, 1] },
            { id: "artifact_frag",    chance: 0.35, qty: [1, 3] },
            { id: "tianhuo_crystal",  chance: 0.30, qty: [1, 2] },
        ],
        desc: "一名海外散修踩着元气长虹掠过，见你在此，眼中贪婪一闪——「同道，让开」是不必说了。",
    },

    /* ===== 各区首领（低权重）：可出百年灵药，绝不出千年灵药 ===== */
    {
        id: "city_boss_moxiu", name: "血衣魔修 · 凶名在外", human: true, cultivator: true,
        hp: 210, atk: 25, def: 12, speed: 12, spirit: 16, exp: 110,
        stones: [120, 260], killChance: 0.20, loseAge: [2, 5], loseStonePct: [0.5, 0.9],
        scalable: true, lootClass: "boss", region: "city",
        loot: [
            { id: "herb_bainian",  chance: 0.28, qty: [1, 1] },
            { id: "artifact_frag", chance: 0.35, qty: [1, 2] },
            { id: "pill_jinsui",   chance: 0.22, qty: [1, 1] },
            { id: "talisman_jingang", chance: 0.25, qty: [1, 1] },
        ],
        desc: "半条街忽然静了。一件血衣悬在半空，衣下无人——血衣魔修的名头，就是这么来的。",
    },
    {
        id: "sect_xuejiao", name: "血蛟 · 二阶大妖", isBeast: true, tier: 2,
        hp: 380, atk: 30, def: 18, speed: 14, spirit: 20, exp: 160,
        stones: [180, 360], killChance: 0.22, loseAge: [3, 6], loseStonePct: [0.5, 0.9],
        scalable: true, lootClass: "boss", region: "sect",
        loot: [
            { id: "herb_bainian",  chance: 0.32, qty: [1, 1] },
            { id: "artifact_frag", chance: 0.40, qty: [1, 2] },
            { id: "pill_jinsui",   chance: 0.20, qty: [1, 1] },
        ],
        desc: "水泽深处妖气翻涌，一头血鳞巨蛟昂首出水——它不是来觅食的，是来收过路钱的。",
    }
);

/* ——————— ③ 地图节点 → 区域档 ——————— */
GAME.DATA.ZONES = {
    shenshou_gu:    { zone: "wild", name: "幽篁谷" },
    qingniu_zhen:   { zone: "wild", name: "青牛镇" },
    jiayuan_cheng:  { zone: "city", name: "景阳城" },
    yuejing_cheng:  { zone: "city", name: "云京" },
    tainan_gu:      { zone: "sect", name: "苍南谷" },
    huangfeng_gu:   { zone: "sect", name: "青梧谷" },
    yaoshou_haiyan: { zone: "sect", name: "妖兽海眼" },
    luanxing_hai:   { zone: "sea",  name: "碎星海" },
    xingque_neihai: { zone: "sea",  name: "星阙内海" },
    luanxing_zongtan: { zone: "sea", name: "乱星盟总坛" },
};

/* ——————— ④ 区域遭遇池（band = 修为带，weight = 权重，elite = 战前提示） ——————— */
GAME.DATA.POOLS = {
    wild: {
        name: "山野",
        list: [
            { id: "wild_yehu",     band: [0, 13], weight: 34 },
            { id: "wild_shanzei",  band: [0, 13], weight: 26 },
            { id: "wild_duzhu",    band: [0, 13], weight: 22 },
            { id: "wolfking",      band: [2, 13], weight: 9,  elite: true },
        ],
    },
    city: {
        name: "城郭",
        list: [
            { id: "city_jiexiu",   band: [3, 16], weight: 32 },
            { id: "city_huwei",    band: [3, 16], weight: 26 },
            { id: "city_lianshi",  band: [5, 15], weight: 20 },
            { id: "city_boss_moxiu", band: [6, 15], weight: 8, elite: true },
            { id: "city_moxiu_jiedan", band: [16, 21], weight: 26 },
        ],
    },
    sect: {
        name: "宗门秘境",
        list: [
            { id: "sect_mojiao",   band: [5, 12], weight: 26 },
            { id: "sect_yingli",   band: [5, 12], weight: 24 },
            { id: "sect_xiexiu",   band: [6, 12], weight: 24 },
            { id: "sect_zhuji_sanxiu", band: [13, 15], weight: 20, elite: true },
            { id: "sect_xuejiao",  band: [13, 15], weight: 10, elite: true },
            { id: "sect_moxiu_jiedan", band: [16, 18], weight: 26 },
            { id: "sect_yuanying_sanxiu", band: [19, 21], weight: 30, elite: true },
        ],
    },
    /* 星海非本任务范围：沿用 MAP_ENCOUNTERS 的原有分带，此处只给一个不空池的兜底 */
    sea: {
        name: "星海",
        list: [
            { id: "wild_sanxiu",   band: [16, 21], weight: 30 },
            { id: "sect_xiexiu",   band: [16, 21], weight: 30 },
        ],
    },
};
