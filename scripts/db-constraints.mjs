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

import { ACTIVE_BOOKING_STATUSES, ACTIVE_LINK_STATUSES } from '@sporthub/domain';

/** Набор состояний в виде списка для SQL: `'pending','confirmed'`. */
export function toSqlList(values) {
  return [...values].map((value) => `'${String(value).replace(/'/g, "''")}'`).join(',');
}

/** Предикаты частичных индексов — единственное место, где они записаны. */
export const INDEX_PREDICATES = {
  bookings_active_slot_user_uq: `status IN (${toSqlList(ACTIVE_BOOKING_STATUSES)})`,
  links_active_pair_uq: `status IN (${toSqlList(ACTIVE_LINK_STATUSES)})`,
  bst_initial_uq: 'from_status IS NULL',
  schedule_has_free_seats_idx: 'booked_count < capacity',
  bookings_active_by_slot_idx: `status IN (${toSqlList(ACTIVE_BOOKING_STATUSES)})`,
  notifications_unread_idx: 'read_at IS NULL',
};

/**
 * Проверки целостности.
 *
 * «Ровно один владелец» записана через CASE, а не через num_nonnulls: та функция
 * есть только в PostgreSQL, а эта форма переносится на любую СУБД. Цена — ноль.
 */
export const CHECK_CONSTRAINTS = {
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
};

/**
 * Проверка «занятых мест не больше вместимости» ставится ОТДЕЛЬНО и позже остальных.
 *
 * Сегодня зажим `Math.max(0, …)` маскирует уход счётчика в минус, а проверка
 * вместимости стоит вне транзакции. Пока это не починено, ограничение превратит
 * известные сценарии рассинхрона из тихих в пятисотки. Порядок: сначала условное
 * обновление счётчика, потом эта проверка.
 */
export const DEFERRED_CHECK_CONSTRAINTS = {
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
};

/** Частичные обычные индексы — под запросы, которые смотрят только на часть строк. */
export const PARTIAL_INDEXES = {
  schedule_has_free_seats_idx: { table: 'schedule', columns: 'date, start_time' },
  bookings_active_by_slot_idx: { table: 'bookings', columns: 'schedule_id, status' },
  notifications_unread_idx: { table: 'notifications', columns: 'user_id, created_at DESC' },
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
