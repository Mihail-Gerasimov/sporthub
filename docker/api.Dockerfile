# Образ бэкенда SportHub.
#
# Собирается в две ступени. На первой — установка всех зависимостей и сборка:
# общие пакеты собираются раньше приложений, иначе `tsc` не найдёт @sporthub/types.
# На второй остаётся только собранный код и зависимости для запуска — исходники,
# средства сборки и dev-зависимости в готовый образ не попадают.
#
# Платформа задаётся снаружи (`--platform`): машина разработки ARM, сервер x86,
# а нативные модули собираются под конкретную платформу и на чужой не запускаются.

FROM node:24-bookworm-slim AS builder
WORKDIR /app

# Сначала только описания пакетов: слой с установкой зависимостей переиспользуется,
# пока они не менялись, и правка исходника не тянет за собой повторную установку.
COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages/types/package.json packages/types/
COPY packages/domain/package.json packages/domain/
COPY packages/fixtures/package.json packages/fixtures/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY packages packages
COPY apps/api apps/api
RUN npm run build --workspace @sporthub/types \
 && npm run build --workspace @sporthub/domain \
 && npm run build --workspace @sporthub/fixtures \
 && npm run build --workspace @sporthub/api

# Отдельная установка только тех зависимостей, что нужны при запуске.
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages/types/package.json packages/types/
COPY packages/domain/package.json packages/domain/
COPY packages/fixtures/package.json packages/fixtures/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --workspace @sporthub/api --include-workspace-root

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules node_modules
COPY --from=builder /app/packages/types/package.json packages/types/package.json
COPY --from=builder /app/packages/types/dist packages/types/dist
COPY --from=builder /app/packages/domain/package.json packages/domain/package.json
COPY --from=builder /app/packages/domain/dist packages/domain/dist
COPY --from=builder /app/packages/fixtures/package.json packages/fixtures/package.json
COPY --from=builder /app/packages/fixtures/dist packages/fixtures/dist
COPY --from=builder /app/apps/api/package.json apps/api/package.json
COPY --from=builder /app/apps/api/dist apps/api/dist

# Схема и миграции кладутся в РАБОЧИЙ образ, хотя код их не читает.
#
# Это ~120 КБ, и они снимают с прода необходимость тащить туда ступень `builder`
# со всем монорепозиторием и зависимостями разработки — на машине с двумя
# гигабайтами это была бы сборка прямо на бою. Движок миграций в образе уже есть:
# `prisma` — рабочая зависимость `@prisma/client`, а не средство разработки,
# поэтому `npx prisma migrate deploy` выполняется прямо здесь.
COPY --from=builder /app/apps/api/prisma apps/api/prisma
COPY --from=builder /app/apps/api/prisma.config.ts apps/api/prisma.config.ts

COPY docker/api-healthcheck.mjs /app/healthcheck.mjs

# Процесс не должен работать от суперпользователя: у образа node такой
# пользователь уже заведён.
USER node
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
