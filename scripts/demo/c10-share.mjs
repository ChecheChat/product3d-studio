// 镜头 10：海外达人打开同一只马克杯的分享页（泰中双语），切换配色，电脑上显示 AR 二维码
import { clip, clickEl, moveTo, waitModel } from "./lib.mjs";
import { readFileSync } from "node:fs";
const ID = readFileSync(process.env.DEMO_OUT + "/new-id.txt", "utf8").trim();
await clip("c10-share", async (page, { base, mark }) => {
  await page.goto(`${base}/s/${ID}`);
  await waitModel(page, 2000);
  mark("loaded");
  await moveTo(page, page.getByText("3D Sample", { exact: false }).first(), 20);
  await page.waitForTimeout(800);
  await clickEl(page, page.getByRole("button", { name: /哑光黑/ }).first());
  await waitModel(page, 3000);
  mark("black");
  await clickEl(page, page.getByRole("button", { name: /ต้นฉบับ/ }));
  await waitModel(page, 2000);
  await clickEl(page, page.getByRole("button", { name: /AR/ }));
  mark("qr");
  await page.waitForTimeout(3500);
});
