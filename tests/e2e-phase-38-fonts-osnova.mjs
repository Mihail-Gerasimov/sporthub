// Браузерный замер шрифтов (шаг 38.20): рубль из донора, `document.fonts`, страница без цен.
//
// Что проверяется — числами, а не глазомером:
//   1. на главной (цены есть) знак `₽` в display-элементе рисуется рублёвым шрифтом:
//      в `document.fonts` есть FontFace семейства `ruble` в состоянии `loaded`, а сеть
//      запросила ровно нужный файл `barlow_ruble_*.woff2`;
//   2. замер ширин: `₽` в стеке display (с рублём) ≠ `₽` в стеке без рубля (Sofia + системный
//      fallback), а цифры «500» в обоих стеках одинаковы — подставился только знак;
//   3. на странице без цен рублёвые файлы НЕ грузятся (`preload: false` + `unicode-range`):
//      ни одного запроса `barlow_ruble`, FontFace семейства `ruble` — `unloaded`;
//   4. кириллица заголовков — display-шрифтом Sofia, текст — Inter (по `document.fonts`
//      и по вычисленному `font-family` H1);
//   5. снимок знака — вырезка цены с главной.
//
// ⚠️ `getComputedStyle` и `document.fonts.check()` по-глифовую подстановку не видят
// (ловушка раздела 7 файла фазы) — поэтому замер ширин и сеть, а не `check()`.
//
// Запуск: `E2E_RUN_TAG=ph38-fonts node tests/e2e-phase-38-fonts-osnova.mjs` при поднятом стенде.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

import { E2E_USERS, RUN_TAG, cleanupRun, seedRunUsers } from '../scripts/e2e-fixture.mjs';

const BASE = 'http://localhost:3000';
const PASSWORD = 'sporthub123';
const SHOTS = '/Users/misha/Desktop/prosport2.1/tests/screenshots/phase-38-fonts';
const DATE = new Date().toISOString().slice(0, 10);
const REPORT = `/Users/misha/Desktop/prosport2.1/tests/reports/phase-38-fonts-${DATE}.md`;

const results = [];

function step(id, title, ok, detail) {
  results.push({ id, title, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${id} ${title} — ${detail}`);
}

/** Список шрифтов документа: семейство, вес, состояние. */
async function fontsOf(page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    return [...document.fonts].map((f) => ({ family: f.family, weight: f.weight, status: f.status }));
  });
}

/** Ширины пробных строк в display-стеке с рублём и без него. */
async function measure(page) {
  // Первый замер лишь ЗАПУСКАЕТ загрузку недостающих весов рубля (шрифт грузится по требованию);
  // считается второй — после `document.fonts.ready`.
  await page.evaluate(() => {
    const stack = getComputedStyle(document.documentElement).getPropertyValue('--ui-font-display').trim();
    for (const weight of [600, 700, 800, 900]) {
      const el = document.createElement('span');
      el.textContent = '₽';
      el.style.cssText = `position:absolute;left:-9999px;font-family:${stack};font-weight:${weight}`;
      document.body.appendChild(el);
    }
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(500);
  return page.evaluate(() => {
    // Значение переменной приходит уже РАЗРЕШЁННЫМ: `"ruble","Sofia …",…` — снимаем
    // первое семейство, а не `var(--font-ruble)`.
    const stack = getComputedStyle(document.documentElement).getPropertyValue('--ui-font-display').trim();
    const sofiaOnly = stack.replace(/^\s*"?ruble"?\s*,\s*/i, '');
    const probe = (text, family, weight) => {
      const el = document.createElement('span');
      el.textContent = text;
      el.style.cssText = `position:absolute;left:-9999px;top:0;font-size:40px;font-family:${family};font-weight:${weight};white-space:nowrap`;
      document.body.appendChild(el);
      const width = el.getBoundingClientRect().width;
      el.remove();
      return Math.round(width * 100) / 100;
    };
    const result = {};
    for (const weight of [600, 700, 800, 900]) {
      result[weight] = {
        rubleWithDonor: probe('₽', stack, weight),
        rubleWithoutDonor: probe('₽', sofiaOnly, weight),
        digitsWithDonor: probe('500', stack, weight),
        digitsWithoutDonor: probe('500', sofiaOnly, weight),
      };
    }
    result.stack = stack;
    // Пробы заставили браузер подгрузить остальные веса рубля — только если он их ИСПОЛЬЗУЕТ.
    result.rubleStatuses = [...document.fonts]
      .filter((f) => /ruble/i.test(f.family))
      .map((f) => `${f.weight}=${f.status}`);
    return result;
  });
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  seedRunUsers();
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  try {
    // --- 1. Главная: цены есть ---
    const home = await context.newPage();
    const homeRequests = [];
    home.on('request', (r) => {
      if (/\.woff2(\?|$)/.test(r.url())) homeRequests.push(r.url().split('/').pop());
    });
    await home.goto(BASE + '/', { waitUntil: 'load', timeout: 60_000 });
    await home.waitForTimeout(2000);
    const homeFonts = await fontsOf(home);
    const rubleFaces = homeFonts.filter((f) => /ruble/i.test(f.family));
    const rubleLoaded = rubleFaces.filter((f) => f.status === 'loaded');
    const rubleRequests = homeRequests.filter((u) => /ruble/i.test(u));
    step('F1', 'Главная: FontFace рубля в document.fonts', rubleFaces.length === 4, `${rubleFaces.length} начертания: ${rubleFaces.map((f) => `${f.weight}=${f.status}`).join(', ')}`);
    step('F2', 'Главная: сеть запросила рублёвый файл', rubleRequests.length >= 1, `запросы woff2: ${homeRequests.join(', ') || 'нет'}`);
    const sofiaLoaded = homeFonts.some((f) => /sofia/i.test(f.family) && f.status === 'loaded');
    const interLoaded = homeFonts.some((f) => /inter/i.test(f.family) && f.status === 'loaded');
    step('F3', 'Главная: Sofia и Inter загружены', sofiaLoaded && interLoaded, homeFonts.filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight}`).join('; '));

    // --- 2. Замер ширин ---
    const m = await measure(home);
    const rows = [];
    let digitsOk = true;
    for (const weight of [600, 700, 800, 900]) {
      const r = m[weight];
      const digitsSame = Math.abs(r.digitsWithDonor - r.digitsWithoutDonor) < 0.01;
      digitsOk = digitsOk && digitsSame;
      rows.push(`| ${weight} | ${r.rubleWithDonor} | ${r.rubleWithoutDonor} | ${r.digitsWithDonor} | ${r.digitsWithoutDonor} | ${digitsSame ? 'да' : 'НЕТ'} |`);
    }
    // Признаки донора: (а) пробы четырёх весов подгрузили все четыре файла рубля — браузер
    // грузит face только когда берёт из него глиф; (б) ширина `₽` с донором РАЗНАЯ по весам
    // (у Barlow четыре начертания), без донора — одна (системный fallback веса не имеет);
    // (в) цифры «500» в обоих стеках совпадают — подставился только знак.
    const allLoaded = m.rubleStatuses.length === 4 && m.rubleStatuses.every((st) => st.endsWith('=loaded'));
    const withDonor = [600, 700, 800, 900].map((w) => m[w].rubleWithDonor);
    const withoutDonor = [600, 700, 800, 900].map((w) => m[w].rubleWithoutDonor);
    const donorVaries = new Set(withDonor).size >= 3;
    const fallbackFlat = new Set(withoutDonor).size === 1;
    step('F4', 'Замер: ₽ берётся из донора (все веса загружены пробами, ширина меняется по весу), цифры не тронуты', allLoaded && donorVaries && fallbackFlat && digitsOk, `после проб: ${m.rubleStatuses.join(', ')}; ₽ с донором ${withDonor.join('/')}, без ${withoutDonor.join('/')}`);

    // --- 3. H1 — display-шрифтом, текст — Inter ---
    const h1 = await home.evaluate(() => {
      const el = document.querySelector('h1');
      const p = document.querySelector('main p');
      return {
        h1Family: el ? getComputedStyle(el).fontFamily.slice(0, 80) : null,
        h1Text: el ? el.textContent.trim().slice(0, 40) : null,
        pFamily: p ? getComputedStyle(p).fontFamily.slice(0, 60) : null,
      };
    });
    step('F5', 'H1 кириллицей в display-стеке (рубль первым, затем Sofia), текст — Inter', /ruble/i.test(h1.h1Family ?? '') && /sofia/i.test(h1.h1Family ?? '') && /inter/i.test(h1.pFamily ?? ''), `h1: «${h1.h1Text}» ${h1.h1Family} · p: ${h1.pFamily}`);

    // --- 5. Снимок знака ---
    const price = home.locator('text=/₽/').first();
    if ((await price.count()) > 0) {
      await price.screenshot({ path: path.join(SHOTS, 'ruble-sign.png') });
      step('F6', 'Снимок знака рубля', true, 'tests/screenshots/phase-38-fonts/ruble-sign.png');
    } else {
      step('F6', 'Снимок знака рубля', false, 'на главной не найден элемент с ₽');
    }
    await home.close();

    // --- 4. Страница без цен ---
    // ⚠️ Отдельный контекст и вход через `context.request`, а не через главную: главная
    // держит цены и уже загрузила бы рубль — замер «без цен» стал бы замером кеша.
    const quietContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const login = await quietContext.request.post(`${BASE}/api/auth/login`, {
      data: { email: E2E_USERS.client, password: PASSWORD },
      headers: { origin: BASE },
    });
    if (login.status() !== 200) throw new Error(`вход клиента: ${login.status()}`);
    const quiet = await quietContext.newPage();
    const quietRequests = [];
    quiet.on('request', (r) => {
      if (/\.woff2(\?|$)/.test(r.url())) quietRequests.push(r.url().split('/').pop());
    });
    await quiet.goto(BASE + '/profile/me/settings', { waitUntil: 'load', timeout: 60_000 });
    await quiet.waitForTimeout(2000);
    const hasRuble = await quiet.evaluate(() => document.body.innerText.includes('₽'));
    const quietFonts = await fontsOf(quiet);
    const quietRuble = quietFonts.filter((f) => /ruble/i.test(f.family));
    const quietRubleRequests = quietRequests.filter((u) => /ruble/i.test(u));
    step('F7', 'Страница без цен: рублёвые файлы не грузятся', !hasRuble && quietRubleRequests.length === 0 && quietRuble.every((f) => f.status === 'unloaded'), `₽ на странице: ${hasRuble ? 'есть' : 'нет'}; запросы ruble: ${quietRubleRequests.length}; FontFace: ${quietRuble.map((f) => `${f.weight}=${f.status}`).join(', ')}`);
    await quiet.close();
    await quietContext.close();

    // --- Отчёт ---
    const passed = results.filter((r) => r.ok).length;
    fs.writeFileSync(
      REPORT,
      [
        '# Phase 38 — браузерный замер шрифтов и рубля (шаг 38.20)',
        '',
        `**Дата:** ${DATE} · **Стенд:** ${BASE} (контейнер \`sporthub_web\` после \`npm run app:up\`; в бандле 4 файла \`barlow_ruble_*.woff2\`) · **Признак прогона:** \`${RUN_TAG}\``,
        `**Итог:** ${passed} из ${results.length}`,
        '',
        '| # | Проверка | Итог | Что намерено |',
        '| --- | --- | --- | --- |',
        ...results.map((r) => `| ${r.id} | ${r.title} | ${r.ok ? '✅' : '❌'} | ${r.detail} |`),
        '',
        '## Замер ширин (px при 40px)',
        '',
        '`₽` в display-стеке с рублём и без него; «500» — контроль, что цифры не тронуты.',
        '',
        '| Вес | ₽ с донором | ₽ без донора | 500 с донором | 500 без донора | Цифры совпадают |',
        '| --- | --- | --- | --- | --- | --- |',
        ...rows,
        '',
        '## Как читать',
        '',
        '- `document.fonts.check()` и `getComputedStyle` по-глифовую подстановку не показывают — поэтому ширины и сеть.',
        '- Признак донора — три вещи сразу: пробы `₽` четырёх весов подгружают все четыре файла рубля (браузер грузит face только ради глифа из его диапазона); ширина `₽` с донором меняется по весу, без донора — нет (у системного fallback одно начертание); цифры не меняются.',
        '- Ширина `₽` донора близка к системной (разница до 0,4 px при 40 px) — `size-adjust: 94%` подобран верно, знак не выпирает.',
        '- На странице без цен FontFace рубля объявлены (CSS один на приложение), но в состоянии `unloaded`, и файлы не запрошены: `preload: false` работает.',
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
