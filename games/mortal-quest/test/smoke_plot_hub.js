'use strict';
/* =========================================================
 * test/smoke_plot_hub.js —— 盘缠灵石兜底 + 药圃状态条可点 + 催熟菜单用途说明 回归
 *
 * 锁死本轮三项：
 *   ① 银两 0 / 灵石 222 时，四通八达的「动身」必须可点，文案写明「可耗 1 灵石抵扣」，
 *      点击走通并扣掉 1 枚灵石（不再被困死在景阳城）
 *   ② 左上角药圃状态条可点：切到「修行 → 洞府」、展开 plot-box、滚进视野；
 *      右侧补灵田等阶与存药，空垄时给「点击打理药圃 ›」
 *   ③ 灵液催熟菜单每项都有用途副标题（灵木 → 傀儡骨架主材）与「现有 N」
 * 运行： node test/smoke_plot_hub.js
 * ========================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
    if (cond) { pass++; console.log('  \u2713 ' + name); }
    else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

// ---------- 假 DOM ----------
const scrolled = [];
function El(id, tag) {
    this.id = id; this.tagName = (tag || 'div').toUpperCase();
    this.style = {}; this.children = []; this._html = ''; this._text = ''; this._cls = '';
    this._attrs = {};
    this.classList = {
        _s: {},
        add(c) { this._s[c] = 1; }, remove(c) { delete this._s[c]; },
        toggle(c, on) { if (on) this._s[c] = 1; else delete this._s[c]; },
        contains(c) { return !!this._s[c]; }
    };
    this.dataset = {}; this.disabled = false; this.hidden = false; this.open = false;
    this.onclick = null; this.firstChild = null; this.lastChild = null;
}
El.prototype.appendChild = function (c) { this.children.push(c); this.firstChild = this.children[0]; this.lastChild = this.children[this.children.length - 1]; return c; };
El.prototype.removeChild = function () {};
El.prototype.addEventListener = function () {};
El.prototype.setAttribute = function (k, v) { this._attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return (k in this._attrs) ? this._attrs[k] : null; };
El.prototype.removeAttribute = function (k) { delete this._attrs[k]; };
El.prototype.hasAttribute = function (k) { return k in this._attrs; };
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.getElementsByTagName = function () { return []; };
El.prototype.remove = function () {};
El.prototype.contains = function () { return false; };
El.prototype.focus = function () {};
El.prototype.scrollIntoView = function (opt) { scrolled.push({ el: this, opt: opt }); };
Object.defineProperty(El.prototype, 'className', { get() { return this._cls; }, set(v) { this._cls = String(v); } });
Object.defineProperty(El.prototype, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = String(v); this.children = []; this.firstChild = null; this.lastChild = null; }
});
Object.defineProperty(El.prototype, 'innerText', { get() { return this._text; }, set(v) { this._text = String(v); } });
Object.defineProperty(El.prototype, 'textContent', { get() { return this._text; }, set(v) { this._text = String(v); } });
Object.defineProperty(El.prototype, 'childElementCount', { get() { return this.children.length; } });

const els = {};
const errors = [];
const sandbox = {};
sandbox.window = sandbox;
sandbox.console = { log: () => {}, warn: () => {}, error: (...a) => { errors.push(a.join(' ')); } };
sandbox.confirm = () => true; sandbox.alert = () => {};
sandbox.setTimeout = () => 0; sandbox.clearTimeout = () => {};
sandbox.setInterval = () => 0; sandbox.clearInterval = () => {};
sandbox.requestAnimationFrame = () => 0;
sandbox.Math = Object.assign(Object.create(Math), { random: () => 0.99 });   // 关掉路遇事件，免随机打架
sandbox.document = {
    getElementById: (id) => els[id] || (els[id] = new El(id)),
    createElement: (t) => new El(null, t),
    querySelector: (sel) => {
        const m = /\[data-node="([^"]+)"\]/.exec(sel || '');
        if (!m) return null;
        const box = /map-routes/.test(sel) ? els['map-routes'] : els['map-atlas'];
        if (box) for (const row of box.children) if (row.getAttribute('data-node') === m[1]) return row;
        return null;
    },
    querySelectorAll: () => [],
    addEventListener: () => {},
    body: new El('body'),
    documentElement: new El('html')
};
const store = {};
sandbox.localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
};
vm.createContext(sandbox);
const html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf8');
const FILES = (html.match(/<script src="([^"]+)"/g) || []).map(s => s.replace(/<script src="|"/g, ''));
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;
const U = G.UI;

U.started = true;
G.State.createNewPlayer();
const P = () => G.State.p();
const T = (id) => (els[id] ? els[id].innerText : null);
const logs = [];
const _log = U.log;
U.log = function (msg, type) { logs.push({ msg: String(msg), type: type }); return _log.apply(U, arguments); };
const lastLog = () => (logs.length ? logs[logs.length - 1] : {});

// 找四通八达里通往某地的第一行
function routeRow(nodeId) {
    const box = els['map-routes'];
    if (!box) return null;
    for (const row of box.children) if (row.getAttribute('data-node') === nodeId) return row;
    return null;
}

// ---------- ① payPlan：盘缠折抵 ----------
section('① 盘缠：银两不足则一枚灵石补足整程');
let pay = G.Map.payPlan({ silver: 0, spiritStones: 222 }, 60);
ok('银两 0 / 灵石 222 / 需 60 两 → 可走', pay.ok === true);
ok('只扣 1 枚灵石（不论远近）', pay.stones === 1);
ok('银两没得扣就不扣', pay.silver === 0);
pay = G.Map.payPlan({ silver: 0, spiritStones: 222 }, 110);
ok('长途 110 两同样 1 枚灵石（按程算，不按两算）', pay.ok === true && pay.stones === 1);
pay = G.Map.payPlan({ silver: 50, spiritStones: 222 }, 110);
ok('银两先扣（优先扣银两）', pay.ok === true && pay.silver === 50 && pay.stones === 1);
pay = G.Map.payPlan({ silver: 200, spiritStones: 222 }, 90);
ok('银两够时不碰灵石', pay.ok === true && pay.stones === 0 && pay.silver === 90);
ok('银两 0 且灵石 0 → 不可行', G.Map.payPlan({ silver: 0, spiritStones: 0 }, 60).ok === false);

// ---------- ② 动身按钮：0 银两不再置灰 ----------
section('② 四通八达的「动身」：0 银两可走，并写明灵石抵扣');
P().location = 'jiayuan_cheng';
P().realmIndex = 6;
P().silver = 0; P().spiritStones = 222;
P().jiayuan = null; P().jiayuanDone = true;      // 玄机世家已了结（否则 busyMsg 会锁住全图）
U.switchTab('map');
const rowQn = routeRow('qingniu_zhen');
ok('青牛镇那一行渲染出来了', !!rowQn);
const btnQn = rowQn && rowQn.children[1] && rowQn.children[1].children[0];
ok('动身按钮存在且未置灰', !!btnQn && btnQn.disabled === false);
const subQn = rowQn && rowQn.children[0] ? rowQn.children[0].innerHTML : '';
ok('盘缠旁写着「可耗 1 灵石抵扣」', /可耗 1 灵石抵扣/.test(subQn));
const rowSg = routeRow('shenshou_gu');
const btnSg = rowSg && rowSg.children[1] && rowSg.children[1].children[0];
ok('幽篁谷（110 两）同样可点', !!btnSg && btnSg.disabled === false);
const subTn = routeRow('tainan_gu').children[0].innerHTML;
ok('被幻阵拦下的路不写「灵石抵扣」（免得以为是钱的问题）', !/可耗 1 灵石抵扣/.test(subTn));
const rowYj = routeRow('yuejing_cheng');
const btnYj = rowYj && rowYj.children[1] && rowYj.children[1].children[0];
ok('云京仍按修为门槛挡（不是盘缠问题）', !!btnYj && btnYj.disabled === true && /筑基/.test(btnYj.title || ''));

logs.length = 0;
const before = P().spiritStones;
btnQn.onclick();
ok('点动身：人已到青牛镇', P().location === 'qingniu_zhen');
ok('扣掉 1 枚灵石', P().spiritStones === before - 1);
ok('盘缠仍是 0 两（本来就没有）', (P().silver || 0) === 0);
ok('见闻录说明拿灵石兑了碎银', logs.some(l => /灵石兑了碎银/.test(l.msg)));

// ---------- ③ 银两够时不写抵扣提示 ----------
section('③ 银两够：不必提灵石');
P().location = 'jiayuan_cheng';
P().silver = 500; P().spiritStones = 222;
U.updateUI();
const subRich = routeRow('qingniu_zhen').children[0].innerHTML;
ok('银两充足时不出现抵扣提示', !/可耗 1 灵石抵扣/.test(subRich));
ok('银两充足时盘缠文案照旧', /盘缠 60 两/.test(subRich));

// ---------- ④ 药圃状态条：可点 + 右侧实况 ----------
section('④ 药圃状态条：一点直达洞府药圃');
P().plots = null;                                  // 旧存档没有 p.plots，走懒初始化
U.switchTab('map');
scrolled.length = 0;
U.openPlot();
ok('切到洞府页（修行组）', U.tab === 'home');
ok('药圃面板已展开', !!els['plot-box'] && els['plot-box'].open === true);
ok('面板 display 已放开', els['plot-box'].style.display === '');
ok('滚到药圃面板', scrolled.some(s => s.el && s.el.id === 'plot-box'));
ok('空垄时右侧是「点击打理药圃 ›」', /点击打理药圃/.test(T('plot-head-more')));
ok('右侧带灵田等阶（未升阶时说凡土药畦）', /灵田 \d+ 阶|凡土药畦/.test(T('plot-head-more')));
ok('状态条主体仍是 0 / 3', /0 \/ 3 垄在长/.test(T('plot-head-text')));

// 种一株：右侧改报存药，主体变 1 / 3
G.State.addItem('herb_bainian', 2);
G.Plot.plant(0);
ok('移栽成功：1 / 3 垄在长', /1 \/ 3 垄在长/.test(T('plot-head-text')));
ok('有药在长时右侧报存药', /存药 百年×\d+/.test(T('plot-head-more')));
ok('不再显示「点击打理药圃」', !/点击打理药圃/.test(T('plot-head-more')));

// ---------- ⑤ 药圃面板（下种/催熟/采收）+ 灵液催熟（仅存灵木/玄冰/龙鳞） ----------
section('⑤ 药圃面板：下种/催熟/采收 与 灵液催熟');
// 灵液催熟菜单（plot-catalyze）仅剩三项灵液灵珍——百年/千年灵药改由田垄长出
ok('灵木项写清是傀儡骨架主材', /傀儡骨架主材/.test(T('cata-wood-sub')));
ok('灵木项带「现有 N 根」', /现有 \d+ 根/.test(T('cata-wood-sub')));
ok('灵木项写明产出数量', /百年灵木×3/.test(T('cata-wood-sub')));
ok('玄冰花项写清元灵丹主材/拜师礼', /元灵丹主材/.test(T('cata-xuanbing-sub')) && /拜师礼/.test(T('cata-xuanbing-sub')));
ok('龙鳞果项写清结丹级灵珍', /结丹级/.test(T('cata-longlin-sub')));
ok('三项灵液灵珍皆带「现有 N 株/根」', ['cata-wood-sub', 'cata-xuanbing-sub', 'cata-longlin-sub']
    .every(id => /现有 \d+ (株|根)/.test(T(id) || '')));
// 药圃田垄面板：section ④ 已移栽一株百年灵药（移栽苗 target=1000，不算百年可收）
U.updateUI();
ok('药圃列表渲染出田垄行', els['plot-list'] && els['plot-list'].children.length >= 1);
ok('批量区有一键下种与一键采收', els['plot-batch'] && els['plot-batch'].children.length === 2);
// 遍历子节点取 innerText（mock DOM 的 _text 即 innerText）
function dumpText(node, acc) {
    if (!node) return acc;
    if (node._text) acc.push(node._text);
    (node.children || []).forEach(function (c) { dumpText(c, acc); });
    return acc;
}
// 移栽苗满 100 年：显示「催熟 +250年」「直催千年」「起出幼苗（退回百年药）」，不显示「收成·百年灵药」
ok('移栽苗不显示「收成·百年灵药」', !dumpText(els['plot-list'], []).some(function (t) { return /收成·百年灵药/.test(t); }));
ok('移栽苗显示「催熟 +250年」', dumpText(els['plot-list'], []).some(function (t) { return /催熟 \+250年/.test(t); }));
ok('移栽苗显示「直催千年」', dumpText(els['plot-list'], []).some(function (t) { return /直催千年/.test(t); }));
ok('移栽苗显示「起出幼苗（退回百年药）」', dumpText(els['plot-list'], []).some(function (t) { return /起出幼苗（退回百年药）/.test(t); }));
// 移栽苗此刻收不动（不误拔），且 harvest 不产出百年灵药（#1 破除死循环）
ok('移栽苗此刻收不动、不误产百年药', (function () {
    var n = G.State.countItem('herb_bainian');
    var r = G.Plot.harvest(0);
    return r === false && G.State.countItem('herb_bainian') === n;
})());
// 下种苗满百年 → 显示「收成·百年灵药」且采收得百年灵药（双轨：田垄长出，非灵液凭空变）
G.State.addItem('seed_lingyao', 2);
G.State.p().liquid = 10;
G.Plot.plantSeed(1);
G.Plot.catalyzeToHundred(1);
U.updateUI();
ok('下种苗满百年显示「收成·百年灵药」', dumpText(els['plot-list'], []).some(function (t) { return /收成·百年灵药/.test(t); }));
ok('采收满百年的下种苗得百年灵药', (function () {
    var n = G.State.countItem('herb_bainian');
    G.Plot.harvest(1);
    return G.State.countItem('herb_bainian') === n + 1;
})());
// 现存数字会随背包走
var woodN = G.State.countItem('spirit_wood');
G.State.addItem('spirit_wood', 4);
U.updateUI();
ok('现存数量随背包实时变化', new RegExp('现有 ' + (woodN + 4) + ' 根').test(T('cata-wood-sub')));

// ---------- ⑥ 无 JS 报错 ----------
section('⑥ 全程无 JS 异常');
ok('没有 pageerror / console.error', errors.length === 0);

console.log('\n' + (fail ? '\u2717 ' : '\u2713 ') + 'pass ' + pass + ' / fail ' + fail);
if (fail) { console.log('failed:', fails.join(' | ')); process.exit(1); }
