# syntax=docker/dockerfile:1

# Timeweb App Platform собирает этот Dockerfile в корне репозитория.
# Сборка идёт в production, иначе Vite оставляет dev-JSX и SSR падает.
# Зависимости ставятся полностью: vite и плагины лежат в devDependencies.
# Рантайм — Node 22: проверка документов использует встроенный node:sqlite.
FROM oven/bun:1.4.2 AS builder
WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN set -eux; \
  ok=0; \
  for i in 1 2 3; do \
    if bun install --frozen-lockfile; then ok=1; break; fi; \
    echo "[deps] attempt $i failed"; \
    sleep $((i * 10)); \
  done; \
  test "$ok" -eq 1

COPY . .
RUN bun run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=8080
ENV SVERKO_DATA_DIR=/data

RUN mkdir -p /data

COPY --from=builder /app/.output ./.output
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

EXPOSE 8080

CMD ["node", ".output/server/index.mjs"]
