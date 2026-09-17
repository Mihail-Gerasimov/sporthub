// Обвязка браузерного прогона чек-листа фазы 35 «Человек и лица услуг».
//
// ⚠️ Правило прогона (уроки Ф33 и Ф34, записаны в шапке самого чек-листа):
// шаг НЕ засчитывается по коду ответа. Каждая проверка смотрит в СОДЕРЖИМОЕ —
// что вернулось, что видно на экране, что записано в базу. `200` там, где ждали
// отказа, — это дефект, а не «почти прошло».
//
// ⚠️ Почему запросы идут ИЗ БРАУЗЕРА, а не через curl. Только так в запрос попадают
// настоящая cookie сессии, настоящий `Origin` и `Sec-Fetch-Site` — то есть ровно то,
// что проверяет защита. Урок фазы 34 в чистом виде: серверная логика была написана
// и покрыта, а вызова из браузера не было ни одного, и пять дефектов из пяти
// оказались именно на стыке.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const BASE = 'http://localhost:3000';
export const PASSWORD = 'sporthub123';
// ⚠️ Каталог снимков настраивается переменной окружения по той же причине, что и признак
// прогона в фикстуре: обвязкой пользуется не один чек-лист, и снимки падений разных
// прогонов не должны сваливаться в одну кучу с чужим именем фазы.
export const SHOTS =
  process.env.E2E_SHOTS_DIR || '/Users/misha/Desktop/prosport2.1/tests/screenshots/phase-35';

export const results = [];
let browser = null;

export async function launch() {
  fs.mkdirSync(SHOTS, { recursive: true });
  browser = await chromium.launch();
  return browser;
}

export async function shutdown() {
  if (browser) await browser.close();
}

/** Свежий браузерный контекст: без cookie предыдущих прогонов — так требует чек-лист. */
export async function freshContext() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

/** Запрос к API из браузера — с настоящей cookie и настоящими заголовками. */
export async function api(page, method, url, body, headers) {
  return page.evaluate(
    async ([m, u, b, h]) => {
      const response = await fetch(u, {
        method: m,
        headers: b ? { 'content-type': 'application/json', ...(h ?? {}) } : (h ?? {}),
        body: b ? JSON.stringify(b) : undefined,
      });

      const text = await response.text();
      let parsed = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }

      return { status: response.status, body: parsed, text: text.slice(0, 500) };
    },
    [method, url, body ?? null, headers ?? null],
  );
}

/**
 * Вход.
 *
 * ⚠️ Поля `accountType` больше нет — его убрал шаг 35.22. Служебный вход называется
 * признаком `portal: 'service'`, и он про КАБИНЕТ, а не про личность.
 */
export async function loginAs(page, email, { portal } = {}) {
  const response = await api(page, 'POST', '/api/auth/login', {
    email,
    password: PASSWORD,
    ...(portal ? { portal } : {}),
  });

  if (response.status !== 200) {
    throw new Error(`вход ${email} не прошёл: ${response.status} ${response.text}`);
  }

  return response.body?.data;
}

/** Кто я — вместе с лицами услуг. Список лиц едет тем же ответом. */
export async function whoAmI(page) {
  const response = await api(page, 'GET', '/api/auth/me');

  if (response.status !== 200) throw new Error(`«кто я» ответил ${response.status}`);

  return response.body?.data;
}

/**
 * Сырой ответ сервера по адресу — БЕЗ отрисовки.
 *
 * ⚠️ Нужен сценарию 9: «увели» и «данных не отдали» — разные утверждения, и второе
 * проверяется только в исходном потоке ответа. Отрисованный экран о нём не говорит
 * ничего: данные могли уехать и просто не быть показаны.
 */
export async function rawResponse(page, url) {
  return page.evaluate(async (target) => {
    const response = await fetch(target, { redirect: 'manual' });
    const text = await response.text();

    return { status: response.status, type: response.type, body: text };
  }, url);
}

/** Записать результат шага. Скриншот снимается ТОЛЬКО на падении. */
export async function step(id, title, fn, page) {
  const started = Date.now();

  try {
    const detail = await fn();
    results.push({ id, title, status: 'pass', detail: detail ?? '', ms: Date.now() - started });
    console.log(`  ✅ ${id} — ${detail ?? ''}`);
  } catch (error) {
    let shot = '';

    if (page) {
      shot = path.join(SHOTS, `${id}-FAIL.png`);
      try {
        await page.screenshot({ path: shot, fullPage: false });
      } catch {
        shot = '';
      }
    }

    results.push({
      id,
      title,
      status: 'fail',
      detail: String(error.message ?? error),
      shot,
      ms: Date.now() - started,
    });
    console.log(`  ❌ ${id} — ${error.message ?? error}`);
  }
}

/** Шаг, который прогнать нельзя, и это надо назвать вслух, а не замолчать. */
export function skip(id, title, reason) {
  results.push({ id, title, status: 'skip', detail: reason });
  console.log(`  ⏭️  ${id} — ${reason}`);
}

export function must(condition, message) {
  if (!condition) throw new Error(message);
}

export function mustEqual(actual, expected, what) {
  if (actual !== expected) {
    throw new Error(
      `${what}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`,
    );
  }
}

/** Дата через N дней — слоты чек-листа обязаны быть будущими. */
export function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Ключ лица — им сравниваются наборы лиц человека. */
export const faceKey = (face) => `${face.kind}:${face.id}`;
