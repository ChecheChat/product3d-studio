import { NextResponse } from "next/server";
import { MOCK, createImgTo3d, uploadAsset, type Quality } from "@/lib/lux3d";
import { saveFile } from "@/lib/storage";
import { listProducts, newId, saveProduct, type Product } from "@/lib/products";
import { refreshProduct } from "@/lib/refresh";
import { NEED_CODE, codeOk } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const list = await listProducts();
  const refreshed = await Promise.all(list.map((p) => refreshProduct(p)));
  return NextResponse.json({ products: refreshed, mock: MOCK, needCode: NEED_CODE });
}

export async function POST(req: Request) {
  if (!codeOk(req)) return NextResponse.json({ error: "访问码不对，请联系作者获取" }, { status: 401 });
  const form = await req.formData();
  const files = form.getAll("image").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 8);
  if (!files.length) {
    return NextResponse.json({ error: "缺少商品图" }, { status: 400 });
  }
  const name = String(form.get("name") || "").trim() || "未命名商品";
  const brand = String(form.get("brand") || "").trim() || undefined;
  const price = String(form.get("price") || "").trim() || undefined;
  const notes = String(form.get("notes") || "").trim() || undefined;
  const quality = (String(form.get("quality") || "standard") === "turbo" ? "turbo" : "standard") as Quality;

  const id = newId();
  const saved: { rel: string; buf: Buffer; name: string }[] = [];
  for (const [i, f] of files.entries()) {
    const buf = Buffer.from(await f.arrayBuffer());
    const ext = f.type === "image/png" ? "png" : "jpg";
    const name = i === 0 ? `${id}.${ext}` : `${id}-${i}.${ext}`;
    saved.push({ rel: await saveFile(`images/${name}`, buf), buf, name });
  }

  const product: Product = {
    id,
    name,
    brand,
    price,
    notes,
    createdAt: new Date().toISOString(),
    quality,
    image: saved[0].rel,
    images: saved.map((x) => x.rel),
    task: { id: null, status: "queued", startedAt: new Date().toISOString() },
    variants: [],
  };

  if (!MOCK) {
    try {
      const urls: string[] = [];
      for (const x of saved) urls.push(await uploadAsset(x.buf, x.name));
      product.imageUrl = urls[0];
      product.imageUrls = urls;
      product.task.id = await createImgTo3d(urls, quality);
    } catch (e) {
      product.task = {
        ...product.task,
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  await saveProduct(product);
  return NextResponse.json({ product, mock: MOCK });
}
