"use client";
import type { Product } from "./products";

export function modelSrc(rel?: string): string | null {
  if (!rel) return null;
  if (rel.startsWith("mock:")) return rel.slice(5);
  return `/api/files/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

export function imageSrc(rel: string) {
  return `/api/files/${rel.split("/").map(encodeURIComponent).join("/")}`;
}

export type ProductDTO = Product;

/** 浏览器端把图片压到 ≤ maxBytes（长边 maxSide，JPEG） */
export async function compressImage(file: File, maxSide = 1024, maxBytes = 900 * 1024): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  let q = 0.9;
  for (let i = 0; i < 6; i++) {
    const blob: Blob = await new Promise((res) => canvas.toBlob((b) => res(b!), "image/jpeg", q));
    if (blob.size <= maxBytes || q <= 0.5) {
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }
    q -= 0.1;
  }
  throw new Error("图片压缩失败");
}

const CODE_KEY = "sample-room-access-code";
export function getAccessCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}
export function setAccessCode(code: string) {
  try {
    localStorage.setItem(CODE_KEY, code);
  } catch {}
}
