# syntax=docker/dockerfile:1
# Relay gateway server image.
#   docker build -t relay .                 (from relay-src/)
#   docker run -p 8786:8786 relay           (simulator upstream)
#   docker run -p 8786:8786 -e ANTHROPIC_API_KEY relay   (real API; the key comes from your shell)
#
# Stage 1 installs the server workspace and bundles it with esbuild into one
# file (@relay/core included). Stage 2 is node:22-alpine plus that file: no
# node_modules, no compiler, no source, running as the unprivileged `node` user.

FROM node:22-alpine AS build
WORKDIR /src
# Manifests first, so the dependency layer stays cached while source changes.
COPY package.json package-lock.json ./
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
# Behind a TLS-intercepting proxy, pass its CA as a build secret (never baked into a layer):
#   docker build --secret id=npm_ca,src=/path/to/ca.pem --build-arg HTTPS_PROXY=... .
RUN --mount=type=secret,id=npm_ca,required=false \
    if [ -s /run/secrets/npm_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/npm_ca; fi; \
    npm ci --no-audit --no-fund --workspace @relay/server --workspace @relay/core
COPY tsconfig.base.json ./
COPY packages/core ./packages/core
COPY apps/server ./apps/server
RUN npm run build -w @relay/server

FROM node:22-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8786 \
    RELAY_DRAIN_MS=10000
WORKDIR /app
COPY --from=build --chown=node:node /src/apps/server/dist/ ./
USER node
EXPOSE 8786
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8786/healthz >/dev/null || exit 1
STOPSIGNAL SIGTERM
CMD ["node", "--enable-source-maps", "server.mjs"]
