/* =========================================================
 * js/goals.js —— 动态当前目标（里程碑链）
 *   纯计算模块：依据玩家状态挑出"下一个该做的事"，不写状态、不碰 DOM。
 *   表现层由 GAME.UI.updateUI 调用 current() 后渲染到 #goal-banner。
 *   设计要点：
 *     ① 紧急目标（中毒/追杀/泄露/觊觎）优先级最高，压过主线
 *     ② 主线按"练气剧情 → 拜入宗门 → 筑基丹 → 突破 → 云京 → 结丹"单链推进
 *     ③ 每个目标给"还差什么"的具体缺口，而不是空泛的口号
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Goals = {

    // ---------- 小工具 ----------
    _has: function (p, itemId) {
        return !!(p.inventory && p.inventory[itemId] > 0);
    },
    _qty: function (p, itemId) {
        return (p.inventory && p.inventory[itemId]) || 0;
    },
    _name: function (itemId) {
        var it = GAME.DATA && GAME.DATA.ITEMS && GAME.DATA.ITEMS[itemId];
        return it ? it.name : itemId;
    },
    _realmName: function (idx) {
        var R = GAME.DATA && GAME.DATA.REALMS;
        return (R && R[idx]) ? R[idx].name : ("第" + idx + "境");
    },

    // 筑基三味主药（血色禁地 / 血月试炼产出）
    HERBS: ["herb_tianling", "herb_yumo", "herb_zihou"],

    // ---------- 目标定义（顺序即优先级：越靠前越先做） ----------
    DEFS: [
        // ===== 紧急：活下去 =====
        {
            id: "yindu", urgent: true,
            when: function (p) { return !!p.yindu; },
            done: function () { return false; },
            text: "解除体内阴毒",
            hint: function (p) {
                return "仅剩 " + (p.yindu.months || 0) + " 个月，需暖阳宝玉或高阶丹药镇压";
            },
            where: "坊市 / 黑市"
        },
        {
            id: "shichong", urgent: true,
            when: function (p) { return !!p.shichong; },
            done: function () { return false; },
            text: "解去尸虫丸之毒",
            hint: function (p) {
                return "剩 " + (p.shichong.months || 0) + " 个月，期限一到必有一战";
            },
            where: "洞府"
        },
        {
            id: "causal", urgent: true,
            when: function (p) { return !!p.causal; },
            done: function () { return false; },
            text: "斩断因果追查",
            hint: function (p) {
                return "尚余 " + (p.causal.months || 0) + " 个月，高阶修士循迹而来";
            },
            where: "远遁 / 敛息"
        },
        {
            id: "leak", urgent: true,
            when: function (p) { return (p.leak || 0) >= 80; },
            done: function () { return false; },
            text: "压下百草园的药香泄露",
            hint: function (p) {
                return "泄露 " + Math.floor(p.leak) + "/100，下月长老神识将掠过药园";
            },
            where: "百草园"
        },
        {
            id: "risk", urgent: true,
            when: function (p) { return (p.marketRiskValue || 0) >= 80; },
            done: function () { return false; },
            text: "避开结丹修士的觊觎",
            hint: function (p) {
                return "觊觎 " + Math.floor(p.marketRiskValue) + "/100，离开坊市恐被拦路";
            },
            where: "敛气 / 暂避"
        },

        // ===== 主线：练气期 =====
        {
            id: "qixuan",
            when: function (p) { return !p.isDead; },
            done: function (p) { return !!p.qixuan && p.qixuan.act >= 7; },
            text: "走完苍梧门开局六幕",
            hint: function (p) {
                var act = (p.qixuan && p.qixuan.act) || 1;
                // act>=6 = 前五幕已了、第六幕由「突破练气四层」唤起（qixuan.onBreakthroughFour）
                // 此时若还写「第 6 幕 / 共 6 幕」，玩家会以为有一步可点，实际无事可做 → 说清触发条件
                if (act >= 6) {
                    return "前五幕已了——待你突破练气四层，墨师翻脸那一幕自会找上门（当前 " +
                        GAME.Goals._realmName(p.realmIndex) + "）";
                }
                return "当前第 " + act + " 幕 / 共 6 幕";
            },
            where: "苍梧门",
            goto: function () {                       // 目标横幅「前往：苍梧门」可点击 → 直接跳转开幕
                if (!GAME.Qixuan) return;
                if (!GAME.State.p().qixuan) GAME.Qixuan.start();   // 尚未启幕：开演六幕第一幕（炼骨崖考核）
                else GAME.UI.updateUI();                          // 已进行中：重绘让紧急面板优先显示六幕剧情
            }
        },
        {
            id: "tainan",
            when: function (p) { return !p.sectId; },
            done: function (p) { return !!(p.tainan && p.tainan.leitaiDone); },
            text: "赴苍南小会，夺一席之地",
            hint: function (p) {
                var t = p.tainan || { leitai: 0 };
                return "擂台已胜 " + (t.leitai || 0) + " 场，进前三方可得升仙令";
            },
            where: "苍南山"
        },
        {
            id: "joinsect",
            when: function () { return true; },
            done: function (p) { return !!p.sectId; },
            text: "凭升仙令拜入宗门",
            hint: function () { return "拜入后方可领月俸、换宗门贡献"; },
            where: "宗门"
        },
        {
            id: "herbs",
            when: function (p) { return p.realmIndex < 13; },
            done: function (p) {
                var self = GAME.Goals;
                return self.HERBS.every(function (h) { return self._has(p, h); });
            },
            text: "集齐筑基丹三味主药",
            hint: function (p) {
                var self = GAME.Goals, miss = [];
                self.HERBS.forEach(function (h) { if (!self._has(p, h)) miss.push(self._name(h)); });
                return miss.length ? ("还差：" + miss.join("、")) : "三药已齐，可开炉炼丹";
            },
            where: "血色禁地"
        },
        {
            id: "zhengpin",
            when: function (p) {
                var self = GAME.Goals;
                return p.realmIndex < 13 &&
                       self.HERBS.every(function (h) { return self._has(p, h); });
            },
            done: function (p) { return GAME.Goals._has(p, "pill_zhengpin"); },
            text: "开炉炼制正品筑基丹",
            hint: function () { return "洞府丹房：三味主药 + 灵石 100；正品成功率 +50%"; },
            where: "洞府"
        },
        {
            id: "zhuji",
            when: function (p) { return p.realmIndex < 13; },
            done: function (p) { return p.realmIndex >= 13; },
            text: "突破至筑基期",
            hint: function (p) {
                var hasPill = GAME.Goals._has(p, "pill_zhengpin") || GAME.Goals._has(p, "pill_zhuji") || GAME.Goals._has(p, "fake_zhuji");
                return hasPill
                    ? ("当前 " + GAME.Goals._realmName(p.realmIndex) + "，修为 " + Math.floor(p.currentExp) + "，丹药已备")
                    : ("当前 " + GAME.Goals._realmName(p.realmIndex) + "，尚缺筑基丹一枚");
            },
            where: "洞府"
        },

        // ===== 主线：筑基期 =====
        {
            id: "heisha",
            when: function (p) { return p.realmIndex >= 13; },
            done: function (p) { return !!(p.heisha && p.heisha.bossDone); },
            text: "云京皇宫 · 夜战幽冥教",
            hint: function (p) {
                if (!p.heisha) return "尚未踏足云京皇宫";
                var g = 0, k;
                for (k in p.heisha.guards) if (p.heisha.guards[k]) g++;
                return "已破血仆 " + g + "/4，血玉蜘蛛未除";
            },
            where: "云京"
        },
        {
            id: "jiedan",
            when: function (p) { return p.realmIndex >= 13; },
            done: function (p) { return p.realmIndex >= 30; },
            text: "凝丹功成，结丹圆满（结丹九层）",
            hint: function (p) {
                return "当前 " + GAME.Goals._realmName(p.realmIndex) + "（结丹圆满 = 30/30）";
            },
            where: "洞府 / 历练"
        },
        {
            id: "endgame",
            when: function (p) { return p.realmIndex >= 30; },
            done: function () { return false; },
            text: "结丹圆满 · 你的道，该有个交代了",
            hint: function () { return "继续修行或了断尘缘，结局由你此前的抉择决定"; },
            where: "乱星海"
        }
    ],

    // ---------- 下一步：把"目标"翻译成"现在就点这里" ----------
    // 参考《一念逍遥》《鬼谷八荒》：主界面常驻一个明确可点的下一步，
    // 玩家不该自己从一堆按钮里猜该干什么。目标条讲"要去哪"，action 讲"现在点哪"。
    _realm: function (p) {
        return (GAME.DATA && GAME.DATA.REALMS && GAME.DATA.REALMS[p.realmIndex]) || {};
    },
    // 修为是否已满（可尝试突破）
    _full: function (p) {
        var r = this._realm(p);
        if (r.needExp === null || r.needExp === undefined) return false;
        return p.currentExp >= r.needExp;
    },

    action: function (p) {
        if (!p || p.isDead) return null;
        var r = this._realm(p);
        var next = GAME.DATA.REALMS[p.realmIndex + 1];
        var maxHp = p.maxHp || 1;
        var hp = Math.max(0, Math.round(p.currentHp || 0));
        var hpPct = hp / maxHp;

        // ① 剧情 / 战斗 / 待决事件期间：先了结眼前的事（此时其它操作本就被锁）
        if (GAME.Qixuan && typeof GAME.Qixuan.active === "function" && GAME.Qixuan.active()) {
            return { kind: "story", label: "继续当前剧情", why: "剧情抉择期间其它操作锁死——先走完眼前这一幕", run: null };
        }
        if (p.combat || p.moEvent || p.pendingEvent || p.pendingMercy) {
            return { kind: "story", label: "先了结眼前之事", why: "有未决的战斗或事件，处理完才可闭关", run: null };
        }

        // ② 已至当世顶境
        if (!next) {
            return { kind: "done", label: "此界已圆满", why: "已至顶境，往后只剩自行择道", run: null };
        }

        // ③ 修为已满：先看气血，再劝突破
        if (this._full(p)) {
            var btPlan = null;
            try { btPlan = (GAME.Breakthrough && GAME.Breakthrough.plan) ? GAME.Breakthrough.plan(p) : null; } catch (e) { btPlan = null; }
            var ch = (btPlan && btPlan.ok) ? btPlan.successChance
                : ((typeof r.breakChance === "number") ? r.breakChance : null);
            var gate = (p.realmIndex === GAME.DATA.ZHUJI_GATE_INDEX);
            if (hpPct < 0.6) {
                return {
                    kind: "heal", label: "先打坐恢复气血",
                    why: "修为已满，但气血仅 " + hp + "/" + maxHp + "——此时强行突破，失败会重伤",
                    run: function () { GAME.Core.meditate(); }
                };
            }
            return {
                kind: "go",
                label: "尝试突破" + (ch !== null ? "（" + Math.round(ch * 100) + "%）" : ""),
                why: "修为已满，气血 " + hp + "/" + maxHp + (gate ? "，入手筑基丹更稳" : "") +
                     ((btPlan && btPlan.ok && btPlan.parts.length > 0)
                         ? "，筹备已加 +" + Math.round(btPlan.addSum * 100) + "%"
                         : "，灵脉/护法还能再凑") + "——可以一试",
                run: function () { GAME.Core.breakthrough(); }
            };
        }

        // ④ 修为未满：闭关打坐（时间是真预算——顺带报"还差多少、地里还有几株药"）
        var need = (r.needExp || 0) - Math.floor(p.currentExp || 0);
        var leftTxt = (GAME.Time && GAME.Time.remainLabel) ? ("；寿元余 " + GAME.Time.remainLabel(p)) : "";
        var plotHint = "";
        if (GAME.Plot && GAME.Plot.status) {
            var ps = GAME.Plot.status(p);
            if (ps && ps.ready > 0) plotHint = "；药圃有 " + ps.ready + " 株满千年可收";
            else if (ps && ps.nextLeft != null) plotHint = "；药圃 " + ps.growing + " 株在长，最近 " + GAME.Plot._fmtMonths(ps.nextLeft) + "后可收";
        }
        return {
            kind: "heal",
            label: "闭关打坐（" + (r.meditateMonths || 3) + " 月 · +1 修为）",
            why: "还差 " + need + " 修为可尝试突破" +
                 (typeof r.breakChance === "number" ? "（届时成功率 " + Math.round(r.breakChance * 100) + "%）" : "") +
                 plotHint + leftTxt,
            run: function () { GAME.Core.meditate(); }
        };
    },

    // ---------- 取当前目标 ----------
    // 规则：先看紧急项，再按主线顺序取第一个"适用且未完成"的项。
    current: function () {
        var p = GAME.State.p();
        if (!p || p.isDead) return null;
        var i, d;
        for (i = 0; i < this.DEFS.length; i++) {
            d = this.DEFS[i];
            if (!d.urgent) continue;
            if (d.when(p) && !d.done(p)) return this._pack(d, p);
        }
        for (i = 0; i < this.DEFS.length; i++) {
            d = this.DEFS[i];
            if (d.urgent) continue;
            if (d.when(p) && !d.done(p)) return this._pack(d, p);
        }
        return null;
    },

    _pack: function (d, p) {
        return {
            id: d.id,
            urgent: !!d.urgent,
            text: typeof d.text === "function" ? d.text(p) : d.text,
            hint: d.hint ? d.hint(p) : "",
            where: d.where || ""
        };
    },

    // ---------- 全部适用目标（供未来的"目标清单"面板使用） ----------
    list: function () {
        var p = GAME.State.p(), out = [];
        if (!p) return out;
        for (var i = 0; i < this.DEFS.length; i++) {
            var d = this.DEFS[i];
            if (!d.when(p)) continue;
            out.push({
                id: d.id,
                urgent: !!d.urgent,
                done: !!d.done(p),
                text: typeof d.text === "function" ? d.text(p) : d.text
            });
        }
        return out;
    }
};
