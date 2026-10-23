'use strict';
/* =========================================================
 * test/smoke_crisis_goal.js —— 阴毒危机目标横幅 + 景阳城入口 回归
 *
 * 锁死三处修复：
 *   ① 阴毒目标按所处环节改写文案（途中 / 已在景阳城 / 线索已断 / 解药在手），
 *      并且永远压过其它紧急项（尸虫/泄露/觊觎）
 *   ② 目标横幅危机视觉：data-crisis="poison" + 标签「急务 · 阴毒缠身」，
 *      解除后属性必须摘干净（否则会一直朱红）
 *   ③ applyDeathLock 不得误清紧急目标 —— 旧代码拿 className 里的 urgent 作判据，
 *      每帧把阴毒目标的 tag/text/hint 清空，横幅只剩「—」和一行"前往"
 *   ④ 景阳城「登门玄机世家」入口：地图行动必渲染且可点，主线已开时也能再点进去
 * 运行： node test/smoke_crisis_goal.js
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

// ---------- 假 DOM（够 ui.renderGoal / renderMap 跑通） ----------
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

U.started = true;
G.State.createNewPlayer();
const P = () => G.State.p();
const T = (id) => (els[id] ? els[id].innerText : null);
const ATTR = (id, k) => (els[id] ? els[id].getAttribute(k) : null);
function regoal() { U.renderGoal(); }
function act(p) { try { return G.Goals.action(p || P()); } catch (e) { return null; } }

P().realmIndex = 3;
P().location = 'qingniu_zhen';
P().yindu = { months: 24 };

// ---------- ① 分场景文案 ----------
section('① 阴毒目标按环节改口');
regoal();
ok('途中：标签为「急务 · 阴毒缠身」', T('goal-tag') === '急务 · 阴毒缠身');
ok('途中：主标题含「阴毒噬心」', /阴毒噬心/.test(T('goal-text')));
ok('途中：主标题含「赴景阳城寻解药」', /赴景阳城寻解药/.test(T('goal-text')));
ok('途中：主标题报剩余年数', /剩 2 年/.test(T('goal-text')));
ok('途中：主标题无「—」占位符', !/^—$/.test(T('goal-text')));
// 「前往」已升级为按钮：读按钮文案而不是容器 innerText
function WL() {
    const w = els['goal-where'];
    const b = w && w.children && w.children[0];
    return b ? (b.innerText || '') : (w ? w.innerText : '');
}
ok('途中：导引保留坊市/黑市这条退路', /坊市/.test(T('goal-hint')) && /黑市/.test(T('goal-hint')));
ok('途中：前往按钮指向景阳城', /景阳城/.test(WL()));
ok('途中：下一步 = 前往景阳城寻解药', (act() || {}).label === '前往景阳城寻解药');

P().location = 'jiayuan_cheng';
regoal();
ok('城内：主标题改为探访墨府/玄机世家', /探访城中【墨府 \/ 玄机世家】/.test(T('goal-text')));
ok('城内：不再显示「前往：」', T('goal-where') === '');
ok('城内：下一步 = 入墨府 / 玄机世家', (act() || {}).label === '入墨府 / 玄机世家');

P().jiayuanDone = true;
regoal();
ok('线索已断：主标题改「阴毒噬骨」', /阴毒噬骨/.test(T('goal-text')) && /速寻解毒之法/.test(T('goal-text')));
ok('线索已断：退路指回坊市 / 黑市', /坊市 \/ 黑市/.test(WL()));
ok('线索已断：下一步 = 赴坊市 / 黑市', (act() || {}).label === '赴坊市 / 黑市寻解毒之物');

P().jiayuanDone = false;
G.State.addItem('nuan_yang_bao_yu', 1);
regoal();
ok('解药在手：主标题催服下', /暖阳宝玉在手/.test(T('goal-text')));
ok('解药在手：下一步 = 服下暖阳宝玉', (act() || {}).label === '服下暖阳宝玉');

// ---------- ② 危机视觉 ----------
section('② 危机视觉与解除');
ok('阴毒时横幅带 data-crisis="poison"', ATTR('goal-banner', 'data-crisis') === 'poison');
ok('阴毒时横幅保留 urgent 类', /urgent/.test(els['goal-banner'].className));
P().yindu = null;
regoal();
ok('阴毒解除：data-crisis 被摘掉', ATTR('goal-banner', 'data-crisis') === null);
ok('阴毒解除：标签回落「当前目标」', T('goal-tag') === '当前目标');
ok('阴毒解除：主标题非空（不留破折号）', !!(T('goal-text') || '').length && !/^—$/.test(T('goal-text')));

// ---------- ③ 优先级：压过其它紧急项 ----------
section('③ 阴毒压过其它紧急项');
P().yindu = { months: 12 };
P().leak = 95;
P().marketRiskValue = 92;
P().shichong = { months: 3 };
ok('阴毒 + 泄露 + 觊觎 + 尸虫 → 目标仍是阴毒', (G.Goals.current() || {}).id === 'yindu');
P().leak = 0; P().marketRiskValue = 0; P().shichong = null;

// ---------- ④ 死亡锁不得误清紧急目标 ----------
section('④ applyDeathLock 不误清紧急目标');
P().isDead = true;
U.applyDeathLock();
ok('死亡态：标签为「道陨」', T('goal-tag') === '道陨');
ok('死亡态：横幅打上 data-deathlock', ATTR('goal-banner', 'data-deathlock') === '1');
P().isDead = false;
U.applyDeathLock();
ok('复活：data-deathlock 被清掉', ATTR('goal-banner', 'data-deathlock') === null);
regoal();
ok('复活后：阴毒目标重新显示', T('goal-tag') === '急务 · 阴毒缠身' && /阴毒/.test(T('goal-text')));
// 关键回归：updateUI 每帧都会走 applyDeathLock → 旧代码在此清空 tag/text
for (let i = 0; i < 3; i++) { regoal(); U.applyDeathLock(); }
ok('反复 updateUI 后主标题仍在（不被清空）', /阴毒/.test(T('goal-text')));
ok('反复 updateUI 后导引仍在（不被清空）', (T('goal-hint') || '').length > 0);
ok('反复 updateUI 后标签仍在（不被清空）', T('goal-tag') === '急务 · 阴毒缠身');
P().yindu = null;

// ---------- ⑤ 景阳城入口 ----------
section('⑤ 景阳城「登门玄机世家」入口');
P().location = 'jiayuan_cheng';
P().jiayuan = null;
P().jiayuanDone = false;
els['map-actions'] = new El('map-actions');
try { U.renderMap(); } catch (e) { errors.push('renderMap: ' + e.message); }
const rows = els['map-actions'].children;
ok('地图行动渲染出 1 行', rows.length === 1);
const rowLabel = rows[0] ? rows[0].children[0].innerHTML : '';
const rowBtn = rows[0] ? rows[0].children[1].children[0] : null;
ok('行动名为「登门玄机世家」', /登门玄机世家/.test(rowLabel));
ok('「行事」按钮可点', !!rowBtn && rowBtn.disabled === false);
ok('canDoAction(mo_house) 放行', G.Map.canDoAction('mo_house').ok === true);

ok('点「行事」开启主线', (function () {
    try { return G.Map.doAction('mo_house') === true && !!P().jiayuan && P().jiayuan.stage === 1; }
    catch (e) { errors.push('doAction: ' + e.message); return false; }
})());
ok('主线已开：入口仍可再点（不被「抽身恐失信」反拦）', G.Map.canDoAction('mo_house').ok === true);
ok('主线已开：Jiayuan.start 幂等不重置进度', (function () {
    P().jiayuan.stage = 2;
    G.Jiayuan.start();
    return P().jiayuan.stage === 2;
})());

P().location = 'shenshou_gu';
ok('不在景阳城时 mo_house 不可行', G.Map.canDoAction('mo_house').ok === false);

// ---------- 收尾 ----------
console.log('\n' + (fail === 0 ? '全部通过' : '失败 ' + fail + ' 项') + '：' + pass + ' 通过 / ' + fail + ' 失败');
if (fail) { console.log('失败项：'); fails.forEach(f => console.log('  - ' + f)); }
if (errors.length) { console.log('运行时异常：'); errors.slice(0, 8).forEach(e => console.log('  ! ' + e)); }
process.exit(fail === 0 && errors.length === 0 ? 0 : 1);
