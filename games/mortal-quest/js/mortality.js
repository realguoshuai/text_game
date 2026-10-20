/* =========================================================
 * js/mortality.js —— 坐化（寿元尽）与身后事
 *
 * 设计原则：
 *   ① 死不是"游戏结束"，是"这一世结束"——先给一页账，再谈重来；
 *   ② 账目只读不改：reckon() 纯函数，UI 与结算读同一份，别在别处另算；
 *   ③ 传承有边界：只传"带不走的东西"（地里还没熟的药、一句遗书），
 *      绝不传灵石——否则死亡会变成刷资源的捷径；
 *   ④ 一次性：领过即焚，读档重来也不能反复领。
 *
 * 账目为何值得做：玩家会为了"讲给别人听"而玩一个游戏，
 * 而能讲的东西必须是"我这一生做过什么"，不是"我数值多少"。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Mortality = {

    LEGACY_KEY: "immortal_game_legacy_v1",
    LEGACY_VERSION: 1,
    DYING_YEARS: 3,          // 余寿 ≤3 年进入"弥留"，目标卡改口
    PLOT_DRIFT: 10,          // 前世封存后，药圃又自己长了 10 年（时间不等人，药也不等）

    /* ================= 余寿与弥留 ================= */

    leftYears: function (p) {
        p = p || GAME.State.p();
        if (!p) return 0;
        return GAME.State.maxAge() - p.ageYears;
    },

    // 弥留：寿元将尽但未死。给玩家提前一次机会，而不是突然一行日志
    dying: function (p) {
        p = p || GAME.State.p();
        if (!p || p.isDead) return { near: false, left: 0 };
        var left = this.leftYears(p);
        return { near: left <= this.DYING_YEARS, left: left };
    },

    /* ================= 一生账目（纯函数） ================= */

    reckon: function (p) {
        p = p || GAME.State.p();
        var st = p.stats || {};
        var realm = GAME.DATA.REALMS[p.realmIndex] || {};
        var born = 16;                                   // 入道之年：出身表统一 16 岁
        var died = p.ageYears || born;
        var limit = GAME.State.maxAge();

        // 药圃：三垄各长到哪一年
        var plots = [], seeds = 0, ripe = 0, totalYears = 0;
        var list = p.plots || [];
        for (var i = 0; i < list.length; i++) {
            if (!list[i]) { plots.push({ i: i, empty: true, years: 0 }); continue; }
            var y = Math.floor(list[i].y || 0);
            plots.push({ i: i, empty: false, years: y });
            totalYears += y;
            seeds++;
            if (y >= (GAME.DATA.PLOT ? GAME.DATA.PLOT.harvest.years : 1000)) ripe++;
        }

        // 故人：羁绊里已走完的
        var bonds = [], B = p.bonds || {};
        for (var k in B) {
            if (B[k] && B[k].done) bonds.push(k);
        }

        var r = {
            name: p.name || "无名散修",
            alias: p.alias || "",
            bornAge: born,
            diedAge: died,
            span: Math.max(0, died - born),
            limit: limit,
            realmIndex: p.realmIndex || 0,
            realmName: realm.name || "凡人",
            karma: p.karma || 0,
            mind: p.mind || 0,
            kills: st.kills || 0,
            mercies: st.mercies || 0,
            breakthroughs: st.breakthroughs || 0,
            explores: st.explores || 0,
            alchemy: st.alchemy || 0,
            stones: p.spiritStones || 0,
            plots: plots,
            seeds: seeds,
            ripe: ripe,
            plotYears: totalYears,
            bonds: bonds,
            reason: p.deathReason || ""
        };
        r.verdict = this.verdict(r);
        r.regret = this.regret(r, p);
        return r;
    },

    // 判词：不是评价，是墓碑上那句话
    verdict: function (r) {
        if (r.karma <= -30) return "你走过的地方，草木都记得你。";
        if (r.realmIndex >= 22) return "金丹已成。天地却没再给你更多年月——到这一步，已不是勤勉能解决的事。";
        if (r.realmIndex >= 13) return "你筑基了。这一界绝大多数人，一辈子都卡在你随手迈过的那道坎上。";
        if (r.mind >= 60) return "你没走多远，但走得干净。心静的人，寿元总差一点。";
        if (r.kills >= 40) return "你杀过太多东西，也躲过太多回。最后没有谁杀你——是年月。";
        if (r.seeds > 0) return "你种下的药还没熟。地不管你在不在，它照旧长。";
        return "一辈子都在练气。修士们把这叫作「凡」。";
    },

    // 未了之事：给玩家看"差一点什么"，而不是一句"你死了"
    regret: function (r, p) {
        if (r.realmIndex >= 30) return "";
        var next = GAME.DATA.REALMS[r.realmIndex + 1];
        if (!next) return "";
        var need = (next.needExp || 0) - Math.floor(p.currentExp || 0);
        if (need > 0) return "差 " + need + " 点修为可窥「" + next.name + "」，此关未过。";
        return "修为已足，只差一次冲关——你没等到那个日子。";
    },

    /* ================= 遗书 ================= */

    LETTERS: [
        { id: "self", text: "后来者：药圃第三垄埋得最深，别急着挖。" },
        { id: "warn", text: "后来者：伪灵根不必自轻，只是要熬。熬得住，就是你的道。" },
        { id: "empty", text: "后来者：我这一生没什么可留的。地是好地，你接着种。" }
    ],

    letterById: function (id) {
        for (var i = 0; i < this.LETTERS.length; i++) {
            if (this.LETTERS[i].id === id) return this.LETTERS[i];
        }
        return this.LETTERS[0];
    },

    /* ================= 坐化 ================= */

    // 寿元尽时的收束：设死因、封存身后事、写日志。返回账目供 UI 渲染。
    // ★ 只处理"寿元尽"；气血耗尽/阴毒等其他死法仍走 core 原路径（它们不是坐化）。
    die: function (reason) {
        var p = GAME.State.p();
        if (!p) return null;
        p.isDead = true;
        p.deathReason = reason || ("寿元 " + GAME.State.maxAge() + " 岁大限已至");
        var r = this.reckon(p);
        p.reckoning = r;                        // 存入当世，UI 直接读（死亡不入档，无污染风险）
        GAME.UI.log("【坐化】" + p.deathReason + "。你盘膝于洞府深处，最后一口气散在蒲团上。", "danger");
        return r;
    },

    /* ================= 传承：只传带不走的东西 ================= */

    readLegacy: function () {
        try {
            var raw = window.localStorage.getItem(this.LEGACY_KEY);
            if (!raw) return null;
            var o = JSON.parse(raw);
            if (!o || o._v !== this.LEGACY_VERSION) return null;
            return o;
        } catch (e) { return null; }
    },

    writeLegacy: function (r, letterId) {
        var keep = [], cap = GAME.DATA.PLOT ? GAME.DATA.PLOT.capYears : 1000;
        (r.plots || []).forEach(function (s) {
            if (s.empty || !(s.years > 0)) { keep.push(null); return; }
            // 前世埋下的药，在无人看管的年月里继续长（+PLOT_DRIFT），但仍受千年上限
            keep.push({ y: Math.min(cap, s.years + GAME.Mortality.PLOT_DRIFT) });
        });
        var o = {
            _v: this.LEGACY_VERSION,
            from: r.name,
            alias: r.alias,
            realmName: r.realmName,
            realmIndex: r.realmIndex,
            bornAge: r.bornAge,
            diedAge: r.diedAge,
            verdict: r.verdict,
            letter: this.letterById(letterId).text,
            plots: keep,
            ts: Date.now()
        };
        try {
            window.localStorage.setItem(this.LEGACY_KEY, JSON.stringify(o));
            return o;
        } catch (e) { return null; }
    },

    clearLegacy: function () {
        try { window.localStorage.removeItem(this.LEGACY_KEY); } catch (e) { }
    },

    // 新局开局：把前世的洞府接过来。★ 只在新角色（未修行、未历月）时生效，且领过即焚。
    claim: function (p) {
        p = p || GAME.State.p();
        if (!p) return [];
        if (!this._isNewLife(p)) return [];
        var lg = this.readLegacy();
        if (!lg) return [];

        var out = [];
        out.push("【前尘】洞府里还留着一位叫「" + (lg.alias || lg.from) + "」的散修的痕迹——他坐化于 " +
            lg.diedAge + " 岁，止步" + lg.realmName + "。");
        if (lg.letter) out.push("【遗书】" + lg.letter);

        // 药圃：地里那几株接着长
        var plots = p.plots;
        if (!plots || !plots.length) {
            var n = GAME.DATA.PLOT ? GAME.DATA.PLOT.plots : 3;
            plots = []; for (var a = 0; a < n; a++) plots.push(null);
            p.plots = plots;
        }
        var seed = GAME.DATA.PLOT ? GAME.DATA.PLOT.seed : "herb_bainian";
        var planted = 0, years = 0;
        (lg.plots || []).forEach(function (s, i) {
            if (!s || i >= plots.length) return;
            plots[i] = { h: seed, y: s.y };
            planted++; years = Math.max(years, s.y);
        });
        if (planted > 0) {
            out.push("【药圃】" + planted + " 垄地里还有前世的药，最老的一垄已长到 " + Math.floor(years) + " 年——他没等到，你等到了。");
        }

        p.legacyFrom = lg.from;
        this.clearLegacy();     // 一次性
        return out;
    },

    _isNewLife: function (p) {
        return (p.realmIndex || 0) === 0 && !(p.totalMonths > 0) && !p.legacyFrom;
    }
};
