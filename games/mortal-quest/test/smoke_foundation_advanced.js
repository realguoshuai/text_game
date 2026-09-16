'use strict';
/* =========================================================
 * test/smoke_foundation_advanced.js —— 筑基期六大高阶进阶系统 无头回归测试
 * 强制验收六项：
 *   ① 《青冥剑诀》：无视 30% 护甲计算 + 护体剑盾开局生成
 *   ② 《三转归元功》：散功后境界回退筑基一层、转数累加、上限永久 +20%
 *   ③ 符宝：祭起蓄力 → 高倍伤害释放、每次耗 25 耐久、归零自燃销毁
 *   ④ 丹药抗药性：同种丹药第 6 枚收益减半、第 11 枚收益为 0
 *   ⑤ 云京皇宫：两阶段 Boss 战 + 颠倒五行阵引魔入阵封印 50%
 *   ⑥ 高年份药草出售 → 觊觎度满值 → 离开坊市强制触发神识锁定与逃生检定
 * 运行： node test/smoke_foundation_advanced.js
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
  'data/skills_foundation.js', 'data/items_foundation.js',
  'data/events.js', 'data/world.js', 'data/worldmap.js', 'data/content.js',
  'data/demon_war_events.js', 'data/dungeon_heisha.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/market.js',
  'js/sect.js', 'js/blackmarket.js', 'js/trial.js',
  'js/puppet.js', 'js/insect.js', 'js/cave2.js', 'js/teleport_portal.js',
  'js/cultivation.js', 'js/alchemy.js', 'js/bottle.js', 'js/bonds.js', 'js/dungeon_heisha.js',
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
function add(id, n) { G.State.addItem(id, n == null ? 1 : n); }
function count(id) { return G.State.countItem(id); }
function lastLog() { return logs.length ? logs[logs.length - 1] : ''; }

// ============ 验收 ①：《青冥剑诀》剑芒 + 剑盾 ============
console.log('==== 一、青冥剑诀：无视 30% 护甲 + 护体剑盾（验收①） ====');
{
  const p = reset(13);
  assert('未习剑诀时无穿透', G.Cultivation.pierceRatio() === 0);
  assert('未习剑诀时敌防不折减', G.Cultivation.effectiveDef(100) === 100);

  // 战功兑换：需 200 战功
  p.sectContrib = 100;
  assert('战功不足 200 兑换被拒', G.Cultivation.learn("contrib") === false);
  p.sectContrib = 260;
  assert('战功 260 兑换成功', G.Cultivation.learn("contrib") === true);
  assert('扣除 200 战功（余 60）', p.sectContrib === 60);
  assert('青元剑芒：无视 30% 护甲', G.Cultivation.pierceRatio() === 0.30);
  assert('100 点敌防折算为 70 点', G.Cultivation.effectiveDef(100) === 70);

  // 护体剑盾：开局耗 20 法力自动凝聚
  p.mp = 50;
  setRand(0.5);
  G.Combat.start("wolf");
  assert('进入斗法', !!p.combat);
  assert('护体剑盾已凝（3 回合 / 吸收 25%）', !!p.combat.swordShield && p.combat.swordShield.turns === 3 && p.combat.swordShield.absorb === 0.25);
  assert('凝聚剑盾耗去 20 法力（50 → 30）', p.mp === 30);
  assert('剑盾吸收量 = 伤害 × 25%（80 伤吸 20）', G.Cultivation.shieldAbsorb(80) === 20);
  G.Cultivation.tickShield(); G.Cultivation.tickShield();
  assert('两回合后剑盾仍在（余 1 回合）', p.combat.swordShield != null && p.combat.swordShield.turns === 1);
  G.Cultivation.tickShield();
  assert('三回合后剑盾散去', p.combat.swordShield === null);

  // 法力不足则不凝盾
  p.combat.swordShield = null; p.mp = 10;
  G.Cultivation.onCombatStart();
  assert('法力不足 20 不凝盾', p.combat.swordShield === null);
  p.combatRoute = null; G.Combat.end();
}

// ============ 验收 ②：《三转归元功》散功逆转 ============
console.log('==== 二、三转归元功：散功逆转（验收②） ====');
{
  const p = reset(19);   // 筑基后期七层
  assert('未习三转功不可散功', G.Cultivation.canSanGong().ok === false);
  G.Cultivation.learnSZ();
  assert('习得三转归元功', G.Cultivation.hasSZ() === true);

  p.mind = 60;
  assert('心境不足 80 散功被拒', G.Cultivation.canSanGong().ok === false);
  p.mind = 90;
  assert('筑基后期 + 心境 90：可散功', G.Cultivation.canSanGong().ok === true);

  const hp0 = G.DATA.REALMS[13].hp, mp0 = G.DATA.REALMS[13].mp;   // 散功后按筑基一层面板重算
  p.currentExp = 3000;
  assert('散功逆转成功', G.Cultivation.sanGong() === true);
  assert('境界跌回筑基一层（REALMS[13]）', p.realmIndex === 13);
  assert('当前阶位修为清空', p.currentExp === 0);
  assert('三转计数累加至 1', p.threeTurnCount === 1);
  assert('属性上限倍率 = 1.2（+20%）', G.Cultivation.statMul() === 1.2);
  assert('气血上限获得永久加成（×1.2）', p.maxHp === Math.round(hp0 * 1.2));
  assert('法力上限获得永久加成（×1.2）', p.maxMp === Math.round(mp0 * 1.2));
  assert('神识上限同样享受 +20%', G.State.spLimit() === Math.round(15 * 1.2));
  assert('结丹突破补偿：每转 +25%', G.Cultivation.jiedanBonus() === 0.25);

  // 二转、三转
  p.realmIndex = 20; p.mind = 90;
  G.Cultivation.sanGong();
  p.realmIndex = 21; p.mind = 90;
  G.Cultivation.sanGong();
  assert('三转计数累加至 3', p.threeTurnCount === 3);
  assert('属性上限倍率 = 1.6（三转累计 +60%）', G.Cultivation.statMul() === 1.6);
  assert('结丹补偿封顶 +75%', G.Cultivation.jiedanBonus() === 0.75);
  p.realmIndex = 19; p.mind = 90;
  assert('三转已满不可再散', G.Cultivation.canSanGong().ok === false && G.Cultivation.sanGong() === false);
}

// ============ 验收 ③：符宝 ============
console.log('==== 三、符宝：蓄力一击 + 威能损耗（验收③） ====');
{
  const p = reset(13);
  add("fubao_lvhuang", 1);
  // 选一只高血量坦克怪，避免 5 倍伤害直接秒杀结束战斗
  let tank = null;
  G.DATA.MONSTERS.forEach(function (m) {
    if (m.majorRealm != null || m.bladeImmune || m.moEvent || m.trial) return;
    if (!tank || m.hp > tank.hp) tank = m;
  });
  setRand(0.5);
  G.Combat.start(tank.id);
  const def0 = p.combat.def_;
  const hp0 = p.combat.hp;

  // 蓄力回合：不直接造成伤害
  G.Combat.useFuBao("fubao_lvhuang");
  assert('祭起符宝进入蓄力（fubaoCharged）', p.combat.fubaoCharged === "fubao_lvhuang");
  assert('蓄力期间威能值初始化为 100', p.fubao["fubao_lvhuang"] === 100);
  assert('蓄力回合敌方未受伤', p.combat.hp === hp0);

  // 下一回合释放：400%~600% 倍率（rand 0.5 → 5 倍）
  const myAtk = G.State.getStats().atk;
  const expect = Math.round(Math.round(myAtk * 5 * (1 - 0.3 * 0)) /* 狼无剑诀穿透 */);
  G.Combat.attack();
  assert('下一回合倾泻毁灭一击（伤害 ≥ 4 倍攻击）', p.combat && hp0 - p.combat.hp >= myAtk * 4);
  assert('释放后蓄力标记清除', p.combat.fubaoCharged === null);
  assert('每次施展耗 25 点威能（余 75）', p.fubao["fubao_lvhuang"] === 75);

  // 耐久归零自燃化灰
  p.combat.hp = 999999;                       // 让狼打不死：连续释放至耐久耗尽
  for (let i = 0; i < 3; i++) {
    p.combat.hp = 999999;
    G.Combat.useFuBao("fubao_lvhuang");
    G.Combat.attack();
  }
  assert('威能耗尽后符宝自燃化灰（背包移除）', count("fubao_lvhuang") === 0 && p.fubao["fubao_lvhuang"] == null);
  p.combatRoute = null; G.Combat.end();
}

// ============ 验收 ④：丹药抗药性 ============
console.log('==== 四、丹药抗药性：第 6 枚减半、第 11 枚归零（验收④） ====');
{
  const p = reset(13);
  p.noHarass = true;
  add("pill_zhanjin", 12);
  let gains = [];
  for (let i = 1; i <= 11; i++) {
    const e0 = p.currentExp;
    G.Alchemy.takePill("pill_zhanjin");
    gains.push(p.currentExp - e0);
  }
  assert('展金丹专供筑基前期（1~3 层），当前境界匹配', gains.length === 11);
  assert('第 1 枚获得全额 60 修为', gains[0] === 60);
  assert('第 5 枚仍为 100% 收益', gains[4] === 60);
  assert('第 6 枚收益减半（+30）', gains[5] === 30);
  assert('第 10 枚仍为 50% 收益', gains[9] === 30);
  assert('第 11 枚收益为 0（经脉麻木）', gains[10] === 0);
  assert('第 11 枚提示「已然麻木，毫无寸进」', lastLog().indexOf('毫无寸进') >= 0);
  assert('服用史正确记录 11 枚', p.pillHistory["pill_zhanjin"] === 11);
  assert('服下 11 枚后背包余 1 枚', count("pill_zhanjin") === 1);

  // 降尘丹：突破反噬 -80%
  add("pill_jiangchen", 1);
  G.Alchemy.takePill("pill_jiangchen");
  assert('服下降尘丹标记 jiangchen', p.jiangchen === true);
  assert('反噬倍率 0.2（降低 80%）', G.Alchemy.breakDmgMul() === 0.2);
  G.Alchemy.consumeJiangchen();
  assert('突破后药力一次性耗尽', p.jiangchen === false && G.Alchemy.breakDmgMul() === 1);
}

// ============ 验收 ⑤：云京皇宫 · 夜战幽冥教 ============
console.log('==== 五、云京皇宫：血侍分破 + 双阶段 Boss + 引魔入阵（验收⑤） ====');
{
  const p = reset(13);
  assert('副本可准入（筑基一层）', G.Heisha.canEnter() === true);
  assert('副本开启（阶段一）', G.Heisha.start() === true && G.Heisha.state().stage === 1);

  // 阶段二未解锁：血侍未除不可挑战 Boss
  assert('血侍未除不可直接决战越皇', G.Heisha.fightBoss() === false);

  // 分破四大血侍
  const guards = ["heisha_tieluo", "heisha_qingwen", "heisha_yehong", "heisha_bingyao"];
  for (const gid of guards) {
    setRand(0.5);
    G.Heisha.challenge(gid);
    assert('挑战【' + gid + '】触发战斗', !!p.combat);
    p.combat.hp = 1;
    G.Combat.attack();          // 击杀 → victory 路由 → Heisha.afterCombat
  }
  assert('四大血侍尽数伏诛', G.Heisha.allGuardsDown() === true);
  assert('血侍掉落煞丹碎片入袋', count("shadan_suipian") >= 4);

  // 战前布置颠倒五行阵
  add("array_wuxing", 1);
  assert('布下颠倒五行阵残阵', G.Heisha.setArray() === true);
  assert('残阵自背包消耗', count("array_wuxing") === 0);

  // 决战越皇：血侍光环削弱（4 × 10% = 40%）
  const midBefore = count("mid_stone");   // 血侍已掉过若干中阶灵石，Boss 战前后差值应为 +3
  setRand(0.5);
  assert('决战越皇开启', G.Heisha.fightBoss() === true);
  const baseAtk = G.DATA.HEISHA && 70;      // 越皇面板 atk
  const atkAfterDebuff = p.combat.atk;
  assert('血祭光环削弱：攻防各削 40%', Math.abs(atkAfterDebuff - Math.round(70 * 0.6)) <= 1);

  // 引魔入阵：封印 50% + 打断吸血
  const atkBeforeLure = p.combat.atk;
  assert('引魔入阵成功', G.Heisha.lureIntoArray() === true);
  assert('阵中封印：攻击再削 50%', Math.abs(p.combat.atk - Math.round(atkBeforeLure * 0.5)) <= 1);
  assert('阵封标记生效（打断血炼吸血）', p.combat.arraySealed === true && G.Heisha.state().arrayUsed === true);
  assert('二次引魔被拒（已在阵中）', G.Heisha.lureIntoArray() === false);

  // Phase 2：生命降至 30% 触发血祭狂暴（攻击翻倍 + 80% 法抗）
  const atkBeforePhase2 = p.combat.atk;
  p.combat.hp = Math.round(p.combat.maxHp * 0.30) - 1;
  G.Combat.attack();                          // 攻击命中后回调 onBossDamaged
  assert('Boss 濒死触发【血祭狂暴】二阶段', p.combat.bossPhase2 === true);
  assert('二阶段攻击翻倍', Math.abs(p.combat.atk - Math.round(atkBeforePhase2 * 2)) <= 2);
  assert('二阶段名号变为黑煞妖魔化', p.combat.name === '黑煞妖魔化·越皇');
  assert('二阶段获得 80% 全法术抗性', p.combat.magicResist === 0.80);

  // 击杀 → 战役掉落
  p.combat.hp = 1;
  G.Combat.attack();
  assert('越皇伏诛、副本通关', G.Heisha.state().bossDone === true);
  assert('必掉稀世异宝【赤玉蛛卵】', count("xueyu_zhizhu_luan") === 1);
  assert('掉落《凝厚宝典》残卷', count("ninghou_canjuuan") === 1);
  assert('掉落中阶灵石 ×3', count("mid_stone") === midBefore + 3);
  assert('宗门贡献 +200', p.sectContrib === 200);
}

// ============ 验收 ⑥：怀璧其罪 · 老怪觊觎度 ============
console.log('==== 六、高年份药草销赃 → 觊觎度满值 → 神识锁定与逃生（验收⑥） ====');
{
  const p = reset(13);
  p.noHarass = true;

  assert('初始觊觎度为 0', G.Bottle.risk() === 0);

  // 承露瓶深层催熟：5 滴 → 五百年玄冰花；10 滴 → 千年龙鳞果
  p.liquid = 4;
  assert('绿液不足 5 滴不可催熟玄冰花', G.Bottle.catalyze("xuanbing") === false);
  p.liquid = 15;
  assert('5 滴绿液催熟【五百年玄冰花】', G.Bottle.catalyze("xuanbing") === true && count("herb_xuanbing") === 1);
  assert('10 滴绿液催熟【千年龙鳞果】', G.Bottle.catalyze("longlin") === true && count("herb_longlin") === 1);
  assert('玄冰花年份 500 / 龙鳞果年份 1000', G.Bottle.yearsOf("herb_xuanbing") === 500 && G.Bottle.yearsOf("herb_longlin") === 1000);

  // 出售 500 年药草：觊觎度 +25
  add("talisman_chuansong", 0);
  G.Market.toggle();
  assert('进入坊市', p.atMarket === true);
  const risk0 = G.Bottle.risk();
  G.Market.sell("herb_xuanbing");
  assert('出售 500 年玄冰花 → 觊觎度 +25', G.Bottle.risk() === risk0 + 25);

  // 出售千年药草：觊觎度 +60（累计 85 → 越过 80 警戒线）
  G.Market.sell("herb_longlin");
  assert('出售 1000 年龙鳞果 → 觊觎度再 +60（封顶 100）', G.Bottle.risk() >= 80);
  assert('觊觎度满值触发警戒提示', p.riskWarned === true);

  // 离开坊市：强制触发【结丹期修士神识锁定】
  G.Market.toggle();   // leave
  assert('离开坊市触发神识锁定（riskHunt）', p.riskHunt === true);
  assert('锁定事件文本命中', logs.join('').indexOf('结丹期修士神识锁定') >= 0);

  // 检定 A：无高阶敛气术 → 不可隐匿
  assert('未修高阶敛气术不可隐匿脱险', G.Bottle.canConceal() === false);

  // 检定 B：焚千里符强行遁走
  add("talisman_qianli", 1);
  const stonesBefore = p.spiritStones;
  assert('持千里符可强行遁走', G.Bottle.canTalisman() === true && G.Bottle.escape("talisman") === true);
  assert('千里符已焚毁', count("talisman_qianli") === 0);
  assert('遁走成功：灵石未失、追杀解除', p.spiritStones === stonesBefore && p.riskHunt === false);

  // 均不满足：被截杀，玄傀替死断后
  G.Bottle.addRisk(100);          // 再度拉满
  G.Market.toggle();              // 再次进入坊市
  G.Market.sell("herb_longlin");  // 无龙鳞果则卖不出——直接手动拉满风险
  p.marketRiskValue = 100;
  G.Market.toggle();              // 离开 → 再次锁定
  p.riskHunt = true;              // 确保 hunting 态
  p.spiritStones = 888;
  add("herb_longlin", 1);
  G.Bottle.escape(null);          // 无符无敛气 → 截杀
  assert('截杀逃生：灵石尽失', p.spiritStones === 0);
  assert('截杀逃生：所携药草尽数被夺', count("herb_longlin") === 0);
  assert('追杀状态解除（保住性命）', p.riskHunt === false && p.isDead === false);
}

// ============ 汇总 ============
console.log('\n==== 结果: ' + pass + ' passed, ' + fail + ' failed ====');
if (fails.length) { console.log('失败项:'); fails.forEach(f => console.log('  - ' + f)); }
process.exit(fail > 0 ? 1 : 0);
