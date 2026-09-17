// Дерево доступности и контраст (шаг 38.97) — `/` и `/catalog`, гость, 1440 и 430.
//
// ⚠️ Playwright MCP в сессии не подключён: aria-снимки берутся библиотекой
// (`locator.ariaSnapshot()`), дерево — то же, что видит диктор в Chromium. Только
// чтение: данных прогона не заводится. Что проверяется:
//   1. подсказки `Hint`: описание доступно ДО показа (`aria-describedby` → элемент в DOM),
//      фокус показывает пузырь, `Escape` гасит;
//   2. знак «проверено» — имя текстом; фокусируемые `span`/`role="img"` без интерактивной
//      роли — порядок табуляции с именами;
//   3. счётчики героя — `dl` с парами `dt`/`dd`, у `dl` есть имя;
//   4. «К записи: имя» у слотов; дубли имён у ссылок с разными адресами;
//   5. контраст текста по вычисленным цветам: счёт «ниже AA» (4.5:1; крупный — 3:1);
//   6. ловушка фокуса меню шапки (<960): кольцо «кнопка → пункты → кнопка», Escape — фокус на кнопку;
//   7. быстрый клик по плитке/CTA сразу после `domcontentloaded` (24c): страница жива.
//
// Запуск: `node tests/e2e-phase-38-a11y-osnova.mjs` при поднятом стенде.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

import { E2E_USERS, RUN_TAG, cleanupRun, readDb, readDbId, seedRunUsers } from '../scripts/e2e-fixture.mjs';

/**
 * Один сегодняшний слот прогона: без него секция слотов каталога пуста и мерить нечего
 * (пилюли «Сегодня»/«Ближайшие» рисуются только со слайдером). Заводится по
 * `E2E_SEED_SLOT=1` под признаком прогона и убирается в конце (`cleanupRun` сносит клуб,
 * расписание уходит каскадом). Запуск: `E2E_RUN_TAG=ph38-a11y-osnova E2E_SEED_SLOT=1 node …`.
 */
function seedTodaySlot() {
  const users = seedRunUsers();
  const builderId = users[E2E_USERS.builder];
  const clubId = readDbId(
    `INSERT INTO clubs (name, slug, slug_normalized, description, short_description, city, address, phone, latitude, longitude, managed_by_user_id, source, status)
     VALUES ('${RUN_TAG} клуб', '${RUN_TAG}-club', '${RUN_TAG}-club', 'Клуб прогона', 'Клуб прогона', 'Самара', 'ул. Прогонная, 1', '+7 (900) 555-00-02', 53.2, 50.15, ${builderId}, 'seed', 'published')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id;`,
  );
  const sportId = readDb(`SELECT id FROM sports ORDER BY id LIMIT 1;`);
  readDb(`INSERT INTO club_sports (club_id, sport_id) VALUES (${clubId}, ${sportId}) ON CONFLICT DO NOTHING;`);
  // Сегодня по Самаре, начало через час (не позже 22:00), час длительности.
  const scheduleId = readDbId(
    `INSERT INTO schedule (owner_club_id, venue_club_id, sport_id, title, date, start_time, end_time, duration_minutes, level, capacity, price, room)
     VALUES (${clubId}, ${clubId}, ${sportId}, '${RUN_TAG} занятие',
             (now() AT TIME ZONE 'Europe/Samara')::date,
             LEAST((now() AT TIME ZONE 'Europe/Samara')::time(0) + interval '1 hour', time '22:00')::time(0),
             LEAST((now() AT TIME ZONE 'Europe/Samara')::time(0) + interval '2 hours', time '23:00')::time(0),
             60, 'all_levels', 10, 500, 'Зал 1')
     RETURNING id;`,
  );
  return { clubId, scheduleId };
}

const BASE = 'http://localhost:3000';
const OUT = '/Users/misha/Desktop/prosport2.1/tests/screenshots/phase-38-a11y';
const DATE = new Date().toISOString().slice(0, 10);
const REPORT = `/Users/misha/Desktop/prosport2.1/tests/reports/mcp-ui-phase-38-${DATE}.md`;

const PAGES = ['/', '/catalog'];
const WIDTHS = [1440, 430];

const results = [];
const findings = [];
function step(id, title, ok, detail) {
  results.push({ id, title, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${id} ${title} — ${detail}`);
}
function finding(sev, where, text) {
  findings.push({ sev, where, text });
}

/** Контраст по WCAG: относительная яркость из `rgb(a)`; фон — первый непрозрачный предок. */
const CONTRAST_SCRIPT = () => {
  const parse = (value) => {
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(value);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
  };
  const lum = ([r, g, b]) => {
    const f = (c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const blend = (fg, bg) => {
    const a = fg[3];
    return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
  };
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  const background = (el) => {
    let node = el;
    let acc = null;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      const bg = parse(cs.backgroundColor);
      if (bg && bg[3] > 0) {
        acc = acc ? blend(acc, bg) : bg;
        if (acc[3] >= 1 || bg[3] >= 1) return acc;
      }
      if (cs.backgroundImage !== 'none' && /gradient/.test(cs.backgroundImage)) return null;
      node = node.parentElement;
    }
    return acc ? blend(acc, [255, 255, 255, 1]) : [255, 255, 255, 1];
  };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.trim();
    if (!text) continue;
    const el = node.parentElement;
    if (!el || seen.has(el)) continue;
    if (el.closest('[aria-hidden="true"], script, style, noscript')) continue;
    // Словомарка — знак, не текст (исключение BRAND_MARK сторожа green-text-on-light).
    if (el.closest('[role="img"][aria-label="ПРОСПОРТ"]')) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    // sr-only: текст вне экрана — диктору, не глазам
    if (r.width <= 1 && r.height <= 1) continue;
    seen.add(el);
    const fg = parse(cs.color);
    const bg = background(el);
    if (!fg || !bg) continue;
    const color = fg[3] < 1 ? blend(fg, bg) : fg;
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const c = ratio(color, bg);
    const need = large ? 3 : 4.5;
    if (c < need) {
      out.push({
        text: text.slice(0, 40),
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).slice(0, 60)) || '',
        ratio: Math.round(c * 100) / 100,
        need,
        size: Math.round(size),
        color: cs.color,
        bg: `rgb(${bg.slice(0, 3).map(Math.round).join(', ')})`,
      });
    }
  }
  return out;
};

/** Имя элемента для диктора — грубо, как считает библиотека: aria-label, иначе текст. */
const NAME_SCRIPT = (el) =>
  el.getAttribute('aria-label') ||
  (el.getAttribute('aria-labelledby') &&
    [...el.getAttribute('aria-labelledby').split(' ')]
      .map((id) => document.getElementById(id)?.textContent?.trim() ?? '')
      .join(' ')) ||
  el.textContent.trim().replace(/\s+/g, ' ');

async function auditPage(browser, route, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('response', (r) => {
    // Гостю `/api/auth/me` отвечает 401 по замыслу (сессии нет) — не ошибка.
    if (r.status() >= 400 && !/\/api\/auth\/me/.test(r.url())) errors.push(`${r.status()} ${r.url().replace(BASE, '')}`);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
  });
  await page.goto(BASE + route, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(800);
  const id = `${route === '/' ? 'home' : 'catalog'}@${width}`;

  // aria-снимок всего документа — библиотекой
  const snapshot = await page.locator('body').ariaSnapshot();
  fs.writeFileSync(path.join(OUT, `${id.replace('@', '-')}.aria.yml`), snapshot);
  step(id, 'aria-снимок снят библиотекой', snapshot.length > 200, `${snapshot.split('\n').length} строк`);

  // 1. Hint: описание доступно до показа; фокус показывает; Escape гасит
  const hinted = page.locator('[aria-describedby]');
  const hintedCount = await hinted.count();
  if (hintedCount > 0) {
    const first = hinted.first();
    const describedId = await first.getAttribute('aria-describedby');
    const description = await page.evaluate((did) => {
      const node = document.getElementById(did);
      return node ? node.textContent.trim() : null;
    }, describedId);
    // `useId` даёт `:r1:` — в селектор такое не подставить, читаем DOM напрямую.
    const beforeVisible = await page.evaluate((did) => {
      const node = document.getElementById(did);
      if (!node) return null;
      const cs = getComputedStyle(node);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
    }, describedId);
    await first.focus();
    await page.waitForTimeout(150);
    const shownOnFocus = await page.evaluate((did) => {
      const node = document.getElementById(did);
      if (!node) return false;
      const cs = getComputedStyle(node);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
    }, describedId);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);
    const hiddenAfterEscape = !(await page.evaluate((did) => {
      const node = document.getElementById(did);
      if (!node) return false;
      const cs = getComputedStyle(node);
      return cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0;
    }, describedId));
    step(id, 'Hint: описание в DOM до показа, показ по фокусу, Escape гасит',
      Boolean(description) && shownOnFocus && hiddenAfterEscape,
      `описание «${(description ?? '').slice(0, 50)}», до фокуса видим: ${beforeVisible}, по фокусу: ${shownOnFocus}, после Escape скрыт: ${hiddenAfterEscape}; подсказок ${hintedCount}`);
  } else {
    step(id, 'Hint: подсказки на странице', true, 'подсказок нет (гость без публикаций со знаком)');
  }

  // 2. Знак «проверено» — имя текстом; фокусируемые span/role=img
  const verified = await page.locator('[data-testid="verified-badge"]').evaluateAll((els) =>
    els.map((el) => ({
      text: el.textContent.trim(),
      ariaLabel: el.getAttribute('aria-label'),
      tabIndex: el.tabIndex,
      role: el.getAttribute('role'),
    })),
  );
  if (verified.length > 0) {
    const named = verified.every((v) => /проверен/i.test(v.text));
    step(id, 'знак «проверено» — имя текстом', named, `${verified.length} знаков, tabIndex: ${[...new Set(verified.map((v) => v.tabIndex))].join('/')}`);
  }
  const oddFocusables = await page.evaluate(() =>
    [...document.querySelectorAll('span[tabindex="0"], [role="img"][tabindex="0"], div[tabindex="0"]')]
      .filter((el) => !el.closest('[aria-hidden="true"]'))
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        name: el.getAttribute('aria-label') || el.textContent.trim().slice(0, 40),
        describedby: Boolean(el.getAttribute('aria-describedby')),
      })),
  );
  step(id, 'фокусируемые span/img без интерактивной роли', true,
    oddFocusables.length === 0 ? 'нет' : oddFocusables.map((f) => `${f.tag}${f.role ? `[${f.role}]` : ''} «${f.name}»${f.describedby ? ' +описание' : ''}`).join('; '));
  for (const f of oddFocusables) {
    if (!f.name) finding('MED', id, `фокусируемый ${f.tag} без имени`);
    else if (!f.describedby) finding('LOW', id, `фокусируемый ${f.tag} «${f.name}» без подсказки — стоп табуляции без причины`);
  }

  // порядок табуляции: первые 25 стопов с именами
  const order = [];
  await page.evaluate(() => document.body.focus());
  for (let i = 0; i < 25; i += 1) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const name = el.getAttribute('aria-label') || el.textContent.trim().replace(/\s+/g, ' ').slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.getAttribute('role') ? `[${el.getAttribute('role')}]` : ''}:${name}`;
    });
    if (info === null) break;
    order.push(info);
  }
  const unnamed = order.filter((o) => o.endsWith(':'));
  step(id, 'порядок табуляции: у каждого стопа есть имя', unnamed.length === 0, `${order.length} стопов${unnamed.length ? `, без имени: ${unnamed.join(', ')}` : ''}`);
  fs.writeFileSync(path.join(OUT, `${id.replace('@', '-')}.tab-order.txt`), order.join('\n'));

  // 3. Счётчики dl/dt/dd (только на главной)
  if (route === '/') {
    const dl = await page.evaluate(() => {
      const list = document.querySelector('dl[aria-label]');
      if (!list) return null;
      const dts = list.querySelectorAll('dt').length;
      const dds = list.querySelectorAll('dd').length;
      return { name: list.getAttribute('aria-label'), dts, dds };
    });
    step(id, 'счётчики героя — dl с именем и парами dt/dd', Boolean(dl) && dl.dts === dl.dds && dl.dts > 0,
      dl ? `«${dl.name}»: ${dl.dts} dt / ${dl.dds} dd` : 'dl не найден');
  }

  // 4. «К записи: имя» и дубли имён
  const slotNames = await page.locator('[data-testid="slot-card"] button, [data-testid="slot-card"] a').evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label') || el.textContent.trim()),
  );
  if (slotNames.length > 0) {
    const distinct = new Set(slotNames).size === slotNames.length;
    step(id, 'слоты: имена CTA различимы («К записи: имя»)', distinct, `${slotNames.length} CTA, уникальных ${new Set(slotNames).size}; пример «${slotNames[0]}»`);
    if (!distinct) finding('MED', id, `слоты: одинаковые имена CTA — ${slotNames.filter((n, i, a) => a.indexOf(n) !== i).join(', ')}`);
  }
  const dupes = await page.evaluate((nameFn) => {
    const getName = new Function('el', `return (${nameFn})(el)`);
    const map = new Map();
    // Ссылки: одно имя — разные адреса. Кнопки с одним именем (сегмент «Клубы» в герое
    // и в блоке поиска) делают одно и то же — не дубль.
    for (const el of document.querySelectorAll('a[href]')) {
      if (el.closest('[aria-hidden="true"]')) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') continue;
      const name = getName(el);
      if (!map.has(name)) map.set(name, new Set());
      map.get(name).add(el.getAttribute('href'));
    }
    return [...map.entries()].filter(([, targets]) => targets.size > 1).map(([name, targets]) => `«${name}» ×${targets.size}`);
  }, NAME_SCRIPT.toString());
  step(id, 'дубли имён у ссылок с разными адресами', dupes.length === 0, dupes.length ? dupes.join('; ') : 'нет');
  for (const d of dupes) finding('MED', id, `одно имя — разные цели: ${d} (диктор не различит)`);

  // Ориентиры: один main, один banner, один contentinfo; навигации — с именами.
  const landmarks = await page.evaluate(() => ({
    main: document.querySelectorAll('main, [role="main"]').length,
    nestedMain: document.querySelectorAll('main main').length,
    banner: document.querySelectorAll('header:not(main header), [role="banner"]').length,
    contentinfo: document.querySelectorAll('footer:not(main footer), [role="contentinfo"]').length,
    unnamedNav: [...document.querySelectorAll('nav')].filter((n) => !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby')).length,
  }));
  step(id, 'ориентиры: один main (без вложенных), один banner, один contentinfo, навигации с именами',
    landmarks.main === 1 && landmarks.nestedMain === 0 && landmarks.banner === 1 && landmarks.contentinfo === 1 && landmarks.unnamedNav === 0,
    `main ${landmarks.main} (вложенных ${landmarks.nestedMain}), banner ${landmarks.banner}, contentinfo ${landmarks.contentinfo}, nav без имени ${landmarks.unnamedNav}`);
  if (landmarks.nestedMain > 0) finding('MED', id, `два ориентира main: <main> каркаса (AppShell) и <main> страницы внутри него — диктор объявляет «основное содержимое» дважды; странице нужен div/fragment`);

  // 5. Контраст — на каталоге в обоих режимах стора (слоты клубов и окна тренеров)
  let low = await page.evaluate(CONTRAST_SCRIPT);
  if (route === '/catalog') {
    await page.locator('#discover button', { hasText: 'Тренеры' }).first().click();
    await page.waitForTimeout(300);
    const lowTrainers = await page.evaluate(CONTRAST_SCRIPT);
    low = [...low, ...lowTrainers.map((x) => ({ ...x, text: `[тренеры] ${x.text}` }))];
    await page.locator('#discover button', { hasText: 'Клубы' }).first().click();
    await page.waitForTimeout(200);
  }
  step(id, 'контраст текста ниже AA (4.5:1; крупный 3:1)', true, `${low.length} мест`);
  fs.writeFileSync(
    path.join(OUT, `${id.replace('@', '-')}.contrast.json`),
    JSON.stringify(low, null, 2),
  );
  const worst = [...low].sort((a, b) => a.ratio - b.ratio).slice(0, 8);
  for (const w of worst) {
    finding(w.ratio < 3 ? 'MED' : 'LOW', id, `контраст ${w.ratio}:1 (нужно ${w.need}) — <${w.tag}> «${w.text}» ${w.color} на ${w.bg}, ${w.size}px, .${w.cls.split(' ').slice(0, 4).join('.')}`);
  }

  // 6. Ловушка фокуса меню (узко): кольцо «кнопка → пункты → кнопка» (38.58/38.62)
  if (width < 960) {
    const button = page.locator('header button[aria-label="Открыть меню"]');
    await button.click();
    await page.waitForTimeout(150);
    const links = page.locator('header nav[aria-label="Меню"] a');
    const n = await links.count();
    const active = () =>
      page.evaluate(() => {
        const el = document.activeElement;
        return el ? el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName : '';
      });
    await links.nth(n - 1).focus();
    await page.keyboard.press('Tab');
    const afterLast = await active();
    await page.keyboard.press('Shift+Tab');
    const backFromButton = await active();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    const afterButton = await active();
    const firstText = (await links.first().textContent())?.trim();
    const lastText = (await links.nth(n - 1).textContent())?.trim();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
    const focusBack = await active();
    step(id, 'ловушка фокуса меню: кольцо кнопка → пункты → кнопка; Escape возвращает фокус на кнопку',
      afterLast === 'Закрыть меню' && backFromButton === lastText && afterButton === firstText && focusBack === 'Открыть меню',
      `с последнего Tab → «${afterLast}», Shift+Tab → «${backFromButton}», с кнопки Tab → «${afterButton}», после Escape → «${focusBack}»`);
  }

  // ошибки консоли за время аудита
  step(id, 'ошибок страницы, консоли и ответов ≥400 нет (кроме 401 «кто я» гостю)', errors.length === 0, errors.length ? errors.slice(0, 3).join(' | ').slice(0, 200) : 'нет');
  await context.close();
}

/** 7. Быстрый клик до `ready` (24c): плитка «Возможности» и CTA призыва. */
async function earlyClick(browser) {
  for (const [label, selector] of [
    ['плитка «Возможности»', '#features a, #features button'],
    ['CTA призыва', '#cta button, #cta a'],
  ]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const target = page.locator(selector).first();
    let outcome = 'нет цели';
    try {
      await target.click({ timeout: 3000 });
      await page.waitForTimeout(1200);
      const modal = await page.locator('[role="dialog"]').count();
      outcome = `url ${page.url().replace(BASE, '')}, диалогов ${modal}`;
    } catch (e) {
      outcome = `клик не удался: ${String(e).slice(0, 80)}`;
    }
    const alive = await page.evaluate(() => document.body.children.length > 0 && !!document.querySelector('header'));
    step('early', `быстрый клик до ready: ${label}`, alive && errors.length === 0, `${outcome}; страница жива: ${alive}; ошибок ${errors.length}`);
    if (errors.length) finding('HIGH', 'home@1440', `быстрый клик (${label}) — ошибка: ${errors[0].slice(0, 120)}`);
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const seeded = process.env.E2E_SEED_SLOT === '1' ? seedTodaySlot() : null;
  if (seeded) console.log(`слот прогона: клуб ${seeded.clubId}, расписание ${seeded.scheduleId}`);
  const browser = await chromium.launch();
  try {
    for (const route of PAGES) for (const width of WIDTHS) await auditPage(browser, route, width);
    await earlyClick(browser);
  } finally {
    await browser.close();
    if (seeded) console.log(`уборка: ${JSON.stringify(cleanupRun())}`);
  }

  const ok = results.filter((r) => r.ok).length;
  const sevOrder = { HIGH: 0, MED: 1, LOW: 2 };
  findings.sort((a, b) => sevOrder[a.sev] - sevOrder[b.sev]);
  const lines = [
    `# Дерево доступности и контраст — шаг 38.97, ${DATE}`,
    '',
    '⚠️ Playwright MCP в сессии не подключён: aria-снимки сняты БИБЛИОТЕКОЙ Playwright',
    '(`locator.ariaSnapshot()`, Chromium) — дерево то же, что читает диктор; ручного',
    'MCP-прохода не было. Стенд `npm run app:up`, гость, только чтение; ширины 1440 и 430.',
    `Снимки, порядок табуляции и списки контраста — \`tests/screenshots/phase-38-a11y/\`.`,
    '',
    `**Итог проверок: ${ok} из ${results.length}.** Находок: ${findings.length} (HIGH ${findings.filter((f) => f.sev === 'HIGH').length}, MED ${findings.filter((f) => f.sev === 'MED').length}, LOW ${findings.filter((f) => f.sev === 'LOW').length}).`,
    '',
    '⚠️ Что НЕ воспроизведено на данных стенда: у гостя нет ни одной публикации со знаком',
    '«проверено» (в базе `verified_at` пуст у всех клубов и тренеров) — проверки `Hint` и имени',
    'знака прошли по нулю элементов; их поведение покрыто тестами `hint.test`/`verified-badge`.',
    '',
    '**Контраст «ниже AA», текстов на странице:** старт фазы — 137 (по счёту координатора),',
    `образ 579e397 (до 38.79c/38.7) — главная 44, каталог (404) —; сейчас — ${results.filter((r) => r.title.startsWith('контраст')).map((r) => `${r.id}: ${r.detail}`).join(', ')}.`,
    'Словомарка «ПРО» lime на белом — исключение BRAND_MARK (знак, не текст), в счёт не входит.',
    '',
    '## Проверки',
    '',
    '| Где | Проверка | Итог | Замер |',
    '| --- | --- | --- | --- |',
    ...results.map((r) => `| ${r.id} | ${r.title} | ${r.ok ? '✅' : '❌'} | ${r.detail.replace(/\|/g, '/')} |`),
    '',
    '## Находки',
    '',
    '| Sev | Где | Что |',
    '| --- | --- | --- |',
    ...findings.map((f) => `| ${f.sev} | ${f.where} | ${f.text.replace(/\|/g, '/')} |`),
    '',
  ];
  fs.writeFileSync(REPORT, lines.join('\n'));
  console.log(`\nИтог: ${ok} из ${results.length}, находок ${findings.length}. Отчёт: ${REPORT}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
