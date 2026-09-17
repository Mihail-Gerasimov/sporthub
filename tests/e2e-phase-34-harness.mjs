// Обвязка браузерного прогона чек-листа фазы 34.
//
// Правило прогона (урок фазы 33, записан в шапке самого чек-листа): шаг НЕ засчитывается
// по коду ответа. Каждая проверка смотрит в содержимое — что вернулось, что видно
// на экране, что записано в журнал.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

export const BASE = 'http://localhost:3000';
export const PASSWORD = 'sporthub123';
export const SHOTS = '/Users/misha/Desktop/prosport2.1/tests/screenshots/phase-34';

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

/**
 * Запрос к API ИЗ БРАУЗЕРА. Именно из браузера, а не через curl: только так в запрос
 * попадают настоящая cookie сессии, настоящий `Origin` и настоящий `Sec-Fetch-Site` —
 * то есть ровно то, что фаза 34 и проверяет.
 */
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

      return { status: response.status, body: parsed, text: text.slice(0, 400) };
    },
    [method, url, body ?? null, headers ?? null],
  );
}

/** Вход через API — по правилу скила: UI-форму в чек-листах не проходим, кроме шагов про саму форму. */
export async function loginAs(page, email, accountType) {
  const response = await api(page, 'POST', '/api/auth/login', {
    email,
    password: PASSWORD,
    ...(accountType ? { accountType } : {}),
  });

  if (response.status !== 200) {
    throw new Error(`вход ${email} не прошёл: ${response.status} ${response.text}`);
  }

  return response.body?.data;
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
      shot = path.join(SHOTS, `step-${id}-FAIL.png`);
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
    throw new Error(`${what}: ожидалось ${JSON.stringify(expected)}, получено ${JSON.stringify(actual)}`);
  }
}

/** Дата через N дней в формате YYYY-MM-DD — слоты чек-листа обязаны быть будущими. */
export function futureDate(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}
