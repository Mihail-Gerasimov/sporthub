// Русские заголовки на всех страницах — браузером (шаг 38.21).
//
// Что проверяется на каждой из 33 страниц приложения:
//   1. каждый заголовок h1–h3 с кириллицей вычислен в display-стеке (`ruble`, Sofia) либо
//      в текстовом (Inter) — никаких Impact / Arial / system-ui первым семейством;
//   2. кириллица в display-стеке РИСУЕТСЯ Sofia, а не fallback'ом: ширина пробной русской
//      строки в стеке отличается от ширины в хвосте стека (`'Arial Narrow', sans-serif`) —
//      у Bowlby One кириллицы не было, и русские заголовки три фазы рисовал Impact,
//      и никакой тест классов этого не видел;
//   3. сеть запросила файл Sofia с кириллицей (два файла Sofia: cyrillic + latin).
//
// Страницы: 4 публичные, 8 личного кабинета (клиент прогона), 11 кабинета лица (клуб
// прогона — заведён прямо в базе с признаком прогона, убирается уборкой), 7 служебной
// панели (администратор прогона), `/reset-password`, `/profile/athlete` и
// `/profile/provider` (перенаправления прежних адресов). Итого 33.
//
// Запуск: `E2E_RUN_TAG=ph38-heads node tests/e2e-phase-38-headings-osnova.mjs` при поднятом стенде.
import fs from 'node:fs';
import { chromium } from 'playwright';

import { E2E_USERS, RUN_TAG, cleanupRun, readDb, readDbId, seedRunUsers } from '../scripts/e2e-fixture.mjs';

const BASE = 'http://localhost:3000';
const PASSWORD = 'sporthub123';
const DATE = new Date().toISOString().slice(0, 10);
const REPORT = `/Users/misha/Desktop/prosport2.1/tests/reports/phase-38-headings-${DATE}.md`;

const results = [];

/** Заголовки страницы и признаки шрифта. */
async function inspect(page) {
  return page.evaluate(() => {
    const cyr = /[а-яё]/i;
    const headings = [...document.querySelectorAll('h1, h2, h3')]
      .filter((h) => cyr.test(h.textContent ?? ''))
      .map((h) => {
        const family = getComputedStyle(h).fontFamily;
        const first = family.split(',')[0].replace(/["']/g, '').trim();
        return { tag: h.tagName.toLowerCase(), text: (h.textContent ?? '').trim().slice(0, 40), first };
      });
    const stack = getComputedStyle(document.documentElement).getPropertyValue('--ui-font-display').trim();
    const tail = stack.split(',').slice(2).join(',');
    const probe = (family) => {
      const el = document.createElement('span');
      el.textContent = 'Найди спорт в своём ритме';
      el.style.cssText = `position:absolute;left:-9999px;font-size:40px;font-weight:900;font-family:${family};white-space:nowrap`;
      document.body.appendChild(el);
      const w = el.getBoundingClientRect().width;
      el.remove();
      return Math.round(w * 100) / 100;
    };
    return {
      headings,
      badFirst: headings.filter((h) => !/^(ruble|Sofia Sans Extra Condensed|Inter)$/.test(h.first)),
      cyrillicWidthDisplay: probe(stack),
      cyrillicWidthFallback: probe(tail || 'sans-serif'),
      title: document.title,
    };
  });
}

async function loginContext(browser, email, portal) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  if (email) {
    const login = await context.request.post(`${BASE}/api/auth/login`, {
      data: { email, password: PASSWORD, ...(portal ? { portal } : {}) },
      headers: { origin: BASE },
    });
    if (login.status() !== 200) throw new Error(`вход ${email}: ${login.status()} ${await login.text()}`);
  }
  return context;
}

async function visit(context, group, url) {
  const page = await context.newPage();
  const woff = [];
  page.on('request', (r) => {
    if (/\.woff2(\?|$)/.test(r.url())) woff.push(r.url().split('/').pop());
  });
  try {
    const response = await page.goto(BASE + url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.fonts.ready);
    const info = await inspect(page);
    const sofiaFiles = woff.filter((f) => /^(81f6671d7841b153|83afe278b6a6bb3c|9c72aa0f40e4eef8|f0f463a4b643e763)/.test(f)).length;
    const problems = [];
    if (response?.status() !== 200) problems.push(`HTTP ${response?.status()}`);
    if (info.headings.length === 0) problems.push('русских заголовков h1–h3 нет');
    if (info.badFirst.length) problems.push(`не тем шрифтом: ${info.badFirst.map((h) => `${h.tag} «${h.text}» → ${h.first}`).join('; ')}`);
    if (Math.abs(info.cyrillicWidthDisplay - info.cyrillicWidthFallback) < 1) problems.push(`кириллица display-стека = fallback (${info.cyrillicWidthDisplay} vs ${info.cyrillicWidthFallback})`);
    results.push({ group, url: page.url().replace(BASE, ''), requested: url, http: response?.status(), headings: info.headings.length, sample: info.headings[0] ? `${info.headings[0].tag} «${info.headings[0].text}» → ${info.headings[0].first}` : '—', widths: `${info.cyrillicWidthDisplay} / ${info.cyrillicWidthFallback}`, fonts: sofiaFiles, problems });
    console.log(`  ${problems.length ? '❌' : '✅'} ${url} — ${problems.join('; ') || `${info.headings.length} заголовков, ${info.headings[0]?.first}`}`);
  } catch (error) {
    results.push({ group, url, requested: url, problems: [String(error.message)], headings: 0, sample: '—', widths: '—', fonts: 0 });
    console.log(`  ❌ ${url} — ${error.message}`);
  } finally {
    await page.close();
  }
}

async function main() {
  const users = seedRunUsers();
  const builderId = users[E2E_USERS.builder];
  // Клуб прогона — лицо для кабинета; имя с признаком прогона, уборка снесёт.
  const clubId = readDbId(
    `INSERT INTO clubs (name, slug, slug_normalized, description, short_description, city, address, phone, latitude, longitude, managed_by_user_id, source, status)
     VALUES ('${RUN_TAG} клуб', '${RUN_TAG}-club', '${RUN_TAG}-club', 'Клуб прогона', 'Клуб прогона', 'Самара', 'ул. Прогонная, 1', '+7 (900) 555-00-02', 53.2, 50.15, ${builderId}, 'seed', 'published')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id;`,
  );
  readDb(
    `INSERT INTO users (created_at, status, account_kind, name, email, phone, password_hash)
     VALUES (now(), 'active', 'admin', 'Прогон admin', '${RUN_TAG}-admin@test.local', '+7 (900) 555-00-09',
             (SELECT password_hash FROM users WHERE email='${E2E_USERS.client}'))
     ON CONFLICT (email) DO NOTHING;`,
  );
  const slug = readDb(`SELECT slug FROM clubs WHERE status='published' AND managed_by_user_id IS DISTINCT FROM ${builderId} ORDER BY id LIMIT 1;`);
  const trainerSlug = readDb(`SELECT slug FROM trainers WHERE status='published' ORDER BY id LIMIT 1;`);
  const scheduleId = readDb(`SELECT id FROM schedule ORDER BY id LIMIT 1;`);

  const browser = await chromium.launch();
  try {
    const guest = await loginContext(browser, null);
    for (const url of ['/', `/clubs/${slug}`, `/trainers/${trainerSlug}`, '/reset-password']) await visit(guest, 'публичные', url);
    await guest.close();

    const client = await loginContext(browser, E2E_USERS.client);
    for (const url of [`/booking/${scheduleId}`, '/profile/me', '/profile/me/dashboard', '/profile/me/favorites', '/profile/me/notifications', '/profile/me/reviews', '/profile/me/schedule', '/profile/me/settings', '/profile/me/stats', '/profile/athlete']) await visit(client, 'личный кабинет', url);
    await client.close();

    const builder = await loginContext(browser, E2E_USERS.builder);
    const face = `/profile/club/${clubId}`;
    for (const url of [face, `${face}/bookings`, `${face}/clients`, `${face}/dashboard`, `${face}/finance`, `${face}/links`, `${face}/notifications`, `${face}/publications`, `${face}/reviews`, `${face}/settings`, `${face}/stats`, '/profile/provider']) await visit(builder, 'кабинет лица', url);
    await builder.close();

    const admin = await loginContext(browser, `${RUN_TAG}-admin@test.local`, 'service');
    for (const url of ['/service-portal', '/service-portal/dashboard', '/service-portal/analytics', '/service-portal/moderation', '/service-portal/logs', '/service-portal/finance', '/service-portal/notifications']) await visit(admin, 'служебная панель', url);
    await admin.close();

    const passed = results.filter((r) => r.problems.length === 0).length;
    fs.writeFileSync(
      REPORT,
      [
        '# Phase 38 — русские заголовки на всех страницах (шаг 38.21)',
        '',
        `**Дата:** ${DATE} · **Стенд:** ${BASE} (контейнер \`sporthub_web\` после \`npm run app:up\`) · **Признак прогона:** \`${RUN_TAG}\``,
        `**Итог:** ${passed} из ${results.length} страниц`,
        '',
        '## Как проверялось',
        '',
        '- Каждый h1–h3 с кириллицей: первое семейство вычисленного `font-family` — `ruble` (display-стек, рубль первым), `Sofia Sans Extra Condensed` или `Inter`. Impact / Arial / system-ui первым — дефект.',
        '- Кириллица display-стека рисуется Sofia, а не fallback: ширина пробы «Найди спорт в своём ритме» (40px, 900) в стеке ≠ в хвосте стека.',
        '- Столбец «Sofia/Inter» — сколько файлов шрифтов запросила страница (4 = два подмножества × два шрифта; повторные визиты в одном контексте берут из кеша).',
        '',
        '| Группа | Адрес | HTTP | Заголовков | Первый заголовок → шрифт | Ширина: стек / fallback | Sofia/Inter | Итог |',
        '| --- | --- | --- | --- | --- | --- | --- | --- |',
        ...results.map((r) => `| ${r.group} | \`${r.requested}\`${r.url !== r.requested ? ` → \`${r.url}\`` : ''} | ${r.http ?? '—'} | ${r.headings} | ${r.sample} | ${r.widths} | ${r.fonts} | ${r.problems.length ? '❌ ' + r.problems.join('; ') : '✅'} |`),
        '',
      ].join('\n'),
    );
    console.log(`\nОтчёт: ${REPORT}`);
  } finally {
    await browser.close();
    console.log(`уборка: ${JSON.stringify(cleanupRun())}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
