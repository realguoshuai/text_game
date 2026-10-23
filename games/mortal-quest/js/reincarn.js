/* =====================================================================
 * js/reincarn.js —— 轮回道韵（局外肉鸽成长 · Roguelite 继承）
 * ---------------------------------------------------------------------
 * 坐化 / 兵解重入轮回时，按本世成绩结算【轮回道韵】，存 localStorage
 * 独立键（跨周目、跨存档槽保留，与轮回石存档互不污染）。
 * 开局「投胎转世 · 择一身世」页可消耗道韵勾选遗泽词条（可多选），
 * 领取后扣除道韵并写入当世玩家状态（随存档走，不入局外账本）。
 * 结算防重：p._daoyunSettled 标记，一世只结一次（坐化后再点重开不重算）。
 * ===================================================================== */
(function () {
    var Reincarn = {
        KEY: "mortal_quest_daoyun_v1",
        lastResult: null,   // 最近一次结算 { gained, total, why }，供道碑面板展示

        // 遗泽词条：cost 为道韵点数；desc 文案与 startGame 中的实际效果一一对应
        BOONS: [
            { id: "baocang", name: "前世藏宝", cost: 20,
              desc: "开局灵石 +80，袋中另有一件前世留下的护身法器。" },
            { id: "canyun", name: "掌天残韵", cost: 15,
              desc: "开局掌天瓶自带 2 滴承露绿液。" },
            { id: "suhui", name: "神识宿慧", cost: 25,
              desc: "初始神识 +15，且自带《中品敛气术》一层。" },
            { id: "xisui", name: "洗髓易筋", cost: 40,
              desc: "伪灵根提纯：打坐与丹药吸收效率 ×1.5，心境 +3。" }
        ],

        load: function () {
            try {
                var raw = localStorage.getItem(this.KEY);
                var d = raw ? JSON.parse(raw) : null;
                if (!d || typeof d.daoyun !== "number" || !isFinite(d.daoyun)) d = { daoyun: 0 };
                return d;
            } catch (e) { return { daoyun: 0 }; }
        },
        save: function (d) {
            try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) { /* 隐私模式等：道韵只活在本局 */ }
        },

        /* ---------- 结算：境界×3 + 每10岁+1 + 每5杀+1 + 图鉴每10条+1 ---------- */
        settle: function (p, why) {
            if (!p || p._daoyunSettled) return null;
            p._daoyunSettled = true;
            var st = p.stats || {};
            var codexCount = 0, c = p.codex;
            if (c) {
                ["items", "monsters", "spells", "lore"].forEach(function (k) {
                    if (c[k]) codexCount += Object.keys(c[k]).length;
                });
            }
            var gained = (p.realmIndex || 0) * 3 +
                Math.floor(Math.max(0, (p.ageYears || 16) - 16) / 10) +
                Math.floor((st.kills || 0) / 5) +
                Math.floor(codexCount / 10);
            var d = this.load();
            d.daoyun += gained;
            this.save(d);
            this.lastResult = { gained: gained, total: d.daoyun, why: why || "坐化" };
            return this.lastResult;
        },

        boonActive: function (p, id) { return !!(p && p.boons && p.boons[id]); },

        // 丹药吸收倍率：洗髓易筋 ×1.5（与丹毒渐抗相乘，先毒后髓）
        pillMult: function (p) { return this.boonActive(p, "xisui") ? 1.5 : 1; },

        /* ---------- 开局领取：扣道韵 + 写入当世。返回日志行数组 ---------- */
        applySelected: function (p, sel) {
            var self = this;
            var lines = [];
            if (!sel) return lines;
            var d = this.load();
            var total = 0;
            this.BOONS.forEach(function (b) { if (sel[b.id]) total += b.cost; });
            if (total > d.daoyun) return lines;   // 余额不足（正常交互下到不了这里）
            d.daoyun -= total;
            this.save(d);
            p.boons = {};
            this.BOONS.forEach(function (b) {
                if (!sel[b.id]) return;
                p.boons[b.id] = true;
                lines.push("【遗泽·" + b.name + "】" + b.desc + "（−" + b.cost + " 道韵）");
            });
            if (sel.baocang) {
                p.spiritStones += 80;
                var tal = ["talisman_hushen", "talisman_jingang", "talisman_huoqiu"];
                var pick = tal[Math.floor(Math.random() * tal.length)];
                if (GAME.State.addItem) GAME.State.addItem(pick, 1);
                lines.push("　　贴身暗袋里多了【" + GAME.DATA.ITEMS[pick].name + "】×1，以及灵石 +80。");
            }
            if (sel.canyun) p.liquid = (p.liquid || 0) + 2;
            if (sel.suhui) { p.spiritBonus = (p.spiritBonus || 0) + 15; p.concealLevel = (p.concealLevel || 0) + 1; }
            if (sel.xisui) { p.trueRoot = true; p.mind = (p.mind || 0) + 3; }
            return lines;
        }
    };
    GAME.Reincarn = Reincarn;
})();
