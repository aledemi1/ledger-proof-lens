# syntax=docker/dockerfile:1

# Timeweb App Platform собирает этот Dockerfile в корне репозитория.
# Сборка идёт в production, иначе Vite оставляет dev-JSX и SSR падает.
# Зависимости ставятся полностью: vite и плагины лежат в devDependencies.
# Рантайм — Node 22. Без DATABASE_URL проверка хранит карточки в node:sqlite.
# С DATABASE_URL карточки, аккаунты и решения пишутся в PostgreSQL. Оригиналы остаются в SVERKO_DATA_DIR.
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

FROM python:3.12-slim-bookworm AS privacy
RUN apt-get update \
  && apt-get install -y --no-install-recommends git gcc g++ \
  && rm -rf /var/lib/apt/lists/*
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
ENV XDG_CACHE_HOME=/opt/cache
RUN pip install --no-cache-dir \
    "pii-mask @ git+https://github.com/dewil/pii-mask.git" \
    "presidio-analyzer>=2.2,<3" \
    "presidio-anonymizer>=2.2,<3" \
  && python -m spacy download en_core_web_sm
RUN mkdir -p /opt/cache \
  && python -c "from pii_mask.core import Masker; from presidio_analyzer import AnalyzerEngine; Masker(ner=True).mask('\u0418\u0432\u0430\u043d \u041f\u0435\u0442\u0440\u043e\u0432, 7707083893', {'version': 1, 'labels': {}}); AnalyzerEngine().analyze(text='john@example.com', language='en')"

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
COPY --from=privacy /opt/venv /opt/venv
COPY --from=privacy /opt/cache /opt/cache
COPY scripts/privacy/mask_bridge.py ./scripts/privacy/mask_bridge.py
ENV SVERKO_PRIVACY_PYTHON=/opt/venv/bin/python
ENV XDG_CACHE_HOME=/opt/cache
ENV PATH=/opt/venv/bin:$PATH

EXPOSE 8080

CMD ["node", ".output/server/index.mjs"]
