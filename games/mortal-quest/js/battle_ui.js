/* =========================================================
 * js/battle_ui.js —— 斗法页（全屏覆盖层）
 *
 * 定位：**只是皮，不是第二套战斗逻辑**。
 *  - 数据全部读 p.combat（Combat.start 建的那份），一个字段都不缓存。
 *  - 按钮一律「找到真按钮再点它」（btn-attack / btn-flee …），
 *    所以禁用态、文案、冷却全跟 Combat 走，永远同步。
 *  - 符箓 / 术法 列表在覆盖层里自己画（原列表在隐藏面板里看不见），
 *    但调用的仍是 Combat.useTalisman / Combat.castSpell。
 *  - 战局实况 = UI.log 的旁路副本（BattleUI.feed），不另开枪。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.BattleUI = {
    _on: false,
    _tab: null,          // null | "talisman" | "spell"
    _feed: [],           // { t:文本, k:类型, r:回合 }
    _collapsed: false,
    _seeded: false,

    MAJOR: ["练气", "筑基", "结丹"],

    // 主命令：走真按钮
    CMDS: [
        { src: "btn-attack", glyph: "击", name: "斗法" },
        { src: "btn-talisman", glyph: "符", name: "符箓" },
        { src: "btn-spell", glyph: "术", name: "术法" },
        { src: "btn-flee", glyph: "遁", name: "遁走" }
    ],
    // 旁门手段：文案照抄真按钮
    EXTRAS: [
        "btn-auto-combat", "btn-coat", "btn-detonate", "btn-fubao",
        "btn-luoyan", "btn-blink", "btn-companion-block", "btn-companion-smash",
        "btn-insect-cloud"
    ],

    // ---------- 建 DOM（只建一次，之后只改文本） ----------
    init: function () {
        if (document.getElementById("battle-page")) return;
        var wrap = document.createElement("div");
        wrap.id = "battle-page";
        wrap.className = "battle-page";
        wrap.innerHTML =
            '<div class="bp-frame">' +
                '<div class="bp-plaque"><span>斗 法 之 中</span></div>' +
                '<button class="bp-fold" id="bp-fold" title="收起斗法页（战斗继续，随时可回到战场）">收</button>' +
                '<div class="bp-stage">' +
                    '<div class="bp-side" id="bp-side-me">' +
                        '<div class="bp-ava"><img id="bp-me-img" alt=""></div>' +
                        '<div class="bp-meta">' +
                            '<div class="bp-nm"><b id="bp-me-nm">—</b><em id="bp-me-tag">—</em></div>' +
                            '<div class="bp-bar bp-hp"><i id="bp-me-hp"></i><span id="bp-me-hp-t">—</span></div>' +
                            '<div class="bp-bar bp-gd" id="bp-me-gdbar"><i id="bp-me-gd"></i><span id="bp-me-gd-t">—</span></div>' +
                            '<div class="bp-line" id="bp-me-line">—</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="bp-center"><span>斗</span></div>' +
                    '<div class="bp-side bp-right" id="bp-side-foe">' +
                        '<div class="bp-ava"><img id="bp-foe-img" alt=""></div>' +
                        '<div class="bp-meta">' +
                            '<div class="bp-nm"><b id="bp-foe-nm">—</b><em id="bp-foe-tag">—</em></div>' +
                            '<div class="bp-bar bp-hp"><i id="bp-foe-hp"></i><span id="bp-foe-hp-t">—</span></div>' +
                            '<div class="bp-bar bp-gd" id="bp-foe-gdbar"><i id="bp-foe-gd"></i><span id="bp-foe-gd-t">—</span></div>' +
                            '<div class="bp-line" id="bp-foe-line">—</div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
                '<div class="bp-scroll">' +
                    '<div class="bp-scroll-hd">战 局 实 况</div>' +
                    '<div class="bp-log" id="bp-log"></div>' +
                '</div>' +
                '<div class="bp-drawer" id="bp-drawer"></div>' +
                '<div class="bp-cmds" id="bp-cmds"></div>' +
                '<div class="bp-extras" id="bp-extras"></div>' +
            '</div>';
        document.body.appendChild(wrap);
        // 召回条要挂在覆盖层**外面**：收起来后覆盖层是 display:none，挂在里面就一起没了
        var back = document.createElement("button");
        back.className = "bp-back";
        back.id = "bp-back";
        back.innerText = "斗法未止 · 回到战场";
        document.body.appendChild(back);

        var self = this;
        document.getElementById("bp-fold").onclick = function () { self.setCollapsed(true); };
        document.getElementById("bp-back").onclick = function () { self.setCollapsed(false); };
        document.getElementById("bp-cmds").onclick = function (e) {
            var b = e.target.closest ? e.target.closest(".bp-cmd") : null;
            if (!b || b.disabled) return;
            self.fire(b.getAttribute("data-src"));
        };
        document.getElementById("bp-extras").onclick = function (e) {
            var b = e.target.closest ? e.target.closest(".bp-chip") : null;
            if (!b || b.disabled) return;
            self.fire(b.getAttribute("data-src"));
        };
        document.getElementById("bp-drawer").onclick = function (e) {
            var b = e.target.closest ? e.target.closest("[data-use]") : null;
            if (!b || b.disabled) return;
            var kind = b.getAttribute("data-kind"), id = b.getAttribute("data-use");
            self._tab = null;
            if (kind === "talisman") GAME.Combat.useTalisman(id);
            else GAME.Combat.castSpell(id);
        };
    },

    setCollapsed: function (on) {
        this._collapsed = !!on;
        document.body.classList.toggle("battle-folded", this._collapsed);
    },

    // 主命令 / 旁门手段统一走这里：点真按钮，逻辑零复制
    fire: function (srcId) {
        var b = document.getElementById(srcId);
        if (!b || b.disabled) return;
        if (srcId === "btn-talisman" || srcId === "btn-spell") {
            var t = srcId === "btn-spell" ? "spell" : "talisman";
            this._tab = (this._tab === t) ? null : t;
            this.render();
            return;
        }
        b.click();
    },

    // ---------- 日志旁路 ----------
    feed: function (text, type) {
        if (!this._on) return;
        var p = GAME.State.p();
        var c = p && p.combat;
        if (!c) return;
        this._feed.push({ t: text, k: type || "info", r: c.round });
        if (this._feed.length > 80) this._feed.shift();
    },

    // 开战时前几行日志发生在覆盖层打开之前，从见闻录里补一段，别让战报从第二条开始
    _seed: function (c) {
        if (this._seeded) return;
        this._seeded = true;
        var box = document.getElementById("log-box");
        if (!box) return;
        // 见闻录已改成"旧在前、新在后"（正常文档流 + 吸底），所以从末尾倒着收，
        // 收出来仍是新的在前，下面的 at - 2 语义不变。
        var nm = c.name || "", all = [], el = box.lastChild;
        while (el && all.length < 40) {
            if (el.innerText) all.push(el.innerText);
            el = el.previousSibling;
        }
        // all[0] 最新。找到这一场的「杀机骤现」，再往前捞两条
        // （（你：攻… / 图鉴录入）——再早的就是上一场或历练旧闻了。
        var at = -1;
        for (var i = 0; i < all.length; i++) {
            if (all[i].indexOf("杀机骤现") >= 0 && all[i].indexOf(nm) >= 0) { at = i; break; }
        }
        if (at < 0) return;
        var take = all.slice(Math.max(0, at - 2), at + 1).reverse();
        for (var j = 0; j < take.length; j++) {
            this._feed.push({ t: take[j].replace(/^\[\d+岁\d+月\]\s*/, ""), k: "info", r: c.round });
        }
    },

    _bar: function (fillId, txtId, cur, max, label) {
        var f = document.getElementById(fillId), t = document.getElementById(txtId);
        if (!f || !t) return;
        max = Math.max(1, max || 0);
        cur = Math.max(0, Math.min(max, cur || 0));
        f.style.width = (cur / max * 100).toFixed(1) + "%";
        t.innerText = label + Math.round(cur) + " / " + Math.round(max);
    },

    _txt: function (id, v) {
        var e = document.getElementById(id);
        if (e) e.innerText = v;
    },

    // ---------- 每次 updateUI 都刷新 ----------
    render: function () {
        var p = GAME.State.p();
        var c = p && p.combat;
        var root = document.getElementById("battle-page");
        if (!root) return;

        if (!c) {
            this._on = false;
            this._tab = null;
            this._feed = [];
            this._seeded = false;
            this._combat = null;
            this.setCollapsed(false);
            document.body.classList.remove("battle-on");
            return;
        }

        // 以战斗对象身份判断「是不是同一场」：两场连打时战报不能混在一起
        var isNewFight = this._combat !== c;
        if (isNewFight) {
            this._combat = c;
            this._feed = [];
            this._seeded = false;
            this._tab = null;
        }
        this._on = true;
        document.body.classList.add("battle-on");
        if (isNewFight) { this._seed(c); }

        var self = this;
        var r = (GAME.DATA.REALMS && GAME.DATA.REALMS[p.realmIndex]) || {};
        var st = GAME.State.getStats();

        // —— 我方 ——
        this._txt("bp-me-nm", p.name || p.alias || "无名散修");
        this._txt("bp-me-tag", "【" + (r.name || "练气") + "】");
        this._bar("bp-me-hp", "bp-me-hp-t", p.currentHp, p.maxHp, "气血 ");
        this._bar("bp-me-gd", "bp-me-gd-t", c.shield, 40, "罡气 ");
        document.getElementById("bp-me-gdbar").classList.toggle("is-dim", !(c.shield > 0));
        var meLine = "攻 " + st.atk + "　防 " + st.def + "　速 " + st.speed + "　识 " + st.spirit;
        if (p.companion && p.companion.maxHp) meLine += "　｜　玄傀 " + Math.max(0, p.companion.hp) + "/" + p.companion.maxHp;
        this._txt("bp-me-line", meLine);
        document.getElementById("bp-me-img").src = GAME.Art ? GAME.Art.playerPortrait() : "";

        // —— 对手 ——
        var def = c.def || {};
        this._txt("bp-foe-nm", c.name || "对手");
        // 怪物名多为「铁齿狼 · 一阶妖兽」，一栏塞不下；拆开：大名字，小注里放后半截
        var parts = String(c.name || "对手").split(/[·・]/);
        var mainNm = (parts[0] || "").trim();
        var subNm = parts.slice(1).join(" · ").trim();
        if (!subNm) {
            var foeKind = def.human ? "修士" : "妖兽";
            subNm = (c.def && c.def.majorRealm != null)
                ? (this.MAJOR[c.monsterMajor] || "练气") + foeKind : foeKind;
        }
        this._txt("bp-foe-nm", mainNm);
        this._txt("bp-foe-tag", "【" + subNm + "】");
        this._bar("bp-foe-hp", "bp-foe-hp-t", c.hp, c.maxHp, "气血 ");
        this._bar("bp-foe-gd", "bp-foe-gd-t", 0, 40, "罡气 ");
        document.getElementById("bp-foe-gdbar").classList.add("is-dim");
        this._txt("bp-foe-line", "攻 " + c.atk + "　防 " + def.def + "　速 " + c.speed + "　识 " + c.spirit +
            (c.affix ? "　｜　" + (c.affix === "berserk" ? "狂暴" : c.affix === "thickShell" ? "厚甲" : "夺舍残魂") : ""));
        document.getElementById("bp-foe-img").src = GAME.Art ? GAME.Art.monsterPortrait(c) : "";

        // —— 战报 ——
        var logBox = document.getElementById("bp-log");
        var html = [], lastR = -1;
        var list = this._feed.slice(-16);
        for (var i = 0; i < list.length; i++) {
            var e = list[i];
            if (e.r !== lastR && e.r > 0) {
                html.push('<div class="bp-rnd">第 ' + e.r + " 回合</div>");
                lastR = e.r;
            }
            html.push('<div class="bp-ln bp-' + e.k + '">' + this._esc(e.t) + "</div>");
        }
        if (!html.length) html.push('<div class="bp-ln bp-system">风起，杀气已至。</div>');
        logBox.innerHTML = html.join("");
        logBox.scrollTop = logBox.scrollHeight;

        // —— 主命令 ——
        var cmds = document.getElementById("bp-cmds");
        cmds.innerHTML = "";
        this.CMDS.forEach(function (cmd) {
            var src = document.getElementById(cmd.src);
            var b = document.createElement("button");
            b.className = "bp-cmd";
            b.setAttribute("data-src", cmd.src);
            b.disabled = !src || src.disabled;
            b.innerHTML = '<b>' + cmd.name + '</b><em>' + self._sub(cmd.src, p, c) + "</em>";
            cmds.appendChild(b);
        });
        // 斗法按钮高亮当前回合，符箓/术法打开时反色
        var active = this._tab === "talisman" ? "btn-talisman" : (this._tab === "spell" ? "btn-spell" : null);
        if (active) {
            var ab = cmds.querySelector('[data-src="' + active + '"]');
            if (ab) ab.classList.add("on");
        }

        // —— 旁门手段 ——
        var ex = document.getElementById("bp-extras");
        ex.innerHTML = "";
        this.EXTRAS.forEach(function (id) {
            var src = document.getElementById(id);
            if (!src) return;
            var b = document.createElement("button");
            b.className = "bp-chip";
            b.setAttribute("data-src", id);
            b.disabled = src.disabled;
            b.innerText = (src.innerText || "").trim() || id;
            ex.appendChild(b);
        });

        // —— 符箓 / 术法抽屉 ——
        this._drawer(p, c);
    },

    _sub: function (srcId, p, c) {
        if (srcId === "btn-attack") return "第 " + c.round + " 回合 · 抢先进招";
        if (srcId === "btn-talisman") {
            var n = 0, inv = p.inventory || {};
            for (var k in inv) {
                var it = GAME.DATA.ITEMS[k];
                if (it && it.type === "talisman" && inv[k] > 0) n += inv[k];
            }
            return n ? "身边 " + n + " 张" : "身边无符";
        }
        if (srcId === "btn-spell") {
            var m = 0, sp = GAME.DATA.SPELLS || {};
            for (var id in sp) if (sp[id].dmg && p.spells && p.spells[id]) m++;
            return m ? "已习 " + m + " 门" : "尚未习得";
        }
        if (srcId === "btn-flee") return c.moEvent ? "退路已封" : "三十六计";
        return "";
    },

    _drawer: function (p, c) {
        var box = document.getElementById("bp-drawer");
        if (!this._tab) { box.style.display = "none"; box.innerHTML = ""; return; }
        box.style.display = "block";
        var self = this, html = [];
        if (this._tab === "talisman") {
            var inv = p.inventory || {}, any = false;
            html.push('<div class="bp-drawer-hd">囊中符箓 · 捏碎即发，不耗灵力</div><div class="bp-drawer-list">');
            for (var id in inv) {
                var it = GAME.DATA.ITEMS[id];
                if (!it || it.type !== "talisman" || inv[id] <= 0) continue;
                any = true;
                var cm = it.combat || {};
                var eff = cm.dmg ? cm.dmg + " 伤" : (cm.shield ? "罡气 +" + cm.shield : "遁走之用");
                html.push('<button class="bp-item" data-kind="talisman" data-use="' + id + '">' +
                    '<img src="' + (GAME.Art ? GAME.Art.itemSrc(id, it) : "") + '" alt="">' +
                    '<b>' + it.name + '</b><em>×' + inv[id] + "　" + eff + "</em></button>");
            }
            if (!any) html.push('<div class="bp-empty">囊中并无符箓。坊市、黑市皆有售。</div>');
            html.push("</div>");
        } else {
            var sp = GAME.DATA.SPELLS || {}, learned = 0;
            html.push('<div class="bp-drawer-hd">已习术法 · 灵力自有循环，唯冷却未复</div><div class="bp-drawer-list">');
            for (var sid in sp) {
                var s = sp[sid];
                if (!s || !s.dmg || !(p.spells && p.spells[sid])) continue;
                learned++;
                var ready = (c.spellReady && c.spellReady[sid]) || 0;
                var cd = Math.max(0, ready - c.round);
                html.push('<button class="bp-item' + (cd ? " off" : "") + '" data-kind="spell" data-use="' + sid + '"' +
                    (cd ? " disabled" : "") + '><b>' + s.name + "</b><em>" + s.dmg + " 伤" +
                    (cd ? "　尚需 " + cd + " 回合" : "　可用") + "</em></button>");
            }
            if (!learned) html.push('<div class="bp-empty">尚未习得可主动施放的攻击术法。</div>');
            html.push("</div>");
        }
        box.innerHTML = html.join("");
    },

    _esc: function (s) {
        return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
};
