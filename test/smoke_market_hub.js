'use strict';
/* =========================================================
 * test/smoke_market_hub.js —— 「市集」交易中枢 回归测试
 *
 * 背景：原先交易入口散落四处，且可见性规则各不相同：
 *   · 坊市货源（MARKET 按地点随机货源池）——「坊市」页签，须先跑商（atMarket，耗 1~6 月）
 *   · 散修坊市（TAINAN.goods 固定价）—— 大地图页·苍南小会内，仅苍南谷可见
 *   · 旧货摊 / 材料门路 / 销赃 / 魔功秘籍 —— 独立黑市页（大地图按钮进），零门槛
 *   · 灵石→银两（1:100 单向）—— 大地图页，仅凡人城池
 * 后果：大地图页被商品列表撑长；两个"坊市"语义重复；黑市藏在子页里。
 *
 * 改法：market 页签升格为「市集」交易中枢，常驻可开、不再要求 atMarket，
 *       内部分四区各自按条件显隐——本坊市仍要跑商、散修坊市仅苍南谷、
 *       地下黑市常开、货币兑换按地点。原独立 black-panel 整体并入。
 *
 * 本测试锁死：
 *   ① 页签常驻：未亲临坊市也能开市集；旧黑市页签/面板已彻底移除（无死链）
 *   ② 本坊市：未进时退化为「前往坊市」入口，跑商成本保留
 *   ③ 散修坊市：仅苍南谷显隐，且买卖功能随迁出仍可用
 *   ④ 地下黑市：在市集页签下渲染（原实现硬绑 tab==='black'，是本轮最易复发点）
 *   ⑤ 货币兑换：低阶→中阶灵石常开；灵石→银两只在凡人城池
 * 运行： node test/smoke_market_hub.js
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

/* ================= 骨架（同 smoke_sect.js / smoke_tainan_fold.js） ================= */
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

function collectButtons(root, label) {
    const out = [];
    (root ? root.children : []).forEach((row) => {
        (row.children || []).forEach((half) => {
            (half.children || []).forEach((b) => { if (b.innerText === label) out.push(b); });
        });
    });
    return out;
}
function shown(id) { const e = els[id]; return !!e && e.style.display !== 'none'; }
/* 桩里 appendChild 不更新 innerHTML，故「渲染过」= 有子节点或有 innerHTML 文案 */
function rendered(id) {
    const e = els[id];
    return !!e && (e.children.length > 0 || String(e._html || '').length > 0);
}
function click(b, tag) {
    try { if (typeof b.onclick !== 'function') return (tag || '') + ' onclick 未绑定'; b.onclick(); return null; }
    catch (e) { return (tag || '') + ' ' + e.message; }
}
function month() { const p = G.State.p(); return p.clock.year * 12 + p.clock.month; }

let primed = false;
function prime() { if (!primed) { U.updateUI(); primed = true; } }
/* 切换所在地：地点跃迁会把页签拨回大地图，故切完再回市集 */
function goAt(loc) {
    G.State.p().location = loc;
    U.updateUI();
    U.tab = 'market';
    U.updateUI();
    return G.State.p();
}

/* ================= ① 页签常驻 + 无死链 ================= */
section('① 页签常驻：不再要求 atMarket；旧黑市页签/面板彻底移除');
ok('TAB_MAP 已无 black 条目（黑市不再占独立页签）', !U.TAB_MAP.black);
ok('index.html 无 tab-black 按钮', html.indexOf('id="tab-black"') < 0);
ok('index.html 无 black-panel 面板', html.indexOf('id="black-panel"') < 0);
ok('index.html 无 btn-map-black（旧黑市子入口）', html.indexOf('id="btn-map-black"') < 0);
ok('大地图保留市集快捷入口 btn-map-shop', html.indexOf('id="btn-map-shop"') >= 0);

const p = G.State.createNewPlayer('wanderer');
U.started = true;
prime();
p.location = 'qingniu_zhen';
U.updateUI();                 // 稳定 _lastLocation（此步会把页签拨回大地图）
U.switchTab('market');
ok('未亲临坊市（atMarket=false）也能切到市集页签', p.atMarket === false && U.tab === 'market');
ok('市集页签按钮未被禁用（不再按 atMarket 禁用）', els['tab-market'].disabled === false);
ok('渲染期无异常', errors.length === 0);

/* ================= ② 本坊市分区 ================= */
section('② 本坊市：未进时退化为入口，跑商成本保留');
ok('未进坊市：本坊市货架区隐藏', !shown('market-local'));
ok('未进坊市：显示「前往坊市」入口', shown('market-away'));
U.bindEvents();
ok('「前往坊市」按钮已接线', typeof els['btn-market-go'].onclick === 'function');
const m0 = month();
let err = click(els['btn-market-go'], '[前往坊市]');
ok('点击「前往坊市」不抛错', err === null);
ok('跑商生效：已身处坊市', p.atMarket === true);
ok('跑商成本保留：耗时推进（山间小集亦须赶路）', month() > m0);
ok('进坊市后本坊市货架区显现', shown('market-local'));
ok('「前往坊市」入口隐去', !shown('market-away'));
ok('坊市货架已铺货', els['market-goods'].children.length > 0);

/* ================= ③ 散修坊市分区 ================= */
section('③ 散修坊市：仅苍南谷显隐，买卖随迁出仍可用');
p.atMarket = false;
goAt('qingniu_zhen');
ok('非苍南谷：散修坊市区块隐藏', !shown('tainan-market-block'));

const p2 = G.State.createNewPlayer('wanderer');
p2.location = 'qingniu_zhen';
U.updateUI();
p2.spiritStones = 2000;
goAt('tainan_gu');
ok('身抵苍南谷：散修坊市区块显现', shown('tainan-market-block'));
const tBuy = collectButtons(els['tainan-goods'], '购买');
ok('散修坊市商品仍渲染出「购买」按钮', tBuy.length === G.DATA.TAINAN.goods.length);
const first = G.DATA.TAINAN.goods[0];
const stones0 = p2.spiritStones;
err = click(tBuy[0], '[购买]');
ok('散修坊市购买不抛错', err === null);
ok('散修坊市购买：灵石按价扣除', p2.spiritStones === stones0 - first.price);
ok('散修坊市购买：物品已入储物袋', G.State.countItem(first.id) >= 1);

/* ================= ④ 地下黑市分区（并入市集） ================= */
section('④ 地下黑市：在市集页签下渲染（原实现硬绑 tab==="black"）');
const p3 = G.State.createNewPlayer('wanderer');
p3.location = 'qingniu_zhen';
p3.spiritStones = 5000;
U.updateUI();
U.tab = 'market';
U.updateUI();
ok('市集页签下旧货摊已渲染（不再依赖独立黑市页签）', els['junk-goods'].children.length > 0);
ok('旧货摊首次进入即铺货（模板初值是空数组，曾因 `!p.junkGoods` 恒为假而永不铺货）',
    (p3.junkGoods || []).length > 0);
const jApp = collectButtons(els['junk-goods'], '鉴定');
const jBuy = collectButtons(els['junk-goods'], '购买');
ok('旧货摊渲染出「鉴定」按钮', jApp.length > 0);
ok('旧货摊渲染出「购买」（盲买）按钮', jBuy.length > 0);

const junkN0 = (p3.junkGoods || []).length;
const s1 = p3.spiritStones;
err = click(jBuy[0], '[旧货摊购买]');
ok('旧货摊盲买不抛错', err === null);
ok('盲买：灵石扣减、货架减一', p3.spiritStones < s1 && (p3.junkGoods || []).length === junkN0 - 1);

ok('黑市销赃区已渲染', rendered('black-sell'));
ok('黑市材料门路区已渲染（每 3 月轮换）', rendered('black-rotation'));
const sk = G.DATA.CONTENT.BLACK_SKILLS || [];
if (sk.length) ok('黑市秘籍渲染出「购入」按钮', collectButtons(els['black-skills'], '购入').length === sk.length);

/* ================= ⑤ 货币兑换分区 ================= */
section('⑤ 货币兑换：灵石→银两只在凡人城池');
goAt('qingniu_zhen');
ok('凡人城池：兑银两按钮区显示', shown('silver-actions'));
ok('凡人城池：提示为行商设摊', /行商老者/.test(els['silver-tip']._text));
const rate = G.Map.cfg().silver.stoneToSilver;
const silver0 = G.State.p().silver, st0 = G.State.p().spiritStones;
err = click(els['btn-exchange-1'], '[兑1灵石]');
ok('兑 1 灵石不抛错', err === null);
ok('兑换生效：灵石 -1、银两 +' + (1 * rate),
    G.State.p().spiritStones === st0 - 1 && G.State.p().silver === silver0 + 1 * rate);

const p4 = G.State.createNewPlayer('wanderer');
p4.location = 'qingniu_zhen';
U.updateUI();
goAt('tainan_gu');
ok('修仙地界：兑银两按钮区隐藏', !shown('silver-actions'));
ok('修仙地界：提示说明兑不出手', /兑不出手|凡俗城池/.test(els['silver-tip']._text));

const p5 = G.State.createNewPlayer('wanderer');
p5.location = 'qingniu_zhen';
p5.spiritStones = 50;
U.tab = 'market'; U.updateUI();
ok('灵石不足 100：兑中阶灵石按钮禁用', els['btn-exchange-stone'].disabled === true);
p5.spiritStones = 150;
U.updateUI();
ok('灵石足 100：兑中阶灵石按钮可用', els['btn-exchange-stone'].disabled === false);

/* ================= 汇总 ================= */
console.log('\n' + '─'.repeat(46));
console.log(`  结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('  失败项：'); fails.forEach(f => console.log('   - ' + f)); }
process.exit(fail ? 1 : 0);
