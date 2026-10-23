/* =========================================================
 * js/faction.js —— 结丹篇：三阵营声望与追杀令
 *
 * 【三阵营】正道「星阙」／魔道「乱星盟」／无门无派「散修」。
 *   云国的七大派、魔道六宗、散修联盟，在本作的阵营表里各归其位；
 *   到了碎星海，同一批人改称星阙与乱星盟——名号换，立场没换。
 *
 * 【声望】p.factionStanding = { xingque, luanxing, sanxiu }，范围 -100 ~ 100。
 *   声望低于 -40（DATA.FACTION_HUNT_THRESHOLD）者，该阵营会发【追杀令】：
 *   挂 p.pendingEvent（复用既有事件面板，不另开浮层），三选一了结。
 *
 * 【唯一写入口】GAME.Faction.repute() —— 任何改动声望的地方都必须走它，
 *   以免出现两套加减口径。其余函数只读。
 *
 * 【受谁影响】
 *   · 斩魔道修士（鬼灵门／魔焰门／魔道六宗）→ 乱星盟 −8、星阙 +4
 *   · 斩散修 → 散修 −6、乱星盟 +2（魔道坐收渔利）
 *   · 修习魔道功法 → 乱星盟 +4、星阙 −4（正道侧目）
 *   · 煞气 ≥ 40 缠身 → 每年 星阙 −3、散修 −2、乱星盟 +1（恶名在外）
 *
 * 本文件在数据层之后加载，不改动既有数据文件。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.DATA = GAME.DATA || {};

/* —— 三阵营定义 —— */
GAME.DATA.FACTIONS = [
    {
        id: "xingque", name: "星阙", camp: "正道",
        desc: "正道魁首。云国的七大派、碎星海的星阙，都是这一个名号——你若斩魔道修士，他们便认你；你若修魔功，他们便不认。",
    },
    {
        id: "luanxing", name: "乱星盟", camp: "魔道",
        desc: "魔道联盟。云国的魔道六宗、碎星海的乱星盟，俱在此列。他们不问你杀过谁，只问你够不够狠。",
    },
    {
        id: "sanxiu", name: "散修", camp: "散修",
        desc: "无门无派的闲散之人。谁强就向谁靠拢，谁弱就啃谁一口。",
    },
];

/* 追杀令阈值：声望低于此值，该阵营会来要人 */
GAME.DATA.FACTION_HUNT_THRESHOLD = -40;

/* —— 追杀令事件（挂 pendingEvent，走既有事件面板） —— */
GAME.DATA.FACTION_EVENTS = {
    hunt_xingque: {
        id: "hunt_xingque",
        text: "星阙的追缉使横身拦路。悬赏令上你的名字被人用朱砂圈了三圈——他们不问你为何得罪星阙，只问你要拿什么来抵命。",
        choices: [
            { text: "破财免灾·弃袋遁走", tip: "耗 300 灵石脱身，声望回 8 点（无钱可付则只能死战）",
              outcomes: [{ type: "hunt", action: "escape" }] },
            { text: "血战到底", tip: "与星阙追缉使死战——胜则声名大振，败则身死道消",
              outcomes: [{ type: "hunt", action: "fight", monster: "xingque_hunter" }] },
            { text: "献金求和", tip: "献上灵石（恶名越深要的越多），声望回 30 点",
              outcomes: [{ type: "hunt", action: "bribe" }] },
        ],
    },
    hunt_luanxing: {
        id: "hunt_luanxing",
        text: "乱星盟的暗煞从暗处摸上来，兜帽下看不清脸。「有人出了好价钱，要你一颗头。」他说这话时，刀已经出鞘了。",
        choices: [
            { text: "破财免灾·弃袋遁走", tip: "耗 300 灵石脱身，声望回 8 点（无钱可付则只能死战）",
              outcomes: [{ type: "hunt", action: "escape" }] },
            { text: "血战到底", tip: "与乱星盟暗煞死战——魔道认的是狠人，胜则声望大涨",
              outcomes: [{ type: "hunt", action: "fight", monster: "luanxing_hunter" }] },
            { text: "献金求和", tip: "献上灵石（恶名越深要的越多），声望回 30 点",
              outcomes: [{ type: "hunt", action: "bribe" }] },
        ],
    },
    hunt_sanxiu: {
        id: "hunt_sanxiu",
        text: "几名散修堵在渡口。为首的掂了掂手里的储物袋：「活的死的都要，交出来，看着办。」——所谓看着办，多半是看着你的命。",
        choices: [
            { text: "破财免灾·弃袋遁走", tip: "耗 300 灵石脱身，声望回 8 点（无钱可付则只能死战）",
              outcomes: [{ type: "hunt", action: "escape" }] },
            { text: "血战到底", tip: "与散修赏金客死战——散修最是记仇，胜则扬名",
              outcomes: [{ type: "hunt", action: "fight", monster: "sanxiu_hunter" }] },
            { text: "献金求和", tip: "献上灵石（恶名越深要的越多），声望回 30 点",
              outcomes: [{ type: "hunt", action: "bribe" }] },
        ],
    },
};

GAME.Faction = {

    // ---------- 查表 ----------
    def: function (fid) {
        var list = GAME.DATA.FACTIONS || [], f = null;
        for (var i = 0; i < list.length; i++) if (list[i].id === fid) f = list[i];
        return f;
    },

    /* ---------- 读：某阵营声望（缺省 0） ---------- */
    standing: function (p, fid) {
        p = p || GAME.State.p();
        if (!p.factionStanding) return 0;
        var v = p.factionStanding[fid];
        return (typeof v === "number" && isFinite(v)) ? v : 0;
    },

    /* ---------- 写：声望唯一写入口 ----------
     * opts.silent = true 时不写日志（tick 里的自动结算用，免得刷屏）。 */
    repute: function (p, fid, delta, opts) {
        p = p || GAME.State.p();
        if (!fid || !delta) return this.standing(p, fid);
        if (!p.factionStanding) p.factionStanding = {};
        var before = this.standing(p, fid);
        var after = before + delta;
        if (after > 100) after = 100;
        if (after < -100) after = -100;
        p.factionStanding[fid] = after;
        if (!(opts && opts.silent)) {
            var f = this.def(fid);
            var d = after - before;
            if (d !== 0 && f) {
                GAME.UI.log("【" + f.name + "】声望 " + (d > 0 ? "+" : "") + d + "（现 " + after + "）——" +
                    (after <= GAME.DATA.FACTION_HUNT_THRESHOLD ? "已深恶至此，他们怕是要来要你的命了。"
                     : (after >= 60 ? "名声在外，四方相护。"
                     : (after <= -20 ? "恶名已著，迟早有人上门。"
                     : "不过尔尔。"))), d > 0 ? "success" : "warning");
            }
        }
        return after;
    },

    // ---------- 击杀结算：死者属于哪一阵营 ---------- */
    monsterFaction: function (monsterId) {
        var map = {
            wild_sanxiu: "sanxiu", wild_sanxiu_jie: "sanxiu",
            wild_moxiu: "luanxing", wild_moxiu_jie: "luanxing",
            moyan: "luanxing", moyan_disciple: "luanxing",
            guiling: "luanxing", guiling_disciple: "luanxing", guiling_assassin: "luanxing",
        };
        return map[monsterId] || null;
    },

    // 斩杀某修士后的声望结算（由 core.chooseMercy 的「灭口」分支调用）
    onKill: function (p, monsterId) {
        var fid = this.monsterFaction(monsterId);
        if (!fid) return;
        if (fid === "luanxing") {
            this.repute(p, "luanxing", -8);
            this.repute(p, "xingque", 4);
        } else if (fid === "sanxiu") {
            this.repute(p, "sanxiu", -6);
            this.repute(p, "luanxing", 2);
        }
    },

    // 修习魔道功法后的声望结算（由 core 修习分支调用）
    onLearnDemonic: function (p) {
        this.repute(p, "luanxing", 4);
        this.repute(p, "xingque", -4);
    },

    // ---------- 追杀令 ----------
    issueHunt: function (p, fid) {
        var f = this.def(fid);
        if (!f) return false;
        p.factionHunt = { faction: fid, since: p.totalMonths || 0 };
        p.pendingEvent = { eventId: "hunt_" + fid };
        GAME.UI.log("【追杀令】" + f.name + "的悬赏已经贴出来了——你的价码又翻了一倍。", "danger");
        if (GAME.Chronicle) GAME.Chronicle.narrate("hunt_issued", p);
        return true;
    },

    clearHunt: function (p, gain) {
        var fid = (p.factionHunt && p.factionHunt.faction) || null;
        p.factionHunt = null;
        if (fid && gain) this.repute(p, fid, gain);
    },

    /* 追杀令三选一结算（outcome type = "hunt"）。
     * 付不起钱就退化成死战——不留「点了没反应」的死选项。 */
    resolveHunt: function (o) {
        var p = GAME.State.p();
        var fid = (p.factionHunt && p.factionHunt.faction) || null;
        var stand = fid ? this.standing(p, fid) : 0;
        var depth = Math.min(60, Math.abs(stand));
        var action = o.action;

        if (action === "escape") {
            var cost = 300;
            if (p.spiritStones < cost) {
                GAME.UI.log("囊中连三百枚灵石都凑不齐——遁不了，只能动手。", "danger");
                action = "fight";
            } else {
                p.spiritStones -= cost;
                this.clearHunt(p, 8);
                GAME.UI.log("你弃下一袋灵石，换来一段可以喘息的时日——悬赏暂时无人再提。", "warning");
                return;
            }
        }
        if (action === "bribe") {
            var bribe = 800 + depth * 20;
            if (p.spiritStones < bribe) {
                GAME.UI.log("对方摇头：「这点钱，打发叫花子呢？」——求和不成，只能动手。", "danger");
                action = "fight";
            } else {
                p.spiritStones -= bribe;
                this.clearHunt(p, 30);
                GAME.UI.log("你托中间人递上 " + bribe + " 枚灵石。对方收了钱，按下不表。", "warning");
                return;
            }
        }
        // 死战：不论胜负，悬赏随追杀者之死作废
        this.clearHunt(p, 0);
        var mon = o.monster || this.hunterMonster(fid);
        if (GAME.Combat && mon) {
            GAME.Combat.start(mon);
            return;
        }
        GAME.UI.log("你转身便走，再不回头。", "info");
    },

    // 各阵营的追杀者
    hunterMonster: function (fid) {
        if (fid === "xingque") return "xingque_hunter";
        if (fid === "luanxing") return "luanxing_hunter";
        if (fid === "sanxiu") return "sanxiu_hunter";
        return null;
    },

    /* ---------- 月度结算：煞气侵蚀 + 声望回暖 + 追杀令掷骰 ---------- */
    tick: function (months) {
        var p = GAME.State.p();
        if (!p || p.isDead || !months) return;
        var i, list = GAME.DATA.FACTIONS || [];

        // ① 声望回暖：无人记恨时，每年各阵营回 1 点
        var years = Math.floor(months / 12);
        if (years > 0) {
            for (i = 0; i < list.length; i++) {
                var v = this.standing(p, list[i].id);
                if (v < 0) this.repute(p, list[i].id, years, { silent: true });
            }
        }

        // ② 煞气侵蚀：恶名在外，正道与散修不容
        if ((p.shaQi || 0) >= 40 && years > 0) {
            this.repute(p, "xingque", -3 * years, { silent: true });
            this.repute(p, "sanxiu", -2 * years, { silent: true });
            this.repute(p, "luanxing", years, { silent: true });
        }

        // ③ 追杀令：手头有事（事件/战斗）不打断；已有一张令则不叠加
        if (p.pendingEvent || p.combat || p.factionHunt) return;
        var thr = GAME.DATA.FACTION_HUNT_THRESHOLD;
        for (i = 0; i < list.length; i++) {
            var s = this.standing(p, list[i].id);
            if (s >= thr) continue;
            var depth = Math.abs(s) - Math.abs(thr);
            var chance = Math.min(0.25, 0.04 + depth / 60 * 0.25);
            if (Math.random() < chance * months) {
                this.issueHunt(p, list[i].id);
                return;
            }
        }
    },

    /* ---------- UI：追杀令状态文案 ---------- */
    huntLabel: function (p) {
        if (!p || !p.factionHunt) return "";
        var f = this.def(p.factionHunt.faction);
        return f ? ("【追杀令】" + f.name) : "【追杀令】";
    },
};

/* =========================================================
 * 两强争海（阶段二 · 据点拉锯战）：星阙 vs 乱星盟
 * 战局 p.starWar：0~100，50 为均势；≥70 星阙占上风，≤30 乱星盟占上风。
 * 战局随月份自主漂移（强者愈强 + 随机扰动），玩家投效参战可亲手扭转。
 * 战局唯一写入口 = Faction.warShift（与 repute 同纪律：夹紧边界，禁外部直写）。
 * ========================================================= */
GAME.DATA.STARWAR = {
    start: 50, drift: 0.03, wobble: 1.5, bounds: [5, 95],
    advantage: 70,          // 战局 ≥ 此值 → 星阙占上风；≤ 100-advantage → 乱星盟占上风
    chargeShift: 12,        // 正面冲阵得胜：战局向本方 +12
    chargeLoss: 4,          // 冲阵败北：战局向敌方 +4
    killShift: 20, killLoss: 8,
    escortShift: 6, escortStones: [500, 900], escortMonths: 1,
    cd: 6,                  // 每次参战后的休整期（月）
    killBase: 0.45,         // 暗杀基础成功率（神识另加）
};

/* 投效参战事件（挂 pendingEvent，走既有事件面板；text/outcomes 由 Faction.eventFor 按阵营覆写） */
GAME.DATA.STARWAR_EVENTS = {
    starwar_fight: {
        id: "starwar_fight",
        text: "（由 Faction.eventFor 按投效阵营覆写）",
        choices: [
            { text: "正面冲阵", tip: "与敌阵先锋将真刀真枪打一场——胜则战局向你方倾 12 分，败则被推回 4 分",
              outcomes: [{ type: "war", action: "charge" }] },
            { text: "暗杀敌将", tip: "借夜雨摸进敌营（约四成五成功率，神识高者更稳）——成则倾 20 分还带一笔灵石，败则伤重且被推回 8 分",
              outcomes: [{ type: "war", action: "kill" }] },
            { text: "护送补给", tip: "护十艘粮船穿过雷区，全须全尾——战局倾 6 分，另付酬劳（耗时 1 个月）",
              outcomes: [{ type: "war", action: "escort" }] },
        ],
    },
};

/* 胜方货栈：战局倾覆后，占上风一方的军需铺开门（坊市面板呈现） */
GAME.DATA.WAR_STALL = {
    xingque: [
        { id: "tianhuo_crystal", qty: 5, price: 200, note: "军需五折" },
        { id: "herb_qiannian",   qty: 2, price: 480, note: "前线紧俏，溢价两成" },
        { id: "pill_yanshou",    qty: 1, price: 600, note: "原价兑付，不趁火打劫" },
    ],
    luanxing: [
        { id: "tianhuo_crystal", qty: 5, price: 200, note: "军需五折" },
        { id: "herb_qiannian",   qty: 2, price: 480, note: "前线紧俏，溢价两成" },
        { id: "pill_huichun",    qty: 5, price: 300, note: "八折，魔道疗伤全靠它" },
    ],
};

/* —— Faction 扩展：两强争海（追加式，不动上方既有方法） —— */
(function () {
    var W = GAME.DATA.STARWAR;
    var F = GAME.Faction;
    if (!F) return;

    // 战局当前值（老存档无 starWar 字段时按均势起算）
    F.warValue = function (p) {
        p = p || GAME.State.p();
        if (!p) return W.start;
        return (p.starWar == null) ? W.start : p.starWar;
    };

    // 战局唯一写入口：夹紧边界，返回新值
    F.warShift = function (p, delta) {
        p = p || GAME.State.p();
        if (!p) return W.start;
        var v = this.warValue(p) + (delta || 0);
        v = Math.max(W.bounds[0], Math.min(W.bounds[1], v));
        p.starWar = Math.round(v);
        return p.starWar;
    };

    // 当前占上风的一方（null = 僵持，无货栈）
    F.warSide = function (p) {
        var v = this.warValue(p);
        if (v >= W.advantage) return "xingque";
        if (v <= 100 - W.advantage) return "luanxing";
        return null;
    };

    // 战局是否该被玩家知晓：碎星海篇（结丹后，realmIndex ≥ 16）才有"两强争海"这回事。
    // 练气期在岚州坊市抬头看见"乱星盟占上风"，等于把跨篇章底牌翻了——一律不显示。
    F.warUnlocked = function (p) {
        p = p || GAME.State.p();
        return !!p && (p.realmIndex || 0) >= 16;
    };

    // 战局文案（洞府/地图/坊市共用）
    F.warLabel = function (p) {
        if (!this.warUnlocked(p)) return "";
        var v = this.warValue(p);
        var side = this.warSide(p);
        var name = side === "xingque" ? "星阙" : (side === "luanxing" ? "乱星盟" : "两强僵持");
        var tail = side ? "占上风" : "（势均力敌）";
        return "两强争海 · " + name + tail + "（战局 " + v + "）";
    };

    // 月度结算：强者愈强漂移 + 随机扰动 + 参战冷却递减
    F.warTick = function (months) {
        var p = GAME.State.p();
        if (!p || p.isDead || !months) return;
        var v = this.warValue(p);
        var shift = 0;
        for (var i = 0; i < months; i++) {
            shift += (v + shift - 50) * W.drift + (Math.random() * 2 - 1) * W.wobble;
        }
        this.warShift(p, shift);
        if ((p.warCd || 0) > 0) p.warCd = Math.max(0, p.warCd - months);
    };

    // 投效参战：元婴门禁 + 须身在对应总坛 + 无事在身 + 休整期已满
    F.warJoin = function (side) {
        var p = GAME.State.p();
        if (!p || p.isDead || p.combat) return;
        if (p.pendingEvent) return;
        if (!(GAME.DATA.isYuanying && GAME.DATA.isYuanying(p))) {
            GAME.UI.log("两强争海是元婴修士的棋局——结丹之辈，连出征的战船都登不上。", "system");
            GAME.UI.updateUI();
            return;
        }
        var node = side === "xingque" ? "xingque_neihai" : "luanxing_zongtan";
        if (p.location !== node) {
            GAME.UI.log("须亲至" + (side === "xingque" ? "星阙内海" : "乱星盟总坛") + "方能领此将令。", "system");
            GAME.UI.updateUI();
            return;
        }
        if ((p.warCd || 0) > 0) {
            GAME.UI.log("上一战的伤还没好利索——再歇 " + p.warCd + " 个月方可再登战船。", "system");
            GAME.UI.updateUI();
            return;
        }
        p.pendingEvent = { eventId: "starwar_fight", side: side };
        GAME.UI.updateUI();
    };

    // 事件对象按投效阵营覆写（text 与 outcomes 的 side 字段）
    F.eventFor = function (ev) {
        var p = GAME.State.p();
        var side = (p.pendingEvent && p.pendingEvent.side) || "xingque";
        var mine = side === "xingque" ? "星阙" : "乱星盟";
        var foe = side === "xingque" ? "乱星盟" : "星阙";
        var copy = { id: ev.id, text: "", choices: [] };
        copy.text = "你在" + mine + "的战船上领了将令。对面" + foe + "的连营百里，灯火如鳞，一直烧到海平线尽头。" +
            "领令的军官拍了拍你的肩：「此战不拘你怎么打——把他们的势头压下去，就是功。」";
        copy.choices = (ev.choices || []).map(function (c) {
            return {
                text: c.text, tip: c.tip,
                outcomes: (c.outcomes || []).map(function (o) {
                    var oo = {};
                    for (var k in o) oo[k] = o[k];
                    oo.side = side;
                    return oo;
                }),
            };
        });
        return copy;
    };

    // 结算：冲阵（真战斗，战后由 warAfterCombat 收尾）/ 暗杀 / 护送
    F.warResolve = function (o) {
        var p = GAME.State.p();
        if (!p) return;
        var side = o.side || "xingque";
        var sgn = side === "xingque" ? 1 : -1;   // 战局向星阙为正
        var mine = side === "xingque" ? "星阙" : "乱星盟";

        if (o.action === "charge") {
            p.warCd = W.cd;
            p.combatRoute = { type: "war", side: side, action: "charge" };
            GAME.Combat.start(side === "xingque" ? "luanxing_vanguard" : "xingque_vanguard");
            return;
        }
        if (o.action === "kill") {
            p.warCd = W.cd;
            var sp = (GAME.State.getStats() || {}).spirit || 0;
            var chance = W.killBase + sp / 4000;   // 神识 200 → +5%
            if (Math.random() < chance) {
                this.warShift(p, sgn * W.killShift);
                var gain = 800 + Math.floor(Math.random() * 700);
                p.spiritStones += gain;
                this.repute(p, side, 6);
                GAME.UI.log("你借着夜雨摸进" + (side === "xingque" ? "乱星盟" : "星阙") + "敌营，一指点在敌将眉心，从容而去。" +
                    "敌军大乱三日——战局向你方倾了 " + W.killShift + " 分，你还顺手带回 " + gain + " 枚灵石。", "success");
            } else {
                this.warShift(p, -sgn * W.killLoss);
                this.repute(p, side, -5);
                p.currentHp = Math.max(1, Math.round(p.currentHp * 0.75));
                GAME.UI.log("敌将身边竟藏着一位元婴后期——你一刀递出，反被其气机震退，口吐鲜血。暗杀不成，战局反被推过去 " + W.killLoss + " 分。", "danger");
            }
            GAME.UI.updateUI();
            return;
        }
        if (o.action === "escort") {
            // 先推进这 1 个月行程，再计入休整期（与元神出游同序：冷却放在耗时之后设，免被 tick 扣掉）
            GAME.Core.passTime(W.escortMonths);
            p.warCd = W.cd;
            this.warShift(p, sgn * W.escortShift);
            var pay = W.escortStones[0] + Math.floor(Math.random() * (W.escortStones[1] - W.escortStones[0]));
            p.spiritStones += pay;
            this.repute(p, side, 4);
            GAME.UI.log("你护着十艘粮船穿过雷区，全须全尾。将令记你一功——战局倾 " + W.escortShift + " 分，付你 " + pay + " 枚灵石。", "success");
            GAME.UI.updateUI();
            return;
        }
    };

    // 冲阵战后收尾（由 Combat.victory/defeat 按 ctx.type==="war" 路由而来）
    F.warAfterCombat = function (win, ctx) {
        var p = GAME.State.p();
        if (!p) return;
        var side = (ctx && ctx.side) || "xingque";
        var sgn = side === "xingque" ? 1 : -1;
        var mine = side === "xingque" ? "星阙" : "乱星盟";
        if (win) {
            this.warShift(p, sgn * W.chargeShift);
            this.repute(p, side, 6);
            GAME.UI.log("你斩将夺旗，全身而退。" + mine + "军士气大振——战局向你方倾了 " + W.chargeShift + " 分。", "success");
        } else {
            this.warShift(p, -sgn * W.chargeLoss);
            this.repute(p, side, -3);
            GAME.UI.log("冲阵失利，你带着伤退回本方战船。战局被对方推过去 " + W.chargeLoss + " 分。", "danger");
        }
        p.warCd = W.cd;
        GAME.UI.updateUI();
    };

    // 胜方货栈（null = 僵持无货栈 / 未入碎星海篇）
    F.warStall = function (p) {
        if (!this.warUnlocked(p)) return null;
        var side = this.warSide(p);
        if (!side) return null;
        return { side: side, goods: GAME.DATA.WAR_STALL[side] || [] };
    };

    // 货栈购买：固定价、不刷新、不限量（买空 qty 则缺货）
    F.warStallBuy = function (i) {
        var p = GAME.State.p();
        var stall = this.warStall(p);
        if (!stall) { GAME.UI.log("两强僵持，并无军需铺开门。", "system"); return; }
        var g = (stall.goods || [])[i];
        if (!g) return;
        if ((g.sold || 0) >= g.qty) { GAME.UI.log("此货已被前面的道友买空了。", "system"); GAME.UI.updateUI(); return; }
        if (p.spiritStones < g.price) { GAME.UI.log("囊中灵石不足（需 " + g.price + " 枚）。", "system"); GAME.UI.updateUI(); return; }
        p.spiritStones -= g.price;
        GAME.State.addItem(g.id, 1);
        g.sold = (g.sold || 0) + 1;
        var it = GAME.DATA.ITEMS[g.id] || {};
        GAME.UI.log("你在" + (stall.side === "xingque" ? "星阙" : "乱星盟") + "军需铺买下【" + (it.name || g.id) + "】（" + g.price + " 灵石）。", "loot");
        GAME.UI.autoSave();
        GAME.UI.updateUI();
    };
})();
