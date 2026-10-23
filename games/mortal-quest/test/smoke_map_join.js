'use strict';
/* =========================================================
 * test/smoke_map_join.js —— 苍南谷「此地可为」拜山入口 + 目标栏夹注 回归
 *
 * 锁死本轮三处：
 *   ① Map.nodeActions：持【升仙令】身在苍南谷时，动态补出 join_sect（主线级），
 *      无令 / 已入宗门时不补；渲染与 canDoAction 读同一份，不会"看得见却报此地无此事"
 *   ② doAction('join_sect')：走 Tainan.joinByToken 真出口（扣令牌、发门籍），
 *      并顺势切到已解锁的「门派」页签
 *   ③ 目标栏「已在当地」不再是一枚灰框按钮，而是一句随正文走的夹注 .goal-here
 * 运行： node test/smoke_map_join.js
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
    this.scrollTop = 0; this.scrollHeight = 0; this.clientHeight = 0;
}
El.prototype.appendChild = function (c) { this.children.push(c); this.firstChild = this.children[0]; this.lastChild = this.children[this.children.length - 1]; return c; };
El.prototype.removeChild = function (c) {
    const i = this.children.indexOf(c);
    if (i >= 0) this.children.splice(i, 1);
    this.firstChild = this.children[0] || null;
    this.lastChild = this.children[this.children.length - 1] || null;
};
El.prototype.addEventListener = function () {};
El.prototype.setAttribute = function (k, v) { this._attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return (k in this._attrs) ? this._attrs[k] : null; };
El.prototype.removeAttribute = function (k) { delete this._attrs[k]; };
El.prototype.hasAttribute = function (k) { return k in this._attrs; };
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.remove = function () {};
El.prototype.contains = function () { return false; };
El.prototype.focus = function () {};
El.prototype.scrollIntoView = function () {};
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
sandbox.Math = Object.assign(Object.create(Math), { random: () => 0.99 });
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
const P = () => G.State.p();

U.started = true;
G.State.createNewPlayer();
const logs = [];
const _log = U.log;
U.log = function (msg, type) { logs.push({ msg: String(msg), type: type }); return _log.apply(U, arguments); };

// ---------- 准备：人在苍南谷，练气七层，0 银两 ----------
function stageAtTainan(opts) {
    const p = P();
    p.qixuan = { act: 7 };
    p.location = 'tainan_gu';
    p.realmIndex = 6;
    p.silver = 0;
    p.spiritStones = 222;
    p.sectId = null;
    p.tainan = { leitai: 0, leitaiDone: false };
    p.inventory = {};
    if (!opts || opts.token !== false) G.State.addItem('shengxian_ling', 1);
    return p;
}

// ---------- ① 动态行动：持令才有门 ----------
section('① nodeActions：持令拜山才现身');
let p = stageAtTainan();
let acts = G.Map.nodeActions(p);
let join = acts.filter(a => a.id === 'join_sect')[0];
ok('持令 + 身在苍南谷 → 补出 join_sect', !!join);
ok('join_sect 标为主线级（main=true）', !!join && join.main === true);
ok('按钮文案写明「持升仙令」「面见宗门长老」', !!join && /持升仙令/.test(join.label) && /宗门长老/.test(join.label));
ok('副标题说明后果（引你入门）', !!join && /引你入门/.test(join.hint));

p = stageAtTainan({ token: false });
ok('无升仙令 → 不给拜山入口', !G.Map.nodeActions(p).some(a => a.id === 'join_sect'));
p = stageAtTainan();
p.sectId = 'huangfenggu';
ok('已入宗门 → 不给拜山入口', !G.Map.nodeActions(p).some(a => a.id === 'join_sect'));
p = stageAtTainan();
p.location = 'qingniu_zhen';
ok('不在苍南谷 → 不给拜山入口', !G.Map.nodeActions(p).some(a => a.id === 'join_sect'));

// ---------- ② 校验与执行同源 ----------
section('② canDoAction / doAction 与渲染同一把尺子');
p = stageAtTainan();
ok('canDoAction(join_sect) 可行', G.Map.canDoAction('join_sect').ok === true);
ok('渲染里看得见的，canDoAction 也认（不再报此地无此事）',
    !/并无此事/.test(G.Map.canDoAction('join_sect').msg || ''));

p = stageAtTainan({ token: false });
let chk = G.Map.canDoAction('join_sect');
ok('无令时不可行', chk.ok === false);
ok('无令时入口根本不渲染（故报此地无此事，而非把人骗进去）', /并无此事/.test(chk.msg));

p = stageAtTainan();
logs.length = 0;
const taken0 = G.State.countItem('shengxian_ling');
const done = G.Map.doAction('join_sect');
ok('doAction 返回 true', done === true);
ok('门籍已落（sectId = huangfenggu）', P().sectId === 'huangfenggu');
ok('升仙令已交出', G.State.countItem('shengxian_ling') === taken0 - 1);
ok('拜山见闻入录', logs.some(l => /门墙之内|引你入门|苍南/.test(l.msg)));
ok('顺手点亮「门派」页签（tab = sect）', U.tab === 'sect');
ok('门派页签已解锁（不再有前置锁）', U.tabLock('sect') === '');

// ---------- ③ 目标栏：已在当地 → 夹注而非灰框按钮 ----------
section('③ 已在当地：一句夹注，不是一枚点不动的按钮');
p = stageAtTainan();
U.tab = 'map';
U.renderGoal();
const gw = els['goal-where'];
const hereSpan = gw.children.filter(c => /\bgoal-here\b/.test(c.className || ''))[0];
ok('目标栏落出 .goal-here 夹注', !!hereSpan);
ok('夹注文案为「（你已身处当地）」', !!hereSpan && hereSpan.innerText === '（你已身处当地）');
ok('不再生成 goal-go 按钮', !gw.children.some(c => c.id === 'goal-go'));
ok('夹注不带按钮态（无 disabled 语义）', !hereSpan || hereSpan.disabled !== true);
ok('目标正文仍写着要去苍南谷', /苍南谷/.test(els['goal-text'].innerText));
ok('提示指向「此地可为」的拜山按钮', /此地可为/.test(els['goal-hint'].innerText) && /宗门长老/.test(els['goal-hint'].innerText));

// ---------- ④ 见闻录顶部渐隐开关 ----------
section('④ 见闻录：滚起来才渐隐，停在顶端不留灰');
const lb = els['log-box'] || new El('log-box');
lb.className = '';
lb.classList.remove('log-scrolled');
lb.scrollTop = 0;
U._syncLogScroll(lb);
ok('停在顶端 → 不挂 log-scrolled（首条原样可见）', !lb.classList.contains('log-scrolled'));
lb.scrollTop = 300;
U._syncLogScroll(lb);
ok('滚动中 → 挂 log-scrolled', lb.classList.contains('log-scrolled'));
lb.scrollTop = 0;
U._syncLogScroll(lb);
ok('翻回顶端 → 类名摘掉（首条不被渐隐）', !lb.classList.contains('log-scrolled'));

// ---------- ⑤ 全程无异常 ----------
section('⑤ 无 JS 异常');
ok('没有 console.error', errors.length === 0);

console.log('\n' + (fail === 0 ? '✓ ALL PASS' : '✗ HAS FAIL') + `  ${pass} passed, ${fail} failed`);
if (fail) { console.log('未通过：' + fails.join(' / ')); process.exit(1); }
