# syntax=docker/dockerfile:1
# Build context: repository root   (docker build -f apps/web/Dockerfile .)

FROM node:22-alpine AS builder
RUN npm install --global pnpm@12.21.0
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @synccode/web...

COPY apps/web apps/web
COPY packages/shared packages/shared

# NEXT_PUBLIC_* values are inlined into the browser bundle at build time.
ARG NEXT_PUBLIC_SYNC_WS_URL=ws://localhost:8080
ENV NEXT_PUBLIC_SYNC_WS_URL=$NEXT_PUBLIC_SYNC_WS_URL NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @synccode/web build

FROM node:22-alpine AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# `output: 'standalone'` traces exactly the files the server needs.
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
