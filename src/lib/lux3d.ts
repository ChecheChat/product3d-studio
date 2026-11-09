import { createHash } from "node:crypto";

const BASE = process.env.LUX3D_BASE_URL?.replace(/\/$/, "") || "https://api.aholo3d.cn";
const KEY = process.env.LUX3D_API_KEY ?? "";
export const MOCK = process.env.LUX3D_MOCK === "1" || !KEY;

type Envelope<T> = { f: unknown; c: string; m: string; d: T };

export type TaskState = {
  taskId: number;
  status: 0 | 1 | 3 | 4 | 6;
  outputs?: { content: string }[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: KEY,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await res.text();
  let json: Envelope<T> | null = null;
  try {
    json = JSON.parse(text) as Envelope<T>;
  } catch {
    throw new Error(`Lux3D ${path} 返回非 JSON（HTTP ${res.status}）：${text.slice(0, 200)}`);
  }
  if (!res.ok || json.c !== "0") {
    throw new Error(`Lux3D ${path} 失败：HTTP ${res.status} c=${json.c} ${json.m ?? ""}`);
  }
  return json.d;
}

/** 本地文件 → OUS 直传 → 返回 Lux3D 可访问的 URL。≤ blockSize（实测 5MB）走单文件，否则分片上传 */
export async function uploadAsset(buf: Buffer, filename: string): Promise<string> {
  const tokRes = await fetch(`${BASE}/asset/v1/token`, {
    headers: { Authorization: KEY },
    cache: "no-store",
  });
  const tokText = await tokRes.text();
  if (!tokRes.ok) throw new Error(`获取上传凭证失败：HTTP ${tokRes.status} ${tokText.slice(0, 200)}`);
  const parsed = JSON.parse(tokText) as
    | { ousToken: string; globalDomain: string; blockSize: number }
    | Envelope<{ ousToken: string; globalDomain: string; blockSize: number }>;
  const tok = "ousToken" in parsed ? parsed : parsed.d;
  if (!tok?.ousToken) throw new Error(`上传凭证格式异常：${tokText.slice(0, 200)}`);
  const md5 = createHash("md5").update(buf).digest("hex");
  const domain = tok.globalDomain.replace(/\/$/, "");
  const auth = { "ous-token-v2": tok.ousToken };

  if (buf.length <= tok.blockSize) {
    const form = new FormData();
    form.append("md5", md5);
    form.append("file", new Blob([new Uint8Array(buf)]), filename);
    const up = await fetch(`${domain}/ous/api/v2/single/upload`, { method: "POST", headers: auth, body: form });
    const upJson = (await up.json()) as Envelope<{ taskId: string }>;
    if (upJson.c !== "0") throw new Error(`上传失败：${upJson.c} ${upJson.m}`);
  } else {
    const blocks = Math.ceil(buf.length / tok.blockSize);
    const qs = new URLSearchParams({ md5, blocks: String(blocks), size: String(buf.length), name: filename });
    const init = await fetch(`${domain}/ous/api/v2/block/upload/init?${qs}`, { method: "POST", headers: auth });
    const initJson = (await init.json()) as Envelope<{ taskId: number; deduplicated?: boolean | null }>;
    if (initJson.c !== "0") throw new Error(`分片上传初始化失败：${initJson.c} ${initJson.m}`);
    if (!initJson.d?.deduplicated) {
      for (let i = 0; i < blocks; i++) {
        const part = buf.subarray(i * tok.blockSize, Math.min(buf.length, (i + 1) * tok.blockSize));
        const form = new FormData();
        form.append("block", String(i + 1));
        form.append("file", new Blob([new Uint8Array(part)]), filename);
        const r = await fetch(`${domain}/ous/api/v2/block/upload/part`, { method: "POST", headers: auth, body: form });
        const j = (await r.json()) as Envelope<null>;
        if (j.c !== "0") throw new Error(`第 ${i + 1}/${blocks} 片上传失败：${j.c} ${j.m}`);
      }
    }
  }

  for (let i = 0; i < 120; i++) {
    await sleep(500);
    const st = await fetch(`${domain}/ous/api/v2/upload/status`, { headers: auth, cache: "no-store" });
    const j = (await st.json()) as Envelope<{ status: number; url?: string; errorMsg?: string | null }>;
    const s = j.d?.status;
    if (s === 5 && j.d.url) return j.d.url;
    if (s === 6 || s === 8) throw new Error(`上传失败（status=${s}${j.d?.errorMsg ? "，" + j.d.errorMsg : ""}）`);
  }
  throw new Error("上传状态轮询超时");
}

export type Quality = "turbo" | "standard";

/** 单图传 img，多图（同一商品不同角度，第一张最清晰）传 imgs，最多 32 张 */
export async function createImgTo3d(imgUrls: string | string[], quality: Quality): Promise<number> {
  const list = Array.isArray(imgUrls) ? imgUrls : [imgUrls];
  const input = list.length > 1 ? { imgs: list.slice(0, 32) } : { img: list[0] };
  const body =
    quality === "turbo"
      ? { ...input, version: "G1-Turbo", outputFormat: ["glb"], enablePbr: true, faceCount: 100000 }
      : { ...input, version: "G1", faceCount: 200000 };
  return call<number>("/lux3d/v1/generate/img-to-3d/task/create", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** 材质重绘：用参考图给已有 GLB 换材质/换色 */
export async function createMaterialTransfer(refImgUrl: string, meshUrl: string): Promise<number> {
  return call<number>("/lux3d/v1/generate/material-transfer/task/create", {
    method: "POST",
    body: JSON.stringify({ img: refImgUrl, meshUrl, version: "v3.0-standard", outputFormat: ["glb"] }),
  });
}

/** 图片编辑：以商品图为参考、按文字生成一张新图（例如换配色），作为材质重绘的参考图 */
export async function createImageEdit(imgUrl: string, prompt: string): Promise<number> {
  return call<number>("/lux3d/v1/generate/multimodal-to-image/task/create", {
    method: "POST",
    body: JSON.stringify({ img: imgUrl, prompt }),
  });
}

/** 多格式导出，例如 ["usdz"] 给 iPhone AR Quick Look */
export async function createExport(modelUrl: string, formats: string[]): Promise<number> {
  return call<number>("/lux3d/v1/multi-format-export/task/create", {
    method: "POST",
    body: JSON.stringify({ modelUrl, outputFormat: formats }),
  });
}

export async function getTask(taskId: number): Promise<TaskState> {
  return call<TaskState>(`/lux3d/v1/generate/task/get?taskid=${taskId}`);
}

/** 从 outputs 里挑出 GLB 地址（G1: [zip, glb]; Turbo: 按请求格式） */
export function pickGlb(outputs: { content: string }[] | undefined): string | null {
  if (!outputs?.length) return null;
  const urls = outputs.map((o) => o.content).filter((c) => c && c !== "NOT_REQUESTED" && c !== "null");
  return urls.find((u) => /\.glb(\?|$)/i.test(u)) ?? (urls.length >= 2 ? urls[1] : urls[0]) ?? null;
}
