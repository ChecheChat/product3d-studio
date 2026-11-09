// 把演示商品的测试名字改成正式名字（云端 + 本地）
import { get, put } from "@vercel/blob";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
const CHANGES = {
  avofy290lv: { name: "无线游戏鼠标", brand: "示例品牌", notes: "人体工学外壳，侧键 + 蓝色灯带" },
  uo5dmmnu6r: { name: "手绘海浪陶瓷马克杯", brand: "示例品牌", notes: "手绘海浪纹，哑光釉面" },
};
for (const [id, patch] of Object.entries(CHANGES)) {
  const rel = `products/${id}.json`;
  const r = await get(rel, { access: "private", useCache: false }).catch(() => null);
  if (r?.statusCode === 200) {
    const p = JSON.parse(await new Response(r.stream).text());
    Object.assign(p, patch);
    await put(rel, JSON.stringify(p, null, 2), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json", cacheControlMaxAge: 0 });
    console.log("云端已改", id, "→", p.name, "/", p.brand);
  }
  const local = `.data/${rel}`;
  if (existsSync(local)) {
    const p = JSON.parse(readFileSync(local, "utf8"));
    Object.assign(p, patch);
    writeFileSync(local, JSON.stringify(p, null, 2));
    console.log("本地已改", id);
  }
}
