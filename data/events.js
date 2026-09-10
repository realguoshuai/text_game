/* =========================================================
 * data/events.js —— 妖兽配置 + 历练事件库（纯数据）
 *
 * 【妖兽表】MONSTERS
 *   hp/atk/def/speed/spirit  战斗数值
 *   stones  战胜掉落灵石区间   exp   战胜修为
 *   killChance     战败被杀（道消身陨）概率
 *   loseAge        战败折寿区间(年)
 *   loseStonePct   战败被抢灵石比例区间
 *   loot           战胜搜刮表 {id, chance, qty:[a,b]}
 *
 * 【历练事件表】EVENTS（按 weight 加权抽取）
 *   choices 为空 => 自动结算型事件
 *   choices 非空 => 分支选项型事件，玩家点选后按 outcomes 概率判定
 *   outcome.type: loot 掉落 | stones 灵石 | exp 修为
 *                 damage 受创(气血/折寿) | combat 斗法 | nothing
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

GAME.DATA.MONSTERS = [
    {
        id:"wolf", name:"铁齿狼 · 一阶妖兽", isBeast:true, tier:1,
        hp:55, atk:9, def:2, speed:8, spirit:3, exp:18,
        stones:[6,16], killChance:0.10, loseAge:[1,2], loseStonePct:[0.3,0.6],
        loot:[
            { id:"herb_bainian",  chance:0.10, qty:[1,1] },
        ]
    },
    {
        id:"bandit", name:"黑衣散修 · 练气中期劫道者",
        human: true,   // 是人，不是妖兽：战胜后可选择灭口或留活口，影响善恶
        hp:80, atk:13, def:5, speed:8, spirit:9, exp:30,
        stones:[20,50], killChance:0.20, loseAge:[1,3], loseStonePct:[0.4,0.8],
        loot:[
            { id:"talisman_huoshe", chance:0.30, qty:[1,1] },
            { id:"pill_huanglong",  chance:0.20, qty:[1,1] },
            { id:"herb_bainian",    chance:0.15, qty:[1,2] },
        ]
    },
    {
        id:"wolfking", name:"铁齿狼王 · 一阶巅峰妖兽", isBeast:true, tier:1,
        hp:150, atk:20, def:8, speed:11, spirit:8, exp:60,
        stones:[40,90], killChance:0.35, loseAge:[2,4], loseStonePct:[0.5,0.9],
        loot:[
            { id:"herb_qiannian",    chance:0.30, qty:[1,1] },
            { id:"artifact_qingyuan",chance:0.10, qty:[1,1] },
            { id:"pill_jinsui",      chance:0.25, qty:[1,1] },
            { id:"herb_bainian",     chance:0.40, qty:[1,3] },
            { id:"skill_manli",      chance:0.18, qty:[1,1] },   // 妖兽炼体残篇：蛮力诀
        ]
    },

    // —— 新增（练气期扩展）：血月试炼精英弟子 ——
    {
        id:"trial_elite_zheng", name:"正道精英弟子 · 练气后期",
        human:true, cultivator:true, trial:true, hp:110, atk:18, def:7, speed:10, spirit:14, exp:45,
        stones:[40,80], killChance:0.30, loseAge:[2,4], loseStonePct:[0.5,0.9],
        loot:[
            { id:"talisman_huoqiu", chance:0.35, qty:[1,1] },
            { id:"herb_qiannian",   chance:0.20, qty:[1,1] },
            { id:"pill_jinsui",     chance:0.20, qty:[1,1] },
        ]
    },
    {
        id:"trial_elite_mo", name:"魔道凶徒 · 练气后期",
        human:true, cultivator:true, trial:true, hp:100, atk:22, def:5, speed:12, spirit:11, exp:50,
        stones:[50,100], killChance:0.35, loseAge:[2,5], loseStonePct:[0.6,1.0],
        loot:[
            { id:"talisman_dici",  chance:0.40, qty:[1,1] },
            { id:"poison_mortal", chance:0.40, qty:[1,1] },
            { id:"herb_qiannian",  chance:0.25, qty:[1,1] },
        ]
    },

    // —— 新增：黑市劫匪（神识尾随失败后反杀对象，人类，可杀人夺宝） ——
    {
        id:"robber", name:"黑市劫匪 · 心狠手辣",
        human:true, cultivator:true, hp:90, atk:16, def:5, speed:9, spirit:8, exp:35,
        stones:[60,120], killChance:0.40, loseAge:[2,4], loseStonePct:[0.6,0.9],
        loot:[
            { id:"artifact_frag", chance:0.30, qty:[1,1] },
            { id:"talisman_huoqiu", chance:0.30, qty:[1,1] },
        ]
    },
    {
        id:"mo_daifu", name:"玄机子 · 魔银手", human:true, bladeImmune:true, moEvent:true,
        hp:200, atk:24, def:12, speed:10, spirit:18, exp:0,
        stones:[0,0], killChance:0.0, loseAge:[0,0], loseStonePct:[0,0],
        loot:[],
        text:"玄机子催动魔银手，肉身宛如精钢——寻常利刃砍刺被尽数弹开，唯暗器、符箓与奇招能伤其根本。"
    },

    // —— 新增（景阳城·玄机世家篇）：惊蛟会叛党 ——
    {
        id:"jingjiao_guard", name:"惊蛟会帮众 · 拦路刁徒",
        human:true, hp:70, atk:12, def:4, speed:8, spirit:4, exp:15,
        stones:[10,30], killChance:0.15, loseAge:[0,1], loseStonePct:[0.3,0.5],
        loot:[
            { id:"herb_bainian", chance:0.30, qty:[1,1] },
        ]
    },
    {
        id:"rebel_tangzhu", name:"叛乱堂主 · 铁掌沙震",
        human:true, hp:130, atk:21, def:8, speed:10, spirit:8, exp:45,
        stones:[80,160], killChance:0.30, loseAge:[1,3], loseStonePct:[0.4,0.7],
        loot:[
            { id:"mo_xinwu",     chance:1.0,  qty:[1,1] },   // 自身亦携玄机令（强闯路线的补偿）
            { id:"talisman_huoshe", chance:0.40, qty:[1,1] },
        ]
    },

    // —— 新增（苍南小会）：升仙大会擂台三轮对手 ——
    {
        id:"shengxian_p1", name:"擂台散修 · 练气后期",
        human:true, leitai:true, hp:120, atk:20, def:7, speed:10, spirit:12, exp:50,
        stones:[40,90], killChance:0.20, loseAge:[1,2], loseStonePct:[0.3,0.5],
        loot:[ { id:"talisman_huoqiu", chance:0.30, qty:[1,1] } ]
    },
    {
        id:"shengxian_p2", name:"世家子弟 · 练气巅峰",
        human:true, leitai:true, hp:155, atk:24, def:9, speed:12, spirit:14, exp:70,
        stones:[80,150], killChance:0.25, loseAge:[1,3], loseStonePct:[0.4,0.6],
        loot:[ { id:"herb_qiannian", chance:0.30, qty:[1,1] } ]
    },
    {
        id:"shengxian_p3", name:"擂台魁首 · 半步筑基",
        human:true, leitai:true, hp:190, atk:28, def:11, speed:13, spirit:18, exp:100,
        stones:[150,260], killChance:0.30, loseAge:[2,4], loseStonePct:[0.5,0.8],
        loot:[ { id:"artifact_frag", chance:0.50, qty:[1,2] } ]
    },

    // —— 新增（练气中后期）：修士标记 cultivator:true ——
    // 斩杀修士而不毁尸灭迹，会落下【因果追查】，招来高阶修士循因果寻仇
    {
        id:"fz_beast_tian", name:"铁背蜈 · 天灵果守护兽",
        hp:112, atk:22, def:10, speed:9, spirit:8, exp:60,
        stones:[20,60], killChance:0.20, loseAge:[1,2], loseStonePct:[0.2,0.4],
        loot:[ { id:"herb_tianling", chance:1.0, qty:[1,1] }, { id:"skill_yaoshou", chance:0.20, qty:[1,1] } ],
        text:"一尾丈许铁背蜈盘踞在灵果树下，甲壳映着幽幽毒光。"
    },
    {
        id:"fz_beast_yu", name:"玉面狸 · 玉髓芝守护兽",
        hp:96, atk:23, def:6, speed:14, spirit:10, exp:60,
        stones:[20,60], killChance:0.20, loseAge:[1,2], loseStonePct:[0.2,0.4],
        loot:[ { id:"herb_yumo", chance:1.0, qty:[1,1] }, { id:"skill_yaoshou", chance:0.20, qty:[1,1] } ],
        text:"一只玉面狸守在玉髓芝旁，目露凶光，身法快得只剩残影。"
    },
    {
        id:"fz_beast_zi", name:"紫目猿 · 紫猴花守护兽",
        hp:128, atk:20, def:12, speed:11, spirit:14, exp:65,
        stones:[30,70], killChance:0.20, loseAge:[1,2], loseStonePct:[0.2,0.4],
        loot:[ { id:"herb_zihou", chance:1.0, qty:[1,1] }, { id:"skill_yaoshou", chance:0.20, qty:[1,1] } ],
        text:"紫目猿捶胸嘶吼，一双手臂粗如梁柱——紫猴花就插在它发间。"
    },
    {
        id:"fz_elite", name:"七派精英弟子 · 练气大圆满",
        human:true, cultivator:true, hp:170, atk:27, def:12, speed:13, spirit:18, exp:90,
        stones:[100,200], killChance:0.0, loseAge:[0,0], loseStonePct:[0,0],   // 生死由 FZone 剧情结算，不走通用败北
        loot:[
            { id:"artifact_qingyun", chance:0.35, qty:[1,1] },
            { id:"talisman_jingang", chance:0.50, qty:[1,1] },
            { id:"herb_qiannian",    chance:0.30, qty:[1,1] },
        ],
        text:"一名七派精英弟子拦在前路，法器在背后流转生辉——修为竟已至练气大圆满。"
    },
    {
        id:"causal_avenger", name:"寻仇修士 · 练气大圆满",
        human:true, cultivator:true, hp:200, atk:30, def:14, speed:13, spirit:20, exp:120,
        stones:[150,300], killChance:0.45, loseAge:[3,6], loseStonePct:[0.6,1.0],
        loot:[
            { id:"artifact_frag", chance:0.60, qty:[1,2] },
            { id:"pill_jinsui",   chance:0.40, qty:[1,1] },
        ],
        text:"因果缠绕，杀孽缠身——一名修士踏遁光而来：「杀我道友者，拿命来偿！」"
    },

    // —— 新增（筑基期材料闭环）：二阶妖兽与魔道六宗筑基修士 ——
    // isBeast + tier>=2 → 战胜后有几率拘得【妖兽精魄】；神识上限 ≥25 者以搜神拘魂之法必得。
    {
        id:"fire_python", name:"赤焰火蟒 · 二阶妖兽",
        isBeast:true, tier:2,
        hp:420, atk:38, def:22, speed:14, spirit:16, exp:180,
        stones:[120,240], killChance:0.40, loseAge:[2,5], loseStonePct:[0.5,0.9],
        loot:[
            { id:"herb_qiannian",    chance:0.35, qty:[1,2] },
            { id:"tianhuo_crystal",  chance:0.15, qty:[1,1] },
        ],
        text:"洞穴深处腥热扑面——一条赤鳞火蟒盘踞其间，蛇瞳映火，妖气已至二阶。"
    },
    {
        id:"iron_ape", name:"玄铁狂猿 · 二阶妖兽",
        isBeast:true, tier:2,
        hp:520, atk:34, def:30, speed:11, spirit:12, exp:200,
        stones:[100,220], killChance:0.45, loseAge:[2,6], loseStonePct:[0.5,1.0],
        loot:[
            { id:"iron_ore",     chance:0.50, qty:[1,3] },
            { id:"spirit_wood",  chance:0.25, qty:[1,1] },
        ],
        text:"山石崩落，一头铁灰巨猿捶胸而来——皮糙如玄铁，一掌可碎磐石。"
    },
    {
        id:"moyan_disciple", name:"魔焰门修士 · 筑基期",
        human:true, cultivator:true, foundation:true, moSect:"moyan",
        hp:400, atk:44, def:24, speed:15, spirit:26, exp:190,
        stones:[150,300], killChance:0.45, loseAge:[3,6], loseStonePct:[0.6,1.0],
        loot:[
            { id:"talisman_huoqiu", chance:0.40, qty:[1,2] },
            { id:"mid_stone",       chance:0.25, qty:[1,1] },
        ],
        text:"火光冲天，一名魔焰门修士踏火而来——魔道六宗的爪牙已探到此处。"
    },
    {
        id:"guiling_disciple", name:"鬼灵门修士 · 筑基期",
        human:true, cultivator:true, foundation:true, moSect:"guiling",
        hp:380, atk:40, def:20, speed:17, spirit:30, exp:190,
        stones:[150,300], killChance:0.50, loseAge:[3,7], loseStonePct:[0.6,1.0],
        loot:[
            { id:"poison_mortal", chance:0.40, qty:[1,2] },
            { id:"mid_stone",     chance:0.25, qty:[1,1] },
        ],
        text:"阴风骤起，鬼哭盈耳——鬼灵门修士自尸雾中现身，指骨捏着一面血色幡旗。"
    },
];

GAME.DATA.EVENTS = [
    {
        id:"gather", weight:28,
        text:"你在山泽间寻到几处药苗长势喜人，低头细采……",
        choices:null,
        outcomes:[
            { chance:0.50, type:"loot", text:"竟有一株灵药汲取了山泽灵气，药香扑鼻！", table:[
                { id:"herb_bainian", chance:0.55, qty:[1,2] },
                { id:"herb_bainian", chance:0.20, qty:[1,1] },
            ]},
            { chance:0.30, type:"loot", text:"收获零零散散，几株半灵性的药草聊胜于无。", table:[
                { id:"herb_bainian", chance:1.0, qty:[1,1] },
            ]},
            { chance:0.20, type:"nothing", text:"药苗早被人采去，你空手而归。" },
        ]
    },
    {
        id:"meet_wolf", weight:24,
        text:"草丛簌簌一响，一头铁齿狼红着眼睛扑了出来！",
        choices:null,
        outcomes:[
            { chance:1.0, type:"combat", monster:"wolf" },
        ]
    },
    {
        id:"meet_bandit", weight:14,
        text:"山路拐角，一名黑衣散修拦住去路：「识相的，把储物袋留下！」",
        choices:null,
        outcomes:[
            { chance:1.0, type:"combat", monster:"bandit" },
        ]
    },
    {
        id:"meet_wolfking", weight:6,
        text:"林间寒风骤起，一双碧目在阴影中亮起——是传闻中的铁齿狼王！",
        choices:null,
        outcomes:[
            { chance:1.0, type:"combat", monster:"wolfking" },
        ]
    },
    {
        id:"cave_fate", weight:8,
        text:"你循着微弱灵气，发现一处被藤蔓半掩的石洞，洞口刻着残缺禁纹，似有前辈遗府气象。",
        choices:[
            {
                text:"毁去禁纹，冒险入内探宝",
                outcomes:[
                    { chance:0.65, type:"loot", text:"洞中蒲团上竟留着一枚玉瓶与几样遗物，你大喜过望！", table:[
                        { id:"pill_jinsui",       chance:1.0, qty:[1,1] },
                        { id:"talisman_hushen",   chance:0.6, qty:[1,1] },
                        { id:"artifact_xuangui",  chance:0.3, qty:[1,1] },
                    ]},
                    { chance:0.35, type:"damage", text:"禁纹反转，一道阵法余威轰然劈下！", hp:[25,50], age:[0,1] },
                ]
            },
            {
                text:"禁纹诡异，谨慎离开",
                outcomes:[
                    { chance:1.0, type:"nothing", text:"你退开百丈，山风渐息。此后每每路过，总忍不住多看一眼。" },
                ]
            },
        ]
    },
    {
        id:"beast_bone_valley", weight:12,
        text:"你误入一处白骨散落的洼地，妖气隐现——是有妖兽陨落之地，还是它的巢穴？",
        choices:[
            {
                text:"冒死搜刮骨堆",
                outcomes:[
                    { chance:0.60, type:"loot", text:"骨堆深处有妖兽内丹余气凝成的药力结晶！", table:[
                        { id:"herb_qiannian",  chance:0.25, qty:[1,1] },
                        { id:"herb_bainian",   chance:1.0,  qty:[1,3] },
                    ]},
                    { chance:0.40, type:"combat", text:"骨堆下猛然窜出一头守巢的铁齿狼！", monster:"wolf" },
                ]
            },
            {
                text:"妖气不祥，绕道而行",
                outcomes:[
                    { chance:1.0, type:"nothing", text:"你远远绕开，只拾得半截枯枝充作药锄。" },
                ]
            },
        ]
    },
    {
        id:"miasma", weight:8,
        text:"山间忽起瘴雾，你神识昏沉，辨不清方向……",
        choices:[
            {
                text:"强提真元硬闯",
                outcomes:[
                    { chance:0.55, type:"nothing", text:"你咬牙冲出雾区，除却疲惫别无所失。" },
                    { chance:0.45, type:"damage", text:"瘴毒入体，你在林中咳血半日！", hp:[15,35], age:[0,1] },
                ]
            },
            {
                text:"原地打坐静待雾散",
                outcomes:[
                    { chance:1.0, type:"exp", text:"静守之际灵台反得清明，吐纳竟有所得。", amount:[2,6] },
                ]
            },
        ]
    },
    {
        id:"nothing_road", weight:10,
        text:"你在后山转了大半日，既无敌影也无药踪，悻悻而归。",
        choices:null,
        outcomes:[
            { chance:1.0, type:"nothing", text:"空手而归。" },
        ]
    },
];

/* =========================================================
 * 【景阳城·玄机世家主线】四阶段连环事件
 * 由 js/jiayuan.js 按 stage 顺序驱动；p.jiayuan = { stage } 记录进度
 *
 * choice 字段：
 *   require  前置条件（不满足则该选项不可用）
 *      item       背包须有此物品
 *      companion  须有随从玄傀且未重伤
 *      day        需白昼（当前恒为 true）
 *   cost     代价 { silver | companionHp | item }
 *   outcome  结果类型
 *      next      直接推进到下一阶段（附 log / karma / shaQi / mind）
 *      combat    进入战斗 { monster, winNext }，胜负结算回 jiayuan.js
 *      cure      清除体内阴毒（并以暖阳宝玉解除倒计时）
 *      finish    收尾：发放 loot 并结束事件链
 * ========================================================= */
GAME.DATA.JIAYUAN_CHAIN = [

    /* ---- 阶段一：惊蛟会内乱 ---- */
    {
        stage:1, title:"其一 · 惊蛟会内乱",
        text:"景阳城西，惊蛟会总舵铁门紧闭。玄机子暴毙的消息传开不过旬月，帮中已生哗变，几名堂主正联起手来欲吞玄机世家基业。守门帮众横刀拦路：「什么人？总舵重地，闲杂退开！」",
        choices:[
            {
                id:"infiltrate", text:"翻墙潜入墨府，先查清底细",
                outcome:{ mansion:true },
            },
            {
                id:"token", text:"出示玄机令，求见严夫人",
                require:{ item:"mo_xinwu" },
                outcome:{ next:2, log:"你取出那面乌铁腰牌。帮众脸色骤变，慌忙让开半条道——玄机子在帮中积威犹存。" },
            },
            {
                id:"bribe", text:"塞上三十两银子买路钱",
                cost:{ silver:30 },
                outcome:{ next:2, log:"银子入手，刀收回鞘。帮众皮笑肉不笑：「进去吧，别惹事。」" },
            },
            {
                id:"force", text:"强闯总舵（斗法）",
                outcome:{ combat:{ monster:"jingjiao_guard", winNext:2 } },
            },
            {
                id:"leave", text:"暂且退去，另寻他法",
                outcome:{ log:"你在总舵外踱了一圈，终究按捺住性子。待元气恢复，再来不迟。" },
            },
        ],
    },

    /* ---- 阶段二：铁腕立威 / 暗杀 ---- */
    {
        stage:2, title:"其二 · 铁腕立威",
        text:"后堂素帐低垂，颜氏一身缟素，眉眼却冷得像霜：「那几个堂主今夜便要动手。君若能为我玄机世家除此心腹之患，暖阳宝玉，双手奉上——玄机世家说话算数。」",
        choices:[
            {
                id:"outwit", text:"凭账册与把柄分化叛党（不流血，需线索≥2）",
                require:{ clues:2 },
                outcome:{ next:3, karma:2,
                    log:"你摊开账册，将三更起事、分银八百两一一道来。几名堂主面面相觑，谁也不敢先动——人心一散，刀便举不起来了。" },
            },
            {
                id:"companion", text:"遣玄傀出手，血洗叛党",
                require:{ companion:true },
                cost:{ companionHp:40 },
                outcome:{ next:3, karma:-6, shaQi:5,
                    log:"玄傀如铁塔般推入厅堂。惨叫声不过几息便歇——玄龟功护体，寻常刀剑连它的皮都割不破。" },
            },
            {
                id:"blink", text:"白日以眨眼剑法取首恶性命（耗反光短剑）",
                require:{ item:"mirror_short_sword", day:true },
                cost:{ item:"mirror_short_sword" },
                outcome:{ next:3, karma:-4,
                    log:"日光穿过窗棂正落在短剑上。你出手只一瞬，剑光晃过堂主的双眼——等众人回神，他已倒在血泊里。" },
            },
            {
                id:"duel", text:"当面挑战叛乱堂主（生死斗）",
                outcome:{ combat:{ monster:"rebel_tangzhu", winNext:3 } },
            },
            {
                id:"refuse", text:"不愿沾染凡俗血腥，婉言辞去",
                outcome:{ log:"颜氏沉默良久，只说了一句：「也罢。」眼里的光暗了下去。此事仍有转圜。" },
            },
        ],
    },

    /* ---- 阶段三：换取暖阳宝玉 ---- */
    {
        stage:3, title:"其三 · 暖阳宝玉",
        text:"内乱平息。颜氏自暗格中捧出一只锦盒，盒中所盛是一枚温润玉珮，触手微暖：「此乃暖阳宝玉，先夫当年以重金与一条人命换来。君为我玄机世家平乱，妾身不敢相负。」你体内那股阴寒自见了此玉，竟隐隐躁动起来。",
        choices:[
            {
                id:"help", text:"先助颜氏稳住玄机世家基业，再取宝玉（耗 1 月）",
                outcome:{ cure:true, next:4, months:1, karma:3, mind:8,
                    log:"你留了一月，替颜氏重整账目、遣散首恶余党。玄机世家基业算是稳住了——临行那日，她将宝玉双手奉上，又多谢了一句：「君之恩，玄机世家记着。」" },
            },
            {
                id:"accept", text:"接过暖阳宝玉，当场运功驱毒",
                outcome:{ cure:true, next:4, mind:5,
                    log:"宝玉贴身的一瞬，暖流自膻中散入四肢百骸，纠缠你多时的阴毒如遇烈阳，化作缕缕黑气散去。" },
            },
        ],
    },

    /* ---- 阶段四：仙缘线索 ---- */
    {
        stage:4, title:"其四 · 仙缘线索",
        text:"辞别颜氏前，你请她准你翻检玄机子的遗箧。箱中多是寻常医书与药材账簿，翻到匣底，一本线装册下压着一块铁牌——满身泥垢，铁锈斑驳，看不出半点出奇。",
        choices:[
            {
                id:"search", text:"细细搜检玄机子遗箧",
                outcome:{ give:["xiangjia_gongjuan","shengxian_ling"], next:5, months:1,
                    log:"你抹去铁牌上的泥垢，锈迹底下竟隐隐浮出流云纹路。颜氏看了一眼，摇头道：「此是先夫从一个异人处得来的，说是……什么令。」" },
            },
            {
                id:"quick", text:"只取那块锈铁牌，不多耽搁",
                outcome:{ give:["shengxian_ling"], next:5,
                    log:"你无心久留，只把那块铁牌揣进怀里。余下的医书账簿，任它蒙尘去罢。" },
            },
            {
                id:"trace", text:"追查「异人」线索（需玄机子手札）",
                require:{ item:"mo_shouzha" },
                outcome:{ give:["xiangjia_gongjuan","shengxian_ling"], next:5, karma:1, mind:6,
                    log:"你循着手札末页的山形图与那八字口诀追想下去——异人、苍南、青梧谷收徒之期，三下里竟串成一条线。铁牌在你掌心微微发烫。" },
            },
        ],
    },

    /* ---- 阶段五：升仙令（参悟深浅，取决于墨府探查所得） ---- */
    {
        stage:5, title:"其五 · 升仙令",
        text:"出城前一夜，你借着油灯细看那块锈铁牌。泥垢擦尽，云纹在灯下竟隐隐流转，像是在等什么。",
        choices:[
            {
                id:"study", text:"以玄机子手札参悟令牌",
                require:{ item:"mo_shouzha" },
                outcome:{ finish:true, shengxianLore:true, mind:8,
                    log:"你依「以令映纹，云开见径」八字，将令牌贴上眉心。刹那间云纹如活物般游走——你看见了：苍南山麓那片终年不散的雾，原是一座幻阵；而此令，正是开阵的钥匙。" },
            },
            {
                id:"guess", text:"胡乱摸索，只当它是块敲门砖",
                outcome:{ finish:true,
                    log:"你翻来覆去看了半宿，只看出是块生锈的铁牌。也罢，能拜进山门便是了。" },
            },
        ],
    },
];

/* =========================================================
 * 墨府探查（景阳城·玄机世家主线子玩法）：4×4 府邸网格
 * 逐间搜检 / 盘问下人 / 应对惊蛟会巡卫，集齐线索解锁最优结局。
 * 线索链同时铺陈【升仙令】来历：异人授令 → 玄机子得令 → 密藏手札
 * （苍南山形图 + 破阵口诀）→ 得令后参悟 → 苍南破阵呼应。
 * 由 js/mansion.js 驱动，文本全在此表。
 * ========================================================= */
GAME.DATA.MANSION = {
    acts: 5,                    // 今夜可用时机：搜检一间或盘问下人，各耗其一
    clueTarget: 3,              // 集齐此数 → 最优结局
    alertBust: 60,              // 警惕值达此数 → 惊蛟会大举搜捕，探查中止
    alertPerSearch: 6,          // 每次搜检的响动
    alertPerSneak: 8,           // 隐匿失手
    alertPerFight: 25,          // 动手放倒巡卫
    alertRelief: 8,             // 盘问下人后，府中警惕稍缓
    patrolBase: 0.20,           // 每次搜检撞见巡卫的基础概率
    patrolPerAlert: 0.005,      // 警惕值每点追加的撞见概率
    patrolMonster: "jingjiao_guard",
    bribeSilver: 25,            // 行贿避战
    questionSilver: 15,         // 盘问下人
    enter: "你自墨府西侧矮墙翻入。院内槐影幢幢，惊蛟会的火把在回廊尽头游走——今夜若查不明白，明日便无从下手。",
    rooms: [
        { id:"shufang",   label:"书房",       clue:0 },
        { id:"zhangfang", label:"账房",       clue:1 },
        { id:"yaolu",     label:"药庐",       clue:2 },
        { id:"vault",     label:"玄机子密室", vault:true },
    ],
    /* 三处线索：书房讲升仙令来历，账房给战术情报，药庐揭玄机子之恶 */
    clueSpots: [
        { id:"shufang", name:"书房",
          text:"书房里药香混着墨臭。你撬开暗屉，一叠书信滑落——落款皆是一个「异」字。",
          lore:"信中反复提及「升仙令」。原来那枚锈铁牌是一位山中异人交给玄机子的，托他寻「有缘持令之人」；玄机子以重金与一条人命换来，却至死未能参透。信末一行小字：「青梧谷收徒之期在即，苍南山麓幻阵其时自开一线。」" },
        { id:"zhangfang", name:"账房",
          text:"账房木柜里堆着惊蛟会近半年的流水。你借着窗光翻看，指腹在几行红字上停住。",
          lore:"账册末尾记着「今夜三更，分银八百两，共举大事」——叛党动手的时辰、分赃的数目，一清二楚。" },
        { id:"yaolu", name:"药庐",
          text:"药庐深处还留着未倒的药渣，气味腥甜扑鼻。墙角一只瓦瓮，里头泡着些说不清的东西。",
          lore:"瓮中是以活人手掌浸炼的「魔银手」胚药。玄机子一身横练功夫，原是拿人命熬出来的。" },
    ],
    /* 玄机子密藏：需线索≥2 方能看出端倪，藏【升仙令】真正的用法 */
    vault: {
        name:"玄机子密藏", needClues:2,
        text:"你依信中暗示挪开博古架，墙缝里嵌着一只铁匣。锁扣早已锈死，你运劲一拧——",
        loot:["mo_shouzha"], stones:[80,150],
        lore:"手札末页绘着一幅粗陋山形图，旁注二字：苍南。旁侧另录八字口诀——「以令映纹，云开见径」。你心头一动：那枚锈铁牌上的云纹，原是破苍南幻阵的钥匙。",
        hint:"铁匣纹丝不动，你也看不出此间有何蹊跷——线索太少，尚拼不出全貌。" },
    servant: {
        text:"一名老仆缩在廊下，见你现身，抖得说不出话。",
        question:"你摸出十五两银子塞过去。老仆颤声道：「三更……都在西厢议事，兵器藏在灶房夹墙里。」又压低嗓子补了一句：「老爷书房后头那架博古柜，挪开是道暗格——他生前从不许人碰。」（府中警惕稍缓，密室方位已明）",
        poor:"老仆只是磕头，一个字也不敢说——银子不够，人心难买。" },
    patrol: {
        text:"转角处火光一晃，两名惊蛟会巡卫正朝这边过来！",
        sneakOk:"你贴着墙根屏息而过，靴底落地无声。巡卫的火把从头顶三尺外扫过，竟未察觉。",
        sneakFail:"你刚要退步，脚下瓦片一响——巡卫已按刀扑来！",
        bribe:"你把碎银往地上一撒。巡卫对视一眼，弯腰去捡，你趁隙闪入暗处。",
        bribePoor:"银子不够打点，巡卫横刀拦死退路。",
        fightWin:"你出手如电，两记闷响之后，巡卫软倒在地。动静怕是瞒不住了。" },
    endings: {
        best:"线索串成一条线：异人授令、升仙令的来路、三更起事、魔银手的胚药——玄机子这盘棋，你总算看明白了大半。颜氏听完久久无言，末了深深一福：「君之能，妾身不及。」",
        mid:"你查得几分管用，却仍有迷雾未散。颜氏颔首致谢，眼里尚存几分保留。",
        bad:"你仓促来见，胸中并无成算。颜氏望着你，神色淡了下去：「君若无所依凭，此事……再从长计议罢。」",
        bust:"府中锣声大作，火把四面合围——惊蛟会的人被惊动了。你夺路翻墙而出，所得线索有限。" },
};
