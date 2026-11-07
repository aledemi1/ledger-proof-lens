# syntax=docker/dockerfile:1

# Timeweb App Platform собирает этот Dockerfile в корне репозитория.
# Сборка в production, иначе Vite оставляет dev-JSX и SSR падает.
# Зависимости ставятся полностью: vite и плагины лежат в devDependencies,
# а проверка документов выполняется тем же процессом, что и preview.
FROM oven/bun:1.4.2 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV SVERKO_DATA_DIR=/data

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
RUN bun run build \
  && mkdir -p /data

EXPOSE 8080

CMD ["sh", "-c", "bun x vite preview --host 0.0.0.0 --port ${PORT:-8080} --strictPort"]
