# Lux3D API 速查（摘自 https://lux3d.aholo3d.cn/docs ，2026-11-08）

- 鉴权：Header `Authorization: <ApiKey>`，**不加 Bearer**。国内 Host `https://api.aholo3d.cn`（无前缀）；国际 `https://api.aholo.ai/global`。两套 Key 不通用。
- 流程：创建任务 → 返回 `d`(taskid, long) → 每 10–15s GET `/lux3d/v1/generate/task/get?taskid=` → `d.status` 0 初始化 /1 运行 /3 成功 /4 失败 /6 取消 → `d.outputs[].content`。
- **产物 URL 有效期 2 小时**，成功后立即下载转存。
- 并发：免费账号最多 5 个进行中任务，超了返回 `GENERATION_CONCURRENCY_LIMIT_EXCEEDED`（不扣费）。
- 图片须是服务端可访问 URL；本地文件先走 Asset 文件上传接口拿 URL。

## 图生 3D  POST /lux3d/v1/generate/img-to-3d/task/create
```json
{"img":"https://.../product.jpg","version":"G1","faceCount":300000}
```
- `version` 必填：`G1`（固定返回 ZIP + PBR GLB，outputs 顺序 ZIP, GLB, [PLY]）或 `G1-Turbo`（`outputFormat` 任选 zip/glb/ply，`enablePbr:false` 得白模）。
- `imgs`: 1–32 张多图，第一张放最清晰完整的；与 `img` 二选一。
- `faceCount` 10000–300000，默认 300000。`aiPredictSize` 默认 true；`customSize` 毫米高度。
- 样品间用法：G1-Turbo + `outputFormat:["glb"]` 先快速预览（~40s），满意再 G1 出 PBR（~5min）。

## 文生 3D  POST /lux3d/v1/generate/text-to-3d/task/create
`{"prompt":"...","style":"photorealistic|cartoon|anime|hand_painted|cyberpunk|fantasy|glass","version":"G1","img":"可选参考图"}`

## 材质重绘（换色换材质）POST /lux3d/v1/generate/material-transfer/task/create
`{"img":"材质参考图","meshUrl":"原模型.glb","version":"v3.0-standard","outputFormat":["glb"]}` → outputs 固定 5 槽：ZIP, GLB, USDZ, OBJ ZIP, FBX ZIP（未请求为 NOT_REQUESTED）。

## 四视图  POST /lux3d/v1/generate/image-to-four-view/task/create
`{"img":"...","prompt":"保持主体造型与材质一致"}` → content 为 4 个 URL 的 JSON 数组字符串（正面偏侧、反向偏侧、侧面、背面）。可作为 G1-Turbo 的 imgs 输入，也可直接当商品多角度图用。

## 多格式导出  POST /lux3d/v1/multi-format-export/task/create
`{"modelUrl":"xxx.glb","outputFormat":["usdz"]}` → 7 槽固定顺序 ZIP, GLB, USDZ, OBJ ZIP, FBX ZIP, STL, 3MF。**USDZ 可给 iPhone AR Quick Look 看实物尺寸**。

## 其他
- 多模态单图 `/generate/multimodal-to-image/task/create`（img 和/或 prompt → 一张图）
- 部件拆分 `/part-split/task/create` {glbUrl}
- 关节化 `/articulation-animation/task/create` {glbUrl, prompt}（如“盖子开合”）
- 重拓扑 `/mesh-retopology/task/create` {modelUrl, faceLimit, quad, bakeTextures}
- 绑骨 `/animations/rig/task/create` {modelUrl}；动画重定向 `/animations/retarget/task/create` {rigModelUrl, animationIds}
- 记录分页 GET `/lux3d/v1/generate/task/list?page=&pagesize=&status=`
- Skill：SkillHub `@user_97275c6e/lux3d-cn`，环境变量 `LUX3D_API_KEY`、`LUX3D_BASE_URL=https://api.aholo3d.cn`。
- 申请国内 API Key：https://lux3d.aholo3d.cn/lux3d/home?auth_action=get_api&entry_type=website

## Asset 文件上传（本地图片 → 可访问 URL）
完整 OpenAPI 见同目录 `aholo-openapi.json`（来源 https://labs.aholo3d.cn/api-docs/openapi.json ）。
1. `GET https://api.aholo3d.cn/asset/v1/token`，Header `Authorization: <ApiKey>` → `{ousToken, globalDomain(如 https://ous-cos.kujiale.com), blockSize(实测 5MB)}`
2. 文件 ≤ blockSize：`POST {globalDomain}/ous/api/v2/single/upload`，Header `ous-token-v2: <ousToken>`，multipart 字段 `md5`（小写十六进制）+ `file` → `{c:"0", d:{taskId}}`
   文件 > blockSize：`POST {globalDomain}/ous/api/v2/block/upload/init?md5=&blocks=&size=&name=` → 多次 `POST .../block/upload/part`（并发 ≤2）
3. 轮询 `GET {globalDomain}/ous/api/v2/upload/status`（Header `ous-token-v2`），间隔 ≥200ms；`d.status`：5 成功（取 `d.url`），6/8 失败终态，其他继续
4. 把 `url` 填入 img-to-3d 的 `img`
**样品间实现决定**：前端把商品图压到 ≤900KB（长边 1024 JPEG），远低于实测 5MB 上限，只走单文件上传。

## 实测记录
| 日期 | 输入 | 档位 | 用时 | 积分 | GLB 大小 | 备注 |
|---|---|---|---|---|---|---|
| 2026-11-09 | 官方示例：黑色皮质办公椅（白底单图 1600²） | G1-Turbo, faceCount 100000 | 约 1 分 24 秒 | 1 | 12.4MB | 朝向正确（照片正面 = 正视图）；背面合理补全；黑色材质在当前灯光下偏暗；GLB 偏大，分享到手机前考虑压缩 |
| 2026-11-09 | 陶瓷马克杯（文生图生成），单图 | G1-Turbo | 69s | 1 | 8.7MB | 外形、把手、内釉准；杯身波浪纹糊成乱线 |
| 2026-11-09 | 陶瓷马克杯，主图 + 四视图共 5 张 | G1-Turbo | 106s | 1 | 8.9MB | 背面图案位置对了，但花纹仍糊 |
| 2026-11-09 | 陶瓷马克杯，5 张 | **G1** | 306s | **20** | 6.5MB | **波浪纹清晰完整、釉面有光泽，明显最好** |
| 2026-11-09 | 游戏鼠标（文生图生成），单图 | G1-Turbo | 95s | 1 | 9.2MB | 外形对，侧键模糊，蓝色灯带丢失，看不到的面细节少 |
| 2026-11-09 | 游戏鼠标，5 张 | G1-Turbo | 69s | 1 | 9.1MB | 侧键、滚轮、外壳都清楚；灯带丢失；**正面朝向反了，需校正 180°** |

### 其他接口积分（实测）
- 文生图（multimodal-to-image）：12 积分，约 40 秒
- 四视图（image-to-four-view）：24 积分，约 80 秒

### 结论
- 有图案、文字、logo 的商品必须用 G1 高质量档；Turbo 只适合看外形。上传表单默认改为高质量。
- 多图输入能修正背面和侧面，单图看不到的部分细节会明显变少。
- 发光、透明效果（灯带）目前都会丢失。
- 原始 GLB 有两张 2048 PNG 贴图，约 9MB，必须压缩后再给网页展示：WebP 1024 + meshopt 后 0.7–1.1MB，见 `src/lib/optimize.ts`。
- Lux3D 按真实尺寸缩放模型（鼠标约 12cm），查看器里统一缩放到同一观看尺寸。
- 3/4 角度拍的商品，Lux3D 认定的「正面」可能和人的理解不同，详情页有「校正正面」按钮，每次转 90°。

## 换色与 AR 实测（2026-11-09）
| 步骤 | 接口 | 用时 | 积分 |
|---|---|---|---|
| 大文件上传（6.5MB GLB，分片） | OUS block upload | 9 秒 | 0 |
| USDZ 导出 | multi-format-export | 11–20 秒 | 1 |
| 文字改色出参考图 | multimodal-to-image（img + prompt） | 35 秒 | 12 |
| 材质重绘 | material-transfer v3.0-standard | 约 5 分钟 | 19 |

- 材质重绘输出 5 槽：ZIP, GLB, USDZ, OBJ ZIP, FBX ZIP；GLB 在第 2 个（下标 1）。
- 多格式导出输出 7 槽：ZIP, GLB, USDZ, OBJ ZIP, FBX ZIP, STL, 3MF；USDZ 在下标 2。输入 GLB 时第 1 槽是字符串 "null"。
- 图片编辑提示词要强调「造型、结构、图案位置和比例完全不变，只改变配色和材质」，否则造型会变。
- 效果：马克杯白蓝 → 黑金、鼠标黑 → 奶油白都很好；把手内侧等遮挡处偶尔有一小块颜色不对。
