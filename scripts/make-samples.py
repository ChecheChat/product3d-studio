"""用 Lux3D 文生图 + 四视图生成测试商品图。
用法: python3 -I scripts/make-samples.py <输出目录名> "<提示词>"
Key 从 .env.local 读取，不会打印。
"""
import json, os, sys, time, urllib.request, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
env = {}
for line in (ROOT / ".env.local").read_text(encoding="utf8").splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip()
KEY = env.get("LUX3D_API_KEY", "")
BASE = env.get("LUX3D_BASE_URL") or "https://api.aholo3d.cn"
assert KEY, "LUX3D_API_KEY 为空"

def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Authorization": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=60) as resp:
        j = json.loads(resp.read())
    if j.get("c") != "0":
        raise RuntimeError(f"{path}: {j.get('c')} {j.get('m')}")
    return j["d"]

def wait(task_id, label):
    t0 = time.time()
    while True:
        d = req("GET", f"/lux3d/v1/generate/task/get?taskid={task_id}")
        st = d["status"]
        if st == 3:
            print(f"  {label} 完成 {time.time()-t0:.0f}s", flush=True)
            return d["outputs"]
        if st in (4, 6):
            raise RuntimeError(f"{label} 失败 status={st} {d.get('outputs')}")
        time.sleep(8)

def download(url, dest):
    with urllib.request.urlopen(url, timeout=120) as r:
        dest.write_bytes(r.read())

name, prompt = sys.argv[1], sys.argv[2]
out = ROOT / "samples" / name
out.mkdir(parents=True, exist_ok=True)

print(f"[{name}] 文生图…", flush=True)
tid = req("POST", "/lux3d/v1/generate/multimodal-to-image/task/create", {"prompt": prompt})
img_url = wait(tid, "文生图")[0]["content"]
ext = ".png" if ".png" in img_url.lower() else ".jpg"
download(img_url, out / f"main{ext}")

print(f"[{name}] 四视图…", flush=True)
tid = req("POST", "/lux3d/v1/generate/image-to-four-view/task/create",
          {"img": img_url, "prompt": "保持主体造型、材质和颜色完全一致，纯白背景"})
views = json.loads(wait(tid, "四视图")[0]["content"])
labels = ["view1-front34", "view2-opposite34", "view3-side", "view4-back"]
for lab, u in zip(labels, views):
    e = ".png" if ".png" in u.lower() else ".jpg"
    download(u, out / f"{lab}{e}")
print(f"[{name}] 保存到 {out}", flush=True)
for f in sorted(out.iterdir()):
    print("  ", f.name, f.stat().st_size // 1024, "KB")
