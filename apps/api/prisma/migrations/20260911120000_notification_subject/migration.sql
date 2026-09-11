-- Шаг 36.51: предмет уведомления переводится в ОДНУ форму ссылки.
--
-- ⚠️ Что было. Предмет назывался в `payload` четырьмя разными формами — по одной
-- на фазу, которая заводила тип уведомления: прямой номер (`clubId` / `trainerId`),
-- пара `entityType` + `entityId`, пара `publicationType` + `publicationId` и
-- косвенная ссылка через `bookingId` / `reviewId` / `linkId`. Разбирать все четыре
-- приходилось каждому читателю; уборка публикаций одну из форм пропустила
-- и оставляла сироту после каждого прогона.
--
-- ⚠️ Почему миграция данных, а не разбор двух форм в коде. Разбор «и старой тоже»
-- означал бы, что вторая форма жива дальше — только уже в читателе, и снять её
-- было бы некому: переходный период без конца не заканчивается. Строк немного,
-- перевод однозначен (тип уведомления сам называет вид предмета), и после него
-- в данных остаётся ровно одна форма.
--
-- ⚠️ Порядок ветвей CASE — не украшение. Уведомление о связи несёт и `linkId`,
-- и номера обеих сторон; уведомление об отзыве — и `reviewId`, и пару `entityType`
-- + `entityId`. Предмет у них — сама связь и сам отзыв, поэтому их ветви идут
-- первыми, иначе строка назвала бы предметом одну из сторон.
--
-- ⚠️ Проверка `~ '^[0-9]+$'` — не паранойя, а условие безопасности: `CASE` без
-- совпавшей ветви вернул бы NULL, а `jsonb || NULL` — это NULL, то есть потерянный
-- `payload`. Поэтому набор условий в `WHERE` ровно тот же, что в ветвях.
UPDATE "notifications"
SET "payload" = ("payload" - 'clubId' - 'trainerId' - 'entityType' - 'entityId'
                 - 'publicationType' - 'publicationId' - 'bookingId' - 'reviewId' - 'linkId')
  || CASE
       WHEN "payload"->>'linkId' ~ '^[0-9]+$'
         THEN jsonb_build_object('subjectType', 'link', 'subjectId', ("payload"->>'linkId')::int)
       WHEN "payload"->>'reviewId' ~ '^[0-9]+$'
         THEN jsonb_build_object('subjectType', 'review', 'subjectId', ("payload"->>'reviewId')::int)
       WHEN "payload"->>'bookingId' ~ '^[0-9]+$'
         THEN jsonb_build_object('subjectType', 'booking', 'subjectId', ("payload"->>'bookingId')::int)
       WHEN "payload"->>'publicationType' IN ('club', 'trainer')
            AND "payload"->>'publicationId' ~ '^[0-9]+$'
         THEN jsonb_build_object('subjectType', "payload"->>'publicationType',
                                 'subjectId', ("payload"->>'publicationId')::int)
       WHEN "payload"->>'entityType' IN ('club', 'trainer')
            AND "payload"->>'entityId' ~ '^[0-9]+$'
         THEN jsonb_build_object('subjectType', "payload"->>'entityType',
                                 'subjectId', ("payload"->>'entityId')::int)
       WHEN "payload"->>'clubId' ~ '^[0-9]+$'
         THEN jsonb_build_object('subjectType', 'club', 'subjectId', ("payload"->>'clubId')::int)
       WHEN "payload"->>'trainerId' ~ '^[0-9]+$'
         THEN jsonb_build_object('subjectType', 'trainer', 'subjectId', ("payload"->>'trainerId')::int)
     END
WHERE "payload"->>'linkId' ~ '^[0-9]+$'
   OR "payload"->>'reviewId' ~ '^[0-9]+$'
   OR "payload"->>'bookingId' ~ '^[0-9]+$'
   OR ("payload"->>'publicationType' IN ('club', 'trainer') AND "payload"->>'publicationId' ~ '^[0-9]+$')
   OR ("payload"->>'entityType' IN ('club', 'trainer') AND "payload"->>'entityId' ~ '^[0-9]+$')
   OR "payload"->>'clubId' ~ '^[0-9]+$'
   OR "payload"->>'trainerId' ~ '^[0-9]+$';
