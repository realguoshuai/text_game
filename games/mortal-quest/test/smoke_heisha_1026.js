/* =========================================================
 * test/smoke_heisha_1026.js —— 2026-10-26 第二批：夜战幽冥教面板 / 血玉蜘蛛 / 筑基突破概率 / 练气禁地排斥
 *
 *   ① 【副本/试炼】顶部挂出「云京皇宫·夜战幽冥教」作战卡：
 *        三阶段进度（血侍清剿 n/4 → 血玉蜘蛛封印 → 越皇决战）＋ 各阶段迎战按钮
 *   ② 阶段闸门：四血侍未除不得打蜘蛛；蜘蛛未斩不得打越皇（血玉蜘蛛是真怪，有独立战斗）
 *   ③ 筑基段突破成功率随修为进度攀升：刚到（修为 0）约一成，圆满五成，不再是凭空 80%
 *   ④ 练气期专属秘境（血色禁地 / 血月试炼）筑基后「境界超限·天地禁制排斥」+ 徽标熄灭
 *   ⑤ 中栏【前往：云京·皇城】跨城自动赶路（青牛镇 → 景阳城 → 云京）
 *
 * 运行： node test/smoke_heisha_1026.js
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

/* ================= 假 DOM ================= */
function El(id, tag) {
    this.id = id; this.tagName = (tag || 'div').toUpperCase();
    this.style = {}; this.children = []; this._html = ''; this._text = '';
    this._cls = new Set();
    const self = this;
    this.classList = {
        add: function () { for (var i = 0; i < arguments.length; i++) self._cls.add(String(arguments[i])); },
        remove: function () { for (var i = 0; i < arguments.length; i++) self._cls.delete(String(arguments[i])); },
        toggle: function (c) { if (self._cls.has(c)) { self._cls.delete(c); return false; } self._cls.add(c); return true; },
        contains: function (c) { return self._cls.has(c); }
    };
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
/* 固定随机：只验流程，不赌数值（战斗命中/暴击都走 Math.random） */
let _rand = 0.5;
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
function setRand(v) { _rand = v; }
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
const C = G.Core;

G.Qixuan.active = () => false;
G.DATA.MAP_ENCOUNTERS.chance = 0;
U.started = true;

const p = S.createNewPlayer('wanderer');
p.realmIndex = 13;              // 筑基初期
p.currentExp = 0;
p.isDead = false; p.combat = null; p.pendingEvent = null; p.pendingMercy = null;
p.location = 'yuejing_cheng';
p.noHarass = true;
C.rand = function (a) { return a; };

const logs = [];
U.log = function (msg) { logs.push(String(msg)); };
function joined(from) { return logs.slice(from || 0).join(' || '); }

/* 取某容器里的按钮（作战卡的按钮都在 .combat-actions 里） */
function buttonsOf(host) {
    const out = [];
    (host.children || []).forEach(c => {
        if (String(c.className || '').indexOf('combat-actions') >= 0) {
            (c.children || []).forEach(b => out.push(b));
        }
    });
    return out;
}
function rowsText(host) {
    return (host.children || []).map(c => String(c._html || '')).join(' | ');
}

/* ================= ① 突破成功率：修为进度驱动 ================= */
section('① 筑基初期突破成功率：随修为进度攀升（不再凭空 80%）');
{
    p.currentExp = 0;
    let plan = G.Breakthrough.plan(p);
    ok('刚到筑基初期（修为 0）底子约一成', Math.abs(plan.successChance - 0.10) <= 0.011);
    ok('底子标签写的是「修为淬炼」而非固定境界底子', /修为淬炼/.test(plan.baseLabel));
    ok('此刻远不到 80%', plan.successChance < 0.3);
    ok('圆满档 chanceFull = 50%', Math.abs(plan.chanceFull - 0.50) <= 0.011);

    p.currentExp = Math.floor(3900 / 2);
    plan = G.Breakthrough.plan(p);
    ok('修为过半 → 成功率约三成', plan.successChance > 0.28 && plan.successChance < 0.33);

    p.currentExp = 3900;
    plan = G.Breakthrough.plan(p);
    ok('修为圆满 → 五成', Math.abs(plan.successChance - 0.50) <= 0.011);
    ok('圆满档与当下档一致', Math.abs(plan.chanceFull - plan.successChance) <= 0.005);

    // 灵脉 + 心境全开也不该回到 80%
    p.peak = 'high'; p.mind = 50;
    plan = G.Breakthrough.plan(p);
    ok('上品灵峰 + 心境 50 全开仍低于 75%', plan.successChance < 0.75);
    p.currentExp = Math.floor(3900 / 2);
    plan = G.Breakthrough.plan(p);
    U.renderBreakPrep(plan);
    ok('面板合计文案会另报「修为圆满可达」（当下 ' + Math.round(plan.successChance * 100) + '% ≠ 圆满 ' +
        Math.round(plan.chanceFull * 100) + '%）',
        /修为圆满可达/.test(String(els['bt-prep-total'].innerText || '')));
    p.peak = null; p.mind = 0;

    // 练气期不受影响（expRamp 只写在筑基两块上）—— index 4 = 练气五层，底子 65%
    const keep = p.realmIndex, keepExp = p.currentExp;
    p.realmIndex = 4; p.currentExp = 160;
    const ql = G.Breakthrough.plan(p);
    ok('练气五层仍是固定底子 65%（实测 ' + Math.round(ql.successChance * 100) + '%）',
        Math.abs(ql.successChance - 0.65) <= 0.011);
    p.realmIndex = keep; p.currentExp = keepExp;
}

/* ================= ② 副本/试炼顶部作战卡 ================= */
section('② 【副本/试炼】顶部渲染「云京皇宫·夜战幽冥教」三阶段作战卡');
{
    const host = els['fz-heisha'] = els['fz-heisha'] || new El('fz-heisha');
    U.tab = 'dungeon';
    U.renderDungeon();
    ok('未踏足时也先给入口（夜探皇宫·开战）', /夜探皇宫 · 开战/.test(rowsText(host)) ||
        buttonsOf(host).some(b => /夜探皇宫/.test(b.innerText)));

    ok('副本开启', G.Heisha.start() === true);
    U.tab = 'dungeon';
    U.renderDungeon();
    const txt = rowsText(host);
    ok('卡上写明【皇城血侍清剿 0 / 4】', /【皇城血侍清剿 0 \/ 4】/.test(txt));
    ok('卡上有【血玉蜘蛛封印】一段', /【血玉蜘蛛封印】/.test(txt));
    ok('卡上有【越皇地宫决战】一段', /【越皇地宫决战】/.test(txt));

    let btns = buttonsOf(host);
    const guardBtns = btns.filter(b => /^迎战 · 血侍/.test(b.innerText));
    ok('四名血侍各有独立迎战按钮', guardBtns.length === 4);
    ok('四名血侍按钮都可点（当前未开战）', guardBtns.every(b => b.disabled === false));
    const spiderBtn = btns.filter(b => /迎战血玉蜘蛛/.test(b.innerText))[0];
    ok('血玉蜘蛛按钮存在', !!spiderBtn);
    ok('血侍未除 → 蜘蛛按钮置灰', !!spiderBtn && spiderBtn.disabled === true);
    const bossBtn = btns.filter(b => /幽冥教主越皇/.test(b.innerText))[0];
    ok('越皇决战按钮存在且置灰', !!bossBtn && bossBtn.disabled === true);
}

/* ================= ③ 阶段闸门：血侍 → 血玉蜘蛛 → 越皇 ================= */
section('③ 阶段闸门：血侍 → 血玉蜘蛛 → 越皇（血玉蜘蛛是真打的一场）');
{
    ok('血侍未除不得进甬道打蜘蛛', G.Heisha.fightSpider() === false);

    const guards = ['heisha_tieluo', 'heisha_qingwen', 'heisha_yehong', 'heisha_bingyao'];
    for (const gid of guards) {
        setRand(0.5);
        p.currentHp = p.maxHp;          // 连战四场，别让气血把流程打断
        G.Heisha.challenge(gid);
        ok('挑战【' + gid + '】切入斗法', !!p.combat);
        p.combat.hp = 1;
        G.Combat.attack();
    }
    ok('四血侍尽数伏诛（已破 ' + G.Heisha.guardsDown() + '/4）', G.Heisha.allGuardsDown() === true);
    ok('血侍已除、蜘蛛未斩 → 越皇仍不可战', G.Heisha.fightBoss() === false);

    U.tab = 'dungeon';
    U.renderDungeon();
    const host = els['fz-heisha'];
    let btns = buttonsOf(host);
    ok('卡上进度更新为 4 / 4', /【皇城血侍清剿 4 \/ 4】/.test(rowsText(host)));
    ok('蜘蛛按钮转为可点', btns.filter(b => /迎战血玉蜘蛛/.test(b.innerText))[0].disabled === false);
    ok('越皇按钮依旧置灰（蛛网未破）', btns.filter(b => /幽冥教主越皇/.test(b.innerText))[0].disabled === true);

    ok('迎战血玉蜘蛛 → 进入独立战斗', (function () {
        setRand(0.5);
        p.currentHp = p.maxHp;
        return G.Heisha.fightSpider() === true && !!p.combat;
    })());
    ok('对手是血玉蜘蛛', p.combat.name === '血玉蜘蛛');
    p.combat.hp = 1;
    G.Combat.attack();
    ok('斩蛛后 spiderDone', G.Heisha.state().spiderDone === true);
    ok('斩蛛后越皇可战', (function () {
        setRand(0.5);
        p.currentHp = p.maxHp;
        return G.Heisha.fightBoss() === true;
    })());
    ok('越皇战仍是双阶段 Boss', p.combat.name === '幽冥教主·越皇');
    p.combat.hp = 1;
    G.Combat.attack();
    ok('越皇伏诛 → 副本通关', G.Heisha.state().bossDone === true);

    U.tab = 'dungeon';
    U.renderDungeon();
    ok('通关后作战卡收起（不再占副本页顶部）', els['fz-heisha'].style.display === 'none');
}

/* ================= ④ 练气期秘境 · 筑基排斥 ================= */
section('④ 血色禁地 / 血月试炼：筑基后「境界超限·天地禁制排斥」');
{
    p.realmIndex = 13;
    ok('血色禁地 canEnter = false', G.FZone.canEnter() === false);
    ok('血月试炼 canEnter = false', G.Trial.canEnter() === false);
    ok('FZone.overRealm 判据为真', G.FZone.overRealm() === true);
    ok('上界读的是配置（realmMax = 12）', G.DATA.CONTENT.FZONE.realmMax === 12 && G.DATA.CONTENT.TRIAL.realmMax === 12);

    let n0 = logs.length;
    G.FZone.start();
    ok('强入失败且写明禁制排斥', p.fzone == null && /天地禁制排斥/.test(joined(n0)));
    n0 = logs.length;
    G.Trial.start();
    ok('血月试炼同样被拦下', p.trial == null && /天地禁制排斥/.test(joined(n0)));

    U.updateUI();
    ok('副本页红点熄灭（徽标隐藏）', els['badge-fzone'].style.display === 'none');

    U.tab = 'dungeon';
    U.renderDungeon();
    const list = els['dungeon-list'];
    const t = (list.children || []).map(r => (r.children || []).map(c => c._html || '').join('')).join(' | ');
    ok('副本页两处练气副本都标【境界超限·天地禁制排斥】',
        (t.match(/【境界超限·天地禁制排斥】/g) || []).length === 2);
    ok('入口按钮全部置灰',
        (list.children || []).every(r => (r.children[1] || {}).children?.[0]?.disabled === true));

    // 练气十层仍是开着的（别把门槛一刀切掉）
    const keep = p.realmIndex;
    p.realmIndex = 9;
    ok('练气十层仍可入血色禁地', G.FZone.canEnter() === true);
    U.updateUI();
    ok('练气期副本页红点恢复', els['badge-fzone'].style.display === '');
    p.realmIndex = keep;
}

/* ================= ⑤ 跨城寻路：青牛镇 → 云京·皇城 ================= */
section('⑤ 中栏【前往：云京·皇城】跨城自动赶路');
{
    p.location = 'qingniu_zhen';
    const g = G.Goals.DEFS.filter(d => d.id === 'heisha')[0];
    const plan = G.Goals.wherePlan(g, p);
    ok('不再报「此地尚在路途之外」', plan.state === 'ok');
    ok('算出多跳路线（青牛镇 → 景阳城 → 云京）', Array.isArray(plan.routePath) && plan.routePath.length === 2);
    ok('途经城市点名（景阳城）', /景阳城/.test(plan.why || ''));
    ok('报了总耗时与盘缠', /个月/.test(plan.why || '') && /盘缠/.test(plan.why || ''));

    const m0 = p.totalMonths;
    U.goWhere(plan);
    ok('一键动身抵达云京·皇城', p.location === 'yuejing_cheng');
    ok('真的推进了年月', p.totalMonths > m0);
}

/* ================= ⑥ 通关之后：不重念开场白 / 皇城改口 / 目标不跳终局 ================= */
section('⑥ 越皇伏诛之后（开场白不再重念、皇城已平定、目标接得上）');
{
    // 上一节把玩家挪到了云京、副本已通关
    p.location = 'yuejing_cheng';
    p.heisha.bossDone = true;
    p.secretDone = null;
    const n0 = logs.length;
    const again = G.Heisha.start();          // 手滑再点一次「夜探皇宫」
    ok('通关后再点 start() 被拒', again === false);
    ok('不再重念开场白（夜色如墨 / 四名血侍分守）',
        !/夜色如墨/.test(joined(n0)) && !/四名血侍分守/.test(joined(n0)));
    ok('给了一句「已了结」，不是静默', /已了结/.test(joined(n0)));

    const acts = G.Map.nodeActions(p).map(a => a.id);
    ok('「此地可为」不再挂夜探皇宫', acts.indexOf('heisha_raid') < 0);
    ok('换成【已平定】条目', acts.indexOf('heisha_pacified') >= 0);
    ok('【已平定】点不动', G.Map.canDoAction('heisha_pacified').ok === false);

    const nd = G.Map.node('yuejing_cheng');
    ok('节点数据里有战后文案', !!nd.descPacified);
    ok('nodeDesc 战后切到「血气已经散了」', /血气已经散了/.test(G.Map.nodeDesc(nd, p)));
    ok('未通关时仍是原描述（不误切）', (function () {
        const keep = p.heisha.bossDone;
        p.heisha.bossDone = false;
        const t = G.Map.nodeDesc(nd, p);
        p.heisha.bossDone = keep;
        return /蛰伏着一头择人而噬的血魔/.test(t);
    })());

    // 目标：不能一步跳到结丹终局，也不能露出 18/18
    p.qixuan = { act: 7, step: 0 };     // 苍梧门六幕已完结，否则目标栏会停在那条上
    p.sectId = 'huangfenggu';           // 已拜入青梧谷，否则目标会停在"苍南小会拜山"上
    p.realmIndex = 13; p.currentExp = 3523;
    const g = G.Goals.current();
    ok('筑基初期目标 = 精进修为 / 筑基中期（实为 ' + (g && g.id) + '）',
        g && g.id === 'zhuji_next' && /突破至筑基中期/.test(g.text));
    ok('目标里没有 18/18 这类底层公式', !/18\s*\/\s*18/.test((g.text || '') + (g.hint || '')));
    p.realmIndex = 15;
    const g15 = G.Goals.current();
    ok('筑基后期目标 = 冲结丹天堑（实为 ' + (g15 && g15.id) + '）', g15 && g15.id === 'zhuji_jiedan');
    p.realmIndex = 16;
    const g16 = G.Goals.current();
    ok('结丹初期目标 = 结丹三阶', g16 && g16.id === 'jiedan' && !/18\s*\/\s*18/.test((g16.text || '') + (g16.hint || '')));
}

/* ================= 收尾 ================= */
if (errors.length) {
    console.log('\n运行时错误：');
    errors.slice(0, 5).forEach(e => console.log('  ! ' + e));
}
console.log('\n========================================');
console.log(pass + ' passed, ' + fail + ' failed' + (fail ? ' -> ' + fails.join(' / ') : ''));
process.exit(fail || errors.length ? 1 : 0);
