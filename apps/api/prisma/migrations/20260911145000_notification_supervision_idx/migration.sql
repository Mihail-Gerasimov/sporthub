-- Шаг 37.10: индексы очереди надзора и отбора по теме.
--
-- Два частичных — под саму очередь и под её счётчик неразобранного. Частичные,
-- а не обычные: строк с видом адресата 'supervision' единицы на фоне всей ленты
-- платформы, и обычный индекс хранил бы всю таблицу ради одной её доли.
-- Колонки владельца в них нет: у очереди его не бывает.
--
-- Третий — обычный, под отбор ленты по ТЕМЕ. В человеческой ленте такой отбор
-- сделан в памяти поверх выданной страницы с потолком в 100 строк; для общей
-- очереди, которая растёт быстрее личных лент, это означало бы «честно до 101-й
-- строки». Условие уходит в запрос, под него нужен индекс.
--
-- ⚠️ Третий индекс НЕ частичный намеренно. Тест схемы берёт из базы ВСЕ индексы
-- с WHERE и требует точного совпадения набора имён с scripts/db-constraints.mjs.
-- Частичный индекс, заведённый мимо этого файла, уронил бы сверку по ложной причине.

CREATE INDEX "notifications_supervision_idx" ON "notifications" (created_at DESC) WHERE addressee_kind = 'supervision';

CREATE INDEX "notifications_supervision_unread_idx" ON "notifications" (created_at DESC) WHERE addressee_kind = 'supervision' AND read_at IS NULL;

CREATE INDEX "notifications_addressee_kind_type_created_at_idx" ON "notifications" ("addressee_kind", "type", "created_at" DESC);
