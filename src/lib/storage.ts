import { promises as fs } from "node:fs";
import path from "node:path";
import { del, get, list, put } from "@vercel/blob";

/**
 * 存储层：本地开发用硬盘 `.data/`；部署到 Vercel 后（有 BLOB_READ_WRITE_TOKEN）自动切换到 Vercel Blob 私有存储。
 * 所有文件都经 /api/files 读取，不直接暴露存储地址。
 */
const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;
const ROOT = path.join(process.cwd(), ".data");

export const storageKind = USE_BLOB ? "blob" : "fs";

function safeRel(rel: string) {
  const p = path.posix.normalize(rel.replace(/\\/g, "/")).replace(/^(\.\.(\/|$))+/, "").replace(/^\/+/, "");
  if (!p || p.startsWith("..")) throw new Error(`非法路径 ${rel}`);
  return p;
}

const TYPES: Record<string, string> = {
  glb: "model/gltf-binary",
  usdz: "model/vnd.usdz+zip",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  json: "application/json",
};
export function contentTypeOf(rel: string) {
  return TYPES[rel.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
}

/** 写文件。本地为原子写（临时文件 + rename）；Blob 为覆盖写。 */
export async function saveFile(rel: string, buf: Buffer | Uint8Array): Promise<string> {
  const r = safeRel(rel);
  if (USE_BLOB) {
    await put(r, Buffer.from(buf), {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: contentTypeOf(r),
      cacheControlMaxAge: r.endsWith(".json") ? 0 : 60 * 60 * 24 * 30,
    });
    return r;
  }
  const full = path.join(ROOT, r);
  await fs.mkdir(path.dirname(full), { recursive: true });
  const tmp = `${full}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await fs.writeFile(tmp, buf);
  await fs.rename(tmp, full);
  return r;
}

/** 以流的形式读取（给 /api/files 用，避免大文件整块进内存、也绕开函数响应体积限制） */
export async function openFile(rel: string): Promise<{ stream: ReadableStream<Uint8Array>; size?: number } | null> {
  const r = safeRel(rel);
  if (USE_BLOB) {
    const res = await get(r, { access: "private", useCache: !r.endsWith(".json") }).catch(() => null);
    if (!res || res.statusCode !== 200) return null;
    return { stream: res.stream, size: res.blob.size };
  }
  try {
    const buf = await fs.readFile(path.join(ROOT, r));
    return {
      stream: new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(buf));
          c.close();
        },
      }),
      size: buf.length,
    };
  } catch {
    return null;
  }
}

export async function readFile(rel: string): Promise<Buffer | null> {
  const f = await openFile(rel);
  if (!f) return null;
  return Buffer.from(await new Response(f.stream).arrayBuffer());
}

/** 列出某个前缀下的文件（相对路径） */
export async function listFiles(prefix: string): Promise<string[]> {
  const p = safeRel(prefix).replace(/\/?$/, "/");
  if (USE_BLOB) {
    const out: string[] = [];
    let cursor: string | undefined;
    do {
      const r = await list({ prefix: p, cursor, limit: 1000 });
      out.push(...r.blobs.map((b) => b.pathname));
      cursor = r.hasMore ? r.cursor : undefined;
    } while (cursor);
    return out;
  }
  try {
    const names = await fs.readdir(path.join(ROOT, p));
    return names.filter((n) => !n.endsWith(".tmp")).map((n) => p + n);
  } catch {
    return [];
  }
}

export async function deleteFile(rel: string) {
  const r = safeRel(rel);
  if (USE_BLOB) return del(r).catch(() => {});
  await fs.rm(path.join(ROOT, r), { force: true });
}

/** 文件不存在时返回 fallback；文件存在但损坏时抛错，绝不当成空数据 */
export async function readJson<T>(rel: string, fallback: T): Promise<T> {
  const buf = await readFile(rel);
  if (!buf) return fallback;
  return JSON.parse(buf.toString("utf8")) as T;
}

export async function writeJson(rel: string, data: unknown) {
  await saveFile(rel, Buffer.from(JSON.stringify(data, null, 2), "utf8"));
}

/** 进程内互斥锁：同一个 key 的读改写排队执行 */
const locks = new Map<string, Promise<unknown>>();
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(key) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(fn);
  locks.set(key, run.catch(() => {}));
  return run;
}

export function fileUrl(rel: string) {
  return `/api/files/${rel.split("/").map(encodeURIComponent).join("/")}`;
}
