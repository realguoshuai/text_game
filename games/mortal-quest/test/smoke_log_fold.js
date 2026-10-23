'use strict';
/* =========================================================
 * test/smoke_log_fold.js —— 见闻录日志折叠（UI.log 第三参 fold）
 * 背景：连续打坐曾把「绿液凝结」等剧情瞬间顶出视野（用户实测反馈）。
 *   DOM 层行为原先只有浏览器实测覆盖，本测试用迷你 DOM 桩把 UI.log 的
 *   折叠/裁剪/时序行为钉进 node 回归，改 ui.js 时不会静默劣化。
 * 覆盖：
 *   ① 同键连续日志累加改写同一节点（累月份/修为/心境，轮数 +1）
 *   ② 中间插系统日志不打断折叠（黑市换货、剧情瞬间burst 是常态）
 *   ③ 跨度超过 FOLD_SCAN → 重新开一条（不把隔了整段经历的两次打坐并成一条）
 *   ④ 隔着别种折叠键 → 不跨批合并
 *   ⑤ 不带 fold 的日志照常新开（疗伤档等）
 *   ⑥ 合并后节点挪到末尾（时间顺序不错乱）
 *   ⑦ MAX_LOG 裁剪删最旧
 *   ⑧ 吸底只在玩家本就在底部时抢滚动（rAF 队列可观察）
 * 运行： node test/smoke_log_fold.js
 * ========================================================= */

var fs = require('fs'), path = require('path'), vm = require('vm');
var BASE = path.resolve(__dirname, '..');

/* ---------- 迷你 DOM ---------- */
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
    // className 赋值要同步进 _cls，否则 querySelector('.log-msg') 找不到节点
    //（ui.js 用 className = "log-msg" 而不是 classList.add）
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
    // 存档桩：让 ui.js 入口 IIFE 走「无存档 → renderOrigin」分支而不炸
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
function foldEntries() { return entries().filter(function (e) { return e.getAttribute('data-fold') === 'meditate'; }); }
function msgOf(e) { var m = e.querySelector('.log-msg'); return m ? m.innerText : ''; }
function flushRaf() { var q = rafQ.slice(); rafQ.length = 0; q.forEach(function (fn) { fn(); }); }
function clearLog() { box.innerHTML = ''; }

var p = G.State.createNewPlayer('j');
p.realmIndex = 13;
p.ageYears = 100; p.ageMonths = 0;

var FOLD_MED = { fold: 'meditate', months: 8, exp: 1, mind: 2 };

/* ================= ① 同键累加 ================= */
section('① 同键连续日志累加改写同一节点');
clearLog();
G.UI.log('你闭关苦修 8 个月——修为 +1，心境 +2。', 'info', FOLD_MED);
G.UI.log('你闭关苦修 8 个月——修为 +1，心境 +2。', 'info', FOLD_MED);
G.UI.log('你闭关苦修 8 个月——修为 +1，心境 +2。', 'info', FOLD_MED);
ok('3 条同键只留 1 个节点', foldEntries().length === 1 && entries().length === 1);
var acc = foldEntries()[0]._foldAcc;
ok('轮数累加到 3', !!acc && acc.n === 3);
ok('月份累加 24（现算：3×8）', !!acc && acc.months === 3 * FOLD_MED.months);
ok('修为累加 3（现算：3×1）', !!acc && acc.exp === 3 * FOLD_MED.exp);
ok('心境累加 6（现算：3×2）', !!acc && acc.mind === 3 * FOLD_MED.mind);
ok('节点文本含「累计 3 轮 · 24 个月」', /累计 3 轮 · 24 个月/.test(msgOf(foldEntries()[0])));
ok('节点文本含修为 +3 与心境 +6', /修为 \+3/.test(msgOf(foldEntries()[0])) && /心境 \+6/.test(msgOf(foldEntries()[0])));

/* ================= ② 中间插系统日志不打断 ================= */
section('② 中间插系统日志不打断折叠');
clearLog();
G.UI.log('你闭关苦修 8 个月——修为 +1。', 'info', FOLD_MED);
// 真实间隔：一次闭关里世界刷出的日志（黑市/坊市换货 + 「第一滴绿液」剧情瞬间）
['地下黑市换了一批门路。', '坊市又换了一批新货。', '坊市旧货摊又上了一批新货。',
 '月华流转，承露瓶悄然凝聚出一滴绿液。', '✦ 第一滴绿液 ✦', '瓶底凝出的一点碧色。',
 '【道碑铭记】初窥门径——首次突破境界。', '又一条无关日志。'
].forEach(function (m) { G.UI.log(m, 'system'); });
G.UI.log('你闭关苦修 8 个月——修为 +1。', 'info', FOLD_MED);
ok('插了 8 条系统日志后仍合并成 1 条', foldEntries().length === 1);
ok('合并后轮数为 2', foldEntries()[0]._foldAcc.n === 2);

/* ================= ③ 跨度超限重开 ================= */
section('③ 跨度超过 FOLD_SCAN → 重新开一条');
clearLog();
G.UI.log('你闭关苦修 8 个月——修为 +1。', 'info', FOLD_MED);
var noise = G.UI.FOLD_SCAN + 2;   // 现算：比窗口多两条，确保越界
for (var i = 0; i < noise; i++) G.UI.log('噪声' + i, 'system');
G.UI.log('你闭关苦修 8 个月——修为 +1。', 'info', FOLD_MED);
ok('插了 ' + noise + ' 条（> FOLD_SCAN=' + G.UI.FOLD_SCAN + '）后新开一条', foldEntries().length === 2);
ok('新的一条从 1 轮起计', foldEntries()[1]._foldAcc.n === 1);

/* ================= ④ 别种折叠键不跨批 ================= */
section('④ 隔着别种折叠键 → 不跨批合并');
clearLog();
G.UI.log('你闭关苦修 8 个月——修为 +1。', 'info', FOLD_MED);
G.UI.log('（另一种折叠键）', 'info', { fold: 'other', months: 1 });
G.UI.log('你闭关苦修 8 个月——修为 +1。', 'info', FOLD_MED);
ok(' meditate 键各自成条（不跨批）', foldEntries().length === 2);
ok('另一种折叠键独立成条', entries().filter(function (e) { return e.getAttribute('data-fold') === 'other'; }).length === 1);

/* ================= ⑤ 不带 fold 照常新开 ================= */
section('⑤ 不带 fold 的日志照常新开（疗伤档等）');
clearLog();
G.UI.log('你静坐调息 8 个月，气血尽复，重伤已愈。', 'success');
G.UI.log('你静坐调息 8 个月，气血尽复，重伤已愈。', 'success');
ok('两条疗伤日志不折叠', entries().length === 2 && foldEntries().length === 0);
ok('疗伤日志无 data-fold 属性', entries().every(function (e) { return e.getAttribute('data-fold') === null; }));

/* ================= ⑥ 合并后挪到末尾 ================= */
section('⑥ 合并后节点挪到末尾（时序）');
clearLog();
G.UI.log('你闭关苦修 8 个月——修为 +1。', 'info', FOLD_MED);
G.UI.log('系统噪声一条。', 'system');
G.UI.log('你闭关苦修 8 个月——修为 +1。', 'info', FOLD_MED);
ok('合并条目位于容器末尾', entries()[entries().length - 1].getAttribute('data-fold') === 'meditate');
ok('合并条目的时间戳是最新的', entries()[entries().length - 1].querySelector('.log-time').innerText.indexOf('100岁0月') >= 0);

/* ================= ⑦ MAX_LOG 裁剪 ================= */
section('⑦ MAX_LOG 裁剪删最旧');
clearLog();
for (var j = 0; j < G.UI.MAX_LOG + 10; j++) G.UI.log('第' + j + '条', 'system');
ok('条数封顶在 MAX_LOG=' + G.UI.MAX_LOG, entries().length === G.UI.MAX_LOG);
ok('最旧的已被裁掉（首条是第 10 条）', /第10条/.test(msgOf(entries()[0])));
ok('最新一条在末尾', new RegExp('第' + (G.UI.MAX_LOG + 9) + '条').test(msgOf(entries()[entries().length - 1])));

/* ================= ⑧ 吸底条件 ================= */
section('⑧ 吸底只在玩家本就在底部时抢滚动');
clearLog();
box.scrollTop = 0;                       // 玩家翻旧账：不在底部
rafQ.length = 0;
G.UI.log('顶部新日志。', 'system');
ok('不在底部时不排吸底', rafQ.length === 0);
box.scrollTop = 950;                     // 本来就在底部
rafQ.length = 0;
G.UI.log('底部新日志。', 'system');
ok('在底部时排一帧吸底', rafQ.length === 1);
flushRaf();
ok('吸底执行后 scrollTop 被拉到 scrollHeight', box.scrollTop === box.scrollHeight);

console.log('\n==========================================');
console.log('smoke_log_fold：PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
