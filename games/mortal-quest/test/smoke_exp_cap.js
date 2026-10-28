'use strict';
/* =========================================================
 * test/smoke_exp_cap.js —— 修为封顶（唯一加口 Core.addExp）回归
 *
 * 背景：玩家实测 HUD 出现「修为 4756 / 3900」——旧版各处直接 `p.currentExp += n`，
 * 闭关到满会停，但丹药/生药/斗法/历练/奇遇照加 → 超上限。后果不只是数字难看：
 * 突破失败只扣当前修为三成（4756→3330）仍 ≥ 3900，可以立刻再冲，失败等于没代价。
 *
 * 本轮口径（用户拍板）：**只封顶，扣比不变**——
 *   ① 所有修为增长走 Core.addExp(n)，加满即止，返回实际入账量（日志据实报数）
 *   ② 突破失败的 failExpLoss（30%/35%…）不动，封顶后自然变成「扣本境所需的三成」
 *   ③ 老存档超上限的修为在读 p() 时自愈夹回，不再出现 4756/3900
 *
 * 运行： node test/smoke_exp_cap.js   （须在 games/mortal-quest 目录下跑）
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

function El(id, tag) {
    this.id = id; this.tagName = (tag || 'div').toUpperCase();
    this.style = {}; this.children = []; this._html = ''; this._text = ''; this._cls = '';
    this._attrs = {}; this.scrollTop = 0;
    this.classList = { _s: {}, add() {}, remove() {}, toggle() {}, contains() { return false; } };
    this.dataset = {}; this.disabled = false; this.hidden = false; this.open = false; this.onclick = null;
}
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.removeChild = function () {};
El.prototype.addEventListener = function () {};
El.prototype.setAttribute = function (k, v) { this._attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return (k in this._attrs) ? this._attrs[k] : null; };
El.prototype.removeAttribute = function (k) { delete this._attrs[k]; };
El.prototype.hasAttribute = function (k) { return k in this._attrs; };
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.getElementsByTagName = function () { return []; };
El.prototype.remove = function () {}; El.prototype.contains = function () { return false; };
El.prototype.focus = function () {}; El.prototype.scrollIntoView = function () {};
Object.defineProperty(El.prototype, 'className', { get() { return this._cls; }, set(v) { this._cls = String(v); } });
Object.defineProperty(El.prototype, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); this.children = []; } });
Object.defineProperty(El.prototype, 'innerText', { get() { return this._text; }, set(v) { this._text = String(v); } });
Object.defineProperty(El.prototype, 'textContent', { get() { return this._text; }, set(v) { this._text = String(v); } });

const els = {}; const errors = [];
const sandbox = {}; sandbox.window = sandbox;
sandbox.console = { log: () => {}, warn: () => {}, error: (...a) => { errors.push(a.join(' ')); } };
sandbox.confirm = () => true; sandbox.alert = () => {};
sandbox.setTimeout = () => 0; sandbox.clearTimeout = () => {};
sandbox.setInterval = () => 0; sandbox.clearInterval = () => {};
sandbox.requestAnimationFrame = () => 0;
sandbox.Math = Object.assign(Object.create(Math), { random: () => 0.99 });   // 默认失败档
sandbox.document = {
    getElementById: (id) => els[id] || (els[id] = new El(id)),
    createElement: (t) => new El(null, t),
    querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {},
    body: new El('body'), documentElement: new El('html')
};
const store = {};
sandbox.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: (k) => { delete store[k]; } };
vm.createContext(sandbox);
const html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf8');
const FILES = (html.match(/<script src="([^"]+)"/g) || []).map(s => s.replace(/<script src="|"/g, ''));
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME, U = G.UI;

U.started = true;
G.State.createNewPlayer();
const P = () => G.State.p();
const logs = [];
const _log = U.log;
U.log = function (msg, type) { logs.push(String(msg)); return _log.apply(U, arguments); };
const hasLog = (re) => logs.some(m => re.test(m));

// ---------- ① Core.addExp：加满即止且据实返回 ----------
section('① Core.addExp：封顶 + 实测入账量');
P().realmIndex = 13;                        // 筑基初期 needExp = 3900
const need = G.DATA.REALMS[13].needExp;
P().currentExp = need - 100;
let got = G.Core.addExp(500);
ok('溢出部分被吞：修为停在 ' + need, P().currentExp === need);
ok('返回实际入账 100（不是 500）', got === 100);
got = G.Core.addExp(300);
ok('已满时再加：修为不变、返回 0', P().currentExp === need && got === 0);

// ---------- ② 老存档自愈 ----------
section('② 老档超上限修为：读 p() 自愈夹回');
P().currentExp = 4756;                      // 直接写脏值（模拟旧存档）
const healed = G.State.p();
ok('4756 → 夹回 ' + need, healed.currentExp === need);

// ---------- ③ 突破失败：扣三成（扣比不变） ----------
section('③ 突破失败：3900 × 0.30 = 1170');
P().currentExp = need;
P().maxHp = 400; P().currentHp = 400; P().isDead = false;
P().xinmoImmunity = true;                   // 跳过心魔劫，直落掷骰
sandbox.Math.random = () => 0.99;           // 必失败
logs.length = 0;
G.Core.breakthrough();
const expectLoss = Math.floor(need * G.DATA.REALMS[13].failExpLoss);
ok('失败后修为 = ' + (need - expectLoss) + '（不再停在 3900 以上）', P().currentExp === need - expectLoss);
ok('见闻录写出「修为溃散 ' + expectLoss + ' 点」', hasLog(new RegExp('修为溃散 ' + expectLoss + ' 点')));
ok('失败后低于本境所需 → 不能立刻再冲', P().currentExp < need);

// ---------- ④ 突破成功：扣掉本境所需，归零 ----------
section('④ 突破成功：修为清零，境界 +1');
P().currentExp = need; P().currentHp = 400; P().isDead = false; P().xinmoImmunity = true;
sandbox.Math.random = () => 0.0;            // 必成功
G.Core.breakthrough();
ok('境界进阶到 ' + G.DATA.REALMS[14].name, P().realmIndex === 14);
ok('修为归零（封顶后本就不会有溢出带过去）', P().currentExp === 0);

// ---------- ⑤ 满修为吃丹：药力被吞且不谎报 ----------
section('⑤ 满修为服丹：不再虚涨，也不谎报 +N');
P().realmIndex = 13; P().currentExp = need;
G.State.addItem('pill_huanglong', 3);
logs.length = 0;
G.Core.takePill('pill_huanglong');
ok('修为仍停在 ' + need, P().currentExp === need);
ok('日志说明药力散入经络', hasLog(/本境修为已圆满.*散入经络/));
ok('日志不再出现「修为 +25」', !hasLog(/修为 \+25/));

// ---------- ⑥ needExp 为 null 的境界不封顶 ----------
section('⑥ 筑基后期（needExp=null）不封顶');
P().realmIndex = 15; P().currentExp = 9999;
got = G.Core.addExp(100);
ok('无上限境界照加：9999 → 10099', P().currentExp === 10099 && got === 100);

// ---------- ⑦ 唯一加口：源码里没有裸加 ----------
section('⑦ 唯一加口：js/ 内不再有裸 p.currentExp += 正向值');
const jsDir = path.join(BASE, 'js');
let rawAdd = [];
fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).forEach(f => {
    const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
    src.split(/\r?\n/).forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return;                 // 跳过注释行
        if (/currentExp\s*\+=/.test(line)) rawAdd.push(f + ':' + (i + 1));
    });
});
ok('裸加只应出现在注释里（实际：' + (rawAdd.length ? rawAdd.join(', ') : '无') + '）', rawAdd.length === 0);

console.log('\n==== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ====');
if (errors.length) console.log('console.error: ' + errors.slice(0, 3).join(' | '));
if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exitCode = 1; }
