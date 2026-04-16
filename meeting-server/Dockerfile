# ============================================================
# meeting-worker — multi-stage image
# ------------------------------------------------------------
# Stage 1 (deps):    install + compile native modules (better-sqlite3)
# Stage 2 (builder): compile TypeScript → dist/
# Stage 3 (runner):  slim runtime with ffmpeg (used by the post-mux
#                    pipeline in Phase 4) and production node_modules
# ============================================================

# -------- Stage 1: dependencies (native build toolchain) --------
FROM node:20-alpine AS deps
WORKDIR /app

# better-sqlite3 compiles C++ on install → needs python3/make/g++.
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

# -------- Stage 2: build (TypeScript → dist/) --------
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src

RUN npm run build

# Prune devDependencies so we ship only runtime packages in stage 3.
RUN npm prune --omit=dev

# -------- Stage 3: runtime --------
FROM node:20-alpine AS runner
WORKDIR /app

# ffmpeg is required for the post-mux step (combine per-user audio tracks
# into the final MKV alongside the mixed video). Install here so the
# binary is present on PATH at runtime.
RUN apk add --no-cache ffmpeg \
 && addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 worker

ENV NODE_ENV=production
ENV PORT=3100

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist         ./dist
COPY --from=builder /app/package.json ./package.json

# Shared volume mount-point — matches `taskhub-data:/app/data` in
# root docker-compose.yml for both DB and recordings.
RUN mkdir -p /app/data && chown -R worker:nodejs /app

USER worker

EXPOSE 3100

CMD ["node", "dist/index.js"]
