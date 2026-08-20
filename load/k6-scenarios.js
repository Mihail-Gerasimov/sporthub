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

const raceScenario = {
  // Проверка не скорости, а корректности: десять запросов на одно свободное место.
  race: { executor: 'per-vu-iterations', vus: 10, iterations: 1, exec: 'race' },
};

export const options = {
  scenarios: ONLY === 'race' ? raceScenario : { ...profileScenarios, ...raceScenario },
  // Пороги — не «красиво», а «дальше начинается разговор про железо».
  thresholds: {
    error_rate: ['rate<0.01'],
    profile_athlete: ['p(95)<1500'],
    profile_provider: ['p(95)<2000'],
    profile_admin: ['p(95)<3000'],
    // Ровно один успех на десять одновременных запросов к слоту с одним местом.
    race_won: ['count==1'],
    race_unexpected: ['count==0'],
  },
};

const JSON_HEADERS = { headers: { 'Content-Type': 'application/json' } };

function track(trend, response, label) {
  trend.add(response.timings.duration);

  const failed = response.status >= 400;
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
    JSON.stringify({
      scheduleId,
      userId: Number(__ENV.RACE_USER_ID || 1) + __VU,
    }),
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
    'ответ либо успешный, либо «мест нет»': () => response.status < 400 || text.includes('Свободных мест нет'),
  });
}
