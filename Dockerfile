# syntax=docker/dockerfile:1.7

# Keep the build on Docker Hub so mainland deployments can use a registry mirror.
ARG PNPM_VERSION=12.4.2
ARG NODE_VERSION=24
ARG DOCKER_REGISTRY=docker.io/library

FROM ${DOCKER_REGISTRY}/node:${NODE_VERSION}-slim AS base

ARG PNPM_VERSION
ARG NODE_VERSION

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate

WORKDIR /app

ENV TURBO_TELEMETRY_DISABLED=1

FROM base AS pruner
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm dlx turbo@2.9.12 prune web server --docker

FROM base AS builder
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ ./
RUN rm -rf apps/web/dist apps/server/dist && pnpm turbo run build --filter=web --filter=server --force

FROM base AS runtime-pruner
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm dlx turbo@2.9.12 prune server --docker

FROM base AS runtime-deps
COPY --from=runtime-pruner /app/out/json/ ./
COPY --from=runtime-pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm install --prod --frozen-lockfile

FROM ${DOCKER_REGISTRY}/node:${NODE_VERSION}-slim AS runtime

LABEL org.opencontainers.image.licenses="MIT"
LABEL org.opencontainers.image.title="Weekly Resume"
LABEL org.opencontainers.image.description="A resume builder."

ENV NODE_ENV="production" \
    PORT=3000 \
    LOCAL_STORAGE_PATH=/app/data

WORKDIR /app

RUN mkdir -p /app/apps/server /app/apps/web /app/data && chown node:node /app/data

COPY --from=runtime-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=pruner --chown=node:node /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=runtime-deps --chown=node:node /app/apps/server/package.json ./apps/server/package.json
COPY --from=runtime-deps --chown=node:node /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder --chown=node:node /app/apps/web/dist ./apps/web/dist
COPY --from=builder --chown=node:node /app/apps/server/dist ./apps/server/dist
COPY --from=pruner --chown=node:node /app/migrations ./migrations

WORKDIR /app

USER node

EXPOSE 3000/tcp
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT ?? 3000}/api/health`).then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"]

CMD ["node", "apps/server/dist/index.mjs"]
