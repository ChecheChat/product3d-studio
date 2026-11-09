"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

type Props = {
  usdz?: string | null; // 相对地址 /api/files/…usdz（iPhone）
  glb?: string | null; // 相对地址 /api/files/…glb（安卓 Scene Viewer，用原始未压缩版）
  shareUrl: string; // 电脑上扫码打开的页面
  pending: boolean; // USDZ 正在导出
  label: string;
};

function platform(): "ios" | "android" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/**
 * iPhone：<a rel="ar"> 指向 USDZ，Safari 直接打开 AR Quick Look（a 标签第一个子元素必须是 img）。
 * 安卓：用 Google Scene Viewer 打开 GLB。
 * 电脑：弹出二维码，用手机扫码打开同一个页面。
 */
export default function ArButton({ usdz, glb, shareUrl, pending, label }: Props) {
  const [pf, setPf] = useState<"ios" | "android" | "desktop">("desktop");
  const [qr, setQr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => setPf(platform()), []);
  useEffect(() => {
    if (open && !qr) QRCode.toDataURL(shareUrl, { margin: 1, width: 320 }).then(setQr).catch(() => {});
  }, [open, qr, shareUrl]);

  if (pf === "ios") {
    if (!usdz) return <button className="btn" disabled>{pending ? "AR 准备中…" : "暂不支持 AR"}</button>;
    return (
      <a rel="ar" href={usdz} className="btn-primary">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" alt="" width={1} height={1} />
        {label}
      </a>
    );
  }
  if (pf === "android") {
    if (!glb) return <button className="btn" disabled>AR 准备中…</button>;
    const file = new URL(glb, location.href).href;
    const fallback = encodeURIComponent(location.href);
    const intent = `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(file)}&mode=ar_preferred#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=${fallback};end;`;
    return <a href={intent} className="btn-primary">{label}</a>;
  }
  return (
    <div className="relative">
      <button type="button" className="btn" onClick={() => setOpen((o) => !o)} disabled={!usdz && pending}>
        {!usdz && pending ? "AR 准备中…" : `📱 ${label}`}
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-60 rounded-2xl border border-white/10 bg-zinc-900 p-3 text-center shadow-2xl">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="二维码" className="mx-auto w-44 rounded-lg bg-white p-1" />
          ) : (
            <div className="mx-auto h-44 w-44 animate-pulse rounded-lg bg-white/10" />
          )}
          <p className="mt-2 text-xs leading-relaxed text-zinc-300">用 iPhone 相机扫码打开，再点「{label}」，把商品按真实大小放到桌面上看。</p>
        </div>
      )}
    </div>
  );
}
