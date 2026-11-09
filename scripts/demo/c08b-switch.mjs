// 镜头 8b：换色完成后，在原款和哑光黑之间切换，并看一眼黑色款的三视图
import { clip, clickEl, waitModel } from "./lib.mjs";
import { readFileSync } from "node:fs";
const ID = readFileSync(process.env.DEMO_OUT + "/new-id.txt", "utf8").trim();
await clip("c08b-switch", async (page, { base, mark }) => {
  await page.goto(`${base}/room/${ID}`);
  await waitModel(page, 2000);
  mark("main");
  await clickEl(page, page.getByRole("button", { name: /哑光黑/ }).first());
  await waitModel(page, 3500);
  mark("black");
  await clickEl(page, page.getByRole("button", { name: "原款" }));
  await waitModel(page, 2500);
  await clickEl(page, page.getByRole("button", { name: /哑光黑/ }).first());
  await waitModel(page, 2500);
  await clickEl(page, page.getByRole("button", { name: /三视图/ }));
  await page.waitForFunction(() => document.querySelectorAll("section img").length === 6, null, { timeout: 30000 });
  await page.mouse.move(700, 600, { steps: 10 });
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(60);
  }
  mark("views");
  await page.waitForTimeout(3000);
});
