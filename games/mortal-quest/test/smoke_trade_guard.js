/* =========================================================
 * test/smoke_trade_guard.js —— 核心道具禁售 / 交易日志 / 突破率同源 / 坊市进出 / 盘缠兜底
 *
 * 锁死本轮 6 项修复里最容易复发的地方：
 *   ① 市集「出售杂物」绝不能把筑基丹、千年灵药、符箓、法器、秘籍、傀儡主材摆上货架
 *   ② 买卖日志走【交易】，不再冒充【获物】；批量出手只落一条总账
 *   ③ 中栏目标的「届时成功率」与「尝试突破」按钮必须同源（同一份 Breakthrough.plan）
 *   ④ 城镇入市不耗年月、文案不再是"山路迢迢"；已在市中再点只复位、不刷日志
 *   ⑤ 银两为 0 时以灵石折抵盘缠，不让身家颇丰的修士困死城中
 *   ⑥ 未入碎星海篇不显示「两强争海 · 乱星盟占上风」这类跨篇章剧透
 * 运行： node test/smoke_trade_guard.js
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

/* ================= 骨架 ================= */
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

/* 旁路记录日志（UI.log 是所有输出的唯一入口） */
const logs = [];
const _log = U.log.bind(U);
U.log = function (msg, type, fold) {
    logs.push({ msg: String(msg), type: type || 'info' });
    return _log(msg, type, fold);
};
function lastLog() { return logs[logs.length - 1] || { msg: '', type: '' }; }
function logsSince(n) { return logs.slice(n); }

U.started = true;
const p = G.State.createNewPlayer('wanderer');
G.DATA.MAP_ENCOUNTERS.chance = 0;      // 关掉路遇遇敌，让 travel 可确定复现
U.updateUI();

/* ================= ① 核心道具禁售 ================= */
section('① 出售杂物：核心战略道具一律不上货架');
const PROTECTED = [
    ['pill_zhuji', '筑基丹（常方）'], ['pill_zhengpin', '正品筑基丹（古方）'],
    ['herb_xuanbing', '五百年玄冰花'], ['herb_longlin', '千年龙鳞果'],
    ['pill_huichun', '回春散'], ['pill_huanglong', '黄龙丹'], ['pill_jinsui', '金髓丸'],
    ['talisman_huoqiu', '火球符'], ['artifact_qingyun', '下品法器'], ['skill_huoqiushu', '火球术秘籍'],
    ['recipe_ningyuan', '凝元丹方'], ['shengxian_ling', '升仙令'], ['beast_soul', '妖兽精魄'],
    ['spirit_wood', '百年灵木'], ['jinshi', '玄金石'], ['iron_ore', '玄铁矿石'],
    ['nuan_yang_bao_yu', '暖阳宝玉'], ['liquid_green', '承露瓶绿液'], ['chong_egg', '金噬虫卵']
];
let allProtected = true; const leaked = [];
PROTECTED.forEach(([id]) => { if (G.Market.canSell(id)) { allProtected = false; leaked.push(id); } });
ok('丹药/灵药/符箓/法器/秘籍/傀儡主材/宝物 全数禁售', allProtected);
if (leaked.length) console.log('    漏网：' + leaked.join(', '));
ok('废矿与凡俗杂物仍可出手（低阶矿石 / 废铁）',
    G.Market.canSell('ore') === true && G.Market.canSell('junk_scrap') === true);
ok('灵石本身不可出售（货币除外）', G.Market.canSell('mid_stone') === false);
// 本轮放开：百年灵药换厚利（代价是药香），千年灵药"挂得上价、卖不出去"（出手即劫杀）
ok('百年灵药已放开出售', G.Market.canSell('herb_bainian') === true);
ok('百年灵药走专属收货价 120（不按杂物五折）', G.Market.gainOf('herb_bainian') === 120);
ok('千年灵药仍挂在货架上（点得着才有后续劫杀）', G.Market.canSell('herb_qiannian') === true);
ok('高阶灵药仍全数禁售（玄冰花/龙鳞果/天灵果）',
    G.Market.canSell('herb_xuanbing') === false && G.Market.canSell('herb_longlin') === false &&
    G.Market.canSell('herb_tianling') === false);

// 强行调用 sell 也必须被拦：不扣物、不给钱、日志说人话
p.atMarket = true;
G.State.addItem('pill_zhuji', 1);
const st0 = p.spiritStones, n0 = G.State.countItem('pill_zhuji');
logs.length = 0;
G.Market.sell('pill_zhuji');
ok('绕过列表直调 sell 仍被拦（物品不减）', G.State.countItem('pill_zhuji') === n0);
ok('绕过列表直调 sell 仍被拦（灵石不增）', p.spiritStones === st0);
ok('拒绝时给出人话理由', /收不得/.test(lastLog().msg));

/* ================= ② 交易日志标签与合并 ================= */
section('② 买卖日志走【交易】，批量出手只落一条总账');
G.State.addItem('ore', 3);
G.State.addItem('junk_scrap', 2);
logs.length = 0;
const st1 = p.spiritStones;
G.Market.sellJunkAll();
ok('批量出手只写一条日志', logs.length === 1);
ok('批量出手日志类型 = trade（【交易】）', lastLog().type === 'trade');
ok('批量出手一条里含多件物品', /×3/.test(lastLog().msg) && /×2/.test(lastLog().msg));
ok('批量出手照常入账', p.spiritStones > st1);

// 【交易】标签真的被 UI.log 渲染出来（TAGS 里必须有 trade）
logs.length = 0;
G.State.addItem('ore', 1);
G.Market.sell('ore');
ok('单件出售日志类型 = trade', lastLog().type === 'trade');

/* ================= ③ 突破成功率同源 ================= */
section('③ 目标框成功率 与「尝试突破」按钮读同一份推演的同一个字段');
p.location = G.DATA.MAP.start;
p.combat = null; p.yindu = null; p.pendingEvent = null; p.pendingMercy = null;
p.moEvent = null; p.qixuan = { act: 7 }; p.realmIndex = 3; p.currentExp = 0;
p.marketRiskValue = 0;
U.updateUI();
const planP = G.Breakthrough.plan(p);
const act0 = G.Goals.action(p);
const mGoal = /筹备后成功率 (\d+)%/.exec(act0.why || '');
ok('目标框报出了成功率', !!mGoal);
ok('目标框百分比 == plan.successChance（逐字同源）',
    !!mGoal && Number(mGoal[1]) === Math.round(planP.successChance * 100));
// 加上灵脉/心境后仍须一致（数值会变，但必须一起变）
p.mind = 40;
U.updateUI();
const planP2 = G.Breakthrough.plan(p);
const mGoal2 = /筹备后成功率 (\d+)%/.exec(G.Goals.action(p).why || '');
ok('心境变化后两处仍一致', !!mGoal2 && Number(mGoal2[1]) === Math.round(planP2.successChance * 100));
ok('确实读到了新的数值（非同值巧合）', Math.round(planP2.successChance * 100) !== Math.round(planP.successChance * 100));
// 旧实现读 realm.breakChance 静态底子（心境/灵脉一概不算）；与 plan 的差正好被这条抓住
const basePct = Math.round((G.DATA.REALMS[p.realmIndex].breakChance || 0) * 100);
ok('心境加成后 plan 值已偏离静态底子（证明读的是推演而非底子）',
    Math.round(planP2.successChance * 100) !== basePct);
p.mind = 0;

// 筑基段（底子由修为进度驱动）：这里"当下档"与"修为圆满档"天然不等——
// 正是旧版目标框报 70%、按钮报 66% 的现场。两处必须都读 successChance。
p.realmIndex = 13; p.currentExp = 2340; p.currentHp = p.maxHp; p.mind = 0;
U.updateUI();
const planB = G.Breakthrough.plan(p);
const mB = /筹备后成功率 (\d+)%/.exec(G.Goals.action(p).why || '');
ok('筑基段：目标框 == plan.successChance（不是圆满档 chanceFull）',
    !!mB && Number(mB[1]) === Math.round(planB.successChance * 100));
ok('该样本"当下档 ≠ 圆满档"（否则这条拦不住 70/66 那种错位）',
    Math.round(planB.chanceFull * 100) !== Math.round(planB.successChance * 100));
p.realmIndex = 3; p.currentExp = 0;
U.updateUI();

/* ================= ④ 坊市进出：耗年与文案 ================= */
section('④ 城镇就近入市不耗年月；在市中再点只复位不刷屏');
p.realmIndex = 5; p.location = 'jiayuan_cheng'; p.atMarket = false;
p.silver = 5000;
U.updateUI();
const m0 = p.totalMonths;
logs.length = 0;
G.Market.toggle();
ok('景阳城 travelTime = 0（不再"山路迢迢 2 个月"）', G.Market.travelTime() === 0);
ok('入市文案改为"步入坊市"', /步入坊市/.test(lastLog().msg));
ok('城镇入市不推进年月', p.totalMonths === m0);
ok('入市后处于坊市态', p.atMarket === true);

// 已在市中再点：只复位，不写日志、不推进时间
const m1 = p.totalMonths;
logs.length = 0;
G.Market.toggle();
ok('在市中再点 → 复位为离市', p.atMarket === false);
ok('在市中再点 → 不写任何日志（消除"离开→再进"重复）', logs.length === 0);
ok('在市中再点 → 不推进年月', p.totalMonths === m1);

// 山野洞府仍要赶路
p.location = 'shenshou_gu'; p.atMarket = false;
U.updateUI();
ok('幽篁谷 travelTime = 2 个月（山路迢迢保留）', G.Market.travelTime() === 2);
const m2 = p.totalMonths;
logs.length = 0;
G.Market.toggle();
ok('山野入市推进 2 个月', p.totalMonths >= m2 + 2);
ok('山野文案仍说"山路迢迢"', /山路迢迢/.test(logs.map(l => l.msg).join('')));

/* ================= ⑤ 盘缠：灵石折抵 ================= */
section('⑤ 银两为 0 时以灵石折抵盘缠，不再困死城中');
p.realmIndex = 5; p.location = 'jiayuan_cheng'; p.atMarket = false;
p.silver = 0; p.spiritStones = 529; p.isDead = false; p.combat = null;
p.pendingEvent = null; p.pendingMercy = null;
U.updateUI();
const route = 'r_jy_tn';                       // 景阳城 → 苍南谷：90 两
const pay = G.Map.payPlan(p, 90);
ok('payPlan：银两 0 → 折 1 枚灵石', pay.ok === true && pay.stones === 1 && pay.silver === 0);
ok('payPlan：灵石也不够时判不可行', G.Map.payPlan({ silver: 0, spiritStones: 0 }, 90).ok === false);
ok('payPlan：银两够则不折灵石', G.Map.payPlan({ silver: 200, spiritStones: 0 }, 90).stones === 0);

G.Map.canEnterTainan = function () { return true; };   // 幻阵另测，这里只验盘缠
const stBefore = p.spiritStones;
const ct = G.Map.canTravel(route);
ok('canTravel：银两 0 仍放行（有灵石兜底）', ct.ok === true);
logs.length = 0;
G.Map.travel(route);
ok('travel 成功抵达', p.location === 'tainan_gu');
ok('travel 扣掉 1 枚灵石（529 → 528）', p.spiritStones === stBefore - 1);
ok('travel 银两不会变负', p.silver === 0);
ok('日志说明以灵石兑碎银补足', /灵石兑了碎银/.test(logs.map(l => l.msg).join('')));

/* ================= ⑥ 两强争海剧透门禁 ================= */
section('⑥ 未入碎星海篇不显示跨篇章战局');
p.realmIndex = 5;
ok('练气期 warLabel 返回空串（不显示战局）', G.Faction.warLabel(p) === '');
ok('练气期军需铺不出现', G.Faction.warStall(p) === null);
p.realmIndex = 16;
ok('结丹（碎星海篇）后 warLabel 恢复', /两强争海/.test(G.Faction.warLabel(p)));
ok('warUnlocked 随境界切换', G.Faction.warUnlocked(p) === true);

/* ================= 渲染完整性 ================= */
section('⑦ 渲染无异常');
U.updateUI();
ok('updateUI 全程无异常', errors.length === 0);
if (errors.length) console.log('    ' + errors.slice(0, 3).join('\n    '));

console.log('\n==== 结果: ' + pass + ' passed, ' + fail + ' failed ====');
if (fails.length) { console.log('失败项:'); fails.forEach(f => console.log('  - ' + f)); }
process.exit(fail > 0 ? 1 : 0);
