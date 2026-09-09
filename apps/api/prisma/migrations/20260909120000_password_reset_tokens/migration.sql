-- Таблица одноразовых ссылок восстановления пароля (фаза 34, шаг 34.69).
--
-- В строке лежит ХЕШ значения из письма, а не оно само: утёкший дамп базы не должен
-- давать сброс. Тот же принцип, что у сессий и паролей.
--
-- Миграция аддитивная: существующие таблицы не переписываются, данные не трогаются.
CREATE TABLE "password_reset_tokens" (
    "id" SERIAL NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "token_hash" VARCHAR(64) NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- Единственный поиск при сбросе идёт по нему. Уникальность обязательна: два
-- одинаковых хеша означали бы одну ссылку на двоих, а различить их было бы нечем.
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- Погасить все невостребованные ссылки пользователя одним обновлением: после
-- успешного сброса остальные выданные обязаны умереть.
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- Уборка протухших отдельной командой, а не на чужом запросе.
CREATE INDEX "password_reset_tokens_expires_at_idx" ON "password_reset_tokens"("expires_at");

-- Удаление пользователя уносит его ссылки: висячая ссылка на несуществующего
-- владельца — это ключ, который некому предъявить.
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Ограничения, которые Prisma не выражает.
-- Сгенерировано `node scripts/db-constraints.mjs`; править вручную нельзя —
-- выражения обязаны совпадать с кодом, это сверяет тест схемы.
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_expires_after_created" CHECK (expires_at > created_at);
