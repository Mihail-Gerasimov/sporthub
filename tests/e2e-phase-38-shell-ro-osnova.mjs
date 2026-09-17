// Каркас на двух страницах, только чтение (пересдача 38.63 после 38.79c): шапка, навигация
// по макету, «Войти», подвал, меню ≤960, док ≤768 с подсветкой по адресу и хэшу —
// на `/` и `/catalog`, гость. Части с входом (плашка человека, колокольчик, плашка
// подмены) проверены в `e2e-phase-38-shell-osnova.mjs` (38.63) и здесь не повторяются:
// стенд у «Проверки», данных прогона не заводится.
//
// Запуск: `node tests/e2e-phase-38-shell-ro-osnova.mjs` при поднятом стенде.
import fs from 'node:fs';
import { chromium } from 'playwright';

const BASE = 'http://localhost:3000';
const DATE = new Date().toISOString().slice(0, 10);
const REPORT = `/Users/misha/Desktop/prosport2.1/tests/reports/phase-38-shell-two-pages-${DATE}.md`;
const NAV = ['Клубы', 'Тренеры', 'Как это работает', 'Возможности', 'Командные', 'Маркет'];
const DOCK = ['Главная', 'Каталог', 'Слоты', 'Профиль'];

const results = [];
function step(id, title, ok, detail) {
  results.push({ id, title, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${id} ${title} — ${detail}`);
}

const box = (el) =>
  el.evaluate((node) => {
    const r = node.getBoundingClientRect();
    const cs = getComputedStyle(node);
    return {
      h: Math.round(r.height),
      y: Math.round(r.y),
      bottom: Math.round(r.bottom),
      bg: cs.backgroundColor,
      pos: cs.position,
      radius: cs.borderRadius,
      shadow: cs.boxShadow,
      font: cs.fontFamily.split(',')[0],
    };
  });

async function shellOn(browser, route) {
  const tag = route === '/' ? 'home' : 'catalog';

  // 1440 — шапка, навигация, подвал
  const wide = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await wide.newPage();
  await page.goto(BASE + route, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(500);

  const header = page.locator('header').first();
  const hb = await box(header);
  step(`${tag}-S1`, 'шапка 1440: 65px (64 + линия), sticky, белая',
    hb.h === 65 && hb.pos === 'sticky' && hb.bg === 'rgb(255, 255, 255)', `h=${hb.h} pos=${hb.pos} bg=${hb.bg}`);

  const navLinks = await page.locator('nav[aria-label="Основная навигация"] a').evaluateAll((els) =>
    els.map((a) => [a.textContent.trim(), a.getAttribute('href')]),
  );
  step(`${tag}-S2`, 'навигация — шесть пунктов макета, адреса из словарей',
    navLinks.map((l) => l[0]).join('·') === NAV.join('·') &&
      navLinks[0][1] === '/catalog#results' && navLinks[1][1] === '/catalog#results' &&
      navLinks[2][1] === '/#steps' && navLinks[3][1] === '/#features' &&
      navLinks[4][1] === '/coming-soon' && navLinks[5][1] === '/coming-soon',
    navLinks.map((l) => `${l[0]}→${l[1]}`).join(' '));

  // «Тренеры» переключает режим: после клика на каталоге активен сегмент «Тренеры»
  await page.locator('nav[aria-label="Основная навигация"] a', { hasText: 'Тренеры' }).click();
  await page.waitForURL(/\/catalog#results/, { timeout: 10_000 });
  await page.waitForTimeout(400);
  const trainersPressed = await page.locator('#discover button', { hasText: 'Тренеры' }).first().getAttribute('aria-pressed');
  step(`${tag}-S3`, '«Тренеры» в шапке: переход на /catalog#results и режим стора — тренеры',
    trainersPressed === 'true', `url=${page.url().replace(BASE, '')} aria-pressed=${trainersPressed}`);
  await page.goto(BASE + route, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const login = page.getByRole('button', { name: 'Войти' });
  const lb = await box(login);
  step(`${tag}-S4`, '«Войти»: зелёная, радиус 12, свечение, display-шрифт',
    lb.bg === 'rgb(126, 217, 0)' && lb.radius === '12px' && lb.shadow !== 'none' && /Sofia|ruble/i.test(lb.font),
    `bg=${lb.bg} r=${lb.radius} font=${lb.font}`);

  const footer = page.locator('footer').first();
  const fb = await box(footer);
  const footerLinks = await footer.locator('nav a').evaluateAll((els) => els.map((a) => a.textContent.trim()));
  const footerText = await footer.textContent();
  step(`${tag}-S5`, 'подвал: тёмная плашка, шесть ссылок словаря, копирайт с годом, без «Статус» и признаний',
    fb.bg === 'rgb(17, 17, 17)' && footerLinks.join('·') === NAV.join('·') &&
      footerText.includes(String(new Date().getFullYear())) && !footerText.includes('Статус') && !/заглуш/.test(footerText),
    `bg=${fb.bg} links=${footerLinks.join('·')}`);
  await wide.close();

  // 800 — меню
  const mid = await browser.newContext({ viewport: { width: 800, height: 900 } });
  const p2 = await mid.newPage();
  await p2.goto(BASE + route, { waitUntil: 'load', timeout: 60_000 });
  await p2.waitForTimeout(400);
  const navHidden = await p2.locator('nav[aria-label="Основная навигация"]').isHidden();
  const burger = p2.locator('header button[aria-label="Открыть меню"]');
  step(`${tag}-S6`, '800: навигация спрятана, кнопка меню есть', navHidden && (await burger.isVisible()), `navHidden=${navHidden}`);
  await burger.click();
  await p2.waitForTimeout(200);
  const panel = p2.locator('header nav[aria-label="Меню"]');
  const pb = await box(panel);
  const items = await panel.locator('a').evaluateAll((els) => els.map((a) => a.textContent.trim()));
  const focusedText = await p2.evaluate(() => document.activeElement?.textContent?.trim());
  step(`${tag}-S7`, 'панель под шапкой (top 64), шесть пунктов словаря, первый в фокусе',
    pb.y === 64 && items.join('·') === NAV.join('·') && focusedText === NAV[0], `top=${pb.y} items=${items.join('·')} focus=«${focusedText}»`);
  await p2.keyboard.press('Escape');
  await p2.waitForTimeout(150);
  const focusBack = await p2.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  step(`${tag}-S8`, 'Escape закрывает, фокус на кнопке', (await panel.isHidden()) && focusBack === 'Открыть меню', `focus=${focusBack}`);
  await mid.close();

  // 390 — док
  const narrow = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p3 = await narrow.newPage();
  await p3.goto(BASE + route, { waitUntil: 'load', timeout: 60_000 });
  await p3.waitForTimeout(400);
  const dock = p3.locator('nav[aria-label="Мобильная навигация"]');
  const db = await box(dock);
  const tabs = await dock.locator('a').evaluateAll((els) => els.map((a) => a.textContent.trim()));
  const active = await dock.locator('a[aria-current="page"]').evaluateAll((els) => els.map((a) => a.textContent.trim()));
  step(`${tag}-S9`, '390: док по низу, четыре вкладки, активна своя страница',
    db.pos === 'fixed' && db.bottom === 844 && tabs.join('·') === DOCK.join('·') && active.join() === (route === '/' ? 'Главная' : 'Каталог'),
    `pos=${db.pos} bottom=${db.bottom} tabs=${tabs.join('·')} active=${active.join()}`);
  await dock.locator('a', { hasText: 'Слоты' }).click();
  await p3.waitForURL(/\/catalog#availability/, { timeout: 10_000 });
  await p3.waitForTimeout(300);
  const activeAfter = await p3.locator('nav[aria-label="Мобильная навигация"] a[aria-current="page"]').evaluateAll((els) => els.map((a) => a.textContent.trim()));
  step(`${tag}-S10`, 'док: «Слоты» → /catalog#availability, подсветка на «Слоты»', activeAfter.join() === 'Слоты', `url=${p3.url().replace(BASE, '')} active=${activeAfter.join()}`);
  await narrow.close();
}

async function main() {
  const browser = await chromium.launch();
  try {
    await shellOn(browser, '/');
    await shellOn(browser, '/catalog');
  } finally {
    await browser.close();
  }
  const ok = results.filter((r) => r.ok).length;
  const lines = [
    `# Каркас на двух страницах — пересдача после 38.79c (только чтение), ${DATE}`,
    '',
    'Стенд чистый HEAD, гость, без данных прогона. Шапка/подвал/меню/док на `/` и `/catalog`.',
    'Части с входом (плашка человека, колокольчик, плашка подмены) — отчёт 38.63, здесь не повторяются.',
    '',
    `**Итог: ${ok} из ${results.length}.**`,
    '',
    '| # | Проверка | Итог | Замер |',
    '| --- | --- | --- | --- |',
    ...results.map((r) => `| ${r.id} | ${r.title} | ${r.ok ? '✅' : '❌'} | ${r.detail.replace(/\|/g, '/')} |`),
    '',
  ];
  fs.writeFileSync(REPORT, lines.join('\n'));
  console.log(`\nИтог: ${ok} из ${results.length}. Отчёт: ${REPORT}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
