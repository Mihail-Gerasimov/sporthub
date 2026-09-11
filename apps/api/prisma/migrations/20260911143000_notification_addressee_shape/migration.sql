-- Шаг 37.8: форма строки уведомления выражается ограничением ЦЕЛИКОМ.
--
-- ⚠️ Что было. `notifications_addressee_one` говорило только «не более одного лица».
-- Это половина формы: под него подходила строка вообще без адресата и клубная строка
-- без клуба, а после снятия NOT NULL с владельца (шаг 37.7) — любая бесхозная.
-- Обещание «у строки ровно один адресат» становится правдой только здесь.
--
-- ⚠️ Почему ДИЗЪЮНКЦИЯ, а не сумма CASE, как у остальных пар в этой базе.
-- CHECK отвергает строку только на FALSE; на NULL он её ПРОПУСКАЕТ. `CASE … END`
-- без `ELSE` возвращает NULL ровно тогда, когда вид адресата не совпал ни с одной
-- веткой, — то есть строка с неизвестным или опечатанным видом прошла бы сквозь
-- ограничение, написанное именно против неё. На неизвестном виде дизъюнкция даёт
-- FALSE и строку отбивает.
--
-- ⚠️ Выражение НЕ НАПИСАНО РУКАМИ. Оно собрано скриптом scripts/db-constraints.mjs
-- из карты формы NOTIFICATION_ADDRESSEE_SHAPE в packages/domain. Иначе обещание
-- «новый вид адресата = правка одного словаря» не выполнилось бы: понадобилась бы
-- ещё правка скрипта и новая миграция. Совпадение выражения с кодом сверяет
-- apps/api/src/test/schema.test.ts.
--
-- ⚠️ NOT VALID + VALIDATE, а не прямой ADD CONSTRAINT: полный скан под
-- ACCESS EXCLUSIVE на таблице, через которую идёт каждое уведомление проекта,
-- останавливает запись. VALIDATE берёт лишь SHARE UPDATE EXCLUSIVE и писать не мешает.
--
-- Эта миграция закрывает окно, открытое предыдущей: с неё бесхозной может быть
-- только надзорная строка, а не любая по недосмотру.

-- Прежнее ограничение снимается: новое строго сильнее и полностью его покрывает.
ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "notifications_addressee_one";

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_addressee_kind" CHECK (addressee_kind IN ('personal','club','trainer','supervision')) NOT VALID;

ALTER TABLE "notifications" VALIDATE CONSTRAINT "notifications_addressee_kind";

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_addressee_shape" CHECK ((addressee_kind = 'personal' AND user_id IS NOT NULL AND addressee_club_id IS NULL AND addressee_trainer_id IS NULL) OR (addressee_kind = 'club' AND user_id IS NOT NULL AND addressee_club_id IS NOT NULL AND addressee_trainer_id IS NULL) OR (addressee_kind = 'trainer' AND user_id IS NOT NULL AND addressee_club_id IS NULL AND addressee_trainer_id IS NOT NULL) OR (addressee_kind = 'supervision' AND user_id IS NULL AND addressee_club_id IS NULL AND addressee_trainer_id IS NULL)) NOT VALID;

ALTER TABLE "notifications" VALIDATE CONSTRAINT "notifications_addressee_shape";
