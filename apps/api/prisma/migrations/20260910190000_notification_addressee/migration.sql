-- Адресат уведомления — лицо услуг (шаг 35.26).
--
-- До фазы 35 уведомление адресовалось ЧЕЛОВЕКУ: владелец трёх клубов получал одну
-- общую кучу, и разобрать, к какому клубу относится заявка, было нечем. Теперь
-- у уведомления появляется лицо: запись на занятие клуба — уведомление клубу,
-- своя запись к чужому тренеру — самому человеку.
--
-- ⚠️ Миграция АДДИТИВНАЯ: колонки добавляются, ничего не переписывается.
-- Существующие строки остаются уведомлениями человеку (обе колонки пусты) —
-- ровно то, чем они и были.
--
-- ⚠️ `user_id` остаётся NOT NULL и означает владельца-человека. Это разом три вещи:
-- совместимость со старыми строками, каскад удаления человека и быстрый срез
-- «всё моё» одним условием, без OR по колонкам лица. Значение выводимое, а не
-- снимок: при смене владельца лица оно пересчитывается (решение 5.4).

-- 1. Пара взаимоисключающих ссылок на лицо. Форма та же, что у владельца
--    расписания (`owner_club_id` / `owner_trainer_id`), — полиморфную пару
--    «вид + номер» не заводим, она теряет внешний ключ и каскад.
ALTER TABLE "notifications"
  ADD COLUMN "addressee_club_id" INTEGER,
  ADD COLUMN "addressee_trainer_id" INTEGER;

-- 2. Каскад: удаление лица уносит его ящик. Уведомление о клубе без клуба
--    нечитаемо, а оставленное — висело бы вечно.
ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_addressee_club_id_fkey"
  FOREIGN KEY ("addressee_club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_addressee_trainer_id_fkey"
  FOREIGN KEY ("addressee_trainer_id") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. Обычные индексы под ленту ящика лица с постраничностью. Объявлены в схеме
--    Prisma (@@index), имена — её собственные.
CREATE INDEX "notifications_addressee_club_id_created_at_idx"
  ON "notifications" ("addressee_club_id", "created_at" DESC);

CREATE INDEX "notifications_addressee_trainer_id_created_at_idx"
  ON "notifications" ("addressee_trainer_id", "created_at" DESC);

-- 4. Ограничение и частичные индексы. Собрано скриптом scripts/db-constraints.mjs;
--    править вручную нельзя — предикаты сверяет schema.test.ts.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_addressee_one" CHECK ((CASE WHEN addressee_club_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN addressee_trainer_id IS NULL THEN 0 ELSE 1 END) <= 1);

CREATE INDEX "notifications_club_unread_idx" ON "notifications" (addressee_club_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX "notifications_trainer_unread_idx" ON "notifications" (addressee_trainer_id, created_at DESC) WHERE read_at IS NULL;
CREATE INDEX "notifications_personal_idx" ON "notifications" (user_id, created_at DESC) WHERE addressee_club_id IS NULL AND addressee_trainer_id IS NULL;
CREATE INDEX "notifications_personal_unread_idx" ON "notifications" (user_id, created_at DESC) WHERE addressee_club_id IS NULL AND addressee_trainer_id IS NULL AND read_at IS NULL;
