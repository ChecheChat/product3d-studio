import { contentTypeOf, openFile } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const rel = path.map(decodeURIComponent).join("/");
  // 只允许读商品图和模型，商品数据 JSON 走 /api/products
  if (!/^(images|models)\//.test(rel)) return new Response("not found", { status: 404 });
  const f = await openFile(rel).catch(() => null);
  if (!f) return new Response("not found", { status: 404 });
  const headers: Record<string, string> = {
    "Content-Type": contentTypeOf(rel),
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  if (f.size) headers["Content-Length"] = String(f.size);
  return new Response(f.stream, { headers });
}
