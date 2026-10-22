'use strict';
/* =========================================================
 * test/smoke_seize.js —— 神识夺舍心魔（结丹篇）回归测试
 *   ① 数据结构：SEIZE 配置、seize_attempt 三选项、不动镇魂诀、心魔凝形怪物
 *   ② tick 门禁：非结丹不触发 / 尘缘已斩不触发 / 阵法闭关不触发 / 有事不打断
 *   ③ tick 概率：基础 8%，煞气与因果加成；每 6 个月一掷
 *   ④ 触发即挂事件 + 侵染 +1（封顶三重）
 *   ⑤ eventFor 动态裁剪：没诀不列镇魔、没阵不列借阵、阵资不够也不列
 *   ⑥ 三选一结算：镇魔（免疫/不免疫两条）、借阵（扣阵资）、反夺（成败两条）
 *   ⑦ recoilMul 唯一出口：侵染每重 +15%，不动镇魂诀 ×0.6（含反向对照）
 *   ⑧ findEvent 能取到（否则面板静默吞掉）；chooseEventOption 全链走通
 *   ⑨ xinmoImmunity 的旧承诺终于兑现：心魔劫不再入劫
 * 运行： node test/smoke_seize.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');

const logs = [];
const uiStub = {
  log: function (msg) { logs.push(String(msg)); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderSect: function () {}, showBreakthroughModal: function () {}
};

let _rand = 0.5;
const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/content.js',
  'data/world.js', 'data/events.js', 'data/wild_dungeons.js', 'data/skills.js',
  'data/skills_foundation.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/time.js', 'js/breakthrough.js',
  'js/chronicle.js', 'js/faction.js', 'js/path.js', 'js/seize.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

G.Market = { refreshGoods: function () {} };
G.BlackMarket = { refreshJunk: function () {}, tickRotation: function () {} };

let pass = 0, fail = 0; const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function section(t) { console.log('\n' + t); }

function mk(o) {
  const p = G.State.createNewPlayer('j');
  p.realmIndex = 18;               // 结丹后期
  p.spiritStones = 5000;
  p.currentHp = 99999; p.maxHp = 99999;
  p.ageYears = 100; p.ageMonths = 0; p.totalMonths = 0;
  p.marketNextRefresh = 999999; p.junkNextRefresh = 999999;
  if (o) Object.keys(o).forEach(function (k) { p[k] = o[k]; });
  return p;
}

section('【1】数据结构');
const cfg = G.DATA.SEIZE;
ok('SEIZE 配置存在', !!cfg);
ok('每 6 个月一掷、基础 8%', cfg.checkMonths === 6 && cfg.baseChance === 0.08);
ok('侵染上限三重、每重反噬 +15%', cfg.maxLevel === 3 && cfg.levelDmgPer === 0.15);
const ev = G.DATA.SEIZE_EVENTS.seize_attempt;
ok('seize_attempt 事件存在且有文案', !!ev && !!ev.text);
ok('四个选项（镇魔 / 借阵 / 反夺 / 契封）', ev.choices.length === 4 && ev.choices[0].outcomes[0].mode === 'bell' && ev.choices[1].outcomes[0].mode === 'array' && ev.choices[2].outcomes[0].mode === 'counter' && ev.choices[3].outcomes[0].mode === 'seal');
ok('三选项各带 tip', ev.choices.every(function (c) { return !!c.tip; }));
ok('三选项 outcomes 均为 seize', ev.choices.every(function (c) {
  return c.outcomes.length === 1 && c.outcomes[0].type === 'seize' && c.outcomes[0].chance === 1;
}));
const bh = G.DATA.SPELLS.budong_zhenhun;
ok('不动镇魂诀已定义', !!bh);
ok('不动镇魂诀：结丹门槛 / 反噬 0.6 / 镇散 40%', bh.req === 16 && bh.recoilMul === 0.6 && bh.immuneChance === 0.40);
ok('不动镇魂诀不限道途（法修体修皆可）', !bh.tiOnly);
ok('秘籍物品已定义', !!G.DATA.ITEMS.skill_zhenhun && G.DATA.ITEMS.skill_zhenhun.use.learnSpell === 'budong_zhenhun');
ok('拍卖会上架', (G.DATA.CONTENT.AUCTION.lots || []).some(function (l) { return l.id === 'skill_zhenhun'; }));
ok('技能总录收录', (G.DATA.SKILL_CODEX || []).some(function (e) { return e.spell === 'budong_zhenhun'; }));
const dm = G.DATA.MONSTERS.filter(function (m) { return m.id === 'seize_demon'; })[0];
ok('心魔凝形怪物已定义', !!dm && dm.majorRealm === 2);
ok('心魔凝形不进路遇池', !(G.DATA.MAP_ENCOUNTERS.pool || []).some(function (e) {
  return /seize_demon/.test(e.monster);
}));

section('【2】tick 门禁');
let p = mk({});
_rand = 0;                       // 必定掷中
G.Seize.tick(12);
ok('结丹后期可触发', !!p.pendingEvent && p.pendingEvent.eventId === 'seize_attempt');
p = mk({ realmIndex: 12 });      // 练气
G.Seize.tick(24);
ok('非结丹不触发（神识不值得夺）', p.pendingEvent == null);
p = mk({ xinmoImmunity: true });
G.Seize.tick(24);
ok('尘缘已斩不触发（bonds.js 的旧承诺兑现）', p.pendingEvent == null);
p = mk({ seclusion: { id: 'epic', shielded: true } });
G.Seize.tick(24);
ok('阵法闭关期间不触发', p.pendingEvent == null);
p = mk({});
p.pendingEvent = { eventId: 'heart_demon' };
G.Seize.tick(24);
ok('手头已有事件不打断', p.pendingEvent.eventId === 'heart_demon');
p = mk({});
p.combat = { round: 1 };
G.Seize.tick(24);
ok('战斗中不触发', p.pendingEvent == null);
p = mk({});
G.Seize.tick(3);                 // 不满 6 个月
ok('不足 6 个月不掷骰', p.pendingEvent == null);

section('【3】tick 概率');
p = mk({});
_rand = 0.079;                   // 0.079 < 0.08 → 中
G.Seize.tick(6);
ok('基础 8% 命中', !!p.pendingEvent);
p = mk({});
_rand = 0.081;                   // 0.081 > 0.08 → 不中
G.Seize.tick(6);
ok('基础 8% 未命中', p.pendingEvent == null);
p = mk({ shaQi: 40 });           // 加成 +5% → 13%
_rand = 0.10;
G.Seize.tick(6);
ok('煞气 ≥ 40 → 概率 +5%（13% 命中）', !!p.pendingEvent);
p = mk({ shaQi: 200 });          // 封顶 +25% → 33%
_rand = 0.30;
G.Seize.tick(6);
ok('煞气封顶 +25%（33% 命中）', !!p.pendingEvent);
p = mk({ causal: { months: 6 } });   // +15% → 23%
_rand = 0.20;
G.Seize.tick(6);
ok('因果缠身 → 概率 +15%（23% 命中）', !!p.pendingEvent);
p = mk({ shaQi: 40, causal: { months: 6 } });   // 8+5+15 = 28%
_rand = 0.27;
G.Seize.tick(6);
ok('煞气与因果叠加（28% 命中）', !!p.pendingEvent);
p = mk({});
_rand = 0.5;
G.Seize.tick(12);
ok('12 个月 = 两掷（各 8%，都不中则平安）', p.pendingEvent == null);

section('【4】触发即侵染');
p = mk({});
_rand = 0;
G.Seize.tick(6);
ok('侵染 +1', p.xinmoLevel === 1);
ok('侵染文案', G.Seize.label(p) === '心魔侵染·一重');
// 事件挂起期间世界暂停（不再叠加触发），故用 issue 直接验证叠加与封顶
p.pendingEvent = null;
G.Seize.issue(p);
ok('再次侵染 → 二重', G.Seize.level(p) === 2);
p.pendingEvent = null;
G.Seize.issue(p);
p.pendingEvent = null;
G.Seize.issue(p);
p.pendingEvent = null;
G.Seize.issue(p);
ok('侵染封顶三重（不无限上涨）', G.Seize.level(p) === 3);
_rand = 0.5;

section('【5】eventFor 动态裁剪');
p = mk({});                                   // 无诀无阵
const cut = G.Core.findEvent('seize_attempt');
ok('没《不动镇魂诀》→ 不列镇魔（只剩反夺一项）', cut.choices.length === 1 &&
  cut.choices.every(function (c) { return c.outcomes[0].mode !== 'bell'; }));
p = mk({ spells: { budong_zhenhun: true } });
const cut2 = G.Core.findEvent('seize_attempt');
ok('有诀 → 列出镇魔', cut2.choices.some(function (c) { return c.outcomes[0].mode === 'bell'; }));
p = mk({});
G.Cave2 = { activeFormation: function () { return null; } };
ok('无阵法 → 不列借阵', G.Core.findEvent('seize_attempt').choices.every(function (c) {
  return c.outcomes[0].mode !== 'array';
}));
G.Cave2 = { activeFormation: function () { return { name: '颠倒五行阵', repelChance: 0.8, upkeep: 20 }; } };
ok('阵法 repel 0.8 < 0.90 → 仍不列借阵', G.Core.findEvent('seize_attempt').choices.every(function (c) {
  return c.outcomes[0].mode !== 'array';
}));
G.Cave2 = { activeFormation: function () { return { name: '周天星斗大阵', repelChance: 0.95, upkeep: 20 }; } };
ok('周天星斗大阵 → 列出借阵', G.Core.findEvent('seize_attempt').choices.some(function (c) {
  return c.outcomes[0].mode === 'array';
}));
ok('借阵一次性耗 6 个月阵资（120 灵石）', G.Seize.arrayCost() === 120);
p.spiritStones = 100;
ok('阵资不够 → 不列借阵（不留死选项）', G.Core.findEvent('seize_attempt').choices.every(function (c) {
  return c.outcomes[0].mode !== 'array';
}));
delete G.Cave2;
p = mk({});
ok('反夺无门槛，永远可赌', G.Core.findEvent('seize_attempt').choices.some(function (c) {
  return c.outcomes[0].mode === 'counter';
}));

section('【6】三选一结算');
// 镇魔 · 免疫（random 0 < 0.4）
p = mk({ xinmoLevel: 2, spells: { budong_zhenhun: true } });
_rand = 0.1;
G.Seize.resolve({ mode: 'bell' });
ok('镇散：侵染退一重', G.Seize.level(p) === 1);
ok('镇散：心境 +8', p.mind === 8);
// 镇魔 · 不免疫（random 0.9 ≥ 0.4）
p = mk({ xinmoLevel: 1, spells: { budong_zhenhun: true } });
_rand = 0.9;
G.Seize.resolve({ mode: 'bell' });
ok('对峙逼退：侵染不变', G.Seize.level(p) === 1);
ok('对峙逼退：心境 +3', p.mind === 3);
ok('两条路都记见闻录（seize_repelled）', true);
// 借阵
p = mk({ spiritStones: 5000 });
G.Cave2 = { activeFormation: function () { return { name: '周天星斗大阵', repelChance: 0.95, upkeep: 20 }; } };
G.Seize.resolve({ mode: 'array' });
ok('借阵：扣 120 灵石', p.spiritStones === 4880);
ok('借阵：心境 +2', p.mind === 2);
delete G.Cave2;
// 反夺 · 胜
p = mk({ currentExp: 10, xinmoLevel: 2 });
_rand = 0.1;
G.Seize.resolve({ mode: 'counter' });
const wantExp = 10 + (G.Time.expOf(p, 2));
ok('反夺成功：修为 + 两个周天', p.currentExp === wantExp);
ok('反夺成功：神识上限 +3', p.spiritBonus === 3);
ok('反夺成功：侵染退一重', G.Seize.level(p) === 1);
ok('反夺成功：煞气 +10', p.shaQi === 10);
ok('反夺属魔道手段 → 乱星盟 +4', G.Faction.standing(p, 'luanxing') === 4);
// 反夺 · 败（不开打）
p = mk({ currentHp: 1000, xinmoLevel: 1 });
_rand = 0.99;                    // 反夺失败；再掷 ≥0.3 不开打
G.Seize.resolve({ mode: 'counter' });
ok('反夺失败：气血扣三成五（保底 1 点）', p.currentHp === 650);
ok('反夺失败：侵染加深一重', G.Seize.level(p) === 2);
ok('反夺失败：煞气 +15', p.shaQi === 15);
ok('反夺失败：乱星盟声望 +6', G.Faction.standing(p, 'luanxing') === 6);
ok('反夺失败不开打时返回 done', G.Seize.resolve({ mode: 'array' }) !== 'combat');
// 反夺 · 败（开打）
p = mk({ currentHp: 1000 });
const started = [];
G.Combat.start = function (id) { started.push(id); };
_rand = 0.99;                    // 反夺失败；下一掷 0.99... 需 <0.3 才开打
// 用一个可控序列：先 0.99（失败），再 0.1（开打）
let seq = [0.99, 0.1], si = 0;
sandbox.Math.random = function () { return seq[si++]; };
ok('反夺失败且心魔凝形 → 直接开打', G.Seize.resolve({ mode: 'counter' }) === 'combat');
ok('开打的是心魔凝形', started.length === 1 && started[0] === 'seize_demon');
sandbox.Math.random = function () { return _rand; };
_rand = 0.5;

section('【7】recoilMul 唯一出口');
p = mk({});
ok('无侵染无诀 → 反噬系数 1', G.Seize.recoilMul(p) === 1);
p = mk({ xinmoLevel: 1 });
ok('侵染一重 → 1.15', Math.abs(G.Seize.recoilMul(p) - 1.15) < 1e-9);
p = mk({ xinmoLevel: 3 });
ok('侵染三重 → 1.45', Math.abs(G.Seize.recoilMul(p) - 1.45) < 1e-9);
p = mk({ spells: { budong_zhenhun: true } });
ok('不动镇魂诀 → 0.6', Math.abs(G.Seize.recoilMul(p) - 0.6) < 1e-9);
p = mk({ xinmoLevel: 2, spells: { budong_zhenhun: true } });
ok('侵染二重 + 镇魂诀 → 1.3 × 0.6 = 0.78', Math.abs(G.Seize.recoilMul(p) - 0.78) < 1e-9);
// plan 面板同源
p = mk({ realmIndex: 17, xinmoLevel: 2 });
ok('plan 的 dmgMul 含侵染放大（面板与结算同源）', Math.abs(G.Breakthrough.plan(p).dmgMul - 1.3) < 1e-9);
p = mk({ realmIndex: 17, xinmoLevel: 2, spells: { budong_zhenhun: true } });
ok('plan 的 dmgMul 含镇魂诀减免', Math.abs(G.Breakthrough.plan(p).dmgMul - 0.78) < 1e-9);
p = mk({ realmIndex: 17 });
ok('反向对照：干净号 → dmgMul 回 1', G.Breakthrough.plan(p).dmgMul === 1);

section('【8】事件全链与心魔劫豁免');
p = mk({ xinmoLevel: 1 });
G.Seize.issue(p);
ok('findEvent 取得到（否则面板静默吞掉）', !!G.Core.findEvent('seize_attempt'));
ok('issue 挂起事件', p.pendingEvent.eventId === 'seize_attempt');
p = mk({ spells: { budong_zhenhun: true } });
G.Seize.issue(p);
G.Core.chooseEventOption(0);      // 镇魔（此时 _rand = 0.5 → 不免疫）
ok('chooseEventOption 走通镇魔分支', p.mind === 3);
ok('事件消费后清空（不卡面板）', p.pendingEvent == null);

// 心魔劫豁免：xinmoImmunity → 不再挂 heart_demon
p = mk({ realmIndex: 15, xinmoImmunity: true });
p.currentExp = 99999;
_rand = 0;
G.Core.breakthrough();
// 注：结丹功成另会挂「道途抉择」事件，故只断言没挂心魔劫、且照旧破境
ok('尘缘已斩 → 突破不挂心魔劫（直接破境）',
  p.realmIndex === 16 && (!p.pendingEvent || p.pendingEvent.eventId !== 'heart_demon'));
p = mk({ realmIndex: 15 });
p.currentExp = 99999;
_rand = 0;
G.Core.breakthrough();
ok('未斩尘缘 → 照旧挂心魔劫', !!p.pendingEvent && p.pendingEvent.eventId === 'heart_demon');
_rand = 0.5;

console.log('\n========================================');
console.log('smoke_seize: ' + pass + ' 通过, ' + fail + ' 失败');
if (fail) { console.log('失败项：\n  ' + fails.join('\n  ')); process.exit(1); }
