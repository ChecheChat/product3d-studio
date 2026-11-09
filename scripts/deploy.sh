#!/usr/bin/env bash
# 发布到 Vercel 正式环境（项目 product3d-studio → https://product3d-studio.vercel.app）。
# 国内入口 https://product3d-studio.netlify.app 是转发站，网站代码更新后不用重新部署它。
# 环境变量（LUX3D_API_KEY、LUX3D_BASE_URL、ACCESS_CODE、BLOB_READ_WRITE_TOKEN）已在 Vercel 项目里配好。
# 注意：往 Vercel 写环境变量时值不能带引号（vercel env pull 会给 .env.local 的值加引号）。
set -euo pipefail
cd "$(dirname "$0")/.."
grep -q '"projectName":"product3d-studio"' .vercel/project.json || { echo "当前目录没有关联到 product3d-studio，停止"; exit 1; }
npx tsc --noEmit -p .
npx -y vercel@latest deploy --prod --yes
