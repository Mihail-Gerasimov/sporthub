# Образ фронта SportHub.
#
# Ключ карт вшивается в клиентский бандл на сборке: префикс NEXT_PUBLIC_ заставляет
# Next подставить значение прямо в код, который уедет в браузер. Рантайм-переменной
# такое значение не подменить — поэтому оно приходит аргументом сборки, а не окружением.
# Адрес бэкенда, наоборот, читается при запуске: он нужен и прокси, и отрисовке страниц.

FROM node:24-bookworm-slim AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json tsconfig.json ./
COPY packages/types/package.json packages/types/
COPY packages/domain/package.json packages/domain/
COPY packages/fixtures/package.json packages/fixtures/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY packages packages
COPY apps/web apps/web

ARG NEXT_PUBLIC_YANDEX_MAPS_API_KEY=''
ENV NEXT_PUBLIC_YANDEX_MAPS_API_KEY=$NEXT_PUBLIC_YANDEX_MAPS_API_KEY

# ⚠️ Адрес бэкенда нужен и на сборке. Next вычисляет `rewrites()` во время сборки
# и записывает готовый адрес назначения в манифест маршрутов — переменной окружения
# при запуске его уже не подменить. Проверяется так:
#   grep -o 'http://[^"]*' .next/routes-manifest.json
# При запуске та же переменная читается второй раз — отрисовкой страниц на сервере.
ARG SPORT_HUB_API_ORIGIN='http://localhost:3001'
ENV SPORT_HUB_API_ORIGIN=$SPORT_HUB_API_ORIGIN
RUN npm run build --workspace @sporthub/types \
 && npm run build --workspace @sporthub/domain \
 && npm run build --workspace @sporthub/web

FROM node:24-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production

# Next при запуске читает не только сборку: нужны конфиг, публичные файлы
# и зависимости. Поэтому переносится рабочая область целиком, без исходников.
COPY --from=builder /app/node_modules node_modules
COPY --from=builder /app/package.json package.json
COPY --from=builder /app/packages packages
COPY --from=builder /app/apps/web apps/web

USER node
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["node", "./scripts/run-next.mjs", "start"]
