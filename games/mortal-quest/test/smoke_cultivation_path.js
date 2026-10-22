'use strict';
/* =========================================================
 * test/smoke_cultivation_path.js —— 结丹道途（法修 / 体修）回归测试
 *   ① 数据结构：PATHS 两道途、choose_path 事件、赤明魔体诀（功法/物品/货架/总录）
 *   ② 默认法修不改任何数值（老存档零回归）
 *   ③ getStats：体修攻击/防御 ×1.25（含反向对照：改回法修必须回落）
 *   ④ foundationMaxSpirit：体修神识上限 ×0.7（法修不变）
 *   ⑤ Path.set 唯一写入口：气血上限补差 ×1.15、一经择定不可改、非法 id 拒绝
 *   ⑥ offer 挂事件 + chooseEventOption 全链（pathmod 分派走通）
 *   ⑦ 赤明魔体诀：法修研习被拒且不耗物品、体修可习并沾染煞气、攻击 +12
 *   ⑧ 突破反噬：Breakthrough.plan 的 dmgMul ×0.85（含反向对照）
 *   ⑨ 结丹功成那一息挂起道途抉择（_rollBreakthrough 直达）
 * 运行： node test/smoke_cultivation_path.js
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
  'js/chronicle.js', 'js/faction.js', 'js/path.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;

// 坊市/黑市桩：passTime 触发换货时不依赖未加载模块
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
  p.realmIndex = 18;               // 结丹后期：道途与赤明魔体诀均已解锁
  p.spiritStones = 5000;
  p.currentHp = 99999; p.maxHp = 99999;
  p.ageYears = 100; p.ageMonths = 0; p.totalMonths = 0;
  p.marketNextRefresh = 999999; p.junkNextRefresh = 999999;
  if (o) Object.keys(o).forEach(function (k) { p[k] = o[k]; });
  return p;
}

section('【1】数据结构');
ok('PATHS 恰好两道途', Object.keys(G.DATA.PATHS).length === 2);
ok('法修是基准（三系数全为 1）', G.DATA.PATHS.fa.atkDefMul === 1 &&
  G.DATA.PATHS.fa.hpMul === 1 && G.DATA.PATHS.fa.spiritMul === 1);
ok('体修系数 = 攻防 1.25 / 血 1.15 / 神识 0.7', G.DATA.PATHS.ti.atkDefMul === 1.25 &&
  G.DATA.PATHS.ti.hpMul === 1.15 && G.DATA.PATHS.ti.spiritMul === 0.7);
const cpe = G.DATA.PATH_EVENTS.choose_path;
ok('choose_path 事件存在且有文案', !!cpe && !!cpe.text);
ok('choose_path 两个选项', cpe.choices.length === 2);
ok('两个选项各带 tip（否则面板赌注栏空白）', cpe.choices.every(function (c) { return !!c.tip; }));
ok('两个选项 outcomes 均为 pathmod', cpe.choices.every(function (c) {
  return c.outcomes.length === 1 && c.outcomes[0].type === 'pathmod' && c.outcomes[0].chance === 1;
}));
ok('选项 0 = 体修，选项 1 = 法修', cpe.choices[0].outcomes[0].path === 'ti' &&
  cpe.choices[1].outcomes[0].path === 'fa');
const cm = G.DATA.SPELLS.chiming_moti;
ok('赤明魔体诀功法已定义', !!cm);
ok('赤明魔体诀：仅体修 / 结丹门槛 / 反噬 0.85 / 攻击 +12',
  cm.tiOnly === true && cm.req === 16 && cm.recoilMul === 0.85 && cm.atkBonus === 12 && cm.evil === true);
ok('赤明魔体诀是 passive（无 dmg，不入施法列表）', cm.dmg == null);
ok('秘籍物品已定义且修习沾染煞气', !!G.DATA.ITEMS.skill_chiming &&
  G.DATA.ITEMS.skill_chiming.use.learnSpell === 'chiming_moti' && G.DATA.ITEMS.skill_chiming.use.shaQi === 12);
ok('黑市货架上架', (G.DATA.CONTENT.BLACK_SKILLS || []).some(function (g) { return g.id === 'skill_chiming'; }));
ok('技能总录收录（修行录可见）', (G.DATA.SKILL_CODEX || []).some(function (e) { return e.spell === 'chiming_moti'; }));

section('【2】默认法修：老存档零回归');
let p = mk({});
ok('新玩家默认法修', p.cultivationPath === 'fa');
ok('新玩家未择定道途', p.pathChosen === false);
ok('法修攻击/防御系数为 1', G.Path.atkDefMul(p) === 1 && G.Path.hpMul(p) === 1 && G.Path.spiritMul(p) === 1);
const faStats = G.State.getStats();
const faSpirit = G.DATA.foundationMaxSpirit(p);
p.cultivationPath = 'ti';
const tiStats = G.State.getStats();
const tiSpirit = G.DATA.foundationMaxSpirit(p);
ok('法修数值即基准（体修对照的零点）', G.Path.atkDefMul({ cultivationPath: 'fa' }) === 1);

section('【3】getStats：体修攻防偏置（含反向对照）');
ok('体修攻击 = 法修 ×1.25', tiStats.atk === Math.round(faStats.atk * 1.25));
ok('体修防御 = 法修 ×1.25', tiStats.def === Math.round(faStats.def * 1.25));
ok('速度不随道途变动', tiStats.speed === faStats.speed);
p.cultivationPath = 'fa';
ok('反向对照：改回法修 → 攻击回落基准', G.State.getStats().atk === faStats.atk);
ok('反向对照：改回法修 → 防御回落基准', G.State.getStats().def === faStats.def);

section('【4】foundationMaxSpirit：体修神识 ×0.7');
ok('体修神识上限 = 法修 ×0.7', tiSpirit === Math.round(faSpirit * 0.7));
ok('反向对照：改回法修 → 神识上限回落', G.DATA.foundationMaxSpirit(p) === faSpirit);

section('【5】Path.set：唯一写入口');
p = mk({ maxHp: 1000, currentHp: 500 });
G.Path.set(p, 'ti');
const wantHp = Math.round(1000 * G.DATA.PATHS.ti.hpMul);
ok('体修当场补足气血上限 ×1.15', p.maxHp === wantHp);
ok('当前气血按差量补齐（不满上限也不缩水）', p.currentHp === 500 + (wantHp - 1000));
ok('pathChosen 落定', p.pathChosen === true);
ok('Chronicle 记一笔体修择定', (G.DATA.CHRONICLE.ti_path_chosen || []).length > 0);
logs.length = 0;
G.Path.set(p, 'fa');
ok('一经择定不可更改', p.cultivationPath === 'ti' && p.pathChosen === true);
ok('不可更改有文案说明', logs.some(function (l) { return /道途已定/.test(l); }));
ok('非法 id 被拒', G.Path.set(mk({}), 'nonexistent') === false);
p = mk({});
G.Path.set(p, 'fa');
ok('法修无气血补差（hpMul = 1）', p.maxHp === 99999 && p.currentHp === 99999);

section('【6】事件全链：offer → findEvent → chooseEventOption');
p = mk({});
ok('offer 挂起道途事件', G.Path.offer(p) === true);
ok('pendingEvent = choose_path', !!p.pendingEvent && p.pendingEvent.eventId === 'choose_path');
ok('findEvent 取得到（否则面板静默吞掉）', !!G.Core.findEvent('choose_path'));
p.pathChosen = true;
ok('已择定不再重复挂', G.Path.offer(p) === false);
p = mk({});
G.Path.offer(p);
G.Core.chooseEventOption(0);
ok('选项 0 → 体修落地', G.Path.isTi(p) && p.pathChosen === true);
p = mk({});
G.Path.offer(p);
G.Core.chooseEventOption(1);
ok('选项 1 → 法修落地', G.Path.isFa(p) && p.pathChosen === true);
p = mk({});
G.Path.offer(p);
G.Core.chooseEventOption(1);
ok('事件消费后清空（不卡面板）', p.pendingEvent == null);

section('【7】赤明魔体诀：道途门禁与收益');
p = mk({ changchunLevel: 18 });            // 法修
G.State.addItem('skill_chiming', 1);
logs.length = 0;
G.Core.takePill('skill_chiming');
ok('法修研习被拒', !p.spells || !p.spells.chiming_moti);
ok('被拒不消耗秘籍', G.State.countItem('skill_chiming') === 1);
ok('拒绝文案点明须体修', logs.some(function (l) { return /体修/.test(l); }));

p = mk({ changchunLevel: 18, pathChosen: true, cultivationPath: 'ti' });
const atkBefore = G.State.getStats().atk;
const shaBefore = p.shaQi || 0;
G.State.addItem('skill_chiming', 1);
G.Core.takePill('skill_chiming');
ok('体修习得赤明魔体诀', !!(p.spells && p.spells.chiming_moti));
ok('习得消耗秘籍', G.State.countItem('skill_chiming') === 0);
ok('修习沾染煞气 +12', (p.shaQi || 0) === shaBefore + 12);
ok('攻击永久 +12', G.State.getStats().atk === atkBefore + 12);
ok('体修声望联动（修魔功 → 乱星盟 +4）', G.Faction.standing(p, 'luanxing') === 4);

section('【8】突破反噬：plan 的 dmgMul（含反向对照）');
// 注意：plan 需有下一境界（结丹后期 18 是顶层，会直接返回 top），故用结丹中期 17
p = mk({ realmIndex: 17, pathChosen: true, cultivationPath: 'ti', spells: { chiming_moti: true } });
const planTi = G.Breakthrough.plan(p);
ok('plan 出参（结丹中期 → 后期）', planTi.ok === true);
ok('体修 + 赤明魔体诀 → 反噬 ×0.85', Math.abs(planTi.dmgMul - 0.85) < 1e-9);
p.spells = {};
ok('反向对照：去掉赤明魔体诀 → 反噬回 1', G.Breakthrough.plan(p).dmgMul === 1);
p = mk({ realmIndex: 17, pathChosen: true, cultivationPath: 'fa', spells: { chiming_moti: true } });
ok('反噬减免只看习得记录、不重复判道途（门禁在研习处）', Math.abs(G.Breakthrough.plan(p).dmgMul - 0.85) < 1e-9);
p = mk({ realmIndex: 17, pathChosen: true, cultivationPath: 'ti', spells: {} });
ok('反向对照：未习赤明 → 反噬为 1', G.Breakthrough.plan(p).dmgMul === 1);
p = mk({ realmIndex: 17 });
ok('默认法修无道途加成，plan 正常出参数', G.Breakthrough.plan(p).ok === true);

section('【9】结丹功成那一息挂起道途抉择');
p = mk({ realmIndex: 15 });                 // 筑基后期 → 结丹初期
_rand = 0;                                  // 必定成功
G.Core._rollBreakthrough({
  successChance: 1, dmgMul: 1, deathMul: 0,
  isZhuji: false, zhujiPill: null, pillName: '', bareZhuji: false,
  isJiedan: true, jiedanPill: null, bareJiedan: false, fakeJiedan: false,
  guardUsed: false
});
ok('突破落到结丹初期', p.realmIndex === G.DATA.JIEDAN_GATE_INDEX);
ok('结丹功成 → 挂起道途抉择', !!p.pendingEvent && p.pendingEvent.eventId === 'choose_path');
ok('择定前气血上限不带体修系数（hpMul = 1）', p.maxHp === G.DATA.REALMS[16].hp);
_rand = 0.5;
p = mk({ realmIndex: 15, pathChosen: true, cultivationPath: 'ti' });
_rand = 0;
G.Core._rollBreakthrough({
  successChance: 1, dmgMul: 1, deathMul: 0,
  isZhuji: false, zhujiPill: null, pillName: '', bareZhuji: false,
  isJiedan: true, jiedanPill: null, bareJiedan: false, fakeJiedan: false,
  guardUsed: false
});
ok('已择定体修 → 破境气血上限带 ×1.15', p.maxHp === Math.round(G.DATA.REALMS[16].hp * 1.15));
ok('已择定 → 不再重复挂道途事件', p.pendingEvent == null);
_rand = 0.5;

console.log('\n========================================');
console.log('smoke_cultivation_path: ' + pass + ' 通过, ' + fail + ' 失败');
if (fail) { console.log('失败项：\n  ' + fails.join('\n  ')); process.exit(1); }
