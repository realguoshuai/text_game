/* =========================================================
 * js/ui.js —— 界面层
 * 日志（带条数上限，弱机友好）、状态/背包/炼丹/坊市/事件/
 * 战后处置/战斗/道碑渲染、按钮事件绑定、白屏防护
 * 本文件底部为入口
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.UI = {

    MAX_LOG: 200,        // 日志最多保留条数，超出删最旧，避免长局卡顿
    started: false,      // 是否已选定出身开局
    selectedOrigin: null,
    tab: "bag",          // 当前面板页签：bag / alchemy / market / ach

    $: function (id) { return document.getElementById(id); },
    // display 参数：grid 容器若被设成 block 会塌成单列，故可显式指定
    show: function (id, visible, display) {
        var el = this.$(id);
        // display 传 "" 表示交回 CSS 默认值（如 .goal-banner 的 flex），不能退化成 block
        if (el) el.style.display = !visible ? "none" : (display === undefined ? "block" : display);
    },

    // 封面 ↔ 戏内 两套界面的统一开关。
    // 教训：目标横幅(goal-banner) 曾是 #game-container 的直接子块、又不在这份名单里，
    // 导致封面阶段它带着上一世的内容残留，在 height:100%/overflow:hidden 的布局里
    // 挤掉出身面板的高度、把"就 此 踏 入 修 仙 界"按钮顶出可视区。
    // 今后任何"只在戏内显示"的顶层容器，都必须登记到 PLAY_ONLY。
    PLAY_ONLY: ["main-panel", "goal-banner", "workspace"],
    setPlayMode: function (on) {
        var self = this;
        this.show("origin-panel", !on);
        this.PLAY_ONLY.forEach(function (id) {
            // workspace 是两栏 grid；goal-banner 靠 CSS 的 flex——都不能用 block 覆盖
            var d = (id === "workspace") ? "grid" : (id === "goal-banner" ? "" : "block");
            self.show(id, on, d);
        });
    },

    // ---------- 面板页签：同屏只显示一个，避免纵向堆叠 ----------
    TAB_MAP: {
        map: "map-panel", bag: "bag-panel", alchemy: "alchemy-panel", market: "market-panel", home: "home-panel",
        codex: "codex-panel",
        sect: "sect-panel", black: "black-panel", companion: "companion-panel",
        skill: "skill-panel", dungeon: "dungeon-panel"
    },

    switchTab: function (name) {
        if (!this.TAB_MAP[name]) return;
        var p = GAME.State.p();
        // 丹炉：练气三层前锁死（玄机子未传手艺）
        if (name === "alchemy" && !GAME.Core.canAlchemy()) {
            this.log("玄机子的炼丹手艺不外传——待你练气三层，他自会开口。", "system");
            return;
        }
        // 坊市仅在坊市处可见；苍南须身在苍南谷；玄机世家须身在景阳城且事件链开启
        if (name === "market" && !p.atMarket) {
            this.log("你尚未前往坊市。先点【前往坊市】才可见商贾。", "system");
            return;
        }
        if (name === "skill" && p.isDead) {
            this.log("你已身死道消，无从研习。", "system");
            return;
        }
        this.tab = name;
        this.updateUI();
    },

    // ---------- 面板可见性：同一时刻只显一个，整页不溢出 ----------
    // 子面板：标签页(bag/alchemy/market/sect/black/ach/companion) + 紧急面板(combat/track/trial/event/mercy/mo)
    applyPanels: function () {
        var p = GAME.State.p();
        // 紧急面板优先级最高：斗法 > 血色禁地 > 神识尾随 > 血月试炼 > 历练事件 > 战后处置 > 玄机子
        var urgent = null;
        if (p.combat) urgent = "combat-panel";
        else if (p.mansion) urgent = "mansion-panel";   // 墨府探查（玄机世家主线子玩法）
        else if (GAME.Qixuan && GAME.Qixuan.active()) urgent = "qixuan-panel";   // 苍梧门六幕剧情
        else if (p.fzone) urgent = "fz-panel";
        else if (p.tracking) urgent = "track-panel";
        else if (p.trial) urgent = "trial-panel";
        else if (p.pendingEvent) urgent = "event-panel";
        else if (p.pendingMercy) urgent = "mercy-panel";
        else if (p.moEvent && !p.combat) urgent = "mo-panel";   // 玄机子阶段一/三（阶段二为战斗，归 combat）
        else if (p.jiayuan && GAME.Jiayuan.at()) urgent = "jiayuan-panel";   // 玄机世家主线对话（已并入大地图，身在此地即显）

        // 坊市页签仅在身处坊市时可看，否则回落储物袋
        if (this.tab === "market" && !p.atMarket) this.tab = "map";
        // 玄机世家已并入大地图，无独立页签；旧存档残留此页签时回落
        if (this.tab === "jiayuan") this.tab = "map";
        // 兜底：未知页签回落大地图，避免整页空白
        if (!this.TAB_MAP[this.tab]) this.tab = "map";
        var visible = urgent || this.TAB_MAP[this.tab];

        var self = this;
        ["map-panel", "bag-panel", "alchemy-panel", "market-panel", "home-panel", "sect-panel", "black-panel", "companion-panel",
         "jiayuan-panel", "skill-panel", "dungeon-panel", "fz-panel", "qixuan-panel",
         "combat-panel", "track-panel", "trial-panel", "event-panel", "mercy-panel", "mo-panel", "mansion-panel", "codex-panel"]
            .forEach(function (id) { self.show(id, id === visible); });

        // 页签按钮：紧急面板期间禁用切换；坊市未进入时禁用该签
        for (var t in this.TAB_MAP) {
            var btn = this.$("tab-" + t);
            if (btn) {
                btn.className = "small-btn" + (this.tab === t ? " tab-on" : "");
                btn.disabled = !!urgent
                    || (t === "market" && !p.atMarket);
            }
        }
    },

    // ---------- 日志 ----------
    log: function (message, type) {
        type = type || "info";
        try {
            var box = this.$("log-box");
            if (!box) return;
            var p = GAME.State.p();
            var entry = document.createElement("div");
            entry.className = "log-entry log-" + type;
            entry.innerText = "[" + p.ageYears + "岁" + p.ageMonths + "月] " + message;
            box.insertBefore(entry, box.firstChild);
            // 裁剪：日志框为 column-reverse，最旧的一条是 lastChild
            while (box.childElementCount > this.MAX_LOG) box.removeChild(box.lastChild);
        } catch (e) { console.error("log异常", e); }
    },

    // ---------- 死亡：禁用一切主操作，仅留存档区 ----------
    setDead: function () {
        var p = GAME.State.p();
        this.log("【道陨】死因：" + (p.deathReason || "未知") + "。修仙界如此残酷，唯轮回石尚存你一生记忆。", "danger");
        this.log("别慌：死亡不会写入存档。读取最近一次轮回石，即可从那一刻重来（也可直接重入轮回开新局）。", "system");
        this.updateUI();
    },

    // ---------- 死亡锁：除「重入轮回」「存档管理」外，所有操作按键置灰禁用 ----------
    // 触发点：setDead() / 战斗 end() / 任何 updateUI 都会走到这里（死亡是终局态）。
    // 原则：死亡后玩家不得再改变今生任何状态；仅可读取轮回石（存档管理）或重开新局（重入轮回）。
    applyDeathLock: function () {
        var p = GAME.State.p();
        var dead = !!(p && p.isDead);
        var ALLOW = { "btn-restart": 1, "btn-manage": 1, "btn-save-close": 1 };
        var self = this;
        // —— 非死亡态：解除上一轮死亡锁，交回业务渲染决定正常禁用 ——
        if (!dead) {
            try {
                var locked = (typeof document !== "undefined" && document.querySelectorAll)
                    ? document.querySelectorAll("button.dead-locked") : [];
                for (var k = 0; k < locked.length; k++) {
                    locked[k].disabled = false;
                    if (locked[k].classList) locked[k].classList.remove("dead-locked");
                }
            } catch (e) {}
            // 还原目标横幅（若曾被「道陨」覆盖）
            var gb = this.$("goal-banner");
            if (gb && gb.className && gb.className.indexOf("urgent") >= 0) {
                gb.className = "goal-banner";
                var gt = this.$("goal-tag"); if (gt) gt.innerText = "";
                var gx = this.$("goal-text"); if (gx) gx.innerText = "";
                var gh = this.$("goal-hint"); if (gh) gh.innerText = "";
            }
            return;
        }
        // —— 死亡态：锁定白名单之外所有按钮（打 dead-locked 标记，便于复活时精准解锁）——
        function lockBtn(b) {
            if (!b) return;
            if (ALLOW[b.id]) return;
            if (b.hasAttribute && b.hasAttribute("data-slot")) return;
            b.disabled = true;
            if (b.classList) b.classList.add("dead-locked");
        }
        var containers = ["topbar", "main-panel", "goal-banner", "workspace", "save-modal"];
        containers.forEach(function (cid) {
            var c = self.$(cid);
            if (!c) return;
            var btns = c.getElementsByTagName("button");
            for (var i = 0; i < btns.length; i++) lockBtn(btns[i]);
        });
        // 兜底：全文档扫描（覆盖任何未来新增容器/游离按钮，名单之外绝不漏锁）
        try {
            var allB = (typeof document !== "undefined" && document.querySelectorAll) ? document.querySelectorAll("button") : [];
            for (var m = 0; m < allB.length; m++) lockBtn(allB[m]);
        } catch (e2) {}
        // 死亡态：目标横幅改为「道陨」提示，解释为何全部操作被锁
        var gb2 = self.$("goal-banner");
        if (gb2) {
            gb2.style.display = "";
            gb2.className = "goal-banner urgent";
            var gt2 = self.$("goal-tag"); if (gt2) gt2.innerText = "道陨";
            var gx2 = self.$("goal-text"); if (gx2) gx2.innerText = (p.deathReason || "未知") + "——今生已止，仅可重入轮回或读取轮回石。";
            var gh2 = self.$("goal-hint"); if (gh2) gh2.innerText = "读回最近一次轮回石，即可从那一刻重来。";
        }
    },

    // ---------- 总渲染 ----------
    // ---------- 当前目标横幅 ----------
    renderGoal: function () {
        var box = this.$("goal-banner");
        if (!box) return;
        if (!this.started) { box.style.display = "none"; return; }
        var g = (GAME.Goals && GAME.Goals.current) ? GAME.Goals.current() : null;
        if (!g) { box.style.display = "none"; return; }
        box.style.display = "";
        box.className = "goal-banner" + (g.urgent ? " urgent" : "");
        var tag = this.$("goal-tag");
        if (tag) tag.innerText = g.urgent ? "当务之急" : "当前目标";
        var t = this.$("goal-text"); if (t) t.innerText = g.text || "—";
        var h = this.$("goal-hint"); if (h) h.innerText = g.hint || "";
        var w = this.$("goal-where"); if (w) w.innerText = g.where ? ("前往：" + g.where) : "";
    },

    updateUI: function () {
        try {
            if (!this.started) { this.renderOrigin(); return; }
            var p = GAME.State.p();
            var realm = GAME.DATA.REALMS[p.realmIndex];
            var s = GAME.State.getStats();

            // 出身名
            var originName = "-";
            GAME.DATA.ORIGINS.forEach(function (o) { if (o.id === p.originId) originName = o.name; });
            this.$("origin-text").innerText = originName;

            // 善恶值着色
            var karmaEl = this.$("karma-text");
            karmaEl.innerText = (p.karma > 0 ? "善 +" : p.karma < 0 ? "恶 " : "") + p.karma;
            karmaEl.className = p.karma > 20 ? "q-灵品" : (p.karma < -20 ? "warning" : "");

            this.$("realm-text").innerText = realm.name;
            this.$("exp-text").innerText = realm.needExp === null ? "此界圆满" : (p.currentExp + " / " + realm.needExp);
            this.$("age-text").innerText = p.ageYears + "岁";
            this.$("max-age-text").innerText = GAME.State.maxAge() + "岁" +
                (p.ageBonus > 0 ? "(+" + p.ageBonus + ")" : "");
            this.$("hp-text").innerText = Math.max(0, p.currentHp) + " / " + p.maxHp;
            this.$("stone-text").innerText = p.spiritStones;
            this.$("liquid-text").innerText = p.liquid;
            this.$("stat-text").innerText = "攻" + s.atk + " 防" + s.def + " 速" + s.speed + " 识" + s.spirit;
            this.$("artifact-text").innerText = p.artifact ? GAME.DATA.ITEMS[p.artifact].name + (p.artifactDurability ? "（耐久" + p.artifactDurability + "）" : "") : "无";

            // 新增状态：贡献 / 煞气 / 敛气
            this.$("contrib-text").innerText = p.sectContrib;
            this.$("sha-text").innerText = p.shaQi;
            this.$("conceal-text").innerText = p.concealLevel;

            // 苍梧门篇：青木功 / 玄傀 / 体内阴毒（暗器/护心已并入储物袋·法器行，看板不再单列）
            this.$("changchun-text").innerText = p.changchunLevel || 0;
            if (p.companion) {
                this.$("companion-text").innerText = p.companion.name + "（气血 " + Math.max(0, p.companion.hp) + "/" + p.companion.maxHp + "）";
            } else {
                this.$("companion-text").innerText = "无";
            }
            this.$("yindu-text").innerText = p.yindu ? ("剩 " + Math.ceil(p.yindu.months / 12) + " 年") : "无";

            // 景阳城·玄机世家篇 / 苍南小会：所在地 / 银两 / 心境 / 门派
            var curNode = GAME.Map.cur();
            this.$("location-text").innerText = curNode ? curNode.name : "流落无依";
            this.$("silver-text").innerText = p.silver || 0;
            this.$("mind-text").innerText = p.mind || 0;
            this.$("sect-text").innerText = p.sectId ? GAME.DATA.TAINAN.token.sectName + "门下" : "散修";

            // 按钮可用性：死亡 / 战斗 / 待决事件 / 玄机子阶段一三 / 六幕剧情进行中 时锁定洞府操作
            var dead = p.isDead, busy = !!p.combat || (!!p.moEvent && !p.combat), waiting = !!p.pendingEvent || !!p.pendingMercy;
            var inStory = !!(GAME.Qixuan && GAME.Qixuan.active());   // 炼骨崖考核等剧情抉择期间，闭关类全部禁点
            var lock = dead || busy || waiting || inStory;
            var ids = ["btn-meditate","btn-catalyze-bainian","btn-catalyze-qiannian","btn-breakthrough","btn-explore","btn-market","btn-sect"];
            for (var i = 0; i < ids.length; i++) this.$(ids[i]).disabled = lock;
            // 丹炉：练气三层前灰显不可点（玄机子未传手艺）
            var alchOk = !lock && GAME.Core.canAlchemy();
            var bAlch = this.$("btn-alchemy");
            bAlch.disabled = !alchOk;
            bAlch.innerText = alchOk ? "开炉炼丹" : (GAME.Core.canAlchemy() ? "开炉炼丹" : "开炉炼丹 (需练气三层)");
            var tAlch = this.$("tab-alchemy");
            if (tAlch) tAlch.disabled = !GAME.Core.canAlchemy();
            // 杂役堂只在幽篁谷且有宗门身份时可用；血色禁地副本入口同理（旧试炼入口已撤）
            var atHome = p.location === GAME.DATA.MAP.start;
            this.$("btn-sect").disabled = lock || !atHome || !p.sectId;

            // 打坐耗时随境界递增（按钮文案动态）
            var mm = realm.meditateMonths || 3;
            this.$("btn-meditate").innerText = "闭关打坐 (" + mm + "月+1修为)";

            var bt = this.$("btn-breakthrough");
            if (realm.needExp === null) { bt.innerText = "此界圆满"; bt.disabled = true; }
            else {
                var next = GAME.DATA.REALMS[p.realmIndex + 1];
                var isZhuji = p.realmIndex === GAME.DATA.ZHUJI_GATE_INDEX;
                bt.innerText = "尝试突破 (" + (realm.breakChance * 100).toFixed(0) + "%" + (isZhuji ? "，需筑基丹" : "") + ")";
                bt.disabled = lock || p.currentExp < realm.needExp;
            }
            this.$("btn-catalyze-bainian").disabled = lock || p.liquid < 1;
            this.$("btn-catalyze-qiannian").disabled = lock || p.liquid < 5;
            var bw = this.$("btn-catalyze-wood");
            if (bw) bw.disabled = lock || p.liquid < 1;
            var bxb = this.$("btn-catalyze-xuanbing");
            if (bxb) bxb.disabled = lock || p.liquid < 5;
            var bll = this.$("btn-catalyze-longlin");
            if (bll) bll.disabled = lock || p.liquid < 10;

            // —— 异常警示行：有异常才亮（煞气/阴毒/觊觎度/药香泄露） ——
            var aw = function (id, on) { var el = this.$(id); if (el) el.style.display = on ? "" : "none"; }.bind(this);
            aw("alert-wrap-煞气", (p.shaQi || 0) > 0);
            aw("alert-wrap-阴毒", !!p.yindu);
            var riskV = p.marketRiskValue || 0;
            aw("alert-wrap-risk", riskV > 0);
            if (riskV > 0) this.$("risk-text").innerText = riskV;
            var gsAlert = (GAME.Garden && GAME.Garden.status) ? GAME.Garden.status() : null;
            var leakV = gsAlert ? (gsAlert.leak || 0) : 0;
            aw("alert-wrap-leak", leakV > 0);
            if (leakV > 0) this.$("leak-text").innerText = leakV;
            var ddl = this.$("dd-liquid-text");
            if (ddl) ddl.innerText = p.liquid;

            // —— 当前目标横幅（随进度自动切换；紧急项红色高亮） ——
            this.renderGoal();

            // —— 页签角标：储物袋（傀儡材料齐）/ 副本（可进试炼）/ 灵宠（有虫卵待孵） ——
            var badge = function (id, on, num) {
                var el = this.$(id); if (!el) return;
                el.style.display = on ? "" : "none";
                el.innerText = num > 1 ? num : "";
            }.bind(this);
            var buildable = 0;
            if (GAME.DATA.PUPPETS) {
                Object.keys(GAME.DATA.PUPPETS).forEach(function (k) {
                    var d = GAME.DATA.PUPPETS[k];
                    var okP = true;
                    (d.materials || [{ id: d.material, qty: d.matQty || 1 }, { id: d.wood, qty: 1 }]).forEach(function (m) {
                        if (GAME.State.countItem(m.id) < (m.qty || 1)) okP = false;
                    });
                    if (okP) buildable += 1;
                });
            }
            badge("badge-bag", buildable > 0, buildable);
            badge("badge-fzone", !!(GAME.FZone && GAME.FZone.canEnter && GAME.FZone.canEnter()), 0);
            badge("badge-companion", GAME.State.countItem("chong_egg") > 0, 0);
            this.$("btn-market").innerText = p.atMarket ? "坊市中" : "前往坊市 (耗时1月)";
            this.$("btn-save").disabled = dead;

            // 进出坊市时自动切到对应页签（仅在状态跃迁那一次触发，不强行夺走玩家选择）
            if (p.atMarket !== this._lastAtMarket) {
                this._lastAtMarket = p.atMarket;
                this.tab = p.atMarket ? "market" : "map";
            }
            // 踏上新地点时自动落到地图页（苍南小会内容已并入地图面板）
            if (p.location !== this._lastLocation) {
                var first = this._lastLocation === undefined;
                this._lastLocation = p.location;
                if (!first) this.tab = "map";
            }

            this.renderBag();
            this.renderAlchemy();
            this.renderMarket();
            this.renderHome();
            this.renderCodex();
            this.renderSect();
            this.renderBlack();
            this.renderMap();
            this.renderDungeon();
            this.renderJiayuan();
            this.renderMansion();
            this.renderTainan();
            this.renderSkill();
            this.renderEvent();
            this.renderMercy();
            this.renderCombat();
            this.renderTrial();
            this.renderFzone();
            this.renderQixuan();
            this.renderTrack();
            this.renderMo();
            this.renderCompanion();
            this.renderCave2();
            this.renderPuppet();
            this.renderAchievements();
            this.applyPanels();
        } catch (e) {
            console.error("渲染异常", e);
            try { this.log("界面渲染出现异常：" + e.message + "（游戏仍在运行，可重入轮回）", "danger"); } catch (e2) {}
        }
        this.applyDeathLock();   // 死亡锁置于 try 之外：即便渲染中途异常被吞，终局安全锁也必须执行
    },

    // ---------- 开局：出身选择 ----------
    // ---------- 开局：封面出身选择（卡片式） ----------
    ORIGIN_META: {
        erlezi: { icon: "🧑", tag: "农家出身 · 天命主线", svg:
            '<svg viewBox="0 0 12 14" width="52" height="60" shape-rendering="crispEdges" aria-label="二愣子像素小人">' +
            '<rect x="3" y="0" width="6" height="2" fill="#3a2c1e"/><rect x="4" y="2" width="4" height="3" fill="#e8b98a"/>' +
            '<rect x="4" y="3" width="1" height="1" fill="#26201a"/><rect x="7" y="3" width="1" height="1" fill="#26201a"/>' +
            '<rect x="3" y="5" width="6" height="5" fill="#8a6d4b"/><rect x="3" y="8" width="6" height="1" fill="#5f4a33"/>' +
            '<rect x="2" y="5" width="1" height="3" fill="#8a6d4b"/><rect x="9" y="5" width="1" height="3" fill="#8a6d4b"/>' +
            '<rect x="2" y="8" width="1" height="1" fill="#e8b98a"/><rect x="9" y="8" width="1" height="1" fill="#e8b98a"/>' +
            '<rect x="4" y="10" width="1" height="2" fill="#6b5a44"/><rect x="7" y="10" width="1" height="2" fill="#6b5a44"/>' +
            '<rect x="4" y="12" width="1" height="1" fill="#e8b98a"/><rect x="7" y="12" width="1" height="1" fill="#e8b98a"/>' +
            '<rect x="10" y="2" width="1" height="7" fill="#7a5a34"/><rect x="9" y="1" width="3" height="1" fill="#9aa0a6"/>' +
            '</svg>' },
        hunter: { icon: "🏹", tag: "体魄强横 · 气血雄厚", svg:
            '<svg viewBox="0 0 12 14" width="52" height="60" shape-rendering="crispEdges" aria-label="猎户之子像素小人">' +
            '<rect x="3" y="0" width="6" height="1" fill="#2b2b2b"/><rect x="3" y="1" width="6" height="1" fill="#a03a2e"/>' +
            '<rect x="4" y="2" width="4" height="3" fill="#d9a06f"/><rect x="4" y="3" width="1" height="1" fill="#26201a"/><rect x="7" y="3" width="1" height="1" fill="#26201a"/>' +
            '<rect x="3" y="5" width="6" height="5" fill="#6e5233"/><rect x="3" y="5" width="1" height="1" fill="#8a6a42"/><rect x="5" y="5" width="1" height="1" fill="#8a6a42"/><rect x="7" y="5" width="1" height="1" fill="#8a6a42"/>' +
            '<rect x="3" y="7" width="1" height="1" fill="#8a6a42"/><rect x="5" y="7" width="1" height="1" fill="#8a6a42"/><rect x="7" y="7" width="1" height="1" fill="#8a6a42"/>' +
            '<rect x="2" y="5" width="1" height="3" fill="#6e5233"/><rect x="9" y="5" width="1" height="3" fill="#6e5233"/>' +
            '<rect x="2" y="8" width="1" height="1" fill="#d9a06f"/><rect x="9" y="8" width="1" height="1" fill="#d9a06f"/>' +
            '<rect x="4" y="10" width="1" height="2" fill="#4a3a28"/><rect x="7" y="10" width="1" height="2" fill="#4a3a28"/>' +
            '<rect x="4" y="12" width="1" height="1" fill="#33281c"/><rect x="7" y="12" width="1" height="1" fill="#33281c"/>' +
            '<rect x="1" y="3" width="1" height="1" fill="#5b4632"/><rect x="0" y="4" width="1" height="4" fill="#5b4632"/><rect x="1" y="8" width="1" height="1" fill="#5b4632"/><rect x="2" y="4" width="1" height="4" fill="#d9c79a"/>' +
            '</svg>' },
        yaopu: { icon: "🌿", tag: "识得百草 · 起步已晚", svg:
            '<svg viewBox="0 0 12 14" width="52" height="60" shape-rendering="crispEdges" aria-label="药铺学徒像素小人">' +
            '<rect x="5" y="0" width="2" height="1" fill="#1f1f1f"/><rect x="3" y="1" width="6" height="1" fill="#1f1f1f"/>' +
            '<rect x="4" y="2" width="4" height="3" fill="#f0cfa0"/><rect x="4" y="3" width="1" height="1" fill="#26201a"/><rect x="7" y="3" width="1" height="1" fill="#26201a"/>' +
            '<rect x="2" y="5" width="8" height="7" fill="#3f7f74"/><rect x="5" y="5" width="2" height="1" fill="#d8d0b8"/><rect x="2" y="8" width="8" height="1" fill="#2c5a52"/>' +
            '<rect x="1" y="6" width="1" height="3" fill="#3f7f74"/><rect x="10" y="6" width="1" height="3" fill="#3f7f74"/>' +
            '<rect x="1" y="9" width="1" height="1" fill="#f0cfa0"/><rect x="10" y="9" width="1" height="1" fill="#f0cfa0"/>' +
            '<rect x="11" y="7" width="1" height="2" fill="#5fae4f"/><rect x="11" y="6" width="1" height="1" fill="#7fc46a"/>' +
            '<rect x="2" y="12" width="8" height="1" fill="#2c5a52"/>' +
            '</svg>' },
    },
    renderOrigin: function () {
        var self = this;
        var list = this.$("origin-list");
        list.innerHTML = "";
        if (!this.selectedOrigin) this.selectedOrigin = GAME.DATA.ORIGINS[0].id;

        GAME.DATA.ORIGINS.forEach(function (o) {
            var meta = self.ORIGIN_META[o.id] || { icon: "☯", tag: "" };
            var card = document.createElement("div");
            card.className = "origin-card" + (o.id === self.selectedOrigin ? " on" : "");
            card.innerHTML =
                '<div class="oc-icon">' + (meta.svg || meta.icon) + '</div>' +
                '<div class="oc-name">' + o.name + '</div>' +
                '<div class="oc-tag">' + meta.tag + '</div>';
            card.onclick = function () { self.selectedOrigin = o.id; self.renderOrigin(); };
            list.appendChild(card);
        });

        var cur = null;
        GAME.DATA.ORIGINS.forEach(function (o) { if (o.id === self.selectedOrigin) cur = o; });
        var st = cur.start || {};
        var inv = cur.inventory || {};
        var invText = Object.keys(inv).map(function (k) {
            return GAME.DATA.ITEMS[k].name + "×" + inv[k];
        }).join("、") || "无";
        this.$("origin-desc").innerHTML =
            '<div class="od-line">' + cur.desc + '</div>' +
            '<div class="od-line">起始 — 灵石 <span class="gold">' + st.spiritStones + '</span> ｜ 年龄 ' + st.ageYears +
            ' 岁 ｜ 气血上限 ' + st.maxHp + ' ｜ 绿液 <span class="highlight">' + st.liquid + '</span> 滴</div>' +
            '<div class="od-line">随身 — ' + invText + '</div>';

        // 开局时隐藏主界面：工作区整体收起，出身面板独占一屏
        this.setPlayMode(false);
    },

    startGame: function (originId) {
        GAME.State.createNewPlayer(originId);
        this.started = true;
        this.tab = "map";
        this._lastAtMarket = undefined;
        this._lastLocation = undefined;   // 首次 updateUI 不触发"跃迁"提示
        this.setPlayMode(true);                 // 含 workspace 还原为 grid，否则两栏塌陷
        this.initLogs();
        if (GAME.Qixuan) GAME.Qixuan.start();   // 苍梧门六幕开局：炼骨崖考核
        this.updateUI();
    },

    // ---------- 背包 ----------
    renderBag: function () {
        var self = this;
        var p = GAME.State.p();
        var box = this.$("bag-list");
        box.innerHTML = "";
        var ids = Object.keys(p.inventory);
        if (!ids.length) { box.innerHTML = '<div class="empty-tip">储物袋空空如也。</div>'; return; }

        ids.forEach(function (id) {
            var item = GAME.DATA.ITEMS[id];
            if (!item) return;
            var qty = p.inventory[id];
            var row = document.createElement("div");
            row.className = "item-row";

            var left = document.createElement("div");
            left.innerHTML = '<span class="q-' + item.quality + '">' + item.name + '</span> ×' + qty +
                ' <span class="item-desc">[' + item.quality + ']</span>' +
                '<div class="item-desc">' + item.desc + '</div>';

            var right = document.createElement("div");
            right.className = "item-right";
            var self = this;
            if (item.type === "herb") {
                // 灵药：可生服草木清气小幅增修为（效率远低于丹药，连服渐抗）
                if (item.use && item.use.eatExp) {
                    var bh = document.createElement("button");
                    bh.className = "small-btn btn-gold";
                    bh.innerText = "生服";
                    bh.onclick = function () { GAME.Core.eatHerb(id); };
                    right.appendChild(bh);
                } else {
                    var htip = document.createElement("span");
                    htip.className = "item-desc";
                    htip.innerText = "炼丹主药";
                    right.appendChild(htip);
                }
            } else if (item.use) {
                // 丹药 / 功法 / 宝玉等：凡有"服用效果"者皆可服（takePill 内含逐类处理）
                var b = document.createElement("button");
                b.className = "small-btn btn-gold";
                b.innerText = "服用";
                b.onclick = function () { GAME.Core.takePill(id); };
                right.appendChild(b);
            } else if (item.type === "artifact") {
                var b2 = document.createElement("button");
                b2.className = "small-btn";
                b2.innerText = "装备";
                b2.onclick = function () { GAME.Core.equipArtifact(id); };
                right.appendChild(b2);
            } else if (item.type === "dark_weapon") {
                var bd = document.createElement("button");
                bd.className = "small-btn" + (p.darkWeapon === id ? " btn-gold" : "");
                bd.innerText = p.darkWeapon === id ? "已暗藏" : "暗藏装备";
                bd.disabled = p.darkWeapon === id;
                bd.onclick = function () { GAME.Core.equipDarkWeapon(id); };
                right.appendChild(bd);
            } else if (item.type === "armor") {
                var ba = document.createElement("button");
                ba.className = "small-btn" + (p.armor === id ? " btn-gold" : "");
                ba.innerText = p.armor === id ? "已戴上" : "戴上";
                ba.disabled = p.armor === id;
                ba.onclick = function () { GAME.Core.equipArmor(id); };
                right.appendChild(ba);
            } else if (id === "yinhun_zhong") {
                var bz = document.createElement("button");
                bz.className = "small-btn btn-gold";
                bz.innerText = "催动激活玄傀";
                bz.onclick = function () { GAME.Core.activateCompanion(); };
                right.appendChild(bz);
            } else {
                var tip = document.createElement("span");
                tip.className = "item-desc";
                tip.innerText = item.type === "talisman" ? "战斗中使用"
                    : (item.type === "dark_weapon" ? "战斗首回合触发" : "炼丹原料 / 战斗暗器");
                right.appendChild(tip);
            }
            row.appendChild(left);
            row.appendChild(right);
            box.appendChild(row);
        });
    },

    // ---------- 炼丹：列出全部配方，可炼/缺什么一目了然 ----------
    renderAlchemy: function () {
        var p = GAME.State.p();
        if (this.tab !== "alchemy" || p.isDead || p.combat) return;  // 可见性由 applyPanels 统一控制
        var box = this.$("recipe-list");
        box.innerHTML = "";
        var self = this;
        if (!GAME.Core.canAlchemy()) {
            box.innerHTML = '<div class="empty-tip">丹炉冷清——玄机子的炼丹手艺不外传，待你练气三层再来说不迟。</div>';
            return;
        }

        GAME.DATA.RECIPES.forEach(function (r, idx) {
            var pill = GAME.DATA.ITEMS[r.pill];
            var missing = GAME.Core.craftCheck(r);
            var row = document.createElement("div");
            row.className = "item-row";
            var herbs = Object.keys(r.herbs).map(function (h) {
                return GAME.DATA.ITEMS[h].name + "×" + r.herbs[h];
            }).join(" + ");
            var left = document.createElement("div");
            left.innerHTML = '<span class="q-' + pill.quality + '">' + pill.name + '</span>' +
                '<div class="item-desc">' + herbs + '，炉火灵石 ' + r.stones + '</div>' +
                (missing ? '<div class="item-desc warning">无法开炉：' + missing + '</div>' : '');
            var right = document.createElement("div");
            right.className = "item-right";
            var b = document.createElement("button");
            b.className = "small-btn btn-gold";
            b.innerText = "开炉";
            b.disabled = !!missing;
            b.onclick = function () { GAME.Core.alchemy(idx); };
            right.appendChild(b);
            row.appendChild(left);
            row.appendChild(right);
            box.appendChild(row);
        });
    },

    toggleAlchemy: function () {
        // 开炉炼丹 = 切到丹炉页签；已在该页则收炉回储物袋
        this.switchTab(this.tab === "alchemy" ? "home" : "alchemy");
    },

    // ---------- 坊市 ----------
    renderMarket: function () {
        var p = GAME.State.p();
        if (!p.atMarket || p.isDead || p.combat) return;   // 可见性由 applyPanels 统一控制
        var self = this;
        var locNames = { shenshou_gu: "山间小集", qingniu_zhen: "青牛镇集", jiayuan_cheng: "岚州大城 · 坊市", tainan_gu: "苍南谷坊市" };
        this.$("market-tip").innerText = "【" + (locNames[p.location] || "坊市") + "】 每逢 " + GAME.DATA.MARKET.refreshMonths +
            " 个月换货；" + (p.karma < -20 ? "你恶名在外，商贾坐地起价" : p.karma > 20 ? "你乐善好施，商贾愿予折扣" : "童叟无欺");

        // 在售
        var box = this.$("market-goods");
        box.innerHTML = "";
        if (!p.marketGoods.length) box.innerHTML = '<div class="empty-tip">货架已被买空。</div>';
        p.marketGoods.forEach(function (g, i) {
            var item = GAME.DATA.ITEMS[g.id];
            var price = GAME.Market.buyPrice(g.price);
            var locked = g.req && p.realmIndex < g.req;
            var row = document.createElement("div");
            row.className = "item-row";
            var left = document.createElement("div");
            left.innerHTML = '<span class="q-' + item.quality + '">' + item.name + '</span> ×' + g.qty +
                '<div class="item-desc">' + item.desc +
                (locked ? ' <span class="danger">【修为不足：需练气' + (g.req + 1) + '层】</span>' : '') + '</div>';
            var right = document.createElement("div");
            right.className = "item-right";
            var priceEl = document.createElement("span");
            priceEl.className = "gold";
            priceEl.innerText = price + "灵石";
            var b = document.createElement("button");
            b.className = "small-btn btn-gold";
            b.innerText = "购买";
            b.disabled = p.spiritStones < price || !!locked;
            b.onclick = function () { GAME.Market.buy(i); };
            right.appendChild(priceEl);
            right.appendChild(b);
            row.appendChild(left);
            row.appendChild(right);
            box.appendChild(row);
        });

        // 出售
        var sellBox = this.$("market-sell");
        sellBox.innerHTML = "";
        var sellable = Object.keys(p.inventory).filter(function (id) { return GAME.Market.canSell(id); });
        if (!sellable.length) sellBox.innerHTML = '<div class="empty-tip">没有可出售之物。</div>';
        sellable.forEach(function (id) {
            var item = GAME.DATA.ITEMS[id];
            var gain = GAME.Market.sellPrice(item.price);
            var row = document.createElement("div");
            row.className = "item-row";
            var left = document.createElement("div");
            left.innerHTML = '<span class="q-' + item.quality + '">' + item.name + '</span> ×' + p.inventory[id];
            var right = document.createElement("div");
            right.className = "item-right";
            var g = document.createElement("span");
            g.className = "gold";
            g.innerText = "+" + gain + "灵石";
            var b = document.createElement("button");
            b.className = "small-btn";
            b.innerText = "出售";
            b.onclick = function () { GAME.Market.sell(id); };
            right.appendChild(g);
            right.appendChild(b);
            row.appendChild(left);
            row.appendChild(right);
            sellBox.appendChild(row);
        });
    },

    // ---------- 洞府建设 ----------
    // 首次进入引导：每个 key 只显示一次，点"知道了"后永久隐藏（落盘）
    showGuide: function (bannerId, key, title, body) {
        var el = this.$(bannerId);
        if (!el) return;
        var p = GAME.State.p();
        p.guide = p.guide || {};
        if (p.guide[key]) { el.style.display = "none"; el.innerHTML = ""; return; }
        el.style.display = "";
        el.innerHTML = '<button class="guide-close" id="' + bannerId + '-ok" title="收起指引">✕</button>' +
            '<div class="guide-title">✦ ' + title + '</div>' +
            '<div class="guide-body">' + body + '</div>';
        var btn = this.$(bannerId + "-ok");
        if (btn) btn.onclick = function () {
            p.guide[key] = true;
            el.style.display = "none";
            el.innerHTML = "";
            if (GAME.UI.autoSave) GAME.UI.autoSave();
        };
    },

    renderHome: function () {
        if (!GAME.Home) return;
        var c = GAME.Home.cfg();
        var self = this;
        this.$("home-intro").innerText = c.intro;
        this.showGuide("home-guide", "home", "洞府怎么起手",
            "洞府是你在这乱世安身的根，四样设施逐级而建。建议先点【灵田】和【丹房】：灵田每次打理多收几株灵药，丹房炼丹打折、还有几率一次出两枚。等灵石攒够了，再补【藏经阁】（打坐多给修为）和【护山大阵】（降低黑市失手率）。升级都要灵石＋材料＋耗时数月，慢慢来，别一次性把家底掏空。");
        var html = "";
        c.facilities.forEach(function (f, i) {
            var lv = GAME.Home.level(f.id);
            var max = f.levels.length;
            var n = GAME.Home.next(f.id);
            var why = GAME.Home.canUpgrade(f.id);
            var cur = lv > 0 ? f.levels[lv - 1].effect : "尚未开辟";
            var need = "已至顶阶";
            if (n) {
                need = "灵石 " + n.stones + "　工期 " + n.months + " 月";
                if (n.items) {
                    need += "　材料：" + Object.keys(n.items).map(function (id) {
                        return GAME.DATA.ITEMS[id].name + "×" + n.items[id];
                    }).join("、");
                }
            }
            html += '<div style="padding:8px 0;border-bottom:1px dashed var(--bd);">' +
                '<div><span class="gold">' + f.name + '</span>　<span class="item-desc">第 ' + lv + ' / ' + max + ' 阶</span></div>' +
                '<div class="item-desc">现生效：' + cur + '</div>' +
                '<div class="item-desc">下一阶：' + need + '</div>' +
                '<button id="btn-home-up' + i + '" class="' + (why ? "small-btn" : "btn-gold") + '"' +
                (why ? " disabled" : "") + ' style="margin-top:4px;">' +
                (n ? "营建至第 " + (lv + 1) + " 阶" : "已至顶阶") + '</button>' +
                (why && n ? '<div class="item-desc">' + why + '</div>' : "") +
                '</div>';
        });
        this.$("home-facilities").innerHTML = html;
        c.facilities.forEach(function (f, i) {
            var btn = self.$("btn-home-up" + i);
            if (btn) btn.onclick = function () { GAME.Home.upgrade(f.id); };
        });
    },

    // ---------- 洞府 2.0：灵峰选址 / 护山大阵 / 终局传送阵（筑基篇） ----------
    renderCave2: function () {
        if (!GAME.Cave2) return;
        var self = this, p = GAME.State.p();
        var zhuji = p.realmIndex > GAME.DATA.ZHUJI_GATE_INDEX;
        var html = "";
        if (!zhuji) {
            html += '<div class="item-desc">筑基之前，独辟灵峰与护山大阵皆是奢望。先冲壁障。</div>';
        } else {
            // 内门师叔 + 月俸
            html += '<div style="padding:6px 0;border-bottom:1px dashed var(--bd);">' +
                '<div><span class="gold">内门师叔</span>　<span class="item-desc">' +
                (p.innerSect ? "已拜入主峰，月俸 10 灵石（已领 " + (p.stipendMonths || 0) + " 月）" : "尚未拜入内门") +
                '</span></div>' +
                (p.innerSect ? "" : '<button id="btn-cave2-inner" class="btn-gold" style="margin-top:4px;">拜入内门·获封师叔</button>') +
                '</div>';
            // 灵峰租赁
            html += '<div style="padding:6px 0;border-bottom:1px dashed var(--bd);"><div><span class="gold">灵脉选址</span></div>';
            GAME.DATA.LINGFENG.forEach(function (f, i) {
                var cur = p.peak === f.id;
                html += '<button id="btn-cave2-peak' + i + '" class="' + (cur ? "small-btn" : "btn-gold") + '"' +
                    (cur || p.spiritStones < f.rent ? " disabled" : "") + ' style="margin:3px 4px 0 0;">' +
                    f.name + (f.rent ? "（" + f.rent + " 灵石）" : "") + (cur ? " ✓" : "") + '</button>';
            });
            html += '<div class="item-desc">灵峰提升打坐修为转化与药田产出（中品 ×1.5 / 上品 ×2.0）。</div></div>';
            // 因果·羁绊（师承与红颜，筑基后开启）
            var B = GAME.Bonds;
            if (B) {
                html += '<div style="padding:6px 0;border-top:1px dashed var(--bd);"><div><span class="gold">因果·羁绊</span></div>';
                var bChk = B.canApprentice();
                html += '<button id="btn-bond-shifu" class="btn-gold" style="margin:3px 4px 0 0;"' +
                    (bChk.ok ? "" : " disabled title='" + bChk.msg + "'") + '>拜师李玄尘</button>';
                var nChk = B.canNangongwan();
                html += '<button id="btn-bond-nan-guard" class="small-btn" style="margin:3px 0 0;"' +
                    (nChk.ok ? "" : " disabled") + '>凌清沅·暗中护法</button>' +
                    '<button id="btn-bond-nan-leave" class="small-btn" style="margin:3px 4px 0 0;"' +
                    (nChk.ok ? "" : " disabled") + '>视而不见</button>';
                var dChk = B.canDongxuaner();
                html += '<button id="btn-bond-dong-plot" class="small-btn" style="margin:3px 0 0;"' +
                    (dChk.ok ? "" : " disabled") + '>柳蔓儿·虚与委蛇</button>' +
                    '<button id="btn-bond-dong-refuse" class="small-btn" style="margin:3px 4px 0 0;"' +
                    (dChk.ok ? "" : " disabled") + '>冷淡回绝</button>';
                var cChk = B.canChenqiaoqian();
                html += '<button id="btn-bond-chen" class="small-btn" style="margin:3px 0 0;"' +
                    (cChk.ok ? "" : " disabled") + '>温巧兮·赠丹斩情丝</button>';
                html += '</div>';
            }
            // 护山大阵
            html += '<div style="padding:6px 0;"><div><span class="gold">护山大阵</span></div>';
            GAME.DATA.FORMATIONS.forEach(function (f, i) {
                if (f.id === "none") return;
                var cur = p.formation === f.id;
                html += '<button id="btn-cave2-form' + i + '" class="' + (cur ? "small-btn" : "btn-gold") + '"' +
                    (cur || p.spiritStones < f.cost ? " disabled" : "") + ' style="margin:3px 4px 0 0;">' +
                    f.name + "（" + f.cost + " 灵石）" + (cur ? " ✓" : "") + '</button>';
            });
            html += '<div class="item-desc">阵法被动御敌：魔修潜入自动反制并缴获其储物袋。</div></div>';
        }
        this.$("cave2-block").innerHTML = html;

        // 终局：古传送阵（破空而去阶段显现）
        var eg = "";
        if (GAME.DemonWar && p.warPhase === 4 && !p.ending) {
            eg += '<h3 style="margin-top:14px;">终局 · 大道何方</h3>';
            if (p.teleportRepaired) {
                eg += '<div class="item-desc">古传送阵已修复，光门泛起涟漪。而你的道，未必只在光门之后——此生种种抉择，皆通向不同的结局：</div>';
            } else {
                var missing = GAME.DemonWar.missingItems();
                eg += '<div class="item-desc">荒山枯井深处的古传送阵静候修复。尚缺：' +
                    (missing.length ? missing.join("、") : "无——材料已齐") + '。</div>' +
                    '<button id="btn-cave2-repair" class="btn-gold" style="margin-top:4px;"' +
                    (missing.length ? " disabled" : "") + '>修复古传送阵</button>' +
                    '<div class="item-desc" style="margin-top:6px;">纵然阵未成，此生所行之路，亦另有归处：</div>';
            }
            // 多结局列表（此前选择已定解锁与否）
            GAME.Endings.list().forEach(function (ed, i) {
                var chk = GAME.Endings.canChoose(ed.id);
                eg += '<div style="padding:4px 0;"><span class="' + (chk.ok ? "gold" : "item-desc") + '">' + ed.name + '</span>' +
                    '<div class="item-desc">' + (chk.ok ? ed.cond : "🔒 " + ed.cond + (ed.msg ? "（" + ed.msg + "）" : "")) + '</div>' +
                    '<button id="btn-ending-' + i + '" class="' + (chk.ok ? "btn-gold" : "small-btn") + '" style="margin:2px 0;"' +
                    (chk.ok ? "" : " disabled") + '>择此结局</button></div>';
            });
        } else if (p.ending) {
            var edDone = GAME.Endings.byId(p.ending);
            if (edDone) {
                eg += '<h3 style="margin-top:14px;">周目终了 · ' + edDone.name + '</h3>' +
                    '<div class="item-desc">' + edDone.text + '</div>' +
                    '<div class="item-desc">天道点数 ' + (p.tiandao || 0) +
                    ' 点已录入道碑——二周目轮回转世，先天气运静候继承。</div>';
            } else {
                eg += '<h3 style="margin-top:14px;">一周目 · 已通关</h3><div class="item-desc">天道点数 ' + (p.tiandao || 0) +
                    ' 点已录入道碑——二周目轮回转世，先天气运静候继承。</div>';
            }
        }
        this.$("endgame-block").innerHTML = eg;

        // 绑定
        var bInner = self.$("btn-cave2-inner");
        if (bInner) bInner.onclick = function () { GAME.Cave2.joinInnerSect(); };
        GAME.DATA.LINGFENG.forEach(function (f, i) {
            var b = self.$("btn-cave2-peak" + i);
            if (b) b.onclick = function () { GAME.Cave2.rentPeak(f.id); };
        });
        GAME.DATA.FORMATIONS.forEach(function (f, i) {
            var b = self.$("btn-cave2-form" + i);
            if (b) b.onclick = function () { GAME.Cave2.setFormation(f.id); };
        });
        var bRepair = self.$("btn-cave2-repair");
        if (bRepair) bRepair.onclick = function () { GAME.DemonWar.repairTeleport(); };
        var bEscape = self.$("btn-cave2-escape");
        if (bEscape) bEscape.onclick = function () { GAME.DemonWar.escape(); };
        GAME.Endings.list().forEach(function (ed, i) {
            var bEnd = self.$("btn-ending-" + i);
            if (bEnd) bEnd.onclick = function () { GAME.Endings.choose(ed.id); self.renderCave2(); };
        });
        var B = GAME.Bonds;
        if (B) {
            var q = function (id) { return self.$(id); };
            var bs = q("btn-bond-shifu");
            if (bs) bs.onclick = function () { B.apprentice(); self.renderCave2(); };
            var ng = q("btn-bond-nan-guard"), nl = q("btn-bond-nan-leave");
            if (ng) ng.onclick = function () { B.nangongwan("guard"); self.renderCave2(); };
            if (nl) nl.onclick = function () { B.nangongwan("leave"); self.renderCave2(); };
            var dp = q("btn-bond-dong-plot"), dr = q("btn-bond-dong-refuse");
            if (dp) dp.onclick = function () { B.dongxuaner("plot"); self.renderCave2(); };
            if (dr) dr.onclick = function () { B.dongxuaner("refuse"); self.renderCave2(); };
            var bc = q("btn-bond-chen");
            if (bc) bc.onclick = function () { B.chenqiaoqian(); self.renderCave2(); };
        }
    },

    // ---------- 灵宠/傀儡：机关傀儡工坊 + 噬金虫进化树 ----------
    renderPuppet: function () {
        if (!GAME.Puppet) return;
        var self = this, p = GAME.State.p();
        var cnt = function (id) { return GAME.State.countItem(id); };
        var hasDayan = !!(p.spells && p.spells.dayan_jue);
        var html = '<div style="padding:6px 0;border-bottom:1px dashed var(--bd);">' +
            '<div><span class="gold">《大衍决》（前两层）</span>　<span class="item-desc">' +
            (hasDayan ? "已习——神识暴涨，可一心驭傀" : "上古秘术，筑基后方可修习") + '</span></div>' +
            '<button id="btn-puppet-dayan" class="' + (hasDayan ? "small-btn" : "btn-gold") + '" style="margin-top:4px;"' +
            (hasDayan ? " disabled" : "") + '>' + (hasDayan ? "已习得" : "修习大衍决") + '</button></div>';
        // 傀儡工坊
        html += '<div style="padding:6px 0;border-bottom:1px dashed var(--bd);"><div><span class="gold">机关傀儡工坊</span></div>';
        Object.keys(GAME.DATA.PUPPETS).forEach(function (key, i) {
            var def = GAME.DATA.PUPPETS[key];
            var can = GAME.Puppet.canBuild(def);
            html += '<button id="btn-puppet-build' + i + '" class="' + (can ? "btn-gold" : "small-btn") + '" style="margin:3px 4px 0 0;"' +
                (can ? "" : " disabled") + '>炼制' + def.name + '</button>' +
                '<span class="item-desc">　需 ' + GAME.Puppet.costText(def) +
                '｜库存 ' + GAME.Puppet.stockText(def) + '（现有 ' + cnt(def.id) + ' 具）</span><br>';
            if (!can) {
                // 材料不足：逐项列出缺口与获取渠道，避免"有图纸无处取料"
                (def.materials || []).forEach(function (m) {
                    var have = cnt(m.id);
                    if (have < m.qty) {
                        html += '<div class="item-desc" style="margin-left:12px;color:var(--warn,#c98);">· ' +
                            GAME.DATA.ITEMS[m.id].name + ' 缺 ' + (m.qty - have) + ' → ' + m.from + '</div>';
                    }
                });
            }
        });
        var owned = cnt("puppet_gongjian") + cnt("puppet_julang");
        html += '<button id="btn-puppet-activate" class="small-btn btn-gold" style="margin-top:4px;"' +
            (owned < 1 ? " disabled" : "") + '>神识驭傀·列阵参战</button>' +
            '<span class="item-desc">　现有 ' + owned + ' 具，斗法时齐射（每具 +' + GAME.Puppet.PUPPET_VOLLEY_PER + '）</span></div>';
        // 噬金虫进化树
        html += '<div style="padding:6px 0;"><div><span class="gold">噬金虫群</span></div>' +
            '<button id="btn-shichong-hatch" class="small-btn btn-gold" style="margin:3px 4px 0 0;">绿液浸卵孵化</button>' +
            '<span class="item-desc">奇虫卵×1＋绿液2滴（卵 ' + cnt("chong_egg") + '｜幼虫 ' + cnt("shijin_larva") + '）</span><br>' +
            '<button id="btn-shichong-evolve" class="small-btn btn-gold" style="margin:3px 4px 0 0;">吞金石·进阶成虫</button>' +
            '<span class="item-desc">金石矿料×3（矿料 ' + cnt("jinshi") + '｜成虫 ' + cnt("shijin_adult") + '）</span>' +
            '<div class="item-desc">成虫斗法时化作虫云，持续腐蚀敌方法宝与护罩。</div></div>';
        this.$("puppet-block").innerHTML = html;

        var bDayan = self.$("btn-puppet-dayan");
        if (bDayan) bDayan.onclick = function () { GAME.Puppet.learnDayan(); };
        Object.keys(GAME.DATA.PUPPETS).forEach(function (key, i) {
            var b = self.$("btn-puppet-build" + i);
            if (b) b.onclick = function () { GAME.Puppet.build(key); };
        });
        var bAct = self.$("btn-puppet-activate");
        if (bAct) bAct.onclick = function () { GAME.Puppet.activate(GAME.Puppet.MAX_CONTROL); };
        var bHat = self.$("btn-shichong-hatch");
        if (bHat) bHat.onclick = function () { GAME.Puppet.hatch(); };
        var bEvo = self.$("btn-shichong-evolve");
        if (bEvo) bEvo.onclick = function () { GAME.Puppet.evolve(); };
    },

    // ---------- 图鉴·见闻录 ----------
    codexKind: "items",
    renderCodex: function () {
        if (!GAME.Codex) return;
        var self = this;
        this.showGuide("codex-guide", "codex", "图鉴怎么看",
            "图鉴会自动记你遇过的器物、妖兽、功法；剧情里触发的「秘闻」首次解锁还 +30 灵石。进来翻翻四个分类就行，不用特意刷——该遇的迟早会遇到，没录的会显示「？」。");
        var kind = this.codexKind || "items";
        var got = GAME.Codex.got(kind), total = GAME.Codex.total(kind);
        this.$("codex-summary").innerText =
            "已录 " + got + " / " + total + "　｜　器物入袋即录、妖兽遭遇即录、术法研习即录、秘闻随剧情解锁。";
        GAME.Codex.KINDS.forEach(function (k) {
            var b = self.$("btn-codex-" + k.id);
            if (b) b.className = (k.id === kind) ? "btn-gold" : "small-btn";
        });
        var list = GAME.Codex.list(kind);
        var html = "";
        list.forEach(function (e) {
            if (e.unknown) {
                html += '<div class="item-desc" style="padding:4px 0;">？ ？ ？</div>';
            } else {
                html += '<div style="padding:6px 0;border-bottom:1px dashed var(--bd);">' +
                    '<div><span class="gold">' + e.name + '</span>　<span class="item-desc">' + (e.tag || "") + '</span></div>' +
                    '<div class="item-desc">' + (e.desc || "") + '</div></div>';
            }
        });
        this.$("codex-list").innerHTML = html || '<div class="empty-tip">尚无录入。</div>';
    },

    // ---------- 宗门杂役堂 ----------
    renderSect: function () {
        var p = GAME.State.p();
        if (this.tab !== "sect" || p.isDead || p.combat) return;  // 可见性由 applyPanels 统一控制
        var self = this;
        var box = this.$("sect-missions");
        box.innerHTML = "";
        GAME.DATA.CONTENT.MISSIONS.forEach(function (m) {
            var row = document.createElement("div");
            row.className = "item-row";
            var left = document.createElement("div");
            left.innerHTML = '<span class="q-灵品">' + m.name + '</span><div class="item-desc">' + m.text + '（耗时 ' + m.months + ' 月，贡献 +' + m.contrib + '）</div>';
            var right = document.createElement("div");
            right.className = "item-right";
            var b = document.createElement("button");
            b.className = "small-btn btn-gold";
            b.innerText = "承接";
            b.onclick = function () { GAME.Sect.doMission(m.id); };
            right.appendChild(b);
            // 监守自盗（仅百草园）
            if (m.steal) {
                var bs = document.createElement("button");
                bs.className = "small-btn";
                bs.innerText = "监守自盗(绿液" + m.steal.liquid + ")";
                bs.onclick = function () { GAME.Sect.steal(m.id); };
                right.appendChild(bs);
            }
            row.appendChild(left); row.appendChild(right);
            box.appendChild(row);
        });

        var exBox = this.$("sect-exchange");
        exBox.innerHTML = "";
        GAME.DATA.CONTENT.SECT_EXCHANGE.forEach(function (e) {
            var row = document.createElement("div");
            row.className = "item-row";
            var left = document.createElement("div");
            left.innerHTML = '<span class="q-上品">' + e.name + '</span><div class="item-desc">' + e.desc + '</div>';
            var right = document.createElement("div");
            right.className = "item-right";
            var b = document.createElement("button");
            b.className = "small-btn";
            b.innerText = "兑换(贡献" + e.cost + ")";
            b.disabled = p.sectContrib < e.cost;
            b.onclick = function () { GAME.Sect.exchange(e.id); };
            right.appendChild(b);
            row.appendChild(left); row.appendChild(right);
            exBox.appendChild(row);
        });

        // —— 青梧谷弟子区：杂役分流 + 百草园管事（借鸡生蛋） ——
        var s2 = this.$("sect2-box");
        s2.innerHTML = "";
        if (!p.sectId) { s2.innerHTML = '<div class="empty-tip">（拜入宗门后开放弟子杂役与百草园。）</div>'; return; }
        var s2g = GAME.DATA.CONTENT.SECT2;

        var h2 = document.createElement("h3");
        h2.style.marginTop = "10px";
        h2.innerText = "弟子杂役";
        s2.appendChild(h2);
        [s2g.mine, s2g.copy].forEach(function (job) {
            var row = document.createElement("div");
            row.className = "item-row";
            var left = document.createElement("div");
            left.innerHTML = '<span class="q-灵品">' + job.text.split("：")[0] + '</span><div class="item-desc">' + job.text + '</div>';
            var right = document.createElement("div");
            right.className = "item-right";
            var b = document.createElement("button");
            b.className = "small-btn";
            b.innerText = "应差";
            b.onclick = function () { (job === s2g.mine ? GAME.Sect.sectMine : GAME.Sect.sectCopy)(); };
            right.appendChild(b);
            row.appendChild(left); row.appendChild(right);
            s2.appendChild(row);
        });

        var h3 = document.createElement("h3");
        h3.style.marginTop = "10px";
        h3.innerText = "百草园";
        s2.appendChild(h3);
        var gs = GAME.Garden.status();
        var headRow = document.createElement("div");
        headRow.className = "item-row";
        var gLeft = document.createElement("div");
        if (gs.manager) {
            var leakCls = gs.leak >= gs.leakWarn ? "danger" : "info";
            gLeft.innerHTML = '<span class="q-上品">百草园管事（灵眼之泉）</span>' +
                '<div class="item-desc">明田年例：上交 ' + GAME.DATA.ITEMS[gs.quotaHerb].name + '×' + gs.quota + '，剩 ' + gs.due + ' 个月。' +
                '暗田催熟 0% 泄露，两成概率灵泉双收。</div>';
        } else {
            gLeft.innerHTML = '<span class="q-灵品">谋百草园管事之职</span>' +
                '<div class="item-desc">行贿执事长老（贡献 ' + s2g.garden.bribeContrib + ' 或 灵石 ' + s2g.garden.bribeStones + '）。' +
                '得【灵眼之泉】：暗田催熟 0% 泄露；无职者暗田催熟每次泄露 +' + s2g.garden.leakPerCatalyze + '，泄露值 ' + gs.leak + '/' + gs.leakCaught + '，≥' + gs.leakWarn + ' 预警、满则查获。</div>';
        }
        headRow.appendChild(gLeft);
        var gRight = document.createElement("div");
        gRight.className = "item-right";
        if (!gs.manager) {
            var bb = document.createElement("button");
            bb.className = "small-btn btn-gold";
            bb.innerText = "行贿谋职";
            bb.disabled = p.sectContrib < s2g.garden.bribeContrib && p.spiritStones < s2g.garden.bribeStones;
            bb.onclick = function () { GAME.Sect.takeGarden(p.sectContrib >= s2g.garden.bribeContrib ? "contrib" : "stones"); };
            gRight.appendChild(bb);
        } else {
            var sb = document.createElement("button");
            sb.className = "small-btn";
            sb.innerText = "明田上缴(提前)";
            sb.disabled = GAME.State.countItem(gs.quotaHerb) < gs.quota;
            sb.onclick = function () { GAME.Garden.submit(); };
            gRight.appendChild(sb);
        }
        headRow.appendChild(gRight);
        s2.appendChild(headRow);

        // 暗田催熟：绿液 1 滴（可选恶臭草掩盖）
        ["herb_bainian", "herb_qiannian"].forEach(function (hid) {
            var row = document.createElement("div");
            row.className = "item-row";
            var left = document.createElement("div");
            left.innerHTML = '<span class="q-' + GAME.DATA.ITEMS[hid].quality + '">' + GAME.DATA.ITEMS[hid].name + '</span>' +
                '<div class="item-desc">绿液 1 滴暗田催熟' + (gs.manager ? "（灵眼之泉掩蔽，泄露 0%）" : "；每株可耗恶臭草掩盖波动") + '</div>';
            var right = document.createElement("div");
            right.className = "item-right";
            var b1 = document.createElement("button");
            b1.className = "small-btn btn-gold";
            b1.innerText = "催熟";
            b1.disabled = p.liquid < 1;
            b1.onclick = function () { GAME.Garden.catalyze(hid, false); };
            right.appendChild(b1);
            if (!gs.manager) {
                var b2 = document.createElement("button");
                b2.className = "small-btn";
                b2.innerText = "催熟+恶臭草";
                b2.disabled = p.liquid < 1 || GAME.State.countItem("herb_ecao") < 1;
                b2.onclick = function () { GAME.Garden.catalyze(hid, true); };
                right.appendChild(b2);
            }
            row.appendChild(left); row.appendChild(right);
            s2.appendChild(row);
        });

        // 百草园工具：种植恶臭草 / 玄傀暂存与取回——神识掠过时的两张免死牌
        var tool = document.createElement("div");
        tool.className = "item-row";
        var tl = document.createElement("div");
        tl.innerHTML = '<span class="q-凡品">园中杂务</span><div class="item-desc">种恶臭草备掩味（1 月收 2 株）；私药暂存玄傀体内，神识搜查不可及。当前暂存 ' + gs.stash + ' 株' +
            (gs.sweep ? '；<span class="danger">⚠ 红灯：神识下月掠过药园！</span>' : '') + '</div>';
        var tr = document.createElement("div");
        tr.className = "item-right";
        var pe = document.createElement("button");
        pe.className = "small-btn";
        pe.innerText = "种植恶臭草(1月)";
        pe.onclick = function () { GAME.Garden.plantEcao(); };
        tr.appendChild(pe);
        if (p.companion && p.companion.hp > 0) {
            var stb = document.createElement("button");
            stb.className = "small-btn btn-gold";
            stb.innerText = gs.stash > 0 ? "取回私药(" + gs.stash + ")" : "暂存私药入玄傀";
            stb.onclick = function () { (gs.stash > 0 ? GAME.Garden.unstash : GAME.Garden.stash)(); };
            tr.appendChild(stb);
        }
        tool.appendChild(tl); tool.appendChild(tr);
        s2.appendChild(tool);
    },

    // ---------- 坊市旧货摊 + 地下黑市 ----------
    renderBlack: function () {
        var p = GAME.State.p();
        if (this.tab !== "black" || p.isDead || p.combat) return;  // 可见性由 applyPanels 统一控制
        if (!p.junkGoods) GAME.BlackMarket.ensureJunk();
        var self = this;
        // 换货提示（镜像坊市 market-tip）
        var jtip = this.$("junk-tip");
        if (jtip) {
            var leftM = Math.max(0, (p.junkNextRefresh || 12) - p.totalMonths);
            jtip.innerText = "旧货摊每逢 " + GAME.DATA.MARKET.refreshMonths + " 个月换货；" +
                (p.junkGoods && p.junkGoods.length ? ("距下次换货约 " + leftM + " 个月。")
                    : ("当前已空，约 " + leftM + " 个月后上新。"));
        }
        var box = this.$("junk-goods");
        box.innerHTML = "";
        if (!p.junkGoods.length) { box.innerHTML = '<div class="empty-tip">货摊已空，须等下个换货期（约 ' + Math.max(0, (p.junkNextRefresh || 12) - p.totalMonths) + ' 个月）方上新。</div>'; }
        p.junkGoods.forEach(function (g, i) {
            var item = GAME.DATA.ITEMS[g.id];
            var row = document.createElement("div");
            row.className = "item-row";
            var left = document.createElement("div");
            var revealed = g.appraised ? ('→ 实为【' + GAME.DATA.ITEMS[g.realId].name + '】' + (g.treasure ? '（宝贝）' : '（废铁）')) : '（未鉴定，需神识 ' + g.needSpirit + '）';
            left.innerHTML = '<span class="q-' + item.quality + '">' + item.name + '</span> <span class="gold">' + g.price + '灵石</span><div class="item-desc">' + revealed + '</div>';
            var right = document.createElement("div");
            right.className = "item-right";
            var ba = document.createElement("button");
            ba.className = "small-btn";
            ba.innerText = "鉴定";
            ba.disabled = g.appraised || p.spiritStones < 0;
            ba.onclick = function () { GAME.BlackMarket.appraise(i); };
            var bb = document.createElement("button");
            bb.className = "small-btn btn-gold";
            bb.innerText = "购买";
            bb.disabled = p.spiritStones < g.price;
            bb.onclick = function () { GAME.BlackMarket.buyJunk(i); };
            right.appendChild(ba); right.appendChild(bb);
            row.appendChild(left); row.appendChild(right);
            box.appendChild(row);
        });

        // 黑市材料门路：每 3 月轮换的筑基材料（限量）
        var rotBox = this.$("black-rotation");
        if (rotBox) {
            GAME.BlackMarket.ensureRotation();
            rotBox.innerHTML = "";
            var rot = p.blackGoods || [];
            if (!rot.length) {
                rotBox.innerHTML = '<div class="empty-tip">这一期门路已断，约 ' +
                    Math.max(0, (p.blackNextRefresh || 0) - p.totalMonths) + ' 个月后另有货源。</div>';
            }
            rot.forEach(function (g, i) {
                var it = GAME.DATA.ITEMS[g.id];
                var row = document.createElement("div");
                row.className = "item-row";
                var l = document.createElement("div");
                l.innerHTML = '<span class="q-' + it.quality + '">' + it.name + '</span> <span class="gold">' +
                    g.price + '灵石</span><div class="item-desc">余 ' + g.qty + ' 份｜' + it.desc + '</div>';
                var r = document.createElement("div");
                r.className = "item-right";
                var b = document.createElement("button");
                b.className = "small-btn btn-gold";
                b.innerText = "购买";
                b.disabled = p.spiritStones < g.price;
                b.onclick = function () { GAME.BlackMarket.buyRotation(i); };
                r.appendChild(b);
                row.appendChild(l); row.appendChild(r);
                rotBox.appendChild(row);
            });
        }

        var sellBox = this.$("black-sell");
        sellBox.innerHTML = "";
        var cfg = GAME.DATA.CONTENT.TRIAL.blackPrice;
        var sellable = Object.keys(cfg).filter(function (id) { return GAME.State.countItem(id) > 0; });
        if (!sellable.length) { sellBox.innerHTML = '<div class="empty-tip">没有可在黑市脱手的高阶灵药。</div>'; }
        sellable.forEach(function (id) {
            var row = document.createElement("div");
            row.className = "item-row";
            var left = document.createElement("div");
            left.innerHTML = '<span class="q-' + GAME.DATA.ITEMS[id].quality + '">' + GAME.DATA.ITEMS[id].name + '</span> ×' + GAME.State.countItem(id);
            var right = document.createElement("div");
            right.className = "item-right";
            var g = document.createElement("span");
            g.className = "gold"; g.innerText = "黑市价 " + cfg[id] + "灵石";
            var b = document.createElement("button");
            b.className = "small-btn btn-gold";
            b.innerText = "销赃";
            b.onclick = function () { GAME.BlackMarket.sellBlack(id); };
            right.appendChild(g); right.appendChild(b);
            row.appendChild(left); row.appendChild(right);
            sellBox.appendChild(row);
        });

        // 黑市秘籍货架（魔道功法，灵石购入）
        var skBox = this.$("black-skills");
        if (skBox) {
            skBox.innerHTML = "";
            var sk = GAME.DATA.CONTENT.BLACK_SKILLS || [];
            if (!sk.length) skBox.innerHTML = '<div class="empty-tip">今日无秘籍上架。</div>';
            sk.forEach(function (g, i) {
                var item = GAME.DATA.ITEMS[g.id];
                var row = document.createElement("div");
                row.className = "item-row";
                var left = document.createElement("div");
                left.innerHTML = '<span class="q-极品">' + item.name + '</span>'
                    + '<div class="item-desc">' + item.desc + '</div>';
                var right = document.createElement("div");
                right.className = "item-right";
                var price = document.createElement("span");
                price.className = "gold"; price.innerText = g.price + " 灵石";
                var b = document.createElement("button");
                b.className = "small-btn btn-gold";
                b.innerText = "购入";
                b.disabled = p.spiritStones < g.price || GAME.State.countItem(g.id) > 0;
                b.onclick = function () { GAME.BlackMarket.buySkill(i); };
                right.appendChild(price); right.appendChild(b);
                row.appendChild(left); row.appendChild(right);
                skBox.appendChild(row);
            });
        }
    },

    // ---------- 历练事件面板 ----------
    renderEvent: function () {
        var p = GAME.State.p();
        if (!p.pendingEvent || p.isDead || p.combat) return;   // 可见性由 applyPanels 统一控制
        var ev = GAME.Core.findEvent(p.pendingEvent.eventId);
        if (!ev) { p.pendingEvent = null; return; }
        this.$("event-text").innerText = ev.text;
        var box = this.$("event-choices");
        box.innerHTML = "";
        (ev.choices || []).forEach(function (opt, idx) {
            var b = document.createElement("button");
            b.className = "btn-gold event-opt";
            // 选项第一行是选项本身，第二行是自动推导的"赌注"（风险/收益/对手）
            var tip = (GAME.Tips && GAME.Tips.choiceTip) ? (opt.tip || GAME.Tips.choiceTip(opt)) : "";
            b.innerHTML = '<span class="opt-text"></span>' +
                          (tip ? '<span class="opt-tip"></span>' : "");
            b.firstChild.innerText = opt.text;
            if (tip) b.lastChild.innerText = tip;
            b.onclick = function () { GAME.Core.chooseEventOption(idx); };
            box.appendChild(b);
        });
    },

    // ---------- 战后处置面板（杀/放） ----------
    renderMercy: function () {
        var p = GAME.State.p();
        if (!p.pendingMercy || p.isDead || p.combat) return;   // 可见性由 applyPanels 统一控制
        var name = "-";
        GAME.DATA.MONSTERS.forEach(function (m) { if (m.id === p.pendingMercy.monsterId) name = m.name; });
        this.$("mercy-text").innerText = "【" + name + "】伏地不起，只求活命。你握剑的手微微一顿——";
        // 毁尸灭迹：需火球符或《火球术》
        var canBurn = (p.spells && p.spells.huoqiu_shu) || GAME.State.countItem("talisman_huoqiu") > 0;
        this.$("btn-mercy-burn").disabled = !canBurn;
        this.$("btn-mercy-burn").title = canBurn ? "" : "需【火球符】或习得《火球术》";
    },

    // ---------- 血月试炼面板（紧急覆盖） ----------
    renderTrial: function () {
        var p = GAME.State.p();
        if (!p.trial || p.isDead) return;   // 可见性由 applyPanels 统一控制
        var cfg = GAME.DATA.CONTENT.TRIAL;
        var herbs = cfg.herbs.map(function (h) {
            return GAME.DATA.ITEMS[h].name + "×" + GAME.State.countItem(h);
        }).join("、");
        this.$("trial-text").innerHTML =
            "剩余步数：<span class=\"warning\">" + p.trial.stepsLeft + " / " + cfg.steps + "</span><br>" +
            "已采主药：" + herbs + "<br>每步或采药、或遇精英死斗、或破古修残阵。走完二十步方能保住战利品。";
        this.$("btn-trial-step").disabled = false;
        this.$("btn-trial-abandon").disabled = false;
    },

    // ---------- 血色禁地面板（5×5 网格，紧急覆盖） ----------
    renderFzone: function () {
        var p = GAME.State.p();
        var f = p.fzone;
        if (!f || p.isDead) return;   // 可见性由 applyPanels 统一控制
        // 概览：已夺主药、剩余调息次数
        var cfg = GAME.DATA.CONTENT.FZONE;
        var self = this;
        var herbStr = Object.keys(f.herbs).map(function (id) {
            return GAME.DATA.ITEMS[id].name + "×" + f.herbs[id];
        }).join("、") || "尚无";
        this.$("fz-text").innerHTML =
            "已夺主药：<span class=\"gold\">" + herbStr + "</span>" +
            "　｜　尚可调息：" + f.restLeft + " / " + cfg.restCount + " 次<br>" +
            "三处药田各有守护妖兽盘踞——闯入即是一场死斗，胜则夺药。夺齐三味主药上交，方是正品筑基丹的份例。";

        // 药田清单：每处一行 + 闯入夺药按钮（已夺则灰显不可点）
        var html = "";
        cfg.herbs.forEach(function (id, i) {
            var fd = cfg.fields[id];
            var got = !!f.herbs[id];
            html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;' +
                'padding:7px 0;border-bottom:1px dashed var(--bd);' + (got ? 'opacity:.55;' : '') + '">' +
                '<div><span class="gold">' + fd.label + '</span>　' +
                '<span class="item-desc">灵药：' + GAME.DATA.ITEMS[id].name +
                '　守护：' + fd.guardian + (got ? '（已伏诛，药已采走）' : '') + '</span></div>' +
                '<button id="btn-fz-fight' + i + '" class="' + (got ? "small-btn" : "btn-danger") + '"' +
                (got ? " disabled" : "") + '>' + (got ? "已夺" : "闯入夺药") + '</button>' +
                '</div>';
        });
        this.$("fz-fields").innerHTML = html;
        cfg.herbs.forEach(function (id) {
            var idx = cfg.herbs.indexOf(id);
            var btn = self.$("btn-fz-fight" + idx);
            if (btn) btn.onclick = function () { GAME.FZone.challenge(id); };
        });

        var n = Object.keys(f.herbs).reduce(function (s, id) { return s + f.herbs[id]; }, 0);
        this.$("btn-fz-rest").disabled = f.restLeft <= 0;
        this.$("btn-fz-submit").disabled = n <= 0;   // 无药可交时不可结算
        this.$("btn-fz-keep").disabled = n <= 0;
        this.$("btn-fz-teleport").disabled = GAME.State.countItem("talisman_chuansong") < 1;
        this.$("btn-fz-abandon").disabled = false;
    },

    // ---------- 苍梧门六幕剧情面板（紧急覆盖） ----------
    // ---------- 副本中枢：血月试炼 / 血色禁地 / 玄机世家主线 ----------
    renderDungeon: function () {
        var p = GAME.State.p();
        if (this.tab !== "dungeon" || p.isDead || p.combat) return;   // 可见性由 applyPanels 统一控制
        var self = this;
        var box = this.$("dungeon-list");
        box.innerHTML = "";
        this.showGuide("dungeon-guide", "dungeon", "副本怎么进",
            "副本是筑基丹三味主药（天灵果·玉髓芝·紫猴花）的来源，练气十层可入。注意：两处都「进一次要候几个月才能再进」——血月试炼 6 月、血色禁地 12 月。先把冷却规划好，别一次性全耗光。进去后按面板提示一步步来即可，带【传送符】可随时连人带货撤离。");

        var entries = [
            {
                id: "trial", name: "血月试炼", cdKey: "trial",
                req: GAME.DATA.CONTENT.TRIAL.enterRealm,
                desc: "古修遗境的入门试炼——二十步生死，集齐三味主药者，回洞府可炼正品筑基丹。出入一次后，禁制须候数月方复原。",
                ongoing: !!p.trial,
                enter: function () { GAME.Trial.start(); },
            },
            {
                id: "fzone", name: "血色禁地", cdKey: "fzone",
                req: GAME.DATA.CONTENT.FZONE.enterRealm,
                desc: "禁地三处药田，各有守护妖兽盘踞——闯入即战，胜则夺药。夺齐三药上交，方是正品筑基丹的份例。",
                ongoing: !!p.fzone,
                enter: function () { GAME.FZone.start(); },
            },
        ];

        entries.forEach(function (d) {
            var realmLocked = d.req !== null && p.realmIndex < d.req;
            var cdLeft = d.cdKey ? GAME.State.cdLeft(d.cdKey) : 0;   // 副本冷却（日常化）
            var row = document.createElement("div");
            row.className = "item-row";
            var left = document.createElement("div");
            left.innerHTML = '<span class="q-上品">' + d.name + '</span>' +
                '<div class="item-desc">' + d.desc + '</div>' +
                '<div class="item-desc">' +
                (realmLocked ? '<span class="danger">【需练气' + (d.req + 1) + '层】</span>'
                    : d.lockedStory ? '<span class="warning">' + d.lockStoryHint + '</span>'
                    : cdLeft > 0 ? '<span class="warning">【休整中 · 尚需 ' + cdLeft + ' 月复原】</span>'
                    : '<span class="highlight">已可进入</span>') +
                (d.ongoing ? ' <span class="warning">（探索进行中——请从紧急面板继续）</span>' : '') +
                '</div>';
            var right = document.createElement("div");
            right.className = "item-right";
            var b = document.createElement("button");
            b.className = "small-btn btn-gold";
            b.innerText = "进入";
            b.disabled = realmLocked || d.lockedStory || d.ongoing || cdLeft > 0;
            b.onclick = d.enter;
            right.appendChild(b);
            row.appendChild(left);
            row.appendChild(right);
            box.appendChild(row);
        });
    },

    renderQixuan: function () {
        var p = GAME.State.p();
        var v = GAME.Qixuan ? GAME.Qixuan.view() : null;
        if (!v) return;   // 可见性由 applyPanels 统一控制
        this.$("qixuan-text").innerHTML = '<h3 style="margin-top:0;">' + v.title + '</h3>' + v.text;
        var box = this.$("qixuan-choices");
        box.innerHTML = "";
        v.choices.forEach(function (c, i) {
            var b = document.createElement("button");
            b.className = i === 0 ? "btn-gold" : "small-btn";
            b.innerText = c.label + (c.hint ? "（" + c.hint + "）" : "");
            b.onclick = function () { GAME.Qixuan.choose(i); };
            box.appendChild(b);
        });
    },

    // ---------- 神识尾随面板（紧急覆盖） ----------
    renderTrack: function () {
        var p = GAME.State.p();
        if (!p.tracking || p.isDead) return;   // 可见性由 applyPanels 统一控制
        var hasCharm = GAME.State.countItem("talisman_shenxing") > 0;
        this.$("track-text").innerText =
            "尾随者死死咬住你（携 " + p.tracking.stones + " 灵石）。" +
            (hasCharm ? "你怀中尚有一道【神行符】，可保无虞。" : "凭御风诀速度检定，或引其反杀，或破财消灾。");
    },

    // ---------- 岚州大地图 ----------
    renderMap: function () {
        var self = this;
        var p = GAME.State.p();
        var node = GAME.Map.cur();
        this.$("map-info").innerHTML =
            '<span class="highlight">' + node.name + '</span>　｜　盘缠 <span class="gold">' + (p.silver || 0) +
            ' 两</span>　｜　灵石 <span class="gold">' + p.spiritStones + '</span><br>' + node.desc;

        // 道路按钮：修为不足 / 盘缠不足 / 幻阵未破时禁用，并在文案里写明原因
        var box = this.$("map-routes");
        box.innerHTML = "";
        var routes = GAME.Map.routes();
        if (!routes.length) { box.innerHTML = '<div class="empty-tip">此地已是路的尽头。</div>'; }
        routes.forEach(function (r) {
            var chk = GAME.Map.canTravel(r.id);
            var row = document.createElement("div");
            row.className = "item-row";
            var left = document.createElement("div");
            var sub;
            if (!r.unlocked) {
                sub = '<span class="warning">修为不足</span> — ' + r.lockMsg;
            } else {
                sub = r.months + " 个月，" + (r.silver > 0 ? "盘缠 " + r.silver + " 两" : "不需盘缠");
            }
            left.innerHTML = '前往 <span class="' + (r.unlocked ? "q-灵品" : "item-desc") + '">' + r.targetName + '</span>' +
                '<div class="item-desc">' + sub + '</div>';
            var right = document.createElement("div");
            right.className = "item-right";
            var b = document.createElement("button");
            b.className = "small-btn btn-gold";
            b.innerText = "动身";
            b.disabled = !chk.ok;
            if (!chk.ok) b.title = chk.msg;
            b.onclick = function () { GAME.Map.travel(r.id); };
            right.appendChild(b);
            row.appendChild(left); row.appendChild(right);
            box.appendChild(row);
        });

        // 天下舆图：全部节点与解锁进度——未解锁者隐去详情，只留所需境界
        var atlasBox = this.$("map-atlas");
        atlasBox.innerHTML = "";
        GAME.Map.atlas().forEach(function (n) {
            var row = document.createElement("div");
            row.className = "item-row";
            var left = document.createElement("div");
            if (n.unlocked) {
                left.innerHTML = (n.here ? '<span class="gold">【此地】</span>' : "") +
                    '<span class="q-灵品">' + n.name + '</span>' +
                    '<div class="item-desc">' + (n.kind === "immortal" ? "修仙之地" : n.kind === "mortal" ? "凡俗城池" : "故地洞府") + '</div>';
            } else {
                left.innerHTML = '<span class="warning">🔒</span> <span class="item-desc">' + n.name +
                    '</span><div class="item-desc">需 ' + n.reqRealmName + ' 以上' +
                    (n.teaser ? ' — ' + n.teaser : '') + '</div>';
            }
            row.appendChild(left);
            row.appendChild(document.createElement("div"));
            atlasBox.appendChild(row);
        });

        // 狩猎副本入口：分档狩猎（按修为解锁），狩猎中显示撤退按钮
        var huntBox = this.$("map-hunts");
        huntBox.innerHTML = "";
        (GAME.DATA.HUNTS ? GAME.DATA.HUNTS.list : []).forEach(function (d) {
            var chk = GAME.Hunt.canEnter(d.id);
            var row = document.createElement("div");
            row.className = "item-row";
            var left = document.createElement("div");
            left.innerHTML = '<span class="' + (chk.ok ? "q-灵品" : "item-desc") + '">' + d.name + '</span>' +
                '<div class="item-desc">' + d.teaser + '（连战 ' + d.waves.length + ' 波）</div>';
            var right = document.createElement("div");
            right.className = "item-right";
            var b = document.createElement("button");
            b.className = "small-btn btn-gold";
            b.innerText = "入山狩猎";
            b.disabled = !chk.ok || !!p.combat;
            if (!chk.ok) b.title = chk.msg;
            b.onclick = function () { GAME.Hunt.enter(d.id); };
            right.appendChild(b);
            if (p.hunt && p.hunt.id === d.id && p.hunt.await && !p.combat) {
                var bNext = document.createElement("button");
                bNext.className = "small-btn btn-gold";
                bNext.innerText = "继续第 " + (p.hunt.wave + 1) + " 波";
                bNext.onclick = function () { GAME.Hunt.next(); };
                right.appendChild(bNext);
                var b2 = document.createElement("button");
                b2.className = "small-btn";
                b2.innerText = "见好就收";
                b2.onclick = function () { GAME.Hunt.leave(); };
                right.appendChild(b2);
            }
            row.appendChild(left); row.appendChild(right);
            huntBox.appendChild(row);
        });

        // 地点专属行动
        var ab = this.$("map-actions");
        ab.innerHTML = "";
        (node.actions || []).forEach(function (a) {
            var chk2 = GAME.Map.canDoAction(a.id);
            var row2 = document.createElement("div");
            row2.className = "item-row";
            var l2 = document.createElement("div");
            l2.innerHTML = a.label + '<div class="item-desc">' + (chk2.ok ? a.hint : chk2.msg) + '</div>';
            var r2 = document.createElement("div");
            r2.className = "item-right";
            var b2 = document.createElement("button");
            b2.className = "small-btn btn-gold";
            b2.innerText = "行事";
            b2.disabled = !chk2.ok;
            b2.onclick = function () { GAME.Map.doAction(a.id); };
            r2.appendChild(b2);
            row2.appendChild(l2); row2.appendChild(r2);
            ab.appendChild(row2);
        });
        if (!(node.actions || []).length) ab.innerHTML = '<div class="empty-tip">此地无事可做。</div>';

        this.$("btn-exchange-1").disabled = p.spiritStones < 1;
        this.$("btn-exchange-5").disabled = p.spiritStones < 5;
        // 行商兑换市银：只现身于凡俗城池（修仙之地只认灵石，世俗银两无用）
        var exBox = this.$("map-exchange");
        if (exBox) exBox.style.display = (node.kind === "mortal") ? "block" : "none";

        // 苍南小会内容并入地图面板：身抵苍南谷时显现，否则隐藏
        var tb = this.$("tainan-block");
        if (tb) tb.style.display = GAME.Tainan.at() ? "block" : "none";
    },

    // ---------- 景阳城·玄机世家主线 ----------
    renderJiayuan: function () {
        var p = GAME.State.p();
        if (!p.jiayuan || p.isDead || p.combat) return;   // 可见性由 applyPanels 统一控制
        var st = GAME.Jiayuan.stageCfg(p.jiayuan.stage);
        if (!st) return;
        this.$("jiayuan-title").innerText = "玄机世家 · " + st.title;
        this.$("jiayuan-text").innerText = st.text;
        var box = this.$("jiayuan-choices");
        box.innerHTML = "";
        st.choices.forEach(function (ch, idx) {
            var chk = GAME.Jiayuan.canChoose(ch);
            var b = document.createElement("button");
            b.className = "btn-gold";
            b.innerText = ch.text;
            b.disabled = !chk.ok;
            if (!chk.ok) b.title = chk.msg;
            b.onclick = function () { GAME.Jiayuan.choose(idx); };
            box.appendChild(b);
        });
    },

    // ---------- 夜探墨府面板（房间清单，紧急覆盖） ----------
    renderMansion: function () {
        var p = GAME.State.p();
        var m = p.mansion;
        if (!m || p.isDead || p.combat) return;   // 可见性由 applyPanels 统一控制
        var c = GAME.DATA.MANSION;
        var self = this;
        var lock = !!m.pendingPatrol;
        this.$("mansion-text").innerHTML =
            "剩余时机：<span class=\"" + (m.acts <= 1 ? "danger" : "warning") + "\">" + m.acts + " / " + c.acts + "</span>" +
            "　｜　线索：<span class=\"gold\">" + m.clues + " / " + c.clueTarget + "</span>" +
            "　｜　警惕：<span class=\"" + (m.alert >= c.alertBust ? "danger" : "info") + "\">" + m.alert + " / " + c.alertBust + "</span><br>" +
            (lock ? "<span class=\"danger\">巡卫当前——先选隐匿 / 行贿 / 硬闯。</span>"
                  : "搜检下列处所寻线索，或盘问下人暂缓警惕；集齐线索再入内堂见颜氏。");

        // 房间清单：每处一行 + 搜检按钮（已查 / 时机耗尽 / 巡卫当前 时灰显不可点）
        var html = "";
        c.rooms.forEach(function (r, i) {
            var done = !!m.searched[r.id];
            var tip;
            if (r.vault) tip = m.vaultOpened ? "暗格已启，手札到手"
                : (m.clues >= c.vault.needClues ? "暗格可启" : "需线索 ≥" + c.vault.needClues + " 方能看出端倪");
            else tip = done ? "已搜检" : "或有线索";
            var can = GAME.Mansion.canSearch(r.id);
            html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;' +
                'padding:7px 0;border-bottom:1px dashed var(--bd);' + (done ? 'opacity:.55;' : '') + '">' +
                '<div><span class="gold">' + r.label + '</span>　<span class="item-desc">' + tip + '</span></div>' +
                '<button id="btn-ms-room' + i + '" class="' + (done ? "small-btn" : "btn-gold") + '"' +
                (can ? "" : " disabled") + '>' + (done ? "已查" : "搜检") + '</button>' +
                '</div>';
        });
        this.$("mansion-rooms").innerHTML = html;
        c.rooms.forEach(function (r, i) {
            var btn = self.$("btn-ms-room" + i);
            if (btn) btn.onclick = function () { GAME.Mansion.searchRoom(r.id); };
        });

        this.$("btn-ms-question").disabled = lock || !GAME.Mansion.canQuestion();
        this.$("btn-ms-sneak").disabled = !lock;
        this.$("btn-ms-bribe").disabled = !lock || p.silver < c.bribeSilver;
        this.$("btn-ms-fight").disabled = !lock;
        this.$("btn-ms-finish").disabled = lock;
        this.$("btn-ms-abandon").disabled = lock;
    },

    // ---------- 苍南小会 ----------
    renderTainan: function () {
        var self = this;
        var p = GAME.State.p();
        if (!GAME.Tainan.at() || p.isDead || p.combat) return;   // 可见性由 applyPanels 统一控制

        var tips = [];
        if (p.sectId) tips.push("你已是【" + GAME.DATA.TAINAN.token.sectName + "】门人。");
        else if (p.tainan && p.tainan.leitaiDone) tips.push("升仙大会前三已定，筑基丹已入手。");
        else if (p.tainan && p.tainan.leitai > 0) tips.push("已连胜 " + p.tainan.leitai + " 场，再赢 " + (GAME.DATA.TAINAN.leitai.length - p.tainan.leitai) + " 场可夺前三。");
        else tips.push("擂台三轮连胜可得前三，赐筑基丹一枚。");
        this.$("tainan-info").innerText = tips.join("　");

        // 散修坊市
        var box = this.$("tainan-goods");
        box.innerHTML = "";
        GAME.DATA.TAINAN.goods.forEach(function (g, idx) {
            var item = GAME.DATA.ITEMS[g.id];
            var row = document.createElement("div");
            row.className = "item-row";
            var left = document.createElement("div");
            left.innerHTML = '<span class="q-' + item.quality + '">' + item.name + '</span>' +
                '<div class="item-desc">' + g.desc + '</div>';
            var right = document.createElement("div");
            right.className = "item-right";
            var price = document.createElement("span");
            price.className = "gold";
            price.innerText = g.price + " 灵石";
            var b = document.createElement("button");
            b.className = "small-btn btn-gold";
            b.innerText = "购买";
            b.disabled = p.spiritStones < g.price;
            b.onclick = function () { GAME.Tainan.buy(idx); };
            right.appendChild(price); right.appendChild(b);
            row.appendChild(left); row.appendChild(right);
            box.appendChild(row);
        });

        // 出售杂物
        var sellBox = this.$("tainan-sell");
        sellBox.innerHTML = "";
        var sellable = Object.keys(p.inventory).filter(function (id) { return GAME.Tainan.canSell(id); });
        if (!sellable.length) { sellBox.innerHTML = '<div class="empty-tip">没有可脱手之物。</div>'; }
        sellable.forEach(function (id) {
            var item = GAME.DATA.ITEMS[id];
            var row = document.createElement("div");
            row.className = "item-row";
            var left = document.createElement("div");
            left.innerHTML = '<span class="q-' + item.quality + '">' + item.name + '</span> ×' + p.inventory[id];
            var right = document.createElement("div");
            right.className = "item-right";
            var price = document.createElement("span");
            price.className = "gold";
            price.innerText = GAME.Tainan.sellPrice(id) + " 灵石";
            var b = document.createElement("button");
            b.className = "small-btn btn-gold";
            b.innerText = "脱手";
            b.onclick = function () { GAME.Tainan.sell(id); };
            right.appendChild(price); right.appendChild(b);
            row.appendChild(left); row.appendChild(right);
            sellBox.appendChild(row);
        });

        // 升仙大会
        var rows = GAME.DATA.TAINAN.leitai.map(function (r) {
            return r.name;
        }).join(" → ");
        this.$("tainan-leitai").innerText = "擂台共三轮：" + rows + "。三轮皆胜者，可夺前三。";
        this.$("btn-leitai-next").disabled = !!p.sectId || !!(p.tainan && p.tainan.leitaiDone);
        this.$("btn-shengxian-token").disabled = !!p.sectId || GAME.State.countItem("shengxian_ling") <= 0;
    },

    // ---------- 技能中枢（修行录）：已习/可学（持秘籍点击研习）/待觅 ----------
    renderSkill: function () {
        var p = GAME.State.p();
        if (this.tab !== "skill" || p.isDead || p.combat) return;   // 可见性由 applyPanels 统一控制
        var box = this.$("skill-list");
        if (!box) return;
        box.innerHTML = "";
        var codex = (GAME.DATA.SKILL_CODEX || []);
        var self = this;

        codex.forEach(function (e) {
            // 判定已习状态
            var learned = false, sub = "", extra = "";
            if (e.spell) {
                learned = !!(p.spells && p.spells[e.spell]);
                var sp = GAME.DATA.SPELLS[e.spell];
                if (sp) extra = sp.school + "　" + (sp.dmg ? sp.dmg + " 伤 / 冷却 " + sp.cd + " 回合" : (sp.dodge ? "闪避 " + (sp.dodge * 100) + "%" : (sp.disguise ? "伪装 " + sp.disguise + " 层" : "神识法门")));
            } else if (e.skill) {
                learned = !!(p.skills && p.skills[e.skill]);
                if (e.skill === "skill_manli") extra = "被动 · 攻击 +3（永久）";
                else if (e.skill === "skill_yaoshou") extra = "被动 · 气血上限 +30（永久）";
                else if (e.skill === "sword_fragment") extra = "被动 · 攻击 +15 / 神识 +2（永久）";
            } else if (e.gongfa === "changchun") {
                learned = (p.changchunLevel || 0) > 0;
                extra = "被动 · 命中 +" + ((p.changchunLevel || 0) * 5) + "% / 异常抗性 +" + ((p.changchunLevel || 0) * 10) + "%（现第 " + (p.changchunLevel || 0) + " 层）";
            } else if (e.wuxue === "luoyan") {
                learned = (p.changchunLevel || 0) > 0;   // 流烟步随苍梧门习武一并习得
                extra = "主动 · 耗 30% 气血本回合规避，下回合脱力";
            }

            var row = document.createElement("div");
            row.className = "item-row" + (learned ? " skill-learned" : "");
            var left = document.createElement("div");
            left.innerHTML = '<span class="q-' + (e.evil ? "极品" : "灵品") + '">' + (e.spell ? GAME.DATA.SPELLS[e.spell].name : (e.gongfa === "changchun" ? "青木功" : (e.wuxue === "luoyan" ? "流烟步" : GAME.DATA.ITEMS[e.skill].name))) + '</span>'
                + ' <span class="item-desc">[' + e.kind + ']</span>'
                + '<div class="item-desc">' + (extra ? extra + "　" : "") + "来路：" + e.source + (e.req ? "（参悟需《青木功》" + e.req + " 层）" : "") + '</div>';
            var right = document.createElement("div");
            right.className = "item-right";

            if (learned) {
                var tag = document.createElement("span");
                tag.className = "q-灵品";
                tag.innerText = "已习";
                right.appendChild(tag);
            } else if (e.item && GAME.State.countItem(e.item) > 0) {
                // 持有秘籍 → 可研习
                var b = document.createElement("button");
                b.className = "small-btn btn-gold";
                b.innerText = "研习";
                b.onclick = function () { GAME.Core.takePill(e.item); };
                right.appendChild(b);
            } else {
                var hint = document.createElement("span");
                hint.className = "item-desc";
                hint.innerText = "未得秘籍";
                right.appendChild(hint);
            }
            row.appendChild(left); row.appendChild(right);
            box.appendChild(row);
        });

        if (!codex.length) box.innerHTML = '<div class="empty-tip">尚无技能录。</div>';
    },

    // ---------- 玄机子与夺舍对决（多阶段紧急面板） ----------
    renderMo: function () {
        var p = GAME.State.p();
        if (!p.moEvent || p.combat || p.isDead) return;   // 阶段二为战斗，归 combat 面板
        var cfg = GAME.DATA.CONTENT.MODAIFU;
        this.$("mo-text").innerText = (p.moEvent.stage === 1) ? cfg.stage1.text : cfg.stage3.text;

        // 阶段一：仅"运功相抗"按钮
        this.show("mo-stage1-actions", p.moEvent.stage === 1);
        // 阶段三：吞噬选项（硬撼 / 摄魂钟 / 再试）
        this.show("mo-stage3-actions", p.moEvent.stage === 3);
        if (p.moEvent.stage === 3) {
            this.$("btn-mo-swallow-bell").disabled = GAME.State.countItem("yinhun_zhong") <= 0;
            this.$("btn-mo-retry").disabled = false;
        }
    },

    // ---------- 铁奴·玄傀 随从面板 ----------
    renderCompanion: function () {
        var p = GAME.State.p();
        if (this.tab !== "companion" || p.isDead || p.combat) return;   // 可见性由 applyPanels 统一控制
        var info = this.$("companion-info");
        var activateBtn = this.$("btn-companion-activate");
        var weedBtn = this.$("btn-companion-weed");
        var mineBtn = this.$("btn-companion-mine");
        if (p.companion && p.companion.hp > 0) {
            info.innerHTML = "【" + p.companion.name + "】气血 " + Math.max(0, p.companion.hp) + "/" + p.companion.maxHp +
                "，攻击 " + p.companion.atk + "。玄龟功护体，免伤极高，且不畏流血与寻常剧毒。可战前随行，亦可派往洞府外劳作。";
            activateBtn.style.display = "none";
            weedBtn.disabled = false;
            mineBtn.disabled = false;
        } else if (p.companion && p.companion.hp <= 0) {
            info.innerText = "【" + p.companion.name + "】重伤不支，暂需在旁调息，无法派遣。";
            activateBtn.style.display = "none";
            weedBtn.disabled = true;
            mineBtn.disabled = true;
        } else {
            info.innerText = "你尚未收服随从。玄机子一战之后，或可凭【摄魂钟】唤起铁奴玄傀。";
            activateBtn.style.display = "inline-block";
            activateBtn.disabled = GAME.State.countItem("yinhun_zhong") <= 0;
            weedBtn.disabled = true;
            mineBtn.disabled = true;
        }
    },

    // ---------- 战斗面板 ----------
    renderCombat: function () {
        var p = GAME.State.p();
        if (!p.combat || p.isDead) return;   // 可见性由 applyPanels 统一控制
        var c = p.combat;
        this.$("combat-enemy-text").innerHTML =
            '<span class="warning">' + c.name + '</span>　气血：<span class="warning">' +
            Math.max(0, c.hp) + " / " + c.maxHp + '</span>';
        this.$("combat-round-text").innerHTML =
            "第 " + c.round + " 回合　｜　你的气血：<span class=\"warning\">" + p.currentHp + " / " + p.maxHp + "</span>" +
            (c.shield > 0 ? '　｜　罡气：<span class="gold">' + c.shield + "</span>" : "") +
            (p.companion ? '　｜　<span class="gold">玄傀 ' + Math.max(0, p.companion.hp) + "/" + p.companion.maxHp + "</span>" : "");

        // 战斗状态提示（目眩 / 流血 / 脱力 / 流烟步规避 / 玄机子之战）
        var st = [];
        if (c.blind && c.blind.turns > 0) st.push("敌【目眩】" + c.blind.turns + "回合");
        if (c.bleed && c.bleed.turns > 0) st.push("敌【流血】" + c.bleed.turns + "回合");
        if (c.poison && c.poison.turns > 0) st.push("敌【中毒】" + c.poison.turns + "回合");
        if (c.stun && c.stun.turns > 0) st.push("敌【定身】" + c.stun.turns + "回合");
        if (c.exhausted) st.push("你【脱力】");
        if (c.evade) st.push("你【流烟步】规避");
        if (c.moEvent) st.push("玄机子·魔银手");
        if (st.length) this.$("combat-round-text").innerHTML += '<br><span class="item-desc">' + st.join("　") + "</span>";

        var tbox = this.$("talisman-list");
        if (!c.talismanOpen) { tbox.style.display = "none"; } else {
            tbox.style.display = "block";
            tbox.innerHTML = "";
            var talismans = Object.keys(p.inventory).filter(function (id) { return GAME.DATA.ITEMS[id].type === "talisman"; });
            if (!talismans.length) { tbox.innerHTML = '<div class="empty-tip">储物袋中没有符箓。</div>'; }
            talismans.forEach(function (id) {
                var b = document.createElement("button");
                b.className = "small-btn btn-gold";
                b.style.marginRight = "6px";
                b.innerText = GAME.DATA.ITEMS[id].name + " ×" + p.inventory[id];
                b.onclick = function () { GAME.Combat.useTalisman(id); };
                tbox.appendChild(b);
            });
        }

        // 术法列表：苍南小会习得者方可施放，冷却中的写明尚余几回合
        var sbox = this.$("spell-list");
        if (!c.spellOpen) { sbox.style.display = "none"; } else {
            sbox.style.display = "block";
            sbox.innerHTML = "";
            // 仅列出可主动施放的攻击类术法（被动/神识类自动生效，不入施法列表）
            var learned = Object.keys(GAME.DATA.SPELLS || {}).filter(function (id) {
                var sp = GAME.DATA.SPELLS[id];
                return p.spells && p.spells[id] && sp && sp.dmg;
            });
            if (!learned.length) { sbox.innerHTML = '<div class="empty-tip">你尚未习得可主动施放的攻击术法（可往坊市/黑市求购法术书）。</div>'; }
            learned.forEach(function (id) {
                var sp = GAME.DATA.SPELLS[id];
                var ready = (c.spellReady && c.spellReady[id]) || 0;
                var cd = Math.max(0, ready - c.round);
                var b = document.createElement("button");
                b.className = "small-btn btn-gold";
                b.style.marginRight = "6px";
                b.innerText = sp.name + "（" + sp.dmg + "伤" + (cd > 0 ? "，尚需 " + cd + " 回合" : "，可用") + "）";
                b.disabled = cd > 0 || p.isDead;
                b.onclick = function () { GAME.Combat.castSpell(id); };
                sbox.appendChild(b);
            });
        }

        // 毒囊 / 自爆 / 暗技 / 随从 / 术法 按钮可用性（具体判定在 Combat 内，此处仅做视觉禁用）
        var p_inv = p.inventory;
        var hasPoison = Object.keys(p_inv).some(function (k) {
            var it = GAME.DATA.ITEMS[k];
            return it.type === "poison" && it.combat && it.combat.poison;
        });
        var hasBlink = (GAME.DATA.SKILLS && GAME.DATA.SKILLS.blink_sword && GAME.State.countItem(GAME.DATA.SKILLS.blink_sword.item) > 0);
        var hasCompanion = !!(p.companion && p.companion.hp > 0);
        this.$("btn-coat").disabled = c.round > 1 || !hasPoison || p.isDead;
        this.$("btn-detonate").disabled = !p.artifact || p.currentHp > p.maxHp * 0.25 || p.isDead;
        this.$("btn-luoyan").disabled = c.usedLuoyan || c.exhausted || p.isDead;
        this.$("btn-blink").disabled = !c.day || !hasBlink || c.exhausted || p.isDead;
        this.$("btn-companion-block").disabled = !hasCompanion || c.blockNext || c.exhausted || p.isDead;
        this.$("btn-companion-smash").disabled = !hasCompanion || c.exhausted || p.isDead;
        var hasSpell = !!(p.spells && Object.keys(GAME.DATA.SPELLS || {}).some(function (k) { return p.spells[k]; }));
        this.$("btn-spell").disabled = !hasSpell || p.isDead;
        this.$("btn-flee").disabled = !!c.moEvent || p.isDead;   // 玄机子封死退路
        this.$("btn-fubao").disabled = !(GAME.State.countItem("fubao_lvhuang") > 0 || GAME.State.countItem("fubao_luohun") > 0) || c.exhausted || p.isDead;
    },

    // ---------- 成就道碑 ----------
    renderAchievements: function () {
        var p = GAME.State.p();
        var total = GAME.DATA.ACHIEVEMENTS.length;
        var got = p.achievements.length;
        this.$("ach-summary").innerText =
            "道碑 " + got + "/" + total + "　｜　生平：斩敌 " + p.stats.kills + "，留活口 " + p.stats.mercies +
            "，破境 " + p.stats.breakthroughs + " 次，历练 " + p.stats.explores + " 次，服丹 " + p.stats.pillsTaken +
            " 枚，炼丹 " + p.stats.alchemy + " 炉";
        var box = this.$("ach-list");
        box.innerHTML = "";
        GAME.DATA.ACHIEVEMENTS.forEach(function (a) {
            var span = document.createElement("span");
            var unlocked = GAME.State.hasAchievement(a.id);
            span.className = "ach " + (unlocked ? "ach-on" : "ach-off");
            span.title = a.desc;
            span.innerText = unlocked ? a.name : "？？？";
            box.appendChild(span);
        });
    },

    // ---------- 配色切换（浅色/深色，持久化到 localStorage） ----------
    initTheme: function () {
        var t = null;
        try { t = window.localStorage.getItem("xiuxian_theme"); } catch (e) {}
        if (t === "light") document.body.classList.add("theme-light");
        this.updateThemeBtn();
    },
    toggleTheme: function () {
        var light = document.body.classList.toggle("theme-light");
        try { window.localStorage.setItem("xiuxian_theme", light ? "light" : "dark"); } catch (e) {}
        this.updateThemeBtn();
        this.updateUI();   // 刷新状态栏着色（如善恶值 class）
    },
    updateThemeBtn: function () {
        var b = this.$("btn-theme");
        if (b) b.innerText = document.body.classList.contains("theme-light") ? "深色" : "浅色";
    },

    // ---------- 存档动作 ----------
    doSave: function () {
        // 未入世不许写档：否则会把"苍梧门六幕尚未启动"的空角色存成档，刷新后读进残局
        if (!this.started) { alert("尚未踏入修仙界，无可存之身。"); return; }
        GAME.Storage.save(false); this.updateUI();
    },
    doLoad: function () {
        if (!GAME.Storage.load()) return;
        this.started = true;
        this.tab = "map";
        this._lastAtMarket = undefined;
        this._lastLocation = undefined;
        this.setPlayMode(true);
        this.updateUI();
    },
    doRestart: function () {
        if (!window.confirm("重入轮回将删除当前存档与今生进度，确定？")) return;
        GAME.Storage.clear();
        // 清除死亡态：否则回到出身页时死亡锁仍未解除，按钮全灰、需手动刷新
        var pp = GAME.State.p();
        if (pp) { pp.isDead = false; pp.deathReason = ""; }
        this.started = false;
        this.selectedOrigin = GAME.DATA.ORIGINS[0].id;
        this.tab = "map";
        this._lastAtMarket = undefined;
        this._lastLocation = undefined;
        document.getElementById("log-box").innerHTML = "";
        this.renderOrigin();
        this.applyDeathLock();   // 解除死亡锁，解锁出身页按钮（isDead 已清，走解锁分支）
    },

    // ---------- 存档管理（多档位） ----------
    doSaveManage: function () {
        this.renderSaveSlots();
        this.show("save-modal", true);
    },
    closeSaveModal: function () { this.show("save-modal", false); },

    renderSaveSlots: function () {
        var self = this;
        var wrap = this.$("save-slots");
        if (!wrap) return;
        var slots = GAME.Storage.listSlots();
        var active = GAME.Storage.getActiveSlot();
        wrap.innerHTML = "";
        slots.forEach(function (s) {
            var row = document.createElement("div");
            row.className = "slot-row" + (s.slot === active ? " slot-active" : "");
            var left, btns;
            if (s.name) {
                var t = s.ts ? new Date(s.ts) : null;
                var timeStr = t ? (t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2) +
                    " " + ("0" + t.getHours()).slice(-2) + ":" + ("0" + t.getMinutes()).slice(-2)) : "";
                left = '<div class="slot-info"><div class="slot-name">' + self.esc(s.name) +
                    ' <span class="slot-tag">' + self.esc(s.realm || "") + '</span></div>' +
                    '<div class="slot-time">' + timeStr + '</div></div>';
                btns = '<button class="small-btn slot-load" data-slot="' + s.slot + '">读取</button>' +
                    '<button class="small-btn slot-over" data-slot="' + s.slot + '">覆盖</button>' +
                    '<button class="small-btn btn-danger slot-del" data-slot="' + s.slot + '">删除</button>';
            } else {
                left = '<div class="slot-info"><div class="slot-name slot-empty">— 空档位 —</div></div>';
                btns = '<button class="small-btn slot-save" data-slot="' + s.slot + '">存入当前进度</button>';
            }
            row.innerHTML = left + '<div class="slot-btns">' + btns + '</div>';
            wrap.appendChild(row);
        });
        // 事件委托（闭包锁定 data-slot）
        var nodes = wrap.querySelectorAll("button[data-slot]");
        for (var i = 0; i < nodes.length; i++) {
            nodes[i].onclick = (function (btn) {
                var slot = parseInt(btn.getAttribute("data-slot"), 10);
                return function () {
                    if (btn.classList.contains("slot-load")) self.doLoadFromSlot(slot);
                    else if (btn.classList.contains("slot-over")) self.doSaveToSlot(slot, false);
                    else if (btn.classList.contains("slot-del")) self.doClearSlot(slot);
                    else if (btn.classList.contains("slot-save")) self.doSaveToSlot(slot, true);
                };
            })(nodes[i]);
        }
    },

    esc: function (s) {
        return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
        });
    },

    doLoadFromSlot: function (i) {
        if (!GAME.Storage.loadFromSlot(i)) return;
        this.started = true;
        this.tab = "map";
        this._lastAtMarket = undefined;
        this._lastLocation = undefined;
        this.setPlayMode(true);
        this.closeSaveModal();
        this.updateUI();
    },
    doSaveToSlot: function (i, fromEmpty) {
        if (!fromEmpty && GAME.Storage.hasSlot(i)) {
            if (!window.confirm("第 " + (i + 1) + " 号轮回石已有存档，确定覆盖？")) return;
        }
        GAME.Storage.saveToSlot(i, null, false);
        this.closeSaveModal();
        this.updateUI();
    },
    doClearSlot: function (i) {
        if (!GAME.Storage.hasSlot(i)) { GAME.UI.log("该档位本就空白。", "system"); return; }
        if (!window.confirm("删除第 " + (i + 1) + " 号轮回石的存档？此操作不可恢复。")) return;
        GAME.Storage.clearSlot(i);
        this.renderSaveSlots();
        this.updateUI();
    },

    // ---------- 官方筑基期体验存档 ----------
    startPresetZhuji: function () {
        var active = GAME.Storage.getActiveSlot();
        if (GAME.Storage.hasSlot(active)) {
            if (!window.confirm("载入官方筑基期存档将覆盖【第 " + (active + 1) + " 号轮回石】的当前进度。\n若想保留旧档，请先到『存档管理』另存他处。确定继续？")) return;
        }
        GAME.State.createZhujiPreset();
        GAME.Storage.saveToSlot(active, "筑基期·官方便览", true);  // 落盘，刷新可续档
        this.started = true;
        this.tab = "map";
        this._lastAtMarket = undefined;
        this._lastLocation = undefined;
        this.setPlayMode(true);
        this.closeSaveModal();
        document.getElementById("log-box").innerHTML = "";
        var pp = GAME.State.p();
        this.log("【官方筑基期存档】你以筑基一层之身睁眼——神识已修至《大衍决》四层圆满，气血 " + pp.maxHp +
            "、法力 " + pp.maxMp + "、灵石 " + pp.spiritStones + "。十年苦修尽数跳过，且去领略机关傀儡、噬金虫群与魔道终局。", "success");
        this.updateUI();
    },

    // ---------- 按钮事件绑定（HTML 不写 onclick） ----------
    bindEvents: function () {
        var self = this;
        this.$("btn-start").onclick = function () { self.startGame(self.selectedOrigin); };
        this.$("btn-meditate").onclick = function () { GAME.Core.meditate(); };
        this.$("btn-catalyze-bainian").onclick = function () { GAME.Core.catalyze(1, "herb_bainian"); };
        this.$("btn-catalyze-qiannian").onclick = function () { GAME.Core.catalyze(5, "herb_qiannian"); };
        var bWood = this.$("btn-catalyze-wood");
        if (bWood) bWood.onclick = function () { GAME.Cave2.catalyzeWood(); };
        var bXb = this.$("btn-catalyze-xuanbing");
        if (bXb) bXb.onclick = function () { GAME.Bottle.catalyze("xuanbing"); };
        var bLl = this.$("btn-catalyze-longlin");
        if (bLl) bLl.onclick = function () { GAME.Bottle.catalyze("longlin"); };
        this.$("btn-alchemy").onclick = function () { self.toggleAlchemy(); };
        this.$("btn-close-alchemy").onclick = function () { self.switchTab("home"); };
        this.$("btn-breakthrough").onclick = function () { GAME.Core.breakthrough(); };
        this.$("btn-explore").onclick = function () { GAME.Core.explore(); };
        this.$("btn-market").onclick = function () { GAME.Market.toggle(); };
        this.$("btn-leave-market").onclick = function () { GAME.Market.toggle(); };
        var bEx = this.$("btn-exchange-stone");
        if (bEx) bEx.onclick = function () { GAME.Market.exchangeStone(); };

        this.$("btn-attack").onclick = function () { GAME.Combat.attack(); };
        var bac = this.$("btn-auto-combat");
        if (bac) bac.onclick = function () { GAME.Combat.auto(); };
        this.$("btn-fubao").onclick = function () {
            var p = GAME.State.p();
            var ids = ["fubao_lvhuang", "fubao_luohun"];
            for (var i = 0; i < ids.length; i++) {
                if (GAME.State.countItem(ids[i]) > 0) { GAME.Combat.useFuBao(ids[i]); return; }
            }
            GAME.UI.log("你身上并无符宝可祭。", "system"); GAME.UI.updateUI();
        };
        this.$("btn-talisman").onclick = function () { GAME.Combat.toggleTalismans(); };
        this.$("btn-coat").onclick = function () { GAME.Combat.coatPoison(); };
        this.$("btn-detonate").onclick = function () { GAME.Combat.detonate(); };
        this.$("btn-flee").onclick = function () { GAME.Combat.flee(); };
        this.$("btn-luoyan").onclick = function () { GAME.Combat.luoyan(); };
        this.$("btn-blink").onclick = function () { GAME.Combat.useBlinkSword(); };
        this.$("btn-companion-block").onclick = function () { GAME.Combat.companionBlock(); };
        this.$("btn-companion-smash").onclick = function () { GAME.Combat.companionSmash(); };
        this.$("btn-spell").onclick = function () { GAME.Combat.toggleSpells(); };
        this.$("btn-mercy-kill").onclick = function () { GAME.Core.chooseMercy(0); };
        this.$("btn-mercy-spare").onclick = function () { GAME.Core.chooseMercy(1); };

        // 玄机子多阶段按钮
        this.$("btn-mo-stage1").onclick = function () { GAME.MoEvent.actStage1(); };
        this.$("btn-mo-swallow-hard").onclick = function () { GAME.MoEvent.swallow(0); };
        this.$("btn-mo-swallow-bell").onclick = function () { GAME.MoEvent.swallow(1); };
        this.$("btn-mo-retry").onclick = function () { GAME.MoEvent.swallow(0); };

        // 面板页签切换按钮（7 个主页签）
        this.$("tab-map").onclick = function () { self.switchTab("map"); };
        this.$("tab-bag").onclick = function () { self.switchTab("bag"); };
        this.$("tab-market").onclick = function () { self.switchTab("market"); };
        this.$("tab-home").onclick = function () { self.switchTab("home"); };
        this.$("tab-codex").onclick = function () { self.switchTab("codex"); };
        // 图鉴分类切换
        (GAME.Codex ? GAME.Codex.KINDS : []).forEach(function (k) {
            var b = self.$("btn-codex-" + k.id);
            if (b) b.onclick = function () { self.codexKind = k.id; self.updateUI(); };
        });
        this.$("tab-fzone").onclick = function () { self.switchTab("dungeon"); };   // 副本/试炼
        this.$("tab-companion").onclick = function () { self.switchTab("companion"); };
        // 下沉页签入口（丹炉→洞府 / 门派 / 黑市→大地图 / 技能→图志）：顶级按钮已移除，绑定时做空值保护
        var bAlch = this.$("tab-alchemy"); if (bAlch) bAlch.onclick = function () { self.switchTab("alchemy"); };
        var bSect = this.$("tab-sect"); if (bSect) bSect.onclick = function () { self.switchTab("sect"); };
        var bBlack = this.$("tab-black"); if (bBlack) bBlack.onclick = function () { self.switchTab("black"); };
        var bSkill = this.$("tab-skill"); if (bSkill) bSkill.onclick = function () { self.switchTab("skill"); };
        // 新增子入口按钮：功能下沉后的可达路径（确保无死链）
        this.$("btn-home-alchemy").onclick = function () { self.switchTab("alchemy"); };
        this.$("btn-map-black").onclick = function () { self.switchTab("black"); };
        this.$("btn-codex-skill").onclick = function () { self.switchTab("skill"); };

        // 洞府快捷入口（门派 / 血月试炼 / 神识尾随）——大地图与副本入口已挪至下方页签区
        this.$("btn-sect").onclick = function () { self.switchTab("sect"); };
        this.$("btn-trial-step").onclick = function () { GAME.Trial.step(); };   // 旧档残留会话仍可走完
        this.$("btn-trial-abandon").onclick = function () { GAME.Trial.abandon(); };
        this.$("btn-track-escape").onclick = function () { GAME.BlackMarket.chooseTrack("escape"); };
        this.$("btn-track-fight").onclick = function () { GAME.BlackMarket.chooseTrack("fight"); };
        this.$("btn-track-pay").onclick = function () { GAME.BlackMarket.chooseTrack("pay"); };

        // 战后处置第三选项：火球术毁尸灭迹（无因果缠身）
        this.$("btn-mercy-burn").onclick = function () { GAME.Core.chooseMercy(2); };

        // 副本中枢（tab-fzone）：血月试炼 / 血色禁地 / 玄机世家主线 统一入口
        this.$("tab-fzone").onclick = function () { self.switchTab("dungeon"); };
        // 药田挑战按钮 btn-fz-fight0/1/2 由 renderFzone 动态生成并绑定
        this.$("btn-fz-rest").onclick = function () { GAME.FZone.rest(); };
        this.$("btn-fz-submit").onclick = function () { GAME.FZone.finish("submit"); };
        this.$("btn-fz-keep").onclick = function () { GAME.FZone.finish("keep"); };
        this.$("btn-fz-teleport").onclick = function () { GAME.FZone.teleport(); };
        this.$("btn-fz-abandon").onclick = function () { GAME.FZone.abandon(); };

        // 夜探墨府（景阳城·玄机世家主线子玩法）——房间搜检按钮 btn-ms-room0/1/2/3 由 renderMansion 动态绑定
        this.$("btn-ms-question").onclick = function () { GAME.Mansion.question(); };
        this.$("btn-ms-sneak").onclick = function () { GAME.Mansion.resolvePatrol("sneak"); };
        this.$("btn-ms-bribe").onclick = function () { GAME.Mansion.resolvePatrol("bribe"); };
        this.$("btn-ms-fight").onclick = function () { GAME.Mansion.resolvePatrol("fight"); };
        this.$("btn-ms-finish").onclick = function () { GAME.Mansion.finish(); };
        this.$("btn-ms-abandon").onclick = function () { GAME.Mansion.abandon(); };

        this.$("btn-save").onclick = function () {
            if (!self.started) { alert("尚未踏入修仙界，无可存之身。"); return; }
            self.doSave();
        };
        this.$("btn-manage").onclick = function () { self.doSaveManage(); };
        this.$("btn-restart").onclick = function () { self.doRestart(); };
        this.$("btn-zhuji").onclick = function () { self.startPresetZhuji(); };
        this.$("btn-save-close").onclick = function () { self.closeSaveModal(); };
        this.$("btn-zhuji-preset").onclick = function () { self.startPresetZhuji(); };
        this.$("btn-theme").onclick = function () { self.toggleTheme(); };

        // 铁奴·玄傀：激活与日常派遣
        this.$("btn-companion-activate").onclick = function () { GAME.Core.activateCompanion(); };
        this.$("btn-companion-weed").onclick = function () { GAME.Core.dispatchCompanion("weed"); };
        this.$("btn-companion-mine").onclick = function () { GAME.Core.dispatchCompanion("mine"); };
        var bChop = this.$("btn-companion-chop");
        if (bChop) bChop.onclick = function () { GAME.Core.dispatchCompanion("chop"); };
        var bOre = this.$("btn-companion-mineore");
        if (bOre) bOre.onclick = function () { GAME.Core.dispatchCompanion("mineore"); };

        // 岚州大地图：灵石兑市银
        this.$("btn-exchange-1").onclick = function () { GAME.Map.exchangeStone(1); };
        this.$("btn-exchange-5").onclick = function () { GAME.Map.exchangeStone(5); };

        // 苍南小会：擂台与保送拜山
        this.$("btn-leitai-next").onclick = function () { GAME.Tainan.nextRound(); };
        this.$("btn-shengxian-token").onclick = function () { GAME.Tainan.joinByToken(); };

        this.bindHoverDropdowns();   // 批量闭关 / 承露瓶催熟：hover 展开、移开收起
    },

    initLogs: function () {
        var p = GAME.State.p();
        var on = null;
        GAME.DATA.ORIGINS.forEach(function (o) { if (o.id === p.originId) on = o; });
        this.log("你以【" + (on ? on.name : "流浪散修") + "】之身踏入修仙界，天生四系杂灵根，资质低劣。", "system");
        this.log("提示：打坐半年只得 1 修为，百年苦修难出练气四层。欲破境筑基，唯有丹药、绿液与历练夺宝。", "system");
    },

    autoSave: function () { GAME.Storage.autoSave(); },

    // 批量闭关 / 承露瓶催熟：改为 hover 展开、移开收起（替代原生点击切换）
    bindHoverDropdowns: function () {
        var dds = document.querySelectorAll("details.dropdown");
        for (var i = 0; i < dds.length; i++) {
            (function (dd) {
                var hideTimer = null;
                // 阻止点击 summary 触发原生 toggle，避免与 hover 逻辑打架
                var sum = dd.querySelector("summary");
                if (sum) sum.addEventListener("click", function (e) { e.preventDefault(); });
                dd.addEventListener("mouseenter", function () {
                    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
                    dd.open = true;   // 展开
                });
                dd.addEventListener("mouseleave", function () {
                    if (hideTimer) clearTimeout(hideTimer);
                    hideTimer = setTimeout(function () { dd.open = false; }, 160);  // 移开略延迟再收起，防间隙闪烁
                });
                // 点击菜单内任一操作按钮后，菜单立即收起
                dd.addEventListener("click", function (e) {
                    var t = e.target;
                    if (t && t.classList && t.classList.contains("dd-item")) {
                        if (hideTimer) clearTimeout(hideTimer);
                        dd.open = false;
                    }
                });
            })(dds[i]);
        }
    },

    bindBatch: function () {
        var bind = function (id, fn) { var el = document.getElementById(id); if (el) el.onclick = fn; };
        if (!GAME.Core || !GAME.Core.meditateTimes) return;
        bind("btn-meditate-5", function () { GAME.Core.meditateTimes(5); });
        bind("btn-meditate-10", function () { GAME.Core.meditateTimes(10); });
        bind("btn-meditate-full", function () { GAME.Core.meditateTimes("full"); });
    },
};

/* ================= 入口 ================= */
(function () {
    try {
        GAME.UI.bindEvents();
        GAME.UI.bindBatch();            // 批量闭关（连修 5/10/至圆满）
        GAME.UI.initTheme();            // 先还原配色偏好，避免首屏闪烁
        GAME.State.createNewPlayer();   // 先建默认角色，供日志/合并模板兜底
        if (GAME.Storage.hasSave()) {
            // 有存档：刷新即自动续档，不用玩家手动点【读取存档】
            GAME.UI.doLoad();
            if (!GAME.UI.started) {     // 极端：读档失败(版本不符/损坏)→回退出身选择
                GAME.UI.renderOrigin();
            }
        } else {
            GAME.UI.renderOrigin();     // 无存档：显示出身选择开局
        }
    } catch (e) {
        // 白屏兜底：任何初始化异常都在页面上给出可见提示
        console.error("初始化失败", e);
        try {
            document.getElementById("log-box").innerHTML =
                '<div class="log-entry log-danger">[初始化异常] ' + e.message + '，请刷新页面或清空存档。</div>';
        } catch (e2) {}
    }
})();
