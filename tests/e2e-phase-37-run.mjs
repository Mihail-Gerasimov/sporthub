// Браузерный прогон чек-листа фазы 37 «Надзор: своя лента событий у администратора» —
// `tests/checklists/phase-37-oversight.md` (73 шага, 12 сценариев).
//
// ⚠️ Сценарий 5a (step-33b…step-33g) — довесок к фазе: владелец узнаёт о решении
// по СВОЕЙ публикации письмом в ящик тронутого лица, без имени администратора,
// и о возврате в каталог — вторым письмом.
//
// Запуск: E2E_RUN_TAG=e2e-phase37 node tests/e2e-phase-37-run.mjs
//
// ⚠️ Свой признак прогона обязателен: прогонов несколько, они ходят в ОДНУ базу,
// и общий признак означал бы, что уборка одного сносит данные другого.
//
// ⚠️ Правило прогона (шапка самого чек-листа): шаг НЕ засчитывается по коду ответа.
// 200 без проверки того, что на экране, — не пройденный шаг. Фаза целиком про то,
// что сервер и браузер расходятся, поэтому ключевые действия идут ЧЕРЕЗ ИНТЕРФЕЙС
// (раздел модерации с модалкой причины, кнопки «Разобрать» / «Вернуть в очередь» /
// «Отметить всё» / «Удалить разобранные», вкладки тем, переключатель состояния,
// пагинатор, колокольчик), а не только запросом.
//
// ⚠️ Проверки «в базе» делает ПРОГОН, а не браузер. `page.evaluate` выполняет JS
// в контексте страницы: соединения с PostgreSQL у него нет, только `fetch` к API.
// Всё, что начинается со слов «в базе», идёт через `readDb()`.
//
// ⚠️ Массовый засев 150 надзорных строк (сценарий 7) — тоже работа прогона:
// маршрута массового создания в продукте нет и не будет. Строки кладутся напрямую
// с предметами прогона, и они же убираются планами `cleanup-publications.mjs`.
//
// ⚠️ Живые публикации прогон не трогает: сценарии скрывают, стирают каскадом
// и разрывают связи. Все публикации заводятся прогоном и сносятся в `finally`.
//
// ⚠️ Три осознанных отступления от буквы чек-листа, все названы вслух и повторены
// в отчёте:
//   1. Личности разведены по ОТДЕЛЬНЫМ браузерным контекстам, а не сменой сессии
//      в одном окне. Требование «один контекст на сессию» написано под ручной
//      прогон MCP, где вкладка одна; отдельный контекст даёт то же самое строже —
//      гость гарантированно без cookie. Для сценариев 1, 2 и 12d двух живых
//      служебных сессий одновременно требует сам чек-лист: «два администратора
//      отмечают одну и ту же строку почти одновременно» одной вкладкой не выражается.
//   2. Второй администратор заводится ПРЯМО В БАЗЕ (`account_kind = 'admin'`)
//      и убирается там же. Маршрута создания служебной записи в продукте нет,
//      а фикстура служебных записей не заводит (решение фазы 36). Уборка проверяется
//      отдельным шагом: лишняя служебная запись в живой базе — это дыра доступа.
//   3. Шаг step-15 требует случая «скрывший неизвестен». В продукте он возникает
//      только у строк из прошлого, где номера скрывшего нет; прогон воспроизводит
//      его, обнуляя `hidden_by_user_id` у СВОЕЙ скрытой публикации перед правкой.
import fs from 'node:fs';
import path from 'node:path';

// ⚠️ Каталог снимков задаётся ДО загрузки обвязки: она читает переменную окружения
// на уровне модуля, а статический импорт выполнился бы раньше присваивания.
process.env.E2E_SHOTS_DIR ??= path.join(
  path.dirname(new URL(import.meta.url).pathname),
  'screenshots',
  'phase-37',
);

const {
  BASE,
  api,
  freshContext,
  futureDate,
  launch,
  loginAs,
  must,
  mustEqual,
  rawResponse,
  results,
  shutdown,
  step,
  whoAmI,
} = await import('./e2e-phase-35-harness.mjs');
const { E2E_USERS, RUN_TAG, cleanupRun, readDb, readDbId, seedRunUsers } = await import(
  '../scripts/e2e-fixture.mjs'
);
const { cleanupPlans, cleanupStatements, publicationCleanupPlan } = await import(
  '../scripts/cleanup-publications.mjs'
);

/** Живая служебная запись: модератором может быть только она. */
const ADMIN = 'admin@sporthub.local';
/** Вторая служебная запись — заводится прогоном, см. отступление 2 в шапке. */
const ADMIN2 = `${RUN_TAG}-admin2@test.local`;
/** Хеш пароля `sporthub123` — тот же, что у людей фикстуры и у сида. */
const PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$kZOypsO+wlMzc4WtYnCnfA$i6JooAm2PGSA/2Rh8P0X6XJoe9KQ3tF1+Oi4kBpE3y8';

/** Число из базы: `readDb` отдаёт текст, а сравнивать надо числа. */
const num = (sql) => Number(readDb(sql));

/** Сколько надзорных строк подпадает под условие. */
const supervisionRows = (where) =>
  num(`SELECT count(*) FROM notifications WHERE addressee_kind = 'supervision' AND (${where});`);

/** Номер единственной надзорной строки по условию. Пусто — строки нет. */
const supervisionId = (where) =>
  readDb(
    `SELECT id FROM notifications WHERE addressee_kind = 'supervision' AND (${where}) ORDER BY id DESC LIMIT 1;`,
  ).trim();

/** Строка про названный предмет: пара `subjectType` + `subjectId` — единственная форма. */
const aboutSubject = (type, subjectType, subjectId) =>
  `type = '${type}' AND payload->>'subjectType' = '${subjectType}' AND payload->>'subjectId' = '${subjectId}'`;

/** Тело публикации клуба. Слоты идут списком: часть сценариев требует нескольких. */
const clubForm = (name, slots, over = {}) => ({
  name,
  city: 'Самара',
  address: 'ул. Надзорная, 1',
  description:
    'Клуб для прогона чек-листа фазы 37. Описание длиной заведомо больше пятидесяти символов, как требует схема.',
  phone: '+7 (900) 559-00-10',
  email: `${RUN_TAG}-club@test.local`,
  priceFrom: '700',
  sportIds: [1, 3],
  tagIds: [],
  amenityIds: [],
  vk: '',
  telegram: '',
  facebook: '',
  coordinates: { lat: 53.2, lng: 50.1 },
  cityCoordinates: { lat: 53.2, lng: 50.1 },
  scheduleSlots: slots,
  ...over,
});

const slot = (title, days, startTime, endTime) => ({
  title,
  date: futureDate(days),
  startTime,
  endTime,
  price: '700',
  capacity: '10',
  location: 'Зал',
  sportId: 1,
});

/** Тело публикации карточки тренера. `clubId` заводит подтверждённую связь сразу. */
const trainerForm = (last, clubId, over = {}) => ({
  firstName: RUN_TAG,
  lastName: last,
  city: 'Самара',
  address: 'ул. Надзорная, 2',
  bio: 'Карточка для прогона чек-листа фазы 37. Описание длиной заведомо больше пятидесяти символов, как требует схема.',
  experience: '5',
  sportIds: [1, 3],
  specialtyIds: [1],
  workFormatIds: [1],
  phone: '+7 (900) 559-00-11',
  vk: '',
  telegram: '',
  facebook: '',
  offeringName: 'Персональная',
  offeringDescription: 'Один на один',
  offeringFormat: 'Индивидуально',
  offeringPrice: '1500',
  offeringDuration: '60',
  offeringLocation: 'Зал',
  clubId,
  coordinates: { lat: 53.2, lng: 50.1 },
  cityCoordinates: { lat: 53.2, lng: 50.1 },
  scheduleSlots: [slot('Персоналка прогона', 15, '12:00', '13:00')],
  ...over,
});

/**
 * Открыть очередь надзора и дождаться её отрисовки.
 *
 * ⚠️ Заголовок ищется ролью, а не текстом: подпись «Не разобрано в очереди надзора»
 * у значка в меню содержит те же слова, и поиск по тексту нашёл бы её первой.
 */
async function openQueue(page, state = 'unresolved', note = '') {
  await page.goto(`${BASE}/service-portal/notifications`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1_500);

  // ⚠️ Отказ страницы называется СРАЗУ и своим именем. Без этого каждый шаг,
  // который открывает очередь, ждал бы двадцать секунд и краснел «таймаут
  // селектора» — то есть прятал бы одну общую причину за сорока разными
  // сообщениями и растягивал прогон на полчаса.
  const html = await page.content();
  if (html.includes('Сервис временно недоступен')) {
    const digest = /Код обращения:\s*(\d+)/.exec(html)?.[1] ?? 'без кода';
    throw new Error(
      `${note === '' ? '' : `${note}; `}БЛОКЕР: страница очереди надзора не отрисовалась — «Сервис временно недоступен», код обращения ${digest}`,
    );
  }

  await page.getByRole('heading', { name: 'Очередь надзора' }).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1_000);

  if (state !== 'unresolved') {
    await page.locator(`[data-testid="supervision-state-${state}"]`).click();
    await page.waitForTimeout(2_000);
  }
}

/** Числа подписи раздела: сколько не разобрано и сколько всего — глазами страницы. */
async function queueCounters(page) {
  const unread = await page.locator('[data-testid="supervision-unread-count"]').innerText();
  const total = await page.locator('[data-testid="supervision-total-count"]').innerText();

  return { unread: Number(unread.trim()), total: Number(total.trim()) };
}

/**
 * Число на значке колокольчика. Значка может не быть вовсе — это и есть ноль:
 * компонент рисует его только при непрочитанных.
 */
async function bellBadge(page) {
  // ⚠️ Подпись кнопки ищется ПРЕФИКСОМ. С шага 37.72 она называет число
  // («Уведомления, непрочитанных: 3»), и точное совпадение перестало находить
  // кнопку ровно тогда, когда непрочитанные есть, — то есть в самом интересном
  // случае. Прогон обязан работать на обеих формах подписи.
  await page.waitForSelector('header button[aria-label^="Уведомления"]', { timeout: 20_000 });
  // Счётчик спрашивается после отрисовки; без паузы читалось бы значение до ответа.
  await page.waitForTimeout(2_000);
  const badge = await page.$('[data-testid="notification-bell-badge"]');

  if (badge === null) return 0;

  const text = (await badge.textContent()).trim();

  // ⚠️ Значок печатает «99+», когда неразобранного больше девяноста девяти:
  // место в кружке ограничено. `Number('99+')` даёт NaN, и сравнение краснело бы
  // на совершенно верном экране. Возвращаем бесконечность — «больше, чем помещается», —
  // а разбирается с ней `mustBadge`.
  return text === '99+' ? Number.POSITIVE_INFINITY : Number(text);
}

/**
 * Сверить значок с ожидаемым числом, понимая «99+».
 *
 * Точное сравнение там, где число помещается; «больше девяноста девяти» там,
 * где значок сам так и говорит.
 */
function mustBadge(badge, expected, what) {
  if (badge === Number.POSITIVE_INFINITY) {
    must(expected > 99, `${what}: значок показывает «99+», а ожидалось ${expected}`);
    return;
  }

  mustEqual(badge, expected, what);
}

/**
 * Число у пункта «Надзор» в меню панели — то самое, что считает СЕРВЕРНЫЙ лейаут.
 *
 * Читается из подписи для экранного диктора: она называет цель числа, и это
 * единственное место, где число и его смысл связаны в разметке.
 */
async function navBadge(page) {
  const link = page.locator('nav[aria-label="Разделы admin-панели"] a[href="/service-portal/notifications"]');
  await link.waitFor({ timeout: 20_000 });
  const badge = link.locator('span[aria-label^="Не разобрано в очереди надзора"]');

  return (await badge.count()) === 0 ? 0 : Number((await badge.innerText()).trim());
}

/**
 * Увели ли со страницы.
 *
 * ⚠️ `rawResponse` спрашивает с `redirect: 'manual'`, и на такой ответ браузер
 * отдаёт «непрозрачное перенаправление»: `type: 'opaqueredirect'`, `status: 0`,
 * тело пустое. Ноль здесь — это НЕ отказ сети, а увод, и проверка «код между
 * 300 и 400» краснела бы на совершенно правильном поведении.
 */
const wasRedirected = (response) =>
  response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);

/**
 * Открыть выпадашку колокольчика, если она ещё не открыта.
 *
 * ⚠️ Кнопка ПЕРЕКЛЮЧАЕТ. Повторное нажатие на уже открытой выпадашке закрывает её,
 * и следующий шаг ждал бы появления того, что сам только что убрал.
 */
async function openBell(page) {
  const dropdown = page.locator('[data-testid="notification-bell-dropdown"]');

  if ((await dropdown.count()) === 0) {
    await page.locator('header button[aria-label^="Уведомления"]').click();
    await dropdown.waitFor({ timeout: 10_000 });
  }

  await page.waitForTimeout(2_000);

  return dropdown;
}

/** Закрыть выпадашку, чтобы следующий шаг начинал с известного состояния. */
async function closeBell(page) {
  if ((await page.locator('[data-testid="notification-bell-dropdown"]').count()) > 0) {
    await page.mouse.click(5, 500);
    await page.waitForTimeout(500);
  }
}

/**
 * Карточки строк очереди на экране.
 *
 * ⚠️ Отбор по тегу `article`, а не по одному префиксу. Внутри карточки
 * `supervision-item-<id>` лежит плашка состояния `supervision-item-unresolved-<id>`
 * либо `supervision-item-resolved-<id>` — префикс у них ОБЩИЙ, и счёт по нему даёт
 * ровно вдвое больше. Нашёл прогон: девять строк насчитались как восемнадцать.
 */
const queueCards = (page) => page.locator('article[data-testid^="supervision-item-"]');

/** Скрыть публикацию ЧЕРЕЗ РАЗДЕЛ МОДЕРАЦИИ: карточка, кнопка, модалка причины. */
async function hideThroughModeration(page, kind, id, name, reason) {
  await page.goto(`${BASE}/service-portal/moderation?type=${kind}&id=${id}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.getByText('Модерация публикаций').first().waitFor({ timeout: 20_000 });
  await page.getByRole('heading', { name }).first().waitFor({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Скрыть', exact: true }).first().click();
  await page.getByLabel('Причина скрытия').waitFor({ timeout: 10_000 });
  await page.getByLabel('Причина скрытия').fill(reason);
  // Кнопка модалки — вторая «Скрыть» на странице; ищем её внутри диалога.
  await page.locator('[role="dialog"]').getByRole('button', { name: 'Скрыть' }).click();
  await page.waitForTimeout(2_500);
}

/** Завести вторую служебную запись. Прямо в базе: маршрута для этого в продукте нет. */
function seedSecondAdmin() {
  readDb(`
    INSERT INTO users (created_at, status, account_kind, name, email, phone, password_hash)
    VALUES (now(), 'active', 'admin', 'Прогон второй администратор', '${ADMIN2}',
            '+7 (900) 559-00-02', '${PASSWORD_HASH}')
    ON CONFLICT (email) DO NOTHING;
  `);

  return Number(readDb(`SELECT id FROM users WHERE email = '${ADMIN2}';`));
}

/**
 * Запасная уборка — тем же порядком «лист → корень», что и `cleanupRun()`.
 *
 * ⚠️ Нужна потому, что общая уборка сейчас падает на реестре планов (см. пояснение
 * в `finally`). Публикационный план работает и берётся отсюда же — копии каскада
 * здесь нет; руками дописано только то, что живёт в сломанном плане людей.
 */
function fallbackCleanup() {
  const ids = readDb(`SELECT id FROM users WHERE email LIKE '${RUN_TAG}-%';`)
    .split('\n')
    .filter(Boolean);

  if (ids.length === 0) return;

  const list = ids.join(',');
  const idsOf = (table) =>
    readDb(`SELECT id FROM ${table} WHERE managed_by_user_id IN (${list}) OR name LIKE '${RUN_TAG}%';`)
      .split('\n')
      .filter(Boolean)
      .map(Number);

  for (const statement of cleanupStatements(
    publicationCleanupPlan({ clubIds: idsOf('clubs'), trainerIds: idsOf('trainers') }),
  )) {
    readDb(statement);
  }

  readDb(`DELETE FROM notifications WHERE user_id IN (${list});`);
  readDb(`DELETE FROM logs WHERE actor_id IN (${list});`);
  readDb(
    `DELETE FROM provider_client_notes WHERE provider_user_id IN (${list}) OR client_user_id IN (${list});`,
  );
  readDb(`DELETE FROM reviews WHERE user_id IN (${list});`);
  readDb(`DELETE FROM bookings WHERE user_id IN (${list});`);
  readDb(`DELETE FROM sessions WHERE user_id IN (${list});`);
  readDb(`DELETE FROM users WHERE id IN (${list});`);
}

/** Сколько служебных записей прогона осталось в живой базе. Обязано быть ноль. */
const secondAdminRows = () =>
  num(`SELECT count(*) FROM users WHERE email = '${ADMIN2}' OR (account_kind = 'admin' AND email LIKE '${RUN_TAG}-%');`);

/**
 * Снимок живой базы ДО прогона.
 *
 * ⚠️ Считается на уровне модуля, а не внутри `main()`: уборка в `finally` обязана
 * работать и после падения посреди прогона, а значения, посчитанные в упавшей
 * функции, до неё не доедут — и мусор остался бы в живой базе именно в том случае,
 * когда его больше всего.
 */
const startSupervisionTotal = num(
  `SELECT count(*) FROM notifications WHERE addressee_kind = 'supervision';`,
);
const startMaxNotificationId = num('SELECT coalesce(max(id), 0) FROM notifications;');
// ⚠️ Верхний номер журнала — чтобы уборка и проверка step-62 говорили только
// о строках, появившихся В ЭТОМ заходе. Без окна отбор «предмета уже нет»
// накрыл бы 88 строк-сирот, накопленных прошлыми прогонами: их убирает
// не эта проверка, и молча уносить чужое она не должна.
const startMaxLogId = num('SELECT coalesce(max(id), 0) FROM logs;');
console.log(`Надзорных строк в базе до прогона: ${startSupervisionTotal}`);

/**
 * Предметы, которые прогон СТЁР, — по видам и номерам.
 *
 * ⚠️ Надзорная строка сознательно переживает свой предмет: событие «публикация
 * стёрта» без публикации — единственная его форма, и считать такую строку сиротой
 * нельзя. Но и оставлять её в живой базе после прогона тоже нельзя: это данные
 * прогона. Вывести номер стёртого из таблицы потом неоткуда — его надо ЗАПОМНИТЬ
 * до удаления и назвать уборке параметром `subjects` (`cleanup-publications.mjs`).
 *
 * Список живёт на уровне модуля, а не внутри `main()`: уборка в `finally` обязана
 * получить его и после падения посреди прогона.
 */
const erased = [];

async function main() {
  const users = seedRunUsers();
  const ownerId = Number(users[E2E_USERS.builder]);
  const clientId = Number(users[E2E_USERS.client]);
  const strangerId = Number(users[E2E_USERS.stranger]);
  console.log(`Люди прогона: владелец ${ownerId}, клиент ${clientId}, посторонний ${strangerId}`);

  const admin2Id = seedSecondAdmin();
  console.log(`Вторая служебная запись: ${admin2Id} (${ADMIN2})`);

  await launch();

  const admin = await freshContext();
  const admin2 = await freshContext();
  const owner = await freshContext();
  const client = await freshContext();
  const guest = await freshContext();

  // ⚠️ Умолчание ожидания сокращено с 30 секунд до 10. Явные ожидания страниц
  // задают свой срок и этим не задеты; сокращение касается только действий
  // над элементами, которых нет. При сломанной странице очереди тридцать секунд
  // на каждое такое действие превращали прогон в получасовой.
  for (const { context } of [admin, admin2, owner, client, guest]) {
    context.setDefaultTimeout(10_000);
  }

  await loginAs(admin.page, ADMIN, { portal: 'service' });
  await loginAs(admin2.page, ADMIN2, { portal: 'service' });
  await loginAs(owner.page, E2E_USERS.builder);
  await loginAs(client.page, E2E_USERS.client);

  const adminId = (await whoAmI(admin.page))?.id;
  console.log(`Первый администратор: ${adminId}`);

  // Адреса запросов ленты — для сценария 7: отбор обязан менять АДРЕС, а не
  // фильтровать уже выданное.
  const feedRequests = [];
  admin.page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/api/notifications')) feedRequests.push(url);
  });

  // ───────────────────────── Данные прогона ─────────────────────────
  // Клуб А — живая запись клиента, её стирает администратор (step-21), потом клуб
  //          скрывается (сценарий 4). Клуб Б — скрытие сценария 1 и повторная
  //          проверка (step-15). Клуб В — стирание каскадом (step-17).
  //          Карточка Т — скрытие (step-16) и связи (step-22, step-24).
  const made = {
    clubA: null,
    clubB: null,
    clubC: null,
    clubD: null,
    trainer: null,
    slotsA: [],
    bookingId: null,
    linkForced: null,
    linkPlain: null,
  };

  const nameA = `${RUN_TAG} Клуб А`;
  const nameB = `${RUN_TAG} Клуб Б`;
  const nameC = `${RUN_TAG} Клуб В`;
  const nameD = `${RUN_TAG} Клуб Г`;
  const nameT = `${RUN_TAG} Тренер`;

  const createA = await api(
    owner.page,
    'POST',
    '/api/clubs',
    clubForm(nameA, [slot('Занятие А1', 11, '10:00', '11:00'), slot('Занятие А2', 12, '10:00', '11:00')]),
  );
  must(createA.status === 201 || createA.status === 200, `клуб А не создан: ${createA.status} ${createA.text}`);
  made.clubA = createA.body?.data?.club?.id;
  made.slotsA = (createA.body?.data?.schedules ?? []).map((item) => item.id);

  const createB = await api(owner.page, 'POST', '/api/clubs', clubForm(nameB, [slot('Занятие Б1', 14, '10:00', '11:00')]));
  must(createB.status === 201 || createB.status === 200, `клуб Б не создан: ${createB.status} ${createB.text}`);
  made.clubB = createB.body?.data?.club?.id;

  const createC = await api(owner.page, 'POST', '/api/clubs', clubForm(nameC, [slot('Занятие В1', 16, '10:00', '11:00')]));
  must(createC.status === 201 || createC.status === 200, `клуб В не создан: ${createC.status} ${createC.text}`);
  made.clubC = createC.body?.data?.club?.id;

  const createT = await api(owner.page, 'POST', '/api/trainers', trainerForm('Тренер', made.clubB));
  must(createT.status === 201 || createT.status === 200, `карточка тренера не создана: ${createT.status} ${createT.text}`);
  made.trainer = createT.body?.data?.trainer?.id;

  // Связь тренера с клубом Б завелась вместе с карточкой — её и разорвёт
  // администратор принудительно (step-22).
  made.linkForced = Number(
    readDb(
      `SELECT id FROM trainer_club_links WHERE trainer_id = ${made.trainer} AND club_id = ${made.clubB} ORDER BY id DESC LIMIT 1;`,
    ),
  );

  // Вторая связь — с клубом А: её разорвут САМИ СТОРОНЫ (step-24), и надзорной
  // строки это породить не должно.
  const linkCreate = await api(owner.page, 'POST', '/api/trainer-club-links', {
    trainerId: made.trainer,
    clubId: made.clubA,
  });
  must(linkCreate.status === 201 || linkCreate.status === 200, `связь с клубом А не создана: ${linkCreate.status} ${linkCreate.text}`);
  made.linkPlain = linkCreate.body?.data?.id;

  if (linkCreate.body?.data?.status !== 'confirmed') {
    const approve = await api(owner.page, 'POST', `/api/trainer-club-links/${made.linkPlain}/approve`, {});
    must(approve.status === 200, `связь с клубом А не подтверждена: ${approve.status} ${approve.text}`);
  }

  const book = await api(client.page, 'POST', '/api/bookings', { scheduleId: made.slotsA[0] });
  must(book.status === 201 || book.status === 200, `запись клиента не создана: ${book.status} ${book.text}`);
  made.bookingId = book.body?.data?.id;

  console.log(
    `Данные прогона: клубы ${made.clubA}/${made.clubB}/${made.clubC}, карточка ${made.trainer}, запись ${made.bookingId}, связи ${made.linkForced}/${made.linkPlain}`,
  );

  // ═════════════════════════ Сценарий 1: очередь общая ═════════════════════════
  console.log('\n=== Сценарий 1. Очередь общая ===');
  const base = { unread: 0, total: 0, bell: 0, nav: 0 };

  await step('step-1', 'вход администратором, открыта вкладка надзора', async () => {
    await openQueue(admin.page);
    const me = await whoAmI(admin.page);
    mustEqual(me?.accountKind ?? 'нет', 'admin', 'вид учётной записи');
    const heading = await admin.page.getByRole('heading', { name: 'Очередь надзора' }).innerText();
    must(heading.toLowerCase().includes('очередь надзора'), `заголовок раздела: «${heading}»`);
    return 'служебная запись видит раздел «Очередь надзора»';
  }, admin.page);

  await step('step-2', 'снят эталон: значок, лента и пункт меню', async () => {
    const counters = await queueCounters(admin.page);
    base.unread = counters.unread;
    base.total = counters.total;
    base.bell = await bellBadge(admin.page);
    base.nav = await navBadge(admin.page);

    const inDb = supervisionRows('read_at IS NULL');
    mustEqual(base.unread, inDb, 'неразобранных на экране против базы');
    mustBadge(base.bell, base.unread, 'значок колокольчика против ленты');
    mustEqual(base.nav, base.unread, 'число у пункта меню против ленты');
    return `эталон: не разобрано ${base.unread}, всего ${base.total}, значок ${base.bell}, меню ${base.nav}`;
  }, admin.page);

  await step('step-3', 'публикация прогона скрыта модератором с причиной', async () => {
    await hideThroughModeration(admin.page, 'club', made.clubB, nameB, `${RUN_TAG}: причина скрытия прогона`);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id = ${made.clubB};`), 'hidden', 'статус клуба в базе');
    mustEqual(readDb(`SELECT hidden_kind FROM clubs WHERE id = ${made.clubB};`), 'moderation', 'вид скрытия в базе');
    const html = await admin.page.content();
    must(html.includes('Скрыто модератором'), 'раздел модерации не показывает скрытие на экране');
    return 'скрыто через раздел модерации, причина записана';
  }, admin.page);

  await step('step-4', 'строка в ленте, значок вырос на 1, пункт меню совпал', async () => {
    const rowId = supervisionId(aboutSubject('oversight_publication_hidden', 'club', made.clubB));
    must(rowId !== '', 'надзорной строки о скрытии в базе нет');
    made.hiddenRowId = rowId;
    await openQueue(admin.page, 'unresolved', `в базе строка ${rowId} есть`);
    const card = admin.page.locator(`[data-testid="supervision-item-${rowId}"]`);
    mustEqual(await card.count(), 1, 'строка о скрытии на экране ленты');
    const text = await card.innerText();
    must(text.includes('Публикация скрыта'), `текст строки: «${text}»`);
    must(text.includes(nameB), `имя публикации в строке: «${text}»`);
    must(text.includes('причина скрытия прогона'), `причина в строке: «${text}»`);

    const counters = await queueCounters(admin.page);
    mustEqual(counters.unread, base.unread + 1, 'неразобранных после скрытия');
    mustBadge(await bellBadge(admin.page), counters.unread, 'значок колокольчика');
    mustEqual(await navBadge(admin.page), counters.unread, 'число у пункта меню');
    return `строка ${rowId}, не разобрано ${counters.unread}, значок и меню совпали`;
  }, admin.page);

  await step('step-5', 'вход вторым администратором, открыта та же лента', async () => {
    await openQueue(admin2.page);
    const me = await whoAmI(admin2.page);
    mustEqual(me?.accountKind ?? 'нет', 'admin', 'вид учётной записи второго');
    mustEqual(me?.id, admin2Id, 'номер второго администратора');
    return `вторая служебная запись ${admin2Id} открыла очередь`;
  }, admin2.page);

  await step('step-6', 'ТА ЖЕ строка видна второму, число совпадает', async () => {
    const card = admin2.page.locator(`[data-testid="supervision-item-${made.hiddenRowId}"]`);
    mustEqual(await card.count(), 1, 'строка о скрытии у второго администратора');
    const text = await card.innerText();
    must(text.includes(nameB), `имя публикации в строке второго: «${text}»`);
    const counters = await queueCounters(admin2.page);
    mustEqual(counters.unread, base.unread + 1, 'неразобранных у второго');
    mustBadge(await bellBadge(admin2.page), counters.unread, 'значок у второго');
    return `у второго та же строка ${made.hiddenRowId}, не разобрано ${counters.unread}`;
  }, admin2.page);

  await step('step-7', 'readDb: на событие ОДНА строка, а не по одной на администратора', async () => {
    const rows = supervisionRows(aboutSubject('oversight_publication_hidden', 'club', made.clubB));
    mustEqual(rows, 1, 'строк о скрытии этой публикации в базе');
    mustEqual(num(`SELECT count(*) FROM notifications WHERE id = ${made.hiddenRowId} AND user_id IS NULL;`), 1, 'владелец надзорной строки');
    return 'строка ровно одна, владельца-человека у неё нет';
  }, admin.page);

  // ══════════════ Сценарий 2: разобрал один — видно всем ══════════════
  console.log('\n=== Сценарий 2. Разобрал один — видно всем ===');

  await step('step-8', 'вторым администратором строка отмечена разобранной', async () => {
    await admin2.page.locator(`[data-testid="supervision-resolve-${made.hiddenRowId}"]`).click();
    await admin2.page.waitForTimeout(2_500);
    mustEqual(
      num(`SELECT count(*) FROM notifications WHERE id = ${made.hiddenRowId} AND read_at IS NOT NULL AND read_by_user_id = ${admin2Id};`),
      1,
      'разбор и подпись в базе',
    );
    const badge = admin2.page.locator(`[data-testid="supervision-item-resolved-${made.hiddenRowId}"]`);
    mustEqual(await badge.count(), 1, 'плашка «разобрано» на экране сразу после нажатия');
    return `строка ${made.hiddenRowId} разобрана вторым администратором`;
  }, admin2.page);

  await step('step-9', 'строка ушла из отбора «не разобрано», значок убавился', async () => {
    await openQueue(admin2.page);
    mustEqual(
      await admin2.page.locator(`[data-testid="supervision-item-${made.hiddenRowId}"]`).count(),
      0,
      'разобранная строка в отборе «не разобрано»',
    );
    const counters = await queueCounters(admin2.page);
    mustEqual(counters.unread, base.unread, 'неразобранных после разбора');
    mustBadge(await bellBadge(admin2.page), counters.unread, 'значок после разбора');
    return `в «не разобрано» строки нет, не разобрано ${counters.unread}`;
  }, admin2.page);

  await step('step-10', 'в отборе «разобрано» строка на месте, подпись называет второго', async () => {
    await openQueue(admin2.page, 'resolved');
    const card = admin2.page.locator(`[data-testid="supervision-item-${made.hiddenRowId}"]`);
    mustEqual(await card.count(), 1, 'строка в отборе «разобрано»');
    const label = await admin2.page
      .locator(`[data-testid="supervision-item-resolved-${made.hiddenRowId}"]`)
      .innerText();
    must(label.includes(String(admin2Id)), `подпись разобравшего: «${label}», ожидался #${admin2Id}`);
    return `подпись на экране: «${label.trim()}»`;
  }, admin2.page);

  await step('step-11', 'первый администратор открыл ленту заново', async () => {
    await openQueue(admin.page, 'resolved');
    return 'первый администратор смотрит отбор «разобрано»';
  }, admin.page);

  await step('step-12', 'у первого строка ТОЖЕ разобрана, значок такой же', async () => {
    const card = admin.page.locator(`[data-testid="supervision-item-${made.hiddenRowId}"]`);
    mustEqual(await card.count(), 1, 'строка в отборе «разобрано» у первого');
    const label = await admin.page
      .locator(`[data-testid="supervision-item-resolved-${made.hiddenRowId}"]`)
      .innerText();
    must(label.includes(String(admin2Id)), `подпись у первого: «${label}», ожидался #${admin2Id}`);
    mustBadge(await bellBadge(admin.page), base.unread, 'значок у первого');
    return `у первого та же подпись «${label.trim()}», значок ${base.unread}`;
  }, admin.page);

  await step('step-12a', '«Отметить все» СПРАШИВАЕТ подтверждение; отмена ничего не меняет', async () => {
    await openQueue(admin.page);
    const before = supervisionRows('read_at IS NULL');
    must(before > 0, 'неразобранных нет — проверять подтверждение не на чем');
    await admin.page.locator('[data-testid="supervision-mark-all"]').click();
    await admin.page.waitForTimeout(800);
    const confirm = admin.page.locator('[data-testid="supervision-mark-all-confirm"]');
    mustEqual(await confirm.count(), 1, 'окно подтверждения на экране');
    const dialog = await admin.page.locator('[role="dialog"]').first().innerText();
    must(dialog.includes('Отметить всю очередь'), `текст подтверждения: «${dialog}»`);
    await admin.page.locator('[data-testid="supervision-mark-all-cancel"]').click();
    await admin.page.waitForTimeout(1_500);
    mustEqual(supervisionRows('read_at IS NULL'), before, 'неразобранных после отмены');
    return `подтверждение показано, отмена оставила ${before} неразобранных`;
  }, admin.page);

  await step('step-12b', 'подтверждение гасит очередь, но разобранное ВИДНО с подписью', async () => {
    await admin.page.locator('[data-testid="supervision-mark-all"]').click();
    await admin.page.waitForTimeout(800);
    await admin.page.locator('[data-testid="supervision-mark-all-confirm"]').click();
    await admin.page.waitForTimeout(3_000);
    mustEqual(supervisionRows('read_at IS NULL'), 0, 'неразобранных после «отметить всё»');
    const counters = await queueCounters(admin.page);
    mustEqual(counters.unread, 0, 'число неразобранных на экране');

    await openQueue(admin.page, 'resolved');
    const shown = await admin.page.locator('[data-testid^="supervision-item-resolved-"]').count();
    must(shown > 0, 'под состоянием «разобрано» не видно ни одной строки');
    const signed = supervisionRows(`read_at IS NOT NULL AND read_by_user_id = ${adminId}`);
    must(signed > 0, 'подпись разобравшего не проставлена при массовой отметке');
    return `строк под «разобрано» на экране ${shown}, подписано первым администратором ${signed}`;
  }, admin.page);

  await step('step-12c', '«Вернуть в очередь» возвращает строку — у ОБОИХ администраторов', async () => {
    const returned = made.hiddenRowId;
    await openQueue(admin.page, 'resolved');
    await admin.page.locator(`[data-testid="supervision-return-${returned}"]`).click();
    await admin.page.waitForTimeout(2_500);
    mustEqual(
      num(`SELECT count(*) FROM notifications WHERE id = ${returned} AND read_at IS NULL AND read_by_user_id IS NULL;`),
      1,
      'разбор и подпись сняты в базе',
    );

    await openQueue(admin.page);
    mustEqual(await admin.page.locator(`[data-testid="supervision-item-${returned}"]`).count(), 1, 'строка вернулась в «не разобрано» у первого');
    const firstCounters = await queueCounters(admin.page);
    mustEqual(firstCounters.unread, 1, 'неразобранных у первого после возврата');
    mustBadge(await bellBadge(admin.page), 1, 'значок у первого вырос обратно');

    await openQueue(admin2.page);
    mustEqual(await admin2.page.locator(`[data-testid="supervision-item-${returned}"]`).count(), 1, 'строка вернулась в «не разобрано» у второго');
    mustEqual((await queueCounters(admin2.page)).unread, 1, 'неразобранных у второго после возврата');
    mustBadge(await bellBadge(admin2.page), 1, 'значок у второго вырос обратно');
    return `строка ${returned} снова в очереди у обоих, подпись снята`;
  }, admin.page);

  await step('step-12d', 'два администратора разбирают одну строку — подпись не перезаписана', async () => {
    const row = made.hiddenRowId;
    // Почти одновременно: оба запроса уходят из СВОИХ браузеров без ожидания.
    const [first, second] = await Promise.all([
      api(admin.page, 'POST', `/api/notifications/${row}/read`, {}),
      api(admin2.page, 'POST', `/api/notifications/${row}/read`, {}),
    ]);
    mustEqual(first.status, 200, `ответ первому: ${first.text}`);
    mustEqual(second.status, 200, `ответ второму: ${second.text}`);

    const signature = readDb(`SELECT read_by_user_id FROM notifications WHERE id = ${row};`).trim();
    must([String(adminId), String(admin2Id)].includes(signature), `подпись в базе: «${signature}»`);
    // Оба ответа обязаны сообщать ОДНУ подпись: «уже разобрано» — это состояние
    // строки, а не молчание, и перезаписи подписи быть не должно.
    mustEqual(String(first.body?.data?.readByUserId ?? ''), signature, 'подпись в ответе первому');
    mustEqual(String(second.body?.data?.readByUserId ?? ''), signature, 'подпись в ответе второму');
    mustEqual(first.body?.data?.readAt, second.body?.data?.readAt, 'момент разбора в обоих ответах');

    // Третий заход тем, кто НЕ занялся: подпись обязана остаться прежней.
    const loser = signature === String(adminId) ? admin2 : admin;
    const again = await api(loser.page, 'POST', `/api/notifications/${row}/read`, {});
    mustEqual(again.status, 200, `повторный разбор: ${again.text}`);
    mustEqual(readDb(`SELECT read_by_user_id FROM notifications WHERE id = ${row};`).trim(), signature, 'подпись после повторного разбора');
    return `занявшимся числится #${signature}, повторное нажатие подпись не переписало`;
  }, admin.page);

  await step('step-13', '«Удалить разобранные» с подтверждением очищает ленту', async () => {
    await openQueue(admin.page, 'all');
    const before = supervisionRows('true');
    must(before > 0, 'очередь и так пуста — удалять нечего');
    await admin.page.locator('[data-testid="supervision-delete-resolved"]').click();
    await admin.page.waitForTimeout(800);
    const confirmText = await admin.page.locator('[role="dialog"]').first().innerText();
    must(confirmText.includes('Удалить разобранные'), `текст подтверждения удаления: «${confirmText}»`);
    await admin.page.locator('[data-testid="supervision-delete-confirm"]').click();
    await admin.page.waitForTimeout(3_000);

    mustEqual(supervisionRows('true'), 0, 'надзорных строк в базе после уборки');
    await openQueue(admin.page, 'all');
    mustEqual(await admin.page.locator('[data-testid="supervision-empty"]').count(), 1, 'состояние пустой очереди на экране');
    const empty = await admin.page.locator('[data-testid="supervision-empty"]').innerText();
    must(empty.includes('Очередь пуста'), `текст пустой очереди: «${empty}»`);
    return `удалено ${before} строк, лента показывает «${empty.trim()}»`;
  }, admin.page);

  await step('step-14', 'в журнале строка события НА МЕСТЕ — уборка ленты его не трогает', async () => {
    const inDb = num(
      `SELECT count(*) FROM logs WHERE action = 'moderation_hide' AND entity_type = 'club' AND entity_id = ${made.clubB};`,
    );
    mustEqual(inDb, 1, 'строк журнала о скрытии клуба Б');

    await admin.page.goto(`${BASE}/service-portal/logs`, { waitUntil: 'domcontentloaded' });
    await admin.page.getByRole('heading', { name: 'Логи активности' }).waitFor({ timeout: 20_000 });
    await admin.page.locator('#actor-filter').fill(String(adminId));
    await admin.page.waitForTimeout(3_000);
    const html = await admin.page.content();
    must(
      html.includes('moderation_hide') || html.includes('Скрытие публикации') || html.includes(nameB),
      'журнал не показывает скрытие на экране',
    );
    return 'строка журнала цела и видна на экране';
  }, admin.page);

  // ═════════════════════════ Сценарий 3: девять типов ═════════════════════════
  console.log('\n=== Сценарий 3. Девять типов ===');
  // Значок владельца ДО событий сценария: сценарий 5 сверяет, что надзор его
  // не задел, а человеческие уведомления — задели и это законно.
  //
  // ⚠️ Значок снимается НА СВОДКЕ кабинета, а не на странице ленты. На странице
  // ленты у счётчика ДВА писателя в один стор: опрос колокольчика кладёт туда
  // число человека (все его ящики), а сама страница — число ОТКРЫТОГО ящика,
  // и кто из них ляжет последним, решает гонка ответов. Прогон 12.09.2026 поймал
  // обе стороны этой гонки: первый заход увидел 0 при шести непрочитанных,
  // второй — верные 6. Это дефект приложения, он назван в отчёте; чтобы шаг
  // отвечал на СВОЙ вопрос («не выросло ли от надзорных событий»), а не на чужую
  // гонку, значок читается там, где писатель один.
  const ownerBellBefore = await (async () => {
    await owner.page.goto(`${BASE}/profile/me/dashboard`, { waitUntil: 'domcontentloaded' });
    return bellBadge(owner.page);
  })();
  const ownerUnreadBefore = num(`SELECT count(*) FROM notifications WHERE user_id = ${ownerId} AND read_at IS NULL;`);

  await step('step-15', 'правка скрытой публикации → publication_recheck_requested, скрывший НЕИЗВЕСТЕН', async () => {
    // Случай «скрывший неизвестен» в продукте бывает только у строк из прошлого.
    // Прогон воспроизводит его на СВОЕЙ публикации: номер скрывшего обнуляется.
    readDb(`UPDATE clubs SET hidden_by_user_id = NULL WHERE id = ${made.clubB};`);
    mustEqual(readDb(`SELECT coalesce(hidden_by_user_id::text, 'NULL') FROM clubs WHERE id = ${made.clubB};`), 'NULL', 'скрывший обнулён');

    // ⚠️ Схема правки — ПОЛНАЯ форма публикации, у которой необязательно только
    // расписание (решение 1 фазы 36). Одним полем `phone` запрос не выражается:
    // он отбился бы 400, и шаг краснел бы на форме запроса, а не на поведении.
    const editBody = { ...clubForm(nameB, []), phone: '+7 (900) 559-00-77' };
    delete editBody.scheduleSlots;
    const patch = await api(owner.page, 'PATCH', `/api/clubs/${made.clubB}`, editBody);
    mustEqual(patch.status, 200, `правка скрытой публикации: ${patch.text}`);
    mustEqual(readDb(`SELECT awaiting_recheck FROM clubs WHERE id = ${made.clubB};`), 't', 'признак повторной проверки');

    const rowId = supervisionId(aboutSubject('publication_recheck_requested', 'club', made.clubB));
    must(rowId !== '', 'строки о повторной проверке нет — при неизвестном скрывшем она обязана прийти');
    await openQueue(admin.page, 'unresolved', `в базе строка ${rowId} есть`);
    const card = admin.page.locator(`[data-testid="supervision-item-${rowId}"]`);
    mustEqual(await card.count(), 1, 'строка о повторной проверке на экране');
    const text = await card.innerText();
    must(text.includes(nameB), `имя публикации в строке: «${text}»`);
    return `строка ${rowId}: «${text.split('\n').slice(0, 3).join(' / ')}»`;
  }, admin.page);

  await step('step-16', 'скрытие публикации → oversight_publication_hidden, причина видна', async () => {
    await hideThroughModeration(admin.page, 'trainer', made.trainer, nameT, `${RUN_TAG}: карточка скрыта прогоном`);
    mustEqual(readDb(`SELECT status FROM trainers WHERE id = ${made.trainer};`), 'hidden', 'статус карточки');

    const rowId = supervisionId(aboutSubject('oversight_publication_hidden', 'trainer', made.trainer));
    must(rowId !== '', 'строки о скрытии карточки нет');
    await openQueue(admin.page, 'unresolved', `в базе строка ${rowId} есть`);
    const text = await admin.page.locator(`[data-testid="supervision-item-${rowId}"]`).innerText();
    must(text.includes('Публикация скрыта'), `вид строки: «${text}»`);
    must(text.includes('карточка скрыта прогоном'), `причина в строке: «${text}»`);
    return `строка ${rowId}, причина видна на экране`;
  }, admin.page);

  await step('step-17', 'стирание каскадом → oversight_publication_deleted', async () => {
    const erase = await api(admin.page, 'DELETE', `/api/clubs/${made.clubC}`, undefined);
    mustEqual(erase.status, 200, `стирание клуба В: ${erase.text}`);
    mustEqual(erase.body?.data?.outcome, 'deleted', 'исход уборки публикации администратором');
    mustEqual(num(`SELECT count(*) FROM clubs WHERE id = ${made.clubC};`), 0, 'клуб В в базе после стирания');
    // ⚠️ Номер запоминается ДО того, как публикация исчезнет: надзорная строка
    // её переживает, и вывести этот номер из таблицы `clubs` потом будет неоткуда.
    // Именно за этим у `cleanupPlans` появился параметр `subjects`.
    erased.push({ type: 'club', ids: [made.clubC] });

    const rowId = supervisionId(aboutSubject('oversight_publication_deleted', 'club', made.clubC));
    must(rowId !== '', 'строки о стирании нет');
    made.deletedRowId = rowId;
    await openQueue(admin.page, 'unresolved', `в базе строка ${rowId} есть`);
    const text = await admin.page.locator(`[data-testid="supervision-item-${rowId}"]`).innerText();
    must(text.includes('Публикация стёрта'), `вид строки: «${text}»`);
    must(text.includes(nameC), `имя стёртой публикации в строке: «${text}»`);
    return `строка ${rowId} пережила свой предмет, имя названо`;
  }, admin.page);

  await step('step-18', 'новое лицо в каталоге → oversight_publication_created', async () => {
    const createD = await api(owner.page, 'POST', '/api/clubs', clubForm(nameD, [slot('Занятие Г1', 18, '10:00', '11:00')]));
    must(createD.status === 201 || createD.status === 200, `клуб Г не создан: ${createD.status} ${createD.text}`);
    made.clubD = createD.body?.data?.club?.id;

    const rowId = supervisionId(aboutSubject('oversight_publication_created', 'club', made.clubD));
    must(rowId !== '', 'строки о новом лице нет');
    await openQueue(admin.page, 'unresolved', `в базе строка ${rowId} есть`);
    const text = await admin.page.locator(`[data-testid="supervision-item-${rowId}"]`).innerText();
    must(text.includes('Новое лицо'), `вид строки: «${text}»`);
    must(text.includes(nameD), `имя нового лица в строке: «${text}»`);
    return `строка ${rowId}, клуб ${made.clubD}`;
  }, admin.page);

  await step('step-19', 'работа от чужого лица → oversight_impersonation_started', async () => {
    const start = await api(admin.page, 'POST', `/api/auth/impersonate/${ownerId}`, {});
    mustEqual(start.status, 200, `начало работы от чужого лица: ${start.text}`);
    // Возвращаемся немедленно: дальше сценарий 3 идёт от служебной записи.
    const stop = await api(admin.page, 'POST', '/api/auth/impersonate/stop', {});
    mustEqual(stop.status, 200, `возврат к себе: ${stop.text}`);

    const rowId = supervisionId(aboutSubject('oversight_impersonation_started', 'user', ownerId));
    must(rowId !== '', 'строки о работе от чужого лица нет');
    made.userRowId = rowId;
    await openQueue(admin.page, 'unresolved', `в базе строка ${rowId} есть`);
    const text = await admin.page.locator(`[data-testid="supervision-item-${rowId}"]`).innerText();
    must(text.includes('Работа от чужого лица'), `вид строки: «${text}»`);
    return `строка ${rowId}: «${text.split('\n').slice(0, 3).join(' / ')}»`;
  }, admin.page);

  await step('step-20', 'смена чужого пароля → oversight_password_changed_by_admin, ЧЕЛОВЕК НАЗВАН', async () => {
    const change = await api(admin.page, 'POST', `/api/admin/users/${strangerId}/password`, {
      newPassword: 'sporthub123',
    });
    mustEqual(change.status, 200, `смена чужого пароля: ${change.text}`);

    const rowId = supervisionId(aboutSubject('oversight_password_changed_by_admin', 'user', strangerId));
    must(rowId !== '', 'строки о смене чужого пароля нет');
    const payload = readDb(`SELECT payload::text FROM notifications WHERE id = ${rowId};`);
    await openQueue(admin.page, 'unresolved', `в базе строка ${rowId}, payload ${payload}`);
    const text = await admin.page.locator(`[data-testid="supervision-item-${rowId}"]`).innerText();
    must(text.includes('сменил чужой пароль'), `вид строки: «${text}»`);
    must(
      text.includes('Прогон stranger') || text.includes(E2E_USERS.stranger),
      `человек в строке не назван: «${text}»`,
    );
    return `строка ${rowId} называет человека`;
  }, admin.page);

  await step('step-21', 'стирание чужой записи → oversight_booking_hard_deleted, названы ЧЕЛОВЕК и ЗАНЯТИЕ', async () => {
    const erase = await api(admin.page, 'DELETE', `/api/admin/bookings/${made.bookingId}`, undefined);
    mustEqual(erase.status, 200, `стирание чужой записи: ${erase.text}`);
    mustEqual(num(`SELECT count(*) FROM bookings WHERE id = ${made.bookingId};`), 0, 'запись в базе после стирания');
    // Тот же приём, что с публикацией: номер стёртой записи в таблице `bookings`
    // больше не найти, и уборке его надо назвать явно.
    erased.push({ type: 'booking', ids: [made.bookingId] });

    const rowId = supervisionId(aboutSubject('oversight_booking_hard_deleted', 'booking', made.bookingId));
    must(rowId !== '', 'строки о стирании записи нет');
    made.bookingRowId = rowId;
    const payload = readDb(`SELECT payload::text FROM notifications WHERE id = ${rowId};`);
    await openQueue(admin.page, 'unresolved', `в базе строка ${rowId}, payload ${payload}`);
    const text = await admin.page.locator(`[data-testid="supervision-item-${rowId}"]`).innerText();
    must(text.includes('Запись стёрта'), `вид строки: «${text}»`);
    must(text.includes('Занятие А1'), `занятие в строке не названо: «${text}»`);
    // ⚠️ Имя приходит СНИМКОМ (`athleteName`): записи уже нет, сходить за ним
    // по номеру некуда. Номер в тексте не считается ответом на вопрос «у кого отняли».
    must(text.includes('Прогон client'), `человек в строке не назван по имени: «${text}»`);
    return `строка ${rowId} называет и человека, и занятие`;
  }, admin.page);

  await step('step-22', 'принудительный разрыв связи → oversight_link_force_revoked, число занятий видно', async () => {
    const forced = await api(admin.page, 'POST', `/api/admin/trainer-club-links/${made.linkForced}/force-revoke`, {});
    mustEqual(forced.status, 200, `принудительный разрыв: ${forced.text}`);
    mustEqual(readDb(`SELECT status FROM trainer_club_links WHERE id = ${made.linkForced};`), 'revoked', 'статус связи');

    const rowId = supervisionId(aboutSubject('oversight_link_force_revoked', 'link', made.linkForced));
    must(rowId !== '', 'строки о принудительном разрыве нет');
    made.linkRowId = rowId;
    const payload = readDb(`SELECT payload::text FROM notifications WHERE id = ${rowId};`);
    await openQueue(admin.page, 'unresolved', `в базе строка ${rowId}, payload ${payload}`);
    const text = await admin.page.locator(`[data-testid="supervision-item-${rowId}"]`).innerText();
    must(text.includes('разорвана принудительно'), `вид строки: «${text}»`);
    must(/отцеплено:\s*\d+/.test(text), `число отцепленных занятий не видно: «${text}»`);
    return `строка ${rowId}: «${text.split('\n').slice(0, 3).join(' / ')}»`;
  }, admin.page);

  await step('step-23', 'подбор пароля → oversight_login_blocked', async () => {
    // Пять неудач подряд по почте — ступень блокировки. Счёт по адресу
    // (порог 20) при этом не переполняется: успешных входов в прогоне достаточно,
    // и каждый из них счёт адреса обнуляет.
    let lastStatus = 0;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await api(guest.page, 'POST', '/api/auth/login', {
        email: E2E_USERS.stranger,
        password: 'zavedomo-nevernyj-parol',
      });
      lastStatus = response.status;
    }
    must(lastStatus === 401 || lastStatus === 429, `последняя попытка входа ответила ${lastStatus}`);
    // Журналу и уведомлению дают дописаться: вход их не ждёт намеренно.
    await admin.page.waitForTimeout(2_500);

    const rowId = supervisionId(aboutSubject('oversight_login_blocked', 'user', strangerId));
    must(rowId !== '', 'строки о блокировке входа нет');
    const payload = readDb(`SELECT payload::text FROM notifications WHERE id = ${rowId};`);
    await openQueue(admin.page, 'unresolved', `в базе строка ${rowId}, payload ${payload}`);
    const text = await admin.page.locator(`[data-testid="supervision-item-${rowId}"]`).innerText();
    must(text.includes('Вход заблокирован'), `вид строки: «${text}»`);
    must(text.includes('Ключ:'), `ключ блокировки в строке: «${text}»`);
    return `строка ${rowId}: «${text.split('\n').slice(0, 3).join(' / ')}»`;
  }, admin.page);

  await step('step-24', 'обычный разрыв связи сторонами надзорной строки НЕ породил', async () => {
    const before = supervisionRows('true');
    const revoke = await api(owner.page, 'POST', `/api/trainer-club-links/${made.linkPlain}/revoke`, {});
    mustEqual(revoke.status, 200, `обычный разрыв: ${revoke.text}`);
    mustEqual(readDb(`SELECT status FROM trainer_club_links WHERE id = ${made.linkPlain};`), 'revoked', 'статус связи после обычного разрыва');
    await admin.page.waitForTimeout(1_500);

    mustEqual(supervisionRows(aboutSubject('oversight_link_force_revoked', 'link', made.linkPlain)), 0, 'надзорная строка на обычный разрыв');
    mustEqual(supervisionRows('true'), before, 'общее число надзорных строк после обычного разрыва');

    await openQueue(admin.page, 'all', `в базе надзорных строк было и осталось ${before}`);
    mustEqual(
      await queueCards(admin.page).count(),
      before,
      'строк на экране после обычного разрыва',
    );
    return `надзорных строк было и осталось ${before}`;
  }, admin.page);

  // ══════════════ Сценарий 4: одно событие — одна строка на очередь ══════════════
  console.log('\n=== Сценарий 4. Одно событие — одна строка на всю очередь ===');

  await step('step-25', 'первым администратором скрыта публикация', async () => {
    // Живых записей у клуба А больше нет: её стёр администратор на шаге 21.
    await hideThroughModeration(admin.page, 'club', made.clubA, nameA, `${RUN_TAG}: скрытие сценария 4`);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id = ${made.clubA};`), 'hidden', 'статус клуба А');
    made.selfHiddenRowId = supervisionId(aboutSubject('oversight_publication_hidden', 'club', made.clubA));
    must(made.selfHiddenRowId !== '', 'надзорной строки о скрытии клуба А нет');
    return `скрыто первым администратором, строка ${made.selfHiddenRowId}`;
  }, admin.page);

  await step('step-26', 'строка ОДНА и адресована очереди — скрывший видит её тоже', async () => {
    // ⚠️ Утверждение исправлено по итогам первого прогона 11.09.2026. Прежде здесь
    // проверялось «у скрывшего строки нет», и это противоречило решению 5.2:
    // строка ОДНА на всех, а спрятать её от одного зрителя можно только заведя
    // «прочитано для каждого» — то есть ту личную почту, от которой очередь ушла.
    mustEqual(
      supervisionRows(aboutSubject('oversight_publication_hidden', 'club', made.clubA)),
      1,
      'строк о скрытии клуба А в базе',
    );
    mustEqual(
      num(`SELECT count(*) FROM notifications WHERE id = ${made.selfHiddenRowId} AND addressee_kind = 'supervision' AND user_id IS NULL;`),
      1,
      'вид адресата и отсутствие владельца у строки',
    );

    const actor = readDb(`SELECT payload->>'hiddenByUserId' FROM notifications WHERE id = ${made.selfHiddenRowId};`).trim();
    mustEqual(actor, String(adminId), 'кем порождена строка');

    await openQueue(admin.page, 'unresolved', `в базе строка ${made.selfHiddenRowId} одна, адресат — очередь`);
    const card = admin.page.locator(`[data-testid="supervision-item-${made.selfHiddenRowId}"]`);
    mustEqual(await card.count(), 1, 'строка о собственном действии у исполнителя');
    return `строка ${made.selfHiddenRowId} одна, адресат «supervision», владельца нет; скрывший её видит`;
  }, admin.page);

  await step('step-27', 'у второго администратора строка ТА ЖЕ САМАЯ, с тем же номером', async () => {
    await openQueue(admin2.page);
    const card = admin2.page.locator(`[data-testid="supervision-item-${made.selfHiddenRowId}"]`);
    mustEqual(await card.count(), 1, 'строка о чужом действии у второго администратора');
    const text = await card.innerText();
    must(text.includes(nameA), `имя публикации в строке второго: «${text}»`);
    // Копий не завелось: номер один и тот же, и в базе строка по-прежнему одна.
    mustEqual(
      supervisionRows(aboutSubject('oversight_publication_hidden', 'club', made.clubA)),
      1,
      'строк о скрытии после того, как её увидели двое',
    );
    return `оба видят строку ${made.selfHiddenRowId}; копий не завелось`;
  }, admin2.page);

  // ══════════════ Сценарий 5: у человека ничего не изменилось ══════════════
  console.log('\n=== Сценарий 5. У человека ничего не изменилось ===');

  await step('step-28', 'владелец публикации открыл свой кабинет', async () => {
    await owner.page.goto(`${BASE}/profile/me/notifications`, { waitUntil: 'domcontentloaded' });
    await owner.page.waitForTimeout(2_500);
    const me = await whoAmI(owner.page);
    mustEqual(me?.accountKind ?? 'нет', 'person', 'вид учётной записи владельца');
    return 'личная лента кабинета открыта';
  }, owner.page);

  await step('step-29', 'надзорных строк в ленте человека НЕТ', async () => {
    const oversightInMailboxes = num(`
      SELECT count(*) FROM notifications
      WHERE user_id = ${ownerId}
        AND (type LIKE 'oversight_%' OR type = 'publication_recheck_requested');
    `);
    mustEqual(oversightInMailboxes, 0, 'надзорных типов в ящиках человека');
    mustEqual(supervisionRows(`user_id IS NOT NULL`), 0, 'надзорных строк с владельцем-человеком');

    const feed = await api(owner.page, 'GET', '/api/notifications');
    mustEqual(feed.status, 200, `лента человека: ${feed.text}`);
    const leaked = (feed.body?.data?.items ?? []).filter(
      (item) => item.type.startsWith('oversight_') || item.type === 'publication_recheck_requested',
    );
    mustEqual(leaked.length, 0, `надзорных строк в выдаче человека: ${leaked.length}`);

    const html = await owner.page.content();
    must(!html.includes('Публикация скрыта'), 'надзорный текст оказался на экране человека');
    must(!html.includes('Работа от чужого лица'), 'надзорный текст оказался на экране человека');
    return 'ни в базе, ни в выдаче, ни на экране надзорных строк у человека нет';
  }, owner.page);

  await step('step-30', 'значок человека изменился ТОЛЬКО человеческими событиями', async () => {
    // Сводка кабинета — см. пояснение у `ownerBellBefore`: на странице ленты
    // число колокольчика перетирает сама страница, и шаг мерил бы гонку.
    await owner.page.goto(`${BASE}/profile/me/dashboard`, { waitUntil: 'domcontentloaded' });
    const badge = await bellBadge(owner.page);
    const inDb = num(`SELECT count(*) FROM notifications WHERE user_id = ${ownerId} AND read_at IS NULL;`);
    // ⚠️ Оба числа называются в сообщении нарочно. Колокольчик человека обещает
    // «всё, что пришло по всем лицам» (`NotificationBell`: ящик не называется),
    // и разойтись он может ровно с личным ящиком — сравнение только с одним
    // числом оставило бы падение без объяснения.
    const personalInDb = num(
      `SELECT count(*) FROM notifications WHERE user_id = ${ownerId} AND addressee_kind = 'personal' AND read_at IS NULL;`,
    );
    mustBadge(
      badge,
      inDb,
      `значок человека против его непрочитанных в базе (личный ящик ${personalInDb}, все ящики ${inDb})`,
    );
    const oversightUnread = num(`
      SELECT count(*) FROM notifications
      WHERE user_id = ${ownerId} AND read_at IS NULL
        AND (type LIKE 'oversight_%' OR type = 'publication_recheck_requested');
    `);
    mustEqual(oversightUnread, 0, 'надзорных среди непрочитанных человека');

    // ⚠️ Правка 37.75, впервые проверяемая на ЖИВОМ коде (13.09.2026): прогон
    // 12.09 шёл на образе, собранном ДО неё. До правки у поля `unreadCount`
    // общего стора было ДВА писателя с разным смыслом — страница ленты клала
    // число ОТКРЫТОГО ящика, опрос колокольчика число всех ящиков человека,
    // и кто ложился последним, решала гонка ответов. Замер 12.09 дал
    // `3 0 0 3 3 3 3 3` при верных `3 3 3 3 3 3 3 3` на сводке кабинета.
    // Гонка проявлялась ПОВТОРАМИ, поэтому пять заходов, а не один.
    const onFeed = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await owner.page.goto(`${BASE}/profile/me/notifications`, { waitUntil: 'domcontentloaded' });
      onFeed.push(await bellBadge(owner.page));
    }
    must(
      onFeed.every((value) => value === inDb),
      `значок на странице ленты за пять заходов: ${onFeed.join(' ')}, а непрочитанных у человека ${inDb}`,
    );
    // ⚠️ Число САМОЙ страницы — про ящик ОТКРЫТОГО кабинета, и оно другое:
    // личный ящик против всех ящиков. Обязаны быть верны ОБА, каждое о своём, —
    // иначе «один хозяин» чинил бы значок ценой счётчика страницы.
    const pageUnread = Number(
      (await owner.page.locator('[data-testid="notifications-unread-count"]').innerText()).trim(),
    );
    mustEqual(pageUnread, personalInDb, 'число непрочитанных на странице ЛИЧНОЙ ленты');

    return `значок ${badge} (было ${ownerBellBefore}, в базе непрочитанных ${inDb}, было ${ownerUnreadBefore}); надзорных среди них 0; на странице ленты значок ${onFeed.join(' ')} при ${inDb}, счётчик личного ящика ${pageUnread}/${personalInDb}`;
  }, owner.page);

  await step('step-31', 'в каждом кабинете лица видно ТОЛЬКО своё лицо', async () => {
    const faces = (await whoAmI(owner.page))?.faces ?? [];
    must(faces.length >= 3, `лиц у владельца: ${faces.length}, нужно три и более`);
    const names = { club: { [made.clubA]: nameA, [made.clubB]: nameB, [made.clubD]: nameD }, trainer: { [made.trainer]: nameT } };
    const checked = [];

    for (const face of faces) {
      const own = names[face.kind]?.[face.id];
      if (own === undefined) continue;
      await owner.page.goto(`${BASE}/profile/${face.kind}/${face.id}/publications`, { waitUntil: 'domcontentloaded' });
      await owner.page.getByText('Мои публикации').first().waitFor({ timeout: 20_000 });
      await owner.page.waitForTimeout(1_500);
      // ⚠️ Переключатель лиц (`FaceSwitcher`, фаза 35) называет ВСЕ лица человека
      // намеренно — это способ перейти в соседний кабинет, а не утечка. Проверять
      // надо содержимое раздела, поэтому переключатель из текста убирается.
      const html = await owner.page.evaluate(() => {
        const root = document.querySelector('main') ?? document.body;
        const clone = root.cloneNode(true);
        for (const node of clone.querySelectorAll('[data-testid="profile-face-switcher"]')) {
          node.remove();
        }
        return clone.textContent ?? '';
      });
      must(html.includes(own), `кабинет ${face.kind} ${face.id} не показывает своё лицо «${own}»`);

      for (const [kind, map] of Object.entries(names)) {
        for (const [id, other] of Object.entries(map)) {
          if (kind === face.kind && Number(id) === face.id) continue;
          must(!html.includes(other), `в кабинете ${face.kind} ${face.id} видно ЧУЖОЕ лицо «${other}»`);
        }
      }

      checked.push(`${face.kind}:${face.id}`);
    }

    must(checked.length >= 3, `проверено кабинетов: ${checked.length}`);
    return `кабинеты ${checked.join(', ')} показывают только своё лицо`;
  }, owner.page);

  await step('step-32', 'секции «Модерация» в настройках человека БОЛЬШЕ НЕТ', async () => {
    await owner.page.goto(`${BASE}/profile/me/settings`, { waitUntil: 'domcontentloaded' });
    await owner.page.locator('[data-testid="notification-preferences-editor"]').waitFor({ timeout: 20_000 });
    await owner.page.waitForTimeout(1_500);
    mustEqual(
      await owner.page.locator('[data-testid="notification-preferences-group-moderation"]').count(),
      0,
      'секция «Модерация» в настройках',
    );
    const editor = await owner.page.locator('[data-testid="notification-preferences-editor"]').innerText();
    must(!editor.includes('Модерация'), `в редакторе настроек осталось слово «Модерация»: «${editor}»`);
    return 'секции «Модерация» в настройках нет';
  }, owner.page);

  await step('step-33', 'надзорных типов в настройках не появилось', async () => {
    for (const group of ['oversight_admin', 'oversight_catalog', 'oversight_security']) {
      mustEqual(
        await owner.page.locator(`[data-testid="notification-preferences-group-${group}"]`).count(),
        0,
        `надзорная секция ${group} в настройках`,
      );
    }
    for (const type of [
      'publication_recheck_requested',
      'oversight_publication_hidden',
      'oversight_impersonation_started',
      'oversight_login_blocked',
    ]) {
      mustEqual(
        await owner.page.locator(`[data-testid="notification-preferences-toggle-${type}"]`).count(),
        0,
        `галочка надзорного типа ${type}`,
      );
    }
    return 'ни одной надзорной темы и ни одной надзорной галочки в настройках нет';
  }, owner.page);

  // ══════ Сценарий 5a: владелец узнаёт о решении по своей публикации ══════
  // Довесок к фазе 37. До него владелец узнавал о скрытии, только если сам заходил
  // на карточку и видел плашку: публикации нет в каталоге, записи не идут — а человек
  // ждёт и не знает. Плашка отвечает пришедшему спросить; письмо приходит само.
  console.log('\n=== Сценарий 5a. Владелец узнаёт о решении по своей публикации ===');

  // Причина несёт признак прогона: по ней же письмо и ищется на экране.
  const decisionReason = `${RUN_TAG}: уберите телефон из описания`;

  await step('step-33b', 'администратором скрыта публикация владельца прогона с причиной', async () => {
    await hideThroughModeration(admin.page, 'club', made.clubD, nameD, decisionReason);
    mustEqual(readDb(`SELECT status FROM clubs WHERE id = ${made.clubD};`), 'hidden', 'статус клуба Г');
    mustEqual(readDb(`SELECT hidden_kind FROM clubs WHERE id = ${made.clubD};`), 'moderation', 'вид скрытия клуба Г');

    // ⚠️ Адресат письма — ЛИЦО, а не человек: вид адресата `club`, номер лица — сам клуб.
    // У владельца трёх клубов три разных решения иначе легли бы в одну кучу.
    const rowId = readDb(
      `SELECT id FROM notifications WHERE type = 'publication_hidden_for_owner' AND addressee_club_id = ${made.clubD} ORDER BY id DESC LIMIT 1;`,
    ).trim();
    must(rowId !== '', 'письма владельцу о скрытии в базе нет');
    made.ownerHiddenRowId = rowId;
    mustEqual(
      num(
        `SELECT count(*) FROM notifications WHERE id = ${rowId} AND addressee_kind = 'club' AND user_id = ${ownerId};`,
      ),
      1,
      'вид адресата и владелец письма',
    );
    return `клуб Г скрыт, письмо владельцу ${rowId} адресовано лицу club:${made.clubD}`;
  }, admin.page);

  await step('step-33c', 'владелец видит письмо в ящике ТОГО САМОГО лица, причина на экране', async () => {
    await owner.page.goto(`${BASE}/profile/club/${made.clubD}/notifications`, { waitUntil: 'domcontentloaded' });
    await owner.page.waitForTimeout(2_500);
    const card = owner.page.locator(`[data-testid="notification-item-${made.ownerHiddenRowId}"]`);
    mustEqual(await card.count(), 1, 'письмо о скрытии в ящике лица');
    const text = await card.innerText();
    must(text.includes(nameD), `имя публикации в письме: «${text}»`);
    must(/скрыт/i.test(text), `заголовок письма: «${text}»`);
    // Причина — главное в письме: без неё человек не знает, что исправлять.
    must(text.includes(decisionReason), `причины в письме не видно: «${text}»`);
    return `письмо ${made.ownerHiddenRowId} на экране: «${text.split('\n').slice(0, 2).join(' / ')}»`;
  }, owner.page);

  await step('step-33d', 'в письме НЕТ имени администратора — ни в заголовке, ни в тексте', async () => {
    // Решение заказчика: владельцу важна причина, а не фамилия. В журнале
    // и в очереди надзора исполнитель остаётся — проверено шагами 14 и 26.
    const me = await whoAmI(admin.page);
    const adminName = String(me?.name ?? '').trim();
    must(adminName !== '', 'имя администратора не удалось узнать — проверять нечего');

    const text = await owner.page.locator(`[data-testid="notification-item-${made.ownerHiddenRowId}"]`).innerText();
    must(!text.includes(adminName), `имя администратора «${adminName}» в письме: «${text}»`);
    must(!text.includes(ADMIN), `почта администратора в письме: «${text}»`);
    // ⚠️ Искать номер администратора В ТЕКСТЕ бессмысленно: в письме стоит дата
    // («12 сентября 2026 г. в 23:02»), и любая двузначная подстрока в ней совпадёт
    // с чем угодно. Номер проверяется там, где он был бы значением, — в payload.

    // ⚠️ Экрана мало: имени не должно быть и в данных, иначе оно вылезет
    // при первой же правке текста. В надзорной строке `hiddenByUserId` есть —
    // здесь его быть не должно.
    const payload = readDb(`SELECT payload::text FROM notifications WHERE id = ${made.ownerHiddenRowId};`);
    must(!/hiddenByUserId|moderatorId|actorId|actorName/.test(payload), `исполнитель назван в payload: ${payload}`);
    mustEqual(
      num(
        `SELECT count(*) FROM notifications n, jsonb_each_text(n.payload) AS e WHERE n.id = ${made.ownerHiddenRowId} AND e.value = '${adminId}';`,
      ),
      0,
      'номер администратора значением в payload',
    );
    return `ни имени «${adminName}», ни почты, ни номера — ни на экране, ни в payload`;
  }, owner.page);

  await step('step-33e', 'письмо лежит ТОЛЬКО в ящике тронутого лица', async () => {
    // В базе: строк этого типа про этот предмет ровно одна, и она у лица.
    mustEqual(
      num(
        `SELECT count(*) FROM notifications WHERE type = 'publication_hidden_for_owner' AND payload->>'subjectId' = '${made.clubD}';`,
      ),
      1,
      'писем о скрытии клуба Г в базе',
    );
    // ⚠️ Отбор ТОЛЬКО про этот предмет. Первая редакция считала письма этого типа
    // по всей базе и краснела на совершенно верной строке: карточку тренера скрыли
    // шагом 16, и её письмо тоже лежит в ящике лица — только другого.
    mustEqual(
      num(
        `SELECT count(*) FROM notifications WHERE type = 'publication_hidden_for_owner' AND payload->>'subjectId' = '${made.clubD}' AND (addressee_kind <> 'club' OR addressee_club_id IS DISTINCT FROM ${made.clubD});`,
      ),
      0,
      'писем о клубе Г, адресованных не его лицу',
    );

    // На экране: личный ящик и ящики ОСТАЛЬНЫХ лиц письма не показывают.
    const foreign = [
      ['личный', `${BASE}/profile/me/notifications`],
      ['клуб А', `${BASE}/profile/club/${made.clubA}/notifications`],
      ['карточка тренера', `${BASE}/profile/trainer/${made.trainer}/notifications`],
    ];

    for (const [what, url] of foreign) {
      await owner.page.goto(url, { waitUntil: 'domcontentloaded' });
      await owner.page.waitForTimeout(2_500);
      mustEqual(
        await owner.page.locator(`[data-testid="notification-item-${made.ownerHiddenRowId}"]`).count(),
        0,
        `письмо о клубе Г видно в ящике «${what}»`,
      );
      const body = await owner.page.evaluate(() => (document.querySelector('main') ?? document.body).textContent ?? '');
      must(!body.includes(decisionReason), `причина решения по клубу Г видна в ящике «${what}»`);
    }

    return `письмо ${made.ownerHiddenRowId} есть только у лица club:${made.clubD}; личный и два соседних ящика его не показывают`;
  }, owner.page);

  await step('step-33f', 'галочка этого типа в настройках лица ЕСТЬ, но выключить её нельзя', async () => {
    await owner.page.goto(`${BASE}/profile/club/${made.clubD}/settings`, { waitUntil: 'domcontentloaded' });
    await owner.page.locator('[data-testid="notification-preferences-editor"]').waitFor({ timeout: 20_000 });
    await owner.page.waitForTimeout(1_500);

    mustEqual(
      await owner.page.locator('[data-testid="notification-preferences-group-publications"]').count(),
      1,
      'тема «Публикации» в настройках лица',
    );
    const section = await owner.page
      .locator('[data-testid="notification-preferences-group-publications"]')
      .innerText();
    // ⚠️ Сравнение без учёта регистра: подпись темы нарисована `uppercase`,
    // и `innerText` отдаёт её уже заглавными — «ПУБЛИКАЦИИ».
    must(/публикации/i.test(section), `подпись темы: «${section}»`);

    for (const type of ['publication_hidden_for_owner', 'publication_unhidden_for_owner']) {
      const toggle = owner.page.locator(`[data-testid="notification-preferences-toggle-${type}"]`);
      mustEqual(await toggle.count(), 1, `галочка типа ${type}`);
      must(await toggle.isChecked(), `галочка типа ${type} снята`);
      // ⚠️ Публикации нет в каталоге — узнать об этом человек обязан в любом случае.
      must(await toggle.isDisabled(), `галочку типа ${type} дают выключить`);
      const row = await toggle.locator('xpath=ancestor::label[1]').innerText();
      // Пометка, как и подпись темы, нарисована `uppercase` — сравниваем без регистра.
      must(/нельзя отключить/i.test(row), `рядом с ${type} нет пометки о невозможности отключить: «${row}»`);
    }

    // ⚠️ Правка 37.72, впервые проверяемая на ЖИВОМ коде (13.09.2026): вводный
    // текст перестал называть неотключаемыми ТОЛЬКО подтверждения и отмены
    // провайдером. Решения по публикации отключить тоже нельзя — и раз галочки
    // заблокированы, текст обязан объяснить почему, иначе человек читает это
    // как поломку.
    const intro = await owner.page
      .locator('[data-testid="notification-preferences-editor"]')
      .innerText();
    must(
      /решения по вашей публикации/i.test(intro),
      `вводный текст настроек не называет решения по публикации: «${intro.split('\n').slice(0, 4).join(' / ')}»`,
    );

    return 'обе галочки на месте, обе выключить нельзя, и текст называет решения по публикации среди неотключаемых';
  }, owner.page);

  await step('step-33g', 'возврат публикации присылает второе письмо — «вернулась в каталог»', async () => {
    // ⚠️ Возврат подтверждается НАТИВНЫМ окном браузера (`confirm`), а не модалкой:
    // без обработчика клик просто повис бы.
    admin.page.once('dialog', (dialog) => {
      void dialog.accept();
    });
    await admin.page.goto(`${BASE}/service-portal/moderation?type=club&id=${made.clubD}`, {
      waitUntil: 'domcontentloaded',
    });
    await admin.page.getByText('Модерация публикаций').first().waitFor({ timeout: 20_000 });
    await admin.page.getByRole('heading', { name: nameD }).first().waitFor({ timeout: 20_000 });
    await admin.page.getByRole('button', { name: 'Показать', exact: true }).first().click();
    await admin.page.waitForTimeout(3_000);
    // Возврат ставит `published` — то же слово, что у живой публикации каталога.
    mustEqual(readDb(`SELECT status FROM clubs WHERE id = ${made.clubD};`), 'published', 'статус клуба Г после возврата');

    const rowId = readDb(
      `SELECT id FROM notifications WHERE type = 'publication_unhidden_for_owner' AND addressee_club_id = ${made.clubD} ORDER BY id DESC LIMIT 1;`,
    ).trim();
    must(rowId !== '', 'второго письма — о возврате — в базе нет');
    made.ownerUnhiddenRowId = rowId;

    await owner.page.goto(`${BASE}/profile/club/${made.clubD}/notifications`, { waitUntil: 'domcontentloaded' });
    await owner.page.waitForTimeout(2_500);
    const card = owner.page.locator(`[data-testid="notification-item-${rowId}"]`);
    mustEqual(await card.count(), 1, 'письмо о возврате в ящике лица');
    const text = await card.innerText();
    must(text.includes(nameD), `имя публикации во втором письме: «${text}»`);
    must(text.includes('вернулась в каталог'), `текст второго письма: «${text}»`);
    // Оба письма лежат рядом: человек видит и решение, и его отмену.
    mustEqual(
      await owner.page.locator(`[data-testid="notification-item-${made.ownerHiddenRowId}"]`).count(),
      1,
      'первое письмо после возврата',
    );
    return `письмо ${rowId} на экране: «${text.split('\n').slice(0, 2).join(' / ')}»`;
  }, owner.page);

  // ═════════════════════════ Сценарий 6: быстрые переходы ═════════════════════════
  console.log('\n=== Сценарий 6. Быстрые переходы ===');

  await step('step-33a', 'клик по НЕРАЗОБРАННОЙ строке уводит и разбором её не объявляет', async () => {
    await openQueue(admin2.page);
    const row = made.selfHiddenRowId;
    const before = (await queueCounters(admin2.page)).unread;
    const link = admin2.page.locator(`[data-testid="supervision-open-${row}"]`);
    mustEqual(await link.count(), 1, 'переход из строки о скрытой публикации');
    await link.click();
    await admin2.page.waitForTimeout(3_000);

    must(admin2.page.url().includes('/service-portal/moderation'), `увело по адресу ${admin2.page.url()}`);
    mustEqual(
      num(`SELECT count(*) FROM notifications WHERE id = ${row} AND read_at IS NULL;`),
      1,
      'строка осталась неразобранной после перехода',
    );

    await openQueue(admin2.page);
    mustEqual(await admin2.page.locator(`[data-testid="supervision-item-${row}"]`).count(), 1, 'строка в «не разобрано» после перехода');
    mustEqual((await queueCounters(admin2.page)).unread, before, 'число неразобранных после перехода');
    mustBadge(await bellBadge(admin2.page), before, 'значок после перехода');
    return `увело в модерацию, строка цела, не разобрано осталось ${before}`;
  }, admin2.page);

  await step('step-34', 'из строки про скрытую публикацию — раздел модерации С ЭТОЙ публикацией', async () => {
    await openQueue(admin2.page);
    await admin2.page.locator(`[data-testid="supervision-open-${made.selfHiddenRowId}"]`).click();
    await admin2.page.getByText('Модерация публикаций').first().waitFor({ timeout: 20_000 });
    await admin2.page.waitForTimeout(2_500);
    const url = admin2.page.url();
    must(url.includes(`id=${made.clubA}`), `в адресе нет наводки на публикацию: ${url}`);
    const html = await admin2.page.content();
    must(html.includes(nameA), 'публикации, ради которой перешли, в разделе не видно');
    must(html.includes('Из уведомления'), 'наводка на строку не помечена на экране');
    return `раздел открыт с публикацией «${nameA}» и пометкой наводки`;
  }, admin2.page);

  await step('step-35', 'из строки про ЗАПИСЬ перехода нет — и строка объясняется словами', async () => {
    // ⚠️ Утверждение исправлено по итогам первого прогона. Раздела записей
    // в служебной панели нет вовсе, и мёртвая ссылка туда была бы хуже её
    // отсутствия (условие приёмки 16 переформулировано). Проверяем поэтому
    // не переход, а то, что человек понимает строку БЕЗ перехода.
    await openQueue(admin2.page);
    const card = admin2.page.locator(`[data-testid="supervision-item-${made.bookingRowId}"]`);
    mustEqual(await card.count(), 1, 'строка про запись в очереди');
    mustEqual(
      await admin2.page.locator(`[data-testid="supervision-open-${made.bookingRowId}"]`).count(),
      0,
      'мёртвая ссылка в раздел, которого нет',
    );

    const text = await card.innerText();
    must(text.includes('Запись стёрта'), `вид строки: «${text}»`);
    must(text.includes('Занятие А1'), `занятие в строке не названо: «${text}»`);
    must(
      text.includes('Прогон client') || text.includes(E2E_USERS.client),
      `человек в строке не назван: «${text}»`,
    );
    return `перехода нет, строка сама называет и человека, и занятие: «${text.split('\n').slice(0, 4).join(' / ')}»`;
  }, admin2.page);

  await step('step-36', 'из строки про СВЯЗЬ перехода нет — и строка объясняется словами', async () => {
    await openQueue(admin2.page);
    const card = admin2.page.locator(`[data-testid="supervision-item-${made.linkRowId}"]`);
    mustEqual(await card.count(), 1, 'строка про связь в очереди');
    mustEqual(
      await admin2.page.locator(`[data-testid="supervision-open-${made.linkRowId}"]`).count(),
      0,
      'мёртвая ссылка в раздел, которого нет',
    );

    const text = await card.innerText();
    must(text.includes('разорвана принудительно'), `вид строки: «${text}»`);
    must(/отцеплено:\s*\d+/.test(text), `цена разрыва в строке не названа: «${text}»`);
    return `перехода нет, строка называет цену разрыва: «${text.split('\n').slice(0, 4).join(' / ')}»`;
  }, admin2.page);

  await step('step-37', 'из строки про ЧЕЛОВЕКА — переход, человек виден', async () => {
    await openQueue(admin2.page);
    await admin2.page.locator(`[data-testid="supervision-open-${made.userRowId}"]`).click();
    await admin2.page.waitForTimeout(3_000);
    must(admin2.page.url().includes('/service-portal/dashboard'), `увело по адресу ${admin2.page.url()}`);
    // Раздел людей наводки на человека не принимает (`notification-links.ts`),
    // поэтому нужного ищем на экране его же поиском — иначе он лежит не на первой
    // странице и «человек виден» проверялось бы на чужих строках.
    const search = admin2.page.locator('input[placeholder^="Поиск по ID"]').first();
    mustEqual(await search.count(), 1, 'поле поиска в разделе людей');
    await search.fill(E2E_USERS.builder);
    await admin2.page.waitForTimeout(2_000);
    const html = await admin2.page.content();
    must(html.includes(E2E_USERS.builder), 'человек, ради которого перешли, на экране не виден');

    // ⚠️ Правка 37.72, впервые проверяемая на ЖИВОМ коде (13.09.2026).
    // Нулевой номер означает «предмета не существует» — так подписан подбор
    // пароля по НЕСУЩЕСТВУЮЩЕЙ почте (шаг 37.38). Ссылка в раздел людей повела
    // бы искать того, кого нет: мёртвая ссылка хуже её отсутствия. Строки
    // с нулевым номером прогон сам не порождает — заводим её здесь, рядом
    // с контрольной группой (переход выше), иначе «ссылки нет» было бы зелено
    // и в том случае, когда её нет никогда. Уборка уносит строку вместе
    // со всеми надзорными строками прогона.
    // ⚠️ Номер читается `readDbId`, а не `readDb`: psql при `-tAc` печатает следом
    // тег команды («INSERT 0 1»), и ответ целиком разваливает селектор разбором CSS.
    // Разбор живёт в общей фикстуре — следующий прогон получит защиту даром.
    const ghostRowId = readDbId(`
      INSERT INTO notifications (created_at, addressee_kind, type, payload)
      VALUES (now(), 'supervision', 'oversight_login_blocked',
              jsonb_build_object('subjectType', 'user', 'subjectId', 0,
                                 'key', 'email:${RUN_TAG}-net-takogo@test.local',
                                 'accountExists', false))
      RETURNING id;
    `);
    await openQueue(admin2.page);
    mustEqual(
      await admin2.page.locator(`[data-testid="supervision-item-${ghostRowId}"]`).count(),
      1,
      'строка про НЕСУЩЕСТВУЮЩЕГО человека в очереди',
    );
    mustEqual(
      await admin2.page.locator(`[data-testid="supervision-open-${ghostRowId}"]`).count(),
      0,
      'мёртвая ссылка в раздел людей по номеру 0',
    );
    // ⚠️ Строку уносит сама проверка. Реестр планов уборки её не находит
    // по построению — предмета с номером 0 не существует ни в одной таблице, —
    // и без этого она уезжала бы в «добор мимо реестра планов», превращая
    // сторожевое число добора в вечную единицу: следующая настоящая недоубранная
    // строка в нём бы потерялась.
    readDb(`DELETE FROM notifications WHERE id = ${ghostRowId};`);

    return `раздел людей открыт, человек найден на экране; у строки ${ghostRowId} про номер 0 перехода нет`;
  }, admin2.page);

  await step('step-38', 'из строки про СТЁРТУЮ публикацию — понятный ответ, не 404 и не пустой экран', async () => {
    await openQueue(admin2.page);
    const gone = admin2.page.locator(`[data-testid="supervision-gone-${made.deletedRowId}"]`);
    mustEqual(await gone.count(), 1, 'плашка «предмета больше нет» у строки о стирании');
    const note = await gone.innerText();
    must(note.includes('стёрта'), `текст плашки: «${note}»`);
    mustEqual(
      await admin2.page.locator(`[data-testid="supervision-open-${made.deletedRowId}"]`).count(),
      0,
      'у стёртого предмета осталась ссылка в никуда',
    );
    return `на экране: «${note.trim()}»`;
  }, admin2.page);

  // ═════════════════════════ Сценарий 7: отбор в запросе ═════════════════════════
  console.log('\n=== Сценарий 7. Отбор в запросе ===');
  const seeded = { count: 150 };

  await step('step-39', 'прогон засеял 150 надзорных строк разных тем', async () => {
    // Маршрута массового создания в продукте нет и не будет — строки кладёт
    // прогон. Предметы берутся СВОИ: человек прогона и клуб прогона, — иначе
    // уборка их не найдёт и они останутся мусором в живой базе.
    readDb(`
      INSERT INTO notifications (created_at, addressee_kind, type, payload, read_at, read_by_user_id)
      SELECT now() - (g || ' seconds')::interval,
             'supervision',
             CASE g % 3
               WHEN 0 THEN 'oversight_publication_hidden'
               WHEN 1 THEN 'oversight_impersonation_started'
               ELSE 'oversight_login_blocked'
             END,
             CASE g % 3
               WHEN 0 THEN jsonb_build_object('subjectType', 'club', 'subjectId', ${made.clubD},
                                              'publicationName', '${nameD}', 'reason', 'массовый засев прогона')
               WHEN 1 THEN jsonb_build_object('subjectType', 'user', 'subjectId', ${ownerId},
                                              'targetName', 'Прогон builder')
               ELSE jsonb_build_object('subjectType', 'user', 'subjectId', ${ownerId},
                                       'key', 'email:seed', 'accountExists', true)
             END,
             CASE WHEN g % 5 = 0 THEN now() ELSE NULL END,
             CASE WHEN g % 5 = 0 THEN ${adminId} ELSE NULL END
      FROM generate_series(1, ${seeded.count}) AS g;
    `);

    const total = supervisionRows('true');
    must(total >= seeded.count, `надзорных строк после засева: ${total}`);

    feedRequests.length = 0;
    await openQueue(admin.page);
    const counters = await queueCounters(admin.page);
    mustEqual(counters.total, supervisionRows('read_at IS NULL'), 'всего на экране против неразобранных в базе');
    return `в очереди ${total} строк, на экране «не разобрано» ${counters.total}`;
  }, admin.page);

  await step('step-40', 'смена темы меняет АДРЕС ЗАПРОСА, а не фильтрует выданное', async () => {
    feedRequests.length = 0;
    await admin.page.locator('[data-testid="supervision-group-oversight_admin"]').click();
    await admin.page.waitForTimeout(3_000);
    const withGroup = feedRequests.filter((url) => url.includes('group=oversight_admin'));
    must(withGroup.length > 0, `запроса с темой не было; запросы: ${feedRequests.join(' | ') || 'ни одного'}`);
    must(withGroup.some((url) => url.includes('scope=supervision')), 'в запросе темы не назван надзорный ящик');
    return `адрес запроса: ${withGroup[withGroup.length - 1]}`;
  }, admin.page);

  await step('step-41', 'число на экране совпадает с ответом API на тот же отбор', async () => {
    const counters = await queueCounters(admin.page);
    const answer = await api(
      admin.page,
      'GET',
      '/api/notifications?scope=supervision&group=oversight_admin&unreadOnly=true&offset=0&limit=15',
    );
    mustEqual(answer.status, 200, `ответ API на тот же отбор: ${answer.text}`);
    mustEqual(counters.total, answer.body?.data?.total, 'всего на экране против total из ответа');
    mustEqual(counters.unread, answer.body?.data?.unreadCount, 'не разобрано на экране против unreadCount');
    const shown = await queueCards(admin.page).count();
    mustEqual(shown, (answer.body?.data?.items ?? []).length, 'строк на экране против строк в ответе');
    return `экран и API сошлись: всего ${counters.total}, на странице ${shown}`;
  }, admin.page);

  await step('step-42', 'смена состояния тоже уходит в запрос и сходится с API', async () => {
    feedRequests.length = 0;
    await admin.page.locator('[data-testid="supervision-state-resolved"]').click();
    await admin.page.waitForTimeout(3_000);
    must(
      feedRequests.some((url) => url.includes('readOnly=true')),
      `запроса «только разобранные» не было; запросы: ${feedRequests.join(' | ') || 'ни одного'}`,
    );
    const resolvedCounters = await queueCounters(admin.page);
    const resolvedAnswer = await api(
      admin.page,
      'GET',
      '/api/notifications?scope=supervision&group=oversight_admin&readOnly=true&offset=0&limit=15',
    );
    mustEqual(resolvedCounters.total, resolvedAnswer.body?.data?.total, 'всего в состоянии «разобрано»');

    feedRequests.length = 0;
    await admin.page.locator('[data-testid="supervision-state-all"]').click();
    await admin.page.waitForTimeout(3_000);
    must(
      feedRequests.some((url) => !url.includes('readOnly') && !url.includes('unreadOnly')),
      `запроса «все» не было; запросы: ${feedRequests.join(' | ') || 'ни одного'}`,
    );
    const allCounters = await queueCounters(admin.page);
    const allAnswer = await api(
      admin.page,
      'GET',
      '/api/notifications?scope=supervision&group=oversight_admin&offset=0&limit=15',
    );
    mustEqual(allCounters.total, allAnswer.body?.data?.total, 'всего в состоянии «все»');
    return `разобрано ${resolvedCounters.total}, все ${allCounters.total} — экран и API сошлись`;
  }, admin.page);

  await step('step-43', 'вторая страница приходит ЗАПРОСОМ, счётчик страниц — от total', async () => {
    // Тема снимается: у «всех тем» строк заведомо больше одной страницы.
    await admin.page.locator('[data-testid="supervision-group-all"]').click();
    await admin.page.waitForTimeout(3_000);
    const counters = await queueCounters(admin.page);
    must(counters.total > 15, `строк в отборе ${counters.total} — вторую страницу проверять не на чем`);

    feedRequests.length = 0;
    await admin.page.getByRole('button', { name: 'Страница 2' }).click();
    await admin.page.waitForTimeout(3_000);
    must(
      feedRequests.some((url) => url.includes('offset=15')),
      `запроса второй страницы не было; запросы: ${feedRequests.join(' | ') || 'ни одного'}`,
    );
    const range = await admin.page.locator('[data-testid="supervision-page-range"]').innerText();
    must(range.includes('16'), `подпись страницы: «${range}»`);
    must(range.includes(String(counters.total)), `подпись страницы не называет total: «${range}»`);
    const pages = Math.ceil(counters.total / 15);
    const lastVisible = await admin.page.getByRole('button', { name: `Страница ${Math.min(pages, 5)}` }).count();
    must(lastVisible > 0, `в пагинаторе нет номеров страниц, посчитанных от total (${pages} страниц)`);
    return `страница 2 пришла запросом, подпись «${range.trim()}», страниц ${pages}`;
  }, admin.page);

  await step('step-44', 'запрос ленты БЕЗ limit не отдаёт всё', async () => {
    const answer = await api(admin.page, 'GET', '/api/notifications?scope=supervision');
    mustEqual(answer.status, 200, `лента без limit: ${answer.text}`);
    const items = answer.body?.data?.items ?? [];
    const total = answer.body?.data?.total ?? 0;
    must(total > items.length, `отдано ${items.length} строк при total ${total} — лента вернулась целиком`);
    must(items.length <= 100, `страница по умолчанию отдала ${items.length} строк`);
    return `total ${total}, отдано ${items.length}`;
  }, admin.page);

  // ═════════════════════════ Сценарий 8: колокольчик ═════════════════════════
  console.log('\n=== Сценарий 8. Колокольчик ===');

  await step('step-45', 'колокольчик у администратора ЕСТЬ', async () => {
    // ⚠️ Проверяется ШАПКА СЛУЖЕБНОЙ ПАНЕЛИ, а не раздел надзора: вопрос шага —
    // виден ли колокольчик администратору, и ответ на него не должен зависеть
    // от того, открывается ли одна конкретная страница.
    await admin.page.goto(`${BASE}/service-portal/moderation`, { waitUntil: 'domcontentloaded' });
    await admin.page.getByText('Модерация публикаций').first().waitFor({ timeout: 20_000 });
    const bell = admin.page.locator('header button[aria-label^="Уведомления"]');
    mustEqual(await bell.count(), 1, 'кнопка колокольчика в шапке служебной панели');
    must(await bell.isVisible(), 'колокольчик есть в разметке, но не виден');
    return 'колокольчик в шапке администратора на месте';
  }, admin.page);

  await step('step-46', 'в выпадашке — короткий список последних надзорных строк', async () => {
    await openBell(admin.page);
    const items = await admin.page.locator('[data-testid^="notification-bell-item-"]').count();
    must(items > 0 && items <= 5, `строк в выпадашке: ${items}`);
    const dropdown = await admin.page.locator('[data-testid="notification-bell-dropdown"]').innerText();
    must(
      /Публикация скрыта|Работа от чужого лица|Вход заблокирован|Новое лицо|Запись стёрта|Связь разорвана|Публикация стёрта|проверк/i.test(dropdown),
      `в выпадашке нет надзорных строк: «${dropdown}»`,
    );
    await closeBell(admin.page);
    return `в выпадашке ${items} надзорных строк`;
  }, admin.page);

  await step('step-47', 'число в значке совпадает с числом неразобранных в ленте', async () => {
    // Сравнение значка с лентой требует открытой ленты: предыдущие шаги смотрели
    // шапку из раздела модерации, где счётчиков очереди нет.
    await openQueue(admin.page);
    const badge = await bellBadge(admin.page);
    const counters = await queueCounters(admin.page);
    const inDb = supervisionRows('read_at IS NULL');
    mustBadge(badge, counters.unread, 'значок против подписи ленты');
    mustBadge(badge, inDb, 'значок против базы');
    mustEqual(counters.unread, inDb, 'подпись ленты против базы');
    return `значок ${badge === Number.POSITIVE_INFINITY ? '«99+»' : badge}, лента ${counters.unread}, база ${inDb}`;
  }, admin.page);

  await step('step-48', '«Все уведомления» ведёт в очередь надзора, а не в личный кабинет', async () => {
    const dropdown = await openBell(admin.page);
    const link = dropdown.getByRole('link', { name: 'Все уведомления' });
    const href = await link.getAttribute('href');
    mustEqual(href, '/service-portal/notifications', 'адрес ссылки «Все уведомления»');
    await link.click();
    await admin.page.waitForTimeout(3_000);
    const url = admin.page.url();
    must(url.includes('/service-portal/notifications'), `перешли по адресу ${url}`);
    must(!url.includes('/profile/'), `ссылка увела в кабинет человека: ${url}`);
    // Адрес — половина ответа; вторая половина в том, что там что-то показали.
    const html = await admin.page.content();
    must(
      !html.includes('Сервис временно недоступен'),
      `ссылка привела на ${url}, но страница не отрисовалась — БЛОКЕР очереди надзора`,
    );
    return `ссылка ведёт на ${href}, страница открылась`;
  }, admin.page);

  await step('step-49', 'дерево доступности: подписи называют цель, а не врут о ней', async () => {
    // Любая рабочая страница панели: проверяются подписи шапки и меню, а не раздел.
    await admin.page.goto(`${BASE}/service-portal/moderation`, { waitUntil: 'domcontentloaded' });
    await admin.page.getByText('Модерация публикаций').first().waitFor({ timeout: 20_000 });
    await openBell(admin.page);
    const dialog = admin.page.locator('[role="dialog"][aria-label="Последние уведомления"]');
    mustEqual(await dialog.count(), 1, 'подпись выпадашки в дереве доступности');
    const link = dialog.getByRole('link', { name: 'Все уведомления' });
    mustEqual(await link.count(), 1, 'ссылка «Все уведомления» в дереве доступности');
    const name = (await link.getAttribute('aria-label')) ?? (await link.innerText());
    must(!/кабинет/i.test(name), `подпись ссылки обещает кабинет: «${name}»`);
    mustEqual(await link.getAttribute('href'), '/service-portal/notifications', 'цель ссылки');
    await closeBell(admin.page);

    // Подпись счётчика у пункта меню — тот же урок MCP-прогона фазы 35.
    const navLabel = await admin.page
      .locator('nav[aria-label="Разделы admin-панели"] a[href="/service-portal/notifications"] span[aria-label]')
      .first()
      .getAttribute('aria-label');
    must(navLabel !== null && navLabel.includes('очереди надзора'), `подпись счётчика меню: «${navLabel}»`);

    // ⚠️ Две правки 37.72, впервые проверяемые на ЖИВОМ коде (13.09.2026).
    //
    // 1. Подпись колокольчика называет ЧИСЛО. Прежде диктор читал «Уведомления»,
    //    а рядом стоял значок с цифрой, ни к чему не привязанной: услышать
    //    «три» человек мог, а понять, что это непрочитанные, — нет.
    const bellNow = await bellBadge(admin.page);
    const bellLabel = await admin.page
      .locator('header button[aria-label^="Уведомления"]')
      .getAttribute('aria-label');
    if (bellNow === 0) {
      mustEqual(bellLabel, 'Уведомления', 'подпись колокольчика без непрочитанных');
    } else {
      must(
        /^Уведомления, непрочитанных: \d+$/.test(bellLabel ?? ''),
        `подпись колокольчика при непрочитанных (${bellNow}): «${bellLabel}»`,
      );
    }

    // 2. Кнопки строки называют СТРОКУ, а не только действие: три кнопки
    //    «Разобрать» подряд в дереве доступности были неразличимы.
    await openQueue(admin.page, 'unresolved');
    const resolveLabels = await admin.page
      .locator('button[aria-label^="Разобрать: "]')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label')));
    must(resolveLabels.length >= 2, `кнопок «Разобрать» с подписью на экране: ${resolveLabels.length}`);
    must(
      resolveLabels.every((label) => (label ?? '').trim().length > 'Разобрать:'.length + 1),
      `подпись без заголовка строки: ${resolveLabels.slice(0, 3).join(' | ')}`,
    );
    // Различимость — то самое, ради чего правка делалась: одинаковые подписи
    // чинят форму и оставляют болезнь.
    must(
      new Set(resolveLabels).size > 1,
      `все подписи «Разобрать» одинаковы: ${resolveLabels.slice(0, 3).join(' | ')}`,
    );

    return `подпись ссылки «${String(name).trim()}» → ${'/service-portal/notifications'}; счётчик меню: «${navLabel}»; подпись значка «${bellLabel}»; подписей «Разобрать» ${resolveLabels.length}, различных ${new Set(resolveLabels).size}`;
  }, admin.page);

  // ══════════════ Сценарий 9: работа от чужого лица ══════════════
  console.log('\n=== Сценарий 9. Работа от чужого лица ===');

  await step('step-50', 'администратор начал работу от лица владельца', async () => {
    const start = await api(admin.page, 'POST', `/api/auth/impersonate/${ownerId}`, {});
    mustEqual(start.status, 200, `начало работы от чужого лица: ${start.text}`);
    await admin.page.goto(`${BASE}/profile/me/notifications`, { waitUntil: 'domcontentloaded' });
    await admin.page.waitForTimeout(2_500);
    const me = await whoAmI(admin.page);
    mustEqual(me?.id, ownerId, 'личность под работой от чужого лица');
    mustEqual(me?.accountKind ?? 'нет', 'person', 'вид учётной записи под работой от чужого лица');
    return `работаем от лица ${ownerId}`;
  }, admin.page);

  await step('step-51', 'колокольчик показывает ленту ВЛАДЕЛЬЦА, а не служебную', async () => {
    // Сводка кабинета по той же причине, что и в шаге 30: на странице ленты
    // число колокольчика перетирает сама страница числом открытого ящика.
    await admin.page.goto(`${BASE}/profile/me/dashboard`, { waitUntil: 'domcontentloaded' });
    const badge = await bellBadge(admin.page);
    const ownerUnread = num(`SELECT count(*) FROM notifications WHERE user_id = ${ownerId} AND read_at IS NULL;`);
    const ownerPersonal = num(
      `SELECT count(*) FROM notifications WHERE user_id = ${ownerId} AND addressee_kind = 'personal' AND read_at IS NULL;`,
    );
    mustBadge(
      badge,
      ownerUnread,
      `значок под работой от чужого лица против ящика владельца (личный ${ownerPersonal}, все ${ownerUnread})`,
    );
    must(badge !== supervisionRows('read_at IS NULL'), 'значок показывает надзорную очередь вместо ленты владельца');

    const panel = await openBell(admin.page);
    const dropdown = await panel.innerText();
    must(
      !/Работа от чужого лица|Вход заблокирован|Новое лицо в каталоге/.test(dropdown),
      `в выпадашке под чужим лицом видны надзорные строки: «${dropdown}»`,
    );
    const feedLink = panel.getByRole('link', { name: 'Все уведомления' });
    const href = await feedLink.getAttribute('href');
    must(href !== null && href.startsWith('/profile/'), `ссылка ленты под чужим лицом ведёт в ${href}`);
    await closeBell(admin.page);
    return `значок ${badge} равен ящику владельца, лента ведёт в ${href}`;
  }, admin.page);

  await step('step-52', 'вкладка надзора в этот момент НЕДОСТУПНА', async () => {
    const feed = await api(admin.page, 'GET', '/api/notifications?scope=supervision');
    mustEqual(feed.status, 403, `надзорный ящик под чужим лицом: ${feed.status} ${feed.text}`);

    const page = await rawResponse(admin.page, '/service-portal/notifications');
    must(wasRedirected(page), `страница надзора под чужим лицом ответила ${page.status} (${page.type})`);
    await admin.page.goto(`${BASE}/service-portal/notifications`, { waitUntil: 'domcontentloaded' });
    await admin.page.waitForTimeout(2_500);
    must(!admin.page.url().includes('/service-portal/notifications'), `остались на ${admin.page.url()}`);
    const html = await admin.page.content();
    must(!html.includes('Очередь надзора'), 'очередь надзора отрисовалась под чужим лицом');
    return `ящик отвечает 403, страница уводит на ${admin.page.url()}`;
  }, admin.page);

  await step('step-53', 'после возврата служебная лента вернулась', async () => {
    const stop = await api(admin.page, 'POST', '/api/auth/impersonate/stop', {});
    mustEqual(stop.status, 200, `возврат к себе: ${stop.text}`);
    await openQueue(admin.page);
    const me = await whoAmI(admin.page);
    mustEqual(me?.accountKind ?? 'нет', 'admin', 'вид учётной записи после возврата');
    const counters = await queueCounters(admin.page);
    mustEqual(counters.unread, supervisionRows('read_at IS NULL'), 'неразобранных после возврата');
    mustBadge(await bellBadge(admin.page), counters.unread, 'значок после возврата');
    return `служебная лента вернулась: не разобрано ${counters.unread}`;
  }, admin.page);

  // ═════════════════════════ Сценарий 10: отказы ═════════════════════════
  console.log('\n=== Сценарий 10. Отказы ===');
  const victimRow = supervisionId('read_at IS NULL');

  await step('step-54', 'человеку надзорный ящик — 403', async () => {
    const response = await api(client.page, 'GET', '/api/notifications?scope=supervision');
    mustEqual(response.status, 403, `надзорный ящик человеку: ${response.status} ${response.text}`);
    must(!response.text.includes('Публикация скрыта'), 'в теле отказа приехали надзорные строки');
    return `ответ ${response.status}: ${String(response.body?.error ?? '').slice(0, 80)}`;
  }, client.page);

  await step('step-55', 'человеку отметка надзорной строки — 403, НЕ 404', async () => {
    const response = await api(client.page, 'POST', `/api/notifications/${victimRow}/read`, {});
    mustEqual(response.status, 403, `отметка надзорной строки человеком: ${response.status} ${response.text}`);
    mustEqual(num(`SELECT count(*) FROM notifications WHERE id = ${victimRow} AND read_at IS NULL;`), 1, 'строка после чужой отметки');
    return `ответ ${response.status}, строка цела`;
  }, client.page);

  await step('step-56', 'человеку удаление надзорной строки — 403, НЕ 200 с deleted: 0', async () => {
    const response = await api(client.page, 'DELETE', '/api/notifications', { ids: [Number(victimRow)] });
    mustEqual(response.status, 403, `удаление надзорной строки человеком: ${response.status} ${response.text}`);
    mustEqual(num(`SELECT count(*) FROM notifications WHERE id = ${victimRow};`), 1, 'строка после чужого удаления');
    return `ответ ${response.status}, строка цела`;
  }, client.page);

  await step('step-57', 'гостю страница надзора — увод, а не страница', async () => {
    const response = await rawResponse(guest.page, '/service-portal/notifications');
    must(wasRedirected(response), `страница надзора гостю ответила ${response.status} (${response.type})`);
    must(!response.body.includes('Очередь надзора'), 'в теле ответа гостю приехала очередь надзора');
    await guest.page.goto(`${BASE}/service-portal/notifications`, { waitUntil: 'domcontentloaded' });
    await guest.page.waitForTimeout(2_000);
    must(!guest.page.url().includes('/service-portal/notifications'), `гость остался на ${guest.page.url()}`);
    return `ответ ${response.status}, увело на ${guest.page.url()}`;
  }, guest.page);

  await step('step-58', 'гостю надзорный ящик — 401', async () => {
    const response = await api(guest.page, 'GET', '/api/notifications?scope=supervision');
    mustEqual(response.status, 401, `надзорный ящик гостю: ${response.status} ${response.text}`);
    return `ответ ${response.status}`;
  }, guest.page);

  await step('step-59', 'человеку страница надзора — увод, а не пустая страница', async () => {
    const response = await rawResponse(client.page, '/service-portal/notifications');
    must(wasRedirected(response), `страница надзора человеку ответила ${response.status} (${response.type})`);
    must(!response.body.includes('Очередь надзора'), 'в теле ответа человеку приехала очередь надзора');
    await client.page.goto(`${BASE}/service-portal/notifications`, { waitUntil: 'domcontentloaded' });
    await client.page.waitForTimeout(2_000);
    must(!client.page.url().includes('/service-portal/notifications'), `человек остался на ${client.page.url()}`);
    const html = await client.page.content();
    must(!html.includes('Очередь надзора'), 'человеку отрисовалась пустая очередь надзора');
    return `ответ ${response.status}, увело на ${client.page.url()}`;
  }, client.page);

  // ═════════════════════ Сценарий 11: целостность и уборка ═════════════════════
  console.log('\n=== Сценарий 11. Целостность и уборка ===');

  await step('step-60', 'readDb: четыре негодные строки отвергнуты ЖИВОЙ базой', async () => {
    const bad = [
      ['надзорная с владельцем', `INSERT INTO notifications (created_at, addressee_kind, type, payload, user_id) VALUES (now(), 'supervision', 'oversight_login_blocked', '{}'::jsonb, ${ownerId});`],
      ['личная с лицом', `INSERT INTO notifications (created_at, addressee_kind, type, payload, user_id, addressee_club_id) VALUES (now(), 'personal', 'booking_confirmed', '{}'::jsonb, ${ownerId}, ${made.clubA});`],
      ['клубная без клуба', `INSERT INTO notifications (created_at, addressee_kind, type, payload, user_id) VALUES (now(), 'club', 'booking_requested', '{}'::jsonb, ${ownerId});`],
      ['вид адресата вне словаря', `INSERT INTO notifications (created_at, addressee_kind, type, payload, user_id) VALUES (now(), 'oversight', 'booking_confirmed', '{}'::jsonb, ${ownerId});`],
    ];

    const accepted = [];
    for (const [label, sql] of bad) {
      try {
        readDb(sql);
        accepted.push(label);
      } catch (error) {
        const text = String(error.stderr ?? error.message ?? error);
        must(
          /notifications_addressee_shape|notifications_addressee_kind/.test(text),
          `строка «${label}» отвергнута не тем ограничением: ${text.slice(0, 200)}`,
        );
      }
    }

    mustEqual(accepted.length, 0, `живая база приняла негодные строки: ${accepted.join(', ')}`);
    return 'все четыре негодные формы отвергнуты ограничениями живой базы';
  }, admin.page);

  await step('step-61', 'уборка не оставляет сирот после стирания предмета', async () => {
    // Стираем публикацию, на которую ссылается надзорная строка, и прогоняем
    // НАСТОЯЩУЮ уборку — тот же реестр планов, что зовёт `cleanupRun()`.
    const erase = await api(admin.page, 'DELETE', `/api/clubs/${made.clubD}`, undefined);
    mustEqual(erase.status, 200, `стирание клуба Г: ${erase.text}`);
    mustEqual(erase.body?.data?.outcome, 'deleted', 'исход стирания');
    mustEqual(num(`SELECT count(*) FROM clubs WHERE id = ${made.clubD};`), 0, 'клуб Г в базе');
    erased.push({ type: 'club', ids: [made.clubD] });

    const before = supervisionRows(`payload->>'subjectId' = '${made.clubD}'`);
    must(before > 0, 'надзорных строк про стёртую публикацию нет — проверять нечего');

    // ⚠️ Номер стёртой публикации приезжает в уборку ПАРАМЕТРОМ `subjects`,
    // а не выводится из таблицы `clubs`: её там уже нет. Без этого строка про
    // стирание осталась бы в живой базе навсегда — своим списком номеров уборка
    // её не находит по построению.
    //
    // ⚠️ Каждый оператор зовётся отдельно и ошибка запоминается, а не роняет шаг
    // на первом же операторе: иначе сломанный оператор скрыл бы главный вопрос
    // шага — остались ли сироты.
    const broken = [];
    for (const statement of cleanupStatements(
      cleanupPlans({
        clubIds: [],
        trainerIds: [],
        userIds: [],
        subjects: [{ type: 'club', ids: [made.clubD] }],
      }),
    )) {
      try {
        readDb(statement);
      } catch (error) {
        broken.push(`${statement.slice(0, 60)}… → ${String(error.stderr ?? error.message ?? error).trim().split('\n')[0]}`);
      }
    }

    const orphans = supervisionRows(
      `payload->>'subjectType' IN ('club','trainer') AND payload->>'subjectId' = '${made.clubD}'`,
    );
    must(broken.length === 0, `реестр планов выдал негодные операторы: ${broken.join(' | ')}`);
    mustEqual(orphans, 0, `сирот про стёртую публикацию ${made.clubD} осталось ${orphans} (было ${before})`);
    return `строк про стёртый предмет было ${before}, после уборки по subjects — 0`;
  }, admin.page);

  await shutdown();
}

/** Отчёт по формату скила: таблица шагов, падения, окружение. */
function writeReport() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `phase-37-${stamp}.md`);

  const pass = results.filter((row) => row.status === 'pass').length;
  const fail = results.filter((row) => row.status === 'fail').length;
  const skipped = results.filter((row) => row.status === 'skip').length;

  const icon = { pass: '✅ passed', fail: '❌ failed', skip: '⏭ skipped' };
  const rows = results
    .map(
      (row) =>
        `| ${row.id} | ${row.title} | ${icon[row.status]} | ${row.ms ? `${(row.ms / 1000).toFixed(1)}s` : '—'} | ${String(row.detail).replace(/\|/g, '/').replace(/\n/g, ' ')} |`,
    )
    .join('\n');

  const failures = results
    .filter((row) => row.status === 'fail')
    .map(
      (row) =>
        `### ${row.id} — ${row.title}\n\n- **Ожидалось:** по чек-листу\n- **Получено:** ${row.detail}\n- **Снимок:** ${row.shot || '—'}\n`,
    )
    .join('\n');

  fs.writeFileSync(
    file,
    `# E2E Report: Phase 37 — надзорная лента администратора\n\n` +
      `**Дата:** ${new Date().toISOString()}\n` +
      `**Чек-лист:** tests/checklists/phase-37-oversight.md\n` +
      `**Признак прогона:** ${RUN_TAG}\n` +
      `**Итог:** ${fail === 0 ? '✅ PASSED' : '❌ FAILED'} (${pass} прошло, ${fail} упало, ${skipped} не прогонялось)\n\n` +
      `## Таблица шагов\n\n| ID | Описание | Статус | Длительность | Заметки |\n| --- | --- | --- | --- | --- |\n${rows}\n\n` +
      (failures ? `## Падения\n\n${failures}\n` : '## Падений нет\n') +
      `\n## Окружение\n\n- Node: ${process.version}\n- Playwright: библиотека, Chromium headless\n- Стенд: ${BASE} (контейнеры \`npm run app:up\`)\n`,
    'utf8',
  );

  return { file, pass, fail, skipped };
}

let exitCode = 0;

try {
  await main();
} catch (error) {
  console.error('прогон прерван:', error);
  results.push({ id: 'run', title: 'прогон прерван', status: 'fail', detail: String(error.message ?? error), ms: 0 });
  exitCode = 2;
  await shutdown();
} finally {
  // ⚠️ Уборка обязана случиться и после падения: иначе прогон оставляет в живой
  // базе людей, публикации, записи и надзорные строки — ровно тот мусор,
  // ради которого заведён step-62.
  //
  // ⚠️ СТЁРТЫЕ предметы убираются ПЕРВЫМИ и отдельным заходом. `cleanupRun()`
  // выводит номера из таблиц — а стёртых публикаций и записей там уже нет,
  // и назвать их можно только списком, запомненным до удаления. Параметра
  // `subjects` у самой `cleanupRun()` нет, поэтому заход делает прогон.
  const subjectsCleaned = [];
  if (erased.length > 0) {
    const runUserIds = readDb(`SELECT id FROM users WHERE email LIKE '${RUN_TAG}-%';`)
      .split('\n')
      .filter(Boolean)
      .map(Number);

    for (const statement of cleanupStatements(
      cleanupPlans({ clubIds: [], trainerIds: [], userIds: runUserIds, subjects: erased }),
    )) {
      readDb(statement);
    }

    subjectsCleaned.push(...erased.map((subject) => `${subject.type}:${subject.ids.join(',')}`));
    console.log(`\nУборка стёртых предметов: ${subjectsCleaned.join(' ')}`);
  }

  // ⚠️ `cleanupRun()` берётся в try/catch как страховка, а не как обход дефекта.
  // Первый прогон 11.09.2026 нашёл, что реестр планов собирал `DELETE FROM undefined`
  // и рвал цикл ДО уборки людей; дефект закрыт. Страховка оставлена: уборка —
  // последнее, что отделяет прогон от превращения в источник мусора, и падать
  // ей нельзя молча.
  let cleanupError = '';
  try {
    // ⚠️ Стёртые предметы называются и здесь: у `cleanupRun()` для них есть
    // параметр `subjects`. Заход выше уже унёс их своим списком операторов —
    // повтор идемпотентен и страхует от расхождения двух путей уборки.
    const cleaned = cleanupRun({ subjects: erased });
    console.log(`Уборка: людей ${cleaned.users}, клубов ${cleaned.clubs}, карточек ${cleaned.trainers}`);
  } catch (error) {
    cleanupError = String(error.stderr ?? error.message ?? error).slice(0, 200);
    console.log(`\n⚠️ cleanupRun() упал: ${cleanupError}`);
    console.log('Уборка идёт запасным путём — тем же порядком «лист → корень».');
    fallbackCleanup();
  }

  // ⚠️ Добор по ОКНУ прогона — теперь это ПРОВЕРКА, а не основной путь уборки.
  // Надзорные строки про стёртые предметы должен был унести заход по `subjects`
  // выше; если добор что-то нашёл, значит уборка неполна, и число попадёт в отчёт.
  const swept = num(
    `WITH d AS (DELETE FROM notifications WHERE addressee_kind = 'supervision' AND id > ${startMaxNotificationId} RETURNING 1) SELECT count(*) FROM d;`,
  );
  if (swept > 0) console.log(`⚠️ Добор надзорных строк мимо реестра планов: ${swept}`);
  else console.log('Добор не понадобился: реестр планов унёс все надзорные строки прогона.');

  // ⚠️ Найдено перепрогоном 13.09.2026: реестр планов уборки НЕ уносит ДВЕ
  // разновидности строк журнала, и каждый заход оставлял их в живой базе.
  //
  //  • Строки про ЛЮДЕЙ прогона — `admin_impersonate_start` / `_stop`
  //    и `admin_password_change`. Исполнителем там ЖИВОЙ администратор, а не
  //    человек прогона, поэтому условие `actor_id = ANY(users)` их не ловит;
  //    предмета `(entity_type = 'user' AND entity_id = ANY(users))` в плане нет.
  //  • Строку про принудительно разорванную СВЯЗЬ: план ищет
  //    `entity_type = 'link'`, а приложение пишет `trainer_club_link` —
  //    условие не совпадает НИКОГДА, то есть клауза мертва по написанию.
  //    В живой базе `logs.entity_type` принимает только `trainer_club_link`.
  //
  // Настоящее место правки — `scripts/cleanup-publications.mjs`; здесь прогон
  // убирает ТОЛЬКО за собой.
  //
  // ⚠️ Отбор — ОКНО прогона плюс «предмета больше нет». Окно отделяет свои
  // строки от чужих; осиротевший предмет отделяет мусор от живого следа:
  // строка живого администратора о ЖИВОЙ публикации предмет сохраняет
  // и остаётся на месте. Отбор всегда ПАРОЙ «тип + номер» — `logs.entity_id`
  // полиморфен, внешнего ключа нет, и число 169 в нём значит связь, человека
  // или запись в зависимости от `entity_type` (решение заказчика 17 фазы 36).
  const runLogWhere = `id > ${startMaxLogId} AND (
        meta::text LIKE '%${RUN_TAG}-%'
        OR (entity_type = 'user' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = logs.entity_id))
        OR (entity_type = 'club' AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.id = logs.entity_id))
        OR (entity_type = 'trainer' AND NOT EXISTS (SELECT 1 FROM trainers t WHERE t.id = logs.entity_id))
        OR (entity_type = 'booking' AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id = logs.entity_id))
        OR (entity_type = 'trainer_club_link'
            AND NOT EXISTS (SELECT 1 FROM trainer_club_links k WHERE k.id = logs.entity_id))
      )`;
  const logsSwept = num(
    `WITH d AS (DELETE FROM logs WHERE ${runLogWhere} RETURNING 1) SELECT count(*) FROM d;`,
  );
  console.log(`Уборка строк журнала о предметах прогона: ${logsSwept}`);

  // step-62: мусора в живой базе не прибавилось, служебной записи прогона нет.
  const leftAdmins = secondAdminRows();
  const leftPeople = num(`SELECT count(*) FROM users WHERE email LIKE '${RUN_TAG}-%';`);
  const leftSupervision = num(`SELECT count(*) FROM notifications WHERE addressee_kind = 'supervision';`);
  // ⚠️ Ожидается НОЛЬ, а не число до прогона, и это не смягчение проверки.
  // Сценарий 2 опустошает очередь НАМЕРЕННО: step-12b отмечает разобранным всё,
  // step-13 удаляет разобранное и требует «лента очистилась». Строки, лежавшие
  // в живой очереди до прогона, этого не переживают по построению — и сверка
  // с их числом краснела бы на совершенно правильной уборке. Найдено прогоном
  // 12.09.2026: до него в очереди лежали четыре строки прошлой сессии.
  //
  // Вопрос шага от этого не смягчается, а ужесточается: после прогона надзорных
  // строк не должно остаться НИ ОДНОЙ — ни своей, ни доставшейся по наследству.
  const expectedSupervision = 0;

  // ⚠️ Журнал попал в проверку перепрогоном 13.09.2026. До этого step-62 смотрел
  // на людей, служебные записи и надзорные строки — и шесть строк журнала
  // на каждый заход оставались невидимы для него по построению.
  const leftLogs = num(`SELECT count(*) FROM logs WHERE ${runLogWhere};`);
  const cleanOk =
    leftAdmins === 0 && leftPeople === 0 && leftSupervision === expectedSupervision && leftLogs === 0;
  results.push({
    id: 'step-62',
    title: 'после прогона мусора в живой базе не прибавилось',
    status: cleanOk ? 'pass' : 'fail',
    detail:
      (cleanOk
        ? `людей прогона 0, служебных записей прогона 0, надзорных строк ${leftSupervision} (до прогона было ${startSupervisionTotal}, очередь опустошена сценарием 2), строк журнала о прогоне 0 (снято ${logsSwept}); стёртые предметы убраны по subjects (${subjectsCleaned.join(' ') || 'нет'}), добором снято ${swept}`
        : `людей прогона ${leftPeople}, служебных записей прогона ${leftAdmins}, надзорных строк ${leftSupervision} против ${expectedSupervision}, строк журнала о прогоне ${leftLogs}`) +
      (cleanupError === '' ? '' : `; ⚠️ cleanupRun() упал: ${cleanupError.replace(/\n/g, ' ')}`),
    ms: 0,
  });
  console.log(`  ${cleanOk ? '✅' : '❌'} step-62 — людей ${leftPeople}, служебных ${leftAdmins}, надзорных ${leftSupervision}/${expectedSupervision}, журнальных ${leftLogs}/0`);

  const report = writeReport();
  console.log(`Итог: ${report.pass} прошло, ${report.fail} упало, ${report.skipped} не прогонялось.`);
  console.log(`Отчёт: ${report.file}`);
  process.exit(exitCode === 2 ? 2 : report.fail > 0 ? 1 : 0);
}
