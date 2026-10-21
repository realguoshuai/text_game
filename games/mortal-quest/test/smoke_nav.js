'use strict';
/* =========================================================
 * test/smoke_nav.js —— 功能归类（一级分组 → 二级页签）契约测试
 *
 * 背景（真实问题）：
 *   ① 11 个页签平铺时玩家要先读懂每个系统才知道点哪个；手机上 8 个长名按钮
 *      （副本/试炼、灵宠/傀儡、图志/道碑）被挤成一字竖排。
 *   ② 高亮循环拼的是 "tab-" + key，而副本页的按钮叫 tab-fzone —— 于是副本页
 *      永远拿不到 .tab-on，成了"点了没反应"。
 *
 * 本测试锁死的约定：
 *   A. 每个 TAB_MAP 页签都必须属于且只属于一个分组（漏归类会让测试变红）
 *   B. NAV_GROUPS 里出现的页签名必须真实存在于 TAB_MAP（防拼写漂移）
 *   C. index.html 里每个页签按钮的 data-nav-group 必须是已登记的分组
 *   D. index.html 里每个页签按钮的 id 都能反查到 TAB_MAP 的 key（含 TAB_BTN 别名）
 *      —— 以后新增页签忘了归类 / 忘了别名，这里会直接报错
 *
 * 运行： node test/smoke_nav.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.resolve(__dirname, '..');
let pass = 0, fail = 0; const fails = [];
function assert(name, cond) {
    if (cond) { pass++; console.log('  \u2713 ' + name); }
    else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

/* ---------- 极简 DOM 桩：querySelectorAll 返回空，只为让 ui.js 能载入 ---------- */
function El(id) {
    this.id = id; this.style = {}; this.children = [];
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    this.dataset = {}; this.scrollTop = 0; this._html = '';
}
El.prototype.appendChild = function (c) { this.children.push(c); return c; };
El.prototype.removeChild = function () {};
El.prototype.addEventListener = function () {};
El.prototype.setAttribute = function () {};
El.prototype.getAttribute = function () { return null; };
El.prototype.querySelector = function () { return new El('q'); };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.remove = function () {};
El.prototype.focus = function () {};
Object.defineProperty(El.prototype, 'innerHTML', {
    get() { return this._html; }, set(v) { this._html = String(v); this.children = []; }
});
Object.defineProperty(El.prototype, 'innerText', {
    get() { return this._text || ''; }, set(v) { this._text = String(v); }
});

const els = {};
const sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.confirm = function () { return true; };
sandbox.alert = function () {};
sandbox.setTimeout = function () { return 0; };
sandbox.clearTimeout = function () {};
sandbox.setInterval = function () { return 0; };
sandbox.document = {
    getElementById: function (id) { return els[id] || (els[id] = new El(id)); },
    createElement: function (t) { return new El(t || 'div'); },
    querySelector: function () { return new El('q'); },
    querySelectorAll: function () { return []; },
    addEventListener: function () {},
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

const FILES = [
    'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/skills.js',
    'data/skills_foundation.js', 'data/items_foundation.js',
    'data/events.js', 'data/world.js', 'data/worldmap.js', 'data/content.js',
    'data/qixuan_events.js', 'data/demon_war_events.js', 'data/dungeon_heisha.js', 'data/wild_dungeons.js',
    'js/state.js', 'js/storage.js', 'js/combat.js', 'js/core.js', 'js/time.js', 'js/plot.js', 'js/mortality.js',
    'js/market.js', 'js/map.js', 'js/sect.js', 'js/puppet.js', 'js/insect.js', 'js/cave2.js',
    'js/cultivation.js', 'js/alchemy.js', 'js/bottle.js', 'js/bonds.js',
    'js/dungeon_heisha.js', 'js/hunt.js', 'js/goals.js', 'js/review.js',
    'js/blackmarket.js', 'js/codex.js', 'js/home.js',
    'js/moments.js', 'js/tips.js', 'ui.js'
];
for (const f of FILES) {
    const p = f === 'ui.js' ? path.join(BASE, 'js', 'ui.js') : path.join(BASE, f);
    vm.runInContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: f });
}
const U = sandbox.GAME.UI;

section('① 分组表存在且结构完整');
assert('NAV_GROUPS 已定义', Array.isArray(U.NAV_GROUPS));
assert('分组数 = 4（修行/游历/身家/宗门）', U.NAV_GROUPS.length === 4);
assert('每组都有 id 与非空 tabs', U.NAV_GROUPS.every(g => g.id && Array.isArray(g.tabs) && g.tabs.length > 0));

section('② A：每个页签都必须被归类，且只归一组');
const tabKeys = Object.keys(U.TAB_MAP);
const seen = {};
let dup = [];
U.NAV_GROUPS.forEach(g => g.tabs.forEach(t => {
    if (seen[t]) dup.push(t + '(' + seen[t] + '/' + g.id + ')');
    seen[t] = g.id;
}));
const orphan = tabKeys.filter(k => !seen[k]);
assert('无未归类的孤儿页签：' + (orphan.join(',') || '无'), orphan.length === 0);
assert('无重复归属的页签：' + (dup.join(',') || '无'), dup.length === 0);

section('③ B：分组里写的页签名必须真实存在');
const ghost = [];
U.NAV_GROUPS.forEach(g => g.tabs.forEach(t => { if (!U.TAB_MAP[t]) ghost.push(g.id + '.' + t); }));
assert('无幽灵页签（拼错会在这里露出来）：' + (ghost.join(',') || '无'), ghost.length === 0);

section('④ groupOf() 映射正确');
const want = {
    map: 'travel', market: 'travel', secret: 'travel', dungeon: 'travel',
    home: 'cultivate', alchemy: 'cultivate', skill: 'cultivate',
    bag: 'self', companion: 'self', codex: 'self',
    sect: 'sect'
};
let bad = [];
Object.keys(want).forEach(k => { if (U.groupOf(k) !== want[k]) bad.push(k + '→' + U.groupOf(k) + '(期望' + want[k] + ')'); });
assert('11 个页签归类全部正确：' + (bad.join(' ') || 'ok'), bad.length === 0);
assert('未知页签兜底为游历（不返回 undefined）', U.groupOf('__not_a_tab__') === 'travel');

section('⑤ D：页签按钮 id 必须能反查 TAB_MAP（副本别名历史 bug 的回归守卫）');
assert('TAB_BTN.dungeon 指向 fzone', U.TAB_BTN && U.TAB_BTN.dungeon === 'fzone');
const revBtn = {};
Object.keys(U.TAB_MAP).forEach(k => { revBtn[U.TAB_BTN[k] || k] = k; });
assert('dungeon 可通过 fzone 反查', revBtn['fzone'] === 'dungeon');
assert('map 可通过 map 反查', revBtn['map'] === 'map');

section('⑥ C/D：index.html 契约（新增页签忘了归类会变红）');
const html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf8');
const navBlock = (function () {
    const i = html.indexOf('id="nav"');
    if (i < 0) return '';
    const j = html.indexOf('id="panel-area"');
    return html.slice(i, j > i ? j : html.length);
})();
assert('index.html 里找到 #nav 区块', navBlock.length > 0);

const btnRe = /<button[^>]*id="tab-([a-z0-9-]+)"[^>]*>/g;
const htmlTabs = [];
let m;
while ((m = btnRe.exec(navBlock))) {
    const tag = m[0];
    const gm = /data-nav-group="([^"]+)"/.exec(tag);
    const idNum = m[1];
    htmlTabs.push({ btn: idNum, key: revBtn[idNum], group: gm ? gm[1] : null });
}
assert('解析到页签按钮数 = 11（8 个旧 + 丹炉/功法/门派三个新入口）', htmlTabs.length === 11);

const noKey = htmlTabs.filter(t => !t.key).map(t => 'tab-' + t.btn);
assert('每个按钮都能反查到页签 key：' + (noKey.join(',') || '无'), noKey.length === 0);

const noGroup = htmlTabs.filter(t => !t.group).map(t => 'tab-' + t.btn);
assert('每个按钮都标了 data-nav-group：' + (noGroup.join(',') || '无'), noGroup.length === 0);

const gids = U.NAV_GROUPS.map(g => g.id);
const badGroup = htmlTabs.filter(t => t.group && gids.indexOf(t.group) < 0).map(t => 'tab-' + t.btn + '→' + t.group);
assert('data-nav-group 都是已登记分组：' + (badGroup.join(',') || '无'), badGroup.length === 0);

const mismatch = htmlTabs.filter(t => t.key && t.group && U.groupOf(t.key) !== t.group)
    .map(t => 'tab-' + t.btn + ' 标' + t.group + ' 实为' + U.groupOf(t.key));
assert('HTML 标注与 groupOf 一致：' + (mismatch.join('; ') || '无'), mismatch.length === 0);

const missingInHtml = tabKeys.filter(k => {
    const id = U.TAB_BTN[k] || k;
    return !htmlTabs.some(t => t.btn === id);
});
assert('TAB_MAP 的每个页签在 HTML 里都有按钮：' + (missingInHtml.join(',') || '无'), missingInHtml.length === 0);

console.log('\n' + '='.repeat(52));
console.log('结果： ' + pass + ' / ' + (pass + fail) + ' 通过' + (fail ? '，失败 ' + fail + ' 项：' + fails.join('；') : ''));
console.log('='.repeat(52));
process.exit(fail ? 1 : 0);
