'use strict';
/* =========================================================
 * test/smoke2.js —— 练气期四大扩展系统 无头冒烟测试
 * 用 Node vm 加载 data + 逻辑模块（不加载 ui.js / storage.js，以桩替 GAME.UI），
 * 通过受控 Math.random 做确定性断言，验证：
 *   一、宗门杂役与经营   二、坊市淘宝 + 黑市销赃
 *   三、斗法深度扩展     四、血月试炼 Roguelike
 *   附：打坐耗时随境界 / 突破丹药优先级
 * 运行： node test/smoke2.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.resolve(__dirname, '..'); // ImmortalGame 根

// ---------- UI / DOM 桩（逻辑层只调这几处，全置空实现） ----------
const uiStub = {
  log: function () {},
  updateUI: function () {},
  autoSave: function () {},
  setDead: function () {},
  renderSect: function () {}, renderBlack: function () {},
  renderTrial: function () {}, renderTrack: function () {},
  renderCombat: function () {}, toggleTalismans: function () {},
};

// ---------- 可控随机数（每个用例前 setRand 设固定值，保证断言确定） ----------
let _rand = 0.5;
function setRand(v) { _rand = v; }

// ---------- 沙箱 / 上下文 ----------
const sandbox = {};
sandbox.window = sandbox;          // window.GAME === GAME
sandbox.console = console;
sandbox.GAME = { UI: uiStub };
sandbox.Math = Object.assign(Object.create(Math), { random: function () { return _rand; } });
vm.createContext(sandbox);

// ---------- 按 index.html 顺序加载（跳过 ui.js / storage.js） ----------
const FILES = [
  'data/realms.js', 'data/items.js', 'data/events.js', 'data/world.js', 'data/content.js',
  'js/state.js', 'js/combat.js', 'js/core.js', 'js/market.js',
  'js/sect.js', 'js/blackmarket.js', 'js/trial.js',
];
for (const f of FILES) {
  const code = fs.readFileSync(path.join(BASE, f), 'utf8');
  vm.runInContext(code, sandbox, { filename: f });
}
const G = sandbox.GAME;

// ---------- 简单测试框架 ----------
let pass = 0, fail = 0; const fails = [];
function assert(name, cond) {
  if (cond) { pass++; console.log('  \u2713 ' + name); }
  else { fail++; fails.push(name); console.log('  \u2717 FAIL: ' + name); }
}
function reset(realmIndex) {
  G.State.createNewPlayer('wanderer');
  const p = G.State.p();
  if (realmIndex != null) p.realmIndex = realmIndex;
  return p;
}

console.log('\n【0】数据完整性自检');
assert('realms 全部含 meditateMonths', G.DATA.REALMS.every(r => typeof r.meditateMonths === 'number'));
assert('配方含正品筑基丹', !!G.DATA.RECIPES.find(r => r.pill === 'pill_zhengpin'));
assert('怪物含试炼精英', !!G.DATA.MONSTERS.find(m => m.id === 'trial_elite_zheng') && !!G.DATA.MONSTERS.find(m => m.id === 'robber'));
assert('CONTENT 杂役3项', G.DATA.CONTENT.MISSIONS.length === 3);
assert('CONTENT 兑换3项', G.DATA.CONTENT.SECT_EXCHANGE.length === 5);
assert('CONTENT 旧货3项', G.DATA.CONTENT.BLACKMARKET_JUNK.length === 3);
assert('CONTENT 试炼三药齐', G.DATA.CONTENT.TRIAL.herbs.length === 3);

console.log('\n【1】宗门杂役与经营系统');
// 承接百草园：贡献+6，得灵石，得百年灵药
setRand(0.01);
let p = reset(0);
let stoneB = p.spiritStones;
G.Sect.doMission('herb_garden');
assert('承接百草园 贡献+6', p.sectContrib === 6);
assert('杂役得灵石', p.spiritStones > stoneB);
assert('杂役得百年灵药', G.State.countItem('herb_bainian') >= 1);

// 监守自盗：安全（0.5 ≥ 0.15 不被抓），仍得私藏、扣绿液、无惩罚
setRand(0.5);
p = reset(0);
p.liquid = 5;
stoneB = p.spiritStones;
G.Sect.steal('herb_garden');
assert('监守自盗得私藏药草', G.State.countItem('herb_bainian') >= 1);
assert('监守自盗耗绿液(5→4)', p.liquid === 4);
assert('0.5概率未被抓(无罚没/无折寿)', p.spiritStones === stoneB && p.ageYears === 16);

// 监守自盗：被抓（0.01 < 0.15），惩罚触发，但仍得私藏
setRand(0.01);
p = reset(0);
p.liquid = 5;
stoneB = p.spiritStones;
G.Sect.steal('herb_garden');
assert('监守自盗被抓(惩罚触发)', p.spiritStones < stoneB || p.ageYears > 16);
assert('被抓仍得私藏药草', G.State.countItem('herb_bainian') >= 1);

// 废弃矿守卫：贡献+12，地脉煞气+3，气血上限-5
setRand(0.01);
p = reset(0);
p.maxHp = 100; p.currentHp = 100;
G.Sect.doMission('mine_guard');
assert('废弃矿守卫 贡献+12', p.sectContrib === 12);
assert('地脉煞气 +3', p.shaQi === 3);
assert('气血上限 -5 (100→95)', p.maxHp === 95);

// 贡献兑换
setRand(0.5);
p = reset(0);
p.sectContrib = 10;
G.Sect.exchange('artifact_frag');
assert('贡献兑换 下品法器残片', G.State.countItem('artifact_frag') === 1 && p.sectContrib === 0);

console.log('\n【2】坊市淘宝 + 黑市销赃');
// 盲买被坑：0.99 ≥ 0.5 → junk_scrap
setRand(0.99);
p = reset(0);
p.spiritStones = 200;
G.BlackMarket.refreshJunk();
stoneB = p.spiritStones;
G.BlackMarket.buyJunk(0); // junk_rusty 未鉴定
assert('盲买扣灵石', p.spiritStones < stoneB);
assert('盲买被坑得废铁(junk_scrap)', G.State.countItem('junk_scrap') === 1);

// 神识鉴定后如实得真品：筑基 spirit=22 满足 needSpirit≤10
setRand(0.01);
p = reset(13);
p.spiritStones = 200;
G.BlackMarket.refreshJunk();
G.BlackMarket.appraise(0); // junk_rusty needSpirit=8 < 22
assert('神识鉴定通过(appraised=true)', p.junkGoods[0].appraised === true);
G.BlackMarket.buyJunk(0);
assert('鉴定后如实得真品(sword_fragment)', G.State.countItem('sword_fragment') === 1);

// 黑市销赃：煞气高(50) → 必被尾随
setRand(0.01);
p = reset(0);
p.shaQi = 50;
G.State.addItem('herb_bainian', 2);
stoneB = p.spiritStones;
G.BlackMarket.sellBlack('herb_bainian');
assert('黑市高价销赃(灵石大增)', p.spiritStones > stoneB);
assert('煞气高触发神识尾随', p.tracking !== null && p.tracking.stones === 150);

// 黑市销赃：敛气高(10) → 安然脱身
setRand(0.5);
p = reset(0);
p.concealLevel = 10;
G.State.addItem('herb_qiannian', 1);
G.BlackMarket.sellBlack('herb_qiannian');
assert('敛气高安然脱身(无尾随)', p.tracking === null);

// 神识尾随三选项：破财消灾
setRand(0.5);
p = reset(0);
p.tracking = { stones: 150 };
p.spiritStones = 100;
G.BlackMarket.chooseTrack('pay');
assert('破财消灾扣一半灵石(100→25)', p.spiritStones === 25 && p.tracking === null);

// 神识尾随三选项：神行符脱身
setRand(0.5);
p = reset(0);
p.tracking = { stones: 150 };
p.spiritStones = 100;
G.State.addItem('talisman_shenxing', 1);
G.BlackMarket.chooseTrack('escape');
assert('神行符脱身保住灵石', p.spiritStones === 100 && p.tracking === null && G.State.countItem('talisman_shenxing') === 0);

console.log('\n【3】斗法深度扩展（符箓/毒囊/耐久/自爆）');
// 毒囊涂抹：首回合设置 poison，enemyTurn 立即毒发一次(turns 3→2)
setRand(0.01);
p = reset(0);
G.State.addItem('poison_mortal', 1);
G.Combat.start('wolf');
G.Combat.coatPoison();
assert('毒囊被消耗', G.State.countItem('poison_mortal') === 0);
assert('毒囊涂抹设置 poison(dmg=6)', p.combat && p.combat.poison && p.combat.poison.dmg === 6);
assert('首回合毒发回合-1(turns=2)', p.combat.poison.turns === 2);

// 法器耐久：重击(>10)损耗 1 点（random=0.5 保证敌方命中，避开 12% 基础miss）
setRand(0.5);
p = reset(0);
G.State.addItem('artifact_qingwen', 1);
G.Core.equipArtifact('artifact_qingwen');
assert('装备法器耐久满(10)', p.artifactDurability === 10 && p.artifact === 'artifact_qingwen');
G.Combat.start('trial_elite_mo'); // atk22 vs def2 → 重击约20 > 10
G.Combat.enemyTurn();
assert('承重击后法器耐久下降(10→9)', p.artifactDurability === 9);

// 濒死自爆法器：300% 攻击不可减免
setRand(0.99);
p = reset(0);
G.State.addItem('artifact_qingwen', 1);
G.Core.equipArtifact('artifact_qingwen'); // atk+6
G.Combat.start('wolf'); // hp 55
p.currentHp = 20; // ≤ 25% * 100
G.Combat.detonate();
assert('自爆摧毁法器', p.artifact === null && p.artifactDurability === 0);
assert('自爆造成重创(55→37)', p.combat.hp < 55);

// 符箓轰炸：火球符直接伤害
setRand(0.5);
p = reset(0);
G.State.addItem('talisman_huoqiu', 1);
G.Combat.start('wolf'); // hp 55
let hpB = p.combat.hp;
G.Combat.useTalisman('talisman_huoqiu');
assert('火球符造成 32 伤害', p.combat.hp === hpB - 32 && G.State.countItem('talisman_huoqiu') === 0);

console.log('\n【4】血月试炼 Roguelike');
setRand(0.5);
p = reset(0); // 练气1
assert('练气1不可入试炼', G.Trial.canEnter() === false);

setRand(0.5);
p = reset(9); // 练气10
assert('练气10可入试炼', G.Trial.canEnter() === true);
G.Trial.start();
assert('进入试炼 stepsLeft=20', p.trial && p.trial.stepsLeft === 20);
assert('试炼计数 trialsEntered+1', p.stats.trialsEntered === 1);

// 采集（0.01*100=1 < 34 → gather）
setRand(0.01);
let herbCnt = G.State.countItem('herb_tianling') + G.State.countItem('herb_yumo') + G.State.countItem('herb_zihou');
G.Trial.step();
let herbCnt2 = G.State.countItem('herb_tianling') + G.State.countItem('herb_yumo') + G.State.countItem('herb_zihou');
assert('试炼采集到主药', herbCnt2 === herbCnt + 1);
assert('前进后 stepsLeft=19', p.trial.stepsLeft === 19);

// 精英截杀（34≤50<74 → combat），验证 trial 战斗路由
setRand(0.5);
G.Trial.step();
assert('试炼精英截杀进入战斗(trial标记)', p.combat !== null && p.combat.trial === true);
assert('战斗后 stepsLeft=18', p.trial.stepsLeft === 18);
let shaB = p.shaQi;
G.Combat.victory();
assert('试炼战胜不弹杀/放抉择(combat=null)', p.combat === null);
assert('试炼战胜煞气+3', p.shaQi === shaB + 3);

// 破阵（0.8*100=80 ≥ 74 → array；roll=0.8 → stones）
setRand(0.8);
p = reset(9);
G.Trial.start();
stoneB = p.spiritStones;
G.Trial.step();
assert('试炼破阵 branch=stones(灵石增加)', p.spiritStones > stoneB);

// 走完20步脱离
setRand(0.5);
p = reset(9);
G.Trial.start();
p.trial.stepsLeft = 0;
G.Trial.step();
assert('走完20步脱离试炼(trial=null)', p.trial === null);

console.log('\n【5】打坐耗时随境界 + 突破丹药优先级');
setRand(0.5);
p = reset(0); // 练气1 → 3月
G.Core.meditate();
assert('练气1打坐耗时3月', p.totalMonths === 3 && p.ageMonths === 3);
assert('打坐 +1 修为', p.currentExp === 1);

p = reset(9); // 练气10 → 6月
G.Core.meditate();
assert('练气10打坐耗时6月', p.totalMonths === 6);

// 正品筑基丹破关 + 丹药优先级（正品先于伪丹消耗）
setRand(0.01);
p = reset(12); // 练气13, needExp 920
p.currentExp = 920;
G.State.addItem('pill_zhengpin', 1);
G.State.addItem('fake_zhuji', 1);
G.Core.breakthrough();
assert('正品筑基丹破关成功(入筑基)', p.realmIndex === 13);
assert('丹药优先级:正品先消耗,伪丹留', G.State.countItem('pill_zhengpin') === 0 && G.State.countItem('fake_zhuji') === 1);

// 伪筑基丹亦可破关（成功率低但 0.01 命中）
setRand(0.01);
p = reset(12);
p.currentExp = 920;
G.State.addItem('fake_zhuji', 1);
G.Core.breakthrough();
assert('伪筑基丹亦可破关', p.realmIndex === 13);

// 修习敛气术
setRand(0.5);
p = reset(0);
G.State.addItem('conceal_skill', 1);
G.Core.takePill('conceal_skill');
assert('修习敛气术 敛气+1', p.concealLevel === 1 && G.State.countItem('conceal_skill') === 0);

console.log('\n=== 结果: ' + pass + ' passed, ' + fail + ' failed ===');
if (fail) { console.log('FAILED: ' + fails.join(' | ')); process.exit(1); }
process.exit(0);
