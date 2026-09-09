-- Настройки уведомлений переезжают на лицо услуг (шаг 35.29).
--
-- Владелец трёх клубов должен уметь заглушить один клуб, не заглушая остальные два.
-- Пока ключ был `(user_id, type)`, такой настройки не существовало: тип уведомления
-- у всех трёх клубов один и тот же.
--
-- ⚠️ Пересборка ключа — крайняя мера по «Главному правилу», и здесь она осознанная:
-- составным ключом с НЕОБЯЗАТЕЛЬНЫМ лицом уникальность не выражается. Таблица
-- маленькая (десятки строк), пересборка занимает одну операцию.
--
-- ⚠️ Обычный UNIQUE по четырём колонкам дублей НЕ запретит: в PostgreSQL NULL не равен
-- NULL, и строк `(1, 'booking_confirmed', NULL, NULL)` можно вставить сколько угодно.
-- `NULLS NOT DISTINCT` — диалектная специфика, которую проект сознательно не использует.
-- Поэтому уникальность выражена ТРЕМЯ частичными индексами, по одному на форму строки.

-- 1. Суррогатный ключ вместо составного: лицо необязательно, и в первичный ключ
--    его взять нельзя.
ALTER TABLE "user_notification_preferences" DROP CONSTRAINT "user_notification_preferences_pkey";

ALTER TABLE "user_notification_preferences" ADD COLUMN "id" SERIAL PRIMARY KEY;

-- 2. Лицо-адресат. Форма та же, что у уведомлений и заметок.
ALTER TABLE "user_notification_preferences"
  ADD COLUMN "face_club_id" INTEGER,
  ADD COLUMN "face_trainer_id" INTEGER;

ALTER TABLE "user_notification_preferences"
  ADD CONSTRAINT "user_notification_preferences_face_club_id_fkey"
  FOREIGN KEY ("face_club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_notification_preferences"
  ADD CONSTRAINT "user_notification_preferences_face_trainer_id_fkey"
  FOREIGN KEY ("face_trainer_id") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_notification_preferences"
  ADD CONSTRAINT "user_notification_preferences_face_one" CHECK (
    (CASE WHEN "face_club_id" IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN "face_trainer_id" IS NULL THEN 0 ELSE 1 END) <= 1
  );

-- 3. Уникальность — тремя частичными индексами: по клубу, по карточке и по человеку.
--    Существующие строки все без лица и попадают в третий: перенос не нужен,
--    они остаются личными настройками и продолжают работать как работали.
CREATE UNIQUE INDEX "user_notification_preferences_club_uq"
  ON "user_notification_preferences" ("user_id", "type", "face_club_id")
  WHERE "face_club_id" IS NOT NULL;

CREATE UNIQUE INDEX "user_notification_preferences_trainer_uq"
  ON "user_notification_preferences" ("user_id", "type", "face_trainer_id")
  WHERE "face_trainer_id" IS NOT NULL;

CREATE UNIQUE INDEX "user_notification_preferences_personal_uq"
  ON "user_notification_preferences" ("user_id", "type")
  WHERE "face_club_id" IS NULL AND "face_trainer_id" IS NULL;
