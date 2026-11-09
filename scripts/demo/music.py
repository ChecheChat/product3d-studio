"""合成 Demo 背景音乐（原创，纯代码生成，无版权素材）。用法: python music.py <输出.wav> [总时长秒]
96 BPM，一小节 2.5 秒，Am7–Fmaj7–Cmaj7–G6 四小节 10 秒一循环。段落对齐视频：
0–10 秒文字卡：铺底+琶音；10–20 秒：加贝斯和踩镲；20 秒起：完整鼓组；
85–110 秒手机实拍：加高八度旋律；110 秒起结尾卡：停鼓，Am 长音淡出。"""
import sys
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 44100
OUT = sys.argv[1]
TOTAL = float(sys.argv[2]) if len(sys.argv) > 2 else 117.0
BEAT = 60 / 96
BAR = BEAT * 4
N = int(TOTAL * SR)
rng = np.random.default_rng(7)

def hz(m):  # MIDI → 频率
    return 440.0 * 2 ** ((m - 69) / 12)

CHORDS = [  # 每个和弦：根音 + 和弦音（MIDI）
    (45, [57, 60, 64, 67]),  # Am7
    (41, [53, 57, 60, 64]),  # Fmaj7
    (48, [55, 59, 60, 64]),  # Cmaj7
    (43, [55, 59, 62, 64]),  # G6
]
OUTRO = 110.0

def add(buf, start, sig):
    i = int(start * SR)
    if i >= len(buf):
        return
    sig = sig[: len(buf) - i]
    buf[i : i + len(sig)] += sig

def tone(f, dur, harm=(1.0,), detune=0.0):
    t = np.arange(int(dur * SR)) / SR
    s = np.zeros_like(t)
    for k, a in enumerate(harm, 1):
        s += a * np.sin(2 * np.pi * f * k * t + rng.uniform(0, 6.28))
        if detune:
            s += a * np.sin(2 * np.pi * f * k * (1 + detune) * t)
    return s, t

def lp(x, fc):
    return sosfilt(butter(2, fc, "low", fs=SR, output="sos"), x)

def hp(x, fc):
    return sosfilt(butter(2, fc, "high", fs=SR, output="sos"), x)

pad, pluck, lead, bass, drums = (np.zeros(N) for _ in range(5))

nbars = int(np.ceil(TOTAL / BAR))
for b in range(nbars):
    t0 = b * BAR
    if t0 >= TOTAL:
        break
    outro = t0 >= OUTRO
    root, notes = CHORDS[0] if outro else CHORDS[b % 4]
    # 铺底：每小节一个和弦，慢起慢收，相邻小节交叠
    dur = (TOTAL - t0) if outro else BAR + 1.2
    for m in notes:
        s, t = tone(hz(m), dur, harm=(1, 0.35, 0.15, 0.06), detune=0.004)
        env = np.minimum(t / 0.5, 1.0)
        if not outro:
            env *= np.clip((BAR + 1.2 - t) / 1.2, 0, 1)
        else:
            env *= np.clip((dur - t) / 5.0, 0, 1)
        add(pad, t0, s * env * 0.05)
    if outro:
        # 结尾只留一个琶音上行
        for j, m in enumerate([69, 72, 76, 79]):
            s, t = tone(hz(m), 2.5, harm=(1, 0.2))
            add(pluck, t0 + j * BEAT / 2, s * np.exp(-t * 2.5) * 0.10)
        break
    # 琶音：八分音符，和弦音高八度
    pat = [0, 1, 2, 3, 2, 1, 2, 3]
    for j, k in enumerate(pat):
        m = notes[k] + 12
        s, t = tone(hz(m), 1.0, harm=(1, 0.25, 0.08))
        amp = 0.07 if t0 < 10 else 0.085
        add(pluck, t0 + j * BEAT / 2, s * np.exp(-t * 5.5) * amp * (1.0 if j % 2 == 0 else 0.75))
    # 手机实拍段：高八度旋律，每两拍一个音
    if 85 <= t0 < OUTRO:
        mel = [notes[3] + 12, notes[2] + 12, notes[1] + 24, notes[2] + 12]
        for j, m in enumerate(mel):
            s, t = tone(hz(m), 1.6, harm=(1, 0.1))
            add(lead, t0 + j * BEAT * 1 + (BEAT * 0.5 if j % 2 else 0), s * np.exp(-t * 2.2) * 0.05)
    if t0 >= 10:
        # 贝斯：第 1、3 拍
        for beat in (0, 2):
            s, t = tone(hz(root), BEAT * 1.8, harm=(1, 0.3))
            env = np.minimum(t / 0.01, 1) * np.exp(-t * 1.6)
            add(bass, t0 + beat * BEAT, s * env * 0.16)
        # 踩镲：八分音符，略带摇摆
        for j in range(8):
            n = hp(rng.standard_normal(int(0.08 * SR)), 7000)
            tt = np.arange(len(n)) / SR
            sw = 0.03 if j % 2 else 0.0
            add(drums, t0 + j * BEAT / 2 + sw, n * np.exp(-tt * 70) * (0.035 if j % 2 else 0.05))
    if t0 >= 20:
        # 底鼓：第 1、3 拍
        for beat in (0, 2):
            tt = np.arange(int(0.35 * SR)) / SR
            f = 45 + 80 * np.exp(-tt * 30)
            k = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 9)
            add(drums, t0 + beat * BEAT, k * 0.38)
        # 军鼓（轻拍手）：第 2、4 拍
        for beat in (1, 3):
            n = sosfilt(butter(2, [900, 5000], "band", fs=SR, output="sos"), rng.standard_normal(int(0.25 * SR)))
            tt = np.arange(len(n)) / SR
            add(drums, t0 + beat * BEAT, n * np.exp(-tt * 22) * 0.14)

# 混响：指数衰减噪声脉冲响应
ir_t = np.arange(int(1.8 * SR)) / SR
ir = rng.standard_normal(len(ir_t)) * np.exp(-ir_t * 3.2)
ir = lp(ir, 5000)
ir /= np.sqrt(np.sum(ir ** 2))
def verb(x, wet):
    return x + wet * fftconvolve(x, ir)[: len(x)]

# 简单回声给琶音和旋律
def echo(x, d=BEAT * 0.75, fb=0.32, taps=3):
    y = x.copy()
    for k in range(1, taps + 1):
        i = int(d * k * SR)
        y[i:] += x[: len(x) - i] * fb ** k
    return y

pad = verb(lp(pad, 2200), 0.5)
pluck = verb(echo(lp(pluck, 4500)), 0.35)
lead = verb(echo(lp(lead, 5000)), 0.45)
bass = lp(bass, 400)

# 底鼓轻微压低铺底（侧链感）
duck = np.ones(N)
for b in range(int(min(OUTRO, TOTAL) // BAR) + 1):
    t0 = b * BAR
    if t0 < 20 or t0 >= OUTRO:
        continue
    for beat in (0, 2):
        i = int((t0 + beat * BEAT) * SR)
        L = int(0.35 * SR)
        seg = 1 - 0.35 * np.exp(-np.arange(L) / SR * 8)
        duck[i : i + L] = np.minimum(duck[i : i + L], seg[: max(0, min(L, N - i))])

mix = (pad + pluck) * duck + lead + bass + drums
# 立体声：琶音和旋律稍微左右分开，鼓和贝斯居中
left = (pad + pluck * 1.15 + lead * 0.85) * duck + bass + drums
right = (pad + pluck * 0.85 + lead * 1.15) * duck + bass + drums
st = np.stack([left, right], axis=1)
# 首尾淡入淡出
fi, fo = int(1.0 * SR), int(3.0 * SR)
st[:fi] *= np.linspace(0, 1, fi)[:, None]
st[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
st = np.tanh(st / np.max(np.abs(st)) * 1.2) * 0.9
wavfile.write(OUT, SR, (st * 32767).astype(np.int16))
print(f"完成 {OUT} {TOTAL:.1f}s")
