'use strict';
/* =========================================================
 * test/smoke_log_merge.js —— 见闻录同类日志合并（UI.log 第三参 fold.merge）
 * 背景：绿液催熟 / 药圃采收等会在短时间内连刷数条「得【X】×N」，刷屏。
 *   UI.log 新增 merge 键：同 data-merge + 同 type 的相邻条目（6 条窗口内）
 *   合并数量到一条，避免刷屏。本测试用迷你 DOM 桩钉住该行为，改 ui.js 时
 *   不会静默劣化。
 * 覆盖：
 *   ① 同类合并数量累加改写同一节点（×3 + ×3 + ×3 → ×9）
 *   ② 不同合并键插入 → 不跨批合并（各成一条）
 *   ③ 同键不同 type → 不合并（loot / success 样式不同）
 *   ④ 数量现算：×2 + ×5 → ×7
 *   ⑤ 合并后节点仍带 data-merge，且挪到末尾（时序不错乱）
 * 运行： node test/smoke_log_merge.js
 * ========================================================= */

var fs = require('fs'), path = require('path'), vm = require('vm');
var BASE = path.resolve(__dirname, '..');

/* ---------- 迷你 DOM（与 smoke_log_fold.js 同构） ---------- */
function El(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.attrs = {};
    this.style = {};
    this.parentNode = null;
    this._cls = {};
    this._html = '';
    this.innerText = '';
    this.disabled = false;
    this.title = '';
    this._scrollTop = 0;
    var self = this;
    this.classList = {
        add: function (c) { self._cls[c] = true; },
        remove: function (c) { delete self._cls[c]; },
        toggle: function (c, on) {
            if (on === undefined) on = !self._cls[c];
            if (on) self._cls[c] = true; else delete self._cls[c];
            return on;
        },
        contains: function (c) { return !!self._cls[c]; }
    };
}
Object.defineProperties(El.prototype, {
    className: {
        get: function () { return Object.keys(this._cls).join(' '); },
        set: function (v) {
            this._cls = {};
            String(v).split(/\s+/).forEach(function (c) { if (c) this._cls[c] = true; }, this);
        }
    },
    innerHTML: {
        get: function () { return this._html; },
        set: function (v) { this._html = String(v); this.children = []; }
    },
    firstChild: { get: function () { return this.children[0] || null; } },
    lastChild: { get: function () { return this.children[this.children.length - 1] || null; } },
    lastElementChild: { get: function () { return this.children[this.children.length - 1] || null; } },
    childElementCount: { get: function () { return this.children.length; } },
    scrollHeight: { get: function () { return 1000; } },
    clientHeight: { get: function () { return 100; } },
    scrollTop: {
        get: function () { return this._scrollTop; },
        set: function (v) { this._scrollTop = v; }
    }
});
El.prototype.appendChild = function (el) {
    if (el.parentNode) {
        var i = el.parentNode.children.indexOf(el);
        if (i >= 0) el.parentNode.children.splice(i, 1);
    }
    this.children.push(el);
    el.parentNode = this;
    return el;
};
El.prototype.removeChild = function (el) {
    var i = this.children.indexOf(el);
    if (i < 0) throw new Error('removeChild: 不是我的子节点');
    this.children.splice(i, 1);
    el.parentNode = null;
    return el;
};
El.prototype.setAttribute = function (k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return (k in this.attrs) ? this.attrs[k] : null; };
El.prototype.removeAttribute = function (k) { delete this.attrs[k]; };
El.prototype.addEventListener = function () {};
El.prototype.querySelector = function (sel) {
    var cls = String(sel).replace(/^\./, '');
    function walk(node) {
        for (var i = 0; i < node.children.length; i++) {
            var c = node.children[i];
            if (c._cls[cls]) return c;
            var r = walk(c);
            if (r) return r;
        }
        return null;
    }
    return walk(this);
};
El.prototype.querySelectorAll = function () { return []; };

var byId = {};
var documentStub = {
    body: new El('body'),
    getElementById: function (id) {
        if (!byId[id]) { byId[id] = new El('div'); byId[id].id = id; }
        return byId[id];
    },
    createElement: function (t) { return new El(t); },
    querySelectorAll: function () { return []; },
    addEventListener: function () {}
};

var rafQ = [];
var store = {};
var sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.document = documentStub;
sandbox.localStorage = {
    getItem: function (k) { return (k in store) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); },
    removeItem: function (k) { delete store[k]; }
};
sandbox.requestAnimationFrame = function (fn) { rafQ.push(fn); return rafQ.length; };
sandbox.addEventListener = function () {};
sandbox.GAME = {
    Storage: { hasSave: function () { return false; }, load: function () { return false; } }
};
vm.createContext(sandbox);

['data/realms.js', 'data/items.js', 'data/world.js', 'js/state.js', 'js/ui.js'].forEach(function (f) {
    vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
});
var G = sandbox.GAME;

var pass = 0, fail = 0;
function ok(name, cond) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; console.log('  ✗ FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

var box = documentStub.getElementById('log-box');
function entries() { return box.children.slice(); }
function mergeEntries(key) { return entries().filter(function (e) { return e.getAttribute('data-merge') === key; }); }
function msgOf(e) { var m = e.querySelector('.log-msg'); return m ? m.innerText : ''; }
function clearLog() { box.innerHTML = ''; }

var p = G.State.createNewPlayer('j');
p.realmIndex = 13;
p.ageYears = 100; p.ageMonths = 0;

/* ================= ① 同类合并数量累加 ================= */
section('① 同类合并数量累加：×3 + ×3 + ×3 → ×9');
clearLog();
G.UI.log('你滴一滴绿液于灵木幼苗根部——得【百年灵木】×3。', 'loot', { merge: 'herb_bainian', qty: 3 });
G.UI.log('你滴一滴绿液于灵木幼苗根部——得【百年灵木】×3。', 'loot', { merge: 'herb_bainian', qty: 3 });
G.UI.log('你滴一滴绿液于灵木幼苗根部——得【百年灵木】×3。', 'loot', { merge: 'herb_bainian', qty: 3 });
ok('3 条同类只留 1 个节点', mergeEntries('herb_bainian').length === 1 && entries().length === 1);
ok('数量累加为 ×9', /×\s*9\b/.test(msgOf(entries()[0])));
ok('合并节点带 data-merge', entries()[0].getAttribute('data-merge') === 'herb_bainian');
ok('合并节点位于末尾（时序）', entries()[entries().length - 1] === mergeEntries('herb_bainian')[0]);

/* ================= ② 不同合并键插入 → 不跨批合并 ================= */
section('② 不同合并键插入打断：不跨批合并');
clearLog();
G.UI.log('得【百年灵木】×3。', 'loot', { merge: 'herb_bainian', qty: 3 });
G.UI.log('收获【恶臭草】×2。', 'success', { merge: 'garden_ecao', qty: 2 });
G.UI.log('得【百年灵木】×3。', 'loot', { merge: 'herb_bainian', qty: 3 });
ok('herb_bainian 仍是 2 条（被 garden_ecao 隔开）', mergeEntries('herb_bainian').length === 2);
ok('每条 herb_bainian 仍是 ×3', mergeEntries('herb_bainian').every(function (e) { return /×\s*3\b/.test(msgOf(e)); }));
ok('garden_ecao 单独 1 条 ×2', mergeEntries('garden_ecao').length === 1 && /×\s*2\b/.test(msgOf(mergeEntries('garden_ecao')[0])));

/* ================= ③ 同键不同 type → 不合并 ================= */
section('③ 同 key 不同 type（loot / success）→ 不合并');
clearLog();
G.UI.log('得【百年灵木】×3。', 'loot', { merge: 'herb_bainian', qty: 3 });
G.UI.log('得【百年灵木】×3。', 'success', { merge: 'herb_bainian', qty: 3 });
ok('loot 与 success 不并成一条（共 2 条）', entries().length === 2);
ok('两条各自 ×3', entries().every(function (e) { return /×\s*3\b/.test(msgOf(e)); }));

/* ================= ④ 数量现算：×2 + ×5 → ×7 ================= */
section('④ 数量现算：×2 + ×5 → ×7');
clearLog();
G.UI.log('得【灵草】×2。', 'loot', { merge: 'm_herb', qty: 2 });
G.UI.log('得【灵草】×5。', 'loot', { merge: 'm_herb', qty: 5 });
ok('合并为 1 条', mergeEntries('m_herb').length === 1);
ok('数量累加为 ×7', /×\s*7\b/.test(msgOf(entries()[0])));

/* ================= ⑤ 合并后挪到末尾 + data-merge 保留 ================= */
section('⑤ 合并后节点挪到末尾且 data-merge 保留');
clearLog();
G.UI.log('杂项一条普通日志', 'info');
G.UI.log('得【百年灵木】×3。', 'loot', { merge: 'herb_bainian', qty: 3 });
G.UI.log('得【百年灵木】×3。', 'loot', { merge: 'herb_bainian', qty: 3 });
ok('合并节点是最后一条', entries()[entries().length - 1] === mergeEntries('herb_bainian')[0]);
ok('末尾节点 data-merge === herb_bainian', entries()[entries().length - 1].getAttribute('data-merge') === 'herb_bainian');

console.log('\n==========================================');
console.log('smoke_log_merge：PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
