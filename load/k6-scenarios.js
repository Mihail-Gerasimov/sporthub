/**
 * Нагрузочный замер фазы 33 — три профиля ОДНОВРЕМЕННО плюс отдельная проверка гонки.
 *
 * Поодиночке профили меряют не то. Смысл замера не в том, выдержит ли отдельный запрос,
 * а в том, ЧТО упрётся первым, когда атлеты листают каталог, провайдер разбирает заявки,
 * а админ смотрит сводку — всё это в одну и ту же минуту.
 *
 * Рамки объявлены заранее, чтобы замер был приёмочным шагом, а не бессрочным исследованием.
 *
 * ⚠️ На боевом сервере НЕ ГОНЯЕТСЯ НИКОГДА: замер создаёт настоящие записи и меняет статусы.
 *
 * Запуск:
 *   k6 run load/k6-scenarios.js
 *   k6 run -e VUS=100 -e DURATION=3m -e API=http://127.0.0.1:3001 load/k6-scenarios.js
 *   k6 run -e ONLY=race load/k6-scenarios.js      # только проверка гонки за последним местом
 */
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const API = __ENV.API || 'http://localhost:3001';
const VUS = Number(__ENV.VUS || 40);
const DURATION = __ENV.DURATION || '2m';
const ONLY = __ENV.ONLY || '';

/**
 * Отдельная метрика на профиль.
 *
 * Общий показатель усреднил бы дешёвое чтение справочника с дорогой сводкой админа
 * и скрыл бы, что именно тормозит. Имена только латиницей — других k6 не принимает.
 */
const athleteLatency = new Trend('profile_athlete', true);
const providerLatency = new Trend('profile_provider', true);
const adminLatency = new Trend('profile_admin', true);
const mailboxLatency = new Trend('profile_mailbox', true);
const failures = new Rate('error_rate');
const failuresByStep = new Counter('failures_by_step');

/** Гонка за последним местом: сколько попыток удалось и сколько отбито. */
const raceWon = new Counter('race_won');
const raceRejected = new Counter('race_rejected');
const raceUnexpected = new Counter('race_unexpected');

const profileScenarios = {
  // Доли отражают жизнь: атлетов много, провайдер один, админ заходит изредка.
  athlete: {
    executor: 'constant-vus',
    vus: Math.max(1, Math.round(VUS * 0.8)),
    duration: DURATION,
    exec: 'athlete',
  },
  provider: {
    executor: 'constant-vus',
    vus: Math.max(1, Math.round(VUS * 0.15)),
    duration: DURATION,
    exec: 'provider',
  },
  admin: {
    executor: 'constant-vus',
    vus: Math.max(1, Math.round(VUS * 0.05)),
    duration: DURATION,
    exec: 'admin',
  },
};

// Участники гонки — существующие атлеты. Номера задаются списком, а не диапазоном:
// роли в базе идут вперемешку, и «плюс номер виртуального пользователя» попадал бы
// в провайдера или в несуществующую строку, то есть мерил бы не то.
const RACE_USER_IDS = (__ENV.RACE_USER_IDS || '1,6,7,8')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isInteger(value) && value > 0);

/**
 * Профиль входа (фаза 34).
 *
 * ⚠️ Меряется отдельно, а не внутри обычной нагрузки, и вот почему. Проверка пароля
 * argon2id берёт 19 МБ памяти НА КАЖДУЮ параллельную проверку — это защита, и ослаблять
 * её нельзя. Значит всплеск входов упирается не в процессор, а в память, и упирается
 * иначе, чем всё остальное: смешав вход с каталогом, мы получили бы среднее по больнице
 * и не увидели бы момент, когда очередь проверок начинает расти.
 *
 * Ожидаемое поведение: пропускная способность ограничена очередью проверок паролей,
 * лишние ждут, память не растёт бесконечно, отказов нет.
 */
const loginScenario = {
  login: {
    executor: 'constant-vus',
    vus: Math.max(1, Number(__ENV.LOGIN_VUS || 20)),
    duration: __ENV.LOGIN_DURATION || '30s',
    exec: 'login',
  },
};

const raceScenario = {
  // Проверка не скорости, а корректности: все участники бьются за одно место.
  race: {
    executor: 'per-vu-iterations',
    vus: RACE_USER_IDS.length,
    iterations: 1,
    exec: 'race',
  },
};

/**
 * Что гоняем.
 *
 * По умолчанию — всё сразу. `ONLY=race` — только проверка гонки, `ONLY=profiles` — только
 * профили. Разделение нужно потому, что гонке требуется подготовленный слот с ОДНИМ
 * свободным местом: без него она не может ни выиграть, ни проиграть, и её порог падал бы,
 * утягивая за собой весь прогон профилей.
 */
/**
 * Ящик лица и список лиц (шаг 35.45).
 *
 * Отдельным профилем, потому что мерить надо не «страницу вообще», а два запроса,
 * которые фаза 35 сделала горячими: ответ «кто я» теперь возит лица человека,
 * а лента спрашивается по каждому лицу отдельно. Оба ходят на КАЖДОЙ странице
 * кабинета — если они дороги, дорого станет всё.
 */
const mailboxScenario = {
  mailbox: {
    executor: 'constant-vus',
    vus: VUS,
    duration: DURATION,
    exec: 'mailbox',
    tags: { profile: 'mailbox' },
  },
};

const scenarios =
  ONLY === 'race'
    ? raceScenario
    : ONLY === 'login'
      ? loginScenario
      : ONLY === 'mailbox'
        ? mailboxScenario
        : ONLY === 'profiles'
          ? profileScenarios
          : { ...profileScenarios, ...raceScenario, ...mailboxScenario };

export const options = {
  scenarios,
  // Пороги — не «красиво», а «дальше начинается разговор про железо».
  thresholds: {
    error_rate: ['rate<0.01'],
    profile_athlete: ['p(95)<1500'],
    profile_provider: ['p(95)<2000'],
    profile_admin: ['p(95)<3000'],
    // Лента лица, личный ящик и список лиц (фаза 35). Порог жёстче кабинетных:
    // это те запросы, которые ходят на КАЖДОЙ странице кабинета, а не раз за сессию.
    //
    // ⚠️ 150 мс, а не 800. Замер шага 35.45 дал p(95) = 6.8 мс на пределе стенда,
    // и порог в 800 мс не поймал бы даже стократное ухудшение — то есть не поймал
    // бы ничего. Порог, который невозможно нарушить, — это отсутствие порога.
    // Двадцатикратный запас к измеренному оставлен намеренно: он покрывает разброс
    // машин, но регресс на порядок краснеет.
    ...(ONLY === 'mailbox' || ONLY === '' ? { profile_mailbox: ['p(95)<150'] } : {}),
    // Ровно один успех на все одновременные запросы к слоту с одним местом.
    //
    // ⚠️ Порог объявляется, только когда гонка ДЕЙСТВИТЕЛЬНО гоняется. Прежнее
    // условие («всё, кроме profiles») навешивало его и на профиль ящиков, где гонки
    // нет вовсе, — прогон неизбежно заканчивался «порог не выполнен» на метрике,
    // которая не могла набрать ни одного значения. Красный по причине, не имеющей
    // отношения к замеру, обесценивает сам замер: на него перестают смотреть.
    ...(ONLY === 'race' || ONLY === ''
      ? { race_won: ['count==1'], race_unexpected: ['count==0'] }
      : {}),
  },
};

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

function track(trend, response, label) {
  trend.add(response.timings.duration);

  // ⚠️ Отказ соединения — тоже отказ. k6 отдаёт таким ответам `status === 0`,
  // и проверка «>= 400» их пропускала: доля ошибок показывала 0.00% при 16%
  // оборванных запросов в сводке HTTP. Замер выглядел безупречным ровно там,
  // где сервер переставал отвечать.
  const failed = response.status === 0 || response.status >= 400;
  failures.add(failed);

  // Метка на каждый запрос: без неё «5% ошибок» не отвечает на вопрос, ЧТО падает.
  if (failed && label) {
    failuresByStep.add(1, { step: label, status: String(response.status) });
  }

  return response;
}

function body(response) {
  try {
    return response.json();
  } catch {
    return null;
  }
}

/** Атлет: смотрит каталог, открывает карточку, читает своё расписание. */
/**
 * Подготовка прогона: один вход на весь тест.
 *
 * ⚠️ Почему в `setup`, а не в теле профиля. Нагрузка на ящики — про ЧТЕНИЕ, а вход
 * стоит дорого по построению (argon2id) и ограничен по частоте: 5 попыток на пару
 * «адрес + почта», дальше нарастающая блокировка. Сорок виртуальных пользователей,
 * входящих одновременно с одного адреса, упираются в ограничитель — и замер
 * превращается в замер ограничителя. В жизни человек уже вошёл и просто ходит
 * по кабинету; `setup` это и воспроизводит.
 *
 * ⚠️ Cookie передаётся ЗАГОЛОВКОМ. Приложение ставит `__Host-sh-session` с признаком
 * `Secure`, а нагрузка идёт по HTTP — хранилище k6 такую cookie отбрасывает молча.
 * Из-за этого «кто я» отвечал 401, лиц приезжало ноль, цикл по ящикам не выполнялся
 * НИ РАЗУ, а профиль оставался зелёным: проверка смотрела `Array.isArray(faces)`,
 * а пустой массив — тоже массив.
 */
export function setup() {
  if (ONLY !== 'mailbox') return {};

  const email = __ENV.MAILBOX_EMAIL || 'both@sporthub.local';
  const password = __ENV.LOGIN_PASSWORD || 'sporthub123';
  const login = http.post(
    `${API}/api/auth/login`,
    JSON.stringify({ email, password }),
    JSON_HEADERS,
  );

  if (login.status !== 200) {
    throw new Error(`нагрузка на ящики: вход ${email} ответил ${login.status}`);
  }

  const raw = String(login.headers['Set-Cookie'] || login.headers['set-cookie'] || '');
  const match = raw.match(/(__Host-sh-session|sh-session)=([^;]+)/);

  if (match === null) throw new Error('нагрузка на ящики: сервер не выдал cookie сессии');

  return { cookie: `${match[1]}=${match[2]}` };
}

export function athlete() {
  track(athleteLatency, http.get(`${API}/api/sports`), 'sports');

  const clubs = track(athleteLatency, http.get(`${API}/api/clubs`), 'clubs');
  const list = body(clubs)?.data ?? [];

  if (list.length > 0) {
    const club = list[Math.floor(Math.random() * list.length)];
    track(athleteLatency, http.get(`${API}/api/clubs/${club.id}`), 'club-detail');
  }

  track(athleteLatency, http.get(`${API}/api/schedule`), 'schedule');
  // Суженный запрос: именно ради него в фазе появились фильтры выдачи записей.
  track(athleteLatency, http.get(`${API}/api/bookings?userId=1`), 'my-bookings');
  track(athleteLatency, http.get(`${API}/api/notifications?userId=1`), 'notifications');
}

/** Провайдер: кабинет, заявки, связи, заметки о клиентах. */
export function provider() {
  track(providerLatency, http.get(`${API}/api/publications`), 'publications');
  track(providerLatency, http.get(`${API}/api/bookings?scope=all`), 'bookings-all');
  track(providerLatency, http.get(`${API}/api/trainer-club-links`), 'links');
  track(providerLatency, http.get(`${API}/api/provider-client-notes?scope=all`), 'notes');
}

/** Админ: сводка и журнал — два самых дорогих чтения на платформе. */
export function admin() {
  track(adminLatency, http.get(`${API}/api/analytics`), 'analytics');
  track(adminLatency, http.get(`${API}/api/logs?limit=50`), 'logs');
  track(adminLatency, http.get(`${API}/api/clubs?sort=reliability`), 'clubs-by-reliability');
}

/**
 * Гонка за последним местом.
 *
 * Номер слота и атлета задаются снаружи: набор данных у каждого прогона свой.
 * Проверяется единственная вещь — ровно один запрос обязан пройти, остальные
 * получить «Свободных мест нет». Два успеха означают овербукинг, ноль —
 * что слот был занят ещё до замера.
 */
export function race() {
  const scheduleId = Number(__ENV.RACE_SCHEDULE_ID || 0);

  if (!scheduleId) return;

  const response = http.post(
    `${API}/api/bookings`,
    JSON.stringify({ scheduleId, userId: RACE_USER_IDS[(__VU - 1) % RACE_USER_IDS.length] }),
    JSON_HEADERS,
  );

  const text = body(response)?.error ?? '';

  if (response.status < 400) {
    raceWon.add(1);
  } else if (text.includes('Свободных мест нет')) {
    raceRejected.add(1);
  } else {
    // Любой другой отказ — это не «мест нет», а поломка, и её надо видеть отдельно.
    raceUnexpected.add(1);
  }

  check(response, {
    'ответ либо успешный, либо «мест нет»': () =>
      response.status < 400 || text.includes('Свободных мест нет'),
  });
}

/**
 * Вход: сверка пароля argon2id под нагрузкой.
 *
 * Пароль намеренно ВЕРНЫЙ: неверный отбивался бы ограничением частоты после пятой
 * попытки, и замер превратился бы в проверку блокировки, а не хеширования.
 *
 * Гоняется отдельно: `k6 run -e ONLY=login load/k6-scenarios.js`
 */
export function login() {
  const email = __ENV.LOGIN_EMAIL || 'athlete@sporthub.local';
  const password = __ENV.LOGIN_PASSWORD || 'sporthub123';

  const response = http.post(
    `${API}/api/auth/login`,
    // ⚠️ Фаза 35: типа учётной записи в теле входа больше нет. Служебный вход
    // отделён признаком `portal: 'service'`, обычный — его отсутствием.
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { profile: 'login' } },
  );

  check(response, {
    'вход отвечает успехом': (r) => r.status === 200,
    'сессия выдана': (r) => String(r.headers['Set-Cookie'] || '').includes('sh-session'),
  });
}

/**
 * Ящик лица: вход, список лиц, лента каждого лица и личная лента.
 *
 * Порядок повторяет живой: человек открывает кабинет, кабинет спрашивает «кто я»
 * и получает лица, затем берёт ленту текущего лица. Меряется вся цепочка, потому
 * что дорогой может оказаться любая её часть, а страница ждёт всю.
 */
/**
 * Кабинет лица: три запроса, ровно как их делает открытие страницы.
 *
 * ⚠️ Первая редакция обходила ВСЕ лица человека за итерацию. На живой базе
 * у испытуемого их двадцать — получалось двадцать один запрос на итерацию, чего
 * в жизни не бывает: кабинет открыт у ОДНОГО лица и спрашивает ОДИН ящик.
 * Замер при этом упирался в отказы соединения (четверть запросов, `max` до пяти
 * секунд) и мерил не отзывчивость ящика, а предел стенда.
 *
 * Три запроса — это и есть то, что названо в шаге 35.45: список лиц («кто я»),
 * лента по лицу и личный ящик.
 */
export function mailbox(data) {
  const auth = { headers: { Cookie: data.cookie }, tags: { profile: 'mailbox' } };
  const me = track(mailboxLatency, http.get(`${API}/api/auth/me`, auth), 'mailbox:me');
  const faces = body(me)?.data?.faces ?? [];

  check(me, {
    // ⚠️ Проверяется НЕПУСТОТА, а не тип. Пустой список означает, что запрос ниже
    // не выполнится и профиль ничего не измерит, оставшись зелёным.
    'лица приезжают ответом «кто я»': () => Array.isArray(faces) && faces.length > 0,
  });

  if (faces.length > 0) {
    // Лицо выбирается по номеру итерации, а не первое: иначе весь прогон читал бы
    // один и тот же ящик, и попадание в кеш выдало бы себя за отзывчивость.
    const face = faces[__ITER % faces.length];
    const key = face.kind === 'club' ? 'clubId' : 'trainerId';

    track(
      mailboxLatency,
      http.get(`${API}/api/notifications?${key}=${face.id}`, auth),
      `mailbox:${face.kind}`,
    );
  }

  // Личный ящик: он есть у всех, в том числе у человека без лиц.
  track(
    mailboxLatency,
    http.get(`${API}/api/notifications?scope=personal`, auth),
    'mailbox:personal',
  );
}
