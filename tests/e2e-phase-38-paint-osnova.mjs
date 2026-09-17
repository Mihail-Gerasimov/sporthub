// Браузерный проход после покраски (шаг 38.15): шесть страниц разных групп.
//
// Что проверяется — не «похоже ли», а числами: на каждой странице собираются
// вычисленные цвета ВСЕХ элементов (text, background, border) и сверяются с прежней
// палитрой. Ни один цвет фазы 31 (mint `#83d3b5`, navy `#0a1029`, mist `#d2d8d6`,
// graphite `#7a8186`, старые orange/red/gold) не должен остаться — это и есть «пятно»:
// место, покрашенное мимо токенов. Плюс ключевые значения: фон страницы, фон шапки,
// цвет текста, тень primary-кнопки.
//
// ⚠️ Стенд — контейнер `sporthub_web` после `npm run app:up`; новизна образа проверена
// по содержимому CSS-бандла в контейнере (`--ui-lime:#7ed900` есть, `rgba(131,` нет),
// а не по времени запуска.
//
// Запуск: `E2E_RUN_TAG=ph38-paint node tests/e2e-phase-38-paint-osnova.mjs` при поднятом стенде.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

import { E2E_USERS, RUN_TAG, cleanupRun, readDb, seedRunUsers } from '../scripts/e2e-fixture.mjs';

const BASE = 'http://localhost:3000';
const PASSWORD = 'sporthub123';
const SHOTS = '/Users/misha/Desktop/prosport2.1/tests/screenshots/phase-38-paint';
const DATE = new Date().toISOString().slice(0, 10);
const REPORT = `/Users/misha/Desktop/prosport2.1/tests/reports/phase-38-paint-${DATE}.md`;

/** Прежняя палитра (фаза 31) — в форме `rgb(r, g, b)`, как отдаёт getComputedStyle. */
const OLD_PALETTE = {
  'mint #83d3b5': 'rgb(131, 211, 181)',
  'mint-hov #50bc93': 'rgb(80, 188, 147)',
  'mint-soft #bfdfd2': 'rgb(191, 223, 210)',
  'navy #0a1029': 'rgb(10, 16, 41)',
  'mist #d2d8d6': 'rgb(210, 216, 214)',
  'graphite #7a8186': 'rgb(122, 129, 134)',
  'grey #bcbcbc': 'rgb(188, 188, 188)',
  'orange #fb6119': 'rgb(251, 97, 25)',
  'orange-hov #ff7a3d': 'rgb(255, 122, 61)',
  'red #e74c3c': 'rgb(231, 76, 60)',
  'gold #f5c518': 'rgb(245, 197, 24)',
};

/** Новая палитра — то, что обязано быть на месте. */
const NEW = {
  bg: 'rgb(244, 246, 249)',
  ink: 'rgb(17, 17, 17)',
  lime: 'rgb(126, 217, 0)',
  plate: 'rgb(17, 17, 17)',
};

const results = [];

/** Вход через API из браузера; служебная панель требует признак `portal: 'service'`. */
function apiLogin(page, email, portal) {
  return page.evaluate(
    async ([e, p, portalKind]) => {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: e, password: p, ...(portalKind ? { portal: portalKind } : {}) }),
      });
      return response.status;
    },
    [email, PASSWORD, portal ?? null],
  );
}

/** Сбор вычисленных цветов всех элементов страницы и ключевых значений. */
async function inspect(page) {
  return page.evaluate((old) => {
    const seen = new Map();
    const oldHits = [];
    const props = ['color', 'backgroundColor', 'borderTopColor', 'outlineColor', 'fill', 'stroke'];

    for (const el of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(el);
      for (const prop of props) {
        const value = cs[prop];
        if (!value || value === 'rgba(0, 0, 0, 0)' || value === 'none') continue;
        const key = `${prop}:${value}`;
        seen.set(key, (seen.get(key) ?? 0) + 1);
        for (const [name, rgb] of Object.entries(old)) {
          // rgba(131, 211, 181, 0.3) начинается с той же тройки — тоже пятно.
          if (value.startsWith(rgb.slice(0, -1))) {
            oldHits.push(`${name} — ${prop} у <${el.tagName.toLowerCase()} class="${el.className?.toString().slice(0, 60)}">`);
          }
        }
      }
      // Инлайновый style с hex — тоже пятно (кроме карты: маркеры рисуются строкой из токенов).
      const inline = el.getAttribute('style') ?? '';
      if (/#[0-9a-f]{3,8}\b/i.test(inline)) oldHits.push(`inline hex у <${el.tagName.toLowerCase()}>: ${inline.slice(0, 80)}`);
    }

    const bodyCs = getComputedStyle(document.body);
    const header = document.querySelector('header');
    const primary = document.querySelector('button.shadow-glow, a.shadow-glow');
    const h1 = document.querySelector('h1');

    return {
      distinctColors: seen.size,
      elements: document.querySelectorAll('body *').length,
      oldHits: [...new Set(oldHits)].slice(0, 20),
      oldHitCount: oldHits.length,
      bodyBg: bodyCs.backgroundColor,
      bodyColor: bodyCs.color,
      bodyBgImage: bodyCs.backgroundImage.slice(0, 120),
      headerBg: header ? getComputedStyle(header).backgroundColor : null,
      headerColor: header ? getComputedStyle(header).color : null,
      // Свечение — по наличию зелёной тройки в box-shadow: Tailwind ставит перед ней пустые ring-слои.
      primaryShadow: primary ? (getComputedStyle(primary).boxShadow.includes('rgba(126, 217, 0') ? 'зелёное свечение' : getComputedStyle(primary).boxShadow.slice(0, 60)) : null,
      primaryBg: primary ? getComputedStyle(primary).backgroundColor : null,
      h1Color: h1 ? getComputedStyle(h1).color : null,
      title: document.title,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  }, OLD_PALETTE);
}

async function visit(context, id, title, url, { login, portal, viewport } = {}) {
  const page = await context.newPage();
  await page.setViewportSize(viewport ?? { width: 1440, height: 900 });
  const started = Date.now();

  try {
    if (login) {
      await page.goto(BASE, { waitUntil: 'domcontentloaded' });
      const status = await apiLogin(page, login, portal);
      if (status !== 200) throw new Error(`вход ${login}: ${status}`);
    }

    // `load` + пауза, а не `networkidle`: карта на главной держит сеть занятой.
    const response = await page.goto(BASE + url, { waitUntil: 'load', timeout: 60_000 });
    await page.waitForTimeout(1500);
    const http = response?.status();
    const info = await inspect(page);
    const shot = path.join(SHOTS, `${id}.png`);
    await page.screenshot({ path: shot, fullPage: false });
    const mobileShot = path.join(SHOTS, `${id}-390.png`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const mobileOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    await page.screenshot({ path: mobileShot, fullPage: false });

    const problems = [];
    if (http !== 200) problems.push(`HTTP ${http}`);
    if (info.oldHitCount > 0) problems.push(`пятен старой палитры: ${info.oldHitCount}`);
    if (info.bodyBg !== NEW.bg) problems.push(`фон body ${info.bodyBg} ≠ ${NEW.bg}`);
    if (info.bodyColor !== NEW.ink) problems.push(`цвет текста ${info.bodyColor} ≠ ${NEW.ink}`);
    if (info.headerBg !== NEW.plate) problems.push(`фон шапки ${info.headerBg} ≠ ${NEW.plate}`);
    if (info.horizontalOverflow) problems.push('горизонтальная прокрутка на 1440');
    if (mobileOverflow) problems.push('горизонтальная прокрутка на 390');

    results.push({ id, title, url, status: problems.length ? 'fail' : 'pass', http, info, problems, ms: Date.now() - started });
    console.log(`  ${problems.length ? '❌' : '✅'} ${id} ${title} — ${problems.join('; ') || `цветов ${info.distinctColors}, элементов ${info.elements}`}`);
  } catch (error) {
    results.push({ id, title, url, status: 'fail', problems: [String(error.message ?? error)], info: {} });
    console.log(`  ❌ ${id} ${title} — ${error.message}`);
  } finally {
    await page.close();
  }
}

function writeReport() {
  const passed = results.filter((r) => r.status === 'pass').length;
  const lines = [
    `# Phase 38 — браузерный проход после покраски (шаг 38.15)`,
    '',
    `**Дата:** ${DATE} · **Стенд:** ${BASE} (контейнер \`sporthub_web\` после \`npm run app:up\`) · **Признак прогона:** \`${RUN_TAG}\``,
    `**Итог:** ${passed} из ${results.length} страниц без пятен`,
    '',
    '## Как проверялось',
    '',
    '- Новизна образа: в CSS-бандле контейнера есть `--ui-lime:#7ed900`, `--ui-bg:#f4f6f9`, `--ui-shadow-glow`; `rgba(131,` — 0 вхождений.',
    '- На каждой странице — `getComputedStyle` всех элементов (`color`, `backgroundColor`, `borderTopColor`, `outlineColor`, `fill`, `stroke`); совпадение с любым цветом палитры фазы 31 (в т. ч. с альфой) — пятно.',
    '- Инлайновый `style` с hex — пятно.',
    '- Ключевые значения: фон body `rgb(244, 246, 249)`, текст `rgb(17, 17, 17)`, фон шапки `rgb(17, 17, 17)`, тень primary-кнопки.',
    '- Горизонтальная прокрутка на 1440 и 390 — дефект.',
    '',
    '| # | Страница | Группа | HTTP | Цветов | Пятен | Фон body | Шапка | Primary-тень | Итог |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const r of results) {
    const i = r.info ?? {};
    lines.push(
      `| ${r.id} | \`${r.url}\` | ${r.title} | ${r.http ?? '—'} | ${i.distinctColors ?? '—'} | ${i.oldHitCount ?? '—'} | ${i.bodyBg ?? '—'} | ${i.headerBg ?? '—'} | ${i.primaryShadow ?? '—'} | ${r.status === 'pass' ? '✅' : '❌ ' + r.problems.join('; ')} |`,
    );
  }

  const failed = results.filter((r) => r.status === 'fail');
  if (failed.length) {
    lines.push('', '## Пятна и дефекты', '');
    for (const r of failed) {
      lines.push(`### ${r.id} \`${r.url}\``, '');
      for (const p of r.problems) lines.push(`- ${p}`);
      for (const h of r.info?.oldHits ?? []) lines.push(`  - ${h}`);
      lines.push('');
    }
  }

  lines.push('', `Скриншоты: \`tests/screenshots/phase-38-paint/\` (по две на страницу: 1440 и 390).`, '');
  fs.writeFileSync(REPORT, lines.join('\n'));
  console.log(`\nОтчёт: ${REPORT}`);
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const users = seedRunUsers();
  // Администратор прогона — своя учётка с тем же хешем, чтобы не зависеть от пароля живого.
  readDb(
    `INSERT INTO users (created_at, status, account_kind, name, email, phone, password_hash)
     VALUES (now(), 'active', 'admin', 'Прогон admin', '${RUN_TAG}-admin@test.local', '+7 (900) 555-00-09',
             (SELECT password_hash FROM users WHERE email='${E2E_USERS.client}'))
     ON CONFLICT (email) DO NOTHING;`,
  );
  console.log(`люди прогона: ${Object.keys(users).length}`);

  const slug = readDb(`SELECT slug FROM clubs WHERE status='published' ORDER BY id LIMIT 1;`);
  const trainerSlug = readDb(`SELECT slug FROM trainers WHERE status='published' ORDER BY id LIMIT 1;`);
  const scheduleId = readDb(`SELECT id FROM schedule ORDER BY id LIMIT 1;`);

  const browser = await chromium.launch();
  const context = await browser.newContext();

  try {
    await visit(context, 'P1', 'Главная (гость)', '/');
    await visit(context, 'P2', 'Детальная клуба', `/clubs/${slug}`);
    await visit(context, 'P3', 'Детальная тренера', `/trainers/${trainerSlug}`);
    await visit(context, 'P4', 'Запись на занятие (клиент)', `/booking/${scheduleId}`, { login: E2E_USERS.client });
    await visit(context, 'P5', 'Личный кабинет', '/profile/me', { login: E2E_USERS.client });
    await visit(context, 'P6', 'Служебная панель (администратор)', '/service-portal/dashboard', {
      login: `${RUN_TAG}-admin@test.local`,
      portal: 'service',
    });
  } finally {
    await browser.close();
    writeReport();
    const cleaned = cleanupRun();
    console.log(`уборка: ${JSON.stringify(cleaned)}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
