FROM node:20-bookworm-slim AS base

# Install dependencies only when needed.
FROM base AS deps
WORKDIR /app

# better-sqlite3 may need toolchain fallback for native compilation.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

# Collect sqlite-vec platform packages so standalone output keeps vector extension support.
FROM deps AS vecdeps
RUN mkdir -p /vec-node-modules \
  && cp -R /app/node_modules/sqlite-vec /vec-node-modules/sqlite-vec \
  && for d in /app/node_modules/sqlite-vec-*; do \
    if [ -d "$d" ]; then cp -R "$d" /vec-node-modules/; fi; \
  done

# Build the app.
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Production image: copy only what is needed to run Next standalone output.
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends gosu ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=vecdeps /vec-node-modules ./node_modules
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
  && mkdir -p /app/data \
  && chown -R nextjs:nodejs /app

EXPOSE 3000

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server.js"]
