// Браузерный прогон двух чек-листов фазы 35:
//   `tests/checklists/notifications.md`      — уведомления и настройки (52 шага)
//   `tests/checklists/trainer-club-links.md` — связи тренер↔клуб (35 шагов)
//
// Запуск: node tests/e2e-notifications-links-run.mjs
//
// ⚠️ Шаг НЕ засчитывается по коду ответа. Каждая проверка смотрит в СОДЕРЖИМОЕ:
// что вернулось, что видно на экране, что лежит в базе. Для уведомлений это
// особенно важно: адресат — это КОЛОНКА (`addressee_club_id` / `addressee_trainer_id`),
// а не то, что показал маршрут. Маршрут может отдать строку по объединённому
// срезу «всё моё» и при пустой колонке лица — и выглядеть это будет одинаково.
//
// ⚠️ Запросы идут ИЗ БРАУЗЕРА (`api()` из обвязки), а не через curl: только так
// в запрос попадают настоящая cookie сессии, настоящий `Origin` и `Sec-Fetch-Site`.
//
// ⚠️ Считая уведомления, берём ОТСЕЧКУ (`baselineId()`): без неё проверка
// ловит след предыдущего шага, а не то, что проверяет, и зеленеет по чужой причине.
//
// ⚠️ Свои данные, своя уборка. Прогон заводит трёх СВОИХ людей с признаком
// `e2e-notif` в почте и их публикации и в конце сносит всё по этому признаку —
// в `finally`, то есть и после падения. Живые учётки трогаются только на чтение
// (`admin@sporthub.local` — отсутствие колокольчика и `?scope=all`;
// `marina@studio.local` — чужое лицо для проверок отказа).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

import {
  BASE,
  api,
  freshContext,
  futureDate,
  launch,
  loginAs,
  must,
  mustEqual,
  results,
  shutdown,
  skip,
  step,
  whoAmI,
} from './e2e-phase-35-harness.mjs';

// --- Изоляция прогона ------------------------------------------------------------

/** Признак прогона. По нему всё созданное потом и сносится. Свой, не чужой. */
const RUN_TAG = 'e2e-notif';

/** Хеш пароля `sporthub123` — тот же, что у людей сида. */
const PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$kZOypsO+wlMzc4WtYnCnfA$i6JooAm2PGSA/2Rh8P0X6XJoe9KQ3tF1+Oi4kBpE3y8';

/**
 * Люди прогона. Каждый закрывает свой случай модели:
 * `boss` — владелец нескольких лиц (два клуба и карточка тренера): на нём проверяются
 *          раздельные ящики; `client` — человек без лиц; `mate` — вторая сторона,
 *          чужая для `boss`: связи, отказы и проверки «чужое лицо → 403».
 */
const USERS = {
  boss: `${RUN_TAG}-boss@test.local`,
  client: `${RUN_TAG}-client@test.local`,
  mate: `${RUN_TAG}-mate@test.local`,
};

function psql(sql) {
  return execFileSync(
    'docker',
    ['exec', '-i', 'sporthub_postgres', 'psql', '-U', 'sporthub', '-d', 'sporthub', '-tAc', sql],
    { encoding: 'utf8' },
  ).trim();
}

/** Прочитать что-нибудь из базы: проверки смотрят в данные, а не в ответ маршрута. */
const db = (sql) => psql(sql);
const dbNum = (sql) => Number(psql(sql));

/**
 * Отсечка «что было до». Без неё «в ящике появилась строка» ловит след прошлого
 * шага, а не то, что проверяет.
 *
 * ⚠️ Отсечка по НОМЕРУ последней строки, а не по времени. Время здесь врёт:
 * часы базы (контейнер) и часы приложения (хост) расходятся на десятки
 * миллисекунд, и событие, случившееся сразу после отсечки, оказывалось «раньше»
 * неё — шаг падал через раз. Номер уведомления выдаёт последовательность базы,
 * и он строго растёт.
 */
const baselineId = () => dbNum('SELECT coalesce(max(id),0) FROM notifications;');

/** Завести людей прогона. Идемпотентно: повторный запуск ничего не удваивает. */
function seedUsers() {
  for (const [role, email] of Object.entries(USERS)) {
    psql(`
      INSERT INTO users (created_at, status, account_kind, name, email, phone, password_hash)
      VALUES (now(), 'active', 'person', 'Прогон ${role}', '${email}', '+7 (900) 555-02-01',
              '${PASSWORD_HASH}')
      ON CONFLICT (email) DO NOTHING;
    `);
  }

  const rows = psql(`SELECT email || '=' || id FROM users WHERE email LIKE '${RUN_TAG}-%';`);
  const byEmail = Object.fromEntries(
    rows
      .split('\n')
      .filter(Boolean)
      .map((row) => row.split('=')),
  );

  return {
    boss: Number(byEmail[USERS.boss]),
    client: Number(byEmail[USERS.client]),
    mate: Number(byEmail[USERS.mate]),
  };
}

/**
 * Убрать за собой ВСЁ.
 *
 * Порядок продиктован схемой: `bookings.user_id`, `reviews.user_id` и `logs.actor_id` —
 * `onDelete: Restrict`, база не даст удалить человека, у которого есть запись, отзыв
 * или строка журнала. Поэтому сначала листья, потом публикации, потом люди.
 */
function cleanup() {
  const ids = psql(`SELECT id FROM users WHERE email LIKE '${RUN_TAG}-%';`)
    .split('\n')
    .filter(Boolean);

  if (ids.length === 0) return { users: 0, clubs: 0, trainers: 0 };

  const list = ids.join(',');
  const ownClubs = `(SELECT id FROM clubs WHERE managed_by_user_id IN (${list}) OR name LIKE '${RUN_TAG}%')`;
  const ownTrainers = `(SELECT id FROM trainers WHERE managed_by_user_id IN (${list}) OR name LIKE '${RUN_TAG}%')`;

  psql(`DELETE FROM notifications WHERE user_id IN (${list});`);
  psql(`DELETE FROM user_notification_preferences WHERE user_id IN (${list});`);
  psql(
    `DELETE FROM provider_client_notes WHERE provider_user_id IN (${list}) OR client_user_id IN (${list});`,
  );
  psql(
    `DELETE FROM reviews WHERE user_id IN (${list}) OR club_id IN ${ownClubs} OR trainer_id IN ${ownTrainers};`,
  );
  // ⚠️ У записи владелец лежит парой колонок (`owner_club_id` / `owner_trainer_id`),
  // а зал занятия — третьей (`venue_club_id`): пропустить её значило бы оставить
  // записи, которые не дадут удалить клуб.
  psql(
    `DELETE FROM bookings WHERE user_id IN (${list}) OR owner_club_id IN ${ownClubs} OR owner_trainer_id IN ${ownTrainers} OR venue_club_id IN ${ownClubs};`,
  );
  psql(`DELETE FROM trainer_club_links WHERE club_id IN ${ownClubs} OR trainer_id IN ${ownTrainers};`);
  psql(
    `DELETE FROM schedule WHERE owner_club_id IN ${ownClubs} OR owner_trainer_id IN ${ownTrainers} OR venue_club_id IN ${ownClubs};`,
  );
  psql(
    `DELETE FROM offerings WHERE owner_club_id IN ${ownClubs} OR owner_trainer_id IN ${ownTrainers} OR venue_club_id IN ${ownClubs};`,
  );
  psql(`DELETE FROM logs WHERE actor_id IN (${list});`);
  psql(`DELETE FROM sessions WHERE user_id IN (${list});`);

  const clubs = psql(
    `WITH d AS (DELETE FROM clubs WHERE id IN ${ownClubs} RETURNING 1) SELECT count(*) FROM d;`,
  );
  const trainers = psql(
    `WITH d AS (DELETE FROM trainers WHERE id IN ${ownTrainers} RETURNING 1) SELECT count(*) FROM d;`,
  );
  const users = psql(
    `WITH d AS (DELETE FROM users WHERE id IN (${list}) RETURNING 1) SELECT count(*) FROM d;`,
  );

  return { users: Number(users), clubs: Number(clubs), trainers: Number(trainers) };
}

// --- Помощники прогона -----------------------------------------------------------

/** Слот расписания. Даты будущие и разные: слоты не должны склеиваться. */
const slot = (index, sportId = 1) => ({
  title: `Занятие прогона ${index}`,
  date: futureDate(7 + index),
  startTime: '10:00',
  endTime: '11:00',
  price: '700',
  capacity: '5',
  location: 'Зал',
  sportId,
});

const clubForm = (name, slots) => ({
  name,
  city: 'Самара',
  address: 'ул. Прогонная, 1',
  description:
    'Клуб, заведённый браузерным прогоном уведомлений и связей. Описание длиной заведомо больше пятидесяти символов, как требует схема публикации.',
  phone: '+7 (900) 555-02-10',
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
});

const trainerForm = (last, slots) => ({
  firstName: RUN_TAG,
  lastName: last,
  city: 'Самара',
  address: 'ул. Прогонная, 2',
  bio: 'Карточка тренера, заведённая браузерным прогоном уведомлений и связей. Описание длиной заведомо больше пятидесяти символов.',
  experience: '5',
  sportIds: [1],
  specialtyIds: [1],
  workFormatIds: [1],
  phone: '+7 (900) 555-02-11',
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
});

async function publishClub(page, name, slots) {
  const response = await api(page, 'POST', '/api/clubs', clubForm(name, slots));

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`публикация клуба «${name}» ответила ${response.status}: ${response.text}`);
  }

  return response.body?.data?.club?.id;
}

async function publishTrainer(page, last, slots) {
  const response = await api(page, 'POST', '/api/trainers', trainerForm(last, slots));

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`публикация карточки «${last}» ответила ${response.status}: ${response.text}`);
  }

  return response.body?.data?.trainer?.id;
}

/** Номера слотов публикации — прямо из базы, в порядке даты. */
const clubSlots = (clubId) =>
  db(`SELECT id FROM schedule WHERE owner_club_id=${clubId} ORDER BY date, id;`)
    .split('\n')
    .filter(Boolean)
    .map(Number);

const trainerSlots = (trainerId) =>
  db(`SELECT id FROM schedule WHERE owner_trainer_id=${trainerId} ORDER BY date, id;`)
    .split('\n')
    .filter(Boolean)
    .map(Number);

/** Лента ящика: `''` — объединённый срез, `?clubId=` / `?trainerId=` / `?scope=` — ящик. */
async function inbox(page, query = '') {
  const response = await api(page, 'GET', `/api/notifications${query}`);

  if (response.status !== 200) {
    throw new Error(`лента ${query || '(всё моё)'} ответила ${response.status}: ${response.text}`);
  }

  return response.body?.data?.items ?? [];
}

async function unread(page, query = '') {
  const response = await api(page, 'GET', `/api/notifications/unread-count${query}`);

  if (response.status !== 200) {
    throw new Error(`счётчик ${query || '(всё моё)'} ответил ${response.status}: ${response.text}`);
  }

  return response.body?.data?.unreadCount;
}

/** Запись на слот. Клиент в теле не передаётся — сервер берёт его из сессии. */
async function book(page, scheduleId) {
  const response = await api(page, 'POST', '/api/bookings', { scheduleId });

  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`запись на слот ${scheduleId}: ${response.status} ${response.text}`);
  }

  return response.body?.data?.id;
}

/**
 * Открыть страницу и дождаться ГИДРАЦИИ по опорному селектору.
 *
 * ⚠️ Клиентские компоненты рисуются после того, как стор наполнится ответом
 * «кто я». Проверка сразу после `domcontentloaded` сказала бы «этого нет на
 * экране» даже там, где оно есть, — то есть была бы зелёной по чужой причине.
 */
async function open(page, path, selector, timeout = 15000) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });

  if (selector) await page.waitForSelector(selector, { timeout });
}

/** Тексты всех живых тостов. Своего testid у них нет — опознаются ролью. */
const toasts = (page) =>
  page.$$eval('[role="status"]', (nodes) => nodes.map((node) => node.textContent.trim()));

/**
 * Открыть выпадающий список колокольчика и ДОЖДАТЬСЯ его наполнения.
 *
 * ⚠️ Список грузится лениво, уже после открытия. Прочитать его сразу — значит
 * увидеть ноль строк и там, где их пять: проверка «этого в списке нет» стала бы
 * зелёной по чужой причине. Ждём, пока уйдёт надпись «Загружаем…».
 */
async function openBell(page) {
  await page.click('header button[aria-label="Уведомления"]');
  await page.waitForSelector('[data-testid="notification-bell-dropdown"]', { timeout: 10000 });

  // ⚠️ Ждать «пока уйдёт надпись Загружаем…» НЕЛЬЗЯ: до первого захода в сеть
  // список рисуется пустым и с надписью «Нет новых уведомлений», а сам запрос
  // уходит эффектом уже после отрисовки. Проверка успевала прочитать эту пустоту
  // и объявляла её результатом. Поэтому ждём появления строки, а её отсутствие
  // подтверждаем окончанием загрузки.
  await page
    .waitForSelector('[data-testid^="notification-bell-item-"]', { timeout: 8000 })
    .catch(() => {});
  await page.waitForFunction(
    () => {
      const root = document.querySelector('[data-testid="notification-bell-dropdown"]');

      return root !== null && !root.textContent.includes('Загружаем');
    },
    { timeout: 15000 },
  );

  return page.$$eval('[data-testid^="notification-bell-item-"]', (nodes) =>
    nodes.map((node) => ({
      id: Number(node.getAttribute('data-testid').replace('notification-bell-item-', '')),
      text: node.textContent.trim(),
    })),
  );
}

/** Строки уведомлений, отрисованные на странице, — по их номерам. */
const renderedIds = (page) =>
  page.$$eval('[data-testid^="notification-item-"]', (nodes) =>
    nodes
      .map((node) => node.getAttribute('data-testid'))
      .filter((id) => /^notification-item-\d+$/.test(id))
      .map((id) => Number(id.replace('notification-item-', ''))),
  );

// --- Прогон ----------------------------------------------------------------------

async function main() {
  console.log('готовлю данные прогона…');
  const users = seedUsers();
  console.log(`заведено людей: ${Object.values(users).join(', ')}`);

  await launch();

  const boss = await freshContext();
  const client = await freshContext();
  const mate = await freshContext();

  await loginAs(boss.page, USERS.boss, {});
  await loginAs(client.page, USERS.client, {});
  await loginAs(mate.page, USERS.mate, {});

  // Лица прогона. У `boss` их три (два клуба и карточка) — на нём и проверяются
  // раздельные ящики; у `mate` тоже три, чтобы было чем изображать чужую сторону.
  const clubA = await publishClub(
    boss.page,
    `${RUN_TAG} Клуб А`,
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map((index) => slot(index)),
  );
  const clubB = await publishClub(boss.page, `${RUN_TAG} Клуб Б`, [slot(20)]);
  const trainerA = await publishTrainer(boss.page, 'Альфа', [slot(21)]);
  const clubC = await publishClub(mate.page, `${RUN_TAG} Клуб В`, [slot(22)]);
  const clubD = await publishClub(mate.page, `${RUN_TAG} Клуб Г`, [slot(23)]);
  const trainerC = await publishTrainer(mate.page, 'Гамма', [slot(24)]);

  const aSlots = clubSlots(clubA);
  const bSlots = clubSlots(clubB);
  const cSlots = clubSlots(clubC);
  const tcSlots = trainerSlots(trainerC);

  console.log(
    `лица: клубы ${clubA}/${clubB} (boss), ${clubC}/${clubD} (mate), карточки ${trainerA} (boss), ${trainerC} (mate)`,
  );
  console.log(`слоты клуба А: ${aSlots.join(', ')}`);

  const cabinetA = `/profile/club/${clubA}`;
  const cabinetB = `/profile/club/${clubB}`;
  const cabinetTA = `/profile/trainer/${trainerA}`;

  // ===============================================================================
  // notifications.md — Scenario: Адресат — лицо услуг (ядро фазы 35 по этому домену)
  // ===============================================================================
  console.log('\n=== notifications.md · Адресат — лицо услуг ===');

  let firstRequestId = null;

  await step(
    'адресат/step-1',
    'человек без лиц записывается на слот клуба А',
    async () => {
      const baseline = baselineId();
      const bookingId = await book(client.page, aSlots[0]);
      const row = db(
        `SELECT owner_club_id || '/' || user_id FROM bookings WHERE id=${bookingId};`,
      );

      mustEqual(row, `${clubA}/${users.client}`, 'владелец записи и её клиент в базе');

      const me = await whoAmI(boss.page);

      mustEqual((me.faces ?? []).length, 3, 'число лиц у владельца');

      firstRequestId = Number(
        db(
          `SELECT id FROM notifications WHERE user_id=${users.boss} AND type='booking_requested' AND id > ${baseline} ORDER BY id DESC LIMIT 1;`,
        ),
      );

      must(Number.isInteger(firstRequestId), 'уведомления о заявке не появилось вовсе');

      return `запись ${bookingId} на слот ${aSlots[0]}, уведомление ${firstRequestId}`;
    },
    client.page,
  );

  await step(
    'адресат/step-2',
    'в базе заполнено РОВНО ОДНО лицо — клуб А',
    async () => {
      const row = db(
        `SELECT type || '|' || coalesce(addressee_club_id::text,'-') || '|' || coalesce(addressee_trainer_id::text,'-') || '|' || user_id FROM notifications WHERE id=${firstRequestId};`,
      );

      mustEqual(row, `booking_requested|${clubA}|-|${users.boss}`, 'строка уведомления в базе');

      // Ограничение базы, а не договорённость кода: два лица разом вставить нельзя.
      const constraint = db(
        `SELECT conname FROM pg_constraint WHERE conrelid='notifications'::regclass AND conname='notifications_addressee_one';`,
      );

      mustEqual(constraint, 'notifications_addressee_one', 'ограничение «ровно одно лицо»');

      return 'addressee_club_id заполнен, addressee_trainer_id пуст, владелец — человек';
    },
    boss.page,
  );

  await step(
    'адресат/step-3',
    'ящик клуба А своё показал, ящик клуба Б — нет',
    async () => {
      const inA = await inbox(boss.page, `?clubId=${clubA}`);
      const inB = await inbox(boss.page, `?clubId=${clubB}`);

      must(
        inA.some((item) => item.id === firstRequestId),
        'в ящике своего клуба нет адресованного ему уведомления',
      );
      must(
        !inB.some((item) => item.id === firstRequestId),
        'уведомление клуба А видно в ящике клуба Б',
      );

      return `в ящике А ${inA.length} строк, в ящике Б ${inB.length} — чужой нет`;
    },
    boss.page,
  );

  await step(
    'адресат/step-4',
    'личный ящик с ящиками лиц не смешивается',
    async () => {
      const personal = await inbox(boss.page, '?scope=personal');

      must(
        !personal.some((item) => item.id === firstRequestId),
        'заявка клубу попала в личный ящик человека',
      );
      must(
        personal.every((item) => item.addresseeType === undefined),
        'в личном срезе есть строки с заполненным лицом',
      );

      return `в личном ящике ${personal.length} строк, ни одной с лицом`;
    },
    boss.page,
  );

  await step(
    'адресат/step-5',
    'объединённый срез «всё моё» строку показывает',
    async () => {
      const all = await inbox(boss.page, '');

      must(
        all.some((item) => item.id === firstRequestId),
        'объединённый срез не показал уведомление своего лица',
      );

      return `в объединённом срезе ${all.length} строк, заявка среди них`;
    },
    boss.page,
  );

  // Личная строка человека — своя запись к ЧУЖОМУ тренеру. Сценарий стал достижим
  // только в фазе 35: прежде владелец лица записаться не мог вовсе.
  let personalConfirmedId = null;

  await step(
    'адресат/step-10',
    'своя запись к чужому тренеру приходит ЧЕЛОВЕКУ, а не лицу',
    async () => {
      const baseline = baselineId();
      const bookingId = await book(boss.page, tcSlots[0]);
      const confirm = await api(mate.page, 'POST', `/api/bookings/${bookingId}/confirm`, {});

      mustEqual(confirm.status, 200, `подтверждение чужой стороной: ${confirm.text}`);

      const row = db(
        `SELECT id || '|' || coalesce(addressee_club_id::text,'-') || '|' || coalesce(addressee_trainer_id::text,'-') FROM notifications WHERE user_id=${users.boss} AND type='booking_confirmed' AND id > ${baseline};`,
      );

      must(row !== '', 'уведомления о подтверждении не пришло вовсе');
      const [id, clubColumn, trainerColumn] = row.split('|');

      personalConfirmedId = Number(id);
      mustEqual(clubColumn, '-', 'у личного уведомления заполнена колонка клуба');
      mustEqual(trainerColumn, '-', 'у личного уведомления заполнена колонка карточки');

      const personal = await inbox(boss.page, '?scope=personal');
      const inA = await inbox(boss.page, `?clubId=${clubA}`);

      must(
        personal.some((item) => item.id === personalConfirmedId),
        'личная строка не видна в личном ящике',
      );
      must(
        !inA.some((item) => item.id === personalConfirmedId),
        'личная строка человека видна в ящике его клуба',
      );

      return `строка ${personalConfirmedId} без лица: в личном есть, в ящике клуба нет`;
    },
    boss.page,
  );

  await step(
    'адресат/step-6',
    'счётчики непрочитанного у двух клубов — разные числа',
    async () => {
      // Клубу А добавляем вторую заявку, клубу Б — первую: иначе «разные числа»
      // сошлись бы случайно, по одной строке в каждом ящике.
      await book(client.page, aSlots[1]);
      await book(client.page, bSlots[0]);

      const inA = await unread(boss.page, `?clubId=${clubA}`);
      const inB = await unread(boss.page, `?clubId=${clubB}`);
      const dbA = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.boss} AND addressee_club_id=${clubA} AND read_at IS NULL;`,
      );
      const dbB = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.boss} AND addressee_club_id=${clubB} AND read_at IS NULL;`,
      );

      mustEqual(inA, dbA, 'счётчик клуба А разошёлся с базой');
      mustEqual(inB, dbB, 'счётчик клуба Б разошёлся с базой');
      must(inA !== inB, `числа совпали (${inA} и ${inB}) — ящики не разделены`);

      return `клуб А ${inA}, клуб Б ${inB} — каждое по своему ящику`;
    },
    boss.page,
  );

  await step(
    'адресат/step-7',
    '«прочитать всё» гасит ТОЛЬКО названный ящик',
    async () => {
      const beforeB = await unread(boss.page, `?clubId=${clubB}`);
      const beforePersonal = await unread(boss.page, '?scope=personal');

      must(beforeB > 0, 'в ящике клуба Б нечего было гасить — проверка ничего не докажет');
      must(beforePersonal > 0, 'в личном ящике нечего было гасить — проверка ничего не докажет');

      const response = await api(boss.page, 'POST', `/api/notifications/read-all?clubId=${clubA}`, {});

      mustEqual(response.status, 200, `уборка ящика клуба А: ${response.text}`);

      const afterA = await unread(boss.page, `?clubId=${clubA}`);
      const afterB = await unread(boss.page, `?clubId=${clubB}`);
      const afterPersonal = await unread(boss.page, '?scope=personal');

      mustEqual(afterA, 0, 'ящик клуба А не погашен');
      mustEqual(afterB, beforeB, 'уборка в клубе А задела ящик клуба Б');
      mustEqual(afterPersonal, beforePersonal, 'уборка в клубе А задела личный ящик');

      const readInA = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.boss} AND addressee_club_id=${clubA} AND read_at IS NULL;`,
      );

      mustEqual(readInA, 0, 'в базе остались непрочитанные строки клуба А');

      return `А обнулился, Б остался ${afterB}, личный ${afterPersonal}`;
    },
    boss.page,
  );

  await step(
    'адресат/step-8',
    'чужое лицо — отказ, и ни одной чужой строки в ответе',
    async () => {
      const response = await api(boss.page, 'GET', `/api/notifications?clubId=${clubC}`);

      mustEqual(response.status, 403, `чужой ящик ответил ${response.status}`);
      mustEqual(response.body?.error, 'Недостаточно прав', 'текст отказа');
      must(response.body?.data === undefined, 'в отказе приехали данные');
      must(!response.text.includes('addressee'), 'в теле отказа видны строки уведомлений');

      return 'отказ 403 «Недостаточно прав», тело пустое';
    },
    boss.page,
  );

  await step(
    'адресат/step-9',
    'срез всей площадки закрыт правом администратора',
    async () => {
      const response = await api(boss.page, 'GET', '/api/notifications?scope=all');

      must([401, 403].includes(response.status), `?scope=all ответил ${response.status}`);
      mustEqual(response.body?.error, 'Недостаточно прав', 'текст отказа');

      return `отказ ${response.status}`;
    },
    boss.page,
  );

  // Связь адресуется лицу так же, как запись. Приглашение чужого клуба уходит
  // в ящик КАРТОЧКИ, а не в общую кучу её владельца.
  let inviteToTrainerLinkId = null;
  let inviteToTrainerNotificationId = null;

  await step(
    'адресат/step-11',
    'связь и запись раскладываются по РАЗНЫМ ящикам одного человека',
    async () => {
      const baseline = baselineId();
      const invite = await api(mate.page, 'POST', '/api/trainer-club-links', {
        trainerId: trainerA,
        clubId: clubD,
        initiatedBy: 'club',
      });

      mustEqual(invite.status, 201, `приглашение чужого клуба: ${invite.text}`);
      inviteToTrainerLinkId = invite.body?.data?.id;

      const row = db(
        `SELECT id || '|' || coalesce(addressee_club_id::text,'-') || '|' || coalesce(addressee_trainer_id::text,'-') FROM notifications WHERE user_id=${users.boss} AND type='link_requested' AND id > ${baseline};`,
      );

      must(row !== '', 'приглашение не породило уведомления');
      const [id, clubColumn, trainerColumn] = row.split('|');

      inviteToTrainerNotificationId = Number(id);
      mustEqual(clubColumn, '-', 'связь адресована клубу вместо карточки');
      mustEqual(trainerColumn, String(trainerA), 'связь адресована не той карточке');

      const inCard = await inbox(boss.page, `?trainerId=${trainerA}`);
      const inClub = await inbox(boss.page, `?clubId=${clubA}`);

      must(
        inCard.some((item) => item.id === inviteToTrainerNotificationId),
        'в ящике карточки нет адресованной ей связи',
      );
      must(
        !inClub.some((item) => item.id === inviteToTrainerNotificationId),
        'связь карточки видна в ящике клуба',
      );
      must(
        !inCard.some((item) => item.id === firstRequestId),
        'заявка клуба видна в ящике карточки',
      );
      must(
        inClub.some((item) => item.type === 'booking_requested'),
        'в ящике клуба пропали его заявки',
      );

      return `карточка ${trainerA}: связь; клуб ${clubA}: записи — две кучи, а не одна`;
    },
    boss.page,
  );

  await step(
    'адресат/step-12',
    'кабинет лица и личный кабинет показывают РАЗНОЕ',
    async () => {
      await open(boss.page, `${cabinetA}/notifications`, '[data-testid="notifications-filters"]');
      const inCabinet = await renderedIds(boss.page);

      await open(boss.page, '/profile/me/notifications', '[data-testid="notifications-filters"]');
      const inPersonal = await renderedIds(boss.page);

      must(inCabinet.includes(firstRequestId), 'заявки клуба нет в кабинете этого клуба');
      must(
        !inCabinet.includes(personalConfirmedId),
        'личная строка человека показана в кабинете клуба',
      );
      must(inPersonal.includes(personalConfirmedId), 'личной строки нет в личном кабинете');
      must(!inPersonal.includes(firstRequestId), 'заявка клуба показана в личном кабинете');

      return `в кабинете клуба ${inCabinet.length} строк, в личном ${inPersonal.length} — наборы разные`;
    },
    boss.page,
  );

  await step(
    'адресат/step-13',
    '«отметить всё» в кабинете лица не трогает соседние ящики',
    async () => {
      // Ящику клуба А возвращаем непрочитанное: гасить пустое нечего, и проверка
      // без этого зеленела бы, ничего не проверив.
      await book(client.page, aSlots[2]);

      const beforeB = await unread(boss.page, `?clubId=${clubB}`);
      const beforeCard = await unread(boss.page, `?trainerId=${trainerA}`);
      const beforePersonal = await unread(boss.page, '?scope=personal');

      must(beforeB > 0 && beforeCard > 0 && beforePersonal > 0, 'соседние ящики пусты — проверять нечего');

      await open(boss.page, `${cabinetA}/notifications`, '[data-testid="notifications-filters"]');
      const button = await boss.page.$('button:has-text("Отметить всё как прочитанное")');

      must(button !== null, 'кнопки уборки нет, хотя непрочитанное есть');
      await button.click();
      await boss.page.waitForSelector('[role="status"]', { timeout: 10000 });

      const shown = await toasts(boss.page);

      must(
        shown.some((text) => text.includes('Все уведомления отмечены прочитанными')),
        `тоста об уборке нет: ${shown.join(' / ')}`,
      );

      const afterA = await unread(boss.page, `?clubId=${clubA}`);
      const afterB = await unread(boss.page, `?clubId=${clubB}`);
      const afterCard = await unread(boss.page, `?trainerId=${trainerA}`);
      const afterPersonal = await unread(boss.page, '?scope=personal');

      mustEqual(afterA, 0, 'ящик открытого кабинета не погашен');
      mustEqual(afterB, beforeB, 'уборка задела ящик второго клуба');
      mustEqual(afterCard, beforeCard, 'уборка задела ящик карточки тренера');
      mustEqual(afterPersonal, beforePersonal, 'уборка задела личный ящик');

      return `А обнулился, Б ${afterB}, карточка ${afterCard}, личный ${afterPersonal} — целы`;
    },
    boss.page,
  );

  // ===============================================================================
  // notifications.md — Scenario: Bell-icon и dropdown
  // ===============================================================================
  console.log('\n=== notifications.md · Bell-icon и dropdown ===');

  let bellNotificationId = null;

  await step(
    'колокольчик/step-1',
    'у человека без лиц колокольчик в шапке есть',
    async () => {
      await open(client.page, '/', 'header button[aria-label="Уведомления"]');

      const me = await whoAmI(client.page);

      mustEqual((me.faces ?? []).length, 0, 'у испытуемого оказались лица услуг');

      return 'колокольчик виден человеку без единого лица';
    },
    client.page,
  );

  await step(
    'колокольчик/step-2',
    'после решения по записи значок вырос',
    async () => {
      // ⚠️ Уведомление записавшемуся приходит на РЕШЕНИЕ, а не на создание записи.
      const before = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.client} AND read_at IS NULL;`,
      );
      const baseline = baselineId();
      const bookingId = await book(client.page, aSlots[3]);
      const confirm = await api(boss.page, 'POST', `/api/bookings/${bookingId}/confirm`, {});

      mustEqual(confirm.status, 200, `подтверждение владельцем лица: ${confirm.text}`);

      bellNotificationId = Number(
        db(
          `SELECT id FROM notifications WHERE user_id=${users.client} AND type='booking_confirmed' AND id > ${baseline};`,
        ),
      );

      must(Number.isInteger(bellNotificationId), 'подтверждение не дошло до записавшегося');

      await open(client.page, '/', 'header button[aria-label="Уведомления"]');
      await client.page.waitForSelector('[data-testid="notification-bell-badge"]', { timeout: 15000 });

      const badge = Number(
        await client.page.textContent('[data-testid="notification-bell-badge"]'),
      );

      mustEqual(badge, before + 1, 'значок не вырос ровно на одну строку');

      return `значок ${before} → ${badge}, строка ${bellNotificationId}`;
    },
    client.page,
  );

  await step(
    'колокольчик/step-3',
    'в выпадающем списке — тексты словаря, не коды типов',
    async () => {
      const rows = await openBell(client.page);
      const items = rows.map((row) => row.text);

      must(items.length > 0 && items.length <= 5, `в списке ${items.length} строк, ожидалось 1..5`);
      must(
        items.some((text) => text.includes('Бронирование подтверждено')),
        `текста словаря нет: ${items.join(' | ')}`,
      );
      must(
        !items.some((text) => text.includes('booking_confirmed')),
        'в списке показан код типа вместо человеческого текста',
      );

      return `строк ${items.length}, заголовок из словаря на месте`;
    },
    client.page,
  );

  await step(
    'колокольчик/step-4',
    'клик по непрочитанному: пометка, значок, закрытие, переход',
    async () => {
      const badgeBefore = Number(
        await client.page.textContent('[data-testid="notification-bell-badge"]'),
      );

      await client.page.click(`[data-testid="notification-bell-item-${bellNotificationId}"]`);
      await client.page.waitForURL('**/profile/me/notifications', { timeout: 15000 });

      const readAt = db(
        `SELECT coalesce(read_at::text,'-') FROM notifications WHERE id=${bellNotificationId};`,
      );

      must(readAt !== '-', 'уведомление не помечено прочитанным в базе');

      const path = await client.page.evaluate(() => window.location.pathname);

      mustEqual(path, '/profile/me/notifications', 'переход после клика');

      const dropdown = await client.page.$('[data-testid="notification-bell-dropdown"]');

      mustEqual(dropdown, null, 'выпадающий список остался открытым');

      const badgeNode = await client.page.$('[data-testid="notification-bell-badge"]');
      const badgeAfter = badgeNode === null ? 0 : Number(await badgeNode.textContent());

      mustEqual(badgeAfter, badgeBefore - 1, 'значок не убавился на одну строку');

      return `read_at проставлен, значок ${badgeBefore} → ${badgeAfter}, ушли на ${path}`;
    },
    client.page,
  );

  await step(
    'колокольчик/step-5',
    '«Все уведомления» ведут туда же и ничего не помечают',
    async () => {
      const unreadBefore = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.client} AND read_at IS NULL;`,
      );

      await open(client.page, '/', 'header button[aria-label="Уведомления"]');
      await openBell(client.page);
      await client.page.click('[data-testid="notification-bell-dropdown"] a:has-text("Все уведомления")');
      await client.page.waitForURL('**/profile/me/notifications', { timeout: 15000 });

      const unreadAfter = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.client} AND read_at IS NULL;`,
      );

      mustEqual(unreadAfter, unreadBefore, 'переход по ссылке пометил уведомления прочитанными');

      const path = await client.page.evaluate(() => window.location.pathname);

      mustEqual(path, '/profile/me/notifications', 'адрес перехода');

      return `тот же адрес, непрочитанных как было (${unreadAfter})`;
    },
    client.page,
  );

  await step(
    'колокольчик/step-6',
    'у человека колокольчик есть всегда, у служебной записи — нет вовсе',
    async () => {
      // Живые учётки, обе на ЧТЕНИЕ: `alexey` — человек без лиц, `admin` — служебная.
      const guest = await freshContext();

      await loginAs(guest.page, 'alexey@sporthub.local', {});

      const person = await whoAmI(guest.page);

      mustEqual((person.faces ?? []).length, 0, 'у alexey оказались лица услуг');
      await open(guest.page, '/', 'header button[aria-label="Уведомления"]');

      await api(guest.page, 'POST', '/api/auth/logout', {});
      await loginAs(guest.page, 'admin@sporthub.local', { portal: 'service' });

      const admin = await whoAmI(guest.page);

      mustEqual(admin.accountKind, 'admin', 'служебный вход дал не служебную запись');

      await guest.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      // Ждём наполнения стора: без этого «колокольчика нет» сказалось бы и там,
      // где он есть, — то есть шаг зеленел бы по чужой причине.
      await guest.page.waitForSelector('header', { timeout: 15000 });
      await guest.page.waitForTimeout(1500);

      const bell = await guest.page.$('header button[aria-label="Уведомления"]');

      mustEqual(bell, null, 'у служебной записи показан колокольчик');

      await api(guest.page, 'POST', '/api/auth/logout', {});
      await guest.context.close();

      return 'у человека без лиц колокольчик есть, у администратора его нет';
    },
    client.page,
  );

  await step(
    'колокольчик/step-7',
    'у человека с лицами «Все уведомления» ведут в кабинет ЛИЦА',
    async () => {
      await open(boss.page, '/', 'header button[aria-label="Уведомления"]');
      await openBell(boss.page);

      const href = await boss.page.getAttribute(
        '[data-testid="notification-bell-dropdown"] a:has-text("Все уведомления")',
        'href',
      );

      mustEqual(href, `${cabinetA}/notifications`, 'адрес раздела уведомлений в шапке');
      must(/\/profile\/club\/\d+\//.test(href), 'номера лица в пути нет');

      return `ссылка ведёт в ${href} — номер лица стоит в пути`;
    },
    boss.page,
  );

  // ===============================================================================
  // notifications.md — Scenario: NotificationsListPage — вкладки это темы
  // ===============================================================================
  console.log('\n=== notifications.md · Вкладки списка ===');

  // ⚠️ Шаг 36.21 добавил ЧЕТВЁРТУЮ тему — «Модерация» (уведомление модератору
  // о том, что скрытую публикацию исправили). Набор вкладок задан словарём
  // `NOTIFICATION_GROUP_KEYS`, и вкладки — это ТЕМЫ, а не роли получателей
  // (решение шага 35.28a): показываются все, потому что спрятанная вкладка
  // означала бы строки, видимые в «Все» и не отбираемые ничем.
  const TAB_TITLES = ['Все', 'Записи', 'Связи', 'Отзывы', 'Модерация'];

  /** Подписи и счётчики вкладок — прямо с экрана. */
  async function tabs(page) {
    return page.$$eval('[data-testid^="notifications-filter-group-"]', (nodes) =>
      nodes.map((node) => ({
        key: node.getAttribute('data-testid').replace('notifications-filter-group-', ''),
        title: node.textContent.replace(/\d+\s*$/, '').trim(),
        count: Number((node.textContent.match(/(\d+)\s*$/) ?? [0, '0'])[1]),
      })),
    );
  }

  await step(
    'вкладки/step-1',
    'у человека без лиц пять вкладок-тем, и «Связи» среди них',
    async () => {
      await open(client.page, '/profile/me/notifications', '[data-testid="notifications-filters"]');

      const shown = await tabs(client.page);

      mustEqual(
        shown.map((tab) => tab.title).join('|'),
        TAB_TITLES.join('|'),
        'набор вкладок у человека без лиц',
      );
      must(
        !shown.some((tab) => tab.title === 'Дисциплина'),
        'вкладка «Дисциплина» жива, хотя санкции отменены',
      );

      return `вкладки: ${shown.map((tab) => tab.title).join(', ')}`;
    },
    client.page,
  );

  await step(
    'вкладки/step-2',
    'счётчики считают ВСЕ строки ящика, включая адресованные лицу',
    async () => {
      await open(boss.page, `${cabinetA}/notifications`, '[data-testid="notifications-filters"]');

      const shown = await tabs(boss.page);
      const all = shown.find((tab) => tab.key === 'all');
      const booking = shown.find((tab) => tab.key === 'booking');
      const fromDb = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.boss} AND addressee_club_id=${clubA};`,
      );
      const bookingFromDb = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.boss} AND addressee_club_id=${clubA} AND type LIKE 'booking%';`,
      );

      mustEqual(all.count, fromDb, 'счётчик «Все» разошёлся с ящиком лица в базе');
      mustEqual(booking.count, bookingFromDb, 'счётчик «Записи» разошёлся с базой');
      must(fromDb > 0, 'ящик лица пуст — счётчики нечем проверять');

      return `«Все» ${all.count}, «Записи» ${booking.count} — ровно строки ящика лица`;
    },
    boss.page,
  );

  await step(
    'вкладки/step-3',
    'счётчики считаются от полного списка, а не от выбранной вкладки',
    async () => {
      const before = await tabs(boss.page);

      await boss.page.click('[data-testid="notifications-filter-group-booking"]');
      await boss.page.waitForTimeout(300);

      const after = await tabs(boss.page);

      mustEqual(
        JSON.stringify(after.map((tab) => tab.count)),
        JSON.stringify(before.map((tab) => tab.count)),
        'числа во вкладках изменились после смены фильтра',
      );

      const selected = await boss.page.getAttribute(
        '[data-testid="notifications-filter-group-booking"]',
        'aria-selected',
      );

      mustEqual(selected, 'true', 'вкладка не выбралась — сравнивать было нечего');

      return `после выбора «Записи» числа те же: ${after.map((tab) => tab.count).join('/')}`;
    },
    boss.page,
  );

  await step(
    'вкладки/step-4',
    '«Только непрочитанные» убирает прочитанные строки',
    async () => {
      const readIds = db(
        `SELECT id FROM notifications WHERE user_id=${users.boss} AND addressee_club_id=${clubA} AND read_at IS NOT NULL LIMIT 1;`,
      );

      await open(boss.page, `${cabinetA}/notifications`, '[data-testid="notifications-filters"]');

      const withRead = await renderedIds(boss.page);

      must(readIds !== '', 'прочитанных строк нет — фильтру нечего прятать');
      must(withRead.includes(Number(readIds)), 'прочитанная строка не показана без фильтра');

      await boss.page.click('[data-testid="notifications-toggle-unread"]');
      await boss.page.waitForTimeout(300);

      const withoutRead = await renderedIds(boss.page);

      must(!withoutRead.includes(Number(readIds)), 'прочитанная строка осталась под фильтром');
      must(withoutRead.length < withRead.length, 'фильтр ничего не убрал');

      return `было ${withRead.length}, под фильтром ${withoutRead.length}`;
    },
    boss.page,
  );

  await step(
    'вкладки/step-5',
    'строки разложены по корзинам дат',
    async () => {
      const buckets = await boss.page.$$eval('[data-testid^="notifications-bucket-"]', (nodes) =>
        nodes.map((node) => node.getAttribute('data-testid').replace('notifications-bucket-', '')),
      );

      must(buckets.length > 0, 'корзин дат на странице нет вовсе');
      must(buckets.includes('today'), `сегодняшней корзины нет: ${buckets.join(', ')}`);
      must(
        buckets.every((key) => ['today', 'yesterday', 'thisWeek', 'earlier'].includes(key)),
        `посторонняя корзина: ${buckets.join(', ')}`,
      );

      return `корзины: ${buckets.join(', ')}`;
    },
    boss.page,
  );

  await step(
    'вкладки/step-6',
    '«отметить всё» гасит индикаторы и говорит об этом тостом',
    async () => {
      // Непрочитанное для уборки: гасить пустое нечего, и кнопки бы не было вовсе.
      const bookingId = await book(client.page, aSlots[4]);
      const confirm = await api(boss.page, 'POST', `/api/bookings/${bookingId}/confirm`, {});

      mustEqual(confirm.status, 200, `подтверждение: ${confirm.text}`);

      await open(client.page, '/profile/me/notifications', '[data-testid="notifications-filters"]');

      const unreadMarks = await client.page.$$('[data-testid^="notification-item-unread-"]');

      must(unreadMarks.length > 0, 'непрочитанных отметок нет — уборке нечего гасить');

      await client.page.click('button:has-text("Отметить всё как прочитанное")');
      await client.page.waitForSelector('[role="status"]', { timeout: 10000 });

      const shown = await toasts(client.page);

      must(
        shown.some((text) => text.includes('Все уведомления отмечены прочитанными')),
        `тоста нет: ${shown.join(' / ')}`,
      );

      const left = await client.page.$$('[data-testid^="notification-item-unread-"]');
      const inDb = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.client} AND read_at IS NULL;`,
      );

      mustEqual(left.length, 0, 'на экране остались отметки непрочитанного');
      mustEqual(inDb, 0, 'в базе остались непрочитанные строки');

      return 'тост показан, отметок нет ни на экране, ни в базе';
    },
    client.page,
  );

  await step(
    'вкладки/step-7',
    'у человека с лицами набор вкладок тот же',
    async () => {
      await open(boss.page, `${cabinetA}/notifications`, '[data-testid="notifications-filters"]');

      const shown = await tabs(boss.page);

      mustEqual(
        shown.map((tab) => tab.title).join('|'),
        TAB_TITLES.join('|'),
        'набор вкладок в кабинете лица',
      );

      return `те же ${shown.length} вкладки: ${shown.map((tab) => tab.title).join(', ')}`;
    },
    boss.page,
  );

  // ===============================================================================
  // notifications.md — Scenario: Владелец лица получает booking-уведомления
  // ===============================================================================
  console.log('\n=== notifications.md · Владелец лица и записи ===');

  await step(
    'записи/step-1',
    'клиент записывается, своего номера в теле не передавая',
    async () => {
      const before = dbNum(`SELECT count(*) FROM bookings WHERE user_id=${users.client};`);
      // Тело — один только слот: личность сервер берёт из сессии.
      const response = await api(client.page, 'POST', '/api/bookings', { scheduleId: aSlots[5] });

      mustEqual(response.status, 201, `запись: ${response.text}`);
      mustEqual(
        db(`SELECT user_id FROM bookings WHERE id=${response.body?.data?.id};`),
        String(users.client),
        'клиентом записи стал не тот, кто вошёл',
      );
      mustEqual(
        dbNum(`SELECT count(*) FROM bookings WHERE user_id=${users.client};`),
        before + 1,
        'число записей человека',
      );

      return `запись ${response.body?.data?.id} принадлежит вошедшему`;
    },
    client.page,
  );

  await step(
    'записи/step-2',
    'владелец лица видит заявку в колокольчике',
    async () => {
      await open(boss.page, '/', 'header button[aria-label="Уведомления"]');
      await boss.page.waitForSelector('[data-testid="notification-bell-badge"]', { timeout: 15000 });

      const badge = Number(await boss.page.textContent('[data-testid="notification-bell-badge"]'));
      const expected = await unread(boss.page, '');

      mustEqual(badge, expected, 'значок и счётчик сессии разошлись');

      const items = (await openBell(boss.page)).map((row) => row.text);

      must(
        items.some((text) => text.includes('Новая запись на ваш слот')),
        `заголовка заявки нет в списке: ${items.join(' | ')}`,
      );

      return `значок ${badge}, в списке «Новая запись на ваш слот»`;
    },
    boss.page,
  );

  await step(
    'записи/step-3',
    'заявка лежит в кабинете своего клуба, во вкладке «Записи» и в сегодняшней корзине',
    async () => {
      await open(boss.page, `${cabinetA}/notifications`, '[data-testid="notifications-filters"]');
      await boss.page.click('[data-testid="notifications-filter-group-booking"]');
      await boss.page.waitForTimeout(300);

      const today = await boss.page.$$eval(
        '[data-testid="notifications-bucket-today"] [data-testid^="notification-item-"]',
        (nodes) =>
          nodes
            .map((node) => node.getAttribute('data-testid'))
            .filter((id) => /^notification-item-\d+$/.test(id))
            .map((id) => Number(id.replace('notification-item-', ''))),
      );
      const fresh = Number(
        db(
          `SELECT id FROM notifications WHERE user_id=${users.boss} AND addressee_club_id=${clubA} AND type='booking_requested' ORDER BY id DESC LIMIT 1;`,
        ),
      );

      must(today.includes(fresh), `свежей заявки ${fresh} нет в сегодняшней корзине`);

      return `в сегодняшней корзине ${today.length} строк, среди них ${fresh}`;
    },
    boss.page,
  );

  await step(
    'записи/step-4',
    'отмена клиентом приходит в ящик ТОГО клуба, чей был слот',
    async () => {
      const baseline = baselineId();
      const bookingId = Number(
        db(
          `SELECT id FROM bookings WHERE user_id=${users.client} AND schedule_id=${aSlots[5]} ORDER BY id DESC LIMIT 1;`,
        ),
      );
      const response = await api(client.page, 'POST', `/api/bookings/${bookingId}/cancel`, {});

      mustEqual(response.status, 200, `отмена клиентом: ${response.text}`);
      mustEqual(
        db(`SELECT status FROM bookings WHERE id=${bookingId};`),
        'cancelled_by_athlete',
        'отмена записана не как отмена клиентом',
      );

      const row = db(
        `SELECT coalesce(addressee_club_id::text,'-') || '|' || coalesce(addressee_trainer_id::text,'-') FROM notifications WHERE user_id=${users.boss} AND type='booking_cancelled_by_athlete_to_provider' AND id > ${baseline};`,
      );

      mustEqual(row, `${clubA}|-`, 'адресат уведомления об отмене');

      const inA = await inbox(boss.page, `?clubId=${clubA}`);
      const inB = await inbox(boss.page, `?clubId=${clubB}`);
      const cancelInA = inA.some((item) => item.type === 'booking_cancelled_by_athlete_to_provider');
      const cancelInB = inB.some((item) => item.type === 'booking_cancelled_by_athlete_to_provider');

      must(cancelInA, 'отмены нет в ящике клуба, чей был слот');
      must(!cancelInB, 'отмена по слоту клуба А видна в ящике клуба Б');

      return 'отмена ушла в ящик клуба А и только туда';
    },
    boss.page,
  );

  await step(
    'записи/step-5',
    'автоотмена шлёт две строки: человеку-клиенту и в ящик лица',
    async () => {
      const bookingId = await book(client.page, aSlots[6]);
      // Слот придвигается к «через полчаса»: ленивые переходы снимают заявку,
      // которую не подтвердили за час до начала.
      db(
        `UPDATE schedule SET date=(now() + interval '30 minutes')::date, start_time=(now() + interval '30 minutes')::time, end_time=(now() + interval '90 minutes')::time WHERE id=${aSlots[6]};`,
      );

      const baseline = baselineId();
      // Ленивые переходы запускает чтение записей — им ходит любая страница кабинета.
      const bookings = await api(boss.page, 'GET', '/api/bookings');

      mustEqual(bookings.status, 200, `чтение записей: ${bookings.status}`);
      mustEqual(
        db(`SELECT status FROM bookings WHERE id=${bookingId};`),
        'cancelled_by_provider',
        'заявка не снялась автоматически',
      );

      const toClient = db(
        `SELECT coalesce(addressee_club_id::text,'-') FROM notifications WHERE user_id=${users.client} AND type='booking_auto_expired' AND id > ${baseline};`,
      );
      const toFace = db(
        `SELECT coalesce(addressee_club_id::text,'-') FROM notifications WHERE user_id=${users.boss} AND type='booking_auto_expired_to_provider' AND id > ${baseline};`,
      );

      mustEqual(toClient, '-', 'уведомление клиенту адресовано лицу, а не человеку');
      mustEqual(toFace, String(clubA), 'уведомление стороне услуг адресовано не тому лицу');

      return 'клиенту — человеку, стороне услуг — в ящик клуба А';
    },
    boss.page,
  );

  await step(
    'записи/step-6',
    'свою же отмену владелец лица себе не шлёт',
    async () => {
      const bookingId = await book(client.page, aSlots[7]);
      const confirm = await api(boss.page, 'POST', `/api/bookings/${bookingId}/confirm`, {});

      mustEqual(confirm.status, 200, `подтверждение: ${confirm.text}`);

      const baseline = baselineId();
      const cancel = await api(boss.page, 'POST', `/api/bookings/${bookingId}/cancel`, {});

      mustEqual(cancel.status, 200, `отмена владельцем лица: ${cancel.text}`);
      mustEqual(
        db(`SELECT status FROM bookings WHERE id=${bookingId};`),
        'cancelled_by_provider',
        'отмена владельцем записана не стороной услуг',
      );

      const toOwner = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.boss} AND id > ${baseline};`,
      );
      const toClient = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.client} AND type='booking_cancelled_by_provider' AND id > ${baseline};`,
      );

      mustEqual(toOwner, 0, 'инициатор получил письмо о собственном действии');
      mustEqual(toClient, 1, 'клиент не узнал об отмене');

      return 'инициатору ноль строк, клиенту одна';
    },
    boss.page,
  );

  await step(
    'записи/step-7',
    'в настройках кабинета лица три отключаемых типа группы «Записи»',
    async () => {
      await open(
        boss.page,
        `${cabinetA}/settings`,
        '[data-testid="notification-preferences-group-booking"]',
      );

      const providerTypes = [
        'booking_requested',
        'booking_cancelled_by_athlete_to_provider',
        'booking_auto_expired_to_provider',
      ];
      const state = [];

      for (const type of providerTypes) {
        const node = await boss.page.$(`[data-testid="notification-preferences-toggle-${type}"]`);

        must(node !== null, `чекбокса ${type} нет в настройках кабинета лица`);
        const disabled = await node.isDisabled();

        must(!disabled, `чекбокс ${type} заблокирован, хотя тип не обязательный`);
        state.push(type);
      }

      const labels = await boss.page.$$eval(
        '[data-testid="notification-preferences-group-booking"] label',
        (nodes) => nodes.map((node) => node.textContent.trim()),
      );

      for (const title of ['Новая запись на ваш слот', 'Клиент отменил запись', 'Запись снята автоматически']) {
        must(
          labels.some((text) => text.includes(title)),
          `подписи «${title}» нет: ${labels.join(' | ')}`,
        );
      }

      return `три типа стороны услуг на месте и отключаемы: ${state.join(', ')}`;
    },
    boss.page,
  );

  await step(
    'записи/step-8',
    'отключённый тип не появляется НИ В ОДНОМ из трёх мест',
    async () => {
      await open(
        boss.page,
        `${cabinetA}/settings`,
        '[data-testid="notification-preferences-toggle-booking_requested"]',
      );
      await boss.page.click('[data-testid="notification-preferences-toggle-booking_requested"]');
      await boss.page.waitForSelector('[role="status"]', { timeout: 10000 });

      const saved = db(
        `SELECT enabled || '|' || coalesce(face_club_id::text,'-') FROM user_notification_preferences WHERE user_id=${users.boss} AND type='booking_requested';`,
      );

      must(saved.startsWith('f'), `настройка не сохранилась: ${saved || 'строки нет'}`);

      const badgeBefore = await unread(boss.page, '');
      const baseline = baselineId();

      await book(client.page, aSlots[8]);

      const inDb = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.boss} AND type='booking_requested' AND id > ${baseline};`,
      );

      mustEqual(inDb, 1, 'строка не записалась — проверять фильтр не на чем');

      // 1. Лента кабинета лица.
      await open(boss.page, `${cabinetA}/notifications`, '[data-testid="notifications-filters"]');

      const shown = await renderedIds(boss.page);
      const freshId = Number(
        db(
          `SELECT id FROM notifications WHERE user_id=${users.boss} AND type='booking_requested' AND id > ${baseline};`,
        ),
      );

      must(!shown.includes(freshId), 'отключённый тип показан в ленте кабинета');

      // 2. Выпадающий список колокольчика.
      await open(boss.page, '/', 'header button[aria-label="Уведомления"]');

      const rows = await openBell(boss.page);

      // Список обязан быть НЕПУСТЫМ: иначе «этой строки тут нет» верно и тогда,
      // когда в нём нет вообще ничего, — то есть проверка ничего не проверяет.
      must(rows.length > 0, 'выпадающий список пуст — отсутствие строки ничего не доказывает');
      must(
        !rows.some((row) => row.id === freshId),
        'отключённый тип показан в выпадающем списке',
      );

      // 3. Счётчик значка.
      const badgeAfter = await unread(boss.page, '');

      mustEqual(badgeAfter, badgeBefore, 'счётчик вырос на отключённый тип');

      return `строка ${freshId} в базе есть, в ленте/списке/счётчике её нет (ящик настройки: ${saved.split('|')[1]})`;
    },
    boss.page,
  );

  // ===============================================================================
  // notifications.md — Scenario: Редактор preferences
  // ===============================================================================
  console.log('\n=== notifications.md · Настройки уведомлений ===');

  // ⚠️ Тот же словарь, что и у вкладок: шаг 36.21 добавил группу «Модерация».
  const GROUP_TITLES = ['Записи', 'Связи', 'Отзывы', 'Модерация'];

  async function preferenceGroups(page) {
    return page.$$eval('[data-testid^="notification-preferences-group-"]', (nodes) =>
      nodes.map((node) => node.querySelector('h3').textContent.trim()),
    );
  }

  await step(
    'настройки/step-1',
    'у человека без лиц четыре группы настроек, «Дисциплины» нет',
    async () => {
      await open(client.page, '/profile/me/settings', '[data-testid="notification-preferences-editor"]');

      const groups = await preferenceGroups(client.page);

      mustEqual(groups.join('|'), GROUP_TITLES.join('|'), 'набор групп');
      must(!groups.includes('Дисциплина'), 'группа санкций жива, хотя санкции отменены');

      return `группы: ${groups.join(', ')}`;
    },
    client.page,
  );

  await step(
    'настройки/step-2',
    'в группе «Записи» показаны ВСЕ типы, включая приходящие стороне услуг',
    async () => {
      const types = await client.page.$$eval(
        '[data-testid="notification-preferences-group-booking"] input[type="checkbox"]',
        (nodes) => nodes.map((node) => node.getAttribute('data-testid').replace('notification-preferences-toggle-', '')),
      );

      for (const type of [
        'booking_requested',
        'booking_cancelled_by_athlete_to_provider',
        'booking_auto_expired_to_provider',
      ]) {
        must(types.includes(type), `тип ${type} спрятан у человека без лиц: ${types.join(', ')}`);
      }

      mustEqual(types.length, 10, 'число типов в группе «Записи»');

      return `типов в группе: ${types.length}, все на месте`;
    },
    client.page,
  );

  await step(
    'настройки/step-3',
    'обязательных типов ровно два, и они заблокированы',
    async () => {
      const locked = await client.page.$$eval(
        '[data-testid="notification-preferences-editor"] input[type="checkbox"]',
        (nodes) =>
          nodes
            .filter((node) => node.disabled)
            .map((node) => node.getAttribute('data-testid').replace('notification-preferences-toggle-', '')),
      );
      const badges = await client.page.$$eval(
        '[data-testid="notification-preferences-editor"] label',
        (nodes) =>
          nodes.filter((node) => node.textContent.includes('Нельзя отключить')).length,
      );

      mustEqual(
        locked.sort().join('|'),
        'booking_cancelled_by_provider|booking_confirmed',
        'набор обязательных типов',
      );
      mustEqual(badges, 2, 'число плашек «Нельзя отключить»');

      return `заблокированы: ${locked.join(', ')}`;
    },
    client.page,
  );

  await step(
    'настройки/step-4',
    'снятие галочки сохраняется и подтверждается тостом',
    async () => {
      await client.page.click('[data-testid="notification-preferences-toggle-booking_completed"]');
      await client.page.waitForSelector('[role="status"]', { timeout: 10000 });

      const shown = await toasts(client.page);

      must(
        shown.some((text) => text.includes('Настройки уведомлений сохранены')),
        `тоста о сохранении нет: ${shown.join(' / ')}`,
      );

      return 'тост «Настройки уведомлений сохранены»';
    },
    client.page,
  );

  await step(
    'настройки/step-5',
    'после перезагрузки галочка осталась снятой — настройка в базе',
    async () => {
      const stored = db(
        `SELECT enabled FROM user_notification_preferences WHERE user_id=${users.client} AND type='booking_completed' AND face_club_id IS NULL AND face_trainer_id IS NULL;`,
      );

      mustEqual(stored, 'f', 'настройка не доехала до базы');

      await open(client.page, '/profile/me/settings', '[data-testid="notification-preferences-editor"]');
      await client.page.waitForTimeout(700);

      const checked = await client.page.isChecked(
        '[data-testid="notification-preferences-toggle-booking_completed"]',
      );

      mustEqual(checked, false, 'после перезагрузки галочка вернулась');

      return 'в базе enabled=false, на экране галочка снята';
    },
    client.page,
  );

  await step(
    'настройки/step-6',
    'событие отключённого типа записано, но человеку не показано',
    async () => {
      const bookingId = await book(client.page, aSlots[9]);
      const confirm = await api(boss.page, 'POST', `/api/bookings/${bookingId}/confirm`, {});

      mustEqual(confirm.status, 200, `подтверждение: ${confirm.text}`);

      // Слот уводится во вчера: отметка посещения открыта после конца занятия.
      db(
        `UPDATE schedule SET date=(now() - interval '1 day')::date WHERE id=${aSlots[9]};`,
      );

      const baseline = baselineId();
      // Счётчик ДО события: у клиента уже лежат строки прошлых шагов, и «ноль»
      // здесь был бы неправдой. Проверяется, что на отключённый тип он не вырос.
      const counterBefore = await unread(client.page, '');
      const checkIn = await api(boss.page, 'POST', `/api/bookings/${bookingId}/check-in`, {
        outcome: 'completed',
      });

      mustEqual(checkIn.status, 200, `отметка посещения: ${checkIn.text}`);

      const stored = Number(
        db(
          `SELECT id FROM notifications WHERE user_id=${users.client} AND type='booking_completed' AND id > ${baseline};`,
        ),
      );

      must(Number.isInteger(stored), 'событие вообще не записалось — фильтр проверять не на чем');

      const feed = await inbox(client.page, '');
      const counterAfter = await unread(client.page, '');

      must(!feed.some((item) => item.id === stored), 'отключённый тип показан в ленте');
      mustEqual(counterAfter, counterBefore, 'отключённый тип попал в счётчик непрочитанных');

      await open(client.page, '/profile/me/notifications', '[data-testid="notifications-filters"]');

      const shown = await renderedIds(client.page);

      must(!shown.includes(stored), 'отключённый тип показан на странице уведомлений');

      const badgeNode = await client.page.$('[data-testid="notification-bell-badge"]');
      const badge = badgeNode === null ? 0 : Number(await badgeNode.textContent());

      mustEqual(badge, counterBefore, 'значок вырос на отключённый тип');

      return `строка ${stored} в базе есть, ни в ленте, ни на странице, ни в значке её нет (значок ${badge})`;
    },
    client.page,
  );

  await step(
    'настройки/step-7',
    'в кабинете лица те же четыре группы и тот же набор чекбоксов',
    async () => {
      await open(client.page, '/profile/me/settings', '[data-testid="notification-preferences-editor"]');

      const personalTypes = await client.page.$$eval(
        '[data-testid="notification-preferences-editor"] input[type="checkbox"]',
        (nodes) => nodes.map((node) => node.getAttribute('data-testid')).sort(),
      );

      await open(boss.page, `${cabinetA}/settings`, '[data-testid="notification-preferences-editor"]');

      const groups = await preferenceGroups(boss.page);
      const faceTypes = await boss.page.$$eval(
        '[data-testid="notification-preferences-editor"] input[type="checkbox"]',
        (nodes) => nodes.map((node) => node.getAttribute('data-testid')).sort(),
      );

      mustEqual(groups.join('|'), GROUP_TITLES.join('|'), 'набор групп в кабинете лица');
      mustEqual(
        faceTypes.join('|'),
        personalTypes.join('|'),
        'наборы чекбоксов у человека с лицами и без лиц разошлись',
      );

      return `группы те же, чекбоксов ${faceTypes.length} — набор совпал`;
    },
    boss.page,
  );

  await step(
    'настройки/step-8',
    'настройки называются парой «вид+номер»: свои ящики врозь, чужой закрыт',
    async () => {
      const url = `/api/users/${users.boss}/notification-preferences`;

      // Личные настройки и настройки клуба — разные наборы.
      const patchClub = await api(boss.page, 'PATCH', url, {
        faceType: 'club',
        faceId: clubA,
        preferences: { booking_requested: false },
      });

      mustEqual(patchClub.status, 200, `правка настроек клуба А: ${patchClub.text}`);

      const personal = await api(boss.page, 'GET', url);
      const faceA = await api(boss.page, 'GET', `${url}?faceType=club&faceId=${clubA}`);
      const faceB = await api(boss.page, 'GET', `${url}?faceType=club&faceId=${clubB}`);

      mustEqual(faceA.status, 200, 'чтение настроек своего клуба');
      mustEqual(
        faceA.body?.data?.notificationPreferences?.booking_requested,
        false,
        'заглушённый тип не сохранился у клуба А',
      );
      must(
        faceB.body?.data?.notificationPreferences?.booking_requested !== false,
        'глушение клуба А задело клуб Б',
      );
      must(
        JSON.stringify(personal.body?.data?.notificationPreferences) !==
          JSON.stringify(faceA.body?.data?.notificationPreferences),
        'личный набор и набор клуба совпали — ящики не разделены',
      );

      // В базе у строки клуба заполнена колонка лица, у личной — нет.
      const faceRow = db(
        `SELECT coalesce(face_club_id::text,'-') FROM user_notification_preferences WHERE user_id=${users.boss} AND type='booking_requested' AND face_club_id=${clubA};`,
      );

      mustEqual(faceRow, String(clubA), 'настройка лица легла без номера лица');

      // Чужое лицо — отказ, и одинаковый на чтении и на записи.
      const foreignRead = await api(boss.page, 'GET', `${url}?faceType=club&faceId=${clubC}`);
      const foreignWrite = await api(boss.page, 'PATCH', url, {
        faceType: 'club',
        faceId: clubC,
        preferences: { booking_requested: false },
      });

      mustEqual(foreignRead.status, 403, `чтение чужих настроек: ${foreignRead.status}`);
      mustEqual(
        foreignRead.body?.error,
        'Недостаточно прав для чтения настроек этого лица',
        'текст отказа на чтении',
      );
      mustEqual(foreignWrite.status, 403, `запись чужих настроек: ${foreignWrite.status}`);
      mustEqual(
        foreignWrite.body?.error,
        'Недостаточно прав для чтения настроек этого лица',
        'текст отказа на записи',
      );
      mustEqual(
        dbNum(
          `SELECT count(*) FROM user_notification_preferences WHERE user_id=${users.boss} AND face_club_id=${clubC};`,
        ),
        0,
        'настройка чужого лица всё-таки записалась',
      );

      // Половина пары — отказ по разбору.
      const halfPair = await api(boss.page, 'GET', `${url}?faceType=club`);

      mustEqual(halfPair.status, 400, `половина пары ответила ${halfPair.status}`);
      mustEqual(halfPair.body?.error, 'Некорректные данные запроса', 'текст отказа на половине пары');

      return 'наборы врозь, чужое лицо закрыто, половина пары отбита';
    },
    boss.page,
  );

  await step(
    'настройки/step-9',
    'обязательный тип и на лице остаётся обязательным',
    async () => {
      const url = `/api/users/${users.boss}/notification-preferences`;
      const response = await api(boss.page, 'PATCH', url, {
        faceType: 'club',
        faceId: clubA,
        preferences: { booking_confirmed: false },
      });

      mustEqual(response.status, 200, `отказа быть не должно, получено ${response.status}`);
      must(
        response.body?.data?.notificationPreferences?.booking_confirmed !== false,
        'обязательный тип выключился на лице',
      );
      mustEqual(
        dbNum(
          `SELECT count(*) FROM user_notification_preferences WHERE user_id=${users.boss} AND type='booking_confirmed' AND enabled=false;`,
        ),
        0,
        'обязательный тип записан выключенным в базу',
      );

      return 'ключ отброшен молча: ни отказа, ни выключения';
    },
    boss.page,
  );

  // ===============================================================================
  // notifications.md — Scenario: Счётчики сводки и колокольчика
  // ===============================================================================
  console.log('\n=== notifications.md · Счётчики ===');

  // Настройки предыдущего сценария снимаются: иначе числа сводки и значка
  // сходились бы или расходились по причине, к этому сценарию не относящейся.
  psql(`DELETE FROM user_notification_preferences WHERE user_id=${users.boss};`);

  /** Число под подписью KPI сводки кабинета. */
  async function dashboardUnread(page, cabinet) {
    await open(page, `${cabinet}/dashboard`, '[data-testid="provider-dashboard-unread"]');

    const text = await page.textContent('[data-testid="provider-dashboard-unread"]');

    return Number((text.match(/(\d+)/) ?? [0, '0'])[1]);
  }

  await step(
    'счётчики/step-1',
    'сводка кабинета считает непрочитанное ОТКРЫТОГО лица',
    async () => {
      // Ящику клуба А нужно непрочитанное — иначе KPI ноль и сравнивать нечего.
      await book(client.page, aSlots[13]);

      const kpi = await dashboardUnread(boss.page, cabinetA);
      const expected = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.boss} AND addressee_club_id=${clubA} AND read_at IS NULL;`,
      );

      must(expected > 0, 'ящик клуба А пуст — KPI нечем проверять');
      mustEqual(kpi, expected, 'KPI сводки разошёлся с ящиком лица в базе');

      const viaApi = await unread(boss.page, `?clubId=${clubA}`);

      mustEqual(kpi, viaApi, 'число под подписью не совпало с разделом уведомлений этого кабинета');

      return `KPI ${kpi} = ящик клуба А в базе = ${viaApi} по маршруту`;
    },
    boss.page,
  );

  await step(
    'счётчики/step-2',
    'колокольчик считает ВЕСЬ ящик человека, включая личные строки',
    async () => {
      await open(boss.page, '/', 'header button[aria-label="Уведомления"]');
      await boss.page.waitForSelector('[data-testid="notification-bell-badge"]', { timeout: 15000 });

      const badge = Number(await boss.page.textContent('[data-testid="notification-bell-badge"]'));
      const whole = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.boss} AND read_at IS NULL;`,
      );
      const personal = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.boss} AND addressee_club_id IS NULL AND addressee_trainer_id IS NULL AND read_at IS NULL;`,
      );

      must(personal > 0, 'личных непрочитанных нет — «включая личные» проверять нечем');
      mustEqual(badge, whole, 'значок не равен всему ящику человека');

      return `значок ${badge} = весь ящик человека (личных среди них ${personal})`;
    },
    boss.page,
  );

  await step(
    'счётчики/step-3',
    'колокольчик больше сводки ровно на личные строки — расхождение задумано',
    async () => {
      const badge = await unread(boss.page, '');
      const kpi = await dashboardUnread(boss.page, cabinetA);
      const personal = await unread(boss.page, '?scope=personal');
      const cardBox = await unread(boss.page, `?trainerId=${trainerA}`);
      const clubBBox = await unread(boss.page, `?clubId=${clubB}`);

      mustEqual(
        badge,
        kpi + personal + cardBox + clubBBox,
        'значок не раскладывается на ящики лиц и личный',
      );
      must(badge > kpi, 'значок не больше сводки — личные строки в него не попали');

      return `значок ${badge} = сводка ${kpi} + личные ${personal} + карточка ${cardBox} + клуб Б ${clubBBox}`;
    },
    boss.page,
  );

  await step(
    'счётчики/step-4',
    'у владельца двух клубов сводки кабинетов показывают РАЗНЫЕ числа',
    async () => {
      const kpiA = await dashboardUnread(boss.page, cabinetA);
      const kpiB = await dashboardUnread(boss.page, cabinetB);
      const dbA = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.boss} AND addressee_club_id=${clubA} AND read_at IS NULL;`,
      );
      const dbB = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.boss} AND addressee_club_id=${clubB} AND read_at IS NULL;`,
      );

      mustEqual(kpiA, dbA, 'сводка клуба А разошлась со своим ящиком');
      mustEqual(kpiB, dbB, 'сводка клуба Б разошлась со своим ящиком');
      must(kpiA !== kpiB, `оба кабинета показали одно число (${kpiA})`);

      return `клуб А ${kpiA}, клуб Б ${kpiB} — каждый свой ящик`;
    },
    boss.page,
  );

  await step(
    'счётчики/step-5',
    'у человека без лиц лента и колокольчик сходятся',
    async () => {
      // ⚠️ Проверка идёт на человеке БЕЗ лиц намеренно. У владельца лиц личная
      // лента и значок расходятся по построению (шаг 35.47a): страница показывает
      // личный ящик, значок считает весь. Ловушка 7.8 — про отсутствие отбора
      // «тип → роль» в браузере, и видна она там, где ящик один.
      await open(client.page, '/profile/me/notifications', '[data-testid="notifications-filters"]');
      await client.page.waitForTimeout(500);

      const marks = await client.page.$$('[data-testid^="notification-item-unread-"]');
      const badgeNode = await client.page.$('[data-testid="notification-bell-badge"]');
      const badge = badgeNode === null ? 0 : Number(await badgeNode.textContent());
      const fromDb = await unread(client.page, '');

      mustEqual(marks.length, fromDb, 'непрочитанных в ленте не столько, сколько у маршрута');
      mustEqual(badge, fromDb, 'значок разошёлся с лентой');

      return `в ленте ${marks.length}, в значке ${badge} — совпали`;
    },
    client.page,
  );

  // ===============================================================================
  // notifications.md — Scenario: Toast-стек на действиях
  // ===============================================================================
  console.log('\n=== notifications.md · Тосты ===');

  await step(
    'тосты/step-1',
    'действие в разделе записей отвечает тостом внизу справа',
    async () => {
      await open(boss.page, `${cabinetA}/bookings`, '[data-testid="provider-bookings-inbox"]');

      const pendingId = Number(
        db(
          `SELECT id FROM bookings WHERE owner_club_id=${clubA} AND status='pending' ORDER BY id DESC LIMIT 1;`,
        ),
      );

      must(Number.isInteger(pendingId), 'нет ожидающей записи — подтверждать нечего');
      await boss.page.waitForSelector(
        `[data-testid="provider-bookings-action-confirm-${pendingId}"]`,
        { timeout: 15000 },
      );
      await boss.page.click(`[data-testid="provider-bookings-action-confirm-${pendingId}"]`);
      await boss.page.waitForSelector('[role="status"]', { timeout: 10000 });

      const shown = await toasts(boss.page);
      const corner = await boss.page.$eval(
        '[role="status"]',
        (node) => node.parentElement.className,
      );

      must(shown.length > 0, 'тоста нет вовсе');
      must(/bottom-5/.test(corner) && /right-5/.test(corner), `угол не нижний правый: ${corner}`);
      mustEqual(
        db(`SELECT status FROM bookings WHERE id=${pendingId};`),
        'confirmed',
        'тост показан, а действие не выполнилось',
      );

      return `тост «${shown[0]}» внизу справа, запись подтверждена`;
    },
    boss.page,
  );

  await step(
    'тосты/step-2',
    'тост уходит сам примерно через четыре секунды',
    async () => {
      const before = (await toasts(boss.page)).length;

      must(before > 0, 'тоста на экране нет — гаснуть нечему');
      await boss.page.waitForTimeout(4600);

      const after = (await toasts(boss.page)).length;

      mustEqual(after, 0, 'тост не погас за 4.6 секунды');

      return `было ${before}, стало ${after}`;
    },
    boss.page,
  );

  await step(
    'тосты/step-3',
    'три действия подряд дают три тоста в стеке',
    async () => {
      const ids = [];

      for (const index of [10, 11, 12]) {
        await book(client.page, aSlots[index]);
      }

      await open(boss.page, `${cabinetA}/bookings`, '[data-testid="provider-bookings-inbox"]');

      const pending = db(
        `SELECT id FROM bookings WHERE owner_club_id=${clubA} AND status='pending' AND schedule_id IN (${aSlots[10]},${aSlots[11]},${aSlots[12]}) ORDER BY id;`,
      )
        .split('\n')
        .filter(Boolean)
        .map(Number);

      mustEqual(pending.length, 3, 'ожидающих записей не три');

      for (const bookingId of pending) {
        await boss.page.waitForSelector(
          `[data-testid="provider-bookings-action-confirm-${bookingId}"]`,
          { timeout: 15000 },
        );
        await boss.page.click(`[data-testid="provider-bookings-action-confirm-${bookingId}"]`);
        await boss.page.waitForTimeout(250);
        ids.push(bookingId);
      }

      const shown = await toasts(boss.page);

      // Три ЖИВЫХ узла одновременно: ключ у карточки тоста — его номер, и при
      // совпадении номеров React оставил бы на экране меньше трёх.
      mustEqual(shown.length, 3, `тостов на экране ${shown.length}`);
      mustEqual(
        dbNum(`SELECT count(*) FROM bookings WHERE id IN (${ids.join(',')}) AND status='confirmed';`),
        3,
        'подтвердились не все три записи',
      );

      return `три тоста разом: ${shown.join(' | ')}`;
    },
    boss.page,
  );

  // ===============================================================================
  // trainer-club-links.md — Scenario: Своё со своим — сразу подтверждено
  // ===============================================================================
  console.log('\n=== trainer-club-links.md · Своё со своим ===');

  let ownLinkId = null;
  // Отсечка «до создания связи» по номеру последней строки уведомлений: сравнение
  // по времени здесь ненадёжно — у базы и у ответа маршрута разные формы записи даты.
  let linkBaseline = 0;

  await step(
    'своё/step-1',
    'раздел связей открыт в кабинете лица и адрес у него адресный',
    async () => {
      await open(boss.page, `${cabinetA}/links`, '[data-testid="provider-links"]');

      const path = await boss.page.evaluate(() => window.location.pathname);
      const clubSide = await boss.page.$('[data-testid="provider-links-club-side"]');

      mustEqual(path, `${cabinetA}/links`, 'адрес раздела связей');
      must(clubSide !== null, 'секции связей клуба нет на странице');

      return `раздел открыт по адресу ${path}`;
    },
    boss.page,
  );

  await step(
    'своё/step-2',
    'связь своего клуба со своей карточкой создаётся',
    async () => {
      linkBaseline = baselineId();

      const response = await api(boss.page, 'POST', '/api/trainer-club-links', {
        trainerId: trainerA,
        clubId: clubA,
      });

      mustEqual(response.status, 201, `создание связи: ${response.text}`);
      ownLinkId = response.body?.data?.id;
      must(Number.isInteger(ownLinkId), 'номер связи не вернулся');

      return `связь ${ownLinkId} создана`;
    },
    boss.page,
  );

  await step(
    'своё/step-3',
    'связь встала сразу подтверждённой — состояния ожидания не было',
    async () => {
      const row = db(
        `SELECT status || '|' || coalesce(approved_at::text,'-') || '|' || coalesce(approved_by_user_id::text,'-') FROM trainer_club_links WHERE id=${ownLinkId};`,
      );
      const [status, approvedAt, approvedBy] = row.split('|');

      mustEqual(status, 'confirmed', 'статус связи своего со своим');
      must(approvedAt !== '-', 'момент подтверждения не заполнен');
      mustEqual(approvedBy, String(users.boss), 'подтвердивший');

      // Ожидания «не было ни на миг»: журнал знает только запрос, но не решение —
      // отдельного подтверждения не происходило.
      const approveLogs = dbNum(
        `SELECT count(*) FROM logs WHERE entity_type='trainer_club_link' AND entity_id=${ownLinkId} AND action='link_approve';`,
      );

      mustEqual(approveLogs, 0, 'в журнале есть отдельное подтверждение — значит ожидание было');

      return `confirmed, подтвердил ${approvedBy}, отдельного решения не было`;
    },
    boss.page,
  );

  await step(
    'своё/step-4',
    'сторона при владении обеими считается тренерской',
    async () => {
      mustEqual(
        db(`SELECT initiated_by FROM trainer_club_links WHERE id=${ownLinkId};`),
        'trainer',
        'инициатор связи своего со своим',
      );

      return 'initiated_by = trainer';
    },
    boss.page,
  );

  await step(
    'своё/step-5',
    'уведомлений не отправлено ни одного — ни человеку, ни лицам',
    async () => {
      // Отсечка — номер последней строки ДО создания связи: без неё проверка
      // поймала бы приглашение из сценария «Адресат», уже лежащее в ящике карточки.
      const anyLink = dbNum(
        `SELECT count(*) FROM notifications WHERE type LIKE 'link_%' AND id > ${linkBaseline};`,
      );

      mustEqual(anyLink, 0, 'связь своего со своим кого-то уведомила');

      const inClub = await inbox(boss.page, `?clubId=${clubA}`);
      const inCard = await inbox(boss.page, `?trainerId=${trainerA}`);
      const fresh = (items) => items.filter((item) => item.id > linkBaseline);

      mustEqual(fresh(inClub).length, 0, 'ящик клуба получил письмо о собственной связи');
      mustEqual(fresh(inCard).length, 0, 'ящик карточки получил письмо о собственной связи');

      return 'ни в личном ящике, ни в ящиках клуба и карточки — пусто';
    },
    boss.page,
  );

  await step(
    'своё/step-6',
    'связь опубликована одним нажатием: видна на обеих публичных карточках',
    async () => {
      const clubSlug = db(`SELECT slug FROM clubs WHERE id=${clubA};`);
      const trainerSlug = db(`SELECT slug FROM trainers WHERE id=${trainerA};`);
      const trainerName = db(`SELECT name FROM trainers WHERE id=${trainerA};`);
      const clubName = db(`SELECT name FROM clubs WHERE id=${clubA};`);
      const anon = await freshContext();

      await anon.page.goto(`${BASE}/clubs/${encodeURIComponent(clubSlug)}`, {
        waitUntil: 'networkidle',
      });
      const clubHtml = await anon.page.content();

      await anon.page.goto(`${BASE}/trainers/${encodeURIComponent(trainerSlug)}`, {
        waitUntil: 'networkidle',
      });
      const trainerHtml = await anon.page.content();

      // Витрина спрашивается и как данные: «увидел на экране» и «отдано наружу» —
      // разные утверждения, и первое без второго ничего не значит.
      const clubData = await api(anon.page, 'GET', `/api/clubs/${clubA}`);
      const trainerData = await api(anon.page, 'GET', `/api/trainers/${trainerA}`);

      must(
        (clubData.body?.data?.trainers ?? []).some((trainer) => trainer.id === trainerA),
        'в данных клуба нет его тренера',
      );
      must(
        JSON.stringify(trainerData.body?.data ?? {}).includes(`"id":${clubA}`),
        'в данных карточки нет её клуба',
      );
      must(clubHtml.includes(trainerName), 'на карточке клуба нет его тренера');
      must(trainerHtml.includes(clubName), 'на карточке тренера нет его клуба');

      await anon.context.close();

      return 'тренер виден у клуба, клуб виден у тренера — и в данных, и на экране';
    },
    boss.page,
  );

  await step(
    'своё/step-7',
    'разрыв идёт тем же правилом — согласования никто не спрашивал',
    async () => {
      linkBaseline = baselineId();

      const response = await api(boss.page, 'POST', `/api/trainer-club-links/${ownLinkId}/revoke`, {});

      mustEqual(response.status, 200, `разрыв: ${response.text}`);
      mustEqual(
        db(`SELECT status FROM trainer_club_links WHERE id=${ownLinkId};`),
        'revoked',
        'статус после разрыва',
      );

      return 'revoked одним действием';
    },
    boss.page,
  );

  await step(
    'своё/step-8',
    'после разрыва своего со своим не уведомлён никто',
    async () => {
      const rows = dbNum(
        `SELECT count(*) FROM notifications WHERE type='link_revoked' AND id > ${linkBaseline};`,
      );

      mustEqual(rows, 0, 'кто-то получил письмо о собственном разрыве собственной связи');

      const inClub = await inbox(boss.page, `?clubId=${clubA}`);
      const inCard = await inbox(boss.page, `?trainerId=${trainerA}`);

      mustEqual(
        inClub.filter((item) => item.id > linkBaseline).length,
        0,
        'в ящике клуба появилась строка о разрыве',
      );
      mustEqual(
        inCard.filter((item) => item.id > linkBaseline).length,
        0,
        'в ящике карточки появилась строка о разрыве',
      );

      return 'строк link_revoked нет ни в одном ящике';
    },
    boss.page,
  );

  // ===============================================================================
  // trainer-club-links.md — Scenario: Клуб приглашает чужого тренера
  // ===============================================================================
  console.log('\n=== trainer-club-links.md · Клуб приглашает чужого тренера ===');

  let inviteLinkId = null;
  /** Замечание о разделах кабинета — собирается по ходу, попадает в отчёт. */
  let cabinetScopeNote = '';

  await step(
    'приглашение/step-1',
    'клуб опубликован и виден в разделе публикаций своего кабинета',
    async () => {
      await open(boss.page, `${cabinetB}/publications`, '[data-testid="provider-publications"]');

      const html = await boss.page.content();
      const name = db(`SELECT name FROM clubs WHERE id=${clubB};`);

      must(html.includes(name), `публикации не показывают клуб «${name}»`);
      mustEqual(db(`SELECT status FROM clubs WHERE id=${clubB};`), 'published', 'статус клуба');

      return `клуб «${name}» опубликован`;
    },
    boss.page,
  );

  await step(
    'приглашение/step-2',
    'в кабинете клуба есть секция связей со стороны клуба',
    async () => {
      await open(boss.page, `${cabinetB}/links`, '[data-testid="provider-links-club-side"]');

      const clubSide = await boss.page.$('[data-testid="provider-links-club-side"]');
      const trainerSide = await boss.page.$('[data-testid="provider-links-trainer-side"]');

      must(clubSide !== null, 'секции связей клуба нет');

      // Замечание, а не отказ: кабинет адресный, а секции рисуются по ЛИЦАМ
      // ЧЕЛОВЕКА. В кабинете клуба видна и секция карточки тренера.
      if (trainerSide !== null) {
        cabinetScopeNote = 'в кабинете клуба показана и секция «Связи моих тренеров»';
      }

      return `секция клуба на месте${cabinetScopeNote ? `; ${cabinetScopeNote}` : ''}`;
    },
    boss.page,
  );

  await step(
    'приглашение/step-3',
    'кнопка «Пригласить тренера» открывает окно приглашения',
    async () => {
      await boss.page.click('[data-testid="provider-links-invite-button"]');
      await boss.page.waitForSelector('[data-testid="provider-links-invite-modal"]', {
        timeout: 10000,
      });

      return 'окно приглашения открыто';
    },
    boss.page,
  );

  await step(
    'приглашение/step-4',
    'поиск по части имени находит чужую карточку',
    async () => {
      const trainerName = db(`SELECT name FROM trainers WHERE id=${trainerC};`);
      const part = trainerName.split(' ').pop();

      await boss.page.fill('[data-testid="provider-links-invite-search"]', part);
      await boss.page.waitForSelector(
        `[data-testid="provider-links-invite-trainer-option-${trainerC}"]`,
        { timeout: 10000 },
      );

      const own = await boss.page.$(
        `[data-testid="provider-links-invite-trainer-option-${trainerA}"]`,
      );

      mustEqual(own, null, 'в списке приглашения показана своя же карточка');

      return `по «${part}» найдена чужая карточка ${trainerC}, своей в списке нет`;
    },
    boss.page,
  );

  await step(
    'приглашение/step-5',
    'приглашение уходит: 201, pending, «Приглашён вами», инициатору тихо',
    async () => {
      const baseline = baselineId();

      await boss.page.click(`[data-testid="provider-links-invite-trainer-option-${trainerC}"]`);

      const clubOption = await boss.page.$(
        `[data-testid="provider-links-invite-club-option-${clubB}"]`,
      );

      if (clubOption !== null) await clubOption.click();

      await boss.page.click('[data-testid="provider-links-invite-submit"]');
      await boss.page.waitForSelector('[role="status"]', { timeout: 10000 });

      const shown = await toasts(boss.page);

      must(
        shown.some((text) => text.includes('Запрос отправлен')),
        `тост не об успехе: ${shown.join(' / ')}`,
      );

      const row = db(
        `SELECT id || '|' || status || '|' || initiated_by FROM trainer_club_links WHERE trainer_id=${trainerC} AND club_id=${clubB} ORDER BY id DESC LIMIT 1;`,
      );

      must(row !== '', 'связь не создана');
      const [id, status, initiatedBy] = row.split('|');

      inviteLinkId = Number(id);
      mustEqual(status, 'pending', 'статус приглашения');
      mustEqual(initiatedBy, 'club', 'сторона приглашения');

      // Карточка в разделе — с подписью «Приглашён вами», а не «Запрос от тренера».
      await open(boss.page, `${cabinetB}/links`, `[data-testid="provider-links-card-${inviteLinkId}"]`);

      const card = await boss.page.textContent(
        `[data-testid="provider-links-card-${inviteLinkId}"]`,
      );

      must(card.includes('Приглашён вами'), `подпись карточки: ${card}`);
      must(!card.includes('Запрос от тренера'), 'карточка подписана запросом тренера');

      const toInitiator = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.boss} AND type='link_requested' AND id > ${baseline};`,
      );

      mustEqual(toInitiator, 0, 'инициатор получил уведомление о собственном приглашении');

      return `связь ${inviteLinkId}: pending, initiated_by=club, подпись «Приглашён вами», инициатору тихо`;
    },
    boss.page,
  );

  await step(
    'приглашение/step-6',
    'подмена ЧУЖОЙ стороны в теле — отказ, связь не создана',
    async () => {
      const before = dbNum(
        `SELECT count(*) FROM trainer_club_links WHERE trainer_id=${trainerC} AND club_id=${clubA};`,
      );
      const response = await api(boss.page, 'POST', '/api/trainer-club-links', {
        trainerId: trainerC,
        clubId: clubA,
        initiatedBy: 'trainer',
      });

      mustEqual(response.status, 403, `подмена стороны ответила ${response.status}`);
      mustEqual(
        response.body?.error,
        'Недостаточно прав для отправки запроса',
        'текст отказа',
      );
      mustEqual(
        dbNum(
          `SELECT count(*) FROM trainer_club_links WHERE trainer_id=${trainerC} AND club_id=${clubA};`,
        ),
        before,
        'связь всё-таки создалась',
      );

      return 'отказ 403, связи нет';
    },
    boss.page,
  );

  await step(
    'приглашение/step-7',
    'обе стороны чужие — отказ тем же текстом',
    async () => {
      const before = dbNum(
        `SELECT count(*) FROM trainer_club_links WHERE trainer_id=${trainerC} AND club_id=${clubC};`,
      );
      const response = await api(boss.page, 'POST', '/api/trainer-club-links', {
        trainerId: trainerC,
        clubId: clubC,
      });

      mustEqual(response.status, 403, `чужая пара ответила ${response.status}`);
      mustEqual(response.body?.error, 'Недостаточно прав для отправки запроса', 'текст отказа');
      mustEqual(
        dbNum(
          `SELECT count(*) FROM trainer_club_links WHERE trainer_id=${trainerC} AND club_id=${clubC};`,
        ),
        before,
        'связь по чужой паре создалась',
      );

      return 'отказ 403, чужая пара не связана';
    },
    boss.page,
  );

  // ===============================================================================
  // trainer-club-links.md — Scenario: Сторона тренера принимает запрос
  // ===============================================================================
  console.log('\n=== trainer-club-links.md · Сторона тренера принимает ===');

  const cabinetTC = `/profile/trainer/${trainerC}`;

  await step(
    'принятие/step-1',
    'приглашение пришло в ящик КАРТОЧКИ с текстом приглашения от клуба',
    async () => {
      const row = db(
        `SELECT id || '|' || coalesce(addressee_club_id::text,'-') || '|' || coalesce(addressee_trainer_id::text,'-') || '|' || (payload->>'initiatedBy') FROM notifications WHERE user_id=${users.mate} AND type='link_requested' ORDER BY id DESC LIMIT 1;`,
      );

      must(row !== '', 'уведомления о приглашении нет');
      const [id, clubColumn, trainerColumn, initiatedBy] = row.split('|');

      mustEqual(clubColumn, '-', 'приглашение адресовано клубу вместо карточки');
      mustEqual(trainerColumn, String(trainerC), 'приглашение адресовано не той карточке');
      mustEqual(initiatedBy, 'club', 'в полезной нагрузке не та сторона');

      const inCard = await inbox(mate.page, `?trainerId=${trainerC}`);

      must(
        inCard.some((item) => item.id === Number(id)),
        'приглашения нет в ящике карточки',
      );

      await open(mate.page, `${cabinetTC}/notifications`, '[data-testid="notifications-filters"]');

      const text = await mate.page.textContent(`[data-testid="notification-item-${id}"]`);

      must(
        text.includes('Клуб приглашает к сотрудничеству'),
        `заголовок уведомления: ${text.slice(0, 120)}`,
      );
      must(
        text.includes('Клуб предложил вам привязаться'),
        `описание уведомления: ${text.slice(0, 200)}`,
      );

      return `строка ${id} в ящике карточки ${trainerC}, текст приглашения от клуба`;
    },
    mate.page,
  );

  await step(
    'принятие/step-2',
    'в разделе связей карточки — приглашение с решением, а не с отзывом',
    async () => {
      await open(
        mate.page,
        `${cabinetTC}/links`,
        `[data-testid="provider-links-card-${inviteLinkId}"]`,
      );

      const card = await mate.page.textContent(
        `[data-testid="provider-links-card-${inviteLinkId}"]`,
      );
      const approve = await mate.page.$(`[data-testid="provider-links-approve-${inviteLinkId}"]`);
      const reject = await mate.page.$(`[data-testid="provider-links-reject-${inviteLinkId}"]`);
      const cancelOwn = await mate.page.$(
        `[data-testid="provider-links-cancel-own-${inviteLinkId}"]`,
      );

      must(card.includes('Приглашение от клуба'), `подпись карточки: ${card}`);
      must(!card.includes('Мой запрос'), 'карточка подписана своим запросом');
      must(approve !== null, 'кнопки «Подтвердить» нет');
      must(reject !== null, 'кнопки «Отклонить» нет');
      mustEqual(cancelOwn, null, 'у приглашения показана кнопка «Отозвать»');

      return 'подпись «Приглашение от клуба», кнопки решения на месте';
    },
    mate.page,
  );

  await step(
    'принятие/step-3',
    'подтверждение противоположной стороной: статус, вкладка, ответ инициатору',
    async () => {
      const baseline = baselineId();

      await mate.page.click(`[data-testid="provider-links-approve-${inviteLinkId}"]`);
      await mate.page.waitForSelector('[role="status"]', { timeout: 10000 });

      const row = db(
        `SELECT status || '|' || coalesce(approved_by_user_id::text,'-') FROM trainer_club_links WHERE id=${inviteLinkId};`,
      );

      mustEqual(row, `confirmed|${users.mate}`, 'статус и подтвердивший');

      // Карточка переехала во вкладку подтверждённых.
      await open(mate.page, `${cabinetTC}/links`, '[data-testid="provider-links-trainer-side"]');
      await mate.page.click('[data-testid="provider-links-trainer-tab-confirmed"]');
      await mate.page.waitForTimeout(300);

      const inConfirmed = await mate.page.$(
        `[data-testid="provider-links-card-${inviteLinkId}"]`,
      );

      must(inConfirmed !== null, 'карточка не появилась во вкладке подтверждённых');

      const answer = db(
        `SELECT coalesce(addressee_club_id::text,'-') || '|' || (payload->>'initiatedBy') || '|' || id FROM notifications WHERE user_id=${users.boss} AND type='link_approved' AND id > ${baseline};`,
      );

      must(answer !== '', 'инициатор не получил ответа на приглашение');
      const [clubColumn, initiatedBy, notificationId] = answer.split('|');

      mustEqual(clubColumn, String(clubB), 'ответ пришёл не в ящик клуба-инициатора');
      mustEqual(initiatedBy, 'club', 'в полезной нагрузке не та сторона');

      await open(boss.page, `${cabinetB}/notifications`, '[data-testid="notifications-filters"]');

      const text = await boss.page.textContent(
        `[data-testid="notification-item-${notificationId}"]`,
      );

      must(text.includes('Тренер принял приглашение'), `заголовок ответа: ${text.slice(0, 120)}`);
      must(!text.includes('Клуб подтвердил связь'), 'заголовок взят от другой стороны');

      return `confirmed, ответ ${notificationId} в ящике клуба ${clubB} с текстом «Тренер принял приглашение»`;
    },
    mate.page,
  );

  await step(
    'принятие/step-3a',
    'инициатор не может подтвердить собственное приглашение чужому тренеру',
    async () => {
      const invite = await api(boss.page, 'POST', '/api/trainer-club-links', {
        trainerId: trainerC,
        clubId: clubA,
        initiatedBy: 'club',
      });

      mustEqual(invite.status, 201, `второе приглашение: ${invite.text}`);

      const linkId = invite.body?.data?.id;
      const response = await api(boss.page, 'POST', `/api/trainer-club-links/${linkId}/approve`, {});

      mustEqual(response.status, 403, `подтверждение инициатором ответило ${response.status}`);
      mustEqual(
        response.body?.error,
        'Недостаточно прав для подтверждения связи',
        'текст отказа',
      );
      mustEqual(
        db(`SELECT status FROM trainer_club_links WHERE id=${linkId};`),
        'pending',
        'связь всё-таки подтвердилась',
      );

      return `отказ 403, связь ${linkId} осталась pending`;
    },
    boss.page,
  );

  await step(
    'принятие/step-4',
    'на публичной странице клуба появился принявший тренер',
    async () => {
      const slug = db(`SELECT slug FROM clubs WHERE id=${clubB};`);
      const name = db(`SELECT name FROM trainers WHERE id=${trainerC};`);
      const anon = await freshContext();

      await anon.page.goto(`${BASE}/clubs/${encodeURIComponent(slug)}`, { waitUntil: 'networkidle' });

      const html = await anon.page.content();
      const data = await api(anon.page, 'GET', `/api/clubs/${clubB}`);

      await anon.context.close();

      must(
        (data.body?.data?.trainers ?? []).some((trainer) => trainer.id === trainerC),
        'в данных клуба нет принявшего тренера',
      );
      must(html.includes(name), `на странице клуба нет тренера «${name}»`);

      return `тренер «${name}» показан у клуба`;
    },
    boss.page,
  );

  await step(
    'принятие/step-5',
    'на публичной странице тренера появился клуб',
    async () => {
      const slug = db(`SELECT slug FROM trainers WHERE id=${trainerC};`);
      const name = db(`SELECT name FROM clubs WHERE id=${clubB};`);
      const anon = await freshContext();

      await anon.page.goto(`${BASE}/trainers/${encodeURIComponent(slug)}`, {
        waitUntil: 'networkidle',
      });

      const html = await anon.page.content();

      await anon.context.close();

      must(html.includes(name), `на странице тренера нет клуба «${name}»`);

      return `клуб «${name}» показан у тренера`;
    },
    mate.page,
  );

  // ===============================================================================
  // trainer-club-links.md — Scenario: Отказ от запроса
  // ===============================================================================
  console.log('\n=== trainer-club-links.md · Отказ ===');

  let rejectedLinkId = null;
  let sparePendingId = null;

  await step(
    'отказ/step-1',
    'сторона решения отклоняет приглашение клуба',
    async () => {
      rejectedLinkId = Number(
        db(
          `SELECT id FROM trainer_club_links WHERE trainer_id=${trainerC} AND club_id=${clubA} AND status='pending' ORDER BY id DESC LIMIT 1;`,
        ),
      );

      must(Number.isInteger(rejectedLinkId), 'нет ожидающего приглашения — отклонять нечего');

      await open(
        mate.page,
        `${cabinetTC}/links`,
        `[data-testid="provider-links-reject-${rejectedLinkId}"]`,
      );
      await mate.page.click(`[data-testid="provider-links-reject-${rejectedLinkId}"]`);
      await mate.page.waitForSelector('[role="status"]', { timeout: 10000 });

      const shown = await toasts(mate.page);

      must(
        shown.some((text) => text.includes('Запрос отклонён')),
        `тост не об отказе: ${shown.join(' / ')}`,
      );

      return `связь ${rejectedLinkId} отклонена из раздела связей`;
    },
    mate.page,
  );

  await step(
    'отказ/step-2',
    'статус rejected, отклонивший записан, гостю связь не отдаётся',
    async () => {
      const row = db(
        `SELECT status || '|' || coalesce(rejected_by_user_id::text,'-') FROM trainer_club_links WHERE id=${rejectedLinkId};`,
      );

      mustEqual(row, `rejected|${users.mate}`, 'статус и отклонивший');

      const anon = await freshContext();
      const guest = await api(anon.page, 'GET', `/api/trainer-club-links?clubId=${clubA}`);

      await anon.context.close();

      mustEqual(guest.status, 200, 'публичная выдача связей');
      must(
        !(guest.body?.data ?? []).some((link) => link.id === rejectedLinkId),
        'отклонённая связь видна гостю',
      );
      must(
        (guest.body?.data ?? []).every((link) => link.status === 'confirmed'),
        'гостю отданы неподтверждённые связи',
      );

      return `rejected, отклонил ${users.mate}, гость видит только подтверждённые`;
    },
    mate.page,
  );

  await step(
    'отказ/step-3',
    'инициатору пришёл отказ с текстом стороны тренера',
    async () => {
      const row = db(
        `SELECT id || '|' || coalesce(addressee_club_id::text,'-') || '|' || (payload->>'initiatedBy') FROM notifications WHERE user_id=${users.boss} AND type='link_rejected' ORDER BY id DESC LIMIT 1;`,
      );

      must(row !== '', 'инициатор не узнал об отказе');
      const [id, clubColumn, initiatedBy] = row.split('|');

      mustEqual(clubColumn, String(clubA), 'отказ пришёл не в ящик клуба-инициатора');
      mustEqual(initiatedBy, 'club', 'в полезной нагрузке не та сторона');

      await open(boss.page, `${cabinetA}/notifications`, '[data-testid="notifications-filters"]');

      const text = await boss.page.textContent(`[data-testid="notification-item-${id}"]`);

      must(text.includes('Тренер отклонил приглашение'), `заголовок: ${text.slice(0, 120)}`);
      must(!text.includes('Клуб отклонил связь'), 'заголовок взят от другой стороны');

      return `строка ${id} в ящике клуба ${clubA}, текст «Тренер отклонил приглашение»`;
    },
    boss.page,
  );

  await step(
    'отказ/step-4',
    'зеркальный случай: клуб отклоняет запрос тренера — текст меняется',
    async () => {
      const request = await api(boss.page, 'POST', '/api/trainer-club-links', {
        trainerId: trainerA,
        clubId: clubC,
        initiatedBy: 'trainer',
      });

      mustEqual(request.status, 201, `запрос тренера: ${request.text}`);

      const linkId = request.body?.data?.id;
      const baseline = baselineId();
      const reject = await api(mate.page, 'POST', `/api/trainer-club-links/${linkId}/reject`, {});

      mustEqual(reject.status, 200, `отказ клуба: ${reject.text}`);
      mustEqual(
        db(`SELECT status FROM trainer_club_links WHERE id=${linkId};`),
        'rejected',
        'статус после отказа клуба',
      );

      const row = db(
        `SELECT id || '|' || coalesce(addressee_trainer_id::text,'-') || '|' || (payload->>'initiatedBy') FROM notifications WHERE user_id=${users.boss} AND type='link_rejected' AND id > ${baseline};`,
      );

      must(row !== '', 'сторона тренера не узнала об отказе');
      const [id, trainerColumn, initiatedBy] = row.split('|');

      mustEqual(trainerColumn, String(trainerA), 'отказ пришёл не в ящик карточки-инициатора');
      mustEqual(initiatedBy, 'trainer', 'в полезной нагрузке не та сторона');

      await open(boss.page, `${cabinetTA}/notifications`, '[data-testid="notifications-filters"]');

      const text = await boss.page.textContent(`[data-testid="notification-item-${id}"]`);

      must(text.includes('Клуб отклонил связь'), `заголовок: ${text.slice(0, 120)}`);

      return `строка ${id} в ящике карточки ${trainerA}, текст «Клуб отклонил связь»`;
    },
    boss.page,
  );

  await step(
    'отказ/step-5',
    'инициатор не может отклонить собственную заявку',
    async () => {
      const invite = await api(boss.page, 'POST', '/api/trainer-club-links', {
        trainerId: trainerC,
        clubId: clubA,
        initiatedBy: 'club',
      });

      mustEqual(invite.status, 201, `новое приглашение: ${invite.text}`);
      sparePendingId = invite.body?.data?.id;

      const response = await api(
        boss.page,
        'POST',
        `/api/trainer-club-links/${sparePendingId}/reject`,
        {},
      );

      mustEqual(response.status, 403, `отказ инициатора ответил ${response.status}`);
      mustEqual(response.body?.error, 'Недостаточно прав для отказа', 'текст отказа');
      mustEqual(
        db(`SELECT status FROM trainer_club_links WHERE id=${sparePendingId};`),
        'pending',
        'связь всё-таки отклонилась',
      );

      return `отказ 403, связь ${sparePendingId} осталась pending`;
    },
    boss.page,
  );

  // ===============================================================================
  // trainer-club-links.md — Scenario: Revoke связи с warning-модалкой
  // ===============================================================================
  console.log('\n=== trainer-club-links.md · Разрыв связи ===');

  let attachedOfferingId = null;
  /** Отсечка перед разрывом: строки о нём отличаются от строк прошлых сценариев. */
  let revokeBaseline = 0;

  await step(
    'разрыв/step-1',
    'подготовка: на подтверждённой связи висит услуга',
    async () => {
      attachedOfferingId = Number(
        db(`SELECT id FROM offerings WHERE owner_trainer_id=${trainerC} ORDER BY id LIMIT 1;`),
      );

      must(Number.isInteger(attachedOfferingId), 'у карточки нет ни одной услуги');
      db(
        `UPDATE offerings SET trainer_club_link_id=${inviteLinkId}, venue_club_id=${clubB} WHERE id=${attachedOfferingId};`,
      );

      const attached = dbNum(
        `SELECT count(*) FROM offerings WHERE trainer_club_link_id=${inviteLinkId};`,
      );

      mustEqual(attached, 1, 'на связи оказалось не одна услуга');
      mustEqual(
        db(`SELECT status FROM trainer_club_links WHERE id=${inviteLinkId};`),
        'confirmed',
        'связь для разрыва не подтверждена',
      );

      return `услуга ${attachedOfferingId} привязана к связи ${inviteLinkId}`;
    },
    boss.page,
  );

  await step(
    'разрыв/step-2',
    'окно предупреждения считает услуги, а не показывает ноль',
    async () => {
      await open(boss.page, `${cabinetB}/links`, '[data-testid="provider-links-club-side"]');
      await boss.page.click('[data-testid="provider-links-club-tab-confirmed"]');
      await boss.page.waitForSelector(`[data-testid="provider-links-revoke-${inviteLinkId}"]`, {
        timeout: 10000,
      });
      await boss.page.click(`[data-testid="provider-links-revoke-${inviteLinkId}"]`);
      await boss.page.waitForSelector('[data-testid="provider-links-revoke-warning-modal"]', {
        timeout: 10000,
      });

      const text = await boss.page.textContent(
        '[data-testid="provider-links-revoke-warning-modal"]',
      );

      must(
        text.includes('После разрыва связи 1 услуг'),
        `текст предупреждения: ${text.slice(0, 200)}`,
      );
      must(!text.includes('связи 0 услуг'), 'счётчик услуг нулевой — предупреждение пустое');

      return 'предупреждение назвало ровно одну услугу';
    },
    boss.page,
  );

  await step(
    'разрыв/step-3',
    'после подтверждения связь разорвана, а услуга стала частной',
    async () => {
      revokeBaseline = baselineId();

      await boss.page.click('[data-testid="provider-links-revoke-warning-confirm"]');
      await boss.page.waitForSelector('[role="status"]', { timeout: 10000 });

      mustEqual(
        db(`SELECT status FROM trainer_club_links WHERE id=${inviteLinkId};`),
        'revoked',
        'статус связи после разрыва',
      );
      mustEqual(
        db(
          `SELECT coalesce(trainer_club_link_id::text,'-') FROM offerings WHERE id=${attachedOfferingId};`,
        ),
        '-',
        'услуга осталась привязанной к разорванной связи',
      );

      const slug = db(`SELECT slug FROM trainers WHERE id=${trainerC};`);
      const clubName = db(`SELECT name FROM clubs WHERE id=${clubB};`);
      const anon = await freshContext();

      await anon.page.goto(`${BASE}/trainers/${encodeURIComponent(slug)}`, {
        waitUntil: 'networkidle',
      });

      const html = await anon.page.content();

      await anon.context.close();

      must(!html.includes(clubName), `на странице тренера остался клуб «${clubName}»`);

      return 'связь revoked, услуга частная, клуб с публичной страницы ушёл';
    },
    boss.page,
  );

  await step(
    'разрыв/step-4',
    'о разрыве узнала вторая сторона и только она',
    async () => {
      const toOther = db(
        `SELECT coalesce(addressee_trainer_id::text,'-') FROM notifications WHERE user_id=${users.mate} AND type='link_revoked' AND id > ${revokeBaseline};`,
      );
      const toRevoker = dbNum(
        `SELECT count(*) FROM notifications WHERE user_id=${users.boss} AND type='link_revoked' AND id > ${revokeBaseline};`,
      );

      mustEqual(toOther, String(trainerC), 'вторая сторона узнала не в ящик своего лица');
      mustEqual(toRevoker, 0, 'разорвавшая сторона получила письмо о собственном действии');

      const inCard = await inbox(mate.page, `?trainerId=${trainerC}`);

      must(
        inCard.some((item) => item.type === 'link_revoked'),
        'строки о разрыве нет в ящике карточки',
      );

      return `link_revoked в ящике карточки ${trainerC}, разорвавшему — ничего`;
    },
    mate.page,
  );

  await step(
    'разрыв/step-5',
    'посторонний связь не рвёт',
    async () => {
      const response = await api(
        client.page,
        'POST',
        `/api/trainer-club-links/${sparePendingId}/revoke`,
        {},
      );

      mustEqual(response.status, 403, `посторонний получил ${response.status}`);
      mustEqual(response.body?.error, 'Недостаточно прав для разрыва связи', 'текст отказа');
      mustEqual(
        db(`SELECT status FROM trainer_club_links WHERE id=${sparePendingId};`),
        'pending',
        'связь тронута посторонним',
      );

      return 'отказ 403, связь на месте';
    },
    client.page,
  );

  // ===============================================================================
  // trainer-club-links.md — Scenario: Запрос со стороны тренера к чужому клубу
  // ===============================================================================
  console.log('\n=== trainer-club-links.md · Запрос тренера к чужому клубу ===');

  await step(
    'запрос/step-1',
    'в кабинете карточки есть кнопка запроса и она открывает окно',
    async () => {
      await open(boss.page, `${cabinetTA}/links`, '[data-testid="provider-links-trainer-side"]');

      const label = await boss.page.textContent('[data-testid="provider-links-request-button"]');

      await boss.page.click('[data-testid="provider-links-request-button"]');
      await boss.page.waitForSelector('[data-testid="provider-links-request-modal"]', {
        timeout: 10000,
      });

      return `окно открыто кнопкой «${label.trim()}»`;
    },
    boss.page,
  );

  await step(
    'запрос/step-2',
    'в списке только ЧУЖИЕ клубы без действующей связи',
    async () => {
      const own = await boss.page.$(`[data-testid="provider-links-request-club-option-${clubA}"]`);
      const foreign = await boss.page.$(
        `[data-testid="provider-links-request-club-option-${clubC}"]`,
      );
      const busy = await boss.page.$(`[data-testid="provider-links-request-club-option-${clubD}"]`);

      mustEqual(own, null, 'в списке чужих клубов показан свой');
      must(foreign !== null, 'чужого свободного клуба нет в списке');
      mustEqual(busy, null, 'в списке клуб, с которым уже есть действующая связь');

      return 'свой клуб и клуб с действующей связью в списке не показаны';
    },
    boss.page,
  );

  let requestLinkId = null;

  await step(
    'запрос/step-3',
    'запрос уходит стороной тренера и встаёт в ожидание',
    async () => {
      const trainerOption = await boss.page.$(
        `[data-testid="provider-links-request-trainer-option-${trainerA}"]`,
      );

      if (trainerOption !== null) await trainerOption.click();

      await boss.page.click(`[data-testid="provider-links-request-club-option-${clubC}"]`);
      await boss.page.click('[data-testid="provider-links-request-submit"]');
      await boss.page.waitForSelector('[role="status"]', { timeout: 10000 });

      const shown = await toasts(boss.page);

      must(
        shown.some((text) => text.includes('Запрос отправлен')),
        `тост не об успехе: ${shown.join(' / ')}`,
      );

      const row = db(
        `SELECT id || '|' || status || '|' || initiated_by FROM trainer_club_links WHERE trainer_id=${trainerA} AND club_id=${clubC} ORDER BY id DESC LIMIT 1;`,
      );
      const [id, status, initiatedBy] = row.split('|');

      requestLinkId = Number(id);
      mustEqual(status, 'pending', 'статус запроса');
      mustEqual(initiatedBy, 'trainer', 'сторона запроса');

      return `связь ${requestLinkId}: pending, initiated_by=trainer`;
    },
    boss.page,
  );

  await step(
    'запрос/step-4',
    'владелец клуба получил запрос в ящик СВОЕГО клуба и может решить',
    async () => {
      const row = db(
        `SELECT id || '|' || coalesce(addressee_club_id::text,'-') || '|' || (payload->>'initiatedBy') FROM notifications WHERE user_id=${users.mate} AND type='link_requested' ORDER BY id DESC LIMIT 1;`,
      );

      must(row !== '', 'владелец клуба не узнал о запросе');
      const [id, clubColumn, initiatedBy] = row.split('|');

      mustEqual(clubColumn, String(clubC), 'запрос пришёл не в ящик названного клуба');
      mustEqual(initiatedBy, 'trainer', 'в полезной нагрузке не та сторона');

      const inClub = await inbox(mate.page, `?clubId=${clubC}`);

      must(
        inClub.some((item) => item.id === Number(id)),
        'запроса нет в ящике клуба',
      );

      const approve = await api(
        mate.page,
        'POST',
        `/api/trainer-club-links/${requestLinkId}/approve`,
        {},
      );

      mustEqual(approve.status, 200, `подтверждение клубом: ${approve.text}`);
      mustEqual(
        db(`SELECT status FROM trainer_club_links WHERE id=${requestLinkId};`),
        'confirmed',
        'связь не подтвердилась',
      );

      return `строка ${id} в ящике клуба ${clubC}, поток подтверждения проходит`;
    },
    mate.page,
  );

  // ===============================================================================
  // Дополнительные проверки — ЗА ПРЕДЕЛАМИ обоих чек-листов.
  //
  // Чек-листы проверяют настройки на лицо на уровне маршрута (шаг 35.29) и раздел
  // связей на уровне адреса (шаг 35.31). Здесь спрашивается то, ради чего это
  // делалось: доходит ли разделение до браузера и до самой ленты. Это ровно тот
  // вопрос, которым фаза 34 находила дефекты пачками, — «серверная часть написана
  // и покрыта, а вызова из браузера нет ни одного».
  // ===============================================================================
  console.log('\n=== Дополнительные проверки ===');

  await step(
    'доп/1',
    'настройки, изменённые В КАБИНЕТЕ ЛИЦА, ложатся в ящик ЭТОГО лица',
    async () => {
      psql(`DELETE FROM user_notification_preferences WHERE user_id=${users.boss};`);

      await open(
        boss.page,
        `${cabinetA}/settings`,
        '[data-testid="notification-preferences-toggle-booking_requested"]',
      );
      await boss.page.click('[data-testid="notification-preferences-toggle-booking_requested"]');
      await boss.page.waitForSelector('[role="status"]', { timeout: 10000 });

      const rows = db(
        `SELECT type || '=' || enabled || '@' || coalesce(face_club_id::text,'личный') FROM user_notification_preferences WHERE user_id=${users.boss} ORDER BY type;`,
      );
      const forFace = dbNum(
        `SELECT count(*) FROM user_notification_preferences WHERE user_id=${users.boss} AND face_club_id=${clubA};`,
      );

      must(
        forFace > 0,
        `кабинет клуба ${clubA} записал настройки НЕ в ящик лица: ${rows.replace(/\n/g, '; ')}`,
      );

      return `настройки легли в ящик клуба ${clubA}`;
    },
    boss.page,
  );

  await step(
    'доп/2',
    'заглушённый У ЛИЦА тип не показывается в ящике этого лица',
    async () => {
      psql(`DELETE FROM user_notification_preferences WHERE user_id=${users.boss};`);

      const url = `/api/users/${users.boss}/notification-preferences`;
      const patch = await api(boss.page, 'PATCH', url, {
        faceType: 'club',
        faceId: clubA,
        preferences: { booking_requested: false },
      });

      mustEqual(patch.status, 200, `глушение типа у лица: ${patch.text}`);
      mustEqual(
        patch.body?.data?.notificationPreferences?.booking_requested,
        false,
        'настройка лица не сохранилась — проверять фильтр не на чем',
      );

      const before = await unread(boss.page, `?clubId=${clubA}`);
      const baseline = baselineId();

      // Записывается ДРУГОЙ человек: у клиента на этом слоте активная запись уже есть.
      await book(mate.page, aSlots[0]);

      const fresh = Number(
        db(
          `SELECT id FROM notifications WHERE user_id=${users.boss} AND type='booking_requested' AND id > ${baseline};`,
        ),
      );

      must(Number.isInteger(fresh), 'уведомление не записалось — проверять фильтр не на чем');

      const feed = await inbox(boss.page, `?clubId=${clubA}`);
      const after = await unread(boss.page, `?clubId=${clubA}`);

      must(
        !feed.some((item) => item.id === fresh),
        `строка ${fresh} заглушённого у лица типа показана в ящике клуба ${clubA}`,
      );
      mustEqual(after, before, 'счётчик лица вырос на заглушённый у этого лица тип');

      return `тип заглушён у клуба ${clubA} — ни в ленте, ни в счётчике`;
    },
    boss.page,
  );

  await step(
    'доп/3',
    'раздел связей кабинета лица говорит только про ЭТО лицо',
    async () => {
      await open(boss.page, `${cabinetB}/links`, '[data-testid="provider-links-club-side"]');

      const trainerSide = await boss.page.$('[data-testid="provider-links-trainer-side"]');

      await boss.page.click('[data-testid="provider-links-invite-button"]');
      await boss.page.waitForSelector('[data-testid="provider-links-invite-modal"]', {
        timeout: 10000,
      });

      const clubOptions = await boss.page.$$eval(
        '[data-testid^="provider-links-invite-club-option-"]',
        (nodes) =>
          nodes.map((node) =>
            Number(node.getAttribute('data-testid').replace('provider-links-invite-club-option-', '')),
          ),
      );

      // Обе половины собираются разом: иначе первая же остановила бы шаг,
      // и о второй в отчёте не было бы ни слова.
      const problems = [];

      if (trainerSide !== null) problems.push('показана секция «Связи моих тренеров»');

      const foreignOptions = clubOptions.filter((id) => id !== clubB);

      if (foreignOptions.length > 0) {
        problems.push(`окно приглашения предлагает и другие клубы человека: ${foreignOptions.join(', ')}`);
      }

      mustEqual(problems.length, 0, `кабинет клуба ${clubB}: ${problems.join('; ')}`);

      return 'секция и окно приглашения ограничены открытым лицом';
    },
    boss.page,
  );

  await boss.context.close();
  await client.context.close();
  await mate.context.close();
  await shutdown();

  const pass = results.filter((entry) => entry.status === 'pass').length;
  const fail = results.filter((entry) => entry.status === 'fail').length;
  const skipped = results.filter((entry) => entry.status === 'skip').length;

  const byList = (prefixes) =>
    results.filter((entry) => prefixes.some((prefix) => entry.id.startsWith(prefix)));
  const notificationsList = byList(['колокольчик/', 'вкладки/', 'адресат/', 'настройки/', 'записи/', 'счётчики/', 'тосты/']);
  const linksList = byList(['своё/', 'приглашение/', 'принятие/', 'отказ/', 'разрыв/', 'запрос/']);
  const extraList = byList(['доп/']);
  const score = (entries) =>
    `${entries.filter((entry) => entry.status === 'pass').length} из ${entries.length} (упало ${entries.filter((entry) => entry.status === 'fail').length}, не прогонялось ${entries.filter((entry) => entry.status === 'skip').length})`;

  console.log(`\nnotifications.md: ${score(notificationsList)}`);
  console.log(`trainer-club-links.md: ${score(linksList)}`);
  console.log(`дополнительные проверки: ${score(extraList)}`);
  console.log(`Итог: ${pass} прошло, ${fail} упало, ${skipped} не прогонялось.`);

  if (cabinetScopeNote !== '') console.log(`Замечание: ${cabinetScopeNote}.`);

  fs.writeFileSync(
    '/tmp/e2e-notifications-links.json',
    JSON.stringify({ notifications: notificationsList, links: linksList, extra: extraList }, null, 2),
  );

  // Возвращаются только падения чек-листов: дополнительные проверки — это
  // отдельный разговор, и их красный не должен выглядеть как красный чек-листа.
  return notificationsList.concat(linksList).filter((entry) => entry.status === 'fail').length;
}

let code = 2;

try {
  code = (await main()) > 0 ? 1 : 0;
} catch (error) {
  console.error('прогон прерван:', error);
  await shutdown();
} finally {
  // ⚠️ Уборка ВСЕГДА, в том числе после падения: иначе второй прогон упал бы
  // на данных первого, и повторяемость держалась бы на удаче.
  console.log('убираю данные прогона…', cleanup());
}

process.exit(code);
