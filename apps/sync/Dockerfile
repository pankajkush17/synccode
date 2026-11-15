# syntax=docker/dockerfile:1
# Build context: repository root   (docker build -f apps/sync/Dockerfile .)

FROM node:22-alpine AS builder
RUN npm install --global pnpm@12.21.0
WORKDIR /repo

# Manifests first, so the dependency layer is cached until they change.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/sync/package.json apps/sync/
COPY packages/shared/package.json packages/shared/
COPY packages/db/package.json packages/db/
RUN pnpm install --frozen-lockfile --filter @synccode/sync...

COPY apps/sync apps/sync
COPY packages packages
RUN pnpm --filter @synccode/sync build \
 && pnpm --filter @synccode/sync deploy --prod /out \
 && cp -r apps/sync/dist /out/dist

FROM node:22-alpine AS runner
ENV NODE_ENV=production PORT=4000
WORKDIR /app
COPY --from=builder --chown=node:node /out/node_modules ./node_modules
COPY --from=builder --chown=node:node /out/package.json ./package.json
COPY --from=builder --chown=node:node /out/dist ./dist
USER node
EXPOSE 4000
HEALTHCHECK --interval=5s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/readyz" || exit 1
# Exec form: node is PID 1 and receives SIGTERM directly, which GracefulShutdown relies on.
CMD ["node", "dist/index.js"]
