// Проверка восемнадцати тупиков приложения Г реестра переноса
// (`tests/checklists/phase-38-transfer.md`, «ИТОГ ПО ПОЧИНИТЬ») — агент «Проверка».
//
// Запуск: node tests/e2e-phase-38-deadends-check.mjs   (стенд `npm run app:up` на :3000)
//
// Зачем отдельный скрипт. Разведка фазы нашла шестнадцать кнопок и ссылок, которые
// не делают ничего, и ни один из 2823 тестов их не поймал: тест проверяет, что ссылка
// отрисована с нужным адресом, и не проверяет, существует ли адрес. Здесь каждый
// тупик проверяется ТАК, как его видит человек: якорь — по элементу с таким `id`
// в живом DOM, адрес — по ответу сервера и отсутствию страницы «Такой страницы нет»,
// кнопка — по обработчику (`__reactProps`) и по тому, что клик что-то меняет.
//
// ⚠️ Гость, только чтение: данных не заводит, базы не трогает, признака прогона
// не требует. Часть проверок читает исходники репозитория (третья карусель, класс
// ховера строкой, реестр заглушек) — это те тупики, которые в браузере не видны.
//
// ⚠️ До Э8/Э11 большинство строк красные ПО ПОСТРОЕНИЮ — это базовая линия «до Э8»,
// с которой приёмка Э12 сравнивает результат. Красная строка здесь — мера
// оставшейся работы, а не дефект скрипта.
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const REPO = path.resolve(HERE, '..');
const WEB = path.join(REPO, 'apps', 'web', 'src');
const REPORTS = path.join(HERE, 'reports');
const STUBS_REGISTRY = path.join(HERE, 'checklists', 'phase-38-stubs.md');

const results = [];

async function check(id, title, fn) {
  try {
    const detail = await fn();
    results.push({ id, title, status: 'pass', detail: detail ?? '' });
    console.log(`  ✅ ${id} — ${detail ?? ''}`);
  } catch (error) {
    results.push({ id, title, status: 'fail', detail: String(error?.message ?? error) });
    console.log(`  ❌ ${id} — ${error?.message ?? error}`);
  }
}

function must(condition, message) {
  if (!condition) throw new Error(message);
}

const read = (relative) => fs.readFileSync(path.join(WEB, relative), 'utf8');
const exists = (relative) => fs.existsSync(path.join(WEB, relative));

/** Есть ли у DOM-узла React-обработчик с таким именем. */
const hasHandler = (locator, name) =>
  locator.evaluate((el, handler) => {
    const key = Object.keys(el).find((k) => k.startsWith('__reactProps'));
    return typeof el[key]?.[handler] === 'function';
  }, name);

/** Открыть главную и дождаться каркаса. */
async function openHome(page, width = 1440) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('header', { timeout: 20_000 });
  await page.waitForTimeout(1_500);
}

/**
 * Куда ведёт ссылка и есть ли там что-то: якорь — элемент с таким `id` на странице,
 * путь — ответ сервера без страницы «Такой страницы нет».
 */
async function resolveLink(page, href) {
  if (!href) return { kind: 'none', ok: false, note: 'href пуст' };
  const hashIndex = href.indexOf('#');
  const pathname = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
  const hash = hashIndex >= 0 ? href.slice(hashIndex + 1) : '';
  if (hash && (pathname === '' || pathname === '/')) {
    const found = await page.evaluate((id) => Boolean(document.getElementById(id)), hash);
    return { kind: 'anchor', ok: found, note: found ? `#${hash} есть` : `#${hash} НЕТ в DOM` };
  }
  // Якорь на другую страницу (с 38.79a рабочая часть — на /catalog): её DOM спрашивается отдельно.
  if (hash) {
    const found = await page.evaluate(async ({ target, id }) => {
      const html = await (await fetch(target)).text();
      return new RegExp(`id="${id}"`).test(html);
    }, { target: pathname, id: hash });
    return { kind: 'anchor', ok: found, note: found ? `${pathname}#${hash} есть` : `${pathname}#${hash} НЕТ в разметке` };
  }
  const response = await page.evaluate(async (target) => {
    const r = await fetch(target, { redirect: 'follow' });
    const text = await r.text();
    return { status: r.status, notFound: text.includes('Такой страницы нет') };
  }, pathname);
  const ok = response.status === 200 && !response.notFound;
  return { kind: 'path', ok, note: `${pathname} → ${response.status}${response.notFound ? ', страница 404' : ''}` };
}

async function main() {
  fs.mkdirSync(REPORTS, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  const page = await context.newPage();
  await openHome(page);

  console.log('\nТупики приложения Г — базовая линия');

  await check('Г-1', '#availability: три входа в слоты ведут на существующий якорь', async () => {
    const links = await page.locator('a[href*="#"]').evaluateAll((els) =>
      els
        .filter((a) => /слот/i.test(a.textContent ?? ''))
        .map((a) => ({ label: a.textContent.trim().slice(0, 30), href: a.getAttribute('href') })),
    );
    must(links.length > 0, 'ссылок на слоты нет вовсе');
    const rows = [];
    for (const link of links) rows.push(`«${link.label}» ${link.href}: ${(await resolveLink(page, link.href)).note}`);
    const dead = rows.filter((r) => /НЕТ/.test(r));
    must(dead.length === 0, dead.join('; '));
    return rows.join('; ');
  });

  for (const [id, label] of [['Г-2', 'О проекте'], ['Г-3', 'Каталог клубов'], ['Г-4', 'Контакты']]) {
    await check(id, `подвал: «${label}» ведёт на существующую цель либо снята`, async () => {
      const link = page.locator('footer a', { hasText: label });
      if ((await link.count()) === 0) return `ссылки «${label}» в подвале нет — снята`;
      const href = await link.first().getAttribute('href');
      const r = await resolveLink(page, href);
      must(r.ok, `«${label}» → ${href}: ${r.note}`);
      return `«${label}» → ${href}: ${r.note}`;
    });
  }

  await check('Г-5', 'подвал не признаётся в заглушках', async () => {
    const text = await page.locator('footer').innerText();
    must(!/заглушк/i.test(text), `«${text.match(/[^\n]*заглушк[^\n]*/i)?.[0]}»`);
    return 'признания нет';
  });

  await check('Г-6', '«Рядом»: либо с обработчиком, либо снята', async () => {
    const btn = page.locator('button[aria-label="Определить район"], button', { hasText: /^Рядом$/ });
    if ((await btn.count()) === 0) return 'кнопки нет — снята';
    must(await hasHandler(btn.first(), 'onClick'), 'кнопка есть, обработчика нет');
    return 'кнопка с обработчиком';
  });

  // 38.79c: блок «Лидеры каталога» снят — тупик закрыт снятием; первая карточка
  // карусели «Клубы»/«Тренеры» — лидер по рейтингу, и она ссылка.
  await check('Г-7', 'лидер-клуб: блок снят (38.79c), первая карточка «Клубы» — ссылка на клуб', async () => {
    must((await page.locator('#leaders, section[aria-label="Лидеры каталога"]').count()) === 0, 'блок «Лидеры каталога» остался');
    const link = page.locator('#clubs [aria-label^="Карточка клуба"] a[href^="/clubs/"]');
    must((await link.count()) > 0, 'в карусели «Клубы» нет карточки со ссылкой на клуб');
    return `блока нет; первая карточка → ${await link.first().getAttribute('href')}`;
  });

  await check('Г-8', 'лидер-тренер: блок снят (38.79c), первая карточка «Тренеры» — ссылка на тренера', async () => {
    const link = page.locator('#trainers [aria-label^="Карточка тренера"] a[href^="/trainers/"]');
    must((await link.count()) > 0, 'в карусели «Тренеры» нет карточки со ссылкой на тренера');
    return `первая карточка → ${await link.first().getAttribute('href')}`;
  });

  await check('Г-9', '#results на /catalog висит на выдаче, а не на карте', async () => {
    await page.goto(`${BASE}/catalog`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2_000);
    const info = await page.evaluate(() => {
      const el = document.getElementById('results');
      if (!el) return null;
      return {
        cards: el.querySelectorAll('[data-testid="club-card"], [data-testid="trainer-card"], [aria-label^="Карточка"]').length,
        map: el.querySelectorAll('[data-testid="yandex-map-container"], [data-testid="map-skeleton"]').length,
      };
    });
    must(info !== null, '#results на /catalog нет');
    must(info.map === 0 && info.cards > 0, `#results: карточек ${info.cards}, карт ${info.map}`);
    await openHome(page);
    return `/catalog#results: карточек ${info.cards}, карты нет`;
  });

  await check('Г-10', 'подсветка мобильной навигации в хэш-пунктах живая', async () => {
    await openHome(page, 430);
    const nav = page.locator('nav[aria-label="Мобильная навигация"]');
    must(await nav.isVisible(), 'мобильной навигации не видно на 430');
    const rows = [];
    // 38.79c: док — Главная / Каталог / Слоты / Профиль; «Каталог» и «Слоты» ведут на /catalog.
    for (const label of ['Каталог', 'Слоты']) {
      const item = nav.locator('a', { hasText: label });
      if ((await item.count()) === 0) {
        rows.push(`«${label}»: пункта нет`);
        continue;
      }
      await item.first().click();
      await page.waitForTimeout(1_200);
      const current = await page.locator('nav[aria-label="Мобильная навигация"] a', { hasText: label }).first().getAttribute('aria-current');
      rows.push(`«${label}»: ${new URL(page.url()).pathname}, aria-current=${current ?? 'нет'}`);
      await openHome(page, 430);
    }
    must(rows.every((r) => /aria-current=(page|true|location)/.test(r)), rows.join('; '));
    await openHome(page);
    return rows.join('; ');
  });

  await check('Г-11', '#highlights: не дубль и не мёртвый', async () => {
    const info = await page.evaluate(() => ({
      ids: document.querySelectorAll('[id="highlights"]').length,
      links: document.querySelectorAll('a[href$="#highlights"]').length,
    }));
    if (info.ids === 0) return 'якоря #highlights нет — снят';
    must(info.ids === 1, `id=highlights объявлен ${info.ids} раз`);
    must(info.links > 0, 'якорь есть, ссылок на него ноль — мёртвый');
    return `один якорь, ссылок ${info.links}`;
  });

  await check('Г-12', 'MapPreviewSection мёртв — снят', async () => {
    must(!exists('components/map/MapPreviewSection.tsx'), 'файл MapPreviewSection.tsx на месте');
    must((await page.locator('[data-testid="map-placeholder"]').count()) === 0, 'map-placeholder в DOM');
    return 'файла нет, testid в DOM нет';
  });

  await check('Г-13', 'блок «популярное»: снят (38.79), вошёл в карусели витрины', async () => {
    const block = page.locator('#popular, section', { has: page.locator('[data-testid^="popular-"]') }).first();
    if ((await block.count()) === 0) return 'отдельного блока нет — снят, карусели «Клубы»/«Тренеры»';
    const heading = await block.locator('h2').first().innerText();
    const text = await block.innerText();
    must(!/рядом/i.test(heading) && !/без геолокации/i.test(text), `заголовок «${heading}»${/без геолокации/i.test(text) ? ', признание про геолокацию' : ''}`);
    return `заголовок «${heading}»`;
  });

  await check('Г-14', 'карусель одна: scrollBy( только в CardSlider, отдельных лент нет', async () => {
    const offenders = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && !full.includes(`${path.sep}test${path.sep}`)) {
          const code = fs.readFileSync(full, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
          if (/\bscrollBy\(/.test(code) && !full.endsWith('CardSlider.tsx')) offenders.push(path.relative(WEB, full));
        }
      }
    };
    walk(path.join(WEB, 'components'));
    const dom = await page.locator('[data-testid="popular-nearby-scroll"], [data-testid="popular-trainers-scroll"]').count();
    must(offenders.length === 0 && dom === 0, `scrollBy( вне CardSlider: ${offenders.join(', ') || 'нет'}; своих лент в DOM: ${dom}`);
    return 'scrollBy( только в CardSlider, своих лент в DOM нет';
  });

  await check('Г-15', 'hover имени тренера — классом, не строкой', async () => {
    const code = read('components/trainers/TrainerCard.tsx');
    const built = code.match(/hover:\$\{[^}]+\}/g) ?? [];
    must(built.length === 0, `класс собирается строкой: ${built.join(', ')}`);
    return 'собранных строкой hover-классов нет';
  });

  await check('Г-16', 'заглушки фото помечены STUB и записаны в реестр', async () => {
    const placeholders = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-testid="club-card"], [data-testid="trainer-card"], [aria-label^="Карточка"]'))
        .map((card) => card.innerText.match(/Фото preview|^Фото$/m)?.[0] ?? null)
        .filter(Boolean).length,
    );
    const registry = fs.existsSync(STUBS_REGISTRY) ? fs.readFileSync(STUBS_REGISTRY, 'utf8') : '';
    const rows = registry.split('\n').filter((line) => /^\|\s*`[^`]+`\s*\|/.test(line));
    const named = rows.some((row) => /фото/i.test(row));
    const marked = ['components/clubs/ClubCard.tsx', 'components/trainers/TrainerCard.tsx']
      .filter(exists)
      .filter((f) => /STUB:/.test(read(f)));
    must(placeholders === 0 || (named && marked.length > 0), `заглушек на экране ${placeholders}, в реестре о фото: ${named ? 'есть' : 'нет'}, STUB: в карточках: ${marked.join(', ') || 'нет'}`);
    return `заглушек на экране ${placeholders}; реестр ${named ? 'называет' : 'не называет'} фото; STUB: в ${marked.join(', ') || 'ни одной карточке'}`;
  });

  await check('Г-17', 'подпись «Подборки» снята (38.79c): ссылок с ней нет, подпись #discover — по содержимому', async () => {
    const links = await page.locator('a[href*="#discover"]').evaluateAll((els) => els.map((a) => a.textContent.trim()));
    const lying = links.filter((l) => /подборк/i.test(l));
    must(lying.length === 0, `ссылки «Подборки» остались: ${lying.join(' · ')}`);
    return links.length === 0 ? 'ссылок на #discover в каркасе нет' : `подписи к #discover: ${links.join(' · ')}`;
  });

  await check('Г-18', 'город в бейдже героя — из селектора (на /catalog), не строкой', async () => {
    // С 38.79a селектор города живёт на /catalog; бейдж героя читает тот же стор.
    // Возврат на главную — клиентской навигацией (стор без persist переживает только её).
    const hero = page.locator('main section').first();
    const before = await hero.innerText();
    await page.goto(`${BASE}/catalog`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1_500);
    const select = page.locator('select[aria-label="Выбор города"]');
    must((await select.count()) > 0, 'селектора города на /catalog нет');
    const current = await select.inputValue();
    const options = await select.locator('option').evaluateAll((els) => els.map((el) => el.value));
    const other = options.find((o) => o !== current);
    must(other, `второго города нет: ${options.join(', ')}`);
    must(new RegExp(current, 'i').test(before), `в герое нет текущего города «${current}»`);
    await select.selectOption(other);
    await page.waitForTimeout(800);
    await page.locator('header a[href="/"]').first().click();
    await page.waitForTimeout(1_500);
    const after = await page.locator('main section').first().innerText();
    must(new RegExp(other, 'i').test(after), `после смены на «${other}» герой всё ещё говорит «${after.match(/[^\n]*(Самара|Samara|Москва)[^\n]*/i)?.[0] ?? '…'}»`);
    return `${current} → ${other} на /catalog: бейдж героя следует за селектором`;
  });

  await browser.close();
}

function writeReport() {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = path.join(REPORTS, `phase-38-deadends-${stamp}.md`);
  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const rows = results.map((r) => `| ${r.id} | ${r.title} | ${r.status === 'pass' ? '✅' : '❌'} | ${String(r.detail).replace(/\|/g, '/').replace(/\n/g, ' ')} |`).join('\n');
  fs.writeFileSync(
    file,
    `# Восемнадцать тупиков приложения Г — проверка скриптом\n\n**Дата:** ${new Date().toISOString()}\n**Стенд:** ${BASE}\n**Скрипт:** \`tests/e2e-phase-38-deadends-check.mjs\` (гость, только чтение)\n**Итог:** ${pass} закрыто, ${fail} открыто из ${results.length}\n\n| # | Тупик | Статус | Что видно |\n| --- | --- | --- | --- |\n${rows}\n`,
    'utf8',
  );
  return { file, pass, fail };
}

try {
  await main();
} catch (error) {
  console.error('проверка прервана:', error);
  results.push({ id: 'run', title: 'проверка прервана', status: 'fail', detail: String(error?.message ?? error) });
} finally {
  const report = writeReport();
  console.log(`\nИтог: ${report.pass} закрыто, ${report.fail} открыто. Отчёт: ${report.file}`);
  process.exit(report.fail > 0 ? 1 : 0);
}
