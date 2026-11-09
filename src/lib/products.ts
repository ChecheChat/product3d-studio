import { listFiles, readJson, withLock, writeJson } from "./storage";
import type { Quality } from "./lux3d";

export type TaskInfo = {
  id: number | null;
  status: "queued" | "running" | "done" | "failed";
  error?: string;
  startedAt: string;
  finishedAt?: string;
};

/** 一个配色版本：文字/参考图 → （可选）图片编辑生成参考图 → 材质重绘 → 新 GLB */
export type Variant = {
  id: string;
  name: string; // 展示名，如「哑光黑」
  prompt?: string; // 文字描述（走图片编辑生成参考图时）
  swatch?: string; // 色块颜色，给切换按钮用
  stage: "ref" | "mesh" | "done" | "failed";
  refImage?: string; // 参考图（本地相对路径）
  refImageUrl?: string; // 参考图 OUS URL
  meshUrl?: string; // 原模型 OUS URL（材质重绘的输入）
  glb?: string;
  glbWeb?: string;
  usdz?: string;
  arTask?: TaskInfo;
  task: TaskInfo; // 当前阶段的任务
  createdAt: string;
};

export type Product = {
  id: string;
  name: string;
  brand?: string;
  price?: string;
  notes?: string;
  createdAt: string;
  quality: Quality;
  image: string; // 本地相对路径（主图，第一张）
  imageUrl?: string; // OUS URL
  images?: string[]; // 全部输入图（含主图），多图生成时 > 1
  imageUrls?: string[];
  glb?: string; // 本地相对路径（主模型，Lux3D 原始高清版，供下载）
  glbWeb?: string; // 网页展示版（WebP 贴图 + meshopt 压缩）
  yaw?: 0 | 90 | 180 | 270; // 朝向校正，决定哪一面是「正视图」
  usdz?: string; // iPhone AR Quick Look 用
  arTask?: TaskInfo; // USDZ 导出任务
  task: TaskInfo;
  variants: Variant[];
};

/** 每个商品单独一个 JSON：多台服务器同时写不同商品时不会互相覆盖 */
const keyOf = (id: string) => `products/${id}.json`;

export async function listProducts(): Promise<Product[]> {
  const rels = (await listFiles("products/")).filter((r) => r.endsWith(".json"));
  const all = await Promise.all(rels.map((r) => readJson<Product | null>(r, null).catch(() => null)));
  return all.filter((p): p is Product => !!p).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export async function getProduct(id: string): Promise<Product | null> {
  if (!/^[a-z0-9]+$/i.test(id)) return null;
  return readJson<Product | null>(keyOf(id), null);
}

/** 整份写入：只用于新建商品 */
export async function saveProduct(p: Product): Promise<void> {
  await withLock(keyOf(p.id), () => writeJson(keyOf(p.id), p));
}

/**
 * 读改写：在锁内重新读取最新数据，再用 mutate 只改自己负责的字段。
 * 避免轮询刷新拿着旧数据整份写回，把同时发生的新建配色、校正朝向冲掉。
 */
export async function patchProduct(id: string, mutate: (cur: Product) => void): Promise<Product | null> {
  return withLock(keyOf(id), async () => {
    const cur = await readJson<Product | null>(keyOf(id), null);
    if (!cur) return null;
    mutate(cur);
    await writeJson(keyOf(id), cur);
    return cur;
  });
}

export function newId() {
  return Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}
