# 生成本轮交付拼图：手机端三态实拍 + 领地（leash）范围示意与实测数据。
# 一次性脚本，产物 _deliver_mobile_leash.png 也只是给人看的，不入库。
from PIL import Image, ImageDraw, ImageFont
import math

R = 'C:/Users/Lenovo/WorkBuddy/text_game/ImmortalGame/test/'
F = lambda s, b=False: ImageFont.truetype('C:/Windows/Fonts/' + ('msyhbd.ttc' if b else 'msyh.ttc'), s)

W, H = 1500, 1120
BG = (247, 249, 252)
cv = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(cv)

d.text((42, 26), '仙岛寻踪 · 领地范围 + 手机端适配', font=F(30, True), fill=(28, 32, 44))
d.text((42, 70), '怪物有巢穴与领地：越界即放弃追击、走回巢内待命；手机端精简提示、面板可折、竖屏给横屏提醒（桌面端不受影响）',
       font=F(15), fill=(96, 104, 124))
d.line([(42, 106), (W - 42, 106)], fill=(210, 218, 232), width=2)

# ---------------- 上排放三张实拍 ----------------
SHOTS = [
    ('_m_hint.png', '手机横屏 · 游玩态', '提示条精简成一行、6 秒自动收起；地图面板折叠成一行标题'),
    ('_m_port.png', '手机竖屏 · 横屏提醒', '竖屏盖一层引导浮层，转横屏自动消失，可一键跳过'),
    ('_m_desk.png', '桌面端 · 未受影响', '键盘提示、动作试演条、地图面板全部保持原样'),
]
CELL_W, CELL_H, GAP = 460, 330, 30
x0 = 42
for i, (f, title, cap) in enumerate(SHOTS):
    cx = x0 + i * (CELL_W + GAP)
    d.rectangle([cx, 122, cx + CELL_W, 134], fill=(214, 226, 246))
    d.text((cx, 142), title, font=F(19, True), fill=(24, 30, 44))
    im = Image.open(R + f).convert('RGB')
    sc = min((CELL_W - 8) / im.width, (CELL_H - 8) / im.height)
    im2 = im.resize((int(im.width * sc), int(im.height * sc)), Image.LANCZOS)
    bx = cx + (CELL_W - im2.width) // 2
    by = 174 + (CELL_H - im2.height) // 2
    d.rectangle([bx - 3, by - 3, bx + im2.width + 3, by + im2.height + 3], fill=(255, 255, 255), outline=(222, 230, 242), width=2)
    cv.paste(im2, (bx, by))
    d.text((cx, 176 + CELL_H + 12), cap, font=F(13.5), fill=(80, 88, 108))

# ---------------- 下排：领地范围示意 + 实测数据 ----------------
TOP = 122 + CELL_H + 124
d.line([(42, TOP - 18), (W - 42, TOP - 18)], fill=(210, 218, 232), width=2)
d.text((42, TOP), '领地（leash）怎么工作', font=F(19, True), fill=(24, 30, 44))

# 示意图面板
PX, PY, PW, PH = 42, TOP + 34, 620, 330
d.rectangle([PX, PY, PX + PW, PY + PH], fill=(255, 255, 255), outline=(222, 230, 242), width=2)
ox, oy = PX + PW // 2, PY + PH // 2
S = 10.4

def dashed_circle(dr, cx, cy, r, color, dash=7, gap=6, width=2):
    n = max(24, int(2 * math.pi * r / (dash + gap)))
    for k in range(n):
        a0 = 2 * math.pi * k / n
        a1 = a0 + (dash / (dash + gap)) * (2 * math.pi / n)
        dr.arc([cx - r, cy - r, cx + r, cy + r], math.degrees(a0), math.degrees(a1), fill=color, width=width)

# 领地边界（外）与仇恨圈（内）
dashed_circle(d, ox, oy, 13.0 * S, (214, 158, 46), width=3)
dashed_circle(d, ox, oy, 9.0 * S, (200, 96, 96), width=2)

# 巢穴与怪
d.ellipse([ox - 11, oy - 11, ox + 11, oy + 11], fill=(46, 92, 140))
d.text((ox - 22, oy + 16), '巢穴', font=F(13, True), fill=(46, 92, 140))

# 怪被引到领地外：画一个越界点 + 回巢箭头
fx, fy = ox + 15.4 * S * math.cos(math.radians(-38)), oy + 15.4 * S * math.sin(math.radians(-38))
d.ellipse([fx - 9, fy - 9, fx + 9, fy + 9], fill=(176, 62, 62))
d.text((fx - 34, fy - 30), '越界点', font=F(12.5, True), fill=(176, 62, 62))

def arrow(dr, x1, y1, x2, y2, color, width=3, head=9):
    dr.line([(x1, y1), (x2, y2)], fill=color, width=width)
    a = math.atan2(y2 - y1, x2 - x1)
    for s in (-1, 1):
        dr.line([(x2, y2), (x2 + head * math.cos(a + s * 0.45), y2 + head * math.sin(a + s * 0.45))], fill=color, width=width)

arrow(d, fx, fy, ox + 7 * S * math.cos(math.radians(-38)), oy + 7 * S * math.sin(math.radians(-38)), (46, 140, 92), width=4, head=11)
d.text((fx - 148, fy + 12), '回巢（0.8 倍速）', font=F(13, True), fill=(46, 140, 92))

d.text((ox - 42, oy - 9.0 * S - 26), '仇恨圈 9 格', font=F(13, True), fill=(200, 96, 96))
d.text((ox + 13.0 * S - 104, oy - 24), '领地边界 13 格', font=F(14, True), fill=(190, 138, 30))

# 数据面板
DX = PX + PW + 30
DW = W - 42 - DX
d.rectangle([DX, PY, DX + DW, PY + PH], fill=(255, 255, 255), outline=(222, 230, 242), width=2)
d.text((DX + 24, PY + 20), '自测实测（bestiary 断言 · 铠甲卫）', font=F(17, True), fill=(24, 30, 44))
rows = [
    ('领地半径', '13 格 = 仇恨半径 9 + 4（登记表可逐只覆盖）'),
    ('越界前 → 回巢', '距巢 15 格 → 0.59 格，确认真的在往回走'),
    ('越界期间出手次数', '0 次（attackedWhileLeashed = false）'),
    ('回到巢内', '解除回巢锁定 retCleared = true'),
    ('再次贴近巢穴', '能重新被仇恨拉起并出手 reengaged = true'),
    ('默认领地（三档）', '原怪 6.5+4 = 10.5　铠甲卫 9+4 = 13　小僵尸 10+4 = 14'),
]
for i, (k, v) in enumerate(rows):
    yy = PY + 62 + i * 42
    d.ellipse([DX + 24, yy + 7, DX + 30, yy + 13], fill=(120, 150, 200))
    d.text((DX + 40, yy), k, font=F(14, True), fill=(46, 58, 78))
    d.text((DX + 190, yy), v, font=F(13.5), fill=(88, 96, 116))

cv.save(R + '_deliver_mobile_leash.png')
print('saved', cv.size)
