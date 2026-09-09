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

import { ACCOUNT_KINDS, ACTIVE_BOOKING_STATUSES, ACTIVE_LINK_STATUSES } from '@sporthub/domain';

/** Набор состояний в виде списка для SQL: `'pending','confirmed'`. */
export function toSqlList(values) {
  return [...values].map((value) => `'${String(value).replace(/'/g, "''")}'`).join(',');
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
  notifications_personal_idx: 'addressee_club_id IS NULL AND addressee_trainer_id IS NULL',
  notifications_personal_unread_idx:
    'addressee_club_id IS NULL AND addressee_trainer_id IS NULL AND read_at IS NULL',
  sessions_active_idx: 'revoked_at IS NULL',
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
   * Адресат уведомления — НЕ БОЛЕЕ одного лица (шаг 35.26).
   *
   * Именно «не более», а не «ровно один»: у уведомления человеку лица нет вовсе,
   * и обе колонки пусты. Форма через CASE — та же, что у остальных пар: функция
   * num_nonnulls есть только в PostgreSQL, а эта запись переносится куда угодно.
   */
  notifications_addressee_one: {
    table: 'notifications',
    expression:
      '(CASE WHEN addressee_club_id IS NULL THEN 0 ELSE 1 END) + (CASE WHEN addressee_trainer_id IS NULL THEN 0 ELSE 1 END) <= 1',
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
  /// Отзыв всех живых сессий пользователя: отозванные в индекс не попадают,
  /// а их со временем становится большинство.
  sessions_active_idx: { table: 'sessions', columns: 'user_id' },
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
