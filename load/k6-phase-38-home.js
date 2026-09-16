/**
 * Нагрузочный замер фазы 38, шаг 38.99: главная и `/stats/overview`.
 *
 * Что меряется — четыре профиля, гость, без единого входа:
 *   • `stats`    — `GET /api/stats/overview`: четыре `COUNT` героя главной, самая
 *                  посещаемая страница спрашивает их при каждом открытии;
 *   • `showcase` — витринные вызовы, которые главная делает на сервере при отрисовке
 *                  (шаг 38.32): шесть клубов и четыре тренера по рейтингу, два лидера
 *                  с `limit=1`, плюс счётчики. Это то, ради чего Э4 уводил `limit`
 *                  и `orderBy` в запрос — здесь это и проверяется под нагрузкой;
 *   • `working`  — рабочая часть: выдача с фильтрами. Поиск подстрокой — ДЕЙСТВУЮЩЕЕ
 *                  ОГРАНИЧЕНИЕ (долг Д-15): отбор идёт в памяти по всему каталогу,
 *                  и порог здесь мягче витринного намеренно — он меряет цену долга,
 *                  а не прячет её;
 *   • `page`     — сама страница `GET /` у фронта: цена отрисовки для гостя целиком,
 *                  вместе со всеми серверными вызовами выше.
 *
 * ⚠️ Три урока прошлых замеров, без которых профиль бессмыслен (35.45, 37.62):
 *   1. доля ошибок считает ОБОРВАННЫЕ соединения: k6 отдаёт им `status === 0`,
 *      и проверка «>= 400» показывала 0% при 16% обрывов;
 *   2. входа нет НИ НА ОДНОЙ итерации: главная гостевая, а вход — argon2id
 *      с ограничителем частоты, и замер превратился бы в замер ограничителя;
 *   3. пороги и число запросов НАЗВАНЫ ЗАРАНЕЕ, а не подогнаны под результат:
 *      порог, который нельзя нарушить, — отсутствие порога (35.45: 150 мс при
 *      измеренных 6,8). Ниже — почему каждый порог такой.
 *
 * ⚠️ Гоняется на стенде `npm run app:up` ПОСЛЕ пересборки образа с Э8: до неё витрины
 * нет, и `showcase` меряет старую главную. На боевом сервере не гоняется никогда.
 *
 * Запуск:
 *   k6 run load/k6-phase-38-home.js
 *   k6 run -e ONLY=stats -e VUS=40 -e DURATION=90s load/k6-phase-38-home.js
 *   k6 run -e API=http://127.0.0.1:3001 -e WEB=http://127.0.0.1:3000 load/k6-phase-38-home.js
 */
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const API = __ENV.API || 'http://localhost:3001';
const WEB = __ENV.WEB || 'http://localhost:3000';
const VUS = Number(__ENV.VUS || 40);
const DURATION = __ENV.DURATION || '2m';
const ONLY = __ENV.ONLY || '';

/** Размеры витрины — те же, что у страницы (шаг 38.32): шесть клубов, четыре тренера. */
const SHOWCASE_CLUBS = Number(__ENV.SHOWCASE_CLUBS || 6);
const SHOWCASE_TRAINERS = Number(__ENV.SHOWCASE_TRAINERS || 4);

/** Метрика на профиль: общий показатель усреднил бы `COUNT` с отрисовкой страницы. */
const statsLatency = new Trend('home_stats', true);
const showcaseLatency = new Trend('home_showcase', true);
const workingLatency = new Trend('home_working', true);
const pageLatency = new Trend('home_page', true);
const failures = new Rate('error_rate');
const failuresByStep = new Counter('failures_by_step');
/** Витрина отдала больше, чем просили, — `limit` перестал доезжать до запроса. */
const showcaseOverflow = new Counter('showcase_overflow');

const scenario = (exec, share = 1) => ({
  executor: 'constant-vus',
  vus: Math.max(1, Math.round(VUS * share)),
  duration: DURATION,
  exec,
  tags: { profile: exec },
});

/**
 * Доли — по жизни главной: счётчики и витрину спрашивает каждый заход, фильтрами
 * пользуется меньшинство, страницу целиком рисует фронт на каждый заход гостя.
 */
const allScenarios = {
  stats: scenario('stats', 0.3),
  showcase: scenario('showcase', 0.3),
  working: scenario('working', 0.15),
  page: scenario('page', 0.25),
};

const scenarios = ONLY === '' ? allScenarios : { [ONLY]: scenario(ONLY, 1) };

if (ONLY !== '' && allScenarios[ONLY] === undefined) {
  throw new Error(`ONLY=${ONLY}: такого профиля нет (stats, showcase, working, page)`);
}

/** Порог только у профиля, который гоняется: метрика без значений красит прогон ни за что. */
const runs = (name) => ONLY === '' || ONLY === name;

export const options = {
  scenarios,
  // Пороги названы ДО запуска и объяснены; подгонять их под результат нельзя.
  thresholds: {
    // Оборванные соединения — тоже отказы (урок 1), см. `track`.
    error_rate: ['rate<0.01'],
    // Число запросов: 40 VU × 2 минуты обязаны дать не меньше 5000 — меньше значит,
    // что стенд вставал, а не что он быстрый.
    http_reqs: ['count>5000'],
    // Четыре `COUNT` по индексам и один обход таблицы людей (38.30): «единицы
    // миллисекунд», порог кэширования назван у маршрута на ~50 запросов/с.
    // 50 мс — десятикратный запас к ожидаемому, регресс на порядок краснеет.
    ...(runs('stats') ? { home_stats: ['p(95)<50'] } : {}),
    // Витрина: пять ограниченных запросов по индексу `(status, rating DESC, review_count DESC)`.
    // Порог тот же класса, что у ящиков 35.45 и очереди 37.62 (150 мс): это запросы
    // каждого захода на главную, а не разовые.
    ...(runs('showcase') ? { home_showcase: ['p(95)<150'], showcase_overflow: ['count==0'] } : {}),
    // Рабочая часть: полный каталог плюс отбор подстрокой в памяти — действующее
    // ограничение Д-15. Порог мягче (600 мс) и НАЗВАН как цена долга: если он
    // не проходит на трёх сотнях публикаций — каталог в запрос переезжает раньше плана.
    ...(runs('working') ? { home_working: ['p(95)<600'] } : {}),
    // Страница целиком: тот же порог, что у кабинета спортсмена в профиле фазы 33
    // (1500 мс) — главная не вправе быть дороже кабинета.
    ...(runs('page') ? { home_page: ['p(95)<1500'] } : {}),
  },
};

/**
 * Учёт запроса: задержка в метрику профиля, отказ — в долю ошибок.
 *
 * ⚠️ `status === 0` — оборванное соединение, и это отказ (урок 1). Тот же учёт,
 * что в `load/k6-scenarios.js`; при следующей правке того файла обе копии
 * складываются в общий `load/k6-lib.js` — здесь дубль назван, а не спрятан.
 */
function track(trend, response, label) {
  trend.add(response.timings.duration);

  const failed = response.status === 0 || response.status >= 400;
  failures.add(failed);

  if (failed) failuresByStep.add(1, { step: label, status: String(response.status) });

  return response;
}

function body(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

/** Подтверждение формы конверта `{ success, data }` — иначе меряется скорость ошибки. */
function envelope(response, label) {
  const json = body(response);
  const ok = check(json, {
    [`${label}: { success: true, data }`]: (j) => j?.success === true && j.data !== undefined,
  });

  if (!ok) failuresByStep.add(1, { step: `${label}:envelope`, status: String(response.status) });

  return json;
}

/** Счётчики героя: четыре числа, все неотрицательные целые. */
export function stats() {
  const response = track(statsLatency, http.get(`${API}/api/stats/overview`), 'stats');
  const json = envelope(response, 'stats');
  const data = json?.data ?? {};

  check(data, {
    'stats: четыре целых счётчика': (d) =>
      ['athletes', 'trainers', 'clubs', 'reviews'].every(
        (key) => Number.isInteger(d[key]) && d[key] >= 0,
      ),
  });
}

/** Витрина главной — ровно те вызовы, что делает страница на сервере (38.32). */
export function showcase() {
  const calls = [
    {
      label: 'clubs-showcase',
      url: `/api/clubs?sort=rating&limit=${SHOWCASE_CLUBS}`,
      limit: SHOWCASE_CLUBS,
    },
    {
      label: 'trainers-showcase',
      url: `/api/trainers?sort=rating&limit=${SHOWCASE_TRAINERS}`,
      limit: SHOWCASE_TRAINERS,
    },
    { label: 'club-leader', url: '/api/clubs?sort=rating&limit=1', limit: 1 },
    { label: 'trainer-leader', url: '/api/trainers?sort=rating&limit=1', limit: 1 },
  ];

  for (const call of calls) {
    const response = track(showcaseLatency, http.get(`${API}${call.url}`), call.label);
    const json = envelope(response, call.label);
    const rows = Array.isArray(json?.data) ? json.data : [];

    // Больше, чем просили, — `limit` применился к списку в памяти или не применился вовсе.
    if (rows.length > call.limit) showcaseOverflow.add(1, { step: call.label });

    // Порядок по рейтингу — в запросе: первая строка не ниже второй.
    if (rows.length >= 2) {
      check(rows, {
        [`${call.label}: порядок по рейтингу убывающий`]: (r) => r[0].rating >= r[1].rating,
      });
    }
  }

  track(statsLatency, http.get(`${API}/api/stats/overview`), 'stats-in-showcase');
}

/** Виды спорта для отбора — читаются один раз на виртуального пользователя. */
let sportIds = [];

/**
 * Рабочая часть: выдача с фильтрами — вид спорта в запросе, поиск подстрокой в памяти.
 * Порог мягче витринного, и это записано у порога.
 */
export function working() {
  if (sportIds.length === 0) {
    const sports = body(track(workingLatency, http.get(`${API}/api/sports`), 'sports'));
    sportIds = (sports?.data ?? []).map((sport) => sport.id).filter((id) => Number.isInteger(id));
  }

  const sportId = sportIds.length === 0 ? 1 : sportIds[Math.floor(Math.random() * sportIds.length)];
  // Три буквы, которые есть почти в любом названии: отсев в памяти работает, а не даёт пустоту.
  const needle = ['клуб', 'фит', 'йог', 'бокс', 'зал'][Math.floor(Math.random() * 5)];

  envelope(
    track(workingLatency, http.get(`${API}/api/clubs?sportId=${sportId}`), 'clubs-by-sport'),
    'clubs-by-sport',
  );
  envelope(
    track(workingLatency, http.get(`${API}/api/trainers?sportId=${sportId}`), 'trainers-by-sport'),
    'trainers-by-sport',
  );
  envelope(
    track(
      workingLatency,
      http.get(`${API}/api/clubs?search=${encodeURIComponent(needle)}`),
      'clubs-search',
    ),
    'clubs-search',
  );
  envelope(track(workingLatency, http.get(`${API}/api/schedule`), 'schedule'), 'schedule');
}

/** Страница целиком у фронта — гость без cookie. */
export function page() {
  const response = track(
    pageLatency,
    http.get(`${WEB}/`, { headers: { Accept: 'text/html' } }),
    'page',
  );

  check(response, {
    'page: 200': (r) => r.status === 200,
    'page: есть H1': (r) => typeof r.body === 'string' && /<h1/.test(r.body),
    'page: не «Сервис временно недоступен»': (r) =>
      typeof r.body === 'string' && !r.body.includes('Сервис временно недоступен'),
  });
}
