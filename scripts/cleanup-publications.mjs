// Упорядоченная уборка публикаций: одна опись на всех потребителей.
//
// ⚠️ Зачем отдельный модуль. Каскад «лист → корень» жил внутри `cleanupRun()`
// (`scripts/e2e-fixture.mjs`) и был намертво связан с отбором по метке прогона
// (`users.email LIKE '<RUN_TAG>-%'`). Разовой уборке мусора прежних прогонов
// (этап Э7 фазы 36) тот же порядок нужен слово в слово, а отбор — другой:
// явный список номеров публикаций. Копия каскада разъехалась бы с оригиналом
// молча, и разъехалась бы именно в том месте, где ошибка стоит дороже всего.
//
// Поэтому здесь — ОДНА опись таблиц, параметризованная списками номеров клубов
// и карточек тренеров. Потребителей два сразу: `cleanupRun()` подставляет номера,
// выведенные из метки, разовая уборка — выписанные явно.
//
// ⚠️ Что здесь важнее порядка. Каскад базы глаз не имеет: он унесёт строки,
// которых никто не называл, и не скажет об этом (ловушка 20 плана фазы 36).
// Поэтому опись перечисляет и то, что уходит каскадом, — не чтобы удалить
// (удалит база), а чтобы это было ПОСЧИТАНО до и после. Проверка «таблица
// потеряла ровно столько строк, сколько назвала опись» — единственное, что
// отличает уборку от надежды.

/** Строка описи: одна таблица и предикат «строка принадлежит удаляемым публикациям».
 *
 * `cascade: true` — строку удалит сама база по внешнему ключу. Такая строка
 * НЕ удаляется отдельным оператором, но обязательно считается: иначе потеря
 * останется невидимой.
 *
 * @typedef {{ label: string, table: string, where: string, cascade?: boolean }} CleanupEntry
 */

/** Список чисел в SQL-массив. Пустой массив — законное значение: ничего не совпадёт. */
function intArray(ids) {
  return `ARRAY[${ids.map((id) => Number(id)).join(',')}]::int[]`;
}

/** Тот же список, но текстом: `payload->>'clubId'` отдаёт строку, а не число. */
function textArray(ids) {
  return `ARRAY[${ids.map((id) => `'${Number(id)}'`).join(',')}]::text[]`;
}

/**
 * Опись уборки для заданных публикаций.
 *
 * @param {{ clubIds?: Array<number|string>, trainerIds?: Array<number|string>, schema?: string }} options
 *   `schema` — имя схемы, если таблицы надо назвать явно. Тестовая обвязка держит
 *   свою схему на файл, и неявное имя увело бы уборку в чужую (`public`), оставив
 *   тест зелёным и бессмысленным.
 * @returns {CleanupEntry[]} строки описи в порядке удаления: лист → корень
 */
export function publicationCleanupPlan({ clubIds = [], trainerIds = [], schema = '' } = {}) {
  const clubs = intArray(clubIds);
  const trainers = intArray(trainerIds);
  const clubsText = textArray(clubIds);
  const trainersText = textArray(trainerIds);
  const at = (table) => (schema ? `"${schema}"."${table}"` : table);

  // ⚠️ `venue_club_id` обязателен: тренерское занятие в чужом зале принадлежит
  // тренеру, а идёт в клубе. `conducted_by_trainer_id` — та же история с другой
  // стороны: занятие клуба, которое ведёт карточка тренера. Обе колонки —
  // `ON DELETE CASCADE`, то есть пропуск их в отборе клуб удалить НЕ помешает:
  // база унесёт записи молча, и опись этого не увидит. Именно поэтому они здесь.
  const bookingsWhere = `owner_club_id = ANY(${clubs}) OR owner_trainer_id = ANY(${trainers}) OR venue_club_id = ANY(${clubs}) OR conducted_by_trainer_id = ANY(${trainers})`;
  const reviewsWhere = `club_id = ANY(${clubs}) OR trainer_id = ANY(${trainers})`;
  const linksWhere = `club_id = ANY(${clubs}) OR trainer_id = ANY(${trainers})`;

  return [
    // Уведомления уходят ПЕРВЫМИ: их предикат смотрит в записи и отзывы,
    // которых через два оператора уже не будет.
    //
    // ⚠️ Внешнего ключа на публикацию у `payload` нет — ссылка живёт числом
    // внутри jsonb. Каскад её не видит, и после уборки строка превратилась бы
    // в ссылку в никуда (решение заказчика 16). Разбираются все формы ссылки:
    // прямая (`clubId` / `trainerId`), парная (`entityType` + `entityId`)
    // и косвенная — через запись или отзыв удаляемой публикации.
    {
      label: 'notifications',
      table: 'notifications',
      where: [
        `payload->>'clubId' = ANY(${clubsText})`,
        `payload->>'trainerId' = ANY(${trainersText})`,
        `(payload->>'entityType' = 'club' AND payload->>'entityId' = ANY(${clubsText}))`,
        `(payload->>'entityType' = 'trainer' AND payload->>'entityId' = ANY(${trainersText}))`,
        // ⚠️ Четвёртая форма ссылки, найденная браузерным прогоном приёмки.
        // Уведомление о повторной проверке (шаг 36.21) называет публикацию парой
        // `publicationType` + `publicationId`, а опись разбирала только три формы —
        // и оставляла сироту после каждого прогона. Форм ссылки в `payload` четыре
        // потому, что типы уведомлений писались разными фазами; сводить их к одной —
        // отдельная работа, а не задача уборки.
        `(payload->>'publicationType' = 'club' AND payload->>'publicationId' = ANY(${clubsText}))`,
        `(payload->>'publicationType' = 'trainer' AND payload->>'publicationId' = ANY(${trainersText}))`,
        `payload->>'bookingId' IN (SELECT id::text FROM ${at('bookings')} WHERE ${bookingsWhere})`,
        `payload->>'reviewId' IN (SELECT id::text FROM ${at('reviews')} WHERE ${reviewsWhere})`,
        // Ящик лица: эти строки уходят и каскадом, но удалить их здесь дешевле,
        // чем считать дважды и вычитать пересечение.
        `addressee_club_id = ANY(${clubs})`,
        `addressee_trainer_id = ANY(${trainers})`,
      ].join('\n        OR '),
    },
    // ⚠️ `logs.entity_id` полиморфен: внешнего ключа нет, и число 13 в нём
    // значит клуб, тренера или запись в зависимости от `entity_type`. Отбирать
    // можно ТОЛЬКО парой — по одному `entity_id` уборка снесла бы чужое
    // (решение заказчика 17).
    {
      label: 'logs',
      table: 'logs',
      // ⚠️ Уточнение решения 17. Журнал ссылается не только на публикации:
      // строки про удаляемые ЗАПИСИ и СВЯЗИ после уборки указывают в никуда
      // ровно так же. Оставить их — значит оставить те самые сироты, ради
      // которых уборка и затевается. Подзапросы, а не список номеров: записи
      // и связи удаляются в этой же транзакции, и их номера здесь неизвестны.
      where: `(entity_type = 'club' AND entity_id = ANY(${clubs}))
        OR (entity_type = 'trainer' AND entity_id = ANY(${trainers}))
        OR (entity_type = 'booking' AND entity_id IN (
              SELECT id FROM ${at('bookings')} WHERE ${bookingsWhere}))
        OR (entity_type = 'link' AND entity_id IN (
              SELECT id FROM ${at('trainer_club_links')} WHERE ${linksWhere}))`,
    },
    {
      label: 'provider_client_notes',
      table: 'provider_client_notes',
      where: `face_club_id = ANY(${clubs}) OR face_trainer_id = ANY(${trainers})`,
    },
    { label: 'reviews', table: 'reviews', where: reviewsWhere },
    { label: 'bookings', table: 'bookings', where: bookingsWhere },
    {
      label: 'booking_status_transitions',
      table: 'booking_status_transitions',
      where: `booking_id IN (SELECT id FROM ${at('bookings')} WHERE ${bookingsWhere})`,
      cascade: true,
    },
    {
      label: 'trainer_club_links',
      table: 'trainer_club_links',
      where: linksWhere,
    },
    {
      label: 'schedule',
      table: 'schedule',
      where: `owner_club_id = ANY(${clubs}) OR owner_trainer_id = ANY(${trainers}) OR venue_club_id = ANY(${clubs}) OR conducted_by_trainer_id = ANY(${trainers})`,
    },
    {
      label: 'offerings',
      table: 'offerings',
      where: `owner_club_id = ANY(${clubs}) OR owner_trainer_id = ANY(${trainers}) OR venue_club_id = ANY(${clubs})`,
    },
    // Дальше — то, что унесёт сама база. Перечислено ради счёта, а не ради удаления.
    { label: 'club_sports', table: 'club_sports', where: `club_id = ANY(${clubs})`, cascade: true },
    { label: 'club_tags', table: 'club_tags', where: `club_id = ANY(${clubs})`, cascade: true },
    {
      label: 'club_amenities',
      table: 'club_amenities',
      where: `club_id = ANY(${clubs})`,
      cascade: true,
    },
    { label: 'club_images', table: 'club_images', where: `club_id = ANY(${clubs})`, cascade: true },
    {
      label: 'user_favorite_clubs',
      table: 'user_favorite_clubs',
      where: `club_id = ANY(${clubs})`,
      cascade: true,
    },
    {
      label: 'trainer_sports',
      table: 'trainer_sports',
      where: `trainer_id = ANY(${trainers})`,
      cascade: true,
    },
    {
      label: 'trainer_specialties',
      table: 'trainer_specialties',
      where: `trainer_id = ANY(${trainers})`,
      cascade: true,
    },
    {
      label: 'trainer_work_formats',
      table: 'trainer_work_formats',
      where: `trainer_id = ANY(${trainers})`,
      cascade: true,
    },
    {
      label: 'user_notification_preferences',
      table: 'user_notification_preferences',
      where: `face_club_id = ANY(${clubs}) OR face_trainer_id = ANY(${trainers})`,
      cascade: true,
    },
    // Корень.
    { label: 'clubs', table: 'clubs', where: `id = ANY(${clubs})` },
    { label: 'trainers', table: 'trainers', where: `id = ANY(${trainers})` },
  ].map((entry) => ({ ...entry, qualified: at(entry.table) }));
}

/**
 * Операторы удаления в порядке описи. Строки, уходящие каскадом, пропускаются:
 * их удалит база, а лишний оператор только соврал бы о том, кто их унёс.
 *
 * @param {CleanupEntry[]} plan
 * @returns {string[]}
 */
export function cleanupStatements(plan) {
  return plan
    .filter((entry) => !entry.cascade)
    .map((entry) => `DELETE FROM ${entry.qualified} WHERE ${entry.where};`);
}

/**
 * Счёт по ВСЕЙ описи одним запросом: сколько строк подпадает под уборку
 * и сколько строк в таблице всего.
 *
 * ⚠️ Второе число обязательно. У строк, уходящих каскадом, предикат смотрит
 * в родителя, и после уборки он даёт ноль просто потому, что родителя нет —
 * а не потому, что строки удалены. Что удалено на самом деле, показывает
 * разница общего числа строк.
 *
 * @param {CleanupEntry[]} plan
 * @returns {string} SELECT с колонками label | scoped | total | cascade
 */
export function inventorySql(plan) {
  return plan
    .map(
      (entry) =>
        `SELECT '${entry.label}' AS label, ` +
        `(SELECT count(*) FROM ${entry.qualified} WHERE ${entry.where}) AS scoped, ` +
        `(SELECT count(*) FROM ${entry.qualified}) AS total, ` +
        `${entry.cascade ? 'true' : 'false'} AS cascade`,
    )
    .join('\nUNION ALL\n');
}
