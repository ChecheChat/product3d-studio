import { clip, waitModel } from "./lib.mjs";
await clip("test", async (page, { base }) => {
  await page.goto(`${base}/room/uo5dmmnu6r`);
  await waitModel(page);
  const c = await page.locator("canvas").boundingBox();
  await page.mouse.move(c.x + c.width * 0.3, c.y + c.height * 0.5, { steps: 10 });
  await page.mouse.down();
  await page.mouse.move(c.x + c.width * 0.7, c.y + c.height * 0.45, { steps: 60 });
  await page.mouse.up();
  await page.waitForTimeout(2000);
});
