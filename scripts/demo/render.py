"""按剪辑清单渲染 Demo 视频。用法: python render.py <素材目录> <输出文件>
素材目录里放录屏 *.webm、文字卡 card*.png、字幕 cap*.png；c09-phone / c09-ar 为 iPhone 实拍（分享页 / AR）；可选 bgm.wav 为背景音乐。"""
import json, os, subprocess, sys

D = sys.argv[1].rstrip("/") + "/"
OUT = sys.argv[2]
W, H, FPS = 1920, 1080, 30
BG = "0x09090b"

EDL = [
    {"card": "card01.png", "dur": 4},
    {"card": "card02.png", "dur": 6},
    {"clip": "c03-upload", "in": 1.5, "out": 11.3, "speed": 1.5, "cap": "cap03a"},
    {"clip": "c03-upload", "in": 11.3, "out": 24.0, "speed": 3.0, "cap": "cap03b"},
    {"clip": "c03-upload", "in": 24.0, "out": 29.5, "speed": 1.0, "cap": "cap04"},
    {"clip": "c05-rotate", "in": 2.7, "out": 22.0, "speed": 1.6, "cap": "cap05"},
    {"clip": "c06-views", "in": 4.0, "out": 18.5, "speed": 1.3, "cap": "cap06"},
    {"clip": "c07-video", "in": 4.5, "out": 13.7, "speed": 1.0, "cap": "cap07"},
    {"clip": "c08a-color", "in": 6.0, "out": 20.5, "speed": 1.5, "cap": "cap08a"},
    {"clip": "c08b-switch", "in": 2.0, "out": 31.5, "speed": 1.8, "cap": "cap08b"},
    # 真 iPhone 打开分享页：转动白杯 → 切到黑金款（用户实拍，2.5–31 秒）
    {"clip": "c09-phone", "in": 2.5, "out": 31.0, "speed": 2.0, "cap": "cap-none", "phone_bg": "bg-phone.png"},
    # 真 iPhone AR：点「AR 看实物」→ 允许 → 杯子落在大理石台面上（用户实拍，13.6 秒到结尾）
    {"clip": "c09-ar", "in": 13.6, "out": 29.3, "speed": 1.3, "cap": "cap-none", "phone_bg": "bg-ar.png"},
    {"card": "card11.png", "dur": 6},
]

def run(args):
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode:
        sys.exit("ffmpeg 失败:\n" + r.stderr[-1500:])

def find_clip(name):
    for ext in (".webm", ".mov", ".mp4", ".MOV", ".MP4"):
        if os.path.exists(D + name + ext):
            return D + name + ext
    return None

def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path], capture_output=True, text=True)
    return float(r.stdout.strip())

os.makedirs(D + "_seg", exist_ok=True)
segs, total = [], 0.0
for i, e in enumerate(EDL):
    seg = f"{D}_seg/{i:02d}.mp4"
    fade = "fade=in:st=0:d=0.25"
    if "card" in e:
        d = e["dur"]
        run(["ffmpeg", "-y", "-loop", "1", "-t", str(d), "-i", D + e["card"],
             "-vf", f"scale={W}:{H},fps={FPS},{fade},fade=out:st={d-0.3}:d=0.3,format=yuv420p",
             "-c:v", "libx264", "-preset", "medium", "-crf", "18", seg])
    else:
        src = find_clip(e["clip"])
        if not src:
            print(f"跳过 {e['clip']}（还没有素材）")
            continue
        end = e["out"] if e["out"] is not None else duration(src)
        d = (end - e["in"]) / e["speed"]
        if e.get("phone_bg"):
            # 竖屏手机实拍：放在左侧，背景用品牌渐变卡（右侧是说明文字）
            vf = f"[0:v]trim=start={e['in']}:end={end},setpts=(PTS-STARTPTS)/{e['speed']},scale=-2:1000,fps={FPS}[p];" \
                 f"[2:v]scale={W}:{H}[b];[b][p]overlay=x=470-overlay_w/2:y=40[v];" \
                 f"[1:v]format=rgba[c];[v][c]overlay=0:0,fps={FPS},{fade},fade=out:st={d-0.25:.2f}:d=0.25,format=yuv420p[o]"
            extra = ["-loop", "1", "-t", f"{d:.2f}", "-i", D + e["phone_bg"]]
        else:
            if e.get("portrait"):
                base = f"scale=-2:{H},pad={W}:{H}:(ow-iw)/2:0:color={BG}"
            else:
                base = f"scale={W}:{H}:flags=lanczos"
            vf = f"[0:v]trim=start={e['in']}:end={end},setpts=(PTS-STARTPTS)/{e['speed']},{base},fps={FPS}[v];" \
                 f"[1:v]format=rgba,fade=in:st=0.15:d=0.35:alpha=1[c];[v][c]overlay=0:0,{fade},fade=out:st={d-0.25:.2f}:d=0.25,format=yuv420p[o]"
            extra = []
        run(["ffmpeg", "-y", "-i", src, "-loop", "1", "-t", f"{d:.2f}", "-i", D + e["cap"] + ".png", *extra,
             "-filter_complex", vf, "-map", "[o]", "-t", f"{d:.2f}", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", seg])
    segs.append(seg)
    total += duration(seg)
    print(f"{i:02d} {e.get('clip') or e.get('card'):14s} {duration(seg):5.1f}s")

with open(D + "_seg/list.txt", "w") as f:
    f.writelines(f"file '{s}'\n" for s in segs)
# 背景音乐：素材目录里有 bgm.wav 就用（scripts/demo/music.py 生成），否则静音轨
audio = ["-i", D + "bgm.wav"] if os.path.exists(D + "bgm.wav") else ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
run(["ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", D + "_seg/list.txt", *audio,
     "-map", "0:v", "-map", "1:a", "-t", f"{total:.2f}",
     "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", OUT])
print(f"完成 {OUT} 共 {total:.1f}s {os.path.getsize(OUT)/1e6:.1f}MB")
