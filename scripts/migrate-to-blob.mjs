// 把本地 .data/ 里的商品数据、图片、模型上传到 Vercel Blob（私有）。
// 用法：BLOB_READ_WRITE_TOKEN=... node scripts/migrate-to-blob.mjs [只传路径里包含这段文字的文件]
import { put, list } from "@vercel/blob";
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(".data");
const TYPES = { glb: "model/gltf-binary", usdz: "model/vnd.usdz+zip", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", json: "application/json" };

async function walk(dir) {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const files = (await walk(ROOT))
  .map((f) => path.relative(ROOT, f).split(path.sep).join("/"))
  .filter((r) => /^(products|images|models)\//.test(r) && !r.endsWith(".tmp"))
  .filter((r) => !process.argv[2] || r.includes(process.argv[2]));

let bytes = 0;
for (const rel of files) {
  const buf = await fs.readFile(path.join(ROOT, rel));
  await put(rel, buf, {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: TYPES[rel.split(".").pop()] ?? "application/octet-stream",
    cacheControlMaxAge: rel.endsWith(".json") ? 0 : 60 * 60 * 24 * 30,
    multipart: buf.length > 5 * 1024 * 1024,
  });
  bytes += buf.length;
  console.log("✓", rel, Math.round(buf.length / 1024) + "KB");
}
const { blobs } = await list({ limit: 1000 });
console.log(`上传 ${files.length} 个文件，共 ${(bytes / 1e6).toFixed(1)}MB；存储里现有 ${blobs.length} 个文件`);
