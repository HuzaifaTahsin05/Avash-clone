# syntax=docker/dockerfile:1
#
# apps/api container image (ADR-012).
#
# THE BUILD CONTEXT IS THE REPOSITORY ROOT:
#   docker build -f apps/api/Dockerfile -t avash-api:local .
#
# Production runs this same Hono app on Cloudflare's workerd via
# `wrangler deploy`. This image runs it on Node through the adapter in
# apps/api/server/. The two runtimes are kept honest by CI running the
# API test suite against both — see docs/docker.md.

FROM node:24.1.0-alpine3.20 AS build
WORKDIR /repo
ENV CI=true

RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

COPY . .

RUN pnpm install --frozen-lockfile \
    && pnpm --filter api build:node

FROM node:24.1.0-alpine3.20 AS runtime

ENV NODE_ENV=production \
    PORT=8787

WORKDIR /app

# esbuild produced one self-contained ESM file, so the runtime stage
# carries no node_modules and no package manager.
COPY --from=build /repo/apps/api/dist-node/server.mjs ./server.mjs

# node:alpine ships a non-root `node` user; the numeric UID (rather than
# the name) is what host systems and orchestrators can actually resolve.
USER 1000

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["sh", "-c", "wget --quiet --spider http://127.0.0.1:8787/health || exit 1"]

CMD ["node", "server.mjs"]
