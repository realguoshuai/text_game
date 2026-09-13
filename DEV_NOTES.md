# 开发笔记：踩坑记录 & 后续计划

> 更新：2026-09-13。线上入口 https://realguoshuai.github.io/text_game/
> 三个游戏：`ImmortalGame/`（等距坊市）、`legacy/`（文字版）、`realtime/`（实时割草版）

---

## 一、2026-09-13 踩坑记录

### 1. 地图缩尺寸 → 坐标越界 → 引擎启动即崩（当日最大坑）
- 把坊市地图 36→26 时，灯笼串 `(18,26)`、石牌坊 `(34,18)`、NPC 杂役弟子 `my:30.5` 忘了跟移，`map[p.y][p.x]` 直接 TypeError，**任何浏览器都黑屏**。
- **教训**：改 `MAP_W/MAP_H` 必须全量核对 props / NPC / 建筑 / lights 坐标。
- **已加固**：`props.forEach` 加了越界守卫（越界装饰丢弃不崩溃）；建议 NPC、建筑以后也照此办理。

### 2. 手机端 GitHub Pages 网络不稳 → JS 请求悬住 → 黑屏难定位
- 症状：HTML 界面全在（HUD 是静态的），但小地图空白、画面全黑；既无报错也无加载失败——JS 请求长时间 pending。
- **解法（已落地）**：
  1. 坊市页 CSS+JS **全部内联**进 `ImmortalGame/index.html`（45KB 单文件，只发一次请求）；图片加载失败有占位回退，不影响玩。
  2. 页面内置**启动自检浮层**：`window error`（捕获 SCRIPT/LINK 加载失败）+ 3.5 秒后检查引擎启动标记 `window.__ISO__`，失败原因直接红条显示在屏幕上，手机截图即可远程排障。
- **教训**：给手机玩家做的页面，尽量单文件化；任何 JS 游戏页都应带自检浮层。

### 3. 本机排障工具链的坑（Windows + WorkBuddy 无头环境）
- WebFetch 有 ~15 分钟缓存：核对线上内容必须加随机参数（`?cb=123`）。
- PowerShell 会吞 stdout：结果一律**写临时文件再用 Read 读**。
- `Test-Path` / `Get-ChildItem` 偶发误报（说目录不存在/列表为空）：以 `git status` 和 Read 工具为准。
- chrome headless-shell `--dump-dom` 输出 0 字节、Bash shim 损坏：本机无头验证基本不可用 → 靠「页面自检浮层」远程排障更靠谱。
- git 中文提交信息经 PowerShell 传递会乱码 → **提交信息一律用英文**。

### 4. 文件莫名消失事件
- 12:30–12:38 之间 `ImmortalGame/`（等距游戏目录）的 assets、index.html、iso.js、css、tools 约二十个文件从磁盘消失（远程 HEAD 完好）。原因未明（疑似清理类工具/同步盘/杀软）。
- **处置**：`git restore -- ImmortalGame` 一键全量恢复。
- **守则**：见到 `git status` 里成片 ` D`，先 restore 再查原因；每天收工前确认 `git status` 干净、已推送。

### 5. 编辑工具的坑
- MultiEdit 对「一行里有多个对象」的行做部分行替换会**声称成功但没落盘**（当日灯笼串那一行）。
- **守则**：替换用**整行** old_string；改完 `node --check` + grep 复验关键字符串。

### 6. 仓库重组顶掉了用户自己部署的游戏
- 实时版昨晚部署在仓库根，重组入口页时被 force 顶掉，幸有本地备份 `_backup_shishiban_20260912/`（且备份缺 style.css/assets，靠等距目录里的同名文件凑齐）。
- **守则**：动仓库结构前，先 `git ls-remote` / 看远程树确认有没有**别人（用户本人）署名的更新**；重组前打本地全量备份。

---

## 二、后续开发计划

### P0（近期必做）
1. **实时版单文件化**：照坊市页的做法把 `realtime/style.css` + `game.js` 内联进 `realtime/index.html`（game.js 146KB，内联后约 200KB 单文件，可接受）；图集 PNG 保留外链 + 已有占位回退。复用 `ImmortalGame/tools/build_index_inline.py` 的标记注释方案。
2. **实时版加启动自检浮层**：同款 bootErr 脚本 + 引擎启动标记（如 `window.__RT__`）。
3. **坊市页资源版本化收尾**：图片 URL 也可加 `?v=` 参数，防素材更新后手机端吃旧缓存。

### P1（素材与玩法）
4. **素材落地**：按 `ASSETS_Meowa_Prompts.md` 用 Meowa/ImageGen 生成 16-bit 暗金修仙素材（角色/妖兽/瓦片/道具/UI），**同名覆盖 `assets/` 下 PNG 即接入，零代码改动**；换完把图片 URL 加版本参数。
5. **坊市玩法补全**：
   - 书生站立帧换成标准站立姿势（现在用行走第 0 帧）；
   - 接入灯笼 4 帧动画（素材已有）；
   - 室内场景（丹房/器坊进屋）；
   - 任务系统接通（采集灵药 → 完成态、拜师线推进）。
6. **实时版内容扩展**：更多构筑词条与妖王种类、洞府永久成长数值平衡、最高纪录（localStorage）展示页。

### P2（工程化，防再踩坑）
7. **一键发布脚本** `tools/release.ps1`：`node --check 全部 JS` → `build_index_inline.py` → 显式 `git add <清单>` → 英文 commit → push → `git ls-remote` 校验。禁 `git add .`。
8. **改动 checklist**（每次发版过一遍）：
   - 改了地图尺寸/坐标？→ grep 全部 props/NPC/建筑坐标核对越界；
   - 改了源文件？→ 重跑 build_index_inline.py 同步单文件；
   - 改了素材？→ 图片 URL 加 `?v=`；
   - push 后 → 带 `?cb=` 参数 WebFetch raw 校验线上生效。
9. **仓库守则**：`db.sqlite3`、`.workbuddy/`、持仓/私人数据永不入库；重组结构前先备份 + 查远程。

---

## 三、快速恢复命令（应急手册）

```bash
# 游戏文件莫名消失 → 从 HEAD 一键恢复
git restore -- ImmortalGame realtime

# 改完引擎源文件 → 同步单文件版坊市页
python ImmortalGame/tools/build_index_inline.py

# 语法校验
node --check ImmortalGame/js/iso.js

# 线上是否生效（绕缓存）
# 浏览器打开 https://raw.githubusercontent.com/realguoshuai/text_game/main/<路径>?cb=<随机数>
```
