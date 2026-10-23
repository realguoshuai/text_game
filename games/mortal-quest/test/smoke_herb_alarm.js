/* =========================================================
 * test/smoke_herb_alarm.js —— 灵药出手：百年可售的代价 / 千年露白的劫杀
 *
 * 锁死本轮四条规则：
 *   ① 百年灵药可卖（专属价 120）→ 药香泄露 +30（封顶 leakCaught）＋【黑市神识锁定】觊觎 +25
 *   ② 千年灵药"挂得上价、卖不出去"：坊市/散修坊市/黑市一律拦截，不扣物、不入账
 *   ③ 拦截后弹窗（herbPending）→ 迎战走 Combat.start 的 herbalarm 路由；弃药则灵药被夺、人重伤
 *   ④ 战胜：灵药保住 + 反向摸尸（额外灵石 + 中阶灵石 + 觊觎归零）；战败：灵药被夺
 * 运行： node test/smoke_herb_alarm.js
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

/* ================= 骨架（与 smoke_trade_guard 同一套假 DOM） ================= */
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
El.prototype.setAttribute = function () {};
El.prototype.getAttribute = function () { return null; };
El.prototype.hasAttribute = function () { return false; };
El.prototype.getElementsByTagName = function () { return []; };
El.prototype.querySelector = function () { return null; };
El.prototype.querySelectorAll = function () { return []; };
El.prototype.removeAttribute = function () {};
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
const HA = G.HerbAlarm;

const logs = [];
const _log = U.log.bind(U);
U.log = function (msg, type, fold) {
    logs.push({ msg: String(msg), type: type || 'info' });
    return _log(msg, type, fold);
};
const joined = (arr) => arr.map(l => l.msg).join('｜');

U.started = true;
const p = G.State.createNewPlayer('wanderer');
G.DATA.MAP_ENCOUNTERS.chance = 0;
U.updateUI();

/* ================= ① 百草旁白：怪物与弹窗件齐备 ================= */
section('① 事件装配：怪物 / 弹窗 / 脚本一条不缺');
const amb = G.DATA.MONSTERS.filter(m => m.id === HA.AMBUSH)[0];
ok('筑基邪修已入怪物表', !!amb);
ok('邪修是筑基级（majorRealm 1，久战有压制感）', !!amb && amb.majorRealm === 1);
ok('邪修不判死（killChance 0，走折寿失财的险死还生）', !!amb && amb.killChance === 0);
ok('劫杀弹窗 DOM 已就位', !!els['herb-alarm-modal']);
// 假 DOM 只在 getElementById 时才生成节点，这里直接核源文件里的 id
ok('弹窗按钮 id 对齐（迎战 / 弃药）',
    html.includes('id="btn-herb-fight"') && html.includes('id="btn-herb-flee"'));

/* ================= ② 百年灵药：可卖，代价是药香 ================= */
section('② 百年灵药：专属价 120，卖完留味（泄露 +30 / 觊觎 +25）');
ok('百年灵药已开放出售', G.Market.canSell('herb_bainian') === true);
ok('专属收货价 120（不按杂物五折）', G.Market.gainOf('herb_bainian') === 120);
ok('散修坊市报同一个价（不另报一个数）', G.Tainan.sellPrice('herb_bainian') === 120);

p.atMarket = true;
p.leak = 0; p.marketRiskValue = 0; p.riskWarned = false;
G.State.addItem('herb_bainian', 2);
const st0 = p.spiritStones;
logs.length = 0;
G.Market.sell('herb_bainian');
ok('卖出一株（2 → 1）', G.State.countItem('herb_bainian') === 1);
ok('进账 120 灵石', p.spiritStones === st0 + 120);
ok('药香泄露 +30', p.leak === 30);
ok('觊觎 +25', p.marketRiskValue === 25);
ok('日志点明药香泄露', /药香泄露 \+30/.test(joined(logs)));
ok('日志点明黑市神识锁定', /黑市神识锁定/.test(joined(logs)));
ok('交易日志仍走【交易】', logs.some(l => l.type === 'trade'));

// 封顶：不会出现 130/80 这种读不懂的数字
p.leak = 90;
G.State.addItem('herb_bainian', 1);
G.Market.sell('herb_bainian');
ok('泄露值封顶在 leakCaught（90 + 30 → 100）', p.leak === 100);

/* ================= ③ 千年灵药：坊市拦截 ================= */
section('③ 千年灵药：挂得上价，卖不出去（不扣物、不入账）');
G.State.addItem('herb_qiannian', 1);
p.spiritStones = 500; p.leak = 0; p.marketRiskValue = 0;
p.herbPending = null;
logs.length = 0;
const st1 = p.spiritStones;
G.Market.sell('herb_qiannian');
ok('灵药还在包里', G.State.countItem('herb_qiannian') === 1);
ok('灵石分文未进', p.spiritStones === st1);
ok('进入待决状态（source = market）', !!p.herbPending && p.herbPending.source === 'market');
ok('见闻录同步输出掌柜剧情', /传音符/.test(joined(logs)));
ok('觊觎因露白上升', p.marketRiskValue >= 60);
ok('弹窗已显示（sync 读 herbPending）', els['herb-alarm-modal'].style.display === '');
ok('弹窗旁白读到了货源', /药囊/.test(els['herb-alarm-note'].innerHTML));

// 黑市：同一把尺子
p.location = 'tainan_gu';
p.herbPending = null;
G.BlackMarket.sellBlack('herb_qiannian');
ok('黑市同样拦截（灵药仍在）', G.State.countItem('herb_qiannian') === 1);
ok('黑市拦截记下 source = black', !!p.herbPending && p.herbPending.source === 'black');

// 散修坊市：同一把尺子
p.herbPending = null;
G.Tainan.sell('herb_qiannian');
ok('散修坊市同样拦截（灵药仍在）', G.State.countItem('herb_qiannian') === 1);
ok('散修坊市记下 source = tainan', !!p.herbPending && p.herbPending.source === 'tainan');

/* ================= ④ 弃药保命 ================= */
section('④ 弃药：灵药被夺、人重伤，不判身陨');
const maxHp = p.maxHp;
HA.flee();
ok('灵药被夺走', G.State.countItem('herb_qiannian') === 0);
ok('待决状态已清', !p.herbPending);
ok('弹窗已收起', els['herb-alarm-modal'].style.display === 'none');
ok('人还活着', p.isDead === false);
ok('气血被压到三成（重伤）', p.currentHp === Math.max(1, Math.round(maxHp * 0.3)));
ok('挂上重伤标记', !!p.wounded);

/* ================= ⑤ 迎战：路由到劫杀战局 ================= */
section('⑤ 迎战：交给 Combat.start，归属 herbalarm');
G.State.addItem('herb_qiannian', 1);
p.herbPending = null; p.leak = 0; p.marketRiskValue = 0; p.wounded = null;
p.currentHp = maxHp;
G.Market.sell('herb_qiannian');
const _start = G.Combat.start;
let startedId = null, routedType = null;
G.Combat.start = function (id) { startedId = id; routedType = p.combatRoute && p.combatRoute.type; };
HA.fight();
G.Combat.start = _start;
ok('确实开的是劫杀战局', startedId === HA.AMBUSH);
ok('战斗归属 = herbalarm（胜负由 HerbAlarm 结算）', routedType === 'herbalarm');
ok('迎战时灵药还没被扣（保住与否取决于胜败）', G.State.countItem('herb_qiannian') === 1);
ok('待决状态已清', !p.herbPending);

/* ================= ⑥ 战胜：保药 + 反向摸尸 ================= */
section('⑥ 战胜：灵药保住，反向摸尸暴富，觊觎归零');
p.marketRiskValue = 85;
const st2 = p.spiritStones, mid0 = G.State.countItem('mid_stone');
logs.length = 0;
HA.afterCombat(true, { type: 'herbalarm', herbId: 'herb_qiannian' });
ok('灵药保住了', G.State.countItem('herb_qiannian') === 1);
ok('反向摸尸得灵石 150~300', p.spiritStones - st2 >= 150 && p.spiritStones - st2 <= 300);
ok('另得中阶灵石 ×1', G.State.countItem('mid_stone') === mid0 + 1);
ok('觊觎归零（杀鸡儆猴）', p.marketRiskValue === 0);
ok('日志点明灵药未落到旁人手上', /没落到旁人手上/.test(joined(logs)));

/* ================= ⑦ 战败：灵药被夺 ================= */
section('⑦ 战败：灵药被夺，命还在');
logs.length = 0;
HA.afterCombat(false, { type: 'herbalarm', herbId: 'herb_qiannian' });
ok('灵药被夺走', G.State.countItem('herb_qiannian') === 0);
ok('日志点明"空药囊"', /空药囊/.test(joined(logs)));

/* ================= ⑦b 战斗中遁走：人保住，药保不住 ================= */
section('⑦b 遁走成功也丢药（否则"打不过就跑"等于白拿重宝）');
G.State.addItem('herb_qiannian', 1);
p.combat = { ctx: { type: 'herbalarm', herbId: 'herb_qiannian' }, name: '筑基邪修 · 血手屠三', speed: 99, hp: 420 };
logs.length = 0;
vm.runInContext('Math.random = function () { return 0; };', sandbox);   // 必命中遁走
G.Combat.flee();
ok('战斗已结束（不在斗法态）', !p.combat);
ok('灵药随药囊脱手（逃跑分支同样被夺）', G.State.countItem('herb_qiannian') === 0);
ok('日志说明是"连滚带爬"而非"被打倒"', /连滚带爬/.test(joined(logs)));

/* ================= ⑧ 渲染完整性 ================= */
section('⑧ 渲染无异常');
p.atMarket = true;
U.updateUI();
ok('updateUI 全程无异常', errors.length === 0);
if (errors.length) console.log('    ' + errors.slice(0, 3).join('\n    '));

console.log('\n==== 结果: ' + pass + ' passed, ' + fail + ' failed ====');
if (fails.length) { console.log('失败项:'); fails.forEach(f => console.log('  - ' + f)); }
process.exit(fail > 0 ? 1 : 0);
