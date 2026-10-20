/* =========================================================
 * js/breakthrough.js —— 破境筹备（突破成功率的唯一推演出口）
 *
 * 设计动因：原版突破只是"修为满了点一下按钮，然后听天由命"——玩家在赌概率，
 * 不是在调概率。本模块把成功率拆成可见的几股力，每股市面上都有对应的获取途径，
 * 玩家可以自己凑组合把骰子做重：
 *
 *   金丹之基（丹药/裸冲）  底子——坊市购入、丹房炼制
 *   灵脉（所处灵峰）      +0% / +3% / +6%——灵石租金
 *   护法（玄傀在侧）      +4%——须玄傀气血 ≥50%，护法后气血减半，灵石温养复原
 *   心境                 每 10 点 +2%，另减反噬 3%/10 点（下限 ×0.7）
 *   丹道（三转归元功）    每转 +25%，上限 +75%——仅结丹、非裸冲非伪丹
 *
 * ★ 唯一出口：core.breakthrough 不再自行拼装数值，一律走 Breakdown.plan()。
 *   面板（ui.renderBreakPrep）与结算（core._rollBreakthrough）读同一份 plan，
 *   杜绝"界面显示 62%、实际掷 45%"这类两套公式的经典错位。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

GAME.DATA.BREAK_PREP = {
    cap: 0.98,          // 常规境界成功率上限（丹药链拉满的 100% 不受此限）
    vein: {
        low:  { label: "杂役旧洞", add: 0.00, dmgMul: 1.00 },
        mid:  { label: "中品灵峰", add: 0.03, dmgMul: 0.90 },
        high: { label: "上品灵峰", add: 0.06, dmgMul: 0.80 },
    },
    guard: { label: "铁奴·玄傀", add: 0.04, hpCostPct: 0.40, minHpPct: 0.50, healCost: 30 },
    mind:  { per10: 0.02, dmgPer10: 0.03, dmgFloor: 0.70 },
};

GAME.Breakthrough = {

    cfg: function () { return GAME.DATA.BREAK_PREP; },

    // ---------- 当前关隘：normal / zhuji（练气十三层→筑基）/ jiedan（筑基九层→结丹）----------
    gate: function (p) {
        p = p || GAME.State.p();
        if (p.realmIndex === GAME.DATA.ZHUJI_GATE_INDEX) return "zhuji";
        if (p.realmIndex === GAME.DATA.JIEDAN_GATE_SOURCE) return "jiedan";
        return "normal";
    },

    // ---------- 灵脉：所处灵峰档位（未租灵峰即杂役旧洞）----------
    veinOf: function (p) {
        var cfg = this.cfg();
        var id = p.peak || "low";
        var v = cfg.vein[id] || cfg.vein.low;
        return { id: id, label: v.label, add: v.add, dmgMul: v.dmgMul };
    },

    // ---------- 护法：玄傀在侧且气血 ≥50%（护法要抽走四成真元，气血不足者护不住）----------
    guardOf: function (p) {
        var cfg = this.cfg().guard;
        if (!p.companion) return { ok: false, why: "尚无玄傀贴身（须以摄魂钟唤醒）" };
        if (p.companion.hp <= 0) return { ok: false, why: "玄傀魂体溃散（须灵石温养复元）" };
        var need = Math.ceil(p.companion.maxHp * cfg.minHpPct);
        if (p.companion.hp < need) {
            return { ok: false, why: "玄傀气血 " + p.companion.hp + "/" + p.companion.maxHp + "，不足 " + need + " 无从护法" };
        }
        return { ok: true, label: cfg.label, add: cfg.add };
    },

    /* ---------- 主推演：返回本关隘的完整破境参数 ----------
     * 字段与 core.breakthrough 原 ctx 完全兼容（successChance/dmgMul/deathMul/isZhuji/
     * zhujiPill/pillName/bareZhuji/isJiedan/jiedanPill/bareJiedan/fakeJiedan），
     * 另加 parts[]（面板用的分项拆解）与估算值（dmg/deathP）。
     */
    plan: function (p) {
        p = p || GAME.State.p();
        var cfg = this.cfg();
        var realm = GAME.DATA.REALMS[p.realmIndex];
        var target = GAME.DATA.REALMS[p.realmIndex + 1];
        if (!realm || !target) return { ok: false, reason: "top" };

        var gate = this.gate(p);
        var isZhuji = gate === "zhuji", isJiedan = gate === "jiedan";

        // —— 丹药挑选（与旧 core.breakthrough 同优先级：正品 > 普通 > 伪丹）——
        var zhujiPill = null, jiedanPill = null;
        if (isZhuji) {
            if (GAME.State.countItem("pill_zhengpin") >= 1) zhujiPill = "pill_zhengpin";
            else if (GAME.State.countItem("pill_zhuji") >= 1) zhujiPill = "pill_zhuji";
            else if (GAME.State.countItem("fake_zhuji") >= 1) zhujiPill = "fake_zhuji";
        }
        if (isJiedan) {
            if (GAME.State.countItem("pill_jiedan_zhengpin") >= 1) jiedanPill = "pill_jiedan_zhengpin";
            else if (GAME.State.countItem("pill_jiedan") >= 1) jiedanPill = "pill_jiedan";
            else if (GAME.State.countItem("fake_jiedan") >= 1) jiedanPill = "fake_jiedan";
        }

        var baseChance = (typeof realm.breakChance === "number") ? realm.breakChance : 0;
        var baseLabel = "境界底子";
        var dmgMul = 1, deathMul = 1, chainCap = cfg.cap;
        var bareZhuji = false, bareJiedan = false, fakeJiedan = false, fakeZhuji = false;

        if (isZhuji) {
            var zc = GAME.DATA.ZHUJI;
            chainCap = 1.0;
            if (zhujiPill === "pill_zhengpin") {
                baseChance = Math.min(zc.zhengpin.cap, zc.zhengpin.chance + zc.zhengpin.perPill * (p.zhujiStreak || 0) + zc.zhengpin.perExtra * (p.zhujiFails || 0));
                dmgMul = 0.2; deathMul = 0;
                baseLabel = "正品筑基丹" + this._streakTxt(p.zhujiStreak);
            } else if (zhujiPill === "pill_zhuji") {
                baseChance = Math.min(zc.pill.cap, zc.pill.chance + zc.pill.perPill * (p.zhujiStreak || 0) + zc.pill.perExtra * (p.zhujiFails || 0));
                dmgMul = 0.8; deathMul = 0;
                baseLabel = "筑基丹" + this._streakTxt(p.zhujiStreak);
            } else if (zhujiPill === "fake_zhuji") {
                baseChance = zc.fake.chance; dmgMul = zc.fake.dmgMul; deathMul = zc.fake.deathChance;
                baseLabel = "伪·筑基丹"; fakeZhuji = true;
            } else {
                bareZhuji = true;
                baseChance = zc.bare.chance; dmgMul = 1; deathMul = zc.bare.deathChance;
                baseLabel = "无丹裸冲";
            }
        } else if (isJiedan) {
            var jc = GAME.DATA.JIEDAN;
            chainCap = 1.0;
            if (jiedanPill === "pill_jiedan_zhengpin") {
                baseChance = Math.min(jc.zhengpin.cap, jc.zhengpin.chance + jc.zhengpin.perPill * (p.jiedanStreak || 0) + jc.zhengpin.perExtra * (p.jiedanFails || 0));
                dmgMul = jc.zhengpin.dmgMul; deathMul = jc.zhengpin.deathMul;
                baseLabel = "正品凝丹" + this._streakTxt(p.jiedanStreak);
            } else if (jiedanPill === "pill_jiedan") {
                baseChance = Math.min(jc.pill.cap, jc.pill.chance + jc.pill.perPill * (p.jiedanStreak || 0) + jc.pill.perExtra * (p.jiedanFails || 0));
                dmgMul = jc.pill.dmgMul; deathMul = jc.pill.deathMul;
                baseLabel = "凝丹" + this._streakTxt(p.jiedanStreak);
            } else if (jiedanPill === "fake_jiedan") {
                baseChance = jc.fake.chance; dmgMul = jc.fake.dmgMul; deathMul = jc.fake.deathChance;
                baseLabel = "伪凝丹"; fakeJiedan = true;
            } else {
                bareJiedan = true;
                baseChance = jc.bare.chance; dmgMul = 1; deathMul = jc.bare.deathChance;
                baseLabel = "无丹裸冲";
            }
        }

        var parts = [];

        // —— 灵脉：灵峰灵气（灵石租金的回报）——
        var vein = this.veinOf(p);
        if (vein.add > 0) parts.push({ id: "vein", label: "灵脉", add: vein.add, note: vein.label + "灵气充盈" });
        dmgMul *= vein.dmgMul;

        // —— 护法：玄傀以真元护持（玩家自选，突破时抽走四成气血，须灵石温养复元）——
        var guard = this.guardOf(p);
        var guardOn = !!(p.btGuard && guard.ok);
        if (guardOn) parts.push({ id: "guard", label: "护法", add: guard.add, note: guard.label + "在侧护持" });

        // —— 心境：每 10 点 +2%，反噬 -3%（下限 ×0.7）——
        var mc = cfg.mind;
        var mindSteps = Math.floor((p.mind || 0) / 10);
        if (mindSteps > 0) {
            var mindAdd = mindSteps * mc.per10;
            parts.push({ id: "mind", label: "心境", add: mindAdd, note: "心境 " + (p.mind || 0) + "，灵台不动" });
            dmgMul *= Math.max(mc.dmgFloor, 1 - mindSteps * mc.dmgPer10);
        }

        // —— 天时：灵气潮汐（每 24 月涨潮 6 月，破境 +5%）——
        // 时间成为资源之后，"挑日子冲关"才是真抉择：等潮要花寿元，不等就少一分把握。
        var tdInfo = (GAME.Time && GAME.Time.tide) ? GAME.Time.tide(p) : null;
        var tideAdd = (tdInfo && tdInfo.on) ? (tdInfo.breakAdd || 0) : 0;
        if (tideAdd > 0) {
            parts.push({ id: "tide", label: "天时", add: tideAdd, note: "灵潮涨，天地灵气正盛" });
        }

        // —— 丹道：《三转归元功》结丹补偿（仅结丹、非裸冲非伪丹）——
        var szAdd = 0;
        if (isJiedan && !bareJiedan && !fakeJiedan && GAME.Cultivation && GAME.Cultivation.jiedanBonus) {
            szAdd = GAME.Cultivation.jiedanBonus() || 0;
            if (szAdd > 0) {
                parts.push({
                    id: "sanzhuan", label: "丹道", add: szAdd,
                    note: "《三转归元功》" + (p.threeTurnCount || 0) + " 转"
                });
            }
        }

        // —— 降尘丹：反噬伤害 ×0.2（一次性，失败后消耗）——
        if (GAME.Alchemy && p.jiangchen) dmgMul *= GAME.Alchemy.breakDmgMul();

        // —— 合计：丹药链上限 1.0；常规境界上限 98%（心境按旧规则只补到 98%）——
        var addSum = vein.add + (guardOn ? guard.add : 0) + szAdd + tideAdd;
        var coreChance = Math.min(chainCap, baseChance + addSum);
        var mindTotalAdd = 0;
        if (mindSteps > 0 && coreChance < cfg.cap) {
            var before = coreChance;
            coreChance = Math.min(cfg.cap, coreChance + mindSteps * mc.per10);
            mindTotalAdd = coreChance - before;
        }
        var successChance = coreChance;

        // —— 反噬估算：伤害与身陨（面板要让玩家看见"这一把可能死"）——
        var failP = 1 - successChance;
        var failDmg;
        if (bareZhuji) failDmg = GAME.DATA.ZHUJI.bare.dmg;
        else if (bareJiedan) failDmg = GAME.DATA.JIEDAN.bare.dmg;
        else failDmg = Math.round((realm.failDamage || 0) * dmgMul);
        var deathP;
        if (bareZhuji) deathP = failP * GAME.DATA.ZHUJI.bare.deathChance;
        else if (bareJiedan) deathP = failP * GAME.DATA.JIEDAN.bare.deathChance;
        else if (fakeZhuji) deathP = failP * GAME.DATA.ZHUJI.fake.deathChance;
        else if (fakeJiedan) deathP = failP * GAME.DATA.JIEDAN.fake.deathChance;
        else deathP = failP * (realm.deathChance || 0) * deathMul;

        var pillName = zhujiPill ? GAME.DATA.ITEMS[zhujiPill].name : (jiedanPill ? GAME.DATA.ITEMS[jiedanPill].name : "");

        return {
            ok: true, gate: gate, realm: realm, target: target,
            isZhuji: isZhuji, isJiedan: isJiedan,
            zhujiPill: zhujiPill, jiedanPill: jiedanPill, pillName: pillName,
            bareZhuji: bareZhuji, bareJiedan: bareJiedan, fakeJiedan: fakeJiedan, fakeZhuji: fakeZhuji,
            baseLabel: baseLabel, baseChance: baseChance,
            parts: parts, addSum: addSum + mindTotalAdd, guardUsed: guardOn, guardReady: guard.ok,
            successChance: successChance, dmgMul: dmgMul, deathMul: deathMul,
            failDmg: failDmg, deathP: deathP,
            failExpLoss: realm.failExpLoss || 0,
            // 玄傀可代死一次（tryRescue）——比展示的身陨率更低，但会耗掉整具玄傀
            rescue: !!(p.companion && p.companion.hp > 0),
        };
    },

    _streakTxt: function (n) {
        return (n || 0) > 0 ? "（连服 " + n + " 枚后）" : "";
    },

    /* ---------- 筹备建议：面板下方的可点行动 ----------
     * 每条都带"代价 + 能换多少成功率"，缺钱时报差价而不是把按钮灰掉不解释。
     */
    advice: function (p, plan) {
        p = p || GAME.State.p();
        plan = plan || this.plan(p);
        var out = [];
        if (!plan || !plan.ok) return out;
        var cfg = this.cfg();

        // ① 灵脉：筑基后方可租灵峰（练气期提示这个等于让玩家去点一个必然被拒的按钮）
        var vein = this.veinOf(p);
        if (vein.id !== "high" && p.realmIndex > GAME.DATA.ZHUJI_GATE_INDEX) {
            var peak = null, list = GAME.DATA.LINGFENG || [];
            for (var i = 0; i < list.length; i++) if (list[i].id === "high") peak = list[i];
            if (peak) {
                var gain = cfg.vein.high.add - vein.add;
                out.push({
                    id: "vein", gain: gain,
                    text: "迁往" + peak.name,
                    cost: peak.rent, currency: "灵石",
                    short: p.spiritStones < peak.rent ? "还差 " + (peak.rent - p.spiritStones) + " 灵石" : "",
                    run: function () { GAME.Cave2.rentPeak("high"); },
                });
            }
        }

        // ② 护法：可用但未请 → 提示开启；气血不足 → 提示温养；无玄傀 → 点名摄魂钟
        var g = this.guardOf(p);
        if (!g.ok) {
            if (!p.companion) {
                out.push({
                    id: "guard-none", gain: cfg.guard.add, text: "以摄魂钟唤醒玄傀",
                    cost: 0, currency: "", short: "需【摄魂钟】×1",
                    run: null,
                });
            } else {
                out.push({
                    id: "guard-heal", gain: cfg.guard.add,
                    text: "温养玄傀至气血尽复",
                    cost: cfg.guard.healCost, currency: "灵石",
                    short: p.spiritStones < cfg.guard.healCost ? "还差 " + (cfg.guard.healCost - p.spiritStones) + " 灵石" : "",
                    run: function () { GAME.Breakthrough.healCompanion(); },
                });
            }
        } else if (!p.btGuard) {
            out.push({
                id: "guard-on", gain: cfg.guard.add, text: "请玄傀护法",
                cost: 0, currency: "", short: "代价：玄傀气血 -" + Math.round(cfg.guard.hpCostPct * 100) + "%",
                run: function () { GAME.Breakthrough.setGuard(true); },
            });
        }

        // ③ 天时：退潮时可等下一波（等潮的代价是寿元，摆出来让玩家自己权衡）
        var td = (GAME.Time && GAME.Time.tide) ? GAME.Time.tide(GAME.State.p()) : null;
        var tdCfg = (GAME.DATA.TIME && GAME.DATA.TIME.tide) ? GAME.DATA.TIME.tide : null;
        if (td && !td.on && tdCfg && tdCfg.breakAdd > 0) {
            out.push({
                id: "tide", gain: tdCfg.breakAdd, text: "等灵潮再冲关",
                cost: 0, currency: "", short: "灵潮 " + td.left + " 月后涨",
                run: null,
            });
        }

        // ④ 丹药：关隘无丹时点名后果（不是灰按钮，是"这样冲会死多少"）
        if (plan.isZhuji && !plan.zhujiPill) {
            out.push({ id: "pill", gain: 0.20, text: "备一枚筑基丹再冲", cost: 0, currency: "", short: "裸冲失败八成身陨", run: null });
        }
        if (plan.isJiedan && !plan.jiedanPill) {
            out.push({ id: "pill", gain: 0.32, text: "备一枚凝丹再冲", cost: 0, currency: "", short: "裸冲失败九成五身陨", run: null });
        }
        return out;
    },

    // ---------- 护法开关：玩家自选（默认不开，开了才吃 +4%，也才付气血）----------
    setGuard: function (on) {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return false;
        if (on) {
            var g = this.guardOf(p);
            if (!g.ok) { GAME.UI.log("玄傀无从护法：" + g.why + "。", "system"); GAME.UI.updateUI(); return false; }
        }
        p.btGuard = !!on;
        GAME.UI.log(on
            ? "你唤玄傀坐于身侧，护法之约已定——破境时它将以真元替你分去几分天威。"
            : "你挥手让玄傀退下，此番破境由自己独担。", on ? "success" : "system");
        GAME.UI.updateUI();
        return true;
    },

    // ---------- 灵石温养玄傀：气血尽复（护法的补给端，否则护法只能用一次）----------
    healCompanion: function () {
        var p = GAME.State.p();
        if (p.isDead || p.combat) return false;
        var cfg = this.cfg().guard;
        if (!p.companion) { GAME.UI.log("你身边并无玄傀可温养。", "system"); GAME.UI.updateUI(); return false; }
        if (p.companion.hp >= p.companion.maxHp) { GAME.UI.log("玄傀气血已复，不必再耗灵石。", "system"); GAME.UI.updateUI(); return false; }
        if ((p.spiritStones || 0) < cfg.healCost) {
            GAME.UI.log("温养玄傀需 " + cfg.healCost + " 枚灵石（现有 " + (p.spiritStones || 0) +
                "，还差 " + (cfg.healCost - (p.spiritStones || 0)) + "）。", "system");
            GAME.UI.updateUI();
            return false;
        }
        var before = p.companion.hp;
        p.spiritStones -= cfg.healCost;
        p.companion.hp = p.companion.maxHp;
        GAME.UI.log("你以 " + cfg.healCost + " 枚灵石铺就聚灵阵，温养玄傀魂体——气血 " +
            before + " → " + p.companion.hp + "，可以再为你在破境时护法了。", "success");
        GAME.UI.updateUI();
        return true;
    },
};
