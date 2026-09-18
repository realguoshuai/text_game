/* 仙岛寻踪 —— 等距多地图引擎
 * 地图由 assets/maps.json 描述：ground 字符网格（地砖）+ objects（图块）+ portals（传送门）
 * 所有图块来自 tools/slice_sheet.py 从 AI 素材总图切分所得（assets/sliced/*.png）
 */
(function () {
  'use strict';

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = 0, H = 0;
  var TILE_W = 120, TILE_H = 60, HW = 60, HH = 30, THICK = 15;

  // 角色 sprite sheet（6列×5行，64×64/格）：行0=正面 行1=右 行2=左 行3=背
  var SHEET = { cols: 6, rows: 5, cellW: 64, cellH: 64, frames: 6, dir: { down: 0, right: 1, left: 2, up: 3 }, pxScale: 2 };

  /* ---------------- 动作行 ----------------
   * 两种角色的动作表结构不同：
   *  · 等距素材（1/5/10/14/18/20 号）：5 行 = 4 个朝向 + 1 行备用，行是「朝向」。
   *  · CraftPix 侧视素材（31/32/33/41/42/43 号）：6 行 = 6 个动作，行是「动作」，
   *    只有一个朝向（右边），左边由引擎水平翻转得到。
   * SIDE_ACT 的取值必须与 test/tools/add_craftpix_heroes.py 里 ACTS 的顺序一致。
   */
  var SIDE_ACT = { idle: 0, walk: 1, run: 2, atkA: 3, atkB: 4, dead: 5 };
  var ACT_DUR = { atkA: 0.65, atkB: 1.0, dead: 1.5 };   // 一次性动作的播放时长（秒）；攻击放慢才看得清
  var ACT_CN = { idle: '待机', walk: '行走', run: '奔跑', atkA: '攻击 A', atkB: '攻击 B', dead: '倒地' };
  /* ---------------- 战斗手感参数 ----------------
   * 这一组数值只影响「打起来什么感觉」，不动 FOE_DEFS 里的血量/攻防，
   * 所以调整它们不会改变关卡难度，只改变节奏和反馈。 */
  var ATK_A_CD = ACT_DUR.atkA;  // ★ 普攻冷却必须 ≥ 动作时长：旧版写死 0.45s 而动作是 0.65s，
                                //   连按时 actT 被反复归零，6 帧挥击只播到前 4 帧就重来，
                                //   玩家永远看不到完整的攻击动作。
  var CRIT_RATE = 0.10;         // 普攻暴击率
  var CRIT_MUL = 1.8;           // 暴击倍率
  var DMG_JITTER = 0.15;        // 伤害浮动 ±15%（旧版是恒定值，每刀数字一模一样）
  var COMBO_WIN = 2.0;          // 连击窗口：超过这么久没再命中就清零
  var COMBO_STEP = 0.06;        // 每层连击 +6% 伤害
  var COMBO_MAX = 5;            // 连击层数上限（+30%）
  // 命中扇形：只打「面朝方向 ±60°」内的目标（cos60°=0.5）。
  // 旧版只算距离不算朝向，背对怪物也能砍中，锁定感为零。
  var FACE_ARC = 0.5;
  var FACE_VEC = { right: { x: 1, y: 0 }, left: { x: -1, y: 0 }, down: { x: 0, y: 1 }, up: { x: 0, y: -1 } };
  /* ---------------- 技能表（右下角技能盘，U / I / O / P） ----------------
   * kind：line = 朝面朝方向的直线剑气（穿透）；aoe = 以自身为中心；target = 锁定最近目标落点；
   *       proj = 掷出弹道飞行物（fx），命中第一个目标爆炸，可波及周围（splash/splashR）。
   * mul 是攻击力倍率，伤害仍统一走 rollDamage，所以浮动/暴击/连击一样生效。
   * fx/impact 指向 fx_atlas 里的特效组（assets/fx_atlas.json 的 _meta 键）。
   * act 指定施法动作（素材只有 6 个动作，技能复用攻击动作）。
   * 按键从 key 字段自动生成映射（SKILL_KEYS），加技能只改这张表。 */
  var SKILLS = [
    { id: 'sword', name: '御剑诀', key: 'u', cd: 4.0, mul: 1.35, reach: 4.2, wide: 0.95,
      kind: 'line', color: '#6fd8ff', act: 'atkA', tip: '前方直线剑气，穿透多个目标' },
    { id: 'thunder', name: '雷罡咒', key: 'i', cd: 9.0, mul: 1.05, reach: 3.0,
      kind: 'aoe', color: '#ffcf3a', act: 'atkB', knock: 1.1, fx: 'lightning', tip: '以自身为中心雷爆，击退周围妖兽' },
    { id: 'swordfield', name: '太虚剑域', key: 'o', cd: 20.0, mul: 2.4, reach: 2.8,
      kind: 'target', color: '#ff8ad0', act: 'atkB', tip: '锁定最近目标落下剑雨，范围重创' },
    { id: 'fireball', name: '炎爆术', key: 'p', cd: 2.5, mul: 1.2, reach: 9, spd: 6.2,
      kind: 'proj', fx: 'fireball', impact: 'blast', splash: 0.55, splashR: 1.6,
      color: '#ff9a3d', act: 'atkB', tip: '掷出火球，命中爆炸并波及周围妖兽' }
  ];
  // 按键 → 技能序号（数据驱动：技能表的 key 字段就是键盘键）
  var SKILL_KEYS = {};
  (function () { for (var i = 0; i < SKILLS.length; i++) SKILL_KEYS[SKILLS[i].key] = i; })();
  var RUN_MUL = 1.0;       // 取消冲刺加速（Shift/摇杆推满不再提速）
  var ATK_B_CD = 2.2;      // 重击（攻击 B）冷却
  // 怪物（侧视多动作素材）一次性动作的播放时长（秒）；循环动作 idle/walk/run 按 fps 推进
  var BEAST_DUR = { atk: 0.42, atk2: 0.58, hurt: 0.3, dead: 1.15 };
  var BEAST_RUN_MV = 2.8;  // 移速达到这个值就用 run 动作追人，否则用 walk（没 run 素材的会自动回退到 walk）
  var BEAST_STOP = 1.35;   // 追到这么近就停住出手，别再往玩家身上挤（否则整只怪会压在主角头上）
  var FOE_LEASH_PAD = 4;    // 领地半径 = 仇恨半径 + 这个值：怪最多被引到离巢这么远，再远就回巢待命
  // 文件名带版本号：浏览器会缓存同名图片，换精灵时必须换名，否则玩家仍看到旧图
  // 主角外形可切换：1/5/10/14/18/20 取自「武侠修仙免费包」；31~33 取自 CraftPix 免费吸血鬼包；
  // 41~43 取自 CraftPix 免费忍者包（Fighter / Samurai / Shinobi）。
  // 三套素材统一到同一规格（6 列 × 5 行 @64px），所以能塞进同一张 chars_atlas 直接切换。
  // 1 号是该包官方 Godot 示例的默认角色；其余几个同时兼任 NPC，不重复打包素材。
  // 外部两包原图都是 128px 横版侧视，已按 50% 降采样对齐（实高 35~42px，与主角同量级）。
  // 注意：它们只有左右两个朝向，故 down/right/up 复用侧视原图、left 用水平翻转。
  // 直接指定：?hero=14 / ?hero=31 / ?hero=43
  // 重新打包：python test/tools/add_craftpix_heroes.py
  // side:true 表示这张表来自 CraftPix 侧视素材 —— 行是「动作」而不是「朝向」，
  // 6 个动作（待机/行走/奔跑/攻击A/攻击B/倒地）齐全；侧视只有右边一个朝向，左边靠翻转。
  var HERO_OPTIONS = [
    { n: 1, file: 'char_hero.png', label: '1 号' },
    { n: 5, file: 'npc_5.png', label: '5 号' },
    { n: 10, file: 'npc_10.png', label: '10 号' },
    { n: 14, file: 'npc_14.png', label: '14 号' },
    { n: 18, file: 'npc_18.png', label: '18 号' },
    { n: 20, file: 'npc_20.png', label: '20 号' },
    { n: 31, file: 'vamp_31.png', label: '31', nick: '31 血族伯爵', side: true },
    { n: 32, file: 'vamp_32.png', label: '32', nick: '32 血族女伯爵', side: true },
    { n: 33, file: 'vamp_33.png', label: '33', nick: '33 血族少女', side: true },
    { n: 41, file: 'ninja_41.png', label: '41', nick: '41 东瀛格斗家', side: true },
    { n: 42, file: 'ninja_42.png', label: '42', nick: '42 东瀛武士', side: true },
    { n: 43, file: 'ninja_43.png', label: '43', nick: '43 东瀛忍者', side: true }
  ];
  var PLAYER_CHAR = HERO_OPTIONS[0].file;      // 主角当前用的动作表（chars_atlas 里的 key）
  var PLAYER_SRC = PLAYER_CHAR;                // 主角图集 key（setHero / buildHeroUI 会改写；先给默认值，避免严格模式下未声明报错）
  // maps.json 里 npc.char 写成 'npc_5'，对应动作表文件 npc_5.png
  var npcCharFile = function (c) { return c + '.png'; };

  /* ---------------- 图集（atlas）----------------
   * 原来每个图块、每个角色都是独立 PNG：43 + 6 + 12 = 61 个文件、61 次请求。
   * 浏览器的同域并发只有 6 个左右，排队本身就要好几秒 —— 首屏慢主要慢在这里，
   * 不是慢在字节数。现在打成 3 张图集，请求数 61 -> 3。
   * 代价是每次绘制都要多传一个源矩形（sx/sy/sw/sh），见 drawPiece/drawActor。
   *
   * 新增：piece() 支持从 IMG 回退加载独立 PNG（用于测试新素材而不重建 tiles_atlas）。
   */
  var DUNGEON_IMGS = [
    // 地面
    'dungeon/stoneTile_N.png', 'dungeon/dirtTiles_N.png', 'dungeon/planks_N.png', 'dungeon/stoneMissingTiles_N.png',
    'dungeon/planksBroken_N.png', 'dungeon/planksHole_N.png',
    // 楼梯
    'dungeon/stoneSteps_N.png', 'dungeon/stoneSteps_E.png', 'dungeon/stoneSteps_S.png', 'dungeon/stoneSteps_W.png',
    // 墙四向 + 变化
    'dungeon/stoneWall_N.png', 'dungeon/stoneWall_E.png', 'dungeon/stoneWall_S.png', 'dungeon/stoneWall_W.png',
    'dungeon/stoneWallAged_N.png', 'dungeon/stoneWallAged_E.png', 'dungeon/stoneWallAged_S.png', 'dungeon/stoneWallAged_W.png',
    'dungeon/stoneWallWindow_N.png', 'dungeon/stoneWallWindow_E.png', 'dungeon/stoneWallWindow_S.png', 'dungeon/stoneWallWindow_W.png',
    'dungeon/stoneWallWindowBars_N.png', 'dungeon/stoneWallWindowBars_E.png', 'dungeon/stoneWallWindowBars_S.png', 'dungeon/stoneWallWindowBars_W.png',
    'dungeon/stoneWallHole_N.png', 'dungeon/stoneWallHole_E.png', 'dungeon/stoneWallHole_S.png', 'dungeon/stoneWallHole_W.png',
    'dungeon/stoneWallHalf_N.png', 'dungeon/stoneWallHalf_E.png', 'dungeon/stoneWallHalf_S.png', 'dungeon/stoneWallHalf_W.png',
    'dungeon/stoneWallColumnIn_N.png', 'dungeon/stoneWallColumnIn_E.png', 'dungeon/stoneWallColumnIn_S.png', 'dungeon/stoneWallColumnIn_W.png',
    'dungeon/stoneWallBroken_N.png', 'dungeon/stoneWallBroken_E.png', 'dungeon/stoneWallBroken_S.png', 'dungeon/stoneWallBroken_W.png',
    'dungeon/stoneWallBrokenLeft_N.png', 'dungeon/stoneWallBrokenLeft_E.png', 'dungeon/stoneWallBrokenLeft_S.png', 'dungeon/stoneWallBrokenLeft_W.png',
    'dungeon/stoneWallBrokenRight_N.png', 'dungeon/stoneWallBrokenRight_E.png', 'dungeon/stoneWallBrokenRight_S.png', 'dungeon/stoneWallBrokenRight_W.png',
    // 墙角四向
    'dungeon/stoneWallCorner_N.png', 'dungeon/stoneWallCorner_E.png', 'dungeon/stoneWallCorner_S.png', 'dungeon/stoneWallCorner_W.png',
    // 门/拱门/栅栏门
    'dungeon/stoneWallArchway_N.png', 'dungeon/stoneWallArchway_E.png', 'dungeon/stoneWallArchway_S.png', 'dungeon/stoneWallArchway_W.png',
    'dungeon/stoneWallDoorClosed_N.png', 'dungeon/stoneWallDoorClosed_E.png', 'dungeon/stoneWallDoorClosed_S.png', 'dungeon/stoneWallDoorClosed_W.png',
    'dungeon/stoneWallDoorOpen_N.png', 'dungeon/stoneWallDoorOpen_E.png', 'dungeon/stoneWallDoorOpen_S.png', 'dungeon/stoneWallDoorOpen_W.png',
    'dungeon/stoneWallDoorBars_N.png', 'dungeon/stoneWallDoorBars_E.png', 'dungeon/stoneWallDoorBars_S.png', 'dungeon/stoneWallDoorBars_W.png',
    'dungeon/stoneWallGateClosed_N.png', 'dungeon/stoneWallGateClosed_E.png', 'dungeon/stoneWallGateClosed_S.png', 'dungeon/stoneWallGateClosed_W.png',
    'dungeon/stoneWallGateOpen_N.png', 'dungeon/stoneWallGateOpen_E.png', 'dungeon/stoneWallGateOpen_S.png', 'dungeon/stoneWallGateOpen_W.png',
    // 柱/支撑
    'dungeon/stoneColumn_N.png', 'dungeon/woodenSupports_N.png', 'dungeon/woodenSupportBeams_N.png',
    // 家具
    'dungeon/barrel_N.png', 'dungeon/barrels_N.png', 'dungeon/barrelsStacked_N.png',
    'dungeon/chestClosed_N.png', 'dungeon/chestOpen_N.png',
    'dungeon/tableRound_N.png', 'dungeon/tableRoundChairs_N.png', 'dungeon/tableShort_N.png', 'dungeon/tableShortChairs_N.png',
    'dungeon/chair_N.png', 'dungeon/woodenCrate_N.png', 'dungeon/woodenCrates_N.png'
  ];
  var ATLAS = {
    tiles: { img: null, rect: null },
    chars: { img: null, rect: null },
    // foes: rect = 老式「逐帧独立矩形」扁平表（等距妖兽，只有 idle/attack/death 三态）；
    //       anim = 新式「每怪一组动作帧序列」（侧视多动作素材，见 assets/beasts.json）
    foes: { img: null, rect: null, anim: null },
      // dungeon: 地宫素材图集（原 228 张独立 PNG 打包成 1 张，见 tools/build_dungeon_atlas.py）
      // flare: 外来地图图集（Flare 开源 ARPG 的战役关卡，由 tools/import_tmx.py 转出）
      dungeon: { img: null, rect: null },
      flare: { img: null, rect: null },
      // items: 物品图标（程序化生成，见 tools/gen_items_atlas.py）。
      //        rect 里除了 64×64 的小图，还有 <name>_big 的 128×128 高清版给背包格子用。
      items: { img: null, rect: null, big: null, defs: null }
    };
  function atlasReady(a) { return !!(a.img && a.rect); }

  var IMG = {};              // file -> Image（只留给非图集的小图，例如云）
  var MAPS = [], IDX = {}, CUR = null;
  var PAL = {}, WALK = '', WATER = '';
  /* ★ 角色裸装底子：atk/def/maxhp 的**唯一真源**（炼气期的底子）。
   * 装备带来的加成必定由 recalcStats() 在这份底子上叠加（详见下面的装备系统注释）；
   * 境界带来的加成加在 realmBase() 上（见下），同样是"唯一出口"的一部分。 */
  var BASE_STATS = { atk: 20, def: 8, maxhp: 260 };

  /* ═════════ 境界体系（2026-09-18）════════
   * 起因：用户一句「妖丹没什么用啊」—— 妖丹 45% 掉落，捡起来进背包第 4 格，然后**没有任何出口**，
   * 连 HUD 上那行「修为」也只是一个累加数字。掉落的一半成了纯计数，白做。
   *
   * 现在它是一条真正的成长线：**妖丹 → 炼化 → 修为 → 突破境界 → 直接抬底子**。
   *
   * 四条纪律（改以前先读）：
   *   ① 境界是**纯函数**：realmIdx 由「累计修为」算出来（realmForExp），**不进存档**。
   *      存档里只有 exp 一个数，读档后 syncRealm() 重算 —— 天生幂等，不可能出现
   *      "修为一万还停在炼气期"这种要靠修档才能救的状态。
   *   ② 修为是**累计值，不是消耗品**。突破不扣修为，所以没有任何"剩余/已花"需要存，
   *      也就没有多出来的坏档入口。
   *   ③ 属性仍然只有一个出口：境界只提供**底子**（realmBase()），再交给 recalcStats()
   *      叠装备。任何地方都不许直接写 player.atk/def/maxhp。
   *   ④ need 的门槛按"打怪的累计节奏"标定：一只普通怪 12~32 修为 + 45% 掉一枚妖丹，
   *      筑基约等于清两轮场，化神是长线目标（不是几天能摸完的）。
   */
  var REALMS = [
    { cn: '炼气期', need: 0,    st: { atk: 0,  def: 0,  maxhp: 0 } },
    { cn: '筑基期', need: 150,  st: { atk: 4,  def: 2,  maxhp: 50 } },
    { cn: '金丹期', need: 500,  st: { atk: 9,  def: 5,  maxhp: 118 } },
    { cn: '元婴期', need: 1400, st: { atk: 16, def: 9,  maxhp: 210 } },
    { cn: '化神期', need: 3200, st: { atk: 24, def: 14, maxhp: 330 } }
  ];
  var YAODAN_CULT = 12;              // 一枚妖丹能炼出的修为（ITEMS.yaodan.cult 与此保持一致）
  /* 秘宝的两个数值锚（v58）：同理，ITEMS 的 desc 与坊市定价都要读这里，别各写一份。
   *  · 凝元丹直接给修为 ⇒ **必须限量**（SHOP_CULT_MAX / 重境界），否则"银两→修为"盖过主线。
   *  · 储物玉匣抬行囊上限 ⇒ 必须硬封顶（VAULT_MAX 次），否则 GEAR_CAP 这道取舍门槛失效。 */
  var NINGYUAN_CULT = 150;           // 一枚凝元丹给的修为（= 筑基门槛，早期买不起、晚期当补票）
  var VAULT_STEP = 4;                // 一次储物玉匣给的行囊格
  var VAULT_MAX = 2;                 // 最多买几次
  var SHOP_CULT_MAX = 2;             // 每重境界最多买几枚凝元丹
  /* 符箓（v58）：同款只刷新时长、不叠倍率；倒地清除；**不进存档**（瞬时有状态，存了反而
   * 会出现"下线两天回来符还亮着"，而且读档要处理"过期没"这类边界）。 */
  var BUFFS = {
    ruijin:   { cn: '锐金符', stat: 'atk', mul: 1.25 },
    panshi:   { cn: '磐石符', stat: 'def', mul: 1.45 },
    shenxing: { cn: '神行符', stat: 'mv',  mul: 1.25 }
  };
  var buffT = { ruijin: 0, panshi: 0, shenxing: 0 };   // 剩余秒数
  /* 秘宝带来的两个**永久**增量，必须进存档（否则重开一局就能再买一次，限量形同虚设）：
   *  · vaultLv  已买的储物玉匣次数 → 行囊上限 = GEAR_CAP + VAULT_STEP*vaultLv
   *  · cultBuyRealm/cultBuyN 记录"在哪一重境界买了几枚凝元丹"——
   *    存 realmIdx 而不是"买过几枚"：换境界自动重置（realmIdx 变了就等于没买过），
   *    不用额外写"突破时清零"的分支，也就不会漏。 */
  var vaultLv = 0, cultBuyRealm = 0, cultBuyN = 0;
  /** 由累计修为反查境界下标（只认最大的、need 已满足的那一档）。 */
  function realmForExp(exp) {
    var i = 0;
    for (i = REALMS.length - 1; i > 0; i--) if ((exp || 0) >= REALMS[i].need) return i;
    return 0;
  }
  function realmNow() { return REALMS[player.realmIdx] || REALMS[0]; }
  function realmNext() { return REALMS[player.realmIdx + 1] || null; }
  /** 当前境界的**底子**（不含装备）。recalcStats() 唯一该读这里，别再直接用 BASE_STATS。 */
  function realmBase() {
    var b = realmNow().st;
    return { atk: BASE_STATS.atk + (b.atk | 0), def: BASE_STATS.def + (b.def | 0),
             maxhp: BASE_STATS.maxhp + (b.maxhp | 0) };
  }
  var realmFx = 0;                   // 突破的金环特效计时（绘制见 drawRealmFx）
  /** 加修为。★ 突破判定只在这里 —— 修为只有这一个入口，不可能有第二条触发路径。 */
  function gainCult(amount) {
    amount = Math.max(0, Math.round(amount || 0));
    if (!amount) return 0;
    var was = player.realmIdx;
    player.exp = (player.exp || 0) + amount;
    syncRealm();
    return player.realmIdx - was;     // 突破了几重（炼化一大把可能连跳）
  }
  /** 把 realmIdx 与 exp 对齐。**读档后必调**（存档里只有 exp，境界是算出来的）。
   *  突破的副作用（回满气血 / 特效 / 提示）统一挂在这里，保证"手动炼化"和"读档恢复"
   *  两条路径表现一致 —— 否则会出现"读档那次突破没有特效"的廉价感。 */
  function syncRealm() {
    var idx = realmForExp(player.exp), up = idx - player.realmIdx;
    if (!up) { player.realmName = realmNow().cn; return 0; }
    player.realmIdx = idx;
    player.realmName = REALMS[idx].cn;
    recalcStats();
    if (up > 0) {
      player.hp = player.maxhp;       // 突破回满：让"变强"在血条上也看得见
      realmFx = 1.2;
      /* 刻意**不用** player.flash —— 那套闪白在本游戏里是"挨打"的语义
       * （见受伤分支 player.flash = 0.25），突破时闪一下会被读成被偷袭。金环够表达。 */
      toast('境界突破 · ' + player.realmName + '\n攻 ' + player.atk + ' · 御 ' + player.def +
        ' · 气血 ' + player.maxhp);
    }
    quest.breaks++; checkQuest();   // ★4 任务：突破进度
    bagDirty = true;
    return up;
  }
  /** 突破时的地面金环（比服药涟漪大一号，且往上冒一圈光柱） */
  function drawRealmFx() {
    if (realmFx <= 0) return;
    var p = isoToScreen(player.mx, player.my);
    var q = realmFx / 1.2;                 // 1 → 0
    var rr = (1 - q) * 120 * Z + 18 * Z;
    ctx.save();
    ctx.globalAlpha = q * 0.85;
    ctx.strokeStyle = '#ffd977'; ctx.lineWidth = 3 * Z;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + HH * Z, rr, rr * 0.5, 0, 0, 6.2832); ctx.stroke();
    ctx.globalAlpha = q * 0.45;
    ctx.lineWidth = 1.8 * Z;
    ctx.beginPath(); ctx.ellipse(p.x, p.y + HH * Z, rr * 0.62, rr * 0.31, 0, 0, 6.2832); ctx.stroke();
    // 光柱：从脚底往上收，像"气机拔高"
    ctx.globalAlpha = q * 0.30;
    var gr = ctx.createLinearGradient(0, p.y - 150 * Z, 0, p.y + HH * Z);
    gr.addColorStop(0, 'rgba(255,217,119,0)');
    gr.addColorStop(1, 'rgba(255,217,119,.9)');
    ctx.fillStyle = gr;
    var bw = (0.45 + q * 0.25) * 26 * Z;
    ctx.beginPath();
    ctx.moveTo(p.x - bw, p.y + HH * Z); ctx.lineTo(p.x + bw, p.y + HH * Z);
    ctx.lineTo(p.x + bw * 0.45, p.y - 150 * Z); ctx.lineTo(p.x - bw * 0.45, p.y - 150 * Z);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  var player = { mx: 12, my: 20, tx: 12, ty: 20, face: 'down', walk: 0, path: null,
    hp: BASE_STATS.maxhp, maxhp: BASE_STATS.maxhp,
    atk: BASE_STATS.atk, def: BASE_STATS.def, exp: 0, stones: 0, realmName: '炼气期',
    realmIdx: 0,      // 由 exp 推导（realmForExp），不进存档；realmName 只是它的显示缓存
    attackCd: 0, targetFoe: null, dead: false, flash: 0, invuln: 0,
    // —— 自动追击的两个计时器（v57，只在锁定妖兽时用）——
    foeStuck: 0,      // 「想走却没挪动」持续了多久（被水/墙隔开时会一直涨）
    foeChased: false, // 这一轮追击已经尝试过绕路，不重复跑 BFS
    // —— 侧视素材专用方向（2026-09-17）——
    // 侧视素材（CraftPix 那几套）**只有朝右一版**，左向靠水平翻转，根本没有「正面/背面」。
    // 所以 face 是 up/down 时直接画右向图 —— 看起来就是「朝镜头挥砍」，很怪。
    // sideFace 只记最近一次的**水平朝向**（left/right），一次性动作（攻击/倒地）用它，
    // 循环动作（走/跑/待机）仍按 face 原逻辑走，这样四向移动的观感不受影响。
    sideFace: 'right',
    // —— 动作状态机 ——
    act: 'idle',      // idle / walk / run / atkA / atkB / dead
    actT: 0,          // 当前动作已播放时间（秒），用于一次性动作按进度取帧
    actHold: 0,       // >0 表示动作被锁定（攻击、倒地），期间不接受移动输入
    atkBCd: 0,        // 重击冷却
    // —— 连击 ——
    combo: 0,         // 当前连击层数
    comboT: 0,        // 连击剩余窗口（秒），归零即断连
    comboFoe: null,   // 连击锁定的对象；换目标就断连
    critT: 0,         // 刚打出暴击的余晖计时，用于连击数放大特效
    skillCd: [0, 0, 0, 0] };  // 各技能剩余冷却（秒），顺序同 SKILLS（加技能记得补一位）
  var screenFlash = 0;   // 受重击/被击退时的全屏红闪（避免玩家莫名其妙"换了个地方"）

  // ---------------- 战斗数据（碑林石阵 = 妖兽猎场） ----------------
  // 严格模式下这些必须先用 var 声明，否则 switchTo 里 `foes=…` 会抛 ReferenceError 直接卡死启动。
  var foes = [], floaters = [], particles = [], clickMark = null;
  var screenShake = 0;   // ★2 震屏强度（0=不抖）：暴击/受击/击杀触发，loop 每帧衰减并应用到 canvas CSS transform
  var pauseOpen = false;   // ★3 暂停态：暂停时 loop 停 update，Esc/按钮切换
  // ★4 新手任务链：击杀→采集→突破，常驻追踪。奖励全走银两（进坊市消耗方），不造新物品无底洞
  var QUESTS = [
    { id: 'kill', key: 'kills', need: 5, text: '击杀妖兽' },
    { id: 'gather', key: 'gather', need: 3, text: '采集资源' },
    { id: 'break', key: 'breaks', need: 1, text: '突破境界' }
  ];
  var quest = { kills: 0, gather: 0, breaks: 0, step: 0, done: false };
  function checkQuest() {
    if (quest.done) return;
    var q = QUESTS[quest.step];
    if (!q) { quest.done = true; toast('新手任务已全部完成，少侠前途无量！'); return; }
    if ((quest[q.key] || 0) >= q.need) {
      quest.step++;
      if (q.id === 'kill') { player.stones += 60; toast('任务达成：击杀妖兽 ×5，奖励 60 银两'); }
      else if (q.id === 'gather') { player.stones += 50; toast('任务达成：采集 ×3，奖励 50 银两'); }
      else if (q.id === 'break') { player.stones += 100; toast('任务达成：突破 ×1，奖励 100 银两'); }
      bagDirty = true;
      checkQuest();   // 可能一步连过两阶段
    }
  }
  var nodes = [];   // 地图采集点 / 宝箱（v47：探索与随机）：{x,y,type:'herb'|'ore'|'chest',pulse}
  var MELEE = 1.45, AGGRO = 6.5;   // 近身出手半径 / 妖兽仇恨半径（格）
  var FOE_DEFS = {
    // fh = 目标绘制身高（屏幕像素，Z=1 时）；主角为 128，妖兽略矮，精英石魔接近主角
    assassin: { key: 'assassin', name: '刀影飞镖',     hp: 42,  atk: 14, def: 4,  exp: 12, stones: [3, 7],   mv: 3.2,  fh: 90 },
    golem:    { key: 'golem',    name: '九州震击石魔', hp: 130, atk: 16, def: 12, exp: 32, stones: [8, 16],  mv: 1.55, fh: 124, elite: true },
    // ranged：远程怪 —— 保持 stop 距离不近身，有视线就定时掷火球弹道（可走位躲开）
    wraith:   { key: 'wraith',   name: '水墨幽魂',     hp: 74,  atk: 17, def: 7,  exp: 22, stones: [5, 11],  mv: 2.2,  fh: 104,
                 ranged: { stop: 4.0, cd: 3.0, spd: 5.0, mul: 0.85 } },
    // 训练靶（青玄山门调试场专供）：不移动、不还手、打不死 —— 只用来试攻击与技能
    dummy:    { key: 'golem',    name: '练功石傀',     hp: 99999, atk: 0, def: 0, exp: 0, stones: [0, 0],  mv: 0,    fh: 116, dummy: true }
  };
  // 12 只散布在 30×30 碑林；坐标由 snapWalkable 吸附到最近可走格，故可略放宽。
  var BEILIN_SPAWNS = [
    { x: 6,  y: 6,  t: 'assassin' }, { x: 10, y: 4,  t: 'assassin' }, { x: 22, y: 8,  t: 'assassin' },
    { x: 25, y: 18, t: 'assassin' }, { x: 8,  y: 20, t: 'assassin' },
    { x: 14, y: 10, t: 'golem' },    { x: 18, y: 16, t: 'golem' },    { x: 10, y: 22, t: 'golem' },
    // 注意：不要挨着传送门刷怪（门在 4,15 与 26,23）——追怪时容易误踩门被传到别的地图
    { x: 20, y: 5,  t: 'wraith' },   { x: 21, y: 27, t: 'wraith' },   { x: 7,  y: 9,  t: 'wraith' },
    { x: 16, y: 26, t: 'wraith' }
  ];
  // 青玄山门 = 人物调试场：5 个训练靶摆在开阔场地，东西南北都有，方便核对攻击朝向
  var QINGXUAN_SPAWNS = [
    { x: 10, y: 20, t: 'dummy' }, { x: 16, y: 19, t: 'dummy' }, { x: 22, y: 20, t: 'dummy' },
    { x: 13, y: 25, t: 'dummy' }, { x: 21, y: 25, t: 'dummy' }
  ];
  /* 灵泉灵瀑的怪：牛魔 / 游方 / 蛇妖 / 铠甲卫 / 小僵尸 五族共 9 只，来自 sucai 下 CraftPix 怪物包。
   * 属性、刷怪格、动作帧率全部写在 tools/beast_packs.json，由 build_beasts_atlas.py 生成
   * assets/beasts.json，启动时灌进 FOE_DEFS 与 LINGQUAN_SPAWNS ——
   * 以后加怪物包只改登记表 + 跑脚本，不用再动 game.js。
   * ⚠ side:1 = 侧视素材（只有朝右一版），引擎按 face 做水平翻转，见 beastRect/drawFoe。 */
  var BEASTS = [];              // assets/beasts.json 里的 monsters
  var LINGQUAN_SPAWNS = [];
  // 幽冥地宫：8 只小僵尸散布各处（大殿/储藏室/餐厅/入口/废墟方向），坐标会经 snapWalkable 吸附
  var DUNGEON_SPAWNS = [
    { x: 6,  y: 6,  t: 'zombie_a' }, { x: 21, y: 6,  t: 'zombie_a' },
    { x: 6,  y: 21, t: 'zombie_a' }, { x: 21, y: 21, t: 'zombie_a' },
    { x: 14, y: 13, t: 'zombie_a' }, { x: 10, y: 15, t: 'zombie_a' },
    { x: 18, y: 12, t: 'zombie_a' }, { x: 8,  y: 18, t: 'zombie_a' }
  ];
  /* 洛赫港（外来草地大图 49×60）的怪：8 只，用户要求"不要太密集"。
   * 选址依据（tools/_pick_spawns.js 的算法 + 人工复核，2026-09-17）：
   *   ① 全部 4/4 开阔（四邻皆可走）—— 不会被地形卡住、也方便玩家绕后
   *   ② 离出生点 (27,27) 最近 9.5 格 —— 给玩家留出落地缓冲，不会一进图就被围
   *   ③ 彼此最近相距 13.5 格 —— 打一只时不会把另一只的仇恨一起拉进来
   *   ④ 覆盖八个方位（左上/右上/中左/中右/左下/中下/右下/正下），不是堆在一处
   * 强度按"离出生点越远越强"排：近处是游方刀客（新手第一课），最远处放精英游方统领当小 Boss。
   * 坐标仍会经 snapWalkable 吸附到可走格，所以即使图改了地形也不会落到墙里。 */
  var LOCHPORT_SPAWNS = [
    { x: 30, y: 18, t: 'ronin_a' },     // 9.5 格 · 第一只：游方刀客，练手感
    { x: 30, y: 36, t: 'ronin_a' },     // 9.5 格 · 对称的第二只
    { x: 14, y: 20, t: 'ronin_b' },     // 14.8 格 · 游方弓手，开始有压力
    { x: 40, y: 9,  t: 'minotaur_a' },  // 22.2 格 · 牛魔·褐角，肉厚，考验连击
    { x: 9,  y: 43, t: 'minotaur_b' },  // 24.1 格 · 牛魔·灰角，跑得快，考验走位
    { x: 41, y: 50, t: 'ronin_b' },     // 26.9 格 · 远处的弓手
    { x: 26, y: 54, t: 'gorgon_a' },    // 27.0 格 · 蛇妖·碧鳞，远程，逼你贴身打
    { x: 8,  y: 7,  t: 'ronin_c' }      // 27.6 格 · 最远 = 精英游方统领，当小 Boss
  ];
  // 洛赫港墓园（外来草地图 58×79，比主图更大）：僵尸盘桓的陵园。
  // 与主图同样的选址纪律（开阔 4/4、离出生点 ≥8 格、彼此 ≥9.9 格），
  // 6 只小僵尸铺开 + 2 只牛魔分别守东南/西南两个角落 —— 敢往边上走才遇得到。
  var CEMETERY_SPAWNS = [
    { x: 19, y: 19, t: 'zombie_a' }, { x: 35, y: 17, t: 'zombie_a' },
    { x: 12, y: 28, t: 'zombie_a' }, { x: 45, y: 32, t: 'zombie_a' },
    { x: 28, y: 10, t: 'zombie_a' }, { x: 30, y: 47, t: 'zombie_a' },
    { x: 18, y: 52, t: 'minotaur_b' }, { x: 44, y: 50, t: 'minotaur_a' }
  ];
  var BEAST_FALLBACK = { run: 'walk', atk2: 'atk', walk: 'idle', hurt: 'idle', dead: 'idle' };
  function absorbBeasts(list) {
    BEASTS = list || [];
    LINGQUAN_SPAWNS = [];
    for (var i = 0; i < BEASTS.length; i++) {
      var b = BEASTS[i];
      FOE_DEFS[b.key] = {
        key: b.key, name: b.cn, hp: b.hp, atk: b.atk, def: b.def, exp: b.exp,
        stones: b.stones, mv: b.mv, fh: b.fh, elite: !!b.elite, side: 1,
        // 仇恨半径：不填就跟全局 AGGRO。调大的怪会主动从远处扑过来打人。
        aggro: b.aggro || 0, srcFace: b.srcFace || 'right',
        ranged: b.ranged || null       // 远程行为参数（beast_packs.json 里登记）
      };
      if (b.spawn) LINGQUAN_SPAWNS.push({ x: b.spawn[0], y: b.spawn[1], t: b.key });
    }
  }

  /* ---------------- 物品与掉落（2026-09-17 新增） ----------------
   * 设计取舍，先写清楚免得后面改歪：
   *   ① **只有 heal 类需要手动用**。妖丹/银两/玄铁令是「捡到即结算」——
   *      材料类还要开背包点一下太碎，破坏打怪节奏。银两直接进账，妖丹进背包攒着。
   *   ② **药品是「战斗中自救」的手段**，所以要能在挨打时用（倒地时不行，那已经是惩罚）。
   *   ③ 掉落概率整体偏慷慨：这是练级场不是硬核游戏，捡不到东西等于系统白做。
   *      银两必掉（本来就是必掉的），妖丹 45%，药品 22%+ ，玄铁令只从精英身上出 8%。
   *
   * ITEMS 的键必须与 tools/gen_items_atlas.py 的 SPEC 一致（图标名 = 键名）。
   * val 对 heal 类是「回复最大气血的百分比」，对 mat 类是「折算银两数」。
   */
  var ITEMS = {
    lingshi:   { cn: '银两',   kind: 'mat',  icon: 'lingshi',   val: 0,    desc: '通用货币，拾取即入账' },
    /* act = 这一格**点下去有额外动作**（不是只弹一句描述）。renderBag 会给它挂 .act 手型。
     * 妖丹 / 玄铁令是 v54 补上的出口 —— 在这之前它们捡起来就只是计数。 */
    yaodan:    { cn: '妖丹',   kind: 'mat',  icon: 'yaodan',    val: 12,   act: 'refine',
                 desc: '妖兽内丹 · 点一下全部炼化成修为（'+ YAODAN_CULT + ' 修为 / 枚）' },
    jinchuang: { cn: '金创药', kind: 'heal', icon: 'jinchuang', val: 0.35, desc: '回复 35% 气血' },
    xiaohuan:  { cn: '小还丹', kind: 'heal', icon: 'xiaohuan',  val: 0.55, desc: '回复 55% 气血' },
    dahuan:    { cn: '大还丹', kind: 'heal', icon: 'dahuan',    val: 1.00, desc: '回满气血' },
    /* —— 符箓（v58）：**钱换一段时间的强度** —— 与丹药的区别是"延时生效"而不是"即时救命"。
     * kind='buff' 的物品不占公共服药冷却（符箓不是战斗急救），但同款只**刷新时长**不叠倍率，
     * 且**倒地一律清除**（见 clearBuffs）—— 否则它就从"消耗品"退化成"一次性买断的常驻属性"。 */
    ruijin:    { cn: '锐金符', kind: 'buff', icon: 'ruijin',   val: 1.25, dur: 90,
                 desc: '攻 +25% · 持续 90 秒' },
    panshi:    { cn: '磐石符', kind: 'buff', icon: 'panshi',   val: 1.45, dur: 90,
                 desc: '御 +45% · 持续 90 秒' },
    shenxing:  { cn: '神行符', kind: 'buff', icon: 'shenxing', val: 1.25, dur: 120,
                 desc: '移速 +25% · 持续 120 秒' },
    /* —— 秘宝（v58）：**钱换进度 / 钱换容量** —— 一次性，但影响是永久的（或限量的）。
     * 凝元丹直接给修为，所以必须限量（每境界 SHOP_CULT_MAX 枚），否则"银两→修为"
     * 会盖过"打怪攒修为"这条主线；储物玉匣抬高行囊上限，同样要硬封顶（见 VAULT_MAX）。 */
    ningyuan:  { cn: '凝元丹', kind: 'rare', icon: 'ningyuan', val: NINGYUAN_CULT, act: 'cult',
                 desc: '修为 +' + NINGYUAN_CULT + ' · 每重境界限购 ' + SHOP_CULT_MAX + ' 枚' },
    yuxia:     { cn: '储物玉匣', kind: 'rare', icon: 'yuxia',   val: VAULT_STEP, act: 'vault',
                 desc: '行囊上限 +' + VAULT_STEP + ' 格 · 可叠加 ' + VAULT_MAX + ' 次' },
    xuantie:   { cn: '玄铁令', kind: 'rare', icon: 'xuantie',   val: 60,   act: 'reforge',
                 desc: '江湖信物 · 在装备操作卡里点「重铸」消耗一枚洗词缀' }
  };
  /* 掉落表：<怪种> → [[物品键, 概率(0~1), 最少, 最多], ...]
   * 没登记的怪走 DEFAULT_LOOT。精英（def_.elite）额外掷一次 ELITE_LOOT。
   * ⚠ 概率是「独立掷骰」，不是权重归一 —— 所以同一只怪可以同时掉好几样。 */
  var DEFAULT_LOOT = [
    ['yaodan', 0.45, 1, 1],
    ['jinchuang', 0.16, 1, 1],
    ['xiaohuan', 0.06, 1, 1]
  ];
  var ELITE_LOOT = [
    ['xuantie', 0.30, 1, 1],
    ['dahuan', 0.22, 1, 1],
    ['xiaohuan', 0.35, 1, 2],
    ['yaodan', 0.60, 1, 3]
  ];
  var LOOT_BY_KEY = {
    zombie_a:   [['yaodan', 0.30, 1, 1], ['jinchuang', 0.20, 1, 1]],
    ronin_a:    [['yaodan', 0.45, 1, 2], ['jinchuang', 0.18, 1, 1]],
    ronin_b:    [['yaodan', 0.45, 1, 2], ['xiaohuan', 0.14, 1, 1]],
    minotaur_a: [['yaodan', 0.55, 1, 2], ['xiaohuan', 0.18, 1, 1], ['dahuan', 0.05, 1, 1]],
    minotaur_b: [['yaodan', 0.55, 1, 2], ['xiaohuan', 0.18, 1, 1]],
    gorgon_a:   [['yaodan', 0.50, 1, 2], ['xiaohuan', 0.16, 1, 1]],
    gorgon_b:   [['yaodan', 0.50, 1, 2], ['jinchuang', 0.20, 1, 1]],
    knight_a:   [['yaodan', 0.50, 1, 2], ['xiaohuan', 0.20, 1, 1]]
  };
  /* ═════════ 装备系统（2026-09-18）════════
   * 掉落系统上加一层「能穿在身上的东西」，让刷怪从「攒银两」变成「攒装备」。
   * 四条设计取舍写在前面，改以前先读：
   *   ① **装备是实例，不是数量**。药品是「几瓶」，装备是「这一把」—— 每件带自己的品质
   *      与词缀，所以独立成 gearInv 数组而不是塞进 bag 的计数表，否则同名字必叠一格。
   *   ② **属性只有一个出口**：player.atk / def / maxhp 一律由 `recalcStats()` 从
   *      BASE_STATS + 已穿装备重算。任何地方都不许直接写这三个值 —— 一旦有人在别处叠加，
   *      存档读回时就会再算一遍，属性凭空翻倍。
   *   ③ **品质只影响数值与 UI 边框色**，不改图标 —— 同一个器型做四份配色，
   *      图集帧数与维护成本翻倍，换来的只是"看起来更花哨"。
   *   ④ **行囊有上限（GEAR_CAP）**：装备是无限产出的，没上限等于鼓励挂机堆垃圾，
   *      也顺手给「熔炼换银两」一个存在理由。
   */
  var GEAR_SLOTS = [
    { key: 'weapon',  cn: '兵器', iconHint: '攻' },
    { key: 'armor',   cn: '护甲', iconHint: '防' },
    { key: 'trinket', cn: '灵饰', iconHint: '血' }
  ];
  /* 基础器型：st 是**品质 1.0 倍下的裸值**，实际数值 = round(st * 品质倍率) + 词缀之和。 */
  var GEAR_BASES = {
    ge_jian: { cn: '青锋剑',   slot: 'weapon',  st: { atk: 5 },              note: '轻利顺势，最易上手的兵刃' },
    ge_ji:   { cn: '重刃',     slot: 'weapon',  st: { atk: 7, def: -1 },     note: '势大力沉，攻高一分护甲薄一分' },
    ge_jia:  { cn: '玄铁甲',   slot: 'armor',   st: { def: 4 },              note: '厚重装甲，站得住才有输出' },
    ge_pao:  { cn: '云纹道袍', slot: 'armor',   st: { def: 2, maxhp: 22 },   note: '轻便道袍，兼顾护体与气血' },
    ge_pei:  { cn: '灵犀玉佩', slot: 'trinket', st: { maxhp: 30 },           note: '养气延寿，纯堆气血' },
    ge_zhu:  { cn: '聚灵珠',   slot: 'trinket', st: { atk: 2, maxhp: 18 },   note: '灵气内蕴，攻血双沾' }
  };
  var GEAR_BASE_KEYS = Object.keys(GEAR_BASES);
  /* 品质：mul 乘「器型裸值」，affix 是额外词缀条数区间（凡品可能一条都没有）。 */
  var TIERS = [
    { t: 1, cn: '凡品', col: '#c9d2dc', mul: 1.00, affix: [0, 1] },
    { t: 2, cn: '灵品', col: '#7fe08a', mul: 1.45, affix: [1, 1] },
    { t: 3, cn: '宝品', col: '#6fb6ff', mul: 2.05, affix: [1, 2] },
    { t: 4, cn: '仙品', col: '#c78bff', mul: 2.85, affix: [2, 3] }
  ];
  /* 词缀池：一条词缀给一个属性的小增量（可重复抽到同一属性，叠起来也是合理的成长）。 */
  var AFFIX_POOL = [
    { k: 'atk',   cn: '攻',   min: 1, max: 3 },
    { k: 'def',   cn: '御',   min: 1, max: 2 },
    { k: 'maxhp', cn: '气血', min: 6,  max: 16 }
  ];
  /* 掉落概率：普通怪偏低（不刷屏），精英怪给足理由去蹲。
   * 品质权重 [凡,灵,宝,仙]，普通怪基本出凡灵，精英才轮得到宝仙。 */
  var GEAR_CHANCE = 0.07;            // 普通怪掉装备概率
  var GEAR_CHANCE_ELITE = 0.42;      // 精英怪
  var TIER_W = [58, 30, 10, 2];      // 普通怪品质权重
  var TIER_W_ELITE = [16, 34, 36, 14];
  var GEAR_CAP = 24;                 // 行囊格子数（满了就捡不起来，逼着玩家做取舍）
  /* v58：行囊上限变成**可成长项**（坊市卖「储物玉匣」，最多 VAULT_MAX 次）。
   * ★ 所以别再用 GEAR_CAP 直接比较 —— 一律走 gearCap()，否则买过玉匣的玩家
   *   在"捡东西/卸装备/买装备"三条路径上会拿到三个不同的上限。 */
  function gearCap() { return GEAR_CAP + VAULT_STEP * (vaultLv | 0); }
  var gearInv = [];                  // 背包里的装备实例
  var equipped = { weapon: null, armor: null, trinket: null };
  var gearSeq = 1;                   // 实例编号（存档/对比都靠它认人）
  /* v55 删除了「玄铁令取出 → 重铸模式」这套状态机（连同 `reforgeArm`）：
   * 重铸现在是装备操作卡里的一个按钮，点哪件就洗哪件。
   * 少一个隐式模式 = 少一类 bug（原来"长按熔炼"与"点击重铸"会互相误伤，
   * 还得靠 `.armed` 脉冲去告诉玩家"你现在在重铸模式"，全靠猜）。 */

  function rndInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pickW(w) {   // 按权重取下标
    var s = 0, i; for (i = 0; i < w.length; i++) s += w[i];
    var r = Math.random() * s;
    for (i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
    return w.length - 1;
  }
  /** 器型在某个品质下的**裸值**（不含词缀）。重铸时这一半要原样保留。 */
  function gearBaseSt(b, tier) {
    var st = { atk: 0, def: 0, maxhp: 0 }, k;
    for (k in b.st) if (b.st.hasOwnProperty(k)) st[k] = Math.round(b.st[k] * tier.mul);
    return st;
  }
  /** 掷一次词缀（条数按品质区间，属性从池里抽，可重复叠同一属性）。 */
  function rollAffix(tier) {
    var st = { atk: 0, def: 0, maxhp: 0 };
    var na = rndInt(tier.affix[0], tier.affix[1]);
    for (var i = 0; i < na; i++) {
      var af = AFFIX_POOL[rndInt(0, AFFIX_POOL.length - 1)];
      st[af.k] = (st[af.k] || 0) + rndInt(af.min, af.max);
    }
    return st;
  }
  /** 属性评分（熔炼价与重铸取优共用同一把尺子，免得两处口径不一致）。 */
  function gearScore(st) {
    return (st.atk | 0) * 6 + (st.def | 0) * 7 + (st.maxhp | 0) * 0.8;
  }
  /** 掷一件装备。tier 不传就按权重摇（精英传 true 走精英权重）。 */
  function rollGear(elite) {
    var bk = GEAR_BASE_KEYS[rndInt(0, GEAR_BASE_KEYS.length - 1)];
    var b = GEAR_BASES[bk];
    var ti = elite ? pickW(TIER_W_ELITE) : pickW(TIER_W);
    var tier = TIERS[ti];
    var st = gearBaseSt(b, tier);
    var af = rollAffix(tier), k;
    for (k in af) if (af.hasOwnProperty(k)) st[k] = (st[k] || 0) + af[k];
    // 负值得留着（重刃 -1 防是它的代价），但别把属性跌成负数让玩家困惑
    if (st.def < 0 && tier.t <= 1) st.def = 0;
    return { id: gearSeq++, key: bk, t: ti, st: st };
  }
  function gearTier(g) { return TIERS[g.t] || TIERS[0]; }
  function gearBase(g) { return GEAR_BASES[g.key]; }
  function gearName(g) { return gearTier(g).cn + '·' + gearBase(g).cn; }
  /** 槽位中文名（'weapon' → '兵器'） */
  function gearSlotCn(key) {
    for (var i = 0; i < GEAR_SLOTS.length; i++) if (GEAR_SLOTS[i].key === key) return GEAR_SLOTS[i].cn;
    return '装备';
  }
  /** 一行的属性描述（给 title 悬停 / 对比用）：「攻 +8  御 +2」 */
  function gearStatsLine(g, sep) {
    var out = [], i, s = g.st;
    var order = ['atk', 'def', 'maxhp'], cn = { atk: '攻', def: '御', maxhp: '气血' };
    for (i = 0; i < order.length; i++) {
      var v = s[order[i]] | 0;
      if (v) out.push(cn[order[i]] + ' ' + (v > 0 ? '+' : '') + v);
    }
    return out.length ? out.join(sep || '  ') : '无附加属性';
  }
  /** 装备折算银两（熔炼用）：品质越高越值钱，再加点属性 amounts。 */
  function gearValue(g) {
    return Math.max(4, Math.round(gearScore(g.st) * (0.7 + 0.35 * g.t)) + gearTier(g).t * 8);
  }
  /* ═════════ 重铸 · 玄铁令的出口（v54，v55 改成操作卡按钮）════════
   * 三条规则说明白，玩家才敢用：
   *   ① **只重掷词缀，不动品质与器型基座** —— 仙品的底子不会因为手气差掉成凡品。
   *   ② 一次消耗**一枚玄铁令**；重掷 REFORGE_TRIES 次取评分最高的一次（有赌性但不太坑）。
   *   ③ 已装备的也能重铸：玩家想在身上那件上试，不该逼他先脱下来（多一步还可能爆行囊）。
   * 用同一把尺子（gearScore）与熔炼价，避免"UI 上说变强了、熔炼价反而更低"的口径矛盾。
   */
  var REFORGE_TRIES = 2;
  /** 这件装备现在穿在身上吗？在的话返回槽位 key，否则 null。 */
  function wornSlotOf(g) {
    for (var i = 0; i < GEAR_SLOTS.length; i++) {
      if (equipped[GEAR_SLOTS[i].key] === g) return GEAR_SLOTS[i].key;
    }
    return null;
  }
  function reforgeGear(g) {
    var b = gearBase(g);
    if (!b) return false;
    /* 守卫：这件可能已经不在身上也不在行囊里了（卡片开着时被别处销毁）。
     * 没有这一句，会"白烧一枚玄铁令、还看不见任何变化"。 */
    if (gearInv.indexOf(g) < 0 && !wornSlotOf(g)) {
      bagDirty = true;
      return false;
    }
    if (!(bag.xuantie | 0)) {
      toast('没有玄铁令 —— 精英妖兽身上才出');
      bagDirty = true;
      return false;
    }
    var tier = gearTier(g);
    var base = gearBaseSt(b, tier);
    var best = null, bestSc = -1;
    for (var i = 0; i < REFORGE_TRIES; i++) {
      var af = rollAffix(tier), st = { atk: base.atk, def: base.def, maxhp: base.maxhp }, k;
      for (k in af) if (af.hasOwnProperty(k)) st[k] = (st[k] || 0) + af[k];
      if (st.def < 0 && tier.t <= 1) st.def = 0;
      var sc = gearScore(st);
      if (sc > bestSc) { bestSc = sc; best = st; }
    }
    var before = gearStatsLine(g);
    bag.xuantie = (bag.xuantie | 0) - 1;
    if (bag.xuantie <= 0) delete bag.xuantie;
    g.st = best;
    recalcStats();
    lastGearSig = '';          // 属性变了 → 强制重建装备区（格子上的数值要跟着更新）
    bagDirty = true;
    var after = gearStatsLine(g);
    addFloater(player.mx, player.my - 0.5, '重铸 ' + gearName(g), tier.col);
    toast('重铸 ' + gearName(g) + '（剩玄铁令 ' + (bag.xuantie | 0) + ' 枚）\n' +
      before + '  →  ' + after);
    return true;
  }
  /** 穿上：同槽位自动换下（旧装备回行囊，不会凭空消失）。 */
  function equipGear(g) {
    var b = gearBase(g); if (!b) return false;
    var slot = b.slot;
    var idx = gearInv.indexOf(g);
    if (idx < 0) return false;
    gearInv.splice(idx, 1);
    var old = equipped[slot];
    equipped[slot] = g;
    if (old) gearInv.unshift(old);
    recalcStats(); bagDirty = true;
    var delta = (old ? '（换下 ' + gearName(old) + '）' : '');
    toast('已装备 ' + gearName(g) + ' · ' + gearStatsLine(g) + delta);
    return true;
  }
  function unequipGear(slot) {
    var g = equipped[slot];
    if (!g) return false;
    if (gearInv.length >= gearCap()) { toast('行囊已满，先熔炼几件再卸下'); return false; }
    equipped[slot] = null;
    gearInv.unshift(g);
    recalcStats(); bagDirty = true;
    toast('已卸下 ' + gearName(g));
    return true;
  }
  /** ★ 属性的唯一出口：**境界底子** + 三件已穿装备。任何地方都别直接改 player.atk/def/maxhp。 */
  function recalcStats() {
    var s = { atk: 0, def: 0, maxhp: 0 }, i, sl, g, k;
    for (i = 0; i < GEAR_SLOTS.length; i++) {
      sl = GEAR_SLOTS[i].key; g = equipped[sl];
      if (!g) continue;
      for (k in g.st) if (g.st.hasOwnProperty(k)) s[k] = (s[k] || 0) + (g.st[k] | 0);
    }
    var base = realmBase();                // v54：底子随境界抬升（原来直接用 BASE_STATS）
    var oldMax = player.maxhp;
    player.atk = base.atk + s.atk;
    player.def = Math.max(0, base.def + s.def);
    player.maxhp = base.maxhp + s.maxhp;
    /* v58 符箓：**乘数挂在唯一出口里**，别在伤害公式里另加一处 ——
     * 那样"面板攻"和"实际伤害"会分叉（玩家看到攻 25 却打出攻 20 的数）。 */
    if (buffT.ruijin > 0) player.atk = Math.round(player.atk * BUFFS.ruijin.mul);
    if (buffT.panshi > 0) player.def = Math.round(player.def * BUFFS.panshi.mul);
    // 换件护甲不至于把人"换死"：上限抬高时按比例补、压缩时钳住，且永远留 1 点血
    if (player.maxhp !== oldMax) {
      var ratio = oldMax > 0 ? player.hp / oldMax : 1;
      player.hp = Math.max(1, Math.min(player.maxhp, Math.round(player.maxhp * ratio)));
    }
    if (player.hp > player.maxhp) player.hp = player.maxhp;
  }
  var lootDrops = [];        // 地上的掉落物 { mx,my,key,n,life,tossT,vy,vx,pop } 或 { gear:实例 }
  var LOOT_LIFE = 42;        // 掉落物停留秒数（够你打完这波再回头捡）
  /* 拾取半径（格）。原来是 0.72 —— 比一格还小，用户反馈「拾取不方便」：
   * 斜向走过去、或贴边绕过那格，距离就永远差一点点，东西明明在脚边却捡不起来。
   * 调到 1.15（一格多一点）：**站在相邻格也能捡到**，手感立刻松快，
   * 又不会大到"隔着怪就隔空吸走"，仍要求真的走过去。 */
  var PICK_R = 1.15;
  var lootSeq = 0;           // 掉落序号（给浮动相位错开用，免得同批掉落的图标同步晃）

  var camX = 0, camY = 0, time = 0;
  var lastActShown = null;   // 动作试演面板的高亮同步（变化时才碰 DOM）
  var poseLock = null;       // ?pose=atkA 之类：把主角锁在某个动作上，用于核对素材/截图
  var foePose = null;        // ?foeact=atk&i=0&k=0.45：把第 i 只怪锁在某个动作的中段（怪物素材核对）
  // 上一帧的绘制计数（QA 用）：确认 NPC 真的走了 drawNPC 分支，
  // 而不是被 <0 的兜底分支当成玩家画出来
  var _draw = { actor: 0, npc: 0, paint: 0, scan: 0 };
  // 视口裁剪总开关。正常游戏恒 false；只有 ?autotest=cull 会临时置 true 取「全量遍历」基准，
  // 用来断言「裁剪后的落笔数 == 不裁剪的落笔数」（裁狠了会漏画，这里必须能证明没漏）。
  var CULL_OFF = false;
  // ?autotest=cull 专用：本帧真正落笔的物件原始下标集合（正常帧恒为 null，零开销）。
  // 两个 render 各记一份做差集，才能知道"哪些物件被裁掉了"而不只是"数量不等"。
  var paintTracker = null;
  var kLoDbg = 0, kHiDbg = 0;   // 本帧裁剪区间（仅诊断读）
  // 地面层落点探针（?autotest=seams 用）：n=本帧铺的瓦数，frac=落点/尺寸非整数的瓦数。
  // 缝隙就是 frac 累积出来的 —— 正常情况下必须恒为 0（见 drawGround 里的说明）。
  var GND = { on: false, n: 0, frac: 0 };
  // 视口缩放：Zt=目标倍数、Z=平滑跟随值；zAx/zAy=缩放锚点（默认屏幕中心）
  // 幅度刻意收窄在 0.62~1.72（约 ±40%）：再小地图碎成蚂蚁、再大贴图糊成色块
  var Z = 1, Zt = 1, ZMIN = 0.62, ZMAX = 1.72, zAx = 0, zAy = 0, zAnchor = false;
  var ZSTEP = 1.10;   // 每次滚轮/按键的步进（约 10%，手感温和）
  /* ★ 默认缩放 & 「缩放只归人管」（v48）
   * 手机屏就那么大：100% 下视野只够看两三步，怪从画面外摸上来都不知道 ——
   * 所以触屏默认拉到**最广**（ZMIN，等于把视角抬到最高）。
   *   · ZDEF = 「复位」按钮/0 键的目标：桌面 100%、触屏最广。
   *   · zLock = 默认值定完立刻上锁，此后**只有 byUser 入口**能改 Zt。
   *     战斗里任何"自动镜头"都动不了它（现在没有，将来谁加也过不了这道闸）。 */
  var ZDEF = 1, zLock = false;
  var fadeA = 0, fadeDir = 0, pending = null, portalLock = 0;
  var HOLD = false, held = false;
  var cloudCv = null;
  var NPC_FILES = {};
  var ready = false;

  var SKY_TOP = '#a9d6ee', SKY_MID = '#d7ecf9', SKY_BOT = '#f4fbfe';

  // ---------------- 基础数学 ----------------
  function isoToScreen(mx, my) {
    return { x: (mx - my) * HW * Z + camX, y: (mx + my) * HH * Z + camY };
  }
  function screenToIso(sx, sy) {
    var a = (sx - camX) / (HW * Z), b = (sy - camY) / (HH * Z);
    return { mx: (a + b) / 2, my: (b - a) / 2 };
  }
  // 手机端缩放补偿的输入换算（见 index.html 「视口防线」③）。
  // ZoomFix 没启用时是**恒等**的 —— 桌面、未缩放时行为与改动前逐字节一致，零回归。
  // 用法：把触点 clientX/clientY 过一遍 ptX/ptY 拿到画布本地坐标（0..W / 0..H）。
  // ⚠ 画布有 transform 后 getBoundingClientRect() 返回的是**已被缩放**的框，
  //   所以偏移量（r.left）也要过同一把尺子再相减，不能混用两套坐标系。
  var IDF = { on: false, s: 1, ox: 0, oy: 0,
    ptX: function (x) { return x; }, ptY: function (y) { return y; } };
  function ZF() { return (window.ZoomFix && window.ZoomFix.on) ? window.ZoomFix : IDF; }
  /** 触点/鼠标坐标 → 画布本地坐标（考虑页面被放大后的反向补偿） */
  function localX(clientX, r) { var z = ZF(); return z.ptX(clientX) - z.ptX(r.left); }
  function localY(clientY, r) { var z = ZF(); return z.ptY(clientY) - z.ptY(r.top); }
  function cellChar(x, y) {
    // 用「取反的连比」一次挡掉越界、NaN、undefined：任何与 NaN 的比较都是 false，
    // 取反后直接 return，不会走到 ground[NaN] → undefined[NaN] 把渲染循环打死。
    // 地形还没到的「轻条目」（外来图先出条目、后到地形）也返回空格而不是抛 ——
    // 一帧画空，好过一个死掉的 rAF 循环（画面还在、点什么都没反应，最难查）。
    if (!CUR || !CUR.ground) return ' ';
    if (!(x >= 0 && y >= 0 && x < CUR.w && y < CUR.h)) return ' ';
    /* ★★ 非整数守卫（2026-09-18）：`ground[20.32]` 取到 undefined，再 `[12.32]`
     * 直接抛 —— 一句 `Cannot read properties of undefined (reading '12.32')`
     * 让整个 boot 挂掉，而错误信息里连函数名都没有，极难定位（我们绕了很久）。
     * 上面那行范围检查挡不住它：小数是**通过**范围检查的。
     * 格表只接受整数格，这一个 return 就把「小数坐标当格下标」整类问题关死。 */
    if (x !== (x | 0) || y !== (y | 0)) return ' ';
    return CUR.ground[y][x];
  }
  function isSolid(x, y) { return !!CUR && CUR.solid['' + x + ',' + y]; }
  function walkable(x, y) {
    var c = cellChar(x, y);
    return WALK.indexOf(c) >= 0 && !isSolid(x, y);
  }

  // ---------------- 视口缩放 ----------------
  /** byUser=true 表示"这是人主动调的"：上锁之后只有它能改，并且记进 localStorage
   * （下次进游戏沿用他自己调的值）。remember=false 用于「复位」—— 那是回到默认，不该被记住。 */
  function setZoom(nz, ax, ay, byUser, remember) {
    if (zLock && !byUser) return;            // ★ 非人主动 → 直接忽略，一个像素都不动
    nz = Math.max(ZMIN, Math.min(ZMAX, nz));
    if (ax !== undefined) { zAx = ax; zAy = ay; zAnchor = true; }
    if (!zAnchor) { zAx = W / 2; zAy = H / 2; zAnchor = true; }
    Zt = nz;
    if (byUser && remember !== false) {
      try { localStorage.setItem('isles.zoom', String(Math.round(Zt * 100))); } catch (e) { }
    }
    updateZoomUI();
  }
  function zoomBy(f, ax, ay) { setZoom(Zt * f, ax, ay, true); }
  function updateZoomUI() {
    var el = document.getElementById('zoomVal');
    if (el) el.textContent = Math.round(Zt * 100) + '%';
    var rg = document.getElementById('zRange');
    if (rg) rg.value = Math.round(Zt * 100);
    var zi = document.getElementById('zIn'), zo = document.getElementById('zOut');
    if (zi) zi.disabled = Zt >= ZMAX - 1e-6;
    if (zo) zo.disabled = Zt <= ZMIN + 1e-6;
    // 「复位」按钮上的数字跟着平台默认走（桌面 100% / 触屏最广），别再写死 100%
    var zrb = document.getElementById('zReset');
    if (zrb) zrb.textContent = Math.round(ZDEF * 100) + '%';
  }
  function buildZoomUI() {
    var zin = document.getElementById('zIn'), zout = document.getElementById('zOut'),
      zr = document.getElementById('zReset'), rg = document.getElementById('zRange');
    if (zin) zin.onclick = function () { zoomBy(ZSTEP, W / 2, H / 2); };
    if (zout) zout.onclick = function () { zoomBy(1 / ZSTEP, W / 2, H / 2); };
    if (zr) zr.onclick = function () {          // 复位 = 回到平台默认，并抹掉手调记忆
      try { localStorage.removeItem('isles.zoom'); } catch (e) { }
      setZoom(ZDEF, W / 2, H / 2, true, false);
    };
    if (rg) {
      rg.min = Math.round(ZMIN * 100); rg.max = Math.round(ZMAX * 100);
      rg.value = Math.round(Zt * 100);
      rg.oninput = function () { setZoom(this.value / 100, W / 2, H / 2, true); };
    }
    updateZoomUI();
    // 左上面板折叠开关：默认收成迷你条，点一下展开详情
    var tl = document.getElementById('topleft');
    if (tl) tl.onclick = function () { tl.classList.toggle('open'); syncLeftBtns(); };
  }
  /* 左列圆钮避让（v53）：把上面板的真实底边写进 CSS 变量 --tlb。
   * 起因：用户截图里「世界地图」圆钮压住了第一个药格 —— 面板高度不是常数
   *   （展开详情 / 出现目标血条 / 开背包时药格被隐藏 / 触屏药格更大），
   *   写死 top 必然在某个组合下压上去。所以位置改成"算出来的"，不是"猜出来的"。
   * 写在 <html> 的行内样式上：优先级最高，且不依赖任何选择器匹配（本项目吃过
   *   "选择器写了却被覆盖"的亏）。
   * ⚠ 读 offsetHeight 会强制重排，所以先用 lastTlb 挡一道，值没变就一个字节都不写。 */
  var lastTlb = -1;
  function syncLeftBtns() {
    var tl = document.getElementById('topleft');
    if (!tl) return;
    if (document.body.classList.contains('touch')) return;   // 手机端两个钮在左下，不参与
    var b = Math.round(tl.offsetTop + tl.offsetHeight + 10);
    if (b === lastTlb) return;
    lastTlb = b;
    document.documentElement.style.setProperty('--tlb', b + 'px');
  }
  // 每帧平滑逼近目标缩放；按锚点做比例换算，使锚点下的画面不位移
  function stepZoom(dt) {
    if (Z === Zt) return;
    var nz = Z + (Zt - Z) * (1 - Math.pow(0.0009, dt));
    if (Math.abs(Zt - nz) < 0.002) nz = Zt;
    var r = nz / Z;
    if (zAnchor) {
      camX = zAx - (zAx - camX) * r;
      camY = zAy - (zAy - camY) * r;
    }
    Z = nz;
  }
  function solidFrom(mp) {
    var s = {};
    mp.objects.forEach(function (o) {
      if (o.solid === false) return;   // 贴花类（草丛/云/浅纹）不挡路
      for (var dy = 0; dy < (o.fh || 1); dy++)
        for (var dx = 0; dx < (o.fw || 1); dx++) s['' + (o.x + dx) + ',' + (o.y + dy)] = 1;
    });
    return s;
  }
  function nearWalkable(mp) {
    var cx = mp.w / 2, cy = mp.h / 2, solid = solidFrom(mp);
    var best = null, bd = 1e9;
    for (var y = 0; y < mp.h; y++) for (var x = 0; x < mp.w; x++) {
      if (WALK.indexOf(mp.ground[y][x]) < 0 || solid['' + x + ',' + y]) continue;
      var d = (x - cx) * (x - cx) + (y - cy) * (y - cy);
      if (d < bd) { bd = d; best = { x: x, y: y }; }
    }
    return best || { x: 0, y: 0 };
  }

  // ---------------- 加载 ----------------
  /* 首屏加载要解决两件事：
   *   ① 请求数：61 个零散 PNG -> 3 张图集（tools/build_atlas.py 产出）
   *   ② 可见进度：图集是大文件，只报「第几张好了」会长时间停在 0%。
   *      所以用 XHR 拿 blob，读 e.loaded/e.total 得到字节级进度，
   *      再按各文件的实际字节数加权合成总进度 —— 进度条才是匀速走的。
   * 注意 Image 标签没有下载进度事件，这是必须绕道 XHR/blob 的原因。
   */
  // weight 用「预估 KB」当权重：进度是按权重加权的，所以大文件占大头，
  // 进度条看起来才是匀速的。权重全程固定不变 —— 中途改用真实字节会让
  // 分母突然变大、进度条倒退。
  // ⚠ 换素材后必须同步这里：填各文件的实际 KB 数，否则会出现「明明在下大图、
  //    进度条却几乎不动」的假卡（曾因 foes 从 155 涨到 1043 没同步而踩过）。
    // ⚠ weight 填**线上真实传输 KB**，不是磁盘体积 —— 这两者差得很远：
    //   Pages 对 text/json 自动 gzip，磁盘 131KB 的地形 JSON 实际只走 8KB
    //   （全站 JSON 合计 358KB → 30KB）。进度条是按 weight 加权的，而下载途中的
    //   字节进度 e.loaded/e.total 拿到的**本身就是压缩后**的字节，两边同口径，
    //   进度条才会匀速；填磁盘体积会让那几个 JSON 白白虚占一段宽度（假卡）。
    //   图集是 webp（已压过），传输≈磁盘，照填磁盘 KB。
    // ⚠ 数组下标被下面硬编码引用（LOAD_PLAN[0]/[1]/[4]/[5]/[6]/[7]/[8]），
    //   要往首屏加东西就 push 进 boot 里的 POOL，**别插进这个数组**。
    var LOAD_PLAN = [
      { url: 'assets/maps.json?v=19', json: true, weight: 8, label: '读取地图数据', _expand: true },
      { url: 'assets/tiles_atlas.webp?v=5', atlas: 'tiles', weight: 228, label: '载入地貌与建筑' },
      { url: 'assets/chars_atlas.webp?v=1', atlas: 'chars', weight: 183, label: '载入人物动作' },
      { url: 'assets/foes_atlas.webp?v=1', atlas: 'foes', weight: 680, label: '载入妖兽图鉴' },
      { url: 'assets/tiles_atlas.json?v=5', json: true, weight: 2, label: '读取地貌索引' },
      { url: 'assets/chars_atlas.json?v=3', json: true, weight: 1, label: '读取人物索引' },
      { url: 'assets/foes_atlas.json?v=2', json: true, weight: 2, label: '读取妖兽索引' },
      { url: 'assets/heroes.json?v=1', json: true, weight: 1, label: '读取角色清单' },
      { url: 'assets/fx_atlas.webp?v=2', atlas: 'fx', weight: 61, label: '载入技能特效' },
      // ⚠ atlas 字段两张都要写（同 items 的教训）：boot 按 p.atlas==='fx' 接值，
      //   首版漏了 json 这张 → fx_atlas.json 下载了却没人接 → ATLAS.fx.rect 恒 null
      //   → fxFrame 'noRect' 全灭 → 火球/爆炸/落雷全部静默不画（炎爆术没特效的真根因）。
      { url: 'assets/fx_atlas.json?v=2', json: true, atlas: 'fx', weight: 1, label: '读取特效索引' },
      { url: 'assets/beasts.json?v=3', json: true, weight: 2, label: '读取怪物图录' },
      /* v58：图集从 12 帧长到 17 帧（符箓 ×3 + 秘宝 ×2），96KB → 125KB。
       * 改图集必须同时做两件事：① `?v=` 递增（按 URL 缓存，不升会接着用旧图）
       * ② weight 改成**新的真实传输 KB**（进度条按权重加权，写小了表现为"卡在这一步"）。 */
      { url: 'assets/items_atlas.png?v=4', atlas: 'items', weight: 125, label: '载入物品图标' },
      // ⚠ atlas 字段两张都要写：boot 里是按 `p.atlas === 'items'` 把值填进 ATLAS.items 的。
      //   首版漏了 json 这张，导致 json 下载了却没人接（ATLAS.items.rect 恒 null）。
      { url: 'assets/items_atlas.json?v=4', atlas: 'items', json: true, weight: 2, label: '读取物品图录' }
    ];

  /* ── 按需图集（懒加载）────────────────────────────────────────────────
   * 地宫 547KB：只有切到地宫才用得上，走真正的懒加载（三条路径覆盖全部情况）：
   *   ① ?map= 直接指向该图 → 计入首屏（见 expandPlan 的 ②，进度条照走）
   *   ② 进游戏后空闲预取（见 preloadExtras）—— 用户点按钮时通常已就绪
   *   ③ 手比预取快 → 现场载，屏幕下方给一条小提示（见 goTo）
   * 键名必须与 ATLAS 的键一致：加载完按 item.atlas 直接填进去。
   * · 地宫素材：228 张独立 PNG 已打包成单张（见 tools/build_dungeon_atlas.py）
   *
   * ★ 外来地图（远航之岸 / 殒落港湾）2026-09-16 起**首屏就载、不参与懒加载**：
   *   用户要求「这两张图一起加载，不要点击再加载」。两张图共用一套 flare 图集 ——
   *   只下一张就覆盖两张，所以"一起加载"的代价是 +910KB 而不是 +1820KB。
   *   机制：expandPlan 里的 EAGER_ATLAS=['flare'] 把它的图集无条件推进首屏池
   *   （不再等 ?map= 指名、也不再等 2.5s 预取），点按钮就是同步切换
   *   （goTo 里 `m._data` 与 extrasReady 都成立，一次网络请求都不发）。
   *   代价：首屏 1.1MB → 2.0MB（+910KB，全是那张 webp）。之所以敢这么干，是因为
   *   这 910KB 本来也会被后台预取拉走（老方案对"进游戏待一会"的人流量一模一样）——
   *   变的只是"什么时候下"，不是"下不下"。地形 JSON 那边线上 gzip 后只 8KB/张，可忽略。
   *   ⚠ 这 910KB 已是地板：瓦片是原生 120×60、webp 对透明区编码极高效，重打包反而更大；
   *   唯一能压的是"别让弱机在首屏被它堵住"——所以 CONC 维持 3 不调高。
   * ⚠ 图集内容一变就要升 ?v=，否则浏览器缓存会把旧 webp 喂回来（Pages 的 max-age=600）。
   */
  var EXTRA = {
    dungeon: {
      loaded: false, loading: null, queued: false,
      items: [
        { url: 'assets/dungeon_atlas.webp?v=2', atlas: 'dungeon', weight: 547, label: '载入地宫图集' },
        { url: 'assets/dungeon_atlas.json?v=2', atlas: 'dungeon', json: true, weight: 2, label: '读取地宫索引' }
      ]
    }
  };
  /* ── 按需资源的取用口 ─────────────────────────────────────────────── */

  /** 按需图集项的值 → ATLAS。首屏池与运行时补载共用这一套填充逻辑：
   *  按 item.atlas 定位 ATLAS 键，json 项填 rect、图项填 img；两样齐了才算 loaded。 */
  function fillAtlas(nm) {
    var e = EXTRA[nm];
    if (!e) return false;
    // 懒注册的外来图集在 ATLAS 里没有预置槽位（tiles/chars/foes/dungeon/flare 是写死的），
    // 必须在这里补建：否则对 undefined.rect 赋值抛 TypeError，loaded 永不置位 → 载入条卡 99%。
    var A = ATLAS[nm] || (ATLAS[nm] = { img: null, rect: null });
    e.items.forEach(function (p) {
      if (!p.value) return;
      if (p.json) A.rect = p.value; else A.img = p.value;
    });
    splitItemsJson(A);
    var ok = !!(A.img && A.rect);
    if (ok) e.loaded = true;
    return ok;
  }

  /** items 图集的 json 里除了帧矩形，还夹着 items（物品定义）与 _meta，
   *  而 rect 现在是「含 <name>_big 键」的扁平表 —— 拆出来各归各位，
   *  免得 piece('jinchuang_big') 之类被当普通瓦片找到（背包走 big 字段取 2× 图）。
   *
   *  ⚠ 单独抽成函数是因为它有**两条调用路径**：EXTRA 那条（fillAtlas）和 LOAD_PLAN 那条
   *  （boot 里按 url 填完 ATLAS.items 后直接调）。2026-09-17 首次接入时就漏了第二条 ——
   *  LOAD_PLAN 里的 items 没有对应的 EXTRA 条目，fillAtlas 直接 return false，
   *  json 从没被拆过：piece() 取 rect 里的 'items'（那是定义表不是矩形）当坐标，
   *  背包图标与地上掉落物全画不出来。 */
  function splitItemsJson(A) {
    if (!A || !A.rect || A._split) return;
    var raw = A.rect, flat = {}, big = {};
    for (var k in raw) {
      if (k === 'items') A.defs = raw[k];
      else if (k === '_meta') A.meta = raw[k];
      else if (/_big$/.test(k)) big[k] = raw[k];
      else flat[k] = raw[k];
    }
    A.rect = flat; A.big = big; A._split = true;
    _lootPz = {};        // 图集换了，精灵缓存作废（否则还指着旧图）
    bagBuilt = false;    // 背包格子重建成新的高清图（buildBagUI 由 boot 再调一次）
  }

  /** 按需注册一套「按命名约定推导 URL」的 Flare 图集：
   *  assets/<nm>_atlas.webp?v=<ver>  +  assets/<nm>_atlas.json?v=<ver>
   *  nm 形如 flare_grass_empyrean_campaign；ver / weight 随地图条目走（atlasVer / atlasWeight），
   *  不写死在 EXTRA 里 —— 这样 100+ 张外来图不需要在 EXTRA 手写几十条、也不会被首屏预取全拉。
   *  只有玩家真正点进某张图时，mapAtlas 才会调用它（见下）。 */
  function registerFlareAtlas(nm, ver, weight) {
    if (EXTRA[nm] || nm.indexOf('flare_') !== 0) return;
    var v = ver || '1', w = weight || 400;
    EXTRA[nm] = {
      loaded: false, loading: null, queued: false,
      items: [
        { url: 'assets/' + nm + '_atlas.webp?v=' + v, atlas: nm, weight: w, label: '载入' + nm + '图集' },
        { url: 'assets/' + nm + '_atlas.json?v=' + v, atlas: nm, json: true, weight: 2, label: '读取' + nm + '索引' }
      ]
    };
    // piece() 是遍历 ATLAS 的键取件的 —— 槽位必须随注册一起建，绘制与 autotest 才找得到。
    ATLAS[nm] = ATLAS[nm] || { img: null, rect: null };
  }

  /** 这张图要用哪套「按需图集」（没有就返回 ''）。
   *  外来图的轻条目自带 atlas 字段；**自带图没有** —— 得从物件的瓦片前缀找：
   *  地宫的瓦在 'dungeon/' 下，其它图的前缀是主图集内部的键名（ground/、scene/…），
   *  前缀命中 EXTRA 才算数。结果缓存在 m._atlas 上（goTo 每点一次都会问）。 */
  function mapAtlas(m) {
    if (!m) return '';
    if (m._atlas !== undefined) return m._atlas;
    var an = '';
    if (m.atlas) {
      // 外来 Flare 图集按需注册：键名 = m.atlas（flare_<theme>_<parent>），
      // 版本与权重随地图条目走（atlasVer / atlasWeight），不写死在 EXTRA 里，
      // 这样新增图集无需改 game.js、也不会被首屏预取全拉。
      if (!EXTRA[m.atlas] && m.atlas.indexOf('flare_') === 0) registerFlareAtlas(m.atlas, m.atlasVer, m.atlasWeight);
      an = EXTRA[m.atlas] ? m.atlas : '';
    }
    if (!an) {
      var o = m.objects || [];
      for (var i = 0; i < o.length; i++) {
        var pr = String(o[i].piece || '').split('/')[0];
        if (EXTRA[pr]) { an = pr; break; }
      }
    }
    m._atlas = an;
    return an;
  }

  function extrasReady(names) {
    return (names || []).every(function (n) { return EXTRA[n] && EXTRA[n].loaded; });
  }

  /** 运行时补载若干套按需图集（同一套被并发请求只会真的下一次）。
   *  首屏那份在 boot 里（要精确进度条）；这份是给「用户手比预取快」兜底的。 */
  function ensureExtras(names, onPct) {
    var seq = Promise.resolve();
    (names || []).forEach(function (nm) {
      var e = EXTRA[nm];
      if (!e) return;
      if (!e.loaded && !e.loading) {
        e.loading = loadItems(e.items, onPct).then(function () {
          fillAtlas(nm); e.loading = null; return true;
        }, function (err) { e.loading = null; throw err; }); 
      }
      if (e.loading) seq = seq.then(function () { return e.loading; });
    });
    return seq;
  }

  /** 通用加载器（并发 2）：值统一写回 item.value ——
   *  上层只认 item.value，不必关心是哪条路径（首屏池 / 补载）拉下来的。 */
  function loadItems(items, onPct) {
    var per = {}, idx = 0;
    function bump() {
      if (!onPct) return;
      var s = 0, t = 0;
      items.forEach(function (p) { s += Math.min(1, per[p.url] || 0) * p.weight; t += p.weight; });
      onPct(t ? s / t : 1);
    }
    function one() {
      if (idx >= items.length) return Promise.resolve();
      var p = items[idx++];
      return xhrBlob(p.url, function (w, loaded, tot) {
        if (p.json) return;
        per[p.url] = loaded / (tot || p.weight);
        bump();
      }).then(function (blob) {
        per[p.url] = 1;
        return p.json ? blobJson(blob) : blobImage(blob);
      }).then(function (v) { p.value = v; bump(); return one(); });
    }
    var ws = [];
    for (var c = 0; c < Math.min(2, items.length); c++) ws.push(one());
    return Promise.all(ws);
  }

  /** 把 <id>_map.json 的地形并回地图条目，并补上引擎要的派生数据。
   *  外来地图的 ground+objects 占 265KB —— 不塞 maps.json，否则等于逼所有人首屏背它。 */
  function applyMapData(m, d) {
    m.ground = d.ground; m.objects = d.objects;
    if (d.npcs) m.npcs = d.npcs;
    if (d.portals) m.portals = d.portals;
    if (d.spawn) m.spawn = d.spawn;
    if (d.home) m.home = d.home;
    if (d.homeFromMap) m.homeFromMap = true;
    if (d.voidColor) m.voidColor = d.voidColor;
    finishMap(m);
    m._data = true;
    return m;
  }

  /** 地图条目的派生数据：实心格表 + 出生点。
   *  出生点默认由引擎自己算（离图心最近的可走格）—— 游戏自带的图都是「中间是空地」，
   *  这个启发式够用。但**外来地图**（带 homeFromMap 标记）不行：别人的图可走区常是
   *  岛/半岛/环形，图心很可能落在湖里或贴着崖边 —— 那种位置「能站」但一开局就面壁。
   *  所以外来图自带施工方挑好的出生点（四邻皆可走的格），只要它确实合法就直接采用。 */
  function finishMap(m) {
    m.solid = solidFrom(m);
    var h = m.home, okH = false;
    if (m.homeFromMap && h && h.y >= 0 && h.y < m.h && h.x >= 0 && h.x < m.w) {
      okH = WALK.indexOf(m.ground[h.y][h.x]) >= 0 && !m.solid['' + h.x + ',' + h.y];
    }
    m.home = okH ? h : nearWalkable(m);
    // 缩略图的底图是缓存出来的（1 像素 1 格）。地形/实心表一变就要让它重画 ——
    // 按需加载的外来图是「先出条目、后到地形」，_mmVer 就是给这个时序兜底的。
    m._mmVer = (m._mmVer || 0) + 1;
    return m;
  }

  /** 把 maps.json 里的全局常量装上。**必须早于任何 applyMapData**：
   *  finishMap 靠 WALK 判断可走、nearWalkable 靠它兜底找出生点，而按需加载的外来图
   *  地形可能比「全部加载结束」更早到位 —— 那时 WALK 还是空的，于是整张图都算「不可走」，
   *  出生点退化成 {0,0}，玩家被吸附到地图角落（实测落在 5,2，而不是施工方的 19,19）。
   *  幂等，重复调用无副作用。 */
  function initCore(d) {
    TILE_W = d.tileW; TILE_H = d.tileH; HW = TILE_W / 2; HH = TILE_H / 2;
    PAL = d.tilePalette; WALK = d.walkable; WATER = d.water || '';
    MAPS = d.maps;
    MAPS.forEach(function (m) { IDX[m.id] = m; });
    return d;
  }

  /** 地图数据（外来图才有 src）按需取；同一张图被并发请求只下一次。 */
  function ensureMapData(m, onPct) {
    if (!m || !m.src || m._data) return Promise.resolve(m);
    if (m._dataLoading) return m._dataLoading;
    m._dataLoading = xhrBlob(m.src, function (w, loaded, tot) {
      if (onPct) onPct(Math.min(1, loaded / (tot || 133)));
    }).then(blobJson).then(function (d) {
      applyMapData(m, d); m._dataLoading = null; return m;
    });
    return m._dataLoading;
  }

  /** 屏幕下方「正在载入地图」小提示：不挡操作，只说明为什么还没切过去 */
  function mapLoadTip(text, pct) {
    var el = document.getElementById('mapLoading');
    if (text === null) {
      if (el) { el.style.display = 'none'; el.textContent = ''; }
      return;
    }
    if (!el) {
      el = document.createElement('div');
      el.id = 'mapLoading';
      el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:18px;' +
        'z-index:60;padding:8px 16px;border-radius:999px;background:rgba(12,18,30,.86);' +
        'color:#dff0ff;font:14px/1.4 system-ui,-apple-system,"Microsoft YaHei",sans-serif;' +
        'border:1px solid rgba(120,190,255,.35);pointer-events:none;white-space:nowrap';
      document.body.appendChild(el);
    }
    el.style.display = '';
    el.textContent = text + (pct === undefined ? '' : ' ' + Math.round(pct * 100) + '%');
    el._lu = Date.now();
    // 停滞看门狗：提示条 40 秒没更新就明说「卡了，强刷」——不再让玩家对着 99% 干等
    // （旧版代码被浏览器缓存时就会这样，得 Ctrl+F5 拿新 game.js）。
    if (!mapLoadTip._wd) {
      mapLoadTip._wd = setInterval(function () {
        var e = document.getElementById('mapLoading');
        if (!e || e.style.display === 'none' || !e.textContent) return;
        if (Date.now() - (e._lu || 0) > 40000 && e.textContent.indexOf('Ctrl+F5') < 0) {
          e.textContent += '（载入停滞，请按 Ctrl+F5 强制刷新）';
        }
      }, 5000);
    }
  }

  /** 切图守卫：目标图的数据/图集没就绪就先补，再走原来的同步 switchTo。
   *  已就绪时（绝大多数情况：首屏就是它，或后台预取已完成）等于零开销直接切 ——
   *  所以按钮、传送门、调试 API 都可以无脑走它。 */
  function goTo(id, x, y, silent) {
    var m = IDX[id] || MAPS[0];
    var an = mapAtlas(m);
    var names = an ? [an] : [];
    // 落点缺省 = 这张图的出生点。归一化只写这一处，两条分支共用 ——
    // 曾经只有「补载后切」那条做了缺省，而地图按钮就是 goTo(m.id) 不带坐标：
    // 外来图一进首屏（走同步分支），点按钮立刻把 undefined 传进
    // switchTo → snapWalkable → walkable(undefined) 抛异常，rAF 循环当场死掉、画面卡住。
    function land() {
      switchTo(m.id, x === undefined ? m.home.x : x, y === undefined ? m.home.y : y, silent);
    }
    if (!(m.src && !m._data) && extrasReady(names)) {
      land();
      return Promise.resolve();
    }
    var base = 0, span = 1;
    function tick(f) { mapLoadTip('正在载入「' + m.name + '」…', Math.min(0.99, base + f * span)); }
    mapLoadTip('正在载入「' + m.name + '」…', 0);
    return ensureMapData(m, tick)
      .then(function () {
        // 两段进度：地形数据 0~35%，图集 35~100%（140KB 对 950KB 的量级差）
        base = 0.35; span = 0.65;
        return ensureExtras(names, tick);
      })
      .then(function () {
        mapLoadTip(null);
        land();
      });
  }

  /** 进游戏后空闲预取按需图集 —— 用户点按钮时就不用等了。
   *  延迟 2.5s 起跑：避开首屏收尾与首帧渲染；串行执行，弱机也不会被压满。 */
  function preloadExtras() {
    var names = Object.keys(EXTRA), i = 0;
    function step() {
      if (i >= names.length) return;
      ensureExtras([names[i++]], null).then(function () { setTimeout(step, 400); });
    }
    setTimeout(step, 2500);
  }

  var loadUI = { bar: null, pct: null, tip: null, sub: null };

  function fmtBytes(n) {
    if (!n || n < 0) return '';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function setProgress(frac, label, sub) {
    frac = Math.max(0, Math.min(1, frac));
    if (loadUI.bar) loadUI.bar.style.width = (frac * 100).toFixed(1) + '%';
    if (loadUI.pct) loadUI.pct.textContent = Math.round(frac * 100) + '%';
    if (loadUI.tip && label) loadUI.tip.textContent = label;
    if (loadUI.sub) loadUI.sub.textContent = sub || '';
  }

  /** XHR 取 blob：能拿到下载进度，且不依赖 fetch（file:// 下更宽容） */
  function xhrBlob(url, onProgress, weight) {
    return new Promise(function (res, rej) {
      var x = new XMLHttpRequest();
      x.open('GET', url, true);
      x.responseType = 'blob';
      if (onProgress) {
        x.onprogress = function (e) {
          if (e.lengthComputable) onProgress(weight, e.loaded, e.total);
        };
      }
      x.onload = function () {
        // file:// 协议下 status 为 0 也算成功
        if (x.status === 200 || x.status === 0) res(x.response);
        else rej(new Error(url + ' -> HTTP ' + x.status));
      };
      x.onerror = function () { rej(new Error(url + ' 网络错误')); };
      x.onabort = function () { rej(new Error(url + ' 已取消')); };
      x.send();
    });
  }

  function blobJson(b) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { try { res(JSON.parse(fr.result)); } catch (e) { rej(e); } };
      fr.onerror = function () { rej(new Error('读取失败')); };
      fr.readAsText(b);
    });
  }

  function blobImage(b) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(b);
      var im = new Image();
      im.onload = function () { URL.revokeObjectURL(url); res(im); };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('图片解码失败')); };
      im.src = url;
    });
  }

  function boot() {
    loadUI.bar = document.getElementById('loadBar');
    loadUI.pct = document.getElementById('loadPct');
    loadUI.tip = document.getElementById('loadTip');
    loadUI.sub = document.getElementById('loadSub');

    // 进度权重：JSON 给小权重、图集按实际字节数分配，这样进度条不会在
    // 「几个 JSON 秒过、图集卡住」的落差里骗人。
    // 计划池：LOAD_PLAN 是「一定会用到」的；expandPlan 会把「这张图额外要的」也推进来。
    // 池化 + 并发跑，是为了让首屏那 1.2MB 不再一个接一个地排队等。
    var POOL = LOAD_PLAN.slice();
    var W_TOTAL = POOL.reduce(function (a, p) { return a + p.weight; }, 0);
    var got = {};
    function report(label, sub) {
      var acc = 0;
      POOL.forEach(function (p) {
        acc += Math.min(1, got[p.url] || 0) * p.weight;
      });
      setProgress(acc / W_TOTAL, label, sub);
    }

    /** 把「首屏要进的那张图」额外需要的资源推进池子。
     *  ⚠ 必须在 maps.json 解析完的那一刻**同步**做完：next() 是靠「step 追上池长」
     *  判断收工的，晚一步追加就没人回来取新任务了（next 末尾还有一次兜底）。 */
    // 常驻图集：原 flare_arrival / flare_harbor 共用的统一 flare 图集（EAGER_ATLAS=['flare']）已下架，
    // 新进的外来图改用 per-(campaign,theme) 图集并走 mapAtlas 懒加载，这里留空 —— 不应有图集在首屏被强拉。
    var EAGER_ATLAS = [];
    function expandPlan(data) {
      var q0 = new URLSearchParams(location.search);
      var want = q0.get('map');
      // ★ 开局就要显示的那张图：?map= 点名优先，其次 maps.json 的 start。
      //   它的图集必须在首屏池里 —— 否则 boot 末尾那次 switchTo 会在一张
      //   「有地形、没图集」的地图上渲染：piece() 一件都取不到，地面与物件一个都不画，
      //   表现为**整屏黑掉**，而且不报任何错（最容易误判成"加载失败"）。
      //   所以这里把它的图集单独注册+排队，只注册开局这一套。
      var byId = {};
      (data.maps || []).forEach(function (x) { byId[x.id] = x; });
      var bootId = (want && byId[want]) ? want : ((data.start && data.start.map) || '');
      (data.maps || []).forEach(function (x) {
        // ① 常驻图集：这张图用到的图集在 EAGER_ATLAS 里，就并进首屏池 ——
        //   不再等 ?map= 指名、也不再等 2.5s 预取，用户点按钮就是同步切换。
        // 注意：这里只做「常驻图集是否进首屏」的判断，不能用会按需注册的 mapAtlas(x)，
        // 否则会在 boot 期为每张外来图都 registerFlareAtlas，把 100+ 套图集全挂进 EXTRA，
        // 随后 preloadExtras 会把它们一口气全下（首屏直接爆）。新图集保持懒加载。
        var an = (x.atlas && EAGER_ATLAS.indexOf(x.atlas) >= 0 && EXTRA[x.atlas]) ? x.atlas : '';
        if (an && !EXTRA[an].queued) {
          EXTRA[an].queued = true;
          EXTRA[an].items.forEach(function (it) {
            if (POOL.indexOf(it) < 0) { POOL.push(it); W_TOTAL += it.weight; }
          });
        }
        // ② 开局那张图（?map= 点名 / maps.json 的 start）：图集无条件进首屏。
        //    ⚠ 必须用 mapAtlas(x) 取图集名，不能只看 x.atlas ——
        //      · 外来图有 atlas 字段（flare_<theme>_<parent>），mapAtlas 负责懒注册；
        //      · 自带图（地宫）**没有** atlas 字段，靠物件前缀反推（'dungeon/' → 'dungeon'）。
        //      只判 x.atlas 会让「?map=dungeon」漏排地宫图集：进图那一刻才开始下载，
        //      玩家看到「进去了但一片空白」。mapAtlas 只对**开局这一张**调 ——
        //      千万别在 boot 期遍历全部外来图（那会把 100+ 套图集全挂进 EXTRA，
        //      随后 preloadExtras 一口气全下，首屏直接爆）。其余外来图仍保持懒加载。
        if (x.id === bootId) {
          var ban = mapAtlas(x);
          if (ban && EXTRA[ban] && !EXTRA[ban].queued) {
            EXTRA[ban].queued = true;
            EXTRA[ban].items.forEach(function (it) {
              if (POOL.indexOf(it) < 0) { POOL.push(it); W_TOTAL += it.weight; }
            });
          }
        }
        // ③ 地形数据一律开局顺手带下来（不管用户会不会点它）。
        //    线上 gzip 后一张只 8KB，与其让玩家点过去时等一个来回，不如现在就下完。
        if (x.src && !x._queued) {
          x._queued = true;
          POOL.push({ url: x.src, json: true, weight: 8,
            label: '读取「' + x.name + '」地形', _map: x });
          W_TOTAL += 8;
        }
      });
    }

    // 并发路数：原先 11 个文件严格串行，最慢的那个决定首屏；现在三条流水并行。
    // 不设更高是照顾弱机/移动网络 —— 再高收益很小，反而挤掉首帧渲染的带宽。
    var CONC = 3;
    var step = 0;
    function worker() {
      if (step >= POOL.length) return Promise.resolve();
      var p = POOL[step++];
      report(p.label, '');
      return xhrBlob(p.url, function (w, loaded, tot) {
        if (p.json) return;
        got[p.url] = loaded / (tot || p.weight);
        report(p.label, fmtBytes(loaded) + ' / ' + fmtBytes(tot));
      }).then(function (blob) {
        got[p.url] = 1;
        return p.json ? blobJson(blob).then(function (v) { p.value = v; })
                      : blobImage(blob).then(function (im) { p.value = im; });
      }).then(function () {
        // maps.json 一到手：① 先把全局常量装上（finishMap 要靠 WALK 判断可走、
        // nearWalkable 要靠它兜底找出生点，按需地形可能比 ready 更早到位 —— 时序坑），
        // ② 再决定「还要多载什么」把池子补全。
        if (p._expand && p.value) { initCore(p.value); expandPlan(p.value); }
        // 外来地图的地形数据：并回地图条目（轻条目 → 完整图）
        if (p._map && p.value) applyMapData(p._map, p.value);
        report(p.label, '');
        return worker();
      });
    }
    function next() {
      var ws = [];
      for (var c = 0; c < CONC; c++) ws.push(worker());
      return Promise.all(ws).then(function () {
        // 池子可能刚被 expandPlan 追加过（maps.json 比别的项晚到时），兜一次
        if (step < POOL.length) return next();
      });
    }

    report('读取地图数据', '');
    return next().then(function () {
      setProgress(1, '就绪', '');
        var data = LOAD_PLAN[0].value;
        ATLAS.tiles.img = LOAD_PLAN[1].value; ATLAS.tiles.rect = LOAD_PLAN[4].value;
        ATLAS.chars.img = LOAD_PLAN[2].value; ATLAS.chars.rect = LOAD_PLAN[5].value;
        ATLAS.foes.img = LOAD_PLAN[3].value;
        // 妖兽索引有两种形态：老版是「扁平 rect 表」，新版是 { rect, anims }。
        // 两种都要能加载（老图集没有 anims，就只是少了多动作怪，不该白屏）。
        var fj = LOAD_PLAN[6].value || {};
        ATLAS.foes.rect = fj.rect || fj;
        ATLAS.foes.anim = fj.anims || {};
        // 物品图标（items_atlas）：★ 必须按 url 取，**不能写死下标** ——
        // 2026-09-17 加这两项时就是忘了这一步：LOAD_PLAN 里排了队、网络也真下了，
        // 但没人把 p.value 填进 ATLAS.items，piece('jinchuang_big') 恒 null →
        // 背包格子全是文字首字、地上掉落物画不出来（?autotest=loot 抓到的）。
        // 填完还要跑一遍 fillAtlas('items')，让它把 json 拆成 rect / big / defs 三份。
        LOAD_PLAN.forEach(function (p) {
          if (p.atlas !== 'items' || !p.value) return;
          if (p.json) ATLAS.items.rect = p.value; else ATLAS.items.img = p.value;
        });
        splitItemsJson(ATLAS.items);
        // 技能特效图集（fx_atlas）：同 items 的教训 —— 排进 LOAD_PLAN 只是「下载」，
        // 还必须有人把结果接进 ATLAS，否则 fxFrame 首行 !a.img → return null，
        // 火球弹道 / 命中爆炸 blast / 雷咒落雷 lightning 全部静默不画（2026-09-17
        // 用户报「炎爆术没有特效」的根因：fx 只排队、没人接值）。ATLAS 预置无 fx 槽位，懒注册。
        LOAD_PLAN.forEach(function (p) {
          if (p.atlas !== 'fx' || !p.value) return;
          ATLAS.fx = ATLAS.fx || { img: null, rect: null };
          if (p.json) ATLAS.fx.rect = p.value; else ATLAS.fx.img = p.value;
        });
        // 首屏池里排过的按需图集（地宫 / 开局这张外来图的图集）此刻都已下载完 ——
        // 逐个把图与索引填进 ATLAS（fillAtlas 内部会把 loaded 置位），后台预取也不会再拉一遍。
        // ⚠ 以前只写死 fillAtlas('dungeon')：开局图一旦换成外来图，它的图集虽然排进了池子，
        //   却没人把值填进 ATLAS，piece() 依旧取不到件 → 开局整屏黑掉。这里按 queued 兜全。
        Object.keys(EXTRA).forEach(function (nm) { if (EXTRA[nm].queued) fillAtlas(nm); });
        // 角色清单由 test/tools/build_chars_atlas.py 自动生成。加载失败就沿用内置默认，
        // 不影响启动 —— 只是少了新角色，不会白屏。
        var hj = LOAD_PLAN[7].value;
        if (hj && hj.heroes && hj.heroes.length) HERO_OPTIONS = hj.heroes;
        // 怪物图录由 test/tools/build_beasts_atlas.py 生成：属性 + 刷怪格 + 动作帧率
        // ⚠ 按 url 取，**不能写死 LOAD_PLAN[8]**：首屏数组被硬编码下标引用，往中间插
        //   一项（如 fx 特效）就会把 beasts.json 挤走 —— 取到的是别的东西，
        //   bj.monsters 恒 undefined，absorbBeasts 静默不执行、FOE_DEFS 里没有那 9 只怪，
        //   切到地宫/灵泉时 makeFoes 读 undefined.aggro 当场抛异常、画面卡死（2026-09-16 真踩过）。
        var bj = (LOAD_PLAN.filter(function (p) { return /beasts\.json/.test(p.url); })[0] || {}).value;
        if (bj && bj.monsters && bj.monsters.length) absorbBeasts(bj.monsters);

        // 独立 PNG 素材入 IMG 缓存，供 piece() 回退使用
        LOAD_PLAN.forEach(function (p) { if (p.imgKey && p.value) IMG[p.imgKey] = p.value; });

      // 全局常量此刻通常已由 initCore 装好（maps.json 到手那一刻）—— 再装一次是幂等的保险。
      initCore(data);
      MAPS.forEach(function (m) {
        IDX[m.id] = m;
        // 懒加载图（带 src 的外来地图）：地形已到位的在 applyMapData 里算过了；
        // 还没到位的（?map= 没指到它）等它到手再说。
        if (m.src || m._data) return;
        finishMap(m);
      });

      var q = new URLSearchParams(location.search);
      {
        buildCloudSprite();
        buildButtons();
        buildWorldMap();        // 世界地图总览（Tab / 图标开）：分组节点浮层，点节点传送
        buildZoomUI();
        mmInit();               // 右上角场景缩略图（折叠开关 + 点击寻路）
        initToprightFold();     // 地图速切面板折叠（桌面/触屏通用，记住选择）
        // 底部操作说明：桌面端默认折叠成一行小标签，点一下展开/收起。
        // 手机端（body.touch）走 initMobile 里的精简文案 + 6s 自动收起（点按切 faded），
        // 两套逻辑互斥，这里遇到 touch 直接放手，否则一次点击会同时切 faded 和 folded。
        var bb = document.getElementById('bottom');
        if (bb) bb.addEventListener('click', function () {
          if (document.body.classList.contains('touch')) return;
          var foldedNow = bb.classList.toggle('folded');
          var ar = document.getElementById('btArrow');
          if (ar) ar.textContent = foldedNow ? '▸' : '▾';
        });
        // 主角外形：?hero=14 指定 > 上次手选记忆 > 默认 1 号
        buildHeroUI(q.get('hero') !== null ? +q.get('hero') : 42);
        /* ★ 初始缩放（v48）：?z= > 上次手调的记忆 > 平台默认
         *   触屏默认 = ZMIN（视角拉到最高、视野最广）：手机屏小，100% 下只看得见脚边
         *   两三步，怪从画面外摸上来都不知道。桌面保持 100%。
         *   注意 Z/Zt 要在 switchTo 之前定好 —— 相机居中是按当前 Z 算的。 */
        var zq = parseFloat(q.get('z'));
        if (document.body.classList.contains('touch')) ZDEF = ZMIN;
        var zInit = ZDEF, zMem = null;
        try { zMem = localStorage.getItem('isles.zoom'); } catch (e) { }
        if (zq > 0) zInit = zq;                                  // URL 指定最优先
        else if (zMem !== null && +zMem > 0) zInit = +zMem / 100; // 其次是他自己上次调的
        Z = Zt = Math.max(ZMIN, Math.min(ZMAX, zInit));
        zAnchor = true; zAx = W / 2; zAy = H / 2;
        updateZoomUI();
        zLock = true;      // ★ 默认值定完就上锁：此后只有「人主动拉」的入口能改 Z
        /* ★ 读档（在 switchTo 之前把角色数据塞回来）：
         *   · ?new=1 = 明确要重开（只读到此处的忽略判断）
         *   · ?map=xxx = 明确要去某张图（调试用途，优先级高于存档位置，但装备/银两照常读回）
         *   其余情况：有存档就落回存档所在的图与坐标 —— 这才是"存档"两个字该有的样子。 */
        var svNew = (q.get('new') === '1');
        migrateLegacySave();     // v51 及以前的 isles.save → 档位一（一次性）
        /* 认领槽位：
         *   · 新开局（?new=1）挑**第一个空槽** —— 不能让它顺手把旧档冲掉，那正是分档的全部意义；
         *     三个槽都满了就认领 0（自动存档暂停），先让玩家自己决定覆盖谁。
         *   · 正常进来挑「最近存过的那个」；一个都没有才落到档位一，
         *     这样从头到尾没点过「存」的人，15 秒后也不会白打。 */
        setCurSlot(svNew ? firstEmptySlot() : (newestSlot() || 1));
        var sv = svNew ? null : readSave();
        var svMapId = sv ? sv.map : null;
        var start = IDX[q.get('map')] ? q.get('map') : (svMapId || data.start.map);
        var m = IDX[start] || MAPS[0];
        // 没显式给坐标时：起点图用 maps.json 里写好的 start（山门广场），
        // 其它图落到离地图中心最近的可走格 —— 旧的写法把 start 里的坐标当摆设，一直没用上。
        var useCfg = (start === data.start.map);
        var sx = q.get('x') !== null ? +q.get('x') : (svMapId && start === svMapId ? sv.x : (useCfg ? data.start.x : m.home.x));
        var sy = q.get('y') !== null ? +q.get('y') : (svMapId && start === svMapId ? sv.y : (useCfg ? data.start.y : m.home.y));
        if (sv) applySave(sv);        // 装备/背包/银两先回位，再落点
        switchTo(m.id, sx, sy, true);
        document.getElementById('loader').style.display = 'none';
        ready = true;
        window.__ready = true;
        buildBagUI();          // 背包格子（依赖 items_atlas 已进 ATLAS，必须等 initAtlas 之后）
        syncLeftBtns();        // 药格建完面板才定型 → 立刻把左列圆钮排到它下面（v53 防重叠）
        buildGearUI();         // 装备区（有存档时要在落地前把"穿了什么"画出来）
        renderGearInfo();
        updateSaveUI();        // 存档状态行：告诉玩家"你此刻有没有存档"
        if (sv) toast('已读取存档 · ' + m.name + ' · 银两 ' + sv.stones);
        // 首屏只载了「这一张图要用的」；其余按需图集趁空闲在后台补上，
        // 用户点地图按钮时通常已经就绪（见 preloadExtras 注释）。
        // ?preload=0 关掉按需图集的后台预取（省流量/弱网，也让 lazygoto 自测能测到真·按需）
        if (q.get('preload') !== '0') preloadExtras();
        var dbg = document.createElement('div');
        dbg.id = 'dbg'; dbg.style.display = 'none';
        document.body.appendChild(dbg);
        window.__dbg = dbg;
        var at = q.get('autotest');
        // 自测期把未捕获异常/未处理的 Promise 拒绝**写进 #probe**。
        // 没有这一层，用例里任何一处抛错的表现都是「没有 #probe」——和「用例没过」长得
        // 一模一样（#dbg 每帧都在写，页面上看还"活得好好的"），只能靠翻代码猜。
        // 只在带 ?autotest= 时装，正常玩家不受影响。
        if (at) {
          function probeErr(o) {
            var pb = document.getElementById('probe');
            if (!pb) {
              pb = document.createElement('div'); pb.id = 'probe';
              pb.style.display = 'none'; document.body.appendChild(pb);
            }
            if (!pb.textContent) pb.textContent = JSON.stringify(o);
          }
          window.addEventListener('error', function (ev) {
            var st = String((ev.error && ev.error.stack) || '').split('\n').slice(0, 6).join(' | ');
            probeErr({ err: String(ev.message || ev.error),
              at: (ev.filename || '') + ':' + ev.lineno + ':' + ev.colno, stack: st });
          });
          window.addEventListener('unhandledrejection', function (ev) {
            var r = ev.reason;
            probeErr({ reject: String((r && r.message) || r), stack: String((r && r.stack) || '').slice(0, 400) });
          });
        }
        // 手机端 UI 自测：要等遮罩隐藏之后再跑，否则 elementFromPoint 只会命中遮罩
        // （详见 initMobile 末尾 __mobileAudit 的注释）。
        // ★ 必须排在上面那对异常监听器**之后** —— 它随 UI 改动随时可能抛错，
        //   早一步调用就会在「没人监听」的空窗里把 boot 的 then 链整条打断，
        //   连 #dbg 都建不出来，现场不留任何痕迹（2026-09-16 就因此瞎猜了一轮）。
        if (window.__mobileAudit) try { window.__mobileAudit(); } catch (e) {
          // 自测辅助不该有能力打断 boot 链（2026-09-17 v41 加保险：它抛错=链断=版本号等收尾全跳过）
          window.__showErr && window.__showErr('mobileAudit: ' + String((e && e.message) || e).slice(0, 80));
        }
        HOLD = q.get('hold') === '1';
        /* 版本号（title / 右下角角标 / window.__VTAG）v41 起改在**脚本顶层**设置 ——
         * 原来（v39/v40）放在这条 then 链里：链若在收尾段静默断掉，版本判据
         * 跟着一起消失（用户截图状态行 v? 就是这么来的）。顶层版本与 boot 存亡解耦。 */
        // ?pose=run —— 把主角锁在某个动作上（核对素材/截图用），取值见 ACT_CN
        var pq = q.get('pose');
        if (pq && ACT_CN[pq]) { poseLock = pq; player.act = pq; player.actT = 0.05; }
        // ?foeact=atk&i=0&k=0.45 —— 锁住第 i 只怪的某个动作（中段），用于核对怪物素材
        var fq = q.get('foeact');
        if (fq) foePose = { i: (+q.get('i') || 0), act: fq, k: Math.max(0, Math.min(0.95, +q.get('k') || 0.45)) };
        // 无头浏览器里 rAF 的 dt 常常接近 0（虚拟时钟只推进定时器、不推进帧），
        // 过渡动画就会卡在 fade≈0.08 永远走不完 —— 这是抓取环境的假象，不是引擎 bug。
        // 所以自测一律用 ISLES.tick(1/60) 手动推进固定步长，结果可复现。
        function sim(seconds) {
          var n = Math.round(seconds * 60);
          for (var i = 0; i < n; i++) window.ISLES.tick(1 / 60);
        }
        // ?warm=8 —— 截图专用：启动后先按固定步长推进 8 秒再画第一帧。
        // 无头环境里 rAF 的 dt≈0，直接截图只能拍到 t=0 的初始站位，
        // 想看「怪已经追上来开打」的画面就得先手动把时间推过去。
        var wq = +q.get('warm') || 0;
        if (wq > 0) sim(Math.min(60, wq));
        // ?cast=0&ck=0.45 —— 释放第 0 号技能，并把技能表现**定格**在进度 ck（0~1）。
        //   · 无头环境没法交互式按技能键，也就没法核对"技能放出来长什么样"；
        //   · fxFreeze 让 updateSkillFx 停摆（特效不再淡出），世界照常推进 ——
        //     所以先用 warm 把怪引到身边，再 cast 定格，一张图里就能同时看到
        //     「怪被击中 + 特效中段 + 主角施法姿态」。
        //   · 主角动作也一并定在同一进度，否则角色早做完动作回 idle 了。
        var cq = q.get('cast');
        if (cq !== null) {
          var ci = Math.max(0, Math.min(SKILLS.length - 1, parseInt(cq, 10) || 0));
          var ck = q.get('ck') === null ? 0.45 : Math.max(0, Math.min(0.98, parseFloat(q.get('ck')) || 0));
          player.skillCd[ci] = 0;
          castSkill(ci);
          fxFreeze = true;
          if (skillFx.length) {
            var fxLast = skillFx[skillFx.length - 1];
            fxLast.life = fxLast.max * (1 - ck);
          }
          if (player.actHold > 0) {
            player.actT = ACT_DUR[player.act] * ck;
            player.actHold = ACT_DUR[player.act];
          }
        }
        if (at && at.indexOf('portal') === 0) {
          // 同步执行：headless 里 setTimeout(60) 未必能在 dump-dom 之前触发，
          // 用例就会读到「还没传送」的 dbg，表现成随机失败（处理方式同 autotest=fight）。
          window.ISLES.stepOnPortal(0); sim(3);
        }
        if (at === 'state') {
          // ?autotest=state —— 把玩家/相机/缩放状态写进 #dbg，用于核对截图之间是否同源
          setTimeout(function () {
            var s = window.ISLES.state();
            s.cam = { x: +camX.toFixed(1), y: +camY.toFixed(1) };
            s.hero = PLAYER_SRC;
            s.foes = foes.length;
            var g = document.getElementById('dbg');
            if (g) g.textContent = JSON.stringify(s);
          }, 80);
        }
        if (at === 'bootstats') {
          // ?autotest=bootstats —— 首屏实际下载量。用来证明「按需图集」真的没进首屏：
          // got[url] 有值 = 这一项真下载过；汇总权重即可（weight 就是各项的真实 KB）。
          setTimeout(function () {
            var r = { map: CUR.id, total: 0, items: [], extras: {} };
            POOL.forEach(function (p) {
              if (got[p.url]) { r.total += p.weight; r.items.push(p.label + ' ' + p.weight); }
            });
            Object.keys(EXTRA).forEach(function (k) {
              r.extras[k] = { loaded: !!EXTRA[k].loaded, queued: !!EXTRA[k].queued };
            });
            var pb = document.getElementById('probe');
            if (!pb) { pb = document.createElement('div'); pb.id = 'probe'; pb.style.display = 'none'; document.body.appendChild(pb); }
            pb.textContent = JSON.stringify(r);
          }, 60);
        }
        if (at === 'skillpad') {
          // ?autotest=skillpad —— 技能盘排版验收（王者式弧线）。
          // 排版的坑是"看着还行、实际叠在一起/被顶出屏幕"，纯截图看不出来 —— 这里量真实矩形：
          //   boxes   = 6 个键的 [left,top,w,h]（含 transform 缩放后的实际值）
          //   minGap  = 任意两键外沿最小间距（必须 > 0；设计要求 ≥ 7，缩放后会等比变小）
          //   inView  = 整盘是否全在视口内；folded 折叠开关能不能来回切
          setTimeout(function () {
            var pad = document.getElementById('skillpad');
            var r = { vp: [window.innerWidth, window.innerHeight] };
            if (!pad) { r.err = 'no #skillpad'; }
            var els = pad ? pad.querySelectorAll('.sk') : [];
            var boxes = [], i, j;
            for (i = 0; i < els.length; i++) {
              var b = els[i].getBoundingClientRect();
              boxes.push({ n: els[i].id || ('s' + (els[i].dataset ? els[i].dataset.s : i)),
                x: +b.left.toFixed(1), y: +b.top.toFixed(1),
                w: +b.width.toFixed(1), h: +b.height.toFixed(1) });
            }
            r.boxes = boxes;
            // ⚠ 间距必须按「圆」量，不能按外接矩形量：圆面排开时外接矩形天然互相咬角，
            //   用矩形会有假重叠（第一版就是这么误报的）。这里用圆心距 - 两半径。
            var min = 1e9, who = '';
            for (i = 0; i < boxes.length; i++) {
              for (j = i + 1; j < boxes.length; j++) {
                var a = boxes[i], c = boxes[j];
                var cx1 = a.x + a.w / 2, cy1 = a.y + a.h / 2;
                var cx2 = c.x + c.w / 2, cy2 = c.y + c.h / 2;
                var gap = Math.hypot(cx2 - cx1, cy2 - cy1) - (Math.min(a.w, a.h) + Math.min(c.w, c.h)) / 2;
                if (gap < min) { min = gap; who = a.n + '/' + c.n; }
              }
            }
            r.minGap = +min.toFixed(1); r.minGapPair = who;
            var pb2 = pad ? pad.getBoundingClientRect() : null;
            r.padBox = pb2 ? [Math.round(pb2.left), Math.round(pb2.top), Math.round(pb2.width), Math.round(pb2.height)] : null;
            r.inView = !!pb2 && pb2.left >= -0.5 && pb2.top >= -0.5 &&
              pb2.right <= window.innerWidth + 0.5 && pb2.bottom <= window.innerHeight + 0.5;
            r.rightGap = pb2 ? Math.round(window.innerWidth - pb2.right) : null;
            if (pad) {
              var tg = document.getElementById('skillToggle');
              r.tgTopLeft = tg ? [Math.round(tg.getBoundingClientRect().left), Math.round(tg.getBoundingClientRect().top)] : null;
              // 折叠开关：切一次再切回来
              if (tg) {
                tg.click(); r.foldedAfter = pad.classList.contains('folded');
                var fb = pad.getBoundingClientRect();
                r.foldedBox = [Math.round(fb.width), Math.round(fb.height)];
                tg.click(); r.unfoldedAfter = !pad.classList.contains('folded');
              }
              r.touch = document.body.classList.contains('touch');
              r.scale = getComputedStyle(pad).transform;
            }
            var pbs = document.getElementById('probe');
            if (!pbs) {
              pbs = document.createElement('div'); pbs.id = 'probe';
              pbs.style.display = 'none'; document.body.appendChild(pbs);
            }
            pbs.textContent = JSON.stringify(r);
          }, 60);
        }
        if (at === 'skillclick') {
          // ?autotest=skillclick —— 技能盘「点击链路」验收（用户报过「点 P 没效果」）。
          // 为什么必须单独立一条：?autotest=skill 是**直接调 castSkill()**，绕过了整个 DOM，
          // 所以「按钮点了没反应」这类故障它永远看不见 —— 按钮被别的层盖住、被 pointer-events
          // 吃掉、data-s 与 SKILLS 下标错位、点击处理器没绑上，全都是零报错静默失效。
          // 这里逐键做两件事：
          //   ① elementFromPoint 命中测试 —— 按钮中心点到底压在谁身上（真·可点性）；
          //   ② 真派发 click —— 看 skillCd / 弹丸 / 特效有没有起来（真·接线）。
          // 最后再把键盘同一入口（SKILL_KEYS）过一遍，确认「按键 == 点按钮」。
          setTimeout(function () {
            var pad = document.getElementById('skillpad');
            var r = { vp: [window.innerWidth, window.innerHeight], btns: [], kb: [] };
            var bs = pad ? pad.querySelectorAll('.sk[data-s]') : [];
            player.invuln = 999;                       // 别被怪打断，也别被打死
            player.dead = false;
            for (var i = 0; i < bs.length; i++) {
              var b = bs[i], si = +b.dataset.s, bb = b.getBoundingClientRect();
              var cx = Math.round(bb.left + bb.width / 2), cy = Math.round(bb.top + bb.height / 2);
              var t = document.elementFromPoint(cx, cy);
              var o = { s: si, key: SKILLS[si] ? SKILLS[si].key : null,
                hit: !!t && (t === b || b.contains(t)),
                onTop: t ? (t.id || String(t.className) || t.tagName) : null };
              // 清干净再点：上一招的 actHold 会掐断下一招，那是设计，不是点击失效
              player.skillCd[si] = 0; player.actHold = 0; player.attackCd = 0;
              var pj0 = projectiles.length, cfx0 = skillFx.length;
              b.click();
              o.cdAfter = +player.skillCd[si].toFixed(2);
              o.proj = projectiles.length - pj0;
              o.fx = skillFx.length - cfx0;
              o.act = player.actHold > 0;
              r.btns.push(o);
            }
            // 键盘走 SKILL_KEYS（与按钮同一个 castSkill 入口）
            for (var k = 0; k < SKILLS.length; k++) {
              player.skillCd[k] = 0; player.actHold = 0; player.attackCd = 0;
              window.dispatchEvent(new KeyboardEvent('keydown', { key: SKILLS[k].key, bubbles: true }));
              r.kb.push({ key: SKILLS[k].key, cdAfter: +player.skillCd[k].toFixed(2) });
              window.dispatchEvent(new KeyboardEvent('keyup', { key: SKILLS[k].key, bubbles: true }));
            }
            var pbs = document.getElementById('probe');
            if (!pbs) {
              pbs = document.createElement('div'); pbs.id = 'probe';
              pbs.style.display = 'none'; document.body.appendChild(pbs);
            }
            pbs.textContent = JSON.stringify(r);
          }, 260);
        }
        if (at === 'viewport') {
          // ?autotest=viewport —— 手机端「视口/画布」一致性验收。
          // 手机上报"移动时地图一块块漏出来"这类症状，很大一部分出在视口而不是绘制逻辑：
          //   ① 画布位图尺寸 ≠ CSS 盒尺寸 → 浏览器拉伸位图 → 每格瓦片都落在像素栅格外
          //   ② 尺寸没变却重设 canvas.width → 整屏被清空（地址栏动画会连发 resize）
          //   ③ touch-action / 手势拦截没生效 → 单指拖摇杆变成原生平移页面
          // 这三条都不报错、截图也未必看得出来，只能这样量着断言。
          setTimeout(function () {
            var vv = window.visualViewport;
            var cs = getComputedStyle(canvas), bs = getComputedStyle(document.body);
            var r = {
              inner: [window.innerWidth, window.innerHeight],
              canvas: [canvas.width, canvas.height],
              client: [canvas.clientWidth, canvas.clientHeight],
              dpr: window.devicePixelRatio || 1,
              vv: vv ? [Math.round(vv.width), Math.round(vv.height), +(+vv.scale).toFixed(3)] : null,
              touchAction: cs.touchAction, bodyTouchAction: bs.touchAction,
              overscroll: bs.overscrollBehavior || bs.overscrollBehaviorY || '',
              zoomFix: !!window.ZoomFix, zoomOn: !!(window.ZoomFix && window.ZoomFix.on),
              viewfix: !!document.getElementById('viewfix')
            };
            // ① 位图必须 1:1 等于 CSS 盒（不等就是被拉伸 → 缝隙/错位）
            r.sizeMatch = (canvas.width === canvas.clientWidth && canvas.height === canvas.clientHeight);
            // ③ 防线真的注册上了吗：合成事件探一次默认行为有没有被拦
            try {
              var ge = new Event('gesturestart', { cancelable: true, bubbles: true });
              document.dispatchEvent(ge); r.gestureBlocked = ge.defaultPrevented;
              var de = new Event('dblclick', { cancelable: true, bubbles: true });
              document.dispatchEvent(de); r.dblBlocked = de.defaultPrevented;
            } catch (e) { r.evErr = String((e && e.message) || e); }
            // ② 哨兵像素：尺寸没变时调 resize（含连打 5 次）都**不许**把画布擦掉
            try {
              ctx.fillStyle = '#ff00ff'; ctx.fillRect(3, 3, 2, 2);
              resize();
              var a1 = ctx.getImageData(3, 3, 1, 1).data;
              r.survivedResize = (a1[0] === 255 && a1[1] === 0 && a1[2] === 255);
              for (var ri = 0; ri < 5; ri++) resize();
              var a2 = ctx.getImageData(3, 3, 1, 1).data;
              r.survivedStorm = (a2[0] === 255 && a2[1] === 0 && a2[2] === 255);
            } catch (e2) { r.pxErr = String((e2 && e2.message) || e2); }
            var pb = document.getElementById('probe');
            if (!pb) {
              pb = document.createElement('div'); pb.id = 'probe';
              pb.style.display = 'none'; document.body.appendChild(pb);
            }
            pb.textContent = JSON.stringify(r);
          }, 60);
        }
        if (at === 'seams') {
          // ?autotest=seams —— 「瓦片之间露缝」验收（手机端"地图一块块漏、有缝隙"的另一半）。
          // 缝隙来自「分数坐标落点 + imageSmoothingEnabled=false」：浏览器对每块瓦各自取整，
          // 误差逐格累积 → 边界上留出 1px 的底色/天空线。
          // 所以查两件事，互补：
          //   ① GND.frac —— 本帧铺的瓦里，有多少块的落点/尺寸不是整数（必须 0，与 DPR 无关）
          //   ② seamPx   —— 站在瓦片**接缝正中间**采样：本该是草地的地方露没露天空色
          // 天空是 (0,0)->(0,H) 的三段线性渐变，按行高直接算出该行的理论色值即可，
          // 不用去"先画一遍天空取色"（那样还得躲开云）。
          setTimeout(function () {
            render();
            var out = { map: CUR.id, z: +Z.toFixed(3), frac: -1, n: -1, pairs: 0, seamPx: 0 };
            var hex = function (h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; };
            var k = Math.round(player.mx) + Math.round(player.my) + 3;   // 主角前方 3 格那条对角线
            var base = isoToScreen(0, k);
            var sy = Math.round(base.y + 30 * Z);                        // 瓦片菱形中心（瓦高 60）
            if (sy < 4 || sy > H - 5) sy = Math.round(H * 0.62);
            out.sy = sy;
            if (!CUR.voidColor && CUR.id !== 'dungeon') {
              var tt = Math.max(0, Math.min(1, sy / H));
              var A = hex(SKY_TOP), M = hex(SKY_MID), D = hex(SKY_BOT), sky;
              if (tt <= 0.5) { var u = tt / 0.5; sky = [A[0] + (M[0] - A[0]) * u, A[1] + (M[1] - A[1]) * u, A[2] + (M[2] - A[2]) * u]; }
              else { var v = (tt - 0.5) / 0.5; sky = [M[0] + (D[0] - M[0]) * v, M[1] + (D[1] - M[1]) * v, M[2] + (D[2] - M[2]) * v]; }
              out.sky = [Math.round(sky[0]), Math.round(sky[1]), Math.round(sky[2])];
              var gx0 = Math.round(player.mx) - 5;
              for (var d = 0; d <= 9; d++) {
                var ga = gx0 + d, gb = ga + 1, ya = k - ga, yb = k - gb;
                var ca = cellChar(ga, ya), cb = cellChar(gb, yb);
                if (ca === ' ' || cb === ' ') continue;
                if (WATER.indexOf(ca) >= 0 || WATER.indexOf(cb) >= 0) continue;   // 水面本身偏蓝，会误判
                var xa = isoToScreen(ga, ya), xb = isoToScreen(gb, yb);
                var bx = Math.round((xa.x + xb.x) / 2);
                if (bx < 3 || bx > W - 4) continue;
                out.pairs++;
                // 接缝是一条竖线：上下各取一点，任一点露天空色就算这条缝漏了
                for (var oy = -6; oy <= 6; oy += 3) {
                  var px2 = ctx.getImageData(bx, sy + oy, 1, 1).data;
                  if (Math.abs(px2[0] - sky[0]) + Math.abs(px2[1] - sky[1]) + Math.abs(px2[2] - sky[2]) < 26) {
                    out.seamPx++;
                    if (!out.seamSample) out.seamSample = [bx, sy + oy, px2[0], px2[1], px2[2]];
                  }
                }
              }
            } else {
              out.bg = CUR.voidColor || 'dungeon';
            }
            GND.on = true; GND.n = 0; GND.frac = 0;
            render();
            GND.on = false;
            out.n = GND.n; out.frac = GND.frac;
            var pb = document.getElementById('probe');
            if (!pb) {
              pb = document.createElement('div'); pb.id = 'probe';
              pb.style.display = 'none'; document.body.appendChild(pb);
            }
            pb.textContent = JSON.stringify(out);
          }, 80);
        }
        if (at === 'rendersmoke') {
          // ?autotest=rendersmoke —— 「开局这一屏真的画出来了吗」的确定性断言。
          // 为什么单独立一条：只查 CUR.id / 坐标 / 无异常都**拦不住**「有地形、没图集」
          // 这种静默故障 —— 那时 piece() 一件都取不到，地面与物件一个都不画，整屏黑掉
          // 却不报任何错（连 #probe 的异常出口都空着），而 state 用例看着一切正常。
          // 所以这里直接查两样东西：① 瓦片件命中率 ② 主画布真实像素的亮度/颜色分布。
          setTimeout(function () {
            render();     // headless 里 rAF 的 dt 常≈0，别指望"已经渲染过一帧"
            var r = { map: CUR.id };
            var an = mapAtlas(CUR);
            r.atlasName = an || '(主图集)';
            r.atlasImg = !!(an && ATLAS[an] && ATLAS[an].img);
            r.atlasHasTiles = !!(an ? (ATLAS[an] && ATLAS[an].rect && Object.keys(ATLAS[an].rect).length) : ATLAS.tiles.rect);
            var hit = 0, miss = 0, missSample = [];
            for (var y = 0; y < CUR.h; y++) {
              for (var x = 0; x < CUR.w; x++) {
                var f = PAL[CUR.ground[y][x]];
                if (!f) continue;
                if (piece(f)) hit++;
                else { miss++; if (missSample.length < 3) missSample.push(CUR.ground[y][x] + '→' + f); }
              }
            }
            r.tileHit = hit; r.tileMiss = miss; r.missSample = missSample;
            var o = CUR.objects || [], oh = 0, om = 0;
            for (var i = 0; i < o.length; i++) { if (piece(o[i].piece)) oh++; else om++; }
            r.objHit = oh; r.objMiss = om;
            r.heroHasSheet = !!(ATLAS.chars && ATLAS.chars.img);
            try {
              var d = ctx.getImageData(0, 0, W, H).data;
              var dark = 0, bright = 0, tot = 0, seen = {};
              for (var p = 0; p < d.length; p += 4 * 37) {
                tot++;
                var R = d[p], G = d[p + 1], B = d[p + 2];
                if (R < 24 && G < 24 && B < 24) dark++;
                if (R + G + B > 150) bright++;
                seen[(R >> 5) + ',' + (G >> 5) + ',' + (B >> 5)] = 1;
              }
              r.px = { tot: tot, darkPct: +(dark / tot * 100).toFixed(1),
                brightPct: +(bright / tot * 100).toFixed(1), colors: Object.keys(seen).length };
            } catch (e) { r.pxErr = String(e && e.message || e); }
            var pb = document.getElementById('probe');
            if (!pb) {
              pb = document.createElement('div'); pb.id = 'probe';
              pb.style.display = 'none'; document.body.appendChild(pb);
            }
            pb.textContent = JSON.stringify(r);
          }, 60);
        }
        if (at === 'lazygoto') {
          // ?autotest=lazygoto&preload=0&goto=<id> —— 「运行时按需加载」验收
          // （配合 preload=0 关掉预取，否则预取会先把图集拉下来，测不出"当场补载"）。
          // 模拟用户点地图按钮切过去：图集与地形要当场补上、玩家落在可走的出生点上、
          // 加载提示要收掉。默认目标 = 阿米尔要塞（外来图，独立图集 + 地形外置；
          // 原默认值 flare_arrival 已随统一图集下架，指过去是空测试）。
          setTimeout(function () {
            var gid = q.get('goto') || 'flare_dungeon_empyrean_campaign_fort_amir';
            // before = 「点下去之前，目标图要用的图集是否已就绪」。目标图没有独立图集时
            // （地宫/自带图走主 tiles 图集）mapAtlas 返回 undefined —— 旧写法回退到已下架的
            // 统一 'flare' 键，ATLAS['flare'] 是 undefined，.img 直接抛错（自测假失败的真因）。
            var gm = IDX[gid], gan = gm && mapAtlas(gm);
            var gslot = (gan && ATLAS[gan]) || ATLAS.tiles || {};
            var r = { from: CUR.id, gid: gid, before: !!gslot.img };
            window.ISLES.goto(gid).then(function () {
              var an2 = mapAtlas(CUR);
              r.map = CUR.id;
              r.obj = CUR.objects ? CUR.objects.length : 0;
              r.atlasName = an2 || '(主图集)';
              r.atlas = !an2 || (!!ATLAS[an2].img && !!ATLAS[an2].rect);
              r.spawn = CUR.home.x + ',' + CUR.home.y;
              r.spawnOnWalkable = walkable(CUR.home.x, CUR.home.y);
              r.atSpawn = Math.round(player.mx) === CUR.home.x && Math.round(player.my) === CUR.home.y;
              var tip = document.getElementById('mapLoading');
              r.tipGone = !tip || tip.style.display === 'none';
              var pb = document.getElementById('probe');
              if (!pb) { pb = document.createElement('div'); pb.id = 'probe'; pb.style.display = 'none'; document.body.appendChild(pb); }
              pb.textContent = JSON.stringify(r);
            });
          }, 60);
        }
        if (at === 'importmap') {
          // ?map=<外来图>&autotest=importmap —— 外来地图（tools/import_tmx.py 产出）的接入验收。
          // 这类图是别人做的，最容易坏的三处全都**不报错**，只是静默不能用：
          //   ① maps.json 的 walkable 忘了并进 'k' → 整张图点了不动（不能走，但画得好好的）
          //   ② 出生点落在水里/虚空 → switchTo 会 snapWalkable 把它挪到别处，玩家一进来就在莫名位置
          //   ③ Tiled 的"复合瓦"（2x2 等）锚点错 → 露出黑缺口（bg/ob 全空的那几格本来是给它盖的）
          // 这三条都量化进 #probe，跑批里一眼能看出是哪一类。
          setTimeout(function () {
            var walk = 0, voidc = 0;
            for (var y = 0; y < CUR.h; y++) {
              for (var x = 0; x < CUR.w; x++) {
                if (CUR.ground[y][x] !== ' ') walk++; else voidc++;
              }
            }
            var big = 0, gnd = 0, solid = 0;
            CUR.objects.forEach(function (o) {
              if ((o.fw || 1) > 1 || (o.fh || 1) > 1) big++;
              if (o.gnd) gnd++; else if (o.solid) solid++;
            });
            var dp = CUR.home || { x: -1, y: -1 };
            // 从出生点做一次小半径 BFS，找一格"能走且不被实体占"的远处格子当点击目标 ——
            // 有这么一格才说明这张图真的能玩（走不动 = walkable 没配好）
            var sx = Math.round(player.mx), sy = Math.round(player.my);
            var seen = {}, order = [[sx, sy]], target = null;
            seen[sx + ',' + sy] = 1;
            for (var qi = 0; qi < order.length && order.length < 260 && !target; qi++) {
              var c = order[qi];
              for (var d = 0; d < 4; d++) {
                var nx = c[0] + (d === 0 ? 1 : d === 1 ? -1 : 0);
                var ny = c[1] + (d === 2 ? 1 : d === 3 ? -1 : 0);
                var k = nx + ',' + ny;
                if (seen[k] || !walkable(nx, ny) || isSolid(nx, ny)) continue;
                seen[k] = 1; order.push([nx, ny]);
                // 2~5 步之内、又不在出生点旁边（太近的话 clickCell 可能是原地）
                var dd = Math.abs(nx - sx) + Math.abs(ny - sy);
                if (dd >= 2 && dd <= 5) { target = [nx, ny]; break; }
              }
            }
            var r = {
              map: CUR.id, w: CUR.w, h: CUR.h,
              obj: CUR.objects.length, gnd: gnd, solid: solid, big: big,
              walk: walk, voidCells: voidc,
              voidColor: CUR.voidColor || '',
              spawnDeclared: dp.x + ',' + dp.y,
              spawnOnWalkable: walkable(dp.x, dp.y),
              atSpawn: (Math.round(player.mx) === dp.x && Math.round(player.my) === dp.y),
              targetFound: !!target,
              reached: null, moved: null
            };
            if (target) {
              var ok = window.ISLES.clickCell(target[0], target[1]);
              sim(5);
              r.clickAccepted = ok;
              r.target = target[0] + ',' + target[1];
              r.reached = Math.abs(player.mx - player.tx) < 0.02 && Math.abs(player.my - player.ty) < 0.02;
              r.moved = (Math.round(player.mx) !== sx || Math.round(player.my) !== sy);
              r.end = Math.round(player.mx) + ',' + Math.round(player.my);
            }
            var pb = document.getElementById('probe');
            if (!pb) {
              pb = document.createElement('div'); pb.id = 'probe';
              pb.style.display = 'none'; document.body.appendChild(pb);
            }
            pb.textContent = JSON.stringify(r);
          }, 60);
        }
        if (at === 'crossing') {
          // ?map=<图>&autotest=crossing —— 「看着有路却走不到」验收。
          // 把整张图的可走格按 4 连通分成块，然后从玩家脚下 BFS：
          //   walk     = walkable() 认了的格数
          //   reach    = 从玩家脚下真的走得到的格数
          //   isolated = 两者之差 —— ★ 必须为 0。不为 0 就是"看着能站、点上去不动"的格子
          //              （外来图最容易出：桥下被 collision/水面判死、塌成孤岛）
          // 再取最远的一格当目标真的走过去，验证跨桥/绕崖的寻路成立。
          setTimeout(function () {
            var sx = Math.round(player.mx), sy = Math.round(player.my);
            var dist = {}, q2 = [[sx, sy]], head = 0, far = [sx, sy], fd = 0, reach = 0;
            // 走过去的**目标**另挑一个：远端必须在 sim 的时长上限内走得到。
            // 大图（黑橡城 95×94）离出生点最远能有 177 格，按 3.8 格/秒要 65 秒，
            // 而 sim 封顶 40 秒 → 只走了 152 格，arrived 假红（它是"用例的天花板"，不是地图坏）。
            // 所以取「距离 ≤110 格内最远的那一格」当走位目标；真正的"全图连通"由 isolated===0 保证。
            var farWalk = [sx, sy], fwd = 0;
            dist[sx + ',' + sy] = 0;
            while (head < q2.length) {
              var c = q2[head++], cx = c[0], cy = c[1], d0 = dist[cx + ',' + cy];
              reach++;
              if (d0 > fd) { fd = d0; far = [cx, cy]; }
              if (d0 <= 110 && d0 > fwd) { fwd = d0; farWalk = [cx, cy]; }
              for (var k = 0; k < 4; k++) {
                var nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
                var ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
                var kk = nx + ',' + ny;
                if (dist[kk] !== undefined || !walkable(nx, ny)) continue;
                dist[kk] = d0 + 1; q2.push([nx, ny]);
              }
            }
            var walkN = 0;
            for (var y = 0; y < CUR.h; y++) {
              for (var x = 0; x < CUR.w; x++) if (walkable(x, y)) walkN++;
            }
            var r = { map: CUR.id, walk: walkN, reach: reach, isolated: walkN - reach,
              far: far[0] + ',' + far[1], farDist: fd,
              farWalk: farWalk[0] + ',' + farWalk[1], farWalkDist: fwd, arrived: null };
            if (fwd > 2) {
              r.clickAccepted = window.ISLES.clickCell(farWalk[0], farWalk[1]);
              sim(Math.min(90, fwd / 3.8 * 1.4 + 0.8));   // 玩家 3.8 格/秒（见 update 里的 speed）
              r.arrived = Math.abs(player.mx - farWalk[0]) < 0.75 && Math.abs(player.my - farWalk[1]) < 0.75;
              r.end = Math.round(player.mx) + ',' + Math.round(player.my);
            }
            var pb = document.getElementById('probe');
            if (!pb) {
              pb = document.createElement('div'); pb.id = 'probe';
              pb.style.display = 'none'; document.body.appendChild(pb);
            }
            pb.textContent = JSON.stringify(r);
          }, 60);
        }
        if (at === 'minimap') {
          // ?map=<图>&autotest=minimap —— 右上角缩略图验收：
          // 画布按地图比例出尺寸、四类格子（能走/挡路/水/虚空）数对得上、
          // 主角标记落在画布内、折叠开关能来回切、**点缩略图能真的走过去**。
          setTimeout(function () {
            var r = { map: CUR.id, cv: !!MM.cv, foldedAtStart: MM.folded };
            if (!MM.cv) {
              var pb0 = document.getElementById('probe');
              if (!pb0) {
                pb0 = document.createElement('div'); pb0.id = 'probe';
                pb0.style.display = 'none'; document.body.appendChild(pb0);
              }
              pb0.textContent = JSON.stringify(r);
              return;
            }
            mmFold(false); MM.last = ''; updateMinimap();
            r.folded = MM.folded;
            r.size = [MM.cv.width, MM.cv.height];
            r.cellPx = +MM.s.toFixed(3);
            r.ratio = +((MM.cv.width / MM.cv.height) - (CUR.w / CUR.h)).toFixed(3);
            var n = { walk: 0, block: 0, water: 0, void: 0 };
            for (var y = 0; y < CUR.h; y++) {
              for (var x = 0; x < CUR.w; x++) {
                var ch = CUR.ground[y][x];
                if (ch === ' ') n.void++;
                else if (WATER.indexOf(ch) >= 0) n.water++;
                else if (CUR.solid['' + x + ',' + y]) n.block++;
                else n.walk++;
              }
            }
            var cb = MM.cv.getBoundingClientRect();
            // CSS 尺寸 vs 位图尺寸：手机端 34vh 上限会等比压扁显示尺寸（多 +2 是 1px 边框），
            // 点击换算走的就是它，所以两者必须能对上、且不能被放大（放大会糊）。
            r.cssBox = [Math.round(cb.width), Math.round(cb.height)];
            r.notUpscaled = cb.height <= MM.cv.height + 2.5;
            r.cells = n;
            r.player = Math.round(player.mx) + ',' + Math.round(player.my);
            // 面板几何：防"缩略图被顶出屏幕 / 压住地图面板"这类纯布局回归。
            // 右上角那两块是 flex 竖排的，地图面板一展开就变高，缩略图必须还在屏内。
            var mp = document.getElementById('minimap');
            if (mp) {
              var bb = mp.getBoundingClientRect();
              r.box = [Math.round(bb.left), Math.round(bb.top), Math.round(bb.width), Math.round(bb.height)];
              var tr2 = document.getElementById('topright');
              r.overlapsPanel = tr2 ? (function () {
                var tb = tr2.getBoundingClientRect();
                return !(bb.top >= tb.bottom - 0.5 || bb.bottom <= tb.top + 0.5 ||
                         bb.left >= tb.right - 0.5 || bb.right <= tb.left + 0.5);
              })() : false;
              r.inViewport = bb.left >= 0 && bb.top >= 0 &&
                bb.right <= window.innerWidth + 0.5 && bb.bottom <= window.innerHeight + 0.5;
              r.viewport = [window.innerWidth, window.innerHeight];
              r.rightGap = Math.round(window.innerWidth - bb.right);   // 离右边缘的距离（应 == 14）
            }
            // 主角标记位置：走等距投影（与底图/画面同一套）
            var pmark = mmToPx(player.mx + 0.5, player.my + 0.5);
            r.markPx = [Math.round(pmark.x), Math.round(pmark.y)];
            r.markInCanvas = pmark.x >= 0 && pmark.x < MM.cv.width && pmark.y >= 0 && pmark.y < MM.cv.height;
            // 等距断言：画布宽高比应约等于 1（菱形图对称），且明显不是旧版的 w:h
            r.isoRatio = +((MM.cv.width / MM.cv.height)).toFixed(2);
            r.proj = MM.proj ? { hw: MM.proj.hw, hh: MM.proj.hh, ox: Math.round(MM.proj.ox), oy: Math.round(MM.proj.oy) } : null;
            // 底图像素真的画上去了吗（别是空画布）：抽样统计非透明像素
            var im = MM.cx.getImageData(0, 0, MM.cv.width, MM.cv.height).data;
            var solidPx = 0;
            for (var i = 3; i < im.length; i += 4) if (im[i] > 200) solidPx++;
            r.solidPx = solidPx;
            // 折叠 → 展开
            mmFold(true); r.foldedAfter = MM.folded;
            mmFold(false); r.unfoldedAfter = MM.folded;
            // 点缩略图走过去：挑一格 3~6 步外的可走格，换算成画布像素点下去
            var sx2 = Math.round(player.mx), sy2 = Math.round(player.my), tgt = null;
            for (var rad = 3; rad <= 8 && !tgt; rad++) {
              for (var dy = -rad; dy <= rad && !tgt; dy++) {
                for (var dx = -rad; dx <= rad && !tgt; dx++) {
                  if (Math.max(Math.abs(dx), Math.abs(dy)) !== rad) continue;
                  var cx2 = sx2 + dx, cy2 = sy2 + dy;
                  if (walkable(cx2, cy2)) tgt = [cx2, cy2];
                }
              }
            }
            if (tgt) {
              var rect = MM.cv.getBoundingClientRect();
              r.clickTarget = tgt[0] + ',' + tgt[1];
              // 目标格 → 缩略图位图像素 → CSS 像素（画布 CSS 盒与位图等比）
              var tp = mmToPx(tgt[0] + 0.5, tgt[1] + 0.5);
              r.clickAccepted = mmClick(rect.left + tp.x / MM.cv.width * rect.width,
                                        rect.top + tp.y / MM.cv.height * rect.height);
              sim(3.0);
              r.clickMoved = Math.abs(player.mx - sx2) > 0.5 || Math.abs(player.my - sy2) > 0.5;
              r.clickEnd = Math.round(player.mx) + ',' + Math.round(player.my);
            }
            var pb = document.getElementById('probe');
            if (!pb) {
              pb = document.createElement('div'); pb.id = 'probe';
              pb.style.display = 'none'; document.body.appendChild(pb);
            }
            pb.textContent = JSON.stringify(r);
          }, 60);
        }
        if (at === 'worldmap') {
          // ?autotest=worldmap —— 世界地图总览（分组节点浮层）验收：
          // 节点数 = 地图数、按 region 分组、打开后浮层显示且节点渲染、点节点即传送并自动关闭、
          // Tab 键能开/关（桌面入口）。首屏不画缩略图，打开时才画（不拖首屏）。
          setTimeout(function () {
            var r = { map: CUR.id, nodes: MAPS.length };
            var g = {}; MAPS.forEach(function (m) { g[mapRegion(m)] = 1; });
            r.regions = Object.keys(g).length;
            var wm = document.getElementById('worldmap');
            var scroll = document.getElementById('worldScroll');
            r.scrollExists = !!scroll && scroll.childElementCount > 0;
            // 打开
            openWorld();
            r.opened = worldOpen === true && !!wm && wm.classList.contains('show');
            r.shownNodes = document.querySelectorAll('#worldmap .node').length;
            r.thumbCanvases = document.querySelectorAll('#worldmap canvas[data-thumb]').length;
            r.thumbsDrawn = (function () {
              var n = 0, cs = document.querySelectorAll('#worldmap canvas[data-thumb]');
              for (var i = 0; i < cs.length; i++) {
                var d = cs[i].getContext('2d').getImageData(0, 0, cs[i].width, cs[i].height).data;
                var any = 0; for (var j = 3; j < d.length; j += 4) any += d[j];
                if (any > 0) n++;
              }
              return n;
            })();
            // 点一个「非当前」节点 -> 应传送 + 关闭
            var targetId = null;
            document.querySelectorAll('#worldmap .node').forEach(function (nd) {
              if (!targetId && nd.dataset.id !== CUR.id) targetId = nd.dataset.id;
            });
            r.clickTarget = targetId;
            if (targetId) {
              var node = document.querySelector('#worldmap .node[data-id="' + targetId + '"]');
              node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
              sim(0.2);
              r.afterMap = CUR.id;
              r.teleported = CUR.id === targetId;
              r.closedAfterClick = worldOpen === false && !!wm && !wm.classList.contains('show');
            }
            // Tab 键开关（桌面入口）
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
            r.tabOpens = worldOpen === true;
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
            r.tabCloses = worldOpen === false;
            var pb = document.getElementById('probe');
            if (!pb) { pb = document.createElement('div'); pb.id = 'probe'; pb.style.display = 'none'; document.body.appendChild(pb); }
            pb.textContent = JSON.stringify(r);
          }, 60);
        }
        if (at === 'train') {
          // ?map=qingxuan&autotest=train —— 人物调试场自测：
          // 断言训练靶已生成、攻击A/重击B 都能造成伤害、训练靶打不死、六个动作能逐个切换
          setTimeout(function () {
            var r = { map: CUR.id, foes: foes.length, dummy: 0 };
            for (var i = 0; i < foes.length; i++) if (foes[i].def_.dummy) r.dummy++;
            var f0 = foes[0];
            if (f0) {
              player.mx = f0.x; player.my = f0.y; player.tx = f0.x; player.ty = f0.y;
              player.actHold = 0; player.attackCd = 0; player.atkBCd = 0; player.dead = false;
              var h0 = f0.hp;
              attackNearest(); sim(0.1);
              r.dmgA = h0 - f0.hp;
              var h1 = f0.hp;
              player.atkBCd = 0;
              powerAttack(); sim(0.1);
              r.dmgB = h1 - f0.hp;
              r.targetAlive = f0.alive;      // 训练靶必须打不死
              r.hpRestored = f0.hp === f0.maxhp || f0.hp > 0;
            }
            var seq = [];
            ['idle', 'walk', 'run', 'atkA', 'atkB', 'dead'].forEach(function (a) {
              playAct(a); sim(0.02);
              seq.push(a + '=' + player.act);
            });
            r.acts = seq.join(' ');
            r.actBtns = document.querySelectorAll('#actBtns button').length;
            r.heroBtns = document.querySelectorAll('#heroBtns button').length;
            r.hero = PLAYER_SRC;
            var pb = document.getElementById('probe');
            if (!pb) { pb = document.createElement('div'); pb.id = 'probe'; pb.style.display = 'none'; document.body.appendChild(pb); }
            pb.textContent = JSON.stringify(r);
          }, 60);
        }
        if (at === 'bestiary') {
          // ?map=lingquan&autotest=bestiary —— 灵泉灵瀑怪物自测：
          // 断言三族怪物已刷出、每只都有 idle/walk/atk/dead 帧、动作能切换且帧号真的在走、
          // 受击切 hurt、击杀后走倒地再消失再复活、侧视素材朝左会翻转。
          setTimeout(function () {
            var r = { map: CUR.id, total: foes.length, fam: {}, acts: {}, err: [] };
            foes.forEach(function (f) {
              var fam = f.key.split('_')[0];
              r.fam[fam] = (r.fam[fam] || 0) + 1;
            });
            var dbg = window.ISLES.beastDebug();
            r.animKeys = dbg.length;
            var byKey = {};
            foes.forEach(function (f) { byKey[f.key] = f; });
            var bad = [];
            dbg.forEach(function (d) {
              ['idle', 'walk', 'atk', 'dead'].forEach(function (a) {
                if (!d.acts[a]) bad.push(d.key + ':' + a);
              });
              r.drawSizes = r.drawSizes || {};
              r.drawSizes[d.key] = { src: d.draw.idle.src, out: d.draw.idle.out, ax: +(d.ax || 0).toFixed(3) };
            });
            if (bad.length) r.err.push('缺动作 ' + bad.join(','));
            // 动作切换：循环动作由「追人」驱动，所以要把玩家放进仇恨圈里看它真的走起来
            var f0 = foes[0];
            var seen = [];
            ['idle', 'atk', 'hurt', 'dead'].forEach(function (a) {
              window.ISLES.setFoeAnim(0, a);
              for (var i = 0; i < 6; i++) window.ISLES.tick(1 / 60);
              seen.push(a + '=' + f0.anim);
            });
            // 站远处（脱离仇恨）应回 idle；进仇恨圈应切 walk/run
            f0.animHold = 0; f0.anim = 'idle';
            player.mx = f0.x + 12; player.my = f0.y;
            sim(1.0);
            seen.push('far=' + f0.anim);
            player.mx = f0.x + 4; player.my = f0.y;
            for (var i2 = 0; i2 < 30; i2++) window.ISLES.tick(1 / 60);
            seen.push('near=' + f0.anim + '/' + (f0.animHold > 0 ? 'hold' : 'free'));
            r.acts = seen.join(' ');
            r.chaseSpeed = +f0.def_.mv.toFixed(1);
            r.runThreshold = BEAST_RUN_MV;
            // 跑得快的怪（mv ≥ 阈值）必须切到 run 动作 —— 挑一只快的单独验
            var fast = null;
            for (var fi = 0; fi < foes.length; fi++) if (foes[fi].def_.mv >= BEAST_RUN_MV) { fast = foes[fi]; break; }
            if (fast) {
              fast.animHold = 0;
              player.mx = fast.x + 4; player.my = fast.y;
              for (var i3 = 0; i3 < 30; i3++) window.ISLES.tick(1 / 60);
              r.fastFoe = fast.key + ' mv=' + fast.def_.mv + ' anim=' + fast.anim;
            }
            // 循环动作的帧号必须随时间变（否则是张死图）
            window.ISLES.setFoeAnim(0, 'walk');
            var fr = [];
            for (var t = 0; t < 6; t++) {
              window.ISLES.tick(1 / 12);
              fr.push(beastPiece(f0).sx);
            }
            r.walkFrames = fr.join(',');
            r.walkVaries = fr.some(function (v) { return v !== fr[0]; });
            r.animTAfter = +f0.animT.toFixed(2);
            // 朝向翻转
            f0.face = 'right'; var pr = beastPiece(f0);
            f0.face = 'left'; var pl = beastPiece(f0);
            r.flip = { right: !!pr.flip, left: !!pl.flip, sameRect: pr.sx === pl.sx && pr.w === pl.w };
            // 镜像判定不能写死「朝左就翻」—— 小僵尸原画朝左，翻不翻要跟素材原生朝向比。
            // 这里逐只核对：朝素材原生方向不翻，朝反方向才翻。
            var fl = {};
            ['knight_a', 'zombie_a', 'ronin_a'].forEach(function (kk) {
              var ff = byKey[kk]; if (!ff) return;
              ff.face = 'right'; var ar = beastPiece(ff);
              ff.face = 'left'; var al = beastPiece(ff);
              var src = ar.srcFace;
              fl[kk] = { srcFace: src, toRight: !!ar.flip, toLeft: !!al.flip,
                ok: (src === 'right') ? (!ar.flip && al.flip) : (ar.flip && !al.flip) };
            });
            r.flipBySrc = fl;
            // 自动攻击验收：把玩家放到「超出老怪 6.5 格仇恨圈、但在新怪 aggro 圈内」的位置，
            // 新怪必须自己扑过来并真的打掉玩家气血 —— 这就是「让它自动攻击角色」的口径。
            r.aggro = { global: AGGRO,
              knight: byKey.knight_a ? byKey.knight_a.def_.aggro : null,
              zombie: byKey.zombie_a ? byKey.zombie_a.def_.aggro : null };
            var zz = byKey.zombie_a;
            if (zz) {
              zz.hp = zz.maxhp; zz.alive = true; zz.dying = 0; zz.animHold = 0; zz.atkCd = 0;
              player.hp = player.maxhp; player.dead = false; player.invuln = 0;
              player.actHold = 0; player.act = 'idle';
              player.mx = player.tx = zz.x + 8; player.my = player.ty = zz.y;
              var d0 = Math.hypot(player.mx - zz.x, player.my - zz.y);
              sim(1.2);
              r.zombieChase = { dist0: +d0.toFixed(2), dist1: +Math.hypot(player.mx - zz.x, player.my - zz.y).toFixed(2), anim: zz.anim };
              var h0z = player.hp;
              window.ISLES.tick(1 / 60);
              // 判据只看「僵尸自己出手」：玩家掉血可能来自别的怪，用它当断言会误判成僵尸打到了。
              // 出手瞬间引擎会给它挂 1 秒攻击冷却，读这个最准。
              var attacked = false;
              for (var tz = 0; tz < 60 * 20 && !attacked; tz++) {
                window.ISLES.tick(1 / 60);
                if (zz.atkCd > 0.5) attacked = true;
              }
              r.zombieHit = attacked;
              r.zombieDmg = h0z - player.hp;
              r.zombieDistAtHit = +Math.hypot(player.mx - zz.x, player.my - zz.y).toFixed(2);
              r.zombieProbe = { zx: +zz.x.toFixed(2), zy: +zz.y.toFixed(2),
                px: +player.mx.toFixed(2), py: +player.my.toFixed(2),
                anim: zz.anim, alive: zz.alive, dying: +zz.dying.toFixed(2),
                hold: +zz.animHold.toFixed(2), atkCd: +zz.atkCd.toFixed(2),
                pdead: !!player.dead, invuln: +player.invuln.toFixed(2), radius: zz.def_.aggro || AGGRO };
              var bp = window.ISLES.bfsNext(zz.x, zz.y, player.mx, player.my, CUR);
              r.bfsDirect = bp ? [bp.x, bp.y] : null;
              r.zombieBpath = zz.bpath ? [zz.bpath.x, zz.bpath.y] : null;
              r.zombieRepath = +(zz.repath || 0).toFixed(2);
              r.zombieCell = [Math.round(zz.x), Math.round(zz.y), Math.round(player.mx), Math.round(player.my)];
              r.zombieDbg = JSON.parse(JSON.stringify(window.ISLES.chaseDbg()));
              player.hp = player.maxhp; player.invuln = 3; player.dead = false;
            }
            // 铠甲卫也要自己扑上来打人：它走得比僵尸慢（mv 1.8 vs 2.9）、出生点挨着建筑，
            // 所以给足 30 秒，并且落点从八个方向里挑第一个可站格，避免掷到实心格上白测一轮。
            var kz = byKey.knight_a;
            if (kz) {
              kz.hp = kz.maxhp; kz.alive = true; kz.dying = 0; kz.animHold = 0; kz.atkCd = 0;
              kz.bpath = null; kz.repath = 0;
              player.hp = player.maxhp; player.dead = false; player.invuln = 0;
              player.actHold = 0; player.act = 'idle';
              var spot = null;
              [[6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, 4], [4, -4], [-4, -4]].forEach(function (o) {
                if (spot) return;
                var cx = Math.round(kz.x + o[0]), cy = Math.round(kz.y + o[1]);
                if (walkable(cx, cy) && !isSolid(cx, cy)) spot = [cx, cy];
              });
              if (spot) {
                player.mx = player.tx = spot[0]; player.my = player.ty = spot[1];
                var kd0 = Math.hypot(player.mx - kz.x, player.my - kz.y);
                var kattacked = false;
                for (var tk = 0; tk < 60 * 30 && !kattacked; tk++) {
                  window.ISLES.tick(1 / 60);
                  if (kz.atkCd > 0.5) kattacked = true;   // 同僵尸口径：读它自己的出手冷却
                }
                r.knightChase = { dist0: +kd0.toFixed(2), dist1: +Math.hypot(player.mx - kz.x, player.my - kz.y).toFixed(2),
                  anim: kz.anim, at: spot };
                r.knightHit = kattacked;
                r.knightDmg = player.maxhp - player.hp;
                r.knightDbg = JSON.parse(JSON.stringify(window.ISLES.chaseDbg()));
              } else {
                r.knightChase = 'no-place';
              }
              player.hp = player.maxhp; player.invuln = 3; player.dead = false;
            }
            // 领地（leash）验收：把怪挪到离巢 > leash 的位置，玩家贴到它脸上，
            // 它必须「放弃追击、回巢」，而不是继续咬人 —— 这才是领地范围真正的意义。
            var lz = byKey.knight_a;
            if (lz) {
              lz.hp = lz.maxhp; lz.alive = true; lz.dying = 0; lz.animHold = 0; lz.atkCd = 0; lz.bpath = null; lz.repath = 0; lz.ret = 0;
              var lhx = lz.home.x, lhy = lz.home.y, L = lz.leash;
              var far = null;
              for (var la = 0; la < 360 && !far; la += 12) {
                var fx = lhx + Math.round(Math.cos(la * Math.PI / 180) * (L + 2));
                var fy = lhy + Math.round(Math.sin(la * Math.PI / 180) * (L + 2));
                if (walkable(fx, fy) && !isSolid(fx, fy)) far = [fx, fy];
              }
              if (far) {
                lz.x = far[0]; lz.y = far[1];
                player.hp = player.maxhp; player.dead = false; player.invuln = 0;
                player.mx = player.tx = far[0] + 1; player.my = player.ty = far[1];   // 贴脸
                var ld0 = Math.hypot(lz.x - lhx, lz.y - lhy);
                var latk = false;
                for (var tl = 0; tl < 60 * 20 && !latk; tl++) {
                  window.ISLES.tick(1 / 60);
                  if (lz.atkCd > 0.5) latk = true;   // 越界还咬人 = leash 没生效
                }
                var ld1 = Math.hypot(lz.x - lhx, lz.y - lhy);
                r.leash = { name: lz.name, leash: +L.toFixed(2),
                  distHome0: +ld0.toFixed(2), distHome1: +ld1.toFixed(2),
                  returnedHome: ld1 < ld0 - 0.5,            // 离巢距离变小 = 真在往回走
                  withinTerritory: ld1 <= L + 0.5,
                  attackedWhileLeashed: latk,               // 必须为 false
                  retCleared: lz.ret === 0,                 // 回到巢内应解除回巢锁定
                  atkCdFinal: +lz.atkCd.toFixed(2) };
                // 解锁后再验一次：玩家贴到巢边，它必须能重新被拉起并出手。
                // 这条是防「回一次家就永久哑火」——滞回标志写错很容易退化成这样，光看"不咬人"是发现不了的。
                player.invuln = 0; player.hp = player.maxhp; player.dead = false;
                player.mx = player.tx = lhx + 1.2; player.my = player.ty = lhy;
                var reatk = false;
                for (var tr = 0; tr < 60 * 14 && !reatk; tr++) {
                  player.hp = player.maxhp;   // 每帧回满：只验"会不会重新出手"，别被主角倒下打断
                  window.ISLES.tick(1 / 60);
                  if (lz.atkCd > 0.5) reatk = true;
                }
                r.leash.reengaged = reatk;
                player.invuln = 3; player.hp = player.maxhp; player.dead = false;
              } else {
                r.leash = 'no-far-spot';
              }
            } else {
              r.leash = 'no-knight';
            }
            // 击杀 -> 倒地 -> 消失 -> 复活
            player.mx = f0.x; player.my = f0.y; player.dead = false; player.invuln = 3;
            f0.animHold = 0;
            f0.hp = 1;
            attackNearest();
            r.killedDying = f0.dying > 0;
            sim(0.5);
            r.midDeadAnim = f0.anim === 'dead' && f0.alive === true;
            sim(1.0);
            r.afterDead = f0.alive === false;
            player.hp = player.maxhp;
            sim(20);                      // 复活窗口 10~16 秒，跑满 20 秒才谈得上"没复活"
            r.respawned = f0.alive === true && f0.dying === 0 && f0.hp === f0.maxhp;
            r.playerHp = player.hp;
            var pb = document.getElementById('probe');
            if (!pb) { pb = document.createElement('div'); pb.id = 'probe'; pb.style.display = 'none'; document.body.appendChild(pb); }
            pb.textContent = JSON.stringify(r);
          }, 60);
        }
        if (at === 'walk') {
          // 程序化按住「右」1.2 秒：读 #dbg 的 mx 有没有变大，即可确认键盘行走真的生效。
          // 加 &shift=1 则同时按住 Shift，用来对比奔跑是否真的更快。
          // 同步跑：headless 虚拟时钟下 setTimeout 未必触发，那会让 dbg 停在没走动的初始值。
          keys['d'] = 1;
          if (q.get('shift') === '1') keys['shift'] = 1;
          sim(1.2); keys['d'] = 0; keys['shift'] = 0; sim(0.1);
        }
        if (at && at.indexOf('click') === 0) {
          // 点击移动朝向自测： ?autotest=click&cdx=3&cdy=0 （目标格 = 当前格 + 偏移）
          // 断言：点击走路后 player.face 必须变成行进方向，而不是一直停在初始的 down
          var cdx = +(q.get('cdx') || 0), cdy = +(q.get('cdy') || 0);
          var csecs = +(q.get('secs') || 1.6);
          // 同步执行（同 portal / walk / fight）：headless 虚拟时钟下 setTimeout 未必触发，
          // 那会让用例读到「还没点击」的初始状态，白判一次失败。
          (function () {
            var fb = player.face;
            var ok = window.ISLES.clickCell(Math.round(player.mx) + cdx, Math.round(player.my) + cdy);
            sim(csecs);
            var pb = document.getElementById('probe');
            if (!pb) {
              pb = document.createElement('div'); pb.id = 'probe';
              pb.style.display = 'none'; document.body.appendChild(pb);
            }
            var rx = Math.round(player.mx), ry = Math.round(player.my);
            pb.textContent = JSON.stringify({
              faceBefore: fb, targetAccepted: ok, faceAfter: player.face,
              mx: +player.mx.toFixed(2), my: +player.my.toFixed(2),
              walk: +player.walk.toFixed(2),
              // 落点必须始终是合法可走格：点击寻路加了碰撞+绕路后，这条性质不能被破坏
              cellOk: walkable(rx, ry) && !isSolid(rx, ry),
              reached: Math.abs(player.mx - player.tx) < 0.02 && Math.abs(player.my - player.ty) < 0.02,
              pathLen: player.path ? player.path.length : 0
            });
          })();
        }
        if (at === 'fight') {
          // ?map=beilin&autotest=fight —— 贴脸反复攻击，验证击杀掉落与修为增长
          // 注意：headless 下 setTimeout 未必在 dump 前触发，故同步执行（boot 成功时 foes 已就绪）
          var f0 = foes[0];
          if (f0) { player.mx = f0.x; player.my = f0.y; player.tx = f0.x; player.ty = f0.y; }
          for (var i = 0; i < 120; i++) { window.ISLES.attackNearest(); window.ISLES.tick(0.5); }
          var alive = foes.filter(function (x) { return x.alive; }).length;
          var pb = document.getElementById('probe') || (function () { var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none'; document.body.appendChild(d); return d; })();
          pb.textContent = JSON.stringify({ alive: alive, total: foes.length, exp: player.exp, stones: player.stones, hp: Math.round(player.hp) });
        }
        if (at === 'gear') {
          /* ?map=<图>&autotest=gear —— 装备系统 + 存档 全链路验收（2026-09-18 加）。
           * 判据全部是「看得见的最终值」，不是"调用了哪个函数"：
           *   ① 图标：6 件套的 1× / 2× 帧都要能解析到（缺帧 = 格子空白，不报错）
           *   ② 掷骰：实际品质分布（配置只是期望）+ 数值不能出现 NaN / undefined
           *   ③ 穿戴：player.atk 必须由 recalcStats 得出 —— 旧 bug 是有人直接写 player.atk
           *   ④ 上限：行囊满了掉在地上的装备**留在地上**，不能被吞
           *   ⑤ 存/读：改坏状态再读回，逐项比对（直接拷-all 备份做对比，不靠"看起来对"）
           */
          var gp = document.getElementById('probe') || (function () { var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none'; document.body.appendChild(d); return d; })();
          var G = { icon: { ok: 0, miss: [] }, tier: {}, eliteTier: {}, slot: {}, bad: [],
                    equip: false, atk: 0, unequip: false, melt: 0, cap: false,
                    saveOk: false, restore: {}, keepMap: null };
          var i, k2;
          // ① 图标帧
          for (k2 in GEAR_BASES) if (GEAR_BASES.hasOwnProperty(k2)) {
            if (piece(k2) && piece(k2 + '_big')) G.icon.ok++; else G.icon.miss.push(k2);
          }
          // ② 掷骰 300 普通 + 300 精英
          function sweep(n, elite, sink) {
            for (var s = 0; s < n; s++) {
              var g = rollGear(elite);
              if (!GEAR_BASES[g.key] || !TIERS[g.t] || g.st === undefined) { G.bad.push('shape'); continue; }
              var v = (g.st.atk | 0) + (g.st.def | 0) + (g.st.maxhp | 0);
              if (isNaN(v)) G.bad.push('nan');
              if (!gearName(g) || gearValue(g) <= 0) G.bad.push('meta');
              sink[TIERS[g.t].cn] = (sink[TIERS[g.t].cn] || 0) + 1;
              G.slot[GEAR_BASES[g.key].slot] = (G.slot[GEAR_BASES[g.key].slot] || 0) + 1;
            }
          }
          sweep(300, false, G.tier);
          sweep(300, true, G.eliteTier);
          /* ③ 穿戴链路：造一件确定的装备（不靠随机），验证属性确实来自 recalcStats。
           * 增量一律对比 **realmBase()**（境界底子）而不是 BASE_STATS —— v54 起底子会随境界变，
           * 拿裸常量当基准，一旦境界不是炼气期（例如将来有人把用例排在 growth 后面）就会假失败。
           * ★ 断言必须写成花括号体 + return —— 项目历史上用 `=> a && b, {budget}`
           * 写过逗号运算符，结果断言恒真，测试自己失效了三天没人发现。 */
          gearInv = []; equipped = { weapon: null, armor: null, trinket: null };
          recalcStats();
          var atk0 = player.atk, maxhp0 = player.maxhp;
          var mk = { id: 90001, key: 'ge_jian', t: 2, st: { atk: 11, def: 3, maxhp: 40 } };
          gearInv.push(mk);
          var okEquip = equipGear(mk);
          G.equip = !!okEquip && equipped.weapon === mk;
          G.atk = player.atk - atk0;                       // 期望 +11
          G.def = player.def - (realmBase().def);
          G.maxhp = player.maxhp - maxhp0;                 // 期望 +40
          unequipGear('weapon');
          G.unequip = equipped.weapon === null && gearInv.indexOf(mk) >= 0 &&
            player.atk === atk0 && player.maxhp === maxhp0;
          // ④ 熔炼：应入账银两且离开行囊
          var st0 = player.stones;
          meltGear(mk);
          G.melt = player.stones - st0;
          /* ⑤ 上限：塞满行囊后在脚下撒一件地上的装备，玩家踩上去**不该**捡起来
           * （旧实现会把它捡起来再丢掉 —— 那样玩家的装备会凭空消失）。 */
          gearInv = [];
          for (i = 0; i < gearCap(); i++) gearInv.push({ id: 91000 + i, key: 'ge_pei', t: 0, st: { maxhp: 5 } });
          var fake = { id: 95555, key: 'ge_jian', t: 1, st: { atk: 3 } };
          lootDrops = [{ mx: player.mx, my: player.my, key: null, gear: fake, n: 1,
            life: 30, phase: 0, pop: 1, tossT: 0 }];
          player.dead = false;
          updateLoot(1 / 30);
          G.cap = lootDrops.length === 1 && gearInv.length === gearCap();
          /* ⑥ 存档读写：手动构造一份已知状态 → 存 → 把内存全搞乱 → 读 → 逐项比对 */
          gearInv = []; equipped = { weapon: null, armor: null, trinket: null };
          recalcStats();
          bag = {}; bag.jinchuang = 7; bag.yaodan = 3;
          player.stones = 4321; player.exp = 88; player.hp = 111;
          window.__kills = 12;
          gearInv.push({ id: 97001, key: 'ge_jia', t: 3, st: { def: 9 } });
          var wpn = { id: 97002, key: 'ge_ji', t: 1, st: { atk: 6 } };
          gearInv.push(wpn); equipGear(wpn);
          var wantMap = CUR.id, wantAtk = player.atk, wantMax = player.maxhp;
          G.saveOk = saveGame(true);
          // —— 把内存搞乱（模拟"刷新页面"）——
          bag = {}; gearInv = []; equipped = { weapon: null, armor: null, trinket: null };
          player.stones = 0; player.exp = 0; player.hp = 1; window.__kills = 0;
          recalcStats();
          var loaded = loadGame(true);
          G.loadOk = !!loaded;
          G.restore = {
            map: CUR.id === wantMap, bag: bag.jinchuang === 7 && bag.yaodan === 3,
            stones: player.stones === 4321, exp: player.exp === 88, kills: (window.__kills || 0) === 12,
            gear: gearInv.length === 1 && gearInv[0].id === 97001,
            eq: !!equipped.weapon && equipped.weapon.id === 97002,
            // ★ 最关键的一条：读档后属性必须重新由装备算出（不是读成裸值）
            atk: player.atk === wantAtk, maxhp: player.maxhp === wantMax
          };
          bagDirty = true; renderBag();
          /* ⑦ UI：装备区到底建没建出来。
           * 数据全对但屏幕空白是本项目反复出现的静默故障（历史五轮），所以这里也
           * **数真格子**：3 个装备槽必须都在，行囊格数 = gearInv 长度，且每个有货的
           * 格子必须真的挂着 <canvas class="ico">（bagIconEl 画不出 tile 时返回 null）。 */
          var eqNodes = document.querySelectorAll('#eqGrid .g');
          var ggNodes = document.querySelectorAll('#gearGrid .g');
          G.ui = {
            equipSlots: eqNodes.length,
            gearCells: ggNodes.length,
            gearExpected: gearInv.length,
            icons: document.querySelectorAll('#eqGrid canvas.ico, #gearGrid canvas.ico').length,
            tierClasses: Array.prototype.map.call(document.querySelectorAll('#gearGrid .g'),
              function (n) { return n.className; }),
            attr: (document.getElementById('bagAttr') || {}).textContent,
            saveInfo: (document.getElementById('saveInfo') || {}).textContent
          };
          /* ⑧ 可点性（2026-09-18：用户报「点穿戴没反应 / 存档按钮没用」）
           * 数据层与 addEventListener 都可能是好的，但只要祖先带 pointer-events:none，
           * 整块面板在浏览器眼里是透明的 —— DOM 在、样式在、监听器也在，就是点不到。
           * ★ 这种故障用 el.click() **永远测不出来**（JS 派发不经过命中测试），
           * 唯一诚实的问法是 document.elementFromPoint：由浏览器按真实渲染算命中。
           * 对照组的丹药格（历史上一直接得上）用来证明"这把尺子本身没坏"。 */
          bagToggle(true);
          function hitSelf(el) {
            if (!el) return 'no-el';
            try { el.scrollIntoView({ block: 'center' }); } catch (e) { }
            var r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) return 'no-box';
            var t = document.elementFromPoint(Math.round(r.left + r.width / 2),
              Math.round(r.top + r.height / 2));
            if (!t) return 'no-target';
            return (t === el || el.contains(t)) ? 'ok' : 'blocked:' + (t.id || t.className || t.tagName);
          }
          // 造一件待穿戴的剑，好在行囊里有个**非空**格子可点
          var clickMe = { id: 98001, key: 'ge_jian', t: 2, st: { atk: 11, def: 3, maxhp: 40 } };
          gearInv = [clickMe]; equipped = { weapon: null, armor: null, trinket: null };
          recalcStats(); bagDirty = true; lastGearSig = ''; renderBag();
          G.hit = {
            healCell: hitSelf(document.querySelector('#bagGrid .cell')),   // 对照组
            gearCell: hitSelf(document.querySelector('#gearGrid .g:not(.empty)')),
            eqCell: hitSelf(document.querySelector('#eqGrid .g')),
            svClear: hitSelf(document.getElementById('svClear')),
            /* 存档按钮从"全局三颗"改成了"每槽三颗"（v52）——  probes 的命中对象得跟着换，
             * 否则 headless 里 hit(id) 拿到 null，这条"按钮点得到"的防线就悄悄失效了。 */
            svSlotSave: hitSelf(document.querySelector('#slotList .svrow[data-slot="1"] [data-a="save"]')),
            svSlotDel: hitSelf(document.querySelector('#slotList .svrow[data-slot="1"] [data-a="del"]'))
          };
          /* 命中 OK 之后再补一条**真点击**（合成 MouseEvent 走完整冒泡），
           * 证明"点得到"且"监听器真的会做事"，而不是只有一条 CSS 摆在那儿。 */
          var real = document.querySelector('#gearGrid .g:not(.empty)');
          if (real && G.hit.gearCell === 'ok') {
            real.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            G.realClickEquip = !!equipped.weapon && equipped.weapon.id === 98001;
          } else G.realClickEquip = 'skip';
          var svRow = document.querySelector('#slotList .svrow[data-slot="1"]');
          var svb = svRow && svRow.querySelector('[data-a="save"]');
          if (svb && G.hit.svSlotSave === 'ok') {
            for (var si = 1; si <= SLOT_N; si++) clearSlot(si);
            svb.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            G.realClickSave = !!readSlot(1) && curSlot === 1;
          } else G.realClickSave = 'skip';
          bagToggle(false);
          gp.textContent = JSON.stringify(G);
        }
        if (at === 'growth') {
          /* ?map=<图>&autotest=growth —— 境界 / 炼化 / 重铸 验收（v54）。
           * 起因：用户一句「妖丹没什么用啊」—— 45% 掉落的东西捡起来后**没有任何出口**。
           *
           * 判据全部是「看得见的最终值」，并且**硬编码期望**，不拿被测函数自己算的结果当标准：
           *   ① 炼化：妖丹清零 / 修为按枚数入账 / 属性不该被炼化动到
           *   ② 突破：跨门槛后 realmIdx 升，且 player.atk = BASE_STATS + REALMS[n].st
           *      （★ 防的是"有人绕过 recalcStats 直接写 player.maxhp"——本项目头号翻车点）
           *   ③ 连跳：一次炼一大把要能跨多级，不是只升一级
           *   ④ 存档：境界**不进存档**，读回来必须由 exp 自己算回去（纯函数的好处要能验）
           *   ⑤ 重铸：玄铁令 -1；实例 id / 器型 / 品质不变；**基座数值一分不动**，只有词缀变
           *   ⑥ 玄铁令用光后重铸模式必须自动解除（否则点装备格会静默变成重铸，玩家以为没穿上）
           */
          var gp2 = document.getElementById('probe') || (function () {
            var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none';
            document.body.appendChild(d); return d;
          })();
          var C = { refine: {}, brk: {}, multi: {}, save: {}, rf: {}, arm: {}, ui: {} };
          // ── ① 炼化 ──
          player.exp = 0; player.realmIdx = 0; player.realmName = REALMS[0].cn;
          gearInv = []; equipped = { weapon: null, armor: null, trinket: null };
          recalcStats();
          bag = {}; bag.yaodan = 5;
          var atkB = player.atk, maxB = player.maxhp;
          var okRef = refineYaodan();
          C.refine = {
            ok: !!okRef, left: bag.yaodan | 0, gain: player.exp, want: 5 * YAODAN_CULT,
            // 5 枚 = 60 修为 < 150，还不该突破
            noBrk: player.realmIdx === 0,
            // 炼化只加修为，不该顺手改属性（属性唯一出口的守卫）
            statsIntact: player.atk === atkB && player.maxhp === maxB
          };
          // ── ② 突破（再 10 枚 → 累计 180 ≥ 筑基门槛 150）──
          bag.yaodan = 10;
          refineYaodan();
          C.brk = {
            idx: player.realmIdx, name: player.realmName === REALMS[1].cn,
            atk: player.atk === (BASE_STATS.atk + REALMS[1].st.atk),
            def: player.def === (BASE_STATS.def + REALMS[1].st.def),
            maxhp: player.maxhp === (BASE_STATS.maxhp + REALMS[1].st.maxhp),
            full: player.hp === player.maxhp,          // 突破回满气血
            grew: player.atk > atkB && player.maxhp > maxB
          };
          // ── ③ 连跳 ──
          var wasIdx = player.realmIdx;
          gainCult(3200);
          C.multi = {
            to: player.realmIdx, jumped: player.realmIdx - wasIdx,
            top: REALMS.length - 1,
            atk: player.atk === (BASE_STATS.atk + REALMS[REALMS.length - 1].st.atk)
          };
          // ── ④ 存档：境界不进档，读回要自己算出来 ──
          bag = {}; bag.jinchuang = 2;
          saveGame(true, 1);
          var wantExp = player.exp, wantIdx = player.realmIdx;
          player.exp = 0; player.realmIdx = 0; player.realmName = REALMS[0].cn; recalcStats();
          loadGame(true, 1);
          C.save = {
            exp: player.exp === wantExp, idx: player.realmIdx === wantIdx,
            name: player.realmName === REALMS[wantIdx].cn,
            atk: player.atk === (BASE_STATS.atk + REALMS[wantIdx].st.atk),
            // 读档不该"假突破"回满血（syncRealm 的重副作用要绕开）
            hpKept: player.hp <= player.maxhp && player.hp >= 1
          };
          clearSlot(1);        // 别把测试数据留给玩家的档位一
          // ── ⑤ 重铸 ──
          /* 造一件**正好等于基座**的仙品重刃（g.t 是 TIERS 的**下标**，3 = 仙品）。
           * 仙品词缀区间 [2,3]，重铸后必然多出词缀 → "重铸确实改了东西"是可判定的，
           * 不像"新旧随机对比"那样可能掷回原点、把断言变成掷硬币。 */
          var rg = { id: 99001, key: 'ge_ji', t: 3, st: { atk: 0, def: 0, maxhp: 0 } };
          var rgBase = gearBaseSt(GEAR_BASES.ge_ji, gearTier(rg));
          rg.st = { atk: rgBase.atk, def: rgBase.def, maxhp: rgBase.maxhp };
          gearInv = [rg]; equipped = { weapon: null, armor: null, trinket: null };
          recalcStats();
          bag = {}; bag.xuantie = 2;
          var rfBefore = gearStatsLine(rg);
          var okRf = reforgeGear(rg);
          C.rf = {
            ok: !!okRf, left: bag.xuantie | 0, id: rg.id === 99001, key: rg.key === 'ge_ji',
            t: rg.t === 3,
            // ★ 基座必须一分不动（只允许词缀在其上叠加）
            baseKept: rg.st.atk >= rgBase.atk && rg.st.def >= rgBase.def &&
              rg.st.maxhp >= rgBase.maxhp,
            // 词缀部分确实有正增量（宝品至少一条）
            hasAffix: (rg.st.atk - rgBase.atk) + (rg.st.def - rgBase.def) +
              (rg.st.maxhp - rgBase.maxhp) > 0,
            label: rfBefore + ' → ' + gearStatsLine(rg),
            // 已装备的也能重铸（这里没穿，顺带验证 recalcStats 没被无脑触发成错误值）
            atkOk: player.atk === realmBase().atk
          };
          equipGear(rg);                       // 穿上再重铸一次：验证"身上那件也能洗"
          var eqAtk = player.atk;
          reforgeGear(rg);
          C.rf.worn = equipped.weapon === rg && player.atk === realmBase().atk + (rg.st.atk | 0);
          C.rf.wornChanged = !!equipped.weapon;
          // ── ⑥ 玄铁令用光：只剩 1 枚时重铸一次必须把它花光（v55 起没有"模式"要退出） ──
          bag.xuantie = 1;
          reforgeGear(rg);
          C.arm = { left: bag.xuantie | 0, wornStill: equipped.weapon === rg };
          // ── UI：材料格真的有手型（妖丹炼化 / 玄铁令提示用法都靠 .act） ──
          bag = {}; bag.yaodan = 2; bag.xuantie = 3;
          bagBuilt = false; buildBagUI();      // .act 由 renderBag 落类（重建后必须先 refresh）
          bagDirty = true; bagToggle(true); renderBag();
          var cellY = bagCells.yaodan, cellX = bagCells.xuantie;
          C.ui = {
            act: !!(cellY && cellY.classList.contains('act')),
            // 玄铁令格也必须是 .act（不然玩家不会想到去点它）
            actX: !!(cellX && cellX.classList.contains('act')),
            // cursor 是**最终计算值**（非法值会被浏览器丢弃，所以读它有诊断意义）
            cursor: cellY ? getComputedStyle(cellY).cursor : 'no-cell',
            cnt: cellY ? (cellY.querySelector('.n') || {}).textContent : '?'
          };
          // ── ⑦ 操作卡：玄铁令格点一下只提示用法，且**不该**改变任何状态 ──
          hintReforge();
          C.hint = { left: bag.xuantie | 0 };
          // 复位：别把测试状态留在玩家看得见的界面上（含"档位一被自测占用"）
          bag = {}; gearInv = [];
          equipped = { weapon: null, armor: null, trinket: null };
          setCurSlot(0);
          player.exp = 0; player.realmIdx = 0; player.realmName = REALMS[0].cn;
          recalcStats(); player.hp = player.maxhp;
          bagDirty = true; lastGearSig = ''; bagToggle(false);
          C.pass = !!(C.refine.ok && C.refine.left === 0 && C.refine.gain === C.refine.want &&
            C.refine.noBrk && C.refine.statsIntact &&
            C.brk.idx === 1 && C.brk.name && C.brk.atk && C.brk.def && C.brk.maxhp &&
            C.brk.full && C.brk.grew &&
            C.multi.to === C.multi.top && C.multi.jumped === 3 && C.multi.atk &&
            C.save.exp && C.save.idx && C.save.name && C.save.atk && C.save.hpKept &&
            C.rf.ok && C.rf.left === 1 && C.rf.id && C.rf.key && C.rf.t && C.rf.baseKept &&
            C.rf.hasAffix && C.rf.worn && C.rf.wornChanged &&
            C.arm.left === 0 && C.arm.wornStill &&
            C.ui.act && C.ui.actX && C.ui.cursor === 'pointer' && C.hint.left === 3);
          gp2.textContent = JSON.stringify(C);
        }
        if (at === 'card') {
          /* ?map=<图>&autotest=card —— 装备操作卡（v55）
           * 用户原话：「装备长按熔炼能不能改成点击，有装备/使用或熔炼或者丢弃什么的」。
           * 判据只看**看得见的东西 + 真的发生的事**：
           *   ① 点格子后卡片真的出现（不是"调用了 openGearCard"）
           *   ② 卡片上的名字/属性来自真实数据（不是模板占位）
           *   ③ 按钮集合随状态变：行囊 = 装备+熔炼+丢弃，已穿 = 只有卸下（**没有**熔炼/丢弃）
           *   ④ 「取消」必须零副作用；「熔炼」必须真加钱、真离开行囊
           *   ⑤ 没有玄铁令时不出现「重铸」按钮（摆一个点了只弹提示的按钮更像 bug）
           *   ⑥ 「丢弃」必须过确认框，且取消后这件还在
           * 反向对照：删掉 makeGearCell 里的 click 监听 → open:false、pass:false。
           * ⚠ 命中判据用 elementFromPoint —— `el.click()` 不经过命中测试，
           *   本项目历史上靠它把"pointer-events 继承导致点不到"整类故障放过去过（v50）。 */
          var pc = document.getElementById('probe') || (function () {
            var d = document.createElement('div'); d.id = 'probe';
            d.style.display = 'none'; document.body.appendChild(d); return d;
          })();
          var K = { btns: [] };
          var btnActs = function () {
            var out = [], list = document.querySelectorAll('#gmBtns button');
            for (var i = 0; i < list.length; i++) out.push(list[i].getAttribute('data-a'));
            return out.join(',');
          };
          var clickCell = function (sel) {
            var c = document.querySelector(sel);
            if (!c) return 'no-cell';
            var r = c.getBoundingClientRect();
            var hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            var okHit = !!hit && (hit === c || c.contains(hit));
            c.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return okHit ? 'ok' : ('miss:' + (hit ? (hit.className || hit.tagName) : 'null'));
          };
          var clickCard = function (a) {
            var b = document.querySelector('#gmBtns button[data-a="' + a + '"]');
            if (!b) return false;
            b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return true;
          };
          // 造一件确定的行囊装备（不靠随机），让 title / 属性 / 熔炼价都可逐字比对
          var g1 = { id: 92001, key: 'ge_jia', t: 2, st: { atk: 0, def: 0, maxhp: 0 } };
          var bb1 = gearBaseSt(GEAR_BASES.ge_jia, gearTier(g1));
          g1.st = { atk: bb1.atk, def: bb1.def, maxhp: bb1.maxhp };
          gearInv = [g1]; equipped = { weapon: null, armor: null, trinket: null };
          bag = {}; bag.xuantie = 1;                     // 有令 → 应该多出「重铸」
          recalcStats(); bagBuilt = false; buildBagUI(); bagToggle(true); renderBag();
          // ── ①②③ 行囊装备：卡片出现 + 内容真实 + 按钮集合 ──
          K.hit = clickCell('#gearGrid .g');
          K.open = cardOpen();
          var elT = document.getElementById('gmTitle'), elS = document.getElementById('gmStats');
          K.title = elT ? elT.textContent : '';
          K.nameOk = K.title === gearName(g1);
          K.statsOk = !!elS && elS.textContent.indexOf(gearStatsLine(g1, '\n')) === 0;
          K.bagBtns = btnActs();
          K.bagOk = K.bagBtns === 'equip,melt,dump,reforge,close';
          // ── ④ 取消：必须零副作用 ──
          var st0 = player.stones, n0 = gearInv.length;
          clickCard('close');
          K.cancelClean = !cardOpen() && player.stones === st0 && gearInv.length === n0;
          // ── ⑥ 丢弃：必须弹确认框，取消后这件还在（纯亏的动作要过门槛） ──
          clickCell('#gearGrid .g'); clickCard('dump');
          K.dumpAsks = confirmOpen();
          var cfNoEl = document.getElementById('cfNo');
          if (cfNoEl) cfNoEl.click();
          K.dumpCancel = !confirmOpen() && gearInv.length === 1;
          // ── ④ 熔炼：真的加钱 + 真的离开行囊 ──
          var want = gearValue(g1);
          clickCell('#gearGrid .g'); clickCard('melt');
          K.meltGain = player.stones - st0;
          K.meltWant = want;
          K.meltGone = gearInv.length === 0 && !cardOpen();
          // ── ⑤ 没有玄铁令：不该出现「重铸」按钮 ──
          var g2 = { id: 92002, key: 'ge_jian', t: 1, st: { atk: 6 } };
          gearInv = [g2]; bag = {};
          bagDirty = true; renderBag();
          clickCell('#gearGrid .g');
          K.noStoneBtns = btnActs();
          K.noStoneOk = K.noStoneBtns === 'equip,melt,dump,close';
          clickCard('close');
          // ── ③ 穿上后再点：只该有「卸下」（已装备**不给**熔炼/丢弃） ──
          equipGear(g2);
          bagDirty = true; renderBag();
          clickCell('#eqGrid .g');
          K.wornBtns = btnActs();
          K.wornOk = K.wornBtns === 'unequip,close';
          K.wornTitle = (document.getElementById('gmTitle') || {}).textContent || '';
          clickCard('unequip');
          K.unequipOk = equipped.weapon === null && gearInv.length === 1 && !cardOpen();
          // 复位：别把测试状态留在玩家看得见的界面上
          bag = {}; gearInv = [];
          equipped = { weapon: null, armor: null, trinket: null };
          recalcStats(); player.hp = player.maxhp;
          bagDirty = true; lastGearSig = ''; bagToggle(false);
          K.pass = !!(K.hit === 'ok' && K.open && K.nameOk && K.statsOk && K.bagOk &&
            K.cancelClean && K.dumpAsks && K.dumpCancel &&
            K.meltGain === K.meltWant && K.meltGain > 0 && K.meltGone &&
            K.noStoneOk && K.wornOk && K.unequipOk);
          pc.textContent = JSON.stringify(K);
        }
        if (at === 'shop') {
          /* ?map=<图>&autotest=shop —— 坊市（v56）
           * 用户原话：「是不是应该出一个商店系统，让银两可以用」。
           * 判据只认"看得见的东西 + 真的发生的事"，另加一条**经济硬约束**：
           *   ① 货架真的有 4 件、位数不重复、每件 key/品质/价格都合法（不是空壳）
           *   ② ★ **买入价 > 该品质的最高熔炼价**。这是防"买来立刻熔炼"套利的唯一防线，
           *      而且必须取**上界**比（六种器型 × 满词缀 × 逐属性堆满），不能只拿一件平均货比 ——
           *      平均货比得再顺，只要存在一件能套利的极端货，经济就是破的。
           *   ③ 买丹药：钱真的减（数额 = 标价）、背包真的多一个；钱不够则**一分不减、一个不给**
           *   ④ 买装备：钱减得正好 = 标价、货架真少一件、**到手的就是货架上那件**（对象同一性）
           *   ⑤ 行囊满：必须拒绝，且**钱一分不动**（专防"钱扣了、装备没进包"这种无声损失）
           *   ⑥ 买不起时按钮必须是 disabled（灰按钮本身就是"还差多少钱"的提示）
           *   ⑦ 点得到：elementFromPoint 在圆钮中心要命中它自己（v50 那类 pointer-events 故障）
           *   ⑧ 补货**按位补**：挖掉位 0 → 补回来的仍是位 0，且位数不重复
           *   ⑨ 开关商店零副作用；存档能带住现货（买走的不会因为"存→读"又回到货架）
           * v58 追加（⑩~⑮）：
           *   ⑩ **符箓真的改到属性**：判据量 player.atk（不是 buffT>0）——后者的病是
           *      "标了记却没接进 recalcStats"，面板纹丝不动而用例照样绿。
           *      同时守两条规矩：同款**不叠倍率**、倒地**必须清**。
           *   ⑪ 限量品先判上限再扣钱；额度要真挡得住（人为把额度用满再试，
           *      而不是"吃两枚跨过门槛"——那会顺带突破、额度被自动重置，用例永远绿）。
           *   ⑫ 一键回收只吃凡品，灵品必须留下，到账 = 逐件熔炼价之和。
           *   ⑬ 城镇门控：临时把当前图移出 TOWN_MAPS，shopToggle(true) 必须失败。
           *   ⑭ 三组商品 + 回收行真的渲染出来了（没摆出来的商品 = 白做）；买不起报"还差 N"。
           *   ⑮ Esc 分层关闭：关背包、**一次只关一层**，且 ⛔ **缩略图不归 Esc 管**。
           * 反向对照：把 buyStock 的"行囊满"守卫挪到扣钱之后 → ⑤ 必须变红；
           *           把 recalcStats 里符箓那两行删掉 → ⑩ 必须变红（buffT 照样有值）。
           * ⚠ 命中判据一律 elementFromPoint —— el.click() 不经过命中测试（本项目老坑）。
           * ⚠ 用例会写档位一，最后连 raw 一起还原，别吃掉玩家的档。 */
          var ps = document.getElementById('probe') || (function () {
            var d = document.createElement('div'); d.id = 'probe';
            d.style.display = 'none'; document.body.appendChild(d); return d;
          })();
          var S2 = {};
          var bakSlot1 = null;
          try { bakSlot1 = localStorage.getItem(slotKey(1)); } catch (e) { }
          // ── ① 货架：4 件、位不重复、字段合法 ──
          shopStock = []; restockShop();
          var sSeen = {}, sLegal = true, sx;
          for (sx = 0; sx < shopStock.length; sx++) {
            var stx = shopStock[sx];
            if (sSeen[stx.slot]) sLegal = false;
            sSeen[stx.slot] = 1;
            if (!GEAR_BASES[stx.g.key] || !TIERS[stx.g.t] || !(stx.price > 0)) sLegal = false;
          }
          S2.stock = shopStock.length;
          S2.stockLegal = sLegal;
          S2.stockSlots = Object.keys(sSeen).sort().join(',');
          // ── ② ★ 经济硬约束：每个品质的**最高**熔炼价都必须低于该品质售价 ──
          var worst = [0, 0, 0, 0], q, w, ab;
          for (q = 0; q < TIERS.length; q++) {
            var mq = TIERS[q], cap = mq.affix[1];      // 词缀条数取区间上限
            for (w = 0; w < AFFIX_POOL.length; w++) {  // 逐属性把词缀堆满（单属性极限最贵）
              var one = { atk: 0, def: 0, maxhp: 0 };
              one[AFFIX_POOL[w].k] = AFFIX_POOL[w].max * cap;
              for (ab = 0; ab < GEAR_BASE_KEYS.length; ab++) {
                var bk2 = GEAR_BASE_KEYS[ab];
                var bs2 = gearBaseSt(GEAR_BASES[bk2], mq);
                var st2 = { atk: bs2.atk + one.atk, def: bs2.def + one.def,
                            maxhp: bs2.maxhp + one.maxhp };
                if (st2.def < 0 && mq.t <= 1) st2.def = 0;
                var v2 = gearValue({ id: 0, key: bk2, t: q, st: st2 });
                if (v2 > worst[q]) worst[q] = v2;
              }
            }
          }
          S2.worstMelt = worst.join('/');
          S2.priceLine = SHOP_TIER_PRICE.join('/');
          S2.noArb = true;
          for (q = 0; q < 4; q++) if (!(SHOP_TIER_PRICE[q] > worst[q])) S2.noArb = false;
          // ── ⑦ 入口点得到吗（命中测试，不用 el.click 自欺） ──
          bag = {}; gearInv = [];
          equipped = { weapon: null, armor: null, trinket: null };
          player.stones = 99999;
          recalcStats(); bagBuilt = false; buildBagUI(); bagToggle(true);
          var sBtn = document.getElementById('shopBtn'), sHit = null;
          if (sBtn) {
            var rr = sBtn.getBoundingClientRect();
            sHit = document.elementFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2);
          }
          S2.hit = (sBtn && sHit && (sHit === sBtn || sBtn.contains(sHit)))
            ? 'ok' : ('miss:' + (sHit ? (sHit.className || sHit.tagName) : 'null'));
          S2.open = shopToggle(true) === true && shopOpen();
          // ── ③ 买丹药（够钱 / 不够钱） ──
          var pc0 = bag.jinchuang | 0, pm0 = player.stones;
          S2.buyPotion = buyPotion('jinchuang') === true;
          S2.potionPaid = pm0 - player.stones;
          S2.potionWant = SHOP_POTION_PRICE.jinchuang;
          S2.potionGot = (bag.jinchuang | 0) - pc0;
          player.stones = 3;
          var dc0 = bag.dahuan | 0;
          S2.poorReject = buyPotion('dahuan') === false && player.stones === 3;
          S2.poorNoGift = (bag.dahuan | 0) === dc0;
          // ── ⑥ 买不起 → 所有价格按钮必须 disabled ──
          player.stones = 0; renderShop();
          var bEls = document.querySelectorAll('#shop button.buy'), bAll = bEls.length > 0, bq;
          for (bq = 0; bq < bEls.length; bq++) if (!bEls[bq].disabled) bAll = false;
          /* v58：架上多了符箓/秘宝/耗材三组与「回收」一行，所以按钮总数 =
           * 丹药 + 新三组 + 回收行(1) + 现货装备。少算哪一项都会被这条断言抓出来。 */
          S2.poorDisabled = bAll && bEls.length ===
            SHOP_POTIONS.length + SHOP_GOODS.length + 1 + shopStock.length;
          player.stones = 99999; renderShop();
          // ── ④ 买装备：钱减得正好、货架少一件、到手的就是那件 ──
          var tgt = shopStock[0], inv0 = gearInv.length, gm0 = player.stones,
            sl0 = shopStock.length;
          S2.buyGear = buyStock(0) === true;
          S2.gearPaid = gm0 - player.stones;
          S2.gearWant = tgt.price;
          S2.gearGot = (gearInv.length - inv0 === 1) && gearInv[0] === tgt.g;
          S2.stockDown = shopStock.length === sl0 - 1;
          // ── ⑤ 行囊满：拒绝 + 钱一分不动 + 货还在架上 ──
          var keepInv = gearInv.slice(), full = [], fi;
          for (fi = 0; fi < gearCap(); fi++) {
            full.push({ id: 95000 + fi, key: 'ge_jian', t: 0, st: { atk: 5 } });
          }
          gearInv = full;
          var fm0 = player.stones, fsl = shopStock.length;
          S2.fullReject = buyStock(0) === false;
          S2.fullNoPay = player.stones === fm0;
          S2.fullNoTake = shopStock.length === fsl;
          gearInv = keepInv;
          // ── ⑧ 补货按位补（挖掉位 0 后补回来的仍是位 0，且位数不重复） ──
          shopStock = shopStock.filter(function (s) { return s.slot !== 0; });
          restockShop();
          var sSeen2 = {}, sDup = false;
          for (sx = 0; sx < shopStock.length; sx++) {
            if (sSeen2[shopStock[sx].slot]) sDup = true;
            sSeen2[shopStock[sx].slot] = 1;
          }
          S2.refill = shopStock.length === SHOP_STOCK_MAX && !!sSeen2[0] && !sDup;
          // ── ⑨ 开关零副作用 + 存档带住现货 ──
          var tm = player.stones, tinv = gearInv.length, tst = shopStock.length;
          shopToggle(false); shopToggle(true);
          S2.toggleClean = player.stones === tm && gearInv.length === tinv &&
            shopStock.length === tst;
          var ids0 = shopStock.map(function (s) { return s.g.id; }).join(',');
          saveGame(true, 1);
          applySave(readSlot(1));
          S2.saveKeeps = shopStock.map(function (s) { return s.g.id; }).join(',') === ids0 &&
            shopStock.length === tst;
          /* ── ⑩ v58 符箓：买了 → 用了 → **属性真的变了** ──
           * 判据刻意不取 buffT>0（那只能证明"标了记"，证明不了"生效了"），
           * 而是直接量 player.atk —— 因为符箓的唯一落点是 recalcStats()，
           * 只要那里没接上，buffT 照样有值、面板却纹丝不动。 */
          bag = {}; gearInv = []; equipped = { weapon: null, armor: null, trinket: null };
          vaultLv = 0; cultBuyRealm = 0; cultBuyN = 0;
          clearBuffs(); recalcStats();
          player.stones = 99999;
          var atk0 = player.atk, wantAtk = Math.round(atk0 * BUFFS.ruijin.mul);
          S2.buyBuff = buyGoods('ruijin') === true;
          S2.buffPaid = 99999 - player.stones;
          S2.buffCount = bag.ruijin | 0;
          S2.useBuff = useBuff('ruijin') === true;
          S2.buffOn = buffT.ruijin > 0 && (bag.ruijin | 0) === 0;
          S2.buffAtk = player.atk;
          S2.buffAtkWant = wantAtk;
          S2.buffCalc = player.atk === wantAtk && player.atk > atk0;
          /* ★ 规矩①：同款再嗑 = 只刷新时长，**倍率绝不叠**（否则嗑五张就是 +125%） */
          buyGoods('ruijin'); useBuff('ruijin');
          S2.buffNoStack = player.atk === wantAtk;
          /* 计时到期：推到只剩 0.01 秒，走一步 tick，属性必须回落 */
          buffT.ruijin = 0.01; tickBuffs(0.5);
          S2.buffExpire = buffT.ruijin === 0 && player.atk === atk0;
          /* 规矩②：倒地清除 */
          buyGoods('ruijin'); useBuff('ruijin');
          S2.buffCleared = clearBuffs() === true && buffT.ruijin === 0 && player.atk === atk0;
          /* ── ⑪ v58 秘宝：限量品**先判上限、再扣钱**（钱必须一分不动）── */
          player.stones = 99999;
          var vCap0 = gearCap();
          buyGoods('yuxia'); useVault();
          buyGoods('yuxia'); useVault();
          S2.vaultCap = (vaultLv | 0) === VAULT_MAX && gearCap() === vCap0 + VAULT_STEP * VAULT_MAX;
          var vm0 = player.stones, vb0 = bag.yuxia | 0;
          S2.vaultReject = buyGoods('yuxia') === false && player.stones === vm0 && (bag.yuxia | 0) === vb0;
          /* 凝元丹：每重境界只让服 SHOP_CULT_MAX 枚。**刻意人为把额度用满**再试，
           * 而不是靠"吃两枚跨过门槛"—— 那会顺带触发突破、把额度自动重置，
           * 于是用例永远绿而额度从来没被验过。
           * ⚠ cultBuyRealm 必须**在调用前**对齐到当前 realmIdx：上一句服用已经
           *   把修为推过 150（筑基门槛），境界变了、额度合法清零 —— 不对齐就会
           *   误判成"守卫生效"失败（第一版就是这么红的）。 */
          var e0 = player.exp;
          cultBuyRealm = player.realmIdx; cultBuyN = 0; bag.ningyuan = 1;
          S2.cultGain = useNingyuan() === true && (player.exp - e0) === NINGYUAN_CULT && cultBuyN === 1;
          cultBuyRealm = player.realmIdx; cultBuyN = SHOP_CULT_MAX; bag.ningyuan = 1;
          var e1 = player.exp;
          S2.cultReject = useNingyuan() === false && player.exp === e1 && (bag.ningyuan | 0) === 1;
          /* 反向：**突破后额度自动重置**（存的是"在哪一重境界服的"，不是累计枚数）——
           * 这条性质值得锁住，否则有人改成累计计数，额度就会永久锁死。 */
          cultBuyRealm = player.realmIdx - 1; cultBuyN = SHOP_CULT_MAX; bag.ningyuan = 1;
          S2.cultReset = useNingyuan() === true && cultBuyN === 1;
          /* ── ⑫ v58 一键回收：只吃凡品，灵品必须留下，钱 = 件件熔炼价之和 ── */
          gearInv = [
            { id: 96001, key: 'ge_jian', t: 0, st: { atk: 5 } },
            { id: 96002, key: 'ge_pei', t: 0, st: { maxhp: 30 } },
            { id: 96003, key: 'ge_jia', t: 1, st: { def: 6 } }
          ];
          var rv0 = player.stones, rWant = gearValue(gearInv[0]) + gearValue(gearInv[1]);
          S2.recycle = recycleTrash() === true && gearInv.length === 1 && (gearInv[0].t | 0) === 1 &&
            (player.stones - rv0) === rWant;
          /* ── ⑬ v58 城镇门控：非城镇图必须**开不了**（这是"补货能刷"的根治手段）── */
          closeShop();
          S2.townHere = shopHere() === true;          // 用例跑在 ?map=qingxuan（城镇）
          var bakTown = TOWN_MAPS.qingxuan;
          delete TOWN_MAPS.qingxuan;                  // 临时把当前图变成"野外"
          S2.townGate = shopToggle(true) === false && shopOpen() === false;
          TOWN_MAPS.qingxuan = bakTown;               // 立刻还原，别污染后面的断言
          S2.townBack = shopToggle(true) === true && shopOpen() === true;
          /* ── ⑭ v58 分组与"还差多少"：商品没摆出来 = 白做 ── */
          player.stones = 99999; renderShop();
          S2.grpBuff = document.querySelectorAll('#shBuff .it').length;
          S2.grpRare = document.querySelectorAll('#shRare .it').length;
          S2.grpStuff = document.querySelectorAll('#shStuff .it').length;
          S2.grpRecycle = document.querySelectorAll('#shRecycle .it').length;
          S2.grpOk = S2.grpBuff === 3 && S2.grpRare === 2 && S2.grpStuff === 1 && S2.grpRecycle === 1;
          player.stones = 0; renderShop();
          var b0 = document.querySelector('#shGear button.buy');
          S2.diffText = !!(b0 && b0.disabled && /^还差 /.test(b0.textContent));
          /* ── ⑮ v58 Esc 分层关闭 + **缩略图不关** ──
           * 这条必须看 elementFromPoint 之外的东西：判的是"谁被关了、谁还在"。
           * ⛔ 缩略图（#minimap）不在 Esc 的管辖范围 —— 顺手把它收掉就是 bug。 */
          closeShop(); bagToggle(false); if (worldOpen) closeWorld();
          bagToggle(true);
          if (typeof mmFold === 'function') mmFold(false);
          var escLayer1 = escLayer();
          S2.escBag = escLayer1 === 'bag' && !bagOpen;
          toggleWorld();
          bagToggle(true);
          var escLayer2 = escLayer();
          S2.escOrder = escLayer2 === 'world' && !worldOpen && bagOpen;   // 一次只关一层，先关地图
          escLayer();
          if (typeof mmFold === 'function') mmFold(false);
          var escLayer3 = escLayer();
          S2.escMini = escLayer3 === '' && MM.folded === false;          // 缩略图必须毫发无损
          if (typeof mmFold === 'function') mmFold(document.body.classList.contains('touch'));
          bagToggle(false);
          /* 复位：档位一原样还回去，别吃掉玩家的档 */
          try {
            if (bakSlot1 === null) localStorage.removeItem(slotKey(1));
            else localStorage.setItem(slotKey(1), bakSlot1);
          } catch (e) { }
          shopToggle(false);
          bag = {}; gearInv = [];
          equipped = { weapon: null, armor: null, trinket: null };
          player.stones = 0;
          vaultLv = 0; cultBuyRealm = 0; cultBuyN = 0; clearBuffs();
          recalcStats(); player.hp = player.maxhp;
          bagDirty = true; lastGearSig = ''; bagToggle(false);
          shopStock = []; restockShop();
          S2.pass = !!(S2.stock === SHOP_STOCK_MAX && S2.stockLegal && S2.stockSlots === '0,1,2,3' &&
            S2.noArb && S2.hit === 'ok' && S2.open &&
            S2.buyPotion && S2.potionPaid === S2.potionWant && S2.potionGot === 1 &&
            S2.poorReject && S2.poorNoGift && S2.poorDisabled &&
            S2.buyGear && S2.gearPaid === S2.gearWant && S2.gearGot && S2.stockDown &&
            S2.fullReject && S2.fullNoPay && S2.fullNoTake &&
            S2.refill && S2.toggleClean && S2.saveKeeps &&
            /* v58 */
            S2.buyBuff && S2.buffPaid === 45 && S2.buffCount === 1 && S2.useBuff &&
            S2.buffOn && S2.buffCalc && S2.buffNoStack && S2.buffExpire && S2.buffCleared &&
            S2.vaultCap && S2.vaultReject && S2.cultGain && S2.cultReject && S2.cultReset &&
            S2.recycle && S2.townHere && S2.townGate && S2.townBack &&
            S2.grpOk && S2.diffText &&
            S2.escBag && S2.escOrder && S2.escMini);
          ps.textContent = JSON.stringify(S2);
        }
        if (at === 'saveload') {
          /* ?map=<图>&autotest=saveload —— 「小数坐标存档」验收（2026-09-18 用户报
           * 「加载失败 · Cannot read properties of undefined (reading '12.32')」）。
           * 根因：saveGame 写的是 +player.mx.toFixed(2)（小数），读档时 switchTo →
           * snapWalkable → walkable → cellChar → CUR.ground[20.32] → undefined[12.32] 抛异常，
           * 整个 boot 链断掉 = 有存档就永远进不去。
           * ★ 这条用例的存在意义：**旧档必崩**这件事只有"用小数坐标读一次档"才看得见，
           *   headless 里玩家永远站在整数格上（?x=&y= 也是整数），所以历史用例全绿也漏了它。 */
          var P = document.getElementById('probe') || (function () {
            var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none';
            document.body.appendChild(d); return d;
          })();
          var R = { ver: SAVE_VER };
          // ① 格表守卫：小数下标不再抛（旧代码在这里抛 "reading '12.32'"）
          R.cellChar = { frac: 'no-throw', nan: 'no-throw', int: 'no-throw' };
          try { R.cellChar.frac = String(cellChar(12.32, 20.32)); } catch (e) { R.cellChar.frac = 'THREW:' + e.message; }
          try { R.cellChar.nan = String(cellChar(NaN, NaN)); } catch (e) { R.cellChar.nan = 'THREW:' + e.message; }
          try { R.cellChar.int = String(cellChar(1, 1)); } catch (e) { R.cellChar.int = 'THREW:' + e.message; }
          R.cellChar.ok = R.cellChar.frac === ' ' && R.cellChar.nan === ' ' && R.cellChar.int !== 'THREW';
          // ② 吸附：小数落点必须变成**整数格**，且那格真的能站
          //   ★ 这里必须自己 try/catch：旧代码在这一步就抛异常，若让它冒出去，
          //     整条用例连 #probe 都不写 —— 现象只是「没有 probe」，和「用例没跑」
          //     长得一模一样（项目里为这个坑贴过好几次注释了）。包起来才能看见真因。
          try {
            var sp = snapWalkable(CUR, 12.32, 20.32);
            R.snap = { ok: true, x: sp.x, y: sp.y, integral: sp.x === (sp.x | 0) && sp.y === (sp.y | 0),
                       walkable: walkable(sp.x, sp.y) };
          } catch (e) { R.snap = { ok: false, err: e.message }; }
          // ③ 真·存档往返：写一份**小数坐标**档 → 清内存 → 读回（走 loadGame 全链路）
          var wantMap = CUR.id;
          player.mx = player.tx = 12.32; player.my = player.ty = 20.32;
          player.stones = 777;
          var saveOk = saveGame(true);
          var raw = readSave();
          R.written = { ok: !!saveOk, x: raw && raw.x, y: raw && raw.y };
          player.mx = player.tx = 0; player.my = player.ty = 0; player.stones = 0;
          var loaded;
          try { loaded = loadGame(true); R.loadErr = null; }
          catch (e) { loaded = false; R.loadErr = e.message; }
          R.load = {
            ok: !!loaded, map: CUR.id === wantMap, stones: player.stones === 777,
            x: player.mx, y: player.my,
            integral: player.mx === (player.mx | 0) && player.my === (player.my | 0),
            // 落点必须站得住（吸附成功），否则玩家会卡在水里/墙里
            stands: walkable(player.mx, player.my)
          };
          // ④ 坏坐标不能把 boot 打死：坐标置 NaN 再读一次
          try {
            var bad = JSON.parse(JSON.stringify(raw)); bad.x = 'oops'; bad.y = null;
            localStorage.setItem(slotKey(curSlot), JSON.stringify(bad));
            var o2 = readSave();
            R.badCoord = { x: o2 && o2.x, y: o2 && o2.y, sanitized: !!o2 && o2.x === null && o2.y === null };
            var sp2 = snapWalkable(CUR, o2.x, o2.y);
            R.badCoord.snapped = [sp2.x, sp2.y];
          } catch (e) { R.badCoord = { threw: e.message }; }
          R.pass = R.cellChar.ok && R.snap.ok && R.snap.integral && R.snap.walkable && R.written.ok &&
            R.load.ok && R.load.integral && R.load.stands && !R.loadErr && R.badCoord.sanitized;
          P.textContent = JSON.stringify(R);
        }
        if (at === 'slots') {
          /* ?autotest=slots —— 多档位存档（v52）验收。
           * 三条**只有多槽后才可能存在**的故障，看代码看不出来，必须跑：
           *   ① 三个槽互相串味（写 A 结果把 B 也改了 —— 典型是写死成一个键）
           *   ② 自动存档不跟当前槽走（先手动存槽二，15 秒后自动存却写回槽一）
           *   ③ 删档/重开不弹确认框（点了立刻生效 = 之前单一存档时代的行为残留）
           * 另加一条：确认框点**取消**必须真的什么都不做。 */
          var pbs = document.getElementById('probe') || (function () {
            var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none';
            document.body.appendChild(d); return d;
          })();
          var S = {};
          for (var qi = 1; qi <= SLOT_N; qi++) clearSlot(qi);
          lsDel(CUR_SLOT_KEY);
          // ① 三个槽各存一份不同的进度，互不干扰
          setCurSlot(1); player.stones = 111; var w1 = saveGame(true, 1);
          player.stones = 222; var w2 = saveGame(true, 2);
          player.stones = 333; var w3 = saveGame(true, 3);
          S.distinct = !!readSlot(1) && !!readSlot(2) && !!readSlot(3) &&
            readSlot(1).stones === 111 && readSlot(2).stones === 222 && readSlot(3).stones === 333;
          S.wrote = !!(w1 && w2 && w3);
          // ② 读档要能挑：读槽二后银两=222，且当前槽被认领成 2
          S.loadPick = (loadGame(true, 2) === true) && player.stones === 222 && curSlot === 2;
          // ③ 自动存档跟当前槽走（不传 slot 的那一路）
          player.stones = 999; saveGame(true);
          S.autosaveFollows = readSlot(2).stones === 999 && readSlot(1).stones === 111 && readSlot(3).stones === 333;
          // ④ 删档必须先弹确认框，且**取消 = 什么都不做**
          doSlotDel(1);
          S.delAsks = confirmOpen();
          document.getElementById('cfNo').click();
          S.delCancel = !confirmOpen() && !!readSlot(1) && readSlot(1).stones === 111;
          // ⑤ 确定 = 真删，且只删这一个
          doSlotDel(1);
          document.getElementById('cfYes').click();
          S.delOk = !readSlot(1) && !!readSlot(2) && !!readSlot(3);
          // ⑥ 重开也必须弹框；取消不得真的跳走（跳转用 setTimeout，这里只验"框弹了 + 取消后框关了"）
          document.getElementById('svClear').click();
          S.clearAsks = confirmOpen();
          document.getElementById('cfNo').click();
          S.clearCancel = !confirmOpen();
          // ⑦ UI：三行都在，当前槽有标记，空档的「读」「删」是禁用的
          updateSaveUI();
          S.ui = document.querySelectorAll('#slotList .svrow').length === 3 &&
            !!document.querySelector('#slotList .svrow.cur') &&
            document.querySelector('#slotList .svrow[data-slot="2"]').classList.contains('cur') &&
            document.querySelector('#slotList .svrow[data-slot="1"] [data-a="load"]').disabled === true;
          S.pass = !!(S.wrote && S.distinct && S.loadPick && S.autosaveFollows &&
            S.delAsks && S.delCancel && S.delOk && S.clearAsks && S.clearCancel && S.ui);
          pbs.textContent = JSON.stringify(S);
        }
        if (at === 'layout') {
          /* ?autotest=layout —— 左上角竖排元素不许重叠（2026-09-18 用户截图：
           * 「世界地图」圆钮压住了第一个药格）。
           * 为什么必须量化：根因是"上面板高度不是常数"（展开详情 / 目标血条 / 触屏药格更大 /
           * 开背包时药格被隐藏），扫代码根本看不出来，只能把两个元素的矩形求交。
           * ★ 折叠态与展开态**都要测**：只测一种必然漏掉另一种。
           * ★ 再补一条 elementFromPoint 命中：矩形不重叠 ≠ 点得到（本项目被
           *   pointer-events:none 继承坑过两次，命中测试是唯一诚实的问法）。 */
          var pbl = document.getElementById('probe') || (function () {
            var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none';
            document.body.appendChild(d); return d;
          })();
          var L = {};
          var over = function (a, b) {
            if (!a || !b) return -1;     // 元素缺失要报 -1：别让它悄悄等于 0（="不重叠"，假绿）
            var A = a.getBoundingClientRect(), B = b.getBoundingClientRect();
            var w = Math.min(A.right, B.right) - Math.max(A.left, B.left);
            var h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
            return (w > 0 && h > 0) ? Math.round(w) + 'x' + Math.round(h) : 0;
          };
          var hitAt = function (el) {
            if (!el) return 'no-el';
            var r = el.getBoundingClientRect();
            var e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (!e) return 'none';
            return (e === el || (e.closest && e.closest('#' + el.id))) ? 'ok'
              : 'blocked:' + (e.id || e.className || e.tagName);
          };
          var tlL = document.getElementById('topleft'), wbL = document.getElementById('worldBtn'),
            bgL = document.getElementById('bagBtn');
          var snapL = function () {
            return { tlWorld: over(tlL, wbL), tlBag: over(tlL, bgL), wbBag: over(wbL, bgL) };
          };
          L.tlb = getComputedStyle(document.documentElement).getPropertyValue('--tlb').trim();
          L.folded = snapL();
          tlL.classList.add('open'); syncLeftBtns();
          L.open = snapL();
          tlL.classList.remove('open'); syncLeftBtns();
          L.back = snapL();
          L.hit = { world: hitAt(wbL), bag: hitAt(bgL) };
          L.pass = L.folded.tlWorld === 0 && L.folded.tlBag === 0 && L.folded.wbBag === 0 &&
            L.open.tlWorld === 0 && L.open.tlBag === 0 && L.open.wbBag === 0 &&
            L.back.tlWorld === 0 && L.hit.world === 'ok' && L.hit.bag === 'ok';
          pbl.textContent = JSON.stringify(L);
        }
        if (at === 'loot') {
          // 为什么值得单独立一条：这四件事各自都能"看起来对"，但接在一起才暴露真问题 ——
          //   ① 掉落掷骰的**实际**命中率 vs 配置概率（rollLoot 是独立掷骰，可能全不中）
          //   ② 掉落物是否真的被 repath 到可走格（溅到墙里的图标玩家永远捡不到）
          //   ③ 走近后是否真的入包（距离判定用 PICK_R，差一点点就永远悬在那儿）
          //   ④ 服药是否真的回血、且**满血不消耗**、冷却期间不生效
          var pbold = document.getElementById('probe') || (function () { var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none'; document.body.appendChild(d); return d; })();
          var R = { defs: 0, healDefs: 0, iconOk: 0, iconMiss: [], rolls: 0, dropped: 0, byKey: {},
                    landed: 0, onWall: 0, picked: 0, bagAfter: {}, healOk: false, healFull: false,
                    healCdBlock: false, crafted: {} };
          // ★ 期望值一律由**数据表自己算出来**（v58）：原来 headless 里写死"背包 5 格 /
          //   6 种物品"，每加一件物品都要手改测试 —— 忘了改就会出现"测试红了，
          //   但游戏其实是对的"，然后有人顺手把断言改成新数字，等于测试没测任何东西。
          //   改成"页面上报期望值、测试拿去比"，加物品就只剩改数据表这一处。
          R.want = {
            defs: Object.keys(ITEMS).length,
            cells: BAG_ORDER.length,
            frames: Object.keys(ITEMS).length + Object.keys(GEAR_BASES).length,
            heal: BAG_ORDER.filter(function (k) {
              return ITEMS[k] && ITEMS[k].kind === 'heal';
            }).length
          };
          // 图集自检：三张表都要到位（任一缺失都会让图标静默变成空白格，不报错）
          R.atlas = {
            img: !!(ATLAS.items && ATLAS.items.img),
            rectKeys: ATLAS.items && ATLAS.items.rect ? Object.keys(ATLAS.items.rect).length : -1,
            bigKeys: ATLAS.items && ATLAS.items.big ? Object.keys(ATLAS.items.big).length : -1,
            defsKeys: ATLAS.items && ATLAS.items.defs ? Object.keys(ATLAS.items.defs).length : -1
          };
          // ① 物品表与图标：每个 ITEMS 条目都要能在图集里解析到帧（缺图 = 背包里是空白格）
          Object.keys(ITEMS).forEach(function (k) {
            R.defs++;
            if (ITEMS[k].kind === 'heal') R.healDefs++;
            if (piece(ITEMS[k].icon) && piece(ITEMS[k].icon + '_big')) R.iconOk++;
            else R.iconMiss.push(k);
          });
          // ② 掉落掷骰：跑 400 次统计实际命中分布（配置概率只是期望，实测才有意义）
          var f1 = foes[0];
          if (f1) {
            for (var q1 = 0; q1 < 400; q1++) {
              var got = rollLoot(f1);
              R.rolls++;
              if (got.length) R.dropped++;
              got.forEach(function (g) {
                // 装备条目是 {gear:实例}，没有 key/n —— 不分支的话这里会算出 NaN
                // （g.key === undefined 落到 byKey['undefined']，显示成 null 误导人）
                if (g.gear) { R.byGear = (R.byGear || 0) + 1; return; }
                R.byKey[g.key] = (R.byKey[g.key] || 0) + g.n;
              });
            }
            // ③ 落点：强制撒 200 次，检查每一件都落在可走格上（不该有图标嵌在墙/水里）
            lootDrops = [];
            for (var q2 = 0; q2 < 200; q2++) spawnLoot(f1, [{ key: 'yaodan', n: 1 }]);
            R.landed = lootDrops.length;
            for (var q3 = 0; q3 < lootDrops.length; q3++) {
              if (!couldStand(lootDrops[q3].mx, lootDrops[q3].my)) R.onWall++;
            }
          }
          // ④ 拾取：把玩家瞬移到第一件掉落物脚下，跑一帧看是否入包
          if (lootDrops.length) {
            var L0 = lootDrops[0];
            player.mx = L0.mx; player.my = L0.my; player.tx = L0.mx; player.ty = L0.my;
            player.path = null; player.dead = false;
            var before = lootDrops.length;
            window.ISLES.tick(1 / 30);
            R.picked = before - lootDrops.length;
            Object.keys(bag).forEach(function (k) { R.bagAfter[k] = bag[k]; });
          }
          // ⑤ 服药：先塞满三种药，低血 → 服 → 应回血且数量 -1；满血 → 应不消耗；冷却中 → 应不生效
          bag.jinchuang = bag.jinchuang || 0; bag.jinchuang += 5;
          bag.xiaohuan = bag.xiaohuan || 0; bag.xiaohuan += 5;
          bag.dahuan = bag.dahuan || 0; bag.dahuan += 5;
          healCd = 0; healFx = 0;
          player.hp = Math.round(player.maxhp * 0.2);
          var hpA = player.hp, nA = bag.jinchuang;
          R.healOk = useHeal('jinchuang') && player.hp > hpA && bag.jinchuang === nA - 1;
          R.crafted.jinchuangHeal = Math.round(player.hp - hpA);
          // 满血不消耗
          player.hp = player.maxhp; healCd = 0;
          var nB = bag.xiaohuan;
          useHeal('xiaohuan');
          R.healFull = (bag.xiaohuan === nB);
          // 冷却拦截：立刻再服（healCd 应为 0.6 刚被上一次设过值 —— 用满血那次不算，所以先造低血）
          player.hp = Math.round(player.maxhp * 0.3);
          healCd = HEAL_CD;                       // 手工置于冷却中
          var nC = bag.dahuan;
          useHeal('dahuan');
          R.healCdBlock = (bag.dahuan === nC && player.hp < player.maxhp * 0.5);
          // ⑥ 背包 UI：格子数 = BAG_ORDER 长度，且 heal 格带可点标记
          buildBagUI();
          R.crafted.cells = document.querySelectorAll('#bagGrid .cell').length;
          R.crafted.healUseCells = document.querySelectorAll('#bagGrid .cell.use').length;
          R.crafted.ghostImgs = document.querySelectorAll('#bagGrid .cell img').length;
          // ★★★ 图标可见性断言（2026-09-17 两轮教训合并后的**唯一**判据）
          //
          // 教训链：几何对 ≠ 图标可见。
          //   第 1 轮只断言"帧能解析到 + 计数对" → 图标全是空白的也过。
          //   第 2 轮改断言"帧在取景框内的可见区间 = [0,46]×[0,46]" → 全绿，用户还是看不到；
          //          因为当时用 CSS background 取帧，URL 是已被 revokeObjectURL 的 blob，
          //          浏览器二次取像素静默失败。inline style 字符串写得再规整也没用。
          // 所以现在只认一件事：**canvas 里真的画上了非透明像素**。
          //   ① 取每格 <canvas class="ico">，尺寸必须是 BAG_ICON×BAG_ICON（否则被 CSS 拉伸或没画）；
          //   ② getImageData 跑一遍，统计 alpha>0 的像素数 —— 必须占满帧的大半（图标有实心区域）；
          //   ③ 顺便确认没有任何 <img>（历史幽灵节点）。
          var CELL2 = BAG_ICON, geoMiss = [], geoCells = [];
          var boxes = document.querySelectorAll('#bagGrid .cell canvas.ico');
          for (var gi = 0; gi < boxes.length; gi++) {
            var bx = boxes[gi];
            if (bx.width !== CELL2 || bx.height !== CELL2) { geoMiss.push('size#' + gi + ':' + bx.width + 'x' + bx.height); continue; }
            var ink = 0, rows = 0;
            try {
              var dd = bx.getContext('2d').getImageData(0, 0, CELL2, CELL2).data;
              for (var pi = 3; pi < dd.length; pi += 4) if (dd[pi] > 8) ink++;
            } catch (e) { geoMiss.push('read#' + gi + ':' + e.name); continue; }
            var frac = ink / (CELL2 * CELL2);
            // 阈值取 0.10：图标是"边框+主体"的线面混合，最"瘦"的一瓶金创药实测 0.248，
            // 而真正的故障态（CSS 背景/URL 取不到像素）是 **0.000**。0.10 把二者分得很开。
            geoCells.push({ ink: +frac.toFixed(3), ok: frac > 0.10 });
            if (!(frac > 0.10)) geoMiss.push('blank#' + gi + ':' + frac.toFixed(3));
          }
          R.geo = { n: geoCells.length, miss: geoMiss, cells: geoCells };

          /* ★ 背包「有货 / 空格」是否真的在视觉上分得开（2026-09-17 用户第三次反馈：
           *   「拾取后背包图标还是灰的，没有的是灰的可以理解，有的必须能区别出来」）。
           * 上一轮我只是写了 .empty / .has 两条 CSS，从没验证过**浏览器算出来的样式**。
           * 这里读 computedStyle 的 filter 与 opacity —— 它是"最终生效值"，
           * 能抓到"选择器匹配不上 / 被更高优先级覆盖"这类静默失效。 */
          var bagStates = [];
          for (var bi = 0; bi < BAG_ORDER.length; bi++) {
            var bk = BAG_ORDER[bi], bc = bagCells[bk];
            if (!bc) continue;
            var cv2 = bc.querySelector('canvas.ico');
            var cs = cv2 ? getComputedStyle(cv2) : null;
            bagStates.push({
              k: bk, n: bag[bk] || 0,
              cls: (bc.className || '').replace('cell', '').trim(),
              has: bc.classList.contains('has'),
              filter: cs ? cs.filter : '(no canvas)',
              inlineFilter: cv2 ? (cv2.style.filter || '') : '',   // 行内兜底是否写上了
              op: cs ? cs.opacity : '-'
            });
          }
          R.bagStates = bagStates;
          // 图集本身解码是否正常（对比参考，不参与判据）
          R.atlasNatural = ATLAS.items.img ? (ATLAS.items.img.naturalWidth + 'x' + ATLAS.items.img.naturalHeight) : '-';
          /* ★ 图集**交叉判据**（v58）：图里每一个矩形都必须落在解码出来的图片内。
           * 写死尺寸（原来是 '782x198'）会随帧数变化立刻失效，而"红灯的理由"和
           * "图标真的坏了"长得一模一样 —— 很容易被顺手改成新数字糊过去，测试从此白设。
           * 越界才是真故障（越界 = 裁到隔壁帧或空白，且**全程不报错**），
           * 所以判据改成"所有帧都装得下"：OK 时返回真实尺寸，越界时返回 'overflow …'。 */
          R.atlasFit = (function () {
            var img = ATLAS.items && ATLAS.items.img;
            if (!img || !img.naturalWidth) return 'no-img';
            var mx = -1, my = -1;
            var scan = function (tbl) {
              Object.keys(tbl || {}).forEach(function (k) {
                var r = tbl[k];
                if (!r) return;
                mx = Math.max(mx, (r[0] | 0) + (r[2] | 0));
                my = Math.max(my, (r[1] | 0) + (r[3] | 0));
              });
            };
            scan(ATLAS.items.rect); scan(ATLAS.items.big);
            if (mx > img.naturalWidth || my > img.naturalHeight) return 'overflow ' + mx + 'x' + my;
            return img.naturalWidth + 'x' + img.naturalHeight;
          })();
          pbold.textContent = JSON.stringify(R);
        }
        if (at === 'ranged') {
          // ?map=beilin&autotest=ranged —— 远程怪验收：进仇恨圈后停手距离掷弹道，
          // 玩家站桩挨打（掉血>0）、怪不近身（最小距离保持在近战圈外）、弹道会打完清空
          var wr = null, bd2 = 1e9;
          for (var ri = 0; ri < foes.length; ri++) {
            var rf = foes[ri];
            if (!rf.def_.ranged || !rf.alive) continue;
            var rd2 = Math.hypot(rf.x - player.mx, rf.y - player.my);
            if (rd2 < bd2) { bd2 = rd2; wr = rf; }
          }
          var rres = { found: !!wr, shots: 0, hpLost: 0, minDist: 0, endProjs: 0 };
          var pb3 = document.getElementById('probe') || (function () { var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none'; document.body.appendChild(d); return d; })();
          if (wr) {
            player.mx = wr.x + 3; player.my = wr.y; player.tx = player.mx; player.ty = player.my;
            player.path = null; player.invuln = 0;
            var hp0 = player.hp, fire0 = projFired, dmin = 1e9;
            for (var rt = 0; rt < 600; rt++) {          // 20s@30fps：足够几轮射击
              window.ISLES.tick(1 / 30);
              if (!wr.alive) break;
              dmin = Math.min(dmin, Math.hypot(wr.x - player.mx, wr.y - player.my));
            }
            rres.shots = projFired - fire0;
            rres.hpLost = Math.round(hp0 - player.hp);
            rres.minDist = +dmin.toFixed(2);
            rres.endProjs = projectiles.length;
          }
          pb3.textContent = JSON.stringify(rres);
        }
        if (at === 'foesize') {
          // ?map=beilin&autotest=foesize —— 校验每只怪每个朝向/状态都能解析到帧，且绘制尺寸已归一化
          var rows = window.ISLES.foeDebug();
          var bad = rows.filter(function (r) { return r.w <= 0 || r.h <= 0; });
          var heights = {};
          rows.forEach(function (r) { heights[r.base] = r.drawH; });
          var pb2 = document.getElementById('probe') || (function () { var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none'; document.body.appendChild(d); return d; })();
          pb2.textContent = JSON.stringify({ frames: rows.length, bad: bad.length, drawnH: heights, sample: rows.slice(0, 4) });
        }
        if (at === 'down') {
          // ?map=beilin&autotest=down —— 验证气血耗尽只「原地击退」，不再瞬移回出生点
          var f0c = foes[0];
          if (f0c) { player.mx = f0c.x + 0.7; player.my = f0c.y; player.tx = player.mx; player.ty = player.my; }
          player.targetFoe = null; player.path = null; player.hp = 5; player.invuln = 0;
          var bx0 = player.mx, by0 = player.my;
          for (var kk = 0; kk < 60; kk++) window.ISLES.tick(0.5);
          var sp0 = (CUR && CUR.spawn) ? CUR.spawn : { x: 0, y: 0 };
          var pb3 = document.getElementById('probe') || (function () { var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none'; document.body.appendChild(d); return d; })();
          pb3.textContent = JSON.stringify({
            knockMoved: +Math.hypot(player.mx - bx0, player.my - by0).toFixed(2),
            distToSpawn: +Math.hypot(player.mx - sp0.x, player.my - sp0.y).toFixed(2),
            hp: Math.round(player.hp)
          });
        }
        if (at === 'combat') {
          // ?map=qingxuan&autotest=combat —— 验证本轮战斗手感改动真的生效：
          // ① 攻击动画能完整播完（旧版 0.45s 冷却 < 0.65s 动作，连按会把动画截断在第四帧）
          // ② 伤害不再恒定：±15% 浮动、会暴击、连击能叠加
          // ③ 背对目标砍不中（朝向扇形判定），且挥空会自动转身
          var pbc = document.getElementById('probe') || (function () { var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none'; document.body.appendChild(d); return d; })();
          var tg = foes[0];
          var hits = 0, kinds = {}, kindN = 0, minD = 0, maxD = 0;
          var actTPeak = 0, comboPeak = 0, critN = 0;
          if (tg) {
            player.path = null; player.targetFoe = null; player.dead = false; player.invuln = 99;
            for (var ci = 0; ci < 50; ci++) {
              player.mx = tg.x; player.my = tg.y + 1.0;    // 站在靶子下方，脸朝上正对它
              player.tx = player.mx; player.ty = player.my; player.face = 'up';
              player.attackCd = 0; player.actHold = 0; player.critT = 0;
              var h0c = tg.hp;
              attackNearest();
              var peak = 0, wasCrit = false;
              for (var cj = 0; cj < 90; cj++) {            // 把这一刀的动作逐帧播完
                window.ISLES.tick(1 / 60);
                if (player.actT > peak) peak = player.actT;
                if (player.critT > 0) wasCrit = true;
                if (player.actHold <= 0) break;
              }
              if (peak > actTPeak) actTPeak = peak;
              if (player.combo > comboPeak) comboPeak = player.combo;
              var dlt = h0c - tg.hp;
              if (dlt > 0) {
                hits++;
                if (!kinds[dlt]) { kinds[dlt] = 1; kindN++; }
                if (!minD || dlt < minD) minD = dlt;
                if (dlt > maxD) maxD = dlt;
                if (wasCrit) critN++;
              }
            }
          }
          var backDmg = -1, faceBack = '';
          if (tg) {
            player.mx = tg.x; player.my = tg.y - 1.0;      // 站在靶子上方、脸朝上 = 背对靶子
            player.tx = player.mx; player.ty = player.my;
            player.targetFoe = null; player.attackCd = 0; player.actHold = 0;
            player.face = 'up';
            var hb0 = tg.hp;
            attackNearest();
            backDmg = hb0 - tg.hp;                          // 必须为 0：背对砍不中
            faceBack = player.face;                         // 应变成 down：挥空自动转身
          }
          pbc.textContent = JSON.stringify({
            atkDur: ACT_DUR.atkA, atkCd: ATK_A_CD,
            actTPeak: +actTPeak.toFixed(3),
            animComplete: actTPeak >= ACT_DUR.atkA - 0.02,  // 动画播完 = 峰值达到动作时长
            hits: hits, dmgMin: minD, dmgMax: maxD, dmgKinds: kindN,
            crits: critN, comboPeak: comboPeak,
            backDmg: backDmg, faceAfterBack: faceBack
          });
        }
        if (at === 'autoatk') {
          /* ?map=<有怪图>&autotest=autoatk —— 「点怪 = 自动平A + 始终面向目标」（v57）。
           * 判据全是几何与最终状态，不数"调了哪个函数"：
           *   ① 点中的那一帧就锁定 + 转身（face 与 sideFace 同时到位，不能等下一帧）
           *   ② ★ 朝向：目标在屏幕左/右哪一侧由 sign(dx-dy) 决定（等距投影），
           *      而不是 sign(dx)。**故意先把 sideFace 设成反的**（模拟"刚从右边跑来"），
           *      点下去必须被掰正 —— 旧版就是保持这个值，画出来即「背对怪物攻击」。
           *   ③ 零输入下自己走过去（距离真的缩小）并自己出手（怪真的掉血）
           *   ④ 出手那一刻 sideFace 仍是朝它的（动作播放中不许被翻转）
           *   ⑤ 按方向键立刻接管：往 map +x 走就只动 x，不会被自动攻击拽向 +y 的怪
           *   ⑥ 怪跑出仇恨半径 → 停手清锁定（旧版会被拽着追出半张地图）
           *   ⑦ 模态浮层（确认框）开着 → 不出手
           *   ⑧ 目标倒下 → 自动接上够得着的下一只；够不着则清空
           *   ⑨ 点空地 → 清锁定
           * ★ 还自查一件事：这组样例能不能真的抓住旧逻辑（oldPick）——
           *   如果新旧算法在样例上给出完全一样的答案，说明用例是**假绿**，得报出来。
           */
          var pba = document.getElementById('probe') || (function () { var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none'; document.body.appendChild(d); return d; })();
          var A = { cases: [], oldCatch: 0, keyTake: null,
                    farClear: null, modal: null, chain: null, clearClick: null };
          var savedFoes = foes;
          /* 造"自测妖兽"的 def_ 必须**无副作用**：qingxuan 出生点第一只可能是训练靶
           * （`def_.dummy`），直接继承它 → killFoe 首行就把 hp 重置回满 → 永远打不死，
           * 「目标倒下→自动接下一只」当场失效，而现象看起来像"自动攻击没生效"。
           * ⚠ def_ 是**共享对象**，绝不能就地改：浅拷一份并显式去掉 dummy。 */
          var baseDef = (savedFoes[0] && savedFoes[0].def_) || FOE_DEFS[Object.keys(FOE_DEFS)[0]];
          var testDef = {};
          for (var dk in baseDef) if (baseDef.hasOwnProperty(dk)) testDef[dk] = baseDef[dk];
          testDef.dummy = false;
          var mkA = function (x, y, hp) {
            return { def_: testDef, key: testDef.key, name: '自测妖兽',
              x: x, y: y, home: { x: x, y: y },
              hp: hp, maxhp: hp, atk: 0, def: 0, exp: 0, stones: [0, 0],
              face: 'down', flash: 0, atkAnim: 0, deadT: 0, atkCd: 999, alive: true, respawn: 0,
              leash: 0.01, ret: 0, bpath: null, repath: 0,
              anim: 'idle', animT: 0, animHold: 0, dying: 0, sayT: 0 };
          };
          /* 旧算法（v56 及以前）：sideFace 只跟**移动/朝向的 dx 符号**，dx=0 就保持原值。
           * 用它当对照组，验证新判据不是"怎么写都过"。 */
          var oldPick = function (dx, cur) { return dx ? (dx > 0 ? 'right' : 'left') : cur; };

          var pxA = Math.round(player.mx), pyA = Math.round(player.my);
          player.dead = false; player.invuln = 999; player.path = null;
          player.targetFoe = null; player.actHold = 0; player.attackCd = 0;
          // 候选格：离玩家 1.6~3.4 格（仇恨半径内、又在攻击距离外，正好走一段）
          var candA = [];
          for (var axA = -4; axA <= 4; axA++) for (var ayA = -4; ayA <= 4; ayA++) {
            if (!axA && !ayA) continue;
            var cxA = pxA + axA, cyA = pyA + ayA;
            if (!walkable(cxA, cyA) || isSolid(cxA, cyA)) continue;
            var ddA = Math.hypot(axA, ayA);
            if (ddA < 1.6 || ddA > 3.4) continue;
            candA.push({ dx: axA, dy: ayA, x: cxA, y: cyA });
          }
          /* 取一格来当样例。**两级优先，第一级是关键**：
           *   ① dx 与 s=dx−dy **反号**的格（例如 dx>0 但 dy 更大 ⇒ s<0）——
           *      这种位置老算法会答 right、新算法答 left，是唯一能区分新旧算法、
           *      也唯一对应"从屏幕右侧跑来打屏幕左下的怪"那类真实情形的样例；
           *   ② dx=0 的格（老算法"保持原值"，只要原值不是期望值就同样能区分）；
           *   ③ 兜底：符号对就行（此时 oldCatch 可能为 0，用例会自己报出来）。 */
          var pickA = function (sign) {
            var b1 = null, b2 = null, b3 = null;
            for (var i = 0; i < candA.length; i++) {
              var c = candA[i], s = c.dx - c.dy;
              if (sign > 0 ? s <= 0 : s >= 0) continue;
              if (c.dx * s < 0) {
                if (!b1 || Math.abs(s) > Math.abs(b1.dx - b1.dy)) b1 = c;
              } else if (c.dx === 0) { if (!b2) b2 = c; }
              if (!b3) b3 = c;
            }
            return b1 || b2 || b3;
          };
          var resetA = function () {
            player.mx = pxA; player.my = pyA; player.tx = pxA; player.ty = pyA;
            player.path = null; player.targetFoe = null;
            player.actHold = 0; player.attackCd = 0; player.walk = 0;
          };

          [1, -1].forEach(function (sign) {
            var c = pickA(sign);
            if (!c) { A.cases.push({ sign: sign, skip: 'no-cell' }); return; }
            var want = sign > 0 ? 'right' : 'left';
            resetA();
            foes = [mkA(c.x, c.y, 99999)];
            // ★ 故意埋下"错误的历史朝向"：旧版会一路保持它
            player.face = 'right'; player.sideFace = 'right';
            var hit = window.ISLES.tapAt(c.x, c.y);
            var st0 = window.ISLES.stance();
            // 锁定那一刻就必须已经落在命中扇形内 —— 转身"当场生效"的硬证据
            // （不是等主循环下一帧才转；晚了那一帧，画面上角色还朝着别处）
            var arc0 = inFacingArc(foes[0].x, foes[0].y);
            var d0 = Math.hypot(foes[0].x - player.mx, foes[0].y - player.my);
            var hp0 = foes[0].hp, nTk = 0, sideHit = null;
            while (nTk < 300 && foes[0].hp >= hp0) {
              window.ISLES.tick(1 / 60); nTk++;
              if (foes[0].hp < hp0) sideHit = window.ISLES.stance().sideFace;
            }
            var d1 = Math.hypot(foes[0].x - player.mx, foes[0].y - player.my);
            var row = { sign: sign, cell: c.x + ',' + c.y, dx: c.dx, dy: c.dy,
              hit: hit, locked: !!st0.target, face0: st0.face, side0: st0.sideFace, wantSide: want,
              side0ok: st0.sideFace === want,
              inArc: arc0,
              d0: +d0.toFixed(2), d1: +d1.toFixed(2), closed: d1 < d0 - 0.2,
              hurt: foes[0].hp < hp0, tick: nTk, sideAtHit: sideHit, sideAtHitOk: sideHit === want };
            // 旧逻辑在这组样例上会不会给出一样的答案？一样 = 抓不住，用例是假绿
            row.oldWrong = oldPick(c.dx, 'right') !== want;
            if (row.oldWrong) A.oldCatch++;
            A.cases.push(row);
          });

          /* ⑤ 键盘接管：先找一个**相邻可走方向**当基准（按下去必定走得动 —— 否则
           * "没位移"分不清是被墙挡住还是被自动攻击拽住了）。然后把怪放在**不在按键
           * 那一侧**的候选格上，按该方向键：位移必须与按键同向，且正交方向零位移。
           * 被自动攻击拐走时，"同向"或"零正交位移"必有一条不成立。 */
          var DIR4 = [[1, 0, 'd'], [-1, 0, 'a'], [0, 1, 's'], [0, -1, 'w']], od = null;
          for (var qi = 0; qi < DIR4.length && !od; qi++) {
            var qx = pxA + DIR4[qi][0], qy = pyA + DIR4[qi][1];
            if (walkable(qx, qy) && !isSolid(qx, qy)) od = DIR4[qi];
          }
          if (od) {
            var ck = null;
            for (var ci = 0; ci < candA.length; ci++) {
              var cc = candA[ci];
              if (cc.dx * od[0] + cc.dy * od[1] > 0) continue;
              if (!ck || Math.abs(cc.dx - cc.dy) > Math.abs(ck.dx - ck.dy)) ck = cc;
            }
            if (ck) {
              resetA();
              foes = [mkA(ck.x, ck.y, 99999)];
              window.ISLES.tapAt(ck.x, ck.y);
              var mx0 = player.mx, my0 = player.my;
              keys[od[2]] = 1;
              for (var kA = 0; kA < 10; kA++) window.ISLES.tick(1 / 60);
              keys[od[2]] = 0;
              var kdx = player.mx - mx0, kdy = player.my - my0;
              A.keyTake = { k: od[2], ddx: +kdx.toFixed(3), ddy: +kdy.toFixed(3),
                moved: Math.hypot(kdx, kdy) > 0.05,
                along: (kdx * od[0] + kdy * od[1]) > 0,
                across: Math.abs(kdx * od[1] - kdy * od[0]) < 1e-6,
                foeStillLocked: !!player.targetFoe };
              resetA();
            }
          }

          // ⑥ 跑出仇恨半径：1 帧内就该解除锁定
          resetA();
          foes = [mkA(pxA + 8, pyA, 99999)];
          player.targetFoe = foes[0];
          window.ISLES.tick(1 / 60);
          A.farClear = { dist: +(Math.hypot(foes[0].x - player.mx, foes[0].y - player.my)).toFixed(2),
            cleared: player.targetFoe === null };

          /* ⑦ 模态浮层（确认框）开着：贴着怪也不许出手。
           * 先 tick 到真的打出第一刀再开浮层 —— 否则"没掉血"可能是由别的原因造成的，
           * 什么都证明不了（先把"能打"证出来，再证"浮层拦住了"）。 */
          resetA();
          var cModal = snapWalkable(CUR, pxA + 1, pyA);
          foes = [mkA(cModal.x, cModal.y, 99999)];
          window.ISLES.tapAt(cModal.x, cModal.y);
          var hpM0 = foes[0].hp;
          for (var mPre = 0; mPre < 300 && foes[0].hp >= hpM0; mPre++) window.ISLES.tick(1 / 60);
          var hitBefore = foes[0].hp < hpM0, hpM1 = foes[0].hp;
          confirmBox('自测', '浮层开着时不该出手', '确定', function () { });
          for (var mA = 0; mA < 90; mA++) window.ISLES.tick(1 / 60);   // 1.5 秒 = 至少 2 刀的时间
          A.modal = { opened: confirmOpen(), hitBefore: hitBefore, hpSame: foes[0].hp === hpM1 };
          closeConfirm(false);
          resetA();

          /* ⑧ 目标倒下 → 自动接上"够得着"的下一只（伸手可及才接，见 killFoe 的注释）。
           * 同时验反面：够不着（远在仇恨半径之外）就必须清空，不能自动挑更远的接着打 ——
           * 否则点一下怪，角色会自己把整张图刷完。 */
          resetA();
          var candSorted = candA.slice().sort(function (a, b) {
            return Math.hypot(a.dx, a.dy) - Math.hypot(b.dx, b.dy);
          });
          if (candSorted.length) {
            var cw = snapWalkable(CUR, pxA + 1, pyA);
            var fwA = mkA(cw.x, cw.y, 1), fnA = mkA(candSorted[0].x, candSorted[0].y, 99999);
            foes = [fwA, fnA];
            var hitC = window.ISLES.tapAt(fwA.x, fwA.y);
            var lockC = player.targetFoe === fwA;
            var distC = Math.hypot(fwA.x - player.mx, fwA.y - player.my);
            var nC = 0;
            while (nC < 240 && fwA.hp > 0) { window.ISLES.tick(1 / 60); nC++; }
            var nD = 0;
            while (nD < 120 && player.targetFoe !== fnA) { window.ISLES.tick(1 / 60); nD++; }
            A.chain = { hit: hitC, lock: lockC, dist: +distC.toFixed(2),
              hpEnd: fwA.hp, killedAt: nC, tookAt: nD,
              picked: player.targetFoe === fnA, firstGone: fwA.hp <= 0,
              dead: player.dead, pHp: Math.round(player.hp), act: player.act,
              actHold: +player.actHold.toFixed(2), cd: +player.attackCd.toFixed(2),
              foeAlive: fwA.alive, foeDying: +fwA.dying.toFixed(2),
              farInRange: Math.hypot(fnA.x - player.mx, fnA.y - player.my) <= MELEE + 0.9 };
            // 反面：另一只在 20 格之外（远超任何仇恨半径），打死了也不该接
            foes = [mkA(cw.x, cw.y, 1), mkA(player.mx + 20, player.my, 99999)];
            window.ISLES.tapAt(cw.x, cw.y);
            for (var cB = 0; cB < 240 && foes[0].hp > 0; cB++) window.ISLES.tick(1 / 60);
            A.chainFar = { firstGone: foes[0].hp <= 0, cleared: player.targetFoe === null,
              hpEnd: foes[0].hp };
            resetA();
          }

          // ⑨ 点空地清锁定
          resetA();
          var cClr = snapWalkable(CUR, pxA + 1, pyA);
          foes = [mkA(cClr.x, cClr.y, 99999)];
          window.ISLES.tapAt(cClr.x, cClr.y);
          var lockedB = !!player.targetFoe;
          window.ISLES.tapAt(pxA, pyA);          // 点自己脚下（怪在 1 格外，不会误判成命中）
          A.clearClick = { lockedBefore: lockedB, cleared: player.targetFoe === null };

          // —— 复位：别把自测状态留玩家界面上 ——
          foes = savedFoes;
          player.targetFoe = null; player.path = null;
          player.mx = pxA; player.my = pyA; player.tx = pxA; player.ty = pyA;
          player.actHold = 0; player.attackCd = 0; player.sideFace = 'right'; player.face = 'down';

          /* 汇总。★ oldCatch ≥ 1 是**给用例自己上的防假绿锁**：旧算法（sideFace 只跟
           * 水平移动方向）至少在一条样例上会给出与新算法不同的答案 —— 否则这些样例
           * 根本抓不住「背对怪物攻击」，跑绿了也说明不了什么。 */
          A.pass = A.cases.length >= 1 && A.oldCatch >= 1 &&
            A.cases.every(function (r) {
              return r.hit === true && r.locked === true && r.side0ok === true && r.inArc === true &&
                r.closed === true && r.hurt === true && r.sideAtHitOk === true;
            }) &&
            !!A.keyTake && A.keyTake.moved === true && A.keyTake.along === true && A.keyTake.across === true &&
            !!A.farClear && A.farClear.cleared === true &&
            !!A.modal && A.modal.opened === true && A.modal.hitBefore === true && A.modal.hpSame === true &&
            !!A.chain && A.chain.picked === true && A.chain.firstGone === true && A.chain.farInRange === true &&
            !!A.chainFar && A.chainFar.firstGone === true && A.chainFar.cleared === true &&
            !!A.clearClick && A.clearClick.lockedBefore === true && A.clearClick.cleared === true;
          pba.textContent = JSON.stringify(A);
        }
        if (at === 'skill') {
          // ?map=qingxuan&autotest=skill —— 三个技能各自验收：命中掉血、冷却拦截、冷却清零后可再放
          var pbs = document.getElementById('probe') || (function () { var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none'; document.body.appendChild(d); return d; })();
          var tg3 = foes[0], res = [];
          if (tg3) {
            player.path = null; player.targetFoe = null; player.invuln = 999;
            var setup = function () {                 // 站到靶子下方，脸朝上正对它
              player.mx = tg3.x; player.my = tg3.y + 1.2;
              player.tx = player.mx; player.ty = player.my; player.face = 'up';
              player.actHold = 0; player.attackCd = 0;
            };
            for (var si3 = 0; si3 < SKILLS.length; si3++) {
              setup(); player.skillCd[si3] = 0;
              var ha = tg3.hp, fxA = skillFx.length, fxPeak = 0;
              var ok1 = castSkill(si3);
              // 弹道技能（proj）的伤害在命中帧才结算：统一 tick 到「动作播完且弹道清空」
              // ⚠ 特效数要在推进过程中取**峰值**：skillFx 是短命队列（life 到 0 当场 splice），
              //   等动作播完再数，短特效早淡出了 → 恒为 0（旧写法漏了这个，白红过一次）。
              for (var sfi = 0; sfi < 260; sfi++) {
                window.ISLES.tick(1 / 60);
                var cfx = skillFx.length - fxA;
                if (cfx > fxPeak) fxPeak = cfx;
                if (player.actHold <= 0 && projectiles.length === 0) break;
              }
              res.push({ id: SKILLS[si3].id, cast: !!ok1, dmg: ha - tg3.hp,
                cd: +player.skillCd[si3].toFixed(2), fx: fxPeak });
              setup();
              res[si3].blocked = (castSkill(si3) === false);   // 冷却没走完必须放不出来
              setup(); player.skillCd[si3] = 0;
              var hb2 = tg3.hp;
              res[si3].recast = !!castSkill(si3);
              for (var sfj = 0; sfj < 260; sfj++) {
                window.ISLES.tick(1 / 60);
                if (player.actHold <= 0 && projectiles.length === 0) break;
              }
              res[si3].dmg2 = hb2 - tg3.hp;
            }
          }
          pbs.textContent = JSON.stringify({ n: SKILLS.length, skills: res,
            fxDrawn: (window.__fxDrawn || 0),   // 真实画帧数（≥4 = 四招特效真的上屏，不是只入队）
            fxMissWhy: window.__fxMissWhy || null,
            fxImg: !!(ATLAS.fx && ATLAS.fx.img), fxRect: !!(ATLAS.fx && ATLAS.fx.rect) });
        }
        if (at === 'cull') {
          // ?map=<图>&autotest=cull —— 「视口裁剪没画漏」验收（2026-09-17 加）。
          // 裁剪是按 k=x+y 二分出的区间，风险只有一个：裁多了 → 屏幕内的物件被跳掉，
          // 表现为"地图边缘突然空一块"。所以判据不是"帧率高了"，而是
          //   **裁剪后的落笔数 == 关掉裁剪全量遍历的落笔数**。
          // 做法：同一帧、同一相机，跑两次 render()，只改 CULL_OFF 开关，比对 _draw.paint。
          var pbc2 = document.getElementById('probe') || (function () { var d = document.createElement('div'); d.id = 'probe'; d.style.display = 'none'; document.body.appendChild(d); return d; })();
          var rows2 = [];
          var probes2 = [
            { tag: 'spawn',  x: CUR.spawn ? CUR.spawn.x : 0, y: CUR.spawn ? CUR.spawn.y : 0 },
            { tag: 'center', x: (CUR.w / 2) | 0,             y: (CUR.h / 2) | 0 },
            { tag: 'corner', x: 1,                           y: 1 },
            { tag: 'far',    x: CUR.w - 2,                   y: CUR.h - 2 }
          ];
          // ★ 判据实现：不让两次 render 各数一个总数就完事（那只能告诉你"不等"），
          //   而是把两次**真正落笔的物件下标集合**都记下来，做差集 —— 差集直接告诉你
          //   "哪些物件被裁掉了"，可以逐个回看它们的坐标，判定是"活该被裁"还是"真漏画"。
          // ⚠ 这里**不能**再 var kLoDbg/kHiDbg：那会遮蔽 render() 里赋值的同名外层变量，
          //   读到的永远是 0（2026-09-17 踩过）。
          try {
          probes2.forEach(function (pr) {
            player.mx = pr.x; player.my = pr.y; player.tx = pr.x; player.ty = pr.y;
            player.path = null;
            camX = W / 2 - (player.mx - player.my) * HW * Z;
            camY = H / 2 - (player.mx + player.my) * HH * Z;
            // 先跑**生产路径**（裁剪开启，CULL_OFF=false）—— 这是玩家实际看到的画面
            CULL_OFF = false; paintTracker = {}; render();
            var paintLive = _draw.paint, scanLive = _draw.scan, live = paintTracker;
            // 再跑**基准路径**（关掉裁剪，全量遍历）—— 它画的才是"一个都不能少"的集合
            CULL_OFF = true; paintTracker = {}; render();
            var paintBase = _draw.paint, scanBase = _draw.scan, base = paintTracker;
            paintTracker = null;
            // missN：基准画了、生产没画 → 真漏画（必须为 0）
            // extraN：生产画了、基准没画 → 不可能（基准是全量），出现即有 bug
            var miss = [], extra = [];
            Object.keys(base).forEach(function (kk) { if (!live[kk]) miss.push(+kk); });
            Object.keys(live).forEach(function (kk) { if (!base[kk]) extra.push(+kk); });
            // ★★ 判据修正（2026-09-17）★★
            // 「base 画了而 live 没画」**不等于**漏画 —— paintObj 自己的边界判据带余量
            // （by 允许到 H+oh*1.6），把一部分投影后完全在屏幕外的瓦也算了「落笔」。
            // 裁剪把这些裁掉是对的。所以真正要判的是：被裁掉的里面，有几个**本该看得见**。
            //   看得见 = 该物件的绘制矩形 [by-oh, by] 与屏幕 [0, H] 有交集。
            // 只要「本该看得见却被裁掉」恒为 0，裁剪就是安全的。
            var ghost = [];   // 被裁掉、且本该看得见的（真正的漏画）
            miss.forEach(function (ix) {
              var o = CUR.objects[ix];
              if (!o) { ghost.push({ i: ix, bad: 1 }); return; }
              var pz = piece(o.piece);
              if (!pz) return;                      // piece 缺失本来就不会落笔，不算漏
              var ax = o.x + ((o.fw || 1) - 1) / 2, ay = o.y + ((o.fh || 1) - 1) / 2;
              var pp = isoToScreen(ax, ay);
              var by = pp.y + HH * Z + (o.dy || 0) * Z;
              var ow = pz.w * Z, oh = pz.h * Z;
              var lft = pp.x - ow / 2 + 0, rgt = pp.x + ow / 2;
              var top = by - oh, bot = by;
              var onScreen = (bot > 0) && (top < H) && (rgt > 0) && (lft < W);
              if (onScreen) ghost.push({ i: ix, x: o.x, y: o.y, gnd: !!o.gnd,
                top: Math.round(top), bot: Math.round(bot), lft: Math.round(lft), rgt: Math.round(rgt) });
            });
            rows2.push({ at: pr.tag, x: pr.x, y: pr.y,
                         paintLive: paintLive, paintBase: paintBase,
                         cutN: miss.length, ghostN: ghost.length, extraN: extra.length,
                         kLo: +kLoDbg.toFixed(2), kHi: +kHiDbg.toFixed(2),
                         scanLive: scanLive, scanBase: scanBase,
                         ghost: ghost.slice(0, 4), sample: miss.slice(0, 3) });
          });
          } catch (eCull) {
            // 自测自己抛异常时必须留下痕迹 —— 否则现象只是"probe 为空"，
            // 看起来像页面没加载完，排查方向会被带偏（这一条是踩出来的）。
            pbc2.textContent = JSON.stringify({ fatal: String(eCull && eCull.message || eCull),
              stack: String(eCull && eCull.stack || '').slice(0, 300) });
            CULL_OFF = false; paintTracker = null;
            requestAnimationFrame(loop);
            return;
          }
          CULL_OFF = false;
          // 判据：① **本该看得见却被裁掉的 = 0**（这才是"漏画"的定义）
          //      ② 必须真省到了（scanLive 明显小于 scanBase）
          //      ③ 生产路径不可能画出基准之外的东西（extraAll == 0）
          var ghostAll = rows2.reduce(function (a, r) { return a + r.ghostN; }, 0);
          var extraAll = rows2.reduce(function (a, r) { return a + r.extraN; }, 0);
          var cutAll = rows2.reduce(function (a, r) { return a + r.cutN; }, 0);
          var savedScan = rows2.reduce(function (a, r) { return a + (r.scanBase - r.scanLive); }, 0);
          pbc2.textContent = JSON.stringify({
            ok: ghostAll === 0 && extraAll === 0 && savedScan > 0,
            ghost: ghostAll,        // 漏画（必须 0）
            extra: extraAll,        // 多画（必须 0）
            cut: cutAll,            // 裁掉的"假落笔"总数（屏幕外，正常）
            savedScan: savedScan,   // 省下的遍历次数
            objs: (CUR._objSorted || []).length,
            gnd: (CUR._groundTiles || []).length,
            rows: rows2
          });
        }
        requestAnimationFrame(loop);
      }
    }).catch(function (e) {
      // 加载失败时把原因写在进度条下面 —— 只留一句「加载中」会让用户莫名其妙
      if (loadUI.tip) loadUI.tip.textContent = '加载失败';
      if (loadUI.sub) loadUI.sub.textContent = e.message;
      console.error(e);
    });
  }

  // 预渲染一朵云，避免每帧多次渐变
  function buildCloudSprite() {
    var c = document.createElement('canvas');
    c.width = 340; c.height = 150;
    var g = c.getContext('2d');
    var blobs = [[70, 95, 62], [140, 78, 78], [215, 92, 64], [275, 100, 46], [105, 105, 50], [180, 108, 56]];
    blobs.forEach(function (b) {
      var rg = g.createRadialGradient(b[0], b[1], 4, b[0], b[1], b[2]);
      rg.addColorStop(0, 'rgba(255,255,255,.95)');
      rg.addColorStop(0.55, 'rgba(255,255,255,.62)');
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.beginPath(); g.arc(b[0], b[1], b[2], 0, 6.2832); g.fill();
    });
    cloudCv = c;
  }

  var CLOUDS = [
    { x: 120, y: 90, s: 1.5, p: 0.30 }, { x: 700, y: 60, s: 1.15, p: 0.22 },
    { x: 1150, y: 150, s: 1.75, p: 0.34 }, { x: 380, y: 240, s: 0.95, p: 0.16 },
    { x: 980, y: 330, s: 1.3, p: 0.26 }, { x: -40, y: 380, s: 1.05, p: 0.19 },
    { x: 1450, y: 60, s: 1.4, p: 0.28 }, { x: 600, y: 470, s: 1.2, p: 0.24 }
  ];

  function drawSky() {
    // 地宫：纯黑岩窟背景，不画天空/云
    if (CUR && CUR.id === 'dungeon') {
      var dg = ctx.createLinearGradient(0, 0, 0, H);
      dg.addColorStop(0, '#0a0d16'); dg.addColorStop(1, '#05070d');
      ctx.fillStyle = dg; ctx.fillRect(0, 0, W, H);
      return;
    }
    // 外来地图自带的"虚空底色"（来源 Tiled 工程的 backgroundcolor）。
    // Flare 的草原图美术前提是「悬崖下方是一片深谷」——崖壁瓦本身就画着黑谷底，
    // 空隙处若露本引擎的天蓝天空，会变成一块块刺眼的白洞。用来源图的底色填上即吻合。
    if (CUR && CUR.voidColor) {
      ctx.fillStyle = CUR.voidColor;
      ctx.fillRect(0, 0, W, H);
      return;
    }
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, SKY_TOP); g.addColorStop(0.5, SKY_MID); g.addColorStop(1, SKY_BOT);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (!cloudCv) return;
    var span = W + 700;
    for (var i = 0; i < CLOUDS.length; i++) {
      var c = CLOUDS[i];
      var sx = c.x - camX * c.p;
      sx = ((sx % span) + span) % span - 350;
      var sy = c.y - camY * c.p * 0.35;
      sy = ((sy % (H + 300)) + (H + 300)) % (H + 300) - 150;
      ctx.globalAlpha = 0.72;
      ctx.drawImage(cloudCv, sx, sy, 340 * c.s, 150 * c.s);
    }
    ctx.globalAlpha = 1;
  }

  // ---------------- 绘制 ----------------
  /* 图集取件：把「图块名」翻译成 {img, sx, sy, w, h}
   * 打包成图集后，每个绘制点除了目标矩形，还必须给出源矩形（sx/sy/sw/sh）。
   * 抽成一个函数是为了只在这里处理「找不到」的情况 —— 少一个图块不该让整帧崩掉。
   */
    function piece(name) {
      // 遍历所有图集，不写死顺序 —— 接第一张外来地图（dungeon）时这里是按名字硬写的，
      // 再加第二、三张就会变成一坨 if。以后新增图集只要在 LOAD_PLAN 里 push 两项。
      for (var k in ATLAS) {
        var a = ATLAS[k];
        // rect 是主表；items 图集另有 big 表（<icon>_big 的 2× 高清版，背包格子用）。
        // 两张表共用同一个 <img>，所以只取矩形，图仍是 a.img。
        var r = (a.rect && a.rect[name]) || (a.big && a.big[name]);
        if (a.img && r) return { img: a.img, sx: r[0], sy: r[1], w: r[2], h: r[3] };
      }
      // 独立 PNG 回退：用于测试/接入未入图集的新素材（如 Kenney 地牢包）
      if (IMG[name]) {
        var im = IMG[name];
        if (im.complete && im.width) return { img: im, sx: 0, sy: 0, w: im.width, h: im.height };
      }
      return null;
    }
  function charPiece(file) {
    var a = ATLAS.chars, r = a.rect && a.rect[file];
    if (!a.img || !r) return null;
    return { img: a.img, sx: r[0], sy: r[1], w: r[2], h: r[3] };
  }
  function foePiece(name) {
    var a = ATLAS.foes, r = a.rect && a.rect[name];
    if (!a.img || !r) return null;
    return { img: a.img, sx: r[0], sy: r[1], w: r[2], h: r[3] };
  }

    /* 地面绘制：两级策略，取决于这张地图有没有 groundTop
     *   （groundTop 由 tools/build_ground_tops.py 从原「整块地形瓦」派生出来）
     *
     * 有 groundTop —— 内部格改用「无接缝顶面瓦」：原素材是 120x60 的菱形顶面
     *   底下压着 15px 泥土侧壁、最外一圈还带描边，逐格整块铺就会满屏砖缝。
     *   顶面瓦把侧壁和描边都去掉了，于是地面连成一片。具体分三种情况：
     *     · 岛缘（南邻或东邻不是实体地）→ 仍用原带侧壁瓦，露出泥土断层；
     *     · 水格四邻皆水 → 用无岸顶面瓦，几十格水连成一湖；
     *     · 其余 → 用顶面瓦，按坐标伪随机取变体，打散「一张瓦铺几百格」的规律感。
     * 没有 groundTop —— 沿用旧的整块铺法，行为与改造前完全一致。
     *   （lingquan / beilin / dungeon 尚未生成顶面瓦，靠这条回退路径不受影响。）
     */
    var TOP_OVER = 1.06;      // 顶面瓦绘制放大比例（见 drawGround 内的说明）
    // 水面单独用更大的重叠：水是近乎纯色的大色块，放大带来的相互覆盖看不出来，
    // 而 2:1 菱形在非整数缩放下边缘抗锯齿必留半像素缝，水面上这条缝最扎眼。
    var TOP_OVER_WATER = 1.14;
    var NT4X = [1, -1, 0, 0], NT4Y = [0, 0, 1, -1];
    /** 确定性伪随机：同一坐标永远得到同一个数，刷新/换机都不变 */
    function tileHash(x, y) {
      var h = Math.imul(x + 0x9E37, 0x27D4EB2D) ^ Math.imul(y + 0x85EB, 0x165667B1);
      h = Math.imul(h ^ (h >>> 15), 0x2545F491);
      return (h ^ (h >>> 13)) >>> 0;
    }
    /** 四邻是否全是水（越界按不是水处理，岸边因此保留岸线） */
    function waterAround(x, y) {
      for (var i = 0; i < 4; i++) {
        var nx = x + NT4X[i], ny = y + NT4Y[i];
        if (nx < 0 || ny < 0 || nx >= CUR.w || ny >= CUR.h) return false;
        if (WATER.indexOf(CUR.ground[ny][nx]) < 0) return false;
      }
      return true;
    }

    function drawGround() {
      var tw = TILE_W * Z, th = TILE_H * Z;
      var GT = CUR.groundTop;
      for (var y = 0; y < CUR.h; y++) {
        var row = CUR.ground[y];
        for (var x = 0; x < CUR.w; x++) {
          var ch = row[x];
          var file = PAL[ch];
          if (!file) continue;
          var name = file, top = false;
          var vs = GT && GT[ch];
          if (vs && vs.length) {
            // noSideWall：本图图幅内没有虚空（整幅都是水/陆），边缘退回带侧壁的
            // 原始瓦只会露出一圈底座，所以直接全程用无缝顶面瓦。
            var flat = !!CUR.noSideWall;
            if (WATER.indexOf(ch) >= 0) {
              // 全湖只画 vs[0] 会是「一张水图反复贴」，格感很重 —— 按格 hash 挑变体。
              if (flat || waterAround(x, y)) { name = vs[tileHash(x, y) % vs.length]; top = true; }
            } else {
              // 南邻(y+1) / 东邻(x+1) 在屏幕上位于本格的左下与右下 —— 只有它们
              // 是虚空时，本格的泥土侧壁才露得出来；否则整格用无缝顶面瓦。
              var sb = (y + 1 < CUR.h) ? CUR.ground[y + 1][x] : ' ';
              var se = (x + 1 < CUR.w) ? row[x + 1] : ' ';
              if (flat || (PAL[sb] && PAL[se])) { name = vs[tileHash(x, y) % vs.length]; top = true; }
            }
          }
          var pz = piece(name);
          if (!pz) continue;
          var p = isoToScreen(x, y);
          if (p.x < -tw * 1.6 || p.x > W + tw * 1.6 || p.y < -th * 4 || p.y > H + th * 4) continue;
          // 统一按宽度归一到 TILE_W*Z，保证菱形水平对角线与网格严格对齐。
          // 顶面瓦再放大 3%：缩放比不是整数（120/119），密铺时边缘会差半像素露缝，
          // 略微重叠就盖住了；相邻格重叠区颜色一致，看不出来。
          var s = tw / pz.w;
          var over = (top && WATER.indexOf(ch) >= 0) ? TOP_OVER_WATER : TOP_OVER;
          var dw = top ? tw * over : tw;
          var dh = pz.h * s * (top ? over : 1);
          // ★ 落点与尺寸一起吸到整数像素栅格 —— 手机端"瓦片之间露缝"的根因就是这里。
          //   相邻格在屏幕上的横向间距**恰好等于 dw**（同一行相邻格 p.x 相差 HW*Z=tw/2，
          //   而屏幕上真正相邻的是 (x+1,y-1)，相差整好 tw=dw）。只要 dw 取整、并且落点
          //   也是整数，左边缘就构成等差数列 round(p.x0-dw/2) + i*dw —— 严格密铺，
          //   既不重叠也不露缝。分数坐标 + imageSmoothingEnabled=false 时浏览器会各自
          //   取整，误差逐格累积，于是出现 1px 的透明/底色缝。
          //   （物件层 paintObj 早就在 Math.round，地面层是唯一的例外 —— 就是它漏了。）
          var dwr = Math.round(dw), dhr = Math.round(dh);
          var dxr = Math.round(p.x - dw / 2);
          var dyr = Math.round(p.y - (dh - pz.h * s) / 2);
          if (GND.on) {
            // 量的是**真正交给 drawImage 的那四个值**，不是"原值是不是整数" ——
            // 后者恒为真（tw*Z 基本不会是整数），没有任何可证伪性。
            // 这里只要有任何一个不是整数，浏览器就会对这块瓦单独取整 → 误差累积成缝。
            GND.n++;
            if (dxr !== Math.round(dxr) || dyr !== Math.round(dyr) ||
              dwr !== Math.round(dwr) || dhr !== Math.round(dhr)) GND.frac++;
          }
          if (dwr >= 1 && dhr >= 1) {
            ctx.drawImage(pz.img, pz.sx, pz.sy, pz.w, pz.h, dxr, dyr, dwr, dhr);
          }
        }
      }
    }

  function drawPortal(pt) {
    var p = isoToScreen(pt.x, pt.y);
    var cx = p.x, cy = p.y + HH * Z;
    var k = 1 + 0.14 * Math.sin(time * 3.4);
    var R = 66 * k * Z;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var rg = ctx.createRadialGradient(cx, cy, 2, cx, cy, R);
    rg.addColorStop(0, 'rgba(120,240,255,.55)');
    rg.addColorStop(0.5, 'rgba(70,200,255,.22)');
    rg.addColorStop(1, 'rgba(60,180,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 6.2832); ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(150,250,255,' + (0.72 + 0.26 * Math.sin(time * 3.4)) + ')';
    ctx.lineWidth = 2.5 * Z;
    ctx.beginPath();
    ctx.moveTo(cx, cy - HH * Z - 3 * Z); ctx.lineTo(cx + HW * Z - 4 * Z, cy);
    ctx.lineTo(cx, cy + HH * Z + 3 * Z); ctx.lineTo(cx - HW * Z + 4 * Z, cy);
    ctx.closePath(); ctx.stroke();
    ctx.restore();

    ctx.font = 'bold ' + (15 * Z).toFixed(1) + 'px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center';
    var label = '⇄ ' + pt.label;
    ctx.lineWidth = 3.5 * Z; ctx.strokeStyle = 'rgba(6,12,24,.8)';
    ctx.strokeText(label, cx, cy - 46 * Z);
    ctx.fillStyle = '#9df6ff';
    ctx.fillText(label, cx, cy - 46 * Z);
  }

  /* 画一件掉落物。
   * 三个「让人一眼看出地上有东西」的视觉手段（缺一个都会变成背景杂点）：
   *   ① 地面上的椭圆投影 —— 没有它图标像贴在屏幕上，看不出落在地上；
   *   ② 上下浮动 + 刚落地时的弹跳（tossT）—— 静止的图标会被当成地图装饰；
   *   ③ 图标底下的一圈柔光 —— 战场本身很花，光晕把道具从背景里抠出来。
   * 数值都乘 Z，缩放时比例不跑偏。缓存的 lootImg 见下面 lootSprite()。 */
  /** '#7fe08a' → '127,224,138'（canvas 里画 rgba(r,g,b,a) 要的是三个分量，不是 hex）。 */
  function hexToRgbStr(hex) {
    var h = String(hex || '#ffffff').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var v = parseInt(h, 16) || 0;
    return ((v >> 16) & 255) + ',' + ((v >> 8) & 255) + ',' + (v & 255);
  }
  function drawLoot(L) {
    var pz = lootSprite(L.gear ? L.gear.key : L.key);
    if (!pz) return;
    var p = isoToScreen(L.mx, L.my);
    var baseY = p.y + HH * Z;
    var t = time * 2.4 + L.phase;
    // 弹出：刚落地时从上方落下 + 轻微压扁，之后转成匀速浮动
    var pop = L.pop < 1 ? (1 - L.pop) : 0;
    var bob = Math.sin(t) * 2.2 * Z - pop * 26 * Z;
    var cx = p.x, cy = baseY + bob;
    // 图标比原来大一圈（30→36）：用户反馈「物品很小、不好捡」，先让人看得见。
    var size = 36 * Z * (1 - pop * 0.25);

    // 按物品类别配色：药=粉、材料=青、稀有=金；装备用**品质色**（远处就能看出值不值得走过去）
    var it = L.gear ? null : ITEMS[L.key];
    var gc = L.gear ? hexToRgbStr(gearTier(L.gear).col)
           : it && it.kind === 'heal' ? '255,150,190'
           : it && it.kind === 'rare' ? '255,214,130' : '150,235,205';

    // ① 地面投影（跟着浮动缩放：离地越高影子越小越淡）
    var shR = (9 - bob / (6 * Z)) * Z;
    if (shR > 2) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.06, 0.30 - bob / (60 * Z)) * (L.blink ? (0.5 + 0.5 * Math.sin(time * 9)) : 1);
      ctx.fillStyle = '#0b1018';
      ctx.beginPath();
      ctx.ellipse(cx, baseY + 1 * Z, Math.max(2, shR), Math.max(1, shR * 0.5), 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
    }

    /* ★★ 地面光圈（2026-09-17 用户：「拾取不是很方便，物品很小，这个可以在物品下
     * 加一个小的圆圈或者发光显示一下」）——固定画在**脚下地面**，不随浮动上下晃，
     * 这样它读起来就是"这里有个东西"，而不是另一团飘着的光。
     * 三层叠加：外扩脉冲环（呼吸感）+ 实心环（边界清晰）+ 中心淡填充（跟地面拉开对比）。 */
    var ringR = 13 * Z;                       // 环的基准半径
    var breathe = 0.5 + 0.5 * Math.sin(time * 2.6 + L.phase);
    ctx.save();
    // 外扩脉冲环：半径随时间涨出去、同时淡出，制造"在吸引你过去"的感觉
    ctx.globalAlpha = (0.40 - 0.28 * breathe) * (L.blink ? (0.4 + 0.6 * Math.abs(Math.sin(time * 9))) : 1);
    ctx.strokeStyle = 'rgba(' + gc + ',1)';
    ctx.lineWidth = 2.2 * Z;
    ctx.beginPath();
    ctx.ellipse(cx, baseY + 1 * Z, ringR * (1 + breathe * 0.55), ringR * 0.5 * (1 + breathe * 0.55), 0, 0, 6.2832);
    ctx.stroke();
    // 实心环：等距视角下压扁成椭圆，贴合地面
    ctx.globalAlpha = (0.62 + 0.24 * breathe) * (L.blink ? (0.4 + 0.6 * Math.abs(Math.sin(time * 9))) : 1);
    ctx.strokeStyle = 'rgba(' + gc + ',1)';
    ctx.lineWidth = 2.6 * Z;
    ctx.beginPath();
    ctx.ellipse(cx, baseY + 1 * Z, ringR, ringR * 0.5, 0, 0, 6.2832);
    ctx.stroke();
    // 中心淡填充：把环里的地面稍稍提亮，小图标在草地/石板上的对比度立马够用
    ctx.globalAlpha = (0.16 + 0.10 * breathe) * (L.blink ? (0.4 + 0.6 * Math.abs(Math.sin(time * 9))) : 1);
    ctx.fillStyle = 'rgba(' + gc + ',1)';
    ctx.beginPath();
    ctx.ellipse(cx, baseY + 1 * Z, ringR * 0.92, ringR * 0.46, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();

    // ② 柔光（跟着图标浮动）
    ctx.save();
    var pulse = 0.42 + 0.20 * Math.sin(time * 3.1 + L.phase);
    var rg = ctx.createRadialGradient(cx, cy, 1, cx, cy, 24 * Z);
    rg.addColorStop(0, 'rgba(' + gc + ',' + pulse.toFixed(3) + ')');
    rg.addColorStop(0.55, 'rgba(' + gc + ',' + (pulse * 0.32).toFixed(3) + ')');
    rg.addColorStop(1, 'rgba(' + gc + ',0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, cy, 24 * Z, 0, 6.2832); ctx.fill();
    ctx.restore();

    // ③ 图标本体（描一圈深色边，避免浅色图标贴在浅色地面上"糊"掉）
    ctx.save();
    ctx.globalAlpha = L.blink ? (0.45 + 0.55 * Math.abs(Math.sin(time * 5.2 + L.phase))) : 1;
    ctx.imageSmoothingEnabled = true;      // 图标是手绘风，插值放大比方块好看
    var ix = Math.round(cx - size / 2), iy = Math.round(cy - size / 2);
    ctx.shadowColor = 'rgba(4,8,16,.85)';
    ctx.shadowBlur = 4 * Z;
    ctx.drawImage(pz.img, pz.sx, pz.sy, pz.w, pz.h, ix, iy, Math.round(size), Math.round(size));
    ctx.restore();

    // 数量角标（>1 才画，单件就不啰嗦）
    if (L.n > 1) {
      ctx.save();
      ctx.font = 'bold ' + (12 * Z).toFixed(1) + 'px ui-monospace,Consolas,monospace';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      var tx = cx + size * 0.30, ty = cy + size * 0.28;
      ctx.lineWidth = 3 * Z; ctx.strokeStyle = 'rgba(6,12,24,.9)';
      ctx.strokeText('×' + L.n, tx, ty);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText('×' + L.n, tx, ty);
      ctx.restore();
    }

    /* ★ 物品名称小字（2026-09-17 用户：「物品掉落后需要显示小字的名称」）
     * 画在**地面光圈下方**（baseY + 一格），贴着地面读起来才像"这东西的标签"，
     * 挂到浮动图标边上会跟着上下晃、认起来累。
     * 两级描边（粗黑描边 + 细描边）保证在草地/石板/水面任何底色上都读得清 ——
     * 只靠 fillText 在浅色地面上会糊掉。文字做对比增强不做纯白，避免刺眼。 */
    var nm = L.gear ? gearName(L.gear) : ((it && it.cn) ? it.cn : L.key);
    var fs = Math.round(11 * Z);
    ctx.save();
    ctx.font = 'bold ' + fs + 'px "PingFang SC","Microsoft YaHei",ui-monospace,sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var lx = cx, ly = baseY + 15 * Z;
    ctx.globalAlpha = L.blink ? (0.45 + 0.55 * Math.abs(Math.sin(time * 5.2 + L.phase))) : 1;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.4 * Z; ctx.strokeStyle = 'rgba(6,12,24,.92)';
    ctx.strokeText(nm, lx, ly);
    ctx.lineWidth = 1.2 * Z; ctx.strokeStyle = 'rgba(' + gc + ',.85)';
    ctx.strokeText(nm, lx, ly);
    ctx.fillStyle = '#fff6df';
    ctx.fillText(nm, lx, ly);
    ctx.restore();
  }
  /** 掉落物图标取件（小图，64×64）。带缓存，免得每帧翻图集。 */
  var _lootPz = {};
  function lootSprite(key) {
    if (_lootPz[key] !== undefined) return _lootPz[key];
    var it = ITEMS[key];
    var pz = it ? piece(it.icon) : null;
    _lootPz[key] = pz || null;
    return _lootPz[key];
  }

  /** 画一个角色（影子 + 按朝向/帧取图）。玩家与 NPC 共用同一套绘制，规格完全一致。
   *  opts.row  覆盖行号（侧视素材的行是「动作」而非「朝向」）
   *  opts.flip 水平翻转（侧视素材只有右边一个朝向，左边靠翻转）
   *  opts.spin 绕脚底旋转，弧度（等距素材没有倒地帧，用旋转近似倒下）
   */
  function drawActor(img, mx, my, face, frame, bob, ox, oy, opts) {
    _draw.actor++;
    opts = opts || {};
    var p = isoToScreen(mx, my);
    var dh = SHEET.cellH * SHEET.pxScale * Z, dw = dh * (SHEET.cellW / SHEET.cellH);
    var baseY = p.y + HH * Z;
    // 影子
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(p.x, baseY - 2, TILE_W * 0.20 * Z, TILE_H * 0.20 * Z, 0, 0, 6.2832);
    ctx.fill();
    ctx.restore();
    if (!img) return null;
    var row = (opts.row != null) ? opts.row : (SHEET.dir[face] || 0);
    var sx = (ox || 0) + frame * SHEET.cellW, sy = (oy || 0) + row * SHEET.cellH;
    var top = baseY - dh + 4 + (bob || 0) * Z;
    var sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    if (opts.spin) {
      ctx.save();
      ctx.translate(p.x, baseY);
      ctx.rotate(opts.spin);
      ctx.drawImage(img, sx, sy, SHEET.cellW, SHEET.cellH, -dw / 2, -dh + 4 + (bob || 0) * Z, dw, dh);
      ctx.restore();
    } else if (opts.flip) {
      ctx.save();
      ctx.translate(p.x, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(img, sx, sy, SHEET.cellW, SHEET.cellH, -dw / 2, top, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img, sx, sy, SHEET.cellW, SHEET.cellH, p.x - dw / 2, top, dw, dh);
    }
    ctx.imageSmoothingEnabled = sm;
    return { x: p.x, top: baseY - dh + 4 };
  }

  function heroOf(file) {
    for (var i = 0; i < HERO_OPTIONS.length; i++) {
      if (HERO_OPTIONS[i].file === file) return HERO_OPTIONS[i];
    }
    return null;
  }
  /** 侧视素材的取帧：循环动作按时间/步频推进，一次性动作按播放进度推进（停在末帧）。
   *  walk/run 优先跟位移同步（避免"滑步"）；没有位移时（数字键试演）退回用 actT 计时，
   *  否则站着试演会是一张死图。 */
  function sideFrame(act) {
    if (act === 'idle') return Math.floor(time * 4) % SHEET.frames;
    if (act === 'walk') return Math.floor((player.walk > 0 ? player.walk * 7 : player.actT * 7)) % SHEET.frames;
    if (act === 'run')  return Math.floor((player.walk > 0 ? player.walk * 11 : player.actT * 11)) % SHEET.frames;
    var dur = ACT_DUR[act] || 0.5;
    var k = Math.min(0.999, player.actT / dur);
    return Math.min(SHEET.frames - 1, Math.floor(k * SHEET.frames));
  }
  function drawCharacter() {
    var pz = charPiece(PLAYER_SRC); if (!pz) return;
    var h = heroOf(PLAYER_SRC);
    var act = player.act || 'idle';
    var opts = {}, frame;
    if (h && h.side) {
      opts.row = SIDE_ACT[act] || 0;
      // 侧视素材只有朝右一版（左向靠翻转），**没有正面/背面**。
      // 循环动作（走/跑/待机）沿用 face 没关系 —— 上下移动时用侧身图看起来像"斜着走"，可接受；
      // 但一次性动作（攻击/倒地）若也用 face，朝下打就会画成"正对镜头挥砍"，非常突兀。
      // 所以攻击/倒地一律用 sideFace（最近的水平朝向），保证永远是个侧面挥砍。
      var oneShot = (act === 'atkA' || act === 'atkB' || act === 'dead');
      var f = oneShot ? player.sideFace : player.face;
      /* ★ 倒走修复（v45）：等距 4 轴对应屏幕 4 个**斜向** ——
       *   down=屏幕左下、up=屏幕右上、right=屏幕右下、left=屏幕左上。
       * 侧视素材只有左右两版，斜向移动应面朝其**水平分量**：
       *   往屏幕左下走（face=down）必须面朝左、往右上走（face=up）面朝右。
       * 旧版只有 left 翻转 → 往左下走时面朝右，正是用户看到的「倒着走」。 */
      opts.flip = (f === 'left' || f === 'down');
      frame = sideFrame(act);
    } else {
      // 等距素材只有 4 个朝向行、没有独立动作行，只能近似：
      // 奔跑 = 步频加快 + 轻微起伏；攻击 = 站定第 0 帧 + 挥击弧；倒地 = 绕脚底旋转倒下。
      frame = (player.walk > 0 ? Math.floor(player.walk * (act === 'run' ? 9 : 6)) % SHEET.frames : 0);
      if (act === 'atkA' || act === 'atkB') frame = 0;
      if (act === 'dead') opts.spin = -1.35;
    }
    var bobb = (act === 'run' && !(h && h.side)) ? Math.sin(time * 18) * 1.1 : 0;
    // 侧视素材的 row 由 opts.row 决定，这里的 face 只为兼容老等距素材的 SHEET.dir 查表；
    // 侧视时传 sideFace（一次性的左右朝向），保证查表值与画面一致。
    var drawFace = (h && h.side && (act === 'atkA' || act === 'atkB' || act === 'dead'))
      ? player.sideFace : player.face;
    drawActor(pz.img, player.mx, player.my, drawFace, frame, bobb, pz.sx, pz.sy, opts);
    // ⛔ 挥砍弧光已移除（2026-09-17 用户要求）：角色用的是 CraftPix 侧视素材，
    //    本身就有完整的 atkA/atkB 挥砍动作，再叠一道弧线属于重复表现、且很突兀。
    //    （旧版注释「等距素材没有独立动作行、用弧线补足挥击感」只对老等距素材成立。）
  }
  /** NPC：站立取第 0 帧（图集已把最中性那帧旋到 0），叠一点极轻的呼吸起伏，不再是死图 */
  function drawNPC(n) {
    _draw.npc++;
    var pz = charPiece(npcCharFile(n.char)); if (!pz) return;
    var bob = Math.sin(time * 1.7 + n.x * 1.3 + n.y * 0.7) * 1.2;
    var node = drawActor(pz.img, n.x, n.y, n.face, 0, bob, pz.sx, pz.sy);
    if (!node) return;
    var near = Math.abs(player.mx - n.x) < 2.2 && Math.abs(player.my - n.y) < 2.2;
    var ty = node.top - 6 * Z;
    ctx.textAlign = 'center';
    ctx.font = 'bold ' + (12 * Z).toFixed(1) + 'px "Microsoft YaHei",sans-serif';
    ctx.lineWidth = 3.5 * Z; ctx.strokeStyle = 'rgba(6,12,24,.82)';
    ctx.strokeText(n.name, node.x, ty);
    ctx.fillStyle = near ? '#ffe9a6' : '#cfe6ff';
    ctx.fillText(n.name, node.x, ty);
    if (near && n.line) {                      // 走近了才说话
      ctx.font = (12.5 * Z).toFixed(1) + 'px "Microsoft YaHei",sans-serif';
      var w = ctx.measureText(n.line).width, pad = 7 * Z, hh = 19 * Z, ly = ty - 17 * Z;
      ctx.fillStyle = 'rgba(10,18,34,.78)';
      ctx.beginPath(); ctx.rect(node.x - w / 2 - pad, ly - hh + 6 * Z, w + pad * 2, hh); ctx.fill();
      ctx.lineWidth = 1.5 * Z; ctx.strokeStyle = 'rgba(255,215,120,.55)'; ctx.stroke();
      ctx.fillStyle = '#f2f6ff';
      ctx.fillText(n.line, node.x, ly);
    }
  }

  function render() {
    _draw.actor = 0; _draw.npc = 0; _draw.paint = 0;
    // Z<=1 保持硬边像素观感；放大时开插值，避免就近邻放大出锯齿方块
    ctx.imageSmoothingEnabled = Z > 1.02;
    drawSky();
    if (!CUR) return;
    drawGround();
    drawNodes();              // v47：地面层之上的采集点 / 宝箱（不参与深度排序，画在物件之下）
    drawClickMark();

    // 传送门画在地面上、物件下
    CUR.portals.forEach(drawPortal);

    // 物件按深度排序（x+y 大者更靠前）；NPC 与玩家一起参与排序
    // 静态物件的 k 只由坐标决定，地图加载后永不改变 —— 把排好序的数组缓存在 CUR 上，
    // 每帧只 slice 一次、再把动态项（NPC/妖兽/玩家）插进去重排。
    // 大图（外来 flare 图 36x38 有 1300+ 物件）下，这省掉每帧上千次对象分配与全量比较。
    // 地面瓦（o.gnd，由 import_tmx.py 标出）不参与深度排序 —— 它们永远在所有物件之下，
    // 单独先铺一遍即可。外来大图（flare 36x38）有 1300+ 个地面瓦，混进排序列表会把每帧拖垮。
    // 静态部分（地面 + 物件）的排序结果缓存到 CUR 上，每帧只 slice + 插动态项。
    if (!CUR._objSorted) {
      CUR._groundTiles = [];
      CUR._objSorted = [];
      // ★ 裁剪余量必须按「最高的那块瓦」来定（2026-09-17 修，曾因固定 2.2 格漏画 25 个物件）。
      //   瓦是**向上生长**的：锚点在 (x,y)，绘制区间是 [by-oh, by]。
      //   所以锚点跑到屏幕下方之外时，它的上半截仍可能在屏幕里 —— 一块 512px 高的石墙
      //   在 Z=1.72 下向上伸 881px（≈17~29 格），只留 2.2 格余量必然把它整块裁掉。
      //   正确做法：余量 = 最大 oh / (HH*Z) 格，两侧都留。
      var maxOH = 0, maxOW = 0;
      CUR.objects.forEach(function (o, i) {
        var k = (o.x + (o.fw || 1) - 1) + (o.y + (o.fh || 1) - 1) + 0.5;
        var pz = piece(o.piece);
        if (pz) {
          if (pz.h > maxOH) maxOH = pz.h;
          if (pz.w > maxOW) maxOW = pz.w;
        }
        if (o.gnd) CUR._groundTiles.push({ k: k, i: i, o: o });
        else CUR._objSorted.push({ k: k, i: i, o: o });
      });
      CUR._maxOH = maxOH; CUR._maxOW = maxOW;
      CUR._groundTiles.sort(function (a, b) { return a.k - b.k; });
      CUR._objSorted.sort(function (a, b) { return a.k - b.k; });
      // ★ 建索引：把排序后的 k 抽成 Float 数组（只在换图/首次渲染时做一次），
      //   供下面二分求出「k 落在可见区间」的子区间，避免每帧全量遍历。
      CUR._groundKs = CUR._groundTiles.map(function (it) { return it.k; });
      CUR._objKs = CUR._objSorted.map(function (it) { return it.k; });
    }
    // ★★ 视口裁剪（2026-09-17）★★
    // 旧版每帧把**全部**地面瓦过一遍 paintObj，靠函数内的边界判断剔除 ——
    // 洛赫港 2564 个地面瓦 + 墓园 3096 个，等于每帧白白算几千次投影与比较（纯粹浪费）。
    // 等距投影有个漂亮性质：屏幕 y = (x+y)*HH*Z + camY，所以「屏幕上下的可见范围」
    // 直接对应 k=x+y 的一个区间。列表又已按 k 排好序 → 二分出子区间即可，O(log n)。
    //
    // ⚠ 余量怎么定（这里踩过一次，写清楚免得再错）：
    //   瓦向上生长，绘制区间是 [by-oh, by]（oh = 瓦高 × Z）。锚点在屏幕下方之外时，
    //   它的**上半截仍可能在屏幕里** → 向下那侧必须留「最高瓦」的余量，不能拍脑袋写 2.2。
    //   实测洛赫港有 512px 高的石墙、366px 高的树，Z 最大 1.72 → 向上伸 881px ≈ 17~29 格。
    //   初始版固定留 2.2 格，被自测 ?autotest=cull 抓到 25 个「本该看得见却被裁掉」。
    //   横向（x-y）同理，只是瓦宽都不大，留一点就够，其余交给 paintObj 的边界判断兜底。
    var padK = (CUR._maxOH || 0) * Z / (HH * Z) + 2.2;   // = maxOH/HH + 2.2（Z 约掉）
    var padX = (CUR._maxOW || 0) * Z / (HW * Z) + 2.2;   // 横向：maxOW/HW + 2.2
    var kLo = (0 - camY) / (HH * Z) - padK - padX;       // 屏幕 y=0  对应 k（两侧都留够）
    var kHi = (H - camY) / (HH * Z) + padK + padX;       // 屏幕 y=H  对应 k
    // 二分：第一个 k >= lo 的下标（lowerBound）
    function lowerBound(arr, lo) {
      var a = 0, b = arr.length;
      while (a < b) { var m = (a + b) >> 1; if (arr[m] < lo) a = m + 1; else b = m; }
      return a;
    }
    function upperBound(arr, hi) {
      var a = 0, b = arr.length;
      while (a < b) { var m = (a + b) >> 1; if (arr[m] <= hi) a = m + 1; else b = m; }
      return a;
    }
    var gKs = CUR._groundKs || [], gA = lowerBound(gKs, kLo), gB = upperBound(gKs, kHi);
    var oKs = CUR._objKs || [], oA = lowerBound(oKs, kLo), oB = upperBound(oKs, kHi);
    // 诊断用：把本帧的 k 区间暴露给 ?autotest=cull（正常帧不读它）
    kLoDbg = kLo; kHiDbg = kHi;
    // CULL_OFF：只给 ?autotest=cull 用 —— 临时关掉裁剪、全量遍历，取"正确基准"来比对。
    // 正常游戏永远是 false，这行不产生任何开销（一个布尔判断）。
    if (CULL_OFF) { gA = 0; gB = gKs.length; oA = 0; oB = oKs.length; }

    // 画一个地图物件（地面瓦与普通物件共用同一套对齐/裁剪/视野判断）
    function paintObj(o, oi) {
      var pz = piece(o.piece);
      if (!pz) return;
      var ax = o.x + ((o.fw || 1) - 1) / 2, ay = o.y + ((o.fh || 1) - 1) / 2;
      var p = isoToScreen(ax, ay);
      var bx = p.x, by = p.y + HH * Z + (o.dy || 0) * Z;
      var ow = pz.w * Z, oh = pz.h * Z;
      if (bx < -ow || bx > W + ow || by < -oh * 1.4 || by > H + oh * 1.6) return;
      _draw.paint++;   // 真正落笔的物件数（裁剪正确性断言用，见 ?autotest=cull）
      if (paintTracker) paintTracker[oi] = 1;
      ctx.drawImage(pz.img, pz.sx, pz.sy, pz.w, pz.h,
                    Math.round(bx - ow / 2), Math.round(by - oh), Math.round(ow), Math.round(oh));
    }

    // 地面先铺，再画排好序的物件（含 NPC / 妖兽 / 玩家）。
    // 只画可见 k 区间内的那一段（gA..gB），其余当帧必然在屏幕外。
    _draw.scan = (gB - gA) + (oB - oA);     // 本帧遍历的静态条目数（性能观测）
    for (var gi = gA; gi < gB; gi++) paintObj(CUR._groundTiles[gi].o, CUR._groundTiles[gi].i);

    var list = CUR._objSorted.slice(oA, oB);
    (CUR.npcs || []).forEach(function (n) { list.push({ k: n.x + n.y + 0.01, i: -2, o: n }); });
    // 掉落物也用 k 排序参与遮挡 —— 掉在树后要能被树挡住，不然会「浮」在画面上。
    // i=-4：排在妖兽（-3）之前判断，避免落到下面那个 i===-1 的玩家分支。
    lootDrops.forEach(function (L) { list.push({ k: L.mx + L.my - 0.02, i: -4, o: L }); });
    foes.forEach(function (f) { list.push({ k: f.x + f.y, i: -3, o: f }); });
    list.push({ k: player.mx + player.my, i: -1, o: null });
    list.sort(function (a, b) { return a.k - b.k; });

    list.forEach(function (it) {
      // 注意顺序：掉落物 i=-4、妖兽 i=-3、NPC i=-2、玩家 i=-1，都 <0。
      // 必须先判 -4/-3/-2 再判 -1，否则会被当成玩家/物件错画。
      if (it.i === -4) { drawLoot(it.o); return; }
      if (it.i === -3) { drawFoe(it.o); return; }
      if (it.i === -2) { drawNPC(it.o); return; }
      if (it.i === -1) { drawCharacter(); return; }
      paintObj(it.o, it.i);
    });
    drawProjectiles(); // 弹道（火球）画在怪之上、特效之下 —— 爆炸要盖住火球尾焰
    drawSkillFx();    // 技能特效（剑气/雷爆/剑雨）画在飘字下面，别盖住伤害数字
    drawFloaters();   // 伤害飘字 + 击杀粒子（猎场用）

    // 地宫氛围层：以玩家为中心的「灯笼光晕」——近处亮、远处沉入黑暗，
    // 再加一圈冷色边缘暗角，营造地下空间纵深。纯视觉，不影响任何玩法判定。
    if (CUR.id === 'dungeon') {
      var pp = isoToScreen(player.mx, player.my);
      var ppy = pp.y + HH * Z;   // 以脚底为光心（isoToScreen 返回格顶）
      var lr = Math.max(W, H) * 0.62;
      var lit = ctx.createRadialGradient(pp.x, ppy, Math.min(W, H) * 0.18, pp.x, ppy, lr);
      lit.addColorStop(0, 'rgba(5,8,18,0)');
      lit.addColorStop(0.55, 'rgba(5,8,18,0.18)');
      lit.addColorStop(1, 'rgba(4,6,15,0.52)');
      ctx.fillStyle = lit; ctx.fillRect(0, 0, W, H);
      // 光晕中心带一点暖色，模拟火把/灯笼
      var warm = ctx.createRadialGradient(pp.x, ppy, 0, pp.x, ppy, Math.min(W, H) * 0.22);
      warm.addColorStop(0, 'rgba(255,196,120,0.07)');
      warm.addColorStop(1, 'rgba(255,196,120,0)');
      ctx.fillStyle = warm; ctx.fillRect(0, 0, W, H);
    }

    // 洞外虚空柔化（地图边缘渐隐）；地宫改用暗色暗角，和灯笼光晕统一
    var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.30, W / 2, H / 2, Math.max(W, H) * 0.72);
    if (CUR.id === 'dungeon') {
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(3,5,12,.5)');
    } else {
      vg.addColorStop(0, 'rgba(255,255,255,0)');
      vg.addColorStop(1, 'rgba(180,220,240,.16)');
    }
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    // 受重击红闪：给"被击退"一个明确的画面反馈，不再是无声无息地换个位置
    if (screenFlash > 0) {
      ctx.fillStyle = 'rgba(190,30,40,' + (screenFlash * 0.55).toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    if (fadeA > 0) {
      ctx.fillStyle = 'rgba(7,12,26,' + fadeA.toFixed(3) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    drawHealFx();      // 服药的脚下涟漪（没在服药时零开销）
    drawRealmFx();     // 突破的金环 + 光柱（同上，realmFx=0 时立刻 return）
    updateHUD();
    updateSkillUI();   // 技能冷却遮罩与倒计时
    updateMinimap();   // 右上角缩略图（内部有脏检查，不是每帧都重画）
    renderBag();       // 背包格子（脏标记驱动，不是每帧都碰 DOM）
  }

  // ---------------- 逻辑 ----------------
  function switchTo(id, x, y, silent) {
    CUR = IDX[id] || MAPS[0];
    // 落点若压在实体/虚空上（传送门落点、?x=&y= 手写坐标都可能），就近吸附到可走格，
    // 否则玩家一落地就卡死、连传送阵都触发不了。
    var sp = snapWalkable(CUR, x, y);
    x = sp.x; y = sp.y;
    player.mx = player.tx = x; player.my = player.ty = y;
    player.face = 'down'; player.walk = 0; player.path = null;
    portalLock = 0.5;
    camX = W / 2 - (x - y) * HW * Z;
    camY = H / 2 - (x + y) * HH * Z;
    document.getElementById('mapName').textContent = CUR.name;
    var btns = document.querySelectorAll('#mapBtns button');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('on', btns[i].dataset.id === CUR.id);
    refreshWorldOn();        // 世界地图总览里当前节点同步高亮
    var hintEl = document.getElementById('hint');
    if (silent) hintEl.textContent = '踩上青色光门即可切换地图';
    else if (CUR.id === 'qingxuan') hintEl.textContent = '青玄山门 · 人物调试场：空地试移动，石傀试招（J 攻击A / K 重击B / U 御剑诀 / I 雷罡咒 / O 太虚剑域 / 1~6 试动作）';
    else if (CUR.id === 'lingquan') hintEl.textContent = '灵泉灵瀑 · 妖兽领地：牛魔 / 游方 / 蛇妖 / 铠甲卫 / 小僵尸 五族共 ' + LINGQUAN_SPAWNS.length + ' 只（J 普攻 / K 重击 / U·I·O 三招技能，Shift 奔跑）';
    else if (CUR.id === 'dungeon') hintEl.textContent = '幽冥地宫 · 尸气弥漫：小僵尸 ' + DUNGEON_SPAWNS.length + ' 只盘踞各处，南/西/东三门分别通往青玄山门 / 灵泉灵瀑 / 碑林石阵';
    else if (CUR.id === 'flare_grass_empyrean_campaign_lochport')
      hintEl.textContent = '洛赫港 · 绿林劫道：游方 / 牛魔 / 蛇妖 共 ' + LOCHPORT_SPAWNS.length + ' 只散落全港（最近两只离出生点 9 格开外，不扎堆）。J 普攻 / K 重击 / U·I·O 三招技能 / Shift 奔跑 · 地上带光圈的都是掉落物，走过去自动拾取';
    else if (CUR.id === 'flare_grass_empyrean_campaign_lochport_cemetery')
      hintEl.textContent = '洛赫港墓园 · 尸气盘桓：' + CEMETERY_SPAWNS.length + ' 只（小僵尸成群 + 牛魔守陵），越往里越硬';
    else hintEl.textContent = '已传送至「' + CUR.name + '」 · ' + CUR.note;
    // 刷怪表：碑林石阵（猎场）/ 青玄山门（调试场）/ 灵泉灵瀑（五族）/ 幽冥地宫（僵尸群）
    // / 洛赫港（绿林劫道）/ 洛赫港墓园（僵尸盘桓）；其它图清空战斗状态
    if (CUR.id === 'beilin') { foes = makeFoes(BEILIN_SPAWNS); }          // 碑林石阵：老猎场
    else if (CUR.id === 'qingxuan') { foes = makeFoes(QINGXUAN_SPAWNS); }  // 青玄山门：调试场
    else if (CUR.id === 'lingquan') { foes = makeFoes(LINGQUAN_SPAWNS); }  // 灵泉灵瀑：五族怪物
    else if (CUR.id === 'dungeon') { foes = makeFoes(DUNGEON_SPAWNS); }    // 幽冥地宫：小僵尸群
    else if (CUR.id === 'flare_grass_empyrean_campaign_lochport') { foes = makeFoes(LOCHPORT_SPAWNS); }
    else if (CUR.id === 'flare_grass_empyrean_campaign_lochport_cemetery') { foes = makeFoes(CEMETERY_SPAWNS); }
    else { foes = []; floaters = []; particles = []; player.targetFoe = null; }
    // 地上的掉落物是「这张图的」，换图一律清掉 —— 不然坐标会飘到新图的地上。
    // 背包（bag）与银两是**角色**的，跨图保留。
    lootDrops = [];
    makeNodes();   // v47：按地图随机刷采集点 / 宝箱（与 foes 同生命周期：换图重随，不存盘）
    // 重置主角动作，避免带着上一张图的攻击/倒地状态进来
    player.act = 'idle'; player.actT = 0; player.actHold = 0;
    player.dead = false;
    /* 坊市换货：**只在换图时补**（规矩 ④）—— 若改成"打开商店就补"，
     * "开→关→开"即可无限刷货，现货的稀缺性与"换张图看看货"的动力一起消失。
     * 放在 saveGame 之前，让新货跟着这一笔一起落盘。 */
    restockShop();
    /* 换图必存：地图入口/密度各不相同，读档落回最近一张图比落回入口图体感好得多。
     * silent=true（不弹提示），否则每次过传送门都被提示刷屏。 */
    saveGame(true);
    autosaveT = 0;
    breakCombo();                     // 换图也断连，别把上一张图的连击带过来
  }

  function couldStand(x, y) {
    // ⚠️ 这里必须只用「整数格」采样。
    // 旧版写成 walkable(Math.round(x) - 0.25, ...) 之类，落到 CUR.ground[y][11.75]
    // 取到 undefined，walkable 恒为 false —— 表现就是「WASD 只能转向、走不动」。
    // 现在：目标格可走即可（配合横纵分轴推进，天然获得贴墙滑行手感）。
    return walkable(Math.round(x), Math.round(y));
  }

  // ---------------- 妖兽寻路（格级 BFS） ----------------
  // 妖兽原本只会「朝玩家直线推进」。碑林石阵地形开阔看不出问题，但灵泉灵瀑有大块
  // 实心石柱与水面 —— 直线一撞上就原地顶着柱子打转，玩家看到的就是「这怪不咬人」。
  // 这里做一件很便宜的事：直线上有障碍时，用 4 连通 BFS 在 30×30 的走格图上找一条
  // 绕行路径，怪沿路点走。搜索封顶 PATH_CELLS 格，11 只怪、每只 0.6 秒算一次，
  // 量级是每秒一万多次数组读写，弱机也扛得住。
  var PATH_CELLS = 900;     // 单次 BFS 最多展开的格数（30×30 全覆盖）
  var PATH_EVERY = 0.6;     // 重算间隔（秒）
  // ⚠ 踩过的坑：一开始用「这一步能不能落脚」判断有没有被挡。怪和玩家几乎同 y 时
  //   （dy≈0）垂直轴恒可落脚，于是整体判成「没被挡」，怪一头顶在石柱上永远不寻路。
  //   改成按整数格做视线检查后，判据不再随亚格抖动翻转。
  function losClear(x0, y0, x1, y1) {
    var dx = x1 - x0, dy = y1 - y0;
    var n = Math.max(2, Math.ceil(Math.hypot(dx, dy) * 4));   // 每格采 4 点，够密且便宜
    for (var i = 1; i <= n - 1; i++) {
      var t = i / n;
      if (!walkable(Math.round(x0 + dx * t), Math.round(y0 + dy * t))) return false;
    }
    return true;
  }
  // 逐帧覆盖的调试槽（预分配、零 GC），?autotest= 时读它核对寻路是否真的在跑
  var chaseDbg = { key: '', los: 0, sx: 0, sy: 0, bp: '', path: 0 };
  function bfsNext(sx, sy, tx, ty, mp) {
    sx = Math.round(sx); sy = Math.round(sy);
    tx = Math.round(tx); ty = Math.round(ty);
    if (sx === tx && sy === ty) return null;
    // 玩家脚下未必落在可走格上（贴墙站位、?x=&y= 手写坐标都会），就近吸附一格再搜
    if (!walkable(tx, ty)) {
      var tp = snapWalkable(mp, tx, ty);
      tx = tp.x; ty = tp.y;
    }
    if (!walkable(tx, ty)) return null;      // 真的没有可落脚的目标 → 退回直线行为
    var mw = mp.w, mh = mp.h;
    var prev = new Int32Array(mw * mh).fill(-1);
    var q = [sy * mw + sx];
    prev[sy * mw + sx] = -2;                 // -2 = 起点标记
    var goal = ty * mw + tx, head = 0, seen = 0, found = -1;
    while (head < q.length && seen < PATH_CELLS) {
      var cur = q[head++]; seen++;
      if (cur === goal) { found = cur; break; }
      var cx = cur % mw, cy = (cur - cx) / mw;
      for (var d = 0; d < 4; d++) {
        var nx = cx + (d === 0 ? 1 : (d === 1 ? -1 : 0));
        var ny = cy + (d === 2 ? 1 : (d === 3 ? -1 : 0));
        if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
        var ni = ny * mw + nx;
        if (prev[ni] !== -1 || !walkable(nx, ny)) continue;
        prev[ni] = cur;
        q.push(ni);
      }
    }
    if (found < 0) return null;              // 走不到（被水面/石柱完全隔开）
    // 回溯到「起点的下一格」= 本帧该走的方向。
    // ⚠ 判据是「当前格的父格是起点」，不是「当前格是起点」—— 后者会一路退到起点本身，
    //   于是怪拿到 wx=wy=0、原地不动，表现和没寻路一模一样。
    var node = found;
    while (prev[node] !== -2 && prev[prev[node]] !== -2) node = prev[node];
    return { x: node % mw, y: (node - node % mw) / mw };
  }

  // 点击寻路的 BFS：返回从 (sx,sy) 到 (tx,ty) 的逐格路径（不含起点），不可达返回 null。
  // 地图最大 34×34＝1156 格，四邻搜索开销可忽略，不需要 A*。
  // 为什么需要它：点击移动原本是「朝目标直线推进」且不做碰撞，会穿墙；
  // 只加碰撞不加绕路，遇到建筑就会卡在半路，反而不如从前的「总能走到」。
  function findPath(sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return null;
    if (!walkable(tx, ty)) return null;
    var N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    var seen = {}, prev = {};
    var sk = sx + ',' + sy;
    seen[sk] = 1;
    var queue = [[sx, sy]], head = 0;
    while (head < queue.length) {
      var cx = queue[head][0], cy = queue[head][1];
      head++;
      if (cx === tx && cy === ty) {
        var path = [], kx = tx, ky = ty;
        while (!(kx === sx && ky === sy)) {
          path.push([kx, ky]);
          var pk = prev[kx + ',' + ky];
          kx = pk[0]; ky = pk[1];
        }
        path.reverse();
        return path;
      }
      for (var n = 0; n < 4; n++) {
        var ax = cx + N4[n][0], ay = cy + N4[n][1], ak = ax + ',' + ay;
        if (seen[ak] || !walkable(ax, ay)) continue;
        seen[ak] = 1; prev[ak] = [cx, cy];
        queue.push([ax, ay]);
      }
    }
    return null;
  }
  /** 把一个可能落在实体/虚空上的坐标吸附到最近的合法可走格（BFS 同心圈） */
  function snapWalkable(mp, x, y) {
    /* ★★ 只允许**整数格**进查表（2026-09-18 用户报「加载失败 · reading '12.32'」的根因）：
     * 读档传进来的是存档里的小数坐标（saveGame 写的是 `+player.mx.toFixed(2)`），
     * 原先直接喂给 walkable → cellChar → `CUR.ground[20.32]` —— 行下标是小数，
     * 该行取到 undefined，再取 `[12.32]` 当场抛异常。异常发生在 boot 链的 switchTo 里，
     * 表现就是「加载失败 + 进度 100%」，整局进不去（存档在，但一读就崩）。
     * ⚠ 小数坐标不是边角情况：自动存档 = 每 15 秒 + 换图 + 关页面，
     *   **多半都在走路的半途触发**，所以存量档里小数才是常态。
     * 落点必须吸附到格子上，那就老老实实先取整再探。
     * 坐标彻底坏掉（null / NaN，见 readSave）时别落回 (0,0) 那种角落 —— 用出生点。 */
    if (!isFinite(x) || !isFinite(y)) return { x: mp.home.x, y: mp.home.y };
    x = Math.round(x); y = Math.round(y);
    if (walkable(x, y)) return { x: x, y: y };
    for (var r = 1; r <= 12; r++) {
      var best = null, bd = 1e9;
      for (var dx = -r; dx <= r; dx++) {
        for (var dy = -r; dy <= r; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          var nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= mp.w || ny >= mp.h) continue;
          if (WALK.indexOf(mp.ground[ny][nx]) < 0 || mp.solid['' + nx + ',' + ny]) continue;
          var d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = { x: nx, y: ny }; }
        }
      }
      if (best) return best;
    }
    return { x: mp.home.x, y: mp.home.y };
  }

  var keys = {};
  /* ── Esc 的统一语义（v58）：**从最里面那一层往外关，一次只关一层**。
   * 优先级 = 视觉层级：确认框 > 装备操作卡 > 坊市 > 世界地图 > 背包。
   * 三条纪律，改以前先读：
   *   ① **一次只关一层**。原来"关世界地图"那条写在最后，于是操作卡开着时按 Esc
   *      会把背后的地图一起关掉 —— 玩家按一下，关掉的是他根本没看见的那层。
   *   ② **背包不吞按键**：背包是常驻侧栏（可以边打边开），不是模态浮层。
   *      给它加按键拦截会顺手废掉"开着背包继续打"这个正常玩法；
   *      另外四层都是模态，才需要把背后的走位/出手全部吞掉。
   *   ③ ⛔ **场景缩略图（#minimap）不归 Esc 管**。它是常驻 HUD，折叠由右上角 ▾ 负责。
   *      Esc 顺手把它收掉 = 玩家"想关地图，结果把小地图也弄没了"，还得自己找回来。
   */
  function escLayer() {
    if (pauseOpen) { closePause(); return 'pause'; }
    if (confirmOpen()) { closeConfirm(false); return 'confirm'; }
    if (cardOpen()) { closeGearCard(); return 'card'; }
    if (shopOpen()) { closeShop(); return 'shop'; }
    if (worldOpen) { closeWorld(); return 'world'; }
    if (bagOpen) { bagToggle(false); return 'bag'; }
    return '';
  }
  window.addEventListener('keydown', function (e) {
    var k = e.key;
    /* Esc 统一入口：必须在下面几个"模态吞按键"分支**之前**，否则会先被它们吞掉。
     * 另外这里必须 return —— 原来 Esc 会一路掉进 keys['escape']=1，
     * 表现就是"浮层开着、角色还在背后正常走位"。 */
    if (k === 'Escape') { e.preventDefault(); if (!escLayer()) openPause(); return; }
    /* 确认框开着时所有按键归它：Enter = 确定，其余一律吞掉。
     * 不做这层拦截的话，弹窗浮在上面、人在背后还在走位出手 —— 点个确认回来已经死了。 */
    if (confirmOpen()) {
      if (k === 'Enter') { e.preventDefault(); closeConfirm(true); }
      else if (k === 'Tab' || k.indexOf('Arrow') === 0 || k.length === 1) e.preventDefault();
      return;
    }
    /* 装备操作卡同理：开着时按键全归它（Enter = 关掉，别让角色在背后走位）。 */
    if (cardOpen()) {
      if (k === 'Enter') { e.preventDefault(); closeGearCard(); }
      else if (k === 'Tab' || k.indexOf('Arrow') === 0 || k.length === 1) e.preventDefault();
      return;
    }
    /* 坊市（z-index 135，比操作卡还高）：开着时按键全归它，同样别让角色在背后走位。 */
    if (shopOpen()) {
      if (k === 'Enter') { e.preventDefault(); closeShop(); }
      else if (k === 'Tab' || k.indexOf('Arrow') === 0 || k.length === 1) e.preventDefault();
      return;
    }
    // Tab 开/关世界地图（打开时背后游戏暂停移动）。都拦掉默认行为避免焦点乱跳。
    if (k === 'Tab') { e.preventDefault(); toggleWorld(); return; }
    if (worldOpen) return;
    keys[k.toLowerCase()] = 1;
    if (k.indexOf('Arrow') === 0) e.preventDefault();
    // 出手：J / F / 空格 = 攻击 A（普攻）；K = 攻击 B（重击）
    if (k === ' ' || k === 'Spacebar') { e.preventDefault(); attackNearest(); return; }
    if (k === 'j' || k === 'J' || k === 'f' || k === 'F') { e.preventDefault(); attackNearest(); return; }
    if (k === 'k' || k === 'K') { e.preventDefault(); powerAttack(); return; }
    // 技能：按键映射由 SKILLS 表的 key 字段生成（当前 U / I / O / P）
    var ski = SKILL_KEYS[k.toLowerCase()];
    if (ski !== undefined) { e.preventDefault(); castSkill(ski); return; }
    // 背包：B 开关
    if (k === 'b' || k === 'B') { e.preventDefault(); bagToggle(); return; }
    // 服药：1 / 2 / 3 对应 金创药 / 小还丹 / 大还丹（1~3 是玩家最顺手的键位，给药不亏）
    if (k === '1' || k === '2' || k === '3') {
      e.preventDefault();
      useHeal({ '1': 'jinchuang', '2': 'xiaohuan', '3': 'dahuan' }[k]);
      return;
    }
    // 动作试演：Alt+1~6 直接切到对应动作，方便逐个核对素材（待机/行走/奔跑/攻击A/攻击B/倒地）
    // ★ 2026-09-17 从裸 1~6 改成 Alt+：裸数字键已让给「服药」（战斗中最常按、必须零门槛），
    //   试演是开发期核对素材用的，加个修饰键不碍事。
    if (e.altKey) {
      var demo = { '1': 'idle', '2': 'walk', '3': 'run', '4': 'atkA', '5': 'atkB', '6': 'dead' }[k];
      if (demo) { e.preventDefault(); playAct(demo); return; }
    }
    // 键盘缩放：+ / - 步进，0 复位
    if (k === '+' || k === '=') zoomBy(ZSTEP, W / 2, H / 2);
    else if (k === '-' || k === '_') zoomBy(1 / ZSTEP, W / 2, H / 2);
    else if (k === '0') {                       // 0 = 复位到平台默认（桌面 100% / 触屏最广）
      try { localStorage.removeItem('isles.zoom'); } catch (e) { }
      setZoom(ZDEF, W / 2, H / 2, true, false);
    }
  });
  window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = 0; });

  // 浮动摇杆的当前输入（触屏端由 initMobile 写入；桌面端恒为 0，不影响键盘）
  var joyVec = { x: 0, y: 0, run: false };

  function inputDir() {
    // 世界地图打开时背后游戏不动（键盘/摇杆都不接管）
    if (worldOpen) return { dx: 0, dy: 0 };
    // 摇杆推着的时候优先接管（模拟量 0~1）；松开/没推就走键盘
    if (joyVec.x || joyVec.y) return { dx: joyVec.x, dy: joyVec.y };
    var dx = 0, dy = 0;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    return { dx: dx, dy: dy };
  }

  // 四向朝向：统一按「行进方向」判定，键盘与点击移动共用这一处。
  // 旧版把这段内联在键盘分支里，点击移动压根没更新朝向 ——
  // 表现就是点地面走路时角色永远保持初始的正面(down)。
  function setFaceFromDelta(dx, dy) {
    if (!dx && !dy) return;
    if (Math.abs(dx) > Math.abs(dy)) player.face = dx > 0 ? 'right' : 'left';
    else player.face = dy > 0 ? 'down' : 'up';
    /* 侧视素材只有左右两版：顺手记下最近的水平朝向（纯上下移动时保留上次的值），
     * 攻击/倒地这类一次性动作靠它取图，避免画出"朝镜头挥砍"。
     * ★ 但一次性动作播放期间（actHold>0）**不许再改** —— 见 faceToward 的说明：
     *   攻击那一瞬间朝向已经定死了，动作播到一半被方向键翻转，画面上就成了
     *   "同一刀越挥越歪"，比不转身更奇怪。 */
    if (dx && player.actHold <= 0) player.sideFace = dx > 0 ? 'right' : 'left';
  }
  /* ★ 朝某个点转身 —— 「面向目标」的唯一入口（v57）。
   * 它一次定**两个**朝向，别只定一个：
   *   player.face     = map 轴四向（扇形判定 inFacingArc 用这个）
   *   player.sideFace = 屏幕上的左/右（侧视素材只有左右两版，画攻击动作用这个）
   * ★ 关键：**屏幕左右 ≠ map 的 x 正负**。等距投影下 map +x 画到屏幕右下、map +y 画到
   *   屏幕左下，所以"目标在屏幕的哪一边"= sign(dx - dy)，不是 sign(dx)。
   *   这是「背对怪物攻击」的根因：旧版 sideFace 只记"最近一次水平**移动**方向"，
   *   于是从右边跑来打脚下的怪（map +y）时 sideFace 还是 right → 画出朝右挥砍，
   *   而怪在屏幕左下 —— 玩家看到的就是背对着怪砍。
   *   （先 setFaceFromDelta 再算 sideFace：前者在 |dx|>|dy| 时也会写 sideFace，
   *     顺序反了会被它用 map 轴的 x 符号盖掉。） */
  function faceToward(mx, my) {
    var dx = mx - player.mx, dy = my - player.my;
    if (!dx && !dy) return;
    setFaceFromDelta(dx, dy);
    // 动作播放中朝向已锁定（同上）；这样一次攻击动作永远是同一个方向
    if (player.actHold > 0) return;
    var s = dx - dy;
    if (s > 1e-6) player.sideFace = 'right';
    else if (s < -1e-6) player.sideFace = 'left';
    // s≈0 = 目标在屏幕正上/正下方，左右都是侧身 —— 保持上一次的值，免得来回抖
  }
  /* 模态浮层开着时不接管移动/出手。少了这道闸，开着世界地图或确认框站在怪旁边，
   * 角色会在浮层背后继续自动追打、还把玩家带离原位（输入被浮层吃掉了，人却还在动）。 */
  function canAutoFight() {
    return !player.dead && !worldOpen && !cardOpen() && !confirmOpen() && !shopOpen();
  }

  function update(dt) {
    time += dt;
    stepZoom(dt);
    /* 自动存档：把"要记得存档"这件事从玩家身上拿走。
     * 15 秒一次、且只在 ready 之后（saveGame 内部有这道闸），成本是一次 JSON.stringify。 */
    autosaveT += dt;
    if (autosaveT >= AUTOSAVE_EVERY) { autosaveT = 0; saveGame(true); }
    if (portalLock > 0) portalLock -= dt;

    // —— 过渡状态机 ——
    if (fadeDir === 1) {
      fadeA += dt / 0.42;
      if (HOLD && fadeA >= 0.55) { fadeA = 0.55; held = true; }
      if (fadeA >= 1) { fadeA = 1; var pt = pending; pending = null; goTo(pt.to, pt.spawnX, pt.spawnY, false); fadeDir = -1; }
    } else if (fadeDir === -1) {
      fadeA -= dt / 0.42;
      if (fadeA <= 0) { fadeA = 0; fadeDir = 0; }
    }
    if (fadeDir !== 0) { updateCam(dt); return; }

    // —— 动作状态机 ——
    // actHold > 0 表示正在播一次性动作（攻击/倒地），期间不被行走状态覆盖；
    // 播完自动回 idle。倒地结束时在这里起身（保留一口气 + 短暂无敌）。
    if (player.actHold > 0) {
      player.actHold -= dt;
      player.actT += dt;
      if (player.actHold <= 0) {
        player.actHold = 0;
        if (player.dead) {
          player.dead = false;
          player.hp = Math.round(player.maxhp * 0.6);   // 留一口气，给撤退的机会
          player.invuln = 2.2;
          toast('起身！2 秒内无敌，可撤或反打');
        }
        player.act = 'idle'; player.actT = 0;
      }
    }
    if (player.atkBCd > 0) player.atkBCd = Math.max(0, player.atkBCd - dt);
    if (healCd > 0) { healCd = Math.max(0, healCd - dt); bagDirty = true; }   // 冷却结束要立刻解除格子的灰化
    if (healFx > 0) healFx = Math.max(0, healFx - dt);
    if (realmFx > 0) realmFx = Math.max(0, realmFx - dt);
    updateLoot(dt);            // 掉落物：老化 + 拾取判定
    updateGather(dt);          // v47：走到采集点/宝箱跟前自动采集/开启
    for (var sk = 0; sk < player.skillCd.length; sk++) {
      if (player.skillCd[sk] > 0) player.skillCd[sk] = Math.max(0, player.skillCd[sk] - dt);
    }
    updateSkillFx(dt);

    var d = inputDir();
    if (player.dead) d = { dx: 0, dy: 0 };              // 倒地期间不接受移动输入
    var running = !!((keys['shift'] || joyVec.run) && (d.dx || d.dy));  // 按住 Shift / 摇杆推满 = 奔跑
    var speed = 3.8 * (running ? RUN_MUL : 1)
      * (buffT.shenxing > 0 ? BUFFS.shenxing.mul : 1);   // v58 神行符：只影响走路，不影响攻速/出手
    var px0 = player.mx, py0 = player.my;

    if (d.dx || d.dy) {
      // 键盘直推：x/y 分轴推进，撞到实体时自动沿墙滑行
      var nx = player.mx + d.dx * speed * dt, ny = player.my + d.dy * speed * dt;
      if (couldStand(nx, player.my)) player.mx = nx;
      if (couldStand(player.mx, ny)) player.my = ny;
      // 键盘操作即取消点击寻路：tx/ty 直接对齐当前坐标而不是四舍五入 ——
      // 取整会留下 0.0~0.5 格的残差，松手后会被点击分支当成「还有目标」，
      // 于是角色一边往回挪一点点、一边把朝向翻成反方向（test: keyboard d 抓到的回归）
      player.path = null;
      player.tx = player.mx; player.ty = player.my;
      // 按下方向键立刻转身（哪怕前面被挡，也该先转过来）
      setFaceFromDelta(d.dx, d.dy);
    } else if (player.path && player.path.length) {
      // 点击寻路：沿 BFS 路径逐格跟随。路径点都是四邻相邻格，
      // 两点之间直线只经过这两格，所以不需要再做碰撞检测，也不会穿墙。
      var wp = player.path[0];
      var dx = wp[0] - player.mx, dy = wp[1] - player.my;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var stepLen = speed * dt;
      if (dist <= stepLen) {
        player.mx = wp[0]; player.my = wp[1];
        player.path.shift();
        if (!player.path.length) { player.path = null; player.tx = player.mx; player.ty = player.my; }
      } else {
        var ux = dx / dist, uy = dy / dist;
        player.mx += ux * stepLen;
        player.my += uy * stepLen;
      }
      // ★ 这里原来什么都没有 —— 点击移动全程不更新朝向，所以角色永远正对镜头
      setFaceFromDelta(dx, dy);
    } else if (canAutoFight() && player.targetFoe && player.targetFoe.alive) {
      /* 锁定妖兽后：自己走过去 → 贴脸自动出手（出手仍受冷却约束）。这一段是
       * 「点击怪物 = 自动平A」的全部实现，玩家不需要再按任何键。
       *
       * v57 三处修正（都是上一条更早版本的漏）：
       *   ① 转身提到分支最外层 —— 旧版只在"还够远、正在走"那一条里转身，
       *      站到攻击距离等冷却的那 0.65 秒里**不转身**，怪一绕背就成了"背对着怪等CD"。
       *   ② 加了 AGGRO 上限 —— 旧版没有距离上限，点一下就被拽着追出半张地图。
       *   ③ 被水/断崖隔开时会原地抖 —— 卡住 0.5 秒就绕一次路（复用点击寻路），
       *      绕不通就放弃并明说，而不是让玩家看着角色贴着岸边抽搐。 */
      var tf = player.targetFoe;
      var tdx = tf.x - player.mx, tdy = tf.y - player.my, tdist = Math.hypot(tdx, tdy);
      if (tdist > AGGRO) {
        player.targetFoe = null;                  // 跟丢了：停手，别一路追过去
      } else {
        faceToward(tf.x, tf.y);                   // 无论要走还是要打，先朝它
        if (tdist > MELEE - 0.1) {
          var tux = tdx / (tdist || 1), tuy = tdy / (tdist || 1), tsp = speed * dt;
          var px1 = player.mx, py1 = player.my;
          if (couldStand(player.mx + tux * tsp, player.my)) player.mx += tux * tsp;
          if (couldStand(player.mx, player.my + tuy * tsp)) player.my += tuy * tsp;
          player.walk = player.walk + dt;
          var stick = (Math.abs(player.mx - px1) < 1e-6 && Math.abs(player.my - py1) < 1e-6);
          player.foeStuck = stick ? player.foeStuck + dt : 0;
          if (player.foeStuck > 0.5 && !player.foeChased) {
            player.foeChased = true;              // 只试一次，别每 0.5 秒跑一遍 BFS
            var rt = findPath(Math.round(player.mx), Math.round(player.my),
              Math.round(tf.x), Math.round(tf.y));
            if (rt && rt.length) {
              player.path = rt;                   // 交给点击寻路分支绕过去（它会接管移动）
              player.tx = Math.round(tf.x); player.ty = Math.round(tf.y);
              player.foeStuck = 0;
            } else {
              player.targetFoe = null;
              toast('那只妖兽过不去 —— 隔着水面或断崖');
            }
          }
        } else {
          tryAttack();
        }
      }
    }

    // 行走帧只在**真的挪动了**时才推进：贴着墙按方向键就是「转身站住」，
    // 不会再出现原地踏空的假动作（旧版把「按了键」当「在走路」，所以只转向不移动）
    var moved = Math.abs(player.mx - px0) > 1e-5 || Math.abs(player.my - py0) > 1e-5;
    player.walk = moved ? player.walk + dt : 0;

    // 循环动作（待机/行走/奔跑）由这里自动切换；一次性动作期间（actHold>0）不覆盖
    if (poseLock) { player.act = poseLock; player.actT += dt; }   // 调试场：锁死动作不参与状态机
    else if (player.actHold <= 0) {
      var nextAct = moved ? (running ? 'run' : 'walk') : 'idle';
      if (player.act !== nextAct) { player.act = nextAct; player.actT = 0; }
      player.actT += dt;
    }
    // 试演面板高亮跟随当前动作（只在变化时改 DOM，避免每帧重排）
    if (player.act !== lastActShown) { lastActShown = player.act; markAct(player.act); }

    // —— 传送门检测 ——
    if (portalLock <= 0) {
      var pcx = Math.round(player.mx), pcy = Math.round(player.my);
      for (var i = 0; i < CUR.portals.length; i++) {
        var pt = CUR.portals[i];
        var onCell = (Math.abs(player.mx - pt.x) < 0.34 && Math.abs(player.my - pt.y) < 0.34);
        if (onCell) { pending = pt; fadeDir = 1; player.path = null; player.tx = player.mx; player.ty = player.my; break; }
      }
    }
    if (player.attackCd > 0) player.attackCd = Math.max(0, player.attackCd - dt);
    tickBuffs(dt);                       // v58 符箓计时（到期才 recalc，见 tickBuffs 注释）
    if (player.flash > 0) player.flash = Math.max(0, player.flash - dt);
    if (player.invuln > 0) player.invuln = Math.max(0, player.invuln - dt);
    if (screenFlash > 0) screenFlash = Math.max(0, screenFlash - dt);
    updateCam(dt);
    updateFoes(dt);
    updateProjectiles(dt);   // 敌我弹道（炎爆术 / 远程怪火球）
    updateFloaters(dt);   // 此前从未被调用 —— 伤害飘字/击杀粒子不会消失
    var posEl = document.getElementById('pos');
    if (posEl) posEl.textContent = Math.round(player.mx) + ', ' + Math.round(player.my);
  }

  function updateCam(dt) {
    var k = 1 - Math.pow(0.0016, dt);
    var px = (player.mx - player.my) * HW * Z, py = (player.mx + player.my) * HH * Z;
    camX += (W / 2 - px - camX) * k;
    camY += (H / 2 - py - camY) * k;
  }

  // 设置移动目标格：鼠标点击与自测钩子 ISLES.clickCell 共用同一个入口，
  // 保证自测跑的确实是点击移动这条真实路径，而不是另写一份逻辑
  function setTargetCell(cx, cy) {
    var tx = Math.round(cx), ty = Math.round(cy);
    // 三种「点了没反应」要分开说清楚，否则玩家只会以为游戏卡了 ——
    // 外来地图（桥/断崖多）尤其明显：桥就在眼前，怎么点都不动。
    //   ① 目标格本身走不了（水/崖壁/墙里）
    //   ② 目标格能走，但被水面或断崖隔成了另一个连通块 —— BFS 找不到路
    //   ③ 正常 → 交给寻路
    if (!walkable(tx, ty)) { badMark(tx, ty, '那里过不去'); return false; }
    var path = findPath(Math.round(player.mx), Math.round(player.my), tx, ty);
    if (!path || !path.length) { badMark(tx, ty, '这边过不去，得绕路'); return false; }
    player.path = path;
    player.tx = tx; player.ty = ty;
    return true;
  }
  /** 「去不了」的反馈：红色叉号打在那格上 + 一句说明。1.2 秒内不重复弹，免得连点刷屏 */
  var badT = -1e9;
  function badMark(mx, my, msg) {
    clickMark = { mx: mx, my: my, life: 0.7, max: 0.7, bad: true };
    var now = (window.performance && performance.now) ? performance.now() : Date.now();
    if (now - badT > 1200) { toast(msg); badT = now; }
  }

  // ---------------- 妖兽战斗逻辑 ----------------
  // ★5 Boss/精英名册：这些 key 强制视为 Boss（红血条 + 读条大招）。精英走 def_.elite。
  var BOSS_FOE_KEYS = { golem: 1 };
  function makeFoes(list) {
    return (list || BEILIN_SPAWNS).map(function (s) {
      var d = FOE_DEFS[s.t];
      // ★5 Boss/精英机制：把名册里的特定怪强制升为 Boss（直接改写共享 def，
      // 让 drawFoe 的红/橙血条也能识别），数据覆盖层不带 boss 字段也照样生效。
      if (BOSS_FOE_KEYS[d.key]) d.boss = true;
      var isBoss5 = !!(d.boss), isElite5 = !!(d.elite);
      // 未知怪种（登记表没这 key / 图录没加载）不能就地抛异常 —— makeFoes 跑在 switchTo 里，
      // 一抛整个 rAF 循环当场死掉、画面卡住，而现象只是「切过去黑屏/不动」，极难定位。
      // 这里跳过该条目（该格没有怪），并留一条控制台线索。
      if (!d) { try { console.warn('[foes] 跳过未知怪种:', s.t, '@', s.x + ',' + s.y); } catch (e) {} return null; }
      var cell = snapWalkable(CUR, s.x, s.y);
      var aggro = d.aggro || AGGRO;
      return {
        def_: d, key: d.key, name: d.name,
        x: cell.x, y: cell.y, home: cell,
        hp: d.hp, maxhp: d.hp, atk: d.atk, def: d.def, exp: d.exp, stones: d.stones,
        face: 'down', flash: 0, atkAnim: 0, deadT: 0, atkCd: 0, alive: true, respawn: 0,
        // ★5 Boss/精英读条机制状态
        isBoss: isBoss5, isElite: isElite5,
        casting: false, castT: 0, castMax: 1, castKind: null,
        castCd: 2.5 + Math.random() * 3,
        // —— 领地半径：超出就不再追、走回 home；登记表可写 leash 覆盖默认 aggro+FOE_LEASH_PAD ——
        leash: d.leash || (aggro + FOE_LEASH_PAD),
        // —— 动作状态机（侧视多动作素材用；老等距妖兽没有 anims，这些字段空转不影响）——
        anim: 'idle', animT: 0, animHold: 0, dying: 0,
        // —— 领地滞回：一旦越界就锁定「回巢」状态，走回巢内才解除 ——
        // 少了这个标志会在 leash 边缘来回抽动：追出去→越界回巢→一进界又被仇恨拉起，怪原地扭。
        ret: 0,
        // —— 绕行寻路（直线被石柱/水面挡住时启用，见 bfsNext）——
        bpath: null, repath: 0
      };
    }).filter(function (f) { return !!f; });   // 剔掉上面跳过的未知怪种
  }
  function addFloater(mx, my, text, color, opts) {
    var o = opts || {};
    floaters.push({
      mx: mx, my: my, off: 0, text: text, color: color,
      life: o.crit ? 1.3 : 0.95, max: o.crit ? 1.3 : 0.95,
      crit: !!o.crit, rise: o.crit ? 54 : 34      // 暴击飘得更久更高，一眼能分辨
    });
  }
  /** 目标是否落在角色「面朝方向」的扇形内（cos 值越小扇形越宽）
   *  默认 FACE_ARC=0.5 → 正面 ±60°。贴脸重叠时不判朝向，直接算命中。 */
  function inFacingArc(mx, my, cosv) {
    var dx = mx - player.mx, dy = my - player.my;
    var d = Math.hypot(dx, dy);
    if (d < 0.4) return true;
    var v = FACE_VEC[player.face] || FACE_VEC.down;
    var need = (cosv === undefined) ? FACE_ARC : cosv;
    return (dx / d) * v.x + (dy / d) * v.y >= need;
  }
  /** 统一伤害结算：基础(攻-防) → ±15% 浮动 → 连击加成 → 暴击判定
   *  旧版是 max(1, round(atk-def))，恒定值 —— 打石魔每刀都是 8，连砍 17 刀数字都不动一下。
   *  opts.heavy = 重击（暴击率翻倍） */
  function rollDamage(pow, def, opts) {
    var o = opts || {};
    var base = Math.max(1, Math.round(pow - def));
    var jitter = 1 + (Math.random() * 2 - 1) * DMG_JITTER;
    var rate = o.heavy ? CRIT_RATE * 2 : CRIT_RATE;
    var crit = Math.random() < rate;
    var cMul = 1 + Math.min(player.combo, COMBO_MAX) * COMBO_STEP;
    var dmg = base * jitter * cMul * (crit ? CRIT_MUL : 1);
    return { dmg: Math.max(1, Math.round(dmg)), crit: crit, base: base };
  }
  /** 命中即累计连击；换目标自动断连（不能拿 A 攒连击去打 B） */
  function bumpCombo(f) {
    if (player.comboFoe !== f) player.combo = 0;
    player.comboFoe = f;
    player.combo = Math.min(COMBO_MAX, player.combo + 1);
    player.comboT = COMBO_WIN;
  }
  function breakCombo() { player.combo = 0; player.comboT = 0; player.comboFoe = null; }
  function spawnParticles(mx, my) {
    for (var i = 0; i < 10; i++) {
      var a = Math.random() * 6.2832, sp = 1.5 + Math.random() * 2.5;
      particles.push({ mx: mx, my: my, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, life: 0.6, max: 0.6, color: '#ffe1a0' });
    }
  }
  // 居中提示条：把"被击退/折损银两"这类事件说清楚，避免玩家只看到画面一跳却没有解释
  var toastEl = null, toastTimer = 0;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.id = 'toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2200);
  }
  // 玩家出手：范围 MELEE 内最近的妖兽受击；real=max(1,round(atk-def))
  function tryAttack() {
    if (player.dead) return;
    // ★ 一次性动作没播完就不许出手。旧版冷却写死 0.45s 而动作长 0.65s，
    //   连按时 actT 被反复归零，6 帧挥击只播到前 4 帧就重来，玩家永远看不到完整攻击动作。
    if (player.actHold > 0 || player.attackCd > 0) return;
    player.attackCd = ATK_A_CD;
    // ★ 先转身、再判定（2026-09-17 修）。旧版反过来：先用「攻击前的旧朝向」跑 inFacingArc，
    //   怪在侧后方就判不中，然后才 setFaceFromDelta 转身 —— 结果是"明明贴着怪却砍空"，
    //   下一刀才真打中。手感上的表现就是"打空率高、不跟手"。现在改成：
    //   ① 范围内最近的怪 → ② 立刻转向它 → ③ 用**转向后**的朝向来判定扇形。
    //   代价是偶尔会"自动转向"到最近的怪，但这正是动作游戏该有的吸附手感。
    /* v57：**锁定目标优先**。玩家点了某只怪，这一刀就该落在它身上 ——
     * 不能被旁边一只更近的抢走（"我点了 A、它却在打 B"是最难解释的一种手感 bug）。
     * 没有锁定（或锁定的那只跑出攻击距离了）才退回"打最近的一只"。 */
    var tfoe = (player.targetFoe && player.targetFoe.alive) ? player.targetFoe : null;
    var near = null, nd = AGGRO;
    if (tfoe) {
      var d0 = Math.hypot(tfoe.x - player.mx, tfoe.y - player.my);
      if (d0 <= MELEE + 0.9) { near = tfoe; nd = d0; }
    }
    if (!near) {
      for (var i = 0; i < foes.length; i++) {
        var f = foes[i]; if (!f.alive) continue;
        var d = Math.hypot(f.x - player.mx, f.y - player.my);
        if (d < nd) { nd = d; near = f; }
      }
    }
    // faceToward 而不是 setFaceFromDelta：它顺手把 sideFace 也定成"目标在屏幕的哪一侧"，
    // 否则侧视素材会按上次的移动方向挥砍 —— 就是「背对怪物攻击」。
    if (near && nd <= MELEE + 0.9) faceToward(near.x, near.y);
    player.act = 'atkA'; player.actT = 0; player.actHold = ACT_DUR.atkA;   // 挥空也播，打不到也有反馈
    // 只认「够近 且 在面朝扇形内」的目标 —— 背对着怪不再能砍中。
    // 转身是四向的、扇形是 ±60°，而最近的目标转完身必然落在扇形内（最坏 |dx|=|dy| 时
    // 点积 0.707 > FACE_ARC 0.5），所以这一条只会淘汰"根本没转过去的"情况。
    var best = null, bd = MELEE;
    if (tfoe && tfoe === near) {
      var d1 = Math.hypot(tfoe.x - player.mx, tfoe.y - player.my);
      if (d1 < MELEE && inFacingArc(tfoe.x, tfoe.y)) { best = tfoe; bd = d1; }
    }
    if (!best) {
      for (var j = 0; j < foes.length; j++) {
        var g = foes[j]; if (!g.alive) continue;
        var gd = Math.hypot(g.x - player.mx, g.y - player.my);
        if (gd < bd && inFacingArc(g.x, g.y)) { bd = gd; best = g; }
      }
    }
    if (!best) return;
    var hit = rollDamage(player.atk, best.def);
    best.hp -= hit.dmg;
    best.flash = hit.crit ? 0.4 : 0.22;
    bumpCombo(best);
    addFloater(best.x, best.y - 0.3, (hit.crit ? '暴击 -' : '-') + hit.dmg,
      hit.crit ? '#ffe66b' : '#ffd36b', { crit: hit.crit });
    if (hit.crit) { player.critT = 0.45; screenShake = Math.max(screenShake, 0.22); addFloater(best.x, best.y - 1.1, '暴击！', '#ff9f43', { crit: true }); }
    if (best.hp <= 0) killFoe(best); else hurtFoe(best);
  }
  // 玩家主动出手（J/空格/点击妖兽）：锁定仇恨内最近的妖兽并打一下
  function attackNearest() {
    if (player.dead) return;
    if (player.targetFoe && player.targetFoe.alive) {
      var td = Math.hypot(player.targetFoe.x - player.mx, player.targetFoe.y - player.my);
      if (td <= AGGRO) { tryAttack(); return; }
    }
    var best = null, bd = AGGRO;
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i]; if (!f.alive) continue;
      var d = Math.hypot(f.x - player.mx, f.y - player.my);
      if (d < bd) { bd = d; best = f; }
    }
    if (best) player.targetFoe = best;
    tryAttack();
  }
  /** 攻击 B（重击，K）：伤害翻倍、范围更大、把妖兽推开一段，代价是长冷却 */
  function powerAttack() {
    if (player.dead) return;
    var h0 = document.getElementById('hint');
    if (player.atkBCd > 0) {
      if (h0) h0.textContent = '重击冷却中（剩 ' + player.atkBCd.toFixed(1) + ' 秒）';
      return;
    }
    player.atkBCd = ATK_B_CD;
    // 与普攻同理：先朝目标转身，再判定横扫范围（旧版判定用旧朝向，导致"贴着怪横扫却落空"）。
    // 同样**锁定目标优先**（v57）—— 重击是横扫，但仍以玩家点的那只为转身基准。
    var tfoeB = (player.targetFoe && player.targetFoe.alive) ? player.targetFoe : null;
    var near = null, nd = AGGRO;
    if (tfoeB) {
      var d0b = Math.hypot(tfoeB.x - player.mx, tfoeB.y - player.my);
      if (d0b <= MELEE + 1.4) { near = tfoeB; nd = d0b; }
    }
    if (!near) {
      for (var k = 0; k < foes.length; k++) {
        var nf = foes[k]; if (!nf.alive) continue;
        var ndd = Math.hypot(nf.x - player.mx, nf.y - player.my);
        if (ndd < nd) { nd = ndd; near = nf; }
      }
    }
    if (near && nd <= MELEE + 1.4) faceToward(near.x, near.y);
    player.act = 'atkB'; player.actT = 0; player.actHold = ACT_DUR.atkB;
    // 重击是横扫，扇形比普攻宽（±90°），但依然要求大致朝着目标
    var reach = MELEE + 0.55, hit = [];
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i]; if (!f.alive) continue;
      if (Math.hypot(f.x - player.mx, f.y - player.my) <= reach && inFacingArc(f.x, f.y, 0)) hit.push(f);
    }
    if (!hit.length) {
      toast('重击落空（冷却 ' + ATK_B_CD + ' 秒）');
      if (h0) h0.textContent = '重击落空，' + ATK_B_CD + ' 秒后可再放';
      return;
    }
    var crits = 0;
    for (var j = 0; j < hit.length; j++) {
      var g = hit[j];
      var r = rollDamage(player.atk * 2, g.def, { heavy: true });
      if (r.crit) crits++;
      g.hp -= r.dmg; g.flash = r.crit ? 0.5 : 0.3;
      addFloater(g.x, g.y - 0.3, (r.crit ? '暴击 -' : '-') + r.dmg,
        r.crit ? '#ffe66b' : '#ffd36b', { crit: r.crit });
      var dx = g.x - player.mx, dy = g.y - player.my, dd = Math.hypot(dx, dy) || 1;
      for (var s = 0; s < 3; s++) {                       // 把妖兽推开
        if (couldStand(g.x + dx / dd * 0.3, g.y)) g.x += dx / dd * 0.3;
        if (couldStand(g.x, g.y + dy / dd * 0.3)) g.y += dy / dd * 0.3;
      }
      if (g.hp <= 0) killFoe(g); else hurtFoe(g);
    }
    bumpCombo(hit[0]);
    if (crits > 0) player.critT = 0.45; screenShake = Math.max(screenShake, 0.22);
    toast('重击命中 ' + hit.length + ' 只' + (crits ? '（' + crits + ' 记暴击）' : '') + '（冷却 ' + ATK_B_CD + ' 秒）');
    if (h0) h0.textContent = '重击命中 ' + hit.length + ' 只，' + ATK_B_CD + ' 秒后可再放';
  }
  /* ---------------- 技能 ----------------
   * 三个技能共用一套流程：定落点 → 取目标 → 播动作 + 特效 → 逐目标 rollDamage。
   * 落点规则：自身为中心的技能用玩家格；锁定技优先打最近目标，没目标就落在身前 2.2 格。 */
  var skillFx = [];                      // 技能特效队列（剑气/雷爆/剑雨）
  var fxFreeze = false;                  // ?cast= 调试用：把特效冻在某一帧，方便截图核对
  /** 特效专用伪随机：同一个特效每次重绘必须得到同一批子元素。
   *  用 Math.random() 的话，剑雨那几把剑会逐帧乱跳（看起来像噪点）。 */
  function fxRnd(seed, i) {
    var h = Math.imul((seed + i * 0x85EB) | 0, 0x27D4EB2D);
    h = Math.imul(h ^ (h >>> 15), 0x2545F491);
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  }
  function nearestFoe(range) {
    var best = null, bd = (range === undefined) ? AGGRO : range;
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i]; if (!f.alive) continue;
      var d = Math.hypot(f.x - player.mx, f.y - player.my);
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  }
  /** 取技能命中范围内的目标：line 沿朝向做「投影 + 侧向偏移」判定，其余按圆形半径 */
  function skillTargets(s, cx, cy) {
    var out = [], i, f, dx, dy;
    if (s.kind === 'line') {
      var v = FACE_VEC[player.face] || FACE_VEC.down;
      for (i = 0; i < foes.length; i++) {
        f = foes[i]; if (!f.alive) continue;
        dx = f.x - player.mx; dy = f.y - player.my;
        var along = dx * v.x + dy * v.y;                       // 沿朝向的投影距离
        var side = Math.abs(dx * (-v.y) + dy * v.x);           // 垂直于朝向的偏移
        if (along >= -0.35 && along <= s.reach && side <= (s.wide || 0.9)) out.push(f);
      }
      return out;
    }
    for (i = 0; i < foes.length; i++) {
      f = foes[i]; if (!f.alive) continue;
      if (Math.hypot(f.x - cx, f.y - cy) <= s.reach) out.push(f);
    }
    return out;
  }
  /* ---------------- 弹道系统（敌我共用） ----------------
   * 玩家的炎爆术、远程怪的火球都走这条队列。弹道撞墙消散、命中结算后生成
   * fx_atlas 里的爆炸精灵图（走 skillFx 的 sprite 分支，跟其它特效一样随时间淡出）。
   * ?cast= 调试冻结（fxFreeze）时弹道同样停摆，方便逐帧截图核对。 */
  var projectiles = [];
  var projFired = 0;                     // 累计发射数（自测用：远程怪是否真的开火）
  /** fx_atlas 取帧：at === null 按 fps 循环取；at ∈ [0,1) 按进度取（一次性动画）。
   *  ⚠ 失败分支全部留痕（__fxMissWhy）：这条链曾经全灭且不报错（fx_atlas 下载了
   *  但没人接进 ATLAS.fx，2026-09-17 炎爆术没特效），判据必须能说出死在哪一层。 */
  function fxFrame(name, at) {
    var a = ATLAS.fx;
    if (!a || !a.img || !a.rect) {
      window.__fxMissWhy = !a ? 'noSlot' : (!a.img ? 'noImg' : 'noRect');
      return null;
    }
    var meta = a.rect._meta && a.rect._meta[name];
    if (!meta) { window.__fxMissWhy = 'noMeta:' + name; return null; }
    var idx = (at === null || at === undefined)
      ? Math.floor(time * (meta.fps || 10)) % meta.n
      : Math.min(meta.n - 1, Math.floor((at || 0) * meta.n));
    var r = a.rect[name + '_' + idx];
    if (!r) { window.__fxMissWhy = 'noFrame:' + name + '_' + idx; return null; }
    return { img: a.img, sx: r[0], sy: r[1], sw: r[2], sh: r[3], meta: meta };
  }
  /** 在等距屏幕坐标 (px, py 为地面点) 画一个特效帧，绕 screenAng 旋转、按 gscale 缩放 */
  function drawFxSprite(name, px, py, gscale, screenAng, alpha, at) {
    var fr = fxFrame(name, (at === undefined) ? null : at);
    if (!fr) return;
    // 真画出帧才计数（fxFrame 取不到时静默 return，恰是「特效全灭且不报错」的故障形态，
    // 2026-09-17 炎爆术没特效的根因）：线上判据 = window.__fxDrawn，autotest=skill 的 probe 会带出。
    window.__fxDrawn = (window.__fxDrawn || 0) + 1;
    var s = gscale * Z;
    var dw = fr.sw * s, dh = fr.sh * s;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(px, py);
    if (screenAng) ctx.rotate(screenAng);
    ctx.drawImage(fr.img, fr.sx, fr.sy, fr.sw, fr.sh, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
  }
  /** 爆炸落点特效（一次性动画，进 skillFx 队列随其它特效一起淡出销毁） */
  function impactFx(x, y, gscale) {
    skillFx.push({ kind: 'sprite', fx: 'blast', x: x, y: y,
      life: 0.5, max: 0.5, gscale: gscale || 1, rot: 0 });
  }
  function updateProjectiles(dt) {
    if (fxFreeze) return;                    // ?cast= 调试：弹道和特效一起冻结
    for (var i = projectiles.length - 1; i >= 0; i--) {
      var p = projectiles[i];
      var nx = p.x + p.vx * p.spd * dt, ny = p.y + p.vy * p.spd * dt;
      p.life -= dt;
      if (p.life <= 0 || !couldStand(nx, ny)) {      // 撞墙/超程：消散（玩家弹炸开但不伤人）
        if (p.side === 'player') impactFx(nx, ny, 0.8);
        projectiles.splice(i, 1);
        continue;
      }
      p.x = nx; p.y = ny;
      if (p.side === 'player') {
        for (var j = 0; j < foes.length; j++) {
          var f = foes[j];
          if (!f.alive || f.dying > 0) continue;
          if (Math.hypot(f.x - p.x, f.y - p.y) < 0.55) {
            projHitFoe(p, f);
            projectiles.splice(i, 1);
            break;
          }
        }
      } else if (player.invuln <= 0 && !player.dead &&
                 Math.hypot(player.mx - p.x, player.my - p.y) < 0.5) {
        player.hp -= p.dmg; player.flash = 0.25;
        addFloater(player.mx, player.my - 0.35, '-' + p.dmg, '#ff6b6b'); screenShake = Math.max(screenShake, 0.3);
        impactFx(p.x, p.y, 0.7);
        if (player.hp <= 0) playerDown(null);
        projectiles.splice(i, 1);
      }
    }
  }
  /** 玩家弹道命中：直击全额 + 爆炸波及周围（splash 倍率、splashR 半径），统一走 rollDamage */
  function projHitFoe(p, f) {
    var s = p.skill;
    var r = rollDamage(player.atk * s.mul, f.def, { heavy: true });
    f.hp -= r.dmg; f.flash = r.crit ? 0.5 : 0.3;
    addFloater(f.x, f.y - 0.3, (r.crit ? '暴击 -' : '-') + r.dmg,
      r.crit ? '#ffe66b' : (s.color || '#ffd36b'), { crit: r.crit });
    if (f.hp <= 0) killFoe(f); else hurtFoe(f);
    bumpCombo(f);
    if (r.crit) player.critT = 0.45; screenShake = Math.max(screenShake, 0.22);
    if (s.splash) {
      for (var j = 0; j < foes.length; j++) {
        var g = foes[j];
        if (g === f || !g.alive || g.dying > 0) continue;
        if (Math.hypot(g.x - p.x, g.y - p.y) <= (s.splashR || 1.5)) {
          var r2 = rollDamage(player.atk * s.mul * s.splash, g.def, {});
          g.hp -= r2.dmg; g.flash = 0.25;
          addFloater(g.x, g.y - 0.3, '-' + r2.dmg, s.color || '#ffd36b');
          if (g.hp <= 0) killFoe(g); else hurtFoe(g);
        }
      }
    }
    impactFx(p.x, p.y, 1.0);
  }
  /** 弹道绘制：火球帧绕「速度方向的屏幕角」旋转；等距投影 (mx,my)→屏幕 = ((mx-my)HW, (mx+my)HH) */
  function drawProjectiles() {
    var hw = HW, hh = HH;
    for (var i = 0; i < projectiles.length; i++) {
      var p = projectiles[i];
      var pt = isoToScreen(p.x, p.y);
      var ang = Math.atan2((p.vx + p.vy) * hh, (p.vx - p.vy) * hw);
      drawFxSprite(p.fx, pt.x, pt.y + HH * Z - 26 * Z, p.side === 'player' ? 1.0 : 0.85, ang, 1);
    }
  }
  function castSkill(i) {
    var s = SKILLS[i];
    if (!s || player.dead) return false;
    var h0 = document.getElementById('hint');
    if (player.skillCd[i] > 0) {
      if (h0) h0.textContent = s.name + ' 冷却中（剩 ' + player.skillCd[i].toFixed(1) + ' 秒）';
      return false;
    }
    if (player.actHold > 0 || player.attackCd > 0) return false;   // 上一刀没播完，别掐断
    // 自动锁定（v45）：半径取「技能射程」与默认仇恨的较大者 —— **技能范围内有怪必选中**，
    // 并自动转向它；范围内没怪则保持当前朝向，朝角色正前方释放。
    var t = nearestFoe(Math.max(AGGRO * 1.8, (s.reach || 0) + 1.2));
    if (t) setFaceFromDelta(t.x - player.mx, t.y - player.my);
    var v = FACE_VEC[player.face] || FACE_VEC.down;
    var cx = player.mx, cy = player.my;
    if (s.kind === 'target') {
      if (t) { cx = t.x; cy = t.y; }
      else { cx = player.mx + v.x * 2.2; cy = player.my + v.y * 2.2; }
    }
    if (s.kind === 'proj') {
      // 弹道技能（v45）：选中目标时**精确制导**——直飞怪所在方向（不再用四向 face 的
      // 45° 近似，斜方向的怪以前会打偏擦过）；没有目标时朝角色正前方飞。
      var pvx = v.x, pvy = v.y;
      if (t) {
        var pdx = t.x - player.mx, pdy = t.y - player.my, pd = Math.hypot(pdx, pdy) || 1;
        pvx = pdx / pd; pvy = pdy / pd;
      }
      player.skillCd[i] = s.cd;
      player.act = s.act; player.actT = 0; player.actHold = ACT_DUR[s.act];
      projectiles.push({ x: player.mx + pvx * 0.4, y: player.my + pvy * 0.4,
        vx: pvx, vy: pvy, spd: s.spd || 6, life: (s.reach || 9) / (s.spd || 6),
        side: 'player', fx: s.fx || 'fireball', skill: s });
      projFired++;
      if (h0) h0.textContent = s.name + (t ? ' 锁定 ' + (t.name || '目标') + ' 出手，' : ' 出手，') + s.cd + ' 秒后可再放';
      return true;
    }
    var hits = skillTargets(s, cx, cy);
    player.skillCd[i] = s.cd;
    player.act = s.act; player.actT = 0; player.actHold = ACT_DUR[s.act];
    var dur = s.kind === 'target' ? 0.8 : 0.5;
    skillFx.push({ kind: s.kind, x: cx, y: cy, r: s.reach, color: s.color, dir: v, life: dur, max: dur,
      fx: s.fx, seed: (Math.random() * 0x7fffffff) | 0 });
    if (!hits.length) {
      toast(s.name + ' 落空');
      if (h0) h0.textContent = s.name + ' 落空，' + s.cd + ' 秒后可再放';
      return true;
    }
    var crits = 0, sum = 0;
    for (var j = 0; j < hits.length; j++) {
      var g = hits[j];
      var r = rollDamage(player.atk * s.mul, g.def, { heavy: true });
      if (r.crit) crits++;
      sum += r.dmg;
      g.hp -= r.dmg; g.flash = r.crit ? 0.5 : 0.3;
      addFloater(g.x, g.y - 0.3, (r.crit ? '暴击 -' : '-') + r.dmg,
        r.crit ? '#ffe66b' : (s.color || '#ffd36b'), { crit: r.crit });
      if (s.knock) {                                   // 雷罡咒：把周围妖兽炸开
        var dx = g.x - player.mx, dy = g.y - player.my, dd = Math.hypot(dx, dy) || 1;
        for (var st = 0; st < 4; st++) {
          if (couldStand(g.x + dx / dd * 0.32, g.y)) g.x += dx / dd * 0.32;
          if (couldStand(g.x, g.y + dy / dd * 0.32)) g.y += dy / dd * 0.32;
        }
      }
      if (g.hp <= 0) killFoe(g); else hurtFoe(g);
    }
    bumpCombo(hits[0]);
    if (crits > 0) player.critT = 0.45; screenShake = Math.max(screenShake, 0.22);
    toast(s.name + ' 命中 ' + hits.length + ' 只，合计 ' + sum + (crits ? '（' + crits + ' 记暴击）' : ''));
    if (h0) h0.textContent = s.name + ' 命中 ' + hits.length + ' 只，' + s.cd + ' 秒后可再放';
    return true;
  }
  function updateSkillFx(dt) {
    if (fxFreeze) return;
    for (var i = skillFx.length - 1; i >= 0; i--) {
      skillFx[i].life -= dt;
      if (skillFx[i].life <= 0) skillFx.splice(i, 1);
    }
  }
  /** 技能特效：剑气 / 雷爆 / 剑雨，都在等距地面上画，随进度淡出 */
  function drawSkillFx() {
    for (var i = 0; i < skillFx.length; i++) {
      var o = skillFx[i], k = Math.min(1, 1 - o.life / o.max);
      var p = isoToScreen(o.x, o.y), gy = p.y + HH * Z;
      ctx.save();
      if (o.kind === 'line') {
        /* 御剑诀 —— 剑气「飞出去」。
         * 旧版是沿朝向拉一条**等宽直线**：读起来像激光笔，而且全长只在原地做 alpha 呼吸，
         * 完全没有"出手"的过程。现在按 k 推进「起点 → 剑尖」，刃身用梭形（柳叶）而不是
         * 等宽线，尾部再叠速度线；三层叠画（外发光 / 主体 / 白芯）保证在亮草地上也有对比。 */
        var v = o.dir, reach = o.r;
        var fly = Math.max(0, Math.min(1, (k - 0.14) / 0.62));   // 前 0.14 贴手蓄势，不放出去
        var fe = 1 - Math.pow(1 - fly, 3);                       // easeOutCubic：出手快、末段收
        var a0 = isoToScreen(o.x + v.x * reach * 0.16, o.y + v.y * reach * 0.16);
        var a1 = isoToScreen(o.x + v.x * reach * fe, o.y + v.y * reach * fe);
        var y0 = a0.y + HH * Z - 18 * Z, y1 = a1.y + HH * Z - 18 * Z;
        var fade = k < 0.14 ? k / 0.14 : 1 - Math.max(0, (k - 0.72) / 0.28);
        var len = Math.hypot(a1.x - a0.x, y1 - y0);
        ctx.save();
        ctx.translate(a1.x, y1);
        ctx.rotate(Math.atan2(y1 - y0, a1.x - a0.x));
        // 梭形刃：尾 (-len,0) → 剑尖 (0,0)，上下缘各用一条二次曲线收成柳叶
        var carve = function (w) {
          ctx.beginPath();
          ctx.moveTo(-len, 0);
          ctx.quadraticCurveTo(-len * 0.42, -w, 0, 0);
          ctx.quadraticCurveTo(-len * 0.42, w, -len, 0);
          ctx.closePath();
        };
        ctx.fillStyle = o.color;
        ctx.globalAlpha = fade * 0.40; carve(34 * Z); ctx.fill();    // 外发光
        ctx.globalAlpha = fade * 0.85; carve(17 * Z); ctx.fill();    // 主体
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = fade;        carve(6 * Z); ctx.fill();     // 白芯
        // 拖尾速度线（seed 固定 → 不会逐帧乱跳）
        ctx.strokeStyle = o.color; ctx.lineCap = 'round';
        for (var sl = 0; sl < 3; sl++) {
          var sr1 = fxRnd(o.seed, sl), sr2 = fxRnd(o.seed, sl + 20);
          var ly2 = (sr1 - 0.5) * 34 * Z;
          ctx.globalAlpha = fade * 0.42;
          ctx.lineWidth = (1.3 + sr1 * 1.7) * Z;
          ctx.beginPath();
          ctx.moveTo(-len * (1.02 + sr2 * 0.7), ly2);
          ctx.lineTo(-len * (0.72 + sr2 * 0.35), ly2 * 0.55);
          ctx.stroke();
        }
        ctx.restore();
      } else if (o.kind === 'sprite') {
        // fx_atlas 精灵图特效（爆炸等一次性动画）：按进度取帧，中心贴地面
        drawFxSprite(o.fx, p.x, gy - 30 * Z, o.gscale || 1, o.rot || 0,
          1 - Math.max(0, (k - 0.75) / 0.25) * 0.9, k);
      } else if (o.kind === 'aoe') {
        /* 雷罡咒 —— 落雷 → 爆闪 → 冲击波，三段先后。
         * 旧版是「一圈淡黄椭圆 + 五道几乎看不见的细闪电」，在亮草地上彻底读不出来；
         * 现在先铺一层暗色焦痕给亮色特效做底，落雷走「暗描边 + 主色 + 白芯」三遍描线。 */
        var RR = o.r * TILE_W * 0.5 * Z;
        var die = 1 - Math.max(0, (k - 0.7) / 0.3);
        // ⓪ fx_atlas 落雷精灵图（o.fx='lightning'）：叠在程序焦痕之上、爆闪同期出现
        if (o.fx && ATLAS.fx && ATLAS.fx.img)
          drawFxSprite(o.fx, p.x, gy - RR * 0.72, 1.1, 0, die * 0.95, k * 0.8);
        // ① 地面焦痕（最底层，压住明亮底色）。两层叠出深浅，单层会读成"地上一滩泥"。
        var burnA = 0.40 * Math.min(1, k / 0.2) * die;
        ctx.globalAlpha = burnA * 0.95;
        ctx.fillStyle = '#1d1206';
        ctx.beginPath(); ctx.ellipse(p.x, gy, RR * 0.95, RR * 0.475, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = burnA * 0.55;
        ctx.beginPath(); ctx.ellipse(p.x, gy, RR * 0.6, RR * 0.3, 0, 0, 6.2832); ctx.fill();
        // ② 中心爆闪（前 42%）
        if (k < 0.42) {
          var fk2 = 1 - k / 0.42;
          var rg = ctx.createRadialGradient(p.x, gy - 12 * Z, 0, p.x, gy - 12 * Z, RR * 0.85);
          rg.addColorStop(0, 'rgba(255,255,255,0.95)');
          rg.addColorStop(0.4, o.color);
          rg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.globalAlpha = fk2;
          ctx.fillStyle = rg;
          ctx.beginPath(); ctx.ellipse(p.x, gy - 12 * Z, RR * 0.85, RR * 0.53, 0, 0, 6.2832); ctx.fill();
        }
        // ③ 三道落雷：从高空劈下。生长只占前 22%，但**闪电要一直亮到 62%** ——
        //    旧版闪电 24% 就消失，整段雷咒里最"雷"的部分反而最短，定格一看只剩光圈。
        //    后半段用 seed 驱动的阶跃闪烁冒充余雷（阶跃而不是 sin，才像电不像呼吸）。
        var bolt = Math.min(1, k / 0.22);
        if (k < 0.62) {
          var ba = 0.95 * (1 - Math.max(0, (k - 0.3) / 0.32)) *
            (0.6 + 0.4 * fxRnd(o.seed, Math.floor(k * 34) + 3));
          for (var bb = 0; bb < 3; bb++) {
            var br1 = fxRnd(o.seed, bb), br2 = fxRnd(o.seed, bb + 9);
            var box = (br1 - 0.5) * RR * 1.1, boy = (br2 - 0.5) * RR * 0.5;
            var bTop = gy - 340 * Z, bBot = gy + boy * 0.35;
            var bCur = bTop + (bBot - bTop) * bolt;
            var pts = [[p.x + box * 0.3, bTop]];
            for (var q = 1; q <= 5; q++) {
              var tq = q / 5;
              var jx = (fxRnd(o.seed, bb * 31 + q) - 0.5) * 58 * Z * (1 - Math.abs(tq - 0.5) * 1.1);
              pts.push([p.x + box * (0.3 + tq * 0.7) + jx, bTop + (bCur - bTop) * tq]);
            }
            ctx.lineJoin = 'round';
            for (var pass = 0; pass < 3; pass++) {
              ctx.globalAlpha = ba * (pass === 0 ? 0.5 : 1);
              ctx.strokeStyle = pass === 0 ? '#3a2400' : (pass === 1 ? o.color : '#ffffff');
              ctx.lineWidth = (pass === 0 ? 13 : pass === 1 ? 7 : 2.8) * Z;
              ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
              for (var q2 = 1; q2 < pts.length; q2++) ctx.lineTo(pts[q2][0], pts[q2][1]);
              ctx.stroke();
            }
          }
        }
        // ④ 冲击波：三道错时扩张环
        for (var wv = 0; wv < 3; wv++) {
          var wk = (k - 0.2 - wv * 0.12) / 0.62;
          if (wk <= 0 || wk >= 1) continue;
          var we = 1 - Math.pow(1 - wk, 2);
          ctx.globalAlpha = (1 - wk) * 0.92;
          ctx.strokeStyle = wv === 0 ? '#ffffff' : o.color;
          ctx.lineWidth = (8 - 6 * wk) * Z * (wv === 0 ? 1 : 0.62);
          ctx.beginPath();
          ctx.ellipse(p.x, gy, RR * (0.14 + we * 1.02), RR * (0.07 + we * 0.51), 0, 0, 6.2832);
          ctx.stroke();
        }
        // ⑤ 地面裂纹：八条自中心射出的暗线，炸开后浮现
        var ck2 = Math.max(0, (k - 0.28) / 0.5);
        if (ck2 > 0 && ck2 < 1) {
          ctx.globalAlpha = 0.55 * (1 - ck2);
          ctx.strokeStyle = '#241608'; ctx.lineWidth = 2.2 * Z;
          for (var cr = 0; cr < 8; cr++) {
            // 角度加一点抖动：均分八条会读成"车轮辐条"
            var ccr = fxRnd(o.seed, cr + 50);
            var can = (cr / 8 + (fxRnd(o.seed, cr + 70) - 0.5) * 0.09) * 6.2832;
            ctx.beginPath();
            ctx.moveTo(p.x + Math.cos(can) * RR * 0.2, gy + Math.sin(can) * RR * 0.1);
            ctx.lineTo(p.x + Math.cos(can) * RR * (0.55 + ccr * 0.4),
              gy + Math.sin(can) * RR * (0.28 + ccr * 0.2));
            ctx.stroke();
          }
        }
      } else {
        /* 太虚剑域 —— 剑雨：六把剑错时落下 + 落地尘环 + 地面旋转法阵。
         * 旧版是「一根梯形光柱 + 落地一个环」。N 把剑由 seed 派生，不往 skillFx 堆对象
         * （?autotest=skill 记录的是"一次施法入队几个特效"，堆对象会让自测读数变味）。 */
        var R3 = o.r * TILE_W * 0.5 * Z;
        // ① 地面法阵：双环 + 八刻度，缓慢旋转 + 脉动
        var pu = 0.55 + 0.35 * Math.sin(k * Math.PI * 4);
        ctx.globalAlpha = 0.26 * pu; ctx.fillStyle = o.color;
        ctx.beginPath(); ctx.ellipse(p.x, gy, R3, R3 * 0.5, 0, 0, 6.2832); ctx.fill();
        ctx.globalAlpha = 0.8 * pu; ctx.strokeStyle = o.color; ctx.lineWidth = 2.6 * Z;
        for (var rg2 = 0; rg2 < 2; rg2++) {
          var rr2 = R3 * (rg2 ? 0.6 : 1.0);
          ctx.beginPath(); ctx.ellipse(p.x, gy, rr2, rr2 * 0.5, 0, 0, 6.2832); ctx.stroke();
        }
        for (var tk = 0; tk < 6; tk++) {
          var tan = tk / 6 * 6.2832 + k * 2.4;
          ctx.beginPath();
          ctx.moveTo(p.x + Math.cos(tan) * R3 * 0.9, gy + Math.sin(tan) * R3 * 0.45);
          ctx.lineTo(p.x + Math.cos(tan) * R3, gy + Math.sin(tan) * R3 * 0.5);
          ctx.stroke();
        }
        // ② 五把剑错时落下（旧版试过 6 把 + 300px 拖尾：画面上是一排粉色栅栏）
        var NS = 5;
        for (var si = 0; si < NS; si++) {
          var soff = (si / NS) * 0.5;
          var ki = Math.min(1, Math.max(0, (k - soff) / (1 - soff)));
          if (ki <= 0) continue;
          var qr1 = fxRnd(o.seed, si), qr2 = fxRnd(o.seed, si + 40);
          var qx = p.x + (qr1 - 0.5) * R3 * 1.35, qy = gy + (qr2 - 0.5) * R3 * 0.68;
          var drop = Math.min(1, ki / 0.35);            // 前 35% 下落
          var dk = Math.max(0, (ki - 0.35) / 0.65);     // 落地后扩散、淡出
          var lenS = 58 * Z, tailH = (1 - drop) * 140 * Z;
          ctx.save();
          ctx.translate(qx, qy);
          ctx.globalAlpha = (1 - dk) * 0.95;
          // 剑体：剑尖朝下 (0,0)，剑身向上，渐变从尾部的透明到剑尖的亮白
          var gg2 = ctx.createLinearGradient(0, -lenS - tailH, 0, 0);
          gg2.addColorStop(0, 'rgba(255,255,255,0)');
          gg2.addColorStop(0.6, o.color);
          gg2.addColorStop(1, '#ffffff');
          ctx.fillStyle = gg2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-5.5 * Z, -lenS * 0.72);
          ctx.lineTo(-5.5 * Z, -lenS);
          ctx.lineTo(5.5 * Z, -lenS);
          ctx.lineTo(5.5 * Z, -lenS * 0.72);
          ctx.closePath(); ctx.fill();
          // 拖尾：从剑尾继续往上的渐隐细线（表现"从天而降"）
          if (tailH > 1) {
            ctx.globalAlpha = (1 - dk) * 0.5;
            var gg3 = ctx.createLinearGradient(0, -lenS - tailH, 0, -lenS);
            gg3.addColorStop(0, 'rgba(255,255,255,0)'); gg3.addColorStop(1, o.color);
            ctx.strokeStyle = gg3; ctx.lineWidth = 3.2 * Z;
            ctx.beginPath(); ctx.moveTo(0, -lenS); ctx.lineTo(0, -lenS - tailH); ctx.stroke();
          }
          ctx.restore();
          // 落地尘环
          if (dk > 0) {
            ctx.globalAlpha = (1 - dk) * 0.9;
            ctx.strokeStyle = '#ffffff'; ctx.lineWidth = (5 - 4 * dk) * Z;
            ctx.beginPath();
            ctx.ellipse(qx, qy, 10 * Z + dk * 52 * Z, (10 * Z + dk * 52 * Z) * 0.5, 0, 0, 6.2832);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  /** 动作试演（数字键 1~6）：直接切到指定动作，用来逐个核对素材效果 */
  function playAct(act) {
    if (player.dead && act !== 'dead') return;
    player.act = act; player.actT = 0;
    if (act === 'atkA') player.actHold = ACT_DUR.atkA;
    else if (act === 'atkB') player.actHold = ACT_DUR.atkB;
    else if (act === 'dead') { player.actHold = ACT_DUR.dead; player.dead = true; }
    else player.actHold = 0.9;        // 循环动作也临时锁一下，否则下一帧就被状态机改回 idle
    var h = document.getElementById('hint');
    if (h) h.textContent = '动作试演：' + (ACT_CN[act] || act) + '（' + (player.actHold) + ' 秒）';
  }
  /** 掷一只怪的掉落（独立掷骰，可同时掉多样）。返回落地的条目数组。 */
  function rollLoot(f) {
    var tbl = LOOT_BY_KEY[f.key] || DEFAULT_LOOT;
    var got = [];
    function roll2(list) {
      for (var i = 0; i < list.length; i++) {
        var it = list[i];
        if (Math.random() < it[1]) {
          var n = it[2] + Math.floor(Math.random() * (it[3] - it[2] + 1));
          got.push({ key: it[0], n: n });
        }
      }
    }
    roll2(tbl);
    if (f.def_ && f.def_.elite) roll2(ELITE_LOOT);
    /* 装备：跟消耗品同一批落地、独立掷骰（可能"又掉药又掉装备"）。
     * 精英用独立的高概率/高品质权重，蹲精英才有意义。 */
    var chi = (f.def_ && f.def_.elite) ? GEAR_CHANCE_ELITE : GEAR_CHANCE;
    if (Math.random() < chi) got.push({ gear: rollGear(!!(f.def_ && f.def_.elite)) });
    return got;
  }
  /** 把掉落物撒在怪倒地处周围（偏移一圈，叠在一起看不出是几件）。 */
  function spawnLoot(f, list) {
    if (!list.length || !CUR) return;
    for (var i = 0; i < list.length; i++) {
      var ang = Math.random() * 6.2832;
      var rr = 0.22 + Math.random() * 0.42;
      var mx = f.x + Math.cos(ang) * rr, my = f.y + Math.sin(ang) * rr;
      // 落到不可走处就退回怪脚下（不然图标会飘在墙里）
      if (!couldStand(mx, my)) { mx = f.x; my = f.y; }
      lootDrops.push({
        // 装备实例不能合并进 count（`key/n` 那套是给可堆叠物品的），单独挂 gear 字段
        mx: mx, my: my, key: list[i].key || null, gear: list[i].gear || null,
        n: list[i].n || 1,
        life: LOOT_LIFE, phase: (lootSeq++) * 1.37, pop: 0, tossT: 0.28
      });
    }
  }
  /** 拾取判定：走到跟前自动捡。heal 进背包，mat 类银两直接入账、妖丹/玄铁令进背包。 */
  function updateLoot(dt) {
    for (var i = lootDrops.length - 1; i >= 0; i--) {
      var L = lootDrops[i];
      L.life -= dt;
      if (L.pop < 1) L.pop = Math.min(1, L.pop + dt / 0.22);   // 弹出动画
      if (L.tossT > 0) L.tossT = Math.max(0, L.tossT - dt);
      // 快消失时开始闪烁提示（最后 6 秒）
      L.blink = L.life < 6;
      if (L.life <= 0) { lootDrops.splice(i, 1); continue; }
      if (player.dead) continue;
      if (Math.hypot(player.mx - L.mx, player.my - L.my) > PICK_R) continue;
      /* 行囊满了就**留在地上**（不是捡起来丢掉 —— 那才是真的作恶），
       * 每 4 秒提醒一次，不然每帧 toast 会把屏幕刷成提示墙。 */
      if (L.gear && gearInv.length >= gearCap()) {
        if (time - (L.lastWarn || -99) > 4) {
          L.lastWarn = time;
          toast('行囊已满（' + gearCap() + ' 件）—— 熔炼几件或先穿走一件');
        }
        continue;
      }
      pickUp(L);
      lootDrops.splice(i, 1);
    }
  }
  /** 真正入账。银两是货币（走 player.stones），其馀进背包；装备实例进 gearInv。 */
  function pickUp(L) {
    if (L.gear) { collectGear(L.gear, L.mx, L.my); return; }
    var it = ITEMS[L.key];
    if (!it) return;
    collectItem(L.key, L.n, L.mx, L.my);
  }
  /** 装备入包（一股 ╳ 一件，不存在堆叠）。 */
  function collectGear(g, mx, my) {
    if (!g || !GEAR_BASES[g.key]) return;
    if (gearInv.length >= gearCap()) return;
    if (gearInv.indexOf(g) >= 0) return;      // 同一实例别被重复塞进来
    gearInv.push(g);
    var tier = gearTier(g);
    addFloater(mx, my - 0.3, gearName(g), tier.col);
    addFloater(mx, my - 0.75, gearStatsLine(g), '#ffd98a');
    bagDirty = true;
    __lastPickup = gearName(g) + ' ' + new Date().toTimeString().slice(0, 8);
    if (!gearHinted) {
      gearHinted = true;
      toast('拾得装备 ' + gearName(g) + ' —— 按 B 开行囊，点一下即可穿戴');
    }
  }
  var gearHinted = false;
  /** 统一的「获得物品」入口（掉落、调试、以后的任务奖励都走这里）。 */
  function collectItem(key, n, mx, my) {
    var it = ITEMS[key];
    if (!it) return;
    if (key === 'lingshi') {
      player.stones += n;                      // 货币：直接入账
      addFloater(mx, my - 0.3, '+' + n + ' 银两', '#8bf3ff');
      /* ★ 银两入账也要标脏（2026-09-17 修复）：行囊标题那行「银两 N」只在
       * renderBag 里刷新，原来这里提前 return 不设 bagDirty —— 光捡银两
       * 面板数字永远不动（用户实测：「背包的银两也没有增加」）。 */
      bagDirty = true;
      return;
    }
    bag[key] = (bag[key] || 0) + n;
    var col = it.kind === 'heal' ? '#ffb3c8' : (it.kind === 'rare' ? '#ffdf9b' : '#9fe8c8');
    addFloater(mx, my - 0.3, '拾取 ' + it.cn + (n > 1 ? ' ×' + n : ''), col);
    bagDirty = true;
    /* ★ 拾取留痕（状态行排查用）：记录最近一次真正入包的物品与时间。
     * 若用户报"捡了但包里没有"，看这行就知道**入包逻辑到底跑没跑到** ——
     * 没有这行 = pickUp/collectItem 根本没执行（拾取判定问题）；
     * 有这行 = 入包了，问题在渲染层。 */
    __lastPickup = it.cn + '×' + n + ' ' + new Date().toTimeString().slice(0, 8);
    // 药品第一次进背包时提示一句用法（只提示一次，别每次捡都刷屏）
    if (it.kind === 'heal' && !healHinted) {
      healHinted = true;
      toast('拾得 ' + it.cn + ' —— 按 1 / 2 / 3 或点背包格子即可服用');
    }
    /* v54：妖丹 / 玄铁令第一次到手各提示一句。
     * 它们现在是"点一下就有用"的格子，但**没人会自己发现**——用户的原话就是「妖丹没什么用啊」，
     * 说明摆在那里却不说的东西等于不存在。只提示一次，之后靠格子的手型与金边自解释。 */
    if (key === 'yaodan' && !yaodanHinted) {
      yaodanHinted = true;
      toast('拾得妖丹 —— 按 B 开行囊，点妖丹格即可炼化成修为');
    }
    if (key === 'xuantie' && !xuantieHinted) {
      xuantieHinted = true;
      toast('拾得玄铁令 —— 点它取出，再点装备格即可重铸词缀');
    }
  }
  /* ═════════ 探索与随机（v47）：地图采集点 / 宝箱 ═════════
   * 设计取舍：
   *   ① 采集点按地图随机刷（换图重随，与 foes 同生命周期，不存盘）；坐标全部取整
   *      —— 避免浮点格 → CUR.ground[20.32] 抛错的老坑。
   *   ② 三类：herb 灵草 / ore 矿石（直接化银两）、chest 宝箱（银两+妖丹+低概率装备）。
   *      奖励的消耗方都已在游戏内存在（银两消费 / 妖丹炼修为 / 装备穿·熔），不构成无底洞。
   *   ③ 交互走与「点怪」「点空地」同一入口 tapMap：点中节点 → 走过去 → updateGather 到达自动采。
   *   ④ 渲染画在地面层之上、物件之下（不参与深度排序，小地面物可接受被树/墙遮）。
   *   ⚠ 防刷待办：本版不做"已采存档"，重进图会重随——收益温和（银两少、宝箱≤1/图、装备 25%），
   *      且重进图要花时间走图，成本在；后续若要根治再加"已采记录进存档"。 */
  function makeNodes() {
    nodes = [];
    if (!CUR || !CUR.ground) return;
    var cells = [];
    for (var y = 0; y < CUR.h; y++)
      for (var x = 0; x < CUR.w; x++)
        if (walkable(x, y)) cells.push(x + ',' + y);
    if (!cells.length) return;
    for (var i = cells.length - 1; i > 0; i--) {            // Fisher–Yates 打乱
      var j = Math.floor(Math.random() * (i + 1));
      var t = cells[i]; cells[i] = cells[j]; cells[j] = t;
    }
    var occ = {};                                            // 排除 foe / 出生点所在格
    for (var fi = 0; fi < foes.length; fi++) occ[foes[fi].x + ',' + foes[fi].y] = 1;
    occ[Math.round(player.mx) + ',' + Math.round(player.my)] = 1;
    var total = Math.max(3, Math.floor(cells.length * 0.012));
    var placed = 0;
    // 宝箱保底：每图至少 1 个，让"逛图找宝箱"体验成立（旧 8.3% 概率使多数图 0 宝箱）。
    // 大图（total>=8）额外 50% 概率再放 1 个。
    if (cells.length) {
      for (var ci = 0; ci < cells.length && placed < total; ci++) {
        var cp = cells[ci].split(','), cgx = +cp[0], cgy = +cp[1];
        if (occ[cgx + ',' + cgy]) continue;
        occ[cgx + ',' + cgy] = 1;
        nodes.push({ x: cgx, y: cgy, type: 'chest', pulse: Math.random() * 6.2832 });
        placed++;
        break;
      }
      if (total >= 8 && Math.random() < 0.5) {
        for (var cj = 0; cj < cells.length && placed < total; cj++) {
          var dp = cells[cj].split(','), dgx = +dp[0], dgy = +dp[1];
          if (occ[dgx + ',' + dgy]) continue;
          occ[dgx + ',' + dgy] = 1;
          nodes.push({ x: dgx, y: dgy, type: 'chest', pulse: Math.random() * 6.2832 });
          placed++;
          break;
        }
      }
    }
    for (var c = 0; c < cells.length && placed < total; c++) {
      var pa = cells[c].split(','), gx = +pa[0], gy = +pa[1];
      if (occ[gx + ',' + gy]) continue;
      occ[gx + ',' + gy] = 1;
      var r = Math.random();
      var type = r < 0.42 ? 'ore' : 'herb';  // 矿石~42% / 灵草~58%（宝箱已保底放置）
      nodes.push({ x: gx, y: gy, type: type, pulse: Math.random() * 6.2832 });
      placed++;
    }
  }
  function updateGather(dt) {
    var g = player.gatherTarget;
    if (!g) return;
    if (nodes.indexOf(g) < 0) { player.gatherTarget = null; return; }   // 已被采掉
    if (Math.hypot(player.mx - g.x, player.my - g.y) < 0.9) {
      var idx = nodes.indexOf(g);
      if (idx >= 0) { gatherNode(g); nodes.splice(idx, 1); }
      player.gatherTarget = null;
    }
  }
  function gatherNode(n) {
    if (n.type === 'herb') {
      var g = rndInt(8, 15);
      player.stones += g; bagDirty = true;
      addFloater(n.x, n.y - 0.3, '+' + g + ' 银两', '#8bf3ff');
    } else if (n.type === 'ore') {
      var o = rndInt(14, 25);
      player.stones += o; bagDirty = true;
      addFloater(n.x, n.y - 0.3, '+' + o + ' 银两', '#8bf3ff');
    } else {   // chest：银两 + 妖丹 + 25% 装备
      var cs = rndInt(40, 90);
      player.stones += cs; bagDirty = true;
      var cd = rndInt(1, 3);
      collectItem('yaodan', cd, n.x, n.y);
      addFloater(n.x, n.y - 0.3, '+' + cs + ' 银两 · 妖丹×' + cd, '#ffdf9b');
      var gotGear = Math.random() < 0.25;
      if (gotGear) {
        var gg = rollGear(false);
        if (gearInv.length < gearCap()) collectGear(gg, n.x, n.y);
        else { player.stones += 30; addFloater(n.x, n.y - 0.6, '行囊满 +30 银两', '#8bf3ff'); gotGear = false; }
      }
      toast('开启宝箱：' + cs + ' 银两 · 妖丹×' + cd + (gotGear ? ' · 得一件装备！' : ''));
    }
    quest.gather++; checkQuest();   // ★4 任务：采集进度
  }
  function drawNodes() {
    for (var i = 0; i < nodes.length; i++) drawNode(nodes[i]);
  }
  function drawNode(n) {
    var p = isoToScreen(n.x, n.y);
    var baseY = p.y;
    ctx.save();
    var br = 0.82 + 0.18 * Math.sin(time * 3 + n.pulse);    // 呼吸
    ctx.globalAlpha = 0.26; ctx.fillStyle = '#0b1a12';
    ctx.beginPath(); ctx.ellipse(p.x, baseY, 11 * Z, 5 * Z, 0, 0, 6.2832); ctx.fill();
    ctx.globalAlpha = 1;
    if (n.type === 'herb') {
      for (var b = 0; b < 3; b++) {
        var ang = -Math.PI / 2 + (b - 1) * 0.5;
        var lx = p.x + Math.cos(ang) * 8 * Z * br;
        var ly = baseY + Math.sin(ang) * 13 * Z * br;
        ctx.fillStyle = b === 1 ? '#74e07a' : '#4cbf68';
        ctx.beginPath();
        ctx.moveTo(p.x, baseY);
        ctx.quadraticCurveTo(p.x + Math.cos(ang) * 5 * Z, baseY + Math.sin(ang) * 9 * Z, lx, ly);
        ctx.quadraticCurveTo(p.x + Math.cos(ang) * 3 * Z, baseY + Math.sin(ang) * 6 * Z, p.x, baseY);
        ctx.fill();
      }
      ctx.globalAlpha = 0.55 * br; ctx.fillStyle = '#b6ffce';
      ctx.beginPath(); ctx.arc(p.x, baseY - 13 * Z, 1.6 * Z, 0, 6.2832); ctx.fill();
    } else if (n.type === 'ore') {
      var cols = ['#a6bccf', '#cfe2f4', '#88a0b4'];
      for (var k = 0; k < 3; k++) {
        var ox = (k - 1) * 5 * Z, oy = baseY - (k % 2 ? 7 : 3) * Z;
        ctx.fillStyle = cols[k];
        ctx.beginPath();
        ctx.moveTo(p.x + ox, baseY);
        ctx.lineTo(p.x + ox - 4 * Z, baseY - 7 * Z);
        ctx.lineTo(p.x + ox, baseY - 14 * Z * br);
        ctx.lineTo(p.x + ox + 4 * Z, baseY - 7 * Z);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.6 * Z; ctx.stroke();
      }
    } else {   // chest：经典圆顶木宝箱（拱顶 + 金属横箍 + 大锁 + 包角）
      var w = 24 * Z, hb = 13 * Z, hg = 10 * Z;
      var bx = p.x - w / 2, by = baseY - hb;          // 箱体左上角
      // 落地阴影
      ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(p.x, baseY + 2 * Z, w * 0.62, hb * 0.32, 0, 0, 6.2832); ctx.fill();
      ctx.globalAlpha = 1;
      // 背后金色光晕（呼吸，让宝箱在暗地形中"发光"）★ v47.3 闪光特效
      var glow = 0.18 + 0.12 * Math.sin(time * 4 + n.pulse);
      var ggx = p.x, ggy = by + hb * 0.15;
      var ggrad = ctx.createRadialGradient(ggx, ggy, 2 * Z, ggx, ggy, 22 * Z);
      ggrad.addColorStop(0, 'rgba(255,224,138,' + (glow + 0.10).toFixed(3) + ')');
      ggrad.addColorStop(1, 'rgba(255,224,138,0)');
      ctx.globalAlpha = 1; ctx.fillStyle = ggrad;
      ctx.beginPath(); ctx.arc(ggx, ggy, 22 * Z, 0, 6.2832); ctx.fill();
      // 箱体（木色 + 正面竖纹）
      ctx.fillStyle = '#7a4a22'; ctx.fillRect(bx, by, w, hb);
      ctx.strokeStyle = 'rgba(60,36,18,.55)'; ctx.lineWidth = 1 * Z;
      for (var s = 1; s <= 2; s++) {
        var lx = bx + w * s / 3;
        ctx.beginPath(); ctx.moveTo(lx, by + 1.5 * Z); ctx.lineTo(lx, baseY - 1.5 * Z); ctx.stroke();
      }
      // 圆顶盖（拱形）
      ctx.fillStyle = '#5e3618';
      ctx.beginPath(); ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(p.x, by - hg * 1.7, bx + w, by); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,220,160,.35)'; ctx.lineWidth = 1 * Z;
      ctx.beginPath(); ctx.moveTo(bx + 3 * Z, by - hg * 0.7);
      ctx.quadraticCurveTo(p.x, by - hg * 1.5, bx + w - 3 * Z, by - hg * 0.7); ctx.stroke();
      // 金属横箍（箱盖与箱体交界）
      ctx.fillStyle = '#d9a441'; ctx.fillRect(bx - 1 * Z, by - 2 * Z, w + 2 * Z, 3.2 * Z);
      ctx.strokeStyle = '#8a6418'; ctx.lineWidth = 0.8 * Z; ctx.strokeRect(bx - 1 * Z, by - 2 * Z, w + 2 * Z, 3.2 * Z);
      // 左右包角
      ctx.fillStyle = '#caa03a';
      ctx.fillRect(bx - 1 * Z, baseY - 3 * Z, 2.4 * Z, 3 * Z);
      ctx.fillRect(bx + w - 1.4 * Z, baseY - 3 * Z, 2.4 * Z, 3 * Z);
      // 中央大锁
      ctx.fillStyle = '#e8c25a';
      ctx.beginPath(); ctx.arc(p.x, by, 3.6 * Z, 0, 6.2832); ctx.fill();
      ctx.strokeStyle = '#7a5a1e'; ctx.lineWidth = 1 * Z; ctx.stroke();
      ctx.fillStyle = '#4a3210';
      ctx.beginPath(); ctx.arc(p.x, by + 0.6 * Z, 1 * Z, 0, 6.2832); ctx.fill();
      // 顶部呼吸微光
      ctx.globalAlpha = 0.55 * br; ctx.fillStyle = '#ffe9a8';
      ctx.beginPath(); ctx.arc(p.x, by - hg, 2 * Z, 0, 6.2832); ctx.fill();
      // 闪点：5 颗金点绕宝箱上方错相闪现 ★ v47.3 闪光特效
      for (var sp = 0; sp < 5; sp++) {
        var ph = n.pulse + sp * 1.27;
        var fl = Math.max(0, Math.sin(time * 3.2 + ph));
        if (fl < 0.35) continue;
        var ang = ph, rad = 13 * Z + (sp % 3) * 3 * Z;
        var sx = p.x + Math.cos(ang) * rad;
        var sy = by - Math.abs(Math.sin(ang)) * 9 * Z - 3 * Z;
        ctx.globalAlpha = fl * 0.95; ctx.fillStyle = '#fff6cf';
        ctx.beginPath(); ctx.arc(sx, sy, (1.4 + fl) * Z, 0, 6.2832); ctx.fill();
      }
    }
    ctx.restore();
  }
  var bag = {};              // 物品键 → 数量（heal / mat / rare 都在这里；银两不入包）
  var bagDirty = true;       // HUD 脏标记（数量变了才碰 DOM）
  /* ★ 状态行（v43 起默认收起）：正常时只显示「银两 N」，玩家视角干净；
   * ?bagdbg=1 或页面出过错（window.__lastErr，左下角 ⚠ 同源）时自动切调试行
   * —— 排查判据常备（bt/d/r/失联/拾/错），但不再打扰正常游戏。
   * 强刷逻辑保留：银两显示依然是 0.5s 实时（v42 的兜底轮询不动）。 */
  var BAG_DEBUG = /(^|[?&])bagdbg=1(&|$)/.test(location.search);
  var __lastPickup = '';     // 最近一次入包（状态行排查用）
  var __bagOrphan = 0;       // 失联格子数：bagCells 里有、但已不在页面 DOM 里的数量
  function bagDebugLine() {
    var parts = [];
    BAG_ORDER.forEach(function (k) { parts.push(k.slice(0, 4) + ':' + (bag[k] || 0)); });
    var c0 = bagCells.jinchuang, cv0 = c0 && c0.querySelector('canvas.ico');
    var cls0 = c0 ? c0.className.replace('cell', '').trim() : '?';
    var f0 = cv0 ? (cv0.style.filter || '(none)').replace(/drop-shadow\([^)]*\)/, 'ds()') : '?';
    return 'v' + (window.__VTAG || '?') + ' ' + parts.join(' ') +
           ' | 银' + player.stones + ' 杀' + (window.__kills || 0) + ' 地' + lootDrops.length +
           ' bt' + (bagBuilt ? 1 : 0) + ' d' + (bagDirty ? 1 : 0) + ' r' + (window.__bagRenders || 0) +
           ' | jc[' + cls0 + '] ' + f0.slice(0, 40) +
           (__bagOrphan ? ' 失联' + __bagOrphan : '') +
           (__lastPickup ? ' | 拾:' + __lastPickup : ' | 未拾') +
           (window.__lastErr ? ' | 错:' + window.__lastErr : '');
  }
  var healHinted = false;    // 药品用法是否已提示过
  var yaodanHinted = false;  // 妖丹（炼化）提示过没有
  var xuantieHinted = false; // 玄铁令（重铸）提示过没有
  var healCd = 0;            // 服药公共冷却（防止一口气连嗑）
  var HEAL_CD = 0.6;
  var healUsed = '';         // 刚服下的那一格（只有它该显示冷却灰，不是全场一起灰）
  var bagOpen = false;       // 背包面板是否展开

  /* ---------------- 药品服用 ----------------
   * 只做三件事：确认能用（冷却/满血/有货）→ 回血 → 给反馈。
   * 三条设计取舍写在前面，免得以后被"优化"掉：
   *   ① 满血时**不消耗**，只提示。否则手滑点一下就白丢一瓶药。
   *   ② 服药**能在战斗中**（挨打时也想自救），只有倒地不许（player.dead）。
   *   ③ 有公共冷却 HEAL_CD，防止按住数字键一口气嗑光整包。
   */
  function useHeal(key) {
    var it = ITEMS[key];
    if (!it || it.kind !== 'heal') return false;
    if (player.dead) { toast('已经倒下了，先等回魂'); return false; }
    if (!bag[key]) { toast('背包里没有' + it.cn); return false; }
    if (player.hp >= player.maxhp) { toast('气血已满，留着'); return false; }
    if (healCd > 0) return false;
    healCd = HEAL_CD;
    healUsed = key;                          // 只灰这一格（见 renderBag 的 .cool 注释）
    var before = player.hp;
    player.hp = Math.min(player.maxhp, player.hp + player.maxhp * it.val);
    var got = Math.round(player.hp - before);
    bag[key]--;
    if (bag[key] <= 0) delete bag[key];
    bagDirty = true;
    // 飘字 + 环形涟漪都发一次：数字说明「回了多少」，涟漪说明「药生效了」
    addFloater(player.mx, player.my - 0.5, '+' + got, '#7dff9b');
    healFx = 0.55;
    toast('服下' + it.cn + '，气血 +' + got);
    return true;
  }
  /* ---------------- 妖丹炼化（v54：妖丹的出口） ----------------
   * 为什么是"点一下炼化**全部**"而不是一枚一枚点：
   *   妖丹是攒着来的（普通怪 45%、精英一次 1~3 枚），一枚一枚点等于让玩家做几十次无效点击。
   *   一次炼光的代价只有"没法留几枚看着玩"，换来的是一直不断的打怪节奏。
   */
  function refineYaodan() {
    var n = bag.yaodan | 0;
    if (!n) { toast('没有妖丹可炼 —— 打妖兽会掉'); return false; }
    delete bag.yaodan;
    bagDirty = true;
    var gain = n * YAODAN_CULT;
    addFloater(player.mx, player.my - 0.5, '修为 +' + gain, '#c78bff');
    var up = gainCult(gain);
    var nx = realmNext();
    var tail = up ? '' : (nx ? '　·　距' + nx.cn + '还需 ' + Math.max(0, nx.need - player.exp)
      : '　·　已至化神圆满');
    toast('炼化 ' + n + ' 枚妖丹 → 修为 +' + gain + tail);
    return true;
  }
  /** 玄铁令：v55 起不再有"取出/收起"的模式，点它只报一句"有多少、怎么用"。
   *  少一个隐式状态，就少一类"点了没反应"的困惑。 */
  function hintReforge() {
    var n = bag.xuantie | 0;
    if (!n) { toast('没有玄铁令 —— 精英妖兽身上才出（练功场那只不算）'); return false; }
    toast('玄铁令 ' + n + ' 枚 —— 点任意装备格，在操作卡里选「重铸」');
    return true;
  }
  /* ═════════ 符箓 · 限时增益（v58）════════
   * 与丹药的分工：**丹药 = 即时救命（钱换命），符箓 = 一段时间的强度（钱换窗口）**。
   * 三条规矩，改以前先读：
   *   ① **同款只刷新时长，不叠倍率**。允许叠加的话，"开战前嗑五张锐金符"就是 +125% 攻，
   *      符箓会从消耗品退化成必刷仪式 —— 而且越攒越强，怪的设计强度全部失效。
   *   ② **倒地一律清除**。倒地是这个游戏唯一的真实惩罚（折损银两），符箓跟着散掉，
   *      "这波亏了"才有痛感；不清就变成倒地也白赚一段时长。
   *   ③ **不进存档**。它是"此刻在生效"的瞬时状态，存进去就得处理"下线两天回来还亮着吗"。
   * 生效点只有两处，都在既有出口上：recalcStats()（攻/御）与移动速度那一行（移速）。
   */
  function useBuff(key) {
    var it = ITEMS[key], b = BUFFS[key];
    if (!it || !b) return false;
    if (player.dead) { toast('已经倒下了，先等起身'); return false; }
    if (!bag[key]) { toast('没有' + it.cn + ' —— 坊市有卖'); return false; }
    bag[key]--;
    if (bag[key] <= 0) delete bag[key];
    /* 直接赋值 = 刷新时长（不是 += ，那就是叠加了，见规矩①） */
    buffT[key] = it.dur;
    recalcStats();
    bagDirty = true;
    addFloater(player.mx, player.my - 0.5, it.cn, '#ffd24a');
    toast(it.cn + ' 生效 · ' + it.desc);
    renderBuffs();
    return true;
  }
  /** 倒地/换局时清掉全部符箓。返回是否真的清掉了东西（给 toast 用）。 */
  function clearBuffs() {
    var k, had = false;
    for (k in buffT) if (buffT.hasOwnProperty(k)) { if (buffT[k] > 0) had = true; buffT[k] = 0; }
    if (had) { recalcStats(); renderBuffs(); }
    return had;
  }
  /** 每帧推进符箓计时。**只有真的到期才 recalcStats** ——
   *  乘数是常数，没必要每帧重算一遍属性（那是白跑）。 */
  function tickBuffs(dt) {
    var k, gone = false;
    for (k in buffT) {
      if (!buffT.hasOwnProperty(k) || buffT[k] <= 0) continue;
      buffT[k] -= dt;
      if (buffT[k] <= 0) { buffT[k] = 0; gone = true; toast(BUFFS[k].cn + ' 失效'); }
    }
    if (gone) { recalcStats(); renderBuffs(); }
  }
  /** 上面板里的符箓计时条。★ 无符箓时整条 hidden —— 面板矮一截，左列圆钮靠
   *  --tlb 自动跟着上移（v53 那套机制），不用另写一处定位。 */
  var buffRowShown = false;
  function renderBuffs() {
    var el = document.getElementById('buffRow');
    if (!el) return;
    var out = '', k, on = 0;
    for (k in buffT) {
      if (!buffT.hasOwnProperty(k) || buffT[k] <= 0) continue;
      on++;
      out += '<span class="bf">' + BUFFS[k].cn + ' ' + Math.ceil(buffT[k]) + 's</span>';
    }
    if (on) el.innerHTML = out; else el.innerHTML = '';
    if (!!on !== buffRowShown) {
      buffRowShown = !!on;
      if (on) el.removeAttribute('hidden'); else el.setAttribute('hidden', '');
      syncLeftBtns();      // 面板高度变了 → 左列圆钮要重排（别等 0.5s 心跳）
    }
  }
  /* ═════════ 秘宝：凝元丹 / 储物玉匣（v58）════════
   * 两者都是"钱换进度"，所以都必须有硬上限 —— 不然游戏的成长主线（打怪攒修为 / 行囊取舍）
   * 会被银两直接买断。上限的**计数都进存档**，否则"用完刷新页面"就能无限吃。 */
  function useNingyuan() {
    if (!bag.ningyuan) { toast('没有凝元丹 —— 坊市有卖'); return false; }
    /* 换境界自动重置额度：存的是"在哪一重买的"，所以不用写"突破时清零"这种会漏的分支。 */
    if (cultBuyRealm !== player.realmIdx) { cultBuyRealm = player.realmIdx; cultBuyN = 0; }
    if (cultBuyN >= SHOP_CULT_MAX) {
      toast('这一重境界的凝元丹已服满（' + SHOP_CULT_MAX + ' 枚）\n突破之后才能再服');
      return false;
    }
    bag.ningyuan--;
    if (bag.ningyuan <= 0) delete bag.ningyuan;
    cultBuyN++;
    bagDirty = true;
    addFloater(player.mx, player.my - 0.5, '修为 +' + NINGYUAN_CULT, '#c78bff');
    var up = gainCult(NINGYUAN_CULT);
    var nx = realmNext();
    var tail = up ? '　·　突破至 ' + player.realmName
      : (nx ? '　·　距' + nx.cn + '还需 ' + Math.max(0, nx.need - player.exp) : '　·　已至化神圆满');
    toast('服下凝元丹 → 修为 +' + NINGYUAN_CULT + tail +
      '\n本境界已服 ' + cultBuyN + '/' + SHOP_CULT_MAX);
    saveGame(true);      // 限量计数立刻落盘（"吃完就刷新"这条漏洞必须当场堵住）
    return true;
  }
  function useVault() {
    if (!bag.yuxia) { toast('没有储物玉匣 —— 坊市有卖'); return false; }
    if ((vaultLv | 0) >= VAULT_MAX) {
      toast('储物玉匣已经用满（+' + (VAULT_STEP * VAULT_MAX) + ' 格）'); return false;
    }
    bag.yuxia--;
    if (bag.yuxia <= 0) delete bag.yuxia;
    vaultLv = (vaultLv | 0) + 1;
    bagDirty = true; lastGearSig = '';    // 行囊区要重画（格数与计数都变了）
    toast('行囊扩容 · 上限 ' + gearCap() + ' 格（' + vaultLv + '/' + VAULT_MAX + '）');
    saveGame(true);
    return true;
  }
  /** 服药时的地面涟漪（在主角脚下扩散一圈绿光） */
  var healFx = 0;
  function drawHealFx() {
    if (healFx <= 0) return;
    var p = isoToScreen(player.mx, player.my);
    var q = healFx / 0.55;                    // 1 → 0
    var rr = (1 - q) * 46 * Z + 8 * Z;
    ctx.save();
    ctx.globalAlpha = q * 0.75;
    ctx.strokeStyle = '#7dff9b'; ctx.lineWidth = 2.4 * Z;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + HH * Z, rr, rr * 0.5, 0, 0, 6.2832);
    ctx.stroke();
    ctx.globalAlpha = q * 0.28;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + HH * Z, rr * 0.6, rr * 0.3, 0, 0, 6.2832);
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------- 背包栏 ----------------
   * 格子按 ITEMS 的 key 顺序固定生成（不按持有量排序）——
   * 位置稳定才能让「1/2/3 对应哪瓶药」变成肌肉记忆，图标乱跑反而难用。
   * 三种药固定占前三格（金创药 / 小还丹 / 大还丹），材料类排后面只展示。
   */
  var BAG_ORDER = ['jinchuang', 'xiaohuan', 'dahuan', 'ruijin', 'panshi', 'shenxing',
    'ningyuan', 'yuxia', 'yaodan', 'xuantie'];
  var BAG_KEYS = { jinchuang: '1', xiaohuan: '2', dahuan: '3' };
  var bagCells = {};         // key → cell 元素（增量更新计数，不重建 DOM）
  var bagBuilt = false;
  /* 图标在格子里的显示边长（px）。v58：格子从 52 收到 48（常备栏改 5 列 2 行，
   * 见 index.html 里 #bag .grid 的注释），图标跟着从 46 收到 40 —— 留出 4px 内边距，
   * 否则图标会贴到格线，看起来像"没对齐"。 */
  var BAG_ICON = 40;

  /* ★★ 从图集里"取一帧"的**唯一**正确写法
   *
   * ══ 2026-09-17 第二轮修复（用户第二次报「拾取物品后，背包里还是没有」）══
   * 上一版用 CSS background 取帧：background-size(整图×sc) + background-position(-sx*sc,-sy*sc)。
   * 几何上完全正确（自动化断言逐格算可见区间全部 [0,46] 通过），**但图标依然一格都不显示**。
   * 实测根因（`?autotest=loot` 探针输出）：
   *   bgUrl     = "blob:file:///a4eb0591-..."   ← bagIconEl 写进 CSS 的那个 URL
   *   atlasSrc  = "blob:file:///a4eb0591-..."   ← ATLAS.items.img.src，同一个 blob
   *   atlasNatural = "782x198"                  ← 图片元素本身解码正常
   *   bgLoads   = "FAIL(onerror)"               ← ★ 拿这个 URL 新建 Image() 直接失败
   *
   * 为什么：图集是 fetch → Blob → URL.createObjectURL → Image() 加载的，
   * 而 blobImage() 在 im.onload 里**立刻** URL.revokeObjectURL(url)。
   *   · <img src="blob:..."> 元素：像素在 revoke 之前已解码进元素 → 之后 drawImage 一直正常；
   *   · CSS background-image:url("blob:...")：**惰性取像素**，revoke 之后浏览器再去取 → 取不到
   *     → 背景为空 → 图标空白，**且不报任何错、控制台干净**。
   * 所以上一轮的几何断言全绿也没用：它只读了 inline style 字符串，
   * 从没验证过"这串声明在浏览器里能不能真的取到像素"。
   *
   * ⛔ 结论（治本）：**不要用 pz.img.src（blob URL）当任何 CSS 的 URL**。
   * 改用 <canvas> + ctx.drawImage(已解码的 <img> 元素, sx, sy, w, h, 0, 0, 46, 46) ——
   * 直接消费已解码的图片元素，语义与 drawImage 完全一致，从结构上不可能踩到 URL 生命周期问题。
   *
   * 附带保留的两条老教训：
   *   ① 图集帧的**步进**是 `帧宽 + PAD`（本图集 128+2=130），不是帧宽。用 <img>+left/top 按帧宽
   *      平移每格偏 `PAD*sc`，累积到第 6 格移出取景框 —— 静默错位。drawImage 没有这个漂移。
   *   ② 图还没解码完（naturalWidth=0）时先不画，等 load 后重建；否则缩放系数是 Infinity。
   */
  function bagIconEl(pz, cn, size) {
    var S = size || BAG_ICON;   // 背包格 / 左上角快捷药格共用同一份画法，只是目标边长不同
    var nw = pz.img.naturalWidth || pz.img.width || 0;
    var nh = pz.img.naturalHeight || pz.img.height || 0;
    if (!pz.w || !nw || !nh) {                   // 图未解码完 → 挂 load 后重建
      if (pz.img && !pz.img._bagHooked) {
        pz.img._bagHooked = true;
        // ★ 两处 UI 都要重建：只翻 bagBuilt 的话，快捷药栏会停在"没图"的空白态
        pz.img.addEventListener('load', function () {
          bagBuilt = false; quickBuilt = false; buildBagUI();
        });
      }
      return null;
    }
    var cv = document.createElement('canvas');
    cv.className = 'ico';
    cv.width = cv.height = S;
    cv.title = cn;
    cv.style.cssText =
      'position:absolute;left:50%;top:50%;' +
      'width:' + S + 'px;height:' + S + 'px;' +
      'margin:' + (-S / 2) + 'px 0 0 ' + (-S / 2) + 'px;' +
      'pointer-events:none;image-rendering:auto';
    try {
      cv.getContext('2d').drawImage(pz.img, pz.sx, pz.sy, pz.w, pz.h, 0, 0, S, S);
    } catch (e) {
      return null;                               // 画失败就退回文字首字，至少不是空白格
    }
    return cv;
  }

  function buildBagUI() {
    var g = document.getElementById('bagGrid');
    if (!g) return;
    g.innerHTML = ''; bagCells = {};
    BAG_ORDER.forEach(function (key) {
      var it = ITEMS[key]; if (!it) return;
      var c = document.createElement('div');
      c.className = 'cell';
      c.title = it.cn + '：' + it.desc;
      // 图标：优先高清大图（items_atlas.json 里的 <icon>_big，128px 帧降到 46px 显示），
      // 没图集就退回文字首字 —— 至少还能玩，不是空白格。
      var pz = piece(it.icon + '_big') || piece(it.icon);
      var ico = pz ? bagIconEl(pz, it.cn) : null;
      if (ico) {
        c.appendChild(ico);
      } else {
        var s = document.createElement('span');
        s.style.cssText = 'font-size:19px;color:#ffe6a6';
        s.textContent = it.cn.charAt(0);
        c.appendChild(s);
      }
      var n = document.createElement('b'); n.className = 'n'; c.appendChild(n);
      if (BAG_KEYS[key]) {
        var kb = document.createElement('span'); kb.className = 'kb';
        kb.textContent = BAG_KEYS[key]; c.appendChild(kb);
      }
      /* ★ 触摸屏上 touchstart 与 click 会**连着触发两次**（同一根手指）。
       *   丹药过去靠 0.6s 公共冷却兜住了第二次；炼化/重铸没有冷却 —— 第二次进来妖丹已经空了，
       *   会弹一句"没有妖丹可炼"，看着就像 bug。所以在这里用时间戳去重：一次手势只算一次。 */
      var lastFireT = 0;
      var fire = function (ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        var nowT = Date.now();
        if (nowT - lastFireT < 350) return;
        lastFireT = nowT;
        if (it.kind === 'heal') { useHeal(key); return; }
        if (it.kind === 'buff') { useBuff(key); return; }
        if (it.act === 'cult') { useNingyuan(); return; }
        if (it.act === 'vault') { useVault(); return; }
        if (it.act === 'refine') { refineYaodan(); return; }
        if (it.act === 'reforge') { hintReforge(); return; }
        toast(it.cn + '：' + it.desc);
      };
      c.addEventListener('click', fire);
      c.addEventListener('touchstart', fire, { passive: false });
      g.appendChild(c);
      bagCells[key] = c;
    });
    bagBuilt = true;
    bagDirty = true;
    buildQuickUI();   // 快捷药栏同源同步建（同一张图集、同一批药品，避免两边不同步）
    renderBag();      // 立刻刷一遍：否则要等下一帧循环才上 .use / 计数，中间有一帧是"半成品"
  }

  /* ═════════ 装备区 UI（已装备 3 槽 + 行囊网格）═════════
   * 挂进现有背包体系：**同一个 bagDirty 脏标记、同一份数据源**（gearInv / equipped）。
   * 重建策略用「签名比対」—— signature 变了才动 DOM，否则 0.5s 一次强刷会把面板整棵重建，
   * 既伤手机性能，也会把正在长按的元素从手指底下抽走。
   */
  var GEAR_ICON = 38;            // 行囊格 42px 里的图标边长（留一圈边距给边框）
  var EQ_ICON = 46;              // 已装备槽 52px
  var gearBuilt = false, lastGearSig = '';
  function gearSig() {
    var s = '', i;
    for (i = 0; i < GEAR_SLOTS.length; i++) {
      var g = equipped[GEAR_SLOTS[i].key];
      s += (g ? (GEAR_SLOTS[i].key + ':' + g.id + ':' + g.t) : GEAR_SLOTS[i].key + ':-') + '|';
    }
    for (i = 0; i < gearInv.length; i++) s += gearInv[i].id + ':' + gearInv[i].t + ',';
    return s;
  }
  /** 造一枚装备格（行囊 / 已装备槽通用）：图标 + 品质边框 + 悬停详情。
   *  v55：**点击 = 弹出操作卡**（原来点击是直接穿戴/卸下、长按才是熔炼）。
   *  这里只负责"报出我是哪一个"，动作全部收在 openGearCard 里。 */
  function makeGearCell(g, size, slotName) {
    var c = document.createElement('div');
    c.className = 'g' + (g ? ' t' + (g.t + 1) : ' empty');
    if (g) {
      var pz = piece(g.key + '_big') || piece(g.key);
      var ico = pz ? bagIconEl(pz, gearName(g), size) : null;
      if (ico) c.appendChild(ico);
      else {
        var s0 = document.createElement('span');
        s0.style.cssText = 'font-size:15px;color:#ffe6a6';
        s0.textContent = gearBase(g).cn.charAt(0);
        c.appendChild(s0);
      }
      c.title = gearName(g) + '（' + gearTier(g).cn + '）\n' +
        gearStatsLine(g, '\n') + '\n' + gearBase(g).note +
        '\n点一下打开操作卡（装备 / 融炼 / 丢弃）';
      c.addEventListener('click', function (ev) {
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        openGearCard(g);
      });
    } else {
      var sp = document.createElement('span');
      sp.className = 'slot';
      sp.textContent = slotName;
      c.appendChild(sp);
      c.title = slotName + '位空缺 —— 行囊里有对应装备时点一下穿上';
    }
    return c;
  }
  function buildGearUI() {
    var eg = document.getElementById('eqGrid');
    if (eg) {
      eg.innerHTML = '';
      GEAR_SLOTS.forEach(function (sl) {
        eg.appendChild(makeGearCell(equipped[sl.key], EQ_ICON, sl.cn));
      });
    }
    var gg = document.getElementById('gearGrid');
    if (gg) {
      gg.innerHTML = '';
      gearInv.forEach(function (g) {
        gg.appendChild(makeGearCell(g, GEAR_ICON, gearBase(g).cn));
      });
    }
    gearBuilt = true;
  }

  /* ═════════ 装备操作卡（v55）════════
   * 用户原话：「装备长按熔炼能不能改成点击，有装备/使用或熔炼或者丢弃什么的」。
   * 换掉长按的三个理由：
   *   ① **不可发现**：没人会去长按一个格子"试试看"，熔炼这个功能等于藏起来了；
   *   ② **看不到属性**：桌面靠 `title` tooltip 显示，而手机上 tooltip 根本不触发
   *      —— 玩家穿着装备却不知道它给了什么，卡片顺手把属性摊在脸上；
   *   ③ **手势互相误伤**：长按抬手浏览器还会补一个 click，长按语义与点击语义冲突时
   *      必须到处加守卫（v54 就为此在 reforgeGear 里加过一道"这件还在不在"）。
   *
   * 做成**居中浮层**而不是贴着格子的气泡：面板本身是 fixed + 触屏下 transform 缩放的，
   * 气泡的定位会在"缩放 / 面板高度变化 / 滚动"三件事上反复出问题（v53 刚修过一轮）。
   * 浮层放 body 下、**不带 .hud 类** —— 带了会被 .hud{pointer-events:none} 继承，按钮点不到。 */
  var cardGear = null;                      // 卡片当前对应的装备实例
  function cardOpen() {
    var box = document.getElementById('gearMenu');
    return !!box && !box.hasAttribute('hidden');
  }
  function closeGearCard() {
    var box = document.getElementById('gearMenu');
    if (box) box.setAttribute('hidden', '');
    cardGear = null;
  }
  /** 造一个卡片按钮。data-a 是动作名（自测靠它当靶子，比按文字找稳）。 */
  function cardBtn(host, label, act, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-a', act);
    b.className = cls || '';
    b.textContent = label;
    host.appendChild(b);
    return b;
  }
  function openGearCard(g) {
    var box = document.getElementById('gearMenu');
    if (!box) return false;
    var b = gearBase(g);
    if (!b) return false;
    var tier = gearTier(g), worn = wornSlotOf(g);
    var t = document.getElementById('gmTitle'), sub = document.getElementById('gmSub'),
      st = document.getElementById('gmStats'), note = document.getElementById('gmNote'),
      btns = document.getElementById('gmBtns');
    if (t) t.textContent = gearName(g);
    if (sub) sub.textContent = tier.cn + ' · ' + b.cn + ' · ' +
      (worn ? '已装备（' + gearSlotCn(b.slot) + '位）' : '行囊中');
    /* 属性摊在脸上 —— 手机上 title tooltip 根本不触发，这是玩家唯一能看到自己穿了什么的地方。 */
    if (st) st.textContent = gearStatsLine(g, '\n') + '\n熔炼可得约 ' + gearValue(g) + ' 银两';
    if (note) note.textContent = b.note +
      (bag.xuantie | 0 ? '\n（可用玄铁令重铸词缀：只洗词缀，品质与基座不变）' : '');
    if (btns) {
      btns.innerHTML = '';
      if (worn) {
        cardBtn(btns, '卸下', 'unequip');
      } else {
        cardBtn(btns, '装备', 'equip');
        cardBtn(btns, '熔炼 +' + gearValue(g), 'melt', 'warn');
        cardBtn(btns, '丢弃', 'dump', 'bad');
      }
      /* 重铸：有玄铁令才出现（没有就不给这个按钮 —— 摆一个点了只弹提示的按钮更像 bug）。
       * 已装备的也能洗，不必先卸下。 */
      if (bag.xuantie | 0) cardBtn(btns, '重铸（耗 1 令）', 'reforge');
      cardBtn(btns, '取消', 'close', 'ghost');
    }
    cardGear = g;
    box.removeAttribute('hidden');
    return true;
  }
  /** 卡片上的动作派发。每个动作先关卡片再执行 —— 执行会改数据、触发装备区重建，
   *  卡片留着会指着一件已经不在的装备（v54 踩过同款：白烧一枚玄铁令还看不见变化）。 */
  function cardAct(a) {
    var g = cardGear;
    if (a === 'close') { closeGearCard(); return; }
    if (!g) { closeGearCard(); return; }
    var slot = wornSlotOf(g);
    closeGearCard();
    if (a === 'equip') { if (!slot) equipGear(g); return; }
    if (a === 'unequip') { if (slot) unequipGear(slot); return; }
    if (a === 'reforge') { reforgeGear(g); return; }
    if (a === 'melt') { if (!slot) meltGear(g); else toast('先卸下再熔炼'); return; }
    if (a === 'dump') {
      if (slot) { toast('已装备的不能丢弃，先卸下'); return; }
      /* 丢弃是纯亏（熔炼至少给银两），所以这里再过一道通用确认框 */
      confirmBox('丢弃 ' + gearName(g) + '？',
        '这件装备会直接消失，**不会**得到任何银两。\n想换钱的话用「熔炼」。',
        '丢弃', function (ok) { if (ok) dumpGear(g); });
      return;
    }
  }
  function wireGearCard() {
    var box = document.getElementById('gearMenu');
    if (!box) return;
    box.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('button[data-a]') : null;
      ev.stopPropagation();
      if (!b) return;
      ev.preventDefault();
      cardAct(b.getAttribute('data-a'));
    });
    // 点遮罩 / 空白处 = 取消（遮罩也在 box 里，上面的分支会先接走按钮）
    var msk = document.getElementById('gmMask');
    if (msk) msk.addEventListener('click', function (ev) {
      ev.stopPropagation(); closeGearCard();
    });
  }
  /* ═════════ 坊市 · 银两的出口（v56）════════
   * 用户一句「是不是应该出一个商店系统，让银两可以用」—— 查了一遍，银两的病是**只进不出**：
   *   产出三条（杀怪必给 / 掉落物拾取 / 熔炼装备），消耗只有一条「倒地折损 30%」，
   *   而那一条是惩罚，不是玩家主动花的钱。于是它一路单调上涨，攒到五位数也不改变任何事 ——
   *   与 v54 之前的妖丹是同一类病（捡起来就只是计数）。
   *
   * 商品两类，各管一件事：
   *   ① **丹药**（常备、无限量）：补给 —— "钱换命"，买了立刻有用且永不贬值。
   *   ② **现货装备**（有限、买走即无）：银两的大目标 —— "钱换实力"，
   *      顺手补上「脸黑一直掉不到装备」这条路：**掉落给运气，商店给积累**。
   *
   * v58 扩成五类，**每类对应一个不同的"钱能买到什么"**（这是不重复铺货的关键）：
   *   ① 丹药  = 钱换命（即时）
   *   ② 符箓  = 钱换一段时间的强度（限时）
   *   ③ 秘宝  = 钱换进度 / 容量（永久，但限量）
   *   ④ 现货装备 = 钱换实力（明码标价、买走即无）
   *   ⑤ 耗材  = 钱换"运气"（玄铁令：把脸黑变成可积累）
   * 加任何新品前先问一句：**它属于哪一类？** 若是"第六类"，先想清楚它替换掉了谁 ——
   * 重复用途的商品只会让货架变长，让玩家多滚两屏。
   *
   * 五条规矩，改以前先读：
   *   ★ ① **买入价必须永远高于熔炼价**。熔炼一件装备值 25~272 银两（看品质与词缀），
   *        所以最低一档也定在 90 —— 否则会出现"买来立刻熔炼"的稳定套利，经济当场崩。
   *        `?autotest=shop` 里有一条断言专门守它（三档品质各验一次）。
   *   ★ ② **现货明码标价，不是盲盒**。花 750 买一件不知道属性的东西，脸黑一次就再也不想进店。
   *        摆出「攻 +18 · 气血 +34」，玩家才知道自己在为什么攒钱；副作用是"同价位里挑属性
   *        最合心意的那件"变成了乐趣（要堆气血就挑堆气血的）。
   *   ★ ③ **价格只由品质决定，不随属性浮动**。同上：价格浮动会让"淘货"退化成"按价格排序"。
   *   ★ ④ **补货只发生在换地图时，不在每次打开商店时**。否则"开→关→开"就能无限刷货，
   *        现货的稀缺性（以及"换张图看看货"的动力）就没了。
   *   ★ ⑤ **v58 补**：限量类商品（凝元丹 / 储物玉匣）**先在买入侧判上限、再判钱** ——
   *        先扣钱后拒绝是最坏的一类 bug（损失无声无息）。同"行囊满"的纪律。
   */
  var SHOP_POTIONS = ['jinchuang', 'xiaohuan', 'dahuan'];
  var SHOP_POTION_PRICE = { jinchuang: 15, xiaohuan: 35, dahuan: 85 };
  /* —— 符箓 / 秘宝 / 耗材（v58）——
   * 定价口径，逐一交代（都不是拍脑袋）：
   *   · 锐金符 45：攻 +25% 顶 90 秒。一件凡品剑（90 银两）给 +5 攻且**永久**；
   *     炼气期底子 20 攻，+25% 也才 +5 —— 所以它必须比装备便宜（60 秒 vs 永久）。
   *     但它**随境界放大**（化神期攻 40+ 时 +25% 值 +10 以上），所以又不能太便宜，
   *     取 45 ≈ 半件凡品：短期爆发，长期不划算，这才是消耗品该有的性价比。
   *   · 磐石符 55：御 +45% 是三条里数值最大的一条（御在减伤公式里是直接减，收益更高）。
   *   · 神行符 40：只影响赶路，不影响战斗数值 —— 定最低价，让"跑图"这件事便宜。
   *   · 凝元丹 400：直接给 150 修为。**用服用上限（每重境界 2 枚）限流，而不是靠价格** ——
   *     光靠高价挡不住"后期银两过剩"。定价 400 的依据：一只普通怪约 8 银两，
   *     400 ≈ 50 只怪；而 50 只怪本身能打出一千多修为。所以它是"补票"不是"捷径"。
   *   · 储物玉匣 900：永久 +4 行囊格。行囊格直接影响"能带几趟装备回来"，
   *     是整个循环的产能。定得上限（2 次）+ 高价，两者缺一不可。
   *   · 玄铁令 220：本来只从精英掉（30%）。上架是给"脸黑但攒了钱"的人一条路 ——
   *     定价必须**高于一次精英清场的期望收益**（一趟清场约 60~120 银两，但还得赌 30%），
   *     220 才能保住"刷精英"的理由。
   */
  var SHOP_GOODS = [
    { key: 'ruijin',   group: 'buff',  price: 45 },
    { key: 'panshi',   group: 'buff',  price: 55 },
    { key: 'shenxing', group: 'buff',  price: 40 },
    { key: 'ningyuan', group: 'rare',  price: 400 },
    { key: 'yuxia',    group: 'rare',  price: 900 },
    { key: 'xuantie',  group: 'stuff', price: 220 }
  ];
  /* 现货定价（下标 = 品质下标：凡/灵/宝/仙）。
   * 必须守住"买 > 卖"：熔炼价 凡 25~50 / 灵 60~130 / 宝 110~230 / 仙 200~272。 */
  var SHOP_TIER_PRICE = [90, 260, 750, 1800];
  var SHOP_STOCK_MAX = 4;
  /* 货架的品质分布（下标 = 货架位）：**刻意做成有梯度的**，不是纯随机。
   * 纯随机会出现"四件全是凡品"—— 玩家攒了一千银两进店，发现没东西可买，那商店就白做了。
   * 四个位 = 垫底一件（新手买得起）+ 低档一件 + 中档一件 + 高档一件（有钱就能升级）。 */
  var SHOP_STOCK_TIER = [
    [0, 60, 35, 5],      /* 位 0：灵品为主，偶尔宝 / 仙 */
    [0, 70, 30, 0],      /* 位 1：灵 / 宝 */
    [50, 50, 0, 0],      /* 位 2：凡 / 灵 */
    [100, 0, 0, 0]       /* 位 3：凡品垫底 */
  ];
  /* 有坊市的地图（v58）：**只在这三张图能买东西**。
   * 为什么必须收紧：补货只发生在"换地图"时，而世界地图可以随便传送 ——
   * 16 张图来回横跳几十秒就能把货架刷成任意想要的，现货的稀缺性等于零。
   * 副作用是好事：城镇 = 补给点，野外 = 猎场，地图之间终于有了功能差异。 */
  var TOWN_MAPS = {
    qingxuan: 1,
    flare_grass_empyrean_campaign_black_oak_city: 1,
    flare_grass_empyrean_campaign_lochport: 1
  };
  var shopStock = [];        // [{ slot, g: 装备实例, price }]
  var shopSeq = 90000;       // 现货实例号（与掉落的 gearSeq 分开编号，避免存档里认错人）

  /** 当前站在有坊市的地图上吗？（三张城镇图，见 TOWN_MAPS） */
  function shopHere() { return !!(CUR && TOWN_MAPS[CUR.id]); }
  /** 当前境界**买得到**的最高品质下标（v58）。
   *  炼气期只到灵品、筑基期到宝品、金丹期起才见仙品。
   *  为什么要有这道闸：16 张图 5 个境界，而货架从第一秒就把 1800 的仙品摆在那里 ——
   *  进店永远是同一屏，没有任何"新东西"。加了闸，"能买得起什么"本身就成了进度的一部分。 */
  function shopMaxTier() { return Math.max(1, Math.min(TIERS.length - 1, 1 + (player.realmIdx | 0))); }

  /** 指定品质搓一件装备（与 rollGear 同口径：器型裸值 × 品质 + 词缀）。
   *  不能直接调 rollGear —— 那里面品质是随机摇的，而货架的品质由位次决定。 */
  function makeShopGear(ti) {
    var bk = GEAR_BASE_KEYS[rndInt(0, GEAR_BASE_KEYS.length - 1)];
    var b = GEAR_BASES[bk], tier = TIERS[ti], k;
    var st = gearBaseSt(b, tier);
    var af = rollAffix(tier);
    for (k in af) if (af.hasOwnProperty(k)) st[k] = (st[k] || 0) + af[k];
    if (st.def < 0 && tier.t <= 1) st.def = 0;   // 与 rollGear 同款：低品别跌成负数让人困惑
    return { id: shopSeq++, key: bk, t: ti, st: st };
  }
  /** 按位补齐货架（**只在换地图时调**，见规矩 ④）。
   *  按位补而不是"补到 4 件"：只补末尾会让"位 0 的仙品被买走后由凡品顶上空缺"，
   *  货架梯度立刻错乱 —— 有钱的玩家进店反而只剩凡品可买。 */
  function restockShop() {
    if (!shopStock) shopStock = [];
    var have = {}, i;
    for (i = 0; i < shopStock.length; i++) have[shopStock[i].slot] = 1;
    for (i = 0; i < SHOP_STOCK_MAX; i++) {
      if (have[i]) continue;
      /* v58：货架品质再被境界**向下夹**一道（shopMaxTier）——
       * 位 0 本来会摇出仙品，炼气期的玩家看着 1800 的仙品只能干瞪眼，
       * 那不是"目标"，是"挫败"。夹一刀之后，同一个位在高境界自然解锁。 */
      var ti = Math.min(shopMaxTier(), pickW(SHOP_STOCK_TIER[i]));
      shopStock.push({ slot: i, g: makeShopGear(ti), price: SHOP_TIER_PRICE[ti] });
    }
    shopStock.sort(function (a, b) { return a.slot - b.slot; });
  }
  function buyPotion(key) {
    var price = SHOP_POTION_PRICE[key] | 0;
    if (price <= 0 || !ITEMS[key]) return false;
    if (player.stones < price) {
      toast('银两不足 —— ' + ITEMS[key].cn + ' 要 ' + price + '，现有 ' + player.stones);
      return false;
    }
    player.stones -= price;
    bag[key] = (bag[key] | 0) + 1;
    bagDirty = true;
    toast('买到 ' + ITEMS[key].cn + ' ×1（余 ' + player.stones + ' 银两）');
    return true;
  }
  function buyStock(idx) {
    var it = shopStock[idx];
    if (!it) return false;
    /* 行囊满必须先判，再扣钱 —— 反过来会做出"钱扣了、装备没进包"，
     * 那是最坏的一类 bug：损失无声无息，玩家只会觉得"钱少了"。 */
    if (gearInv.length >= gearCap()) {
      toast('行囊已满（' + gearCap() + ' 件）—— 先熔炼几件再来');
      return false;
    }
    if (player.stones < it.price) {
      toast('银两不足 —— 要 ' + it.price + '，现有 ' + player.stones);
      return false;
    }
    player.stones -= it.price;
    shopStock.splice(idx, 1);
    gearInv.unshift(it.g);
    bagDirty = true; lastGearSig = '';   // 强制重建装备区，否则新买的这件不显示
    toast('买到 ' + gearName(it.g) + '（' + it.price + ' 银两）\n' + gearStatsLine(it.g, '　'));
    return true;
  }
  /** 符箓 / 秘宝 / 耗材的购买（v58）。与买装备同一条纪律：
   *  **先判"能不能收"，再扣钱** —— 先扣钱后拒绝会造成无声损失。 */
  function buyGoods(key) {
    var g = null, i, it = ITEMS[key];
    for (i = 0; i < SHOP_GOODS.length; i++) if (SHOP_GOODS[i].key === key) g = SHOP_GOODS[i];
    if (!g || !it) return false;
    /* 储物玉匣：行囊上限已经到顶 / 手上还有没用的，都别再卖给他（买了就是废纸）。 */
    if (key === 'yuxia' && ((vaultLv | 0) + (bag.yuxia | 0)) >= VAULT_MAX) {
      toast('储物玉匣已到上限（+' + (VAULT_STEP * VAULT_MAX) + ' 格）');
      return false;
    }
    /* 凝元丹：手上超过"一重境界的额度"就没必要再买 —— 免得玩家把钱换成用不掉的存货。 */
    if (key === 'ningyuan' && (bag.ningyuan | 0) >= SHOP_CULT_MAX) {
      toast('手上已有 ' + SHOP_CULT_MAX + ' 枚凝元丹 —— 先服用再来买');
      return false;
    }
    if (player.stones < g.price) {
      toast('银两不足 —— ' + it.cn + ' 要 ' + g.price + '，现有 ' + player.stones);
      return false;
    }
    player.stones -= g.price;
    bag[key] = (bag[key] | 0) + 1;
    bagDirty = true;
    toast('买到 ' + it.cn + ' ×1（余 ' + player.stones + ' 银两）\n' + it.desc);
    return true;
  }
  /* ── 一键回收（v58）──
   * 只在"纯垃圾"上开一键：凡品熔炼价 25~50，逐件长按熔炼要几十次点击，
   * 那是纯操作税。灵品以上不碰 —— 它可能比身上那件还好，"一键"卖掉好东西是不可挽回的伤害。
   * ★ 回收价**严格等于熔炼价**（一分不加）：只要有一点溢价，"买来立刻回收"就成立，
   *   经济会当场破（与现货定价规矩①同源）。 */
  function trashStat() {
    var n = 0, v = 0, i;
    for (i = 0; i < gearInv.length; i++) {
      if ((gearInv[i].t | 0) === 0) { n++; v += gearValue(gearInv[i]); }
    }
    return { n: n, v: v };
  }
  function recycleTrash() {
    var st = trashStat(), i;
    if (!st.n) { toast('没有可回收的凡品'); return false; }
    for (i = gearInv.length - 1; i >= 0; i--) if ((gearInv[i].t | 0) === 0) gearInv.splice(i, 1);
    player.stones += st.v;
    bagDirty = true; lastGearSig = '';
    addFloater(player.mx, player.my - 0.3, '+' + st.v + ' 银两', '#8bf3ff');
    toast('回收凡品 ' + st.n + ' 件 → ' + st.v + ' 银两（共 ' + player.stones + '）');
    return true;
  }
  /** 回收要先过确认框：一次性丢掉十几件是**不可逆**的，必须有一道门。 */
  function askRecycle() {
    var st = trashStat();
    if (!st.n) { toast('没有可回收的凡品 —— 回收只收未装备的凡品'); return false; }
    confirmBox('回收 ' + st.n + ' 件凡品？',
      '未装备的**凡品**共 ' + st.n + ' 件，回收可得 ' + st.v + ' 银两。\n' +
      '灵品以上不在回收范围（可能比身上那件还好）。',
      '回收', function (ok) { if (ok) { recycleTrash(); renderShop(); } });
    return true;
  }
  /** 坊市入口按钮的可用态（v58：只有城镇才有坊市）。
   *  用 class 而不是 disabled —— 万一同城判断出问题，按钮也不会永远点不动（可自愈）。 */
  var shopBtnTown = null;
  function syncShopBtn() {
    var b = document.getElementById('shopBtn');
    if (!b) return;
    var ok = shopHere();
    if (shopBtnTown === ok) return;
    shopBtnTown = ok;
    b.classList.toggle('off', !ok);
    b.title = ok ? '坊市（用银两买丹药、符箓、秘宝与装备）'
      : '此地无坊市 —— 青玄山门 / 黑橡城 / 洛赫港才有';
  }
  function shopOpen() {
    var el = document.getElementById('shop');
    return !!el && !el.hasAttribute('hidden');
  }
  function closeShop() {
    var el = document.getElementById('shop');
    if (el) el.setAttribute('hidden', '');
    var b = document.getElementById('shopBtn');
    if (b) b.classList.remove('on');
  }
  /** 一行货：图标 + 名称/说明 + 价格按钮。data-a / data-k 供事件委托与自测定位。
   *  价格**写在按钮上**，玩家不用去别处对照 —— 摆一个只说"购买"的按钮等于让人猜。 */
  function shopRow(host, o) {
    var row = document.createElement('div');
    row.className = 'it';
    row.setAttribute('data-a', o.act);
    row.setAttribute('data-k', String(o.key));
    var ic = document.createElement('div');
    ic.className = 'ic';
    var ico = o.pz ? bagIconEl(o.pz, o.name, 34) : null;
    if (ico) ic.appendChild(ico);
    else {
      var s = document.createElement('span');
      s.style.cssText = 'font-size:15px;color:#ffe6a6';
      s.textContent = String(o.name).slice(-1);
      ic.appendChild(s);
    }
    row.appendChild(ic);
    var tx = document.createElement('div');
    tx.className = 'tx';
    var nm = document.createElement('div');
    nm.className = 'nm'; nm.textContent = o.name;
    if (o.col) nm.style.color = o.col;
    tx.appendChild(nm);
    var ds = document.createElement('div');
    ds.className = 'ds'; ds.textContent = o.desc;
    tx.appendChild(ds);
    row.appendChild(tx);
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'buy';
    /* 按钮文案三态（v58 加了"还差多少"）：
     *   ① 自定义（回收这类没有价格的行动）
     *   ② 买得起 → 直接报价格
     *   ③ 买不起 → **报差价**。原来只写价格 + 灰掉，玩家得自己拿钱包里的数去减 ——
     *      把这道减法替他做了，灰按钮就从"不能点"变成"还差多少"的提示。 */
    var ptxt;
    if (o.btn) ptxt = o.btn;
    else if (o.afford) ptxt = o.price + ' 银两';
    else ptxt = '还差 ' + Math.max(0, (o.price | 0) - (player.stones | 0));
    b.textContent = ptxt;
    /* 买不起 = 灰掉且不可点（而不是点了才弹"银两不足"）—— 少一次无用点击。 */
    if (!o.afford) b.disabled = true;
    row.appendChild(b);
    host.appendChild(row);
  }
  /** 「这件比身上那件强多少」—— 现货最有价值的一行字。
   *  玩家本来要在两个面板之间来回记数字，现在直接给结论。
   *  ★ 只算**装备贡献**（两边都含境界底子，相减自然抵消），所以不会因为突破而失真。 */
  function gearDeltaLine(g) {
    var sl = gearBase(g).slot, cur = equipped[sl];
    if (!cur) return '（' + gearSlotCn(sl) + '位空着 · 买了直接变强）';
    var keys = ['atk', 'def', 'maxhp'], cn = { atk: '攻', def: '御', maxhp: '气血' };
    var out = [], i;
    for (i = 0; i < keys.length; i++) {
      var d = (g.st[keys[i]] | 0) - (cur.st[keys[i]] | 0);
      if (d) out.push(cn[keys[i]] + (d > 0 ? '+' : '') + d);
    }
    return out.length ? '对比现穿：' + out.join('  ') : '对比现穿：完全一样';
  }
  function renderShop() {
    var p = document.getElementById('shPurse');
    if (p) p.textContent = player.stones;
    var po = document.getElementById('shPotion');
    if (po) {
      po.innerHTML = '';
      SHOP_POTIONS.forEach(function (key) {
        var it = ITEMS[key];
        if (!it) return;
        var price = SHOP_POTION_PRICE[key] | 0;
        shopRow(po, {
          act: 'potion', key: key, name: it.cn, price: price,
          desc: it.desc + '\n现有 ' + (bag[key] | 0) + ' 个',
          pz: piece(it.icon + '_big') || piece(it.icon),
          afford: player.stones >= price
        });
      });
    }
    /* 符箓 / 秘宝 / 耗材（v58）：同一套 shopRow，只按 group 分派到不同容器。
     * 加新品只改 SHOP_GOODS 一行 —— 这是"可扩展"落在代码上的样子。 */
    ['buff', 'rare', 'stuff'].forEach(function (grp) {
      var host = document.getElementById('sh' + grp.charAt(0).toUpperCase() + grp.slice(1));
      if (!host) return;
      host.innerHTML = '';
      SHOP_GOODS.forEach(function (gd) {
        if (gd.group !== grp) return;
        var it = ITEMS[gd.key];
        if (!it) return;
        var extra = '';
        if (gd.key === 'yuxia') {
          extra = '\n已用 ' + (vaultLv | 0) + '/' + VAULT_MAX + '　行囊 ' +
            gearInv.length + '/' + gearCap();
        } else if (gd.key === 'ningyuan') {
          var used = (cultBuyRealm === player.realmIdx) ? (cultBuyN | 0) : 0;
          extra = '\n本境界已服 ' + used + '/' + SHOP_CULT_MAX + '　现有 ' + (bag[gd.key] | 0) + ' 枚';
        } else {
          extra = '\n现有 ' + (bag[gd.key] | 0) + ' 个';
        }
        shopRow(host, {
          act: 'goods', key: gd.key, name: it.cn, price: gd.price,
          desc: it.desc + extra,
          pz: piece(it.icon + '_big') || piece(it.icon),
          afford: player.stones >= gd.price
        });
      });
    });
    var rc = document.getElementById('shRecycle');
    if (rc) {
      rc.innerHTML = '';
      var ts = trashStat();
      shopRow(rc, {
        act: 'recycle', key: 0, name: '一键回收凡品', btn: ts.n ? '回收' : '无货',
        price: 0, afford: ts.n > 0,
        desc: ts.n ? '未装备的凡品 ' + ts.n + ' 件 · 可得 ' + ts.v + ' 银两\n' +
          '灵品以上不回收（可能比身上那件好）' : '行囊里没有未装备的凡品\n（灵品以上请用装备卡逐个熔炼）'
      });
    }
    var ge = document.getElementById('shGear');
    if (ge) {
      ge.innerHTML = '';
      if (!shopStock.length) {
        var e = document.createElement('div');
        e.className = 'empty';
        e.textContent = '货已售罄 —— 换一张有坊市的城镇图再来看';
        ge.appendChild(e);
      } else {
        shopStock.forEach(function (st, i) {
          var g = st.g;
          shopRow(ge, {
            act: 'gear', key: i, name: gearName(g), price: st.price, col: gearTier(g).col,
            desc: gearBase(g).cn + ' · ' + gearTier(g).cn + '\n' + gearStatsLine(g, '　') +
              '\n' + gearDeltaLine(g),
            pz: piece(g.key + '_big') || piece(g.key),
            afford: player.stones >= st.price
          });
        });
      }
    }
  }
  function shopToggle(open) {
    var el = document.getElementById('shop');
    if (!el) return false;
    var want = (open === undefined) ? !shopOpen() : !!open;
    /* v58：只有城镇才有坊市。这里也判一道（不只靠按钮灰掉）——
     * 按钮态是"提示"，真正的闸门必须在数据入口上，否则改天有人从别处调 shopToggle(true) 就破了。 */
    if (want && !shopHere()) {
      toast('此地无坊市 —— 青玄山门 / 黑橡城 / 洛赫港才有');
      return false;
    }
    if (want) renderShop();
    if (want) el.removeAttribute('hidden'); else el.setAttribute('hidden', '');
    var b = document.getElementById('shopBtn');
    if (b) b.classList.toggle('on', want);
    return want;
  }
  function wireShop() {
    var box = document.getElementById('shop');
    if (box) box.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var t = ev.target;
      if (!t) return;
      if (t.id === 'shMask' || t.id === 'shClose') { closeShop(); return; }   // 点遮罩 = 取消
      var row = t.closest ? t.closest('.it') : null;
      if (!row) return;
      ev.preventDefault();
      var a = row.getAttribute('data-a');
      if (a === 'potion') buyPotion(row.getAttribute('data-k'));
      else if (a === 'goods') buyGoods(row.getAttribute('data-k'));
      else if (a === 'gear') buyStock(+row.getAttribute('data-k'));
      else if (a === 'recycle') { askRecycle(); return; }   // 回收自己会重绘（要过确认框）
      renderShop();     // 买完立刻重绘：钱变了、按钮该变灰、装备该从架上消失
    });
    var b = document.getElementById('shopBtn');
    if (b) b.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      shopToggle();
    });
  }

  /** 熔炼：换银两（装备操作卡里的按钮）。
   *  **只接受行囊里的** —— 身上那件要先卸下：熔炼是不可逆销毁，把"已装备"也开放给它，
   *  误触的代价是"攻/御突然掉一截"且卡片已经关了、玩家说不清刚才发生了什么。 */
  function meltGear(g) {
    var i = gearInv.indexOf(g);
    if (i < 0) { toast('这件已不在行囊里'); return false; }
    var v = gearValue(g);
    gearInv.splice(i, 1);
    player.stones += v;
    addFloater(player.mx, player.my - 0.3, '+' + v + ' 银两', '#8bf3ff');
    toast('熔炼 ' + gearName(g) + ' → ' + v + ' 银两');
    bagDirty = true;
    return true;
  }
  /** 丢弃：直接销毁、**不返还银两**。存在的唯一意义是"我就是不想留它"（熔炼总能拿到钱，
   *  所以纯亏的事必须再过一道确认框 —— 一道没人会误触的门槛）。 */
  function dumpGear(g) {
    var i = gearInv.indexOf(g);
    if (i < 0) return false;
    gearInv.splice(i, 1);
    lastGearSig = ''; bagDirty = true;
    toast('已丢弃 ' + gearName(g));
    return true;
  }
  /** 属性行 + 计数：装备系统的"收益显示屏"。
   *  括号里的增量刻意只算**装备贡献**（对比 realmBase() 而不是对比 0）——
   *  否则每次境界突破，那串 "+xx" 会一起变大，玩家就分不清"这件装备到底给了我多少"。 */
  function renderGearInfo() {
    var el = document.getElementById('bagAttr');
    if (el) {
      var rb = realmBase();
      var pa = player.atk - rb.atk, pd = player.def - rb.def, ph = player.maxhp - rb.maxhp;
      function pm(v) { return v > 0 ? '+' + v : (v < 0 ? String(v) : ''); }
      el.textContent = player.realmName + '　攻 ' + player.atk + pm(pa) + ' · 御 ' + player.def +
        pm(pd) + ' · 气血 ' + player.maxhp + pm(ph);
    }
    var gc = document.getElementById('gearCnt');
    if (gc) gc.textContent = gearInv.length + ' / ' + gearCap();
    var et = document.getElementById('eqTip');
    if (et) et.textContent = '点格子打开操作卡';
  }

  /* ═════════ 存档（2026-09-18）════════
   * 三条设计取舍：
   *   ① **自动存档优先**。刷了半小时怪忘点保存然后刷新页面 = 白干，这种挫败感不该交给玩家规避。
   *      所以主线是「每 15 秒 + 换图 + 关页面/退后台」三次无条件落盘，手动按钮只是给确定感。
   *   ② **哪些进存档有明确边界**：角色状态（位置/气血/银两/背包/装备/穿了什么）进；
   *      世界状态（怪物刷新、地上掉落）**不进** —— 换图本来就会重置这两样，
   *      存进去只会读出「新 World + 旧角色」的缝合状态，反而更难排查。
   *   ③ **坏档必须能自愈**：版本不对 / 地图 id 已不存在 / JSON 坏了 → 一律静默跳过新开一局，
   *      而不是卡在白屏。改写存档格式时必须升 SAVE_VER（旧档自动作废）。
   *
   * ④ **v52 起改成三个槽位**。单一存档的代价是"换个路线试试"必须先毁掉这一条命，
   *   而摸地图恰恰是这游戏的核心乐趣。现在删哪个档都是单独一次确认，互不牵连。
   *   三个槽的核心是一条纪律：
   *     · `curSlot` = 当前认领的槽。**自动存档只写这一个**（写多个 = 三个数据打架）。
   *       认领规则：手动点某槽的「存」或「读」= 认领它；boot 时自动认领「最近存过的那个」。
   *     · `curSlot === 0` = 没认领 → 自动存档暂停（玩家刚把档全删了，别自作主张重建）。
   *     · 键：`isles.slot.N`（N=1..3）+ `isles.curslot`（记住上次认领哪个）。
   *       v51 及以前的 `isles.save` 会在 boot 时迁移到档位一，老玩家的进度不丢。
   */
  var SLOT_N = 3;
  var SLOT_CN = ['一', '二', '三'];
  var SAVE_PREFIX = 'isles.slot.';
  var SAVE_LEGACY = 'isles.save';      // v51 及以前的单一存档键（迁移后就删掉）
  var CUR_SLOT_KEY = 'isles.curslot';
  var SAVE_VER = 1;
  var AUTOSAVE_EVERY = 15;             // 秒
  var autosaveT = 0;
  var lastSaveMs = 0;
  var curSlot = 0;                     // 0 = 未认领

  function slotKey(i) { return SAVE_PREFIX + i; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
  /** 一次迁移：把 v51 的单档搬到档位一。失败不影响任何东西 —— 最坏情况就是少个旧档。 */
  function migrateLegacySave() {
    var raw = lsGet(SAVE_LEGACY);
    if (!raw) return 0;
    if (!lsGet(slotKey(1))) { try { localStorage.setItem(slotKey(1), raw); } catch (e) { } }
    lsDel(SAVE_LEGACY);
    return 1;
  }
  function parseSlot(raw) {
    if (!raw) return null;
    var o = null;
    try { o = JSON.parse(raw); } catch (e) { return null; }
    if (!o || o.v !== SAVE_VER || !o.map) return null;
    if (!IDX[o.map]) return null;             // 这张图已经删了/改名了 —— 旧档作废
    /* 坐标必须是**真数字**且有限（2026-09-18）：NaN/null/字符串混进来后，
     * 一路走到 ground[NaN] 那种下标，异常点离根因十万八千里。
     * ⚠ 别用裸 isFinite：`isFinite(null) === true`（Number(null)===0），
     *   坏坐标会被悄悄洗成 0 —— 玩家瞬间被扔到地图角落。必须先判类型。
     * 坏坐标不该整档作废（装备/银两还是好的）→ 退成 null，让调用方落回出生点。 */
    o.x = (typeof o.x === 'number' && isFinite(o.x)) ? o.x : null;
    o.y = (typeof o.y === 'number' && isFinite(o.y)) ? o.y : null;
    return o;
  }
  function readSlot(i) { return parseSlot(lsGet(slotKey(i))); }
  /** 第一个空槽；全满返回 0（新开局挑 cx时用它避免覆盖旧档） */
  function firstEmptySlot() {
    for (var i = 1; i <= SLOT_N; i++) if (!readSlot(i)) return i;
    return 0;
  }
  /** boot 认领：上次用的那个 > 最近存过的那个 > 没有 */
  function newestSlot() {
    var last = +lsGet(CUR_SLOT_KEY);
    if (last >= 1 && last <= SLOT_N && readSlot(last)) return last;
    var best = 0, bt = 0;
    for (var i = 1; i <= SLOT_N; i++) { var o = readSlot(i); if (o && (o.t || 0) >= bt) { bt = o.t || 0; best = i; } }
    return best;
  }
  function setCurSlot(i) {
    curSlot = (i >= 1 && i <= SLOT_N) ? i : 0;
    try {
      if (curSlot) localStorage.setItem(CUR_SLOT_KEY, String(curSlot));
      else localStorage.removeItem(CUR_SLOT_KEY);
    } catch (e) { }
    var o = curSlot ? readSlot(curSlot) : null;
    lastSaveMs = o ? (o.t || 0) : 0;
  }
  function clearSlot(i) { lsDel(slotKey(i)); }
  /** 旧接口保留：返回**当前认领槽**的内容（boot 与自测用例还指着这个名字）。 */
  function readSave() { return curSlot ? readSlot(curSlot) : null; }

  function fmtSaveTime(t) {
    var d = new Date(t);
    var p2 = function (n) { return ('0' + n).slice(-2); };
    return p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function slotDesc(o) {
    if (!o) return '（空）';
    var m = IDX[o.map];
    return (m ? m.name : String(o.map)) + ' · ' + (o.t ? fmtSaveTime(o.t) : '时间未知') +
      ' · 银 ' + (o.stones || 0);
  }
  function updateSaveUI() {
    var el = document.getElementById('saveInfo');
    if (el) {
      if (!curSlot) el.textContent = '未认领档位（自动存档暂停）';
      else el.textContent = '档位' + SLOT_CN[curSlot - 1] +
        (lastSaveMs ? ' · ' + fmtSaveTime(lastSaveMs) : ' · 本次尚未落盘');
    }
    renderSlots();
  }
  var slotBuilt = 0;
  function buildSlots() {
    var box = document.getElementById('slotList');
    if (!box) return 0;
    box.innerHTML = '';
    for (var i = 1; i <= SLOT_N; i++) {
      var row = document.createElement('div');
      row.className = 'svrow';
      row.setAttribute('data-slot', String(i));
      row.innerHTML =
        '<div class="r1"><span class="nm"><b>' + SLOT_CN[i - 1] + '</b>档位' + SLOT_CN[i - 1] + '</span>' +
        '<span class="ops">' +
        '<button type="button" data-a="save" title="把当前进度存到这里">存</button>' +
        '<button type="button" data-a="load" title="读回这个档位">读</button>' +
        '<button type="button" data-a="del" class="del" title="删除这个档位">删</button>' +
        '</span></div><div class="ds"></div>';
      box.appendChild(row);
    }
    slotBuilt++;
    return 1;
  }
  function renderSlots() {
    var box = document.getElementById('slotList');
    if (!box) return;
    /* 失联自愈（与背包同款）：#slotList 被别处重建过就会只剩游离引用。
     * 重建次数设上限，防止"容器本身没了"时每帧重搭。 */
    if (slotBuilt && !document.body.contains(box)) {
      if (slotBuilt < 4) { buildSlots(); box = document.getElementById('slotList'); }
      else return;
    }
    if (!slotBuilt && !buildSlots()) return;
    for (var i = 1; i <= SLOT_N; i++) {
      var row = box.querySelector('.svrow[data-slot="' + i + '"]');
      if (!row) continue;
      var o = null;
      try { o = readSlot(i); } catch (e) { o = null; }
      row.classList.toggle('cur', curSlot === i);
      var ds = row.querySelector('.ds');
      if (ds) ds.textContent = slotDesc(o) + (curSlot === i ? ' · 当前' : '');
      var bl = row.querySelector('[data-a="load"]'); if (bl) bl.disabled = !o;
      var bd = row.querySelector('[data-a="del"]'); if (bd) bd.disabled = !o;
    }
  }
  /** 把存档里的角色状态塞回内存。**不负责切图**（切图由调用方决定时机）。 */
  function applySave(o) {
    if (!o) return false;
    var k;
    for (k in bag) if (bag.hasOwnProperty(k)) delete bag[k];
    var sb = o.bag || {};
    for (k in sb) if (sb.hasOwnProperty(k)) bag[k] = sb[k] | 0;
    var gi = [];
    (o.gear || []).forEach(function (g) {
      if (g && GEAR_BASES[g.key] && TIERS[g.t]) gi.push(g);
    });
    gearInv = gi;
    equipped = { weapon: null, armor: null, trinket: null };
    GEAR_SLOTS.forEach(function (sl) {
      var g = o.eq && o.eq[sl.key];
      if (g && GEAR_BASES[g.key] && TIERS[g.t]) equipped[sl.key] = g;
    });
    // ★ 实例编号必须跨过旧档里的最大值，否则新掉的装备会跟包袱里的撞 id（签名算错 → UI 不刷新）
    var mx = gearSeq;
    gi.forEach(function (g) { if (g.id >= mx) mx = g.id + 1; });
    gearSeq = mx;
    /* 坊市现货：逐项校验再收下 —— 器型表改过之后老档里可能留着已经不存在的 key。
     * 沿用本项目的坏档原则：**坏的那一项丢掉，不整档作废**（银两/装备还是好的）。 */
    shopStock = [];
    if (o.shop && o.shop.length) {
      for (k = 0; k < o.shop.length; k++) {
        var sh = o.shop[k];
        if (!sh || !sh.g || !GEAR_BASES[sh.g.key]) continue;
        var sTi = Math.max(0, Math.min(TIERS.length - 1, sh.g.t | 0));
        shopStock.push({
          slot: Math.max(0, Math.min(SHOP_STOCK_MAX - 1, sh.slot | 0)),
          price: (+sh.price > 0) ? +sh.price : SHOP_TIER_PRICE[sTi],
          g: { id: (+sh.g.id) || (shopSeq++), key: sh.g.key, t: sTi,
               st: sh.g.st || { atk: 0, def: 0, maxhp: 0 } }
        });
      }
      shopStock.sort(function (a, b) { return a.slot - b.slot; });
    }
    player.exp = o.exp || 0;
    player.stones = o.stones || 0;
    window.__kills = o.kills || 0;
    /* v58 秘宝的永久增量：老档没有这两项 → 按"没买过"处理（0），不需要迁移。
     * ⚠ vaultLv 必须在任何 getGearCap 之前就位 —— 读档后马上会有人拿它算行囊上限。 */
    vaultLv = Math.max(0, Math.min(VAULT_MAX, o.vault | 0));
    cultBuyRealm = (o.cult && (o.cult[0] | 0)) || 0;
    cultBuyN = Math.max(0, (o.cult && (o.cult[1] | 0)) || 0);
    clearBuffs();     // 符箓不进存档：读档 = 从现在开始，别把上一局残留的时长带进来
    /* ★ 境界是 exp 的纯函数，读档只对齐、不"突破"：这里刻意不调 syncRealm() ——
     * 那个函数带着回满血 + 金环特效 + 弹提示的副作用，读档时触发会覆盖存档里的气血，
     * 还会在刚进游戏时莫名弹一句"境界突破"。 */
    player.realmIdx = realmForExp(player.exp);
    player.realmName = realmNow().cn;
    recalcStats();
    player.hp = Math.max(1, Math.min(player.maxhp, o.hp || player.maxhp));
    lastSaveMs = o.t || 0;
    bagDirty = true;
    return true;
  }
  /** 落盘。不传 slot = 写「当前认领的槽」；传了就写指定槽（手动点「存」时用）。
   *  ★ curSlot === 0（没认领）时**什么都不写**：玩家刚把档全删了，
   *    这时候自作主张重建一个档，等于把他刚才的删除操作吃掉一半。 */
  function saveGame(silent, slot) {
    if (!ready) return false;      // boot 还没走完：此时落盘会把"半成品"状态写成正式档
    slot = slot || curSlot;
    if (!(slot >= 1 && slot <= SLOT_N)) {
      if (!silent) toast('请先点某个档位的「存」');
      window.__saveErr = 'no-slot';
      return false;
    }
    try {
      var o = { v: SAVE_VER, t: Date.now(), map: CUR.id,
        x: +player.mx.toFixed(2), y: +player.my.toFixed(2),
        hp: player.hp, exp: player.exp, stones: player.stones,
        kills: window.__kills || 0, bag: {}, gear: gearInv, eq: {}, shop: [],
        /* v58：秘宝的两个**永久增量**。刻意不升 SAVE_VER ——
         * 老档没有这两个字段，读档时按 0/未买过处理即可，没有任何需要迁移的状态。
         * （升版本号会让所有老档作废，代价远大于收益。） */
        vault: vaultLv | 0, cult: [cultBuyRealm | 0, cultBuyN | 0] };
      for (var k in bag) if (bag.hasOwnProperty(k)) o.bag[k] = bag[k] | 0;
      GEAR_SLOTS.forEach(function (sl) { o.eq[sl.key] = equipped[sl.key] || null; });
      /* 坊市现货也进档：否则"买走 → 存 → 读"会把买走的那件还回货架，
       * 玩家看到"我明明买了怎么又有了一件"（虽然不构成套利，但像 bug）。 */
      o.shop = shopStock.map(function (s) {
        return { slot: s.slot, price: s.price, g: s.g };
      });
      localStorage.setItem(slotKey(slot), JSON.stringify(o));
      lastSaveMs = o.t;
      updateSaveUI();
      if (!silent) toast('已存入档位' + SLOT_CN[slot - 1] + ' · ' + CUR.name);
      return true;
    } catch (e) {
      // localStorage 写不进（隐私模式 / 配额满）要明说，不能假装存上了
      if (!silent) toast('存档失败：本页无法写入本地存储（隐私模式？）');
      window.__saveErr = String(e && e.message || e);
      return false;
    }
  }
  function loadGame(silent, slot) {
    slot = slot || curSlot;
    var o = slot ? readSlot(slot) : null;
    if (!o) { if (!silent) toast(curSlot ? '这个档位是空的' : '还没有可用的存档'); return false; }
    applySave(o);
    setCurSlot(slot);                        // 认领它：此后自动存档接着往这儿写
    switchTo(o.map, o.x, o.y, true);
    lastGearSig = '';                        // 强制重建装备区（不然还画着上一局的格子）
    if (bagBuilt) buildBagUI();
    updateSaveUI();
    if (!silent) toast('已读档位' + SLOT_CN[slot - 1] + ' · ' + CUR.name + ' · 银两 ' + o.stones);
    return true;
  }
  function clearAllSaves() {
    for (var i = 1; i <= SLOT_N; i++) clearSlot(i);
    setCurSlot(0);
    lastSaveMs = 0;
    updateSaveUI();
  }

  /* ---------------- 通用确认框（v52）----------------
   * 为什么不用 window.confirm：
   *   ① 部分内嵌 WebView（微信 / QQ 内置浏览器）会直接吞掉 confirm 并返回 false，
   *      玩家点了"确定"却毫无反应、且控制台干净 —— 比不弹窗更难排查；
   *   ② 它是浏览器原生皮，跟这游戏的调子不是一个世界；
   *   ③ 自测需要一个能 querySelector 到、能 dispatch click 的靶子。
   * 于是做成 DOM 浮层，回调式。注意它**不带 .hud 类** —— 带了会被
   * .hud{pointer-events:none} 继承，按钮点不到（本项目踩过两次）。 */
  var cfCb = null;
  function confirmOpen() {
    var box = document.getElementById('confirm');
    return !!box && !box.hasAttribute('hidden');
  }
  function confirmBox(title, msg, okText, cb) {
    var box = document.getElementById('confirm');
    if (!box) { if (cb) cb(true); return false; }   // 兜底：没有浮层也别把动作卡死
    var t = document.getElementById('cfTitle'), m = document.getElementById('cfMsg'),
      y = document.getElementById('cfYes');
    if (t) t.textContent = title;
    if (m) m.textContent = msg;
    if (y) y.textContent = okText || '确定';
    cfCb = cb || null;
    box.removeAttribute('hidden');
    return true;
  }
  function closeConfirm(ok) {
    var box = document.getElementById('confirm');
    if (box) box.setAttribute('hidden', '');
    var cb = cfCb; cfCb = null;
    if (cb) { try { cb(!!ok); } catch (e) { toast('操作失败：' + (e && e.message || e)); } }
  }

  /* ---------------- 快捷药栏（v47）----------------
   * 药品是**唯一得在挨打时立刻吃到**的东西：开一次背包 = 一次点击 + 一次瞄准，
   * 血条见底时这两下往往就是死亡本身。所以三种丹药另开一条常驻横条，
   * 挂在左上状态面板里（血条正下方），点一下直接服用，不用开背包。
   *
   * 设计上刻意"共用一切、只换容器"：
   *   同一张 items_atlas（走 bagIconEl）、同一份 ITEMS、同一组数字键 1/2/3、
   *   同一个 bagDirty 脏标记、同一套三态（有货 / 冷却 / 空）。
   * 这样两边不可能出现"背包 3 个、快捷栏 5 个"这类打架 —— 数据源只有一份。
   */
  var QUICK_ORDER = ['jinchuang', 'xiaohuan', 'dahuan'];
  var QUICK_ICON = 40;
  var quickCells = {};
  var quickBuilt = false;              // ★ 声明在 bagIconEl 之前用到它，必须提前（var 提升 + 赋值时机）
  var quickRebuildTries = 0;

  function buildQuickUI() {
    var g = document.getElementById('quickHeal');
    if (!g) return;                    // 容器不在（老缓存页面）就安静退出，不报错
    g.innerHTML = ''; quickCells = {};
    QUICK_ORDER.forEach(function (key) {
      var it = ITEMS[key];
      if (!it || it.kind !== 'heal') return;
      var c = document.createElement('div');
      c.className = 'qc empty';
      c.title = it.cn + '：点一下服用（或按 ' + (BAG_KEYS[key] || '?') + '）· ' + it.desc;
      var pz = piece(it.icon + '_big') || piece(it.icon);
      var ico = pz ? bagIconEl(pz, it.cn, QUICK_ICON) : null;
      if (ico) {
        c.appendChild(ico);
      } else {
        var s = document.createElement('span');
        s.style.cssText = 'font-size:17px;color:#ffe6a6';
        s.textContent = it.cn.charAt(0);
        c.appendChild(s);
      }
      var n = document.createElement('b'); n.className = 'n'; c.appendChild(n);
      if (BAG_KEYS[key]) {
        var kb = document.createElement('span'); kb.className = 'kb';
        kb.textContent = BAG_KEYS[key]; c.appendChild(kb);
      }
      var fire = function (ev) {
        // ★ 必须 stopPropagation：药格在 #topleft 面板里，冒泡上去会把状态面板折叠掉
        if (ev) { ev.preventDefault(); ev.stopPropagation(); }
        useHeal(key);
        bagDirty = true; renderQuick();     // 立刻反馈（冷却灰/数量 -1），不等下一帧
      };
      c.addEventListener('click', fire);
      c.addEventListener('touchstart', fire, { passive: false });
      g.appendChild(c);
      quickCells[key] = c;
    });
    quickBuilt = true;
  }

  /** 刷新快捷药栏：数量 / 灰化 / 冷却三态与背包格子完全一致（同一份数据源） */
  function renderQuick() {
    if (!quickBuilt) return;
    /* 失联自愈（与背包同款）：容器被别处重建过，quickCells 还指着游离节点 →
     * 数据全对、屏幕不动、控制台干净。检测到就重建一次，最多 3 次防死循环。 */
    var orphan = 0;
    QUICK_ORDER.forEach(function (k) {
      var c = quickCells[k];
      if (c && !document.body.contains(c)) orphan++;
    });
    if (orphan > 0) {
      if (quickRebuildTries < 3) { quickRebuildTries++; buildQuickUI(); }
      return;
    }
    quickRebuildTries = 0;
    var low = player && player.maxhp > 0 && player.hp < player.maxhp * 0.4;   // 残血：格子自己招手
    QUICK_ORDER.forEach(function (key) {
      var c = quickCells[key]; if (!c) return;
      var n = bag[key] || 0;
      c.classList.toggle('empty', n <= 0);
      c.classList.toggle('cool', healCd > 0 && key === healUsed);
      c.classList.toggle('need', n > 0 && low);
      var nb = c.querySelector('.n');
      if (nb) nb.textContent = n > 0 ? (n > 99 ? '99+' : n) : '';
      /* ★ 兜底依旧写行内样式（理由见 renderBag 同款注释）：
       * 行内样式优先级高于任何选择器，结构上不可能被覆盖或匹配不到。 */
      var cv3 = c.querySelector('canvas.ico');
      if (cv3) {
        if (n <= 0) {
          cv3.style.filter = 'grayscale(1) brightness(.5)';
          cv3.style.opacity = '.4';
        } else if (healCd > 0 && key === healUsed) {
          cv3.style.filter = 'saturate(.55) brightness(.86)';
          cv3.style.opacity = '1';
        } else {
          cv3.style.filter = 'brightness(1.22) saturate(1.1) drop-shadow(0 0 3px rgba(255,210,120,.5))';
          cv3.style.opacity = '1';
        }
      }
    });
  }

  /** 刷新背包（脏标记驱动，不是每帧都碰 DOM） */
  var bagRebuildTries = 0;   // 失联自愈的重建计数（防 bagGrid 本身不在 DOM 时无限递归）
  function renderBag() {
    window.__bagRenders = (window.__bagRenders || 0) + 1;   // 执行计数（状态行 r 判据：在涨=真的在跑）
    if (!bagBuilt) return;
    if (!bagDirty) return;
    bagDirty = false;
    /* ★★ 失联自愈（2026-09-17 第五轮）：bagCells 里的格子若已不在页面 DOM 里
     * （某处重建/清空过背包容器，bagCells 却还指着旧节点），renderBag 就一直在
     * 更新"游离节点"——数据全对、屏幕永远不动、控制台干净。正好同时解释
     * "图标永远灰"和"银两永远 0"两桩怪事。检测到就重建格子再刷。 */
    var orphan = 0;
    BAG_ORDER.forEach(function (key) {
      var c0 = bagCells[key];
      if (c0 && !document.body.contains(c0)) orphan++;
    });
    __bagOrphan = orphan;
    if (orphan > 0) {
      if (bagRebuildTries < 3) {           // 重建后仍失联（容器本身没了）就别再试，交给状态行示警
        bagRebuildTries++;
        buildBagUI();                      // 内部会再调 renderBag —— 最多递归 3 层，有界
        return;
      }
    } else {
      bagRebuildTries = 0;                 // 恢复正常后重置，留出下次自愈余量
    }
    /* ── 装备区同步 ──
     * 签名（谁在第几格 + 品质）变了才重建 DOM：renderBag 被 0.5s 轮询强刷，
     * 无条件 rebuild 会把手指底下正在长按的格子换掉（长按判定直接失效）。 */
    var sg = gearSig();
    if (!gearBuilt || sg !== lastGearSig) { lastGearSig = sg; buildGearUI(); }
    renderGearInfo();
    var total = 0, hasHeal = 0;
    BAG_ORDER.forEach(function (key) {
      var c = bagCells[key]; if (!c) return;
      var it = ITEMS[key];
      var n = bag[key] || 0;
      c.classList.toggle('empty', n <= 0);
      c.classList.toggle('has', n > 0);          // ★ 有货 → 提亮/描金边/角标显现
      c.classList.toggle('use', it.kind === 'heal');
      /* v54：材料格也有"点下去会做事"的了（妖丹炼化 / 玄铁令提示用法）。
       * v58：符箓同样是"点一下就用"，一并给 .act（手型 + 金边）。
       * .act 给手型与配色 —— 玩家得能一眼看出"这一格点下去有事发生"。 */
      c.classList.toggle('act', !!it.act || it.kind === 'buff');
      /* ★ .cool 只给**刚按下去的那一格**上（healUsed）。原来写的是无条件
       *   `toggle('cool', healCd>0)` —— 用一次药全场格子一起灰 0.6 秒，
       *   叠上 filter 的优先级问题，用户看到的就是"背包永远是灰的"。 */
      c.classList.toggle('cool', healCd > 0 && key === healUsed);
      var nb = c.querySelector('.n');
      // ★ 数量角标只在有货时显示（CSS 靠 .has 控制显隐），且 99 以上折成 99+
      if (nb) nb.textContent = n > 0 ? (n > 99 ? '99+' : n) : '';
      /* ★★ 兜底：把状态**同时写成行内样式**（2026-09-17 第四次修复）
       * 用户第三次反馈"行囊依旧没有变化"，但那时的 CSS 与 getComputedStyle 实测
       * 全部正确 —— 说明某些环境下（旧缓存 / 浏览器对 :not() 链式选择器的处理差异）
       * 那份 CSS 没能作用到 canvas 上。行内样式的优先级高于任何选择器，
       * 从**结构上**不可能再被覆盖或匹配不到，所以这里直接把最终滤镜写死。
       * CSS 仍保留（降级/首帧用），行内样式是"最终裁决"。 */
      var cv3 = c.querySelector('canvas.ico');
      if (cv3) {
        if (n <= 0) {
          cv3.style.filter = 'grayscale(1) brightness(.5)';
          cv3.style.opacity = '.42';
        } else if (healCd > 0 && key === healUsed) {
          cv3.style.filter = 'saturate(.55) brightness(.86)';
          cv3.style.opacity = '1';
        } else {
          cv3.style.filter = 'brightness(1.22) saturate(1.1) drop-shadow(0 0 3px rgba(255,210,120,.5))';
          cv3.style.opacity = '1';
        }
      }
      total += n;
      if (it.kind === 'heal') hasHeal += n;
    });
    var sv = document.getElementById('bagStones');
    // v43 起默认只显示「银两 N」；?bagdbg=1 或出过错时才切调试行（判据常备不常扰）
    if (sv) sv.textContent = (BAG_DEBUG || window.__lastErr) ? bagDebugLine() : ('银两 ' + player.stones);
    // 入口按钮上的小红点：有药就提示"可以嗑"
    var btn = document.getElementById('bagBtn'), dot = document.getElementById('bagDot');
    if (btn) btn.classList.toggle('hasnew', hasHeal > 0 && !bagOpen);
    if (dot) dot.textContent = hasHeal > 99 ? '99+' : hasHeal;
    renderQuick();       // 快捷药栏同源刷新（放在这里 = 两边永远同一帧同步）
  }

  function bagToggle(open) {
    bagOpen = (open === undefined) ? !bagOpen : !!open;
    var el = document.getElementById('bag');
    if (el) el.classList.toggle('open', bagOpen);
    var b = document.getElementById('bagBtn');
    if (b) b.classList.toggle('on', bagOpen);
    // 背包面板也在 left:14，展开时会压住左上这块（快捷药栏就在那里）→ 让药栏先收起来
    document.body.classList.toggle('bagopen', bagOpen);
    syncLeftBtns();      // 药格被隐藏/恢复 → 左列圆钮跟着挪（面板矮了一截）
    bagDirty = true;
    if (bagOpen) renderBag();
    else renderQuick();  // 关背包时立刻把药栏画回来（它刚才是 display:none 的）
  }

  /* ---------------- 存档区（三档位）+ 离场落盘（v52）----------------
   * 手动存档存在的意义不是"补一个功能"，是**给玩家确定感** ——
   * 自动档看不见摸不着，点一下屏幕上会写出时间和地图名，人才肯放心去打 boss。
   *
   * ★ 「重开」和「删档」是两种完全不同的意图，以前挤在一个按钮里（点了必清档）：
   *     · 重开 = 放弃当前进度从头来过，**档位里的存档一律保留**（想回来点「读」即可）；
   *     · 删某个档 = 只毁那一条。两者都必须先弹确认框 —— 都是点了回不来的事。 */
  function doSlotSave(i) {
    if (saveGame(false, i)) setCurSlot(i);   // 认领：此后自动存档跟着这个档走
    autosaveT = 0;                            // 刚按过就不要 15 秒后再重复一次
    updateSaveUI();
  }
  function doSlotDel(i) {
    var o = readSlot(i);
    if (!o) return;
    confirmBox('删除档位' + SLOT_CN[i - 1] + '？',
      slotDesc(o) + '\n删除后无法恢复。',
      '删除',
      function (ok) {
        if (!ok) return;
        clearSlot(i);
        if (curSlot === i) setCurSlot(newestSlot());   // 删的正是当前档 → 认领最近的那个（没有就停自动存档）
        toast('档位' + SLOT_CN[i - 1] + '已删除');
        updateSaveUI();
      });
  }
  function wireSaveUI() {
    buildSlots();
    updateSaveUI();
    /* 事件委托挂在容器上：三个槽 × 三个按钮 = 9 个监听器写一遍就够，
     * 而且 renderSlots 只是改文字/类名、不重建 DOM，不存在"监听器跟着节点一起没了"。 */
    var box = document.getElementById('slotList');
    if (box) box.addEventListener('click', function (ev) {
      var t = ev.target;
      if (!t || !t.closest) return;
      var b = t.closest('button[data-a]');
      var row = b && b.closest ? b.closest('.svrow') : null;
      if (!b || !row || b.disabled) return;
      ev.preventDefault(); ev.stopPropagation();
      var i = +row.getAttribute('data-slot');
      var a = b.getAttribute('data-a');
      if (a === 'save') doSlotSave(i);
      else if (a === 'load') loadGame(false, i);
      else if (a === 'del') doSlotDel(i);
    });
    // 确认框上的两个按钮：确定了才调回调，取消一律不做事
    var cy = document.getElementById('cfYes'), cn = document.getElementById('cfNo'),
      cm = document.getElementById('cfMask');
    if (cy) cy.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); closeConfirm(true); });
    if (cn) cn.addEventListener('click', function (ev) { ev.preventDefault(); ev.stopPropagation(); closeConfirm(false); });
    if (cm) cm.addEventListener('click', function (ev) { ev.stopPropagation(); closeConfirm(false); });
    var c = document.getElementById('svClear');
    if (c) c.addEventListener('click', function (ev) {
      ev.preventDefault(); ev.stopPropagation();
      confirmBox('重开这一局？',
        '当前进度会丢失，从出生点重新开始。\n' +
        (curSlot ? '档位' + SLOT_CN[curSlot - 1] + '里的存档会保留，点它的「读」随时回来。'
          : '（当前没有认领档位，自动存档处于暂停状态）'),
        '重开',
        function (ok) {
          if (!ok) return;
          toast('正在开始新的一局…');
          // 重开后浏览器地址里的 ?map= 会把人又送回去，所以显式带上 ?new=1 重载
          setTimeout(function () { location.href = 'index.html?new=1'; }, 220);
        });
    });
    /* 关标签页 / 退后台：visibilitychange 是手机上唯一可靠的时机（pagehide 在 iOS Safari
     * 上不一定触发）。两边都挂、都只写一次即可（写两份内容一样，成本可接受）。 */
    var flush = function () { saveGame(true); };
    window.addEventListener('pagehide', flush);
    if (document.addEventListener) document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') flush();
    });
  }

  function killFoe(f) {
    if (f.def_.dummy) {                 // 训练靶打不死：立刻满血重置，方便反复试
      f.hp = f.maxhp; f.flash = 0.25;
      addFloater(f.x, f.y - 0.4, '靶子已重置', '#8bf3ff');
      return;
    }
    if (f.dying > 0) return;            // 已经在倒地过程中，别重复结算
    f.hp = 0;
    window.__kills = (window.__kills || 0) + 1;   // 击杀计数（状态行判据：杀0=没怪死过）
    quest.kills++; checkQuest();   // ★4 任务：击杀进度
    /* v54：修为统一走 gainCult —— 杀怪涨的修为也要能触发突破。
     * 原来这里直写 player.exp += f.exp，如果炼化以外的入口不判突破，
     * 就会出现"修为早就过线了、却要点一下妖丹才突破"的荒谬感。 */
    gainCult(f.exp);
    var st = f.stones[0] + Math.floor(Math.random() * (f.stones[1] - f.stones[0] + 1));
    player.stones += st;
    addFloater(f.x, f.y - 0.4, '+' + st + ' 银两', '#8bf3ff');
    bagDirty = true;                         // ★ 行囊里的银两行要跟着动（原来漏了）
    // 掉落结算：在倒地动画开始的同时就把东西撒下去 ——
    // 等动画播完再掉会让玩家以为"没掉东西"而提前走开。
    spawnLoot(f, rollLoot(f));
    spawnParticles(f.x, f.y);
    screenShake = Math.max(screenShake, 0.16);   // ★2 击杀轻微震屏
    /* v57：目标倒下 → 若身边还有一只在攻击距离内就自动接上（连打不断档），
     * 没有就清空停手。★ 只在"伸手就够得着"的范围内换目标：一旦允许自动挑更远的，
     * 就变成"点一下怪，角色自己把整张图刷完"，那不是自动攻击、是代打。 */
    if (player.targetFoe === f) {
      var nxt = null, nb = MELEE + 0.9;
      for (var ii = 0; ii < foes.length; ii++) {
        var f2 = foes[ii];
        if (f2 === f || !f2.alive || f2.dying > 0) continue;
        var dd2 = Math.hypot(f2.x - player.mx, f2.y - player.my);
        if (dd2 < nb) { nb = dd2; nxt = f2; }
      }
      player.targetFoe = nxt;
      if (nxt) { player.foeStuck = 0; player.foeChased = false; }
    }
    // 有倒地素材就播倒地（新怪物包取自 Dead.png，老妖兽用图集里的 _death_N 帧），
    // 播完由 updateFoes 收尾（置 alive=false 并排队复活）。没有素材才直接消失。
    var hasDeadAnim = (ATLAS.foes.anim && ATLAS.foes.anim[f.key] && ATLAS.foes.anim[f.key].acts.dead);
    var hasDeadRect = ATLAS.foes.rect && ATLAS.foes.rect[f.key + '_death_0'];
    if (hasDeadAnim || hasDeadRect) {
      f.dying = BEAST_DUR.dead;
      if (hasDeadAnim) { f.anim = 'dead'; f.animT = 0; f.animHold = 0; }
    } else {
      f.alive = false;
      f.respawn = 10 + Math.random() * 6;   // 一段时间后原地复活，打怪场常驻
    }
  }
  /** 挨打时的受击反馈：有 hurt 动作就播一下（0.3 秒内不可被移动状态改写） */
  /* ---------------- 怪物头顶小字台词（v43） ----------------
   * 氛围向：随机冒一句短话。三条克制原则 ——
   * ① 句子短（≤8 字）② 同屏最多 2 只在说 ③ 节奏按序号错开，不整齐划一。
   * 按怪名前缀匹配种族池，没匹配上走通用池；受击有专属短叫（打断闲聊）。 */
  var FOE_SAY_IDLE = {
    '小僵尸': ['脑子…好想吃', '好冷…', '咕…咕……', '别跑嘛…'],
    '牛魔':   ['哞——！', '俺的角不是摆设', '谁来过两招', '这山头是俺的'],
    '蛇妖':   ['嘶嘶…', '小哥过来呀', '我的毒可不认人', '今天风里有香味'],
    '铠甲卫': ['站住！何人', '军令如山', '守阵到死', '别逼我动手'],
    '游方':   ['此路是我开', '留下买路财', '月黑风高夜', '今儿收成不错'],
    '石魔':   ['…石头也有心事', '别敲了', '睡个好觉'],
    '*':      ['……', '哼。', '（打了个哈欠）', '风大，别吹跑了', '今天无事发生']
  };
  var FOE_SAY_HURT = ['哎哟！', '好胆！', '疼疼疼！', '找死！', '记仇了！', '来啊！'];
  /* 亮相台词：第一次进入玩家视野必说的招牌句（v43.1，用户点名要游方进图就喊）
   * —— 随机闲聊池轮不上固定那句，所以招牌句单独走 intro。 */
  var FOE_SAY_INTRO = {
    '小僵尸': '脑子…好想吃',
    '牛魔': '哞——！此山是俺的',
    '蛇妖': '嘶嘶…来者何人',
    '铠甲卫': '站住！何人闯阵',
    '游方': '此路是我开！留下买路财',
    '石魔': '…别敲了',
    '*': '……'
  };
  function foeSayIdleLine(f) {
    var pool = FOE_SAY_IDLE['*'];
    for (var k in FOE_SAY_IDLE) {
      if (k !== '*' && (f.name || '').indexOf(k) >= 0) { pool = FOE_SAY_IDLE[k]; break; }
    }
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function foeSay(f, text, dur) {
    f.say = text; f.sayT = dur; f.sayDur = dur;
    f.sayCd = 8 + Math.random() * 10;          // 说过这句后隔久一点再排下次
  }
  function hurtFoe(f) {
    if (f.dying > 0) return;
    // ★5 打断：攻击正在读条的 Boss/精英即可打断它的大招（给玩家"趁读条时猛攻"的策略点）
    if (f.casting) {
      f.casting = false; f.castKind = null; f.castCd = 3 + Math.random() * 2;
      addFloater(f.x, f.y - 0.6, '打断！', '#9be7ff');
    }
    if (ATLAS.foes.anim && ATLAS.foes.anim[f.key]) setBeastAnim(f, 'hurt');
    /* 挨打短叫：只在上一句快说完时才覆盖 —— 连招时不会一直刷屏 */
    if (f.sayT === undefined || f.sayT < 0.6) {
      foeSay(f, FOE_SAY_HURT[Math.floor(Math.random() * FOE_SAY_HURT.length)], 1.4);
    }
  }
  function respawnFoe(f) {
    var s = snapWalkable(CUR, f.home.x, f.home.y);
    f.x = s.x; f.y = s.y; f.hp = f.maxhp; f.alive = true; f.flash = 0; f.atkCd = 0;
    f.dying = 0; f.anim = 'idle'; f.animT = 0; f.animHold = 0;
  }
  // 把玩家沿「背离凶手」方向推开，最多 tiles 格（每步 0.34 格，遇实体即停）。
  // 旧版这里直接把玩家瞬移回出生点 —— 玩家体感是「被击飞一下到了别的地方」，
  // 而且飘字还写着"被击退"，完全对不上。现在改成真的击退：位移小、方向明确、可理解。
  function knockBackPlayer(fx, fy, tiles) {
    var dx = player.mx - fx, dy = player.my - fy;
    var d = Math.hypot(dx, dy);
    if (d < 1e-4) { dx = 0; dy = 1; d = 1; }   // 与怪完全重叠时，默认往下方推
    var ux = dx / d, uy = dy / d, step = 0.34, moved = 0;
    var n = Math.ceil(tiles / step);
    for (var i = 0; i < n; i++) {
      if (couldStand(player.mx + ux * step, player.my)) { player.mx += ux * step; moved++; }
      if (couldStand(player.mx, player.my + uy * step)) { player.my += uy * step; }
    }
    return moved;
  }
  function playerDown(foe) {
    var lost = Math.floor(player.stones * 0.3);
    player.stones -= lost;
    var pushed = foe ? knockBackPlayer(foe.x, foe.y, 0.6) : 0;   // 只轻推半步，不再大幅位移
    player.path = null; player.targetFoe = null;
    breakCombo();                                                 // 倒地断连
    clearBuffs();                                                 // v58：符箓跟着散（理由见 BUFFS 注释②）
    player.dead = true;
    player.act = 'dead'; player.actT = 0; player.actHold = ACT_DUR.dead;   // 播倒地动作
    player.flash = 0.5;
    screenFlash = 0.55;
    addFloater(player.mx, player.my - 0.4, '倒地！', '#ff8080');
    toast('气血耗尽倒地，折损银两 ' + lost + (pushed ? '' : '（退路被阻）'));
    var h = document.getElementById('hint');
    if (h) h.textContent = '倒地中，' + ACT_DUR.dead + ' 秒后起身（起身有 2 秒无敌）';
  }
  function updateFoes(dt) {
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i];
      f.animT += dt;                                        // 动作计时（各状态共用）
      if (f.animHold > 0) f.animHold = Math.max(0, f.animHold - dt);
      // ?foeact=atk&i=0 —— 把第 i 只怪锁在某个动作的中段，供逐个动作截图核对
      if (foePose && foes[foePose.i] === f) {
        f.anim = foePose.act;
        f.animT = (BEAST_DUR[foePose.act] || 0) * foePose.k;
        f.animHold = 1; f.dying = foePose.act === 'dead' ? BEAST_DUR.dead : 0;
        f.hp = f.maxhp; f.alive = true;
        continue;
      }
      if (!f.alive) { f.respawn -= dt; if (f.respawn <= 0) respawnFoe(f); continue; }
      if (f.dying > 0) {                                    // 倒地中：把动作播完再消失
        f.dying -= dt;
        if (f.dying <= 0) { f.dying = 0; f.alive = false; f.respawn = 10 + Math.random() * 6; }
        continue;
      }
      if (f.flash > 0) f.flash = Math.max(0, f.flash - dt);
      if (f.atkAnim > 0) f.atkAnim = Math.max(0, f.atkAnim - dt);
      /* 头顶台词计时（v43）：到点随机来一句；全局同时说话 ≤2 只，同屏不吵。
       * 初始冷却按序号错开（i*0.6s），避免一群怪同时开口。 */
      if (f.sayT > 0) f.sayT = Math.max(0, f.sayT - dt);
      if (f.sayCd === undefined) {
        f.sayCd = 3 + Math.random() * 8 + i * 0.6;
      } else {
        f.sayCd -= dt;
        if (f.sayCd <= 0) {
          var talking = 0;
          for (var si = 0; si < foes.length; si++) if (foes[si].sayT > 0) talking++;
          if (talking < 2 && Math.random() < 0.6) {
            foeSay(f, foeSayIdleLine(f), 2.2 + Math.random() * 1.2);
          } else {
            f.sayCd = 4 + Math.random() * 5;   // 这轮没轮上，稍后再试
          }
        }
      }
      // ★5 读条技能状态机：Boss/精英起手读条；读条中持续走表（不依赖玩家是否在范围内，
      // 玩家跑出范围也照常释放）；起手期间攻击它即可打断；读条完成若仍在施法半径内则吃大额伤害。
      if (!f.casting) f.castCd -= dt;
      if (f.isBoss || f.isElite) {
        if (f.casting) {
          f.castT -= dt;
          if (f.castT <= 0) {
            f.casting = false; f.castKind = null; f.castCd = 4 + Math.random() * 3;
            var cr = f.isBoss ? 3.4 : 2.6;
            var cd2 = Math.hypot(player.mx - f.x, player.my - f.y);
            if (cd2 < cr && !player.dead && player.invuln <= 0) {
              var big = Math.max(1, Math.round(f.atk * (f.isBoss ? 2.2 : 1.5) - player.def * 0.5));
              player.hp -= big; player.flash = 0.3;
              addFloater(player.mx, player.my - 0.4, '-' + big, '#ff3b3b', { crit: true });
              screenShake = Math.max(screenShake, 0.4);
              if (player.hp <= 0) playerDown(f);
            }
          }
        } else if (f.castCd <= 0) {
          var cd = Math.hypot(player.mx - f.x, player.my - f.y);
          if (cd < (f.def_.aggro || AGGRO)) {
            f.casting = true; f.castT = f.isBoss ? 2.4 : 1.8; f.castMax = f.castT; f.castKind = 'aoe';
            addFloater(f.x, f.y - 0.6, f.isBoss ? '蓄力·天崩！' : '蓄力·重击！', '#ffae42');
          }
        }
      }
      if (f.def_.dummy) { setBeastAnim(f, 'idle'); continue; }   // 训练靶：不追、不打、不移动
      var dx = player.mx - f.x, dy = player.my - f.y, dist = Math.hypot(dx, dy);
      /* 亮相台词（v43.1）：第一次进入视野（6.5 格内）必报招牌句，不受全局
       * 「同屏 ≤2 只」限制 —— 玩家走近就该听见，这才是「一见面就说」。 */
      if (!f.introDone && dist < 6.5) {
        f.introDone = true;
        var intro = FOE_SAY_INTRO['*'];
        for (var ik in FOE_SAY_INTRO) {
          if (ik !== '*' && (f.name || '').indexOf(ik) >= 0) { intro = FOE_SAY_INTRO[ik]; break; }
        }
        foeSay(f, intro, 2.8);
      }
      f.atkCd -= dt;
      var moving = false;
      var radius = f.def_.aggro || AGGRO;      // 每只怪可以用登记表里的 aggro 覆盖默认仇恨半径
      var hd = Math.hypot(f.x - f.home.x, f.y - f.home.y);   // 离巢距离
      var leashed = hd > f.leash;              // 被引出了领地：停止追击，回巢待命
      if (dist < radius && !player.dead && !leashed) {
        var sp = f.def_.mv * dt, ux = dx / (dist || 1), uy = dy / (dist || 1);
        var sx2 = ux, sy2 = uy;
        // 走到出手距离就停住：引擎原本会一路挤进玩家所在格，画面上整只怪压在主角头上。
        // 停住之后由下面的 MELEE 判定出手，观感才对。
        // 远程怪（ranged）停手距离更远：到不了视线就一直逼近（隔墙放空枪没有意义），
        // 到位后放风筝 —— 玩家贴脸就后撤一步。
        var rng = f.def_.ranged;
        var stopAt = rng ? rng.stop : BEAST_STOP;
        var losOk = losClear(Math.round(f.x), Math.round(f.y), Math.round(player.mx), Math.round(player.my));
        if (dist > stopAt || (rng && !losOk)) {
          if (losOk) {
            f.bpath = null;
          } else {
            f.repath = (f.repath || 0) - dt;
            if (f.repath <= 0 || !f.bpath) {
              f.repath = PATH_EVERY;
              f.bpath = bfsNext(f.x, f.y, player.mx, player.my, CUR);
            }
            if (f.bpath) {
              var wx = f.bpath.x - f.x, wy = f.bpath.y - f.y;
              if (Math.abs(wx) + Math.abs(wy) < 0.25) {   // 已到路点：下一帧重算
                f.bpath = null; f.repath = 0;
              } else {
                var wl = Math.hypot(wx, wy) || 1;
                sx2 = wx / wl; sy2 = wy / wl;
              }
            }
          }
          if (couldStand(f.x + sx2 * sp, f.y)) { f.x += sx2 * sp; moving = true; }
          if (couldStand(f.x, f.y + sy2 * sp)) { f.y += sy2 * sp; moving = true; }
          chaseDbg.key = f.key;
          chaseDbg.los = losOk ? 1 : 0;
          chaseDbg.sx = +sx2.toFixed(3); chaseDbg.sy = +sy2.toFixed(3);
          chaseDbg.bp = f.bpath ? (f.bpath.x + ',' + f.bpath.y) : '';
          chaseDbg.path = f.bpath ? 1 : 0;
        } else {
          f.bpath = null;
          // 远程怪放风筝：玩家贴到 2.2 格内就往后撤（能站才挪，别把怪挤进水里）
          if (rng && dist < stopAt - 2.2) {
            if (couldStand(f.x - ux * sp, f.y)) { f.x -= ux * sp; moving = true; }
            if (couldStand(f.x, f.y - uy * sp)) { f.y -= uy * sp; moving = true; }
          }
        }
        setFaceHys(f, dx, dy);
        // 复活/被击退后的无敌窗口内不结算伤害，否则刚站起来就被连击再倒
        if (rng) {
          // 远程怪：有视线且进入射程就掷火球弹道（玩家可以走位躲开）
          if (losOk && dist <= stopAt + 1.4 && f.atkCd <= 0 && player.invuln <= 0) {
            f.atkCd = rng.cd || 2.8; f.atkAnim = 0.32;
            setBeastAnim(f, 'atk');
            projectiles.push({ x: f.x, y: f.y, vx: dx / (dist || 1), vy: dy / (dist || 1),
              spd: rng.spd || 5.2, life: 2.6, side: 'foe', fx: 'fireball',
              dmg: Math.max(1, Math.round(f.atk * (rng.mul || 0.9) - player.def * 0.3)) });
            projFired++;
          }
        } else if (dist < MELEE + 0.15 && f.atkCd <= 0 && player.invuln <= 0) {
          f.atkCd = 1.0; f.atkAnim = 0.32;
          // 精英偶尔放重招（atk2），普通怪只有普通攻击
          setBeastAnim(f, (f.def_.elite && Math.random() < 0.35) ? 'atk2' : 'atk');
          var real = Math.max(1, Math.round(f.atk - player.def * 0.5));
          player.hp -= real; player.flash = 0.25;
          addFloater(player.mx, player.my - 0.35, '-' + real, '#ff6b6b'); screenShake = Math.max(screenShake, 0.3);
          if (player.hp <= 0) playerDown(f);
        }
      } else if (hd > 0.6) {
        // 失去仇恨 / 越出领地 / 玩家死亡 → 走回巢穴，回到领地内待命（不追、不打）
        var hxx = f.home.x - f.x, hyy = f.home.y - f.y;
        var sp2 = f.def_.mv * 0.8 * dt;        // 回巢用 0.8 倍速，不慌不忙
        var sx2b = hxx, sy2b = hyy;
        var hlos = losClear(Math.round(f.x), Math.round(f.y), Math.round(f.home.x), Math.round(f.home.y));
        if (hlos) {
          f.bpath = null;
        } else {
          f.repath = (f.repath || 0) - dt;
          if (f.repath <= 0 || !f.bpath) {
            f.repath = PATH_EVERY;
            f.bpath = bfsNext(f.x, f.y, f.home.x, f.home.y, CUR);
          }
          if (f.bpath) {
            var bx = f.bpath.x - f.x, by = f.bpath.y - f.y;
            if (Math.abs(bx) + Math.abs(by) < 0.25) { f.bpath = null; f.repath = 0; }
            else { var bl = Math.hypot(bx, by) || 1; sx2b = bx / bl; sy2b = by / bl; }
          }
        }
        if (couldStand(f.x + sx2b * sp2, f.y)) { f.x += sx2b * sp2; moving = true; }
        if (couldStand(f.x, f.y + sy2b * sp2)) { f.y += sy2b * sp2; moving = true; }
        setFaceHys(f, hxx, hyy);
        chaseDbg.key = f.key; chaseDbg.los = hlos ? 1 : 0;
        chaseDbg.sx = +sx2b.toFixed(3); chaseDbg.sy = +sy2b.toFixed(3);
        chaseDbg.bp = f.bpath ? (f.bpath.x + ',' + f.bpath.y) : '';
        chaseDbg.path = f.bpath ? 1 : 0;
      } else {
        f.bpath = null;   // 已在巢内待命
      }
      // 动作切换只在这几种情形下发生：受击/攻击的锁定期结束后才允许被移动状态改写
      if (f.animHold <= 0) {
        if (moving) setBeastAnim(f, f.def_.mv >= BEAST_RUN_MV ? 'run' : 'walk');
        else setBeastAnim(f, 'idle');
      }
    }
  }
  function updateFloaters(dt) {
    if (clickMark) {
      clickMark.life -= dt;
      // v45：角色已走到目标格附近 → 标记立刻转入 0.25 秒快速淡出，别再空转 2.4 秒
      if (!clickMark.bad && Math.hypot(player.mx - clickMark.mx, player.my - clickMark.my) < 0.25)
        clickMark.life = Math.min(clickMark.life, 0.25);
      if (clickMark.life <= 0) clickMark = null;
    }
    for (var i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i]; f.life -= dt; f.off += (f.rise || 34) * dt; if (f.life <= 0) floaters.splice(i, 1);
    }
    // 连击窗口倒计时：超时断连。暴击余晖也在这里衰减（只用于连击数放大特效）
    if (player.comboT > 0) { player.comboT -= dt; if (player.comboT <= 0) breakCombo(); }
    if (player.critT > 0) player.critT = Math.max(0, player.critT - dt);
    for (var j = particles.length - 1; j >= 0; j--) {
      var p = particles[j]; p.life -= dt; p.mx += p.vx * dt; p.my += p.vy * dt; p.vy += 6 * dt;
      if (p.life <= 0) particles.splice(j, 1);
    }
  }
  // 图集键是 `base_idle_xxx` / `base_attack_xxx` 这种带状态后缀的，
  // 而 foes 对象里只存了 base（f.key）。这里按「攻击帧优先、否则待机帧、再兜底取首帧」拼出真实键，
  // 这样即便盲切方向偶有错位，妖兽也至少能显示出来而不会整只消失。
  function foeFrameKey(f) {
    var base = f.key, rect = ATLAS.foes.rect || {};
    // 倒地：老图集里其实带了 golem/wraith/assassin 的 death_0..2 三帧，从前一直没人读 ——
    // 顺手接上，让老妖兽也有倒地过程，而不是血一空就"啵"地消失。
    if (f.dying > 0) {
      var total = BEAST_DUR.dead, k = 1 - Math.max(0, f.dying) / total;
      for (var j = 2; j >= 0; j--) {
        var kd = base + '_death_' + j;
        if (rect[kd] && k >= j / 3) return kd;
      }
      if (rect[base + '_death_0']) return base + '_death_0';
    }
    if (f.atkAnim > 0) {
      var ka = base + '_attack_' + f.face;
      if (rect[ka]) return ka;
    }
    var ki = base + '_idle_' + f.face;
    if (rect[ki]) return ki;
    var keys = Object.keys(rect);
    for (var i = 0; i < keys.length; i++) if (keys[i].indexOf(base + '_') === 0) return keys[i];
    return base;
  }
  /** 侧视怪物的取帧：循环动作（idle/walk/run）按 fps 走，一次性动作按播放进度走、停在末帧。
   *  返回的对象比 foePiece 多两个字段：ax（锚点在帧内的归一化横坐标）与 flip（是否水平镜像）。
   *  为什么要有 ax：引擎从前按「帧宽居中」摆怪，但侧视包的画手会把角色画在格子偏左/偏右，
   *  逐帧也不一致；构建脚本已把全动作统一平移过一次，并把真实锚点比例写进图集，这里直接用。 */
  function beastPiece(f) {
    var a = ATLAS.foes.anim && ATLAS.foes.anim[f.key];
    if (!a || !a.acts) return null;
    var act = f.anim || 'idle';
    if (!a.acts[act]) act = BEAST_FALLBACK[act] || 'idle';
    if (!a.acts[act]) act = 'idle';
    var arr = a.acts[act];
    if (!arr || !arr.length) return null;
    var i;
    if (act === 'atk' || act === 'atk2' || act === 'hurt' || act === 'dead') {
      var dur = BEAST_DUR[act] || 0.4;
      var k = Math.max(0, Math.min(0.999, f.animT / dur));
      i = Math.min(arr.length - 1, Math.floor(k * arr.length));
    } else {
      var fps = (a.fps && a.fps[act]) || 8;
      i = Math.floor(f.animT * fps) % arr.length;
    }
    var r = arr[i];
    // 侧视素材只有一版朝向。多数包画的是「朝右」，但小僵尸原画是「朝左」，
    // 所以镜像与否取决于「想要的朝向」和「素材原生朝向」是否一致，不能写死。
    var wantLeft = (f.face === 'left' || f.face === 'up');
    var srcLeft = (a.srcFace === 'left');
    return { img: ATLAS.foes.img, sx: r[0], sy: r[1], w: r[2], h: r[3],
      ax: (a.ax != null ? a.ax : 0.5), flip: (wantLeft !== srcLeft), srcFace: a.srcFace || 'right' };
  }
  /** 切怪物动作；同一个动作重复调用不重置计时（否则 idle 会永远卡在第 0 帧） */
  function setBeastAnim(f, act) {
    if (f.anim === act) return;
    f.anim = act; f.animT = 0;
    f.animHold = BEAST_DUR[act] || 0;
  }
  /** 朝向滞回：主方向位移量不足 FACE_DEAD 时保持原朝向，防止追击贴身时左右抖动翻转 */
  var FACE_DEAD = 0.45;
  function setFaceHys(f, dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) {
      if (Math.abs(dx) >= FACE_DEAD) f.face = dx > 0 ? 'right' : 'left';
    } else {
      if (Math.abs(dy) >= FACE_DEAD) f.face = dy > 0 ? 'down' : 'up';
    }
  }
  /** 贴一帧怪到屏幕上。flip=true 时以屏幕 x=px 为镜像轴 —— 侧视素材只有朝右一版，
   *  朝左只能镜像；横坐标要按锚点比例反着算，否则翻面后角色会整体偏左半个身位。 */
  function blitFoe(pz, px, ax, dy, ow, oh, flip, alpha, lighter) {
    ctx.save();
    if (alpha != null && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    if (lighter) ctx.globalCompositeOperation = 'lighter';
    if (flip) {
      ctx.translate(px, 0); ctx.scale(-1, 1);
      ctx.drawImage(pz.img, pz.sx, pz.sy, pz.w, pz.h, -ow * ax, dy, ow, oh);
    } else {
      ctx.drawImage(pz.img, pz.sx, pz.sy, pz.w, pz.h, Math.round(px - ow * ax), dy, ow, oh);
    }
    ctx.restore();
  }
  function drawFoe(f) {
    if (!f.alive && f.dying <= 0) return;
    var bp = beastPiece(f);
    var pz = bp || foePiece(foeFrameKey(f));
    var ax = bp ? bp.ax : 0.5, flip = bp ? bp.flip : false;
    var p = isoToScreen(f.x, f.y);
    var baseY = p.y + HH * Z;
    ctx.save();
    var shR = (f.def_.fh || 110) * 0.30 * Z;   // 接地影随体型等比，不再固定大小
    ctx.globalAlpha = 0.3; ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(p.x, baseY - 2, shR, shR * 0.5, 0, 0, 6.2832); ctx.fill();
    ctx.restore();
    if (!pz) return;
    // 按「目标身高」归一化：图集各帧原始像素尺寸差很大（如石魔 idle 帧 348px 宽），
    // 直接 1:1 画会忽大忽小、且整只偏大。这里统一缩放到 fh，再以脚底 + 锚点对齐格子中心。
    var th = f.def_.fh || 110;
    var k = th / pz.h;
    var ow = pz.w * k * Z, oh = th * Z;
    var dy = Math.round(baseY - oh);
    var alpha = f.dying > 0 ? Math.min(1, f.dying / 0.4) : 1;   // 倒地末段淡出，接续原地复活
    var sm = ctx.imageSmoothingEnabled; ctx.imageSmoothingEnabled = false;
    blitFoe(pz, p.x, ax, dy, ow, oh, flip, alpha, false);
    if (f.flash > 0) {  // 受击闪白（lighter 只叠加在精灵像素上，透明处不显）
      blitFoe(pz, p.x, ax, dy, ow, oh, flip, Math.min(0.9, f.flash * 4) * alpha, true);
    }
    ctx.imageSmoothingEnabled = sm;
    var dist = Math.hypot(f.x - player.mx, f.y - player.my);
    if (player.targetFoe === f || dist < 3.0) {
      var ty = dy - 6 * Z;
      ctx.textAlign = 'center';
      ctx.font = 'bold ' + (12 * Z).toFixed(1) + 'px "Microsoft YaHei",sans-serif';
      ctx.lineWidth = 3.5 * Z; ctx.strokeStyle = 'rgba(6,12,24,.82)';
      ctx.strokeText(f.name, p.x, ty); ctx.fillStyle = '#ffd0c0'; ctx.fillText(f.name, p.x, ty);
      var bw = Math.max(40 * Z, ow * 0.7), bh = 5 * Z, bx = p.x - bw / 2, by = ty - 14 * Z;
      ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = f.def_.boss ? '#ff5a5a' : (f.def_.elite ? '#ffb24d' : '#7be07b');
      ctx.fillRect(bx, by, bw * Math.max(0, f.hp / f.maxhp), bh);
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1 * Z; ctx.strokeRect(bx, by, bw, bh);
    }
    /* 头顶小字台词（v43）：淡入 0.22s / 结束前 0.35s 淡出；
     * 近处的怪有名字+血条，气泡自动抬高避让。 */
    /* ★5 读条技能：地面预警圈（随进度收紧 + 变亮）+ 头顶进度条 */
    if (f.casting) {
      var prog = 1 - Math.max(0, f.castT) / Math.max(0.01, f.castMax);
      var gr = (f.isBoss ? 3.4 : 2.6);
      ctx.save();
      ctx.globalAlpha = 0.18 + 0.32 * prog;
      ctx.fillStyle = f.isBoss ? 'rgba(255,60,60,.55)' : 'rgba(255,170,60,.5)';
      ctx.beginPath();
      ctx.ellipse(p.x, baseY - 2, gr * HW * Z, gr * HH * Z, 0, 0, 6.2832);
      ctx.fill();
      ctx.restore();
      var cty = dy - 6 * Z, cbw = Math.max(46 * Z, ow * 0.8), cbh = 6 * Z;
      var cbx = p.x - cbw / 2, cby = cty - 26 * Z;
      ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillRect(cbx, cby, cbw, cbh);
      ctx.fillStyle = f.isBoss ? '#ff4d4d' : '#ffb24d';
      ctx.fillRect(cbx, cby, cbw * prog, cbh);
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1 * Z; ctx.strokeRect(cbx, cby, cbw, cbh);
    }
    if (f.sayT > 0 && f.say) {
      var nearF = (player.targetFoe === f || dist < 3.0);
      var sy2 = dy - (nearF ? 24 : 8) * Z;
      var aSay = Math.min(1, (f.sayDur - f.sayT) / 0.22) * Math.min(1, f.sayT / 0.35);
      drawSpeechBubble(p.x, sy2, f.say, aSay, Z);
    }
  }
  /** 台词气泡：半透明圆角底 + 向下小尾巴 + 单行小字（描边保证亮背景也可读） */
  function drawSpeechBubble(x, y, text, alpha, z) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold ' + (10.5 * z).toFixed(1) + 'px "Microsoft YaHei",sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    var tw = ctx.measureText(text).width;
    var pw = tw + 12 * z, ph = 15 * z;
    var bx = x - pw / 2, by = y - ph - 4 * z;
    ctx.fillStyle = 'rgba(10,16,28,.74)';
    roundRectPath(bx, by, pw, ph, 5 * z); ctx.fill();
    ctx.strokeStyle = 'rgba(255,224,150,.4)'; ctx.lineWidth = 1 * z; ctx.stroke();
    ctx.beginPath();                                  // 小尾巴指向头顶
    ctx.moveTo(x - 3.5 * z, by + ph - 0.5);
    ctx.lineTo(x + 3.5 * z, by + ph - 0.5);
    ctx.lineTo(x, y - 1 * z);
    ctx.closePath(); ctx.fill();
    var ty2 = y - 9.5 * z;
    ctx.lineWidth = 3 * z; ctx.strokeStyle = 'rgba(6,12,24,.85)';
    ctx.strokeText(text, x, ty2);
    ctx.fillStyle = '#ffe9c2';
    ctx.fillText(text, x, ty2);
    ctx.restore();
  }
  function roundRectPath(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // 点击行走的目标指示：落地菱形 + 扩散圈，淡出 0.7s，让玩家明确知道点到了哪格。
  // bad=true 是"这一格去不了"的红色叉号 —— 外来大图里常有"看着有路、其实被水/断崖隔开"的格子，
  // 没反馈的话玩家只会以为自己卡住了。
  function drawClickMark() {
    if (!clickMark) return;
    var p = isoToScreen(clickMark.mx, clickMark.my);
    var cx = p.x, cy = p.y + HH * Z;
    var t = Math.max(0, clickMark.life / clickMark.max);
    var grow = 1 - t;
    ctx.save();
    if (clickMark.bad) {
      var rr = TILE_W * 0.34 * (0.7 + grow * 0.5) * Z;
      ctx.globalAlpha = t * 0.9; ctx.lineWidth = 3 * Z; ctx.strokeStyle = '#ff5a4a';
      ctx.beginPath();
      ctx.moveTo(cx - rr, cy - rr * 0.5); ctx.lineTo(cx + rr, cy + rr * 0.5);
      ctx.moveTo(cx + rr, cy - rr * 0.5); ctx.lineTo(cx - rr, cy + rr * 0.5);
      ctx.stroke();
      ctx.beginPath(); ctx.ellipse(cx, cy, rr * 1.25, rr * 0.62, 0, 0, 6.2832); ctx.stroke();
      ctx.restore();
      return;
    }
    var r = TILE_W * 0.5 * (0.4 + grow * 0.8) * Z;
    /* v45 重做：移动目标特效 = 菱形光斑持续呼吸 + 每 0.9s 一轮外扩涟漪。
     * 生命 2.4s（到达自动提前淡出），开头 0.15s 淡入、结尾 0.3s 淡出，
     * 让玩家全程看得见"要走到哪"，而不是一闪就没。 */
    var age = clickMark.max - clickMark.life;
    var fadeIn = Math.min(1, age / 0.15);
    var fadeOut = Math.min(1, Math.max(0, clickMark.life) / 0.3);
    var a0 = 0.85 * fadeIn * fadeOut;
    var nowSec = ((window.performance && performance.now) ? performance.now() : Date.now()) / 1000;
    var pulse = 0.72 + 0.28 * Math.sin(nowSec * 6.5);
    // —— 外扩涟漪（等距椭圆，随周期扩大并变淡）——
    var cyc = (age % 0.9) / 0.9;
    var rr = TILE_W * (0.28 + cyc * 0.55) * Z;
    ctx.globalAlpha = a0 * (1 - cyc) * 0.55;
    ctx.strokeStyle = '#8bf3ff'; ctx.lineWidth = 2 * Z;
    ctx.beginPath(); ctx.ellipse(cx, cy, rr, rr * 0.5, 0, 0, 6.2832); ctx.stroke();
    // —— 底部淡光晕 ——
    ctx.globalAlpha = a0 * 0.35;
    ctx.fillStyle = 'rgba(139,243,255,.22)';
    ctx.beginPath(); ctx.ellipse(cx, cy, rr * 0.9, rr * 0.45, 0, 0, 6.2832); ctx.fill();
    // —— 落点菱形光斑（呼吸缩放）——
    var dw = HW * Z * pulse, dh = HH * Z * pulse;
    ctx.globalAlpha = a0;
    ctx.fillStyle = 'rgba(139,243,255,.38)'; ctx.strokeStyle = '#d6f6ff'; ctx.lineWidth = 2 * Z;
    ctx.beginPath();
    ctx.moveTo(cx, cy - dh); ctx.lineTo(cx + dw, cy); ctx.lineTo(cx, cy + dh); ctx.lineTo(cx - dw, cy); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  /** 连击数：屏幕上方居中，带窗口进度条（剩多久断连）与暴击放大 */
  function drawCombo() {
    if (player.combo < 2) return;
    var k = Math.max(0, Math.min(1, player.comboT / COMBO_WIN));
    var pop = 1 + (player.critT / 0.45) * 0.45;
    var y = H * 0.26;
    ctx.save();
    ctx.globalAlpha = Math.min(1, k * 1.8);
    ctx.textAlign = 'center';
    ctx.font = 'bold ' + (30 * Z * pop).toFixed(1) + 'px "Microsoft YaHei",sans-serif';
    ctx.lineWidth = 5 * Z; ctx.strokeStyle = 'rgba(6,12,24,.85)';
    ctx.strokeText(player.combo + ' 连击', W / 2, y);
    ctx.fillStyle = player.critT > 0 ? '#ffe66b' : '#ffd36b';
    if (player.critT > 0) { ctx.shadowColor = 'rgba(255,190,60,.9)'; ctx.shadowBlur = 14 * Z; }
    ctx.fillText(player.combo + ' 连击', W / 2, y);
    ctx.shadowBlur = 0;
    // 连击加成提示 + 窗口进度条
    ctx.font = 'bold ' + (13 * Z).toFixed(1) + 'px "Microsoft YaHei",sans-serif';
    ctx.lineWidth = 3 * Z;
    var bonus = '+' + Math.round(player.combo * COMBO_STEP * 100) + '% 伤害';
    ctx.strokeText(bonus, W / 2, y + 20 * Z); ctx.fillStyle = '#ffcf8a';
    ctx.fillText(bonus, W / 2, y + 20 * Z);
    var bw = 104 * Z, bh = 4 * Z, bx = W / 2 - bw / 2, by = y + 28 * Z;
    ctx.globalAlpha = Math.min(1, k * 1.8) * 0.85;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.fillRect(bx, by, bw, bh);
    ctx.fillStyle = '#ffb24d'; ctx.fillRect(bx, by, bw * k, bh);
    ctx.restore();
  }
  function drawFloaters() {
    for (var i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      var p = isoToScreen(f.mx, f.my);
      var y = p.y - 46 * Z - f.off;
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / f.max * 1.4));
      ctx.textAlign = 'center';
      // 暴击数字更大、带描边光晕，扫一眼就知道这一下不一样
      var fs = (f.crit ? 23 : 15) * Z;
      ctx.font = 'bold ' + fs.toFixed(1) + 'px "Microsoft YaHei",sans-serif';
      ctx.lineWidth = (f.crit ? 5 : 3.5) * Z; ctx.strokeStyle = 'rgba(6,12,24,.85)';
      if (f.crit) { ctx.shadowColor = 'rgba(255,190,60,.95)'; ctx.shadowBlur = 12 * Z; }
      ctx.strokeText(f.text, p.x, y); ctx.fillStyle = f.color; ctx.fillText(f.text, p.x, y);
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    drawCombo();
    for (var j = 0; j < particles.length; j++) {
      var pt = particles[j];
      var q = isoToScreen(pt.mx, pt.my);
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      var s = 4 * Z; ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
  function updateHUD() {
    var hpv = document.getElementById('hpv'); if (hpv) hpv.textContent = Math.max(0, Math.round(player.hp)) + '/' + player.maxhp;
    var fill = document.getElementById('hpfill'); if (fill) fill.style.width = Math.max(0, player.hp / player.maxhp * 100) + '%';
    /* v54：修为不只是个数字了 —— 显示成「当前累计 / 下一境界门槛」，玩家才知道还差多少。
     * 用的是**累计值**（突破不扣修为），所以分子只会涨，不会因为突破了就归零。 */
    var expv = document.getElementById('expv');
    if (expv) {
      var nxr = realmNext();
      expv.textContent = player.realmName + ' · 修为 ' + Math.round(player.exp) +
        (nxr ? ' / ' + nxr.need : ' · 圆满');
    }
    var sv = document.getElementById('stonev'); if (sv) sv.textContent = player.stones;
    // ★1 常驻属性条：攻/御/境界，折叠面板时也可见
    var sak = document.getElementById('satk'); if (sak) sak.textContent = player.atk;
    var sdf = document.getElementById('sdef'); if (sdf) sdf.textContent = player.def;
    var srm = document.getElementById('srealm'); if (srm) srm.textContent = player.realmName;
    // ★4 任务追踪行
    var tr = document.getElementById('taskRow');
    if (tr) {
      if (quest.done) tr.textContent = '任务 · 全部达成 ✓';
      else { var qt = QUESTS[quest.step]; tr.textContent = '任务 · ' + qt.text + ' ' + Math.min(quest[qt.key] || 0, qt.need) + '/' + qt.need; }
    }
    var ft = document.getElementById('foetarget');
    if (ft) {
      if (player.targetFoe && player.targetFoe.alive) {
        var f = player.targetFoe;
        ft.style.display = 'block';
        ft.querySelector('.ftname').textContent = f.name + '  ' + Math.max(0, Math.round(f.hp)) + '/' + f.maxhp;
        ft.querySelector('.ftfill').style.width = Math.max(0, f.hp / f.maxhp * 100) + '%';
      } else ft.style.display = 'none';
    }
  }

  /* ---------------- 场景缩略图（右上角） ----------------
   * 只解决一个问题：**我在哪**。大图（外来图 36×38）走起来很容易迷失方向，
   * 光看画面不知道自己在山谷的哪一角、往哪走能出去。
   *
   * 分两层画，开销与地图大小无关：
   *   · 底图 MM.base —— 1 像素 1 格画在离屏 canvas 上，只在地图切换 / 地形补齐时重画一次；
   *   · 每帧只 drawImage 贴一次底图，再点几个标记（传送门 / NPC / 妖兽 / 主角 / 视野框）。
   * 折叠起来时整个跳过（一点开销都不留）。
   *
   * 颜色是「读图」用的，不是美术：绿=能走 / 深灰=挡路 / 蓝=水 / 透明=虚空。
   * 妙处在于它天然把外来图的问题显出来 —— 桥、断崖、断开的可走区一眼就能看见。
   */
  var MM_MAXW = 190;                 // 缩略图目标宽度上限（见 mmBuildBase 的尺寸说明）
  var MM_C_WALK = [127, 168, 107];
  var MM_C_BLOCK = [90, 82, 72];
  var MM_C_WATER = [42, 95, 134];
  var MM = { cv: null, cx: null, base: null, baseKey: '', last: '', folded: false,
             w: 0, h: 0, s: 1 };

  function mmInit() {
    MM.cv = document.getElementById('mmCanvas');
    if (!MM.cv) return false;
    MM.cx = MM.cv.getContext('2d');
    var box = document.getElementById('minimap');
    var head = document.getElementById('mmHead');
    if (head) head.onclick = function () { mmFold(!MM.folded); };
    MM.cv.addEventListener('mousedown', function (e) {
      if (e.button === 0) { e.preventDefault(); mmClick(e.clientX, e.clientY); }
    });
    MM.cv.addEventListener('touchstart', function (e) {
      e.preventDefault(); var t = e.touches[0]; mmClick(t.clientX, t.clientY);
    }, { passive: false });
    // HTML 里先写着 folded（避免 JS 起来前面板闪一个空白画布），这里按设备把状态对齐：
    // 手机默认收起（右上角本来就挤），桌面默认展开。
    // ?mm=1 / ?mm=0 强制开关：手机端默认收起，无头截图核对"展开态长什么样"时点不了按钮。
    var mq2 = new URLSearchParams(location.search).get('mm');
    var fold = document.body.classList.contains('touch');
    if (mq2 === '0') fold = true; else if (mq2 === '1') fold = false;
    if (box) mmFold(fold);
    return true;
  }
  function mmFold(f) {
    MM.folded = !!f;
    var box = document.getElementById('minimap');
    if (box) box.classList.toggle('folded', MM.folded);
    var tg = document.getElementById('mmTg');
    if (tg) tg.textContent = MM.folded ? '▸' : '▾';
    if (!MM.folded) { MM.last = ''; updateMinimap(); }
  }
  /** 底图：等距菱形，缓存在离屏 canvas 上。
   *
   * ★ 为什么不是「1 像素 1 格的正方形」（2026-09-17 用户反馈「缩略图和地图角度对不上」修）
   *   旧版把 x→像素x、y→像素y 直接铺成正方形，那是**俯视正交**投影；
   *   而游戏画面是等距投影 —— 屏幕 x ∝ (mx−my)、屏幕 y ∝ (mx+my)。
   *   两者差 45°：缩略图上的「右上」在游戏里其实是「右下」，
   *   玩家看着缩略图走，方向是歪的。
   *   改成同一套投影后，缩略图的形状/朝向与画面完全同构 —— 看缩略图 = 看画面缩小版。
   *
   * 像素映射（与引擎的 isoToScreen 同构，只是常数不同）：
   *   px = (x − y) * HW + OX      py = (x + y) * HH + OY
   *   HW = 2 × HH（等距标准 2:1）
   *
   * ⚠ 尺寸怎么定（踩过的坑）：不能直接 `HH = MM_MAX / span` 取整 —— 大图 span 有 238，
   *   `floor(150/238)` 直接掉到 1，再配上 HW=2 就宽到 480px，把右上角撑爆。
   *   做法：**内部按整数 HH 画**（保证菱形边缘锐利、不出现半像素毛边），
   *   画完再按目标宽度整体缩放一次 —— 缩放在位图层面做，硬边观感保住了。
   */
  function mmBuildBase() {
    if (!CUR || !CUR.ground) return null;
    var key = CUR.id + '#' + (CUR._mmVer || 0);
    if (MM.base && MM.baseKey === key) return MM.base;
    var span = CUR.w + CUR.h;                  // x−y 与 x+y 的取值范围长度
    // 内部绘制精度：span 小就画大点（最多 2），span 大就用 1
    var HH = span <= 60 ? 2 : 1;
    var hw = HH * 2;
    var padX = Math.ceil(hw), padY = Math.ceil(HH);
    var iw = Math.ceil(span * hw) + padX * 2;
    var ih = Math.ceil(span * HH) + padY * 2;
    // 目标宽度上限：横向像素/格是纵向的 2 倍，所以宽 = 2×高；限制宽度即限制了占地
    var MAXW = MM_MAXW;
    var scale = iw > MAXW ? MAXW / iw : 1;
    var cw = Math.max(24, Math.round(iw * scale));
    var chh = Math.max(16, Math.round(ih * scale));

    // ① 先在内部精度上画（整数菱形，边缘锐利）
    var ib = document.createElement('canvas');
    ib.width = iw; ib.height = ih;
    var ci = ib.getContext('2d');
    var img = ci.createImageData(iw, ih), d = img.data;
    for (var y = 0; y < CUR.h; y++) {
      for (var x = 0; x < CUR.w; x++) {
        var ch2 = CUR.ground[y][x];
        var col, alpha = 255;
        if (ch2 === ' ') { col = MM_C_WALK; alpha = 0; }          // 虚空 → 透明，露出面板底
        else if (WATER.indexOf(ch2) >= 0) col = MM_C_WATER;
        else if (CUR.solid['' + x + ',' + y]) col = MM_C_BLOCK;
        else col = MM_C_WALK;
        // 这一格画成一个菱形：以格心为中心，横向 ±hw、纵向 ±HH
        var cxp = (x + 0.5 - (y + 0.5)) * hw + padX + CUR.h * hw;
        var cyp = (x + 0.5 + (y + 0.5)) * HH + padY;
        var py0 = Math.max(0, Math.floor(cyp - HH)), py1 = Math.min(ih - 1, Math.ceil(cyp + HH));
        for (var py = py0; py <= py1; py++) {
          var ry = Math.abs(py + 0.5 - cyp) / HH;
          if (ry > 1) continue;
          var halfW = hw * (1 - ry);
          var px0 = Math.max(0, Math.floor(cxp - halfW)), px1 = Math.min(iw - 1, Math.ceil(cxp + halfW));
          for (var px = px0; px <= px1; px++) {
            if (Math.abs(px + 0.5 - cxp) > halfW) continue;
            var ii = (py * iw + px) * 4;
            d[ii] = col[0]; d[ii + 1] = col[1]; d[ii + 2] = col[2]; d[ii + 3] = alpha;
          }
        }
      }
    }
    ci.putImageData(img, 0, 0);

    // ② 整体缩放到目标尺寸（最近邻，保硬边）
    var cv = document.createElement('canvas');
    cv.width = cw; cv.height = chh;
    var c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.drawImage(ib, 0, 0, iw, ih, 0, 0, cw, chh);

    // 记下投影参数（用**目标尺寸**算，后续打点/换算都用它，与底图严格一致）
    MM.proj = { hw: hw * scale, hh: HH * scale,
                ox: (padX + CUR.h * hw) * scale, oy: padY * scale };
    MM.base = cv; MM.baseKey = key;
    return cv;
  }
  /** 地图格 → 缩略图像素（与 mmBuildBase 的投影严格一致） */
  function mmToPx(mx, my) {
    var P = MM.proj || { hw: 2, hh: 1, ox: 0, oy: 0 };
    return { x: (mx - my) * P.hw + P.ox, y: (mx + my) * P.hh + P.oy };
  }
  /** 缩略图像素 → 地图格（mmToPx 的逆，用于点图走位） */
  function mmToCell(px, py) {
    var P = MM.proj || { hw: 2, hh: 1, ox: 0, oy: 0 };
    var a = (px - P.ox) / P.hw;        // = mx - my
    var b = (py - P.oy) / P.hh;        // = mx + my
    return { mx: (a + b) / 2, my: (b - a) / 2 };
  }
  /** 画布尺寸：直接用底图的尺寸（底图已按等距投影 + 宽度上限算好） */
  function mmLayout() {
    var b = MM.base;
    MM.w = b ? b.width : 24; MM.h = b ? b.height : 16;
    MM.s = MM.proj ? MM.proj.hh : 1;
    return { w: MM.w, h: MM.h, s: MM.s };
  }
  function mmDot(c, mx, my, r, fill, stroke) {
    var p = mmToPx(mx, my);
    c.beginPath(); c.arc(p.x, p.y, r, 0, 6.2832);
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }
  function drawMinimap() {
    if (!MM.cx || MM.folded || !CUR || !CUR.ground) return;
    var base = mmBuildBase(); if (!base) return;
    var nm = document.getElementById('mmName');       // 标题带地图名：收起后只剩标题条，靠它认路
    if (nm && nm.textContent !== (CUR.name || '')) nm.textContent = CUR.name || '';
    var c = MM.cx;
    // 画布尺寸 = 底图尺寸（底图已按等距菱形算好，不再是方的）
    var L = { w: base.width, h: base.height };
    if (MM.cv.width !== L.w || MM.cv.height !== L.h) { MM.cv.width = L.w; MM.cv.height = L.h; }
    MM.w = L.w; MM.h = L.h; MM.s = (MM.proj ? MM.proj.hh : 1);
    // 面板底色：虚空/地图外的部分露出来
    c.clearRect(0, 0, L.w, L.h);
    c.fillStyle = 'rgba(8,12,22,.85)'; c.fillRect(0, 0, L.w, L.h);
    c.imageSmoothingEnabled = false;        // 1 像素 1 格的底图，放大必须用最近邻，否则糊成一团
    c.drawImage(base, 0, 0);
    c.imageSmoothingEnabled = true;

    // 视野框：把屏幕四角反算成地图坐标，取外接矩形。
    // ⚠ 现在缩略图本身也是等距投影了 —— 用 mmToPx 画**真实的菱形**（而不是方框），
    //   这样"缩略图上那个圈"和"游戏里看到的范围"形状一致，一眼能对上。
    var cs = [screenToIso(0, 0), screenToIso(W, 0), screenToIso(0, H), screenToIso(W, H)];
    c.beginPath();
    cs.forEach(function (q, i) {
      var p = mmToPx(q.mx, q.my);
      if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
    });
    c.closePath();
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.06)'; c.fill();

    // 传送门（青）、NPC（黄）、妖兽（红），主角最后画 → 永远压在最上面
    (CUR.portals || []).forEach(function (pt) { mmDot(c, pt.x, pt.y, 2.2, '#5fe9ff'); });
    (CUR.npcs || []).forEach(function (n) { mmDot(c, n.x, n.y, 2.0, '#ffd75e'); });
    (foes || []).forEach(function (f) {
      if (!f.alive) return;
      mmDot(c, f.x, f.y, 2.2, f.def_ && f.def_.dummy ? '#9fd0ff' : '#ff5a4a');
    });
    // 主角：外圈白描边 + 实心点 + 朝向小尖角（朝向也是等距方向，与画面同向）
    var pp2 = mmToPx(player.mx, player.my);
    c.beginPath(); c.arc(pp2.x, pp2.y, 4.2, 0, 6.2832);
    c.fillStyle = 'rgba(255,255,255,.92)'; c.fill();
    c.beginPath(); c.arc(pp2.x, pp2.y, 3.0, 0, 6.2832);
    c.fillStyle = '#ff2f2f'; c.fill();
    // 朝向指示：等距世界里「上」在屏幕上是右上 45° —— 用同一套投影换算方向向量
    var fv = FACE_VEC[player.face] || FACE_VEC.down;
    var dpx = mmToPx(player.mx + fv.x, player.my + fv.y);
    var dx3 = dpx.x - pp2.x, dy3 = dpx.y - pp2.y;
    var dl = Math.hypot(dx3, dy3) || 1; dx3 /= dl; dy3 /= dl;
    c.beginPath();
    c.moveTo(pp2.x + dx3 * 8.5, pp2.y + dy3 * 8.5);
    c.lineTo(pp2.x - dy3 * 3.4 + dx3 * 1.2, pp2.y + dx3 * 3.4 + dy3 * 1.2);
    c.lineTo(pp2.x + dy3 * 3.4 + dx3 * 1.2, pp2.y - dx3 * 3.4 + dy3 * 1.2);
    c.closePath(); c.fillStyle = '#ff2f2f'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1; c.stroke();
  }
  /** 脏检查：主角换格 / 朝向变 / 怪死 / 换图 / 缩放变 / 相机平移了才重画 */
  function updateMinimap() {
    if (!MM.cx || MM.folded || !CUR || !CUR.ground) return;
    var key = CUR.id + '#' + (CUR._mmVer || 0) + '|' + Math.round(player.mx) + ',' +
              Math.round(player.my) + '|' + player.face + '|' + foes.length + '|' +
              Math.round(Z * 100) + '|' + Math.round(camX / 8) + ',' + Math.round(camY / 8) + '|' +
              (CUR.portals ? CUR.portals.length : 0) + '|' + Math.round(W) + 'x' + Math.round(H);
    if (key === MM.last) return;
    MM.last = key;
    drawMinimap();
  }
  /** 点缩略图 = 点那一格（走的是和画布点击同一条入口，所以寻路/碰撞完全一致）
   *  ⚠ 缩略图现在是等距投影，换算必须走 mmToCell 的逆投影；
   *    旧版按「像素/画布尺寸 × 地图格数」线性换算只对正方形底图成立（2026-09-17 改）。 */
  function mmClick(clientX, clientY) {
    if (!CUR || !CUR.ground) return false;
    var r = MM.cv.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    // 先换算到画布位图坐标，再走 iso 逆投影
    var bx = (clientX - r.left) / r.width * MM.cv.width;
    var by = (clientY - r.top) / r.height * MM.cv.height;
    var cell = mmToCell(bx, by);
    var x = Math.round(cell.mx - 0.5), y = Math.round(cell.my - 0.5);
    if (x < 0 || y < 0 || x >= CUR.w || y >= CUR.h) return false;
    if (setTargetCell(x, y)) clickMark = { mx: x, my: y, life: 0.7, max: 0.7 };
    return true;
  }

  /* 点击/触摸地图上的某一点 —— 鼠标点击、触屏点按、自测钩子共用这**一处**，
   * 保证自测跑的是玩家真走的那条路，而不是另写一份平行逻辑（本项目的老纪律）。
   *   点到活着的妖兽 → 锁定它（之后自动追击 + 自动平A），并**当场转身**
   *   点空地         → 取消锁定，交给点击寻路
   * 返回 true 表示这一下点的是妖兽。
   * ⚠ 倒地中的怪（dying>0，alive 还是 true）点不动 —— 它已经死了，锁上去只会站着干等。 */
  function tapMap(cx, cy) {
    for (var i = 0; i < foes.length; i++) {
      var f = foes[i]; if (!f.alive || f.dying > 0) continue;
      if (Math.hypot(f.x - cx, f.y - cy) < 0.8) {
        player.targetFoe = f; player.path = null;
        player.tx = player.mx; player.ty = player.my;   // 清掉上一段走位目标
        player.foeStuck = 0; player.foeChased = false;  // 重新计"卡住"
        // ★ 锁定的一瞬间就转身，而不是等主循环的下一帧 —— 否则点下去的第一帧
        //   仍是旧朝向（"点了怪却还朝反方向"的那一瞬，肉眼能看见）。
        faceToward(f.x, f.y);
        return true;
      }
    }
    player.targetFoe = null;
    player.gatherTarget = null;   // 点空地 = 取消采集目标
    // v47：采集点优先于空地移动 —— 点中灵草/矿石/宝箱则走过去，到达自动采集（见 updateGather）
    for (var ni = 0; ni < nodes.length; ni++) {
      var nd = nodes[ni];
      if (Math.hypot(nd.x - cx, nd.y - cy) < 0.8) {
        player.gatherTarget = nd;
        var gtx = Math.round(cx), gty = Math.round(cy);
        if (setTargetCell(gtx, gty)) clickMark = { mx: gtx, my: gty, life: 2.4, max: 2.4 };
        return false;
      }
    }
    var tx = Math.round(cx), ty = Math.round(cy);
    if (setTargetCell(tx, ty)) clickMark = { mx: tx, my: ty, life: 2.4, max: 2.4 };
    return false;
  }
  // 点击移动
  function onClick(e) {
    var r = canvas.getBoundingClientRect();
    var iso = screenToIso(localX(e.clientX, r), localY(e.clientY, r));
    tapMap(iso.mx, iso.my);
  }
  canvas.addEventListener('mousedown', function (e) { if (e.button === 0) onClick(e); });

  /* ---------------- 技能盘 ----------------
   * 右下角 5 键：普攻 / 重击 / 三个技能，走的是和键盘完全相同的入口
   * （attackNearest、powerAttack、castSkill），所以自测点按钮等价于按键。 */
  var padEl = document.getElementById('skillpad');
  function padFire(el, fn) {
    if (!el) return;
    var fire = function (ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      if (padEl) padEl.classList.add('on');                 // 按下去整盘提亮，手指离开再暗回去
      fn();
    };
    el.addEventListener('click', fire);
    el.addEventListener('touchstart', fire, { passive: false });
    el.addEventListener('touchmove', function (ev) { ev.preventDefault(); }, { passive: false });
  }
  padFire(document.getElementById('skAtk'), function () { attackNearest(); });
  padFire(document.getElementById('skAtkB'), function () { powerAttack(); });
  var skillBtns = padEl ? padEl.querySelectorAll('.sk[data-s]') : [];
  for (var sbi = 0; sbi < skillBtns.length; sbi++) {
    (function (b) {
      padFire(b, function () { castSkill(+b.dataset.s); });
    })(skillBtns[sbi]);
  }
  /* 技能盘冷却 UI：--p 驱动 conic-gradient 遮罩；倒计时数字只在显示值变化时才写 DOM，
     免得每帧重排。冷却归零时清一次就停手，不再反复写。 */
  var skillUI = [];
  (function buildSkillUI() {
    if (!padEl) return;
    var bs = padEl.querySelectorAll('.sk[data-s]');
    for (var i = 0; i < bs.length; i++) {
      skillUI.push({ el: bs[i], cd: bs[i].querySelector('.cd'), num: bs[i].querySelector('.num'), last: '' });
    }
  })();
  function updateSkillUI() {
    for (var i = 0; i < skillUI.length; i++) {
      var u = skillUI[i], left = player.skillCd[i] || 0, s = SKILLS[i];
      if (!s) continue;
      if (left > 0) {
        u.el.classList.add('cooling');
        u.cd.style.setProperty('--p', ((left / s.cd) * 100).toFixed(1));
        var txt = left >= 10 ? String(Math.ceil(left)) : left.toFixed(1);
        if (u.last !== txt) { u.num.textContent = txt; u.last = txt; }
      } else if (u.last !== '') {
        u.el.classList.remove('cooling');
        u.cd.style.setProperty('--p', '0');
        u.num.textContent = ''; u.last = '';
      }
    }
  }
  // 折叠把手：横屏空间紧张时把整盘收成一个小圆
  var padTg = document.getElementById('skillToggle');
  if (padTg) {
    var togFn = function (ev) {
      if (ev) { ev.preventDefault(); ev.stopPropagation(); }
      if (!padEl) return;
      padEl.classList.toggle('folded');
      padEl.classList.add('on');
    };
    padTg.addEventListener('click', togFn);
    padTg.addEventListener('touchstart', togFn, { passive: false });
  }

  // 动作试演面板：六个动作一个按钮，点它等同于按数字键 1~6。
  // 手机没有键盘，这块是唯一能逐个核对素材动作的入口。
  var ACT_ORDER = ['idle', 'walk', 'run', 'atkA', 'atkB', 'dead'];
  function markAct(a) {
    var bs = document.querySelectorAll('#actBtns button');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].dataset.act === a);
  }
  (function buildActUI() {
    var box = document.getElementById('actBtns');
    if (!box) return;
    box.innerHTML = '';
    ACT_ORDER.forEach(function (a, i) {
      var b = document.createElement('button');
      b.textContent = (i + 1) + ' ' + ACT_CN[a];
      b.title = '试演「' + ACT_CN[a] + '」（键盘 ' + (i + 1) + '）';
      b.dataset.act = a;
      var fire = function (ev) { if (ev) ev.preventDefault(); playAct(a); markAct(a); };
      b.addEventListener('click', fire);
      b.addEventListener('touchstart', fire, { passive: false });
      box.appendChild(b);
    });
  })();

  // 鼠标滚轮缩放（以指针为锚点）
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var r = canvas.getBoundingClientRect();
    // 单次事件限幅，避免一格滚轮就跳到底；触控板小增量则保持顺滑
    var f = Math.pow(1.0022, -e.deltaY);
    f = Math.max(0.90, Math.min(1.11, f));
    zoomBy(f, localX(e.clientX, r), localY(e.clientY, r));
  }, { passive: false });

  /* 触屏双指捏合缩放 —— ★ v48 起**默认关掉**
   * 为什么关：战斗时是「一指压着摇杆走位 + 另一指点技能」，画布上很容易同时出现两个
   * 触点，被当成捏合 → 打着打着画面自己拉近/推远（用户反馈："别自己动相机"）。
   * 缩放改走右上角面板里的 ± / 滑块：那是明确的"我要调"，不会被误触。
   * 想临时开回来：URL 加 ?pinch=1。
   * ⚠ touchDist 是**两点距离之比**（pinchD 比 d），两数在同一坐标系里，缩放因子约掉
   *   → 不需要过 ptX；touchMid 是**绝对值**（拿去当 zoomBy 的锚点）→ 必须换算，否则放大后锚点飘。 */
  var PINCH_ZOOM = /[?&]pinch=1/.test(location.search);
  function touchDist(e) {
    var a = e.touches[0], b = e.touches[1];
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function touchMid(e) {
    var r = canvas.getBoundingClientRect(), a = e.touches[0], b = e.touches[1];
    return { x: localX((a.clientX + b.clientX) / 2, r), y: localY((a.clientY + b.clientY) / 2, r) };
  }
  var pinchD = 0;
  canvas.addEventListener('touchstart', function (e) {
    // ★ 两指时**不再起步捏合**（默认关闭）：只拦掉浏览器的页面缩放，游戏内 Z 保持不动
    if (e.touches.length >= 2) {
      if (PINCH_ZOOM) pinchD = touchDist(e);
      e.preventDefault(); return;
    }
    if (e.touches[0]) onClick(e.touches[0]);
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length >= 2) {
      if (PINCH_ZOOM) {
        var d = touchDist(e);
        if (pinchD > 0 && d > 0) { var m = touchMid(e); zoomBy(d / pinchD, m.x, m.y); }
        pinchD = d;
      }
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', function (e) { if (e.touches.length < 2) pinchD = 0; });

  // ---------------- 主角外形切换 ----------------
  function setHero(h) {
    if (!h) return;
    PLAYER_SRC = h.file;
    try { localStorage.setItem('isles.hero', String(h.n)); } catch (e) { }
    var bs = document.querySelectorAll('#heroBtns button');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', +bs[i].dataset.n === h.n);
    document.getElementById('hint').textContent = '主角已换为 ' + (h.nick || ('免费包第 ' + h.n + ' 号角色'));
  }
  function buildHeroUI(preferN) {
    var box = document.getElementById('heroBtns');
    if (!box) return;
    box.innerHTML = '';
    HERO_OPTIONS.forEach(function (h) {
      var b = document.createElement('button');
      b.textContent = h.label; b.dataset.n = h.n;
      b.title = h.nick ? ('把主角换成 ' + h.nick) : ('把主角换成免费包第 ' + h.n + ' 号角色');
      b.onclick = function () { setHero(h); };
      box.appendChild(b);
    });
    var want = preferN || 0;
    if (!want) { try { want = +localStorage.getItem('isles.hero') || 0; } catch (e) { } }
    var pick = HERO_OPTIONS.filter(function (h) { return h.n === want; })[0] || HERO_OPTIONS[0];
    PLAYER_SRC = pick.file;
    var bs = document.querySelectorAll('#heroBtns button');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', +bs[i].dataset.n === pick.n);
    var nowEl = document.getElementById('heroNow');
    if (nowEl) nowEl.textContent = pick.nick || pick.label;
    if (preferN) { try { localStorage.setItem('isles.hero', String(pick.n)); } catch (e) { } }
  }

  function buildButtons() {
    var box = document.getElementById('mapBtns');
    box.innerHTML = '';
    MAPS.forEach(function (m) {
      var b = document.createElement('button');
      b.textContent = m.name; b.dataset.id = m.id;
      b.onclick = function () { if (CUR.id !== m.id) goTo(m.id); };
      box.appendChild(b);
    });
  }

  // 「地图速切」面板折叠：点标题收成一行标题条 / 再点展开。桌面 / 触屏通用。
  // 旧版只在手机端有（CSS 还在、JS 接线在世界地图 v20 重构时弄丢了），这里补回并升级：
  // 用户的选择记进 localStorage，下次进游戏保持原样；没选过时手机默认收起、桌面默认展开。
  function initToprightFold() {
    var panel = document.getElementById('topright');
    var head = document.getElementById('trHead');
    if (!panel || !head) return;
    var saved = null;
    try { saved = localStorage.getItem('isles.trFold'); } catch (e) { }
    // 默认值直接读 body.touch（initMobile 在 boot 前跑，?touch=1 强制结果也写在里面；
    // 这里若自己再查 matchMedia，?touch=1 的无头验证会漏掉强制场景）。
    var fold = saved !== null ? saved === '1' : document.body.classList.contains('touch');
    panel.classList.toggle('folded', fold);
    head.onclick = function () {
      var now = panel.classList.toggle('folded');
      try { localStorage.setItem('isles.trFold', now ? '1' : '0'); } catch (e) { }
    };
  }

  // ---------------- 世界地图总览（Tab / 图标开关，点节点传送） ----------------
  // 全量发布后地图会很多（140+），原来的「地图速切」按钮列表塞不下，改成分组节点浮层。
  // 节点缩略图用和右上角缩略图同一套配色（绿=可走 / 蓝=水 / 透明=虚空），首次打开才画，
  // 不拖首屏；地图表运行时不变，buildWorldMap 只在 boot 跑一次。
  var worldOpen = false;
  function mapRegion(m) {
    if (m.region) return m.region;
    if (m.atlas) {
      var L = { flare: 'Flare 诸境' };
      return L[m.atlas] || ('外域 · ' + m.atlas);
    }
    return '仙岛本界';
  }
  function buildWorldMap() {
    var scroll = document.getElementById('worldScroll');
    if (!scroll) return;
    scroll.innerHTML = '';
    var groups = {};
    MAPS.forEach(function (m) { var r = mapRegion(m); (groups[r] = groups[r] || []).push(m); });
    var frag = document.createDocumentFragment();
    Object.keys(groups).forEach(function (r) {
      var sec = document.createElement('div'); sec.className = 'region';
      var h = document.createElement('h3'); h.textContent = r + '（' + groups[r].length + '）'; sec.appendChild(h);
      var wrap = document.createElement('div'); wrap.className = 'nodes';
      groups[r].forEach(function (m) {
        var b = document.createElement('button'); b.className = 'node'; b.dataset.id = m.id;
        b.dataset.name = (m.name || m.id).toLowerCase();
        var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = m.name;
        var dim = document.createElement('span'); dim.className = 'dim'; dim.textContent = m.w + '×' + m.h;
        b.appendChild(nm); b.appendChild(dim);
        b.onclick = function () { if (CUR.id !== m.id) goTo(m.id); closeWorld(); };
        wrap.appendChild(b);
      });
      sec.appendChild(wrap); frag.appendChild(sec);
    });
    scroll.appendChild(frag);
    refreshWorldOn();
  }
  function refreshWorldOn() {
    var cur = CUR ? CUR.id : null;
    var bs = document.querySelectorAll('#worldmap .node');
    for (var i = 0; i < bs.length; i++) bs[i].classList.toggle('on', bs[i].dataset.id === cur);
  }
  function openPause() {
    if (player.dead || worldOpen) return;   // 死了或开地图时不叠暂停
    pauseOpen = true;
    var pp = document.getElementById('pausePanel'); if (pp) pp.hidden = false;
  }
  function closePause() {
    pauseOpen = false;
    var pp = document.getElementById('pausePanel'); if (pp) pp.hidden = true;
  }
  function openWorld() {
    var wm = document.getElementById('worldmap'); if (!wm) return;
    wm.classList.add('show'); worldOpen = true;
    var b = document.getElementById('worldBtn'); if (b) b.classList.add('on');
    var sb = document.getElementById('worldSearch');
    if (sb) { sb.value = ''; filterWorldNodes(''); }
    refreshWorldOn();
  }
  function closeWorld() {
    var wm = document.getElementById('worldmap'); if (!wm) return;
    wm.classList.remove('show'); worldOpen = false;
    var b = document.getElementById('worldBtn'); if (b) b.classList.remove('on');
  }
  // 搜索框：按地图名过滤节点；整组无匹配则隐藏分组标题
  function filterWorldNodes(q) {
    q = (q || '').trim().toLowerCase();
    var secs = document.querySelectorAll('#worldmap .region');
    secs.forEach(function (sec) {
      var nodes = sec.querySelectorAll('.node');
      var vis = 0;
      nodes.forEach(function (nd) {
        var hit = !q || (nd.dataset.name || '').indexOf(q) >= 0;
        nd.style.display = hit ? '' : 'none';
        if (hit) vis++;
      });
      sec.style.display = vis ? '' : 'none';
    });
  }
  function toggleWorld() { if (worldOpen) closeWorld(); else openWorld(); }
  (function wireWorld() {
    var btn = document.getElementById('worldBtn');
    if (btn) btn.onclick = toggleWorld;
    var bb = document.getElementById('bagBtn');
    if (bb) bb.onclick = function () { bagToggle(); };
    wireSaveUI();          // 存档按钮 + 离场落盘（挂在 IIFE 里：此时 DOM 必定已就绪）
    wireGearCard();        // 装备操作卡的按钮派发（同一时刻 DOM 必定已就绪）
    wireShop();            // 坊市：入口圆钮 + 货架购买的事件委托（同一时刻 DOM 必就绪）
    syncLeftBtns();        // 左列圆钮先按当前面板高度排一次（药格是脚本后建的，心跳会再校正）
    var x = document.getElementById('worldClose');
    if (x) x.onclick = closeWorld;
    var sb = document.getElementById('worldSearch');
    if (sb) sb.addEventListener('input', function () { filterWorldNodes(sb.value); });
    var wm = document.getElementById('worldmap');
    if (wm) wm.addEventListener('click', function (e) { if (e.target === wm) closeWorld(); });
    // ★3 暂停面板按钮
    var pp = document.getElementById('pausePanel');
    if (pp) pp.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        var act = b.dataset.act;
        if (act === 'resume') closePause();
        else if (act === 'reload') location.reload();
        else if (act === 'world') { closePause(); openWorld(); }
      });
    });
    var pbtn = document.getElementById('pauseBtn');
    if (pbtn) pbtn.addEventListener('click', openPause);
  })();

  function resize() {
    // 用画布**自己的布局盒**，不用 window.innerWidth/Height —— 这是手机端"地图一块块漏"的主因之一：
    //   CSS 是 #game{width/height:100%}，跟的是**布局视口**；而 innerHeight 在手机上会在
    //   「大视口（地址栏收起）/ 小视口（地址栏展开）」之间跳。两者不相等时画布位图被浏览器
    //   拉伸去填 CSS 盒 → 每一格瓦片都落在像素栅格之外 → 缝隙、错位一起出来。
    //   clientWidth/clientHeight 就是 CSS 盒本身，与 100% 恒等，一条都对不上。
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    syncLeftBtns();      // 窗口尺寸变 → 上面板的行可能重新换行 → 左列圆钮要重排（v53）
    // ★ 尺寸没变就**一个字都不做**：给 canvas.width 赋值会清空整块画布并重置 ctx 状态。
    //   手机上拖动时地址栏动画会连发 resize，每次清一屏 → 看到的就是"地图一块一块地漏出来"。
    //   原来没有这道早退，等于每帧把自己擦一遍。
    if (w === W && h === H) return;
    W = w; H = h;
    canvas.width = w; canvas.height = h;
    ctx.imageSmoothingEnabled = false;
    // 视口尺寸一变就立刻把相机对准主角。只改 W/H 的话，相机要等 updateCam 平滑
    // 几帧才归位 —— 拖拽窗口时会看到画面滑动，首屏（boot 时拿到的是默认窗口尺寸）
    // 更会停在一个错位状态：无头截图里表现为"同一 URL 两次截图背景不一样"。
    if (CUR) {
      camX = W / 2 - (player.mx - player.my) * HW * Z;
      camY = H / 2 - (player.mx + player.my) * HH * Z;
    }
  }
  window.addEventListener('resize', resize);
  // 手机上地址栏收放、软键盘弹出都只改**可视视口**，不触发 window.resize ——
  // 不挂这条的话画布尺寸会一直停在旧值上，直到用户转动屏幕。
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();

  var last = 0;
  var bagDbgTick = 0;   // 状态行强刷计数：每 30 帧（≈0.5s）重写一次
  function loop(ts) {
    if (!last) last = ts;
    var dt = Math.min(0.05, (ts - last) / 1000);
    last = ts;
    if (!held && !pauseOpen) update(dt);
    if (ready) updateHUD();
    render();
    // ★2 震屏：零侵入方案 —— 用 CSS transform 抖整个 canvas，不碰 render 内部的 ctx 配平
    if (screenShake > 0) {
      var s2 = screenShake * 9;
      canvas.style.transform = 'translate(' + ((Math.random() * 2 - 1) * s2).toFixed(1) + 'px,' + ((Math.random() * 2 - 1) * s2).toFixed(1) + 'px)';
      screenShake = Math.max(0, screenShake - dt * 1.6);
    } else if (canvas.style.transform) { canvas.style.transform = ''; }
    /* ★ 背包兜底轮询（v42）：事件驱动的 dirty 链只要**任何一环**死过
     * （dirty 丢标 / bagBuilt 翻转 / 格子失联 / 赋值中断），格子就永远停在过去。
     * 这里每 0.5s 无条件把整条链拉回正确状态 —— 类似心跳包，不依赖任何事件。
     * 5 个格子的 DOM 同步成本可忽略。 */
    if (ready && (++bagDbgTick % 30 === 0)) {
      if (!bagBuilt || __bagOrphan > 0) buildBagUI();   // 构建标志没了/格子失联 → 先重建
      if (!quickBuilt) buildQuickUI();                  // 快捷药栏（左上常驻）同样兜底重建
      bagDirty = true;                                  // 强制走一次完整刷新
      renderBag();
      renderQuick();                                    // 心跳：不依赖任何事件也保证药栏是对的
      renderBuffs();                                    // v58：符箓倒计时（有就显示、没有就收起来）
      syncShopBtn();                                    // v58：换图后坊市入口的可用态（城镇才有）
      /* 左列圆钮避让也挂在这条心跳上（v53）：面板高度会被各种事件改（目标血条出现、
       * 提示文案换行、字体加载完导致行高变化…），逐个入口去补迟早漏一个。
       * 值没变时 syncLeftBtns 直接 return，所以这只是每 0.5s 一次 offsetHeight。 */
      syncLeftBtns();
    }
    if (window.__dbg && CUR) {
      window.__dbg.textContent = JSON.stringify({
        map: CUR.id, fade: +fadeA.toFixed(2), held: held,
        mx: +player.mx.toFixed(2), my: +player.my.toFixed(2),
        face: player.face, walk: +player.walk.toFixed(2),
        zoom: +Z.toFixed(3), zoomT: +Zt.toFixed(3),
        actors: _draw.actor, npcs: _draw.npc, foes: foes.length
      });
    }
    requestAnimationFrame(loop);
  }

  // ---------------- 调试接口（供 headless 验证） ----------------
  window.ISLES = {
    get ready() { return ready; },
    get map() { return CUR ? CUR.id : null; },
    list: function () { return MAPS.map(function (m) { return { id: m.id, name: m.name, w: m.w, h: m.h, objects: m.objects.length, portals: m.portals.map(function (p) { return { x: p.x, y: p.y, to: p.to }; }) }; }); },
    /** 世界地图总览状态（自测用）：节点数 / 分组数 / 当前节点 */
    world: function () {
      var g = {}; MAPS.forEach(function (m) { g[mapRegion(m)] = 1; });
      return { open: worldOpen, nodes: MAPS.length, regions: Object.keys(g).length, onId: CUR ? CUR.id : null };
    },
    openWorld: function () { openWorld(); return worldOpen; },
    closeWorld: function () { closeWorld(); return worldOpen; },
    state: function () { return { map: CUR && CUR.id, mx: +player.mx.toFixed(2), my: +player.my.toFixed(2), face: player.face, fade: +fadeA.toFixed(2), zoom: +Z.toFixed(3) }; },
    /** 右上角缩略图状态（自测/排查用）：画布尺寸、每格像素、主角在画布上的落点 */
    minimap: function () {
      var px = MM.cv ? (player.mx + 0.5) * MM.s : -1;
      var py = MM.cv ? (player.my + 0.5) * MM.s : -1;
      return { has: !!MM.cv, folded: MM.folded, size: MM.cv ? [MM.cv.width, MM.cv.height] : null,
        cellPx: +MM.s.toFixed(3), px: +px.toFixed(1), py: +py.toFixed(1) };
    },
    mmFold: function (f) { mmFold(f); return MM.folded; },
    /** 等价于鼠标点击第 (x,y) 格：走的是 onClick 同一条设置目标格的路径 */
    clickCell: function (x, y) { return setTargetCell(x, y); },
    /** 等价于「鼠标点了地图上的 (x,y)」（map 坐标，不是屏幕坐标）：与 onClick 共用 tapMap，
     *  所以「点到妖兽 → 锁定 + 当场转身 → 自动追击平A」这条真实路径能被自测完整跑到。
     *  返回 true = 点中的是妖兽。 */
    tapAt: function (x, y) { return tapMap(x, y); },
    /** 朝向与锁定的只读快照（自测用）：
     *  face = map 轴四向（命中扇形用它）／sideFace = 屏幕左·右（画攻击动作用它） */
    stance: function () {
      var tf = player.targetFoe;
      return { face: player.face, sideFace: player.sideFace,
        act: player.act, actHold: +player.actHold.toFixed(2),
        target: (tf && tf.alive) ? { x: +tf.x.toFixed(2), y: +tf.y.toFixed(2), hp: tf.hp } : null };
    },
    // 调试接口也算"人主动调"（自测里它就是模拟用户拉滑块）
    setZoom: function (z) { setZoom(z, W / 2, H / 2, true); return Zt; },
    heroes: function () { return HERO_OPTIONS.map(function (h) { return { n: h.n, src: h.file }; }); },
    setHero: function (n) { setHero(HERO_OPTIONS.filter(function (h) { return h.n === n; })[0]); return PLAYER_SRC; },
    goto: function (id, x, y) { return goTo(id, x, y, false); },
    bfsNext: bfsNext,
    chaseDbg: function () { return chaseDbg; },
    /** 把玩家放到当前地图第 i 个传送门上，下一次 update 即触发切换 */
    stepOnPortal: function (i) { var pt = CUR.portals[i || 0]; player.mx = pt.x; player.my = pt.y; player.tx = pt.x; player.ty = pt.y; player.path = null; portalLock = 0; },
    tick: function (dt) { update(dt || 0.016); render(); },
    projCount: function () { return projectiles.length; },   // 自测：当前在场弹道数
    attackNearest: function () { attackNearest(); },
    powerAttack: function () { powerAttack(); },
    castSkill: function (i) { return castSkill(i); },
    skillCd: function () { return player.skillCd.slice(); },
    playAct: function (a) { playAct(a); return player.act; },
    act: function () {
      return { act: player.act, actT: +player.actT.toFixed(2), actHold: +player.actHold.toFixed(2),
        dead: player.dead, atkBCd: +player.atkBCd.toFixed(2), face: player.face };
    },
    /** 战斗手感状态：连击层数/窗口、暴击余晖、攻速冷却，调试与自测用 */
    combat: function () {
      return { combo: player.combo, comboT: +player.comboT.toFixed(2), critT: +player.critT.toFixed(2),
        attackCd: +player.attackCd.toFixed(3), actHold: +player.actHold.toFixed(3),
        atkDur: ACT_DUR.atkA, atkCd: ATK_A_CD, comboMax: COMBO_MAX };
    },
    foeInfo: function () {
      return foes.map(function (f) {
        return { name: f.name, key: f.key, x: +f.x.toFixed(1), y: +f.y.toFixed(1), hp: f.hp,
          anim: f.anim, animT: +f.animT.toFixed(2), dying: +f.dying.toFixed(2),
          side: !!f.def_.side, fh: f.def_.fh, dummy: !!f.def_.dummy, alive: f.alive };
      });
    },
    /** 逐 (怪 × 动作 × 帧) 解析帧并算出生效绘制尺寸 —— 供 headless 校验新怪物图集 */
    beastDebug: function () {
      var out = [];
      var anim = ATLAS.foes.anim || {};
      Object.keys(anim).forEach(function (k) {
        var a = anim[k], fh = (FOE_DEFS[k] || {}).fh || 100;
        var row = { key: k, cn: a.cn, ax: a.ax, box: a.box, fh: fh,
          srcFace: a.srcFace || 'right', aggro: (FOE_DEFS[k] || {}).aggro || 0, acts: {}, draw: {} };
        Object.keys(a.acts).forEach(function (act) {
          var arr = a.acts[act];
          row.acts[act] = arr.length;
          var r = arr[0];
          row.draw[act] = { src: [r[2], r[3]], out: [Math.round(r[2] * fh / r[3]), fh] };
        });
        out.push(row);
      });
      return out;
    },
    /** 把某只怪强行切到指定动作，用于截图核对每个动作的姿态 */
    setFoeAnim: function (i, act) {
      var f = foes[i]; if (!f) return null;
      f.anim = act; f.animT = 0; f.animHold = 0;
      f.animHold = (BEAST_DUR[act] || 0) > 0 ? BEAST_DUR[act] : 0;
      f.animT = (BEAST_DUR[act] || 0) * 0.45;    // 停在动作中段，看得出挥击/倒地
      return f.key + ':' + act;
    },
    /** 逐 (怪 × 状态 × 朝向) 解析帧并算出生效绘制尺寸，供 headless 校验图集与归一化 */
    foeDebug: function () {
      var out = [];
      ['assassin', 'golem', 'wraith'].forEach(function (base) {
        var fh = FOE_DEFS[base].fh;
        ['idle', 'attack'].forEach(function (st) {
          ['down', 'right', 'left', 'up'].forEach(function (d) {
            var fk = foeFrameKey({ key: base, face: d, atkAnim: st === 'attack' ? 1 : 0 });
            var pz = foePiece(fk);
            out.push({ base: base, st: st, dir: d, frame: fk,
              w: pz ? pz.w : -1, h: pz ? pz.h : -1,
              drawW: pz ? Math.round(pz.w * (fh / pz.h)) : -1, drawH: fh });
          });
        });
      });
      return out;
    },
    foeCount: function () { return (foes || []).filter(function (f) { return f.alive; }).length; },
    _p: player
  };

  // 手机端适配：① 精简底部操作提示（WASD 长文本没用且挡画面，改成短提示、6 秒自动收起、点按恢复）
  //            ② 触屏竖屏盖一层「建议横屏」浮层，转横屏自动消失，也可点「竖屏也能玩」直接开玩
  // 这两件事只在触屏设备做，桌面端完全不动（避免误判触屏把键盘玩家的界面改了）。
  (function initMobile() {
    // 判定「手机/平板」只看主输入设备是不是手指（pointer: coarse）。
    // 千万别用 'ontouchstart' in window 或 maxTouchPoints 单独兜底：Windows 触屏本上这两个也是真，
    // 会把桌面端玩家的界面一起改掉（动作试演条消失、冒出横屏浮层）。没 matchMedia 才退回老办法。
    var mq = window.matchMedia;
    var coarse = !!(mq && mq('(pointer: coarse)').matches);
    var noHover = !!(mq && mq('(hover: none)').matches);
    var isTouch = mq ? (coarse && noHover) : (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
    // ?touch=1 / ?touch=0 强制开关：桌面 Chrome 的 pointer:coarse 永远为假，
    // 手机端这套 UI 就没法无头验证。给了开关才能截图核对「提示不挡画面 / 竖屏盖浮层」。
    var tq = new URLSearchParams(location.search).get('touch');
    if (tq === '1') isTouch = true; else if (tq === '0') isTouch = false;
    if (window.ISLES) window.ISLES.mobile = { touch: isTouch, coarse: coarse, noHover: noHover, forced: tq || '' };
    if (!isTouch) return;
    document.body.classList.add('touch');

    // —— 浮动摇杆（左半屏触点出现，推动即走、推满奔跑）——
    // 借 realtime（凡人修仙录）的成熟设计：不固定位置，按在哪摇杆出现在哪。
    // 左半屏归摇杆、右半屏保留「点地面移动」；pointerdown preventDefault 掉
    // 兼容鼠标事件，避免起杆那一下又被当成点击寻路。
    var joyEl = document.getElementById('joystick');
    var joyKnob = document.getElementById('joy-knob');
    var JOY_R = 48;
    var joy = { active: false, id: null };
    function joyStart(e) {
      // 页面被放大时不能拿 window.innerWidth 当尺子：innerWidth 是**布局视口**宽，
      // 而触点的 clientX 是**可视视口**坐标 —— 两者一混，右半屏会被误判成左半屏，
      // 想点地走路却弹出摇杆。统一换算到画布本地坐标再比中线。
      var z = ZF();
      if (z.ptX(e.clientX) > canvas.clientWidth / 2) return;   // 右半屏留给点地移动 / 出招按钮
      joy.active = true; joy.id = e.pointerId;
      var size = joyEl.offsetWidth || 120;
      // #joystick 是 position:fixed、**不在**被补偿的 #game 里：它用布局坐标定位，
      // 所以落点也要过 ptX/ptY（未缩放时是恒等，行为不变）。
      joyEl.style.left = (z.ptX(e.clientX) - size / 2) + 'px';
      joyEl.style.top = (z.ptY(e.clientY) - size / 2) + 'px';
      joyEl.style.display = 'block';
      joyKnob.style.transform = 'translate(0px,0px)';
      joyMove(e); e.preventDefault();
    }
    function joyMove(e) {
      if (!joy.active || e.pointerId !== joy.id) return;
      var rect = joyEl.getBoundingClientRect(), z = ZF();
      // ⚠ rect 与 clientX 必须过同一把尺子再相减，混用会让放大状态下"摇杆追不上手指"
      var dx = z.ptX(e.clientX) - z.ptX(rect.left + rect.width / 2);
      var dy = z.ptY(e.clientY) - z.ptY(rect.top + rect.height / 2);
      var dd = Math.hypot(dx, dy);
      if (dd > JOY_R) { dx = dx / dd * JOY_R; dy = dy / dd * JOY_R; }
      joyVec.x = dx / JOY_R; joyVec.y = dy / JOY_R;
      joyVec.run = dd >= JOY_R * 0.95;                 // 推满边缘 = 奔跑
      joyKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      e.preventDefault();
    }
    function joyEnd(e) {
      if (e.pointerId !== joy.id) return;
      joy.active = false; joy.id = null;
      joyVec.x = 0; joyVec.y = 0; joyVec.run = false;
      joyKnob.style.transform = 'translate(0px,0px)';
      joyEl.style.display = 'none';
    }
    canvas.addEventListener('pointerdown', joyStart);
    window.addEventListener('pointermove', joyMove, { passive: false });
    window.addEventListener('pointerup', joyEnd);
    window.addEventListener('pointercancel', joyEnd);

    // —— 操作提示精简 + 自动收起 ——
    // 原文案是给键盘玩家的（WASD / J/K / Shift / 1~6），手机上既没用又长到压住半屏。
    // 换成真·触屏操作：游戏没有"滑动移动"，移动是点地面寻路，别写成滑动。
    var bottom = document.getElementById('bottom');
    if (bottom) {
      bottom.innerHTML = '左半屏按住摇杆移动（推满奔跑）· 右下角 <b>技能盘</b>：普攻 / 重击 / <b>剑 · 雷 · 域</b> 三招 · ' +
        '右半屏点地也能走 · <span class="hl">点这里收起</span>';
      var hideTimer = null;
      function schedule() { clearTimeout(hideTimer); hideTimer = setTimeout(function () { bottom.classList.add('faded'); }, 6000); }
      bottom.addEventListener('click', function () {
        bottom.classList.toggle('faded');
        if (!bottom.classList.contains('faded')) schedule(); else clearTimeout(hideTimer);
      });
      schedule();
    }

    // （地图速切面板的折叠逻辑已上移到 initMobile 顶部，桌面 / 触屏共用，见上方）

    // —— 横屏提醒（竖屏才显示）——
    var hint = document.getElementById('rotate-hint');
    if (!hint) {
      hint = document.createElement('div'); hint.id = 'rotate-hint';
      hint.innerHTML = '<div class="icon">📱</div><h2>建议横屏游玩</h2>' +
        '<p>横屏视野更开阔，出招更顺手。<br>竖屏也能直接玩。</p>' +
        '<button id="rotate-ok" class="ghost-btn">好，竖屏也能玩</button>';
      document.body.appendChild(hint);
    }
    function syncOrient() {
      if (hint.dataset.dismissed) { document.body.classList.remove('show-rotate'); return; }
      var portrait = window.innerHeight > window.innerWidth;
      document.body.classList.toggle('show-rotate', portrait);
    }
    var okBtn = document.getElementById('rotate-ok');
    if (okBtn) okBtn.addEventListener('click', function () {
      hint.dataset.dismissed = '1'; document.body.classList.remove('show-rotate');
    });
    window.addEventListener('resize', syncOrient);
    window.addEventListener('orientationchange', function () { setTimeout(syncOrient, 260); });
    syncOrient();

    // —— ?autotest=mobileui：手机端 UI 的程序化验收 ——
    // 这套界面在桌面 Chrome 里根本跑不到（pointer:coarse 恒假），而它坏起来又全是
    // 「点了没反应」这种肉眼在电脑上永远发现不了的毛病。三条关键断言：
    //   ① .hud 带着 pointer-events:none —— 用 elementFromPoint 验证点击真的落在元素上，
    //      而不是穿透到画布（这个坑真踩过：提示条与折叠标题都收不到点击）；
    //   ② 点提示条能收起 / 再点能展开；
    //   ③ 竖屏浮层出现、点按钮后消失（横屏反之）。
    //
    // ⚠ 时机：initMobile 在 boot() 之前跑，那时加载遮罩（z-index 99）还盖在最上层，
    // elementFromPoint 一律返回遮罩 → 三条命中断言全假。所以这里只把函数挂出去，
    // 由 boot() 在隐藏遮罩之后调用。断言里也顺手验一下遮罩确实已经隐藏。
    window.__mobileAudit = function () {
      var r2 = { coarse: coarse, noHover: noHover, touch: isTouch, bodyClass: document.body.className };
      var ld = document.getElementById('loader');
      r2.loaderHidden = !!ld && getComputedStyle(ld).display === 'none';
      function mid(el) {
        var b = el.getBoundingClientRect();
        return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), w: Math.round(b.width), h: Math.round(b.height) };
      }
      function hits(el) {
        var m = mid(el), t = document.elementFromPoint(m.x, m.y);
        return !!t && (t === el || el.contains(t));
      }
      var overlayOn = document.body.classList.contains('show-rotate');
      if (bottom) {
        // 先把它强制显示出来再测：自动收起是 6 秒定时器，虚拟时钟下自测很可能在它淡出之后
        // 才跑，那时 pointer-events 已经是 none，命中测试必然为假 —— 那是时序，不是 bug。
        r2.bottomWasFaded = bottom.classList.contains('faded');
        bottom.classList.remove('faded');
        r2.bottomBox = mid(bottom);
        r2.bottomPE = getComputedStyle(bottom).pointerEvents;
        // 竖屏时横屏浮层盖在提示条之上，点不到是设计如此
        r2.bottomHit = overlayOn ? 'skipped-overlay' : hits(bottom);
        bottom.click(); r2.bottomDismissed = bottom.classList.contains('faded');
        bottom.click(); r2.bottomRestored = !bottom.classList.contains('faded');
      }
      // ⚠ 这里按 id 现取，**不要**依赖外层变量：initMobile 作用域里本来就没有 tr/trHead
      //   （折叠逻辑已上移成桌面/触屏共用的独立函数），一旦写成裸变量，严格模式下
      //   直接 ReferenceError → 整条 boot 的 then 链断掉 → 连 #dbg/#probe 都建不出来，
      //   表现为「手机端两条用例 dbg=- 永远失败」，还完全看不到报错（2026-09-16 真踩过）。
      var tr = document.getElementById('topright');
      var trHead = document.getElementById('trHead');
      if (tr && trHead) {
        r2.toprightBox = mid(tr);
        r2.foldedInit = tr.classList.contains('folded');
        if (r2.foldedInit) {
          var zb = document.getElementById('zoombar');
          r2.zoombarHidden = !!zb && getComputedStyle(zb).display === 'none';
        }
        // 竖屏时横屏浮层盖在最上层，标题本来就点不到 —— 跳过（浮层自己的命中测试见下）
        r2.headHit = overlayOn ? 'skipped-overlay' : hits(trHead);
        trHead.click(); r2.foldedAfterClick = tr.classList.contains('folded');
        var hb = document.getElementById('herobar');
        r2.herobarShown = !!hb && getComputedStyle(hb).display !== 'none';
        trHead.click(); r2.foldedBack = tr.classList.contains('folded');
      }
      if (hint) {
        r2.rotateShown = document.body.classList.contains('show-rotate');
        r2.hintPE = getComputedStyle(hint).pointerEvents;
        if (r2.rotateShown) r2.hintHit = hits(hint);
        var okb = document.getElementById('rotate-ok');
        if (okb) { r2.okHit = hits(okb); okb.click(); r2.rotateDismissed = !document.body.classList.contains('show-rotate'); }
      }
      var pbt = document.getElementById('probe');
      if (!pbt) { pbt = document.createElement('div'); pbt.id = 'probe'; pbt.style.display = 'none'; document.body.appendChild(pbt); }
      pbt.textContent = JSON.stringify(r2);
    };
    if (!tq || new URLSearchParams(location.search).get('autotest') !== 'mobileui') delete window.__mobileAudit;
  })();

  /* ══ v41 顶层保险丝（三道）══
   * 背景：2026-09-17 用户截图 —— 状态行 v?、数据全零，而格子图标正常。
   * v39/v40 的版本号设置在 boot 的 then 链收尾段，且：
   *  · boot() 返回的 Promise 没有 .catch —— 链上任何一步抛错 = 静默死亡；
   *  · onerror / unhandledrejection 只在 ?autotest= 时才装 —— 正常玩家零留痕；
   *  · 状态行走 bagDirty 快照 —— boot 早期写入的内容可能永远停在屏上。
   * 用户环境一旦出这种错，我这边收到的只有"没变化"三个字。
   * 三道保险全部放在**脚本顶层**，与 boot 链的存亡彻底解耦。 */
  function __showErr(msg) {
    try {
      window.__lastErr = String(msg).slice(0, 110);
      var t = document.getElementById('errTag');
      if (!t) {
        t = document.createElement('div');
        t.id = 'errTag';
        t.style.cssText = 'position:fixed;left:6px;bottom:4px;z-index:37;pointer-events:none;max-width:70vw;' +
          'font:600 10px/1.4 ui-monospace,Consolas,monospace;color:#ff9d9d;' +
          'text-shadow:0 1px 2px rgba(0,0,0,.7)';
        document.body.appendChild(t);
      }
      t.textContent = '⚠ ' + window.__lastErr;
    } catch (e) { /* 留痕失败别再抛 */ }
  }
  window.__showErr = __showErr;
  window.addEventListener('error', function (ev) {
    __showErr((ev.message || '脚本错误') + ' @' + (ev.lineno || '?'));
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    __showErr('promise: ' + String((r && r.message) || r).slice(0, 90));
  });

  /* 版本号顶层解析：同步执行时 document.currentScript 就是本文件，?v=NN 直接可取。
   * v39/v40 把这段放 boot 链里，链断即失（用户截图 v? 的来源）；放顶层后永远成立。 */
  (function () {
    var src = '';
    try {
      if (document.currentScript && document.currentScript.src) src = document.currentScript.src;
      else {
        var ss = document.getElementsByTagName('script');
        for (var vi = ss.length - 1; vi >= 0; vi--) {
          if (/game\.js/.test(ss[vi].src || '')) { src = ss[vi].src; break; }
        }
      }
    } catch (e) {}
    var mm = /[?&]v=([0-9]+)/.exec(src);
    var VTAG = mm ? mm[1] : '?';
    window.__VTAG = VTAG;
    try { document.title = '仙岛寻踪 v' + VTAG; } catch (e) {}
    try {
      var vb = document.createElement('div');
      vb.id = 'verTag';
      vb.textContent = 'v' + VTAG;
      vb.style.cssText = 'position:fixed;right:6px;bottom:4px;z-index:37;pointer-events:none;' +
        'font:600 10px/1.4 ui-monospace,Consolas,monospace;letter-spacing:.5px;' +
        'color:rgba(240,227,194,.42);text-shadow:0 1px 2px rgba(0,0,0,.6)';
      document.body.appendChild(vb);
    } catch (e) { /* 角标失败无所谓，标题还有一份 */ }
  })();

  try {
    var __bootP = boot();
    if (__bootP && __bootP.catch) __bootP.catch(function (e) {
      __showErr('boot: ' + String((e && e.message) || e).slice(0, 90));
    });
  } catch (e) {
    __showErr('boot 同步: ' + String((e && e.message) || e).slice(0, 90));
  }
})();
