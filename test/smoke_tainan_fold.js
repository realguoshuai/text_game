'use strict';
/* =========================================================
 * test/smoke_tainan_fold.js —— 苍南小会折叠入口 回归测试
 *
 * 背景：苍南小会（散修坊市 14 件商品 + 出售杂物 + 升仙大会）原以 div 形式
 * 整块展开在大地图页尾。玩家反馈「大地图下直接把物品放出来不太好」：
 *   ① 商品带购买按钮铺满一屏，舆图信息被挤到要往下滚；
 *   ② 与「坊市」页签的商品列表观感重复；
 *   ③ 真正属于此地的升仙大会擂台被压在商品列表最底下。
 *
 * 改法：整块改为原生 <details> 折叠，默认收起为一行入口（零 JS 依赖），
 *       摘要行右侧显示擂台状态，不展开也知道进度。
 *
 * 本测试锁死：
 *   ① 结构：tainan-block 必须是 <details> 且默认不带 open；商品/擂台都在其内部
 *   ② 显隐：仅身抵苍南谷时显示
 *   ③ 状态摘要：未开擂 / 连胜 N 场 / 前三已定 / 已拜宗门 四态正确
 *   ④ 折叠不影响功能：收起状态下商品仍可正常购买
 * 运行： node test/smoke_tainan_fold.js
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

/* ================= 骨架（同 smoke_sect.js） ================= */
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
let primed = false;
function prime() { if (!primed) { U.updateUI(); primed = true; } }
function brief() { return (els['tainan-brief'] || {})._text || ''; }
function tbDisplay() { return els['tainan-block'] ? els['tainan-block'].style.display : undefined; }

/* ================= ① 结构：必须是折叠容器 ================= */
section('① 结构：苍南小会已改为原生 <details> 折叠入口');
const openTag = (html.match(/<details[^>]*id="tainan-block"[^>]*>/) || [])[0];
ok('tainan-block 是 <details> 元素（不再是整块摊开的 div）', !!openTag);
ok('默认不带 open 属性（开局/入场即收起）', !!openTag && !/\bopen\b/.test(openTag));

const startIdx = html.indexOf('id="tainan-block"');
const endIdx = html.indexOf('</details>', startIdx);
const inner = startIdx >= 0 && endIdx > startIdx ? html.slice(startIdx, endIdx) : '';
ok('折叠容器内含 <summary> 入口行', inner.includes('<summary'));
ok('散修坊市商品容器在容器内部（收起时不外露）', inner.includes('id="tainan-goods"'));
ok('出售杂物在容器内部', inner.includes('id="tainan-sell"'));
ok('升仙大会擂台与按钮在容器内部', inner.includes('id="tainan-leitai"') && inner.includes('id="btn-leitai-next"'));
ok('摘要行带擂台状态位 tainan-brief', inner.includes('id="tainan-brief"'));

const css = fs.readFileSync(path.join(BASE, 'css/style.css'), 'utf8');
ok('已补 .tainan-fold 样式（summary 可点、箭头可转）', /\.tainan-fold\s*>?\s*summary/.test(css) || css.includes('.tainan-fold'));
ok('样式不再引用未定义变量 --bd（原虚线边框其实一直没渲染）', !/var\(--bd\)/.test(html) && !/var\(--bd\)/.test(css));

/* ================= ② 显隐：仅在苍南谷 ================= */
section('② 显隐：只有身抵苍南谷才出现');
const p = G.State.createNewPlayer('wanderer');
U.started = true;
prime();
p.location = 'qingniu_zhen';
U.tab = 'map'; U.updateUI();
ok('身处他地：苍南小会整体隐藏', tbDisplay() === 'none');

p.location = 'tainan_gu';
U.updateUI();
ok('身抵苍南谷：苍南小会显现', tbDisplay() === 'block');
ok('渲染期无异常', errors.length === 0);

/* ================= ③ 状态摘要四态 ================= */
section('③ 摘要行擂台状态：不展开也知道进度');
p.sectId = null;
p.tainan = { leitai: 0, leitaiDone: false };
U.updateUI();
ok('未开擂 → 「擂台 · 未开擂」', brief() === '擂台 · 未开擂');

p.tainan.leitai = 2;
U.updateUI();
ok('连胜中 → 「擂台 · 连胜 2 场」', brief() === '擂台 · 连胜 2 场');

p.tainan.leitaiDone = true;
U.updateUI();
ok('前三已定 → 「擂台 · 前三已定」', brief() === '擂台 · 前三已定');

p.sectId = 'huangfenggu';
U.updateUI();
ok('已拜宗门 → 「已拜宗门」', brief() === '已拜宗门');

/* ================= ④ 折叠不影响功能 ================= */
section('④ 收起状态下商品仍可正常购买（折叠只改呈现、不改功能）');
const p2 = G.State.createNewPlayer('wanderer');
p2.location = 'tainan_gu';
p2.spiritStones = 1000;
U.updateUI();
const goods = els['tainan-goods'];
const buyBtns = collectButtons(goods, '购买');
ok('散修坊市商品仍渲染出「购买」按钮', buyBtns.length > 0);
ok('商品数量与 TAINAN.goods 一致', buyBtns.length === G.DATA.TAINAN.goods.length);

const first = G.DATA.TAINAN.goods[0];
const stonesBefore = p2.spiritStones;
let cerr = null;
try { buyBtns[0].onclick(); } catch (e) { cerr = e.message; }
ok('点击「购买」不抛错', cerr === null);
ok('灵石按价扣除', p2.spiritStones === stonesBefore - first.price);
ok('物品已入储物袋', G.State.countItem(first.id) >= 1);

/* ================= 汇总 ================= */
console.log('\n' + '─'.repeat(46));
console.log(`  结果：${pass} 通过 / ${fail} 失败`);
if (fail) { console.log('  失败项：'); fails.forEach(f => console.log('   - ' + f)); }
process.exit(fail ? 1 : 0);
