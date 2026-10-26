/* =========================================================
 * js/battle_result.js —— 斗法结算弹窗（胜利 / 战败）
 *
 * 定位：**只负责把已经结算完的数字摊开给玩家看**，不参与任何结算。
 *  - 灵石、修为、掉落、折寿、失财，全部由 combat.js 算完后塞进来；
 *    本模块一个 random 都不调 —— 否则就是第二套结算逻辑。
 *  - 掉落明细靠 Combat 的收集器（Combat._rec）边发边记：grantLoot 里
 *    真正 addItem 成功的才被记下，没 roll 中的不会凭空出现在格子里。
 *    这就是"按规则替换"的意思：格子里那张图背后是它真的进了行囊。
 *  - 覆盖范围：**所有"打赢了"的路径**——野外遭遇、血色禁地、血月试炼、
 *    狩猎秘境、古修遗迹、擂台、千年灵药劫杀，一律经 Combat.handleCombatVictory
 *    走到这里。只有剧情战（玄机子）与"杀/放抉择"不走：它们的下一步由剧情
 *    面板负责，这里再插一层会把玩家夹在两层弹窗之间。
 *  - 【收下战利品】= 账实核对 + 一条清算回执。真正的入袋在战斗收尾那一刻
 *    就已原子完成并落了存档；这里只补记差额（幂等）。所以刷新页面、连点两次
 *    都不会重复发放，也不会因为玩家忘了点而丢东西。
 *
 * 两层配色：胜利=鎏金竹青，战败=赤墨。与斗法页一致固定用暗底——
 * 它是一次"仪式"，不是页面，浅色模式下也不翻白。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.BattleResult = {
    _d: null,
    MAX_SLOT: 6,      // 战利品最多摊几格（再多就"等 N 件"合并，免得横幅溢出卷轴）

    init: function () {
        if (document.getElementById("result-page")) return;
        var w = document.createElement("div");
        w.id = "result-page";
        w.className = "result-page";
        w.innerHTML =
            '<div class="rg-scroll">' +
                '<span class="rg-pole rg-l"></span>' +
                '<div class="rg-paper">' +
                    '<div class="rg-seal" id="rg-seal">大获全胜</div>' +
                    '<p class="rg-lead" id="rg-lead"></p>' +
                    '<div class="rg-gains" id="rg-gains"></div>' +
                    '<div class="rg-loot" id="rg-loot"></div>' +
                    '<p class="rg-sum" id="rg-sum"></p>' +
                '</div>' +
                '<span class="rg-pole rg-r"></span>' +
            '</div>' +
            '<div class="rg-actions" id="rg-actions"></div>';
        document.body.appendChild(w);
    },

    /* ---------- 由 Combat 调用：结算已经落账，这里只摊开 ---------- */
    show: function (rec) {
        if (!rec) return;
        this.init();
        this._d = rec;

        var self = this;
        var p = GAME.State.p();
        var root = document.getElementById("result-page");
        root.classList.remove("is-win", "is-lose");
        root.classList.add(rec.win ? "is-win" : "is-lose");

        var seal = document.getElementById("rg-seal");
        var lead = document.getElementById("rg-lead");
        var gains = document.getElementById("rg-gains");
        var loot = document.getElementById("rg-loot");
        var sum = document.getElementById("rg-sum");

        if (rec.win) {
            seal.innerHTML = "斗法大胜 · 斩妖凯旋";
            // 副标题按"斩的是妖兽还是人"分开说：杀妖只会见血，并不消减煞气——
            // 旧版一句"煞气渐敛"打在所有对手身上，等于骗玩家多杀怪。
            lead.innerHTML = rec.beast
                ? "<b>【" + this._esc(rec.foe) + "】已伏诛</b>，山林一时清静，你剖开兽身、收拾残局。"
                : "<b>【" + this._esc(rec.foe) + "】已伏诛</b>，你收起法器，清点对方遗落之物。";
            gains.innerHTML = this._gain("修为", "+" + (rec.exp || 0)) +
                              (rec.stones > 0 ? this._gain("灵石", rec.stones + " 枚") : "");
            var lootHtml = this._lootBox(rec);
            loot.innerHTML = lootHtml.html;
            sum.innerText = this._sumText(rec);
            this._renderActions([{ id: "rg-act", label: "收 下 战 利 品", onClick: function () { self.claim(); } }]);
        } else {
            seal.innerHTML = "力竭<span>战败</span>";
            lead.innerHTML = "【" + this._esc(rec.foe) + "】搜刮了你的储物袋，冷笑而去";
            gains.innerHTML = "";
            loot.innerHTML = this._lossBox(rec, p);
            sum.innerText = "此战伤了根基。回洞府打坐，气血方能慢慢养回来。";
            this._renderActions([{ id: "rg-act", label: "拖 残 躯 回 洞 府 疗 伤", onClick: function () { self.claim(); } }]);
        }

        // 重播一次入场动画（连续两场时第二场也要有"滑出"）
        root.classList.remove("on");
        void root.offsetWidth;
        root.classList.add("on");
        document.body.classList.add("result-on");
        var af0 = document.getElementById("rg-actions");
        af0 = af0 && af0.children && af0.children[0];
        if (af0 && af0.focus) af0.focus({ preventScroll: true });
    },

    _gain: function (label, val) {
        return '<div class="rg-gain"><em>' + label + '</em><b>' + this._esc(val) + "</b></div>";
    },

    /* ---------- 战利品：格子全部来自真·到手物品 ---------- */
    _lootBox: function (rec) {
        var cells = [], self = this;
        if (rec.stones > 0) {
            cells.push({ src: (GAME.Art ? GAME.Art.itemSrc("spirit_stone") : "assets/items/spirit_stone.jpg"), name: "灵石", qty: rec.stones, like: "q-fan" });
        }
        (rec.items || []).forEach(function (it) {
            var d = (GAME.DATA.ITEMS && GAME.DATA.ITEMS[it.id]) || {};
            cells.push({
                src: GAME.Art ? GAME.Art.itemSrc(it.id, d) : "",
                name: d.name || it.id,
                qty: it.qty,
                like: GAME.Art ? GAME.Art.qualityClass(d.quality).replace("iq-", "q-") : "q-fan"
            });
        });

        if (!cells.length) {
            return { html: '<div class="rg-loot-hd">战 利 品</div>' +
                '<div class="rg-empty">尸身上只有一件洗得发白的旧袍，别无长物。</div>' };
        }

        var show = cells.slice(0, this.MAX_SLOT);
        var html = ['<div class="rg-loot-hd">战 利 品</div>', '<div class="rg-grid">'];
        show.forEach(function (c) {
            html.push('<div class="rg-slot ' + c.like + '">' +
                '<span class="rg-ico"><img src="' + c.src + '" alt="" onerror="this.style.display=\'none\'"></span>' +
                '<b>' + self._esc(c.name) + "</b>" +
                '<em>×' + c.qty + "</em></div>");
        });
        // ⛔ 不再补空槽：格子数=实际所得件数，右侧那些虚线空框只会让人以为"还有东西没显示"。
        //    .rg-grid 已是 justify-content:center，件数少也居中，横幅不会歪。
        html.push("</div>");
        return { html: html.join("") };
    },

    _lossBox: function (rec, p) {
        var maxHp = Math.max(1, rec.maxHp || p.maxHp || 1);
        var pct = Math.max(1.5, Math.min(100, rec.hp / maxHp * 100));
        return '<div class="rg-lost">' +
            '<div class="rg-lost-hd">战 失 统 计</div>' +
            '<p><em>寿元折损</em><b class="bad">-' + rec.lostAge + " 年</b></p>" +
            '<p><em>遗失灵石</em><b class="bad">-' + rec.lostStones + " 枚</b></p>" +
            '<p><em>当前气血</em><b>' + rec.hp + " / " + maxHp + "（重创）</b></p>" +
            '<div class="rg-hp"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
            "</div>";
    },

    // 胜利时不再重复打印"战利品：灵石 ×32"——上面 .rg-gains 已写灵石、中部格子已摊开
    // 每件物品的图标与数量，同一笔账说三遍只是噪音。战败的收尾话仍由 show() 直接给。
    _sumText: function (rec) {
        return "";
    },

    /* ---------- 【收下战利品】：账实核对（幂等），再离开 ----------
     * 战斗收尾时就已经 addItem 入袋了，这里不重发，只补"账上有、包里没有"
     * 的缺口（正常路径下恒为 0）。万一玩家在别处消耗了同 id 的同批物品，
     * 差额会补回来——按钮上写着"收下"，就该真的收得下。 */
    claim: function () {
        var rec = this._d;
        if (!rec) return;
        if (rec.win && !rec._claimed) {
            rec._claimed = true;
            var back = 0, self = this;
            (rec.items || []).forEach(function (it) {
                var have = GAME.State.countItem(it.id);
                if (have < it.qty) { GAME.State.addItem(it.id, it.qty - have); back += it.qty - have; }
            });
            var parts = [];
            if (rec.stones > 0) parts.push("灵石 ×" + rec.stones);
            (rec.items || []).forEach(function (it) {
                var d = (GAME.DATA.ITEMS && GAME.DATA.ITEMS[it.id]) || {};
                parts.push((d.name || it.id) + " ×" + it.qty);
            });
            GAME.UI.log("【清算入袋】" + (parts.length ? parts.join("、") : "尸身上别无长物，只余一身煞气") +
                "。" + (back > 0 ? "（补记 " + back + " 件）" : ""), "loot");
        }
        this.dismiss();
    },

    /* ---------- 离开：胜利回原探索点（或留在副本里），战败回洞府 ---------- */
    dismiss: function () {
        var rec = this._d;
        var root = document.getElementById("result-page");
        if (root) root.classList.remove("on");
        document.body.classList.remove("result-on");
        this._d = null;

        var pp = GAME.State.p();

        // 非战斗卷轴（游历 / 秘境结算）：交给调用方自己的收尾逻辑
        if (rec && rec._scroll) {
            if (rec.onDismiss) rec.onDismiss();
            GAME.UI.autoSave();
            if (pp && pp._pendingSettle) { var ps = pp._pendingSettle; pp._pendingSettle = null; this.showScroll(ps); }
            return;
        }

        if (!rec) return;
        // 人还在秘境里（禁地/试炼/遗迹/狩猎）：switchTab 会被秘境总闸拦下，
        // 还会多打一条"走不得"的红字——此刻本就不该走，留在副本面板等下一步即可。
        var dg = (GAME.State.dungeonName ? GAME.State.dungeonName(GAME.State.p()) : "");
        if (rec.win) {
            var n = (rec.items || []).reduce(function (a, b) { return a + b.qty; }, 0) + (rec.stones > 0 ? 1 : 0);
            GAME.UI.log("【斩妖捷报】" + rec.foe + " 已伏诛，行囊里多了 " + n + " 样东西。", "success");
            if (dg) GAME.UI.updateUI();     // 就在原地，副本面板接着用
            else GAME.UI.switchTab("map");  // 回到遇袭的那片地，脚下还是原处
        } else {
            GAME.UI.log("你拖着残躯回到洞府。气血未复之前，不宜再外出历练——打坐调息可养回来。", "warning");
            if (dg) GAME.UI.updateUI();
            else GAME.UI.switchTab("home");
        }
        GAME.UI.autoSave();

        // 斗法胜利之后，若秘境/试炼/狩猎另有结算卷轴排队（如通关结算），补放出来
        if (pp && pp._pendingSettle) {
            var ps = pp._pendingSettle;
            pp._pendingSettle = null;
            this.showScroll(ps);
        }
    },

    /* ---------- 通用卷轴：游历结算 / 秘境通关 等非战斗场景复用同一套皮 ---------- */
    showScroll: function (cfg) {
        if (!cfg) return;
        this.init();
        var root = document.getElementById("result-page");
        root.classList.remove("is-win", "is-lose");
        root.classList.add(cfg.variant === "lose" ? "is-lose" : "is-win");

        var seal = document.getElementById("rg-seal");
        var lead = document.getElementById("rg-lead");
        var gains = document.getElementById("rg-gains");
        var loot = document.getElementById("rg-loot");
        var sum = document.getElementById("rg-sum");

        seal.innerHTML = this._esc(cfg.seal || "");
        lead.innerHTML = cfg.lead ? this._esc(cfg.lead) : "";

        var g = "";
        (cfg.gains || []).forEach(function (r) {
            g += '<div class="rg-gain"><em>' + GAME.BattleResult._esc(r.label) + '</em><b>' + GAME.BattleResult._esc(r.val) + "</b></div>";
        });
        gains.innerHTML = g;

        loot.innerHTML = this._lootHtml(cfg.loot);

        sum.innerText = cfg.sum || "";

        this._renderActions(cfg.actions || []);

        root.classList.remove("on");
        void root.offsetWidth;
        root.classList.add("on");
        document.body.classList.add("result-on");

        this._d = { _scroll: true, onDismiss: cfg.onDismiss || null };
    },

    _renderActions: function (arr) {
        var box = document.getElementById("rg-actions");
        if (!box) return;
        box.innerHTML = "";
        (arr || []).forEach(function (a) {
            var b = document.getElementById(a.id || "rg-act");
            if (!b) { b = document.createElement("button"); b.id = a.id || "rg-act"; }
            b.className = "rg-act" + (a.cls ? " " + a.cls : "");
            b.innerHTML = a.label;
            b.onclick = a.onClick || function () {};
            box.appendChild(b);
        });
        var first = box.children && box.children[0];
        if (first && first.focus) first.focus({ preventScroll: true });
    },

    _lootHtml: function (loot) {
        if (!loot) return "";
        var items = loot.items || [];
        if (!items.length) {
            return '<div class="rg-loot-hd">' + this._esc(loot.title || "所 获") + "</div>" +
                '<div class="rg-empty">' + this._esc(loot.empty || "此行空手而回。") + "</div>";
        }
        var cells = [], self = this;
        items.forEach(function (it) {
            var d = (GAME.DATA.ITEMS && GAME.DATA.ITEMS[it.id]) || {};
            cells.push({
                src: (GAME.Art ? GAME.Art.itemSrc(it.id, d) : ""),
                name: it.name || d.name || it.id,
                qty: it.qty,
                like: GAME.Art ? GAME.Art.qualityClass(d.quality || it.quality).replace("iq-", "q-") : "q-fan"
            });
        });
        var show = cells.slice(0, this.MAX_SLOT);
        var html = ['<div class="rg-loot-hd">' + this._esc(loot.title || "所 获") + "</div>", '<div class="rg-grid">'];
        show.forEach(function (c) {
            html.push('<div class="rg-slot ' + c.like + '">' +
                '<span class="rg-ico"><img src="' + c.src + '" alt="" onerror="this.style.display=\'none\'"></span>' +
                '<b>' + self._esc(c.name) + "</b>" +
                '<em>×' + c.qty + "</em></div>");
        });
        html.push("</div>");   // 同上：只画真到手的，不补虚线空框
        return html.join("");
    },

    isOpen: function () {
        var root = document.getElementById("result-page");
        return !!(root && root.classList.contains("on"));
    },

    _esc: function (s) {
        return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
};
