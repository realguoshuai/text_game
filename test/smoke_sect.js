'use strict';
/* =========================================================
 * test/_sect_verify.js —— 门派「弟子杂役」点击无反应 回归测试
 *
 * 真实 bug：ui.js 用三元取出裸函数引用再调用，this 丢失：
 *   (job === s2g.mine ? GAME.Sect.sectMine : GAME.Sect.sectCopy)()
 * → 方法内 this._busyGuard() 抛 TypeError，点击静默失败、无任何提示。
 * 百草园「暂存/取回私药」是同一写法。
 *
 * 本测试锁死：
 *   ① 应差按钮点击后必须真的推进时间 / 涨灵石 / 涨贡献
 *   ② 阻塞态（斗法等）必须有显式日志，不许静默 return
 *   ③ 非青梧谷门人不得看到可用按钮（显隐口径与 isDisciple 对齐）
 *   ④ 百草园 暂存/取回 私药按钮可用
 * 运行： node test/_sect_verify.js
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
    this.style = {}; this.children = []; this._html = ''; this._text = '';
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    this.dataset = {}; this.scrollTop = 0; this.disabled = false; this.onclick = null;
    this.firstChild = null; this.lastChild = null;
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
El.prototype.setAttribute = function () {};
El.prototype.getAttribute = function () { return null; };
El.prototype.querySelector = function () { return new El('q'); };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.remove = function () {};
El.prototype.focus = function () {};
El.prototype.contains = function () { return false; };
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
sandbox.requestAnimationFrame = () => 0;
sandbox.document = {
    getElementById: (id) => els[id] || (els[id] = new El(id)),
    createElement: (t) => new El(null, t),
    querySelector: () => new El('q'),
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

/* ---------- 工具 ---------- */
function collectButtons(root, label) {
    const out = [];
    (root ? root.children : []).forEach((row) => {
        (row.children || []).forEach((half) => {
            (half.children || []).forEach((b) => { if (b.innerText === label) out.push(b); });
        });
    });
    return out;
}
function collectButtonsMatch(root, re) {
    const out = [];
    (root ? root.children : []).forEach((row) => {
        (row.children || []).forEach((half) => {
            (half.children || []).forEach((b) => { if (re.test(b.innerText)) out.push(b); });
        });
    });
    return out;
}
function click(b, tag) {
    try { if (typeof b.onclick !== 'function') return (tag || '') + ' onclick 未绑定'; b.onclick(); return null; }
    catch (e) { return (tag || '') + ' ' + e.message; }
}
function lastLog() {
    const box = els['log-box'];
    return (box && box.children[0]) ? box.children[0].innerText : '';
}
function month() { const p = G.State.p(); return p.clock.year * 12 + p.clock.month; }
function clearLogs() { if (els['log-box']) els['log-box'].innerHTML = ''; }
/* 第一次 updateUI 会把页签兜底到大地图（初始化 _lastAtMarket/_lastLocation），
 * 真实游戏里也是开局即地图页；测试里先让它跑一次，之后切页签才不会被夺走。 */
let primed = false;
function prime() { if (!primed) { U.updateUI(); primed = true; } }
function gotoSect() { U.tab = 'sect'; U.updateUI(); }
function s2box() { return els['sect2-box']; }

/* ================= 1. 筑基预设（青梧谷门人） ================= */
section('① 筑基预设：门人身份 + 面板可达');
const p = G.State.createZhujiPreset();
U.started = true;
prime();
U.switchTab('sect');
ok('预设 sectId = huangfenggu', p.sectId === 'huangfenggu');
ok('isDisciple() = true', G.Sect.isDisciple() === true);
ok('切到 sect 页签后 UI.tab 仍为 sect（未被兜底回落）', U.tab === 'sect');
ok('渲染期无异常', errors.length === 0);

const s2 = s2box();
const btnMine = collectButtons(s2, '应差');
ok('「弟子杂役」渲染出 2 个「应差」按钮', btnMine.length === 2);
ok('sect2-box 首节点标题为「弟子杂役」', !!s2 && s2.children[0] && s2.children[0].innerText === '弟子杂役');

/* ================= 2. 点「应差」必须真的生效 ================= */
section('② 点「应差」：灵矿挖矿 / 传功阁抄书');
let before = { stones: p.spiritStones, contrib: p.sectContrib, m: month(), maxHp: p.maxHp };
let err = click(btnMine[0], '[灵矿挖矿]');
ok('灵矿挖矿：点击不抛错（原 bug = TypeError: this._busyGuard is not a function）', err === null);
ok('灵矿挖矿：耗时 6 月', month() - before.m === 6);
ok('灵矿挖矿：灵石增加', p.spiritStones > before.stones);
ok('灵矿挖矿：贡献 +8', p.sectContrib - before.contrib === 8);
ok('灵矿挖矿：气血上限 -4（地脉煞气）', p.maxHp === before.maxHp - 4);

const btnMine2 = collectButtons(els['sect2-box'], '应差');
before = { stones: p.spiritStones, contrib: p.sectContrib, m: month() };
err = click(btnMine2[1], '[传功阁抄书]');
ok('传功阁抄书：点击不抛错', err === null);
ok('传功阁抄书：耗时 4 月', month() - before.m === 4);
ok('传功阁抄书：灵石增加', p.spiritStones > before.stones);
ok('传功阁抄书：贡献 +12', p.sectContrib - before.contrib === 12);

/* ================= 3. 阻塞态必须给提示（不许静默） ================= */
section('③ 阻塞态：必须有显式日志，不许「点了没反应也没提示」');
const monthBeforeBusy = month();
p.combat = { name: '测试傀儡', hp: 10, def_: 3 };
clearLogs();
const btnBusy = collectButtons(s2box(), '应差');
err = click(btnBusy[0], '[斗法中]');
ok('斗法中点击不抛错', err === null);
ok('斗法中给出日志提示（而非静默 return）', /斗法正酣/.test(lastLog()));
ok('斗法中未推进时间（未误执行差事）', month() === monthBeforeBusy);
p.combat = null;
gotoSect();

/* ================= 4. 非门人：不渲染可用按钮 ================= */
section('④ 非青梧谷门人：与 isDisciple 口径对齐');
const p2 = G.State.createZhujiPreset();
p2.sectId = null;
gotoSect();
ok('散修：不渲染「应差」按钮', collectButtons(s2box(), '应差').length === 0);
ok('散修：显示拜入提示', !!s2box() && /拜入/.test(s2box().innerHTML));

const p3 = G.State.createZhujiPreset();
p3.sectId = 'some_other_sect';
gotoSect();
ok('他派门人：不渲染「应差」按钮', collectButtons(s2box(), '应差').length === 0);
ok('他派门人：显示拜入提示', !!s2box() && /拜入/.test(s2box().innerHTML));

/* ================= 5. 百草园：暂存/取回私药 ================= */
section('⑤ 百草园「暂存/取回私药」按钮（同一 this 丢失写法）');
const p4 = G.State.createZhujiPreset();
p4.sectId = 'huangfenggu';
p4.companion = { hp: 10, maxHp: 10 };
G.State.addItem('herb_bainian', 3);
G.State.addItem('herb_tianling', 2);
gotoSect();
const stashBtn = collectButtons(s2box(), '暂存私药入玄傀')[0];
ok('百草园渲染出「暂存私药入玄傀」按钮', !!stashBtn);
err = click(stashBtn, '[暂存]');
ok('暂存：点击不抛错', err === null);
ok('暂存：私药已入 gardenStash', !!(p4.gardenStash && G.Garden.status().stash === 5));

gotoSect();
const unstashBtn = collectButtons(s2box(), '取回私药(5)')[0];
ok('渲染出「取回私药(5)」（文案随存量变化）', !!unstashBtn);
err = click(unstashBtn, '[取回]');
ok('取回：点击不抛错', err === null);
ok('取回：私药回到储物袋', G.State.countItem('herb_bainian') === 3 && G.State.countItem('herb_tianling') === 2);

/* ================= 6. 其余门派入口回归 ================= */
section('⑥ 同源入口未回归：承接 / 兑换 / 行贿谋差');
const p5 = G.State.createZhujiPreset();
gotoSect();
const takeBtns = collectButtons(els['sect-missions'], '承接');
ok('杂役堂「承接」按钮仍在', takeBtns.length > 0);
before = { stones: p5.spiritStones, contrib: p5.sectContrib, m: month() };
err = click(takeBtns[0], '[承接]');
ok('承接：点击不抛错', err === null);
ok('承接：贡献增加', p5.sectContrib > before.contrib);

const exBtns = collectButtonsMatch(els['sect-exchange'], /^兑换\(贡献/);
ok('贡献兑换「兑换」按钮仍在', exBtns.length > 0);
if (exBtns.length) {
    p5.sectContrib = 999;
    gotoSect();
    const ex2 = collectButtonsMatch(els['sect-exchange'], /^兑换\(贡献/);
    const cost = Number((ex2[0].innerText.match(/贡献(\d+)/) || [])[1]);
    err = click(ex2[0], '[兑换]');
    ok('兑换：点击不抛错', err === null);
    ok('兑换：扣贡献并到手', p5.sectContrib === 999 - cost);
}

/* ================= 汇总 ================= */
console.log('\n================');
console.log(`${pass} 通过 / ${fail} 失败`);
if (fails.length) { console.log('失败项：'); fails.forEach(f => console.log('  - ' + f)); }
if (errors.length) { console.log('运行期异常：'); errors.forEach(e => console.log('  - ' + e)); }
process.exit(fail ? 1 : 0);
