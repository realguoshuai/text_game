/* =========================================================
 * js/state.js —— 状态层
 * 玩家数据结构、新建/重置（支持出身）、背包存取、战斗面板计算
 * 背包只存 { itemId: 数量 }，物品属性一律查 GAME.DATA.ITEMS
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.State = {

    // 玩家唯一状态对象（本局内存中的唯一准源）
    player: null,

    // 新建角色：originId 为空则用第一个出身
    createNewPlayer: function (originId) {
        var origins = GAME.DATA.ORIGINS;
        var origin = null;
        for (var i = 0; i < origins.length; i++) {
            if (origins[i].id === originId) origin = origins[i];
        }
        if (!origin) origin = origins[0];

        var st = origin.start || {};
        this.player = {
            originId: origin.id,
            name: origin.name || "",     // 姓名（由出身注入，如沈牧）
            alias: origin.alias || "",   // 别称（如二愣子）
            clock: { year: st.ageYears || 16, month: st.ageMonths || 0, dailyCircles: 0 }, // 时间微观粒度（年/月/每日大周天计数）
            mp: 20, maxMp: 20,          // 法力（练气二层起 20/20，突破逐境 +10；斗法/施法消耗）
            stamina: 100, maxStamina: 100, // 体力（日常行动/战斗闪避消耗）
            equipment: { mainWeapon:null, subWeapon:null, armor:null, artifact:null }, // 装备解耦对象（兼容层回退旧 artifact/artifact2/armor/darkWeapon）
            ageBonus: 0,            // 延寿丹累计延长的寿元（年）
            realmIndex: 0,          // 指向 GAME.DATA.REALMS 下标
            currentExp: 0,
            currentHp: st.maxHp || 100, maxHp: st.maxHp || 100,
            liquid: st.liquid || 0, // 瓶中绿液滴数（不入背包）
            liquidCharge: 0,        // 绿液充能进度（月）
            spiritStones: st.spiritStones || 30,
            inventory: {},          // { 物品ID: 数量 }
            karma: 0,               // 善恶值：负为恶，正为善（-100 ~ 100）
            sectContrib: 0,         // 宗门贡献度（杂役累积，可兑换）
            concealLevel: 0,        // 敛气等级（中品敛气术修习层数，影响黑市脱身）
            shaQi: 0,               // 煞气值（杀人夺宝 / 地脉煞气累积，影响黑市被尾随概率）
            artifactDurability: 0,  // 当前装备法器耐久（0 = 无/满耐久）
            // —— 新增（苍梧门篇）：暗技 / 随从 / 玄机子 ——
            changchunLevel: 1,      // 《青木功》层数（被动，每层 +5% 命中 / +10% 异常抗性）；沈牧初习即第一层，每破一境 +1
            companion: null,       // 随从 { id:"quhun", name, hp, maxHp, atk }（铁奴玄傀）
            // —— 新增（景阳城·玄机世家篇 / 苍南小会）：大地图与经济 ——
            location: "shenshou_gu",// 当前所在地图节点（GAME.DATA.MAP.nodes）
            silver: st.silver || 200, // 世俗银两（凡俗城池通行，苍南山之后彻底无用）
            mind: 0,                // 心境（断尘缘 / 故人辞行所得，影响突破成功率与反噬）
            defBonus: 0,            // 永久防御加成（玄龟功残卷等）
            speedBonus: 0,          // 永久速度加成（御风诀等）
            spiritBonus: 0,         // 永久神识加成（控物术等）
            atkBonus: 0,            // 永久攻击加成（蛮力诀等打怪掉落武学）
            skills: {},             // 已习武学/被动 { 秘籍物品id: true }（技能中枢判定"已习"）
            spells: {},             // 已习术法 { 术法id: true }（斗法中可施放）
            leak: 0,                // 百草园暗田泄露值（≥80 红灯预警，≥100 查获；恶臭草/玄傀暂存可规避）
            leakSweep: false,       // 长老神识下月掠过药园（泄露值达 80 后置位；下月结算规避或查获）
            gardenStash: null,      // 暂存于玄傀体内的私药 { herbId: qty }（神识搜查不可及）
            jiayuan: null,          // 景阳城玄机世家事件链进度 { stage }
            jiayuanDone: false,     // 玄机世家主线是否已完结（避免重复触发）
            tainan: null,           // 苍南小会进度 { entered, leitai, leitaiDone }
            sectId: null,           // 已拜入的门派 id（如 huangfenggu）
            farewellDone: false,    // 是否已向厉长风辞行（一次性：赠盘缠、加心境）
            visitFamilyDone: false, // 是否已回乡探亲（一次性：心境 +10）
            moEvent: null,          // 玄机子多阶段状态 { stage }（进行中非空）
            moEventDone: false,     // 玄机子事件是否已通关（避免重复触发）
            yindu: null,            // 体内阴毒 { months }（玄机子战后限时 debuff，归零道消身陨）
            pendingEvent: null,     // 进行中的分支事件 { eventId }
            pendingMercy: null,     // 战胜后对"人"的处置 { monsterId }
            tracking: null,         // 神识尾随事件 { stones, robberId }（黑市销赃后触发）
            combat: null,           // 战斗状态机（null = 非战斗）
            trial: null,            // 血月试炼状态 { stepsLeft, active }
            fzone: null,            // 血色禁地状态 { stepsLeft, elite, settle }（js/forbidden_zone.js）
            causal: null,           // 因果追查 { months }（斩杀修士未毁尸，高阶修士循因果寻仇）
            garden: null,           // 百草园管事 { due }（青梧谷特权，due=距上交草药的月数）
            zhujiStreak: 0,         // 筑基本轮连服次数（每多服一枚 +25%；成功后清零）
            zhujiFails: 0,          // 筑基历史失败保底池（每次失败永久 +20%，跨轮累加；成功后清零）
            shichong: null,         // 尸虫丸之毒 { months }（六幕剧情·12 个月倒计时，归零强制夺舍对决）
            homeSupport: false,     // 每月寄银回家（六幕剧情·幽篁谷日常解锁）
            homeDue: 0,             // 寄银累计月数（满 12 月寄一次）
            home: null,             // 洞府建设等级 { 灵田/丹房/藏经阁/护山大阵 各 0~3 }（js/home.js）
            qixuan: null,           // 苍梧门六幕剧情状态 { act, step }（act 0 = 未开始）
            artifact2Durability: 0, // 第二法器耐久
            atMarket: false,        // 是否在坊市
            marketGoods: [],        // 坊市在售 [{ id, qty, price }]
            junkGoods: [],          // 旧货摊未鉴定货架 [{ id, price, needSpirit, realId, treasure, appraised }]
            marketNextRefresh: 12,  // 下次换货的总月数
            junkNextRefresh: 12,    // 旧货摊下次换货的总月数（与坊市同节奏，买空不再即补）
            blackGoods: null,       // 地下黑市筑基材料货架 [{ id, qty, price }]（每 3 月轮换）
            blackNextRefresh: 0,    // 黑市下次轮换的总月数
            achievements: [],       // 已解锁成就 ID
            codex: null,            // 图鉴·见闻录 { items/monsters/spells/lore 各 { id:true } }（js/codex.js）
            cd: null,               // 副本冷却 { trial/fzone：下次可入的总月数 }（副本日常化）
            guide: null,            // 首次进入引导 { home/codex/dungeon：true=已读不再提示 }
            stats: { kills:0, mercies:0, breakthroughs:0, explores:0, pillsTaken:0, alchemy:0, maxRealm:0, oddjobs:0, trialsEntered:0, fzones:0 },
            review: null,           // 十年回顾记账 { lastYear, snap, times }（js/review.js）
            moments: {},           // 高光时刻 { 首次id: true }（js/moments.js，每条只记一次）
            totalMonths: 0,
            isDead: false,
            deathReason: "",
            // —— 筑基期高阶进阶系统（六大系统） ——
            qingyuanLevel: 0,       // 《青冥剑诀》已修层数（0 = 未习得）
            threeTurnCount: 0,      // 《三转归元功》散功逆转完成次数（上限 3）
            pillHistory: {},        // 丹药服用史 { 丹药id: 已服枚数 }（抗药性衰减依据）
            fubao: {},              // 符宝威能值 { 符宝id: 剩余耐久（上限 100） }
            marketRiskValue: 0,     // 黑市/坊市老怪觊觎度（0~100，≥80 触发结丹修士神识锁定）
            bonds: {},              // 师承与红颜羁绊 { lihuayuan:{done}, nangongwan:..., dongxuaner:..., chenqiaoqian:... }
            heisha: null,           // 云京皇宫副本进度 { stage, guards:{}, boss, array }
        };
        // 出身自带物品
        for (var itemId in (origin.inventory || {})) {
            this.player.inventory[itemId] = origin.inventory[itemId];
        }
        // 兼容层：旧字段名 → 新规范存储（clock / equipment / spiritStones）的读写代理，
        // 保证老代码与旧存档零改动可用，且不破坏 smoke2~4 的既有断言。
        this.applyCompatShims(this.player);
        return this.player;
    },

    // 取玩家（保证任何时刻可安全访问）
    p: function () {
        if (!this.player) this.createNewPlayer();
        return this.player;
    },

    // ---------- 官方预设：筑基期体验存档 ----------
    // 以 createNewPlayer 为基底，直接落位于「筑基一层」，并补齐神识/资源/体验道具，
    // 让玩家无需百年苦修即可体验筑基期专属玩法（机关傀儡、噬金虫、洞府2.0、魔道终局）。
    // 注意：必须在 GAME.DATA.REALMS / FOUNDATION 加载后调用，hp/mp 取自梯度表。
    createZhujiPreset: function () {
        if (!GAME.DATA.REALMS || GAME.DATA.REALMS.length <= 13) {
            console.warn("REALMS 未就绪，无法构建筑基期预设，退回默认角色");
            return this.createNewPlayer("hunter");
        }
        var p = this.createNewPlayer("hunter");   // 沈牧出身作基底（四系杂灵根·凡人流）
        var R = GAME.DATA.REALMS[13];             // 筑基一层
        p.originId = "hunter";
        p.name = "沈牧";
        p.realmIndex = 13;                        // 筑基一层
        p.currentExp = 0;
        p.maxHp = (R.hp != null) ? R.hp : 350;    // 350
        p.currentHp = p.maxHp;
        p.maxMp = (R.mp != null) ? R.mp : 120;    // 120
        p.mp = p.maxMp;
        p.clock = { year: 18, month: 0, dailyCircles: 0 };
        p.maxAgeBonus = 0;
        p.spiritStones = 3000;                    // 充足灵石，便于体验洞府/坊市/终局
        p.silver = 2000;
        p.sectContrib = 0;
        // 大衍决四层圆满：神识暴涨，SP 上限拉满（15 + 85 = 100），可驾驭满编傀儡军团
        p.spells = p.spells || {};
        p.spells.dayan_jue = true;
        p.spiritBonus = 85;                       // 四层累计 +85
        p.dayanLevel = 4;
        p.changchunLevel = 5;                     // 青木功数层，命中/抗性加成
        p.mind = 20;                              // 心境，提升突破手感
        // 体验物资：冲层丹药 + 疗伤 + 终局三物（魔道入侵→逃亡碎星海）
        p.inventory = p.inventory || {};
        p.inventory["pill_zhuji"]   = 4;          // 筑基丹×4（可继续向筑基高层冲关）
        p.inventory["pill_huichun"] = 10;         // 回春散×10
        p.inventory["pill_jinsui"]  = 2;          // 金髓丸×2（修为 +80/枚）
        p.inventory["dawei_zhuzhu"] = 1;          // 紫纹宝竹（终局阵基主材）
        p.inventory["mid_stone"]    = 5;          // 中阶灵石×5（终局面眼供能）
        p.inventory["xiufu_zhenpan"]= 1;          // 修复阵盘（终局道具）
        // 装备：一把下品法器，便于直接上手斗法
        p.equipment = p.equipment || { mainWeapon:null, subWeapon:null, armor:null, artifact:null };
        p.equipment.mainWeapon = "artifact_qingyun";  // 青云剑：攻+18、速+3
        p.artifactDurability = 14;
        // 重置剧情进度，确保筑基期主线从干净状态展开
        p.moEventDone = false;
        p.jiayuanDone = false;
        p.qixuan = null;
        p.tainan = null;
        p.companion = null;
        p.stats = p.stats || { kills:0, mercies:0, breakthroughs:0, explores:0, pillsTaken:0, alchemy:0, maxRealm:13, oddjobs:0, trialsEntered:0, fzones:0 };
        p.stats.maxRealm = 13;
        return p;
    },

    // 当前寿元大限 = 境界大限 + 延寿丹加成
    maxAge: function () {
        var p = this.p();
        var realm = GAME.DATA.REALMS[p.realmIndex];
        return realm.maxAge + p.ageBonus;
    },

    // ---------- 背包 ----------
    addItem: function (id, qty) {
        qty = qty || 1;
        var p = this.p();
        if (!GAME.DATA.ITEMS[id]) { console.warn("未知物品: " + id); return; }
        p.inventory[id] = (p.inventory[id] || 0) + qty;
        if (GAME.Codex) GAME.Codex.unlockItem(id);   // 图鉴·器物：首次入袋即录
    },

    removeItem: function (id, qty) {
        qty = qty || 1;
        var p = this.p();
        if (!p.inventory[id]) return false;
        p.inventory[id] -= qty;
        if (p.inventory[id] <= 0) delete p.inventory[id];
        return true;
    },

    countItem: function (id) { return this.p().inventory[id] || 0; },

    // 神识上限 SP：当前境界基础 + 大衍决永久加成（供战斗搜神拘魂检定 / 傀儡神识承载）。
    // 蓝图以 player.spLimit 指代，此处提供统一计算入口。
    spLimit: function () {
        var p = this.p();
        if (GAME.DATA.foundationMaxSpirit) return GAME.DATA.foundationMaxSpirit(p);
        var realm = GAME.DATA.REALMS[p.realmIndex];
        var base = (realm && realm.sp != null) ? realm.sp : (realm ? realm.spirit : 15);
        return base + (p.spiritBonus || 0);
    },

    // ---------- 副本冷却（日常化：进入即入冷却，cd[key] 存"下次可入的总月数"） ----------
    cdLeft: function (key) {
        var p = this.p();
        p.cd = p.cd || {};
        return Math.max(0, (p.cd[key] || 0) - p.totalMonths);
    },
    setCd: function (key, months) {
        var p = this.p();
        p.cd = p.cd || {};
        p.cd[key] = p.totalMonths + months;
    },

    // ---------- 善恶值（夹在 -100 ~ 100） ----------
    addKarma: function (delta) {
        var p = this.p();
        p.karma = Math.max(-100, Math.min(100, p.karma + delta));
        return p.karma;
    },

    // 对外示人的境界：《敛气术》将真实修为压低若干层（劫匪/强敌据此判断是否值得动手）
    effectiveRealmIndex: function () {
        var p = this.p();
        var spell = GAME.DATA.SPELLS && GAME.DATA.SPELLS.lianqi_shu;
        var off = (p.spells && p.spells.lianqi_shu && spell) ? spell.disguise : 0;
        return Math.max(0, p.realmIndex - off);
    },

    // ---------- 成就 ----------
    hasAchievement: function (id) { return this.p().achievements.indexOf(id) >= 0; },
    unlockAchievement: function (id) {
        if (this.hasAchievement(id)) return false;
        this.p().achievements.push(id);
        return true;
    },

    // ---------- 兼容读写层（旧字段名代理到新规范存储） ----------
    // 仅定义尚未存在的属性，故 migratePlayerState 可重复调用而不冲突。
    applyCompatShims: function (p) {
        function def(name, get, set) {
            if (Object.getOwnPropertyDescriptor(p, name)) return;
            Object.defineProperty(p, name, {
                enumerable: true, configurable: true,
                get: get,
                set: set || function () {}   // 只读属性无 setter（如 attack/defense）
            });
        }
        var EQ = { mainWeapon:null, subWeapon:null, armor:null, artifact:null };
        // 时间微观粒度：ageYears/ageMonths 代理到 clock
        def("ageYears",
            function () { return this.clock ? this.clock.year : 16; },
            function (v) { if (!this.clock) this.clock = { year:16, month:0, dailyCircles:0 }; this.clock.year = v; });
        def("ageMonths",
            function () { return this.clock ? this.clock.month : 0; },
            function (v) { if (!this.clock) this.clock = { year:16, month:0, dailyCircles:0 }; this.clock.month = v; });
        // 灵石别名
        def("stone",
            function () { return this.spiritStones; },
            function (v) { this.spiritStones = v; });
        // 装备解耦：旧根字段 → equipment 对象
        def("artifact",   // 主法器
            function () { return this.equipment ? this.equipment.mainWeapon : null; },
            function (v) { if (!this.equipment) this.equipment = EQ; this.equipment.mainWeapon = v; });
        def("artifact2",  // 副法器 / 第二法器（需《控物术》：神识驭器）
            function () { return this.equipment ? this.equipment.artifact : null; },
            function (v) { if (!this.equipment) this.equipment = EQ; this.equipment.artifact = v; });
        def("armor",      // 防具
            function () { return this.equipment ? this.equipment.armor : null; },
            function (v) { if (!this.equipment) this.equipment = EQ; this.equipment.armor = v; });
        def("darkWeapon", // 暗器（开战首回合触发）
            function () { return this.equipment ? this.equipment.subWeapon : null; },
            function (v) { if (!this.equipment) this.equipment = EQ; this.equipment.subWeapon = v; });
        // 战力直读（只读，动态聚合 base + 装备）
        def("attack",  function () { return GAME.State.getStats().atk; });
        def("defense", function () { return GAME.State.getStats().def; });
        // 高阶进阶系统字段：老存档缺省补齐（幂等，不覆盖已有值）
        if (p.qingyuanLevel == null) p.qingyuanLevel = 0;
        if (p.threeTurnCount == null) p.threeTurnCount = 0;
        if (!p.pillHistory) p.pillHistory = {};
        if (!p.fubao) p.fubao = {};
        if (p.marketRiskValue == null) p.marketRiskValue = 0;
        if (!p.bonds) p.bonds = {};
        if (p.heisha === undefined) p.heisha = null;
    },

    // ---------- 战斗面板：境界基础 + 法器加成 ----------
    getStats: function () {
        var p = this.p();
        var realm = GAME.DATA.REALMS[p.realmIndex];
        var s = { atk: realm.atk, def: realm.def, speed: realm.speed, spirit: realm.spirit };
        var eq = p.equipment || {};
        // 主法器
        if (eq.mainWeapon && GAME.DATA.ITEMS[eq.mainWeapon]) {
            var e = GAME.DATA.ITEMS[eq.mainWeapon].equip || {};
            s.atk += e.atk || 0;
            s.def += e.def || 0;
            s.speed += e.speed || 0;
            s.spirit += e.spirit || 0;
        }
        // 防具
        if (eq.armor && GAME.DATA.ITEMS[eq.armor]) {
            var a = GAME.DATA.ITEMS[eq.armor].equip || {};
            s.def += a.def || 0;
        }
        // 《控物术》：神识驭器，可同时驾驭第二件法器（面板加成叠加）
        if (eq.artifact && p.spells && p.spells.kongwu_shu && GAME.DATA.ITEMS[eq.artifact]) {
            var e2 = GAME.DATA.ITEMS[eq.artifact].equip || {};
            s.atk += e2.atk || 0;
            s.def += e2.def || 0;
            s.speed += e2.speed || 0;
            s.spirit += e2.spirit || 0;
        }
        var defBonus = this.p().defBonus || 0;
        var speedBonus = this.p().speedBonus || 0;
        var spiritBonus = this.p().spiritBonus || 0;
        var atkBonus = this.p().atkBonus || 0;
        s.atk += atkBonus;       // 蛮力诀等打怪掉落武学
        s.def += defBonus;       // 玄龟功残卷等永久加成
        s.speed += speedBonus;   // 御风诀
        s.spirit += spiritBonus; // 控物术（亦提升鉴定把握）
        var cc = this.p().changchunLevel || 0;
        s.hit = cc * 0.05;      // 《青木功》命中加成（玩家攻击命中率）
        s.resist = cc * 0.10;   // 异常抗性（目眩/中毒对玩家生效概率与回合递减）
        // 《青冥剑诀》攻击加成
        if (GAME.Cultivation) s.atk += GAME.Cultivation.atkBonus();
        // 《三转归元功》散功逆转：神识上限每转 +20%
        var szMul = (GAME.Cultivation && GAME.DATA.SANZHUAN)
            ? 1 + (p.threeTurnCount || 0) * GAME.DATA.SANZHUAN.statGain : 1;
        if (szMul !== 1) s.spirit = Math.round(s.spirit * szMul);
        return s;
    },
};
