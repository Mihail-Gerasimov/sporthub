// Изолированные данные браузерного прогона: завести и убрать.
//
// ⚠️ Зачем это понадобилось. Первый прогон чек-листа фазы 35 не выполнил 26 шагов
// из 70 — все они создают данные, а на живой базе прогон не должен оставлять следов.
// Замечание З-2 того же отчёта («21 клуб от прежних прогонов висит на живых людях»)
// — обратная сторона той же монеты: прогоны, которые всё-таки создавали, за собой
// не убирали.
//
// Решение одно на обе беды: прогон заводит СВОИХ людей и СВОИ публикации с общим
// признаком в имени, и в конце сносит всё по этому признаку. Живые данные не задеты,
// мусор не копится, а 26 шагов становятся проверяемыми.
//
// ⚠️ Люди заводятся напрямую в базе, а не регистрацией. Так требует сам чек-лист:
// у регистрации свой предел частоты, и на третьем прогоне за час учётки перестали бы
// создаваться — то есть прогон перестал бы быть повторяемым.
import { execFileSync } from 'node:child_process';

import { cleanupPlans, cleanupStatements } from './cleanup-publications.mjs';

/**
 * Признак прогона. По нему всё созданное потом и сносится.
 *
 * ⚠️ Настраивается переменной окружения: прогонов несколько, и они идут
 * одновременно. Общий признак означал бы, что уборка одного сносит данные
 * другого — падение получилось бы правдоподобное и искалось бы долго.
 */
export const RUN_TAG = process.env.E2E_RUN_TAG || 'e2e-phase35';

/**
 * Домены учёток сида, под которыми прогоны входят помимо своих людей
 * (администратор `admin@sporthub.local`, владельцы демо-площадок).
 *
 * ⚠️ Шаг 38.100. Люди прогона уносятся вместе с сессиями (ниже — явным
 * `DELETE FROM sessions`), а вход под учёткой СИДА следа по признаку не оставляет:
 * к 38.100 в живой базе лежало 4015 сессий администратора от браузерных прогонов,
 * ни один из которых не разлогинивался. Правило: **прогон разлогинивается сам** —
 * `cleanupRun()` снимает сессии учёток сида, заведённые ПОСЛЕ старта прогона
 * (номер последней сессии снимается при загрузке модуля, то есть до первого входа;
 * прогону через MCP, где модуль грузится только на уборке, границу называет
 * `E2E_SESSIONS_SINCE` — см. ниже).
 * Человек, вошедший под учёткой сида во время прогона, будет разлогинен вместе с ним:
 * стенд на время прогона — прогону.
 */
export const SEED_EMAIL_DOMAINS = [
  'sporthub.local',
  'arena.local',
  'studio.local',
  'trainer.local',
];

/** Хеш пароля `sporthub123` — тот же, что у людей сида. */
const PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$kZOypsO+wlMzc4WtYnCnfA$i6JooAm2PGSA/2Rh8P0X6XJoe9KQ3tF1+Oi4kBpE3y8';

export const E2E_PASSWORD = 'sporthub123';

/** Учётные записи прогона. Каждая закрывает свой случай модели. */
export const E2E_USERS = {
  /** Заводит себе лица по ходу прогона: начинает без единого. */
  builder: `${RUN_TAG}-builder@test.local`,
  /** Посторонний: чужие вещи ему не принадлежат. */
  stranger: `${RUN_TAG}-stranger@test.local`,
  /** Клиент: записывается к чужим, чтобы у лиц была живая история. */
  client: `${RUN_TAG}-client@test.local`,
};

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', 'sporthub_postgres', 'psql', '-U', 'sporthub', '-d', 'sporthub', '-tAc', sql],
    { encoding: 'utf8' },
  ).trim();
}

/**
 * Граница «своих» входов под сидом.
 *
 * По умолчанию — последняя сессия в базе на момент загрузки модуля (то есть до первого
 * входа прогона). ⚠️ Шаг 38.112: в прогоне через MCP модуль грузится только на уборке —
 * граница совпала бы с концом прогона, и десять сессий администратора, заведённых
 * входами прогона, остались бы в базе (так и вышло 16.09). Тогда границу называет
 * окружение `E2E_SESSIONS_SINCE`: номер сессии (только цифры) — снимаются сессии сида
 * с бо́льшим номером; либо момент времени ISO (`2026-09-16T16:45:00Z`) — снимаются
 * заведённые не раньше него. Иная форма — отказ до первого запроса, а не SQL с мусором.
 */
const SESSIONS_SINCE = process.env.E2E_SESSIONS_SINCE?.trim();
const SESSION_ID_AT_START = SESSIONS_SINCE
  ? null
  : Number(psql('SELECT coalesce(max(id), 0) FROM sessions;'));

/** Условие границы для `DELETE FROM sessions` — по номеру или по времени. */
function sessionsBoundaryWhere() {
  if (!SESSIONS_SINCE) return `id > ${SESSION_ID_AT_START}`;
  if (/^\d+$/.test(SESSIONS_SINCE)) return `id > ${Number(SESSIONS_SINCE)}`;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(SESSIONS_SINCE)) {
    return `created_at >= '${SESSIONS_SINCE}'::timestamptz`;
  }
  throw new Error(
    `E2E_SESSIONS_SINCE: ожидался номер сессии или момент ISO с зоной, получено «${SESSIONS_SINCE}»`,
  );
}

/** Условие «учётка сида» по домену почты — для отбора сессий, не людей. */
const seedEmailWhere = () =>
  SEED_EMAIL_DOMAINS.map((domain) => `email LIKE '%@${domain}'`).join(' OR ');

/**
 * Разлогинить прогон: снять сессии учёток сида, заведённые после старта прогона.
 * Зовётся из `cleanupRun()`; отдельно — для зондов, которые людей прогона не заводят.
 */
export function logoutSeedSessions() {
  const removed = psql(
    `WITH d AS (DELETE FROM sessions WHERE ${sessionsBoundaryWhere()} AND user_id IN (SELECT id FROM users WHERE ${seedEmailWhere()}) RETURNING 1) SELECT count(*) FROM d;`,
  );
  return Number(removed);
}

/** Завести людей прогона. Идемпотентно: повторный запуск ничего не удваивает. */
export function seedRunUsers() {
  for (const [role, email] of Object.entries(E2E_USERS)) {
    psql(`
      INSERT INTO users (created_at, status, account_kind, name, email, phone, password_hash)
      VALUES (now(), 'active', 'person', 'Прогон ${role}', '${email}', '+7 (900) 555-00-01',
              '${PASSWORD_HASH}')
      ON CONFLICT (email) DO NOTHING;
    `);
  }

  const rows = psql(
    `SELECT email || '=' || id FROM users WHERE email LIKE '${RUN_TAG}-%' ORDER BY id;`,
  );

  return Object.fromEntries(
    rows
      .split('\n')
      .filter(Boolean)
      .map((row) => row.split('=')),
  );
}

/**
 * Убрать за собой ВСЁ.
 *
 * ⚠️ Порядок обязателен и продиктован схемой: `Booking.user` и `Review.user` —
 * `onDelete: Restrict`, база не даст удалить человека, у которого есть запись
 * или отзыв. Поэтому сначала листья, потом публикации, потом люди.
 *
 * ⚠️ Сам каскад «лист → корень» живёт не здесь, а в `cleanup-publications.mjs`:
 * тот же порядок слово в слово нужен разовой уборке мусора прежних прогонов
 * (этап Э7 фазы 36), а вторая копия разъехалась бы с первой молча. Здесь остаётся
 * только отбор — номера публикаций, выведенные из метки прогона, — и то,
 * что к публикациям отношения не имеет: следы самих людей.
 *
 * ⚠️ Уведомления и журнал про публикации прогона сносит общая опись. Отбор
 * по `user_id`/`actor_id` их не покрывает: уведомление о клубе прогона могло
 * прийти постороннему, а строку журнала мог написать не он. Пока этого не было,
 * каждый прогон оставлял за собой сирот.
 */
export function cleanupRun({ subjects = [] } = {}) {
  const ids = psql(`SELECT id FROM users WHERE email LIKE '${RUN_TAG}-%';`)
    .split('\n')
    .filter(Boolean);

  // ⚠️ Пустой прогон всё равно обязан убрать названные предметы. Надзорная строка
  // про СТЁРТУЮ публикацию не привязана ни к кому: ни владельца, ни живого предмета
  // у неё нет, и найти её по спискам номеров нельзя — номеров больше не существует.
  // Поэтому выход «людей прогона нет — убирать нечего» действует только когда
  // и предметов не названо.
  // Даже пустому прогону есть что убрать: входы под учётками сида (38.100).
  if (ids.length === 0 && subjects.length === 0) {
    return { users: 0, clubs: 0, trainers: 0, sessions: logoutSeedSessions() };
  }

  const list = ids.join(',');
  const idsOf = (table) =>
    psql(
      `SELECT id FROM ${table} WHERE managed_by_user_id IN (${list}) OR name LIKE '${RUN_TAG}%';`,
    )
      .split('\n')
      .filter(Boolean)
      .map(Number);

  const clubIds = idsOf('clubs');
  const trainerIds = idsOf('trainers');

  // Публикации прогона со всем, что на них висит, ПЛЮС следы самих людей —
  // общим реестром планов (шаг 37.56).
  //
  // ⚠️ Прежде уведомления людей убирались здесь отдельной строкой с отбором
  // `user_id IN (…)`. У надзорной строки владельца НЕТ, и `IN` с `NULL`
  // не совпадает никогда: выживала любая надзорная строка, порождённая действием
  // любого человека прогона. Ключ уборки — ПРЕДМЕТ, а не владелец, и он один
  // на оба плана.
  const userIds = list.split(',').map(Number);

  // ⚠️ `subjects` — номера того, что прогон СТЁР по ходу дела, запомненные ДО удаления.
  //
  // Прогон, который стирает публикацию или запись, ОБЯЗАН их передать:
  //
  //   cleanupRun({ subjects: [{ type: 'club', ids: [256, 257] }, { type: 'booking', ids: [1417] }] })
  //
  // Иначе надзорная строка про стирание останется в живой базе навсегда: искать её
  // не по чему — владельца у неё нет, а предмета уже нет в таблице. Найдено
  // браузерным прогоном фазы 37 (шаг 37.61).
  for (const statement of cleanupStatements(
    cleanupPlans({ clubIds, trainerIds, userIds, subjects }),
  )) {
    psql(statement);
  }

  // Остальные следы людей: они могли записаться и на чужую публикацию, и без этих
  // строк база не отдаст удалить человека (`Restrict` на записи и отзыве).
  psql(
    `DELETE FROM provider_client_notes WHERE provider_user_id IN (${list}) OR client_user_id IN (${list});`,
  );
  psql(`DELETE FROM reviews WHERE user_id IN (${list});`);
  psql(`DELETE FROM bookings WHERE user_id IN (${list});`);
  psql(`DELETE FROM sessions WHERE user_id IN (${list});`);

  const users = psql(
    `WITH d AS (DELETE FROM users WHERE id IN (${list}) RETURNING 1) SELECT count(*) FROM d;`,
  );

  // Прогон разлогинивается сам: сессии учёток сида, заведённые с его старта (38.100).
  const sessions = logoutSeedSessions();

  return { users: Number(users), clubs: clubIds.length, trainers: trainerIds.length, sessions };
}

/** Прочитать что-нибудь из базы: проверки смотрят в данные, а не в ответ маршрута. */
export function readDb(sql) {
  return psql(sql);
}

/**
 * Прочитать НОМЕР строки — например из `INSERT … RETURNING id`.
 *
 * ⚠️ Зачем отдельная функция, а не `Number(readDb(...))`. При `-tAc` psql печатает
 * не только возвращённую строку: следом идёт тег команды — «INSERT 0 1». Взятый
 * целиком ответ становится номером с переносом строки внутри, и дальше он уезжает
 * в селектор `[data-testid="…"]`, который разваливается РАЗБОРОМ CSS, а не
 * проверяемым утверждением: прогон падает с «Unsupported token BADSTRING», и падение
 * выглядит дефектом продукта. Так и случилось 13.09.2026 на шаге 37 чек-листа
 * фазы 37 — повторный проход прошёл, то есть прогон замигал на пустом месте.
 *
 * Мигающий прогонщик обесценивает и зелёный результат: непонятно, что он доказал.
 */
export function readDbId(sql) {
  const answer = readDb(sql);
  const found = /\d+/.exec(answer);

  if (found === null) {
    throw new Error(`номер строки не прочитан, ответ базы: «${answer}»`);
  }

  return found[0];
}
