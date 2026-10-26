'use strict';
/* =========================================================
 * test/smoke_alchemy_desc.js —— 炼丹面板「药效说明 + 修为增幅」回归
 *
 * 锁死本轮四件事：
 *   ① 13 条丹方全部配齐 tag（分类）与 note（人话药理），不许漏
 *   ② 数字一律由 Alchemy.effectOf() 现算：金髓丸 +80 修为、聚灵丹回血 120、
 *      续骨丹上限 +25 —— 各自与 ITEM.use 字段逐字对齐，不再手写
 *   ③ 突破丹的成功率 / 反噬 / 免死读 DATA.ZHUJI / DATA.JIEDAN：
 *      改配置则文案跟着变（反向对照），说明不可能与机制打架
 *   ④ 开炉前看得见「丹毒渐抗」后的本颗实得（服过 4 颗 → ×0.70 → 实得 +56）
 * 运行： node test/smoke_alchemy_desc.js
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
    this.dataset = {}; this.disabled = false; this.hidden = false; this.open = false;
    this.onclick = null; this.firstChild = null; this.lastChild = null;
}
El.prototype.appendChild = function (c) { this.children.push(c); this.firstChild = this.children[0]; this.lastChild = this.children[this.children.length - 1]; return c; };
El.prototype.removeChild = function () {};
El.prototype.addEventListener = function () {};
El.prototype.setAttribute = function (k, v) { this._attrs[k] = String(v); };
El.prototype.getAttribute = function (k) { return ('_attr_' + k) in this ? this._attrs[k] : null; };
El.prototype.removeAttribute = function (k) { delete this._attrs[k]; };
El.prototype.hasAttribute = function (k) { return k in this._attrs; };
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.getElementsByTagName = function () { return []; };
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
const G = sandbox.GAME, U = G.UI, D = G.DATA, A = G.Alchemy;

U.started = true;
G.State.createNewPlayer();
const P = () => G.State.p();

// ---------- ① 配置表齐全 ----------
section('① 13 条丹方：tag 与 note 一个都不能少');
const RS = D.RECIPES;
ok('丹方条数 = 13', RS.length === 13);
const noTag = RS.filter(r => !r.tag).map(r => r.pill);
const noNote = RS.filter(r => !r.note || !String(r.note).trim()).map(r => r.pill);
ok('每条都有分类标签 tag：' + (noTag.join(',') || 'ok'), noTag.length === 0);
ok('每条都有药理说明 note：' + (noNote.join(',') || 'ok'), noNote.length === 0);
const badPill = RS.filter(r => !D.ITEMS[r.pill]).map(r => r.pill);
ok('每条都指向真实丹药：' + (badPill.join(',') || 'ok'), badPill.length === 0);
// note 里不许夹数字百分比（否则调平衡就变假话，这是本轮的核心纪律）
const numInNote = RS.filter(r => /\d+\s*[%％]|\+\s*\d/.test(r.note)).map(r => r.pill);
ok('note 里不夹数字（数字一律现算）：' + (numInNote.join(',') || 'ok'), numInNote.length === 0);

// ---------- ② 逐条药效：与 use 字段严格对齐 ----------
section('② 药效数值：逐条与 ITEM.use 字段对齐');
const eff = (id) => A.effectOf(id);
const empty = RS.filter(r => !eff(r.pill).gain).map(r => r.pill);
ok('13 条全部能算出药效行：' + (empty.join(',') || 'ok'), empty.length === 0);

ok('金髓丸 = 精进修为 +80 修为（不是加气血上限）',
    eff('pill_jinsui').tag === '精进修为' && /修为 \+80/.test(eff('pill_jinsui').gain));
ok('黄龙丹 = 精进修为 +25', /修为 \+25/.test(eff('pill_huanglong').gain));
ok('凝元丹 = 精进修为 +40', /修为 \+40/.test(eff('pill_ningyuan').gain));
ok('聚灵丹 = 疗伤回元、回血 120（不是加修为）',
    eff('pill_juling').tag === '疗伤回元' && /气血回复 120/.test(eff('pill_juling').gain));
ok('续骨丹 = 易筋洗髓、上限 +25（真正加气血上限的那个）',
    eff('pill_xugu').tag === '易筋洗髓' && /气血上限 \+25/.test(eff('pill_xugu').gain));
ok('延寿丹 = 延寿续命、大限 +10 年', /寿元大限 \+10 年/.test(eff('pill_yanshou').gain));
ok('清心丹 = 凝神定心、心境 +5', /心境 \+5/.test(eff('pill_qingxin').gain));
ok('养魂丹 = 温养神魂、神识 +10', /神识 \+10/.test(eff('pill_yanghun').gain));
ok('化煞丹 = 化煞清灵、煞气 -20', /煞气 -20/.test(eff('pill_huasha').gain));
ok('玄元丹 = 疗愈暗伤、根除燃寿暗伤', /根除燃寿暗伤/.test(eff('pill_xuanyuan').gain));

// ---------- ③ 突破丹：读配置，改配置文案跟着变 ----------
section('③ 突破丹：成功率 / 反噬 / 免死全部读 DATA.ZHUJI、DATA.JIEDAN');
const zhujiGain = eff('pill_zhuji').gain;
const zpGain = eff('pill_zhengpin').gain;
const jdGain = eff('pill_jiedan').gain;
ok('筑基丹报 25% 起步：' + zhujiGain, /突破筑基 25% 起步/.test(zhujiGain));
ok('筑基丹说明失败不身陨', /失败不身陨/.test(zhujiGain));
ok('筑基丹报反噬 -20%', /反噬 -20%/.test(zhujiGain));
ok('正品筑基丹报 45% 起步：' + zpGain, /突破筑基 45% 起步/.test(zpGain));
ok('正品筑基丹报反噬 -80%', /反噬 -80%/.test(zpGain));
ok('凝丹报 35% 起步且免死：' + jdGain, /突破结丹 35% 起步/.test(jdGain) && /失败不身陨/.test(jdGain));
ok('三张突破丹标签都是「突破重宝」',
    ['pill_zhuji', 'pill_zhengpin', 'pill_jiedan'].every(id => eff(id).tag === '突破重宝'));

// 反向对照：把配置改掉，文案必须跟着走（证明不是抄死在文案里）
const _c0 = D.ZHUJI.pill.chance, _d0 = D.ZHUJI.pill.dmgMul, _e0 = D.ZHUJI.pill.deathMul;
D.ZHUJI.pill.chance = 0.30; D.ZHUJI.pill.dmgMul = 1; D.ZHUJI.pill.deathMul = 1;
const changed = eff('pill_zhuji').gain;
ok('改配置为 30% 后文案变 30%（反向对照）：' + changed, /突破筑基 30% 起步/.test(changed));
ok('反噬倍率改为 1 时不再提减免', !/反噬 -/.test(changed));
ok('deathMul 非 0 时不再说免死', !/失败不身陨/.test(changed));
D.ZHUJI.pill.chance = _c0; D.ZHUJI.pill.dmgMul = _d0; D.ZHUJI.pill.deathMul = _e0;
ok('配置改回后文案复原', /突破筑基 25% 起步/.test(eff('pill_zhuji').gain));

// ---------- ④ 丹毒渐抗：开炉前就看到本颗实得 ----------
section('④ 丹毒渐抗：服过之后本颗实得写在卡片上');
const p = P();
ok('新局首颗不显示抗药提示（未服过）', !/已服/.test(eff('pill_jinsui').gain));
p.pillExpCount = p.pillExpCount || {};
p.pillExpCount.pill_jinsui = 4;            // 已服 4 颗 → mult = 1-(4-2)*0.15 = 0.70
const g4 = eff('pill_jinsui').gain;
ok('已服 4 颗时标出「已服 4 颗」：' + g4, /已服 4 颗/.test(g4));
ok('本颗实得 = round(80×0.70) = +56', /本颗实得 \+56/.test(g4));
ok('标出抗药倍率 ×0.70', /×0\.70/.test(g4));
p.pillExpCount.pill_jinsui = 30;           // 深抗：地板 30%
const g30 = eff('pill_jinsui').gain;
ok('服到 30 颗时地板 30%（+24）', /本颗实得 \+24/.test(g30) && /×0\.30/.test(g30));
delete p.pillExpCount;

// ---------- ⑤ 渲染层：每张卡片都有药效行 ----------
section('⑤ 炼丹面板渲染：13 张卡片张张有药效行');
p.realmIndex = 5;                           // 练气三层之上，丹炉已开
p.recipes = p.recipes || {};
U.tab = 'alchemy';
U.renderAlchemy();
const box = els['recipe-list'];
ok('配方列表渲染出 13 行', box && box.children.length === 13);

const cards = box.children.map(row => ({ cls: row.className, html: row.children[0] ? row.children[0]._html : '' }));
const withEff = cards.filter(c => c.html.indexOf('recipe-effect') >= 0);
ok('每张卡片都带 .recipe-effect：' + withEff.length + '/13', withEff.length === 13);
ok('卡片里带分类标签 .recipe-tag', cards.every(c => c.html.indexOf('recipe-tag') >= 0));
ok('卡片里带准数 .recipe-gain', cards.every(c => c.html.indexOf('recipe-gain') >= 0));
ok('药效行排在材料行之后（先料后效）',
    cards.every(c => c.html.indexOf('炉火灵石') < 0 || c.html.indexOf('炉火灵石') < c.html.indexOf('recipe-effect')));
ok('金髓丸卡片写着「修为 +80」', cards.some(c => /金髓丸/.test(c.html) && /修为 \+80/.test(c.html)));
ok('聚灵丹卡片写着「气血回复 120」', cards.some(c => /聚灵丹/.test(c.html) && /气血回复 120/.test(c.html)));

// 未得丹方的卡片（本轮新局 7 条 locked）也必须写明药效
const lockedCards = cards.filter(c => c.html.indexOf('未得丹方') >= 0);
ok('未得丹方的卡片同样写明药效（' + lockedCards.length + ' 张）',
    lockedCards.length > 0 && lockedCards.every(c => c.html.indexOf('recipe-effect') >= 0));

// ---------- ⑥ 健壮性 ----------
section('⑥ 边界');
ok('未知丹药不炸、返回空药效', (() => { const e = A.effectOf('no_such_pill'); return e && e.gain === ''; })());
ok('_harmTxt 对空配置返回空串', A._harmTxt(null) === '');
ok('没有 pageerror / console.error', errors.length === 0);

console.log('\n==========================================');
console.log('  通过 ' + pass + ' / 失败 ' + fail);
if (fail) { console.log('  失败项：\n   - ' + fails.join('\n   - ')); process.exit(1); }
console.log('  炼丹面板药效说明：全部通过');
