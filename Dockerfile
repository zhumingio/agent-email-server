# ---------- 构建阶段 ----------
FROM node:24-alpine AS build
WORKDIR /app

# 启用 pnpm（corepack 内置）
RUN corepack enable && corepack prepare pnpm@11.7.0 --activate

COPY . .

# 安装依赖（使用工作区内 store；esbuild 构建已通过 pnpm-workspace.yaml 的 allowBuilds 放行）
RUN pnpm install --frozen-lockfile --store-dir /app/.pnpm-store

# 构建后端与前端
RUN pnpm --filter @zmail/api build && pnpm --filter @zmail/web build

# 产出后端生产运行时（仅 prod 依赖）
RUN pnpm --filter @zmail/api deploy --legacy --prod /app/runtime

# 将前端静态产物并入运行时
RUN cp -r packages/web/dist /app/runtime/web-dist

# ---------- 运行阶段 ----------
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DATA_DIR=/data
ENV WEB_DIST=/app/web-dist

COPY --from=build /app/runtime /app

RUN mkdir -p /data

EXPOSE 3000
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
