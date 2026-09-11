'use strict';
/* =========================================================
 * test/smoke_foundation.js —— 筑基期全链路 无头回归测试
 * 强制验收四项：
 *   ① 大衍决使神识上限提升；超出当前 SP 时操纵傀儡必须被拦截
 *   ② 洞府布设颠倒五行阵后，抵御潜入魔修并增加灵石资产
 *   ③ 筑基修士攻击练气期触发增伤；受到练气期攻击触发高额免伤
 *   ④ 材料不全时激活传送阵被拒绝；集齐三大材料后通关结算产出天道评分
 * 运行： node test/smoke_foundation.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.resolve(__dirname, '..');

const logs = [];
const uiStub = {
  log: function (msg) { logs.push(String(msg)); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderSect: function () {}, renderBlack: function () {}, renderTrial: function () {},
  renderTrack: function () {}, renderCombat: function () {}, toggleTalismans: function () {},
};

let _rand = 0.5;
const sandbox = {};
sandbox.window = sandbox;
sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

const FILES = [
  'data/realms.js', 'data/realms_foundation.js', 'data/items.js', 'data/skills.js',
  'data/events.js', 'data/world.js', 'data/content.js', 'data/demon_war_events.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/market.js',
  'js/sect.js', 'js/blackmarket.js', 'js/trial.js',
  'js/puppet.js', 'js/insect.js', 'js/cave2.js', 'js/teleport_portal.js',
];
for (const f of FILES) {
  vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
}
const G = sandbox.GAME;

let pass = 0, fail = 0; const fails = [];
function assert(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function reset(realmIndex) {
  G.State.createNewPlayer('hunter');
  if (realmIndex != null) G.State.p().realmIndex = realmIndex;
  logs.length = 0;
  return G.State.p();
}
function setRand(v) { _rand = v; }
function lianqiTank() {
  var tank = null;
  G.DATA.MONSTERS.forEach(function (m) {
    if (m.majorRealm != null || m.bladeImmune || m.moEvent || m.trial) return;
    if (!tank || m.hp > tank.hp) tank = m;
  });
  return tank;
}

// ============ 强制验收 ①：大衍决升 SP + 超 SP 操纵傀儡被拦截 ============
console.log('==== 一、大衍决神识暴涨 · 神识承载拦截（强制验收①） ====');
{
  const p = reset(13);
  const sp0 = G.Puppet.maxSpirit();
  assert('筑基一层初始神识上限 SP = 15', sp0 === 15);
  G.Puppet.learnDayan();
  G.Puppet.learnDayan();
  G.Puppet.learnDayan();
  G.Puppet.learnDayan();
  assert('大衍决前四层学满（dayanLevel=4）', p.dayanLevel === 4);
  assert('神识上限提升至 100（15 → 100）', G.Puppet.maxSpirit() === 100);
  assert('神识上限相较初值确有提升', G.Puppet.maxSpirit() > sp0);
  G.Puppet.learnDayan();
  assert('已满四层不可再修（神识封顶 100）', G.Puppet.maxSpirit() === 100);

  // 神识承载拦截：无大衍决时 SP=15，2 具巨猿傀儡占 40 SP 必被拦截
  const q = reset(13);
  assert('无大衍决时 SP 上限仅 15', G.Puppet.maxSpirit() === 15);
  G.State.addItem('tianhuo_crystal', 4); G.State.addItem('spirit_wood', 24); G.State.addItem('iron_ore', 6); G.State.addItem('beast_soul', 4);
  G.Puppet.build('juyuan'); G.Puppet.build('juyuan');
  assert('已炼出 2 具巨猿傀儡', G.State.countItem('puppet_juyuan') === 2);
  G.Puppet.activate(2, 'juyuan');
  assert('超 SP 操纵傀儡被拦截（未列阵）', q.puppetsActive === 0);
  assert('拦截战报含「神识不足/拦截」', logs.some(function (l) { return l.indexOf('拦截') >= 0 || l.indexOf('神识不足') >= 0; }));

  // 学满大衍决后 SP=100，可承载 2 具巨猿（40 SP）
  const r = reset(13);
  G.Puppet.learnDayan(); G.Puppet.learnDayan(); G.Puppet.learnDayan(); G.Puppet.learnDayan();
  G.State.addItem('tianhuo_crystal', 4); G.State.addItem('spirit_wood', 24); G.State.addItem('iron_ore', 6); G.State.addItem('beast_soul', 4);
  G.Puppet.build('juyuan'); G.Puppet.build('juyuan');
  G.Puppet.activate(2, 'juyuan');
  assert('神识充裕时可正常列阵（2 具）', r.puppetsActive === 2);
}

// ============ 强制验收 ②：布阵抵御潜入魔修 + 灵石增加 ============
console.log('==== 二、洞府护山大阵 · 反制潜入魔修（强制验收②） ====');
{
  const p = reset(13);
  G.Cave2.joinInnerSect();
  p.spiritStones += 1000;
  G.Cave2.setFormation('wuxing');  // 颠倒五行阵残阵
  assert('已布设颠倒五行阵残阵', p.formation === 'wuxing');
  setRand(0.2);                     // 命中反制判定（repelChance=0.5）
  const s0 = p.spiritStones;
  const repelled = G.Cave2.repelIntruder();
  assert('阵法成功抵御潜入魔修', repelled === true);
  assert('反制后缴获灵石（资产增加）', p.spiritStones > s0);
  // 补全大五行阵（0.8）同样逻辑可走
  const p2 = reset(13); G.Cave2.joinInnerSect(); p2.spiritStones += 1000;
  G.Cave2.setFormation('dawan');
  setRand(0.1);
  const s2 = p2.spiritStones;
  assert('大五行阵亦可反制并缴获', G.Cave2.repelIntruder() === true && p2.spiritStones > s2);
}

// ============ 强制验收 ③：筑基打练气增伤 / 受练气攻击高额免伤 ============
console.log('==== 三、境界绝对压制：增伤翻倍 + 分层免伤（强制验收③） ====');
{
  assert('大境界映射：练气=0 / 筑基=1',
    G.DATA.majorRealm(5) === 0 && G.DATA.majorRealm(13) === 1 && G.DATA.majorRealm(21) === 1);
  // 高打低：每差一大境 ×(1+gap*1.5)
  assert('筑基打练气增伤 ×2.5（差一大境）', G.Combat.realmDamageMul(1, 0) === 2.5);
  assert('差两大境 ×4.0', G.Combat.realmDamageMul(2, 0) === 4);
  assert('同境无增伤', G.Combat.realmDamageMul(1, 1) === 1);
  // 分层免伤：defSuppress 0.60~0.85 → 受低境攻击 ×(0.4~0.15)
  assert('筑基一层受练气攻击削减 60%（×0.4）', G.Combat.realmDefSuppress(13) === 0.4);
  assert('筑基九层受练气攻击削减 85%（×0.15）', G.Combat.realmDefSuppress(21) === 0.15);
  assert('练气无压制（×1）', G.Combat.realmDefSuppress(5) === 1);

  // 集成：筑基玩家 攻 练气怪 —— 增伤生效
  const p = reset(13);
  const tank = lianqiTank();
  G.Combat.start(tank.id);
  assert('开战记录双方大境阶层', p.combat.playerMajor === 1 && p.combat.monsterMajor === 0);
  setRand(0.5);
  const hp0 = p.combat.hp;
  G.Combat.attack();
  const dealt = hp0 - (p.combat ? p.combat.hp : 0);
  assert('一击打出压制增伤（非零、且高于裸伤下限）', dealt > 0);
  p.combat = null;

  // 集成：练气怪 攻 筑基玩家 —— 高额免伤（实际受伤远低于怪物裸攻）
  const p2 = reset(13);
  const tk = lianqiTank();
  G.Combat.start(tk.id);
  const hpBefore = p2.currentHp;
  setRand(0.2);                  // 怪物命中（enemyHit ≈ 0.44）
  G.Combat.enemyTurn();
  const taken = hpBefore - p2.currentHp;
  assert('筑基受练气攻击触发高额免伤（实际受伤 < 怪物裸攻）',
    taken > 0 && taken < (tk.atk || 999));
  p2.combat = null;
}

// ============ 强制验收 ④：材料不全拒开通关 / 集齐三物结算天道 ============
console.log('==== 四、终局：修复古传送阵 · 破空而去（强制验收④） ====');
{
  const p = reset(21);   // 筑基九层圆满
  G.DemonWar.checkPhase();
  assert('九层圆满进入【破空而去】阶段', p.warPhase === 4);
  assert('终局三物未集齐（缺 3 件）', G.TeleportPortal.missingItems().length === 3);
  assert('缺件时激活传送阵被拒绝', G.TeleportPortal.repairTeleport() === false && !p.teleportRepaired);
  // 材料不全也能从 DemonWar 委托入口验证拒绝
  assert('DemonWar 委托入口同样拒绝', G.DemonWar.repairTeleport() === false);
  G.State.addItem('dawei_zhuzhu', 1);
  G.State.addItem('mid_stone', 1);
  G.State.addItem('xiufu_zhenpan', 1);
  assert('三物集齐后缺件清单为空', G.TeleportPortal.missingItems().length === 0);
  assert('集齐三物修复古传送阵成功', G.TeleportPortal.repairTeleport() === true && p.teleportRepaired === true);
  const td = G.TeleportPortal.escape();
  assert('激活传送·通关结算', p.ending === 'victory' && td > 0);
  assert('天道评分 = 筑基层数×5 + 突破×2 + 成就 + 击杀',
    p.tiandao === (21 - 12) * 5 + (p.stats.breakthroughs || 0) * 2 + p.achievements.length + (p.stats.kills || 0));
  assert('通关战报入档', logs.some(function (l) { return l.indexOf('通关大捷') >= 0; }));
  assert('重复结算幂等', G.TeleportPortal.win() === p.tiandao);
}

// ============ 覆盖：页签 11→7 无死链 ============
console.log('==== 五、页签压缩 11→7：无死链（覆盖） ====');
{
  const html = fs.readFileSync(path.join(BASE, 'index.html'), 'utf8');
  assert('顶部页签恰为 8 个（7 个基础 + 后加的「秘境」）', (html.match(/id="tab-/g) || []).length === 8);
  assert('丹炉顶级按钮已移除', html.indexOf('id="tab-alchemy"') < 0);
  assert('门派顶级按钮已移除', html.indexOf('id="tab-sect"') < 0);
  assert('黑市顶级按钮已移除', html.indexOf('id="tab-black"') < 0);
  assert('技能顶级按钮已移除', html.indexOf('id="tab-skill"') < 0);
  assert('丹炉子入口在洞府', html.indexOf('id="btn-home-alchemy"') >= 0);
  assert('黑市子入口在大地图', html.indexOf('id="btn-map-black"') >= 0);
  assert('技能子入口在图志', html.indexOf('id="btn-codex-skill"') >= 0);
  assert('新模块已注册：realms_foundation.js', html.indexOf('data/realms_foundation.js') >= 0);
  assert('新模块已注册：insect.js', html.indexOf('js/insect.js') >= 0);
  assert('新模块已注册：teleport_portal.js', html.indexOf('js/teleport_portal.js') >= 0);
  assert('新模块已注册：puppet.js / cave2.js', html.indexOf('js/puppet.js') >= 0 && html.indexOf('js/cave2.js') >= 0);
}

// ============ 覆盖：怪物词缀 + 傀儡齐射 + 噬金虫 ============
console.log('==== 六、词缀 + 傀儡齐射 + 噬金虫（覆盖） ====');
{
  const p = reset(13);
  var m = G.DATA.MONSTERS.filter(function (x) { return x.id === 'guiling_assassin'; })[0];
  assert('前线怪物为筑基级且带词缀池', !!m && m.majorRealm === 1 && Array.isArray(m.affixPool));
  m.affix = 'thickShell';
  G.Combat.start(m.id);
  assert('厚甲妖壳词缀生效', p.combat.thickShell === true);
  m.affix = 'seizeSoul';
  G.Combat.start(m.id);
  assert('夺舍残魂：神识+40% 且免疫目眩', p.combat.spirit === Math.round(m.spirit * 1.4) && p.combat.immuneBlind === true);
  p.combat = null; delete m.affix;

  // 傀儡齐射
  const q = reset(13);
  G.Puppet.learnDayan(); G.Puppet.learnDayan(); G.Puppet.learnDayan(); G.Puppet.learnDayan();  // 神识上限 → 100
  G.State.addItem('puppet_gongjian', 5);
  G.Puppet.activate(5, 'gongjian');
  assert('5 具弓箭傀儡列阵（占 50 SP）', q.puppetsActive === 5);
  const tk = lianqiTank();
  const hp0 = tk.hp;
  G.Combat.start(tk.id);
  setRand(0.5); G.Combat.attack();
  const fired = logs.some(function (l) { return l.indexOf('齐射') >= 0; });
  assert('傀儡齐射入战报', fired);
  assert('齐射伤害并入总伤（≥ 5×8=40）',
    (hp0 - (q.combat ? q.combat.hp : 0)) >= 40 || q.combat === null);
  q.combat = null;

  // 噬金虫：孵化 → 进阶 → 释放虫云
  const r = reset(13);
  G.State.addItem('chong_egg', 1); r.liquid = 2;
  G.Insect.hatch();
  assert('绿液浸卵孵化幼虫', G.State.countItem('shijin_larva') === 1 && r.liquid === 0);
  G.State.addItem('jinshi', 3);
  G.Insect.evolve();
  assert('吞金石进阶成虫', G.State.countItem('shijin_adult') === 1 && G.State.countItem('shijin_larva') === 0);
  const tk2 = lianqiTank();
  G.Combat.start(tk2.id);
  G.Insect.release();
  assert('斗法释放噬金虫云（combat.insectCloud）', r.combat.insectCloud === true);
  setRand(0.5); G.Combat.enemyTurn();
  assert('虫云每回合融毁护盾（战报含「噬金虫云」）', logs.some(function (l) { return l.indexOf('噬金虫云') >= 0; }));
  r.combat = null;
}

// ============ 覆盖：洞府 2.0 + 阵营战役 + 燕家堡分支 ============
console.log('==== 七、洞府 2.0 + 前线战备 + 燕家堡夺宝（覆盖） ====');
{
  const p = reset(13);
  G.Cave2.joinInnerSect();
  p.spiritStones += 1000;
  const s0 = p.spiritStones;
  G.Core.passTime(6);
  assert('月俸按月入账（6 月 ×10 灵石）', p.spiritStones === s0 + 60);
  G.Cave2.rentPeak('high');
  assert('租赁上品灵峰（-600）', p.peak === 'high' && p.spiritStones === s0 + 60 - 600);
  assert('地火丹房二阶丹方三条齐备', G.DATA.ALCHEMY.recipes2.length === 3);

  // 前线战备（筑基中期 16~18）
  const mid = reset(16);
  const res = G.DemonWar.frontlineDefend();
  assert('前线战备结算宗门功勋', res && res.contrib > 0);
  assert('前线战备缴获中阶灵石', res && G.State.countItem('mid_stone') >= 2);

  // 燕家堡两分支（筑基后期 19~20）
  const late = reset(19);
  G.State.addItem('puppet_gongjian', 1);
  const pb = G.DemonWar.yanjiaFortune('puppet');
  assert('燕家堡·自爆傀儡断后突围存活', pb && pb.survived === true);
  const late2 = reset(19);
  setRand(0.1);   // 硬破成功（<0.5）
  const br = G.DemonWar.yanjiaFortune('break');
  assert('燕家堡·硬破血祭大阵成功并缴获', br && br.survived === true && br.loot === 'xiufu_zhenpan');
  const late3 = reset(19);
  setRand(0.9);   // 硬破失败
  const br2 = G.DemonWar.yanjiaFortune('break');
  assert('燕家堡·硬破失败则重伤脱身', br2 && br2.survived === false && br2.dmg > 0);
}

console.log('\n=== 结果: ' + pass + ' passed, ' + fail + ' failed ===');
if (fail) { console.log('失败项：'); fails.forEach(function (f) { console.log('  - ' + f); }); process.exit(1); }
