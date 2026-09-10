/* =========================================================
 * data/worldmap.js —— 岚州大地图 + 苍南小会配置（纯数据，不含逻辑）
 *
 * GAME.DATA.MAP
 *   start    开局所在节点 id
 *   nodes    节点列表：id / name / kind / desc / reqRealm / reqSect / actions
 *            kind: cave 洞府故地 | mortal 凡俗城池 | immortal 修仙之地
 *            reqRealm  踏入此地的最低境界（REALMS 下标），修为不到便上不了路
 *            reqSect   本派门人不拘 reqRealm（持身份玉简者可直入）
 *            reqText   未达标时的拒辞（由 GAME.Map.lockMsg 补上「当前 X，需 Y 以上」）
 *            actions: 地点专属行动 { id, label, hint }（由 GAME.Map.doAction 驱动）
 *   routes   节点间道路 { from, to, months, silver }（双向通行，代价相同）
 *   array    苍南谷外围幻阵门槛：满足其一方可进入（独立于 reqRealm，另行检定）
 *   silver   银两兑换比（世俗盘缠；苍南山之后全面转灵石经济）
 *
 * GAME.DATA.TAINAN
 *   goods    散修坊市常备目录（固定价格，不再有任何世俗银两参与）
 *   leitai   升仙大会擂台三轮对手（对应 MONSTERS 中的 shengxian_p1~p3）
 *   reward   独占前三名所得
 *   token    出示【升仙令】保送拜山的门派与所得
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

GAME.DATA.MAP = {

    start: "shenshou_gu",

    // 解锁梯度：练气三层出山 → 四层赴岚州腹地 → 六层涉足散修之地 → 圆满方够资格谒见宗门
    nodes: [
        {
            id: "shenshou_gu", name: "幽篁谷", kind: "cave", reqRealm: 0,
            desc: "苍梧门后山的旧谷。谷深处那孔石洞是你闭关多年的所在，承露瓶仍在囊中。厉长风还在山下营生，若说再见，恐需些时日。",
            actions: [
                { id: "farewell", label: "向厉长风辞行", hint: "故人赠银做盘缠，心境 +5" },
            ],
        },
        {
            id: "qingniu_zhen", name: "青牛镇", kind: "mortal", reqRealm: 2,
            reqText: "出山只百里，蛊毒虫豸与剪径蟊贼却认不得你这点道行。",
            desc: "你出生长大的小镇，青石街、老槐树、父母兄妹皆在此处。凡俗烟火气最重，也最伤修道人的心境。",
            actions: [
                { id: "visit_family", label: "回乡探亲", hint: "耗时 1 个月，断尘缘，心境 +10" },
            ],
        },
        {
            id: "jiayuan_cheng", name: "景阳城", kind: "mortal", reqRealm: 3,
            reqText: "去岚州腹地千里之遥，没练气四层的手段，只怕走不到城下。",
            desc: "岚州腹地的繁华大城，商贾辐辏，市井喧嚣。惊蛟会盘踞城中，而玄机世家的门楣正悬着白绫——玄机子死讯已传开数月了。",
            actions: [
                { id: "mo_house", label: "登门玄机世家", hint: "求见玄机子发妻颜氏，谋暖阳宝玉" },
            ],
        },
        {
            id: "tainan_gu", name: "苍南山·苍南谷", kind: "immortal", reqRealm: 5,
            reqText: "散修之地不问出身只问拳头，道行不足者入谷便是任人宰割的肥羊。",
            desc: "散修云集的去处。谷外围着一层掩形幻阵，肉眼凡胎只见寻常山岭；入了谷，三教九流的修仙者在此换取灵药、法器与法术，每隔数年更有升仙大会在此开擂。",
            actions: [],
        },
        {
            id: "huangfeng_gu", name: "青梧谷", kind: "immortal", reqRealm: 12, reqSect: "huangfenggu",
            reqText: "青梧谷护山大阵森严，练气圆满以下，连那条青石山道都走不到头。",
            desc: "云国四大宗门之一的山门所在。枫林深处殿宇连绵，门人往来皆驾灵光。此处不再是散修的江湖——有宗门、有职司，也有规矩。",
            actions: [],
        },
        {
            id: "yuejing_cheng", name: "云京·皇城", kind: "immortal", reqRealm: 13,
            reqText: "皇城米贵，居之不易——筑基修士方有资格在云国庙堂之侧走动而不被豺狼盯上。",
            teaser: "云国帝都，气象森严。近来城中夜夜有血气冲霄，黑袍人出没坊间—— 幽冥教的手已伸进了皇宫。",
            desc: "云国帝都。宫阙连云，禁军甲胄鲜明。可只有修行者知道，这座皇城的地底，正蛰伏着一头择人而噬的血魔。",
            actions: [
                { id: "heisha_raid", label: "夜探皇宫", hint: "潜入皇城，查幽冥教之乱（筑基副本）" },
            ],
        },
        {
            id: "luanxing_hai", name: "碎星海", kind: "immortal", reqRealm: 21,
            reqText: "碎星海在万里重洋之外，凡俗海船去不得——须筑基九层灵力圆满、御器跨海，方可一搏。",
            teaser: "万里之外的修仙群岛，妖修与散修杂处，灵药灵矿遍地——那是结丹之后的世界。",
            desc: "？？？",
            actions: [],
        },
    ],

    // 双向道路：months = 单程耗时（月），silver = 单程盘缠（世俗银两）
    // 注：目标地的 reqRealm / 幻阵门槛由 GAME.Map.canTravel 另行检定，与下列代价无关
    routes: [
        { id: "r_sg_qn",  from: "shenshou_gu",   to: "qingniu_zhen",  months: 2, silver: 30  },
        { id: "r_qn_jy",  from: "qingniu_zhen",  to: "jiayuan_cheng", months: 2, silver: 60  },
        { id: "r_sg_jy",  from: "shenshou_gu",   to: "jiayuan_cheng", months: 4, silver: 110 },
        { id: "r_jy_tn",  from: "jiayuan_cheng", to: "tainan_gu",     months: 3, silver: 90  },
        { id: "r_qn_tn",  from: "qingniu_zhen",  to: "tainan_gu",     months: 5, silver: 180 },
        { id: "r_sg_tn",  from: "shenshou_gu",   to: "tainan_gu",     months: 6, silver: 220 },
        { id: "r_tn_hf",  from: "tainan_gu",     to: "huangfeng_gu",  months: 2, silver: 0   },  // 仙途之后不必再乘车马，凡俗银两也无处可使
        { id: "r_hf_yj",  from: "huangfeng_gu",  to: "yuejing_cheng", months: 1, silver: 0   },
        { id: "r_jy_yj",  from: "jiayuan_cheng", to: "yuejing_cheng", months: 3, silver: 200 },
        { id: "r_yj_sea", from: "yuejing_cheng", to: "luanxing_hai",  months: 8, silver: 0   },  // 跨海远行——结丹之约
    ],

    // 苍南谷幻阵门槛：满足其一即可看破而入（已入门派者自不必再挡）
    array: {
        needChangchun: 6,          // 《青木功》六层以上，神识足以勘破虚妄
        needToken: "shengxian_ling", // 或持【升仙令】，锈牌上的云纹自与阵纹呼应
        failText: "你在苍南山麓转了半日，眼中所见不过寻常山岭、几户猎户。幻阵未破，只得怅然折返。（需《青木功》六层以上，或持【升仙令】）",
    },

    // 世俗盘缠：1 枚灵石 = 100 两白银（行商皆认，入苍南山后此物便成无用之物）
    silver: { stoneToSilver: 100 },

    // 地点专属行动的默认文案 / 数值（尽量避免逻辑里硬编码中文）
    actionText: {
        farewell: {
            first: "你在山口寻到厉长风，只说要下山游历。他沉默良久，解下钱囊塞进你手里：「山高水长，保重。」",
            again: "厉长风早已为你践行过了，此身此去，再无故人之念可挂。",
            silver: 120, mind: 5,
        },
        visit_family: {
            months: 1, mind: 10,
            first: "你在老槐树下坐了一整天。母亲的发又白了几分，小妹已能帮着操持门户。你终是没有说出那条再也回不去的长路——尘缘自此斩断，心头却一定。",
            again: "家中一切安好，只是你已无可多话。修道一途，来去都该干净。",
        },
        // 登门玄机世家：真正的流程在 js/jiayuan.js，此处只放敲门那一句，避免两处维护同一句话
        mo_house: {
            knock: "你抬手扣了扣玄机世家的门环。",
        },
        // 夜探皇宫：真正的流程在 js/dungeon_heisha.js，此处只放动身那一句
        heisha_raid: {
            knock: "入夜，你一袭黑衣掠入皇城深处的阴影里。",
        },
    },
};

GAME.DATA.TAINAN = {

    // 散修坊市：固定目录、常年供应，一律以灵石结算（世俗银两在此不予受理）
    goods: [
        { id: "talisman_huoqiu",     price: 50,  desc: "初阶五行灵符，一团烈火轰出，32 点伤害。" },
        { id: "talisman_dingshen",   price: 70,  desc: "初阶五行灵符，定住敌身形，两回合不得出手。" },
        { id: "talisman_jingang",    price: 90,  desc: "初阶五行灵符，金光罩体，60 点护身罡气。" },
        { id: "artifact_qingyun",    price: 600, desc: "下品法器，攻击 +18、速度 +3，耐久 14。" },
        { id: "artifact_wujin",      price: 520, desc: "下品法器，防御 +10，耐久 16。" },
        { id: "skill_yufeng",        price: 300, desc: "青木功所载轻身法诀，修习后速度 +4。" },
        { id: "skill_kongwu",        price: 320, desc: "御物基础法术，修习后神识 +4（鉴定把握更大）。" },
        { id: "skill_huoqiushu",     price: 400, desc: "五行攻击法术，修习后可在斗法中施放【火球术】。" },
        { id: "herb_qiannian",       price: 260, desc: "千年灵药，筑基丹必需主药。" },
        { id: "pill_jinsui",         price: 240, desc: "易筋洗髓，修为 +80。" },
        { id: "talisman_chuansong",  price: 260, desc: "上古逃命符。血色禁地中随时可用，连人带货全身而退。" },
        { id: "herb_ecao",           price: 30,  desc: "奇臭杂草，百草园暗田催熟时消耗一株可掩去灵机波动。" },
        { id: "pill_huichun",        price: 60,  desc: "疗伤药散，服之气血回复 60 点。" },
        { id: "zimu_ren",            price: 420, desc: "暗器母刃藏子刃，专走死角——战前装备，两成攻势必成重创。" },
    ],

    sellRatio: 0.55,   // 散修坊市收货折扣略高于世俗坊市

    // 升仙大会擂台：三轮连胜方得前三名
    leitai: [
        { round: 1, monster: "shengxian_p1", name: "第一轮", months: 1 },
        { round: 2, monster: "shengxian_p2", name: "第二轮", months: 1 },
        { round: 3, monster: "shengxian_p3", name: "第三轮", months: 1 },
    ],

    reward: {
        text: "擂台三连胜！主事者亲至，将一枚白玉瓷瓶交到你手上：「此人可夺前三，筑基丹一枚，另附青梧谷引荐帖。」",
        items: ["pill_zhuji"],
        unlockTravel: true,
    },

    // 出示【升仙令】保送：不必流血便能拜入山门
    token: {
        sect: "huangfenggu",
        sectName: "青梧谷",
        text: "你取出那枚锈迹斑斑的铁牌。验令的长老瞳孔骤缩，随即长揖到地：「此乃本谷遗失多年的升仙令！持令者，即为我青梧谷门人。」",
        items: ["pill_jinsui"],
        months: 1,
    },
};
