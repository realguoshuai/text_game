'use strict';
/* =========================================================
 * test/smoke_bag_tabs.js —— 行囊分类页签 + 新物品置顶/【新】角标
 *
 * 锁死本轮三件事：
 *   ① 类型 → 组 的唯一映射：每个物品定归一组，未知类型落「秘宝/特殊」，
 *      「全部」永远等于全库——任何物品都不许在页签里人间蒸发
 *   ② 过滤：点页签只渲染该组；空组给「此分类下暂无物品」而不是空白
 *   ③ 新物品：addItem 打标 → 置顶 + 朱砂【新】；点一下或用光即消；旧存档缺字段不炸
 *
 * 运行： node test/smoke_bag_tabs.js
 * ========================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');

let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  \u2713 ' + name); }
    else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n' + t); }

/* ---------- 假 DOM（与 smoke_plot_hub 同款） ---------- */
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
    this.onclick = null; this.title = '';
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
El.prototype.remove = function () {};
El.prototype.contains = function () { return false; };
El.prototype.focus = function () {};
El.prototype.scrollIntoView = function () {};
Object.defineProperty(El.prototype, 'className', { get() { return this._cls; }, set(v) { this._cls = String(v); } });
Object.defineProperty(El.prototype, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = String(v); this.children = []; }
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
const D = G.DATA;

U.started = true;
G.State.createNewPlayer();
const P = () => G.State.p();
const rows = () => (els['bag-list'] ? els['bag-list'].children : []);
const tabs = () => (els['bag-tabs'] ? els['bag-tabs'].children : []);
const tabOf = (name) => tabs().filter(b => b.innerText === name)[0];
const rowText = (r) => r.children.map(c => c.innerHTML + '|' + c.innerText).join(' ');

/* ================= ① 分组映射 ================= */
section('① 类型 → 组：唯一映射，绝不漏人');
ok('页签就是这五个（全部/丹药灵物/符箓法器/材料杂物/秘宝特殊）',
    JSON.stringify(U.BAG_TABS.map(t => t.name)) === JSON.stringify(['全部', '丹药/灵物', '符箓/法器', '材料/杂物', '秘宝/特殊']),
    U.BAG_TABS.map(t => t.name));
ok('页签 id 顺序固定', U.BAG_TABS.map(t => t.id).join(',') === 'all,pill,gear,mat,rare');

const spot = [['pill_huanglong', 'pill'], ['herb_bainian', 'pill'], ['poison_mortal', 'pill'],
              ['talisman_dici', 'gear'], ['artifact_qingwen', 'gear'], ['mirror_armor', 'gear'],
              ['zimu_ren', 'gear'], ['fubao_lvhuang', 'gear'], ['mirror_short_sword', 'gear'],
              ['ore', 'mat'], ['junk_scrap', 'mat'], ['spirit_stone', 'mat'], ['artifact_frag', 'mat'],
              ['pouch_zhuji', 'rare'], ['shengxian_ling', 'rare'], ['skill_kongwu', 'rare'], ['recipe_ningyuan', 'rare']];
spot.forEach(function (pair) {
    var id = pair[0], want = pair[1];
    var it = D.ITEMS[id];
    if (!it) { ok('抽样物品存在：' + id, false); return; }
    ok('抽样 ' + id + '（type=' + it.type + '）→ ' + want, U.bagGroupOf(it) === want, U.bagGroupOf(it));
});

ok('未知类型（日后新加）一律落 rare，不许丢', U.bagGroupOf({ type: 'brand_new_type' }) === 'rare');
ok('空物品也不炸', U.bagGroupOf(null) === 'rare');

const bad = [];
Object.keys(D.ITEMS).forEach(function (id) {
    var it = D.ITEMS[id], g = U.bagGroupOf(it);
    if (['pill', 'gear', 'mat', 'rare'].indexOf(g) < 0) bad.push(id + '→' + g);
});
ok('全库物品的归属都在四个实体组之内（共 ' + Object.keys(D.ITEMS).length + ' 件）', bad.length === 0, bad);

const lostInAll = Object.keys(D.ITEMS).filter(function (id) { return !U.bagMatch(D.ITEMS[id], 'all'); });
ok('「全部」永不打折：全库都能匹配', lostInAll.length === 0, lostInAll);

const multi = Object.keys(D.ITEMS).filter(function (id) {
    var it = D.ITEMS[id];
    return ['pill', 'gear', 'mat', 'rare'].filter(function (g) { return U.bagMatch(it, g); }).length !== 1;
});
ok('每件物品只归一个实体组（不重不漏）', multi.length === 0, multi);

/* ================= ② 置顶排序 ================= */
section('② bagSort：新的在前，其余保持原序');
ok('两条新物品排到最前（相对顺序不变）',
    U.bagSort(['a', 'b', 'c', 'd'], { b: 1, d: 1 }).join(',') === 'b,d,a,c',
    U.bagSort(['a', 'b', 'c', 'd'], { b: 1, d: 1 }));
ok('没有新物品时原样不动', U.bagSort(['a', 'b', 'c'], {}).join(',') === 'a,b,c');
ok('没有 newItems 字段（旧档）也不炸', U.bagSort(['a', 'b'], undefined).join(',') === 'a,b');
ok('不就地改动传入数组', (function () { var arr = ['a', 'b']; U.bagSort(arr, { b: 1 }); return arr.join(',') === 'a,b'; })());

/* ================= ③ 新物品标记 ================= */
section('③ addItem 打标 / removeItem 销标');
P().inventory = {}; P().newItems = {};
G.State.addItem('pill_huanglong', 2);
ok('新入袋的道具打上【新】', P().newItems['pill_huanglong'] === 1);
G.State.addItem('pill_huanglong', 1);
ok('再叠加几件仍是【新】（不会因为数量变动而消标）', P().newItems['pill_huanglong'] === 1 && P().inventory['pill_huanglong'] === 3);
G.State.addItem('ore', 1);
ok('只标新收的那件', !!P().newItems['ore'] && Object.keys(P().newItems).length === 2);
G.State.removeItem('pill_huanglong', 1);
ok('用掉一部分不销标（袋里还剩）', P().newItems['pill_huanglong'] === 1);
G.State.removeItem('pill_huanglong', 2);
ok('用光了才销标', !P().newItems['pill_huanglong'] && !P().inventory['pill_huanglong']);

P().newItems = undefined;                       // 模拟旧档：没有这个字段
G.State.addItem('talisman_dici', 1);
ok('旧档缺 newItems 字段 → 自动补上，不炸', !!P().newItems && P().newItems['talisman_dici'] === 1);

/* ================= ④ 过滤渲染 ================= */
section('④ renderBag：页签过滤 + 空组提示');
function seed() {
    P().inventory = { pill_huanglong: 2, talisman_dici: 1, ore: 3, pouch_zhuji: 1 };
    P().newItems = {};
    U._bagTab = 'all';
    U._bagTabsSig = null;
    U.renderBag();
}
seed();
ok('五个页签都画出来了', tabs().length === 5, tabs().length);
ok('默认选中「全部」', tabOf('全部').className.indexOf('is-on') >= 0);
ok('全部 → 4 行', rows().length === 4, rows().length);
var counts = tabs().map(b => b.innerText + b.children[0].innerText);
ok('各组件数：全部4 / 丹药1 / 符箓1 / 材料1 / 秘宝1',
    counts.join(' ') === '全部4 丹药/灵物1 符箓/法器1 材料/杂物1 秘宝/特殊1', counts);

U._bagTab = 'pill'; U._bagTabsSig = null; U.renderBag();
ok('丹药页 → 只剩 1 行且是黄龙丹', rows().length === 1 && /黄龙丹/.test(rowText(rows()[0])), rows().length);
ok('丹药页不出现符箓', !/地刺符/.test(rowText(rows()[0])));

U._bagTab = 'gear'; U._bagTabsSig = null; U.renderBag();
ok('符箓页 → 只剩地刺符', rows().length === 1 && /地刺符/.test(rowText(rows()[0])));

U._bagTab = 'mat'; U._bagTabsSig = null; U.renderBag();
ok('材料页 → 只剩矿石', rows().length === 1 && /矿石/.test(rowText(rows()[0])));

U._bagTab = 'rare'; U._bagTabsSig = null; U.renderBag();
ok('秘宝页 → 只剩储物袋', rows().length === 1 && /储物袋/.test(rowText(rows()[0])));
ok('秘宝页仍带着禁制门槛行', /需神识 25/.test(rowText(rows()[0])));

// 空组：清空丹药
P().inventory = { ore: 1 }; P().newItems = {};
U._bagTab = 'pill'; U._bagTabsSig = null; U.renderBag();
ok('空组给「此分类下暂无物品」而不是空白',
    /此分类下暂无物品/.test(els['bag-list'].innerHTML), els['bag-list'].innerHTML);

// 非法页签值回落 all
U._bagTab = 'nope'; U._bagTabsSig = null; U.renderBag();
ok('非法页签值回落「全部」', U._bagTab === 'all' && rows().length === 1);

// 全空袋子
P().inventory = {}; U._bagTab = 'all'; U._bagTabsSig = null; U.renderBag();
ok('空袋子仍给「储物袋空空如也」', /储物袋空空如也/.test(els['bag-list'].innerHTML));
ok('空袋子页签照样在（不塌成空栏）', tabs().length === 5);

/* ================= ⑤ 置顶 + 【新】角标 ================= */
section('⑤ 新物品置顶 + 朱砂【新】，点过即消');
P().inventory = { pill_huanglong: 1, ore: 1 };
P().newItems = {};
U._bagTab = 'all'; U._bagTabsSig = null; U.renderBag();
var firstBefore = rowText(rows()[0]);
ok('原本第一行是黄龙丹', /黄龙丹/.test(firstBefore), firstBefore);

G.State.addItem('pill_jinsui', 1);              // 新炼出的金髓丸
U._bagTabsSig = null; U.renderBag();
ok('新物品置顶：金髓丸跳到第一行', /金髓丸/.test(rowText(rows()[0])), rowText(rows()[0]));
ok('置顶那行带朱砂【新】角标', /bag-new/.test(rowText(rows()[0])) && /【新】/.test(rowText(rows()[0])));
ok('老物品不带【新】', !/【新】/.test(rowText(rows()[1])));
ok('结算面板/角标只在背包行里出现', /bag-new/.test(rows()[0].children[0].innerHTML));

var newRow = rows()[0];
newRow.onclick();                               // 玩家点了一下（看描述）
ok('点一下即销标', !P().newItems['pill_jinsui']);
ok('销标后不再置顶（回到原序）', /黄龙丹/.test(rowText(rows()[0])), rowText(rows()[0]));
ok('销标后角标消失', !/【新】/.test(rowText(rows()[0])));

// 页签切换不丢置顶：新物品在本组里也排最前
G.State.addItem('talisman_dici', 1);
U._bagTab = 'gear'; U._bagTabsSig = null; U.renderBag();
ok('分类页里新物品同样置顶', /地刺符/.test(rowText(rows()[0])), rowText(rows()[0]));

/* ================= ⑥ 无副作用 ================= */
section('⑥ 健壮性');
ok('渲染过程没抛错（console.error 为空）', errors.length === 0, errors.slice(0, 2));
ok('页签数量与 BAG_TABS 一致（不多不少）', tabs().length === U.BAG_TABS.length);
ok('每个页签都带 data-bag-tab（可点可测）',
    tabs().every(b => !!b.getAttribute('data-bag-tab')));

console.log('\n================ 结果：' + pass + ' 通过 / ' + fail + ' 失败 ================');
if (fail) { console.log('失败清单：\n - ' + fails.join('\n - ')); process.exit(1); }
