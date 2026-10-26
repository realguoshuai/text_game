/* =========================================================
 * test/smoke_fixes_1026.js —— 2026-10-26 七项修复回归
 *
 *   ① 一趟历练只结一次账：卷轴还开着时再点【外出历练】不再叠一趟（不再双重掉落）
 *      日志顺序：先「你背起储物袋……」→ 推进年月 → 抵达月才出现一次「获得…」
 *      结算行不再把路上的自动调息回血冒充奖励（快照取在抵达之后）
 *   ② 满血时回血奖励不再空转：折成修为 +15
 *   ③ 青牛镇（凡俗镇集）→ 前往坊市须往返 1 月，不再"就地入市"
 *      凡俗历练走 MORTAL_EVENTS（低阶草药/银两/修为），采到百年灵药同步药香泄露 +5
 *      周济同族后辈真扣 10 两（不足则不触发）；在青牛镇时文案为「你行过青牛镇旧宅」
 *   ④ 卷轴：灵石用专属图标、格数=实际件数（不补虚线空框）、
 *      不再重复打印「战利品：灵石 ×N」、斩妖兽副标题不再谎称"煞气渐敛"
 *
 * 运行： node test/smoke_fixes_1026.js
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

/* ================= 假 DOM ================= */
function El(id, tag) {
    this.id = id; this.tagName = (tag || 'div').toUpperCase();
    this.style = {}; this.children = []; this._html = ''; this._text = '';
    this._cls = new Set();
    const self = this;
    this.classList = {
        add: function () { for (var i = 0; i < arguments.length; i++) self._cls.add(String(arguments[i])); },
        remove: function () { for (var i = 0; i < arguments.length; i++) self._cls.delete(String(arguments[i])); },
        toggle: function (c) { if (self._cls.has(c)) { self._cls.delete(c); return false; } self._cls.add(c); return true; },
        contains: function (c) { return self._cls.has(c); }
    };
    this.dataset = {}; this.scrollTop = 0; this.disabled = false; this.onclick = null;
    this.firstChild = null; this.lastChild = null; this.className = '';
}
El.prototype.appendChild = function (c) {
    this.children.push(c); this.firstChild = this.children[0];
    this.lastChild = this.children[this.children.length - 1]; return c;
};
El.prototype.insertBefore = function (c) {
    this.children.unshift(c); this.firstChild = this.children[0];
    this.lastChild = this.children[this.children.length - 1]; return c;
};
El.prototype.removeChild = function (c) {
    const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1);
    this.firstChild = this.children[0] || null;
    this.lastChild = this.children[this.children.length - 1] || null;
};
Object.defineProperty(El.prototype, 'childElementCount', { get() { return this.children.length; } });
El.prototype.addEventListener = function () {};
El.prototype.setAttribute = function (k, v) { this['_attr_' + k] = String(v); };
El.prototype.getAttribute = function (k) { return (('_attr_' + k) in this) ? this['_attr_' + k] : null; };
El.prototype.hasAttribute = function (k) { return ('_attr_' + k) in this; };
El.prototype.getElementsByTagName = function () { return []; };
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.removeAttribute = function (k) { delete this['_attr_' + k]; };
El.prototype.remove = function () {};
El.prototype.focus = function () {};
El.prototype.contains = function () { return false; };
El.prototype.scrollIntoView = function () {};
Object.defineProperty(El.prototype, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = String(v); this.children = []; this.firstChild = null; this.lastChild = null; }
});
Object.defineProperty(El.prototype, 'innerText', {
    get() { return this._text; }, set(v) { this._text = String(v); }
});
Object.defineProperty(El.prototype, 'textContent', {
    get() { return this._text; }, set(v) { this._text = String(v); }
});

const els = {};
const errors = [];
const sandbox = {};
sandbox.window = sandbox;
sandbox.console = { log: () => {}, warn: () => {}, error: (...a) => { errors.push(a.join(' ')); } };
sandbox.confirm = () => true;
sandbox.alert = () => {};
sandbox.setTimeout = () => 0;
sandbox.clearTimeout = () => {};
sandbox.setInterval = () => 0;
sandbox.clearInterval = () => {};
sandbox.requestAnimationFrame = () => 0;
sandbox.document = {
    getElementById: (id) => els[id] || (els[id] = new El(id)),
    createElement: (t) => new El(null, t),
    querySelector: () => null,
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
const S = G.State;
const C = G.Core;
const BR = G.BattleResult;
const M = G.Market;

G.Qixuan.active = () => false;
G.DATA.MAP_ENCOUNTERS.chance = 0;
U.started = true;

const p = S.createNewPlayer('wanderer');
p.realmIndex = 5;
p.isDead = false; p.combat = null; p.pendingEvent = null;
p.location = 'shenshou_gu';          // 洞府：zone=wild
U.updateUI();

/* 日志探针：正文 + 当时的 totalMonths（判断"出发月 / 抵达月"） */
const logs = [];
const rawLog = U.log;
U.log = function (msg, type) { logs.push({ m: String(msg), t: p.totalMonths }); };
function joined(from) { return logs.slice(from || 0).map(l => l.m).join(' || '); }

/* 固定随机：只关心流程，不关心数值 */
C.rand = function (a) { return a; };

/* 事件池替身：wild 与 city 各一条哨兵事件，一眼看出走了哪个池 */
G.DATA.EVENTS = [{
    id: 'sentinel_wild', weight: 1, text: '山泽哨兵事件', choices: null,
    outcomes: [{ chance: 1, type: 'loot', text: '采得灵药', table: [{ id: 'herb_bainian', chance: 1, qty: [1, 1] }] }]
}];
G.DATA.MORTAL_EVENTS = [{
    id: 'sentinel_city', weight: 1, text: '镇口哨兵事件', choices: null,
    outcomes: [{ chance: 1, type: 'loot', text: '采得草药', table: [{ id: 'herb_shancao', chance: 1, qty: [1, 1] }] }]
}];

/* ================= ① 一趟只结一次账 ================= */
section('① 外出历练：单趟单结算（卷轴未关不再叠一趟）');
const startMonth = p.totalMonths;
logs.length = 0;
const herb0 = S.countItem('herb_bainian');
C.explore();
const depart = logs.findIndex(l => /你背起储物袋外出历练/.test(l.m));
const gain = logs.findIndex(l => /获得.*herb|获得【百年灵药】/.test(l.m));
ok('出发日志只写一条', logs.filter(l => /你背起储物袋外出历练/.test(l.m)).length === 1);
ok('先出发、后掉落（出发日志在掉落之前）', depart >= 0 && gain > depart);
ok('掉落在抵达月（不是出发月）', logs[gain] && logs[gain].t === startMonth + 1 && logs[depart].t === startMonth);
ok('只结算一次：多得一株百年灵药', S.countItem('herb_bainian') === herb0 + 1);
ok('抵达即弹结算卷轴', BR.isOpen() === true);

const herbAfter = S.countItem('herb_bainian');
const logsBefore = logs.length;
C.explore();     // 模拟卷轴还开着时再点一次【外出历练】
ok('卷轴未关时再点：不再起第二趟（不双重掉落）', S.countItem('herb_bainian') === herbAfter);
ok('卷轴未关时再点：见闻录不再写新的出发日志', logs.slice(logsBefore).filter(l => /你背起储物袋/.test(l.m)).length === 0);
BR.dismiss();
ok('关闭后卷轴态复位', BR.isOpen() === false);

/* ================= ② 结算不再把"路上回血"冒充奖励 ================= */
section('② 满血/半血：结算只摊事件收益，回血奖励不空转');
const snapArrive = C._exploreSnapshot(p);
p.currentHp = p.maxHp;                       // 已满血
const expBefore = p.currentExp;
C.resolveEventOutcomes([{ chance: 1, type: 'heal', text: '农家粗饭，一夜好眠。', amount: [20, 20] }]);
ok('满血回血 → 折成修为 +15', p.currentExp === expBefore + 15);
ok('满血时气血不溢出', p.currentHp === p.maxHp);
ok('见闻录交代了折算（修为 +15）', /修为 \+15/.test(joined(logsBefore)));

p.currentHp = p.maxHp - 5;
C.resolveEventOutcomes([{ chance: 1, type: 'heal', text: '清泉洗尘。', amount: [20, 20] }]);
ok('残血回血 → 只补缺口 5 点', p.currentHp === p.maxHp);

const dHp = C._exploreDiff(p, snapArrive).nums.filter(n => n.label === '气血');
ok('路上自动调息的那点气血不进奖励行（快照取在抵达后）',
    dHp.length === 0 || dHp[0].val.indexOf('-') === 0 || dHp[0].val === '+5');

/* ================= ③ 坊市 / 产出分级 / 宗族事件 ================= */
section('③ 青牛镇：坊市要赶路、历练产出降级、宗族事件真扣银');
const keepLoc = p.location;
p.location = 'qingniu_zhen';
ok('青牛镇不再"就地入市"（往返 1 月）', M.travelTime() === 1 && M.townMarket() === false);
p.location = 'jiayuan_cheng';
ok('景阳城仍可就地入市（travelTime=0）', M.travelTime() === 0 && M.townMarket() === true);
p.location = keepLoc;

// 凡俗历练走 MORTAL_EVENTS
p.location = 'qingniu_zhen';
const sc0 = S.countItem('herb_shancao'), bn0 = S.countItem('herb_bainian');
logs.length = 0;
BR.dismiss();
C.explore();
ok('凡俗地界历练只出凡俗遭际（得山草药）', S.countItem('herb_shancao') === sc0 + 1);
ok('凡俗地界不再直接刷百年灵药', S.countItem('herb_bainian') === bn0);
BR.dismiss();
p.location = keepLoc;

// 灵药到手 → 药香泄露 +5
p.leak = 0;
C.resolveEventOutcomes([{
    chance: 1, type: 'loot', text: '草窠里那株透着灵气……', herbLeak: 5,
    table: [{ id: 'herb_bainian', chance: 1, qty: [1, 1] }]
}]);
ok('凡俗采到百年灵药 → 药香泄露 +5', p.leak === 5);

// 周济同族后辈：真扣 10 两 + 当地文案
p.homeSupport = true; p.homeDue = 0; p.ageYears = 70;
p.location = 'qingniu_zhen';
p.silver = 50; p.mind = 0;
logs.length = 0;
C.passTime(12);
ok('周济同族后辈真扣 10 两', p.silver === 40);
ok('周济同族后辈给心境 +2', p.mind === 2);
ok('人在青牛镇 → 文案写「你行过青牛镇旧宅」', /你行过青牛镇旧宅/.test(joined(0)));
ok('不再出现「遥想青牛镇」', !/遥想青牛镇/.test(joined(0)));

p.silver = 5; p.homeDue = 0; p.mind = 0;
logs.length = 0;
C.passTime(12);
ok('银两不足则不触发（分文不动）', p.silver === 5 && p.mind === 0);
ok('银两不足也不写空账日志', !/同族后辈/.test(joined(0)));

p.homeSupport = false;
p.location = keepLoc;

/* ================= ④ 卷轴：图标 / 格数 / 去重 / 副标题 ================= */
section('④ 结算卷轴：灵石专属图标、格数=件数、去重复文案、副标题按实描述');
BR._d = null;
els['result-page'].classList.remove('on');

// 灵石专图 + 妖兽副标题
BR.show({ win: true, foe: '铁齿狼', beast: true, exp: 12, stones: 9, items: [] });
ok('灵石格用专属图标 spirit_stone.jpg', /spirit_stone\.jpg/.test(String(els['rg-loot'].innerHTML)));
ok('斩妖兽副标题不再谎称"煞气渐敛"', !/煞气渐敛/.test(String(els['rg-lead'].innerHTML)));
ok('斩妖兽副标题写的是剖兽搜刮', /兽身|山林/.test(String(els['rg-lead'].innerHTML)));
ok('底部不再重复打印"战利品：…"', String(els['rg-sum'].innerText) === '');

// 人形对手：不该再说"妖"
BR.show({ win: true, foe: '黑衣散修', beast: false, exp: 8, stones: 3, items: [] });
ok('斩人副标题不提兽身', !/兽身/.test(String(els['rg-lead'].innerHTML)) && /清点|遗落/.test(String(els['rg-lead'].innerHTML)));

// 格数 = 实际件数（灵石 1 + 物品 2 = 3），不补虚线空框
BR.show({ win: true, foe: '铁齿狼', beast: true, exp: 5, stones: 20, items: [
    { id: 'herb_bainian', qty: 2 }, { id: 'beast_hide', qty: 1 }
] });
const slotTags = (String(els['rg-loot'].innerHTML).match(/rg-slot/g) || []).length;
ok('格数 = 实际所得件数（3 格）', slotTags === 3);
ok('没有 is-empty 虚线空框', !/is-empty/.test(String(els['rg-loot'].innerHTML)));

// 只给一件：就只画一格
BR.show({ win: true, foe: '铁齿狼', beast: true, exp: 5, stones: 0, items: [{ id: 'beast_hide', qty: 1 }] });
ok('只一件物品时只画一格（不补齐三格）', (String(els['rg-loot'].innerHTML).match(/rg-slot/g) || []).length === 1);

// 游历卷轴同样不补空框
els['result-page'].classList.remove('on');
BR.showScroll({ variant: 'win', seal: 'T', lead: 'L', gains: [], loot: { title: '机 缘 所 获', items: [{ id: 'herb_bainian', qty: 1 }] }, actions: [] });
ok('游历卷轴也只画真到手的格子', (String(els['rg-loot'].innerHTML).match(/rg-slot/g) || []).length === 1 &&
    !/is-empty/.test(String(els['rg-loot'].innerHTML)));
BR.dismiss();

ok('没有 pageerror', errors.length === 0);

console.log('\n' + '='.repeat(52));
console.log('fixes_1026: pass=' + pass + ' fail=' + fail);
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
