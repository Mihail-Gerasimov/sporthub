-- Фаза 38, шаги 38.40–38.41: верификация публикаций — клубов И карточек тренеров.
--
-- Пара «когда + кем», зеркально скрытию (hidden_at / hidden_by_user_id): дата
-- отвечает «когда подтверждено», номер — «кем»; отзыв обнуляет обе. Не boolean.
--
-- ⚠️ Миграция АДДИТИВНАЯ: четыре новые колонки, два внешних ключа, два CHECK.
-- Существующие строки не переписываются: у всех публикаций пара пуста. Проставить
-- проверку оптом — подделать её; знак появляется только решением администратора.
--
-- ⚠️ CHECK ОДНОСТОРОННИЙ: «кем» без «когда» невозможно, «когда» без «кем» допустимо.
-- Двусторонний уронил бы удаление администратора: SetNull обнулил бы «кем», оставив
-- «когда», и строка нарушила бы ограничение в момент каскада. Выражение — то же,
-- что в scripts/db-constraints.mjs; совпадение сверяет apps/api/src/test/schema.test.ts.
--
-- ⚠️ Индекса по verified_at НЕТ намеренно: ни один запрос фазы не отбирает
-- по «проверено»; раздел модерации ищет непроверенных (IS NULL) по существующему
-- (status, created_at). Мёртвый индекс дорожил бы каждую вставку.
--
-- NOT VALID + VALIDATE — тот же приём, что у прежних ограничений: новые колонки
-- пусты и ограничению удовлетворяют, но полный скан под ACCESS EXCLUSIVE держать
-- незачем.

ALTER TABLE "clubs" ADD COLUMN "verified_at" TIMESTAMP(3);
ALTER TABLE "clubs" ADD COLUMN "verified_by_user_id" INTEGER;

ALTER TABLE "trainers" ADD COLUMN "verified_at" TIMESTAMP(3);
ALTER TABLE "trainers" ADD COLUMN "verified_by_user_id" INTEGER;

ALTER TABLE "clubs"
  ADD CONSTRAINT "clubs_verified_by_user_id_fkey"
  FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "trainers"
  ADD CONSTRAINT "trainers_verified_by_user_id_fkey"
  FOREIGN KEY ("verified_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "clubs"
  ADD CONSTRAINT "clubs_verified_shape" CHECK (verified_by_user_id IS NULL OR verified_at IS NOT NULL) NOT VALID;

ALTER TABLE "clubs" VALIDATE CONSTRAINT "clubs_verified_shape";

ALTER TABLE "trainers"
  ADD CONSTRAINT "trainers_verified_shape" CHECK (verified_by_user_id IS NULL OR verified_at IS NOT NULL) NOT VALID;

ALTER TABLE "trainers" VALIDATE CONSTRAINT "trainers_verified_shape";
