// Браузерный прогон чек-листа `tests/checklists/phase-34-security.md` — 99 шагов,
// 15 сценариев: авторизация, сессии, закрытые маршруты, владение, админка,
// работа от чужого лица, частота, заголовки и восстановление пароля.
//
// Запуск: node tests/e2e-phase-34-security-run.mjs
// Требуется: поднятое приложение на :3000 (`npm run app:up`) и Playwright.
//
// ⚠️ Правило прогона (шапка самого чек-листа, урок Ф33). Шаг НЕ засчитывается по коду
// ответа. Каждая проверка смотрит в СОДЕРЖИМОЕ: что вернулось, какой текст у отказа,
// что видно на экране, что лежит в базе. `200` там, где ждали отказа, — дефект,
// а не «почти прошло». Отдельно ловится зелень «по чужой причине»: если отказ пришёл
// от разбора тела (400 «Некорректные данные»), а не от проверки прав, шаг красный —
// поэтому тела запросов всюду полные, а тексты отказов сверяются дословно.
//
// ⚠️ Запросы идут ИЗ БРАУЗЕРА (`api()` обвязки), а не через curl: только так в запрос
// попадают настоящая cookie сессии, настоящий `Origin` и `Sec-Fetch-Site` — то есть
// ровно то, что фаза 34 и проверяет. Исключение одно и оно предписано самим чек-листом
// (шаг 62): чужой источник из вкладки подделать нельзя — эти заголовки запрещённые,
// браузер ставит их сам, — поэтому межсайтовый запрос шлётся контекстом запросов
// Playwright, как его слал бы чужой сайт.
//
// ⚠️ Прогон обязан проходить ДВАЖДЫ ПОДРЯД. Отсюда три решения:
//   1. свои люди и свои публикации с признаком прогона, уборка в `finally` — она
//      отрабатывает и после падения, иначе второй прогон падал бы на данных первого;
//   2. учётки для лестницы блокировок и замера времени — с меткой времени в почте:
//      лестница липнет к почте и живёт в памяти процесса, переживая удаление строки
//      из базы, так что повторное использование того же адреса заперло бы прогон;
//   3. предел частоты восстановления пароля (5 за 10 минут на адрес) прогон
//      выедает сам — сценарий 15 умеет дождаться его истечения, а не покраснеть.
//
// ⚠️ Прогон занимает около семи минут: в сценарии 11 две паузы (минута и две) —
// иначе лестницу блокировок входа не проверить, у неё шаг ровно минута.

// Признак прогона и каталог снимков — до импорта фикстуры: она читает их при загрузке.
process.env.E2E_RUN_TAG ||= 'e2e-p34sec';
process.env.E2E_SHOTS_DIR ||= '/Users/misha/Desktop/prosport2.1/tests/screenshots/phase-34-security';

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

import {
  BASE, PASSWORD, api, freshContext, futureDate, launch, loginAs, must, mustEqual,
  results, shutdown, skip, step, whoAmI,
} from './e2e-phase-35-harness.mjs';

const fixture = await import('../scripts/e2e-fixture.mjs');
const { E2E_USERS, RUN_TAG, cleanupRun, readDb, seedRunUsers } = fixture;

// ───────────── Люди ─────────────
//
// ⚠️ Чек-лист написан на сидовые id (1–5), а прогон идёт по ЖИВОЙ базе, где набор
// людей другой. Соответствие ролям чек-листа:
//   id=1 (админ)          → admin@sporthub.local
//   id=2 (клубы)          → marina@studio.local (18 клубов) и свой `stranger`
//   id=3 (карточка)       → anna@trainer.local (ровно одна карточка, клубов нет)
//   id=4 (лиц нет)        → alexey@sporthub.local и свой `client`
//   id=5 (клуб + карточка)→ свой `builder` (заводит оба лица по ходу прогона)
// Читающие проверки идут по живым людям — так строже, там есть история. Всё,
// что МЕНЯЕТ данные, идёт по своим: живую базу прогон не трогает.
const LIVE = {
  admin: 'admin@sporthub.local',
  noFaces: 'alexey@sporthub.local',
  clubs: 'marina@studio.local',
  card: 'anna@trainer.local',
  cards: 'trainer@sporthub.local',
};

const STAMP = Date.now().toString(36);
const OWN = {
  builder: E2E_USERS.builder,
  stranger: E2E_USERS.stranger,
  client: E2E_USERS.client,
  starter: `${RUN_TAG}-starter@test.local`,
  sessions: `${RUN_TAG}-sessions@test.local`,
  reset: `${RUN_TAG}-reset@test.local`,
  admin2: `${RUN_TAG}-admin2@test.local`,
  // ⚠️ С меткой времени: лестница блокировок входа живёт в ПАМЯТИ процесса и липнет
  // к почте. Тот же адрес во втором прогоне пришёл бы уже запертым.
  lockout: `${RUN_TAG}-lockout-${STAMP}@test.local`,
  timing: `${RUN_TAG}-timing-${STAMP}@test.local`,
  // ⚠️ Отдельная почта под шаг 2: пять замеров шага 4 — ровно порог лестницы,
  // и лишняя неудача на том же адресе обрывала бы замер 429-м ответом.
  wrong: `${RUN_TAG}-wrong-${STAMP}@test.local`,
};

const NEW_PASSWORD = 'novyy-parol-34-security';
const RESET_PASSWORD = 'sbroshennyy-parol-34-security';

/** Состояние прогона: что создано и на чём держатся следующие шаги. */
const state = {};
let userIds = {};

// ───────────── Мелкие помощники ─────────────

/** Одна строка из базы. Смотреть в базу обязательно: половина проверок — «а что там на самом деле». */
function one(sql) {
  return readDb(sql).split('\n')[0] ?? '';
}

/** Завести служебных людей прогона напрямую в базе — у регистрации свой предел частоты. */
function seedExtraUsers(emails, kind = 'person') {
  for (const email of emails) {
    readDb(`
      INSERT INTO users (created_at, status, account_kind, name, email, phone, password_hash)
      SELECT now(), 'active', '${kind}', 'Прогон 34 ${email.split('@')[0]}', '${email}',
             '+7 (900) 556-00-02', u.password_hash
      FROM users u WHERE u.email = '${LIVE.noFaces}'
      ON CONFLICT (email) DO NOTHING;
    `);
  }
}

/** Номера людей прогона по почте. */
function loadUserIds() {
  const rows = readDb(`SELECT email || '=' || id FROM users WHERE email LIKE '${RUN_TAG}-%';`);

  return Object.fromEntries(rows.split('\n').filter(Boolean).map((row) => row.split('=')));
}

/**
 * Ответ СТРАНИЦЫ без отрисовки и без перехода по редиректу.
 *
 * ⚠️ Нужен там, где чек-лист требует «увели» И «данных в потоке нет» — это разные
 * утверждения, и второе видно только в исходном потоке: данные могли уехать
 * на клиент и просто не быть показаны. `fetch(redirect:'manual')` из вкладки для
 * этого не годится — браузер отдаёт непрозрачный ответ без тела и без кода.
 */
async function pageResponse(context, url) {
  const response = await context.request.get(`${BASE}${url}`, { maxRedirects: 0 });

  return {
    status: response.status(),
    location: response.headers().location ?? '',
    body: await response.text(),
  };
}

/**
 * Что в потоке ответа считается утечкой.
 *
 * ⚠️ Искать всякий символ «@» нельзя: почты и телефоны КЛУБОВ публичны — их отдаёт
 * каталог, они же нарисованы на карточке. Утечка — это личность вошедшего, хеш
 * пароля и данные записей, то есть ровно то, что живёт в кабинете.
 */
function leaks(body, ownEmail) {
  const found = [];

  if (ownEmail && body.includes(ownEmail)) found.push('почта вошедшего');
  for (const email of Object.values(LIVE)) if (body.includes(email)) found.push(`почта человека ${email}`);
  if (/passwordHash|\$argon2/.test(body)) found.push('хеши паролей');
  if (/"totalPrice"|"paymentStatus"|"bookings":\[\{/.test(body)) found.push('данные записей');

  return found;
}

/** Полное тело публикации клуба: частичное отвергается разбором ДО проверки владения. */
function clubForm(name, slots) {
  return {
    name,
    city: 'Самара',
    address: 'ул. Проверочная, 1',
    description:
      'Клуб, заведённый браузерным прогоном чек-листа фазы 34. Описание заведомо длиннее пятидесяти символов, как требует схема публикации.',
    phone: '+7 (900) 556-00-10',
    email: `${RUN_TAG}-club@test.local`,
    priceFrom: '700',
    sportIds: [1],
    tagIds: [],
    amenityIds: [],
    vk: '',
    telegram: '',
    facebook: '',
    coordinates: { lat: 53.2, lng: 50.1 },
    cityCoordinates: { lat: 53.2, lng: 50.1 },
    scheduleSlots: slots,
  };
}

/** Полное тело публикации карточки тренера. */
function trainerForm(lastName, slots) {
  return {
    firstName: RUN_TAG,
    lastName,
    city: 'Самара',
    address: 'ул. Проверочная, 2',
    bio: 'Карточка тренера, заведённая браузерным прогоном чек-листа фазы 34. Описание заведомо длиннее пятидесяти символов, как требует схема.',
    experience: '5',
    sportIds: [1],
    specialtyIds: [1],
    workFormatIds: [1],
    phone: '+7 (900) 556-00-11',
    vk: '',
    telegram: '',
    facebook: '',
    offeringName: 'Персональная тренировка',
    offeringDescription: 'Занятие один на один',
    offeringFormat: 'Индивидуально',
    offeringPrice: '1500',
    offeringDuration: '60',
    offeringLocation: 'Зал',
    clubId: null,
    coordinates: { lat: 53.2, lng: 50.1 },
    cityCoordinates: { lat: 53.2, lng: 50.1 },
    scheduleSlots: slots,
  };
}

function slot(title, days, startTime, endTime, capacity = '10') {
  return {
    title,
    date: futureDate(days),
    startTime,
    endTime,
    price: '700',
    capacity,
    location: 'Зал',
    sportId: 1,
  };
}

/** Разделы кабинета по ПОДПИСЯМ: сравниваются они, а не хвосты адресов. */
async function sections(page, url) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('nav[aria-label*="азделы"]', { timeout: 15000 });

  return page.$$eval('nav[aria-label*="азделы"] a[href^="/profile/"]', (nodes) =>
    [...new Set(nodes.map((n) => n.textContent.trim()).filter(Boolean))],
  );
}

/** Запрос из браузера вместе с заголовком `Retry-After` — он нужен ожиданию ниже. */
async function apiWithRetryAfter(page, method, url, body) {
  return page.evaluate(
    async ([m, u, b]) => {
      const response = await fetch(u, {
        method: m,
        headers: b ? { 'content-type': 'application/json' } : {},
        body: b ? JSON.stringify(b) : undefined,
      });
      const text = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }

      return {
        status: response.status,
        body: parsed,
        text: text.slice(0, 500),
        retryAfter: Number(response.headers.get('retry-after') ?? 0),
      };
    },
    [method, url, body ?? null],
  );
}

/**
 * Запрос сценария 15 с ожиданием предела частоты.
 *
 * ⚠️ Пределы здесь свои у каждого маршрута: 5 заявок за 10 минут на восстановление
 * и столько же на сам сброс. Чек-лист требует этот предел ВЫЕСТЬ (шаг 83), а прогон
 * обязан проходить дважды подряд — и второй заход, начавшись раньше, чем истечёт
 * окно, упирался бы в 429 на шагах 76 и 79. Значит ожидание — не костыль,
 * а единственный способ остаться повторяемым, не трогая настройки приложения.
 * Ждём ровно столько, сколько назвал сам сервер в `Retry-After`.
 */
async function withoutRateLimit(page, method, url, body, what) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await apiWithRetryAfter(page, method, url, body);

    if (response.status !== 429) return response;

    const wait = Math.min(Math.max(response.retryAfter, 5), 120) * 1000 + 1000;
    console.log(`  ⏳ предел частоты (${what}) ещё держится, сервер просит ${response.retryAfter} с — жду…`);
    await page.waitForTimeout(wait);
  }

  throw new Error(`предел частоты (${what}) не истёк за отведённое время`);
}

/** Заявка на восстановление пароля — с тем же ожиданием. */
async function forgotPassword(page, email) {
  return withoutRateLimit(page, 'POST', '/api/auth/forgot-password', { email }, 'восстановление');
}

/**
 * Ссылка восстановления ДЛЯ КОНКРЕТНОГО адресата.
 *
 * ⚠️ В базе лежит только хеш — по ней ссылку не восстановить, и это правильно.
 * Письмо целиком печатает заглушка отправителя, оттуда и берём: ровно так же
 * поступил бы человек, которому оно пришло. Адресат обязателен: письма прошлых
 * прогонов лежат в том же журнале, и «последняя ссылка вообще» оказалась бы чужой —
 * шаг покраснел бы «ссылка недействительна», ничего не сказав о самой ссылке.
 */
function lastResetToken(email) {
  const out = execFileSync('docker', ['logs', '--tail', '1500', 'sporthub_api'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const letters = out.split('ПИСЬМО НЕ ОТПРАВЛЕНО').filter((block) => block.includes(email));
  const last = letters[letters.length - 1] ?? '';
  const matches = [...last.matchAll(/reset-password\?token=([A-Za-z0-9_-]+)/g)];

  return matches.length ? matches[matches.length - 1][1] : null;
}

/** Просроченная ссылка: завести сразу такой — база держит проверку «срок позже создания». */
function insertExpiredResetToken(userId) {
  const token = `prosrochennaya-34-security-${Date.now()}`;
  readDb(`INSERT INTO password_reset_tokens (user_id, token_hash, created_at, expires_at)
          VALUES (${userId}, encode(sha256('${token}'::bytea), 'hex'),
                  now() - interval '2 days', now() - interval '1 day');`);

  return token;
}

/**
 * Завершённое посещение клуба — напрямую в базу.
 *
 * ⚠️ Через продукт этого состояния не добиться: отметку о посещении ставит владелец
 * лица ПОСЛЕ окончания занятия, а ждать сутки прогон не может. Это подготовка данных,
 * а не обход проверки: само правило «можно ли писать отзыв» дальше проверяется
 * маршрутом, как и положено.
 */
function giveCompletedVisit(userId, clubId) {
  const id = one(`
    WITH past AS (
      INSERT INTO schedule (offering_id, owner_club_id, venue_club_id, sport_id, title, description,
                            date, start_time, end_time, duration_minutes, level, capacity, booked_count, price, room)
      SELECT offering_id, owner_club_id, venue_club_id, sport_id, title, description,
             current_date - 7, start_time, end_time, duration_minutes, level, capacity, 1, price, room
      FROM schedule WHERE owner_club_id = ${clubId} LIMIT 1
      RETURNING id, offering_id, owner_club_id, venue_club_id, sport_id, date, price
    )
    INSERT INTO bookings (schedule_id, offering_id, owner_club_id, venue_club_id, user_id, sport_id,
                          date, status, total_price, completed_at, created_at)
    SELECT past.id, past.offering_id, past.owner_club_id, past.venue_club_id, ${userId}, past.sport_id,
           past.date, 'completed', past.price, now() - interval '7 days', now() - interval '7 days'
    FROM past RETURNING id;
  `);

  return Number(id) || null;
}

/**
 * Сбросить лестницу блокировок по ip.
 *
 * ⚠️ У неё два счётчика: по почте (порог 5) и по ip (порог 20). Прогон делает около
 * тридцати неудачных попыток, и без сброса он запер бы сам себя по ip в середине
 * сценария 11 — причём покраснели бы совсем другие шаги. Успешный вход снимает ОБА
 * ключа, поэтому после каждой серии неудач делается вход заведомо живой учёткой.
 */
async function resetIpLockout(page) {
  await api(page, 'POST', '/api/auth/login', { email: OWN.client, password: PASSWORD });
}

// ───────────── Прогон ─────────────

async function main() {
  console.log('готовлю данные прогона…');
  seedRunUsers();
  seedExtraUsers([OWN.starter, OWN.sessions, OWN.reset, OWN.lockout, OWN.timing, OWN.wrong]);
  seedExtraUsers([OWN.admin2], 'admin');
  userIds = loadUserIds();
  console.log(`заведено людей: ${Object.keys(userIds).length}`);

  await launch();

  const builder = await freshContext();
  const stranger = await freshContext();
  const client = await freshContext();

  await loginAs(builder.page, OWN.builder);
  await loginAs(stranger.page, OWN.stranger);
  await loginAs(client.page, OWN.client);

  // Публикации прогона. Заводятся ЧЕРЕЗ ПРОДУКТ: расписание создаётся только вместе
  // с публикацией, отдельного маршрута создания слота в проекте нет.
  const trainerCard = await api(builder.page, 'POST', '/api/trainers',
    trainerForm('Свой', [slot('Персоналка прогона', 6, '12:00', '13:00', '3')]));
  must(trainerCard.status === 201 || trainerCard.status === 200, `карточка builder: ${trainerCard.text}`);
  state.ownTrainerId = trainerCard.body?.data?.trainer?.id;

  // ⚠️ Названия занятий говорящие: шагу 34 надо отличить записи ЭТОГО человека
  // как клиента от записей ЕГО клиентов, а на странице расписания видно название
  // занятия, а не имя записавшегося.
  const ownClub = await api(builder.page, 'POST', '/api/clubs',
    clubForm(`${RUN_TAG} Клуб владельца`, [
      slot('Занятие клиента А', 7, '10:00', '11:00'),
      slot('Занятие клиента Б', 8, '10:00', '11:00'),
      slot('Занятие владельца', 9, '10:00', '11:00'),
    ]));
  must(ownClub.status === 201 || ownClub.status === 200, `клуб builder: ${ownClub.text}`);
  state.ownClubId = ownClub.body?.data?.club?.id;

  const disposable = await api(builder.page, 'POST', '/api/clubs',
    clubForm(`${RUN_TAG} Клуб под архив`, [slot('Занятие архивное', 10, '10:00', '11:00')]));
  must(disposable.status === 201 || disposable.status === 200, `клуб под архив: ${disposable.text}`);
  state.disposableClubId = disposable.body?.data?.club?.id;

  const foreignClub = await api(stranger.page, 'POST', '/api/clubs',
    clubForm(`${RUN_TAG} Клуб постороннего`, [
      slot('Чужое занятие А', 7, '14:00', '15:00'),
      slot('Чужое занятие Б', 8, '14:00', '15:00'),
    ]));
  must(foreignClub.status === 201 || foreignClub.status === 200, `клуб stranger: ${foreignClub.text}`);
  state.foreignClubId = foreignClub.body?.data?.club?.id;

  // Слоты: по владельцу, из расписания — их отбирает бэкенд, а не прогон в памяти.
  const scheduleOf = async (page, clubId) => {
    const response = await api(page, 'GET', `/api/clubs/${clubId}`);
    return response.body?.data?.schedule ?? [];
  };

  state.ownSlots = await scheduleOf(builder.page, state.ownClubId);
  state.foreignSlots = await scheduleOf(stranger.page, state.foreignClubId);
  must(state.ownSlots.length >= 3, `у своего клуба слотов ${state.ownSlots.length}`);
  must(state.foreignSlots.length >= 2, `у чужого клуба слотов ${state.foreignSlots.length}`);

  // ⚠️ По названию, а не по месту в выдаче: порядок расписания задаёт бэкенд,
  // и завязка на индекс сделала бы проверки шага 34 случайными.
  const byTitle = (slots, title) => {
    const found = slots.find((row) => row.title === title);
    must(found, `в расписании нет слота «${title}»`);
    return found;
  };

  state.slotClientA = byTitle(state.ownSlots, 'Занятие клиента А');
  state.slotClientB = byTitle(state.ownSlots, 'Занятие клиента Б');
  state.slotOwner = byTitle(state.ownSlots, 'Занятие владельца');
  state.slotForeignA = byTitle(state.foreignSlots, 'Чужое занятие А');
  state.slotForeignB = byTitle(state.foreignSlots, 'Чужое занятие Б');

  // Живые заявки: клиент записан на два занятия своего клуба, владелец — на третье
  // (решение 16: записаться в свой зал можно, а решать по этой записи — нельзя).
  const bookAs = async (page, scheduleId, name, phone) => {
    const response = await api(page, 'POST', '/api/bookings', { scheduleId, name, phone });
    must(response.status === 201 || response.status === 200, `запись «${name}»: ${response.status} ${response.text}`);
    return response.body?.data?.id;
  };

  state.clientBooking1 = await bookAs(client.page, state.slotClientA.id, 'Клиент прогона', '+7 (900) 556-00-20');
  state.clientBooking2 = await bookAs(client.page, state.slotClientB.id, 'Клиент прогона', '+7 (900) 556-00-21');
  state.ownerBooking = await bookAs(builder.page, state.slotOwner.id, 'Владелец прогона', '+7 (900) 556-00-22');
  state.builderAsClient = await bookAs(builder.page, state.slotForeignB.id, 'Владелец прогона', '+7 (900) 556-00-23');

  // Завершённое посещение клиента — под сценарий отзыва.
  state.completedBooking = giveCompletedVisit(userIds[OWN.client], state.ownClubId);
  must(state.completedBooking, 'завершённое посещение не завелось');

  // Заметка о клиенте: без неё шаг 35 был бы зелёным по чужой причине — на пустом
  // списке «чужих заметок нет» верно всегда.
  const note = await api(builder.page, 'POST', '/api/provider-client-notes', {
    clientUserId: Number(userIds[OWN.client]),
    note: 'Заметка прогона о своём клиенте.',
    faceType: 'club',
    faceId: state.ownClubId,
  });
  state.noteCreated = note.status === 201 || note.status === 200;

  console.log(`  свои: клуб ${state.ownClubId}, карточка ${state.ownTrainerId}, под архив ${state.disposableClubId}`);
  console.log(`  чужой клуб ${state.foreignClubId}; заявки ${state.clientBooking1}, ${state.clientBooking2}, своя ${state.ownerBooking}`);

  await builder.context.close();
  await stranger.context.close();
  await client.context.close();

  await scenario1();
  await scenario2();
  await scenario3();
  await scenario4();
  await scenario5();
  await scenario6();
  await scenario7();
  await scenario8();
  await scenario9();
  await scenario10();
  await scenario11();
  await scenario12();
  await scenario13();
  await scenario14();
  await scenario15();

  await shutdown();

  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;

  console.log(`\nИтог: ${pass} прошло, ${fail} упало, ${skipped} не прогонялось (всего ${results.length}).`);
  fs.writeFileSync('/tmp/phase-34-security-e2e.json', JSON.stringify(results, null, 2));

  return fail;
}

// ───────────── Сценарий 1. Вход (гость) ─────────────

async function scenario1() {
  console.log('\n=== Сценарий 1. Вход (гость) ===');
  const guest = await freshContext();
  let wrongPassword = null;

  await step('step-1', 'модалка входа открывается, вкладка «Вход» активна', async () => {
    await guest.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    // ⚠️ Ждём КНОПКУ, а не таймаут: шапка — клиентский компонент и появляется
    // после гидрации; проверка сразу после загрузки сказала бы «кнопки нет».
    const button = guest.page.getByRole('button', { name: /^войти$/i }).first();
    await button.waitFor({ state: 'visible', timeout: 20000 });
    await button.click();

    const modal = guest.page.getByRole('dialog');
    await modal.waitFor({ state: 'visible', timeout: 10000 });

    const text = await modal.innerText();
    must(/Продолжить вход/i.test(text), `в модалке нет формы входа: ${text.replace(/\s+/g, ' ').slice(0, 160)}`);

    const active = await guest.page
      .locator('[role="tablist"] [aria-selected="true"], [role="tablist"] button')
      .first()
      .innerText();
    must(/вход/i.test(active), `активная вкладка не «Вход»: «${active}»`);

    return `модалка открыта, активная вкладка «${active.trim()}»`;
  }, guest.page);

  await step('step-2', 'верная почта + неверный пароль — 401 «Неверная почта или пароль»', async () => {
    wrongPassword = await api(guest.page, 'POST', '/api/auth/login', {
      email: OWN.wrong, password: 'zavedomo-nevernyy',
    });
    mustEqual(wrongPassword.status, 401, 'код ответа');
    mustEqual(wrongPassword.body?.error, 'Неверная почта или пароль', 'текст ошибки');

    return `401 «${wrongPassword.body.error}»`;
  }, guest.page);

  await step('step-3', 'несуществующая почта — ответ дословно тот же', async () => {
    const unknown = await api(guest.page, 'POST', '/api/auth/login', {
      email: `${RUN_TAG}-net-takogo-${STAMP}@test.local`, password: 'lyuboy-parol',
    });
    mustEqual(unknown.status, wrongPassword.status, 'код ответа');
    mustEqual(JSON.stringify(unknown.body), JSON.stringify(wrongPassword.body), 'тело ответа');

    return 'ответы шагов 2 и 3 совпали побайтово';
  }, guest.page);

  await step('step-4', 'время ответов не выдаёт существующую почту', async () => {
    // ⚠️ Пять замеров — ровно порог лестницы блокировок по почте. Шестой пришёл бы
    // мгновенным 429 и обвалил бы медиану, то есть шаг стал бы зелёным по чужой причине.
    const measure = async (email) => {
      const samples = [];
      for (let i = 0; i < 5; i += 1) {
        const started = Date.now();
        const response = await api(guest.page, 'POST', '/api/auth/login', { email, password: `nevernyy-${i}` });
        must(response.status === 401, `замер сбит: ответ ${response.status} «${response.body?.error}»`);
        samples.push(Date.now() - started);
      }
      samples.sort((a, b) => a - b);
      return samples[2];
    };

    const known = await measure(OWN.timing);
    const unknown = await measure(`${RUN_TAG}-net-takogo-2-${STAMP}@test.local`);
    await resetIpLockout(guest.page);

    const ratio = Math.max(known, unknown) / Math.max(1, Math.min(known, unknown));
    must(ratio < 2, `медианы разошлись вдвое: известная ${known} мс, неизвестная ${unknown} мс`);

    return `медианы ${known} мс и ${unknown} мс — один порядок`;
  }, guest.page);

  await step('step-5', 'верная пара — вход прошёл, в шапке имя пользователя', async () => {
    const response = await api(guest.page, 'POST', '/api/auth/login', { email: OWN.client, password: PASSWORD });
    mustEqual(response.status, 200, 'код входа');

    await guest.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
    const name = String(response.body?.data?.name ?? '').split(' ')[0];
    await guest.page.locator('header').first().getByText(name, { exact: false })
      .first().waitFor({ state: 'visible', timeout: 15000 });

    return `в шапке «${name}»`;
  }, guest.page);

  await step('step-6', 'cookie сессии: HttpOnly, SameSite=Lax, значение не число и не почта', async () => {
    const cookies = await guest.context.cookies();
    const session = cookies.find((c) => c.name.includes('sh-session'));

    must(session, `cookie сессии нет: ${cookies.map((c) => c.name).join(', ') || 'пусто'}`);
    must(session.httpOnly, 'флаг HttpOnly не выставлен');
    mustEqual(session.sameSite, 'Lax', 'SameSite');
    must(!/^\d+$/.test(session.value), `значение — число: ${session.value}`);
    must(!session.value.includes('@'), 'значение похоже на почту');
    must(session.value.length >= 32, `значение короткое: ${session.value.length} символов`);
    // В базе лежит хеш, а не сам идентификатор: утёкший дамп входа не даёт.
    const raw = one(`SELECT count(*) FROM sessions WHERE token_hash = '${session.value}';`);
    mustEqual(raw, '0', 'значение cookie найдено в базе как есть — хранится не хеш');

    state.cookieName = session.name;

    return `${session.name}, HttpOnly, SameSite=Lax, ${session.value.length} символов, в базе только хеш`;
  }, guest.page);

  await step('step-7', 'localStorage не источник истины, cookie sh-auth-user-id нет', async () => {
    const cookies = await guest.context.cookies();
    must(!cookies.some((c) => c.name === 'sh-auth-user-id'), 'старая cookie sh-auth-user-id на месте');

    const stored = await guest.page.evaluate(() => {
      const out = {};
      for (let i = 0; i < localStorage.length; i += 1) out[localStorage.key(i)] = localStorage.getItem(localStorage.key(i));
      return out;
    });
    const raw = JSON.stringify(stored);
    must(!/"userId"\s*:\s*\d/.test(raw), `в localStorage лежит userId: ${raw.slice(0, 200)}`);
    must(!raw.includes(OWN.client), `в localStorage лежит почта вошедшего: ${raw.slice(0, 200)}`);

    return `cookie sh-auth-user-id нет; в localStorage ключей ${Object.keys(stored).length}, личности среди них нет`;
  }, guest.page);

  await step('step-8', '«кто я» — свой профиль без хеша пароля, с faces и без role', async () => {
    const me = await api(guest.page, 'GET', '/api/auth/me');

    mustEqual(me.status, 200, 'код');
    mustEqual(me.body?.data?.email, OWN.client, 'почта в профиле');
    must(!/passwordHash|\$argon2/.test(me.text), 'в ответе есть хеш пароля');
    mustEqual(me.body?.data?.accountKind, 'person', 'вид учётной записи');
    must(Array.isArray(me.body?.data?.capabilities), 'нет списка возможностей');
    must(Array.isArray(me.body?.data?.faces), 'нет списка лиц услуг');
    must(!('role' in (me.body?.data ?? {})), `в профиле осталось поле role: ${me.text}`);

    return `профиль ${me.body.data.email}, accountKind=person, лиц ${me.body.data.faces.length}, поля role нет`;
  }, guest.page);

  await guest.context.close();
}

// ───────────── Сценарий 2. Подмена личности ─────────────

async function scenario2() {
  console.log('\n=== Сценарий 2. Подмена личности ===');
  const person = await freshContext();
  await loginAs(person.page, OWN.client);

  await step('step-9', 'подменённое значение cookie — увели, данных нет', async () => {
    const cookies = await person.context.cookies();
    const session = cookies.find((c) => c.name.includes('sh-session'));
    await person.context.clearCookies();
    await person.context.addCookies([{ ...session, value: `poddelka-${'x'.repeat(40)}` }]);

    const raw = await pageResponse(person.context, '/profile/me/dashboard');
    must(raw.status !== 200, `кабинет открылся: ${raw.status}`);
    mustEqual(raw.location, '/', 'куда увели');
    const found = leaks(raw.body, OWN.client);
    mustEqual(found.length, 0, `в поток ответа попали ${found.join(', ')}`);

    const me = await api(person.page, 'GET', '/api/auth/me');
    mustEqual(me.status, 401, '«кто я» с подделанной cookie');

    return `увели на «/» (${raw.status}), «кто я» отвечает 401 «${me.body?.error}»`;
  }, person.page);

  await step('step-10', 'cookie в виде числа 2 — доступа нет', async () => {
    const cookies = await person.context.cookies();
    const session = cookies.find((c) => c.name.includes('sh-session'));
    await person.context.clearCookies();
    await person.context.addCookies([{ ...session, value: '2' }]);

    const raw = await pageResponse(person.context, '/profile/me/dashboard');
    must(raw.status !== 200, `кабинет открылся по старой схеме cookie: ${raw.status}`);

    const me = await api(person.page, 'GET', '/api/auth/me');
    mustEqual(me.status, 401, 'код «кто я» со старой схемой cookie');

    return `старая схема (число) не работает: страница ${raw.status}, «кто я» 401`;
  }, person.page);

  await person.context.clearCookies();
  await loginAs(person.page, OWN.client);

  await step('step-11', 'запись с чужим userId в теле создаётся на текущего', async () => {
    const response = await api(person.page, 'POST', '/api/bookings', {
      scheduleId: state.slotForeignA.id,
      userId: 999,
      name: 'Клиент прогона',
      phone: '+7 (900) 556-00-30',
    });

    must(response.status === 201 || response.status === 200, `код: ${response.status} ${response.text}`);
    mustEqual(response.body?.data?.userId, Number(userIds[OWN.client]), 'владелец записи в ответе');
    state.clientForeignBooking = response.body.data.id;

    const owner = one(`SELECT user_id FROM bookings WHERE id = ${state.clientForeignBooking};`);
    mustEqual(owner, String(userIds[OWN.client]), 'владелец записи в базе');

    return `запись ${state.clientForeignBooking} на userId=${owner}, подставленный 999 отброшен`;
  }, person.page);

  await step('step-12', 'DELETE чужой записи — 403 с текстом про отмену, запись на месте', async () => {
    const response = await api(person.page, 'DELETE', `/api/bookings/${state.ownerBooking}`);

    mustEqual(response.status, 403, 'код');
    mustEqual(response.body?.error, 'Недостаточно прав для отмены записи', 'текст отказа');
    mustEqual(one(`SELECT count(*) FROM bookings WHERE id = ${state.ownerBooking};`), '1', 'чужая запись исчезла');

    return `403 «${response.body.error}», запись ${state.ownerBooking} на месте`;
  }, person.page);

  await person.context.close();
}

// ───────────── Сценарий 3. Закрытые маршруты (гость) ─────────────

async function scenario3() {
  console.log('\n=== Сценарий 3. Закрытые маршруты (гость) ===');
  const anon = await freshContext();

  const closed = [
    ['step-13', 'GET', '/api/users'],
    ['step-14', 'GET', '/api/logs'],
    ['step-15', 'GET', '/api/analytics'],
    ['step-16', 'GET', '/api/publications'],
    ['step-17', 'GET', '/api/users/1/notification-preferences'],
    ['step-18', 'GET', '/api/bookings?scope=all'],
    ['step-19', 'GET', '/api/notifications?scope=all'],
    ['step-20', 'GET', '/api/provider-client-notes?scope=all'],
    ['step-21', 'DELETE', '/api/clubs/1'],
    ['step-22', 'DELETE', '/api/trainers/1'],
  ];

  for (const [id, method, url] of closed) {
    await step(id, `${method} ${url} гостю — 401 и форма отказа`, async () => {
      const response = await api(anon.page, method, url);

      mustEqual(response.status, 401, 'код');
      mustEqual(response.body?.success, false, 'поле success');
      mustEqual(response.body?.error, 'Требуется вход', 'текст отказа');
      must(response.body?.data === undefined, `в ответе просочились данные: ${response.text}`);

      return `401 «${response.body.error}»`;
    }, anon.page);
  }

  await step('step-23', 'POST /api/logs — 404: маршрут записи в журнал убран совсем', async () => {
    const before = one('SELECT count(*) FROM logs;');
    const response = await api(anon.page, 'POST', '/api/logs', {
      actorId: 1, actorRole: 'admin', action: 'login', entityType: 'user', entityId: 1,
    });

    mustEqual(response.status, 404, 'код — ожидался 404, а не 401');
    mustEqual(response.body?.success, false, 'поле success');
    must(/Cannot POST \/api\/logs/.test(String(response.body?.error)), `текст отказа: ${response.text}`);
    mustEqual(one('SELECT count(*) FROM logs;'), before, 'в журнале появилась строка от гостя');

    return `404 «${response.body.error}», строк в журнале не прибавилось`;
  }, anon.page);

  await anon.context.close();
}

// ───────────── Сценарий 4. Публичное осталось публичным ─────────────

async function scenario4() {
  console.log('\n=== Сценарий 4. Публичное (гость) ===');
  const anon = await freshContext();

  const cspViolations = [];
  anon.page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
      cspViolations.push(message.text());
    }
  });

  await step('step-24', 'главная: каталог виден, карта грузится', async () => {
    const response = await anon.page.goto(BASE, { waitUntil: 'load' });
    mustEqual(response.status(), 200, 'код страницы');

    const clubs = await api(anon.page, 'GET', '/api/clubs');
    must((clubs.body?.data ?? []).length > 0, 'каталог клубов пуст');

    // ⚠️ Тег карты в разметке ничего не доказывает: пустой контейнер выглядит так же,
    // как рабочий. Смотрим, ПОДНЯЛСЯ ли загрузчик и не отбил ли браузер его хозяйство.
    await anon.page.waitForFunction(() => typeof window.ymaps3 === 'object' && window.ymaps3 !== null, {
      timeout: 20000,
    }).catch(() => {});
    const ready = await anon.page.evaluate(() => typeof window.ymaps3);
    // ⚠️ Телеметрия карт (`log.api-maps.yandex.ru`) в правилах источников не разрешена
    // намеренно и на отрисовку не влияет — карта поднимается и работает. Считать её
    // отказом значило бы краснеть через раз: логи уходят не при каждой загрузке.
    const blocked = cspViolations.filter(
      (text) => /yandex|yastatic/i.test(text) && !/log\.api-maps\.yandex\.ru/.test(text),
    );
    state.mapTelemetryBlocked = cspViolations.some((text) => /log\.api-maps\.yandex\.ru/.test(text));

    mustEqual(blocked.length, 0, `правила источников отбили хозяйство карт: ${blocked[0]?.slice(0, 160)}`);
    mustEqual(ready, 'object', 'загрузчик карт не поднялся');

    return `страница 200, клубов ${clubs.body.data.length}, загрузчик карт поднялся`;
  }, anon.page);

  await step('step-25', 'карточка клуба: отзывы видны, автор подписан', async () => {
    const row = one(`SELECT c.slug || '|' || c.id FROM reviews r JOIN clubs c ON c.id = r.club_id
                     WHERE c.status = 'published' ORDER BY r.id DESC LIMIT 1;`);
    must(row, 'в базе нет опубликованного клуба с отзывом');
    const [slug, id] = row.split('|');

    const page = await anon.page.goto(`${BASE}/clubs/${slug}`, { waitUntil: 'domcontentloaded' });
    mustEqual(page.status(), 200, 'код страницы');

    const reviews = await api(anon.page, 'GET', `/api/reviews?targetType=club&targetId=${id}`);
    const rows = reviews.body?.data ?? [];
    must(rows.length > 0, 'отзывов не пришло');
    const unnamed = rows.filter((r) => !r.authorName);
    mustEqual(unnamed.length, 0, `отзывов без подписи автора: ${unnamed.length}`);

    const body = await anon.page.locator('body').innerText();
    must(body.includes(rows[0].authorName), `подписи «${rows[0].authorName}» нет на экране`);

    return `${rows.length} отзыв(ов), автор подписан («${rows[0].authorName}») и виден на странице`;
  }, anon.page);

  await step('step-26', 'карточка тренера: открыта гостю, отзывы подписаны', async () => {
    const trainers = await api(anon.page, 'GET', '/api/trainers');
    const trainer = (trainers.body?.data ?? [])[0];
    must(trainer, 'каталог тренеров пуст');

    const page = await anon.page.goto(`${BASE}/trainers/${trainer.slug}`, { waitUntil: 'domcontentloaded' });
    mustEqual(page.status(), 200, 'код страницы');

    const body = await anon.page.locator('body').innerText();
    must(body.includes(trainer.name.split(' ')[0]), 'имени тренера нет на странице');

    const reviews = await api(anon.page, 'GET', `/api/reviews?targetType=trainer&targetId=${trainer.id}`);
    const unnamed = (reviews.body?.data ?? []).filter((r) => !r.authorName);
    mustEqual(unnamed.length, 0, 'есть отзывы без подписи автора');

    return `карточка «${trainer.name}» открыта, отзывов ${(reviews.body?.data ?? []).length}, все подписаны`;
  }, anon.page);

  await step('step-27', 'публичные справочники отдают данные', async () => {
    const routes = ['/api/clubs', '/api/trainers', '/api/schedule', '/api/reviews', '/api/sports', '/api/cities'];
    const report = [];

    for (const url of routes) {
      const response = await api(anon.page, 'GET', url);
      mustEqual(response.status, 200, `код ${url}`);
      const rows = response.body?.data ?? [];
      must(Array.isArray(rows) && rows.length > 0, `${url} вернул пусто`);
      report.push(`${url.replace('/api/', '')}=${rows.length}`);
    }

    return report.join(', ');
  }, anon.page);

  await step('step-28', 'страница записи открыта гостю и предлагает войти', async () => {
    const response = await anon.page.goto(`${BASE}/booking/${state.slotClientA.id}`, { waitUntil: 'domcontentloaded' });
    mustEqual(response.status(), 200, 'код страницы');

    await anon.page.waitForFunction(() => /войти|вход|регистр/i.test(document.body.innerText), { timeout: 15000 });
    const body = await anon.page.locator('body').innerText();
    must(/войти|вход|регистр/i.test(body), 'гостю не предложен вход');

    return 'страница 200, гостю предложен вход';
  }, anon.page);

  await anon.context.close();
}

// ───────────── Сценарий 5. Кабинеты закрыты на сервере (гость) ─────────────

async function scenario5() {
  console.log('\n=== Сценарий 5. Кабинеты закрыты (гость) ===');
  const anon = await freshContext();


  await step('step-29', '/profile/me/dashboard без cookie — увели на главную', async () => {
    const raw = await pageResponse(anon.context, '/profile/me/dashboard');

    must(raw.status !== 200, `кабинет отдан гостю: ${raw.status}`);
    mustEqual(raw.location, '/', 'куда увели');

    return `увели на «/» (${raw.status})`;
  }, anon.page);

  await step('step-30', 'в потоке ответа нет данных кабинета', async () => {
    const raw = await pageResponse(anon.context, '/profile/me/dashboard');
    const found = leaks(raw.body);

    mustEqual(found.length, 0, `в поток ответа попали ${found.join(', ')}`);

    return `в потоке ${raw.body.length} байт, данных кабинета нет`;
  }, anon.page);

  await step('step-31', 'кабинет лица и прежний /profile/provider — увели до выбора лица', async () => {
    const face = await pageResponse(anon.context, `/profile/club/${state.ownClubId}/dashboard`);
    const legacy = await pageResponse(anon.context, '/profile/provider/dashboard');

    must(face.status !== 200, `кабинет лица отдан гостю: ${face.status}`);
    must(legacy.status !== 200, `прежний адрес отдан гостю: ${legacy.status}`);
    mustEqual(face.location, '/', 'куда увели с кабинета лица');
    mustEqual(legacy.location, '/', 'куда увели с прежнего адреса');
    mustEqual(leaks(face.body).length + leaks(legacy.body).length, 0, 'в потоке ответа есть данные');

    return `оба увели на «/» (${face.status}/${legacy.status}), потоки пусты`;
  }, anon.page);

  await step('step-32', 'служебная панель гостю — увели, списка пользователей в потоке нет', async () => {
    const raw = await pageResponse(anon.context, '/service-portal/dashboard');

    must(raw.status !== 200, `панель отдана гостю: ${raw.status}`);
    mustEqual(raw.location, '/', 'куда увели');
    mustEqual(leaks(raw.body).length, 0, `в потоке ответа: ${leaks(raw.body).join(', ')}`);
    must(!/accountKind|"users"/.test(raw.body), 'в поток попал список пользователей платформы');

    return `увели на «/» (${raw.status}), списка пользователей в потоке нет`;
  }, anon.page);

  await anon.context.close();
}

// ───────────── Сценарий 6. Чужой кабинет и чужая вещь ─────────────

async function scenario6() {
  console.log('\n=== Сценарий 6. Чужой кабинет и чужая вещь ===');

  const plain = await freshContext();
  await loginAs(plain.page, LIVE.noFaces);

  await step('step-33', 'человек без лиц на кабинете лица — увели, потому что лица у него нет', async () => {
    const me = await whoAmI(plain.page);
    mustEqual((me.faces ?? []).length, 0, 'лиц у человека без лиц');

    const raw = await pageResponse(plain.context, `/profile/club/${state.ownClubId}/dashboard`);
    must(raw.status !== 200, `кабинет чужого лица открылся: ${raw.status}`);
    mustEqual(raw.location, '/', 'куда увели');

    // Контрольная группа: личный кабинет тому же человеку ОТКРЫТ — значит увела
    // именно проверка владения лицом, а не отсутствие сессии.
    const own = await pageResponse(plain.context, '/profile/me/dashboard');
    mustEqual(own.status, 200, 'личный кабинет тому же человеку');

    return `увели на «/» (${raw.status}); личный кабинет при этом открыт (200)`;
  }, plain.page);

  const builder = await freshContext();
  await loginAs(builder.page, OWN.builder);

  await step('step-33a', 'владелец ДРУГОГО лица на чужом лице — увели', async () => {
    const raw = await pageResponse(builder.context, `/profile/club/${state.foreignClubId}/dashboard`);
    must(raw.status !== 200, `чужое лицо открылось владельцу другого: ${raw.status}`);
    mustEqual(raw.location, '/', 'куда увели');

    const own = await pageResponse(builder.context, `/profile/club/${state.ownClubId}/dashboard`);
    mustEqual(own.status, 200, 'свой кабинет тому же человеку');

    return `чужое лицо ${state.foreignClubId} закрыто (${raw.status}), своё ${state.ownClubId} открыто (200)`;
  }, builder.page);

  await step('step-34', 'владелец лица открывает /profile/me/schedule — открылось, записи СВОИ', async () => {
    const raw = await pageResponse(builder.context, '/profile/me/schedule');
    mustEqual(raw.status, 200, 'личное расписание владельцу лица');

    await builder.page.goto(`${BASE}/profile/me/schedule`, { waitUntil: 'domcontentloaded' });
    // ⚠️ Список записей — клиентский компонент: до монтирования его в разметке нет
    // вовсе, и проверка сразу после загрузки сказала бы «записей нет» там, где они есть.
    await builder.page.waitForSelector('[data-testid="athlete-schedule-week-header"]', { timeout: 20000 });
    const body = await builder.page.locator('body').innerText();

    // Он записан клиентом в ЧУЖОЙ клуб и на своё же занятие — обе записи обязаны быть здесь.
    must(body.includes('Чужое занятие Б'), `своей клиентской записи на странице нет: ${body.replace(/\s+/g, ' ').slice(0, 240)}`);
    must(body.includes('Занятие владельца'), 'записи в собственный зал на странице нет');
    // А записи его КЛИЕНТОВ на его же занятия — не обязаны: это личный кабинет,
    // а не кабинет лица. Названия занятий говорят, чья это запись.
    const foreignRows = ['Занятие клиента А', 'Занятие клиента Б'].filter((title) => body.includes(title));
    mustEqual(foreignRows.length, 0, `в личное расписание попали записи его клиентов: ${foreignRows.join(', ')}`);

    return 'страница открыта, видна своя клиентская запись, чужих клиентов нет';
  }, builder.page);

  const admin = await freshContext();
  await loginAs(admin.page, LIVE.admin, { portal: 'service' });

  await step('step-34a', 'админ на личном кабинете — увели: базового набора человека у него нет', async () => {
    const raw = await pageResponse(admin.context, '/profile/me/dashboard');

    must(raw.status !== 200, `служебная запись получила личный кабинет: ${raw.status}`);
    mustEqual(raw.location, '/', 'куда увели');

    return `увели на «/» (${raw.status})`;
  }, admin.page);

  await step('step-35', 'срез по чужому providerUserId — 200 со СВОИМИ заметками', async () => {
    must(state.noteCreated, 'подготовка не удалась: заметка о клиенте не завелась');

    const response = await api(builder.page, 'GET',
      `/api/provider-client-notes?providerUserId=${userIds[OWN.stranger]}`);

    mustEqual(response.status, 200, 'код');
    const rows = response.body?.data ?? [];
    must(rows.length > 0, 'ответ пуст — проверять «чужих нет» не на чем');
    const foreign = rows.filter((row) => row.providerUserId !== Number(userIds[OWN.builder]));
    mustEqual(foreign.length, 0, `в ответе чужие заметки: ${JSON.stringify(foreign[0] ?? {})}`);

    return `200, заметок ${rows.length}, все свои — подставленный providerUserId проигнорирован`;
  }, builder.page);

  await step('step-35a', 'чужое лицо в параметрах — 403, половина пары — 400', async () => {
    const foreign = await api(builder.page, 'GET',
      `/api/provider-client-notes?faceType=club&faceId=${state.foreignClubId}`);
    mustEqual(foreign.status, 403, 'код при чужом лице');
    mustEqual(foreign.body?.error, 'Недостаточно прав', 'текст при чужом лице');

    const half = await api(builder.page, 'GET', '/api/provider-client-notes?faceType=club');
    mustEqual(half.status, 400, 'код при половине пары');
    mustEqual(half.body?.error, 'Некорректные параметры запроса', 'текст при половине пары');

    return `403 «${foreign.body.error}» на чужое лицо, 400 «${half.body.error}» на половину пары`;
  }, builder.page);

  await step('step-36', 'PATCH чужого клуба — 403 с номером клуба, клуб не изменился', async () => {
    const before = one(`SELECT name FROM clubs WHERE id = ${state.foreignClubId};`);
    const response = await api(builder.page, 'PATCH', `/api/clubs/${state.foreignClubId}`,
      clubForm(`${RUN_TAG} Перехваченный клуб`, [slot('Перехват', 11, '10:00', '11:00')]));

    mustEqual(response.status, 403, `код (тело ${response.text})`);
    mustEqual(response.body?.error, `Недостаточно прав для редактирования клуба с id ${state.foreignClubId}`, 'текст отказа');
    mustEqual(one(`SELECT name FROM clubs WHERE id = ${state.foreignClubId};`), before, 'название клуба изменилось');

    return `403 «${response.body.error}», название клуба цело`;
  }, builder.page);

  await step('step-37', 'DELETE чужого клуба — 403, клуб на месте и не спрятан', async () => {
    const before = one(`SELECT status FROM clubs WHERE id = ${state.foreignClubId};`);
    const response = await api(builder.page, 'DELETE', `/api/clubs/${state.foreignClubId}`);

    mustEqual(response.status, 403, 'код');
    must(String(response.body?.error).startsWith('Недостаточно прав'), `текст отказа: ${response.text}`);
    mustEqual(one(`SELECT count(*) FROM clubs WHERE id = ${state.foreignClubId};`), '1', 'чужой клуб удалён');
    mustEqual(one(`SELECT status FROM clubs WHERE id = ${state.foreignClubId};`), before, 'статус чужого клуба изменился');

    return `403 «${response.body.error}», клуб ${state.foreignClubId} на месте в статусе ${before}`;
  }, builder.page);

  await step('step-37a', 'владелец клуба правит СВОЮ карточку тренера — 200 (закрытый дефект)', async () => {
    // ⚠️ Прежде тот же человек получал 403 на собственной карточке: право было
    // у роли `trainer`, а карточкой владел «представитель услуг».
    const me = await whoAmI(builder.page);
    must((me.faces ?? []).some((f) => f.kind === 'club'), 'у человека нет клуба — случай не тот');
    must((me.faces ?? []).some((f) => f.kind === 'trainer'), 'у человека нет карточки — случай не тот');

    const response = await api(builder.page, 'PATCH', `/api/trainers/${state.ownTrainerId}`,
      trainerForm('Переименованный', [slot('Персоналка прогона', 6, '12:00', '13:00', '3')]));

    mustEqual(response.status, 200, `правка своей карточки: ${response.text}`);
    must(one(`SELECT name FROM trainers WHERE id = ${state.ownTrainerId};`).includes('Переименованный'),
      'имя карточки в базе не изменилось');

    return 'владелец клуба правит свою карточку тренера — 200, имя в базе сменилось';
  }, builder.page);

  await plain.context.close();
  await builder.context.close();
  await admin.context.close();
}

// ───────────── Сценарий 7. Владение и правила ─────────────

async function scenario7() {
  console.log('\n=== Сценарий 7. Владение и правила ===');
  const builder = await freshContext();
  await loginAs(builder.page, OWN.builder);

  await step('step-38', 'своё лицо убирается в АРХИВ, в журнале настоящий исполнитель', async () => {
    const response = await api(builder.page, 'DELETE', `/api/clubs/${state.disposableClubId}`);

    must(response.status === 200 || response.status === 204, `код: ${response.status} ${response.text}`);
    // ⚠️ Смотрим в базу: «архивирование, а не удаление» — утверждение про строку,
    // а не про ответ. Ответ про исход не говорит вовсе (см. расхождение в отчёте).
    const row = one(`SELECT status || '|' || coalesce(hide_reason, '—') || '|' || coalesce(hidden_by_user_id::text, '—')
                     FROM clubs WHERE id = ${state.disposableClubId};`);
    must(row, 'строка клуба исчезла — это удаление, а не архив');
    const [status, reason, hiddenBy] = row.split('|');
    mustEqual(status, 'hidden', 'статус лица после уборки владельцем');
    mustEqual(reason, 'Убрано владельцем из каталога', 'причина');
    mustEqual(hiddenBy, String(userIds[OWN.builder]), 'кто убрал');

    const log = one(`SELECT action || '|' || actor_id || '|' || coalesce(actor_role, '—') FROM logs
                     WHERE entity_type = 'club' AND entity_id = ${state.disposableClubId}
                     ORDER BY id DESC LIMIT 1;`);
    const [action, actorId, actorRole] = log.split('|');
    mustEqual(action, 'publish_archive', 'действие в журнале');
    mustEqual(actorId, String(userIds[OWN.builder]), 'исполнитель в журнале');

    state.archivedInResponse = JSON.stringify(response.body ?? {});

    return `архив: status=${status}, причина «${reason}», в журнале ${action} исполнителем ${actorId} (${actorRole})`;
  }, builder.page);

  await step('step-38a', 'уборка лица с живыми записями — 409, лицо на месте', async () => {
    const alive = one(`SELECT count(*) FROM bookings WHERE owner_club_id = ${state.ownClubId}
                       AND status IN ('pending','confirmed');`);
    must(Number(alive) > 0, 'подготовка не удалась: живых записей у клуба нет');

    const response = await api(builder.page, 'DELETE', `/api/clubs/${state.ownClubId}`);

    mustEqual(response.status, 409, `код: ${response.status} ${response.text}`);
    mustEqual(response.body?.error,
      `Нельзя убрать клуб: на ближайшие занятия записаны люди (${alive}). Сначала отмените эти записи — участники получат уведомления — и повторите.`,
      'текст отказа');
    mustEqual(one(`SELECT status FROM clubs WHERE id = ${state.ownClubId};`), 'published', 'статус клуба изменился');

    return `409 «${response.body.error.slice(0, 60)}…», клуб в статусе published`;
  }, builder.page);

  const client = await freshContext();
  await loginAs(client.page, OWN.client);

  await step('step-39', 'отзыв без посещения — 403 «только после посещения занятия»', async () => {
    const before = one(`SELECT rating || '|' || review_count FROM clubs WHERE id = ${state.foreignClubId};`);
    const response = await api(client.page, 'POST', '/api/reviews', {
      clubId: state.foreignClubId, rating: 5, text: 'Проверочный отзыв без посещения занятия клуба.',
    });

    mustEqual(response.status, 403, 'код');
    mustEqual(response.body?.error, 'Оставить отзыв можно только после посещения занятия', 'текст отказа');
    mustEqual(one(`SELECT rating || '|' || review_count FROM clubs WHERE id = ${state.foreignClubId};`), before,
      'рейтинг или число отзывов изменились');

    return `403 «${response.body.error}», рейтинг и счётчик целы (${before})`;
  }, client.page);

  await step('step-39a', 'на карточке форма рисуется, под ней объяснение про посещение', async () => {
    const slug = one(`SELECT slug FROM clubs WHERE id = ${state.foreignClubId};`);
    await client.page.goto(`${BASE}/clubs/${slug}`, { waitUntil: 'domcontentloaded' });
    await client.page.waitForSelector('#club-review-text', { timeout: 20000 });
    // ⚠️ Подпись зависит от того, вошёл ли человек, а личность приезжает в браузер
    // ответом «кто я» уже после гидрации: без ожидания шаг краснел бы по чужой причине.
    await client.page.waitForFunction(
      () => /Оставить его можно после посещения занятия/i.test(document.body.innerText),
      { timeout: 20000 },
    );

    const body = await client.page.locator('body').innerText();
    must(/Оставить его можно после посещения занятия/i.test(body),
      `объяснения нет на экране: ${body.replace(/\s+/g, ' ').slice(0, 240)}`);

    const form = await client.page.locator('#club-review-text').count();
    mustEqual(form, 1, 'формы отзыва на карточке нет');

    return 'форма отзыва рисуется, под ней подпись «Оставить его можно после посещения занятия»';
  }, client.page);

  await step('step-40', 'отзыв при завершённой записи — успех, рейтинг пересчитан', async () => {
    const before = one(`SELECT rating || '|' || review_count FROM clubs WHERE id = ${state.ownClubId};`);
    const response = await api(client.page, 'POST', '/api/reviews', {
      clubId: state.ownClubId, rating: 5, text: 'Занятие прошло отлично — проверка правила отзыва после посещения.',
    });

    must(response.status === 201 || response.status === 200, `код: ${response.status} ${response.text}`);

    const after = one(`SELECT rating || '|' || review_count FROM clubs WHERE id = ${state.ownClubId};`);
    const [beforeRating, beforeCount] = before.split('|');
    const [afterRating, afterCount] = after.split('|');
    must(Number(afterCount) > Number(beforeCount), `число отзывов не выросло: ${before} → ${after}`);
    mustEqual(afterRating, '5', 'рейтинг после единственной пятёрки');
    void beforeRating;

    state.reviewId = response.body?.data?.id;

    return `отзыв принят, отзывов ${beforeCount} → ${afterCount}, рейтинг ${afterRating}`;
  }, client.page);

  await step('step-41', 'повторный отзыв тому же адресату — 409, одна оценка на посещение', async () => {
    const before = one(`SELECT rating || '|' || review_count FROM clubs WHERE id = ${state.ownClubId};`);
    const response = await api(client.page, 'POST', '/api/reviews', {
      clubId: state.ownClubId, rating: 1, text: 'Повторная попытка оставить отзыв тому же клубу.',
    });

    mustEqual(response.status, 409, `повтор прошёл: ${response.status} ${response.text}`);
    mustEqual(response.body?.error, 'На это посещение отзыв уже оставлен', 'текст отказа');
    mustEqual(one(`SELECT rating || '|' || review_count FROM clubs WHERE id = ${state.ownClubId};`), before,
      'рейтинг или счётчик изменились после отбитого повтора');

    return `409 «${response.body.error}», рейтинг и счётчик целы (${before})`;
  }, client.page);

  await step('step-41a', 'отзыв СВОЕЙ публикации — 403, рейтинг и счётчик целы', async () => {
    const clubBefore = one(`SELECT rating || '|' || review_count FROM clubs WHERE id = ${state.ownClubId};`);
    const trainerBefore = one(`SELECT rating || '|' || review_count FROM trainers WHERE id = ${state.ownTrainerId};`);

    const club = await api(builder.page, 'POST', '/api/reviews', {
      clubId: state.ownClubId, rating: 5, text: 'Отзыв собственному клубу — так быть не должно.',
    });
    const trainer = await api(builder.page, 'POST', '/api/reviews', {
      trainerId: state.ownTrainerId, rating: 5, text: 'Отзыв собственной карточке — так быть не должно.',
    });

    mustEqual(club.status, 403, 'код на отзыв своему клубу');
    mustEqual(club.body?.error, 'Нельзя оставить отзыв собственной публикации', 'текст на отзыв своему клубу');
    mustEqual(trainer.status, 403, 'код на отзыв своей карточке');
    mustEqual(trainer.body?.error, 'Нельзя оставить отзыв собственной публикации', 'текст на отзыв своей карточке');
    mustEqual(one(`SELECT rating || '|' || review_count FROM clubs WHERE id = ${state.ownClubId};`), clubBefore, 'рейтинг клуба');
    mustEqual(one(`SELECT rating || '|' || review_count FROM trainers WHERE id = ${state.ownTrainerId};`), trainerBefore, 'рейтинг карточки');

    return `оба 403 «${club.body.error}», рейтинги целы (${clubBefore} и ${trainerBefore})`;
  }, builder.page);

  const admin = await freshContext();
  await loginAs(admin.page, LIVE.admin, { portal: 'service' });

  await step('step-41b', 'отзыв от служебной записи — 403 «Отзывы оставляют пользователи площадки»', async () => {
    const before = one(`SELECT rating || '|' || review_count FROM clubs WHERE id = ${state.ownClubId};`);
    const response = await api(admin.page, 'POST', '/api/reviews', {
      clubId: state.ownClubId, rating: 5, text: 'Отзыв от администратора — так быть не должно.',
    });

    mustEqual(response.status, 403, 'код');
    mustEqual(response.body?.error, 'Отзывы оставляют пользователи площадки', 'текст отказа');
    mustEqual(one(`SELECT rating || '|' || review_count FROM clubs WHERE id = ${state.ownClubId};`), before, 'рейтинг клуба');

    return `403 «${response.body.error}», рейтинг цел`;
  }, admin.page);

  await builder.context.close();
  await client.context.close();
  await admin.context.close();
}

// ───────────── Сценарий 8. Вход в админку ─────────────

async function scenario8() {
  console.log('\n=== Сценарий 8. Вход в админку ===');
  const portal = await freshContext();

  await step('step-42', 'почта админа + неверный пароль — не пустило, сессии нет', async () => {
    await portal.page.goto(`${BASE}/service-portal`, { waitUntil: 'domcontentloaded' });
    const response = await api(portal.page, 'POST', '/api/auth/login', {
      email: LIVE.admin, password: 'nevernyy-parol-34', portal: 'service',
    });

    mustEqual(response.status, 401, 'код');
    mustEqual(response.body?.error, 'Неверная почта или пароль', 'текст отказа');

    const me = await api(portal.page, 'GET', '/api/auth/me');
    mustEqual(me.status, 401, 'сессия выдана вопреки отказу');

    const panel = await pageResponse(portal.context, '/service-portal/dashboard');
    must(panel.status !== 200, `панель открылась без входа: ${panel.status}`);

    return `401 «${response.body.error}», сессии нет, панель закрыта`;
  }, portal.page);

  await step('step-43', 'произвольная почта + любой пароль — отказ тем же текстом', async () => {
    const response = await api(portal.page, 'POST', '/api/auth/login', {
      email: `${RUN_TAG}-kto-ugodno-${STAMP}@test.local`, password: 'lyuboy-parol', portal: 'service',
    });

    mustEqual(response.status, 401, 'код');
    mustEqual(response.body?.error, 'Неверная почта или пароль', 'текст отказа');

    return `401 «${response.body.error}»`;
  }, portal.page);

  await step('step-44', 'почты админа нет в сборке фронта', async () => {
    // Приложение работает из образа, поэтому смотрим В КОНТЕЙНЕРЕ: локальная сборка
    // может быть старой, а проверять надо то, что отдаётся людям.
    const found = execFileSync('docker', ['exec', 'sporthub_web', 'sh', '-lc',
      `grep -rl '${LIVE.admin}' /app/apps/web/.next 2>/dev/null | head -5 || true`], { encoding: 'utf8' }).trim();
    const scanned = execFileSync('docker', ['exec', 'sporthub_web', 'sh', '-lc',
      'find /app/apps/web/.next -type f | wc -l'], { encoding: 'utf8' }).trim();

    must(Number(scanned) > 0, 'сборки фронта в контейнере не нашлось — проверять нечего');
    mustEqual(found, '', `почта админа в файлах сборки: ${found}`);

    return `просмотрено ${scanned} файлов сборки в контейнере, почты админа нет`;
  }, portal.page);

  await step('step-45', 'верная пара через служебный вход — панель открылась, разделы на месте', async () => {
    const response = await api(portal.page, 'POST', '/api/auth/login', {
      email: LIVE.admin, password: PASSWORD, portal: 'service',
    });
    mustEqual(response.status, 200, `код входа: ${response.text}`);

    const me = await api(portal.page, 'GET', '/api/auth/me');
    mustEqual(me.body?.data?.accountKind, 'admin', 'вид учётной записи');
    must((me.body?.data?.capabilities ?? []).length === 6, `возможностей у админа: ${me.body?.data?.capabilities?.length}`);

    await portal.page.goto(`${BASE}/service-portal/dashboard`, { waitUntil: 'domcontentloaded' });
    await portal.page.waitForSelector('nav[aria-label*="admin"]', { timeout: 20000 });
    const items = await portal.page.$$eval('nav[aria-label*="admin"] a', (nodes) => nodes.map((n) => n.textContent.trim()));

    for (const name of ['Пользователи', 'Аналитика', 'Модерация', 'Логи', 'Финансы']) {
      must(items.includes(name), `в панели нет раздела «${name}»: ${items.join(', ')}`);
    }

    // Раздел работает, а не просто нарисован: журнал отдаёт строки.
    const logs = await api(portal.page, 'GET', '/api/logs?limit=5');
    mustEqual(logs.status, 200, 'журнал администратору');

    return `accountKind=admin, возможностей 6, разделов ${items.length}, журнал отдаёт данные`;
  }, portal.page);

  await step('step-46', 'снятый маршрут карантина — 404; служебный маршрут не-админу — 403', async () => {
    const gone = await api(portal.page, 'POST', '/api/admin/users/1/lift-quarantine', {});
    mustEqual(gone.status, 404, `маршрут ручного послабления жив: ${gone.status} ${gone.text}`);
    must(/Cannot POST/.test(String(gone.body?.error)), `текст 404: ${gone.text}`);

    const person = await freshContext();
    await loginAs(person.page, OWN.client);
    const denied = await api(person.page, 'POST', `/api/admin/users/${userIds[OWN.client]}/recompute-reliability`, {});
    mustEqual(denied.status, 403, 'код служебного маршрута не-админу');
    mustEqual(denied.body?.error, 'Недостаточно прав', 'текст отказа');
    await person.context.close();

    return `404 на снятый карантин, 403 «${denied.body.error}» на служебный маршрут не-админу`;
  }, portal.page);

  await portal.context.close();
}

// ───────────── Сценарий 9. Работа от чужого лица ─────────────

async function scenario9() {
  console.log('\n=== Сценарий 9. Работа от чужого лица ===');
  const admin = await freshContext();
  await loginAs(admin.page, LIVE.admin, { portal: 'service' });
  state.adminId = Number((await whoAmI(admin.page)).id);

  await step('step-47', '«Войти как» владелец лица — открылся его кабинет, плашка видна', async () => {
    const response = await api(admin.page, 'POST', `/api/auth/impersonate/${userIds[OWN.builder]}`, {});
    mustEqual(response.status, 200, `код: ${response.text}`);

    const me = await whoAmI(admin.page);
    mustEqual(me.id, Number(userIds[OWN.builder]), 'кем работаем');
    mustEqual(me.impersonating, true, 'признак работы от чужого лица');
    must(me.actorName, 'нет имени настоящего администратора в профиле');

    await admin.page.goto(`${BASE}/profile/club/${state.ownClubId}/dashboard`, { waitUntil: 'domcontentloaded' });
    await admin.page.waitForSelector('nav[aria-label*="азделы"]', { timeout: 20000 });
    // ⚠️ Плашку рисует клиентский слой по ответу «кто я» — ждём её появления,
    // а не читаем экран сразу: иначе «плашки нет» означало бы только «ещё не успела».
    await admin.page.waitForFunction(
      () => /работаете от имени/i.test(document.body.innerText),
      { timeout: 20000 },
    );
    const body = await admin.page.locator('body').innerText();
    must(/работаете от имени/i.test(body), `плашки нет на странице: ${body.replace(/\s+/g, ' ').slice(0, 200)}`);
    must(/Вернуться в панель/i.test(body), 'в плашке нет возврата в панель');

    return `работаем как ${me.name}, кабинет лица открыт, плашка видна (настоящий админ «${me.actorName}»)`;
  }, admin.page);

  await step('step-48', 'действие владельца лица под подменой проходит', async () => {
    const response = await api(admin.page, 'POST', `/api/bookings/${state.clientBooking1}/confirm`, {});

    mustEqual(response.status, 200, `код: ${response.text}`);
    mustEqual(one(`SELECT status FROM bookings WHERE id = ${state.clientBooking1};`), 'confirmed', 'статус записи в базе');

    return `заявка ${state.clientBooking1} подтверждена, в базе confirmed`;
  }, admin.page);

  await step('step-49', 'в журнале исполнитель — админ, подпись «Администратор»', async () => {
    const row = one(`SELECT actor_id || '|' || coalesce(actor_role, '—') FROM logs
                     WHERE entity_type = 'booking' AND entity_id = ${state.clientBooking1}
                     ORDER BY id DESC LIMIT 1;`);
    must(row, 'записи в журнале нет вовсе');
    const [actorId, actorRole] = row.split('|');

    mustEqual(actorId, String(state.adminId), 'исполнитель в журнале — ожидался настоящий администратор');
    mustEqual(actorRole, 'admin', 'вид учётной записи исполнителя в журнале');
    state.logActorId = actorId;

    return `в журнале исполнитель #${actorId}, вид учётной записи ${actorRole} (подпись «Администратор» проверяется в шаге 51)`;
  }, admin.page);

  await step('step-49a', 'подмена себя и другого администратора — оба отказа со своим текстом', async () => {
    // ⚠️ Отдельная сессия администратора, а не та, что сейчас работает от чужого лица.
    // Под подменой права считаются по ЦЕЛИ, у неё права `impersonate` нет, и отказ
    // пришёл бы общий («Недостаточно прав») — то есть шаг стал бы красным по чужой
    // причине, ничего не сказав о самих правилах подмены.
    const second = await freshContext();
    await loginAs(second.page, LIVE.admin, { portal: 'service' });

    const self = await api(second.page, 'POST', `/api/auth/impersonate/${state.adminId}`, {});
    mustEqual(self.status, 403, 'код при подмене самого себя');
    mustEqual(self.body?.error, 'Нельзя работать от лица самого себя', 'текст при подмене самого себя');

    const other = await api(second.page, 'POST', `/api/auth/impersonate/${userIds[OWN.admin2]}`, {});
    mustEqual(other.status, 403, 'код при подмене другого администратора');
    mustEqual(other.body?.error, 'Нельзя работать от лица администратора', 'текст при подмене администратора');

    // Ни одна из попыток не подменила личность: сессия осталась админской.
    mustEqual((await whoAmI(second.page)).accountKind, 'admin', 'вид учётной записи после отказов');
    await second.context.close();

    return `403 «${self.body.error}» и 403 «${other.body.error}»`;
  }, admin.page);

  await step('step-50', 'смена пароля под подменой — отказ на сервере, а не спрятанная форма', async () => {
    const before = one(`SELECT password_hash FROM users WHERE id = ${userIds[OWN.builder]};`);
    const response = await api(admin.page, 'PATCH', `/api/users/${userIds[OWN.builder]}`, {
      currentPassword: PASSWORD, password: 'podmena-parolya-34',
    });

    mustEqual(response.status, 403, 'код');
    mustEqual(response.body?.error, 'Под имперсонизацией нельзя менять учётные данные', 'текст отказа');
    mustEqual(one(`SELECT password_hash FROM users WHERE id = ${userIds[OWN.builder]};`), before, 'хеш пароля изменился');

    return `403 «${response.body.error}», хеш пароля в базе не тронут`;
  }, admin.page);

  await step('step-51', '«Вернуться в панель» — снова админ, права админские, подпись в журнале', async () => {
    const response = await api(admin.page, 'POST', '/api/auth/impersonate/stop', {});
    mustEqual(response.status, 200, 'код');

    const me = await whoAmI(admin.page);
    mustEqual(me.accountKind, 'admin', 'вид учётной записи после возврата');
    must(!me.impersonating, 'признак подмены не снят');

    const logs = await api(admin.page, 'GET', '/api/logs?limit=1');
    mustEqual(logs.status, 200, 'админский маршрут после возврата');

    // Подпись исполнителя — на экране журнала, а не в наших догадках о словаре.
    await admin.page.goto(`${BASE}/service-portal/logs?actorId=${state.logActorId}`, { waitUntil: 'domcontentloaded' });
    await admin.page.waitForSelector('article', { timeout: 20000 });
    const body = await admin.page.locator('body').innerText();
    must(body.includes(`Администратор #${state.logActorId}`),
      `в журнале нет подписи «Администратор #${state.logActorId}»: ${body.replace(/\s+/g, ' ').slice(0, 240)}`);

    return `снова админ, журнал открыт, подпись «Администратор #${state.logActorId}» на экране`;
  }, admin.page);

  await admin.context.close();
}

// ───────────── Сценарий 10. Жизнь сессии ─────────────

async function scenario10() {
  console.log('\n=== Сценарий 10. Жизнь сессии ===');
  const first = await freshContext();
  const second = await freshContext();
  const id = userIds[OWN.sessions];

  await step('step-52', 'две сессии одного человека работают одновременно', async () => {
    await loginAs(first.page, OWN.sessions);
    await loginAs(second.page, OWN.sessions);

    mustEqual((await api(first.page, 'GET', '/api/auth/me')).status, 200, 'первый браузер');
    mustEqual((await api(second.page, 'GET', '/api/auth/me')).status, 200, 'второй браузер');

    const a = (await first.context.cookies()).find((c) => c.name.includes('sh-session'));
    const b = (await second.context.cookies()).find((c) => c.name.includes('sh-session'));
    must(a.value !== b.value, 'у двух браузеров одинаковое значение сессии');
    mustEqual(one(`SELECT count(*) FROM sessions WHERE user_id = ${id} AND revoked_at IS NULL;`), '2',
      'живых сессий в базе');

    state.beforeRotation = b.value;

    return 'обе сессии живы, значения разные, в базе две живые строки';
  }, first.page);

  await step('step-53', 'смена пароля в первом гасит второй', async () => {
    const response = await api(first.page, 'PATCH', `/api/users/${id}`, {
      currentPassword: PASSWORD, password: NEW_PASSWORD,
    });
    mustEqual(response.status, 200, `смена пароля не прошла: ${response.text}`);

    const other = await api(second.page, 'GET', '/api/auth/me');
    mustEqual(other.status, 401, 'второй браузер после смены пароля');
    mustEqual(other.body?.error, 'Требуется вход', 'текст отказа второму браузеру');

    const raw = await pageResponse(second.context, '/profile/me/dashboard');
    must(raw.status !== 200, `второй браузер остался в кабинете: ${raw.status}`);

    mustEqual((await api(first.page, 'GET', '/api/auth/me')).status, 200, 'первый браузер после смены пароля');

    return 'второй получил 401 и уведён из кабинета, первый жив';
  }, second.page);

  await step('step-54', 'вход новым паролем проходит, старый отвергнут', async () => {
    const old = await api(second.page, 'POST', '/api/auth/login', { email: OWN.sessions, password: PASSWORD });
    mustEqual(old.status, 401, 'вход старым паролем');

    const fresh = await api(second.page, 'POST', '/api/auth/login', { email: OWN.sessions, password: NEW_PASSWORD });
    mustEqual(fresh.status, 200, 'вход новым паролем');

    state.afterRotation = (await second.context.cookies()).find((c) => c.name.includes('sh-session')).value;

    return 'старый пароль 401, новый 200';
  }, second.page);

  await step('step-55', 'выход: cookie очищена, старое значение не даёт доступа', async () => {
    const old = (await second.context.cookies()).find((c) => c.name.includes('sh-session'));
    const response = await api(second.page, 'POST', '/api/auth/logout', {});
    must(response.status === 200 || response.status === 204, `код выхода: ${response.status}`);

    const after = (await second.context.cookies()).find((c) => c.name.includes('sh-session'));
    must(!after || !after.value, `cookie осталась: ${after?.value}`);

    await second.context.addCookies([{ ...old }]);
    const me = await api(second.page, 'GET', '/api/auth/me');
    mustEqual(me.status, 401, 'возврат старого значения cookie');
    mustEqual(one(`SELECT count(*) FROM sessions WHERE token_hash = encode(sha256('${old.value}'::bytea), 'hex') AND revoked_at IS NULL;`),
      '0', 'сессия в базе осталась живой после выхода');

    return 'cookie очищена, возврат старого значения даёт 401, строка в базе отозвана';
  }, second.page);

  await step('step-56', 'значение cookie до и после входа различается', async () => {
    must(state.beforeRotation && state.afterRotation, 'нет снимков значения cookie');
    must(state.beforeRotation !== state.afterRotation, 'значение cookie не изменилось при новом входе');

    return `${state.beforeRotation.slice(0, 8)}… → ${state.afterRotation.slice(0, 8)}…`;
  }, second.page);

  await first.context.close();
  await second.context.close();
}

// ───────────── Сценарий 11. Частота и внешние службы ─────────────

async function scenario11() {
  console.log('\n=== Сценарий 11. Частота и внешние службы ===');
  const guest = await freshContext();

  await step('step-57', 'пять неверных попыток — шестая отклонена и называет срок', async () => {
    let last = null;
    for (let i = 0; i < 6; i += 1) {
      last = await api(guest.page, 'POST', '/api/auth/login', { email: OWN.lockout, password: `nevernyy-${i}` });
    }

    mustEqual(last.status, 429, 'код шестой попытки');
    mustEqual(last.body?.error, 'Слишком много неудачных попыток входа. Повторите через 1 мин.', 'текст отказа');

    return `429 «${last.body.error}»`;
  }, guest.page);

  await step('step-58', 'после минуты ещё пять — ожидание выросло до двух минут', async () => {
    await guest.page.waitForTimeout(62_000);

    let last = null;
    for (let i = 0; i < 6; i += 1) {
      last = await api(guest.page, 'POST', '/api/auth/login', { email: OWN.lockout, password: `snova-nevernyy-${i}` });
    }

    mustEqual(last.status, 429, 'код');
    mustEqual(last.body?.error, 'Слишком много неудачных попыток входа. Повторите через 2 мин.', 'текст отказа');

    return `429 «${last.body.error}»`;
  }, guest.page);

  await step('step-58a', 'верный пароль после ожидания обнуляет лестницу', async () => {
    await guest.page.waitForTimeout(122_000);

    const ok = await api(guest.page, 'POST', '/api/auth/login', { email: OWN.lockout, password: PASSWORD });
    mustEqual(ok.status, 200, `вход верным паролем после ожидания: ${ok.text}`);

    let last = null;
    for (let i = 0; i < 6; i += 1) {
      last = await api(guest.page, 'POST', '/api/auth/login', { email: OWN.lockout, password: `posle-sbrosa-${i}` });
    }

    mustEqual(last.status, 429, 'код');
    mustEqual(last.body?.error, 'Слишком много неудачных попыток входа. Повторите через 1 мин.',
      'лестница не обнулилась — срок продолжил расти');

    return `после верного входа лестница снова с одной минуты: «${last.body.error}»`;
  }, guest.page);

  skip('step-58b', 'ожидание не превышает потолка в 30 минут',
    'браузерно недостижимо: потолок берётся на 150-й неудачной попытке, а до неё надо отсидеть сумму ступеней — около восьми часов ожидания. Прогон обязан проходить дважды подряд, поэтому шаг не выполняется. Потолок закреплён константой `SPORT_HUB_LOGIN_LOCKOUT_MAX_MS` (30 мин) в apps/api/src/auth/login-attempts.service.ts и юнит-тестами того же файла');

  // Лестница по ip сброшена: дальше идут сценарии, которым нужен рабочий вход.
  await resetIpLockout(guest.page);

  await step('step-59', 'геокодер без сессии проходит — это решение, а не дыра', async () => {
    const anon = await freshContext();
    const response = await api(anon.page, 'POST', '/api/geocode', { city: 'Самара', address: 'ул. Ленина, 1' });

    must(response.status !== 401, 'маршрут закрыт сессией — карта у гостя перестанет работать');
    must(response.status !== 403, `маршрут отбит проверкой источника: ${response.text}`);
    await anon.context.close();

    return `маршрут открыт гостю (код ${response.status}) — по координатам рисуется карта на публичных страницах`;
  }, guest.page);

  await step('step-60', 'подсказки адреса сверх порога — 429 с понятным текстом', async () => {
    let limited = null;
    for (let i = 0; i < 80 && !limited; i += 1) {
      const response = await api(guest.page, 'POST', '/api/suggest', { text: `Самара улица ${i}` });
      if (response.status === 429) limited = { at: i + 1, error: response.body?.error };
    }

    must(limited, 'восемьдесят запросов подряд не упёрлись в предел частоты');
    mustEqual(limited.error, 'Слишком много запросов. Повторите позже.', 'текст отказа');

    return `429 на ${limited.at}-м запросе: «${limited.error}»`;
  }, guest.page);

  await guest.context.close();
}

// ───────────── Сценарий 12. Заголовки и источник ─────────────

async function scenario12() {
  console.log('\n=== Сценарий 12. Заголовки и источник ===');
  const person = await freshContext();

  await step('step-61', 'заголовки безопасности на главной', async () => {
    const response = await person.context.request.get(BASE);
    const headers = response.headers();
    const required = {
      'content-security-policy': /default-src 'self'/,
      'strict-transport-security': /max-age=\d+/,
      'x-frame-options': /^DENY$/i,
      'x-content-type-options': /nosniff/i,
      'referrer-policy': /strict-origin-when-cross-origin/i,
    };

    const missing = [];
    for (const [name, pattern] of Object.entries(required)) {
      if (!headers[name] || !pattern.test(headers[name])) missing.push(`${name}=${headers[name] ?? 'нет'}`);
    }
    mustEqual(missing.length, 0, `отсутствующие или неверные заголовки: ${missing.join('; ')}`);
    must(/frame-ancestors 'none'/.test(headers['content-security-policy']), 'в CSP нет frame-ancestors');

    return 'CSP (с frame-ancestors), HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy — все на месте';
  }, person.page);

  await step('step-62', 'изменяющий запрос с чужим источником — отказ обоими путями', async () => {
    await loginAs(person.page, OWN.client);
    const before = one(`SELECT count(*) FROM bookings WHERE schedule_id = ${state.slotOwner.id};`);
    const body = { scheduleId: state.slotOwner.id, name: 'Чужой источник', phone: '+7 (900) 556-00-62' };

    // ⚠️ Из вкладки эти заголовки подделать нельзя — они запрещённые, браузер ставит
    // их сам. Поэтому запрос шлётся контекстом запросов, как его слал бы чужой сайт.
    const crossSite = await person.context.request.post(`${BASE}/api/bookings`, {
      data: body,
      headers: { 'content-type': 'application/json', Origin: 'https://evil.example.com', 'Sec-Fetch-Site': 'cross-site' },
      failOnStatusCode: false,
    });
    const originOnly = await person.context.request.post(`${BASE}/api/bookings`, {
      data: { ...body, phone: '+7 (900) 556-00-63' },
      headers: { 'content-type': 'application/json', Origin: 'https://evil.example.com' },
      failOnStatusCode: false,
    });

    mustEqual(crossSite.status(), 403, 'код межсайтового запроса');
    mustEqual(originOnly.status(), 403, 'код запроса с чужим Origin без Sec-Fetch-Site');
    mustEqual(JSON.parse(await crossSite.text()).error, 'Запрос с чужого источника', 'текст на межсайтовый запрос');
    mustEqual(JSON.parse(await originOnly.text()).error, 'Запрос с чужого источника', 'текст на чужой Origin');
    mustEqual(one(`SELECT count(*) FROM bookings WHERE schedule_id = ${state.slotOwner.id};`), before,
      'запись всё-таки создалась');

    return '403 «Запрос с чужого источника» обоими путями, записи не создано';
  }, person.page);

  await step('step-63', 'тот же запрос со своим источником — проходит', async () => {
    const response = await api(person.page, 'POST', '/api/bookings', {
      scheduleId: state.slotForeignA.id, name: 'Клиент прогона', phone: '+7 (900) 556-00-64',
    });

    // Слот тот же, что в шаге 11: повтор законно отбивается «уже записан» — тогда
    // берём другой, иначе шаг стал бы красным не по делу.
    if (response.status === 409) {
      const retry = await api(person.page, 'POST', '/api/bookings', {
        scheduleId: state.slotForeignB.id, name: 'Клиент прогона', phone: '+7 (900) 556-00-65',
      });
      must(retry.status === 201 || retry.status === 200, `код: ${retry.status} ${retry.text}`);
      state.originBooking = retry.body?.data?.id;
    } else {
      must(response.status === 201 || response.status === 200, `код: ${response.status} ${response.text}`);
      state.originBooking = response.body?.data?.id;
    }

    mustEqual(one(`SELECT count(*) FROM bookings WHERE id = ${state.originBooking};`), '1', 'записи нет в базе');

    return `запись ${state.originBooking} создана — своим источником проходит`;
  }, person.page);

  await step('step-64', 'страница не открывается во вложенном фрейме чужого источника', async () => {
    const framed = await person.context.newPage();
    await framed.goto('about:blank');

    const result = await framed.evaluate(async (base) => new Promise((resolve) => {
      const frame = document.createElement('iframe');
      frame.src = base;
      document.body.appendChild(frame);
      setTimeout(() => {
        let reachable = false;
        try {
          reachable = Boolean(frame.contentDocument?.body?.innerHTML?.length);
        } catch {
          reachable = false;
        }
        resolve({ reachable });
      }, 3000);
    }), BASE);

    must(!result.reachable, 'содержимое страницы доступно во вложенном фрейме');
    await framed.close();

    return 'фрейм пуст — вложение заблокировано (X-Frame-Options: DENY и frame-ancestors none)';
  }, person.page);

  await person.context.close();
}

// ───────────── Сценарий 13. Владение вместо ролей ─────────────

async function scenario13() {
  console.log('\n=== Сценарий 13. Владение вместо ролей ===');
  const card = await freshContext();
  await loginAs(card.page, LIVE.card);
  const me = await whoAmI(card.page);
  state.cardFace = (me.faces ?? [])[0];

  await step('step-65', 'человек с карточкой попадает в кабинет своего лица, прежний адрес уводит туда же', async () => {
    mustEqual((me.faces ?? []).length, 1, 'лиц у человека с одной карточкой');
    mustEqual(state.cardFace.kind, 'trainer', 'вид единственного лица');

    const own = await pageResponse(card.context, `/profile/trainer/${state.cardFace.id}/dashboard`);
    mustEqual(own.status, 200, 'кабинет своего лица');

    const legacy = await pageResponse(card.context, '/profile/provider/dashboard');
    mustEqual(legacy.status, 307, 'код прежнего адреса');
    mustEqual(legacy.location, `/profile/trainer/${state.cardFace.id}/dashboard`, 'куда уводит прежний адрес');

    return `кабинет /profile/trainer/${state.cardFace.id} открыт, прежний адрес отвечает 307 туда же`;
  }, card.page);

  await step('step-66', 'видит свои публикации и не видит чужих', async () => {
    const moderation = await api(card.page, 'GET', '/api/publications');
    mustEqual(moderation.status, 403, 'админский свод публикаций владельцу лица');
    mustEqual(moderation.body?.error, 'Недостаточно прав', 'текст отказа');

    await card.page.goto(`${BASE}/profile/trainer/${state.cardFace.id}/publications`, { waitUntil: 'domcontentloaded' });
    // ⚠️ Список публикаций — клиентский компонент: ждём его, а не разметку кабинета.
    await card.page.waitForSelector('[data-testid="provider-publications"]', { timeout: 20000 });
    const body = await card.page.locator('body').innerText();

    must(body.includes(state.cardFace.name.split(' ')[0]), `своей карточки «${state.cardFace.name}» на странице нет`);
    const foreign = [`${RUN_TAG} Клуб владельца`, `${RUN_TAG} Клуб постороннего`];
    const leaked = foreign.filter((name) => body.includes(name));
    mustEqual(leaked.length, 0, `на странице видны чужие публикации: ${leaked.join(', ')}`);

    return 'своя карточка на месте, чужих публикаций нет, админский свод даёт 403';
  }, card.page);

  await step('step-67', 'админский маршрут владельцу лица — 403', async () => {
    const logs = await api(card.page, 'GET', '/api/logs');
    const analytics = await api(card.page, 'GET', '/api/analytics');

    mustEqual(logs.status, 403, 'код журнала');
    mustEqual(logs.body?.error, 'Недостаточно прав', 'текст отказа журнала');
    mustEqual(analytics.status, 403, 'код аналитики');

    return `403 «${logs.body.error}» на журнал и аналитику — шесть админских возможностей остались правом`;
  }, card.page);

  const plain = await freshContext();
  await loginAs(plain.page, OWN.client);

  await step('step-68', 'человек без лиц подтверждает запись — 403 именно про подтверждение', async () => {
    const response = await api(plain.page, 'POST', `/api/bookings/${state.clientBooking2}/confirm`, {});

    mustEqual(response.status, 403, 'код');
    // ⚠️ Текст существенен: общее «Недостаточно прав» означало бы, что вернулась
    // проверка по роли. Останавливать обязано владение слотом.
    mustEqual(response.body?.error, 'Недостаточно прав для подтверждения записи', 'текст отказа');
    mustEqual(one(`SELECT status FROM bookings WHERE id = ${state.clientBooking2};`), 'pending', 'статус записи изменился');

    return `403 «${response.body.error}», запись осталась pending`;
  }, plain.page);

  await step('step-68a', 'поля role нет в ответах, колонки role нет в схеме', async () => {
    const me2 = await api(plain.page, 'GET', '/api/auth/me');
    const clubs = await api(plain.page, 'GET', '/api/clubs');
    const trainers = await api(plain.page, 'GET', '/api/trainers');

    must(!/"role"/.test(me2.text), `«кто я» содержит role: ${me2.text}`);
    must(!/"role"/.test(JSON.stringify(clubs.body ?? {})), 'каталог клубов содержит role');
    must(!/"role"/.test(JSON.stringify(trainers.body ?? {})), 'каталог тренеров содержит role');

    const column = one(`SELECT count(*) FROM information_schema.columns
                        WHERE table_name = 'users' AND column_name = 'role';`);
    mustEqual(column, '0', 'колонка role у users на месте');

    return 'ни в одном ответе поля role нет, в схеме users колонки role нет';
  }, plain.page);

  await card.context.close();
  await plain.context.close();
}

// ───────────── Сценарий 14. Лица услуг: разделы от владения ─────────────

async function scenario14() {
  console.log('\n=== Сценарий 14. Лица услуг: разделы от владения ===');
  const card = await freshContext();
  await loginAs(card.page, LIVE.card);

  await step('step-69', 'разделы кабинета карточки: список целиком, «Публикаций» нет', async () => {
    const items = await sections(card.page, `/profile/trainer/${state.cardFace.id}/dashboard`);

    must(items.includes('Моя карточка'), `раздела «Моя карточка» нет: ${items.join(', ')}`);
    must(!items.includes('Публикации'), `в кабинете карточки есть раздел клуба: ${items.join(', ')}`);
    for (const name of ['Обзор', 'Связи', 'Отзывы', 'Финансы', 'Уведомления', 'Настройки']) {
      must(items.includes(name), `в кабинете лица нет раздела «${name}»: ${items.join(', ')}`);
    }
    state.cardSections = items;

    return `разделов ${items.length}: ${items.join(', ')}`;
  }, card.page);

  const starter = await freshContext();
  await loginAs(starter.page, OWN.starter);

  await step('step-70', 'владелец карточки заводит клуб — 201, в кабинете клуба появились «Публикации»', async () => {
    const first = await api(starter.page, 'POST', '/api/trainers',
      trainerForm('Начинающий', [slot('Персоналка новичка', 12, '09:00', '10:00', '2')]));
    must(first.status === 201 || first.status === 200, `первая карточка: ${first.text}`);
    state.starterTrainerId = first.body?.data?.trainer?.id;

    const club = await api(starter.page, 'POST', '/api/clubs',
      clubForm(`${RUN_TAG} Клуб новичка`, [slot('Занятие новичка', 13, '09:00', '10:00')]));
    mustEqual(club.status, 201, `клуб от владельца карточки: ${club.status} ${club.text}`);
    state.starterClubId = club.body?.data?.club?.id;

    const me = await whoAmI(starter.page);
    mustEqual((me.faces ?? []).length, 2, 'лиц после второй публикации');

    const clubSections = await sections(starter.page, `/profile/club/${state.starterClubId}/dashboard`);
    const cardSections = await sections(starter.page, `/profile/trainer/${state.starterTrainerId}/dashboard`);
    must(clubSections.includes('Публикации'), `в кабинете клуба нет «Публикаций»: ${clubSections.join(', ')}`);
    must(cardSections.includes('Моя карточка'), `в кабинете карточки нет «Моей карточки»: ${cardSections.join(', ')}`);

    state.starterClubSections = clubSections;
    state.starterCardSections = cardSections;

    return `клуб ${state.starterClubId} заведён, лиц два, у клуба «Публикации», у карточки «Моя карточка»`;
  }, starter.page);

  const stranger = await freshContext();
  await loginAs(stranger.page, OWN.stranger);

  await step('step-71', 'владелец клуба заводит карточку — 201, на странице публикаций обе кнопки', async () => {
    const response = await api(stranger.page, 'POST', '/api/trainers',
      trainerForm('Чужой', [slot('Персоналка постороннего', 14, '15:00', '16:00', '2')]));

    mustEqual(response.status, 201, `карточка от владельца клуба: ${response.status} ${response.text}`);
    state.foreignTrainerId = response.body?.data?.trainer?.id;

    await stranger.page.goto(`${BASE}/profile/club/${state.foreignClubId}/publications`, { waitUntil: 'domcontentloaded' });
    await stranger.page.waitForSelector('[data-testid="provider-publications"]', { timeout: 20000 });
    const body = await stranger.page.locator('body').innerText();

    must(/Опубликовать клуб/i.test(body), `нет кнопки «Опубликовать клуб»: ${body.replace(/\s+/g, ' ').slice(0, 200)}`);
    must(/Опубликовать тренера/i.test(body), `нет кнопки «Опубликовать тренера»: ${body.replace(/\s+/g, ' ').slice(0, 200)}`);

    return `карточка ${state.foreignTrainerId} заведена, на странице публикаций обе кнопки`;
  }, stranger.page);

  const builder = await freshContext();
  await loginAs(builder.page, OWN.builder);

  await step('step-71a', 'правка чужих лиц — 403 «не твоя вещь», обе вещи целы', async () => {
    const clubBefore = one(`SELECT name FROM clubs WHERE id = ${state.foreignClubId};`);
    const trainerBefore = one(`SELECT name FROM trainers WHERE id = ${state.foreignTrainerId};`);

    const club = await api(builder.page, 'PATCH', `/api/clubs/${state.foreignClubId}`,
      clubForm(`${RUN_TAG} Перехват клуба`, [slot('Перехват', 15, '10:00', '11:00')]));
    const trainer = await api(builder.page, 'PATCH', `/api/trainers/${state.foreignTrainerId}`,
      trainerForm('Перехваченный', [slot('Перехват', 15, '10:00', '11:00', '2')]));

    mustEqual(club.status, 403, 'код правки чужого клуба');
    mustEqual(club.body?.error, `Недостаточно прав для редактирования клуба с id ${state.foreignClubId}`, 'текст по клубу');
    mustEqual(trainer.status, 403, 'код правки чужой карточки');
    mustEqual(trainer.body?.error, `Недостаточно прав для редактирования тренера с id ${state.foreignTrainerId}`, 'текст по карточке');
    mustEqual(one(`SELECT name FROM clubs WHERE id = ${state.foreignClubId};`), clubBefore, 'название чужого клуба');
    mustEqual(one(`SELECT name FROM trainers WHERE id = ${state.foreignTrainerId};`), trainerBefore, 'имя чужой карточки');

    return `оба 403 с номером вещи в тексте, обе вещи целы`;
  }, builder.page);

  const admin = await freshContext();
  await loginAs(admin.page, LIVE.admin, { portal: 'service' });

  await step('step-71b', 'служебная запись лиц не заводит — 403 «Публикации заводят пользователи площадки»', async () => {
    const clubs = one('SELECT count(*) FROM clubs;');
    const trainers = one('SELECT count(*) FROM trainers;');

    const club = await api(admin.page, 'POST', '/api/clubs', clubForm(`${RUN_TAG} Клуб администратора`, [slot('Слот', 16, '10:00', '11:00')]));
    const trainer = await api(admin.page, 'POST', '/api/trainers', trainerForm('Администраторский', [slot('Слот', 16, '10:00', '11:00', '2')]));

    mustEqual(club.status, 403, 'код создания клуба администратором');
    mustEqual(club.body?.error, 'Публикации заводят пользователи площадки', 'текст по клубу');
    mustEqual(trainer.status, 403, 'код создания карточки администратором');
    mustEqual(trainer.body?.error, 'Публикации заводят пользователи площадки', 'текст по карточке');
    mustEqual(one('SELECT count(*) FROM clubs;'), clubs, 'число клубов изменилось');
    mustEqual(one('SELECT count(*) FROM trainers;'), trainers, 'число карточек изменилось');

    return `оба 403 «${club.body.error}», в каталоге ничего не прибавилось`;
  }, admin.page);

  await step('step-72', 'владелец лица подтверждает запись на СВОЁ занятие — 200 и confirmed', async () => {
    const response = await api(builder.page, 'POST', `/api/bookings/${state.clientBooking2}/confirm`, {});

    mustEqual(response.status, 200, `код: ${response.text}`);
    mustEqual(response.body?.data?.status, 'confirmed', 'статус в ответе');
    mustEqual(one(`SELECT status FROM bookings WHERE id = ${state.clientBooking2};`), 'confirmed', 'статус в базе');

    return `заявка ${state.clientBooking2} подтверждена, в базе confirmed`;
  }, builder.page);

  await step('step-73', 'подтверждение записи на ЧУЖОЕ занятие — 403, статус не тронут', async () => {
    must(state.clientForeignBooking, 'нет записи на занятие чужого клуба');
    const before = one(`SELECT status FROM bookings WHERE id = ${state.clientForeignBooking};`);

    const response = await api(builder.page, 'POST', `/api/bookings/${state.clientForeignBooking}/confirm`, {});

    mustEqual(response.status, 403, 'код');
    mustEqual(response.body?.error, 'Недостаточно прав для подтверждения записи', 'текст отказа');
    mustEqual(one(`SELECT status FROM bookings WHERE id = ${state.clientForeignBooking};`), before, 'статус чужой записи');

    return `403 «${response.body.error}», чужая запись осталась ${before}`;
  }, builder.page);

  await step('step-73a', 'решение по СВОЕЙ записи в свой клуб — 403 «решает вторая сторона»', async () => {
    const before = one(`SELECT status FROM bookings WHERE id = ${state.ownerBooking};`);
    const response = await api(builder.page, 'POST', `/api/bookings/${state.ownerBooking}/confirm`, {});

    mustEqual(response.status, 403, 'код');
    mustEqual(response.body?.error, 'Решение по своей записи принимает вторая сторона', 'текст отказа');
    mustEqual(one(`SELECT status FROM bookings WHERE id = ${state.ownerBooking};`), before, 'статус своей записи');

    return `403 «${response.body.error}», запись осталась ${before} — цепочка накрутки разорвана`;
  }, builder.page);

  await step('step-74', 'связь клуб↔тренер: кто зовёт, кто подтверждает, и подмена стороны', async () => {
    const invite = await api(builder.page, 'POST', '/api/trainer-club-links', {
      clubId: state.ownClubId, trainerId: state.foreignTrainerId, initiatedBy: 'club',
    });
    mustEqual(invite.status, 201, `приглашение не ушло: ${invite.status} ${invite.text}`);
    mustEqual(invite.body?.data?.status, 'pending', 'статус свежей связи с чужой стороной');
    const linkId = invite.body.data.id;

    const selfApprove = await api(builder.page, 'POST', `/api/trainer-club-links/${linkId}/approve`, {});
    mustEqual(selfApprove.status, 403, 'клуб подтверждает своё же приглашение');
    mustEqual(selfApprove.body?.error, 'Недостаточно прав для подтверждения связи', 'текст самоподтверждения');
    mustEqual(one(`SELECT status FROM trainer_club_links WHERE id = ${linkId};`), 'pending', 'статус после самоподтверждения');

    const before = one(`SELECT count(*) FROM trainer_club_links WHERE club_id = ${state.ownClubId} AND trainer_id = ${state.starterTrainerId};`);
    const forged = await api(builder.page, 'POST', '/api/trainer-club-links', {
      clubId: state.ownClubId, trainerId: state.starterTrainerId, initiatedBy: 'trainer',
    });
    mustEqual(forged.status, 403, 'клуб выдаёт себя за чужого тренера');
    mustEqual(forged.body?.error, 'Недостаточно прав для отправки запроса', 'текст подмены стороны');
    mustEqual(one(`SELECT count(*) FROM trainer_club_links WHERE club_id = ${state.ownClubId} AND trainer_id = ${state.starterTrainerId};`),
      before, 'связь с подменённой стороной всё-таки создалась');

    const approved = await api(stranger.page, 'POST', `/api/trainer-club-links/${linkId}/approve`, {});
    mustEqual(approved.status, 200, `подтверждение второй стороной: ${approved.text}`);
    mustEqual(one(`SELECT status FROM trainer_club_links WHERE id = ${linkId};`), 'confirmed', 'статус после подтверждения');
    state.foreignLinkId = linkId;

    return `связь ${linkId}: клуб позвал, тренер подтвердил; самоподтверждение и подмена стороны отбиты`;
  }, builder.page);

  await step('step-74a', 'своё со своим — сразу confirmed, без ожидания и без уведомлений', async () => {
    const before = one(`SELECT count(*) FROM notifications WHERE user_id = ${userIds[OWN.builder]};`);
    const response = await api(builder.page, 'POST', '/api/trainer-club-links', {
      clubId: state.ownClubId, trainerId: state.ownTrainerId,
    });

    mustEqual(response.status, 201, `связь своего со своим: ${response.text}`);
    mustEqual(response.body?.data?.status, 'confirmed', 'связь своего со своим встала не сразу');
    mustEqual(one(`SELECT status FROM trainer_club_links WHERE id = ${response.body.data.id};`), 'confirmed', 'статус в базе');
    mustEqual(one(`SELECT count(*) FROM notifications WHERE user_id = ${userIds[OWN.builder]};`), before,
      'человеку ушло уведомление о связи самого с собой');

    return 'сразу confirmed, спрашивать не у кого, ящик не тронут';
  }, builder.page);

  await step('step-75', 'наборы разделов выводятся из ЛИЦА, чей это кабинет', async () => {
    // ⚠️ Сравниваются лица БЕЗ записей у обоих: «Бронирования», «Клиенты»
    // и «Статистика» зависят от данных, и с записями разница говорила бы о них,
    // а не о владении.
    const cardItems = state.starterCardSections;
    const clubItems = state.starterClubSections;
    must(cardItems && clubItems, 'наборы разделов не собраны шагом 70');

    const onlyCard = cardItems.filter((x) => !clubItems.includes(x));
    const onlyClub = clubItems.filter((x) => !cardItems.includes(x));
    mustEqual(JSON.stringify(onlyCard), JSON.stringify(['Моя карточка']), `только у карточки: ${onlyCard.join(', ')}`);
    mustEqual(JSON.stringify(onlyClub), JSON.stringify(['Публикации']), `только у клуба: ${onlyClub.join(', ')}`);

    // Пятый случай прежней модели: у одного человека ДВА кабинета сразу.
    const me = await whoAmI(builder.page);
    const kinds = new Set((me.faces ?? []).map((f) => f.kind));
    must(kinds.has('club') && kinds.has('trainer'), `у человека не оба вида лиц: ${[...kinds].join(', ')}`);

    const ownClub = await pageResponse(builder.context, `/profile/club/${state.ownClubId}/dashboard`);
    const ownCard = await pageResponse(builder.context, `/profile/trainer/${state.ownTrainerId}/dashboard`);
    mustEqual(ownClub.status, 200, 'кабинет своего клуба');
    mustEqual(ownCard.status, 200, 'кабинет своей карточки');

    // И условные разделы: у лица С записями появляются «Бронирования» и «Клиенты».
    const withBookings = await sections(builder.page, `/profile/club/${state.ownClubId}/dashboard`);
    must(withBookings.includes('Бронирования'), `у лица с записями нет «Бронирований»: ${withBookings.join(', ')}`);
    must(!clubItems.includes('Бронирования'), 'у лица без записей появились «Бронирования»');

    return `у карточки своё «${onlyCard.join(', ')}», у клуба своё «${onlyClub.join(', ')}»; два кабинета у одного человека открыты; условные разделы зависят от записей`;
  }, builder.page);

  await card.context.close();
  await starter.context.close();
  await stranger.context.close();
  await builder.context.close();
  await admin.context.close();
}

// ───────────── Сценарий 15. Восстановление пароля ─────────────

async function scenario15() {
  console.log('\n=== Сценарий 15. Восстановление пароля ===');
  const guest = await freshContext();
  const second = await freshContext();
  let known = null;

  await step('step-76', 'существующая почта — нейтральный ответ', async () => {
    known = await forgotPassword(guest.page, OWN.reset);

    mustEqual(known.status, 200, `код: ${known.text}`);
    must(!/не найден|нет такой|существует|отправ/i.test(JSON.stringify(known.body)),
      `ответ выдаёт заведённость почты: ${known.text}`);
    // Ссылка при этом ВЫДАНА — иначе «нейтральный ответ» ничего не стоил бы.
    must(Number(one(`SELECT count(*) FROM password_reset_tokens WHERE user_id = ${userIds[OWN.reset]} AND used_at IS NULL;`)) > 0,
      'ссылка не выдана вовсе');

    return `200, тело ${known.text} — ссылка при этом выдана`;
  }, guest.page);

  await step('step-77', 'несуществующая почта — ответ дословно тот же', async () => {
    const unknown = await forgotPassword(guest.page, `${RUN_TAG}-net-takogo-3-${STAMP}@test.local`);

    mustEqual(unknown.status, known.status, 'код');
    mustEqual(JSON.stringify(unknown.body), JSON.stringify(known.body), 'тело');

    return 'ответы совпали побайтово';
  }, guest.page);

  await step('step-78', 'ссылка из письма открывает форму нового пароля', async () => {
    const token = lastResetToken(OWN.reset);
    must(token, 'в журнале заглушки нет письма с ссылкой для этого адресата');
    // ⚠️ Сверяем письмо с базой: в базе обязан лежать ХЕШ этого токена, а не он сам.
    // Заодно это ловит письмо прошлого прогона — по нему проверять было бы нечего.
    mustEqual(one(`SELECT count(*) FROM password_reset_tokens WHERE user_id = ${userIds[OWN.reset]}
                   AND used_at IS NULL AND token_hash = encode(sha256('${token}'::bytea), 'hex');`),
      '1', 'ссылка из письма не совпала со свежей строкой в базе');
    state.resetToken = token;

    const response = await guest.page.goto(`${BASE}/reset-password?token=${token}`, { waitUntil: 'domcontentloaded' });
    mustEqual(response.status(), 200, 'код страницы');
    await guest.page.waitForSelector('input[type="password"]', { timeout: 20000 });

    const fields = await guest.page.locator('input[type="password"]').count();
    must(fields >= 1, 'на странице нет поля нового пароля');

    return `форма нового пароля открылась, полей пароля ${fields}`;
  }, guest.page);

  await step('step-79', 'новый пароль задан: старый не работает, новый работает', async () => {
    await loginAs(second.page, OWN.reset);

    const response = await withoutRateLimit(guest.page, 'POST', '/api/auth/reset-password', {
      token: state.resetToken, password: RESET_PASSWORD,
    }, 'сброс пароля');
    must(response.status === 200 || response.status === 204, `сброс не прошёл: ${response.status} ${response.text}`);

    const old = await api(guest.page, 'POST', '/api/auth/login', { email: OWN.reset, password: PASSWORD });
    mustEqual(old.status, 401, 'вход старым паролем');
    mustEqual(old.body?.error, 'Неверная почта или пароль', 'текст отказа старому паролю');

    const fresh = await api(guest.page, 'POST', '/api/auth/login', { email: OWN.reset, password: RESET_PASSWORD });
    mustEqual(fresh.status, 200, 'вход новым паролем');

    return 'старый пароль отвергнут, новый принят';
  }, guest.page);

  await step('step-80', 'прежние сессии погашены — второй браузер выбило', async () => {
    const me = await api(second.page, 'GET', '/api/auth/me');
    mustEqual(me.status, 401, 'второй браузер после сброса пароля');

    const raw = await pageResponse(second.context, '/profile/me/dashboard');
    must(raw.status !== 200, `второй браузер остался в кабинете: ${raw.status}`);

    return 'второй браузер получил 401 и уведён из кабинета';
  }, second.page);

  await step('step-81', 'повторное использование ссылки — отказ, она одноразовая', async () => {
    const response = await withoutRateLimit(guest.page, 'POST', '/api/auth/reset-password', {
      token: state.resetToken, password: 'eshchyo-odin-parol-34',
    }, 'сброс пароля');

    mustEqual(response.status, 400, `повтор прошёл: ${response.status} ${response.text}`);
    mustEqual(response.body?.error, 'Ссылка восстановления недействительна или устарела', 'текст отказа');

    const check = await api(guest.page, 'POST', '/api/auth/login', { email: OWN.reset, password: 'eshchyo-odin-parol-34' });
    mustEqual(check.status, 401, 'пароль всё-таки сменился повторной ссылкой');

    return `400 «${response.body.error}», пароль не сменился`;
  }, guest.page);

  await step('step-82', 'просроченная ссылка — отказ с понятным текстом', async () => {
    const expired = insertExpiredResetToken(Number(userIds[OWN.reset]));
    const response = await withoutRateLimit(guest.page, 'POST', '/api/auth/reset-password', {
      token: expired, password: 'parol-po-prosrochennoy-34',
    }, 'сброс пароля');

    mustEqual(response.status, 400, `просроченная ссылка сработала: ${response.status} ${response.text}`);
    mustEqual(response.body?.error, 'Ссылка восстановления недействительна или устарела', 'текст отказа');

    const check = await api(guest.page, 'POST', '/api/auth/login', { email: OWN.reset, password: 'parol-po-prosrochennoy-34' });
    mustEqual(check.status, 401, 'пароль сменился по просроченной ссылке');

    return `400 «${response.body.error}», пароль не сменился`;
  }, guest.page);

  await step('step-83', 'заявки на восстановление сверх порога — 429', async () => {
    let limited = null;
    for (let i = 0; i < 10 && !limited; i += 1) {
      const response = await api(guest.page, 'POST', '/api/auth/forgot-password', {
        email: `${RUN_TAG}-flood-${i}@test.local`,
      });
      if (response.status === 429) limited = { at: i + 1, error: response.body?.error };
    }

    must(limited, 'десять заявок подряд не упёрлись в предел частоты');
    mustEqual(limited.error, 'Слишком много запросов. Повторите позже.', 'текст отказа');

    return `429 на ${limited.at}-й заявке: «${limited.error}»`;
  }, guest.page);

  await guest.context.close();
  await second.context.close();
}

// ───────────── Запуск ─────────────

let code = 2;

try {
  code = (await main()) > 0 ? 1 : 0;
} catch (error) {
  console.error('прогон прерван:', error);
  await shutdown();
} finally {
  // ⚠️ Уборка ВСЕГДА, в том числе после падения: иначе второй прогон падал бы
  // на данных первого, и повторяемость держалась бы на удаче.
  console.log('убираю данные прогона…', cleanupRun());
}

process.exit(code);
