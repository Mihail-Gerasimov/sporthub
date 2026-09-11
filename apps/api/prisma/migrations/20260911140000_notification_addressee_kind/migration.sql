-- Шаг 37.5: вид адресата уведомления становится НАЗВАННЫМ, а не выводимым.
--
-- ⚠️ Что было. Вид адресата нигде не записан: «обе колонки лица пусты — значит
-- строка личная» (`prisma/catalog.repository.ts`, предикаты частичных индексов).
-- Пока видов три, вывод работал. Надзорной очереди фазы 37 колонки лица тоже
-- не полагаются, и она становится НЕОТЛИЧИМА от личного ящика: строка уезжает
-- в чужую ленту, ответ 200, тест по API зелёный.
--
-- ⚠️ Почему колонка-словарь, а не булев признак `addressee_supervision`. Булев
-- добавил бы к выводу второе условие, пятый вид адресата потребовал бы третьего —
-- то есть «добавить вид = правка семи мест». Список значений и карта формы строки
-- объявлены один раз в `packages/domain/src/notification-addressee.ts`, оттуда же
-- собирается ограничение целостности (шаг 37.8).
--
-- ⚠️ Про блокировки. `SET NOT NULL` берёт полный скан под ACCESS EXCLUSIVE —
-- на таблице, через которую идёт каждое уведомление проекта, это остановка записи.
-- Поэтому сначала ставится проверенное ограничение `NOT VALID`, затем `VALIDATE`
-- (он берёт лишь SHARE UPDATE EXCLUSIVE и писать не мешает), и только после этого
-- `SET NOT NULL`: PostgreSQL 12+ видит доказанное ограничение и скан пропускает.
-- Образец того же приёма уже есть в `apps/api/src/test/schema.test.ts`.

-- 1. Колонка с умолчанием: существующие строки получают значение без переписывания.
ALTER TABLE "notifications"
  ADD COLUMN "addressee_kind" VARCHAR(16) NOT NULL DEFAULT 'personal';

-- 2. Заполнение по тем самым колонкам, из которых вид выводился до сих пор.
--    Порядок ветвей неважен: пара взаимоисключающая, это держал прежний CHECK.
UPDATE "notifications"
SET "addressee_kind" = CASE
      WHEN "addressee_club_id" IS NOT NULL THEN 'club'
      WHEN "addressee_trainer_id" IS NOT NULL THEN 'trainer'
      ELSE 'personal'
    END;

-- 3. Доказываем заполненность дешёвым способом, затем снимаем скан у SET NOT NULL.
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_addressee_kind_present"
  CHECK ("addressee_kind" IS NOT NULL) NOT VALID;

ALTER TABLE "notifications"
  VALIDATE CONSTRAINT "notifications_addressee_kind_present";

ALTER TABLE "notifications"
  ALTER COLUMN "addressee_kind" SET NOT NULL;

-- Временное ограничение своё дело сделало: NOT NULL колонки его полностью покрывает,
-- а лишняя проверка на каждой вставке — плата ни за что.
ALTER TABLE "notifications"
  DROP CONSTRAINT "notifications_addressee_kind_present";

-- 4. Умолчание снимается: вид адресата обязан называться ЯВНО.
--    ⚠️ Это не придирка. С умолчанием «забыли записать» означает «строка молча
--    стала личной», ответ 200 и письмо не у того. Без умолчания забывчивость
--    падает на вставке — то есть находится сразу, а не в чужой ленте.
ALTER TABLE "notifications"
  ALTER COLUMN "addressee_kind" DROP DEFAULT;
