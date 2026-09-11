'use strict';
/* =========================================================
 * test/smoke_auction.js —— 黑市筑基门槛 + 拍卖会结丹门槛 回归测试
 *
 * ① 黑市筑基门槛：练气期不得涉足地下黑市（旧货摊/销赃/秘籍/材料门路一并锁闭，
 *    显示锁定提示、不渲染任何可点按钮）；筑基期起正常开放。
 * ② 拍卖会结丹门槛：结丹期(index>=22)解锁，渲染「应价/一口价」按钮可竞拍；
 *    未到结丹期显示锁定提示、拍品区为空、竞拍函数直接拒拍（修为不到不能点击）。
 *
 * 注：当前 REALMS 仅到筑基九层(index21)，故结丹(index22)在真实游戏里尚不可达；
 * 测试以 p.realmIndex=22 直接模拟结丹，并桩掉 updateUI/autoSave（避免 REALMS[22]
 * 越界），以隔离验证拍卖会逻辑本身。
 *
 * 运行： node test/smoke_auction.js
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

/* ================= 骨架（同 smoke_market_hub.js） ================= */
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
El.prototype.insertBefore = function (c) { this.children.unshift(c); this.firstChild = this.children[0]; this.lastChild = this.children[this.children.length - 1]; return c; };
El.prototype.removeChild = function (c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); this.firstChild = this.children[0] || null; this.lastChild = this.children[this.children.length - 1] || null; };
Object.defineProperty(El.prototype, 'childElementCount', { get() { return this.children.length; } });
El.prototype.addEventListener = function () {};
El.prototype.setAttribute = function () {};
El.prototype.getAttribute = function () { return null; };
El.prototype.querySelector = function () { return new El('q'); };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.remove = function () {};
El.prototype.focus = function () {};
El.prototype.contains = function () { return false; };
Object.defineProperty(El.prototype, 'innerHTML', { get() { return this._html; }, set(v) { this._html = String(v); this.children = []; this.firstChild = null; this.lastChild = null; } });
Object.defineProperty(El.prototype, 'innerText', { get() { return this._text; }, set(v) { this._text = String(v); } });
Object.defineProperty(El.prototype, 'textContent', { get() { return this._text; }, set(v) { this._text = String(v); } });

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
function htmlOf(id) { const e = els[id]; return e ? String(e._html || '') : ''; }

U.started = true;

/* ================= 解锁判定 helper ================= */
section('解锁判定 helper');
ok('isZhuji(练气12)=false', G.DATA.isZhuji({ realmIndex: 12 }) === false);
ok('isZhuji(筑基13)=true', G.DATA.isZhuji({ realmIndex: 13 }) === true);
ok('isJiedan(筑基21)=false', G.DATA.isJiedan({ realmIndex: 21 }) === false);
ok('isJiedan(结丹22)=true', G.DATA.isJiedan({ realmIndex: 22 }) === true);
ok('JIEDAN_GATE_INDEX=22', G.DATA.JIEDAN_GATE_INDEX === 22);

/* ================= ① 黑市筑基门槛 ================= */
section('① 黑市筑基门槛：练气期锁闭，筑基期开放');
// 练气玩家
const q1 = G.State.createNewPlayer('wanderer');
q1.realmIndex = 0;
U.updateUI();
ok('练气期：黑市锁定提示显示（含「须筑基期」）', /须筑基期/.test(htmlOf('black-lock')));
ok('练气期：旧货摊货架区已清空（无子节点）', els['junk-goods'].children.length === 0);
ok('练气期：旧货摊无「购买」按钮', collectButtons(els['junk-goods'], '购买').length === 0);
ok('练气期：旧货摊无「鉴定」按钮', collectButtons(els['junk-goods'], '鉴定').length === 0);
ok('练气期：黑市销赃区清空', els['black-sell'].children.length === 0);
ok('练气期：黑市秘籍区清空', els['black-skills'].children.length === 0);
ok('练气期：黑市材料门路区清空', els['black-rotation'].children.length === 0);

// 筑基玩家
q1.realmIndex = 13;
U.updateUI();
ok('筑基期：黑市锁定提示撤去（不含「须筑基期」）', htmlOf('black-lock').indexOf('须筑基期') < 0);
ok('筑基期：旧货摊已铺货（有子节点）', els['junk-goods'].children.length > 0);
ok('筑基期：旧货摊渲染出「购买」按钮', collectButtons(els['junk-goods'], '购买').length > 0);
ok('筑基期：旧货摊渲染出「鉴定」按钮', collectButtons(els['junk-goods'], '鉴定').length > 0);
ok('筑基期：黑市销赃区已渲染（非门槛清空）', htmlOf('black-sell').length > 0);
ok('筑基期：黑市材料门路区有内容', els['black-rotation'].children.length > 0);

/* ================= ② 拍卖会结丹门槛 ================= */
section('② 拍卖会结丹门槛：未结丹锁闭，结丹解锁可竞拍');
// 练气玩家：直接渲染拍卖会（不依赖完整 updateUI，避免越界）
const a1 = G.State.createNewPlayer('wanderer');
a1.realmIndex = 0;
U.renderAuction();
ok('练气期：拍卖会锁定提示显示（含「须结丹期」）', /须结丹期/.test(htmlOf('auction-lock')));
ok('练气期：拍品区为空', els['auction-goods'].children.length === 0);

// 拍卖会函数级拒拍（练气）：应价/一口价直接 return，不改动状态
a1.spiritStones = 99999;
const stonesBefore = a1.spiritStones;
G.Auction.bid(0);
G.Auction.buyout(0);
ok('练气期：竞拍函数拒拍（灵石不变）', a1.spiritStones === stonesBefore);

// 结丹玩家：桩掉 updateUI/autoSave 避免 REALMS[22] 越界，隔离验证拍卖逻辑
const a2 = G.State.createNewPlayer('wanderer');
a2.realmIndex = 22;
const realUpdate = G.UI.updateUI, realSave = G.UI.autoSave;
G.UI.updateUI = function () {};
G.UI.autoSave = function () {};
U.renderAuction();
ok('结丹期：拍卖会锁定提示撤去', htmlOf('auction-lock').indexOf('须结丹期') < 0);
const lots = (G.DATA.CONTENT.AUCTION.lots || []).filter(l => G.DATA.ITEMS[l.id]);
ok('结丹期：拍品区渲染出全部有效拍品', els['auction-goods'].children.length === lots.length);
ok('结丹期：渲染出「应价」按钮', collectButtons(els['auction-goods'], '应价').length === lots.length);
ok('结丹期：渲染出「一口价」按钮', collectButtons(els['auction-goods'], '一口价').length === lots.length);

// 应价落槌
a2.spiritStones = 99999;
const beforeStones = a2.spiritStones;
const beforeQty = G.State.countItem(lots[0].id);
G.Auction.bid(0);
ok('结丹期·应价：灵石按价扣除（>0）', a2.spiritStones < beforeStones);
ok('结丹期·应价：拍得物品已入袋', G.State.countItem(lots[0].id) >= beforeQty + lots[0].qty);
ok('结丹期·应价：该拍品已移出货架', (a2.auctionGoods || []).length === lots.length - 1);

// 一口价截胡（取剩余首件）
const remain = a2.auctionGoods[0];
const buyBefore = a2.spiritStones;
const buyQtyBefore = G.State.countItem(remain.id);
G.Auction.buyout(0);
ok('结丹期·一口价：灵石按 buyout 扣除', a2.spiritStones === buyBefore - remain.buyout);
ok('结丹期·一口价：拍得物品已入袋', G.State.countItem(remain.id) >= buyQtyBefore + remain.qty);

// 恢复真实 updateUI/autoSave
G.UI.updateUI = realUpdate;
G.UI.autoSave = realSave;

/* ================= ③ 接线与死链检查 ================= */
section('③ 接线检查：HTML/脚本无死链');
ok('index.html 含拍卖会分区 auction-section', html.indexOf('id="auction-section"') >= 0);
ok('index.html 含拍卖会锁 auction-lock', html.indexOf('id="auction-lock"') >= 0);
ok('index.html 含拍品容器 auction-goods', html.indexOf('id="auction-goods"') >= 0);
ok('index.html 含黑市锁 black-lock', html.indexOf('id="black-lock"') >= 0);
ok('index.html 已加载 js/auction.js', html.indexOf('js/auction.js') >= 0);
ok('GAME.Auction 模块已挂载', typeof G.Auction === 'object' && typeof G.Auction.bid === 'function');
ok('渲染期无异常', errors.length === 0);

/* ================= 汇总 ================= */
console.log('\n' + '─'.repeat(46));
console.log(`  结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('  失败项：'); fails.forEach(f => console.log('   - ' + f)); }
process.exit(fail ? 1 : 0);
