// Demo 录屏公共部分：无界面 Chromium + 录像 + 页面内模拟光标（录屏本身不带鼠标）
import { chromium } from "playwright";
import { mkdirSync, renameSync } from "node:fs";
import path from "node:path";

export const OUT = process.env.DEMO_OUT;
export const W = 1440, H = 810;

const CURSOR = `
(() => {
  if (window.__demoCursor) return; window.__demoCursor = 1;
  const add = () => {
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;z-index:2147483647;left:0;top:0;width:22px;height:22px;margin:-3px 0 0 -3px;pointer-events:none;transition:transform .05s linear';
    c.innerHTML = '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l14 8-6 1.6L8.5 18z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
    const r = document.createElement('div');
    r.style.cssText = 'position:fixed;z-index:2147483646;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:3px solid #a78bfa;pointer-events:none;opacity:0;transform:scale(.4);transition:opacity .35s, transform .35s';
    document.body.appendChild(r);
    addEventListener('mousemove', e => { c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)'; }, true);
    addEventListener('mousedown', e => { r.style.left = e.clientX + 'px'; r.style.top = e.clientY + 'px'; r.style.transition = 'none'; r.style.opacity = 1; r.style.transform = 'scale(.4)'; requestAnimationFrame(() => { r.style.transition = 'opacity .45s, transform .45s'; r.style.opacity = 0; r.style.transform = 'scale(1.4)'; }); }, true);
  };
  if (document.body) add(); else addEventListener('DOMContentLoaded', add);
})();`;

export async function clip(name, fn, { base = "http://localhost:3400" } = {}) {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
    recordVideo: { dir: path.join(OUT, "_raw"), size: { width: W, height: H } },
    colorScheme: "dark",
    locale: "zh-CN",
  });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  const t0 = Date.now();
  const marks = [];
  const mark = (label) => marks.push({ label, t: (Date.now() - t0) / 1000 });
  try {
    await fn(page, { base, mark });
  } finally {
    const video = page.video();
    await ctx.close();
    await browser.close();
    const src = await video.path();
    renameSync(src, path.join(OUT, `${name}.webm`));
    console.log(`[${name}] 录制完成 ${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(marks));
  }
}

/** 平滑移动鼠标到元素中心 */
export async function moveTo(page, locator, steps = 25) {
  const b = await locator.boundingBox();
  if (!b) throw new Error("元素不可见");
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps });
  return b;
}
export async function clickEl(page, locator) {
  await moveTo(page, locator);
  await page.waitForTimeout(250);
  await page.mouse.down();
  await page.mouse.up();
}
/** 等 3D 模型加载完（加载提示消失），再多等一会儿让画面稳定 */
export async function waitModel(page, extra = 1500) {
  await page.waitForFunction(() => !document.body.innerText.includes("模型加载中"), null, { timeout: 90000 });
  await page.waitForTimeout(extra);
}
