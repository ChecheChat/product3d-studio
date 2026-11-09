import { NextResponse } from "next/server";
import { getProduct, patchProduct } from "@/lib/products";
import { refreshProduct } from "@/lib/refresh";
import { MOCK } from "@/lib/lux3d";
import { codeOk } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await getProduct(id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const refreshed = await refreshProduct(p, true);
  return NextResponse.json({ product: refreshed, mock: MOCK });
}

/** 目前只允许改朝向校正 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!codeOk(req)) return NextResponse.json({ error: "访问码不对" }, { status: 401 });
  const { id } = await ctx.params;
  const p = await getProduct(id);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { yaw?: number };
  if (body.yaw !== undefined && ![0, 90, 180, 270].includes(body.yaw)) {
    return NextResponse.json({ error: "yaw 只能是 0/90/180/270" }, { status: 400 });
  }
  const saved = await patchProduct(id, (cur) => {
    if (body.yaw !== undefined) cur.yaw = body.yaw as 0 | 90 | 180 | 270;
  });
  return NextResponse.json({ product: saved ?? p });
}
