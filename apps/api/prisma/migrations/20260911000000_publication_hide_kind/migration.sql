-- Вид скрытия публикации и признак повторной проверки (шаги 36.12, 36.20).
--
-- Миграция аддитивная: колонки добавляются, ничего не переопределяется и не пересобирается.
--
-- ⚠️ Разметка существующих строк делается ЗДЕСЬ и один раз. До этой фазы архив владельца
-- и скрытие модератором писали одни и те же четыре поля, и единственным различителем
-- был текст причины. Значит разметить прошлое можно только по нему — но именно затем,
-- чтобы больше никогда по нему не различать.
--
-- Строка причины продублирована здесь намеренно: это исторические данные на момент
-- миграции, а не действующий словарь. Константа `OWNER_ARCHIVE_REASON` в коде остаётся
-- текстом причины по умолчанию и перестаёт быть признаком.

ALTER TABLE "clubs" ADD COLUMN "hidden_kind" VARCHAR(32);
ALTER TABLE "clubs" ADD COLUMN "awaiting_recheck" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "trainers" ADD COLUMN "hidden_kind" VARCHAR(32);
ALTER TABLE "trainers" ADD COLUMN "awaiting_recheck" BOOLEAN NOT NULL DEFAULT false;

-- Разметка прошлого: скрытая публикация со служебной причиной владельца — архив,
-- любая другая скрытая — работа модератора.
UPDATE "clubs"
   SET "hidden_kind" = CASE
         WHEN "hide_reason" = 'Убрано владельцем из каталога' THEN 'owner_archive'
         ELSE 'moderation'
       END
 WHERE "status" = 'hidden';

UPDATE "trainers"
   SET "hidden_kind" = CASE
         WHEN "hide_reason" = 'Убрано владельцем из каталога' THEN 'owner_archive'
         ELSE 'moderation'
       END
 WHERE "status" = 'hidden';

-- Частичные индексы под отбор раздела модерации (шаг 36.22).
-- Предикаты объявлены в scripts/db-constraints.mjs; здесь они обязаны совпадать
-- дословно — это сверяет тест схемы.
CREATE INDEX "clubs_awaiting_recheck_idx" ON "clubs" (hidden_at DESC) WHERE awaiting_recheck;
CREATE INDEX "trainers_awaiting_recheck_idx" ON "trainers" (hidden_at DESC) WHERE awaiting_recheck;
