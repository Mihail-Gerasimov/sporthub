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

/** Признак прогона. По нему всё созданное потом и сносится. */
export const RUN_TAG = 'e2e-phase35';

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
 */
export function cleanupRun() {
  const ids = psql(`SELECT id FROM users WHERE email LIKE '${RUN_TAG}-%';`)
    .split('\n')
    .filter(Boolean);

  if (ids.length === 0) return { users: 0, clubs: 0, trainers: 0 };

  const list = ids.join(',');
  const ownPublications = `
    (SELECT id FROM clubs WHERE managed_by_user_id IN (${list}) OR name LIKE '${RUN_TAG}%')
  `;
  const ownTrainers = `
    (SELECT id FROM trainers WHERE managed_by_user_id IN (${list}) OR name LIKE '${RUN_TAG}%')
  `;

  // Листья: всё, что ссылается на людей и публикации прогона.
  psql(`DELETE FROM notifications WHERE user_id IN (${list});`);
  psql(
    `DELETE FROM provider_client_notes WHERE provider_user_id IN (${list}) OR client_user_id IN (${list});`,
  );
  psql(
    `DELETE FROM reviews WHERE user_id IN (${list}) OR club_id IN ${ownPublications} OR trainer_id IN ${ownTrainers};`,
  );
  // ⚠️ У записи владелец лежит парой колонок (`owner_club_id` / `owner_trainer_id`),
  // а зал занятия — третьей (`venue_club_id`): тренерское занятие в чужом зале
  // принадлежит тренеру, а идёт в клубе. Пропустить `venue_club_id` значило бы
  // оставить записи, которые не дадут удалить клуб.
  psql(
    `DELETE FROM bookings WHERE user_id IN (${list}) OR owner_club_id IN ${ownPublications} OR owner_trainer_id IN ${ownTrainers} OR venue_club_id IN ${ownPublications};`,
  );
  psql(
    `DELETE FROM trainer_club_links WHERE club_id IN ${ownPublications} OR trainer_id IN ${ownTrainers};`,
  );
  psql(
    `DELETE FROM schedule WHERE owner_club_id IN ${ownPublications} OR owner_trainer_id IN ${ownTrainers} OR venue_club_id IN ${ownPublications};`,
  );
  psql(
    `DELETE FROM offerings WHERE owner_club_id IN ${ownPublications} OR owner_trainer_id IN ${ownTrainers} OR venue_club_id IN ${ownPublications};`,
  );
  psql(`DELETE FROM logs WHERE actor_id IN (${list});`);
  psql(`DELETE FROM sessions WHERE user_id IN (${list});`);

  const clubs = psql(
    `WITH d AS (DELETE FROM clubs WHERE id IN ${ownPublications} RETURNING 1) SELECT count(*) FROM d;`,
  );
  const trainers = psql(
    `WITH d AS (DELETE FROM trainers WHERE id IN ${ownTrainers} RETURNING 1) SELECT count(*) FROM d;`,
  );
  const users = psql(
    `WITH d AS (DELETE FROM users WHERE id IN (${list}) RETURNING 1) SELECT count(*) FROM d;`,
  );

  return { users: Number(users), clubs: Number(clubs), trainers: Number(trainers) };
}

/** Прочитать что-нибудь из базы: проверки смотрят в данные, а не в ответ маршрута. */
export function readDb(sql) {
  return psql(sql);
}
