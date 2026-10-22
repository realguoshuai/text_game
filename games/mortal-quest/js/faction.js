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
