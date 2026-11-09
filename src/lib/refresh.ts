import { MOCK, createExport, createMaterialTransfer, getTask, pickGlb, uploadAsset, type TaskState } from "./lux3d";
import { readFile, saveFile } from "./storage";
import { optimizeGlb } from "./optimize";
import { patchProduct, type Product, type TaskInfo, type Variant } from "./products";

const MOCK_DELAY_MS = 8000;
const now = () => new Date().toISOString();

async function downloadTo(rel: string, url: string) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`下载产物失败 HTTP ${res.status}`);
  return saveFile(rel, Buffer.from(await res.arrayBuffer()));
}

/** 查询一次 Lux3D 任务。返回新的 TaskInfo；成功时附带 outputs。查询出错时不改状态，下次再试 */
async function poll(task: TaskInfo): Promise<{ task: TaskInfo; outputs?: string[] }> {
  if (task.status === "done" || task.status === "failed") return { task };
  if (task.id == null) return { task };
  let t: TaskState;
  try {
    t = await getTask(task.id);
  } catch (e) {
    return { task: { ...task, error: e instanceof Error ? e.message : String(e) } };
  }
  if (t.status === 3) return { task: { ...task, status: "done", finishedAt: now(), error: undefined }, outputs: t.outputs?.map((o) => o.content) };
  if (t.status === 4) return { task: { ...task, status: "failed", error: "Lux3D 任务失败（status=4）" } };
  if (t.status === 6) return { task: { ...task, status: "failed", error: "任务已取消" } };
  const status = t.status === 1 ? "running" : "queued";
  return status === task.status ? { task } : { task: { ...task, status } };
}

const isUrl = (u?: string) => !!u && u !== "NOT_REQUESTED" && u !== "null" && /^https?:/.test(u);

/** 生成网页展示版 GLB；失败时退回用原始版，不影响主流程 */
async function makeWebVersion(rel: string): Promise<string | undefined> {
  const buf = await readFile(rel);
  if (!buf) return undefined;
  try {
    return await saveFile(rel.replace(/\.glb$/, ".web.glb"), await optimizeGlb(new Uint8Array(buf)));
  } catch (e) {
    console.error("[optimize] 失败，使用原始 GLB", rel, e);
    return undefined;
  }
}

/** 把本地 GLB 传到 Lux3D 可访问的地址（材质重绘、格式导出的输入） */
async function uploadModel(rel: string): Promise<string> {
  const buf = await readFile(rel);
  if (!buf) throw new Error(`找不到模型 ${rel}`);
  return uploadAsset(buf, rel.split("/").pop()!);
}

type ArHolder = { glb?: string; usdz?: string; arTask?: TaskInfo };

/** USDZ（iPhone AR）：没有就发起导出（1 积分），导出完成就下载。heavy=false 时只推进、不发起新任务 */
async function stepAr(h: ArHolder, usdzRel: string, heavy: boolean): Promise<boolean> {
  if (!h.glb || h.glb.startsWith("mock:") || h.usdz) return false;
  if (!h.arTask) {
    if (!heavy) return false;
    try {
      const url = await uploadModel(h.glb);
      h.arTask = { id: await createExport(url, ["usdz"]), status: "queued", startedAt: now() };
    } catch (e) {
      h.arTask = { id: null, status: "failed", startedAt: now(), error: e instanceof Error ? e.message : String(e) };
    }
    return true;
  }
  const r = await poll(h.arTask);
  if (r.task === h.arTask) return false;
  h.arTask = r.task;
  if (r.task.status === "done") {
    const url = r.outputs?.[2]; // 7 槽固定顺序：ZIP, GLB, USDZ, OBJ ZIP, FBX ZIP, STL, 3MF
    if (isUrl(url)) h.usdz = await downloadTo(usdzRel, url!);
    else h.arTask = { ...r.task, status: "failed", error: "导出成功但没有 USDZ" };
  }
  return true;
}

/** 推进一个配色版本：ref（图片编辑出参考图）→ mesh（材质重绘）→ done */
async function stepVariant(p: Product, v: Variant): Promise<boolean> {
  if (v.stage === "failed") return false;
  if (v.stage === "done") return false;
  const r = await poll(v.task);
  if (r.task === v.task) return false;
  v.task = r.task;
  if (r.task.status === "failed") {
    v.stage = "failed";
    return true;
  }
  if (r.task.status !== "done") return true;

  if (v.stage === "ref") {
    const ref = r.outputs?.[0];
    if (!isUrl(ref)) {
      v.stage = "failed";
      v.task = { ...v.task, status: "failed", error: "参考图生成成功但没有图片" };
      return true;
    }
    v.refImage = await downloadTo(`images/${p.id}-${v.id}-ref.png`, ref!);
    v.refImageUrl = ref;
    try {
      if (!v.meshUrl) v.meshUrl = await uploadModel(p.glb!);
      v.task = { id: await createMaterialTransfer(ref!, v.meshUrl), status: "queued", startedAt: now() };
      v.stage = "mesh";
    } catch (e) {
      v.stage = "failed";
      v.task = { id: null, status: "failed", startedAt: now(), error: e instanceof Error ? e.message : String(e) };
    }
    return true;
  }

  // mesh 阶段完成：5 槽固定顺序 ZIP, GLB, USDZ, OBJ ZIP, FBX ZIP
  const glbUrl = r.outputs?.[1];
  if (!isUrl(glbUrl)) {
    v.stage = "failed";
    v.task = { ...v.task, status: "failed", error: "材质重绘成功但没有 GLB" };
    return true;
  }
  v.glb = await downloadTo(`models/${p.id}-${v.id}.glb`, glbUrl!);
  v.glbWeb = await makeWebVersion(v.glb);
  v.stage = "done";
  return true;
}

/** 主模型：图生 3D 任务 */
async function stepMain(p: Product): Promise<boolean> {
  if (p.task.status === "done" || p.task.status === "failed") return false;
  if (MOCK) {
    if (Date.now() - new Date(p.task.startedAt).getTime() < MOCK_DELAY_MS) return false;
    p.task = { ...p.task, status: "done", finishedAt: now() };
    p.glb = "mock:/mock/sample.glb";
    return true;
  }
  if (p.task.id == null) {
    p.task = { ...p.task, status: "failed", error: p.task.error ?? "没有任务 ID" };
    return true;
  }
  const r = await poll(p.task);
  if (r.task === p.task) return false;
  p.task = r.task;
  if (r.task.status === "done") {
    const url = pickGlb(r.outputs?.map((content) => ({ content })));
    if (!url) p.task = { ...p.task, status: "failed", error: "任务成功但没有 GLB 产物" };
    else p.glb = await downloadTo(`models/${p.id}.glb`, url);
  }
  return true;
}

/**
 * 推进商品的所有异步任务。heavy=true（详情页轮询）时，才会发起新的付费任务或上传大文件（例如自动导出 USDZ）；
 * 列表页轮询用 heavy=false，只推进已有任务，避免一次列表请求做太多事。
 */
async function doRefresh(p: Product, heavy: boolean): Promise<Product> {
  let changed = await stepMain(p);
  if (p.glb && !p.glbWeb && !p.glb.startsWith("mock:")) {
    const web = await makeWebVersion(p.glb);
    if (web) {
      p.glbWeb = web;
      changed = true;
    }
  }
  if (!MOCK) {
    if (await stepAr(p, `models/${p.id}.usdz`, heavy)) changed = true;
    for (const v of p.variants ?? []) {
      if (await stepVariant(p, v)) changed = true;
      if (v.stage === "done" && v.glb && !v.glbWeb) {
        v.glbWeb = await makeWebVersion(v.glb);
        if (v.glbWeb) changed = true;
      }
      if (v.stage === "done" && (await stepAr(v, `models/${p.id}-${v.id}.usdz`, heavy))) changed = true;
    }
  }
  if (!changed) return p;
  // 只写回刷新负责的字段；配色按 id 合并，期间新建的配色和改过的朝向都保留
  const merged = await patchProduct(p.id, (cur) => {
    cur.task = p.task;
    cur.glb = p.glb;
    cur.glbWeb = p.glbWeb;
    cur.usdz = p.usdz;
    cur.arTask = p.arTask;
    const mine = new Map((p.variants ?? []).map((v) => [v.id, v]));
    cur.variants = (cur.variants ?? []).map((v) => mine.get(v.id) ?? v);
  });
  return merged ?? p;
}

/** 同一个商品同时只跑一次刷新（避免列表页和详情页同时轮询时重复下载或重复发起付费任务） */
const inflight = new Map<string, Promise<Product>>();
export function refreshProduct(p: Product, heavy = false): Promise<Product> {
  const running = inflight.get(p.id);
  if (running) return running;
  const job = doRefresh(p, heavy).finally(() => inflight.delete(p.id));
  inflight.set(p.id, job);
  return job;
}
