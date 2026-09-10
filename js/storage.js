/* =========================================================
 * js/storage.js —— 存档层（localStorage）
 * 多档位（slot 0~N-1）+ 激活档跟踪 + 自动续档。
 * 全流程 try-catch：JSON 损坏、字段缺失、超版本号一律回退，
 * 新开局保证绝不白屏。
 *
 * 设计要点：
 *  - 对外暴露两类接口：
 *      · 档位接口 saveToSlot/loadFromSlot/clearSlot/listSlots/hasSlot（精确控制某档）
 *      · 激活档快捷接口 save/load/clear/hasSave（兼容旧代码与 smoke3_storage 既有断言）
 *  - 激活档 = 最近一次存档/读档所在的档位；启动时据此自动续档。
 *  - 战斗/事件中间态不入档，读档必是干净局面。
 * ========================================================= */

var GAME = window.GAME = window.GAME || {};

GAME.Storage = {

    SLOT_COUNT: 6,                       // 轮回石档位数量
    SAVE_PREFIX: "immortal_game_save_v1_",
    META_KEY: "immortal_game_slots_meta_v1",
    ACTIVE_KEY: "immortal_game_active_slot_v1",
    VERSION: 1,
    AUTO_SAVE: true,   // 自动存档开关

    // —— 档位键 / 激活档 ——
    slotKey: function (i) { return this.SAVE_PREFIX + i; },

    getActiveSlot: function () {
        try {
            var v = window.localStorage.getItem(this.ACTIVE_KEY);
            var n = (v == null) ? 0 : parseInt(v, 10);
            if (isNaN(n) || n < 0 || n >= this.SLOT_COUNT) n = 0;
            return n;
        } catch (e) { return 0; }
    },
    setActiveSlot: function (i) {
        try { window.localStorage.setItem(this.ACTIVE_KEY, String(i)); } catch (e) {}
    },

    // —— 读某档位原始数据（版本不符/损坏返回 null） ——
    readSlotRaw: function (i) {
        try {
            var raw = window.localStorage.getItem(this.slotKey(i));
            if (!raw) return null;
            var data = JSON.parse(raw);
            if (!data || data._v !== this.VERSION) return null;
            return data;
        } catch (e) { return null; }
    },

    hasSlot: function (i) {
        try { return !!window.localStorage.getItem(this.slotKey(i)); } catch (e) { return false; }
    },

    // —— 列出全部档位（含空档）：[{ slot, name, realm, realmIndex, ts }] ——
    listSlots: function () {
        var out = [];
        for (var i = 0; i < this.SLOT_COUNT; i++) {
            var data = this.readSlotRaw(i);
            if (data) {
                var realm = (GAME.DATA && GAME.DATA.REALMS && GAME.DATA.REALMS[data.realmIndex]) || { name: "未知" };
                out.push({
                    slot: i,
                    name: data.saveName || ("第 " + (i + 1) + " 号轮回石"),
                    realm: realm.name,
                    realmIndex: data.realmIndex,
                    ts: data.saveTs || 0,
                });
            } else {
                out.push({ slot: i, name: null, realm: null, realmIndex: null, ts: 0 });
            }
        }
        return out;
    },

    // —— 存：战斗/事件中间态不入档，读档必是干净局面 ——
    saveToSlot: function (i, name, silent) {
        try {
            var p = GAME.State.p();
            var snapshot = JSON.parse(JSON.stringify(p));
            snapshot.combat = null;
            snapshot.pendingEvent = null;
            snapshot.pendingMercy = null;
            snapshot._v = this.VERSION;
            snapshot.saveName = name || ("第 " + (i + 1) + " 号轮回石");
            snapshot.saveTs = Date.now();
            window.localStorage.setItem(this.slotKey(i), JSON.stringify(snapshot));
            this.setActiveSlot(i);
            if (!silent) GAME.UI.log("轮回石微微发烫——此生轨迹已铭刻于第 " + (i + 1) + " 号。", "system");
            return true;
        } catch (e) {
            console.error("存档失败", e);
            if (!silent) GAME.UI.log("存档失败：轮回石似乎受了损伤。", "danger");
            return false;
        }
    },

    // 激活档快捷存（兼容旧接口 / 自动存档 / smoke3_storage）
    save: function (silent) { return this.saveToSlot(this.getActiveSlot(), null, silent); },

    autoSave: function () { if (this.AUTO_SAVE) this.save(true); },

    // —— 读：带版本校验 + 字段兜底合并 ——
    loadFromSlot: function (i) {
        try {
            var data = this.readSlotRaw(i);
            if (!data) { GAME.UI.log("该轮回石一片空白，尚无前世记忆。", "system"); return false; }
            // 以新角色为模板合并，补齐缺失字段，防旧档缺字段崩 UI
            var fresh = GAME.State.createNewPlayer();
            var merged = {};
            for (var k in fresh) merged[k] = (data[k] !== undefined) ? data[k] : fresh[k];
            merged.combat = null;
            merged.pendingEvent = null;
            merged.pendingMercy = null;
            merged.isDead = !!merged.isDead;
            if (!merged.stats) merged.stats = fresh.stats;
            if (!merged.achievements) merged.achievements = [];
            // 旧存档升轨：补齐 clock / equipment / mp / stamina，并把旧根字段并入 equipment
            merged = this.migratePlayerState(merged);
            GAME.State.player = merged;
            this.setActiveSlot(i);
            GAME.UI.log("轮回石光芒一闪——第 " + (i + 1) + " 号前世记忆涌入识海，你从洞府中醒来。", "success");
            return true;
        } catch (e) {
            console.error("读档失败", e);
            GAME.State.createNewPlayer();
            GAME.UI.log("存档残破无法读取，已为你重开一局。", "danger");
            return false;
        }
    },

    // 激活档快捷读（兼容旧接口 / smoke3_storage）
    load: function () { return this.loadFromSlot(this.getActiveSlot()); },

    hasSave: function () { return this.hasSlot(this.getActiveSlot()); },

    // —— 删档重开：清掉指定档位（不动内存中的当前角色，除非就是激活档） ——
    clearSlot: function (i) {
        try { window.localStorage.removeItem(this.slotKey(i)); } catch (e) {}
        if (this.getActiveSlot() === i) this.setActiveSlot(0);
        GAME.UI.log("第 " + (i + 1) + " 号轮回石轰然碎裂，旧忆湮灭。", "system");
    },

    // 激活档快捷删（兼容旧接口 / smoke3_storage / doRestart）
    clear: function () {
        var i = this.getActiveSlot();
        try { window.localStorage.removeItem(this.slotKey(i)); } catch (e) {}
        this.setActiveSlot(0);
        GAME.State.createNewPlayer();
    },

    // —— 旧存档升轨：把重构前的扁平字段收束进新规范存储（clock / equipment / mp / stamina） ——
    // 设计要点：只读旧字段、不删除任何旧键；升级后通过 applyCompatShims 让老代码零改动可用。
    migratePlayerState: function (p) {
        if (!p || typeof p !== "object") return p;
        // 1) 时间微观粒度：ageYears/ageMonths → clock（二者恒同步，可幂等重建）
        p.clock = p.clock || {};
        p.clock.year = (typeof p.ageYears === "number") ? p.ageYears : (p.clock.year != null ? p.clock.year : 16);
        p.clock.month = (typeof p.ageMonths === "number") ? p.ageMonths : (p.clock.month != null ? p.clock.month : 0);
        if (p.clock.dailyCircles == null) p.clock.dailyCircles = 0;
        // 2) 装备解耦：旧根字段 → equipment 对象（仅当 equipment 全空且旧字段有值时搬运）
        if (!p.equipment) p.equipment = { mainWeapon:null, subWeapon:null, armor:null, artifact:null };
        var eq = p.equipment;
        var hasAnyOld = !!(p.artifact || p.artifact2 || p.armor || p.darkWeapon);
        if (!eq.mainWeapon && !eq.subWeapon && !eq.armor && !eq.artifact && hasAnyOld) {
            eq.mainWeapon = p.artifact  || null;   // 主法器
            eq.subWeapon  = p.darkWeapon || null;  // 暗器
            eq.armor      = p.armor || null;       // 防具
            eq.artifact   = p.artifact2 || null;   // 副法器（需《控物术》）
        }
        // 3) 新基础字段兜底注入（旧存档缺失时给默认值）
        if (p.mp == null) { p.mp = 20; p.maxMp = 20; }
        if (p.stamina == null) { p.stamina = 100; p.maxStamina = 100; }
        // 4) 兼容读写层：让 ageYears/stone/artifact 等旧名继续可用
        if (GAME.State && GAME.State.applyCompatShims) GAME.State.applyCompatShims(p);
        return p;
    },
};
