"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { compressImage, getAccessCode, setAccessCode } from "@/lib/client";

const MAX = 8;

export default function UploadForm() {
  const router = useRouter();
  const [files, setFiles] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState("");

  useEffect(() => {
    setCode(getAccessCode());
    fetch("/api/products", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setNeedCode(!!j.needCode))
      .catch(() => {});
  }, []);

  function addFiles(list: FileList | null | undefined) {
    if (!list?.length) return;
    setErr(null);
    const imgs = [...list].filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...imgs.map((file) => ({ file, url: URL.createObjectURL(file) }))].slice(0, MAX));
  }
  function remove(i: number) {
    setFiles((prev) => prev.filter((_, j) => j !== i));
  }
  function makeMain(i: number) {
    setFiles((prev) => [prev[i], ...prev.filter((_, j) => j !== i)]);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!files.length) return setErr("先选至少一张商品图");
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData(e.currentTarget);
      fd.delete("image");
      for (const { file } of files) fd.append("image", await compressImage(file));
      fd.delete("accessCode");
      setAccessCode(code);
      const res = await fetch("/api/products", { method: "POST", body: fd, headers: { "x-access-code": code } });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "创建失败");
      router.push(`/room/${json.product.id}`);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 md:grid-cols-[260px_1fr]">
      <div className="grid content-start gap-2">
        <label
          className="flex aspect-square cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/20 bg-black/30 text-center text-sm text-zinc-400 hover:border-violet-400"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }}
        >
          {files[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={files[0].url} alt="主图" className="h-full w-full object-contain" />
          ) : (
            <span className="px-4">
              点击或拖入商品图
              <br />
              <span className="text-xs text-zinc-500">一张就能生成；同一商品多拍几个角度（正、侧、背），背面会更准</span>
            </span>
          )}
          <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
        </label>
        {files.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5">
            {files.map((f, i) => (
              <div key={f.url} className={`group relative aspect-square overflow-hidden rounded-lg border ${i === 0 ? "border-violet-400" : "border-white/10"} bg-black/30`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.url} alt="" className="h-full w-full object-contain" onClick={() => makeMain(i)} />
                {i === 0 && <span className="absolute left-0.5 top-0.5 rounded bg-violet-600 px-1 text-[10px] text-white">主图</span>}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="absolute right-0.5 top-0.5 hidden h-4 w-4 items-center justify-center rounded-full bg-black/70 text-[10px] text-white group-hover:flex"
                  aria-label="移除"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        {files.length > 1 && <p className="text-xs text-zinc-500">已选 {files.length} 张，按多角度生成。点缩略图设为主图（放最清晰、最完整的那张）。</p>}
      </div>
      <div className="grid content-start gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input name="name" placeholder="商品名称 *" required className="input" />
          <input name="brand" placeholder="品牌 / 店铺" className="input" />
          <input name="price" placeholder="到手价，如 ¥59 或 ฿199" className="input" />
          <select name="quality" defaultValue="standard" className="input">
            <option value="standard">高质量 · 约 5 分钟 · 图案文字清晰</option>
            <option value="turbo">快速预览 · 约 1.5 分钟 · 只看外形</option>
          </select>
        </div>
        {needCode && (
          <input
            name="accessCode"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="访问码（生成会消耗算力，向作者获取）"
            className="input"
            type="password"
            autoComplete="off"
          />
        )}
        <textarea name="notes" rows={3} placeholder="卖点 / 尺寸 / 注意事项（会显示在分享页）" className="input" />
        {err && <p className="text-sm text-red-400">{err}</p>}
        <button disabled={busy} className="rounded-xl bg-violet-600 px-4 py-2.5 font-medium text-white hover:bg-violet-500 disabled:opacity-50">
          {busy ? "上传并生成中…" : files.length > 1 ? `用 ${files.length} 张图生成 3D 模型` : "生成 3D 模型"}
        </button>
      </div>
    </form>
  );
}
