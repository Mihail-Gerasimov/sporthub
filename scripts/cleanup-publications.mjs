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

/** Тот же список, но текстом: `payload->>'subjectId'` отдаёт строку, а не число. */
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
    // Уведомления уходят ПЕРВЫМИ: их предикат смотрит в записи, отзывы и связи,
    // которых через несколько операторов уже не будет.
    //
    // ⚠️ Внешнего ключа на предмет у `payload` нет — ссылка живёт числом внутри
    // jsonb. Каскад её не видит, и после уборки строка превратилась бы в ссылку
    // в никуда (решение заказчика 16).
    //
    // ⚠️ Шаг 36.51. Форм ссылки было ЧЕТЫРЕ — по одной на фазу, которая заводила
    // тип уведомления, — и разбирать приходилось все: прямой номер (`clubId` /
    // `trainerId`), пару `entityType` + `entityId`, пару `publicationType` +
    // `publicationId` и косвенную ссылку через `bookingId` / `reviewId`. Четвёртую
    // опись сначала ПРОПУСТИЛА, и каждый прогон оставлял сироту. Теперь форма одна:
    // пара `subjectType` + `subjectId`, словарь видов предмета —
    // `NOTIFICATION_SUBJECT_TYPES` в `packages/types`. Прежние строки переведены
    // миграцией `20260911120000_notification_subject`, разбирать вторую форму
    // больше незачем.
    //
    // ⚠️ Вид предмета, добавленный в словарь, обязан появиться и здесь — это
    // стережёт `apps/api/src/test/notification-subject-guard.test.ts`.
    {
      label: 'notifications',
      table: 'notifications',
      where: [
        // Предмет — сама публикация: номера известны списком.
        `(payload->>'subjectType' = 'club' AND payload->>'subjectId' = ANY(${clubsText}))`,
        `(payload->>'subjectType' = 'trainer' AND payload->>'subjectId' = ANY(${trainersText}))`,
        // Предмет живёт в другой таблице: номера берутся подзапросом — записи,
        // отзывы и связи удаляются этой же уборкой, и списка их номеров нет.
        `(payload->>'subjectType' = 'booking' AND payload->>'subjectId' IN (
              SELECT id::text FROM ${at('bookings')} WHERE ${bookingsWhere}))`,
        `(payload->>'subjectType' = 'review' AND payload->>'subjectId' IN (
              SELECT id::text FROM ${at('reviews')} WHERE ${reviewsWhere}))`,
        `(payload->>'subjectType' = 'link' AND payload->>'subjectId' IN (
              SELECT id::text FROM ${at('trainer_club_links')} WHERE ${linksWhere}))`,
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
/**
 * Уборка по ЛЮДЯМ: строки, предмет которых — сам человек (шаг 37.56).
 *
 * ⚠️ Зачем отдельный план, а не ещё одна строка в уборке публикаций. Публикации
 * убираются по спискам номеров клубов и карточек; человек в этих списках не значится
 * вовсе, и вид предмета `user` — появившийся в фазе 37 — под тот план не подходит
 * ни одним условием. Втискивать его туда значило бы завести уборку, которой на вход
 * приходят три разных вида списков и которая половину из них игнорирует.
 *
 * ⚠️ Этот же план закрывает дыру, из-за которой прогоны копили надзорный мусор:
 * `scripts/e2e-fixture.mjs` убирал уведомления отбором `user_id IN (…)`, а у надзорной
 * строки владельца нет — `IN` с `NULL` не совпадает никогда. Ключ уборки — ПРЕДМЕТ,
 * а не владелец.
 */
export function peopleCleanupPlan({ userIds = [], subjects = [], schema = '' } = {}) {
  // ⚠️ Имя таблицы со схемой обязано приехать в `qualified` — по нему собирается
  // `DELETE FROM`. Первая редакция шага 37.56 этого не делала, и уборка падала
  // на `DELETE FROM undefined`, обрывая цикл ДО уборки людей: любой прогон копил
  // мусор. Нашёл браузерный прогон, а не набор: планы проверялись по тексту `where`,
  // и отсутствие второго поля в них не читалось.
  const at = (table) => (schema ? `"${schema}"."${table}"` : table);
  const users = intArray(userIds);
  const usersText = textArray(userIds);

  return [
    {
      label: 'notifications',
      table: 'notifications',
      where: [
        // Предмет — сам человек: надзорные события про работу от чужого лица,
        // смену пароля и блокировку входа.
        `(payload->>'subjectType' = 'user' AND payload->>'subjectId' = ANY(${usersText}))`,
        // И его собственные строки — те, что прежде убирал `e2e-fixture.mjs`
        // отбором по владельцу.
        `user_id = ANY(${users})`,
        // ⚠️ Названные предметы — то, чего уже нет в базе (шаг 37.61, нашёл прогон).
        //
        // Надзорная строка СОЗНАТЕЛЬНО переживает свой предмет: событие «публикация
        // стёрта» бессмысленно, если исчезает вместе с публикацией. Значит найти её
        // по живым номерам нельзя — их нет. Убирающий обязан назвать номера САМ,
        // запомнив их до удаления; иначе прогон оставляет строку навсегда.
        ...subjects
          .filter((subject) => subject.ids.length > 0)
          .map(
            (subject) =>
              `(payload->>'subjectType' = '${subject.type}'` +
              ` AND payload->>'subjectId' = ANY(${textArray(subject.ids)}))`,
          ),
      ].join('\n        OR '),
    },
    { label: 'logs', table: 'logs', where: `actor_id = ANY(${users})` },
  ].map((entry) => ({ ...entry, qualified: at(entry.table) }));
}

/**
 * Все планы уборки — РЕЕСТР, а не один план.
 *
 * ⚠️ Сторож `notification-subject-guard` требует, чтобы КАЖДЫЙ вид предмета из словаря
 * кто-то разбирал. Пока план был один, требование читалось как «всё разбирает уборка
 * публикаций» — и первый же вид предмета, к публикациям не относящийся, поставил бы
 * выбор между красным сторожем и его ослаблением. Реестр снимает выбор: вид обязан
 * быть разобран хотя бы одним планом, а каким — дело самих планов.
 */
export function cleanupPlans({
  clubIds = [],
  trainerIds = [],
  userIds = [],
  subjects = [],
  schema = '',
} = {}) {
  return [
    ...publicationCleanupPlan({ clubIds, trainerIds, schema }),
    ...peopleCleanupPlan({ userIds, subjects, schema }),
  ];
}

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
