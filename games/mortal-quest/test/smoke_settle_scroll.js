/* =========================================================
 * test/smoke_settle_scroll.js —— 游历 / 秘境 / 狩猎 结算卷轴
 *
 * 锁死本轮重构四条规则：
 *   ① 游历结算 = 全屏古风卷轴（复用 BattleResult.showScroll），不再占左栏面板
 *   ② 卷轴按钮由 _renderActions 现画：返回 + 继续历练（次按钮带 rg-act-alt）
 *   ③ 秘境/狩猎通关（经战斗胜利出口）用 p._pendingSettle 排队，战斗弹窗关闭后跟进
 *   ④ 撤离/见好就收：直接调 showScroll，标题与战利品标题正确
 * 运行： node test/smoke_settle_scroll.js
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

/* ================= 骨架（与 smoke_battle_settle 同一套假 DOM） ================= */
function El(id, tag) {
    this.id = id; this.tagName = (tag || 'div').toUpperCase();
    this.style = {}; this.children = []; this._html = ''; this._text = '';
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
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
const BR = G.BattleResult;

G.Qixuan.active = () => false;
G.DATA.MAP_ENCOUNTERS.chance = 0;
U.started = true;
const p = S.createNewPlayer('wanderer');
p.realmIndex = 13;
U.updateUI();

const slotCount = (id) => (String(els[id].innerHTML).match(/rg-slot/g) || []).length;

/* ================= ① 游历结算卷轴（物品 + 心境） ================= */
section('① 游历结算：全屏卷轴 + 双按钮 + 次按钮幽灵款');
p.mind = 10; p.currentExp = 100; p.spiritStones = 50;
S.addItem('herb_bainian', 2);
const expSnap = G.Core._exploreSnapshot(p);
p.mind = 14; p.currentExp = 140; p.spiritStones = 60;
S.addItem('herb_qiannian', 1);
G.Core._showExploreResult(p, { text: '山行遇泉' }, expSnap, 2, '山行遇泉');

ok('卷轴已就位（_d._scroll）', !!BR._d && BR._d._scroll === true);
ok('标题：游历归来 · 满载而归（物品+心境）', String(els['rg-seal'].innerHTML) === '游历归来 · 满载而归');
ok('副标题带【往返 X 月】', /【往返 2 月】/.test(String(els['rg-lead'].innerHTML)));
ok('按钮为两枚（返回 / 继续历练）', els['rg-actions'].children.length === 2);
ok('次按钮带 rg-act-alt 幽灵款', /(^|\s)rg-act-alt(\s|$)/.test(els['rg-actions'].children[1].className));
ok('次按钮写着【继续历练】', /继 续 历 练/.test(els['rg-actions'].children[1].innerHTML));
ok('主按钮写着【收下机缘·返回】', /收 下 机 缘/.test(els['rg-actions'].children[0].innerHTML));
ok('修为/心境/灵石 行都画了', /修为/.test(els['rg-gains'].innerHTML) && /心境/.test(els['rg-gains'].innerHTML) && /灵石/.test(els['rg-gains'].innerHTML));
ok('战利品标题：机 缘 所 获', /机 缘 所 获/.test(els['rg-loot'].innerHTML));
ok('战利品格数 ≥ 3（补齐空槽撑横幅）', slotCount('rg-loot') >= 3);

BR.dismiss();
ok('收尾后 _d 归零（左栏回到正常页签逻辑）', BR._d === null);

/* ================= ② 游历：空手而回（无物品无心境） ================= */
section('② 游历空手：标题换「平安返程」，且不再画战利品格');
p.mind = 20; p.currentExp = 200; p.spiritStones = 70;
const snap2 = G.Core._exploreSnapshot(p);
// 不动任何数值 -> 差值为 0
G.Core._showExploreResult(p, { text: '平淡一行' }, snap2, 1, '平淡一行');
ok('标题：游历归来 · 平安返程', String(els['rg-seal'].innerHTML) === '游历归来 · 平安返程');
ok('无所得则不画战利品格', slotCount('rg-loot') === 0);
ok('仍有两枚按钮', els['rg-actions'].children.length === 2);
BR.dismiss();

/* ================= ③ 血月试炼通关（经战斗胜利出口排队） ================= */
section('③ 血月试炼通关：战斗弹窗关闭后结算卷轴跟进');
p.trial = { stepsLeft: 0 };
p._trialSnap = { inv: {}, stones: 0 };
const tHerbs = G.Trial.cfg().herbs;
S.addItem(tHerbs[0], 1);
G.Trial.exit({ fromCombat: true });
ok('通关先排队（p._pendingSettle 已挂，此时还没弹）', !!p._pendingSettle && BR._d === null);

// 模拟战斗胜利弹窗仍开着，玩家点【收下战利品】触发 dismiss
BR._d = { win: true, foe: '正道精英弟子', items: [], stones: 0 };
BR.dismiss();   // 应消费 pending -> showScroll(试炼结算)
ok('战斗收尾后试炼结算卷轴跟进', !!BR._d && BR._d._scroll === true);
ok('试炼结算标题：秘境凯旋 · 满载而归', String(els['rg-seal'].innerHTML) === '秘境凯旋 · 满载而归');
ok('试炼结算战利品标题：秘 境 收 获', /秘 境 收 获/.test(els['rg-loot'].innerHTML));
ok('试炼结算含主药格', slotCount('rg-loot') >= 3);
ok('试炼结算单按钮【笑纳收获·离开秘境】', els['rg-actions'].children.length === 1 && /笑 纳 收 获/.test(els['rg-actions'].children[0].innerHTML));
BR.dismiss();
ok('试炼结算收尾后 _d 归零', BR._d === null);

/* ================= ④ 狩猎见好就收（直接调 showScroll） ================= */
section('④ 狩猎见好就收：撤离即弹结算卷轴');
let hid = null;
if (G.DATA.HUNTS.list && G.DATA.HUNTS.list[0]) hid = G.DATA.HUNTS.list[0].id;
else if (G.DATA.HUNTS.ids && G.DATA.HUNTS.ids[0]) hid = G.DATA.HUNTS.ids[0];
if (hid) {
    const hd = G.DATA.HUNTS.byId(hid);
    p.hunt = { id: hid, await: true };
    p._huntSnap = { inv: {}, stones: 0 };
    const mat = hd.reward.materials[0];
    S.addItem(mat.id, mat.qty);
    G.Hunt.leave();
    ok('狩猎撤离即弹结算', !!BR._d && BR._d._scroll === true);
    ok('狩猎结算标题：见好就收 · 狩猎结算', String(els['rg-seal'].innerHTML) === '见好就收 · 狩猎结算');
    ok('狩猎结算战利品标题：狩 猎 收 获', /狩 猎 收 获/.test(els['rg-loot'].innerHTML));
    ok('狩猎结算含所得格', slotCount('rg-loot') >= 3);
    BR.dismiss();
    ok('狩猎结算收尾后 _d 归零', BR._d === null);
} else {
    ok('狩猎数据可用（hid 已取到）', false);
}

ok('没有 pageerror', errors.length === 0);

console.log('\n' + '='.repeat(52));
console.log('settle_scroll: pass=' + pass + ' fail=' + fail);
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
