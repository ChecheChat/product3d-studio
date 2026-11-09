import { NextResponse } from "next/server";
import { MOCK, createImageEdit, createMaterialTransfer, uploadAsset } from "@/lib/lux3d";
import { getProduct, newId, patchProduct, type Variant } from "@/lib/products";
import { readFile, saveFile } from "@/lib/storage";
import { codeOk } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_VARIANTS = 6;

/**
 * 新建一个配色版本。两种方式：
 * 1. 文字（prompt）：先用 Lux3D 图片编辑把商品主图改成目标配色作为参考图，再做材质重绘（约 31 积分）
 * 2. 参考图（ref 文件）：直接用这张图做材质重绘（约 19 积分）
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!codeOk(req)) return NextResponse.json({ error: "访问码不对，请先在首页输入访问码" }, { status: 401 });
  if (MOCK) return NextResponse.json({ error: "演示模式不支持换色，需要配置 Lux3D Key" }, { status: 400 });
  const { id } = await ctx.params;
  const p = await getProduct(id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (p.task.status !== "done" || !p.glb) return NextResponse.json({ error: "3D 模型生成完成后才能换色" }, { status: 400 });
  if ((p.variants?.length ?? 0) >= MAX_VARIANTS) return NextResponse.json({ error: `每个商品最多 ${MAX_VARIANTS} 个配色` }, { status: 400 });

  const form = await req.formData();
  const prompt = String(form.get("prompt") || "").trim().slice(0, 200);
  const name = String(form.get("name") || "").trim().slice(0, 20) || prompt.slice(0, 12) || "新配色";
  const swatch = /^#[0-9a-f]{6}$/i.test(String(form.get("swatch") || "")) ? String(form.get("swatch")) : undefined;
  const ref = form.get("ref");
  const refFile = ref instanceof File && ref.size > 0 ? ref : null;
  if (!prompt && !refFile) return NextResponse.json({ error: "写一句想要的配色，或上传一张参考图" }, { status: 400 });

  const vid = newId();
  const v: Variant = {
    id: vid,
    name,
    prompt: prompt || undefined,
    swatch,
    stage: refFile ? "mesh" : "ref",
    task: { id: null, status: "queued", startedAt: new Date().toISOString() },
    createdAt: new Date().toISOString(),
  };

  try {
    if (refFile) {
      const buf = Buffer.from(await refFile.arrayBuffer());
      v.refImage = await saveFile(`images/${p.id}-${vid}-ref.jpg`, buf);
      v.refImageUrl = await uploadAsset(buf, `${vid}-ref.jpg`);
      const glb = await readFile(p.glb);
      if (!glb) throw new Error("找不到原模型");
      v.meshUrl = await uploadAsset(glb, `${p.id}.glb`);
      v.task.id = await createMaterialTransfer(v.refImageUrl, v.meshUrl);
    } else {
      const img = await readFile(p.image);
      if (!img) throw new Error("找不到商品主图");
      const imgUrl = await uploadAsset(img, p.image.split("/").pop()!);
      v.task.id = await createImageEdit(
        imgUrl,
        `同一件商品，造型、结构、图案位置和比例完全不变，只改变配色和材质：${prompt}。纯白背景，电商棚拍，柔和光线，主体完整居中，视角与原图一致。`,
      );
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }

  const saved = await patchProduct(p.id, (cur) => {
    cur.variants = [...(cur.variants ?? []), v];
  });
  return NextResponse.json({ product: saved ?? p, variant: v });
}
