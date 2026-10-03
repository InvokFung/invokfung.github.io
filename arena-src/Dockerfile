# syntax=docker/dockerfile:1
# TripleFind Arena server image.
#   docker build -t triplefind-arena .          (from arena-src/)
#   docker run -p 8782:8782 triplefind-arena
#
# Stage 1 installs the workspace and bundles the server with esbuild into one file
# (ws and the MongoDB driver included). Stage 2 is node:22-alpine plus that file:
# no node_modules, no compiler, no source, running as the unprivileged `node` user.

FROM node:22-alpine AS build
WORKDIR /src
# Manifests first, so the dependency layer stays cached while source changes.
COPY package.json package-lock.json ./
COPY packages/engine/package.json packages/engine/
COPY packages/protocol/package.json packages/protocol/
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
COPY tools/loadtest/package.json tools/loadtest/
# Behind a TLS-intercepting proxy, pass its CA as a build secret (never baked into a layer):
#   docker build --secret id=npm_ca,src=/path/to/ca.pem --build-arg HTTPS_PROXY=... .
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -s /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --no-audit --no-fund \
      --workspace @arena/server --workspace @arena/core --workspace @arena/engine --workspace @arena/protocol \
      --include-workspace-root
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/server ./apps/server
RUN npm run build:server

FROM node:22-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8782 \
    ARENA_STORE=memory \
    ARENA_FILE=/data/events.jsonl \
    ARENA_DRAIN_MS=5000
WORKDIR /app
RUN mkdir -p /data && chown node:node /data
COPY --from=build --chown=node:node /src/apps/server/dist/ ./
USER node
VOLUME ["/data"]
EXPOSE 8782
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8782/healthz >/dev/null || exit 1
STOPSIGNAL SIGTERM
CMD ["node", "--enable-source-maps", "server.mjs"]
