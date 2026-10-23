'use strict';
/* =========================================================
 * test/smoke_desperate.js —— 燃寿搏命（烧寿元换战力爆发，战后留暗伤隐患）无头测试
 *   ① 数据：玄元丹方入 RECIPES
 *   ② 燃寿：寿元不足被拒；足则烧 10 年、置 lifespanBurst{mul:1.8,crit:0.15}、burnedYears=10
 *   ③ 爆发：受控随机下本场攻击 ≈ 基础攻击 ×1.8
 *   ④ 暗伤：战后 hiddenInjury.months = max(6, round(burnedYears/2))
 *   ⑤ 修复：passTime 递减月数、归零清除；服【玄元丹】根除
 *   ⑥ 门禁：暗伤未愈时长关(seclude epic)被拒，根除后可入定
 * 运行： node test/smoke_desperate.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.resolve(__dirname, '..');

// ---------- UI / DOM 桩 ----------
const logs = [];
const uiStub = {
  log: function (msg) { logs.push(String(msg)); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderSect: function () {}, renderBlack: function () {}, renderTrial: function () {},
  renderTrack: function () {}, renderCombat: function () {}, toggleTalismans: function () {},
};

// ---------- 可控随机数：恒定 0.5 → 命中落定、绝不暴击，damage 完全可复现 ----------
let _rand = 0.5;
function setRand(v) { _rand = v; }

const sandbox = {};
sandbox.window = sandbox; sandbox.console = console;
sandbox.GAME = { UI: uiStub, BlackMarket: { refreshJunk: function () {} } };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/skills.js',
  'data/skills_foundation.js', 'data/items_foundation.js',
  'data/events.js', 'data/world.js', 'data/worldmap.js', 'data/content.js',
  'data/qixuan_events.js', 'data/demon_war_events.js', 'data/dungeon_heisha.js', 'data/wild_dungeons.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/time.js', 'js/plot.js', 'js/mortality.js', 'js/market.js', 'js/map.js',
  'js/cultivation.js', 'js/alchemy.js', 'js/breakthrough.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function assert(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function reset(realmIndex) {
  G.State.createNewPlayer('wanderer');
  const p = G.State.p();
  if (realmIndex != null) p.realmIndex = realmIndex;
  logs.length = 0;
  return p;
}

// ============ ① 数据完整性 ============
console.log('==== 一、数据：玄元丹方入 RECIPES（验收①） ====');
{
  const rec = G.DATA.RECIPES.find(r => r.pill === 'pill_xuanyuan');
  assert('RECIPES 含玄元丹配方', !!rec);
  assert('玄元丹配方须先习丹方(recipe_xuanyuan)', rec && rec.recipe === 'recipe_xuanyuan');
  assert('玄元丹道具存在且可根除暗伤', !!G.DATA.ITEMS.pill_xuanyuan && G.DATA.ITEMS.pill_xuanyuan.use.cureHiddenInjury === true);
  assert('玄元丹方道具存在', !!G.DATA.ITEMS.recipe_xuanyuan && G.DATA.ITEMS.recipe_xuanyuan.learns === 'pill_xuanyuan');
}

// ============ ② 燃寿：拒 / 烧 ============
console.log('==== 二、燃寿：寿元不足被拒；足则烧 10 年（验收②） ====');
{
  // 寿元将尽：剩余 <= 10 → 拒
  const p = reset(0);
  G.Combat.start('wolf');
  p.ageYears = G.State.maxAge() - 5;       // 仅余 5 年
  const age0 = p.ageYears;
  G.Combat.desperate();
  assert('寿元不足时拒燃寿（年龄不变）', p.ageYears === age0);
  assert('寿元不足时未置 lifespanBurst', !p.combat.lifespanBurst);
  assert('寿元不足时日志告警', logs.some(l => l.indexOf('寿元将尽') >= 0));
  p.combat = null;

  // 寿元充足：烧 10 年、置爆发标记
  const q = reset(0);
  G.Combat.start('wolf');
  const ageB = q.ageYears;
  G.Combat.desperate();
  assert('燃寿消耗 10 年寿元', q.ageYears === ageB + 10);
  assert('燃寿置 lifespanBurst.mul=1.8', q.combat.lifespanBurst && q.combat.lifespanBurst.mul === 1.8);
  assert('燃寿置 lifespanBurst.crit=0.15', q.combat.lifespanBurst.crit === 0.15);
  assert('燃寿记 burnedYears=10', q.combat.burnedYears === 10);
  // 重复燃寿被拦
  const ageB2 = q.ageYears;
  G.Combat.desperate();
  assert('二次燃寿被拦（不再烧寿）', q.ageYears === ageB2 && q.combat.lifespanBurst.mul === 1.8);
  p.combat = null; q.combat = null;
}

// ============ ③ 爆发：攻击 ×1.8 ============
console.log('==== 三、战力爆发：受控随机下攻击 ≈ 基础 ×1.8（验收③） ====');
{
  // 基础攻击（无爆发）
  setRand(0.5);
  const a = reset(0);
  G.Combat.start('wolf');
  const hpA0 = a.combat.hp;
  G.Combat.attack();
  const baseDmg = hpA0 - a.combat.hp;
  assert('基础攻击造成伤害', baseDmg > 0);
  a.combat = null;

  // 燃寿后攻击（同一受控随机序列 → 基础伤害相同，仅乘 1.8）
  setRand(0.5);
  const b = reset(0);
  G.Combat.start('wolf');
  G.Combat.desperate();        // 内部会触发敌方一回合，不影响我们对敌伤害测量
  const hpB0 = b.combat.hp;
  G.Combat.attack();
  const burstDmg = b.combat ? (hpB0 - b.combat.hp) : -1;
  assert('燃寿后攻击造成伤害', burstDmg > 0);
  assert('燃寿爆发 ≈ 基础攻击 ×1.8（' + burstDmg + ' vs ' + Math.round(baseDmg * 1.8) + '）',
    burstDmg === Math.round(baseDmg * 1.8));
  b.combat = null;
}

// ============ ④ 暗伤：战后隐患 ============
console.log('==== 四、战后暗伤：months = max(6, round(burnedYears/2))（验收④） ====');
{
  const p = reset(0);
  G.Combat.start('wolf');
  G.Combat.desperate();          // burnedYears=10
  G.Combat.end();                // 战后结算暗伤
  assert('战后落下暗伤', !!p.hiddenInjury);
  assert('暗伤修复期 = max(6, round(10/2)) = 6 月', p.hiddenInjury && p.hiddenInjury.months === 6);
  assert('战斗态已清', p.combat === null);
}

// ============ ⑤ 修复：静养 / 玄元丹 ============
console.log('==== 五、修复：passTime 递减清除；玄元丹根除（验收⑤） ====');
{
  const p = reset(0);
  p.hiddenInjury = { months: 6 };
  const hp0 = p.currentHp;
  G.Core.passTime(3);             // 受控随机 0.5 → 不触发隐患发作
  assert('静养 3 月暗伤余 3 月', p.hiddenInjury && p.hiddenInjury.months === 3);
  assert('受控随机下隐患未发作（气血未减）', p.currentHp === hp0);
  G.Core.passTime(10);            // 3-10 < 0 → 清除
  assert('静养逾修复期后暗伤根除', p.hiddenInjury === null);

  // 玄元丹根除
  const q = reset(0);
  q.hiddenInjury = { months: 4 };
  G.State.addItem('pill_xuanyuan', 1);
  G.Core.takePill('pill_xuanyuan');
  assert('服玄元丹根除暗伤', q.hiddenInjury === null);
  assert('玄元丹被消耗', G.State.countItem('pill_xuanyuan') === 0);
  // 无暗伤时服之无益：丹药仍被消耗（药力空耗），并提示服之无益
  const q2 = reset(0);
  G.State.addItem('pill_xuanyuan', 1);
  G.Core.takePill('pill_xuanyuan');
  assert('无暗伤服玄元丹仍被消耗（药力空耗）', G.State.countItem('pill_xuanyuan') === 0);
  assert('无暗伤服玄元丹提示「服之无益」', logs.some(l => l.indexOf('服之无益') >= 0));
}

// ============ ⑥ 门禁：暗伤未愈长关受限 ============
console.log('==== 六、长关门禁：暗伤未愈 seclude(epic) 被拒（验收⑥） ====');
{
  const p = reset(0);
  p.hiddenInjury = { months: 4 };
  logs.length = 0;
  const blocked = G.Time.seclude('epic');
  assert('暗伤未愈长关被拒', blocked === false);
  assert('长关被拒给出暗伤提示', logs.some(l => l.indexOf('暗伤') >= 0));

  // 根除后再试：暗伤门禁应放行（其余前置另算，但必不再因暗伤拦截）
  p.hiddenInjury = null;
  logs.length = 0;
  G.Time.seclude('epic');
  assert('暗伤根除后长关不再因暗伤拦截', !logs.some(l => l.indexOf('暗伤') >= 0));
}

// ============ 汇总 ============
console.log('\n==== 结果: ' + pass + ' passed, ' + fail + ' failed ====');
if (fails.length) { console.log('失败项:'); fails.forEach(f => console.log('  - ' + f)); }
process.exit(fail > 0 ? 1 : 0);
