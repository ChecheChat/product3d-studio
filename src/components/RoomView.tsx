"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import ModelViewer, { composeSheet, type ViewerHandle, type ViewImage } from "./ModelViewer";
import ArButton from "./ArButton";
import ColorPanel from "./ColorPanel";
import { getAccessCode, imageSrc, modelSrc, type ProductDTO } from "@/lib/client";

type Mode = "brand" | "creator";

const T = {
  brand: {
    status: { queued: "排队中", running: "Lux3D 生成中", done: "已完成", failed: "失败" },
    share: "复制分享链接",
    video: "导出 360° 转盘视频",
    recording: "录制中…",
    views: "生成三视图 / 多角度图",
    sheet: "下载合成图",
    notes: "卖点 / 说明",
    ar: "AR 看实物",
    original: "原款",
    colors: "配色",
  },
  creator: {
    status: { queued: "รอคิว · 排队中", running: "กำลังสร้าง 3D · 生成中", done: "พร้อมแล้ว · 已就绪", failed: "ล้มเหลว · 失败" },
    share: "คัดลอกลิงก์ · 复制链接",
    video: "ดาวน์โหลดวิดีโอหมุน 360° · 下载转盘视频",
    recording: "กำลังบันทึก… · 录制中",
    views: "ภาพหลายมุม · 多角度图",
    sheet: "ดาวน์โหลดรวม · 下载合成图",
    notes: "จุดขาย · 卖点",
    ar: "ดู AR · AR 看实物",
    original: "ต้นฉบับ · 原款",
    colors: "สี · 配色",
  },
};

/** 还有任务在跑：主模型、配色、AR 导出（mock 模式没有配色和 AR） */
function isPending(p: ProductDTO, mock: boolean) {
  const run = (t?: { status: string }) => !!t && (t.status === "queued" || t.status === "running");
  if (run(p.task)) return true;
  if (mock) return false;
  if ((p.variants ?? []).some((v) => v.stage === "ref" || v.stage === "mesh" || run(v.arTask))) return true;
  if (run(p.arTask)) return true;
  // 主模型好了但还没开始导出 AR：下一次详情页请求会自动发起，再轮询一次
  if (p.task.status === "done" && p.glb && !p.usdz && !p.arTask) return true;
  return (p.variants ?? []).some((v) => v.stage === "done" && v.glb && !v.usdz && !v.arTask);
}

export default function RoomView({ id, mode }: { id: string; mode: Mode }) {
  const [p, setP] = useState<ProductDTO | null>(null);
  const [mock, setMock] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [copied, setCopied] = useState(false);
  const [views, setViews] = useState<ViewImage[] | null>(null);
  const [viewsBusy, setViewsBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const [active, setActive] = useState<string>("main"); // "main" 或配色 id
  const [reloadKey, setReloadKey] = useState(0);

  async function rotate() {
    if (!p) return;
    const yaw = (((p.yaw ?? 0) + 90) % 360) as 0 | 90 | 180 | 270;
    const prev = p;
    setP({ ...p, yaw });
    setViews(null);
    const res = await fetch(`/api/products/${p.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-access-code": getAccessCode() },
      body: JSON.stringify({ yaw }),
    }).catch(() => null);
    if (!res?.ok) {
      setP(prev);
      alert(res?.status === 401 ? "需要访问码才能修改，请先在首页输入访问码" : "保存失败，请重试");
    }
  }
  const viewer = useRef<ViewerHandle>(null);
  const t = T[mode];

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function tick() {
      try {
        const res = await fetch(`/api/products/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error(res.status === 404 ? "没有这个商品" : `加载失败 ${res.status}`);
        const json = await res.json();
        if (!alive) return;
        setP(json.product);
        setMock(json.mock);
        if (isPending(json.product, json.mock)) timer = setTimeout(tick, 5000);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      }
    }
    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [id, reloadKey]);

  async function exportVideo() {
    if (!viewer.current || !p) return;
    setRecording(true);
    try {
      const blob = await viewer.current.recordTurntable(6);
      const ext = blob.type.includes("mp4") ? "mp4" : "webm";
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${fileName}-360.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setRecording(false);
    }
  }

  async function makeViews() {
    if (!viewer.current) return;
    setViewsBusy(true);
    try {
      // 稍等，确保模型已居中并完成自动取景（后台标签页 rAF 不触发，所以用 setTimeout）
      await new Promise((r) => setTimeout(r, 80));
      setViews(await viewer.current.captureViews());
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setViewsBusy(false);
    }
  }

  async function downloadSheet() {
    if (!views || !p) return;
    const url = await composeSheet(views, fileName);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName}-三视图.png`;
    a.click();
  }

  function shareUrl() {
    return typeof location === "undefined" ? `/s/${id}` : `${location.origin}/s/${id}`;
  }

  function switchTo(vid: string) {
    if (vid === active) return;
    setActive(vid);
    setReady(false);
    setViews(null);
  }

  async function copyShare() {
    const url = shareUrl();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (err) return <p className="text-red-400">{err}</p>;
  if (!p) return <p className="text-zinc-400">加载中…</p>;

  const doneVariants = (p.variants ?? []).filter((v) => v.stage === "done" && v.glb);
  const cur = doneVariants.find((v) => v.id === active);
  const glb = modelSrc(cur ? (cur.glbWeb ?? cur.glb) : (p.glbWeb ?? p.glb)); // 展示用压缩版
  const glbOriginal = modelSrc(cur ? cur.glb : p.glb); // 下载给原始高清版
  const usdz = modelSrc(cur ? cur.usdz : p.usdz);
  const arPending = !!(cur ? cur.arTask : p.arTask) && ["queued", "running"].includes((cur ? cur.arTask : p.arTask)!.status);
  const fileName = cur ? `${p.name}-${cur.name}` : p.name;
  const st = p.task.status;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div>
        {glb ? (
          <ModelViewer key={glb} ref={viewer} url={glb} yaw={p.yaw ?? 0} onReady={onReady} className="aspect-square w-full lg:aspect-[4/3]" />
        ) : (
          <div className="flex aspect-square w-full flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-black/30 lg:aspect-[4/3]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc(p.image)} alt={p.name} className="max-h-[60%] rounded-lg object-contain opacity-70" />
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              {(st === "queued" || st === "running") && <span className="h-2 w-2 animate-pulse rounded-full bg-violet-400" />}
              {t.status[st]}
              {st === "failed" && p.task.error && <span className="text-red-400">：{p.task.error}</span>}
            </div>
            {(st === "queued" || st === "running") && (
              <p className="text-xs text-zinc-500">{p.quality === "turbo" ? "快速模式约 1 分钟" : "高质量模式约 5 分钟"}，页面会自动刷新</p>
            )}
          </div>
        )}
        {glb && (p.variants?.length ?? 0) > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-xs text-zinc-400">{t.colors}</span>
            <button
              type="button"
              onClick={() => switchTo("main")}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${active === "main" ? "border-violet-400 bg-violet-500/20" : "border-white/10 hover:border-white/30"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageSrc(p.image)} alt="" className="h-4 w-4 rounded-full bg-white object-cover" />
              {t.original}
            </button>
            {(p.variants ?? []).map((v) => {
              const ok = v.stage === "done" && !!v.glb;
              const pend = v.stage === "ref" || v.stage === "mesh";
              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={!ok}
                  onClick={() => switchTo(v.id)}
                  title={v.stage === "failed" ? v.task.error : v.prompt}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs disabled:cursor-default ${active === v.id ? "border-violet-400 bg-violet-500/20" : "border-white/10 hover:border-white/30"} ${v.stage === "failed" ? "text-red-400" : ""}`}
                >
                  {v.refImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={imageSrc(v.refImage)} alt="" className="h-4 w-4 rounded-full bg-white object-cover" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border border-white/20" style={{ background: v.swatch ?? "#666" }} />
                  )}
                  {v.name}
                  {pend && <span className="text-zinc-500">· {v.stage === "ref" ? "出参考图" : "上色中"}…</span>}
                  {v.stage === "failed" && <span>· 失败</span>}
                </button>
              );
            })}
          </div>
        )}
        {glb && (
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={exportVideo} disabled={recording || !ready} className="btn-primary">
              {recording ? t.recording : t.video}
            </button>
            <button onClick={copyShare} className="btn">
              {copied ? "✓ 已复制" : t.share}
            </button>
            <button onClick={makeViews} disabled={viewsBusy || !ready} className="btn">
              {viewsBusy ? "渲染中…" : t.views}
            </button>
            {mode === "brand" && (
              <button onClick={rotate} disabled={!ready} className="btn" title="正视图方向不对时，点一次转 90°">
                ↻ 校正正面（{p.yaw ?? 0}°）
              </button>
            )}
            <ArButton usdz={usdz} glb={glbOriginal} pending={arPending} label={t.ar} shareUrl={shareUrl()} />
            <a href={glbOriginal ?? glb} download={`${fileName}.glb`} className="btn">下载 GLB（高清）</a>
          </div>
        )}
        {views && (
          <section className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm text-zinc-300">三视图 / 多角度图（透明底 PNG）</span>
              <button onClick={downloadSheet} className="btn-primary !py-1.5 text-xs">{t.sheet}</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {views.map((v) => (
                <a
                  key={v.name}
                  href={v.dataUrl}
                  download={`${fileName}-${v.name}.png`}
                  className="group rounded-lg bg-[linear-gradient(45deg,#2a2a30_25%,transparent_25%,transparent_75%,#2a2a30_75%),linear-gradient(45deg,#2a2a30_25%,#1c1c21_25%,#1c1c21_75%,#2a2a30_75%)] bg-[length:16px_16px] bg-[position:0_0,8px_8px] p-1"
                  title="点击下载"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.dataUrl} alt={v.name} className="aspect-square w-full object-contain" />
                  <div className="mt-1 text-center text-xs text-zinc-400 group-hover:text-zinc-100">{v.name} ↓</div>
                </a>
              ))}
            </div>
          </section>
        )}
      </div>
      <aside className="grid content-start gap-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-violet-300">{p.brand ?? "3D Sample"}</div>
          <h1 className="mt-1 text-2xl font-semibold">{p.name}</h1>
          {p.price && <div className="mt-1 text-lg text-zinc-200">{p.price}</div>}
        </div>
        {p.notes && (
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-zinc-200">
            <div className="mb-1 text-xs text-zinc-400">{t.notes}</div>
            <p className="whitespace-pre-wrap">{p.notes}</p>
          </div>
        )}
        {mode === "brand" && st === "done" && !mock && (
          <ColorPanel productId={p.id} onCreated={() => setReloadKey((k) => k + 1)} />
        )}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-xs text-zinc-400">
          <div className="mb-2 text-zinc-300">原始商品图{(p.images?.length ?? 1) > 1 ? `（${p.images!.length} 张多角度输入）` : ""}</div>
          <div className="grid grid-cols-3 gap-1.5">
            {(p.images ?? [p.image]).map((im) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={im} src={imageSrc(im)} alt="" className="aspect-square w-full rounded-lg bg-white object-contain" />
            ))}
          </div>
          <div className="mt-2">
            3D 由 Aholo Lux3D {p.quality === "turbo" ? "G1-Turbo" : "G1"} 生成{(p.images?.length ?? 1) > 1 ? "（多图输入）" : ""}
            {mock && <span className="ml-2 rounded bg-amber-500/20 px-1.5 py-0.5 text-amber-300">mock 模式</span>}
          </div>
        </div>
      </aside>
    </div>
  );
}
