/* =========================================================
 * data/world.js —— 世界配置（纯数据，与 realms/items/events 同构）
 * 出身、坊市商品池、成就道碑
 * 说明：本文件是对既定 data 层的等构扩展，仍只放数据不含逻辑
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

/* —— 出身：开局三选一，决定起点资源与年龄 —— */
/* —— 出身：三张卡片全部收拢到「往苍梧门应考」这一条开局线上（与六幕剧情自洽） —— */
GAME.DATA.ORIGINS = [
    {
        id:"erlezi", name:"二愣子",
        desc:"青牛镇韩家二小子，大号沈牧，村里人却只管他叫「二愣子」。三叔在苍梧门当差，此番领他上山应考——命运的齿轮，从炼骨崖下开始转动。",
        start:{ spiritStones:20, ageYears:16, liquid:0, maxHp:100, silver:200 },
        inventory:{},
    },
    {
        id:"hunter", name:"猎户之子",
        desc:"跟爹进山打了三年猎，练出一副铁打的筋骨、一双夜眼。爹说种地没出息，正赶上苍梧门收人，便把家里攒的银钱缝进他衣襟，送他上山应考。",
        start:{ spiritStones:40, ageYears:17, liquid:0, maxHp:120, silver:120 },
        inventory:{ pill_huanglong:1 },
    },
    {
        id:"yaopu", name:"药铺学徒",
        desc:"在青牛镇回春堂当学徒五年，抓药碾药，识得百草。掌柜的看他悟性好，临别塞了两株百年灵药——「仙路漫漫，好自为之。」此番辞了工，往苍梧门应考。",
        start:{ spiritStones:60, ageYears:19, liquid:0, maxHp:95, silver:300 },
        inventory:{ herb_bainian:2 },
    },
];

/* —— 炼丹：前期锁死——玄机子的看家本事不外传，练气三层才肯开口教 —— */
GAME.DATA.ALCHEMY = {
    unlockRealm: 2,     // 练气三层（realmIndex 2）解锁丹炉
};

/* —— 坊市：按所在地差异化（路程耗时 / 在售货源 / 修为门槛） ——
 * travelMonthsByLoc：各地至最近集市的单程耗时（越远越久）；
 * pools：各地货源不同——山间小集只有凡药，青牛镇添疗伤丹，岚州大城才有符箓法器；
 * pool 条目可带 req（REALMS 下标）：修为不足者可见不可买（灰显）。
 */
GAME.DATA.MARKET = {
    travelMonthsByLoc: { shenshou_gu: 2, qingniu_zhen: 1, jiayuan_cheng: 2, tainan_gu: 4 },
    travelMonths: 2,        // 兜底耗时（未列出的地点）
    refreshMonths: 12,      // 换货周期
    stockCount: 6,          // 每次上货件数
    sellRatio: 0.5,         // 玩家出售价 = 基准价 × 此比例
    pools: {
        shenshou_gu: [     // 山间小集：凡药为主
            { id:"herb_bainian",    weight:18 },
            { id:"herb_ecao",       weight:6  },
            { id:"pill_huanglong",  weight:10 },
            { id:"pill_huichun",    weight:8  },
            { id:"talisman_huoshe", weight:6  },
            { id:"iron_ore",        weight:8, infinite:true },   // 铁匠铺常驻：玄铁矿石无限量
        ],
        qingniu_zhen: [    // 凡俗镇集：添疗伤丹与护身符
            { id:"herb_bainian",    weight:14 },
            { id:"herb_ecao",       weight:8  },
            { id:"pill_huanglong",  weight:8  },
            { id:"pill_huichun",    weight:10 },
            { id:"talisman_hushen", weight:6  },
            { id:"pill_jinsui",     weight:3  },
            { id:"mirror_short_sword", weight:3 },
            { id:"iron_ore",        weight:8, infinite:true },
        ],
        jiayuan_cheng: [   // 岚州大城：符箓法器齐备，高阶货按修为解锁
            { id:"herb_bainian",      weight:10 },
            { id:"herb_qiannian",     weight:6,  req:3 },   // 练气四层起有售
            { id:"pill_huichun",      weight:8  },
            { id:"pill_jinsui",       weight:5  },
            { id:"talisman_huoshe",   weight:6  },
            { id:"talisman_hushen",   weight:6  },
            { id:"talisman_huoqiu",   weight:5,  req:4 },   // 练气五层起有售
            { id:"talisman_dici",     weight:4,  req:4 },
            { id:"poison_mortal",     weight:3  },
            { id:"artifact_qingwen",  weight:3,  req:3 },
            { id:"artifact_xuangui",  weight:2,  req:5 },   // 练气六层起有售
            { id:"skill_huoqiushu",   weight:4,  req:4 },   // 火球术（练气五层起有售）
            { id:"skill_bingzhui",    weight:4,  req:4 },   // 冰锥术（练气五层起有售）
            { id:"skill_yufeng",      weight:3,  req:5 },   // 御风诀（练气六层起有售）
            { id:"skill_lianqi",      weight:3,  req:5 },   // 敛气术（练气六层起有售）
            { id:"skill_kongwu",      weight:3,  req:6 },   // 控物术（练气七层起有售）
            { id:"skill_tianyan",     weight:2,  req:7 },
            { id:"iron_ore",          weight:8, infinite:true },   // 天眼术（练气八层起有售）
        ],
    },
    pool: [                // 兜底货源（未列入 pools 的地点）
        { id:"herb_bainian",     weight:20 },
        { id:"herb_qiannian",    weight:6,  req:3 },
        { id:"pill_huanglong",   weight:10 },
        { id:"pill_jinsui",      weight:4  },
        { id:"talisman_huoshe",  weight:9  },
        { id:"talisman_hushen",  weight:7  },
        { id:"artifact_qingwen", weight:3,  req:3 },
        { id:"artifact_xuangui", weight:3,  req:5 },
        { id:"artifact_qingyuan",weight:2,  req:6 },
        { id:"iron_ore",         weight:8, infinite:true },
    ],
};

/* —— 成就道碑：type 为判定类型，value 为门槛 ——
 * type: realm 境界 | kill 累计击杀 | stone 灵石 | age 存活岁数
 *       zhuji 筑基 | karma 善恶极值 | mercy 留活口次数 | explore 历练次数
 */
GAME.DATA.ACHIEVEMENTS = [
    { id:"ach_first_break", name:"初窥门径", type:"realm",  value:1,   desc:"首次突破境界。" },
    { id:"ach_qi5",         name:"练气小成", type:"realm",  value:4,   desc:"修至练气五层。" },
    { id:"ach_qi10",        name:"登堂入室", type:"realm",  value:9,   desc:"修至练气十层。" },
    { id:"ach_zhuji",       name:"筑基道成", type:"zhuji",  value:1,   desc:"筑基成功，寿元大限延至二百岁。" },
    { id:"ach_kill10",      name:"血手修罗", type:"kill",   value:10,  desc:"累计斩杀十名敌手。" },
    { id:"ach_mercy5",      name:"留一线",   type:"mercy",  value:5,   desc:"五次饶过敌手性命。" },
    { id:"ach_rich",        name:"小有身家", type:"stone",  value:500, desc:"身家累积五百灵石。" },
    { id:"ach_old",         name:"寿逾八旬", type:"age",    value:80,  desc:"活过八十岁。" },
    { id:"ach_wander",      name:"踏遍青山", type:"explore",value:50,  desc:"外出历练五十次。" },
    { id:"ach_demon",       name:"恶名昭彰", type:"karma",  value:-60, desc:"善恶值跌至 -60。" },
    { id:"ach_saint",       name:"与人为善", type:"karma",  value:60,  desc:"善恶值升至 +60。" },
];
