/* =========================================================
 * test/smoke_dungeon_guard.js —— 秘境空间隔离：进去了就做不得洞府功课
 *
 * 锁死本轮四条规则：
 *   ① 判据唯一：State.inDungeon() 由 fzone / trial / relic / hunt 现算，p.inDungeon 只是镜像
 *   ② 动作拦停：meditate / meditateTimes / catalyze / alchemy / explore / Time.seclude 一律拒绝，
 *      且不推进任何状态（修为、寿元、灵液、物品全部原地不动）
 *   ③ 界面置灰：中栏闭关/连修/催熟/炼丹/历练按钮 disabled，页签与一级分组同样锁死
 *   ④ 出秘境即恢复：p.fzone 清空的下一帧，按钮与页签全部回可用
 * 运行： node test/smoke_dungeon_guard.js
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

/* ================= 骨架（与 smoke_herb_alarm 同一套假 DOM） ================= */
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
/* data-why 用的 setAttribute/getAttribute 要在假 DOM 里真存真取，否则断言会假绿 */
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

const logs = [];
const _log = U.log.bind(U);
U.log = function (msg, type, fold) {
    logs.push({ msg: String(msg), type: type || 'info' });
    return _log(msg, type, fold);
};
const joined = (arr) => arr.map(l => l.msg).join('｜');
const WHY = '无法分心闭关与催熟药圃';

/* 沙箱新局 Qixuan.active() 可能为真，会以「剧情进行中」把按钮一并置灰——先摘掉，才验得准 */
G.Qixuan.active = () => false;
G.DATA.MAP_ENCOUNTERS.chance = 0;
U.started = true;
const p = S.createNewPlayer('wanderer');
U.updateUI();

/* ================= ① 判据：State.inDungeon 唯一出口 ================= */
section('① 判据：四处秘境状态 → 一个 inDungeon');
ok('洞府之中不是秘境', S.inDungeon(p) === false && p.inDungeon === false);
ok('秘境名称为空串（不是 undefined）', S.dungeonName(p) === '');

p.fzone = { herbs: {}, restLeft: 2 }; S.p();
ok('血色禁地 → inDungeon 为真', p.inDungeon === true);
ok('报出的是血色禁地', S.dungeonName(p) === '血色禁地');

p.fzone = null; p.trial = { stepsLeft: 5 }; S.p();
ok('血月试炼 → 血月试炼', p.inDungeon === true && S.dungeonName(p) === '血月试炼');

p.trial = null; p.relic = { stepsLeft: 3 }; S.p();
ok('古修遗迹 → 古修遗迹', p.inDungeon === true && S.dungeonName(p) === '古修遗迹');

p.relic = null; p.hunt = { id: 'hunt_heishikuang', wave: 1 }; S.p();
ok('狩猎副本取真名（黑石矿洞）', p.inDungeon === true && S.dungeonName(p) === '黑石矿洞');

p.hunt = null; S.p();
ok('出秘境即刻归零（不靠手写复位）', p.inDungeon === false && S.inDungeon(p) === false);

/* ================= ② 动作拦停：一律不推进状态 ================= */
section('② 动作拦停：闭关 / 连修 / 催熟 / 炼丹 / 历练 / 闭关档位');
p.fzone = { herbs: {}, restLeft: 2 }; S.p();
p.currentExp = 10; p.totalMonths = 200; p.liquid = 5;
const exp0 = p.currentExp, m0 = p.totalMonths, liq0 = p.liquid;
const herb0 = S.countItem('herb_bainian');

logs.length = 0;
G.Core.meditate();
ok('打坐被拒（修为不动）', p.currentExp === exp0);
ok('寿元不动（没偷偷推月份）', p.totalMonths === m0);
ok('回执写明秘境', joined(logs).includes('血色禁地') && joined(logs).includes(WHY));

logs.length = 0;
const done = G.Core.meditateTimes(5);
ok('连修返回 0 次', done === 0 && p.currentExp === exp0);
ok('连修只回执一条，不刷屏', logs.length === 1);

logs.length = 0;
G.Core.catalyze(1, 'herb_bainian');
ok('催熟被拒（灵液不扣）', p.liquid === liq0);
ok('催熟被拒（没白得灵药）', S.countItem('herb_bainian') === herb0);
ok('催熟回执同一句话', joined(logs).includes(WHY));

logs.length = 0;
const sec = G.Time.seclude('mid');
ok('闭关档位入不得定', sec === false && p.totalMonths === m0);
ok('闭关回执同一句话', joined(logs).includes(WHY));

logs.length = 0;
const ex0 = p.stats.explores;
G.Core.explore();
ok('外出历练被拒（次数不动）', p.stats.explores === ex0);
ok('历练回执同一句话', joined(logs).includes(WHY));

logs.length = 0;
const stones0 = p.spiritStones;
G.Core.alchemy(0);
ok('开炉炼丹在秘境里先被拦（不回落到药材不齐）', joined(logs).includes(WHY) && p.spiritStones === stones0);

/* ================= ③ 界面：按钮置灰 + 页签锁死 ================= */
section('③ 界面置灰与页签锁死');
p.realmIndex = 13;                    // 让丹炉/副本的条件锁不掺进来
logs.length = 0;
U.updateUI();
ok('闭关打坐置灰', els['btn-meditate'].disabled === true);
ok('连修 5 次置灰', els['btn-meditate-5'].disabled === true);
ok('连修 10 次置灰', els['btn-meditate-10'].disabled === true);
ok('直修圆满置灰', els['btn-meditate-full'].disabled === true);
ok('催熟百年灵药置灰', els['btn-catalyze-bainian'].disabled === true);
ok('催熟灵木置灰（另外三档同尺子）', els['btn-catalyze-wood'].disabled === true);
ok('开炉炼丹置灰', els['btn-alchemy'].disabled === true);
ok('外出历练置灰', els['btn-explore'].disabled === true);
ok('禁地之内还想去坊市？置灰', els['btn-market'].disabled === true);
/* 六七个按钮同因：按钮内小字只写短句（照旧例「战斗/事件未了」），整句挂 title 供悬停 */
ok('按钮内小字是短句（不铺满行动栏）',
    String(els['btn-meditate'].getAttribute('data-why') || '') === '秘境之中，无从闭关');
ok('整句挂在原生 title（悬停即见原话）',
    String(els['btn-meditate'].title || '').includes(WHY) && String(els['btn-explore'].title || '').includes(WHY));
ok('丹炉副标题也换成秘境短话', String(els['alchemy-sub'].innerText).includes('秘境之中'));
ok('页签已置灰（副本页本身也点不开）', els['tab-home'].disabled === true && els['tab-market'].disabled === true);

const tab0 = U.tab;
logs.length = 0;
U.switchTab('home');
ok('程序内切页同样被拦（tab 未变）', U.tab === tab0);
ok('切页回执说明秘境', joined(logs).includes('秘境中') && joined(logs).includes('走不得'));
ok('没有 pageerror', errors.length === 0);

/* ================= ④ 出秘境即恢复 ================= */
section('④ 出秘境（p.fzone = null）→ 一切复原');
p.fzone = null; S.p();
U.updateUI();
ok('打坐恢复可点', els['btn-meditate'].disabled === false);
ok('催熟恢复可点（灵液够时）', els['btn-catalyze-bainian'].disabled === false);
ok('外出历练恢复可点', els['btn-explore'].disabled === false);
logs.length = 0;
U.switchTab('home');
ok('页签恢复可切', U.tab === 'home');

/* ================= ⑤ 入秘境即收功：定时闭关的钟不能带进去 ================= */
section('⑤ 入秘境自动收功（否则 600ms 一次空回执刷屏）');
p.realmIndex = 9;                      // 血色禁地是练气期专属：筑基后「境界超限·天地禁制排斥」，这里用练气十层验「入秘境即收功」
p.fzone = null; p.cd = null; p.totalMonths = 0;
p.currentExp = 0;
G.Core._autoTimer = 4321;             // 假 DOM 的 setInterval 返回 0，这里手挂一个假句柄
ok('前置：持续闭关正在运行', G.Core.autoCultRunning() === true);
logs.length = 0;
G.FZone.start();
ok('已入血色禁地', !!p.fzone);
ok('持续闭关被撤钟', G.Core.autoCultRunning() === false && G.Core._autoTimer === null);
ok('收功日志落在见闻录', /持续闭关中止/.test(joined(logs)));
ok('p.inDungeon 随状态即刻为真', p.inDungeon === true);

console.log('\n' + '='.repeat(52));
console.log('dungeon_guard: pass=' + pass + ' fail=' + fail);
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
