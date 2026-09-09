-- Заметки о клиентах переезжают на лицо услуг (шаг 35.27a, решение заказчика 19).
--
-- Раньше заметка принадлежала ЧЕЛОВЕКУ: владелец четырёх клубов видел клиентов
-- всех четырёх одной кучей и писал заметку «вообще», не привязывая к клубу.
--
-- Довод, ради которого выбран этот вариант: когда у клуба появится несколько
-- управляющих, заметки должны остаться ПРИ КЛУБЕ, а не уйти вместе с человеком,
-- который их писал.
--
-- Форма — та же пара колонок, что у расписания и уведомлений: не более одной
-- заполненной. Миграция аддитивная, `provider_user_id` остаётся: он и владелец-
-- человек на момент записи, и быстрый срез «все мои заметки».

ALTER TABLE "provider_client_notes"
  ADD COLUMN "face_club_id" INTEGER,
  ADD COLUMN "face_trainer_id" INTEGER;

ALTER TABLE "provider_client_notes"
  ADD CONSTRAINT "provider_client_notes_face_club_id_fkey"
  FOREIGN KEY ("face_club_id") REFERENCES "clubs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "provider_client_notes"
  ADD CONSTRAINT "provider_client_notes_face_trainer_id_fkey"
  FOREIGN KEY ("face_trainer_id") REFERENCES "trainers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Заполнено не более одного лица. Форма через CASE — та же, что у остальных
-- ограничений «ровно один владелец»: переносится между СУБД без диалектной специфики.
ALTER TABLE "provider_client_notes"
  ADD CONSTRAINT "provider_client_notes_face_one" CHECK (
    (CASE WHEN "face_club_id" IS NULL THEN 0 ELSE 1 END)
      + (CASE WHEN "face_trainer_id" IS NULL THEN 0 ELSE 1 END) <= 1
  );

-- Лента заметок лица: отбор по лицу, свежие сверху.
CREATE INDEX "provider_client_notes_face_club_idx"
  ON "provider_client_notes" ("face_club_id", "client_user_id", "created_at" DESC);

CREATE INDEX "provider_client_notes_face_trainer_idx"
  ON "provider_client_notes" ("face_trainer_id", "client_user_id", "created_at" DESC);
