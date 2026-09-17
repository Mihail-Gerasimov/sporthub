// Браузерный проход по семи брейкпоинтам (шаг 38.87): каждая точка с обеих сторон
// (N−1 и N) плюс 430 — раскладка двух страниц числами (38.79b: главная — макет,
// рабочая часть на `/catalog`): колонка героя, навигация шапки и кнопка меню (960),
// док (768), сетки «возможностей» и «трёх шагов», слайды каруселей витрины «Клубы»/
// «Тренеры»; на каталоге — слайды выдачи в обоих режимах; горизонтальная прокрутка.
// Только чтение. Скриншоты — во всю страницу и окно.
//
// Запуск: `node tests/e2e-phase-38-responsive-osnova.mjs` при поднятом стенде
// (гостевой вид — данные прогона не нужны).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const SHOTS = '/Users/misha/Desktop/prosport2.1/tests/screenshots/phase-38-responsive';
const DATE = new Date().toISOString().slice(0, 10);
const REPORT = `/Users/misha/Desktop/prosport2.1/tests/reports/phase-38-responsive-two-pages-${DATE}.md`;

/** Семь точек словаря и 430: каждая — с обеих сторон. */
const POINTS = [1920, 1440, 1280, 1100, 1024, 960, 768, 480];
const WIDTHS = [...new Set(POINTS.flatMap((p) => [p - 1, p])), 430].sort((a, b) => b - a);

/** Ожидания раскладки по ширине — контракт `responsive-contract.test.tsx`. */
function expected(width) {
  return {
    heroAside: width >= 1280,
    headerNav: width >= 960,
    menuButton: width < 960,
    dock: width < 768,
    features: width >= 1024 ? 4 : width >= 480 ? 2 : 1,
    steps: width >= 768 ? 3 : 1,
    clubs: width >= 1280 ? 3 : width >= 768 ? 2 : 1,
    trainers: width >= 1280 ? 4 : width >= 768 ? 2 : 1,
  };
}

const PAGES = ['/', '/catalog'];

const results = [];
function step(id, title, ok, detail) {
  results.push({ id, title, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${id} ${title} — ${detail}`);
}

/** Раскладка страницы числами — одним вызовом в браузере. */
async function measure(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const columns = (el) =>
      el ? getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length : 0;
    const slidesPerRow = (root) => {
      const slide = root?.querySelector('[data-card-slider-slide]');
      const rail = root?.querySelector('[data-card-slider-rail]');
      if (!slide || !rail) return 0;
      return Math.round(rail.getBoundingClientRect().width / slide.getBoundingClientRect().width);
    };
    const featuresList = document.querySelector('#features ul');
    const stepsList = document.querySelector('#steps ol');
    const showcaseClubs = document.querySelector('#clubs');
    const showcaseTrainers = document.querySelector('#trainers');
    const catalog = document.querySelector('#results');
    const headerNav = document.querySelector('header nav[aria-label="Основная навигация"]');
    const menuButton = document.querySelector('header button[aria-label="Открыть меню"]');
    const dock = [...document.querySelectorAll('nav')].find(
      (n) => getComputedStyle(n).position === 'fixed',
    );
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      heroAside: visible(document.querySelector('[data-hero-aside]')),
      headerNav: visible(headerNav),
      menuButton: visible(menuButton),
      dock: visible(dock),
      features: columns(featuresList),
      steps: columns(stepsList),
      showcaseClubs: slidesPerRow(showcaseClubs),
      showcaseTrainers: slidesPerRow(showcaseTrainers),
      catalogSlides: slidesPerRow(catalog),
      // Секции верхнего уровня — как считает сторож anchors-exist (вложенные — слайдеры).
      sections: [...document.querySelectorAll('main section[id]')]
        .filter((s) => s.parentElement?.closest('section') === null)
        .map((s) => s.id),
    };
  });
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  try {
    for (const route of PAGES) {
      for (const width of WIDTHS) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage();
        await page.goto(BASE + route, { waitUntil: 'load', timeout: 60_000 });
        await page.waitForTimeout(600);

        const want = expected(width);
        const got = await measure(page);
        const tag = route === '/' ? 'home' : 'catalog';
        const id = `${tag}@${width}`;

        step(id, 'нет горизонтальной прокрутки', got.scrollWidth <= got.innerWidth,
          `scrollWidth ${got.scrollWidth} / окно ${got.innerWidth}`);
        step(id, 'навигация шапки', got.headerNav === want.headerNav,
          `видна: ${got.headerNav}, ожидание ${want.headerNav}`);
        step(id, 'кнопка меню', got.menuButton === want.menuButton,
          `видна: ${got.menuButton}, ожидание ${want.menuButton}`);
        step(id, 'док', got.dock === want.dock, `виден: ${got.dock}, ожидание ${want.dock}`);

        if (route === '/') {
          step(id, 'секции главной — шесть, по словарю', got.sections.join(',') === 'hero,steps,features,clubs,trainers,cta',
            got.sections.join(','));
          step(id, 'колонка героя', got.heroAside === want.heroAside,
            `видна: ${got.heroAside}, ожидание ${want.heroAside}`);
          step(id, '«возможности» колонок', got.features === want.features,
            `${got.features}, ожидание ${want.features}`);
          step(id, '«три шага» колонок', got.steps === want.steps, `${got.steps}, ожидание ${want.steps}`);
          step(id, 'карусель «Клубы» в ряд', got.showcaseClubs === want.clubs,
            `${got.showcaseClubs}, ожидание ${want.clubs}`);
          step(id, 'карусель «Тренеры» в ряд', got.showcaseTrainers === want.trainers,
            `${got.showcaseTrainers}, ожидание ${want.trainers}`);
        } else {
          step(id, 'секции каталога — четыре, по словарю', got.sections.join(',') === 'discover,map,results,availability',
            got.sections.join(','));
          step(id, 'выдача клубов в ряд', got.catalogSlides === want.clubs,
            `${got.catalogSlides}, ожидание ${want.clubs}`);
          // Режим тренеров — тем же сегментом блока поиска.
          await page.locator('#discover button', { hasText: 'Тренеры' }).first().click();
          await page.waitForTimeout(200);
          const gotTrainers = await measure(page);
          step(id, 'выдача тренеров в ряд', gotTrainers.catalogSlides === want.trainers,
            `${gotTrainers.catalogSlides}, ожидание ${want.trainers}`);
          step(id, 'после переключения прокрутки нет', gotTrainers.scrollWidth <= gotTrainers.innerWidth,
            `scrollWidth ${gotTrainers.scrollWidth}`);
          await page.locator('#discover button', { hasText: 'Клубы' }).first().click();
        }

        // Точка меню с узкой стороны: меню открывается, Escape закрывает, фокус на кнопке.
        if (width < 960) {
          const button = page.locator('header button[aria-label="Открыть меню"]');
          await button.click();
          const opened = await page.locator('header nav[aria-label="Меню"]').isVisible();
          await page.keyboard.press('Escape');
          await page.waitForTimeout(100);
          const closed = !(await page.locator('header nav[aria-label="Меню"]').isVisible());
          const focused = await page.evaluate(
            () => document.activeElement?.getAttribute('aria-label') === 'Открыть меню',
          );
          step(id, 'меню шапки: открылось, Escape закрыл, фокус на кнопке', opened && closed && focused,
            `открылось ${opened}, закрылось ${closed}, фокус ${focused}`);
        }

        await page.screenshot({ path: path.join(SHOTS, `${tag}-${width}.png`), fullPage: true });
        await page.screenshot({ path: path.join(SHOTS, `${tag}-${width}-top.png`) });
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const ok = results.filter((r) => r.ok).length;
  const lines = [
    `# Адаптив главной — браузерный проход (шаг 38.87), ${DATE}`,
    '',
    `Стенд \`npm run app:up\` (чистый HEAD, только чтение), Chromium (Playwright), гостевой вид, высота окна 900; страницы \`/\` и \`/catalog\`.`,
    `Ширины: ${WIDTHS.join(', ')} — семь точек словаря (sm 480, md 768, menu 960, lg 1024, xl 1280, xxl 1440, 2k 1920) с обеих сторон, плюс 1100 (точка эталона, отступление 24b) и 430.`,
    `Ожидания — из \`responsive-contract.test.tsx\`: колонка героя с 1280, навигация шапки с 960, док до 768, «возможности» 1→2→4 (480/1024), «три шага» 1→3 (768), карусели витрины «Клубы» 1→2→3 и «Тренеры» 1→2→4 (768/1280), выдача каталога теми же слайдами; главная — шесть секций словаря, каталог — четыре.`,
    `Скриншоты: \`tests/screenshots/phase-38-responsive/<страница>-<ширина>.png\` (во всю страницу) и \`…-top.png\` (окно: шапка, док).`,
    '',
    `**Итог: ${ok} из ${results.length}.**`,
    '',
    '| Страница@ширина | Проверка | Итог | Замер |',
    '| --- | --- | --- | --- |',
    ...results.map((r) => `| ${r.id} | ${r.title} | ${r.ok ? '✅' : '❌'} | ${r.detail} |`),
    '',
  ];
  fs.writeFileSync(REPORT, lines.join('\n'));
  console.log(`\nИтог: ${ok} из ${results.length}. Отчёт: ${REPORT}`);
  process.exitCode = ok === results.length ? 0 : 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
