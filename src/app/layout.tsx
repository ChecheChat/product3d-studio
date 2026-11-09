import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "商品 3D 工作台 · Powered by Aholo Lux3D",
  description: "一张商品图，自动生成 3D 模型、三视图、360° 转盘视频和 AR 预览。不用建模、不用寄样。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full bg-zinc-950 text-zinc-100">{children}</body>
    </html>
  );
}
