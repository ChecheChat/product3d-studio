// 镜头 5–8a：旋转查看 → 三视图 → 转盘视频 → 提交换色
import { clip, clickEl, moveTo, waitModel } from "./lib.mjs";
import { readFileSync } from "node:fs";
const ID = readFileSync(process.env.DEMO_OUT + "/new-id.txt", "utf8").trim();
const CODE = process.env.ACCESS_CODE;
const only = process.argv[2];

async function drag(page, from, to, steps = 70) {
  const c = await page.locator("canvas").boundingBox();
  await page.mouse.move(c.x + c.width * from[0], c.y + c.height * from[1], { steps: 15 });
  await page.mouse.down();
  await page.mouse.move(c.x + c.width * to[0], c.y + c.height * to[1], { steps });
  await page.mouse.up();
}

if (!only || only === "c05")
  await clip("c05-rotate", async (page, { base, mark }) => {
    await page.goto(`${base}/room/${ID}`);
    await waitModel(page, 2000);
    mark("loaded");
    await clickEl(page, page.getByRole("button", { name: "停止旋转" }));
    await page.waitForTimeout(600);
    await drag(page, [0.3, 0.5], [0.75, 0.45]);
    await page.waitForTimeout(500);
    await drag(page, [0.7, 0.35], [0.4, 0.6]);
    await page.waitForTimeout(500);
    await page.mouse.move(700, 300, { steps: 10 });
    await page.mouse.wheel(0, -260);
    await page.waitForTimeout(1500);
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(1200);
    mark("done");
  });

if (!only || only === "c06")
  await clip("c06-views", async (page, { base, mark }) => {
    await page.goto(`${base}/room/${ID}`);
    await waitModel(page, 1500);
    await clickEl(page, page.getByRole("button", { name: /三视图/ }));
    await page.waitForFunction(() => document.querySelectorAll("section img").length === 6, null, { timeout: 30000 });
    mark("views");
    await page.waitForTimeout(800);
    await page.mouse.move(700, 600, { steps: 10 });
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 60);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(800);
    await moveTo(page, page.locator("section img").nth(0));
    await page.waitForTimeout(500);
    await moveTo(page, page.locator("section img").nth(2));
    await page.waitForTimeout(500);
    await moveTo(page, page.getByRole("button", { name: /下载合成图/ }));
    await page.waitForTimeout(1500);
  });

if (!only || only === "c07")
  await clip("c07-video", async (page, { base, mark }) => {
    await page.goto(`${base}/room/${ID}`);
    await waitModel(page, 1500);
    page.on("download", () => {});
    await clickEl(page, page.getByRole("button", { name: /360/ }));
    mark("recording");
    await page.waitForTimeout(7500);
    mark("done");
  });

if (!only || only === "c08a")
  await clip("c08a-color", async (page, { base, mark }) => {
    await page.addInitScript((c) => localStorage.setItem("sample-room-access-code", c), CODE);
    await page.goto(`${base}/room/${ID}`);
    await waitModel(page, 1500);
    await moveTo(page, page.getByText("一键换色"));
    await page.waitForTimeout(600);
    await clickEl(page, page.getByRole("button", { name: "哑光黑" }));
    await page.waitForTimeout(1200);
    await clickEl(page, page.getByRole("button", { name: /生成新配色/ }));
    await page.waitForFunction(() => document.body.innerText.includes("出参考图"), null, { timeout: 60000 });
    mark("submitted");
    await page.waitForTimeout(4000);
  });
