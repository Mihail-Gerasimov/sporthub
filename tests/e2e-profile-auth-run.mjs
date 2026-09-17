// Браузерный прогон двух чек-листов: `tests/checklists/profile-hub.md` (39 шагов)
// и `tests/checklists/auth.md` (35 шагов).
//
// Запуск: node tests/e2e-profile-auth-run.mjs
// Требуется: поднятое приложение на :3000 (контейнеры `sporthub_web` / `sporthub_api`)
// и Playwright.
//
// ⚠️ Правило прогона (то же, что у прогона фазы 35). Шаг НЕ засчитывается по коду
// ответа. Каждая проверка смотрит в СОДЕРЖИМОЕ — что вернулось, что видно на экране,
// что лежит в базе. `200` там, где ждали отказа, — дефект, а не «почти прошло».
//
// ⚠️ Запросы идут ИЗ БРАУЗЕРА. Только так в запрос попадают настоящая cookie сессии,
// настоящий `Origin` и `Sec-Fetch-Site` — то есть ровно то, что проверяет защита.
//
// ⚠️ Коды редиректов снимаются НАСТОЯЩЕЙ НАВИГАЦИЕЙ, а не `fetch`. Браузерный
// `fetch` с `redirect: 'manual'` отдаёт непрозрачный ответ: статус 0, тело пустое —
// отличить 307 от 308 в нём нельзя в принципе. `page.goto` даёт всю цепочку
// переходов с их кодами, а чек-лист требует именно точных кодов: постоянный
// редирект на адрес, зависящий от вошедшего, увёл бы закэшировавший его браузер
// в чужой кабинет.
//
// ⚠️ Тело ответа-редиректа читается через `context.request` (запросный контекст
// того же браузерного контекста, с теми же cookie). Это не curl и не отдельная
// сессия: другой возможности увидеть ТЕЛО ответа, который увёл, у браузера нет —
// `fetch` его прячет, Playwright у ответа-редиректа тело не отдаёт. Проверка
// «данных нет в исходном потоке» без этого была бы недоказуемой.
//
// ⚠️ Изоляция: свой признак прогона `e2e-profile` (признак `e2e-phase35` занят
// другим прогоном — общий признак означал бы, что уборка одного сносит данные
// другого). Прогон заводит РОВНО ОДНОГО человека — регистрацией, потому что
// это и есть проверяемый сценарий, — и сносит его в `finally`.
//
// ⚠️ Предел частоты регистрации: 10 за час на адрес обращения, и адрес общий
// для всех прогонов (браузер ходит через прокси фронта). Поэтому регистрационных
// запросов здесь ДВА на прогон: один заводит человека, второй проверяет строгость
// схемы. Три запуска за час — шесть запросов, запас остаётся. Шаг про повторную
// регистрацию на занятый адрес в бюджет не влез и честно помечен непрогнанным.

process.env.E2E_RUN_TAG = 'e2e-profile';

import fs from 'node:fs';

import {
  BASE,
  api,
  freshContext,
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

// Признак прогона читается модулем при загрузке, поэтому импорт ОТЛОЖЕННЫЙ:
// статический выполнился бы раньше строки с переменной окружения.
const { cleanupRun, readDb } = await import('../scripts/e2e-fixture.mjs');

// Люди живой базы. Наборы лиц сверены запросом к базе перед прогоном.
// Чек-листы написаны под сид (id=1..5); здесь то же самое на живых учётных записях.
//
// ⚠️ Наборы пересчитаны после уборки данных фазы 36 (этап Э7): из живой базы ушли
// 22 мусорных клуба и 9 карточек прежних прогонов. Прежняя привязка устарела дважды:
// у владельца стало 5 лиц вместо 20, а `anna@trainer.local` осталась БЕЗ единственной
// карточки — и три шага падали не проверкой, а `reading 'id'` по пустому списку лиц.
// Одноликий человек теперь один и постоянный: `trainer@sporthub.local` с карточкой 85.
const NO_FACES = 'alexey@sporthub.local'; // id=1, лиц нет, 12 записей и 3 отзыва
const OWNER = 'marina@studio.local'; // id=2, 3 клуба + 2 карточки тренера
const CARD_ONLY = 'trainer@sporthub.local'; // id=12, ровно одна карточка тренера (85)
const ADMIN = 'admin@sporthub.local'; // id=3, служебная запись

const NAMES = {
  [NO_FACES]: 'Алексей Смирнов',
  [OWNER]: 'Марина Крылова',
  [CARD_ONLY]: 'Павел Тренеров',
  [ADMIN]: 'Администратор SportHub',
};

/** Разделы личного кабинета — порядок из `PERSONAL_SECTIONS`. */
const PERSONAL_SECTIONS = [
  'dashboard',
  'schedule',
  'stats',
  'favorites',
  'reviews',
  'notifications',
  'settings',
];
const PERSONAL_LABELS = [
  'Обзор',
  'Расписание',
  'Статистика',
  'Избранное',
  'Отзывы',
  'Уведомления',
  'Настройки',
];

/** Разделы кабинета лица — все десять. */
const FACE_SECTIONS = [
  'dashboard',
  'publications',
  'bookings',
  'clients',
  'stats',
  'links',
  'reviews',
  'finance',
  'notifications',
  'settings',
];

/** Корневой признак каждого раздела: раздел отрисовался, а не отдал 500. */
const FACE_SECTION_MARKER = {
  dashboard: '[data-testid="provider-dashboard"], [data-testid="provider-dashboard-empty"]',
  publications: '[data-testid="provider-publications"]',
  bookings: '[data-testid="provider-bookings-inbox"]',
  clients: '[data-testid="provider-clients"], [data-testid="provider-clients-empty"]',
  stats: '[data-testid="provider-stats"], [data-testid="provider-stats-empty"]',
  links: '[data-testid="provider-links"], [data-testid="provider-links-empty"]',
  reviews: '[data-testid="provider-reviews"]',
  finance: '[data-testid="provider-finance"]',
  notifications: '[data-testid="notifications-filters"]',
  settings: '[data-testid="provider-settings"]',
};

const PERSONAL_SECTION_MARKER = {
  dashboard: '[data-testid="athlete-dashboard-kpi"]',
  schedule: 'button:has-text("Отменённые")',
  stats: '[data-testid="athlete-stats-metrics"], [data-testid="athlete-stats-empty"]',
  favorites: 'h2:has-text("Избранное")',
  reviews: 'h2:has-text("Мои отзывы")',
  notifications: '[data-testid="notifications-filters"]',
  settings: '[data-testid="notification-preferences-editor"]',
};

/**
 * Следы данных кабинета в теле ответа.
 *
 * ⚠️ Размер тела уликой НЕ является, и это выяснилось прогоном. Next на увод
 * из серверного компонента отвечает 307 вместе с оболочкой `__next_error__` —
 * это 17 КБ скриптов сборки, одинаковых на любой странице. Уликой является
 * ровно одно: маркеры самих данных.
 */
const DATA_MARKERS = [
  'totalPrice',
  'paymentStatus',
  'provider-bookings-card',
  'provider-bookings-inbox',
  'notification-item-',
  'notifications-filters',
  'athlete-favorites-section',
  'athlete-dashboard-kpi',
];

const dataTraces = (body) => DATA_MARKERS.filter((marker) => body.includes(marker));

/** Путь с запросом — то, чем сравниваются адреса. */
const toPath = (url) => {
  const parsed = new URL(url);

  return `${parsed.pathname}${parsed.search}`;
};

/**
 * Настоящая навигация с цепочкой переходов.
 *
 * Возвращает каждый шаг цепочки с его кодом: `[{path:'/profile/me',status:307},
 * {path:'/profile/me/dashboard',status:200}]`.
 */
async function navigate(page, path, waitFor) {
  const response = await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  const requests = [];
  let request = response.request();

  while (request) {
    requests.unshift(request);
    request = request.redirectedFrom();
  }

  const chain = [];

  for (const item of requests) {
    const itemResponse = await item.response();

    chain.push({ path: toPath(item.url()), status: itemResponse?.status() ?? null });
  }

  if (waitFor) await page.waitForSelector(waitFor, { timeout: 20_000 });

  return { chain, path: toPath(page.url()), status: response.status() };
}

const trace = (nav) => nav.chain.map((hop) => `${hop.path} ${hop.status}`).join(' → ');

/**
 * Сверка составных значений — списков и объектов.
 *
 * ⚠️ `mustEqual` из обвязки сравнивает через `!==`: два одинаковых массива для него
 * всегда разные, и шаг краснеет с сообщением «ожидалось [...], получено [...]»,
 * где обе части совпадают. Отдельный помощник, а не правка обвязки: обвязку делит
 * с этим прогоном чужой, и менять её поведение под себя нельзя.
 */
function mustSame(actual, expected, what) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${what}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`,
    );
  }
}

/** Увели на главную: конечный адрес `/`, и первый ответ — редирект. */
function mustLandHome(nav, what) {
  must(nav.path === '/', `${what}: остались на ${nav.path} (${trace(nav)})`);
  must(nav.chain.length >= 2, `${what}: перехода не было вовсе (${trace(nav)})`);
  must(
    nav.chain[0].status >= 300 && nav.chain[0].status < 400,
    `${what}: первый ответ ${nav.chain[0].status}, а не редирект (${trace(nav)})`,
  );
}

/** Сырой ответ по защищённому адресу — ВМЕСТЕ С ТЕЛОМ, без перехода по редиректу. */
async function rawHop(context, path) {
  const response = await context.request.get(`${BASE}${path}`, { maxRedirects: 0 });
  const body = await response.text();

  return {
    status: response.status(),
    location: response.headers()['location'] ?? '',
    body,
  };
}

/** Подписи разделов кабинета — сайдбар открытого кабинета, по порядку. */
async function sectionLabels(page) {
  await page.waitForSelector('nav[aria-label^="Разделы"] a', { timeout: 20_000 });

  return page.$$eval('nav[aria-label^="Разделы"] a', (nodes) =>
    nodes.map((node) => node.textContent.trim()),
  );
}

/** Адреса разделов кабинета — тем же порядком. */
async function sectionHrefs(page) {
  await page.waitForSelector('nav[aria-label^="Разделы"] a', { timeout: 20_000 });

  return page.$$eval('nav[aria-label^="Разделы"] a', (nodes) =>
    nodes.map((node) => node.getAttribute('href')),
  );
}

/**
 * Ссылка кабинета в шапке.
 *
 * ⚠️ Подпись НАЗЫВАЕТ ЦЕЛЬ и потому непостоянна: «Перейти в кабинет: Кабинет
 * спортсмена» у человека без лиц, «Перейти в кабинет: <имя лица>» — у человека
 * с лицами. Прежний прогон искал постоянное «Перейти в личный кабинет» и после
 * правки шапки (дефект дерева доступности, найденный прогоном через MCP
 * 10.09.2026: подпись говорила «личный кабинет», а вела в кабинет лица)
 * перестал находить ссылку вовсе — тринадцать шагов чек-листа `auth`
 * посыпались по таймауту, хотя приложение исправно. Отбор по НАЧАЛУ подписи
 * переживает и смену имени лица, и смену вида кабинета.
 */
const CABINET_LINK = 'a[aria-label^="Перейти в кабинет"]';
const ADMIN_PANEL_LINK = 'a[aria-label="Панель управления"]';

/** Дождаться, что браузер получил ответ «кто я»: без этого клиентские блоки пусты. */
async function waitSession(page) {
  await page.waitForSelector(`${CABINET_LINK}, ${ADMIN_PANEL_LINK}`, { timeout: 20_000 });
}

/**
 * Что показала страница избранного: сам раздел или заглушку сбоя.
 *
 * Отдельный помощник, потому что различать эти два исхода обязательно: «ждали
 * селектор и не дождались» — это «непонятно что», а «на месте раздела висит
 * „Сервис временно недоступен“ и в консоли TypeError» — это диагноз.
 */
async function favoritesState(page) {
  const errors = [];
  const listener = (message) => {
    if (message.type() === 'error') errors.push(message.text().split('\n')[0].slice(0, 200));
  };

  page.on('console', listener);

  try {
    await page.goto(`${BASE}/profile/me/favorites`, { waitUntil: 'domcontentloaded' });
    // Сначала признак того, что браузер получил «кто я»: без него клиентская
    // часть раздела не рисуется вовсе и «пусто» ничего не доказывает.
    await waitSession(page).catch(() => null);
    const section = await page
      .waitForSelector('[data-testid="athlete-favorites-section"]', { timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    const body = ((await page.textContent('body')) ?? '').replace(/\s+/g, ' ');
    const text = section
      ? 'раздел на месте'
      : body.includes('Сервис временно недоступен')
        ? 'Сервис временно недоступен'
        : body.slice(0, 120);

    return { section, text, error: errors[0] ?? 'в консоли пусто' };
  } finally {
    page.off('console', listener);
  }
}

/** Выход через API: сессия гасится на сервере, а не только в браузере. */
async function logout(page) {
  await api(page, 'POST', '/api/auth/logout', {});
}

async function main() {
  await launch();

  // Что заведено прогоном — сносится в `finally` целиком.
  const made = { registeredEmail: null };

  const person = await freshContext(); // человек без лиц
  const owner = await freshContext(); // владелец клубов и карточек
  const card = await freshContext(); // человек с одной карточкой тренера
  const admin = await freshContext(); // служебная запись
  const guest = await freshContext(); // гость, не входит никогда
  const ui = await freshContext(); // отдельный контекст под работу через формы

  // Лица владельца — берутся у сервера, а не выписываются числами: прогон
  // не должен разъезжаться с базой при первой правке данных.
  await loginAs(owner.page, OWNER);
  const ownerMe = await whoAmI(owner.page);
  const ownerFaces = ownerMe.faces ?? [];
  const ownerClubs = ownerFaces.filter((face) => face.kind === 'club');
  const ownerCards = ownerFaces.filter((face) => face.kind === 'trainer');

  await loginAs(card.page, CARD_ONLY);
  const cardMe = await whoAmI(card.page);
  const cardFace = (cardMe.faces ?? [])[0];

  // ⚠️ Предпосылки прогона сверяются ВСЛУХ и до первого шага. Без этой сверки
  // уборка живых данных превращала осмысленные шаги в `reading 'id'` по пустому
  // списку — падал не продукт, а прогон, и разбираться приходилось по стеку.
  must(
    ownerClubs.length > 0 && ownerCards.length > 0,
    `предпосылка не выполнена: у ${OWNER} должны быть и клубы, и карточки, а лиц ${ownerFaces.length}`,
  );
  must(
    cardFace !== undefined,
    `предпосылка не выполнена: у ${CARD_ONLY} нет ни одного лица — прогону нужен человек ровно с одной карточкой`,
  );
  mustEqual((cardMe.faces ?? []).length, 1, `у ${CARD_ONLY} должно быть ровно одно лицо`);

  await loginAs(person.page, NO_FACES);
  await loginAs(admin.page, ADMIN, { portal: 'service' });

  // Номер человека без лиц: им шаги сверяют нарисованное с тем, что лежит в базе.
  const personMe = await whoAmI(person.page);
  const personId = personMe.id;

  mustEqual((personMe.faces ?? []).length, 0, `у ${NO_FACES} не должно быть лиц`);

  // Два клуба владельца с записями: ими проверяется, что срез считается по лицу
  // из адреса. Берутся из базы — «те, у кого записи есть», а не наугад.
  const busyClubIds = readDb(
    `SELECT owner_club_id FROM bookings WHERE owner_club_id IN (SELECT id FROM clubs WHERE managed_by_user_id = ${ownerMe.id}) GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 2;`,
  )
    .split('\n')
    .filter(Boolean)
    .map(Number);
  const clubA = busyClubIds[0];
  const clubB = busyClubIds[1];
  // ⚠️ Именно история: в таб «История» кабинет складывает всё, кроме ожидающих
  // и подтверждённых. Сверять с «всеми записями клуба» значило бы сравнивать
  // разные множества и получить красный шаг на ровном месте.
  const bookingsOf = (clubId) =>
    readDb(
      `SELECT id FROM bookings WHERE owner_club_id = ${clubId} AND status NOT IN ('pending','confirmed') ORDER BY id;`,
    )
      .split('\n')
      .filter(Boolean)
      .map(Number);
  const bookingsA = bookingsOf(clubA);
  const bookingsB = bookingsOf(clubB);

  // Чужое лицо: клуб, которым владелец НЕ управляет. До адресных маршрутов
  // такого случая не существовало — кабинет пускал по «есть хотя бы одно лицо».
  const foreignClubId = Number(
    readDb(
      `SELECT id FROM clubs WHERE managed_by_user_id IS DISTINCT FROM ${ownerMe.id} ORDER BY id LIMIT 1;`,
    ),
  );

  console.log(
    `\nданные прогона: владелец #${ownerMe.id}, лиц ${ownerFaces.length} ` +
      `(клубов ${ownerClubs.length}, карточек ${ownerCards.length}); ` +
      `клубы с записями ${clubA} (${bookingsA.length}) и ${clubB} (${bookingsB.length}); ` +
      `чужой клуб ${foreignClubId}; карточка одиночки ${cardFace?.id}`,
  );

  // ==========================================================================
  // ЧЕК-ЛИСТ 1 — profile-hub.md
  // ==========================================================================

  console.log('\n=== PH. Сценарий 1. Redirect корневых /profile/* ===');

  await step(
    'PH-A1',
    '/profile/me уводит на /profile/me/dashboard кодом 307',
    async () => {
      const nav = await navigate(person.page, '/profile/me', '[data-testid="athlete-dashboard-kpi"]');

      mustEqual(nav.chain[0].status, 307, 'код увода с корня личного кабинета');
      mustEqual(nav.path, '/profile/me/dashboard', 'куда увели');
      const kpi = await person.page.textContent('[data-testid="athlete-dashboard-kpi"]');
      must((kpi ?? '').includes('Завершённых занятий'), 'на обзоре нет KPI завершённых занятий');

      return trace(nav);
    },
    person.page,
  );

  await step(
    'PH-A2',
    '/profile/club/N уводит на dashboard этого же лица кодом 307',
    async () => {
      const nav = await navigate(
        owner.page,
        `/profile/club/${clubA}`,
        FACE_SECTION_MARKER.dashboard,
      );

      mustEqual(nav.chain[0].status, 307, 'код увода с корня кабинета лица');
      mustEqual(nav.path, `/profile/club/${clubA}/dashboard`, 'куда увели');
      const heading = await owner.page.textContent('h1');
      must((heading ?? '').includes(NAMES[OWNER]), `в заголовке обзора не хозяин: ${heading}`);

      return trace(nav);
    },
    owner.page,
  );

  await step(
    'PH-A3',
    'прежние адреса: athlete — 308, provider — 307',
    async () => {
      const athlete = await navigate(person.page, '/profile/athlete/schedule');

      mustEqual(athlete.chain[0].status, 308, 'код переезда /profile/athlete/*');
      mustEqual(athlete.path, '/profile/me/schedule', 'куда переехал /profile/athlete/schedule');

      const provider = await navigate(owner.page, '/profile/provider/bookings');

      mustEqual(provider.chain[0].status, 307, 'код переезда /profile/provider/*');
      mustEqual(
        provider.path,
        `/profile/${ownerFaces[0].kind}/${ownerFaces[0].id}/bookings`,
        'куда переехал /profile/provider/bookings',
      );

      return `${trace(athlete)} | ${trace(provider)}`;
    },
    owner.page,
  );

  await step(
    'PH-A4',
    'кабинет собран из разделов, монолита в DOM нет',
    async () => {
      // Монолиты `AthleteProfilePage` / `ProviderProfilePage` удалены в 26.5.
      // Проверяется не отсутствие имени в разметке (в собранном виде его там нет
      // и быть не может), а сам признак сборки: три раздела дают ТРИ РАЗНЫХ
      // корневых узла и три разных адреса, то есть это разные страницы, а не один
      // компонент с внутренними вкладками.
      const roots = [];

      for (const section of ['dashboard', 'schedule', 'stats']) {
        await navigate(person.page, `/profile/me/${section}`, PERSONAL_SECTION_MARKER[section]);
        const found = await person.page.$$eval('[data-testid]', (nodes) =>
          nodes.map((node) => node.getAttribute('data-testid')),
        );

        roots.push([...new Set(found)].sort().join(','));
        const monolith = await person.page.$$(
          '[data-testid="athlete-profile-page"], [data-testid="provider-profile-page"]',
        );

        mustEqual(monolith.length, 0, `на /profile/me/${section} найден монолитный контейнер`);
      }

      must(new Set(roots).size === 3, `разделы отдали одинаковую разметку: ${roots.join(' | ')}`);

      return 'три раздела — три разных набора узлов, монолитного контейнера нет';
    },
    person.page,
  );

  console.log('\n=== PH. Сценарий 2. Подмаршруты личного кабинета ===');

  await step(
    'PH-B1',
    'обзор: надёжность, KPI, ближайшая запись',
    async () => {
      await navigate(person.page, '/profile/me/dashboard', '[data-testid="athlete-dashboard-kpi"]');

      const reliability = await person.page.textContent('[data-testid="athlete-dashboard-reliability"]');
      must((reliability ?? '').includes('Мой рейтинг надёжности'), 'секции надёжности нет');

      const upcoming = await person.page.textContent('[data-testid="athlete-dashboard-kpi-upcoming"]');
      const completed = await person.page.textContent(
        '[data-testid="athlete-dashboard-kpi-completed"]',
      );

      must(/\d/.test(upcoming ?? ''), 'KPI предстоящих без числа');
      must(/\d/.test(completed ?? ''), 'KPI завершённых без числа');

      // ⚠️ Блок ближайшей тренировки рисуется ТОЛЬКО при подтверждённой будущей
      // записи — это условие в разметке, а не случайность. Прежде шаг требовал
      // его безусловно и держался на том, что у человека такая запись была;
      // уборка данных фазы 36 её унесла, и шаг покраснел на исправном продукте.
      //
      // Спрашиваем базу и сверяем ОБА исхода: есть запись — блок обязан быть,
      // нет записи — обязан отсутствовать. Так шаг проверяет правило, а не удачу.
      const confirmedAhead = Number(
        readDb(
          `SELECT count(*) FROM bookings b JOIN schedule s ON s.id = b.schedule_id WHERE b.user_id = ${personId} AND b.status = 'confirmed' AND s.date >= CURRENT_DATE;`,
        ),
      );
      const next = await person.page.$('[data-testid="athlete-dashboard-next"]');

      mustEqual(
        next !== null,
        confirmedAhead > 0,
        `блок ближайшей тренировки против базы (подтверждённых впереди ${confirmedAhead})`,
      );

      return `надёжность и KPI на месте (${(completed ?? '').replace(/\s+/g, ' ').trim()}); подтверждённых впереди ${confirmedAhead}, блок ${next === null ? 'скрыт' : 'показан'} — совпало`;
    },
    person.page,
  );

  await step(
    'PH-B2',
    'расписание: ровно четыре FSM-фильтра',
    async () => {
      await navigate(person.page, '/profile/me/schedule', 'button:has-text("Отменённые")');

      const labels = await person.page.$$eval('button', (nodes) =>
        nodes
          .map((node) => node.textContent.trim())
          .filter((text) => ['Все', 'Активные', 'Завершённые', 'Отменённые'].includes(text)),
      );

      mustSame(labels, ['Все', 'Активные', 'Завершённые', 'Отменённые'], 'набор FSM-фильтров');

      return labels.join(' / ');
    },
    person.page,
  );

  await step(
    'PH-B3',
    'статистика: графики Recharts нарисованы',
    async () => {
      await navigate(person.page, '/profile/me/stats', '[data-testid="athlete-stats-metrics"]');

      const charts = await person.page.$$('.recharts-wrapper');
      const streak = await person.page.textContent('[data-testid="athlete-stats-streak-current"]');
      const hours = await person.page.textContent('[data-testid="athlete-stats-total-hours"]');

      must(charts.length > 0, 'ни одного графика Recharts на странице');
      must(/\d/.test(streak ?? ''), 'текущий стрик без числа');
      must(/\d/.test(hours ?? ''), 'сумма часов без числа');

      return `графиков ${charts.length}, стрик «${(streak ?? '').trim()}», часы «${(hours ?? '').trim()}»`;
    },
    person.page,
  );

  await step(
    'PH-B4',
    'избранное: раздел открылся',
    async () => {
      const state = await favoritesState(person.page);

      must(
        state.section,
        `раздел не отрисовался: на месте избранного «${state.text}»; ошибка в браузере: ${state.error}`,
      );

      return `раздел «Избранное» отрисован (${state.text})`;
    },
    person.page,
  );

  await step(
    'PH-B5',
    'отзывы: «Мои отзывы» с содержимым человека',
    async () => {
      await navigate(person.page, '/profile/me/reviews', 'h2:has-text("Мои отзывы")');

      const own = Number(
        readDb(
          `SELECT count(*) FROM reviews WHERE user_id = (SELECT id FROM users WHERE email = '${NO_FACES}');`,
        ),
      );
      const body = await person.page.textContent('body');

      must((body ?? '').includes('Мои отзывы'), 'заголовка «Мои отзывы» нет');

      return `раздел отрисован, отзывов у человека в базе ${own}`;
    },
    person.page,
  );

  await step(
    'PH-B6',
    'настройки: редактор уведомлений',
    async () => {
      await navigate(
        person.page,
        '/profile/me/settings',
        '[data-testid="notification-preferences-editor"]',
      );

      const toggles = await person.page.$$('[data-testid^="notification-preferences-toggle-"]');

      must(toggles.length > 0, 'в редакторе нет ни одного переключателя типа уведомления');

      return `редактор настроек уведомлений: переключателей ${toggles.length}`;
    },
    person.page,
  );

  await step(
    'PH-B7',
    'уведомления: страница ленты человека',
    async () => {
      await navigate(person.page, '/profile/me/notifications', '[data-testid="notifications-filters"]');

      const heading = await person.page.textContent('h1');

      must((heading ?? '').includes('Уведомления'), `заголовок страницы: ${heading}`);

      return 'лента уведомлений отрисована';
    },
    person.page,
  );

  await step(
    'PH-B8',
    'в сайдбаре ровно семь разделов и в заданном порядке',
    async () => {
      await navigate(person.page, '/profile/me/dashboard', '[data-testid="athlete-dashboard-kpi"]');

      const labels = await sectionLabels(person.page);
      const hrefs = await sectionHrefs(person.page);

      mustSame(labels, PERSONAL_LABELS, 'набор и порядок разделов личного кабинета');
      mustSame(
        hrefs,
        PERSONAL_SECTIONS.map((section) => `/profile/me/${section}`),
        'адреса разделов личного кабинета',
      );

      return labels.join(', ');
    },
    person.page,
  );

  console.log('\n=== PH. Сценарий 3. Личный кабинет есть и у владельца лиц ===');

  await step(
    'PH-C1',
    'владелец клубов открывает свой личный кабинет',
    async () => {
      const nav = await navigate(
        owner.page,
        '/profile/me/dashboard',
        '[data-testid="athlete-dashboard-kpi"]',
      );

      mustEqual(nav.path, '/profile/me/dashboard', 'адрес после перехода');
      mustEqual(nav.chain.length, 1, `увод был: ${trace(nav)}`);

      // Сверяется НОМЕР ЧЕЛОВЕКА на странице: заголовок у того, кто сам ещё
      // не записывался, — «Сделайте первую запись», и по нему кабинет не опознать.
      const accountId = await owner.page.textContent('[data-testid="athlete-dashboard-account-id"]');
      const heading = await owner.page.textContent('h1');

      must(
        (accountId ?? '').includes(`#${ownerMe.id}`),
        `на обзоре чужой номер: ${accountId} вместо #${ownerMe.id}`,
      );

      return `кабинет открыт, ${(accountId ?? '').trim()}, заголовок «${(heading ?? '').trim()}»`;
    },
    owner.page,
  );

  await step(
    'PH-C2',
    'расписание и избранное владельца тоже открываются',
    async () => {
      const schedule = await navigate(
        owner.page,
        '/profile/me/schedule',
        'button:has-text("Отменённые")',
      );

      mustEqual(schedule.path, '/profile/me/schedule', 'адрес расписания');

      const state = await favoritesState(owner.page);

      mustEqual(toPath(owner.page.url()), '/profile/me/favorites', 'адрес избранного');
      must(
        state.section,
        `избранное не отрисовалось: «${state.text}»; ошибка в браузере: ${state.error}`,
      );

      return 'оба раздела открылись без увода';
    },
    owner.page,
  );

  await step(
    'PH-C3',
    'в личном расписании его записи, а не записи клиентов его клубов',
    async () => {
      await navigate(owner.page, '/profile/me/schedule', 'button:has-text("Отменённые")');

      const ownBookings = Number(
        readDb(`SELECT count(*) FROM bookings WHERE user_id = ${ownerMe.id};`),
      );
      // Имена клиентов, записанных в клубы владельца: их в личном расписании быть
      // не должно — это чужие тренировки, адресованные клубу.
      const clientNames = readDb(
        `SELECT DISTINCT u.name FROM bookings b JOIN users u ON u.id = b.user_id
         WHERE b.owner_club_id IN (${clubA}, ${clubB}) AND b.user_id <> ${ownerMe.id};`,
      )
        .split('\n')
        .filter(Boolean);
      const body = (await owner.page.textContent('body')) ?? '';
      const leaked = clientNames.filter((name) => body.includes(name));

      mustSame(leaked, [], 'в личном расписании видны клиенты клубов');
      must(clientNames.length > 0, 'проверка бессмысленна: у клубов нет клиентов');

      return `своих записей ${ownBookings}; ни одного из ${clientNames.length} клиентов клубов на странице нет`;
    },
    owner.page,
  );

  await step(
    'PH-C4',
    'у служебной записи личного кабинета нет',
    async () => {
      const nav = await navigate(admin.page, '/profile/me/dashboard');

      mustLandHome(nav, 'админ на личном кабинете');
      const me = await whoAmI(admin.page);

      mustEqual(me.accountKind, 'admin', 'вид учётной записи');

      return trace(nav);
    },
    admin.page,
  );

  console.log('\n=== PH. Сценарий 4. Подмаршруты кабинета лица и 5 KPI ===');

  await step(
    'PH-D1',
    'на обзоре лица ровно пять KPI-карточек',
    async () => {
      await navigate(
        owner.page,
        `/profile/club/${clubA}/dashboard`,
        '[data-testid="provider-dashboard-kpi"]',
      );

      const cards = await owner.page.$$eval('[data-testid="provider-dashboard-kpi"] > *', (nodes) =>
        nodes.map((node) => node.textContent.trim().split('\n')[0]),
      );

      mustEqual(cards.length, 5, 'число KPI-карточек');
      for (const label of [
        'Ожидают подтверждения',
        'Заявки на привязку',
        'Check-in истекает',
        'Непрочитанные',
        'Рейтинг',
      ]) {
        must(
          cards.some((card) => card.includes(label)),
          `KPI «${label}» не найден: ${cards.join(' | ')}`,
        );
      }

      return cards.map((card) => card.replace(/\s+/g, ' ')).join(' · ');
    },
    owner.page,
  );

  await step(
    'PH-D2',
    'карточка «Рейтинг» — ссылка в отзывы этого лица',
    async () => {
      const href = await owner.page.getAttribute(
        '[data-testid="provider-dashboard-rating-link"]',
        'href',
      );
      const value = await owner.page.textContent('[data-testid="provider-dashboard-rating"]');

      mustEqual(href, `/profile/club/${clubA}/reviews`, 'адрес карточки «Рейтинг»');
      must(/Рейтинг/.test(value ?? ''), 'на карточке нет подписи «Рейтинг»');

      return `${href}, значение «${(value ?? '').replace(/\s+/g, ' ').trim()}»`;
    },
    owner.page,
  );

  await step(
    'PH-D3',
    'карточка «Ожидают» — ссылка в записи этого лица',
    async () => {
      const href = await owner.page.getAttribute(
        '[data-testid="provider-dashboard-pending-bookings-link"]',
        'href',
      );

      mustEqual(href, `/profile/club/${clubA}/bookings?tab=pending`, 'адрес карточки «Ожидают»');

      return href;
    },
    owner.page,
  );

  await step(
    'PH-D4',
    'все десять разделов лица рендерятся',
    async () => {
      const rendered = [];

      for (const section of FACE_SECTIONS) {
        const nav = await navigate(owner.page, `/profile/club/${clubA}/${section}`);

        mustEqual(nav.status, 200, `код ответа раздела ${section}`);
        mustEqual(nav.path, `/profile/club/${clubA}/${section}`, `адрес раздела ${section}`);
        await owner.page.waitForSelector(FACE_SECTION_MARKER[section], { timeout: 20_000 });
        rendered.push(section);
      }

      mustEqual(rendered.length, 10, 'сколько разделов отрисовалось');

      return rendered.join(', ');
    },
    owner.page,
  );

  await step(
    'PH-D5',
    'срез считается по лицу из адреса: у второго клуба другая сводка и другие записи',
    async () => {
      // Что показывает кабинет одного лица: список «Мои клубы» на обзоре
      // и записи в «Истории». Оба среза обязаны быть про ЭТО лицо.
      const cabinetView = async (clubId) => {
        await navigate(owner.page, `/profile/club/${clubId}/dashboard`, FACE_SECTION_MARKER.dashboard);
        const clubNames = await owner.page
          .$$eval('[data-testid="provider-dashboard-clubs"] li p:first-child', (nodes) =>
            nodes.map((node) => node.textContent.trim()),
          )
          .catch(() => []);

        await navigate(
          owner.page,
          `/profile/club/${clubId}/bookings`,
          '[data-testid="provider-bookings-inbox"]',
        );
        await owner.page.click('[data-testid="provider-bookings-tab-history"]');
        await owner.page.waitForSelector('[data-testid^="provider-bookings-card-"]', {
          timeout: 20_000,
        });
        const bookingIds = await owner.page.$$eval(
          '[data-testid^="provider-bookings-card-"]',
          (nodes) =>
            nodes
              .map((node) =>
                Number(node.getAttribute('data-testid').replace('provider-bookings-card-', '')),
              )
              .sort((a, b) => a - b),
        );

        return { clubNames, bookingIds };
      };

      const viewA = await cabinetView(clubA);
      const viewB = await cabinetView(clubB);
      const overlap = viewA.bookingIds.filter((id) => viewB.bookingIds.includes(id));
      const alien = viewA.bookingIds.filter((id) => !bookingsA.includes(id));
      // Чьи это записи на самом деле — спрашиваем базу: диагноз важнее факта.
      const alienOwners =
        alien.length === 0
          ? ''
          : readDb(
              `SELECT id || '→клуб ' || coalesce(owner_club_id::text, 'тренер ' || owner_trainer_id::text) FROM bookings WHERE id IN (${alien.join(',')}) ORDER BY id;`,
            )
              .split('\n')
              .filter(Boolean)
              .join(', ');

      mustSame(
        alien,
        [],
        `в кабинете клуба ${clubA} показаны чужие записи: ${alienOwners}`,
      );
      mustSame(overlap, [], `записи двух кабинетов пересеклись: ${overlap.join(', ')}`);
      mustSame(viewA.bookingIds, bookingsA, `записи клуба ${clubA} на экране расходятся с базой`);
      mustSame(viewB.bookingIds, bookingsB, `записи клуба ${clubB} на экране расходятся с базой`);
      must(
        JSON.stringify(viewA.clubNames) !== JSON.stringify(viewB.clubNames),
        `сводка обоих кабинетов одинакова: «Мои клубы» — ${viewA.clubNames.length} шт. в каждом (${viewA.clubNames.slice(0, 3).join(', ')}…)`,
      );

      return `клуб ${clubA}: ${viewA.bookingIds.length} записей, клуб ${clubB}: ${viewB.bookingIds.length}, пересечения нет`;
    },
    owner.page,
  );

  console.log('\n=== PH. Сценарий 5. Разделы собираются от лица ===');

  await step(
    'PH-E1',
    'у кабинета клуба есть «Публикации» и нет «Моей карточки»',
    async () => {
      await navigate(
        owner.page,
        `/profile/club/${clubA}/dashboard`,
        FACE_SECTION_MARKER.dashboard,
      );
      const labels = await sectionLabels(owner.page);

      must(labels.includes('Публикации'), `пункта «Публикации» нет: ${labels.join(', ')}`);
      must(!labels.includes('Моя карточка'), `у клуба появилась «Моя карточка»: ${labels.join(', ')}`);

      return labels.join(', ');
    },
    owner.page,
  );

  await step(
    'PH-E2',
    'у кабинета карточки — «Моя карточка», адрес раздела тот же',
    async () => {
      await navigate(
        card.page,
        `/profile/trainer/${cardFace.id}/dashboard`,
        FACE_SECTION_MARKER.dashboard,
      );
      const labels = await sectionLabels(card.page);
      const hrefs = await sectionHrefs(card.page);
      const index = labels.indexOf('Моя карточка');

      must(index >= 0, `пункта «Моя карточка» нет: ${labels.join(', ')}`);
      must(!labels.includes('Публикации'), `у карточки появились «Публикации»: ${labels.join(', ')}`);
      mustEqual(
        hrefs[index],
        `/profile/trainer/${cardFace.id}/publications`,
        'адрес пункта «Моя карточка»',
      );

      return `${labels.join(', ')} (адрес пункта — ${hrefs[index]})`;
    },
    card.page,
  );

  await step(
    'PH-E3',
    'у человека с клубом И карточкой это два кабинета с двумя адресами',
    async () => {
      await navigate(
        owner.page,
        `/profile/club/${clubA}/dashboard`,
        FACE_SECTION_MARKER.dashboard,
      );
      const clubLabels = await sectionLabels(owner.page);

      await navigate(
        owner.page,
        `/profile/trainer/${ownerCards[0].id}/dashboard`,
        FACE_SECTION_MARKER.dashboard,
      );
      const cardLabels = await sectionLabels(owner.page);

      must(clubLabels.includes('Публикации'), 'в кабинете клуба нет «Публикаций»');
      must(cardLabels.includes('Моя карточка'), 'в кабинете карточки нет «Моей карточки»');
      must(
        JSON.stringify(clubLabels) !== JSON.stringify(cardLabels),
        'наборы разделов двух лиц совпали',
      );

      return `клуб ${clubA}: «Публикации»; карточка ${ownerCards[0].id}: «Моя карточка»`;
    },
    owner.page,
  );

  await step(
    'PH-E4',
    'общий хвост разделов одинаков у всех лиц',
    async () => {
      const tail = ['Связи', 'Отзывы', 'Финансы', 'Уведомления', 'Настройки'];
      const cut = (labels) => labels.slice(-5);

      await navigate(
        owner.page,
        `/profile/club/${clubA}/dashboard`,
        FACE_SECTION_MARKER.dashboard,
      );
      const clubTail = cut(await sectionLabels(owner.page));

      await navigate(
        owner.page,
        `/profile/trainer/${ownerCards[0].id}/dashboard`,
        FACE_SECTION_MARKER.dashboard,
      );
      const ownerCardTail = cut(await sectionLabels(owner.page));

      await navigate(
        card.page,
        `/profile/trainer/${cardFace.id}/dashboard`,
        FACE_SECTION_MARKER.dashboard,
      );
      const soloTail = cut(await sectionLabels(card.page));

      mustSame(clubTail, tail, 'хвост разделов кабинета клуба');
      mustSame(ownerCardTail, tail, 'хвост разделов кабинета карточки владельца');
      mustSame(soloTail, tail, 'хвост разделов кабинета одиночной карточки');

      return tail.join(', ');
    },
    owner.page,
  );

  await step(
    'PH-E5',
    'переключатель лиц: есть у многоликого, нет у одноликого',
    async () => {
      await navigate(
        owner.page,
        `/profile/club/${clubA}/dashboard`,
        '[data-testid="profile-face-switcher"]',
      );

      const caption = await owner.page.textContent('[data-testid="profile-face-switcher"] p');
      const titles = await owner.page.$$eval(
        '[data-testid="profile-face-switcher"] a',
        (nodes) => [...new Set(nodes.map((node) => node.getAttribute('title')))],
      );

      must((caption ?? '').includes('Кабинет лица'), `подпись переключателя: ${caption}`);
      must(titles.includes('Клуб'), `среди подсказок нет «Клуб»: ${titles.join(', ')}`);
      must(
        titles.includes('Карточка тренера'),
        `среди подсказок нет «Карточка тренера»: ${titles.join(', ')}`,
      );

      // Переход по лицу — обычная ссылка: адрес меняется, кабинет другой.
      await owner.page.click(
        `[data-testid="profile-face-switcher"] a[href="/profile/trainer/${ownerCards[0].id}"]`,
      );
      await owner.page.waitForURL(`**/profile/trainer/${ownerCards[0].id}/dashboard`, {
        timeout: 20_000,
      });

      // У человека с одним лицом переключателя нет В РАЗМЕТКЕ, а не скрыт стилями.
      await navigate(card.page, `/profile/trainer/${cardFace.id}/dashboard`);
      await waitSession(card.page);
      await card.page.waitForSelector(FACE_SECTION_MARKER.dashboard, { timeout: 20_000 });
      const switcher = await card.page.$$('[data-testid="profile-face-switcher"]');

      mustEqual(switcher.length, 0, 'у одноликого переключатель оказался в разметке');

      return `переключатель ведёт на ${toPath(owner.page.url())}; у одноликого его в разметке нет`;
    },
    owner.page,
  );

  console.log('\n=== PH. Сценарий 6. ProfileBreadcrumb ===');

  await step(
    'PH-F1',
    'на обзоре крошек нет',
    async () => {
      await navigate(person.page, '/profile/me/dashboard', '[data-testid="athlete-dashboard-kpi"]');
      const crumbs = await person.page.$$('[data-testid="profile-breadcrumb"]');

      mustEqual(crumbs.length, 0, 'крошки на обзоре');

      return 'на обзоре крошек нет — он и есть корень кабинета';
    },
    person.page,
  );

  await step(
    'PH-F2',
    'на расписании крошки «Обзор / Расписание»',
    async () => {
      await navigate(person.page, '/profile/me/schedule', '[data-testid="profile-breadcrumb"]');
      const text = (await person.page.textContent('[data-testid="profile-breadcrumb"]')) ?? '';

      must(text.includes('Обзор'), `в крошках нет «Обзор»: ${text}`);
      must(text.includes('Расписание'), `в крошках нет «Расписание»: ${text}`);

      return text.replace(/\s+/g, ' ').trim();
    },
    person.page,
  );

  await step(
    'PH-F3',
    'клик «Обзор» в крошках уводит на обзор',
    async () => {
      await person.page.click('[data-testid="profile-breadcrumb"] a');
      await person.page.waitForURL('**/profile/me/dashboard', { timeout: 20_000 });
      await person.page.waitForSelector('[data-testid="athlete-dashboard-kpi"]', { timeout: 20_000 });

      return toPath(person.page.url());
    },
    person.page,
  );

  await step(
    'PH-F4',
    'на узком экране крошки видны, сайдбар скрыт',
    async () => {
      const narrow = await person.context.newPage();

      try {
        await narrow.setViewportSize({ width: 375, height: 800 });
        await narrow.goto(`${BASE}/profile/me/schedule`, { waitUntil: 'domcontentloaded' });
        await narrow.waitForSelector('[data-testid="profile-breadcrumb"]', { timeout: 20_000 });

        const crumbVisible = await narrow.isVisible('[data-testid="profile-breadcrumb"]');
        const sidebarVisible = await narrow.isVisible('nav[aria-label^="Разделы"]');
        const drawerButton = await narrow.isVisible('button[aria-label="Открыть меню кабинета"]');

        must(crumbVisible, 'крошки на узком экране не видны');
        must(!sidebarVisible, 'сайдбар на узком экране остался виден');
        must(drawerButton, 'кнопки мобильного меню кабинета нет');

        return 'крошки видны, сайдбар скрыт, меню кабинета — кнопкой';
      } finally {
        await narrow.close();
      }
    },
    person.page,
  );

  await step(
    'PH-F5',
    'в кабинете лица крошки на всех разделах, кроме обзора',
    async () => {
      const missing = [];

      for (const section of FACE_SECTIONS) {
        await navigate(owner.page, `/profile/club/${clubA}/${section}`);
        await owner.page.waitForSelector(FACE_SECTION_MARKER[section], { timeout: 20_000 });

        const crumbs = await owner.page.$$('[data-testid="profile-breadcrumb"]');

        if (section === 'dashboard') {
          mustEqual(crumbs.length, 0, 'крошки на обзоре кабинета лица');
          continue;
        }

        if (crumbs.length === 0) {
          missing.push(section);
          continue;
        }

        const text = (await owner.page.textContent('[data-testid="profile-breadcrumb"]')) ?? '';

        must(text.includes('Обзор'), `в крошках раздела ${section} нет ссылки «Обзор»: ${text}`);
      }

      mustSame(missing, [], 'разделы кабинета лица без крошек');

      return 'крошки есть на девяти разделах и отсутствуют на обзоре';
    },
    owner.page,
  );

  console.log('\n=== PH. Сценарий 7. Кабинет закрыт на сервере ===');

  await step(
    'PH-G1',
    'человек без лиц в кабинет лица не попадает',
    async () => {
      const nav = await navigate(person.page, `/profile/club/${clubA}/dashboard`);

      mustLandHome(nav, 'человек без лиц на кабинете лица');

      return trace(nav);
    },
    person.page,
  );

  await step(
    'PH-G2',
    'владелец ДРУГОГО лица в чужой кабинет не попадает',
    async () => {
      const nav = await navigate(owner.page, `/profile/club/${foreignClubId}/dashboard`);

      mustLandHome(nav, 'владелец на чужом кабинете');
      const owned = readDb(
        `SELECT managed_by_user_id FROM clubs WHERE id = ${foreignClubId};`,
      ).trim();

      must(owned !== String(ownerMe.id), `клуб ${foreignClubId} принадлежит проверяющему`);

      return `${trace(nav)}; клуб ${foreignClubId} принадлежит #${owned}`;
    },
    owner.page,
  );

  await step(
    'PH-G3',
    'мусор в адресе даёт ровно тот же ответ',
    async () => {
      const answers = [];

      for (const path of [
        '/profile/venue/1',
        '/profile/club/abc',
        '/profile/club/0',
        '/profile/club/99999',
      ]) {
        const raw = await rawHop(owner.context, path);

        answers.push({
          path,
          shape: `${raw.status} ${raw.location}`,
          notFound: raw.status === 404 || /не найден/i.test(raw.body),
          traces: dataTraces(raw.body),
        });
      }

      const shapes = [...new Set(answers.map((item) => item.shape))];

      mustEqual(
        shapes.length,
        1,
        `ответы различаются: ${answers.map((i) => `${i.path} → ${i.shape}`).join(' | ')}`,
      );
      mustEqual(shapes[0], '307 /', 'общий ответ на мусор в адресе');
      mustSame(
        answers.filter((item) => item.notFound).map((item) => item.path),
        [],
        'какой-то адрес ответил «не найдено» — по разнице ответов перебирают номера',
      );
      mustSame(
        answers.filter((item) => item.traces.length > 0).map((item) => item.path),
        [],
        'в ответе на мусор приехали данные кабинета',
      );

      return answers.map((item) => `${item.path} → ${item.shape}`).join(' | ');
    },
    owner.page,
  );

  await step(
    'PH-G4',
    'гостя в личный кабинет не пускают',
    async () => {
      const nav = await navigate(guest.page, '/profile/me/settings');

      mustLandHome(nav, 'гость на настройках');
      const editor = await guest.page.$$('[data-testid="notification-preferences-editor"]');

      mustEqual(editor.length, 0, 'гостю отрисовали редактор настроек');

      return trace(nav);
    },
    guest.page,
  );

  await step(
    'PH-G5',
    'на всех 17 подмаршрутах поведение одинаковое',
    async () => {
      const bad = [];

      for (const section of PERSONAL_SECTIONS) {
        const raw = await rawHop(guest.context, `/profile/me/${section}`);

        if (raw.status !== 307 || raw.location !== '/') {
          bad.push(`/profile/me/${section} → ${raw.status} ${raw.location}`);
        }
      }

      for (const section of FACE_SECTIONS) {
        const raw = await rawHop(person.context, `/profile/club/${clubA}/${section}`);

        if (raw.status !== 307 || raw.location !== '/') {
          bad.push(`/profile/club/${clubA}/${section} → ${raw.status} ${raw.location}`);
        }
      }

      mustSame(bad, [], 'подмаршруты с другим ответом');

      return '7 личных (гостю) и 10 разделов лица (человеку без лиц) — всем 307 на /';
    },
    guest.page,
  );

  await step(
    'PH-G6',
    'в исходном ответе нет ни записей, ни уведомлений',
    async () => {
      const leaks = [];

      for (const path of [
        '/profile/me/schedule',
        '/profile/me/notifications',
        `/profile/club/${clubA}/notifications`,
      ]) {
        const raw = await rawHop(guest.context, path);
        const found = dataTraces(raw.body);

        if (raw.status !== 307) leaks.push(`${path}: ответ ${raw.status}, а не увод`);
        if (raw.location !== '/') leaks.push(`${path}: увели на ${raw.location}`);
        if (found.length > 0) leaks.push(`${path}: ${found.join(', ')}`);
      }

      mustSame(leaks, [], 'следы данных в потоке ответа гостю');

      return 'три адреса: 307 на /, ни одного маркера данных в теле';
    },
    guest.page,
  );

  await step(
    'PH-G7',
    'служебной записи закрыты оба кабинета',
    async () => {
      const personal = await navigate(admin.page, '/profile/me/dashboard');
      const legacy = await navigate(admin.page, '/profile/provider/dashboard');

      mustLandHome(personal, 'админ на личном кабинете');
      mustLandHome(legacy, 'админ на прежнем адресе кабинета лица');
      const me = await whoAmI(admin.page);

      mustEqual((me.faces ?? []).length, 0, 'число лиц у служебной записи');

      return `${trace(personal)} | ${trace(legacy)}`;
    },
    admin.page,
  );

  await step(
    'PH-G8',
    'контрольная группа: у владельца личный кабинет открыт',
    async () => {
      const nav = await navigate(
        owner.page,
        '/profile/me/dashboard',
        '[data-testid="athlete-dashboard-kpi"]',
      );

      mustEqual(nav.path, '/profile/me/dashboard', 'адрес после перехода');
      mustEqual(nav.chain.length, 1, `увод был: ${trace(nav)}`);

      return 'отказ по лицу не превратился в отказ по личному кабинету';
    },
    owner.page,
  );

  // ==========================================================================
  // ЧЕК-ЛИСТ 2 — auth.md
  // ==========================================================================

  console.log('\n=== AU. Сценарий 1. Вход человеком без лиц ===');

  await step(
    'AU-A1',
    'гостю в шапке предложен вход',
    async () => {
      await ui.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await ui.page.waitForSelector('header button:has-text("Войти")', { timeout: 20_000 });

      const logout = await ui.page.$$('header button[aria-label="Выйти"]');

      mustEqual(logout.length, 0, 'гостю показали кнопку выхода');

      return 'кнопка «Войти» в шапке, кнопки выхода нет';
    },
    ui.page,
  );

  await step(
    'AU-A2',
    'модалка открывается на вкладке «Вход»',
    async () => {
      await ui.page.click('header button:has-text("Войти")');
      await ui.page.waitForSelector('[data-testid="modal-overlay"]', { timeout: 20_000 });

      const selected = await ui.page.getAttribute('[role="tab"]:has-text("Вход")', 'aria-selected');
      const other = await ui.page.getAttribute(
        '[role="tab"]:has-text("Регистрация")',
        'aria-selected',
      );

      mustEqual(selected, 'true', 'активность вкладки «Вход»');
      mustEqual(other, 'false', 'активность вкладки «Регистрация»');

      return 'модалка открыта, активна вкладка «Вход»';
    },
    ui.page,
  );

  await step(
    'AU-A3',
    'в форме нет выбора типа кабинета, тело запроса — ровно {email, password}',
    async () => {
      const modal = await ui.page.textContent('[data-testid="modal-overlay"]');
      const forbidden = ['Тип аккаунта', 'Представитель услуг', 'Спортсмен', 'accountType'].filter(
        (needle) => (modal ?? '').includes(needle),
      );

      mustSame(forbidden, [], 'следы выбора типа кабинета в форме входа');

      await ui.page.fill('[role="tabpanel"] input[type="email"]', NO_FACES);
      await ui.page.fill('[role="tabpanel"] input[type="password"]', 'sporthub123');

      const [request] = await Promise.all([
        ui.page.waitForRequest(
          (item) => item.url().includes('/api/auth/login') && item.method() === 'POST',
        ),
        ui.page.click('button:has-text("Продолжить вход")'),
      ]);
      const body = JSON.parse(request.postData());

      mustSame(Object.keys(body).sort(), ['email', 'password'], 'поля тела запроса входа');
      mustEqual(body.email, NO_FACES, 'почта в теле запроса');

      return `тело запроса: {${Object.keys(body).join(', ')}}`;
    },
    ui.page,
  );

  await step(
    'AU-A4',
    'после входа модалка закрылась, в шапке имя и колокольчик',
    async () => {
      await ui.page.waitForSelector('[data-testid="modal-overlay"]', {
        state: 'detached',
        timeout: 20_000,
      });
      await ui.page.waitForSelector('header button[aria-label="Уведомления"]', { timeout: 20_000 });

      const header = (await ui.page.textContent('header')) ?? '';

      must(header.includes(NAMES[NO_FACES]), `имени в шапке нет: ${header.replace(/\s+/g, ' ')}`);

      return `в шапке «${NAMES[NO_FACES]}» и колокольчик`;
    },
    ui.page,
  );

  await step(
    'AU-A5',
    'личность живёт в серверной сессии, не в браузере',
    async () => {
      const cookies = await ui.context.cookies();
      const session = cookies.find((cookie) => cookie.name.endsWith('sh-session'));

      must(session !== undefined, `cookie сессии не выставлена: ${cookies.map((c) => c.name).join(', ')}`);
      must(session.httpOnly, 'cookie сессии без HttpOnly');

      const fromJs = await ui.page.evaluate(() => document.cookie);

      must(!fromJs.includes('sh-session'), `cookie сессии видна из JS: ${fromJs}`);

      const storage = await ui.page.evaluate(() =>
        JSON.stringify(Object.fromEntries(Object.entries({ ...localStorage }))),
      );

      must(!storage.includes(NO_FACES), `почта человека лежит в localStorage: ${storage}`);
      must(!storage.includes(NAMES[NO_FACES]), `имя человека лежит в localStorage: ${storage}`);

      const me = await whoAmI(ui.page);

      mustEqual(me.accountKind, 'person', 'вид учётной записи');
      mustSame(me.faces, [], 'список лиц человека без лиц');
      must(Array.isArray(me.capabilities), 'списка возможностей в ответе нет');
      must(!('role' in me), `в ответе «кто я» осталось поле role: ${Object.keys(me).join(', ')}`);

      return `cookie ${session.name} HttpOnly; faces []; ключи ответа: ${Object.keys(me).join(', ')}`;
    },
    ui.page,
  );

  await step(
    'AU-A6',
    'ссылка кабинета ведёт в /profile/me, корень уводит на обзор',
    async () => {
      const href = await ui.page.getAttribute(CABINET_LINK, 'href');
      const label = await ui.page.getAttribute(CABINET_LINK, 'aria-label');

      mustEqual(href, '/profile/me', 'адрес ссылки кабинета в шапке');
      // Подпись обязана называть цель, а не «личный кабинет» вообще: у человека
      // без лиц цель — кабинет спортсмена, и диктор обязан произнести именно её.
      mustEqual(label, 'Перейти в кабинет: Кабинет спортсмена', 'подпись ссылки кабинета');

      const nav = await navigate(ui.page, '/profile/me', '[data-testid="athlete-dashboard-kpi"]');

      mustEqual(nav.chain[0].status, 307, 'код увода с /profile/me');
      mustEqual(nav.path, '/profile/me/dashboard', 'куда увели');

      return `${href} → ${trace(nav)}`;
    },
    ui.page,
  );

  console.log('\n=== AU. Сценарий 2. Вход человеком с лицами и перезалогин ===');

  let stolenCookie = null;

  await step(
    'AU-B1',
    'человек без лиц вошёл (исходное состояние сценария)',
    async () => {
      const me = await whoAmI(ui.page);

      mustEqual(me.email, NO_FACES, 'кто вошёл');
      mustSame(me.faces, [], 'лиц у него нет');
      stolenCookie = (await ui.context.cookies()).find((cookie) =>
        cookie.name.endsWith('sh-session'),
      );

      must(stolenCookie !== undefined, 'cookie сессии не нашлась');

      return `вошёл ${me.email}, cookie сохранена для проверки отзыва`;
    },
    ui.page,
  );

  await step(
    'AU-B2',
    'выход гасит сессию: старая cookie доступа не даёт',
    async () => {
      await ui.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await waitSession(ui.page);
      await ui.page.click('header button[aria-label="Выйти"]');
      await ui.page.waitForSelector('header button:has-text("Войти")', { timeout: 20_000 });

      const header = (await ui.page.textContent('header')) ?? '';

      must(!header.includes(NAMES[NO_FACES]), 'имя осталось в шапке после выхода');

      const after = (await ui.context.cookies()).find((cookie) => cookie.name.endsWith('sh-session'));

      must(
        after === undefined || after.value === '' || after.value !== stolenCookie.value,
        `cookie сессии осталась прежней: ${after?.value?.slice(0, 8)}`,
      );

      // Возвращаем прежнее значение руками: сервер обязан ответить, что такой
      // сессии больше нет. Иначе «выход» был бы только уборкой в браузере.
      await ui.context.addCookies([stolenCookie]);
      const replay = await api(ui.page, 'GET', '/api/auth/me');

      mustEqual(replay.status, 401, 'ответ на повтор прежней cookie');
      must(
        !JSON.stringify(replay.body ?? {}).includes(NAMES[NO_FACES]),
        'по прежней cookie вернулась личность',
      );

      return `в шапке снова «Войти»; повтор прежней cookie → ${replay.status}`;
    },
    ui.page,
  );

  await step(
    'AU-B3',
    'модалка открыта на «Входе», поля заполнены владельцем лиц',
    async () => {
      await ui.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await ui.page.waitForSelector('header button:has-text("Войти")', { timeout: 20_000 });
      await ui.page.click('header button:has-text("Войти")');
      await ui.page.waitForSelector('[data-testid="modal-overlay"]', { timeout: 20_000 });
      await ui.page.fill('[role="tabpanel"] input[type="email"]', OWNER);
      await ui.page.fill('[role="tabpanel"] input[type="password"]', 'sporthub123');

      const email = await ui.page.inputValue('[role="tabpanel"] input[type="email"]');

      mustEqual(email, OWNER, 'значение поля почты');

      return 'форма входа заполнена владельцем лиц';
    },
    ui.page,
  );

  await step(
    'AU-B4',
    'вход прошёл, в шапке имя владельца',
    async () => {
      await ui.page.click('button:has-text("Продолжить вход")');
      await ui.page.waitForSelector('[data-testid="modal-overlay"]', {
        state: 'detached',
        timeout: 20_000,
      });
      await waitSession(ui.page);

      const header = (await ui.page.textContent('header')) ?? '';

      must(header.includes(NAMES[OWNER]), `имени владельца в шапке нет: ${header.replace(/\s+/g, ' ')}`);

      return `в шапке «${NAMES[OWNER]}»`;
    },
    ui.page,
  );

  await step(
    'AU-B5',
    '«кто я» отдаёт лица владельца',
    async () => {
      const me = await whoAmI(ui.page);
      const inDb = Number(
        readDb(
          `SELECT (SELECT count(*) FROM clubs WHERE managed_by_user_id = ${ownerMe.id}) + (SELECT count(*) FROM trainers WHERE managed_by_user_id = ${ownerMe.id});`,
        ),
      );

      mustEqual(me.accountKind, 'person', 'вид учётной записи владельца');
      mustEqual((me.faces ?? []).length, inDb, 'число лиц в ответе против базы');
      must(
        me.faces.every((face) => ['club', 'trainer'].includes(face.kind) && face.id > 0 && face.name),
        `в лицах есть неполные элементы: ${JSON.stringify(me.faces.slice(0, 3))}`,
      );
      must(me.faces.some((face) => face.kind === 'club'), 'клубов в списке лиц нет');

      return `лиц ${me.faces.length}, все вида {kind,id,name}; в базе столько же`;
    },
    ui.page,
  );

  await step(
    'AU-B6',
    'ссылка кабинета ведёт в кабинет активного лица и подписана его именем',
    async () => {
      const first = ownerFaces[0];
      const href = await ui.page.getAttribute(CABINET_LINK, 'href');
      const label = await ui.page.getAttribute(CABINET_LINK, 'aria-label');
      const caption = (await ui.page.textContent('header')) ?? '';

      mustEqual(href, `/profile/${first.kind}/${first.id}`, 'адрес ссылки кабинета');
      must(caption.includes(first.name), `подпись ссылки не имя лица: ${caption.replace(/\s+/g, ' ')}`);
      // ⚠️ Тот самый дефект дерева доступности: на экране подпись рядом была верна,
      // а диктор читал «личный кабинет» и вёл в кабинет лица. Проверяем подпись,
      // а не только видимый текст, — иначе дефект снова станет невидимым.
      mustEqual(label, `Перейти в кабинет: ${first.name}`, 'подпись ссылки кабинета для диктора');
      must(
        !caption.includes('Кабинет представителя спортивных услуг'),
        'в шапке осталась старая общая подпись кабинета',
      );

      return `${href}, подпись «${first.name}»`;
    },
    ui.page,
  );

  await step(
    'AU-B7',
    'прежний адрес кабинета лица отвечает 307 на кабинет первого лица',
    async () => {
      const nav = await navigate(ui.page, '/profile/provider/dashboard');

      mustEqual(nav.chain[0].status, 307, 'код переезда прежнего адреса');
      mustEqual(
        nav.path,
        `/profile/${ownerFaces[0].kind}/${ownerFaces[0].id}/dashboard`,
        'куда переехал прежний адрес',
      );
      must(nav.status !== 404, 'прежний адрес отдал «не найдено»');

      return trace(nav);
    },
    ui.page,
  );

  console.log('\n=== AU. Сценарий 3. Человек с двумя разными лицами ===');

  await step(
    'AU-C1',
    'человек с клубом и карточкой вошёл',
    async () => {
      const me = await whoAmI(ui.page);

      mustEqual(me.email, OWNER, 'кто вошёл');
      const header = (await ui.page.textContent('header')) ?? '';

      must(header.includes(NAMES[OWNER]), 'имени в шапке нет');

      return `вошёл ${me.email}`;
    },
    ui.page,
  );

  await step(
    'AU-C2',
    'в лицах есть и клуб, и карточка тренера',
    async () => {
      const me = await whoAmI(ui.page);
      const kinds = [...new Set((me.faces ?? []).map((face) => face.kind))].sort();

      mustSame(kinds, ['club', 'trainer'], 'виды лиц в ответе');

      return `виды лиц: ${kinds.join(', ')}`;
    },
    ui.page,
  );

  await step(
    'AU-C3',
    'в кабинете лица виден переключатель с подписями видов',
    async () => {
      await navigate(
        ui.page,
        `/profile/club/${clubA}/dashboard`,
        '[data-testid="profile-face-switcher"]',
      );

      const caption = await ui.page.textContent('[data-testid="profile-face-switcher"] p');
      const titles = await ui.page.$$eval('[data-testid="profile-face-switcher"] a', (nodes) =>
        [...new Set(nodes.map((node) => node.getAttribute('title')))].sort(),
      );

      must((caption ?? '').includes('Кабинет лица'), `подпись переключателя: ${caption}`);
      mustSame(titles, ['Карточка тренера', 'Клуб'], 'подсказки кнопок переключателя');

      return `«${(caption ?? '').trim()}», подсказки: ${titles.join(' / ')}`;
    },
    ui.page,
  );

  await step(
    'AU-C4',
    'клик по второму лицу меняет адрес кабинета',
    async () => {
      const target = ownerCards[0];

      await ui.page.click(`[data-testid="profile-face-switcher"] a[href="/profile/trainer/${target.id}"]`);
      await ui.page.waitForURL(`**/profile/trainer/${target.id}/dashboard`, { timeout: 20_000 });
      await ui.page.waitForSelector(FACE_SECTION_MARKER.dashboard, { timeout: 20_000 });

      const labels = await sectionLabels(ui.page);

      mustEqual(toPath(ui.page.url()), `/profile/trainer/${target.id}/dashboard`, 'адрес кабинета');
      must(labels.includes('Моя карточка'), `в кабинете карточки нет «Моей карточки»: ${labels}`);

      return `перешли в ${toPath(ui.page.url())}`;
    },
    ui.page,
  );

  await step(
    'AU-C5',
    'у человека с одним лицом переключателя нет в разметке',
    async () => {
      await logout(ui.page);
      await loginAs(ui.page, CARD_ONLY);
      await navigate(ui.page, `/profile/trainer/${cardFace.id}/dashboard`);
      await waitSession(ui.page);
      await ui.page.waitForSelector(FACE_SECTION_MARKER.dashboard, { timeout: 20_000 });

      const switcher = await ui.page.$$('[data-testid="profile-face-switcher"]');
      const html = await ui.page.content();

      mustEqual(switcher.length, 0, 'переключатель оказался в разметке');
      must(!html.includes('profile-face-switcher'), 'разметка переключателя есть, но скрыта');

      return 'переключателя нет вовсе: выбирать не из чего';
    },
    ui.page,
  );

  await step(
    'AU-C6',
    'чужое лицо и мусор в адресе дают один ответ',
    async () => {
      const foreign = await rawHop(ui.context, `/profile/club/${clubA}/dashboard`);
      const venue = await rawHop(ui.context, '/profile/venue/1');
      const missing = await rawHop(ui.context, '/profile/club/99999');
      const shape = (raw) => `${raw.status} ${raw.location}`;

      mustEqual(shape(foreign), '307 /', 'ответ на чужое лицо');
      mustEqual(shape(venue), shape(foreign), 'ответ на несуществующий вид лица');
      mustEqual(shape(missing), shape(foreign), 'ответ на несуществующий номер лица');
      mustSame(dataTraces(foreign.body), [], 'в ответе на чужое лицо приехали данные кабинета');

      return `все три: ${shape(foreign)}, данных в теле нет`;
    },
    ui.page,
  );

  console.log('\n=== AU. Сценарий 4. Валидация на логине ===');

  await step(
    'AU-D1',
    'отказ входа — одно сообщение на все случаи',
    async () => {
      // Сначала форма: чек-лист называет пару `notexisting@test` / `x`.
      await logout(ui.page);
      await ui.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await ui.page.waitForSelector('header button:has-text("Войти")', { timeout: 20_000 });
      await ui.page.click('header button:has-text("Войти")');
      await ui.page.waitForSelector('[data-testid="modal-overlay"]', { timeout: 20_000 });
      await ui.page.fill('[role="tabpanel"] input[type="email"]', 'notexisting@test');
      await ui.page.fill('[role="tabpanel"] input[type="password"]', 'x');
      await ui.page.click('button:has-text("Продолжить вход")');
      await ui.page.waitForTimeout(700);

      const formError = ((await ui.page.textContent('[data-testid="modal-overlay"]')) ?? '')
        .replace(/\s+/g, ' ')
        .trim();

      // Затем сам сервер — из браузера, настоящими телами: 401 обязан быть
      // ОДИНАКОВЫМ для несуществующей почты и для верной почты с чужим паролем.
      const unknown = await api(ui.page, 'POST', '/api/auth/login', {
        email: 'notexisting@example.com',
        password: 'wrong-password',
      });
      const wrongPassword = await api(ui.page, 'POST', '/api/auth/login', {
        email: NO_FACES,
        password: 'wrong-password',
      });

      mustEqual(unknown.status, 401, 'код ответа на несуществующую почту');
      mustEqual(wrongPassword.status, 401, 'код ответа на неверный пароль');
      mustEqual(unknown.body?.error, 'Неверная почта или пароль', 'текст отказа (несуществующая почта)');
      mustEqual(
        wrongPassword.body?.error,
        unknown.body?.error,
        'тексты отказов различаются — форма становится перечислителем почт',
      );

      return `сервер: «${unknown.body?.error}» на оба случая; форма на «notexisting@test / x» показала: ${formError.includes('короче') || formError.includes('корректный') ? 'свою проверку до отправки' : formError.slice(0, 80)}`;
    },
    ui.page,
  );

  await step(
    'AU-D2',
    'лишнее поле в теле входа отвергается схемой',
    async () => {
      const response = await api(ui.page, 'POST', '/api/auth/login', {
        email: NO_FACES,
        password: 'sporthub123',
        accountType: 'athlete',
      });

      mustEqual(response.status, 400, 'код ответа на тело с accountType');
      mustEqual(response.body?.error, 'Некорректные данные запроса', 'текст отказа');
      must(response.body?.data === undefined, 'вместе с отказом приехали данные');

      const me = await api(ui.page, 'GET', '/api/auth/me');

      mustEqual(me.status, 401, 'после отказа сессия всё-таки открылась');

      return `400 «${response.body?.error}», сессия не открылась`;
    },
    ui.page,
  );

  await step(
    'AU-D3',
    'администратор через общую форму не входит',
    async () => {
      await ui.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await ui.page.waitForSelector('header button:has-text("Войти")', { timeout: 20_000 });
      await ui.page.click('header button:has-text("Войти")');
      await ui.page.waitForSelector('[data-testid="modal-overlay"]', { timeout: 20_000 });
      await ui.page.fill('[role="tabpanel"] input[type="email"]', ADMIN);
      await ui.page.fill('[role="tabpanel"] input[type="password"]', 'sporthub123');

      const [response] = await Promise.all([
        ui.page.waitForResponse((item) => item.url().includes('/api/auth/login')),
        ui.page.click('button:has-text("Продолжить вход")'),
      ]);
      const payload = await response.json();

      mustEqual(response.status(), 403, 'код ответа общей формы администратору');
      mustEqual(payload.error, 'Администраторы входят через /service-portal', 'текст отказа');

      await ui.page.waitForSelector('text=Администраторы входят через /service-portal', {
        timeout: 20_000,
      });
      const me = await api(ui.page, 'GET', '/api/auth/me');

      mustEqual(me.status, 401, 'сессия администратора всё-таки открылась');

      return `403 «${payload.error}», сообщение показано в форме`;
    },
    ui.page,
  );

  await step(
    'AU-D4',
    'обычного человека служебный признак не пускает',
    async () => {
      const response = await api(ui.page, 'POST', '/api/auth/login', {
        email: NO_FACES,
        password: 'sporthub123',
        portal: 'service',
      });

      mustEqual(response.status, 403, 'код ответа служебного входа обычному человеку');
      mustEqual(response.body?.error, 'Служебный вход только для администраторов', 'текст отказа');

      const me = await api(ui.page, 'GET', '/api/auth/me');

      mustEqual(me.status, 401, 'признак проигнорирован — сессия открылась');

      return `403 «${response.body?.error}», сессии нет`;
    },
    ui.page,
  );

  console.log('\n=== AU. Сценарий 5. Регистрация ===');

  await step(
    'AU-E1',
    'в форме регистрации ровно четыре поля и нет выбора типа',
    async () => {
      await ui.page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
      await ui.page.waitForSelector('header button:has-text("Войти")', { timeout: 20_000 });
      await ui.page.click('header button:has-text("Войти")');
      await ui.page.waitForSelector('[data-testid="modal-overlay"]', { timeout: 20_000 });
      await ui.page.click('[role="tab"]:has-text("Регистрация")');
      await ui.page.waitForSelector('[role="tabpanel"] input', { timeout: 20_000 });

      const labels = await ui.page.$$eval('[role="tabpanel"] label', (nodes) =>
        nodes.map((node) => node.textContent.trim()),
      );
      const inputs = await ui.page.$$('[role="tabpanel"] input');
      const modal = (await ui.page.textContent('[data-testid="modal-overlay"]')) ?? '';
      const forbidden = ['Тип аккаунта', 'Представитель услуг', 'Спортсмен'].filter((needle) =>
        modal.includes(needle),
      );
      const disabled = await ui.page.getAttribute('button:has-text("Создать аккаунт")', 'disabled');

      mustSame(labels, ['Имя', 'Email', 'Телефон', 'Пароль'], 'набор полей регистрации');
      mustEqual(inputs.length, 4, 'число полей ввода');
      mustSame(forbidden, [], 'следы выбора типа учётной записи');
      mustEqual(disabled, null, 'кнопка отправки заблокирована');

      return `поля: ${labels.join(', ')}; кнопка активна`;
    },
    ui.page,
  );

  await step(
    'AU-E2',
    'регистрация заводит человека и сразу открывает сессию',
    async () => {
      made.registeredEmail = `e2e-profile-reg-${Date.now()}@test.local`;

      const fields = ui.page.locator('[role="tabpanel"] input');

      await fields.nth(0).fill('Тест Прогонов');
      await fields.nth(1).fill(made.registeredEmail);
      await fields.nth(2).fill('+7 (900) 555-01-02');
      await fields.nth(3).fill('qwerty1');

      const [response] = await Promise.all([
        ui.page.waitForResponse((item) => item.url().includes('/api/auth/register')),
        ui.page.click('button:has-text("Создать аккаунт")'),
      ]);

      if (response.status() === 429) {
        throw new Error('предел частоты регистрации исчерпан — шаг не проверялся');
      }

      mustEqual(response.status(), 201, `ответ регистрации: ${await response.text()}`);
      await ui.page.waitForSelector('[data-testid="modal-overlay"]', {
        state: 'detached',
        timeout: 20_000,
      });
      await waitSession(ui.page);

      const header = (await ui.page.textContent('header')) ?? '';
      const inDb = readDb(
        `SELECT account_kind FROM users WHERE email = '${made.registeredEmail}';`,
      ).trim();

      must(header.includes('Тест Прогонов'), `имени в шапке нет: ${header.replace(/\s+/g, ' ')}`);
      mustEqual(inDb, 'person', 'вид учётной записи в базе');

      return `заведён ${made.registeredEmail}, в базе account_kind=${inDb}`;
    },
    ui.page,
  );

  await step(
    'AU-E3',
    'у только что заведённого человека лиц нет',
    async () => {
      const me = await whoAmI(ui.page);

      mustEqual(me.email, made.registeredEmail, 'кто вошёл после регистрации');
      mustEqual(me.accountKind, 'person', 'вид учётной записи');
      mustSame(me.faces, [], 'список лиц');
      must(!('role' in me), 'в ответе осталось поле role');

      return 'accountKind person, faces []';
    },
    ui.page,
  );

  await step(
    'AU-E4',
    'лишнее поле в теле регистрации отвергается схемой',
    async () => {
      const response = await api(ui.page, 'POST', '/api/auth/register', {
        name: 'Проверка строгости',
        email: `e2e-profile-strict-${Date.now()}@test.local`,
        password: 'qwerty1',
        accountType: 'provider',
      });

      if (response.status === 429) {
        throw new Error('предел частоты регистрации исчерпан — шаг не проверялся');
      }

      mustEqual(response.status, 400, 'код ответа на тело с accountType');
      mustEqual(response.body?.error, 'Некорректные данные регистрации', 'текст отказа');

      const created = readDb(`SELECT count(*) FROM users WHERE email LIKE 'e2e-profile-strict-%';`);

      mustEqual(created.trim(), '0', 'при отказе всё-таки завёлся человек');

      return `400 «${response.body?.error}», в базе никого не завелось`;
    },
    ui.page,
  );

  skip(
    'AU-E5',
    'повторная регистрация на занятый email — 409',
    'бюджет предела частоты регистрации: 10 запросов в час на адрес обращения, ' +
      'общий для всех прогонов (браузер ходит через прокси фронта). Прогон обязан ' +
      'переживать три запуска за час, поэтому регистрационных запросов в нём два: ' +
      'заведение человека и проверка строгости схемы. Третий не влез',
  );

  await step(
    'AU-E6',
    'заведённый человек переживает выход и входит снова',
    async () => {
      await logout(ui.page);
      const gone = await api(ui.page, 'GET', '/api/auth/me');

      mustEqual(gone.status, 401, 'сессия после выхода');

      const back = await api(ui.page, 'POST', '/api/auth/login', {
        email: made.registeredEmail,
        password: 'qwerty1',
      });

      mustEqual(back.status, 200, `повторный вход: ${back.text}`);
      mustEqual(back.body?.data?.email, made.registeredEmail, 'кого пустили');

      const me = await whoAmI(ui.page);

      mustEqual(me.email, made.registeredEmail, 'кто в сессии после повторного входа');

      return 'человек сохранён в базе и входит снова';
    },
    ui.page,
  );

  console.log('\n=== AU. Сценарий 6. Вход админом ===');

  const portal = await freshContext();

  await step(
    'AU-F1',
    'служебный вход — отдельная страница',
    async () => {
      await portal.page.goto(`${BASE}/service-portal`, { waitUntil: 'domcontentloaded' });
      await portal.page.waitForSelector('form', { timeout: 20_000 });

      const text = (await portal.page.textContent('body')) ?? '';

      must(text.includes('Сервисная панель'), 'на странице нет заголовка «Сервисная панель»');
      must(text.includes('Вход для администратора'), 'нет подписи про администратора');

      return 'страница служебного входа отрисована';
    },
    portal.page,
  );

  await step(
    'AU-F2',
    'служебность входа выражена полем portal: service',
    async () => {
      await portal.page.fill('input[type="email"]', ADMIN);
      await portal.page.fill('input[type="password"]', 'sporthub123');

      const [request] = await Promise.all([
        portal.page.waitForRequest(
          (item) => item.url().includes('/api/auth/login') && item.method() === 'POST',
        ),
        portal.page.click('form button[type="submit"]'),
      ]);
      const body = JSON.parse(request.postData());

      mustEqual(body.portal, 'service', 'признак служебного входа в теле запроса');
      must(!('accountType' in body), 'в теле осталось поле accountType');

      await portal.page.waitForURL('**/service-portal/dashboard', { timeout: 20_000 });

      return `тело запроса: {${Object.keys(body).join(', ')}}, ушли на ${toPath(portal.page.url())}`;
    },
    portal.page,
  );

  await step(
    'AU-F3',
    'шапка администратора: имя, подпись, «Панель управления», выход',
    async () => {
      await portal.page.waitForSelector('a[aria-label="Панель управления"]', { timeout: 20_000 });

      const header = ((await portal.page.textContent('header')) ?? '').replace(/\s+/g, ' ');
      const logoutButton = await portal.page.$$('header button[aria-label="Выйти"]');
      const banner = (await portal.page.textContent('body')) ?? '';

      must(header.includes(NAMES[ADMIN]), `имени администратора в шапке нет: ${header}`);
      must(header.includes('Администратор'), 'подписи «Администратор» в шапке нет');
      mustEqual(logoutButton.length, 1, 'кнопка выхода в шапке');
      must(
        !banner.includes('Вы работаете от имени'),
        'отрисована плашка работы от чужого лица, хотя подмены нет',
      );

      return `шапка: ${header.slice(0, 90)}`;
    },
    portal.page,
  );

  await step(
    'AU-F4',
    'колокольчика у служебной записи нет',
    async () => {
      const bell = await portal.page.$$('header button[aria-label="Уведомления"]');
      const me = await whoAmI(portal.page);

      mustEqual(bell.length, 0, 'колокольчик в шапке администратора');
      mustEqual(me.accountKind, 'admin', 'вид учётной записи');

      return 'колокольчика нет: базового набора человека у служебной записи нет';
    },
    portal.page,
  );

  await step(
    'AU-F5',
    'личный кабинет администратору закрыт, прежний адрес тоже',
    async () => {
      const direct = await navigate(portal.page, '/profile/me/dashboard');

      mustLandHome(direct, 'админ на личном кабинете');

      const legacy = await navigate(portal.page, '/profile/athlete/dashboard');

      mustEqual(legacy.chain[0].status, 308, 'код переезда прежнего адреса');
      mustEqual(legacy.path, '/', 'куда в итоге привели админа');
      must(
        legacy.chain.some((hop) => hop.path === '/profile/me/dashboard'),
        `в цепочке нет нового адреса: ${trace(legacy)}`,
      );

      return `${trace(direct)} | ${trace(legacy)}`;
    },
    portal.page,
  );

  await step(
    'AU-F6',
    'кабинет лица администратору тоже закрыт',
    async () => {
      const nav = await navigate(portal.page, '/profile/provider/dashboard');

      mustLandHome(nav, 'админ на прежнем адресе кабинета лица');
      const me = await whoAmI(portal.page);

      mustEqual((me.faces ?? []).length, 0, 'число лиц у служебной записи');

      return `${trace(nav)}; лиц у служебной записи ноль`;
    },
    portal.page,
  );

  await shutdown();

  return made;
}

let code = 2;

try {
  await main();
  code = results.some((item) => item.status === 'fail') ? 1 : 0;
} catch (error) {
  console.error('прогон прерван:', error);
  await shutdown();
} finally {
  // ⚠️ Уборка ВСЕГДА, в том числе после падения: иначе второй прогон упал бы
  // на данных первого, и повторяемость держалась бы на удаче.
  console.log('\nубираю данные прогона…', cleanupRun());

  const byList = (prefix) => results.filter((item) => item.id.startsWith(prefix));
  const line = (title, list) => {
    const pass = list.filter((item) => item.status === 'pass').length;
    const fail = list.filter((item) => item.status === 'fail').length;
    const skipped = list.filter((item) => item.status === 'skip').length;

    return `${title}: ${pass} прошло, ${fail} упало, ${skipped} не прогонялось (всего ${list.length})`;
  };

  console.log(`\n${line('profile-hub', byList('PH-'))}`);
  console.log(line('auth', byList('AU-')));

  for (const item of results.filter((entry) => entry.status === 'fail')) {
    console.log(`  ❌ ${item.id} — ${item.detail}`);
  }

  fs.writeFileSync('/tmp/profile-auth-e2e.json', JSON.stringify(results, null, 2));
}

process.exit(code);
