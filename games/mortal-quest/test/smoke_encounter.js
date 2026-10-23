'use strict';
/* =========================================================
 * test/smoke_encounter.js —— 野外遭遇生态（区域池 / 数值随动 / 掉落阶级）
 *   ① 区域归属：地图节点 → 山野/城郭/宗门秘境，秘境里不掷野外遭遇
 *   ② 遭遇池：按境界带过滤，练气抽不到筑基带
 *   ③ 头像：每只池怪的立绘键与专有立绘一致（不许落到兜底的巨猿脸）
 *   ④ 随动缩放：气血对标玩家上限、攻击能穿透玩家防御、练气前三层不吃缩放
 *   ⑤ 掉落阶级：野兽不出丹药符箓、小怪精英不出灵药、千年灵药绝禁野外
 *   ⑥ 战胜收益：修为与灵石取缩放后的值，不是数据表初始值
 *   ⑦ 结算通路：monster:"@wild" 能开出战斗，池空时安静收场
 * 运行： node test/smoke_encounter.js
 * ========================================================= */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const BASE = path.resolve(__dirname, '..');
const logs = [];
const uiStub = {
  log: function (msg) { logs.push(String(msg)); },
  updateUI: function () {}, autoSave: function () {}, setDead: function () {},
  renderCombat: function () {}, switchTab: function () {},
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
  'data/wild_dungeons.js', 'data/encounters.js',
  'js/state.js', 'js/storage.js', 'js/art.js', 'js/encounter.js', 'js/combat.js',
  'js/core.js', 'js/time.js', 'js/plot.js', 'js/mortality.js', 'js/market.js', 'js/map.js',
];
for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(BASE, f), 'utf8'), sandbox, { filename: f });
const G = sandbox.GAME;
const E = G.Encounter;

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; fails.push(name); console.log('  ✗ FAIL: ' + name); }
}
function setRand(v) { _rand = v; }
function mk(realmIndex, loc) {
  G.State.createNewPlayer('hunter');
  const p = G.State.p();
  if (realmIndex != null) p.realmIndex = realmIndex;
  // 破境每层 +20 气血（core.js 的既有规则），此处照实模拟
  if (realmIndex != null) { p.maxHp = 100 + realmIndex * 20; p.currentHp = p.maxHp; }
  if (loc) p.location = loc;
  logs.length = 0;
  return p;
}
function defOf(id) { return G.DATA.MONSTERS.filter(m => m.id === id)[0]; }

/* ================= ① 区域归属 ================= */
console.log('==== 一、区域归属：地图节点 → 区域档（验收①） ====');
{
  const cases = [
    ['shenshou_gu', 'wild', '幽篁谷'],
    ['qingniu_zhen', 'wild', '青牛镇'],
    ['jiayuan_cheng', 'city', '景阳城'],
    ['yuejing_cheng', 'city', '云京'],
    ['tainan_gu', 'sect', '苍南谷'],
    ['huangfeng_gu', 'sect', '青梧谷'],
  ];
  let allOk = true;
  cases.forEach(c => {
    const p = mk(6, c[0]);
    if (E.zoneOf(p) !== c[1]) allOk = false;
  });
  ok('六处地标各归其档（山野 / 城郭 / 宗门秘境）', allOk);

  const pCity = mk(6, 'jiayuan_cheng');
  ok('景阳城算城郭区', E.zoneOf(pCity) === 'city');
  const pDg = mk(6, 'tainan_gu');
  pDg.fzone = {};
  ok('人在秘境里 zoneOf 返回 dungeon（不掷野外遭遇）', E.zoneOf(pDg) === 'dungeon');
  pDg.fzone = null;

  const pools = Object.keys(G.DATA.POOLS);
  ok('四个区域都有池：' + pools.join('/'), pools.length >= 4);
  ok('每个池的怪都真实存在于 MONSTERS',
    pools.every(z => G.DATA.POOLS[z].list.every(e => !!defOf(e.id))));
}

/* ================= ② 遭遇池 ================= */
console.log('\n==== 二、遭遇池：区域 + 境界双重过滤（验收①） ====');
{
  const p = mk(4, 'shenshou_gu');         // 练气五层
  const pool = E.poolOf(p);
  const ids = pool.map(e => e.id);
  ok('幽篁谷只出山野三怪与狼王', ids.indexOf('wild_yehu') >= 0 && ids.indexOf('city_jiexiu') < 0);
  ok('跨区不串味（城郭劫修不会出现在幽篁谷）', ids.indexOf('city_lianshi') < 0);

  const pSect = mk(6, 'tainan_gu');       // 练气七层
  const sIds = E.poolOf(pSect).map(e => e.id);
  ok('练气七层在苍南谷抽不到筑基散修（band 13+）', sIds.indexOf('sect_zhuji_sanxiu') < 0);
  ok('练气七层在苍南谷能遇见墨蛟/婴鲤兽/邪修',
    sIds.indexOf('sect_mojiao') >= 0 && sIds.indexOf('sect_yingli') >= 0 && sIds.indexOf('sect_xiexiu') >= 0);

  const pHigh = mk(14, 'tainan_gu');      // 筑基中期
  ok('筑基修士才开始撞见筑基散修', E.poolOf(pHigh).map(e => e.id).indexOf('sect_zhuji_sanxiu') >= 0);

  // 抽 200 次：绝不越带
  let bad = 0, seen = {};
  for (let i = 0; i < 200; i++) {
    setRand((i + 0.37) / 200);
    const d = E.pick(pSect);
    if (!d) { bad++; continue; }
    seen[d.id] = 1;
    const band = G.DATA.POOLS.sect.list.filter(e => e.id === d.id)[0].band;
    if (pSect.realmIndex < band[0] || pSect.realmIndex > band[1]) bad++;
  }
  ok('抽 200 次没有一只越出境界带', bad === 0);
  ok('抽 200 次能抽出多种（不算死池）：' + Object.keys(seen).length + ' 种', Object.keys(seen).length >= 3);

  // 修为远超全部 band：退回该区最宽档，绝不空手
  const pMax = mk(21, 'tainan_gu');
  ok('元婴在苍南谷也不空池（退回最宽档）', E.poolOf(pMax).length > 0 && !!E.pick(pMax));
}

/* ================= ③ 头像匹配 ================= */
console.log('\n==== 三、名称与立绘 100% 对应（验收①） ====');
{
  const expect = {
    wild_yehu: '铁齿狼', wild_shanzei: '剪径蠢贼', wild_duzhu: '百目毒蛛',
    city_jiexiu: '黑市劫修', city_huwei: '剪径蠢贼', city_lianshi: '炼尸',
    sect_mojiao: '墨蛟', sect_yingli: '婴鲤兽', sect_xiexiu: '魔道邪修',
    sect_zhuji_sanxiu: '黑市劫修', city_boss_moxiu: '魔道邪修', sect_xuejiao: '墨蛟',
    sect_moxiu_jiedan: '魔道邪修', city_moxiu_jiedan: '鬼王', sect_yuanying_sanxiu: '黑市劫修',
    wolfking: '铁齿狼',
  };
  let bad = [];
  Object.keys(expect).forEach(id => {
    const d = defOf(id);
    const key = G.Art.avatarKeyOf(d);
    if (key !== expect[id]) bad.push(id + '→' + key + '(期望' + expect[id] + ')');
  });
  ok('十六只池怪的立绘键全部命中：' + (bad.length ? bad.join(';') : 'ok'), bad.length === 0);

  const fallbackBad = Object.keys(expect).filter(id => {
    const k = G.Art.avatarKeyOf(defOf(id));
    return k === '裂风巨猿' && expect[id] !== '裂风巨猿';   // 兜底脸 = 没接上
  });
  ok('没有一只落到兜底的巨猿脸', fallbackBad.length === 0);

  const files = Object.keys(expect).map(id => G.Art.resolveEnemyAvatar(defOf(id)));
  ok('立绘路径都指向 assets/monsters/ 下的真实文件',
    files.every(f => f.indexOf('assets/monsters/') === 0 &&
      fs.existsSync(path.join(BASE, f))));
}

/* ================= ④ 数值随动缩放 ================= */
console.log('\n==== 四、数值随动缩放：锚到玩家身上（验收②） ====');
{
  setRand(0.5);
  const p = mk(11, 'shenshou_gu');        // 练气十二层，气血 320
  const stats = G.State.getStats();
  const maxHp = p.maxHp;

  const beasts = ['wild_yehu', 'wild_shanzei', 'wild_duzhu'];
  let hpOk = true, atkOk = true;
  beasts.forEach(id => {
    G.Combat.start(id);
    const c = p.combat;
    const lo = maxHp * 0.70, hi = maxHp * 1.05;
    if (!(c.maxHp >= lo && c.maxHp <= hi)) hpOk = false;
    if (!(c.atk > stats.def)) atkOk = false;      // 攻不穿防 → 每回合只掉 1 血，等于没打
    G.Combat.end();
  });
  ok('山野怪气血落在玩家上限的 70%~105%（练气十二层 ' + maxHp + ' 血）', hpOk);
  ok('普通怪攻击能穿透玩家防御（否则每回合只掉 1 血）', atkOk);

  G.Combat.start('city_jiexiu');           // 精英
  const elite = { hp: p.combat.maxHp, atk: p.combat.atk, exp: p.combat.expGain };
  ok('精英气血 ≥ 玩家上限（' + elite.hp + ' ≥ ' + maxHp + '）', elite.hp >= maxHp);
  ok('精英气血不超过玩家上限的 1.2 倍', elite.hp <= Math.round(maxHp * 1.2));
  ok('缩放后修为奖励高于数据表初始值（' + elite.exp + ' > ' + defOf('city_jiexiu').exp + '）',
    elite.exp > defOf('city_jiexiu').exp);
  ok('灵石区间随强度上浮', p.combat.stonesGain[1] > defOf('city_jiexiu').stones[1]);
  ok('同境遭遇不再有假越级压制（crossPenalty=1）', p.combat.crossPenalty === 1);
  G.Combat.end();

  // 练气前三层：不吃缩放，数值与数据表一致
  setRand(0.5);
  const pLow = mk(0, 'shenshou_gu');
  G.Combat.start('wild_yehu');
  ok('练气一层不吃缩放（气血仍为表值 ' + defOf('wild_yehu').hp + '）',
    pLow.combat.maxHp === defOf('wild_yehu').hp);
  ok('练气一层未写入 expGain（沿用表值）', pLow.combat.expGain == null);
  G.Combat.end();

  // 剧情/副本怪不许被缩放
  setRand(0.5);
  const pM = mk(11, 'shenshou_gu');
  G.Combat.start('herb_ambusher');         // 灵药劫杀：剧情召唤，非野外池
  ok('剧情召唤的筑基邪修不被缩放（气血 420 保持原样）', pM.combat.maxHp === 420);
  G.Combat.end();
  G.Combat.start('mo_daifu');
  ok('玄机子剧情战不被缩放', pM.combat.maxHp === 200);
  G.Combat.end();
}

/* ================= ⑤ 掉落阶级 ================= */
console.log('\n==== 五、掉落生态：小怪不爆灵药（验收③） ====');
{
  const cls = ['beast', 'minion', 'elite', 'boss'];
  const all = G.DATA.MONSTERS.filter(m => m.lootClass);
  ok('已标阶级的怪：' + all.length + ' 只（' + cls.join('/') + '）', all.length >= 10);

  const beastPill = [];
  const NOBLE = { pill: 1, talisman: 1, artifact: 1, herb: 1, skill: 1, treasure: 1 };
  all.filter(m => m.lootClass === 'beast').forEach(m => {
    (m.loot || []).forEach(l => {
      const t = G.DATA.ITEMS[l.id] && G.DATA.ITEMS[l.id].type;
      // 毒蛛身上的毒囊（poison）算野兽自带的材料，不算"宝"
      if (NOBLE[t]) beastPill.push(m.id + ':' + l.id + '(' + t + ')');
    });
  });
  ok('野兽只掉皮毛/碎骨/毒囊，丹符器一概没有：' + (beastPill.join(',') || 'ok'), beastPill.length === 0);

  const herbOnLow = [];
  all.filter(m => m.lootClass === 'minion' || m.lootClass === 'elite').forEach(m => {
    (m.loot || []).forEach(l => {
      if (G.DATA.ITEMS[l.id] && G.DATA.ITEMS[l.id].type === 'herb') herbOnLow.push(m.id + ':' + l.id);
    });
  });
  ok('小怪与精英都不出灵药：' + (herbOnLow.join(',') || 'ok'), herbOnLow.length === 0);

  // 闸门本身：即便数据被塞了禁物也过不去
  const dirty = {
    id: 'x', lootClass: 'boss',
    loot: [
      { id: 'herb_qiannian', chance: 1, qty: [1, 1] },
      { id: 'pill_zhuji', chance: 1, qty: [1, 1] },
      { id: 'herb_bainian', chance: 1, qty: [1, 1] },
    ],
  };
  const kept = E.lootFilter(dirty, dirty.loot).map(l => l.id);
  ok('首领也别想掉千年灵药', kept.indexOf('herb_qiannian') < 0);
  ok('首领也别想掉筑基丹', kept.indexOf('pill_zhuji') < 0);
  ok('首领可出百年灵药（唯一被留下的那件）', kept.length === 1 && kept[0] === 'herb_bainian');

  // 全池审计：跑一遍闸门，结果必须与原表一致（说明数据本身就合规）
  let changed = [];
  all.forEach(m => {
    const before = (m.loot || []).map(l => l.id).join(',');
    const after = E.lootFilter(m, m.loot).map(l => l.id).join(',');
    if (before !== after) changed.push(m.id);
  });
  ok('全部阶级数据自审通过（闸门没有裁掉任何一条）', changed.length === 0);

  // 池里一只都不许带千年灵药
  let hot = [];
  Object.keys(G.DATA.POOLS).forEach(z => {
    G.DATA.POOLS[z].list.forEach(e => {
      (defOf(e.id).loot || []).forEach(l => { if (l.id === 'herb_qiannian') hot.push(e.id); });
    });
  });
  ok('野外池里没有任何一只带千年灵药：' + (hot.join(',') || 'ok'), hot.length === 0);

  // 战胜时也过闸门（走真实 grantLoot）
  const p = mk(11, 'shenshou_gu');
  p.inventory = {};
  G.Combat.start('wild_yehu');
  p.combat.def = { id: 'x', name: '测', human: false, lootClass: 'beast', stones: [1, 1],
                   loot: [{ id: 'herb_qiannian', chance: 1, qty: [1, 1] }] };
  setRand(0.01);
  G.Combat.grantLoot(p.combat.def.loot, 1, p.combat.def);
  ok('grantLoot 也挡得住千年灵药（袋里没有）', !p.inventory.herb_qiannian);
  G.Combat.end();
}

/* ================= ⑥ 战胜收益 ================= */
console.log('\n==== 六、战胜收益取缩放后的值（验收②） ====');
{
  setRand(0.5);
  const p = mk(11, 'tainan_gu');
  const exp0 = p.currentExp, stones0 = p.spiritStones;
  // 用妖兽（非人形）验收成：人形敌修走"杀/放"抉择，灵石要等玩家处置后才入袋
  G.Combat.start('sect_mojiao');
  const gainExp = p.combat.expGain;
  const gainStones = p.combat.stonesGain;
  p.combat.hp = 0;
  G.Combat.victory();
  ok('修为按缩放值结算（+' + (p.currentExp - exp0) + '）', p.currentExp - exp0 === gainExp);
  ok('灵石落在缩放后的区间内（+' + (p.spiritStones - stones0) + ' in ' + gainStones.join('~') + '）',
    p.spiritStones - stones0 >= gainStones[0] && p.spiritStones - stones0 <= gainStones[1]);
  ok('修为收益高于数据表初始值（' + gainExp + ' > ' + defOf('sect_mojiao').exp + '）',
    gainExp > defOf('sect_mojiao').exp);
  ok('灵石收益高于数据表初始值', gainStones[1] > defOf('sect_mojiao').stones[1]);
  ok('战斗已收尾（p.combat 置空）', !p.combat);
}

/* ================= ⑦ 结算通路 ================= */
console.log('\n==== 七、monster:"@wild" 能开出战斗（验收①） ====');
{
  setRand(0.5);
  const p = mk(11, 'jiayuan_cheng');
  G.Core.resolveEventOutcomes([{ chance: 1, type: 'combat', monster: '@wild' }]);
  ok('抽中城郭区敌手并开战', !!p.combat);
  ok('抽到的是城郭池里的怪',
    !!p.combat && G.DATA.POOLS.city.list.some(e => e.id === p.combat.def.id));
  ok('遭遇日志带区域名（城郭）', logs.some(l => l.indexOf('城郭') >= 0));
  if (p.combat) G.Combat.end();

  // 池空 → 安静收场，绝不空开一场没有对手的斗法
  const savedPoolOf = E.poolOf;
  E.poolOf = function () { return []; };
  E.pick = function () { return null; };
  const p2 = mk(6, 'qingniu_zhen');
  G.Core.resolveEventOutcomes([{ chance: 1, type: 'combat', monster: '@wild' }]);
  ok('池空时不进战斗、不抛错', !p2.combat);
  ok('池空时给一句人话', logs.some(l => l.indexOf('并无敌影') >= 0));
  E.poolOf = savedPoolOf;
  delete E.pick;
  E.pick = Object.getPrototypeOf(E).pick;
}

console.log('\n结果: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
