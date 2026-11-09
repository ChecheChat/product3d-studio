# 商品 3D 工作台 · Powered by Aholo Lux3D

参加「群核科技 Aholo 全球 3D AI 黑客松」（提交截止 2026-11-19 19:00）。
一句话：一张商品图 → Aholo Lux3D 生成 3D 模型 → 三视图 / 多角度图 / 360° 转盘视频 / 分享页。不用建模、不用寄样。个人商家一人出全套商品素材；跨境品牌把 3D 样品直接发给海外达人开箱（比赛主线案例）。

## 本地运行
```bash
cp .env.example .env.local   # 填 LUX3D_API_KEY；留空则是 mock 模式（用 public/mock/sample.glb 占位）
npm run dev -- -p 3400
```

## 线上地址
- 国内入口（给评委、国内用户）：https://product3d-studio.netlify.app
- 海外入口：https://product3d-studio.vercel.app
- 新建、修改商品需要访问码，值在 `.env.local` 的 `ACCESS_CODE`；查看商品和分享页不需要
- 发布更新：`bash scripts/deploy.sh`

## 页面
- `/` 工作台：上传商品图 + 我的商品
- `/room/[id]` 商品详情：3D 查看、360° 转盘视频、三视图/多角度图（6 张透明底 PNG + 合成图）、一键换色、AR 看实物、复制分享链接、下载 GLB
- `/s/[id]` 分享页（泰中双语，给达人/客户）：只读查看 + 下载转盘视频 + 多角度图

## 技术
- Next.js 16 App Router + Tailwind 4；Three.js / react-three-fiber / drei
- `src/lib/lux3d.ts`：OUS 文件上传、img-to-3d（G1 / G1-Turbo）、材质重绘、多格式导出、任务查询
- `src/lib/refresh.ts`：轮询 Lux3D 任务，成功后把 GLB 下到本地 `.data/models/`（官方产物 URL 只有 2 小时有效）
- 三视图：`ModelViewer.tsx` 里 `SceneBridge` 用正交相机对准模型包围盒，渲染正/右/俯/后/左/3-4 六个视角，`composeSheet` 拼成带标签的合成图。注意：浏览器标签页在后台（隐藏）时 R3F 画布没有尺寸，Canvas 不会挂载，按钮会报「画布未就绪」，这是环境问题不是 bug。
- 转盘视频：浏览器端 `canvas.captureStream` + `MediaRecorder`，6 秒一圈，Safari/Chrome 出 mp4 或 webm
- 存储：本地开发用 `.data/`；线上用 Vercel Blob 私有存储（香港区），一商品一个 JSON，文件全部经 `/api/files` 流式读取。本地数据迁到云端：`scripts/migrate-to-blob.mjs`
- 国内入口：Netlify 转发站（`../netlify-proxy/deploy.sh`），新站默认「仅团队可见」，需用接口把 `sso_login` 关掉

## Demo 视频
- 录屏：`scripts/demo/*.mjs`（Playwright 无界面 Chromium，模拟光标）
- 剪辑：`python scripts/demo/render.py <素材目录> <输出.mp4>`（剪辑清单 + 字幕条 + 文字卡，手机实拍放左侧）
- 配乐：`python scripts/demo/music.py <素材目录>/bgm.wav 117`（纯代码合成的原创配乐，渲染时自动混入）

## 进度
- [x] 上传 1–8 张图 → Lux3D 生成 → 自动压缩 → 3D 查看、三视图、转盘视频、分享页
- [x] 一键换色：预设/文字 → Lux3D 图片生成出参考图 → 材质重绘（约 6 分钟、31 积分）；或直接上传参考图（约 5 分钟、19 积分）
- [x] AR：每个模型和配色生成完自动导出 USDZ（1 积分）；iPhone 走 AR Quick Look，安卓走 Scene Viewer，电脑显示二维码
- [x] 云端存储 + 部署上线，国内外双入口
- [x] 项目报告书、Demo 视频
