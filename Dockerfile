# Stage 1: Build the front end and bundle the server
FROM node:24-alpine AS builder

# Enable corepack for pnpm support
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# The sync server runs on the same origin, so the app defaults to it
ENV VITE_SYNC_SAME_ORIGIN=true

# Builds dist/ and dist-server/main.mjs
RUN pnpm build

# Stage 2: One Node process serves dist/ and the sync server on /sync
FROM node:24-alpine

WORKDIR /app

# The server bundle has no runtime dependencies, so there is no node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server

# The sync database lives on a volume, owned by the non-root user
RUN mkdir /data && chown node:node /data
VOLUME /data

ENV PORT=8080
ENV DATABASE_PATH=/data/cheffect-sync.db

USER node

EXPOSE 8080

# node:24-alpine has no curl
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost:$PORT/ || exit 1

CMD ["node", "dist-server/main.mjs"]
