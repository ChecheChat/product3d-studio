"use client";
import { useState } from "react";
import { compressImage, getAccessCode } from "@/lib/client";

const PRESETS = [
  { name: "哑光黑", swatch: "#1f1f22", prompt: "哑光黑色，细节和图案改为金色" },
  { name: "奶油白", swatch: "#f1e9d8", prompt: "奶油白色，柔和哑光质感" },
  { name: "雾霾蓝", swatch: "#8ea6bd", prompt: "雾霾蓝色，低饱和哑光质感" },
  { name: "樱花粉", swatch: "#f0b8c8", prompt: "樱花粉色，柔和哑光质感" },
  { name: "薄荷绿", swatch: "#a7dcc6", prompt: "薄荷绿色，清新哑光质感" },
  { name: "金属银", swatch: "#c4c8cc", prompt: "拉丝金属银色，带金属光泽" },
];

export default function ColorPanel({ productId, onCreated }: { productId: string; onCreated: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [name, setName] = useState("");
  const [swatch, setSwatch] = useState<string | undefined>();
  const [ref, setRef] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function pick(p: (typeof PRESETS)[number]) {
    setPrompt(p.prompt);
    setName(p.name);
    setSwatch(p.swatch);
    setRef(null);
  }

  async function submit() {
    setErr(null);
    if (!prompt.trim() && !ref) return setErr("点一个预设配色，或写一句想要的颜色，或上传参考图");
    setBusy(true);
    try {
      const fd = new FormData();
      if (prompt.trim()) fd.set("prompt", prompt.trim());
      fd.set("name", name.trim() || prompt.trim().slice(0, 10) || "参考图配色");
      if (swatch) fd.set("swatch", swatch);
      if (ref) fd.set("ref", await compressImage(ref));
      const res = await fetch(`/api/products/${productId}/variants`, {
        method: "POST",
        body: fd,
        headers: { "x-access-code": getAccessCode() },
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "创建失败");
      setPrompt("");
      setName("");
      setSwatch(undefined);
      setRef(null);
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="mb-1 text-sm text-zinc-200">🎨 一键换色</div>
      <p className="mb-3 text-xs text-zinc-500">Lux3D 材质重绘：同一个 3D 模型，换一套配色和材质，不用重新拍照建模。</p>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            type="button"
            onClick={() => pick(p)}
            className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${name === p.name ? "border-violet-400 bg-violet-500/20" : "border-white/10 hover:border-white/30"}`}
          >
            <span className="h-3 w-3 rounded-full border border-white/20" style={{ background: p.swatch }} />
            {p.name}
          </button>
        ))}
      </div>
      <input
        value={prompt}
        onChange={(e) => {
          setPrompt(e.target.value);
          setName("");
          setSwatch(undefined);
        }}
        placeholder="或者写一句：如「深绿色珐琅，图案改为白色」"
        className="input mb-2"
      />
      <label className="mb-3 flex cursor-pointer items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200">
        <input type="file" accept="image/*" className="hidden" onChange={(e) => setRef(e.target.files?.[0] ?? null)} />
        <span className="rounded-lg border border-dashed border-white/20 px-2 py-1">{ref ? `✓ ${ref.name}` : "＋ 也可以上传一张配色参考图"}</span>
        {ref && (
          <button type="button" onClick={(e) => (e.preventDefault(), setRef(null))} className="text-zinc-500 hover:text-zinc-200">
            移除
          </button>
        )}
      </label>
      {err && <p className="mb-2 text-xs text-red-400">{err}</p>}
      <button type="button" onClick={submit} disabled={busy} className="btn-primary w-full justify-center">
        {busy ? "提交中…" : ref ? "按参考图换色（约 5 分钟）" : "生成新配色（约 6 分钟）"}
      </button>
    </div>
  );
}
