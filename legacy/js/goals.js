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
                return "当前第 " + Math.min(act, 6) + " 幕 / 共 6 幕";
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
            done: function (p) { return p.realmIndex >= 21; },
            text: "修至筑基九层，冲击结丹",
            hint: function (p) {
                return "当前 " + GAME.Goals._realmName(p.realmIndex) + "（筑基九层 = 21/21）";
            },
            where: "洞府 / 历练"
        },
        {
            id: "endgame",
            when: function (p) { return p.realmIndex >= 21; },
            done: function () { return false; },
            text: "结丹在即 · 你的道，该有个交代了",
            hint: function () { return "继续修行或了断尘缘，结局由你此前的抉择决定"; },
            where: "乱星海"
        }
    ],

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
