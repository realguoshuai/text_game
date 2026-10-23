/* =========================================================
 * js/time.js —— 年月账簿（把"闭关年月"从背景数字变成真资源）
 *
 * 设计动因：原来时间只是背景——打坐只花月数，玩家既看不到自己还剩多少寿元，
 * 也不知道点一下要花多少，更没有"怎么花"的选择。于是"闭关"退化成反复点同一个按钮。
 * 这个模块把时间变成一笔能看见、能分配、会疼的预算：
 *
 *   ① 预算：寿元余 N 年 M 月（随境界/延寿丹/折寿实时变）
 *   ② 价格：每档闭关明码标价（几个月），修为与心境按"周天/月数"折算
 *   ③ 分配：静修 / 闭关 / 苦修 / 长关 四档——同一个寿元池，不同的领取方式
 *   ④ 产出：闭关的年月同时养着洞府药圃里的灵药年份（js/plot.js）——
 *      时间不只是花掉的，也是长在土里的
 *   ⑤ 地雷：会把自己闭死的事（寿元不够、毒发在关内）一律先拦下并说明原因
 *
 * ★ 时间相关推演的唯一出口：不要在别处再算"还剩几年"或"潮期到没到"。
 *   修为口径保持"一个周天 +1"，与旧 meditate 完全一致——这里只把"花几个月"
 *   交给玩家定，不偷偷改数值平衡。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};
GAME.DATA = GAME.DATA || {};

GAME.DATA.TIME = {
    // 心境按"月"折算：静坐养的是心，不是修为。每 4 月 +1 心境（长生路上的慢功夫）
    mindPerMonths: 4,

    // 闭关分档：cycles = 周天数（一个周天 = 本境 meditateMonths 月）
    tiers: [
        { id: "short", name: "静修", cycles: 1,  note: "一坐周天，随时可出关" },
        { id: "mid",   name: "闭关", cycles: 3,  note: "三周天" },
        { id: "long",  name: "苦修", cycles: 6,  note: "六周天" },
        { id: "epic",  name: "长关", cycles: 12, note: "十二周天，一坐一年起" }
    ]
};

GAME.Time = {

    cfg: function () { return GAME.DATA.TIME; },

    /* ================= ① 预算：寿元还剩多少 ================= */

    // 剩余寿元（月）——大限（境界 + 延寿丹）减已用年月
    remain: function (p) {
        p = p || GAME.State.p();
        var total = (GAME.State.maxAge() - (p.ageYears || 0)) * 12 - (p.ageMonths || 0);
        if (total < 0) total = 0;
        return { total: total, years: Math.floor(total / 12), months: total % 12 };
    },

    _fmt: function (total) {
        if (total <= 0) return "0 月";
        var y = Math.floor(total / 12), m = total % 12;
        if (y <= 0) return m + " 月";
        return y + " 年" + (m ? " " + m + " 月" : "");
    },

    remainLabel: function (p) { return this._fmt(this.remain(p).total); },

    // HUD 短标：76年4月
    remainShort: function (p) {
        var r = this.remain(p);
        if (r.years <= 0) return r.months + "月";
        return r.years + "年" + (r.months ? r.months + "月" : "");
    },

    // 寿元告急档位：warn（≤10 年）/ danger（≤5 年）——只作展示用色，不做逻辑判断
    remainLevel: function (p) {
        var t = this.remain(p).total;
        return t <= 60 ? "danger" : (t <= 120 ? "warn" : "");
    },

    /* ================= ② 价格：一档闭关到底花什么、换什么 ================= */

    monthsOf: function (p, cycles) {
        var r = GAME.DATA.REALMS[p.realmIndex] || {};
        return (r.meditateMonths || 3) * cycles;
    },

    // 修为：一周天 +1（与旧 meditate 完全一致，藏经阁加成照旧）
    // 洗髓易筋遗泽：伪灵根提纯，吸纳效率 ×1.5（向上取整），预览与结算同源
    expOf: function (p, cycles) {
        var extra = (GAME.Home && GAME.Home.meditateExp) ? GAME.Home.meditateExp() : 0;
        var exp = cycles * (1 + extra);
        if (p && p.trueRoot) exp = Math.ceil(exp * 1.5);
        return exp;
    },

    // 心境：每 mindPerMonths 月 +1（静坐养的是心，与天象无关）
    mindOf: function (months) {
        var per = this.cfg().mindPerMonths || 4;
        return Math.floor(months / per);
    },

    /* ================= ⑤ 地雷：会把自己闭死的事，先拦下来 ================= */
    // 不弹窗（WebView 会吞掉返回 false）、不灰按钮不说原因——直接给一句能读懂的话
    guard: function (p, months) {
        p = p || GAME.State.p();
        if (!(months > 0)) return { ok: false, why: "闭关时长无效" };
        var left = this.remain(p).total;
        if (months >= left) {
            return { ok: false, why: "寿元只余 " + this._fmt(left) + "，撑不到出关（需 " + months + " 月）" };
        }
        if (p.shichong && typeof p.shichong.months === "number" && months >= p.shichong.months) {
            return { ok: false, why: "尸虫丸 " + p.shichong.months + " 月后毒发，闭 " + months + " 月会死在关里" };
        }
        if (p.yindu && typeof p.yindu.months === "number" && months >= p.yindu.months) {
            return { ok: false, why: "体内阴毒 " + p.yindu.months + " 月后发作，闭 " + months + " 月来不及" };
        }
        return { ok: true, why: "" };
    },

    /* ================= 关内危急中断（暴毙防呆） =================
     * guard 只拦「必死」（耗时 ≥ 寿元/毒发倒计时）；但「出关时只剩 1 月寿元」
     * 「出关时毒距发作只剩 1 月」同样是绝局——玩家连吃延寿丹/解毒丹的窗口都没有。
     * 这里按整周天截断本档闭关：宁可少修，不留「一点下去就坐化」。
     * 缓冲：寿元至少留 3 月，阴毒/尸虫至少留 1 月（留出反应时间）。
     */
    KEEP_LIFE: 3,
    KEEP_POISON: 1,

    _clampTier: function (p, t) {
        var left = this.remain(p).total;
        var maxM = t.months, why = "";
        if (left - this.KEEP_LIFE < maxM) {
            maxM = left - this.KEEP_LIFE;
            why = "寿元只余 " + this._fmt(left) + "，须留 " + this.KEEP_LIFE + " 月应对变故";
        }
        if (p.yindu && typeof p.yindu.months === "number") {
            var m1 = p.yindu.months - this.KEEP_POISON;
            if (m1 < maxM) {
                maxM = m1;
                why = "体内阴毒 " + p.yindu.months + " 月后发作，须留 " + this.KEEP_POISON + " 月寻药化解";
            }
        }
        if (p.shichong && typeof p.shichong.months === "number") {
            var m2 = p.shichong.months - this.KEEP_POISON;
            if (m2 < maxM) {
                maxM = m2;
                why = "尸虫丸 " + p.shichong.months + " 月后毒发，须留 " + this.KEEP_POISON + " 月早做打算";
            }
        }
        if (maxM >= t.months) return { forced: false };
        var per = this.monthsOf(p, 1);
        var cycles = Math.floor(maxM / per);
        if (cycles < 1) {
            return { impossible: true, why: why || "连一个周天都嫌凶险，先设法延寿/解毒，勿再入定" };
        }
        return { forced: true, cycles: cycles, months: cycles * per, why: why };
    },

    // 一档闭关的完整账（UI 与执行读同一份）
    tier: function (p, id) {
        p = p || GAME.State.p();
        var list = this.cfg().tiers, def = null, i;
        for (i = 0; i < list.length; i++) if (list[i].id === id) def = list[i];
        if (!def) return null;
        var months = this.monthsOf(p, def.cycles);
        var g = this.guard(p, months);
        var mind = this.mindOf(months);
        // 阵法长关：周天星斗大阵在位时长关可「入阵而修」——心境增速翻快、
        // 闭关期间外敌不得扰；但阵法月耗须由灵石撑住，撑不住则不允闭关。
        var form = (GAME.Cave2 && GAME.Cave2.activeFormation) ? GAME.Cave2.activeFormation() : null;
        var shielded = false, upkeep = 0;
        if (form && form.seclude && def.id === "epic" && g.ok) {
            upkeep = (form.upkeep || 0) * months;
            if (p.spiritStones >= upkeep) {
                shielded = true;
                mind = Math.floor(months / 3);   // 阵中三月养一心境（平时四月）
            } else {
                g = { ok: false, why: "灵石不足，长关撑不起【" + form.name + "】的月耗（需 " + upkeep + " 枚）" };
            }
        }
        return {
            id: def.id, name: def.name, note: def.note, cycles: def.cycles,
            months: months,
            exp: this.expOf(p, def.cycles),
            mind: mind,
            shielded: shielded, upkeep: upkeep,
            ok: g.ok, why: g.why
        };
    },

    tiers: function (p) {
        var out = [], list = this.cfg().tiers, i;
        for (i = 0; i < list.length; i++) out.push(this.tier(p, list[i].id));
        return out;
    },

    // 一行价钱：3月 · 修为+1 · 心境+0
    priceLabel: function (t) {
        if (!t) return "";
        return t.months + " 月 · 修为 +" + t.exp + (t.mind > 0 ? " · 心境 +" + t.mind : "");
    },

    /* ================= ③ 分配：执行 ================= */

    // 闭关的唯一执行出口（Core.meditate 也走这里，保证只有一条路径）
    // opts.healOnly = true：重伤疗伤档——只费年月、复原气血、清除重伤标记，不涨修为（战败惩罚的意义所在）
    seclude: function (id, opts) {
        var p = GAME.State.p();
        if (!p || p.isDead || p.combat) return false;
        if (p.pendingEvent || p.pendingMercy) {
            GAME.UI.log("尚有未了之事悬在心头，无法入定。", "system");
            GAME.UI.updateUI();
            return false;
        }
        opts = opts || {};
        var t = this.tier(p, id || "short");
        if (!t) return false;
        // 燃寿暗伤未愈：长关苦修恐致经脉崩裂，须先养伤或服【玄元丹】
        if (p.hiddenInjury && (id || "short") === "epic") {
            GAME.UI.log("燃寿暗伤未愈，经脉脆弱——长关苦修恐致崩裂。先服【玄元丹】或静养 " + p.hiddenInjury.months + " 月再入定。", "danger");
            GAME.UI.updateUI();
            return false;
        }
        if (!t.ok) {
            GAME.UI.log("无法闭关——" + t.why + "。", "danger");
            GAME.UI.updateUI();
            return false;
        }

        // 关内危急中断：按整周天截断（留寿元 3 月 / 毒发 1 月的反应窗口）
        var cut = this._clampTier(p, t);
        if (cut.impossible) {
            GAME.UI.log("无法闭关——" + cut.why + "。", "danger");
            GAME.UI.updateUI();
            return false;
        }
        if (cut.forced) {
            t.cycles = cut.cycles;
            t.months = cut.months;
            t.exp = this.expOf(p, cut.cycles);
            t.mind = this.mindOf(cut.months);
            if (t.shielded && t.upkeep) t.upkeep = Math.ceil(t.upkeep * cut.months / (t.months || 1));
            GAME.UI.log("【强行破关】你心下悚然——" + cut.why + "。只敢入定 " + cut.months +
                " 月，到点务必准时收功，迟则生变。", "warning");
        }

        // 入定即离市：清「在坊市中」标记，并让左栏从市集货架切回洞府视图
        if (GAME.UI && GAME.UI.leaveMarketTo) GAME.UI.leaveMarketTo("home");

        var extra = (GAME.Home && GAME.Home.meditateExp) ? GAME.Home.meditateExp() : 0;
        if (opts.healOnly) {
            // 静坐疗伤：气血尽复、重伤标记得清，修为不增
            p.currentHp = p.maxHp;
            delete p.wounded;
            GAME.UI.log("你静坐调息 " + t.months + " 个月，行功过气，淤塞的经脉尽数通畅——气血尽复，重伤已愈。", "success");
        } else {
            p.currentExp += t.exp;
            if (t.mind > 0) p.mind = (p.mind || 0) + t.mind;
        }

        // 阵法长关：入阵而修——参悟星轨（神识上限永久 +25，仅首次）、外敌不得扰
        var form = (GAME.Cave2 && GAME.Cave2.activeFormation) ? GAME.Cave2.activeFormation() : null;
        if (t.shielded && form) {
            if (!p.zhouxingInsight) {
                p.zhouxingInsight = true;
                p.spiritBonus = (p.spiritBonus || 0) + 25;
                var capTxt = (GAME.Puppet && GAME.Puppet.maxSpirit) ? ("（现 " + GAME.Puppet.maxSpirit() + "）") : "";
                GAME.UI.log("阵中二十八宿缓缓流转，你参悟星轨，神识上限永久 +25" + capTxt + "！", "success");
            }
            GAME.UI.log("【" + form.name + "】合拢——你在阵中入定，外间风雨不得扰，夺舍与追杀皆被挡在阵外。", "info");
            if (GAME.Chronicle) GAME.Chronicle.narrate("formation_secluded", p);
        }

        // 修炼日志带折叠键（fold）：见闻录把连续打坐累加成一条，不刷屏（疗伤档不折叠）
        var foldArg = opts.healOnly ? null : { fold: "meditate", months: t.months, exp: t.exp, mind: t.mind };
        if (t.cycles <= 1) {
            GAME.UI.log("你闭门吐纳 " + t.months + " 个月，杂灵根吸纳的灵气微乎其微，修为 +" + t.exp +
                (extra ? "（藏经阁 +" + extra + "）" : "") + "。", "info", foldArg);
        } else {
            GAME.UI.log("你闭关苦修 " + t.months + " 个月，出关时蒲团上落了一层灰——修为 +" + t.exp +
                (t.mind > 0 ? "，心境 +" + t.mind : "") + "。", "info", foldArg);
        }
        // 闭关期间挂屏蔽标记：passTime 内的夺舍/追杀检查据此不打断闭关
        p.seclusion = { id: t.id, shielded: !!t.shielded };
        GAME.Core.passTime(t.months);
        p.seclusion = null;
        return true;
    },

    /* ================= 预告：这 N 个月里世界会发生什么 ================= */
    // 让"时间花出去"的代价可见——坊市换货、倒计时余量、寿元余量
    preview: function (p, months) {
        p = p || GAME.State.p();
        var out = [];
        var end = (p.totalMonths || 0) + months;
        if (p.marketNextRefresh != null) {
            var step = (GAME.DATA.MARKET && GAME.DATA.MARKET.refreshMonths) || 12;
            if (end >= p.marketNextRefresh) {
                out.push("坊市换货 " + (Math.floor((end - p.marketNextRefresh) / step) + 1) + " 次");
            }
        }
        if (p.shichong && typeof p.shichong.months === "number") {
            out.push("尸虫丸余 " + Math.max(0, p.shichong.months - months) + " 月");
        }
        if (p.yindu && typeof p.yindu.months === "number") {
            out.push("阴毒余 " + Math.max(0, p.yindu.months - months) + " 月");
        }
        if (p.causal && typeof p.causal.months === "number") {
            out.push("因果余 " + Math.max(0, p.causal.months - months) + " 月");
        }
        var left = this.remain(p).total - months;
        out.push("出关时寿元余 " + this._fmt(left));
        return out;
    }
};
