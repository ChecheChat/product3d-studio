"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { imageSrc, type ProductDTO } from "@/lib/client";

export default function ProductGrid() {
  const [items, setItems] = useState<ProductDTO[] | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/products", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => alive && setItems(j.products));
    load();
    const t = setInterval(load, 8000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);
  if (!items) return <p className="text-sm text-zinc-500">加载中…</p>;
  if (!items.length) return <p className="text-sm text-zinc-500">还没有商品，先在上面传一张商品图。</p>;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((p) => (
        <Link key={p.id} href={`/room/${p.id}`} className="group overflow-hidden rounded-xl border border-white/10 bg-white/5 hover:border-violet-400/60">
          <div className="aspect-square bg-black/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageSrc(p.image)} alt={p.name} className="h-full w-full object-contain p-3 transition group-hover:scale-105" />
          </div>
          <div className="p-3">
            <div className="truncate text-sm font-medium">{p.name}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-zinc-400">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  p.task.status === "done" ? "bg-emerald-400" : p.task.status === "failed" ? "bg-red-400" : "animate-pulse bg-violet-400"
                }`}
              />
              {{ queued: "排队中", running: "生成中", done: "3D 就绪", failed: "失败" }[p.task.status]}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
