// Браузерный прогон чек-листа фазы 38 «Главная и каталог на новом дизайне» —
// `tests/checklists/phase-38-home.md` (80 шагов, 11 сценариев; с 38.79b главная — ровно
// макет, рабочая часть — на `/catalog`; шаги 47, 50, 51 — проверки отсутствия снятого).
//
// Запуск: E2E_RUN_TAG=ph38-a node tests/e2e-phase-38-run.mjs
//
// ⚠️ Свой признак прогона обязателен: прогонов несколько, они ходят в ОДНУ базу,
// и общий признак означал бы, что уборка одного сносит данные другого.
//
// ⚠️ Прогон написан ДО переноса (шаг 38.5) и сознательно обязан краснеть на всём,
// чего ещё нет: витрины, счётчиков `/stats/overview`, верификации, шрифтов, меню
// на 960. Красный шаг «до переноса» — не дефект прогона, а мера того, что осталось
// сделать. Шаг, который мог бы пройти сегодня «с натяжкой», не подгоняется:
// проверяется контракт чек-листа, а не текущее состояние.
//
// ⚠️ Правило прогона (шапка чек-листа): шаг НЕ засчитывается по коду ответа.
// Проверяется то, что видно на экране и в дереве доступности. Там, где чек-лист
// говорит «в журнале строка …», смотрит ПРОГОН через `readDb()`: у страницы
// соединения с базой нет.
//
// ⚠️ Уроки фазы 37, учтённые здесь:
//   • номера строк из базы читаются `readDbId()`, а не `Number(readDb())`: `psql -tAc`
//     печатает следом тег команды (здесь номера приходят из ответов API);
//   • всё стёртое по ходу прогона запоминается в `erased` и передаётся уборке
//     параметром `subjects` — надзорная строка переживает свой предмет;
//   • строки журнала о людях прогона, написанные ЖИВЫМ администратором (подмена,
//     модерация), реестр планов не уносит — их убирает добор по окну прогона;
//   • уборка идёт в `finally` и после падения посреди прогона.
//
// ⚠️ Отступления от буквы чек-листа, названные вслух:
//   1. Личности разведены по отдельным браузерным контекстам, а не сменой сессии
//      в одном окне — гость гарантированно без cookie.
//   2. «Отказ сервера» на отметке уведомления (step-29) — обрыв запроса к `/read`
//      на сети (`route.abort`), а не подменённый ответ: скил запрещает мокать API,
//      недоступность сервера — не мок. Удалять строку в базе нельзя: тогда падает
//      и настоящий счёт, и откат неотличим от честного пересчёта.
//   3. «Отказ карты» (step-22) — блокировка адреса `api-maps.yandex.ru` в отдельном
//      контексте. Это не подмена API продукта (её скил запрещает), а недоступность
//      чужого сервиса, которую страница обязана пережить.
//   4. Замер «до покраски» для контраста (step-59) снимается ЭТИМ прогоном, если
//      файла базовой линии ещё нет: `tests/screenshots/phase-38/contrast-baseline.json`.
import fs from 'node:fs';
import path from 'node:path';

// ⚠️ Каталог снимков задаётся ДО загрузки обвязки: она читает переменную окружения
// на уровне модуля, а статический импорт выполнился бы раньше присваивания.
process.env.E2E_SHOTS_DIR ??= path.join(
  path.dirname(new URL(import.meta.url).pathname),
  'screenshots',
  'phase-38',
);

const { BASE, api, freshContext, launch, loginAs, must, mustEqual, results, shutdown, step, whoAmI } =
  await import('./e2e-phase-35-harness.mjs');
const { E2E_USERS, RUN_TAG, cleanupRun, readDb, seedRunUsers } = await import(
  '../scripts/e2e-fixture.mjs'
);

const HERE = path.dirname(new URL(import.meta.url).pathname);
const SHOTS = process.env.E2E_SHOTS_DIR;
const STUBS_REGISTRY = path.join(HERE, 'checklists', 'phase-38-stubs.md');
const CONTRAST_BASELINE = path.join(SHOTS, 'contrast-baseline.json');

/** Живая служебная запись: модератором может быть только она. */
const ADMIN = 'admin@sporthub.local';
/** Текст подсказки входа на записи — `apps/web/src/lib/auth-prompts.ts`. */
const BOOKING_REQUIRES_LOGIN = 'Чтобы записаться, войдите или зарегистрируйтесь';
/** Часовой пояс площадки — `DEFAULT_TIME_ZONE` в `packages/types`. */
const TIME_ZONE = 'Europe/Samara';
/**
 * Окна сценария 7 — каждая точка с ОБЕИХ сторон (N−1 и N): брейкпоинты у нас
 * `min-width`, точка входит в широкое состояние (решение по 38.63, реестр № 24a).
 */
const BREAKPOINTS = [1920, 1919, 1440, 1439, 1280, 1279, 1100, 1099, 960, 959, 768, 767, 430];

/**
 * Сырые цвета СТАРОЙ разметки — по ним ищутся «пятна» после покраски (step-37, step-57).
 * Список — из `page.tsx`/`Header.tsx` до фазы 38: тёмно-синий герой `#0A1029`, мятный
 * `#BFDFD2`, бирюзовые свечения. Появление любого из них на экране — пятно.
 *
 * ⚠️ Это проверка ИЗВЕСТНЫХ пятен, не доказательство их отсутствия: сторож
 * `no-raw-colors` (шаг 38.8) стережёт по коду, прогон — по экрану.
 */
const LEGACY_COLORS = ['rgb(10, 16, 41)', 'rgb(191, 223, 210)', 'rgb(80, 188, 147)', 'rgb(131, 211, 181)'];

/** Число из базы: `readDb` отдаёт текст. */
const num = (sql) => Number(readDb(sql));

/** Текущие дата и час по времени площадки: слоты главной — только сегодняшние. */
function samaraNow() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) % 24 };
}

/**
 * Сегодняшний слот, у которого конец ещё впереди.
 *
 * ⚠️ Главная показывает только сегодняшние занятия с непрошедшим `endTime`
 * (`getUpcomingSessions.ts:35-38`). Дата берётся по поясу площадки, а не по
 * `toISOString()`: после полуночи по Самаре UTC-дата ещё вчерашняя.
 */
function todaySlot(title, { capacity = '10', sportId = 1 } = {}) {
  const { date, hour } = samaraNow();
  const start = Math.min(hour + 1, 23);
  const hh = (h) => String(h).padStart(2, '0');
  return {
    title,
    date,
    startTime: `${hh(start)}:00`,
    endTime: start === 23 ? '23:50' : `${hh(start + 1)}:00`,
    price: '700',
    capacity,
    location: 'Зал',
    sportId,
  };
}

/** Тело публикации клуба. */
const clubForm = (name, slots, over = {}) => ({
  name,
  city: 'Самара',
  address: 'ул. Витринная, 1',
  description:
    'Клуб для прогона чек-листа фазы 38. Описание длиной заведомо больше пятидесяти символов, как требует схема.',
  phone: '+7 (900) 559-38-10',
  email: `${RUN_TAG}-club@test.local`,
  priceFrom: '1200',
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

/** Тело карточки тренера. `clubId` заводит подтверждённую связь сразу. */
const trainerForm = (last, clubId, slots) => ({
  firstName: RUN_TAG,
  lastName: last,
  city: 'Самара',
  address: 'ул. Витринная, 2',
  bio: 'Карточка для прогона чек-листа фазы 38. Описание длиной заведомо больше пятидесяти символов, как требует схема.',
  experience: '5',
  sportIds: [1, 3],
  specialtyIds: [1],
  workFormatIds: [1],
  phone: '+7 (900) 559-38-11',
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
  scheduleSlots: slots,
});

/** Открыть главную и дождаться каркаса. */
/**
 * ⚠️ Всегда ПОЛНАЯ загрузка: переход на тот же путь с другим (или без) `#…` браузер
 * считает переходом внутри документа и страницу не перезапрашивает — так в первом
 * проходе 38.96 карточка на /catalog#results после verify показывалась без знака
 * (страница осталась от step-60). Через `about:blank` документ гарантированно новый.
 */
async function openHome(page, { width = 1440, height = 900, hash = '' } = {}) {
  await page.setViewportSize({ width, height });
  await page.goto('about:blank');
  await page.goto(`${BASE}/${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header', { timeout: 20_000 });
  await page.waitForTimeout(1_500);
}

/**
 * Рабочая часть — поиск, карта, выдача, слоты — с 38.79a живёт на `/catalog`
 * (решение заказчика 16.09, файл фазы 2.1 п. 16). Главная — ровно макет.
 */
const CATALOG_PATH = '/catalog';
/** Секции главной верхнего уровня по порядку словаря `home-sections.ts` (38.79b). */
const HOME_ORDER = ['hero', 'steps', 'features', 'clubs', 'trainers', 'cta'];
/** Секции рабочей части — словарь `catalog-sections.ts`; на главной их быть не должно. */
const CATALOG_IDS = ['discover', 'map', 'results', 'availability'];

async function openCatalog(page, { width = 1440, height = 900, hash = '' } = {}) {
  await page.setViewportSize({ width, height });
  await page.goto('about:blank');
  await page.goto(`${BASE}${CATALOG_PATH}${hash}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header', { timeout: 20_000 });
  await page.waitForTimeout(1_500);
}

/** Пауза — анимации и ленивые запросы. */
const wait = (page, ms) => page.waitForTimeout(ms);

/**
 * Какими ШРИФТАМИ ПЛАТФОРМЫ отрисован узел — по глифам (DevTools-протокол).
 *
 * ⚠️ `getComputedStyle().fontFamily` и `document.fonts.check()` по-глифовую
 * подстановку не видят — заголовок «в Sofia» может быть набран Helvetica.
 * `CSS.getPlatformFontsForNode` называет семейства с числом глифов из каждого.
 */
async function platformFonts(page, selector) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) return [];
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    return fonts.map((f) => ({ family: f.familyName, custom: f.isCustomFont, glyphs: f.glyphCount }));
  } finally {
    await cdp.detach();
  }
}

const fontsLine = (fonts) =>
  fonts.map((f) => `${f.family}${f.custom ? '' : ' (системный)'}: ${f.glyphs} гл.`).join(', ') || 'узел не найден';

/** Пятна старой палитры на экране: элементы с цветом из `LEGACY_COLORS`. */
async function legacySpots(page) {
  return page.evaluate((legacy) => {
    const seen = new Set();
    const spots = [];
    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      for (const prop of ['color', 'background-color', 'border-top-color']) {
        const value = cs.getPropertyValue(prop);
        seen.add(value);
        if (legacy.includes(value)) {
          spots.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} ${prop}=${value}`);
        }
      }
    }
    return { spots: spots.slice(0, 8), spotCount: spots.length, distinct: seen.size };
  }, LEGACY_COLORS);
}

/**
 * Контраст текста к фону по видимым текстовым узлам: минимум и число ниже AA (4.5).
 * Фон — ближайший непрозрачный предок; полупрозрачный текст смешивается с ним.
 */
async function contrastScan(page) {
  return page.evaluate(() => {
    const parse = (s) => {
      const m = /rgba?\(([^)]+)\)/.exec(s);
      if (!m) return null;
      const p = m[1].split(',').map((v) => parseFloat(v));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const lum = ({ r, g, b }) => {
      const lin = (c) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    const bgOf = (el) => {
      let node = el;
      while (node && node !== document.documentElement) {
        const c = parse(getComputedStyle(node).backgroundColor);
        if (c && c.a > 0.95) return c;
        node = node.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const rows = [];
    for (const el of document.querySelectorAll('h1,h2,h3,p,a,button,span,label,li,td,th')) {
      const text = (el.childNodes[0]?.nodeType === 3 ? el.childNodes[0].textContent : '').trim();
      if (text.length < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const fg = parse(cs.color);
      if (!fg) continue;
      const bg = bgOf(el);
      const mixed = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
      const l1 = lum(mixed);
      const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      rows.push({ text: text.slice(0, 30), ratio: Math.round(ratio * 100) / 100 });
    }
    rows.sort((a, b) => a.ratio - b.ratio);
    return {
      sampled: rows.length,
      belowAA: rows.filter((r) => r.ratio < 4.5).length,
      min: rows[0] ?? null,
      worst: rows.slice(0, 5).map((r) => `«${r.text}» ${r.ratio}:1`),
    };
  });
}

/** Все внутренние ссылки-якоря на странице и отсутствующие цели. */
async function hashLinks(page) {
  return page.evaluate(({ catalogPath, catalogIds, homeOrder }) => {
    const here = location.pathname;
    const links = Array.from(document.querySelectorAll('a[href*="#"]'));
    const rows = links.map((a) => {
      const href = a.getAttribute('href') ?? '';
      const hash = href.slice(href.indexOf('#') + 1);
      const targetPath = href.startsWith('#') ? here : href.split('#')[0] || '/';
      const samePage = targetPath === here;
      // Якорь на ДРУГУЮ страницу проверяется по её словарю — DOM той страницы здесь нет.
      const known = targetPath === catalogPath ? catalogIds : targetPath === '/' ? homeOrder : null;
      const exists = samePage ? Boolean(document.getElementById(hash)) : known !== null && known.includes(hash);
      return { label: a.textContent.trim().slice(0, 30), href, hash, samePage, exists };
    });
    return { total: rows.length, missing: rows.filter((r) => !r.exists) };
  }, { catalogPath: CATALOG_PATH, catalogIds: CATALOG_IDS, homeOrder: HOME_ORDER });
}

/** Секции главной по порядку: id и подпись — для сверки с эталоном. */
async function sectionsOrder(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('main section')).filter((s) => s.parentElement?.closest('section') === null).map((s) => {
      const heading = s.querySelector('h1,h2')?.innerText.replace(/\n/g, ' ').slice(0, 30) ?? '';
      return `${s.id ? '#' + s.id : '(без id)'}${s.getAttribute('aria-label') ? ' «' + s.getAttribute('aria-label') + '»' : ''}${heading ? ' ' + heading : ''}`;
    }),
  );
}

/**
 * Нажать ссылку по подписи и записать, что изменилось: адрес, хэш, прокрутка,
 * положение цели. «Куда-то привела» — сменился адрес либо цель якоря оказалась
 * в окне.
 */
async function followLink(page, locator) {
  const before = await page.evaluate(() => ({ path: location.pathname, hash: location.hash, y: window.scrollY }));
  const href = await locator.getAttribute('href');
  await locator.click();
  await wait(page, 1_200);
  const after = await page.evaluate((h) => {
    const hash = h && h.includes('#') ? h.slice(h.indexOf('#') + 1) : '';
    const target = hash ? document.getElementById(hash) : null;
    const rect = target?.getBoundingClientRect();
    return {
      path: location.pathname,
      hash: location.hash,
      y: window.scrollY,
      targetExists: Boolean(target),
      targetInView: rect ? rect.top >= -4 && rect.top < window.innerHeight : false,
      notFound: document.body.innerText.includes('Такой страницы нет'),
    };
  }, href);
  // Ссылка на ТЕКУЩУЮ страницу без якоря (логотип «/» на главной) экран менять не обязана —
  // это не тупик, а «вы уже здесь»; считается пришедшей.
  const selfLink = href !== null && !href.includes('#') && href.split('?')[0] === before.path;
  const moved = selfLink || after.path !== before.path || (after.targetExists && (after.targetInView || after.y !== before.y));
  return { href, before, after, moved };
}

/**
 * Число колонок сетки по карточкам: сколько карточек делят верх первого ряда.
 *
 * ⚠️ Слайды CardSlider не считаются: у ленты все карточки в одном ряду, и шесть
 * слайдов выглядели бы шестью колонками. Витрина — сетка вне `[data-card-slider-rail]`.
 */
async function columnsOf(locator) {
  const tops = await locator.evaluateAll((els) =>
    els.filter((el) => !el.closest('[data-card-slider-rail], [data-testid$="-scroll"]')).map((el) => Math.round(el.getBoundingClientRect().top)),
  );
  if (tops.length === 0) return 0;
  return tops.filter((t) => t === tops[0]).length;
}

/** Карточки клубов: новая подпись `aria-label="Карточка клуба: …"`, иначе прежний testid. */
const clubCards = (page) => page.locator('[aria-label^="Карточка клуба"], [data-testid="club-card"]');
const trainerCards = (page) => page.locator('[aria-label^="Карточка тренера"], [data-testid="trainer-card"]');

/** Переключить режим «Тренеры»: виджет героя либо прежний чип. */
async function switchToTrainers(page) {
  // Сегмент «Клубы / Тренеры» с `aria-pressed`: в герое главной и в поиске каталога.
  const segment = page.locator('button[aria-pressed]', { hasText: /^Тренеры$/ });
  if ((await segment.count()) > 0) {
    await segment.first().click();
  } else {
    await page.locator('button', { hasText: 'По тренерам' }).first().click();
  }
  await wait(page, 800);
}

/** Поле поиска в герое — контракт после переноса. Прежний SearchBar живёт в #discover. */
const heroInput = (page) => page.locator('main section').first().locator('input[type="search"], input[type="text"], input:not([type])');

/** Снимок живой базы ДО прогона — на уровне модуля, чтобы дожить до `finally`. */
const startMaxLogId = num('SELECT coalesce(max(id), 0) FROM logs;');
const startMaxNotificationId = num('SELECT coalesce(max(id), 0) FROM notifications;');
const startSupervisionTotal = num(`SELECT count(*) FROM notifications WHERE addressee_kind = 'supervision';`);
console.log(`До прогона: надзорных строк ${startSupervisionTotal}, журнал до #${startMaxLogId}`);

/** Предметы, СТЁРТЫЕ прогоном, — их номера уборке передаются явно. */
const erased = [];

async function main() {
  const users = seedRunUsers();
  const ownerId = Number(users[E2E_USERS.builder]);
  const clientId = Number(users[E2E_USERS.client]);
  console.log(`Люди прогона: владелец ${ownerId}, клиент ${clientId}`);

  await launch();
  const guest = await freshContext();
  const person = await freshContext();
  const owner = await freshContext();
  const admin = await freshContext();
  for (const { context } of [guest, person, owner, admin]) context.setDefaultTimeout(10_000);

  await loginAs(admin.page, ADMIN, { portal: 'service' });
  await loginAs(owner.page, E2E_USERS.builder);
  await loginAs(person.page, E2E_USERS.client);
  const adminId = (await whoAmI(admin.page))?.id;

  // ───────────────────────── Данные прогона ─────────────────────────
  // Клуб А — витрина, слоты сегодня: открытый и полный (вместимость 1, занят клиентом).
  // Клуб Б — верификация и скрытие модератором (step-68). Клуб В — верификация
  // и архив владельцем (step-68): архив вместо стирания требует живой записи.
  // Карточка Т — связь с клубом А, своё сегодняшнее окно, верификация тренера.
  const made = { clubA: null, clubASlug: '', clubB: null, clubC: null, trainer: null, trainerSlug: '', openSlot: null, fullSlot: null, fullBooking: null, slotC: null };
  const nameA = `${RUN_TAG} Клуб А`;
  const nameB = `${RUN_TAG} Клуб Б`;
  const nameC = `${RUN_TAG} Клуб В`;

  const createA = await api(owner.page, 'POST', '/api/clubs', clubForm(nameA, [todaySlot('Открытое занятие А'), todaySlot('Полное занятие А', { capacity: '1' })]));
  must(createA.status === 201 || createA.status === 200, `клуб А не создан: ${createA.status} ${createA.text}`);
  made.clubA = createA.body?.data?.club?.id;
  made.clubASlug = createA.body?.data?.club?.slug ?? '';
  const slotsA = createA.body?.data?.schedules ?? [];
  made.openSlot = slotsA.find((s) => s.title === 'Открытое занятие А')?.id ?? slotsA[0]?.id;
  made.fullSlot = slotsA.find((s) => s.title === 'Полное занятие А')?.id ?? slotsA[1]?.id;

  const createB = await api(owner.page, 'POST', '/api/clubs', clubForm(nameB, [todaySlot('Занятие Б')]));
  must(createB.status === 201 || createB.status === 200, `клуб Б не создан: ${createB.status} ${createB.text}`);
  made.clubB = createB.body?.data?.club?.id;

  const createC = await api(owner.page, 'POST', '/api/clubs', clubForm(nameC, [todaySlot('Занятие В')]));
  must(createC.status === 201 || createC.status === 200, `клуб В не создан: ${createC.status} ${createC.text}`);
  made.clubC = createC.body?.data?.club?.id;
  made.slotC = (createC.body?.data?.schedules ?? [])[0]?.id;

  const createT = await api(owner.page, 'POST', '/api/trainers', trainerForm('Тренер', made.clubA, [todaySlot('Персоналка прогона')]));
  must(createT.status === 201 || createT.status === 200, `карточка тренера не создана: ${createT.status} ${createT.text}`);
  made.trainer = createT.body?.data?.trainer?.id;
  made.trainerSlug = createT.body?.data?.trainer?.slug ?? '';

  // Записи клиента: полный слот А (занять единственное место) и слот В (живая
  // запись, ради которой уборка клуба В станет архивом, а не стиранием).
  for (const scheduleId of [made.fullSlot, made.slotC]) {
    const book = await api(person.page, 'POST', '/api/bookings', { scheduleId });
    must(book.status === 201 || book.status === 200, `запись на слот ${scheduleId} не создана: ${book.status} ${book.text}`);
    // Запись на полный слот отменяется в step-26: «освободилось — слот вернулся».
    if (scheduleId === made.fullSlot) made.fullBooking = book.body?.data?.id ?? book.body?.data?.booking?.id ?? null;
  }
  // ⚠️ Запись на полный слот — ПОДТВЕРДИТЬ владельцем: слот прогона начинается через час,
  // а pending-запись за час до начала система отменяет сама (`autoCancelHoursBeforeStart: 1`)
  // первым же обращением к записям — и отмена человеком в step-26 отбивалась 409
  // «cancelled_by_provider → cancelled_by_athlete» (проход 1 финального захода).
  if (made.fullBooking !== null) {
    const confirm = await api(owner.page, 'POST', `/api/bookings/${made.fullBooking}/confirm`, {});
    must(confirm.status === 200 || confirm.status === 201, `подтверждение записи ${made.fullBooking} владельцем: ${confirm.status} ${confirm.text}`);
  }
  console.log(`Публикации прогона: клубы ${made.clubA}, ${made.clubB}, ${made.clubC}; карточка ${made.trainer}; слоты ${made.openSlot} (открыт), ${made.fullSlot} (полон)`);

  const sports = (await api(guest.page, 'GET', '/api/sports')).body?.data ?? [];

  // ───────────────────────── Scenario 1: витрина гостю ─────────────────────────
  console.log('\nScenario 1: витрина гостю — ни одной ссылки в никуда');

  await step('step-1', 'шесть секций по порядку словаря, под призывом ничего, рабочей части на главной нет', async () => {
    await openHome(guest.page);
    const order = await sectionsOrder(guest.page);
    const ids = order.map((row) => row.match(/^#(\S+)/)?.[1] ?? '(без id)');
    mustEqual(ids.join(' → '), HOME_ORDER.join(' → '), 'секции главной по порядку');
    // Под призывом ничего: призыв — последний элемент `main` с содержимым.
    const tail = await guest.page.evaluate(() => {
      const main = document.querySelector('main');
      const cta = document.getElementById('cta');
      if (!main || !cta) return 'нет #cta';
      let node = cta;
      while (node.parentElement && node.parentElement !== main) node = node.parentElement;
      const after = [];
      for (let n = node.nextElementSibling; n; n = n.nextElementSibling) if (n.textContent?.trim()) after.push(n.tagName.toLowerCase() + (n.id ? '#' + n.id : ''));
      return after.join(', ');
    });
    must(tail === '', `под призывом есть содержимое: ${tail}`);
    const stray = await guest.page.evaluate((ids) => ids.filter((id) => document.getElementById(id) !== null), CATALOG_IDS);
    must(stray.length === 0, `секции рабочей части на главной: ${stray.map((id) => '#' + id).join(', ')}`);
    return `секции: ${order.join(' → ')}; под призывом пусто; рабочей части нет`;
  }, guest.page);

  await step('step-2', 'герой показывает четыре счётчика, числа совпадают с /stats/overview', async () => {
    const stats = await api(guest.page, 'GET', '/api/stats/overview');
    must(stats.status === 200 && stats.body?.success, `/api/stats/overview ответил ${stats.status}`);
    const hero = guest.page.locator('main section').first();
    const counters = await hero.locator('dl[aria-label="Площадка в числах"] dd .sr-only, [data-testid^="stat-"], [data-counter]').evaluateAll((els) => els.map((el) => el.textContent.trim()));
    must(counters.length === 4, `счётчиков в герое ${counters.length}, ожидалось 4`);
    const values = Object.values(stats.body.data).map(Number);
    const digits = counters.map((c) => Number(c.replace(/[^\d]/g, '')));
    const mismatch = digits.filter((d) => !values.includes(d));
    must(mismatch.length === 0, `числа на экране ${digits.join(',')} против ответа ${values.join(',')}`);
    return `счётчики ${counters.join(' · ')} = ответ ${JSON.stringify(stats.body.data)}`;
  }, guest.page);

  await step('step-3', 'числа — только в счётчиках: подзаголовок героя из словаря, без чисел (38.64)', async () => {
    const hero = guest.page.locator('main section').first();
    // Подзаголовок — абзац героя длиннее плашки: первый `p` с текстом от 40 знаков.
    const lede = await hero.locator('p').evaluateAll((els) => els.map((el) => el.textContent.trim()).find((t) => t.length >= 40) ?? '');
    must(lede.length > 0, 'подзаголовка героя нет');
    must(!/\d/.test(lede), `в подзаголовке есть числа (макет «50+ клубов» не переносится): «${lede.slice(0, 80)}»`);
    return `подзаголовок без чисел: «${lede.slice(0, 60)}…»`;
  }, guest.page);

  await step('step-4', 'у каждой ссылки-якоря есть цель: на своей странице — в DOM, на другой — в её словаре', async () => {
    const rows = [];
    for (const [name, open] of [['главная', openHome], ['каталог', openCatalog]]) {
      await open(guest.page);
      const links = await hashLinks(guest.page);
      must(links.missing.length === 0, `${name}: ссылок с якорем ${links.total}, без цели ${links.missing.length}: ${links.missing.map((m) => `«${m.label}» → ${m.href}`).join(', ')}`);
      rows.push(`${name}: ${links.total} ссылок, все цели существуют`);
    }
    return rows.join('; ');
  }, guest.page);

  await step('step-5', 'каждая ссылка навигации шапки куда-то приводит; Маркет и Командные → «в разработке»', async () => {
    await openHome(guest.page);
    const nav = guest.page.locator('header nav a');
    const labels = await nav.evaluateAll((els) => els.map((el) => el.textContent.trim()));
    must(labels.length > 0, 'ссылок в навигации шапки нет');
    const rows = [];
    const stuck = [];
    for (const label of labels) {
      await openHome(guest.page);
      const link = guest.page.locator('header nav a', { hasText: new RegExp(`^${label}$`) }).first();
      const r = await followLink(guest.page, link);
      rows.push(`«${label}» ${r.href} → ${r.after.path}${r.after.hash} (${r.moved ? 'привела' : 'ЭКРАН НА МЕСТЕ'}${r.after.notFound ? ', 404' : ''})`);
      if (!r.moved || r.after.notFound) stuck.push(label);
      if (/Маркет|Командные/.test(label)) {
        must(!r.after.notFound, `«${label}» отдала 404`);
        must(r.after.path !== '/', `«${label}» осталась на главной, а не на странице «в разработке»`);
        const text = await guest.page.locator('main').first().innerText();
        must(/в разработке/i.test(text), `«${label}» → ${r.after.path}, но страница не называет раздел «в разработке»`);
        // Вложенный `main` (каркас + страница) — два ориентира для диктора; ровно один.
        const mains = await guest.page.locator('main').count();
        must(mains === 1, `«${label}» → ${r.after.path}: на странице ${mains} <main>, ожидался один`);
        rows.push(`«${label}» → ${r.after.path} (фиксированный маршрут)`);
      }
    }
    // ⚠️ Решение 5.11: «раздел в разработке» — фиксированный маршрут, НЕ catch-all.
    // С `[...rest]` любой адрес «существует», и д-34 не покраснела бы никогда:
    // случайный адрес обязан отдавать настоящую страницу 404.
    const stray = await api(guest.page, 'GET', '/definitely-not-a-section-xyz');
    const strayText = await guest.page.evaluate(async () => (await fetch('/definitely-not-a-section-xyz')).text());
    must(stray.status === 404 || /Такой страницы нет/.test(strayText), `случайный адрес не отдаёт 404: ${stray.status} — «в разработке» стал catch-all`);
    rows.push(`случайный адрес → 404 (не catch-all)`);
    must(labels.some((l) => /Маркет/.test(l)) && labels.some((l) => /Командные/.test(l)), `пунктов «Маркет» и «Командные» в шапке нет: ${labels.join(' · ')}`);
    // 38.79c: шапка — Клубы, Тренеры, Как это работает, Возможности, Командные, Маркет.
    for (const expected of ['Клубы', 'Тренеры', 'Как это работает', 'Возможности']) {
      must(labels.includes(expected), `в шапке нет пункта «${expected}»: ${labels.join(' · ')}`);
    }
    for (const gone of ['Подборки', 'Выдача', 'Слоты']) {
      must(!labels.includes(gone), `в шапке остался пункт «${gone}» — рабочая часть переехала на /catalog (38.79c)`);
    }
    must(stuck.length === 0, `оставили экран на месте: ${stuck.join(', ')} — ${rows.join('; ')}`);
    return rows.join('; ');
  }, guest.page);

  await step('step-5a', '«Клубы» и «Тренеры» в шапке ведут на /catalog#results и переключают режим', async () => {
    const rows = [];
    for (const [label, expectCards] of [['Тренеры', trainerCards], ['Клубы', clubCards]]) {
      await openHome(guest.page);
      const link = guest.page.locator('header nav a', { hasText: new RegExp(`^${label}$`) }).first();
      must((await link.count()) > 0, `пункта «${label}» в шапке нет`);
      const r = await followLink(guest.page, link);
      mustEqual(`${r.after.path}${r.after.hash}`, `${CATALOG_PATH}#results`, `«${label}» → адрес`);
      const other = label === 'Тренеры' ? clubCards : trainerCards;
      // `clubCards`/`trainerCards` строят локатор от страницы; локатор секции подходит так же.
      const inResults = guest.page.locator('#results');
      const cards = await expectCards(inResults).count();
      const strangers = await other(inResults).count();
      must(cards > 0 && strangers === 0, `после «${label}» в выдаче своих карточек ${cards}, чужих ${strangers}`);
      rows.push(`«${label}» → ${r.after.path}${r.after.hash}, карточек ${cards}`);
    }
    return rows.join('; ');
  }, guest.page);

  await step('step-6', 'каждая ссылка подвала куда-то приводит', async () => {
    await openHome(guest.page);
    const labels = await guest.page.locator('footer a').evaluateAll((els) => els.map((el) => el.textContent.trim()).filter(Boolean));
    must(labels.length > 0, 'ссылок в подвале нет');
    const rows = [];
    const stuck = [];
    for (const label of labels) {
      await openHome(guest.page);
      const link = guest.page.locator('footer a', { hasText: new RegExp(`^${label}$`) }).first();
      const r = await followLink(guest.page, link);
      rows.push(`«${label}» ${r.href} → ${r.after.path}${r.after.hash} (${r.moved ? 'привела' : 'ЭКРАН НА МЕСТЕ'}${r.after.notFound ? ', 404' : ''})`);
      if (!r.moved || r.after.notFound) stuck.push(label);
    }
    must(stuck.length === 0, `оставили экран на месте: ${stuck.join(', ')} — ${rows.join('; ')}`);
    return rows.join('; ');
  }, guest.page);

  await step('step-7', 'в подвале нет признания «ссылки работают как заглушки»', async () => {
    await openHome(guest.page);
    const text = await guest.page.locator('footer').innerText();
    must(!/заглушк/i.test(text), `подвал признаётся: «${text.match(/[^\n]*заглушк[^\n]*/i)?.[0]}»`);
    return `текст подвала без признаний (${text.length} символов)`;
  }, guest.page);

  await step('step-8', 'на витрине нет обещаний разделов вне фазы', async () => {
    const text = await guest.page.locator('main').first().innerText();
    const found = text.match(/дневник\w*|маркет\w*|челлендж\w*|живая лента|сообществ\w*/gi) ?? [];
    must(found.length === 0, `обещания вне фазы: ${[...new Set(found.map((f) => f.toLowerCase()))].join(', ')}`);
    return 'дневников, маркета, челленджей и ленты на витрине нет';
  }, guest.page);

  /**
   * Куда попадает клик в разных местах карточки: по реестру (№ 86, 97) кликабельна ВСЯ
   * карточка — растянутая ссылка. `elementFromPoint` в пяти точках (углы, фото, описание,
   * низ) обязан находить ссылку на страницу публикации.
   */
  async function cardLinkCoverage(card, hrefPrefix) {
    return card.evaluate((el, prefix) => {
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect();
      const points = { 'лев-верх': [0.05, 0.05], фото: [0.5, 0.3], описание: [0.5, 0.65], низ: [0.5, 0.95], 'прав-верх': [0.9, 0.05] };
      const dead = [];
      for (const [label, [fx, fy]] of Object.entries(points)) {
        const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
        const link = hit?.closest('a');
        if (!link || !(link.getAttribute('href') ?? '').startsWith(prefix)) dead.push(`${label}: ${hit?.tagName.toLowerCase() ?? 'пусто'}`);
      }
      return dead;
    }, hrefPrefix);
  }

  await step('step-9', 'карточка клуба в карусели «Клубы» открывает ЭТОТ клуб — из любой точки карточки', async () => {
    await openHome(guest.page);
    const card = clubCards(guest.page.locator('#clubs')).first();
    must((await card.count()) > 0, 'карточек клубов в карусели «Клубы» нет');
    const name = (await card.getAttribute('aria-label'))?.replace(/^Карточка клуба:\s*/, '') ?? (await card.locator('h3, a').first().innerText());
    const dead = await cardLinkCoverage(card, '/clubs/');
    must(dead.length === 0, `карточка кликабельна не целиком — мимо ссылки: ${dead.join('; ')}`);
    // Клик по описанию, а не по имени: ссылка растянута на всю карточку.
    const box = await card.boundingBox();
    await card.click({ position: { x: box.width / 2, y: box.height * 0.65 } });
    await wait(guest.page, 1_500);
    const url = guest.page.url();
    must(/\/clubs\/[^/]+$/.test(url), `клик по карточке не открыл клуб: ${url}`);
    const h1 = await guest.page.locator('h1').first().innerText();
    mustEqual(h1.trim(), name.trim(), 'заголовок открытого клуба');
    return `«${name}» → ${new URL(url).pathname}; пять точек карточки — ссылка`;
  }, guest.page);

  await step('step-10', 'карточка тренера в карусели «Тренеры» открывает этого тренера', async () => {
    await openHome(guest.page);
    const card = trainerCards(guest.page.locator('#trainers')).first();
    must((await card.count()) > 0, 'карточек тренеров в карусели «Тренеры» нет');
    const name = (await card.getAttribute('aria-label'))?.replace(/^Карточка тренера:\s*/, '') ?? (await card.locator('h3, a').first().innerText());
    const dead = await cardLinkCoverage(card, '/trainers/');
    must(dead.length === 0, `карточка кликабельна не целиком — мимо ссылки: ${dead.join('; ')}`);
    const box = await card.boundingBox();
    await card.click({ position: { x: box.width / 2, y: box.height * 0.4 } });
    await wait(guest.page, 1_500);
    const url = guest.page.url();
    must(/\/trainers\/[^/]+$/.test(url), `клик по карточке не открыл тренера: ${url}`);
    const h1 = await guest.page.locator('h1').first().innerText();
    mustEqual(h1.trim(), name.trim(), 'заголовок открытого тренера');
    return `«${name}» → ${new URL(url).pathname}`;
  }, guest.page);

  await step('step-10a', 'карусели витрины: «Клубы» — шесть по sort=rating, «Тренеры» — четыре, порядок = ответ API', async () => {
    // Какие адреса спрашивает СЕРВЕРНАЯ страница, браузеру не видно — это стережёт
    // `home-page-requests` (jsdom). Здесь — видимая половина: число и порядок карточек
    // против ответа тех же адресов с `limit`.
    await openHome(guest.page);
    const rows = [];
    for (const [id, path, limit, cards, prefix] of [
      ['clubs', '/api/clubs?sort=rating&limit=6', 6, clubCards, 'Карточка клуба: '],
      ['trainers', '/api/trainers?sort=rating&limit=4', 4, trainerCards, 'Карточка тренера: '],
    ]) {
      const res = await api(guest.page, 'GET', path);
      must(res.status === 200 && Array.isArray(res.body?.data), `${path} → ${res.status}`);
      const expected = res.body.data.map((row) => row.name);
      const shown = await cards(guest.page.locator(`#${id}`)).evaluateAll((els, p) => els.map((el) => (el.getAttribute('aria-label') ?? '').replace(p, '')), prefix);
      must(shown.length === Math.min(limit, expected.length), `в «${id}» карточек ${shown.length}, ожидалось ${Math.min(limit, expected.length)} (limit ${limit}, в ответе ${expected.length})`);
      mustEqual(shown.join(' | '), expected.slice(0, limit).join(' | '), `порядок карточек «${id}» против ${path}`);
      rows.push(`#${id}: ${shown.length} карточек, порядок = ${path}`);
    }
    return rows.join('; ');
  }, guest.page);

  // ───────────────────────── Scenario 2: поиск и фильтры ─────────────────────────
  console.log('\nScenario 2: поиск и фильтры');

  /** Поле поиска каталога (`#discover`) — по доступному имени режима. */
  const catalogInput = (page) => page.locator('#discover input[type="search"], #discover input[type="text"], #discover input:not([type])');

  /** Выдача каталога после перехода с главной: адрес, поле каталога, строки по запросу. */
  async function expectCatalogResults(page, query) {
    const url = new URL(page.url());
    mustEqual(`${url.pathname}${url.hash}`, `${CATALOG_PATH}#results`, 'адрес после «Найти»');
    const field = catalogInput(page).first();
    must((await field.count()) > 0, 'поля поиска на /catalog нет');
    mustEqual(await field.inputValue(), query, 'запрос в поле каталога');
    const names = await clubCards(page.locator('#results')).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label') ?? el.innerText.slice(0, 40)));
    must(names.length > 0, `в выдаче /catalog#results 0 строк по запросу «${query}»`);
    must(names.every((n) => n.includes(query)), `в выдаче ${names.length} строк, не все про «${query}»: ${names.slice(0, 3).join(' | ')}`);
    return names.length;
  }

  await step('step-11', '«Найти» и Enter с главной приводят на /catalog#results с сохранённым запросом', async () => {
    await openHome(guest.page);
    const input = heroInput(guest.page);
    must((await input.count()) > 0, 'поля поиска в герое нет');
    await input.first().fill(nameA);
    await guest.page.locator('main section').first().locator('button', { hasText: 'Найти' }).click();
    await wait(guest.page, 1_800);
    const byButton = await expectCatalogResults(guest.page, nameA);

    await openHome(guest.page);
    await heroInput(guest.page).first().fill(nameA);
    await heroInput(guest.page).first().press('Enter');
    await wait(guest.page, 1_800);
    const byEnter = await expectCatalogResults(guest.page, nameA);
    return `«Найти» → /catalog#results, ${byButton} строк по «${nameA}»; Enter — ${byEnter}`;
  }, guest.page);

  await step('step-12', 'выпадашка подсказок: категории из базы', async () => {
    await openHome(guest.page);
    const input = heroInput(guest.page);
    must((await input.count()) > 0, 'поля поиска в герое нет — выпадашке неоткуда открыться');
    await input.first().focus();
    await wait(guest.page, 500);
    // Пункт — иконка (aria-hidden) + имя вида, у популярных ещё число публикаций: берётся имя без них.
    const chips = await guest.page.locator('[data-testid="search-suggest"] button, [role="listbox"] [role="option"]').evaluateAll((els) => els.map((el) => Array.from(el.childNodes).filter((n) => !(n.nodeType === 1 && n.getAttribute('aria-hidden') === 'true')).map((n) => n.textContent).join('').replace(/\d+$/, '').trim()));
    must(chips.length > 0, 'выпадашка не открылась или в ней нет категорий');
    const dbNames = sports.map((s) => s.name);
    const alien = chips.filter((c) => !dbNames.includes(c));
    must(alien.length === 0, `категорий не из базы: ${alien.join(', ')}`);
    // Выбор категории — тем же путём, что чипы: вид в сторе, переход на выдачу каталога,
    // введённый текст не теряется (реестр № 63).
    const sport = sports.find((s) => s.id === 1) ?? sports[0];
    await input.first().fill('утренняя');
    const option = guest.page.locator('[role="listbox"] [role="option"]').filter({ hasText: sport.name }).first();
    must((await option.count()) > 0, `пункта «${sport.name}» в выпадашке нет`);
    await option.click();
    await wait(guest.page, 1_800);
    const url = new URL(guest.page.url());
    mustEqual(`${url.pathname}${url.hash}`, `${CATALOG_PATH}#results`, 'адрес после выбора категории');
    mustEqual(await catalogInput(guest.page).first().inputValue(), 'утренняя', 'текст запроса после выбора категории');
    const activeChip = guest.page.locator('#discover button[aria-pressed="true"]', { hasText: sport.name });
    must((await activeChip.count()) > 0, `на /catalog чип «${sport.name}» не активен`);
    return `${chips.length} категорий, все из /api/sports (${dbNames.length} видов); «${sport.name}» → /catalog#results, чип активен, текст «утренняя» на месте`;
  }, guest.page);

  await step('step-13', 'на /catalog чип категории меняет выдачу, карту и слоты согласованно', async () => {
    await openCatalog(guest.page);
    const sport = sports.find((s) => s.id === 1) ?? sports[0];
    const before = { list: await clubCards(guest.page).count(), pins: await guest.page.locator('.map-marker-pin').count() };
    const chip = guest.page.locator('#discover button, [data-testid="search-suggest"] button').filter({ hasText: sport.name }).first();
    must((await chip.count()) > 0, `чипа «${sport.name}» нет`);
    await chip.click();
    await wait(guest.page, 1_500);
    const listNames = await clubCards(guest.page.locator('#results')).evaluateAll((els) => els.map((el) => el.querySelector('h3, a')?.textContent.trim() ?? el.getAttribute('aria-label')));
    const pins = await guest.page.locator('.map-marker-pin').count();
    must(listNames.length > 0, 'после отбора выдача пуста');
    mustEqual(pins, listNames.length, 'маркеров на карте против строк выдачи');
    // Слоты — только клубов из выдачи (38.81, шаг 4: те же фильтры, что у выдачи).
    const slotClubs = await guest.page.locator('#availability [data-testid="slot-card"]').evaluateAll((els) => els.map((el) => el.textContent ?? ''));
    const straySlots = slotClubs.filter((text) => !listNames.some((name) => text.includes(name)));
    must(straySlots.length === 0, `в слотах занятия клубов вне выдачи: ${straySlots.length} из ${slotClubs.length}`);
    return `«${sport.name}»: выдача ${before.list} → ${listNames.length}, маркеры ${before.pins} → ${pins}, слотов ${slotClubs.length} — все из выдачи`;
  }, guest.page);

  await step('step-14', 'смена города переезжает выдачу и карту; после перезагрузки — город по умолчанию (24d)', async () => {
    await openCatalog(guest.page);
    const select = guest.page.locator('select[aria-label="Выбор города"]');
    must((await select.count()) > 0, 'селектора города нет');
    await wait(guest.page, 800);
    const current = await select.inputValue();
    const options = await select.locator('option').evaluateAll((els) => els.map((el) => el.value));
    const other = options.find((o) => o !== current);
    must(other, `второго города нет: ${options.join(', ')}`);
    const listBefore = await clubCards(guest.page).count();
    await select.selectOption(other);
    await wait(guest.page, 1_500);
    const badge = await guest.page.locator('#discover').innerText();
    must(badge.includes(other), `бейдж города не сменился на «${other}»`);
    const listAfter = await clubCards(guest.page).count();
    await guest.page.reload({ waitUntil: 'domcontentloaded' });
    await wait(guest.page, 2_000);
    const persisted = await guest.page.locator('select[aria-label="Выбор города"]').inputValue();
    // Принятое ограничение (реестр 24d, 62a, Д-15): стор без persist, фильтры не в адресе —
    // перезагрузка возвращает город по умолчанию. Проверяется именно сброс.
    mustEqual(persisted, current, 'город после перезагрузки — по умолчанию (стор без persist)');
    return `${current} → ${other}: карточек ${listBefore} → ${listAfter}, после перезагрузки снова «${persisted}» (сброс — 24d)`;
  }, guest.page);

  await step('step-15', 'переключение «Клубы / Тренеры» на /catalog меняет выдачу, карту и слоты', async () => {
    await openCatalog(guest.page);
    const pinsClubs = await guest.page.locator('.map-marker-pin').count();
    await switchToTrainers(guest.page);
    await wait(guest.page, 1_000);
    const trainerList = await guest.page.locator('#trainer-list').count();
    const clubList = await guest.page.locator('#club-list').count();
    const trainerSlots = await guest.page.locator('#trainer-availability').count();
    const pinsTrainers = await guest.page.locator('.map-marker-pin').count();
    must(trainerList === 1 && clubList === 0, `выдача: тренерская ${trainerList}, клубная ${clubList}`);
    must(trainerSlots === 1, 'секции окон тренеров нет');
    must(pinsTrainers !== pinsClubs, `маркеры не сменились: ${pinsClubs} → ${pinsTrainers}`);
    return `выдача и слоты тренерские, маркеры ${pinsClubs} → ${pinsTrainers}`;
  }, guest.page);

  await step('step-16', 'запрос без совпадений: пустое состояние с текстом и сбросом', async () => {
    await openCatalog(guest.page);
    const input = (await catalogInput(guest.page).count()) > 0 ? catalogInput(guest.page).first() : guest.page.locator('input[aria-label^="Поиск"]').first();
    await input.fill('zzz-нет-такого-клуба-zzz');
    await guest.page.keyboard.press('Enter');
    await wait(guest.page, 1_200);
    const empty = guest.page.locator('[data-card-slider-empty], [data-testid$="-empty"]').first();
    must((await empty.count()) > 0, 'пустого состояния нет');
    const text = (await empty.innerText()).trim();
    must(text.length > 10, `текст пустого состояния слишком короток: «${text}»`);
    const reset = guest.page.locator('button, a', { hasText: /сброс|очист/i });
    must((await reset.count()) > 0, `способа сбросить запрос нет; текст: «${text.slice(0, 80)}»`);
    // 38.82: счёт «N в выдаче» живой — при пустой выдаче ноль, а не длина каталога.
    const discover = await guest.page.locator('#discover').innerText();
    // Бейдж — «0 клубов в выдаче» / «0 тренеров в выдаче»: число, слово, «в выдаче».
    // `innerText` отдаёт «0 КЛУБОВ В ВЫДАЧЕ» (uppercase у бейджа) — сравнение без учёта регистра.
    const count = discover.match(/(\d+)\s+\S+\s+в выдаче/i);
    must(count && Number(count[1]) === 0, `счёт «в выдаче» при пустой выдаче: «${count?.[0] ?? 'не найден'}»`);
    return `«${text.slice(0, 80)}», кнопка сброса есть, «0 в выдаче»`;
  }, guest.page);

  await step('step-17', 'витрина главной ограничена limit (6 клубов, 4 тренера); полный каталог на /catalog — Д-15', async () => {
    await openHome(guest.page);
    const rows = [];
    for (const [id, path, limit, table, cards] of [
      ['clubs', '/api/clubs?sort=rating&limit=6', 6, 'clubs', clubCards],
      ['trainers', '/api/trainers?sort=rating&limit=4', 4, 'trainers', trainerCards],
    ]) {
      const limited = await api(guest.page, 'GET', path);
      must(limited.status === 200, `${path} ответил ${limited.status}`);
      const got = limited.body?.data?.length ?? 0;
      const total = num(`SELECT count(*) FROM ${table} WHERE status = 'published';`);
      must(got <= limit, `limit=${limit} не ограничил выдачу: пришло ${got} строк при ${total} опубликованных`);
      const onScreen = await cards(guest.page.locator(`#${id}`)).count();
      mustEqual(onScreen, got, `карточек в «${id}» против строк ответа`);
      rows.push(`#${id}: limit=${limit} → ${got} из ${total}, на экране ${onScreen}`);
    }
    return rows.join('; ') + '; полный каталог на /catalog — действующее ограничение Д-15 (реестр 62a)';
  }, guest.page);

  // ───────────────────────── Scenario 3: карта ─────────────────────────
  console.log('\nScenario 3: карта');

  await step('step-18', 'карта на /catalog загрузилась, маркеры расставлены', async () => {
    await openCatalog(guest.page);
    await guest.page.waitForSelector('[data-testid="yandex-map-container"]', { timeout: 20_000 });
    await wait(guest.page, 3_000);
    const pins = await guest.page.locator('.map-marker-pin').count();
    must(pins > 0, 'маркеров нет');
    return `контейнер карты есть, маркеров ${pins}`;
  }, guest.page);

  await step('step-19', 'цвет маркера соответствует виду спорта и взят из базы', async () => {
    const withColor = sports.filter((s) => typeof s.color === 'string' && s.color !== '');
    must(withColor.length === sports.length && sports.length > 0, `цвета у видов спорта в ответе /api/sports нет (${withColor.length} из ${sports.length})`);
    const colors = await guest.page.locator('.map-marker-pin').evaluateAll((els) => els.map((el) => el.querySelector('.map-marker-drop')?.getAttribute('fill') ?? getComputedStyle(el).backgroundColor));
    const palette = new Set(withColor.map((s) => s.color.toLowerCase()));
    const alien = colors.filter((c) => !palette.has(c.toLowerCase()));
    must(alien.length === 0, `маркеров с цветом не из базы: ${alien.length} (${[...new Set(alien)].join(', ')})`);
    return `${colors.length} маркеров, все цвета из ${palette.size} цветов базы`;
  }, guest.page);

  await step('step-20', 'клик по маркеру: активное состояние, карточка снизу', async () => {
    // Капли соседних клубов перекрываются (кластеризации нет): берётся верхняя — последняя в DOM.
    const pin = guest.page.locator('.map-marker-pin').last();
    await pin.click();
    await wait(guest.page, 800);
    const active = await pin.evaluate((el) => el.getAttribute('data-active') === 'true' || /active|is-active|selected/.test(el.className));
    const card = guest.page.locator('aside[aria-label="Выбрано на карте"], [data-testid="map-active-card"], .map-marker-popup');
    must(active, 'у нажатого маркера нет активного состояния (data-active / класс)');
    must((await card.count()) > 0, 'карточки под картой после клика нет');
    return `маркер активен, карточка: «${(await card.first().innerText()).slice(0, 50)}»`;
  }, guest.page);

  await step('step-21', 'клик по карточке маркера открывает страницу клуба', async () => {
    const card = guest.page.locator('aside[aria-label="Выбрано на карте"], [data-testid="map-active-card"], .map-marker-popup').first();
    if ((await card.count()) === 0) {
      await guest.page.locator('.map-marker-pin').last().click();
      await wait(guest.page, 800);
    }
    must((await card.count()) > 0, 'карточки маркера нет — нажимать нечего');
    // Путь к странице — ссылка «Подробнее» (38.80: карточка целиком не ссылка), она и нажимается.
    const detail = card.locator('a[href^="/clubs/"], a[href^="/trainers/"]').first();
    must((await detail.count()) > 0, 'в карточке маркера нет ссылки на страницу');
    await detail.click();
    await wait(guest.page, 2_000);
    const url = guest.page.url();
    must(/\/(clubs|trainers)\/[^/]+$/.test(url), `карточка не открыла страницу: ${url}`);
    return `→ ${new URL(url).pathname}`;
  }, guest.page);

  await step('step-22', 'при отказе карты страница остаётся рабочей', async () => {
    const context = await guest.context.browser().newContext({ viewport: { width: 1440, height: 900 } });
    try {
      await context.route('**/api-maps.yandex.ru/**', (route) => route.abort());
      const page = await context.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('header', { timeout: 20_000 });
      await wait(page, 4_000);
      const cards = await clubCards(page).count();
      const errorText = await page.getByText('Ошибка загрузки карты').count();
      const skeleton = await page.locator('[data-testid="map-skeleton"]').count();
      const mainText = (await page.locator('main').first().innerText()).length;
      must(cards > 0 && mainText > 500, `страница пуста: карточек ${cards}, текста ${mainText}`);
      return `карта: ошибка ${errorText}, скелет ${skeleton}; страница жива — карточек ${cards}, текста ${mainText} символов`;
    } finally {
      await context.close();
    }
  }, guest.page);

  // ───────────────────────── Scenario 4: слоты и запись ─────────────────────────
  console.log('\nScenario 4: слоты и запись');

  await step('step-23', 'гость нажимает слот на /catalog — подсказка входа, не отказ', async () => {
    await openCatalog(guest.page);
    const cta = guest.page.locator('[data-testid="slot-card"] button').first();
    must((await cta.count()) > 0, 'слотов на главной нет (сегодняшних занятий с непрошедшим концом)');
    await cta.click();
    await wait(guest.page, 800);
    const toast = guest.page.getByText(BOOKING_REQUIRES_LOGIN);
    must((await toast.count()) > 0, 'подсказки входа не появилось');
    must(new URL(guest.page.url()).pathname === CATALOG_PATH, `гостя увели: ${guest.page.url()}`);
    return `тост «${BOOKING_REQUIRES_LOGIN}», адрес не изменился`;
  }, guest.page);

  await step('step-24', 'вошедший нажимает слот на /catalog — форма записи', async () => {
    await openCatalog(person.page);
    const card = person.page.locator('[data-testid="slot-card"]', { hasText: 'Открытое занятие А' }).first();
    must((await card.count()) > 0, 'открытого слота прогона на главной нет');
    await card.locator('button').click();
    await person.page.waitForURL(/\/booking\/\d+/, { timeout: 10_000 });
    await person.page.getByRole('heading', { name: 'Запись на занятие' }).waitFor({ timeout: 10_000 });
    return `→ ${new URL(person.page.url()).pathname}, заголовок «Запись на занятие»`;
  }, person.page);

  await step('step-25', 'путь к записи не изменился — адрес прежний', async () => {
    const pathname = new URL(person.page.url()).pathname;
    mustEqual(pathname, `/booking/${made.openSlot}`, 'адрес формы записи');
    return pathname;
  }, person.page);

  await step('step-26', 'слот без мест спрятан (38.81); отмена записи → после перезагрузки слот вернулся', async () => {
    await openCatalog(guest.page);
    const fullCard = () => guest.page.locator('[data-testid="slot-card"]', { hasText: 'Полное занятие А' });
    const openCard = guest.page.locator('[data-testid="slot-card"]', { hasText: 'Открытое занятие А' });
    must((await openCard.count()) > 0, 'открытый слот клуба А не показан — слоты каталога вообще не рисуются');
    must((await fullCard().count()) === 0, 'полный слот показан — решение 38.81 (шаг 3 отбора: без мест — прячется) не выполняется');
    // Освободить место: человек отменяет свою запись на полный слот.
    must(made.fullBooking !== null, 'номер записи на полный слот не сохранён при подготовке');
    const cancel = await api(person.page, 'DELETE', `/api/bookings/${made.fullBooking}`);
    must(cancel.status === 200 || cancel.status === 204, `отмена записи ${made.fullBooking}: ${cancel.status} ${cancel.text}`);
    await openCatalog(guest.page);
    must((await fullCard().count()) > 0, 'после отмены записи и перезагрузки слот не вернулся');
    const cta = fullCard().locator('button:not([disabled]), a', { hasText: /запис/i });
    must((await cta.count()) > 0, 'вернувшийся слот не предлагает запись');
    return `полный слот спрятан; после отмены записи ${made.fullBooking} и перезагрузки — вернулся с «К записи»`;
  }, guest.page);

  // ───────────────────────── Scenario 5: каркас у вошедшего ─────────────────────────
  console.log('\nScenario 5: каркас у вошедшего');

  const bell = (page) => page.locator('header button[aria-label^="Уведомления"]');

  await step('step-27', 'колокольчик показывает число непрочитанных, подпись называет число', async () => {
    await openHome(owner.page);
    await bell(owner.page).waitFor({ timeout: 10_000 });
    await wait(owner.page, 2_000);
    const label = await bell(owner.page).getAttribute('aria-label');
    const badge = owner.page.locator('[data-testid="notification-bell-badge"]');
    must((await badge.count()) > 0, `значка нет, подпись «${label}»`);
    const shown = (await badge.innerText()).trim();
    must(/непрочитанных: \d+/.test(label ?? ''), `подпись не называет число: «${label}»`);
    must(label.endsWith(shown), `подпись «${label}» и значок «${shown}» расходятся`);
    return `значок ${shown}, подпись «${label}»`;
  }, owner.page);

  await step('step-28', 'выпадашка: пять последних, запрос ушёл только при открытии', async () => {
    const requests = [];
    const onRequest = (request) => {
      const url = request.url();
      if (url.includes('/api/notifications?') && !url.includes('unread')) requests.push(url);
    };
    owner.page.on('request', onRequest);
    await openHome(owner.page);
    await wait(owner.page, 2_000);
    const beforeOpen = requests.length;
    await bell(owner.page).click();
    const dropdown = owner.page.locator('[data-testid="notification-bell-dropdown"]');
    await dropdown.waitFor({ timeout: 10_000 });
    await wait(owner.page, 1_500);
    owner.page.off('request', onRequest);
    const items = await dropdown.locator('[data-testid^="notification-bell-item-"]').count();
    mustEqual(beforeOpen, 0, 'запросов ленты до открытия');
    must(requests.length >= 1 && requests[0].includes('limit=5'), `запрос при открытии: ${requests.join(' | ') || 'нет'}`);
    must(items >= 1 && items <= 5, `строк в выпадашке ${items}`);
    return `до открытия запросов 0, при открытии 1 (${new URL(requests[0]).search}), строк ${items}`;
  }, owner.page);

  await step('step-29', 'отметка прочитанным: число убавилось; при отказе сервера откатывается', async () => {
    const dropdown = owner.page.locator('[data-testid="notification-bell-dropdown"]');
    const badgeText = async () => {
      const badge = owner.page.locator('[data-testid="notification-bell-badge"]');
      return (await badge.count()) === 0 ? 0 : Number((await badge.innerText()).trim());
    };
    /**
     * Лог значений значка. Клик по строке ведёт на страницу ленты, и там счётчик
     * пересчитывается сервером, — поэтому откат виден только В ПОСЛЕДОВАТЕЛЬНОСТИ
     * значений между отказом и пересчётом. Наблюдатель живёт в `window`:
     * переход клиентский, документ тот же.
     */
    const armLog = () =>
      owner.page.evaluate(() => {
        window.__badgeLog = [];
        const read = () => {
          const badge = document.querySelector('[data-testid="notification-bell-badge"]');
          const value = badge ? Number(badge.textContent.trim()) : 0;
          const log = window.__badgeLog;
          if (log[log.length - 1] !== value) log.push(value);
        };
        read();
        new MutationObserver(read).observe(document.querySelector('header'), { subtree: true, childList: true, characterData: true });
      });
    const readLog = () => owner.page.evaluate(() => window.__badgeLog ?? []);
    const unreadItems = () => dropdown.locator('[data-testid^="notification-bell-item-"]').filter({ has: owner.page.locator('[aria-label="Непрочитанное"]') });

    await openHome(owner.page);
    await bell(owner.page).click();
    await dropdown.waitFor({ timeout: 10_000 });
    await wait(owner.page, 1_500);
    must((await unreadItems().count()) >= 2, `непрочитанных строк в выпадашке ${await unreadItems().count()}, нужно две`);
    const before = await badgeText();
    const okId = (await unreadItems().first().getAttribute('data-testid')).replace('notification-bell-item-', '');
    await armLog();
    await unreadItems().first().click();
    await wait(owner.page, 2_500);
    const okLog = await readLog();
    must(okLog.includes(before - 1), `значок не убавился: ${okLog.join(' → ')}`);
    const readAt = readDb(`SELECT read_at FROM notifications WHERE id = ${Number(okId)};`).trim();
    must(readAt !== '', `сервер не записал прочтение строки ${okId}`);

    // Отказ сервера: запрос к `/read` обрывается на сети (недоступность, а не
    // подменённый ответ). Стирать строку в базе нельзя — тогда падает и НАСТОЯЩИЙ
    // счёт, и «откат» неотличим от честного пересчёта. Проверяется конечное
    // состояние: значок вернулся к прежнему числу, строка в базе не прочитана.
    await openHome(owner.page);
    await bell(owner.page).click();
    await dropdown.waitFor({ timeout: 10_000 });
    await wait(owner.page, 1_500);
    must((await unreadItems().count()) >= 1, 'непрочитанных строк для проверки отказа не осталось');
    const beforeFail = await badgeText();
    const victimId = (await unreadItems().first().getAttribute('data-testid')).replace('notification-bell-item-', '');
    const outage = (route) => route.abort('connectionrefused');
    await owner.context.route('**/api/notifications/*/read', outage);
    await armLog();
    await unreadItems().first().click();
    await wait(owner.page, 2_500);
    await owner.context.unroute('**/api/notifications/*/read', outage);
    const failLog = await readLog();
    await openHome(owner.page);
    await wait(owner.page, 1_500);
    const afterFail = await badgeText();
    const victimReadAt = readDb(`SELECT coalesce(read_at::text, '') FROM notifications WHERE id = ${Number(victimId)};`).trim();
    mustEqual(afterFail, beforeFail, 'значок после отказа сервера');
    mustEqual(victimReadAt, '', `read_at строки ${victimId} после отказа`);
    return `отметка ${okId}: значок ${okLog.join(' → ')}, read_at записан; отказ (запрос к /read оборван): значок ${failLog.join(' → ')}, после перезагрузки ${afterFail} = ${beforeFail}, строка ${victimId} не прочитана${failLog.includes(beforeFail - 1) ? '' : ' — ⚠️ оптимистичного убавления на главной не было: markRead стора молчит, когда строки нет в списке'}`;
  }, owner.page);

  await step('step-30', 'аватар ведёт в кабинет текущего лица, подпись называет цель', async () => {
    // Открыть кабинет клуба, потом уйти на главную КЛИЕНТСКИМ переходом: стор помнит лицо.
    await owner.page.goto(`${BASE}/profile/club/${made.clubA}/dashboard`, { waitUntil: 'domcontentloaded' });
    await wait(owner.page, 2_000);
    await owner.page.locator('header a[href="/"]').first().click();
    await wait(owner.page, 1_500);
    const avatar = owner.page.locator('header a[aria-label^="Перейти в кабинет"]');
    must((await avatar.count()) > 0, 'аватара-ссылки в шапке нет');
    const href = await avatar.getAttribute('href');
    const label = await avatar.getAttribute('aria-label');
    must(href?.startsWith(`/profile/club/${made.clubA}`), `аватар ведёт не в кабинет открытого лица: ${href}`);
    must(label?.includes(nameA), `подпись не называет лицо: «${label}»`);
    return `href ${href}, подпись «${label}»`;
  }, owner.page);

  await step('step-31', 'человек без лиц: аватар без ссылки, а не ссылка в никуда', async () => {
    await openHome(person.page);
    const link = person.page.locator('header a[aria-label^="Перейти в кабинет"]');
    const img = person.page.locator('header [role="img"][aria-label^="Аватар"]');
    const linkHref = (await link.count()) > 0 ? await link.getAttribute('href') : null;
    // У человека без лиц кабинет ЛИЧНЫЙ — ссылка на него законна; в никуда — нет.
    if (linkHref) {
      const probe = await api(person.page, 'GET', linkHref);
      must(probe.status === 200, `аватар ведёт на ${linkHref}, ответ ${probe.status}`);
      return `аватар-ссылка → ${linkHref} (личный кабинет, 200)`;
    }
    must((await img.count()) > 0, 'ни ссылки, ни role="img" у аватара');
    return `аватар без ссылки: role="img", подпись «${await img.getAttribute('aria-label')}»`;
  }, person.page);

  await step('step-32', 'выход уводит на главную в состояние гостя', async () => {
    const ctx = await guest.context.browser().newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const page = await ctx.newPage();
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      await loginAs(page, E2E_USERS.client);
      await page.goto(`${BASE}/profile/me/dashboard`, { waitUntil: 'domcontentloaded' });
      await wait(page, 2_000);
      await page.locator('header button[aria-label="Выйти"]').click();
      await page.waitForURL(`${BASE}/`, { timeout: 10_000 });
      await wait(page, 1_500);
      const login = await page.locator('header button', { hasText: 'Войти' }).count();
      const me = await api(page, 'GET', '/api/auth/me');
      must(login === 1, 'кнопки «Войти» после выхода нет');
      must(me.status === 401 || me.status === 403, `сессия жива: /api/auth/me ${me.status}`);
      return `→ /, кнопка «Войти» на месте, /api/auth/me ${me.status}`;
    } finally {
      await ctx.close();
    }
  }, person.page);

  // ───────────────────────── Scenario 6: каркас у администратора ─────────────────────────
  console.log('\nScenario 6: каркас у администратора');

  await step('step-33', 'администратор: аватар ведёт в служебную панель', async () => {
    await openHome(admin.page);
    const avatar = admin.page.locator('header a[aria-label="Панель управления"]');
    must((await avatar.count()) > 0, 'ссылки «Панель управления» в шапке нет');
    const href = await avatar.getAttribute('href');
    must(href?.startsWith('/service-portal'), `аватар ведёт ${href}`);
    return `href ${href}`;
  }, admin.page);

  await step('step-34', 'колокольчик администратора ведёт в очередь надзора', async () => {
    await bell(admin.page).click();
    const dropdown = admin.page.locator('[data-testid="notification-bell-dropdown"]');
    await dropdown.waitFor({ timeout: 10_000 });
    const all = dropdown.locator('a[href*="/service-portal/notifications"]');
    must((await all.count()) > 0, 'ссылки в очередь надзора в выпадашке нет');
    await all.first().click();
    await admin.page.waitForURL(/\/service-portal\/notifications/, { timeout: 10_000 });
    await admin.page.getByRole('heading', { name: 'Очередь надзора' }).waitFor({ timeout: 15_000 });
    return `→ ${new URL(admin.page.url()).pathname}, заголовок «Очередь надзора»`;
  }, admin.page);

  await step('step-35', 'работа от чужого лица: плашка над шапкой, липкая', async () => {
    const start = await api(admin.page, 'POST', `/api/auth/impersonate/${ownerId}`, {});
    mustEqual(start.status, 200, `начало подмены: ${start.text}`);
    await openHome(admin.page);
    const banner = admin.page.getByText('Вы работаете от имени');
    must((await banner.count()) > 0, 'плашки нет');
    const geometry = await banner.first().evaluate((el) => {
      const header = document.querySelector('header').getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      let node = el;
      let sticky = false;
      while (node) {
        if (getComputedStyle(node).position === 'sticky') sticky = true;
        node = node.parentElement;
      }
      return { aboveHeader: rect.bottom <= header.top + 1, sticky };
    });
    must(geometry.aboveHeader, 'плашка не над шапкой');
    await admin.page.evaluate(() => window.scrollTo(0, 2_000));
    await wait(admin.page, 500);
    const stillVisible = await banner.first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= window.innerHeight;
    });
    must(geometry.sticky && stillVisible, `липкость: sticky ${geometry.sticky}, видна после прокрутки ${stillVisible}`);
    return `плашка над шапкой, sticky, видна после прокрутки на 2000px`;
  }, admin.page);

  await step('step-36', '«Выйти» под подменой возвращает в панель, а не на главную', async () => {
    await admin.page.evaluate(() => window.scrollTo(0, 0));
    await admin.page.locator('header button[aria-label="Выйти"]').click();
    await admin.page.waitForURL(/\/service-portal\//, { timeout: 10_000 });
    const me = await whoAmI(admin.page);
    mustEqual(me?.id, adminId, 'после выхода из подмены личность');
    return `→ ${new URL(admin.page.url()).pathname}, личность снова администратор #${adminId}`;
  }, admin.page);

  await step('step-37', 'служебная панель: покраска доехала, пятен нет', async () => {
    await admin.page.goto(`${BASE}/service-portal/dashboard`, { waitUntil: 'domcontentloaded' });
    await wait(admin.page, 2_500);
    const spots = await legacySpots(admin.page);
    must(spots.spotCount === 0, `пятен старой палитры ${spots.spotCount}: ${spots.spots.join('; ')}`);
    return `пятен старой палитры 0 (проверены ${LEGACY_COLORS.length} известных цвета), различных цветов на экране ${spots.distinct}`;
  }, admin.page);

  // ───────────────────────── Scenario 7: адаптив ─────────────────────────
  console.log('\nScenario 7: адаптив');

  /**
   * Сколько карточек ленты видно целиком: карточка внутри горизонтальных границ
   * своего рельса (`overflow-hidden`). Эталон — сетки 3 (клубы) и 4 (тренеры);
   * у нас `CardSlider` (38.79), число видимых то же.
   */
  async function visibleInRail(page, sectionId) {
    return page.evaluate((id) => {
      const section = document.getElementById(id);
      if (!section) return null;
      const rail = section.querySelector('[data-card-slider-rail]');
      const box = (rail?.parentElement ?? section).getBoundingClientRect();
      const cards = Array.from(section.querySelectorAll('[aria-label^="Карточка"]'));
      return cards.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && r.left >= box.left - 2 && r.right <= box.right + 2;
      }).length;
    }, sectionId);
  }

  /** Раскладка главной на текущем окне — по карточкам, а не по классам. */
  async function homeLayout(page) {
    const hero = page.locator('main section').first();
    const aside = hero.locator('[data-hero-aside], aside');
    const asideVisible = (await aside.count()) > 0 ? await aside.first().isVisible() : null;
    const clubCols = await visibleInRail(page, 'clubs');
    const trainerCols = await visibleInRail(page, 'trainers');
    const navVisible = await page.locator('header nav').first().isVisible().catch(() => false);
    const menuButton = await page.locator('header button[aria-label*="еню"]').isVisible().catch(() => false);
    const mobileNav = await page.locator('nav[aria-label="Мобильная навигация"]').isVisible().catch(() => false);
    const overflow = await page.evaluate(() => ({
      hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    return { asideVisible, clubCols, trainerCols, navVisible, menuButton, mobileNav, ...overflow };
  }
  const layouts = {};
  const fmtLayout = (l) => `правая колонка героя ${l.asideVisible === null ? 'нет <aside>' : l.asideVisible ? 'видна' : 'скрыта'}, видимых клубов ${l.clubCols}, тренеров ${l.trainerCols}, nav шапки ${l.navVisible ? 'видна' : 'скрыта'}, кнопка меню ${l.menuButton ? 'видна' : 'нет'}, мобильная навигация ${l.mobileNav ? 'видна' : 'скрыта'}, scrollWidth ${l.scrollWidth}/${l.clientWidth}`;

  for (const width of BREAKPOINTS) {
    await openHome(guest.page, { width });
    layouts[width] = await homeLayout(guest.page);
  }

  await step('step-38', '1920: раскладка совпадает с эталоном — колонка героя, 3 клуба и 4 тренера в лентах, навигация', async () => {
    const l = layouts[1920];
    must(l.asideVisible === true && l.clubCols === 3 && l.trainerCols === 4 && l.navVisible, fmtLayout(l));
    return fmtLayout(l);
  }, guest.page);

  await step('step-39', '1440: то же', async () => {
    const l = layouts[1440];
    must(l.asideVisible === true && l.clubCols === 3 && l.trainerCols === 4 && l.navVisible, fmtLayout(l));
    return fmtLayout(l);
  }, guest.page);

  await step('step-40', '1280: правая колонка героя ещё на месте', async () => {
    const l = layouts[1280];
    must(l.asideVisible === true, fmtLayout(l));
    return fmtLayout(l);
  }, guest.page);

  await step('step-41', '1100: правая колонка героя скрылась', async () => {
    const l = layouts[1100];
    must(l.asideVisible === false, fmtLayout(l));
    return fmtLayout(l);
  }, guest.page);

  await step('step-41a', '959: навигация в меню-кнопке, Escape, возврат фокуса; 960: навигация видна', async () => {
    const wide = layouts[960];
    must(wide.navVisible && !wide.menuButton, `на 960 (широкое состояние): ${fmtLayout(wide)}`);
    await openHome(guest.page, { width: 959 });
    const l = layouts[959];
    must(!l.navVisible && l.menuButton, `на 959: ${fmtLayout(l)}`);
    const button = guest.page.locator('header button[aria-label*="еню"]');
    await button.click();
    await wait(guest.page, 500);
    const menu = guest.page.locator('[role="dialog"], header nav[aria-label="Меню"]');
    must(await menu.first().isVisible(), 'меню не открылось');
    // Оверлей: точка внизу экрана, вне меню, накрыта чем-то поверх содержимого страницы —
    // клик по ней не должен доставаться каталогу.
    const overlay = await guest.page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 40);
      return el ? { tag: el.tagName.toLowerCase(), inMain: Boolean(el.closest('main')), inHeader: Boolean(el.closest('header')) } : null;
    });
    must(overlay && !overlay.inMain, `под открытым меню нет оверлея: точка внизу экрана попадает в ${overlay ? `<${overlay.tag}>${overlay.inMain ? ' внутри main' : ''}` : 'пустоту'}`);
    await guest.page.keyboard.press('Escape');
    await wait(guest.page, 500);
    must(!(await menu.first().isVisible()), 'меню не закрылось по Escape');
    const focused = await guest.page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.tagName);
    must(/еню/.test(focused ?? ''), `фокус после Escape на «${focused}», а не на кнопке меню`);
    return `959: ${fmtLayout(l)}; меню открылось, оверлей есть (<${overlay.tag}>), Escape закрыл, фокус на кнопке; 960: навигация видна, кнопки нет`;
  }, guest.page);

  await step('step-42', '767: сетки перестроились, док виден; 768: док скрыт; муляжа нет', async () => {
    const narrow = layouts[767];
    const wide = layouts[768];
    const phone = await guest.page.locator('.mob-phone, [data-device-frame]').count();
    must(narrow.clubCols <= 2, `на 767 клубы в ряд ${narrow.clubCols}`);
    must(narrow.mobileNav, `на 767 нижняя навигация не видна: ${fmtLayout(narrow)}`);
    must(!wide.mobileNav, `на 768 (широкое состояние) док должен быть скрыт: ${fmtLayout(wide)}`);
    must(phone === 0, 'на странице муляж телефона');
    return `767: ${fmtLayout(narrow)}; 768: док скрыт`;
  }, guest.page);

  /** Что уезжает за правый край окна (кроме лент с собственной прокруткой). */
  const overflowOffenders = (page) =>
    page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      return Array.from(document.querySelectorAll('body *'))
        .filter((el) => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed') return false;
          const r = el.getBoundingClientRect();
          if (!(r.width > 0 && r.right > vw + 1)) return false;
          if (el.closest('[data-card-slider-rail], .scrollbar-hidden, [data-testid$="-scroll"]')) return false;
          // Внутри предка, который режет по горизонтали и сам в окне (лента героя, рельс), — не уезжает.
          for (let n = el.parentElement; n; n = n.parentElement) {
            const o = getComputedStyle(n);
            if (/hidden|clip|auto|scroll/.test(o.overflowX) && n.getBoundingClientRect().right <= vw + 1) return false;
          }
          return true;
        })
        .slice(0, 6)
        .map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} right=${Math.round(el.getBoundingClientRect().right)}`);
    });

  await step('step-43', '430: в лентах по одной карточке, ничего не уезжает за край — на главной и на /catalog', async () => {
    await openHome(guest.page, { width: 430 });
    const l = layouts[430];
    const homeOffenders = await overflowOffenders(guest.page);
    must(l.clubCols === 1 && l.trainerCols === 1, `видимых клубов ${l.clubCols}, тренеров ${l.trainerCols} — ожидалось по одному`);
    must(homeOffenders.length === 0, `главная: за правый край уезжают: ${homeOffenders.join('; ')}`);
    await openCatalog(guest.page, { width: 430 });
    const catalogOffenders = await overflowOffenders(guest.page);
    must(catalogOffenders.length === 0, `/catalog: за правый край уезжают: ${catalogOffenders.join('; ')}`);
    return `${fmtLayout(l)}; за край не уезжает ничего ни на главной, ни на /catalog`;
  }, guest.page);

  await step('step-44', 'ни на одном брейкпоинте нет горизонтальной прокрутки — на обеих страницах', async () => {
    const bad = Object.entries(layouts).filter(([, l]) => l.hscroll).map(([w, l]) => `главная ${w}: ${l.scrollWidth} > ${l.clientWidth}`);
    const catalogRows = [];
    for (const width of BREAKPOINTS) {
      await openCatalog(guest.page, { width });
      const o = await guest.page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth }));
      if (o.scrollWidth > o.clientWidth) bad.push(`/catalog ${width}: ${o.scrollWidth} > ${o.clientWidth}`);
      catalogRows.push(`${width}: ${o.scrollWidth}/${o.clientWidth}`);
    }
    must(bad.length === 0, `горизонтальная прокрутка: ${bad.join('; ')}`);
    return `главная — ${BREAKPOINTS.map((w) => `${w}: ${layouts[w].scrollWidth}/${layouts[w].clientWidth}`).join(', ')}; /catalog — ${catalogRows.join(', ')}`;
  }, guest.page);

  // ───────────────────────── Scenario 8: шестнадцать тупиков ─────────────────────────
  console.log('\nScenario 8: тупики');

  /** Ссылка по подписи привела к цели-якорю, и цель — в окне. */
  async function anchorLeads(page, locator, what, { expectPath } = {}) {
    must((await locator.count()) > 0, `${what}: ссылки нет`);
    const r = await followLink(page, locator.first());
    if (expectPath !== undefined) mustEqual(r.after.path, expectPath, `${what}: страница после перехода`);
    must(r.after.targetExists, `${what}: цели ${r.href} на странице нет`);
    // На другую страницу: якорь на новой странице обязан оказаться в окне (прокрутка с нуля).
    must(r.after.targetInView || (r.after.path === r.before.path && r.after.y !== r.before.y), `${what}: экран не уехал к ${r.href}`);
    return r;
  }

  await step('step-45', '«Все слоты» у счётчика героя — на /catalog#availability, экран у слотов', async () => {
    await openHome(guest.page);
    must((await guest.page.locator('header nav a', { hasText: /^Слоты$/ }).count()) === 0, 'в шапке остался пункт «Слоты» — вход снят вместе с переездом (38.79c)');
    const r = await anchorLeads(guest.page, guest.page.locator('main section').first().locator('a', { hasText: /все слоты/i }), '«Все слоты» героя', { expectPath: CATALOG_PATH });
    return `${r.href} → ${r.after.path}${r.after.hash}, цель в окне`;
  }, guest.page);

  await step('step-46', '«Слоты» в мобильном доке — на /catalog#availability, пункт подсветился', async () => {
    await openHome(guest.page, { width: 430 });
    const link = guest.page.locator('nav[aria-label="Мобильная навигация"] a', { hasText: 'Слоты' });
    const r = await anchorLeads(guest.page, link, '«Слоты» в мобильной навигации', { expectPath: CATALOG_PATH });
    const current = await guest.page.locator('nav[aria-label="Мобильная навигация"] a', { hasText: 'Слоты' }).first().getAttribute('aria-current');
    must(current !== null, 'пункт не подсветился (aria-current нет)');
    return `${r.href} → ${r.after.path}${r.after.hash}, aria-current="${current}"`;
  }, guest.page);

  await step('step-47', '«Смотреть слоты и окна» — снята (реестр № 39): кнопки с такой подписью нет', async () => {
    await openHome(guest.page);
    const gone = await guest.page.locator('a, button', { hasText: /смотреть слоты/i }).count();
    must(gone === 0, 'кнопка «Смотреть слоты и окна» на главной есть — по реестру № 39 её роль у «Все слоты»');
    return 'снята; вход к слотам — «Все слоты» (step-45)';
  }, guest.page);

  await step('step-48', '«Клубы» в шапке — к выдаче /catalog#results, а не к карте', async () => {
    await openHome(guest.page);
    const r = await anchorLeads(guest.page, guest.page.locator('header nav a', { hasText: /^Клубы$/ }), '«Клубы» в шапке', { expectPath: CATALOG_PATH });
    const hash = r.href.slice(r.href.indexOf('#') + 1);
    const target = await guest.page.evaluate((id) => {
      const el = document.getElementById(id);
      return { cards: el.querySelectorAll('[data-testid="club-card"], [aria-label^="Карточка клуба"], [data-testid="trainer-card"]').length, map: el.querySelectorAll('[data-testid="yandex-map-container"]').length };
    }, hash);
    must(target.cards > 0 && target.map === 0, `цель #${hash}: карточек ${target.cards}, карт ${target.map} — это ${target.map ? 'КАРТА' : 'не выдача'}`);
    return `#${hash}: карточек ${target.cards}, карты нет`;
  }, guest.page);

  await step('step-49', '«Каталог» в доке — на /catalog, подсветился; «Главная» с каталога — подсвечена на /', async () => {
    await openHome(guest.page, { width: 430 });
    const dock = 'nav[aria-label="Мобильная навигация"] a';
    const labels = await guest.page.locator(dock).evaluateAll((els) => els.map((el) => el.textContent.trim()));
    for (const expected of ['Главная', 'Каталог', 'Слоты', 'Профиль']) must(labels.includes(expected), `в доке нет пункта «${expected}»: ${labels.join(' · ')}`);
    const catalog = guest.page.locator(dock, { hasText: /^Каталог$/ });
    const r = await followLink(guest.page, catalog);
    mustEqual(r.after.path, CATALOG_PATH, '«Каталог» → страница');
    const current = await guest.page.locator(dock, { hasText: /^Каталог$/ }).first().getAttribute('aria-current');
    must(current !== null, 'пункт «Каталог» на /catalog не подсветился (aria-current нет)');
    const home = guest.page.locator(dock, { hasText: /^Главная$/ });
    const back = await followLink(guest.page, home);
    mustEqual(back.after.path, '/', '«Главная» → страница');
    const homeCurrent = await guest.page.locator(dock, { hasText: /^Главная$/ }).first().getAttribute('aria-current');
    must(homeCurrent !== null, 'пункт «Главная» на / не подсвечен');
    return `док: ${labels.join(' · ')}; «Каталог» → /catalog (aria-current="${current}"), «Главная» → / (aria-current="${homeCurrent}")`;
  }, guest.page);

  /** Лидер по рейтингу — первая карточка карусели витрины (38.79c: блока «Лидеры» нет). */
  async function firstCardIsLeader(page, sectionId, path, cards, prefix) {
    const res = await api(page, 'GET', path);
    must(res.status === 200 && res.body?.data?.length > 0, `${path} → ${res.status}`);
    const first = await cards(page.locator(`#${sectionId}`)).first().getAttribute('aria-label');
    mustEqual((first ?? '').replace(prefix, ''), res.body.data[0].name, `первая карточка «${sectionId}» против лидера ${path}`);
    return res.body.data[0].name;
  }

  await step('step-50', '«Лидеры каталога» сняты (38.79c): секции нет, первая карточка «Клубы» — лидер по рейтингу', async () => {
    await openHome(guest.page);
    must((await guest.page.locator('#leaders, section[aria-label="Лидеры каталога"]').count()) === 0, 'блок «Лидеры каталога» на главной остался');
    const name = await firstCardIsLeader(guest.page, 'clubs', '/api/clubs?sort=rating&limit=1', clubCards, 'Карточка клуба: ');
    return `секции нет; первый в «Клубы» — «${name}»`;
  }, guest.page);

  await step('step-51', '«Лидеры каталога» сняты (38.79c): первая карточка «Тренеры» — лидер по рейтингу', async () => {
    await openHome(guest.page);
    const name = await firstCardIsLeader(guest.page, 'trainers', '/api/trainers?sort=rating&limit=1', trainerCards, 'Карточка тренера: ');
    return `первый в «Тренеры» — «${name}»`;
  }, guest.page);

  await step('step-52', 'кнопки «Рядом» нет ни на главной, ни на /catalog (геолокации нет, реестр № 61)', async () => {
    const rows = [];
    for (const [name, open] of [['главная', openHome], ['каталог', openCatalog]]) {
      await open(guest.page);
      const count = await guest.page.locator('button[aria-label="Определить район"], button', { hasText: /^Рядом$/ }).count();
      must(count === 0, `${name}: кнопка «Рядом» есть (${count}) — геолокации в продукте нет`);
      rows.push(`${name}: нет`);
    }
    return rows.join('; ');
  }, guest.page);

  await step('step-53', 'блока «популярное под фильтр» нет; карусели главной — «Клубы» и «Тренеры»', async () => {
    await openHome(guest.page);
    const popular = await guest.page.locator('#popular, #highlights, [data-testid="popular-nearby-scroll"], [data-testid^="popular-"]').count();
    must(popular === 0, `блок «популярное» на главной остался (${popular}) — снят, вошёл в карусели витрины (38.79)`);
    const text = await guest.page.locator('main').first().innerText();
    must(!/Популярное рядом|Лучшие по рейтингу|без геолокации/i.test(text), 'на главной остались заголовки снятого блока');
    const headings = [];
    for (const id of ['clubs', 'trainers']) {
      const h = await guest.page.locator(`#${id} h2`).first().innerText().catch(() => '');
      must(h.trim().length > 0, `у карусели #${id} нет заголовка h2`);
      headings.push(`#${id}: «${h.trim()}»`);
    }
    return headings.join('; ');
  }, guest.page);

  await step('step-54', 'на каждой странице один id каждого якоря, дублей нет', async () => {
    const rows = [];
    for (const [name, open] of [['главная', openHome], ['каталог', openCatalog]]) {
      await open(guest.page);
      const dupes = await guest.page.evaluate(() => {
        const ids = Array.from(document.querySelectorAll('[id]')).map((el) => el.id).filter((id) => !id.startsWith('_R_'));
        return ids.filter((id, i) => ids.indexOf(id) !== i);
      });
      must(dupes.length === 0, `${name}: дубли id: ${dupes.join(', ')}`);
      rows.push(`${name}: дублей нет`);
    }
    return rows.join('; ');
  }, guest.page);

  await step('step-55', 'карусель везде одна — CardSlider: «Клубы» и «Тренеры» на главной, выдача на /catalog', async () => {
    const rows = [];
    for (const [name, open, expectRails] of [['главная', openHome, 2], ['каталог', openCatalog, null]]) {
      await open(guest.page);
      const rails = await guest.page.locator('[data-card-slider-rail]').count();
      const others = await guest.page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid$="-scroll"], .scrollbar-hidden'))
          .filter((el) => el.querySelector('[data-testid="club-card"], [data-testid="trainer-card"], [aria-label^="Карточка"]'))
          .map((el) => el.getAttribute('data-testid') ?? el.className),
      );
      must(others.length === 0, `${name}: кроме CardSlider (${rails} рельс) карточки крутят ещё: ${others.join(', ')}`);
      if (expectRails !== null) must(rails === expectRails, `${name}: рельсов CardSlider ${rails}, ожидалось ${expectRails} («Клубы» и «Тренеры»)`);
      rows.push(`${name}: CardSlider ${rails} рельс, своих лент нет`);
    }
    return rows.join('; ');
  }, guest.page);

  await step('step-56', 'заглушки вместо фото помечены и названы в реестре', async () => {
    const placeholders = await guest.page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="club-card"], [data-testid="trainer-card"], [aria-label^="Карточка"]'))
        .map((card) => card.innerText.match(/Фото preview|^Фото$/m)?.[0] ?? (card.querySelector('img') ? null : 'без img'))
        .filter(Boolean),
    );
    // ⚠️ Смотрим СТРОКИ ТАБЛИЦЫ реестра (путь в первой ячейке — так их читает сторож),
    // а не весь файл: в пояснениях реестра слово «фото» есть задолго до самой записи.
    const registry = fs.existsSync(STUBS_REGISTRY) ? fs.readFileSync(STUBS_REGISTRY, 'utf8') : '';
    const rows = registry.split('\n').filter((line) => /^\|\s*`[^`]+`\s*\|/.test(line));
    const named = rows.some((row) => /фото/i.test(row));
    must(named, `в таблице реестра заглушек ${rows.length} строк, о фото — ни одной${fs.existsSync(STUBS_REGISTRY) ? '' : ' (файла нет)'}; заглушек на экране ${placeholders.length}`);
    return `заглушек фото на экране ${placeholders.length} (${[...new Set(placeholders)].join(', ') || 'нет'}), реестр называет фото`;
  }, guest.page);

  // ───────────────────────── Scenario 9: чистота после покраски ─────────────────────────
  console.log('\nScenario 9: чистота после покраски');

  await step('step-57', 'пять страниц разных групп: пятен нет, палитра одна', async () => {
    const pages = [
      { who: person, url: `/profile/me/dashboard`, name: 'кабинет' },
      { who: guest, url: `/clubs/${made.clubASlug}`, name: 'детальная' },
      { who: admin, url: `/service-portal/dashboard`, name: 'панель' },
      { who: person, url: `/booking/${made.openSlot}`, name: 'запись' },
      { who: guest, url: `/reset-password`, name: 'восстановление пароля' },
    ];
    const rows = [];
    const dirty = [];
    for (const { who, url, name } of pages) {
      await who.page.setViewportSize({ width: 1440, height: 900 });
      await who.page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded' });
      await wait(who.page, 2_000);
      const spots = await legacySpots(who.page);
      // Один ориентир `main` на страницу: вложенный main каркаса + страницы (38.66/38.79a) ловится здесь.
      const mains = await who.page.locator('main').count();
      rows.push(`${name} (${url}): пятен ${spots.spotCount}, цветов ${spots.distinct}, main ${mains}`);
      if (spots.spotCount > 0) dirty.push(`${name}: ${spots.spots.slice(0, 2).join('; ')}`);
      if (mains !== 1) dirty.push(`${name}: <main> на странице ${mains}, ожидался один`);
    }
    must(dirty.length === 0, `пятна старой палитры или лишний main: ${dirty.join(' | ')}`);
    return rows.join('; ');
  }, guest.page);

  await step('step-58', 'русские заголовки отрисованы выбранным шрифтом, а не подстановкой', async () => {
    await openHome(guest.page);
    const fonts = await platformFonts(guest.page, 'h1');
    const cyrillic = (await guest.page.locator('h1').first().innerText()).replace(/[^А-Яа-яЁё]/g, '').length;
    const sofia = fonts.find((f) => /Sofia Sans/i.test(f.family));
    const system = fonts.filter((f) => !f.custom);
    must(sofia, `в H1 нет Sofia Sans: ${fontsLine(fonts)}`);
    must(system.length === 0, `часть глифов H1 из системного шрифта: ${fontsLine(fonts)}`);
    must(sofia.glyphs >= cyrillic, `кириллических букв ${cyrillic}, из Sofia глифов ${sofia.glyphs}`);
    return `H1 по глифам: ${fontsLine(fonts)}`;
  }, guest.page);

  await step('step-59', 'контраст текста к фону не ухудшился относительно замера до покраски', async () => {
    await openHome(guest.page);
    const scan = await contrastScan(guest.page);
    const hasBaseline = fs.existsSync(CONTRAST_BASELINE);
    if (!hasBaseline) {
      fs.mkdirSync(path.dirname(CONTRAST_BASELINE), { recursive: true });
      fs.writeFileSync(CONTRAST_BASELINE, JSON.stringify({ takenAt: new Date().toISOString(), ...scan }, null, 2), 'utf8');
      return `базовая линия снята ЭТИМ прогоном (до покраски): текстов ${scan.sampled}, ниже AA ${scan.belowAA}, минимум ${scan.min?.ratio}:1 «${scan.min?.text}» — сравнивать будет следующий прогон`;
    }
    const baseline = JSON.parse(fs.readFileSync(CONTRAST_BASELINE, 'utf8'));
    must(scan.belowAA <= baseline.belowAA, `ниже AA стало ${scan.belowAA} против ${baseline.belowAA} до покраски; худшие: ${scan.worst.join(', ')}`);
    // Рабочая часть переехала на /catalog — её контраст меряется там же; базовой линии «до покраски»
    // у каталога нет (страницы не было), поэтому — факт в отчёт и порог по главной.
    await openCatalog(guest.page);
    const catalog = await contrastScan(guest.page);
    must(catalog.belowAA <= baseline.belowAA, `/catalog: ниже AA ${catalog.belowAA} против ${baseline.belowAA} у главной до покраски; худшие: ${catalog.worst.join(', ')}`);
    return `главная: текстов ${scan.sampled}, ниже AA ${scan.belowAA} (до покраски ${baseline.belowAA}), минимум ${scan.min?.ratio}:1 «${scan.min?.text}»; /catalog: текстов ${catalog.sampled}, ниже AA ${catalog.belowAA}, минимум ${catalog.min?.ratio}:1 «${catalog.min?.text}»`;
  }, guest.page);

  // ───────────────────────── Scenario 10: верификация ─────────────────────────
  console.log('\nScenario 10: верификация');

  const moderationUrl = (kind, id) => `${BASE}/service-portal/moderation?type=${kind}&id=${id}`;
  const verifiedAt = (table, id) => readDb(`SELECT verified_at FROM ${table} WHERE id = ${id};`).trim();
  const lastLog = (action, entityType, entityId) =>
    readDb(`SELECT actor_id FROM logs WHERE action = '${action}' AND entity_type = '${entityType}' AND entity_id = ${entityId} ORDER BY id DESC LIMIT 1;`).trim();
  const ownerNotice = (type, clubId, trainerId) =>
    readDb(`SELECT payload::text FROM notifications WHERE type = '${type}' AND ${clubId ? `addressee_club_id = ${clubId}` : `addressee_trainer_id = ${trainerId}`} ORDER BY id DESC LIMIT 1;`).trim();

  /** Открыть карточку модерации по предмету. Отказ страницы — сразу своим именем. */
  async function openModeration(kind, id) {
    await admin.page.goto(moderationUrl(kind, id), { waitUntil: 'domcontentloaded' });
    await admin.page.getByText('Модерация публикаций').first().waitFor({ timeout: 20_000 });
    await wait(admin.page, 1_500);
  }

  await step('step-60', 'гость: у непроверенного клуба знака нет и дыры нет', async () => {
    // Клуб прогона (рейтинг 0) в шестёрку витрины не попадает — его карточка на /catalog#results.
    await openCatalog(guest.page, { hash: '#results' });
    const card = clubCards(guest.page.locator('#results')).filter({ hasText: nameA }).first();
    must((await card.count()) > 0, `карточки «${nameA}» на главной нет`);
    const text = await card.innerText();
    must(!/проверен/i.test(text), `знак у непроверенного: «${text.match(/[^\n]*проверен[^\n]*/i)?.[0]}»`);
    const hole = await card.locator('[data-testid="verified-badge"], [data-verified]').count();
    must(hole === 0, 'на месте знака пустой элемент');
    return `«${nameA}»: знака нет, пустого элемента нет`;
  }, guest.page);

  await step('step-61', 'модерация: у клуба состояние «не проверен» и кнопка «Подтвердить»', async () => {
    await openModeration('club', made.clubA);
    const card = admin.page.locator('article, section, li').filter({ has: admin.page.getByRole('heading', { name: nameA }) }).first();
    must((await card.count()) > 0, `карточки «${nameA}» в модерации нет`);
    const text = await card.innerText();
    // План 38.54 явного слова «не проверен» не требует: непроверенность — это ОТСУТСТВИЕ
    // знака «проверен» при кнопке «Подтвердить» (проверенная строка кнопку не показывает, 409 не рисуется).
    must(!/(^|\s)проверен/i.test(text), `у непроверённого клуба стоит знак: «${text.slice(0, 120)}»`);
    must((await card.getByRole('button', { name: /^Подтвердить/ }).count()) > 0, 'кнопки «Подтвердить» нет');
    return 'знака «проверен» нет, кнопка «Подтвердить» есть';
  }, admin.page);

  await step('step-62', '«Подтвердить»: состояние сменилось, в журнале verification_grant с исполнителем', async () => {
    const card = admin.page.locator('article, section, li').filter({ has: admin.page.getByRole('heading', { name: nameA }) }).first();
    const confirm = card.getByRole('button', { name: /^Подтвердить/ });
    must((await confirm.count()) > 0, 'кнопки «Подтвердить» нет');
    await confirm.click();
    await wait(admin.page, 2_000);
    const text = await card.innerText();
    must(/(^|\s)проверен/i.test(text) && !/не проверен/i.test(text), `состояние не сменилось: «${text.slice(0, 120)}»`);
    must(verifiedAt('clubs', made.clubA) !== '', 'verified_at в базе пуст');
    mustEqual(Number(lastLog('verification_grant', 'club', made.clubA)), adminId, 'исполнитель verification_grant');
    // Отбор «непроверенные»: в адресе страницы — словом (`verification=unverified`),
    // к API — контрактным `verified=false` (38.54); отбор в ЗАПРОСЕ, не поверх страницы:
    // проверенный клуб А из списка непроверенных исчезает, в списке проверенных — есть.
    const publicationCalls = [];
    const onRequest = (request) => {
      if (request.url().includes('/api/publications')) publicationCalls.push(request.url());
    };
    admin.page.on('request', onRequest);
    const filter = admin.page.getByLabel('Проверка площадкой').first();
    must((await filter.count()) > 0, 'элемента отбора по проверенности в разделе нет');
    await filter.selectOption('unverified').catch(async () => {
      await filter.selectOption({ label: /^непроверен/i });
    });
    await wait(admin.page, 1_500);
    must(/verification=unverified|verified=false/.test(admin.page.url()), `адрес после отбора «непроверенные»: ${admin.page.url()}`);
    must(publicationCalls.some((u) => u.includes('verified=false')), `запрос к API без verified=false: ${publicationCalls.slice(-2).join(' | ') || 'запросов не было'}`);
    must((await admin.page.getByRole('heading', { name: nameA }).count()) === 0, 'проверенный клуб остался в списке непроверенных');
    await filter.selectOption('verified').catch(async () => {
      await filter.selectOption({ label: /^проверен/i });
    });
    await wait(admin.page, 1_500);
    admin.page.off('request', onRequest);
    must(/verification=verified|verified=true/.test(admin.page.url()), `адрес после отбора «проверенные»: ${admin.page.url()}`);
    must(publicationCalls.some((u) => u.includes('verified=true')), 'запрос к API без verified=true');
    must((await admin.page.getByRole('heading', { name: nameA }).count()) > 0, 'проверенного клуба нет в списке проверенных');
    return `проверен; verified_at ${verifiedAt('clubs', made.clubA)}; журнал: verification_grant, исполнитель #${adminId}; отбор: адрес verification=…, запрос verified=false/true, клуб А в нужном списке`;
  }, admin.page);

  await step('step-63', 'гость: знак «Клуб проверен» с текстовой подписью на карточке и детальной', async () => {
    // Клуб прогона (рейтинг 0) в шестёрку витрины не попадает — его карточка на /catalog#results.
    await openCatalog(guest.page, { hash: '#results' });
    const card = clubCards(guest.page.locator('#results')).filter({ hasText: nameA }).first();
    must((await card.count()) > 0, `карточки «${nameA}» на главной нет`);
    const cardText = await card.evaluate((el) => el.textContent ?? '');
    const badgeCount = await card.locator('[data-testid="verified-badge"]').count();
    must(/Клуб проверен/.test(cardText), `на карточке нет подписи «Клуб проверен» (знаков ${badgeCount}, текст: «${cardText.slice(0, 120)}»)`);
    await guest.page.goto(`${BASE}/clubs/${made.clubASlug}`, { waitUntil: 'domcontentloaded' });
    await wait(guest.page, 1_500);
    // ⚠️ textContent, не innerText: у чипа знака `uppercase`, и innerText отдаёт «КЛУБ ПРОВЕРЕН» —
    // регистрозависимая проверка молчала бы, а отрицание в 67/68d зеленело бы ложно.
    must(/Клуб проверен/.test(await guest.page.locator('main').first().evaluate((el) => el.textContent ?? '')), 'на детальной нет подписи «Клуб проверен»');
    // Гостю видно «когда» (по нему рисуется знак) и НЕ видно «кем» — номер администратора.
    const pub = await api(guest.page, 'GET', `/api/clubs/${made.clubA}`);
    must(pub.status === 200, `/api/clubs/${made.clubA} → ${pub.status}`);
    const leaked = /verifiedByUserId/.test(pub.text) || /verifiedByUserId/.test(JSON.stringify(pub.body));
    must(pub.body?.data?.club?.verifiedAt, 'verifiedAt гостю не отдан — знак нечем рисовать');
    must(!leaked, 'verifiedByUserId утёк в публичную выдачу');
    return `подпись «Клуб проверен» на карточке и на детальной; API: verifiedAt ${pub.body.data.club.verifiedAt}, verifiedByUserId скрыт`;
  }, guest.page);

  await step('step-64', 'подсказка знака: по наведению и по фокусу, закрывается по Escape', async () => {
    const badge = guest.page.locator('[data-testid="verified-badge"], [aria-describedby]', { hasText: /проверен/i }).first();
    must((await badge.count()) > 0, 'знака с подсказкой нет');
    const describedBy = await badge.getAttribute('aria-describedby');
    must(describedBy, 'у знака нет aria-describedby');
    const hint = guest.page.locator(`#${describedBy}`);
    // Знак может стоять в слайде ленты за краем рельса — подвести в кадр, иначе наведение/фокус не долетают.
    await badge.scrollIntoViewIfNeeded();
    await badge.hover();
    await wait(guest.page, 400);
    must(await hint.isVisible(), 'подсказка не открылась по наведению');
    await guest.page.mouse.move(5, 5);
    await wait(guest.page, 400);
    await badge.focus();
    await wait(guest.page, 400);
    must(await hint.isVisible(), 'подсказка не открылась по фокусу');
    await guest.page.keyboard.press('Escape');
    await wait(guest.page, 400);
    must(!(await hint.isVisible()), 'подсказка не закрылась по Escape');
    return `aria-describedby=${describedBy}: наведение да, фокус да, Escape закрывает`;
  }, guest.page);

  await step('step-65', 'владелец: письмо «публикация проверена» в ящике ЭТОГО лица, без имени администратора', async () => {
    await owner.page.goto(`${BASE}/profile/club/${made.clubA}/notifications`, { waitUntil: 'domcontentloaded' });
    await wait(owner.page, 2_000);
    const text = await owner.page.locator('main').first().innerText();
    must(/проверен/i.test(text), 'в ящике клуба нет письма о проверке');
    const adminName = readDb(`SELECT name FROM users WHERE id = ${adminId};`).trim();
    must(!text.includes(adminName), `в письме имя администратора «${adminName}»`);
    const payload = ownerNotice('publication_verified_for_owner', made.clubA);
    must(payload !== '', 'строки publication_verified_for_owner в ящике клуба нет');
    return `письмо в ящике клуба, имени «${adminName}» нет; payload ${payload.slice(0, 80)}`;
  }, owner.page);

  await step('step-66', '«Отозвать» без причины — отказ «Причина отзыва обязательна»', async () => {
    await openModeration('club', made.clubA);
    const card = admin.page.locator('article, section, li').filter({ has: admin.page.getByRole('heading', { name: nameA }) }).first();
    const revoke = card.getByRole('button', { name: /^Отозвать/ });
    must((await revoke.count()) > 0, 'кнопки «Отозвать» нет');
    await revoke.click();
    const dialog = admin.page.locator('[role="dialog"]');
    await dialog.waitFor({ timeout: 5_000 });
    // 38.54: пустая причина не уходит на сервер — кнопка модалки заблокирована, пока поле
    // пусто. Отказ считается предъявленным либо так, либо серверным текстом из словаря.
    const confirmButton = dialog.getByRole('button', { name: /^Отозвать/ });
    const disabled = await confirmButton.isDisabled();
    let refusal = disabled ? 'кнопка «Отозвать» заблокирована при пустой причине' : '';
    if (!disabled) {
      const requests = [];
      const onRequest = (request) => {
        if (request.url().includes('/api/moderation')) requests.push(request.method());
      };
      admin.page.on('request', onRequest);
      await confirmButton.click();
      await wait(admin.page, 1_000);
      admin.page.off('request', onRequest);
      const text = await admin.page.locator('body').innerText();
      must(/Причина отзыва обязательна/.test(text), `кнопка активна при пустой причине, а текста отказа нет; запросов к /api/moderation: ${requests.length}`);
      refusal = 'сервер ответил «Причина отзыва обязательна»';
    }
    must(verifiedAt('clubs', made.clubA) !== '', 'отзыв без причины прошёл — verified_at обнулён');
    return `${refusal}; verified_at на месте`;
  }, admin.page);

  await step('step-67', 'отзыв с причиной: знак у гостя исчез, владельцу причина, в журнале verification_revoke', async () => {
    const dialog = admin.page.locator('[role="dialog"]');
    if ((await dialog.count()) === 0) {
      const card = admin.page.locator('article, section, li').filter({ has: admin.page.getByRole('heading', { name: nameA }) }).first();
      const revoke = card.getByRole('button', { name: /^Отозвать/ });
      must((await revoke.count()) > 0, 'кнопки «Отозвать» нет');
      await revoke.click();
      await dialog.waitFor({ timeout: 5_000 });
    }
    const reason = `${RUN_TAG} причина отзыва`;
    await dialog.getByLabel(/Причина/).fill(reason);
    await dialog.getByRole('button', { name: /^Отозвать/ }).click();
    await wait(admin.page, 2_000);
    mustEqual(verifiedAt('clubs', made.clubA), '', 'verified_at после отзыва');
    mustEqual(Number(lastLog('verification_revoke', 'club', made.clubA)), adminId, 'исполнитель verification_revoke');
    const payload = ownerNotice('publication_verification_revoked_for_owner', made.clubA);
    must(payload.includes(reason), `причина не доехала до владельца: ${payload.slice(0, 100)}`);
    await guest.page.goto(`${BASE}/clubs/${made.clubASlug}`, { waitUntil: 'domcontentloaded' });
    await wait(guest.page, 1_500);
    must(!/Клуб проверен/.test(await guest.page.locator('main').first().evaluate((el) => el.textContent ?? '')), 'знак у гостя остался');
    return `verified_at пуст, verification_revoke #${adminId}, владельцу причина «${reason}», знак у гостя исчез`;
  }, admin.page);

  await step('step-68', 'скрытие модератором снимает знак; архив владельцем — нет', async () => {
    for (const id of [made.clubB, made.clubC]) {
      const grant = await api(admin.page, 'POST', '/api/moderation', { action: 'verify', entityType: 'club', entityId: id });
      must(grant.status === 200, `verify клуба ${id}: ${grant.status} ${grant.text}`);
    }
    await openModeration('club', made.clubB);
    const card = admin.page.locator('article, section, li').filter({ has: admin.page.getByRole('heading', { name: nameB }) }).first();
    await card.getByRole('button', { name: 'Скрыть', exact: true }).first().click();
    await admin.page.getByLabel('Причина скрытия').fill(`${RUN_TAG} скрытие проверенного`);
    await admin.page.locator('[role="dialog"]').getByRole('button', { name: 'Скрыть' }).click();
    await wait(admin.page, 2_000);
    mustEqual(verifiedAt('clubs', made.clubB), '', 'verified_at скрытого модератором');
    const archive = await api(owner.page, 'DELETE', `/api/clubs/${made.clubC}`);
    must(archive.status === 200, `уборка клуба В: ${archive.status} ${archive.text}`);
    mustEqual(archive.body?.data?.outcome, 'archived', 'исход уборки клуба В');
    must(verifiedAt('clubs', made.clubC) !== '', 'архив владельца снял знак');
    return `клуб Б скрыт → verified_at пуст; клуб В в архиве → verified_at ${verifiedAt('clubs', made.clubC)}`;
  }, admin.page);

  await step('step-68a', 'администратор подтверждает карточку тренера: журнал verification_grant с предметом-тренером', async () => {
    await openModeration('trainer', made.trainer);
    const card = admin.page.locator('article, section, li').filter({ hasText: `${RUN_TAG} Тренер` }).first();
    must((await card.count()) > 0, 'карточки тренера в модерации нет');
    const confirm = card.getByRole('button', { name: /^Подтвердить/ });
    must((await confirm.count()) > 0, 'кнопки «Подтвердить» у тренера нет');
    await confirm.click();
    await wait(admin.page, 2_000);
    must(verifiedAt('trainers', made.trainer) !== '', 'verified_at тренера пуст');
    mustEqual(Number(lastLog('verification_grant', 'trainer', made.trainer)), adminId, 'исполнитель verification_grant тренера');
    return `verified_at ${verifiedAt('trainers', made.trainer)}, журнал verification_grant (trainer #${made.trainer}) #${adminId}`;
  }, admin.page);

  await step('step-68b', 'гость: «Тренер проверен» на карточке главной и на /trainers/[slug]', async () => {
    await openCatalog(guest.page, { hash: '#results' });
    await switchToTrainers(guest.page);
    const card = trainerCards(guest.page.locator('#results')).filter({ hasText: RUN_TAG }).first();
    must((await card.count()) > 0, 'карточки тренера прогона на главной нет');
    const cardText = await card.evaluate((el) => el.textContent ?? '');
    const badgeCount = await card.locator('[data-testid="verified-badge"]').count();
    must(/Тренер проверен/.test(cardText), `на карточке нет подписи «Тренер проверен» (знаков ${badgeCount}, текст: «${cardText.slice(0, 120)}»)`);
    await guest.page.goto(`${BASE}/trainers/${made.trainerSlug}`, { waitUntil: 'domcontentloaded' });
    await wait(guest.page, 1_500);
    must(/Тренер проверен/.test(await guest.page.locator('main').first().evaluate((el) => el.textContent ?? '')), 'на странице тренера нет подписи');
    const pub = await api(guest.page, 'GET', `/api/trainers/${made.trainer}`);
    must(pub.status === 200 && pub.body?.data?.trainer?.verifiedAt, `verifiedAt тренера гостю не отдан (${pub.status})`);
    must(!/verifiedByUserId/.test(JSON.stringify(pub.body)), 'verifiedByUserId тренера утёк в публичную выдачу');
    return `подпись «Тренер проверен» на карточке и на странице; API: verifiedAt виден, verifiedByUserId скрыт`;
  }, guest.page);

  await step('step-68c', 'владелец карточки: уведомление о проверке в ящике лица, без имени администратора', async () => {
    await owner.page.goto(`${BASE}/profile/trainer/${made.trainer}/notifications`, { waitUntil: 'domcontentloaded' });
    await wait(owner.page, 2_000);
    const text = await owner.page.locator('main').first().innerText();
    must(/проверен/i.test(text), 'в ящике карточки нет письма о проверке');
    const adminName = readDb(`SELECT name FROM users WHERE id = ${adminId};`).trim();
    must(!text.includes(adminName), `в письме имя администратора «${adminName}»`);
    must(ownerNotice('publication_verified_for_owner', null, made.trainer) !== '', 'строки publication_verified_for_owner в ящике карточки нет');
    return `письмо в ящике карточки, имени «${adminName}» нет`;
  }, owner.page);

  await step('step-68d', 'отзыв проверки тренера с причиной: знак исчез, владельцу причина', async () => {
    const reason = `${RUN_TAG} причина отзыва тренера`;
    const revoke = await api(admin.page, 'POST', '/api/moderation', { action: 'unverify', entityType: 'trainer', entityId: made.trainer, reason });
    must(revoke.status === 200, `unverify тренера: ${revoke.status} ${revoke.text}`);
    mustEqual(verifiedAt('trainers', made.trainer), '', 'verified_at тренера после отзыва');
    const payload = ownerNotice('publication_verification_revoked_for_owner', null, made.trainer);
    must(payload.includes(reason), `причина не доехала: ${payload.slice(0, 100)}`);
    await guest.page.goto(`${BASE}/trainers/${made.trainerSlug}`, { waitUntil: 'domcontentloaded' });
    await wait(guest.page, 1_500);
    must(!/Тренер проверен/.test(await guest.page.locator('main').first().evaluate((el) => el.textContent ?? '')), 'знак у гостя остался');
    return `verified_at пуст, причина «${reason}» у владельца, знак у гостя исчез`;
  }, admin.page);

  // ───────────────────────── Scenario 11: шрифты и рубль ─────────────────────────
  console.log('\nScenario 11: шрифты и рубль');

  await step('step-69', 'русские заголовки — Sofia Sans Extra Condensed; ширина «НАЙДИ ЗАЛ»', async () => {
    await openHome(guest.page);
    const fonts = await platformFonts(guest.page, 'h1');
    const sofia = fonts.find((f) => /Sofia Sans/i.test(f.family));
    const width = await guest.page.evaluate(() => {
      const stack = getComputedStyle(document.documentElement).getPropertyValue('--ui-font-display');
      const s = document.createElement('span');
      s.textContent = 'НАЙДИ ЗАЛ';
      s.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:800 72px ${stack}`;
      document.body.append(s);
      const w = Math.round(s.getBoundingClientRect().width * 10) / 10;
      s.remove();
      return { stack: stack.trim(), w };
    });
    must(sofia && fonts.every((f) => f.custom), `H1 по глифам: ${fontsLine(fonts)}`);
    // Эталон дизайна: «НАЙДИ ЗАЛ, ЗАПИШИСЬ» в макете набран Helvetica (подстановка) — 883.5px.
    return `H1: ${fontsLine(fonts)}; «НАЙДИ ЗАЛ» при 72px в стеке ${width.stack}: ${width.w}px`;
  }, guest.page);

  await step('step-70', 'абзац — Inter, кириллица ровная', async () => {
    const fonts = await platformFonts(guest.page, 'main main p, main p');
    const inter = fonts.find((f) => /^Inter/i.test(f.family));
    must(inter && fonts.every((f) => f.custom), `абзац по глифам: ${fontsLine(fonts)}`);
    return `абзац: ${fontsLine(fonts)}`;
  }, guest.page);

  await step('step-71', 'знак рубля на цене того же веса и высоты, что цифры — не системный', async () => {
    const price = guest.page.locator('main *:not(script)', { hasText: /\d\s?₽/ }).last();
    must((await price.count()) > 0, 'цены со знаком ₽ на главной нет');
    const selector = await price.evaluate((el) => {
      el.setAttribute('data-e2e-price', '1');
      return '[data-e2e-price="1"]';
    });
    const fonts = await platformFonts(guest.page, selector);
    const system = fonts.filter((f) => !f.custom);
    must(system.length === 0, `часть цены из системного шрифта: ${fontsLine(fonts)}`);
    must(fonts.length >= 2, `рубль и цифры из одного файла? ${fontsLine(fonts)} — рублёвого донора нет`);
    return `цена по глифам: ${fontsLine(fonts)}`;
  }, guest.page);

  await step('step-72', 'три span с ₽: в стеке, в рублёвом шрифте, в serif', async () => {
    // ⚠️ Замер — ПОСЛЕ `document.fonts.ready`: проба в ещё не загруженном face меряется
    // запасным шрифтом и совпадает с serif — «рубль системный» на совершенно верной
    // странице (нашёл прогон ph38-b: 35.64 = 35.64 до загрузки, после — разные).
    const measure = () =>
      guest.page.evaluate(() => {
        const stack = getComputedStyle(document.body).getPropertyValue('--ui-font-display').trim();
        const ruble = stack.split(',')[0].trim();
        const mk = (font) => {
          const s = document.createElement('span');
          s.textContent = '₽';
          s.style.cssText = `position:absolute;visibility:hidden;font:800 72px ${font}`;
          document.body.append(s);
          const w = Math.round(s.getBoundingClientRect().width * 100) / 100;
          s.remove();
          return w;
        };
        return { stack, ruble, inStack: mk(stack), inRuble: mk(ruble), inSerif: mk('serif') };
      });
    const first = await measure();
    await guest.page.evaluate(() => document.fonts.ready);
    await wait(guest.page, 500);
    const m = await measure();
    must(m.stack !== '', 'токена --ui-font-display нет');
    mustEqual(m.inStack, m.inRuble, `ширина ₽ в стеке (${m.stack}) против рублёвого (${m.ruble})`);
    must(m.inSerif !== m.inStack, `ширина ₽ в serif совпала со стеком (${m.inSerif}) — рубль системный`);
    return `стек «${m.stack}»: ₽ ${m.inStack}px = рублёвый ${m.inRuble}px ≠ serif ${m.inSerif}px (до fonts.ready: ${first.inStack}/${first.inRuble}/${first.inSerif})`;
  }, guest.page);

  await step('step-73', 'страница без цен: рублёвый шрифт не загружен', async () => {
    // ⚠️ Свежий контекст: после главной face рубля лежит в кеше браузера, и в том же
    // контексте `document.fonts` на странице без цен отвечает `loaded` — это память
    // предыдущей страницы, а не запрос этой. Чек-лист спрашивает про первый заход.
    const ctx = await guest.context.browser().newContext({ viewport: { width: 1440, height: 900 } });
    try {
      const page = await ctx.newPage();
      const rubleRequests = [];
      page.on('request', (request) => {
        if (/ruble/i.test(request.url())) rubleRequests.push(request.url());
      });
      await page.goto(`${BASE}/reset-password`, { waitUntil: 'load' });
      await wait(page, 2_000);
      const faces = await page.evaluate(() => {
        const stack = getComputedStyle(document.body).getPropertyValue('--ui-font-display').trim();
        const ruble = stack.split(',')[0].trim().replace(/['"]/g, '');
        return {
          ruble,
          faces: Array.from(document.fonts)
            .filter((f) => f.family.replace(/['"]/g, '') === ruble)
            .map((f) => `${f.family} ${f.weight} ${f.status}`),
          hasPrice: /₽/.test(document.body.innerText),
        };
      });
      must(!faces.hasPrice, 'на странице есть ₽ — не годится для замера');
      must(faces.faces.length > 0, `рублёвого face «${faces.ruble}» в document.fonts нет`);
      const loaded = faces.faces.filter((f) => / loaded$/.test(f));
      must(loaded.length === 0, `рублёвый шрифт загружен без цен: ${loaded.join(', ')}`);
      must(rubleRequests.length === 0, `сеть запросила рубль без цен: ${rubleRequests.join(', ')}`);
      return `${faces.faces.join(', ')} — не загружен; запросов рублёвых файлов 0`;
    } finally {
      await ctx.close();
    }
  }, guest.page);

  await shutdown();
}

/** Отчёт по формату скила: таблица шагов, падения, окружение. */
function writeReport() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = path.join(HERE, 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `phase-38-${stamp}.md`);
  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const skipped = results.filter((r) => r.status === 'skip').length;
  const icon = { pass: '✅ passed', fail: '❌ failed', skip: '⏭ skipped' };
  const rows = results
    .map((r) => `| ${r.id} | ${r.title} | ${icon[r.status]} | ${r.ms ? `${(r.ms / 1000).toFixed(1)}s` : '—'} | ${String(r.detail).replace(/\|/g, '/').replace(/\n/g, ' ')} |`)
    .join('\n');
  const failures = results
    .filter((r) => r.status === 'fail')
    .map((r) => `### ${r.id} — ${r.title}\n\n- **Ожидалось:** по чек-листу\n- **Получено:** ${r.detail}\n- **Снимок:** ${r.shot || '—'}\n`)
    .join('\n');
  fs.writeFileSync(
    file,
    `# E2E Report: Phase 38 — главная на новом дизайне\n\n` +
      `**Дата:** ${new Date().toISOString()}\n` +
      `**Чек-лист:** tests/checklists/phase-38-home.md (80 шагов, 11 сценариев; 38.79b)\n` +
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
  results.push({ id: 'run', title: 'прогон прерван', status: 'fail', detail: String(error?.message ?? error), ms: 0 });
  exitCode = 2;
  await shutdown();
} finally {
  // ⚠️ Уборка обязана случиться и после падения посреди прогона.
  let cleanupError = '';
  try {
    const cleaned = cleanupRun({ subjects: erased });
    console.log(`\nУборка: людей ${cleaned.users}, клубов ${cleaned.clubs}, карточек ${cleaned.trainers}, сессий сида снято ${cleaned.sessions}`);
  } catch (error) {
    cleanupError = String(error.stderr ?? error.message ?? error).slice(0, 200);
    console.log(`\n⚠️ cleanupRun() упал: ${cleanupError}`);
  }

  // Добор по ОКНУ прогона — строки, которые реестр планов не уносит по построению:
  // журнал о людях прогона от живого администратора (подмена), о предметах, которых
  // уже нет, и надзорные строки прогона. Отбор всегда парой «тип + номер»:
  // `logs.entity_id` полиморфен (решение заказчика 17 фазы 36).
  const runLogWhere = `id > ${startMaxLogId} AND (
        meta::text LIKE '%${RUN_TAG}%'
        OR (entity_type = 'user' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = logs.entity_id))
        OR (entity_type = 'club' AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.id = logs.entity_id))
        OR (entity_type = 'trainer' AND NOT EXISTS (SELECT 1 FROM trainers t WHERE t.id = logs.entity_id))
        OR (entity_type = 'booking' AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.id = logs.entity_id))
        OR (entity_type = 'trainer_club_link' AND NOT EXISTS (SELECT 1 FROM trainer_club_links k WHERE k.id = logs.entity_id))
      )`;
  const logsSwept = num(`WITH d AS (DELETE FROM logs WHERE ${runLogWhere} RETURNING 1) SELECT count(*) FROM d;`);
  const supervisionSwept = num(
    `WITH d AS (DELETE FROM notifications WHERE addressee_kind = 'supervision' AND id > ${startMaxNotificationId} AND (
        (payload->>'subjectType' = 'user' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id::text = payload->>'subjectId'))
        OR (payload->>'subjectType' = 'club' AND NOT EXISTS (SELECT 1 FROM clubs c WHERE c.id::text = payload->>'subjectId'))
        OR (payload->>'subjectType' = 'trainer' AND NOT EXISTS (SELECT 1 FROM trainers t WHERE t.id::text = payload->>'subjectId'))
      ) RETURNING 1) SELECT count(*) FROM d;`,
  );

  const leftPeople = num(`SELECT count(*) FROM users WHERE email LIKE '${RUN_TAG}-%';`);
  const leftClubs = num(`SELECT count(*) FROM clubs WHERE name LIKE '${RUN_TAG}%';`);
  const leftTrainers = num(`SELECT count(*) FROM trainers WHERE name LIKE '${RUN_TAG}%';`);
  const leftLogs = num(`SELECT count(*) FROM logs WHERE ${runLogWhere};`);
  const leftSupervision = num(`SELECT count(*) FROM notifications WHERE addressee_kind = 'supervision' AND id > ${startMaxNotificationId};`);
  const cleanOk = leftPeople === 0 && leftClubs === 0 && leftTrainers === 0 && leftLogs === 0 && leftSupervision === 0 && cleanupError === '';
  results.push({
    id: 'уборка',
    title: 'после прогона мусора в живой базе не прибавилось',
    status: cleanOk ? 'pass' : 'fail',
    detail: `людей ${leftPeople}, клубов ${leftClubs}, карточек ${leftTrainers}, строк журнала о прогоне ${leftLogs} (добором снято ${logsSwept}), надзорных строк прогона ${leftSupervision} (добором снято ${supervisionSwept})${cleanupError ? `; ⚠️ cleanupRun() упал: ${cleanupError}` : ''}`,
    ms: 0,
  });
  console.log(`  ${cleanOk ? '✅' : '❌'} уборка — людей ${leftPeople}, клубов ${leftClubs}, карточек ${leftTrainers}, журнальных ${leftLogs}, надзорных ${leftSupervision}`);

  const report = writeReport();
  console.log(`Итог: ${report.pass} прошло, ${report.fail} упало, ${report.skipped} не прогонялось.`);
  console.log(`Отчёт: ${report.file}`);
  process.exit(exitCode === 2 ? 2 : report.fail > 0 ? 1 : 0);
}
