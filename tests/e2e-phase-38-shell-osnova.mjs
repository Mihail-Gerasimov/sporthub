// Браузерный проход по каркасу (шаг 38.63): шапка, меню ≤960, колокольчик, плашка
// пользователя, подвал, мобильный док, плашка подмены — числами, по эталону
// `tests/reports/phase-38-design-reference-2026-09-15.md`.
//
// Запуск: `E2E_RUN_TAG=ph38-shell node tests/e2e-phase-38-shell-osnova.mjs` при поднятом стенде.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

import { E2E_USERS, RUN_TAG, cleanupRun, readDb, seedRunUsers } from '../scripts/e2e-fixture.mjs';

const BASE = 'http://localhost:3000';
const PASSWORD = 'sporthub123';
const SHOTS = '/Users/misha/Desktop/prosport2.1/tests/screenshots/phase-38-shell';
const DATE = new Date().toISOString().slice(0, 10);
const REPORT = `/Users/misha/Desktop/prosport2.1/tests/reports/phase-38-shell-${DATE}.md`;

const results = [];

function step(id, title, ok, detail) {
  results.push({ id, title, ok, detail });
  console.log(`  ${ok ? '✅' : '❌'} ${id} ${title} — ${detail}`);
}

async function loginContext(browser, email, portal, viewport) {
  const context = await browser.newContext({ viewport });
  if (email) {
    const login = await context.request.post(`${BASE}/api/auth/login`, {
      data: { email, password: PASSWORD, ...(portal ? { portal } : {}) },
      headers: { origin: BASE },
    });
    if (login.status() !== 200) throw new Error(`вход ${email}: ${login.status()}`);
  }
  return context;
}

const box = (el) => el.evaluate((node) => {
  const r = node.getBoundingClientRect();
  const cs = getComputedStyle(node);
  return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y), bottom: Math.round(r.bottom), bg: cs.backgroundColor, pos: cs.position, z: cs.zIndex, radius: cs.borderRadius, shadow: cs.boxShadow, border: cs.borderBottomColor, font: cs.fontFamily.split(',')[0] };
});

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  const users = seedRunUsers();
  readDb(
    `INSERT INTO users (created_at, status, account_kind, name, email, phone, password_hash)
     VALUES (now(), 'active', 'admin', 'Прогон admin', '${RUN_TAG}-admin@test.local', '+7 (900) 555-00-09',
             (SELECT password_hash FROM users WHERE email='${E2E_USERS.client}'))
     ON CONFLICT (email) DO NOTHING;`,
  );
  const browser = await chromium.launch();

  try {
    // --- Шапка 1440, гость ---
    const guest = await loginContext(browser, null, null, { width: 1440, height: 900 });
    const page = await guest.newPage();
    await page.goto(BASE + '/', { waitUntil: 'load', timeout: 60_000 });
    const header = page.locator('header').first();
    const hb = await box(header);
    step('S1', 'Шапка 1440: высота 65 (64 + линия), sticky, белая, тень', hb.h === 65 && hb.pos === 'sticky' && hb.bg === 'rgb(255, 255, 255)' && hb.shadow !== 'none', `h=${hb.h} pos=${hb.pos} bg=${hb.bg} z=${hb.z} shadow=${hb.shadow}`);
    const inner = await box(header.locator('div').first());
    step('S2', 'Контейнер шапки: max-width 1440, боковой отступ 24', inner.w === 1440 && inner.x === 0 && (await header.locator('div').first().evaluate((n) => getComputedStyle(n).paddingLeft)) === '24px', `w=${inner.w} pl=${await header.locator('div').first().evaluate((n) => getComputedStyle(n).paddingLeft)}`);
    const navLinks = await page.locator('nav[aria-label="Основная навигация"] a').allTextContents();
    step('S3', 'Навигация: пять пунктов из словаря, «Командные»/«Маркет» → /coming-soon', navLinks.join('·') === 'Подборки·Выдача·Слоты·Командные·Маркет' && (await page.locator('nav[aria-label="Основная навигация"] a', { hasText: 'Маркет' }).getAttribute('href')) === '/coming-soon', navLinks.join(' · '));
    const item = await box(page.locator('nav[aria-label="Основная навигация"] a').first());
    step('S4', 'Пункт меню: 13px 600, радиус 9', item.radius === '9px' && (await page.locator('nav[aria-label="Основная навигация"] a').first().evaluate((n) => `${getComputedStyle(n).fontSize}/${getComputedStyle(n).fontWeight}`)) === '13px/600', `radius=${item.radius}`);
    const logo = page.locator('header [role="img"]').first();
    step('S5', 'Логотип: два бегуна + словомарка, ссылка на главную, имя площадки для диктора', (await logo.getAttribute('aria-label')) === 'ПРОСПОРТ' && (await logo.locator('svg').count()) === 2 && (await logo.locator('xpath=ancestor::a').getAttribute('href')) === '/', `aria-label=${await logo.getAttribute('aria-label')}`);
    const login = page.getByRole('button', { name: 'Войти' });
    const lb = await box(login);
    step('S6', 'Кнопка «Войти»: зелёная, радиус 12, свечение, display-шрифт', lb.bg === 'rgb(126, 217, 0)' && lb.radius === '12px' && lb.shadow.includes('126, 217, 0') && lb.font === 'ruble', `bg=${lb.bg} radius=${lb.radius} font=${lb.font} glow=${lb.shadow.includes('126, 217, 0')}`);
    await page.screenshot({ path: path.join(SHOTS, 'header-1440.png'), clip: { x: 0, y: 0, width: 1440, height: 80 } });

    // --- Подвал ---
    const footer = page.locator('footer');
    await footer.scrollIntoViewIfNeeded();
    const fb = await box(footer);
    const footerLinks = await footer.locator('nav a').allTextContents();
    step('S7', 'Подвал: тёмная плашка, логотип на главную, ссылки словаря, копирайт с годом', fb.bg === 'rgb(17, 17, 17)' && footerLinks.length === 5 && (await footer.locator('a[aria-label="На главную"]').getAttribute('href')) === '/' && (await footer.textContent()).includes(`© ${new Date().getFullYear()} ПРОСПОРТ`), `bg=${fb.bg} h=${fb.h} ссылки: ${footerLinks.join(' · ')}`);
    step('S8', 'Подвал: блока «Статус» и признания про заглушки нет', !(await footer.textContent()).includes('Статус') && !(await footer.textContent()).includes('заглушк'), 'текст подвала чист');
    await footer.screenshot({ path: path.join(SHOTS, 'footer-1440.png') });
    await page.close();

    // --- Меню при 800 ---
    const narrow = await guest.newPage();
    await narrow.setViewportSize({ width: 800, height: 900 });
    await narrow.goto(BASE + '/', { waitUntil: 'load', timeout: 60_000 });
    const navHidden = await narrow.locator('nav[aria-label="Основная навигация"]').isHidden();
    const burger = narrow.getByRole('button', { name: 'Открыть меню' });
    step('S9', '800: навигация спрятана, есть кнопка меню', navHidden && (await burger.isVisible()), `nav hidden=${navHidden}`);
    await burger.click();
    const panel = narrow.getByRole('navigation', { name: 'Меню' });
    const pb = await box(panel);
    const overlayBg = await narrow.locator('header [aria-hidden="true"].absolute').first().evaluate((n) => getComputedStyle(n).backgroundColor);
    const firstItem = await box(panel.locator('a').first());
    const panelPad = await panel.evaluate((n) => { const cs = getComputedStyle(n); return `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom}`; });
    // `top-full` считает от padding-box шапки (64) — панель накрывает её нижнюю линию, это и нужно.
    step('S10', 'Панель: под шапкой (top 64), отступы 12/20/18, тень; оверлей чернила/35; пункт 47px display-шрифтом', pb.y === 64 && panelPad === '12px 20px 18px' && pb.shadow !== 'none' && /\/ 0\.35\)$/.test(overlayBg) && firstItem.h === 47 && firstItem.font === 'ruble', `top=${pb.y} pad=${panelPad} overlay=${overlayBg} item h=${firstItem.h} font=${firstItem.font}`);
    const focusedText = await narrow.evaluate(() => document.activeElement?.textContent);
    await narrow.keyboard.press('Escape');
    const closed = await panel.isHidden();
    const focusBack = await narrow.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    step('S11', 'Первый пункт в фокусе; Escape закрывает, фокус возвращается на кнопку', focusedText === 'Подборки' && closed && focusBack === 'Открыть меню', `focus=${focusedText} → ${focusBack}`);
    await burger.click();
    await narrow.screenshot({ path: path.join(SHOTS, 'menu-800.png'), clip: { x: 0, y: 0, width: 800, height: 420 } });
    await narrow.locator('header [aria-hidden="true"].absolute').first().click({ position: { x: 400, y: 380 } });
    step('S12', 'Клик по оверлею закрывает меню', await panel.isHidden(), 'закрыто');
    await narrow.close();

    // --- Мобильный док при 390 ---
    const phone = await guest.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(BASE + '/', { waitUntil: 'load', timeout: 60_000 });
    const dock = phone.locator('nav[aria-label="Мобильная навигация"]');
    const db = await box(dock);
    const tabs = await dock.locator('a').allTextContents();
    step('S13', '390: док по низу экрана, четыре вкладки, активна «Главная»', db.pos === 'fixed' && db.bottom === 844 && tabs.join('·') === 'Главная·Поиск·Слоты·Профиль' && (await dock.locator('a[aria-current="page"]').textContent()) === 'Главная', `bottom=${db.bottom} tabs=${tabs.join(' · ')}`);
    await phone.goto(BASE + '/#discover', { waitUntil: 'load', timeout: 60_000 });
    await phone.waitForTimeout(300);
    step('S14', 'Хэш #discover подсвечивает «Поиск»', (await dock.locator('a[aria-current="page"]').textContent()) === 'Поиск', `active=${await dock.locator('a[aria-current="page"]').textContent()}`);
    await phone.getByRole('button', { name: 'Открыть меню' }).click();
    step('S15', 'При открытом меню док спрятан', (await dock.count()) === 0, `dock count=${await dock.count()}`);
    await phone.keyboard.press('Escape');
    step('S16', 'После закрытия меню док вернулся', (await dock.count()) === 1, `dock count=${await dock.count()}`);
    await phone.screenshot({ path: path.join(SHOTS, 'dock-390.png') });
    await phone.close();
    await guest.close();

    // --- Вошедший: колокольчик и плашка ---
    const client = await loginContext(browser, E2E_USERS.client, null, { width: 1440, height: 900 });
    const cp = await client.newPage();
    await cp.goto(BASE + '/', { waitUntil: 'load', timeout: 60_000 });
    const bell = cp.getByRole('button', { name: /Уведомления/ });
    const bb = await box(bell);
    step('S17', 'Колокольчик: 38×38, радиус 11, светлый фон, обводка', bb.w === 38 && bb.h === 38 && bb.radius === '11px' && bb.bg === 'rgb(244, 246, 249)', `w=${bb.w} h=${bb.h} radius=${bb.radius} bg=${bb.bg}`);
    const avatar = cp.getByRole('link', { name: /Перейти в кабинет/ });
    const described = await avatar.getAttribute('aria-describedby');
    const hintText = described ? await cp.locator(`[id="${described}"]`).textContent().catch(() => null) : null;
    step('S18', 'Плашка: имя и кабинет; аватар описан полным именем через Hint', (await cp.locator('header p', { hasText: 'Прогон client' }).count()) === 1 && hintText === 'Прогон client' && (await cp.locator('header p[title]').count()) === 0, `describedby=${described} hint=${hintText}`);
    await avatar.focus();
    const hintVisible = await cp.locator(`[id="${described}"]`).evaluate((n) => getComputedStyle(n).visibility !== 'hidden' && getComputedStyle(n).opacity !== '0');
    step('S19', 'Фокус на аватаре показывает подсказку', hintVisible, `visible=${hintVisible}`);
    await cp.screenshot({ path: path.join(SHOTS, 'header-user-1440.png'), clip: { x: 0, y: 0, width: 1440, height: 80 } });
    await cp.close();
    await client.close();

    // --- Администратор и плашка подмены ---
    const admin = await loginContext(browser, `${RUN_TAG}-admin@test.local`, 'service', { width: 800, height: 900 });
    const ap = await admin.newPage();
    await ap.goto(BASE + '/', { waitUntil: 'load', timeout: 60_000 });
    const targetId = users[E2E_USERS.client];
    const imp = await ap.evaluate(async (id) => (await fetch(`/api/auth/impersonate/${id}`, { method: 'POST' })).status, targetId);
    await ap.goto(BASE + '/', { waitUntil: 'load', timeout: 60_000 });
    const banner = ap.locator('text=Вы работаете от имени').first();
    const bannerBox = await banner.locator('xpath=ancestor::div[contains(@class,"bg-orange")]').first().evaluate((n) => { const r = n.getBoundingClientRect(); const cs = getComputedStyle(n); return { y: Math.round(r.y), h: Math.round(r.height), bg: cs.backgroundColor, color: cs.color }; });
    step('S20', 'Плашка подмены над шапкой: оранжевая, тёмный текст', imp === 200 && bannerBox.y === 0 && bannerBox.bg === 'rgb(249, 115, 22)' && bannerBox.color === 'rgb(17, 17, 17)', `impersonate=${imp} y=${bannerBox.y} h=${bannerBox.h} bg=${bannerBox.bg}`);
    await ap.getByRole('button', { name: 'Открыть меню' }).click();
    const panel2 = await box(ap.getByRole('navigation', { name: 'Меню' }));
    const headerBox = await box(ap.locator('header').first());
    // Панель начинается от padding-box шапки: на 1px выше её нижней линии — как и без плашки.
    step('S21', 'С плашкой подмены панель меню начинается ПОД шапкой, а не на ней', headerBox.y > 0 && panel2.y === headerBox.y + headerBox.h - 1, `плашка над шапкой: шапка y=${headerBox.y}; панель y=${panel2.y}, низ шапки=${headerBox.y + headerBox.h}`);
    await ap.screenshot({ path: path.join(SHOTS, 'impersonation-menu-800.png'), clip: { x: 0, y: 0, width: 800, height: 460 } });
    await ap.keyboard.press('Escape');
    await ap.evaluate(() => fetch('/api/auth/impersonate/stop', { method: 'POST' }));
    await ap.close();
    await admin.close();
  } finally {
    await browser.close();
    const passed = results.filter((r) => r.ok).length;
    fs.writeFileSync(
      REPORT,
      [
        '# Phase 38 — браузерный проход по каркасу (шаг 38.63)',
        '',
        `**Дата:** ${DATE} · **Стенд:** ${BASE} (контейнер \`sporthub_web\` после \`npm run app:up\`) · **Признак прогона:** \`${RUN_TAG}\``,
        `**Итог:** ${passed} из ${results.length}`,
        '',
        '| # | Проверка | Итог | Что намерено |',
        '| --- | --- | --- | --- |',
        ...results.map((r) => `| ${r.id} | ${r.title} | ${r.ok ? '✅' : '❌'} | ${r.detail} |`),
        '',
        'Скриншоты: `tests/screenshots/phase-38-shell/`.',
        '',
      ].join('\n'),
    );
    console.log(`\nОтчёт: ${REPORT}`);
    console.log(`уборка: ${JSON.stringify(cleanupRun())}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
