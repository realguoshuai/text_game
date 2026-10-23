'use strict';
/* =========================================================
 * test/smoke_goal_where.js —— 目标框「前往」按钮 + 升仙令分支 + 玄机世家收尾 回归
 *
 * 锁死本轮三项：
 *   ① 「前往：XXX」从纯文本升级为可点书签，三种落点各走真实函数：
 *      tab → switchTab；map → Map.travel；走不通 → 翻地图 + 滚动定位 + 见闻录说明
 *   ② 已握升仙令不再被赶去打擂台（旧文案「进前三方可得升仙令」是错的，擂台只发筑基丹）
 *   ③ 玄机世家了结后入口封存：按钮「已了结」+ disabled，且不再重复刷收尾日志
 * 运行： node test/smoke_goal_where.js
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
    this.dataset = {}; this.disabled = false; this.hidden = false;
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
sandbox.Math = Object.assign(Object.create(Math), { random: () => 0.99 });   // 关掉路遇事件，免得测试随机打架
sandbox.document = {
    getElementById: (id) => els[id] || (els[id] = new El(id)),
    createElement: (t) => new El(null, t),
    // scrollToMapNode 依赖 #map-routes [data-node="x"] 这类选择器：这里按 data-node 精确回查
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
// 截获见闻录，便于断言"说了什么"
const logs = [];
const _log = U.log;
U.log = function (msg, type) { logs.push({ msg: String(msg), type: type }); return _log.apply(U, arguments); };
const lastLog = () => (logs.length ? logs[logs.length - 1] : {});
function planOf(g, p) { try { return G.Goals.wherePlan(g, p || P()); } catch (e) { errors.push('wherePlan: ' + e.message); return null; } }
const MAP_TAI = { id: "t", where: "苍南山", whereTo: { kind: "map", node: "tainan_gu" } };
const MAP_JY = { id: "t2", where: "景阳城", whereTo: { kind: "map", node: "jiayuan_cheng" } };

// ---------- ① 大地图落点：门槛未达 ----------
section('① 地点不可达：指路而非硬闯');
P().location = 'qingniu_zhen';
P().realmIndex = 3;            // 练气四层，苍南谷要练气六层
P().silver = 800; P().spiritStones = 800;
U.switchTab('home');
let plan = planOf(MAP_TAI);
ok('门槛未达 plan.state = blocked', !!plan && plan.state === 'blocked');
ok('按钮文案带出门槛「（需练气六层）」', !!plan && /需练气六层/.test(plan.label));
ok('按钮文案带箭头 ›', !!plan && /›$/.test(plan.label));
scrolled.length = 0; logs.length = 0;
U.goWhere(plan);
ok('点击后左栏切到大地图', U.tab === 'map');
ok('见闻录说明缺的是修为', /需练气六层修为/.test(lastLog().msg) && /道行不足/.test(lastLog().msg));
ok('见闻录点明地点名', /苍南山·苍南谷/.test(lastLog().msg));
ok('真把那一行滚进视野了', scrolled.some(s => s.el && s.el.getAttribute('data-node') === 'tainan_gu'));
ok('滚动是 smooth + 居中', scrolled.some(s => s.opt && s.opt.behavior === 'smooth' && s.opt.block === 'center'));
ok('没把人偷偷送过去', P().location === 'qingniu_zhen');

// ---------- ② 大地图落点：可达 ----------
section('② 地点可达：一键动身');
P().location = 'qingniu_zhen';
P().realmIndex = 3;
P().silver = 800;
plan = planOf(MAP_JY);
ok('可达 plan.state = ok（景阳城需练气四层）', !!plan && plan.state === 'ok');
ok('可达时按钮不显示门槛', !!plan && !/需/.test(plan.label));
logs.length = 0;
U.goWhere(plan);
ok('一键动身：人已到景阳城', P().location === 'jiayuan_cheng');
ok('动身有见闻记录', logs.some(l => /动身|抵达/.test(l.msg)));

// ---------- ③ 已在当地 ----------
section('③ 已在当地：按钮静音');
P().location = 'tainan_gu';
plan = planOf(MAP_TAI);
ok('已在当地 label = 已在当地', !!plan && plan.label === '已在当地');
ok('已在当地 disabled = true', !!plan && plan.disabled === true);
logs.length = 0;
U.goWhere(plan);
ok('点不动（不发日志、不移动）', logs.length === 0 && P().location === 'tainan_gu');
P().location = 'qingniu_zhen';
U.updateUI();   // 同步 _lastLocation，否则下一帧 updateUI 会按"踏上新地点"把页签拽回大地图

// ---------- ④ 功能页签落点 ----------
section('④ 页签落点：直接切过去');
P().yindu = null;
P().jiayuanDone = false;
plan = planOf({ id: "t3", where: "洞府", whereTo: { kind: "tab", tab: "home" } });
ok('页签落点 kind = tab', !!plan && plan.kind === 'tab' && plan.tab === 'home');
U.goWhere(plan);
ok('切到洞府页', U.tab === 'home');

// goto 型（如「苍梧门」→ 六幕开幕）：仍要落成按钮，点了执行目标自带的跳转函数
let ranGoto = 0;
const gotoPlan = planOf({ id: "g", where: "苍梧门", goto: function () { ranGoto++; } });
ok('goto 型落成按钮并带箭头', !!gotoPlan && gotoPlan.kind === 'goto' && /›$/.test(gotoPlan.label));
U.goWhere(gotoPlan);
ok('goto 型点了会执行原跳转', ranGoto === 1);

// 坊市 / 黑市：切市集并滚到地下黑市
P().yindu = { months: 24 };
P().jiayuanDone = true;      // 线索已断 → 目标指向坊市 / 黑市
U.renderGoal();
const wEl = els['goal-where'];
const goBtn = wEl && wEl.children[0];
ok('目标框里真的是个 <button>', !!goBtn && String(goBtn.tagName) === 'BUTTON');
ok('按钮 id/class 为 goal-go', !!goBtn && goBtn.id === 'goal-go' && /\bgoal-go\b/.test(goBtn.className));
ok('按钮文案指向坊市 / 黑市', !!goBtn && /坊市 \/ 黑市/.test(goBtn.innerText));
scrolled.length = 0;
goBtn.onclick();
ok('点击切到市集页', U.tab === 'market');
ok('并把地下黑市滚进视野', scrolled.some(s => s.el && s.el.id === 'black-section'));
ok('阴毒未解时按钮带危机配色类之外仍可点', goBtn.disabled === false || goBtn.disabled === undefined);
P().yindu = null;
P().jiayuanDone = false;

// ---------- ⑤ 升仙令分支 ----------
section('⑤ 握有升仙令不再被赶去擂台');
P().tainan = { leitai: 0, leitaiDone: false };
G.State.removeItem('shengxian_ling', G.State.countItem('shengxian_ling') || 0);
P().realmIndex = 5;
P().qixuan = { act: 7 };        // 六幕已了，否则目标一直停在苍梧门那条）
P().sectId = null;
let cur = G.Goals.current();
ok('无令时目标仍是苍南小会', cur && cur.id === 'tainan' && /苍南小会/.test(cur.text));
ok('无令时 hint 不再谎称"可得升仙令"', cur && !/可得升仙令/.test(cur.hint) && /筑基丹/.test(cur.hint));
G.State.addItem('shengxian_ling', 1);
cur = G.Goals.current();
ok('持令后目标改为免试拜山', cur && /持升仙令/.test(cur.text) && /免试拜入山门/.test(cur.text));
ok('持令后 hint 明说"不必再上擂台"', cur && /不必再上擂台/.test(cur.hint));
ok('持令后「前往」落到苍南谷', !!cur && /苍南/.test(cur.where) && cur.whereTo && cur.whereTo.node === 'tainan_gu');
// 拜入宗门阶段同样改口
P().tainan = { leitai: 3, leitaiDone: true };
const joinGoal = (G.Goals.DEFS || []).filter(d => d.id === 'joinsect')[0];
const joinPack = G.Goals._pack(joinGoal, P());
ok('持令时拜山目标指到苍南谷', /苍南谷/.test(joinPack.text) && joinPack.where === '苍南谷');
ok('持令时拜山目标给得出落点', (planOf(joinPack) || {}).node === 'tainan_gu');

// ---------- ⑥ 玄机世家收尾锁 ----------
section('⑥ 玄机世家收尾：入口封存 + 不刷日志');
P().location = 'jiayuan_cheng';
P().jiayuanDone = false;
P().jiayuan = null;
ok('未了结时入口可点', G.Map.canDoAction('mo_house').ok === true);
P().jiayuanDone = true;
const chkDone = G.Map.canDoAction('mo_house');
ok('了结后入口不可点', chkDone.ok === false);
ok('了结后给出人话原因', /已了/.test(chkDone.msg));
els['map-actions'] = new El('map-actions');
try { U.renderMap(); } catch (e) { errors.push('renderMap: ' + e.message); }
const arow = els['map-actions'].children[0];
const abtn = arow ? arow.children[1].children[0] : null;
ok('了结后按钮文案 = 已了结', !!abtn && abtn.innerText === '已了结');
ok('了结后按钮 disabled', !!abtn && abtn.disabled === true);
const n0 = logs.length;
try { G.Jiayuan.start(); } catch (e) { errors.push('Jiayuan.start: ' + e.message); }
ok('再调 Jiayuan.start 也不再追加日志', logs.length === n0);
ok('已了结时 Jiayuan.start 返回 false', G.Jiayuan.start() === false);
ok('重复调用后日志数仍不变', logs.length === n0);

// ---------- 收尾 ----------
console.log('\n' + (fail === 0 ? '全部通过' : '失败 ' + fail + ' 项') + '：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) { console.log('失败项：'); fails.forEach(f => console.log('  - ' + f)); }
if (errors.length) { console.log('运行时异常：'); errors.slice(0, 8).forEach(e => console.log('  ! ' + e)); }
process.exit(fail === 0 && errors.length === 0 ? 0 : 1);
