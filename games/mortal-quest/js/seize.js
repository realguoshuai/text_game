/* ================= 神识夺舍心魔（结丹篇） =================
 * 结丹之后，年月本身开始咬人：识海里会浮出别个的元神，欲借你这具身子温养数百年。
 * 设计锚点（一律挂既有唯一出口）：
 *   - Core.passTime（js/core.js）    调 GAME.Seize.tick(months)  —— 时间推进出口
 *   - p.seclusion.shielded（js/time.js）阵法闭关期间不触发     —— 闭关屏蔽标记
 *   - Breakthrough.plan（js/breakthrough.js）消费 recoilMul     —— 心魔劫反噬唯一出口
 *   - p.pendingEvent + chooseEventOption（js/core.js）承载 seize_attempt 三选一
 *   - p.xinmoImmunity（js/bonds.js 写入，此处终于有消费）      —— 尘缘斩断=心魔无缘
 *   - UI.log / Chronicle.narrate                                     —— 文本出口
 * 三条应对（事件面板三选一，动态裁剪：没诀的不列、没阵的不列）：
 *   ① 《不动镇魂诀》镇之：四成直接镇散（侵染退一重、心境 +8）；不成也逼退（心境 +3）
 *   ② 护山大阵逼退：一次性耗 6 个月阵资，稳退，心境 +2
 *   ③ 反夺其元神（高风险）：五成胜——两个周天的修为 + 神识上限 +3；五成败——
 *      重伤三成五气血、侵染加深一重、煞气 +15，且三成概率心魔凝形直接开打
 */
(function () {
    var GAME = window.GAME = window.GAME || {};
    GAME.DATA = GAME.DATA || {};

    /* —— 封魂玉（夺舍线反向契封容器，元婴后启用） —— */
    GAME.DATA.ITEMS = GAME.DATA.ITEMS || {};
    GAME.DATA.ITEMS.feng_hun_yu = { name: "封魂玉", type: "material", quality: "极品", price: 2500, desc: "一口温润的青玉，内里似有雾气流转。夺舍来袭时若持此玉，可将那缕入侵元神反契封其中、收为己用——被封印的元神此后在斗法中供你驱策。封魂玉可自元婴副本【归墟古渊】与妖王尸身拾得。" };

    GAME.DATA.SEIZE = {
        checkMonths: 6,          // 每满 6 个月判定一次
        baseChance: 0.08,        // 基础概率（一年两掷，结丹后年均约一成六）
        shaQiGate: 40,           // 煞气门槛
        shaQiPer: 40, shaQiAdd: 0.05, shaQiCap: 0.25,   // 煞气每 40 点 +5%，封顶 +25%
        causalAdd: 0.15,         // 因果缠身 +15%
        maxLevel: 3,             // 心魔侵染上限（三重）
        levelDmgPer: 0.15,       // 每重侵染 → 心魔劫反噬 +15%

        bell: {                  // 《不动镇魂诀》
            immuneChance: 0.40,  // 直接镇散的概率
            mindOn: 8,          // 镇散：心境 +8
            mindOff: 3,         // 对峙逼退：心境 +3
        },
        array: {                 // 护山大阵逼退
            minRepel: 0.90,      // 须 repelChance ≥ 0.90 的阵（颠倒五行/周天星斗）
            stoneMonths: 6,      // 一次性耗 6 个月阵资
            mind: 2,
        },
        counter: {               // 反夺其元神
            successP: 0.5,
            expCycles: 2,        // 胜：两个周天的修为（口径同 Time.expOf）
            spiritBonus: 3,      // 胜：神识上限永久 +3
            failHpPct: 0.35,     // 败：扣三成五当前气血（保底 1 点，不至闭眼）
            winShaQi: 10, failShaQi: 15,
            failCombatP: 0.30,   // 败：三成概率心魔凝形，直接开打
            fameGain: 6,         // 败：乱星盟声望 +6（魔道手段，同道中人所重）
        },
        seal: {                  // 封魂玉契封（元婴，反夺舍之反向利用）
            minRealm: 19,        // 元婴方可契封
            successP: 0.6,       // 契封成功率
            spiritPer: 2,        // 成：神识上限永久 +2
            mindOn: 5,           // 成：心境 +5
            mindOff: -3,         // 败：心境 -3（兜底不为负）
            soulPer: 12,         // 每道契封元神每回合协战伤害
        },
    };

    /* 夺舍来袭事件（不入 EVENTS 随机池，仅由 Seize.tick 触发）。
     * choices 由 Seize.eventFor 按玩家当下条件动态裁剪。 */
    GAME.DATA.SEIZE_EVENTS = {
        seize_attempt: {
            id: "seize_attempt",
            text: "年月深处，识海中浮出一缕陌生元神——它没有面目，却熟稔地念着你每一个不敢回想的夜。它说：「这具身子性情温和，借我温养数百年，你我各取所需。」",
            choices: [
                {
                    text: "掐诀凝神，以《不动镇魂诀》镇之",
                    tip: "四成几率直接镇散（侵染退一重，心境 +8）；不成也能逼退（心境 +3）",
                    outcomes: [{ type: "seize", mode: "bell", chance: 1 }],
                },
                {
                    text: "张开护山大阵，借阵势逼退",
                    tip: "一次性耗去 6 个月阵资，稳退，无心魔收益（心境 +2）",
                    outcomes: [{ type: "seize", mode: "array", chance: 1 }],
                },
                {
                    text: "反手卷入识海，反夺其元神",
                    tip: "五成胜算。胜：两个周天的修为 + 神识上限 +3；败：重伤三成五气血、侵染加深，三成可能直接开打",
                    outcomes: [{ type: "seize", mode: "counter", chance: 1 }],
                },
                {
                    text: "取出【封魂玉】，将这缕元神契封为己用",
                    tip: "元婴且持封魂玉。六成契封成功：神识上限永久 +2、心境 +5、侵染退一重，此后元神在斗法中供你驱策；失败则玉碎魂遁",
                    outcomes: [{ type: "seize", mode: "seal", chance: 1 }],
                },
            ],
        },
    };

    GAME.Seize = {
        /* ---------- 侵染等级 ---------- */
        level: function (p) {
            p = p || GAME.State.p();
            return Math.max(0, Math.min(GAME.DATA.SEIZE.maxLevel, p.xinmoLevel || 0));
        },
        addLevel: function (p, n) {
            var before = this.level(p);
            p.xinmoLevel = Math.max(0, Math.min(GAME.DATA.SEIZE.maxLevel, before + n));
            return p.xinmoLevel - before;
        },
        label: function (p) {
            var lv = this.level(p);
            if (lv <= 0) return "";
            var names = ["", "一重", "二重", "三重"];
            return "心魔侵染·" + names[lv];
        },

        /* ---------- 心魔劫反噬：侵染每重 +15%；《不动镇魂诀》再 ×0.6 ---------- */
        recoilMul: function (p) {
            p = p || GAME.State.p();
            var mul = 1 + this.level(p) * GAME.DATA.SEIZE.levelDmgPer;
            if (p.spells && p.spells.budong_zhenhun) {
                var sp = (GAME.DATA.SPELLS && GAME.DATA.SPELLS.budong_zhenhun) || {};
                if (sp.recoilMul) mul *= sp.recoilMul;
            }
            return mul;
        },
        immuneChance: function (p) {
            if (!p.spells || !p.spells.budong_zhenhun) return 0;
            var sp = (GAME.DATA.SPELLS && GAME.DATA.SPELLS.budong_zhenhun) || {};
            return sp.immuneChance || 0;
        },

        /* ---------- 选项可用性 ---------- */
        canBell: function (p) { return this.immuneChance(p) > 0; },
        canArray: function (p) {
            if (!GAME.Cave2 || !GAME.Cave2.activeFormation) return false;
            var f = GAME.Cave2.activeFormation();
            return !!f && (f.repelChance || 0) >= GAME.DATA.SEIZE.array.minRepel;
        },
        arrayCost: function () {
            if (!GAME.Cave2 || !GAME.Cave2.activeFormation) return 0;
            var f = GAME.Cave2.activeFormation();
            return (f ? (f.upkeep || 0) : 0) * GAME.DATA.SEIZE.array.stoneMonths;
        },

        /* 按玩家当下条件裁剪选项（没诀的不列、没阵的不列；阵法耗不起也不列） */
        eventFor: function (ev) {
            var p = GAME.State.p();
            var choices = (ev.choices || []).filter(function (c) {
                var mode = c.outcomes && c.outcomes[0] && c.outcomes[0].mode;
                if (mode === "bell") return GAME.Seize.canBell(p);
                if (mode === "array") {
                    if (!GAME.Seize.canArray(p)) return false;
                    return (p.spiritStones || 0) >= GAME.Seize.arrayCost();
                }
                if (mode === "seal") return GAME.Seize.canSeal(p);   // 契封：元婴 + 持封魂玉
                return true;   // 反夺：无门槛，永远可赌
            });
            return { id: ev.id, text: ev.text, choices: choices };
        },

        /* ---------- 触发 ---------- */
        issue: function (p) {
            p = p || GAME.State.p();
            this.addLevel(p, 1);
            p.pendingEvent = { eventId: "seize_attempt" };
            GAME.UI.log("【心魔侵染】识海深处一缕元神浮出，欲借你这具身子温养数百年——侵染已至" +
                this.label(p) + "。当断则断，莫让它成了气候。", "danger");
            return true;
        },

        /* 时间推进出口：每满 checkMonths 个月掷一次 */
        tick: function (months) {
            var p = GAME.State.p();
            if (!p || p.isDead || p.combat || p.pendingEvent || p.pendingMercy || !months) return;
            if (!GAME.DATA.isJiedan(p)) return;                    // 结丹方有值得夺的神识
            if (p.xinmoImmunity) return;                           // 尘缘已斩，心魔与你无缘
            if (p.seclusion && p.seclusion.shielded) return;       // 阵法闭关，外魔不扰
            var cfg = GAME.DATA.SEIZE;
            var rolls = Math.floor(months / cfg.checkMonths);
            if (rolls <= 0) return;
            var chance = cfg.baseChance;
            var sha = p.shaQi || 0;
            if (sha >= cfg.shaQiGate) {
                chance += Math.min(cfg.shaQiCap, Math.floor(sha / cfg.shaQiPer) * cfg.shaQiAdd);
            }
            if (p.causal && p.causal.months > 0) chance += cfg.causalAdd;
            for (var i = 0; i < rolls; i++) {
                if (p.pendingEvent || p.combat || p.isDead) return;   // 中途出事即停
                if (Math.random() < chance) { this.issue(p); return; }
            }
        },

        /* ---------- 三选一结算（由 resolveEventOutcomes 的 case "seize" 分派） ---------- */
        resolve: function (o) {
            var p = GAME.State.p();
            var cfg = GAME.DATA.SEIZE, mode = o.mode;

            if (mode === "seal") {
                var s = cfg.seal;
                if (GAME.State.countItem("feng_hun_yu") < 1) { GAME.UI.log("你手中并无封魂玉，无从契封。", "system"); return "done"; }
                GAME.State.removeItem("feng_hun_yu", 1);
                if (Math.random() < s.successP) {
                    p.sealedSouls = p.sealedSouls || [];
                    p.sealedSouls.push({ kind: "xinmo", tier: 1 });
                    p.spiritBonus = (p.spiritBonus || 0) + s.spiritPer;
                    p.mind = (p.mind || 0) + s.mindOn;
                    this.addLevel(p, -1);
                    GAME.UI.log("封魂玉青光暴涨，将那缕元神生生卷入玉中，玉面浮出一张模糊人脸，旋即隐去——【契封成功】！这道元神此后供你驱策（神识上限永久 +" + s.spiritPer + "，心境 +" + s.mindOn + "，侵染退去一重）。", "success");
                } else {
                    p.mind = Math.max(0, (p.mind || 0) + s.mindOff);
                    GAME.UI.log("封魂玉刚罩住那缕元神，玉面便裂开一道细纹——它趁隙遁走，只余一地玉屑！（契封失败，玉碎，心境 " + s.mindOff + "）", "danger");
                }
                if (GAME.Chronicle) GAME.Chronicle.narrate("seize_sealed", p);
                return "done";
            }

            if (mode === "bell") {
                if (Math.random() < this.immuneChance(p)) {
                    this.addLevel(p, -1);
                    p.mind = (p.mind || 0) + cfg.bell.mindOn;
                    GAME.UI.log("《不动镇魂诀》运转，识海如镜——那缕元神照见自己的模样，一声不响地散了。心魔侵染退去一重，心境 +" + cfg.bell.mindOn + "。", "success");
                } else {
                    p.mind = (p.mind || 0) + cfg.bell.mindOff;
                    GAME.UI.log("你以《不动镇魂诀》守住灵台，与那缕元神对峙了三天三夜——它退走了，却在你识海里留下一道裂痕。心境 +" + cfg.bell.mindOff + "。", "info");
                }
                if (GAME.Chronicle) GAME.Chronicle.narrate("seize_repelled", p);
                return "done";
            }

            if (mode === "array") {
                var cost = this.arrayCost();
                p.spiritStones = Math.max(0, (p.spiritStones || 0) - cost);
                p.mind = (p.mind || 0) + cfg.array.mind;
                GAME.UI.log("护山大阵轰然合拢，阵纹如狱——那缕元神撞了几撞，被阵势慢慢磨散。阵资耗去 " + cost + " 灵石，心境 +" + cfg.array.mind + "。", "info");
                if (GAME.Chronicle) GAME.Chronicle.narrate("seize_repelled", p);
                return "done";
            }

            // 反夺其元神
            var c = cfg.counter;
            if (Math.random() < c.successP) {
                // 封顶：exp 取实收量，下面的「道行 +N」日志据此报数
                var exp = GAME.Core.addExp((GAME.Time && GAME.Time.expOf) ? GAME.Time.expOf(p, c.expCycles) : c.expCycles);
                p.spiritBonus = (p.spiritBonus || 0) + c.spiritBonus;
                p.shaQi = (p.shaQi || 0) + c.winShaQi;
                this.addLevel(p, -1);
                if (GAME.Faction) GAME.Faction.onLearnDemonic(p);   // 反夺是魔道手段
                GAME.UI.log("你反手卷入识海，将那缕元神按在道心之下生生炼化——道行 +" + exp + "，神识上限永久 +" + c.spiritBonus +
                    "（煞气 +" + c.winShaQi + "，此等手法终究不正）。", "success");
                if (GAME.Chronicle) GAME.Chronicle.narrate("seize_repelled", p);
                return "done";
            }
            p.currentHp = Math.max(1, Math.round((p.currentHp || 0) * (1 - c.failHpPct)));
            p.shaQi = (p.shaQi || 0) + c.failShaQi;
            this.addLevel(p, 1);
            if (GAME.Faction) GAME.Faction.repute(p, "luanxing", c.fameGain, { silent: true });
            GAME.UI.log("那缕元神狞笑着翻进你的识海，一番撕扯后你才将它逐出——神魂如被钝刀刮过（气血 -" +
                Math.round(c.failHpPct * 100) + "%），心魔侵染加深一重，煞气 +" + c.failShaQi + "。", "danger");
            if (Math.random() < c.failCombatP) {
                GAME.UI.log("它竟顺着你那一瞬的神魂破口凝出形来——心魔显化，避无可避！", "danger");
                GAME.Combat.start("seize_demon");
                return "combat";
            }
            return "done";
        },

        /* ---------- 契封可用性：元婴 + 持封魂玉 ---------- */
        canSeal: function (p) {
            p = p || GAME.State.p();
            if ((p.realmIndex || 0) < GAME.DATA.SEIZE.seal.minRealm) return false;
            return GAME.State.countItem("feng_hun_yu") >= 1;
        },
        // 契封元神数
        soulCount: function (p) {
            p = p || GAME.State.p();
            return (p.sealedSouls || []).length;
        },
        /* ---------- 战斗协战：契封元神每回合平砍（combat.attack 调用） ---------- */
        soulAssist: function (combat) {
            if (!combat) return 0;
            var p = GAME.State.p();
            var n = (p.sealedSouls || []).length;
            if (!n) return 0;
            var per = GAME.DATA.SEIZE.seal.soulPer;
            var dmg = per * n;
            combat.hp -= dmg;
            GAME.UI.log("你识海中 " + n + " 道契封元神齐出，阴风席卷【" + combat.name + "】，再添 " + dmg + " 点创伤！", "info");
            return dmg;
        },
    };
})();
