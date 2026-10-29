'use strict';
/* =========================================================
 * test/smoke_sect_gate_1029.js —— 门派按钮「在苍南谷也算回了宗门山头」
 *
 * 锁死本轮修复的约定：
 *   - 世界地图里存在 苍南山·苍南谷 节点（id = tainan_gu），它不属于本门 reqSect 山门，
 *     但同处苍南山、是升仙大会/拜山入口，落在此地应视同「回了宗门山头」，门派按钮可点开。
 *   - 门派按钮解锁条件 = atHome(洞府) || atSect(山门节点) || location==='tainan_gu'。
 *   - 反向对照：落在与宗门无关之地（如 青牛镇 qingniu_zhen）仍应锁死（badge-away）。
 *
 * 运行： node test/smoke_sect_gate_1029.js
 * ========================================================= */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const BASE = path.resolve(__dirname, '..');

let pass = 0, fail = 0; const fails = [];
function ok(name, cond, extra) {
    if (cond) { pass++; console.log('  ✓ ' + name); }
    else { fail++; fails.push(name); console.log('  ✗ FAIL: ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}
function section(t) { console.log('\n' + t); }

/* ---------- 载入世界地图，取 GAME.DATA.MAP ---------- */
const win = { GAME: { DATA: {} } };
const sandbox = { window: win, GAME: win.GAME, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(BASE, 'data/worldmap.js'), 'utf8'), sandbox);
const MAP = win.GAME.DATA.MAP || sandbox.GAME.DATA.MAP;

function gateUnlocked(p) {
    const atHome = p.location === MAP.start;
    let sectNode = null;
    (MAP.nodes || []).forEach(function (n) { if (n.reqSect && n.reqSect === p.sectId) sectNode = n; });
    const atSect = !!sectNode && p.location === sectNode.id;
    // 与 UI.updateUI 门派按钮门禁一致：lock || !atSectRange || !p.sectId 都锁死
    const atSectRange = atHome || atSect || p.location === 'tainan_gu';
    return !!p.sectId && atSectRange;
}

section('① 数据完整性：苍南谷节点存在且被正确识别');
const tainan = (MAP.nodes || []).find(function (n) { return n.id === 'tainan_gu'; });
ok('tainan_gu 节点存在', !!tainan);
ok('tainan_gu 名为「苍南山·苍南谷」', tainan && tainan.name === '苍南山·苍南谷', tainan && tainan.name);
const sectHQ = (MAP.nodes || []).find(function (n) { return n.reqSect; });
ok('存在带 reqSect 的宗门山门节点', !!sectHQ, sectHQ && sectHQ.id);
ok('苍南谷本身不是宗门山门节点（靠 tainan_gu 特判解锁，而非 reqSect 匹配）',
    tainan && !(tainan.reqSect));

section('② 门派按钮解锁条件：苍南谷视同回宗门山头');
const sectId = sectHQ ? sectHQ.reqSect : 'huangfenggu';
ok('身处苍南谷 → 门派按钮解锁（不再挂「需回驻地」）',
    gateUnlocked({ location: 'tainan_gu', sectId: sectId }) === true);
ok('身处洞府（MAP.start）→ 解锁',
    gateUnlocked({ location: MAP.start, sectId: sectId }) === true);
ok('身处宗门山门节点 → 解锁',
    gateUnlocked({ location: sectHQ.id, sectId: sectId }) === true);

section('③ 反向对照：与宗门无关之地仍锁死');
ok('身处青牛镇 → 锁死（badge-away）',
    gateUnlocked({ location: 'qingniu_zhen', sectId: sectId }) === false);
ok('未拜入门派（sectId 空）→ 锁死',
    gateUnlocked({ location: 'tainan_gu', sectId: null }) === false);

console.log('\n================ 结果：' + pass + ' 通过 / ' + fail + ' 失败 ================');
if (fail) { console.log('失败项：\n - ' + fails.join('\n - ')); process.exit(1); }
