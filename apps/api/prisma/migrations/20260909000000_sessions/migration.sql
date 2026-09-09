-- Таблица сессий (фаза 34, шаг 34.4).
--
-- Личность вызывающего начинает приходить только отсюда. В строке лежит ХЕШ
-- идентификатора, а не он сам: утёкший дамп базы не должен давать вход.
--
-- Миграция аддитивная: существующие таблицы не переписываются, данные не трогаются.
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token_hash" VARCHAR(64) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "impersonated_user_id" INTEGER,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" VARCHAR(512),
    "ip" VARCHAR(64),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- По нему идёт проверка сессии на КАЖДОМ запросе — единственный горячий путь таблицы.
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- Отзыв всех сессий пользователя одним обновлением: смена пароля, бан.
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- Уборка протухших отдельной командой, а не на чужом запросе.
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Имперсонизация переживает удаление того, от чьего лица работали: сессия остаётся
-- живой, признак имперсонизации снимается.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonated_user_id_fkey"
    FOREIGN KEY ("impersonated_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ограничения и частичные индексы, которые Prisma не выражает.
-- Сгенерировано `node scripts/db-constraints.mjs`; править вручную нельзя —
-- предикаты обязаны совпадать с кодом, это сверяет тест схемы.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_expires_after_created" CHECK (expires_at > created_at);
CREATE INDEX "sessions_active_idx" ON "sessions" (user_id) WHERE revoked_at IS NULL;
