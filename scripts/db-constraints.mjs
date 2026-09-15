// Ограничения целостности и частичные индексы для базы.
//
// Prisma не выражает в схеме ни проверки CHECK, ни частичные индексы, поэтому они
// пишутся сырым SQL в миграции. Проблема в другом: предикаты частичных индексов
// перечисляют состояния записи и связи, а те же наборы уже объявлены в общем пакете.
// Вписанные числом, они разъезжаются молча: добавили действующее состояние в код —
// база про него не знает и перестала держать уникальность.
//
// Поэтому SQL не пишется руками, а собирается отсюда из тех же наборов. Тот же модуль
// читает тест схемы: он сверяет предикаты, реально стоящие в базе, с наборами из кода.

import {
  ACCOUNT_KINDS,
  ACTIVE_BOOKING_STATUSES,
  ACTIVE_LINK_STATUSES,
  NOTIFICATION_ADDRESSEE_KINDS,
  NOTIFICATION_ADDRESSEE_SHAPE,
  SYSTEM_ACTOR_ROLE,
} from '@sporthub/domain';

/** Набор состояний в виде списка для SQL: `'pending','confirmed'`. */
export function toSqlList(values) {
  return [...values].map((value) => `'${String(value).replace(/'/g, "''")}'`).join(',');
}

/**
 * Заполненность колонки одной формой: `user_id IS NOT NULL` либо `user_id IS NULL`.
 *
 * Отдельная функция, а не строка по месту: в форме строки уведомления таких
 * условий двенадцать, и переписывать их руками — это двенадцать шансов ошибиться
 * в одном `NOT`.
 */
function nullness(column, filled) {
  return `${column} IS ${filled ? 'NOT NULL' : 'NULL'}`;
}

/** Предикаты частичных индексов — единственное место, где они записаны. */
export const INDEX_PREDICATES = {
  bookings_active_slot_user_uq: `status IN (${toSqlList(ACTIVE_BOOKING_STATUSES)})`,
  links_active_pair_uq: `status IN (${toSqlList(ACTIVE_LINK_STATUSES)})`,
  bst_initial_uq: 'from_status IS NULL',
  user_notification_preferences_club_uq: 'face_club_id IS NOT NULL',
  user_notification_preferences_trainer_uq: 'face_trainer_id IS NOT NULL',
  user_notification_preferences_personal_uq: 'face_club_id IS NULL AND face_trainer_id IS NULL',
  schedule_has_free_seats_idx: 'booked_count < capacity',
  bookings_active_by_slot_idx: `status IN (${toSqlList(ACTIVE_BOOKING_STATUSES)})`,
  notifications_unread_idx: 'read_at IS NULL',
  notifications_club_unread_idx: 'read_at IS NULL',
  notifications_trainer_unread_idx: 'read_at IS NULL',
  // Личный ящик человека — это отсутствие лица, а не «моё вообще». Условие
  // на NULL обычным индексом по user_id не выражается: он отдаст все строки
  // владельца восемнадцати клубов, и лицо отсеется уже после чтения.
  //
  // ⚠️ Шаг 37.9: предикат перешёл с «обе колонки лица пусты» на НАЗВАННЫЙ вид
  // адресата. Прежняя формулировка описывала личный ящик косвенно, и с появлением
  // очереди надзора (у неё колонок лица тоже нет) перестала его описывать: надзорные
  // строки попадали бы в индекс личного ящика — не в ответ, но в индекс, то есть
  // в его размер. Главное же в другом: условие репозитория и предикат индекса
  // теперь буквально одно слово, и разъехаться им негде.
  notifications_personal_idx: "addressee_kind = 'personal'",
  notifications_personal_unread_idx: "addressee_kind = 'personal' AND read_at IS NULL",
  // Очередь надзора (шаг 37.10). Строк с этим видом адресата — единицы на фоне
  // всей ленты платформы, поэтому индекс частичный: обычный по (addressee_kind,
  // created_at) хранил бы всю таблицу ради одной её доли.
  notifications_supervision_idx: "addressee_kind = 'supervision'",
  // Значок колокольчика и отбор «не разобрано» — состояние очереди по умолчанию.
  notifications_supervision_unread_idx: "addressee_kind = 'supervision' AND read_at IS NULL",
  sessions_active_idx: 'revoked_at IS NULL',
  // Раздел модерации: «что исправили и ждёт повторной проверки» (шаг 36.22).
  // Строк с признаком — единицы, публикаций — тысячи, поэтому индекс частичный,
  // а не составной: составной хранил бы всю таблицу ради нескольких строк.
  clubs_awaiting_recheck_idx: 'awaiting_recheck',
  trainers_awaiting_recheck_idx: 'awaiting_recheck',
};

/**
 * Проверки целостности.
 *
 * «Ровно один владелец» записана через CASE, а не через num_nonnulls: та функция
 * есть только в PostgreSQL, а эта форма переносится на любую СУБД. Цена — ноль.
 */
export const CHECK_CONSTRAINTS = {
  // Вид учётной записи — по словарю, а не «любая строка до 32 символов».
  // Прежняя колонка `role` жила без ограничения вовсе, и словарь держал только
  // TypeScript: база приняла бы что угодно. Список берётся из общего словаря,
  // поэтому новое значение нельзя завести, забыв про базу.
  users_account_kind: {
    table: 'users',
    expression: `account_kind IN (${ACCOUNT_KINDS.map((kind) => `'${kind}'`).join(', ')})`,
  },
  // Лицо услуг у настройки уведомлений: не более одного (шаг 35.29).
  user_notification_preferences_face_one: {
    table: 'user_notification_preferences',
    expression:
      '(CASE WHEN face_club_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN face_trainer_id IS NULL THEN 0 ELSE 1 END) <= 1',
  },
  // Лицо услуг у заметки о клиенте: не более одного (шаг 35.27a).
  provider_client_notes_face_one: {
    table: 'provider_client_notes',
    expression:
      '(CASE WHEN face_club_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN face_trainer_id IS NULL THEN 0 ELSE 1 END) <= 1',
  },
  /**
   * Вид адресата уведомления — по словарю, а не «любая строка до 16 символов»
   * (шаг 37.8). Тот же приём, что у `users_account_kind`.
   */
  notifications_addressee_kind: {
    table: 'notifications',
    expression: `addressee_kind IN (${toSqlList(NOTIFICATION_ADDRESSEE_KINDS)})`,
  },
  /**
   * Форма строки уведомления — ЦЕЛИКОМ, по случаю на каждый вид адресата (шаг 37.8).
   *
   * ⚠️ Что было и почему заменено. Прежнее `notifications_addressee_one` говорило
   * только «не более одного лица». Это половина формы: под него подходила строка
   * вообще без адресата, клубная без клуба и — после снятия NOT NULL с владельца —
   * любая бесхозная. Обещание «у строки ровно один адресат» становится правдой
   * только здесь.
   *
   * ⚠️ Почему дизъюнкция, а НЕ сумма CASE, как у остальных пар. CHECK отвергает
   * строку только на FALSE; на NULL он её ПРОПУСКАЕТ. `CASE … END` без `ELSE`
   * возвращает NULL ровно тогда, когда вид адресата не совпал ни с одной веткой, —
   * то есть строка с неизвестным или опечатанным видом прошла бы сквозь ограничение,
   * написанное именно против неё. Дизъюнкция на неизвестном виде даёт FALSE.
   *
   * ⚠️ Почему выражение СОБИРАЕТСЯ из карты формы. Иначе обещание «новый вид
   * адресата = правка одного словаря» не выполнилось бы: понадобилась бы ещё
   * правка этого файла и миграции. Пятый вид — строка в `NOTIFICATION_ADDRESSEE_SHAPE`,
   * и SQL меняется сам.
   *
   * Диалектной специфики нет: только сравнение, AND / OR и IS [NOT] NULL.
   */
  notifications_addressee_shape: {
    table: 'notifications',
    expression: NOTIFICATION_ADDRESSEE_KINDS.map((kind) => {
      const shape = NOTIFICATION_ADDRESSEE_SHAPE[kind];

      return (
        `(addressee_kind = '${kind}'` +
        ` AND ${nullness('user_id', shape.user)}` +
        ` AND ${nullness('addressee_club_id', shape.club)}` +
        ` AND ${nullness('addressee_trainer_id', shape.trainer)})`
      );
    }).join(' OR '),
  },
  /**
   * Строка журнала без исполнителя-человека допустима ТОЛЬКО у событий площадки
   * (шаг 37.27).
   *
   * ⚠️ Зачем ограничение, а не договорённость. Колонка стала необязательной ради
   * автоотмены и блокировки после подбора пароля — у них человека за действием нет.
   * Без ограничения та же пустота стала бы доступна любой записи по недосмотру,
   * и журнал начал бы терять исполнителя там, где он есть. Слово `system` берётся
   * из общего словаря: код и база не могут разойтись в написании.
   */
  logs_actor_or_system: {
    table: 'logs',
    expression: `actor_id IS NOT NULL OR actor_role = '${SYSTEM_ACTOR_ROLE}'`,
  },
  /**
   * Верификация публикации: «кем» не бывает без «когда» (фаза 38, шаг 38.40).
   *
   * ⚠️ ОДНОСТОРОННИЙ намеренно. Обратное направление — «когда» не бывает без
   * «кем» — уронило бы удаление администратора: внешний ключ обнуляет `verified_by_user_id`
   * каскадом (SetNull), и строка с оставшейся датой нарушила бы ограничение в момент
   * каскада. Проверенность публикации — свойство публикации, а не администратора,
   * и его уход её не отменяет. Пара объявляется парами: у клубов и у тренеров.
   */
  clubs_verified_shape: {
    table: 'clubs',
    expression: 'verified_by_user_id IS NULL OR verified_at IS NOT NULL',
  },
  trainers_verified_shape: {
    table: 'trainers',
    expression: 'verified_by_user_id IS NULL OR verified_at IS NOT NULL',
  },
  offerings_owner_one: {
    table: 'offerings',
    expression:
      '(CASE WHEN owner_club_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN owner_trainer_id IS NULL THEN 0 ELSE 1 END) = 1',
  },
  schedule_owner_one: {
    table: 'schedule',
    expression:
      '(CASE WHEN owner_club_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN owner_trainer_id IS NULL THEN 0 ELSE 1 END) = 1',
  },
  sessions_expires_after_created: {
    table: 'sessions',
    expression: 'expires_at > created_at',
  },
  /**
   * Ссылка восстановления с уже вышедшим сроком не заводится.
   *
   * То же, что у сессий, и по той же причине: срок считается кодом при выдаче,
   * а ошибка в этом расчёте молча выдала бы мёртвую ссылку — человек получил бы
   * письмо, по которому нельзя перейти, и списал бы это на почту.
   */
  password_reset_tokens_expires_after_created: {
    table: 'password_reset_tokens',
    expression: 'expires_at > created_at',
  },
  bookings_owner_one: {
    table: 'bookings',
    expression:
      '(CASE WHEN owner_club_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN owner_trainer_id IS NULL THEN 0 ELSE 1 END) = 1',
  },
  reviews_target_one: {
    table: 'reviews',
    expression:
      '(CASE WHEN club_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN trainer_id IS NULL THEN 0 ELSE 1 END) = 1',
  },
  reviews_rating_range: {
    table: 'reviews',
    expression: 'rating BETWEEN 1 AND 5',
  },
  schedule_time_order: {
    table: 'schedule',
    expression: 'end_time > start_time',
  },
  /**
   * Занятых мест не меньше нуля и не больше вместимости.
   *
   * Проверка была отложена намеренно: пока счётчик менялся чтением-записью, а
   * проверка вместимости стояла ВНЕ транзакции, ограничение превращало известные
   * сценарии рассинхрона из тихих в пятисотки. Оба условия отсрочки сняты —
   * счётчик меняется одной операцией с условием (`changeBookedCount`), проверка
   * мест перенесена внутрь транзакции, — и тесты гонки это подтверждают: десять
   * одновременных попыток дают один успех, счётчик не уходит ни выше вместимости,
   * ни ниже нуля. Теперь инвариант держит база, а не только код.
   */
  schedule_booked_range: {
    table: 'schedule',
    expression: 'booked_count >= 0 AND booked_count <= capacity',
  },
};

/** Частичные уникальные индексы — уникальность, которую Prisma в схеме не выражает. */
export const PARTIAL_UNIQUE_INDEXES = {
  bookings_active_slot_user_uq: { table: 'bookings', columns: 'schedule_id, user_id' },
  links_active_pair_uq: { table: 'trainer_club_links', columns: 'trainer_id, club_id' },
  bst_initial_uq: { table: 'booking_status_transitions', columns: 'booking_id' },
  // ⚠️ Уникальность настройки уведомлений выражена ТРЕМЯ индексами, по одному
  // на форму строки. Обычный UNIQUE по четырём колонкам дублей не запретит:
  // в PostgreSQL NULL не равен NULL, и личных настроек можно вставить сколько
  // угодно одинаковых. `NULLS NOT DISTINCT` — диалектная специфика, которую
  // проект сознательно не использует.
  user_notification_preferences_club_uq: {
    table: 'user_notification_preferences',
    columns: 'user_id, type, face_club_id',
  },
  user_notification_preferences_trainer_uq: {
    table: 'user_notification_preferences',
    columns: 'user_id, type, face_trainer_id',
  },
  user_notification_preferences_personal_uq: {
    table: 'user_notification_preferences',
    columns: 'user_id, type',
  },
};

/** Частичные обычные индексы — под запросы, которые смотрят только на часть строк. */
export const PARTIAL_INDEXES = {
  schedule_has_free_seats_idx: { table: 'schedule', columns: 'date, start_time' },
  bookings_active_by_slot_idx: { table: 'bookings', columns: 'schedule_id, status' },
  notifications_unread_idx: { table: 'notifications', columns: 'user_id, created_at DESC' },
  /// Счётчик непрочитанного в ящике клуба и в ящике карточки тренера.
  notifications_club_unread_idx: {
    table: 'notifications',
    columns: 'addressee_club_id, created_at DESC',
  },
  notifications_trainer_unread_idx: {
    table: 'notifications',
    columns: 'addressee_trainer_id, created_at DESC',
  },
  /// Личный ящик: лента и её счётчик непрочитанного.
  notifications_personal_idx: { table: 'notifications', columns: 'user_id, created_at DESC' },
  notifications_personal_unread_idx: {
    table: 'notifications',
    columns: 'user_id, created_at DESC',
  },
  /// Лента очереди надзора с постраничностью. Колонки владельца здесь нет: у очереди
  /// его не бывает, и сортировка идёт по одному времени.
  notifications_supervision_idx: { table: 'notifications', columns: 'created_at DESC' },
  /// Счётчик неразобранного в очереди — число в значке и отбор по умолчанию.
  notifications_supervision_unread_idx: {
    table: 'notifications',
    columns: 'created_at DESC',
  },
  /// Отзыв всех живых сессий пользователя: отозванные в индекс не попадают,
  /// а их со временем становится большинство.
  sessions_active_idx: { table: 'sessions', columns: 'user_id' },
  /// Раздел модерации отбирает исправленные публикации ЗАПРОСОМ, а не в памяти.
  clubs_awaiting_recheck_idx: { table: 'clubs', columns: 'hidden_at DESC' },
  trainers_awaiting_recheck_idx: { table: 'trainers', columns: 'hidden_at DESC' },
};

/** Готовый SQL для миграции. */
export function buildConstraintsSql() {
  const lines = [
    '-- Ограничения целостности и частичные индексы.',
    '-- Собрано скриптом scripts/db-constraints.mjs из наборов состояний в @sporthub/domain.',
    '-- Править вручную нельзя: предикаты обязаны совпадать с кодом, это сверяет тест схемы.',
    '',
  ];

  for (const [name, { table, expression }] of Object.entries(CHECK_CONSTRAINTS)) {
    lines.push(`ALTER TABLE "${table}" ADD CONSTRAINT "${name}" CHECK (${expression});`);
  }

  lines.push('');

  for (const [name, { table, columns }] of Object.entries(PARTIAL_UNIQUE_INDEXES)) {
    lines.push(
      `CREATE UNIQUE INDEX "${name}" ON "${table}" (${columns}) WHERE ${INDEX_PREDICATES[name]};`,
    );
  }

  lines.push('');

  for (const [name, { table, columns }] of Object.entries(PARTIAL_INDEXES)) {
    lines.push(
      `CREATE INDEX "${name}" ON "${table}" (${columns}) WHERE ${INDEX_PREDICATES[name]};`,
    );
  }

  return `${lines.join('\n')}\n`;
}

// Запуск напрямую печатает SQL: `node scripts/db-constraints.mjs`.
if (process.argv[1]?.endsWith('db-constraints.mjs')) {
  process.stdout.write(buildConstraintsSql());
}
