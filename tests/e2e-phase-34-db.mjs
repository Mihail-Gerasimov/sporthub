// Помощники прогона: заглянуть в базу мимо приложения.
//
// Смотреть в базу напрямую здесь ОБЯЗАТЕЛЬНО, а не удобно: половина проверок
// чек-листа звучит как «а запись при этом на месте» и «а в журнале записан кто».
// Спросить об этом само приложение — значит поверить ему на слово ровно там,
// где его и проверяем.
import { execFileSync } from 'node:child_process';

const SEP = '~|~';

function sql(query) {
  const out = execFileSync(
    'docker',
    ['exec', 'sporthub_postgres', 'psql', '-U', 'sporthub', '-d', 'sporthub', '-t', '-A', '-F', SEP, '-c', query],
    { encoding: 'utf8' },
  );

  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(SEP));
}

export async function stillExists(table, id) {
  return sql(`select 1 from ${table} where id = ${Number(id)};`).length > 0;
}

export async function countRows(table) {
  return Number(sql(`select count(*) from ${table};`)[0][0]);
}

export async function findForeignBooking(ownUserId) {
  const rows = sql(`select id from bookings where user_id <> ${Number(ownUserId)} order by id desc limit 1;`);
  return rows.length ? Number(rows[0][0]) : null;
}

export async function lastLogEntry(action, entityType, entityId) {
  const rows = sql(
    `select actor_id, actor_role from logs where action = '${action}' and entity_type = '${entityType}' and entity_id = ${Number(entityId)} order by id desc limit 1;`,
  );

  return rows.length ? { actorId: Number(rows[0][0]), actorRole: rows[0][1] } : null;
}

export async function lastLogActor(action, entityType, entityId) {
  const entry = await lastLogEntry(action, entityType, entityId);
  return entry?.actorId ?? null;
}

export async function clubWithReview() {
  const rows = sql(
    `select c.id, c.slug from reviews r join clubs c on c.id = r.club_id where r.club_id is not null order by r.id desc limit 1;`,
  );

  return rows.length ? { id: Number(rows[0][0]), slug: rows[0][1] } : null;
}

export async function clubById(id) {
  const rows = sql(`select id, slug from clubs where id = ${Number(id)};`);
  return rows.length ? { id: Number(rows[0][0]), slug: rows[0][1] } : null;
}

export async function clubRating(id) {
  const rows = sql(`select rating, review_count from clubs where id = ${Number(id)};`);
  return { rating: Number(rows[0][0]), count: Number(rows[0][1]) };
}

/**
 * Клуб, к которому у этого человека есть НЕИЗРАСХОДОВАННОЕ посещение.
 *
 * Одного «есть завершённая запись» недостаточно с тех пор, как заработала квота
 * «одна оценка на посещение»: прошлые прогоны свои посещения уже отоварили,
 * и отзыв к такому клубу законно отбивается 409. Считаем оба числа и берём клуб,
 * где посещений больше, чем оставленных отзывов.
 */
export async function completedBookingTarget(userId) {
  const rows = sql(
    `select s.owner_club_id,
            count(*) as visits,
            (select count(*) from reviews r where r.user_id = ${Number(userId)} and r.club_id = s.owner_club_id) as given
     from bookings b join schedule s on s.id = b.schedule_id
     where b.user_id = ${Number(userId)} and b.status = 'completed' and s.owner_club_id is not null
     group by s.owner_club_id
     having count(*) > (select count(*) from reviews r where r.user_id = ${Number(userId)} and r.club_id = s.owner_club_id)
     limit 1;`,
  );

  return rows.length
    ? { clubId: Number(rows[0][0]), visits: Number(rows[0][1]), given: Number(rows[0][2]) }
    : null;
}

/** Заявка, ожидающая решения владельца-провайдера с этим userId. */
export async function pendingBookingForOwner(ownerUserId) {
  const rows = sql(
    `select b.id from bookings b join schedule s on s.id = b.schedule_id
     left join clubs c on c.id = s.owner_club_id
     left join trainers t on t.id = s.owner_trainer_id
     where b.status = 'pending' and coalesce(c.managed_by_user_id, t.managed_by_user_id) = ${Number(ownerUserId)}
     order by b.id desc limit 1;`,
  );

  return rows.length ? Number(rows[0][0]) : null;
}

/** Заявка, ожидающая решения, но НЕ принадлежащая этому провайдеру. */
export async function pendingBookingNotOwnedBy(ownerUserId) {
  const rows = sql(
    `select b.id from bookings b join schedule s on s.id = b.schedule_id
     left join clubs c on c.id = s.owner_club_id
     left join trainers t on t.id = s.owner_trainer_id
     where b.status = 'pending' and coalesce(c.managed_by_user_id, t.managed_by_user_id) <> ${Number(ownerUserId)}
     order by b.id desc limit 1;`,
  );

  return rows.length ? Number(rows[0][0]) : null;
}

export async function ownClubId(userId) {
  const rows = sql(`select id from clubs where managed_by_user_id = ${Number(userId)} order by id desc limit 1;`);
  return rows.length ? Number(rows[0][0]) : null;
}

/** Свежая ссылка восстановления. Хранится хеш, поэтому сам токен берётся из журнала заглушки. */
export async function lastResetTokenHashExists(userId) {
  return sql(
    `select 1 from password_reset_tokens where user_id = ${Number(userId)} and used_at is null order by id desc limit 1;`,
  ).length > 0;
}

/**
 * Разделы кабинета: берём подписи навигации, а не «на глаз».
 *
 * Навигаций на странице несколько (шапка сайта, подвал, боковая колонка кабинета),
 * поэтому нужная опознаётся по содержимому — по ссылкам внутрь кабинета, а не
 * по месту в разметке: место переедет при первой же правке вёрстки.
 */
export async function readCabinetSections(page) {
  return page.evaluate(() => {
    const navs = Array.from(document.querySelectorAll('nav'));
    const cabinet = navs.find((nav) => nav.querySelectorAll('a[href^="/profile/"]').length >= 2);

    if (!cabinet) return [];

    return Array.from(cabinet.querySelectorAll('a[href^="/profile/"]'))
      .map((link) => link.textContent.trim().replace(/\s+/g, ' '))
      .filter((text) => text.length > 0 && text.length < 40);
  });
}

/**
 * Просроченная ссылка восстановления. Заводится сразу просроченной: отодвинуть
 * срок у выданной нельзя — база держит проверку «срок позже создания».
 */
export function insertExpiredResetToken(userId) {
  const token = `prosrochennaya-ssylka-34-${Date.now()}`;
  execFileSync('docker', [
    'exec', 'sporthub_postgres', 'psql', '-U', 'sporthub', '-d', 'sporthub', '-c',
    `insert into password_reset_tokens (user_id, token_hash, created_at, expires_at)
     values (${Number(userId)}, encode(sha256('${token}'::bytea), 'hex'), now() - interval '2 days', now() - interval '1 day');`,
  ], { encoding: 'utf8' });

  return token;
}

/** Будущий слот со свободными местами, на который этот человек ещё не записан. */
export async function freeSlotFor(userId) {
  const rows = sql(
    `select s.id from schedule s
     where s.date >= current_date and s.booked_count < s.capacity
       and not exists (select 1 from bookings b where b.schedule_id = s.id and b.user_id = ${Number(userId)})
     order by s.id desc limit 1;`,
  );

  return rows.length ? Number(rows[0][0]) : null;
}

/**
 * Токен из письма. В базе лежит только ХЕШ — по ней ссылку не восстановить,
 * и это правильно. Заглушка отправителя печатает письмо целиком в свой журнал
 * (`mail/log-mailer.ts`), оттуда и берём: ровно так же сделал бы человек,
 * которому это письмо пришло.
 */
export function lastResetTokenFromLetters() {
  const out = execFileSync('docker', ['logs', '--tail', '400', 'sporthub_api'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const matches = [...out.matchAll(/reset-password\?token=([A-Za-z0-9_-]+)/g)];
  return matches.length ? matches[matches.length - 1][1] : null;
}

/** Отодвинуть срок последней выданной ссылки в прошлое — иначе просрочки ждать сутки. */
export function expireLastResetToken(userId) {
  execFileSync('docker', [
    'exec', 'sporthub_postgres', 'psql', '-U', 'sporthub', '-d', 'sporthub', '-c',
    `update password_reset_tokens set expires_at = now() - interval '1 day'
     where id = (select id from password_reset_tokens where user_id = ${Number(userId)} and used_at is null order by id desc limit 1);`,
  ], { encoding: 'utf8' });
}

/**
 * Выдать человеку ЗАВЕРШЁННОЕ посещение клуба.
 *
 * Нужно потому, что прогон обязан быть повторяемым. С тех пор как заработала квота
 * «одна оценка на посещение», сценарий отзыва расходует посещение: второй прогон
 * на тех же данных законно упирается в 409 и краснеет не по делу. Значит посещение
 * должен заводить сам прогон, а не искать среди чужих.
 *
 * Занятие в прошлом и завершённая запись — состояние, которого через продукт
 * не добиться: отметку о посещении ставит провайдер после занятия, и ждать сутки
 * прогон не может. Это подготовка данных, а не обход проверки: само правило
 * (можно ли писать отзыв) проверяется дальше через API, как и положено.
 */
export function giveCompletedVisit(userId, clubId) {
  const out = execFileSync('docker', [
    'exec', 'sporthub_postgres', 'psql', '-U', 'sporthub', '-d', 'sporthub', '-t', '-A', '-c',
    `with past as (
       insert into schedule (offering_id, owner_club_id, venue_club_id, sport_id, title, description,
                             date, start_time, end_time, duration_minutes, level, capacity, booked_count, price, room)
       select offering_id, owner_club_id, venue_club_id, sport_id, title, description,
              current_date - 7, start_time, end_time, duration_minutes, level, capacity, 1, price, room
       from schedule where owner_club_id = ${Number(clubId)} limit 1
       returning id, offering_id, owner_club_id, venue_club_id, sport_id, date, price
     )
     insert into bookings (schedule_id, offering_id, owner_club_id, venue_club_id, user_id, sport_id,
                           date, status, total_price, completed_at, created_at)
     select past.id, past.offering_id, past.owner_club_id, past.venue_club_id, ${Number(userId)}, past.sport_id,
            past.date, 'completed', past.price, now() - interval '7 days', now() - interval '7 days'
     from past
     returning id;`,
  ], { encoding: 'utf8' });

  const id = Number(out.trim().split('\n')[0]);
  return Number.isFinite(id) ? id : null;
}


/**
 * Служебная учётка прогона: заводится, если её ещё нет.
 *
 * Через регистрацию их заводить нельзя — у регистрации свой предел (десять с адреса
 * в час), и он предназначен не для того, чтобы его выедал собственный чек-лист:
 * на третьем прогоне за час учётки перестают создаваться, а падают при этом совсем
 * другие шаги. Пароль берётся готовым хешем у существующей учётки — тем самым,
 * что кладёт сид, так что вход проходит обычным путём.
 */
export function ensureAthlete(email, name) {
  const out = execFileSync('docker', [
    'exec', 'sporthub_postgres', 'psql', '-U', 'sporthub', '-d', 'sporthub', '-t', '-A', '-c',
    `insert into users (email, name, role, status, password_hash, phone, city, created_at)
     select '${email}', '${name}', 'athlete', 'active', u.password_hash, '+7 (900) 000-00-99', 'Самара', now()
     from users u where u.email = 'alexey@sporthub.local'
     on conflict (email) do update set password_hash = excluded.password_hash
     returning id;`,
  ], { encoding: 'utf8' });

  const id = Number(out.trim().split('\n')[0]);
  return Number.isFinite(id) ? id : null;
}
