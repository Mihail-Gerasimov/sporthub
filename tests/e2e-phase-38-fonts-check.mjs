// Независимый замер шрифтов и рубля — агент «Проверка», шаг 38.20 / чек-лист сценарий 11.
//
// ⚠️ Это восстановленный скрипт агента «Проверка» (написан 15.09 как
// `tests/e2e-phase-38-fonts.mjs`; тот файл перезаписан скриптом «Основы» —
// `tests/*.mjs` в `.gitignore`, версии нет). Имя сменено, чтобы больше не пересекаться.
//
// Метод отличается от скрипта «Основы» ровно там, где предупреждает файл фазы (раздел 7):
// `getComputedStyle().fontFamily` и `document.fonts.check()` по-глифовую подстановку
// НЕ видят. Поэтому:
//   1. три `span` со знаком `₽` — в стеке `--ui-font-display`, в рублёвом семействе
//      отдельно и в `serif`: первые две ширины равны, третья — нет (чек-лист step-72);
//   2. знак на РЕАЛЬНОЙ цене — по глифам через DevTools (`CSS.getPlatformFontsForNode`):
//      каждое семейство с числом взятых глифов, системных быть не должно;
//   3. H1 и абзац — тем же способом по глифам;
//   4. страница без цен: face рубля в `document.fonts` — `unloaded`;
//   5. дескрипторы face: `unicodeRange` строго `U+20BD`, `sizeAdjust` 94%.
//
// Запуск: node tests/e2e-phase-38-fonts-check.mjs   (стенд `npm run app:up` на :3000)
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE ?? 'http://localhost:3000';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SHOTS = path.join(HERE, 'screenshots', 'phase-38');
const REPORTS = path.join(HERE, 'reports');
/** Страница без цен — восстановление пароля. */
const PAGE_WITHOUT_PRICES = '/reset-password';

const results = [];

async function step(id, title, fn) {
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

/** Шрифты платформы у узла — по глифам, через DevTools-протокол. */
async function platformFonts(page, selector) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    if (!nodeId) return [];
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    return fonts.map((f) => ({ family: f.familyName, custom: f.isCustomFont, glyphs: f.glyphCount }));
  } finally {
    await cdp.detach();
  }
}

const fontsLine = (fonts) =>
  fonts.map((f) => `${f.family}${f.custom ? '' : ' (системный)'}: ${f.glyphs} гл.`).join(', ') || 'узел не найден';

/** Стек display-шрифта и его первое семейство — по замыслу рублёвый донор. */
async function displayStack(page) {
  return page.evaluate(() => {
    const stack = getComputedStyle(document.documentElement).getPropertyValue('--ui-font-display').trim();
    // `var(--font-ruble)` разворачивается только на элементе: берём вычисленное значение у body.
    const resolved = getComputedStyle(document.body).getPropertyValue('--ui-font-display').trim();
    const ruble = resolved.split(',')[0]?.trim() ?? '';
    return { stack: resolved || stack, ruble, rubleFamily: ruble.replace(/['"]/g, '') };
  });
}

/** Состояние face'ов семейства в `document.fonts` с дескрипторами. */
async function facesOf(page, family) {
  return page.evaluate(
    (name) =>
      Array.from(document.fonts)
        .filter((f) => f.family.replace(/['"]/g, '') === name)
        .map((f) => ({ weight: f.weight, status: f.status, unicodeRange: f.unicodeRange, sizeAdjust: f.sizeAdjust ?? '(нет)' })),
    family,
  );
}

/** Ширины `₽` в трёх шрифтах на текущей странице. */
async function rubleWidths(page, stackValue, rubleValue) {
  return page.evaluate(
    ({ stackValue, rubleValue }) => {
      const mk = (font) => {
        const s = document.createElement('span');
        s.textContent = '₽';
        s.style.cssText = `position:absolute;visibility:hidden;font:800 96px ${font}`;
        document.body.append(s);
        const w = Math.round(s.getBoundingClientRect().width * 100) / 100;
        s.remove();
        return w;
      };
      return { inStack: mk(stackValue), inRuble: mk(rubleValue), inSerif: mk('serif') };
    },
    { stackValue, rubleValue },
  );
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(REPORTS, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  const page = await context.newPage();

  await page.goto(`${BASE}${PAGE_WITHOUT_PRICES}`, { waitUntil: 'load' });
  await page.waitForTimeout(1_500);
  const stack = await displayStack(page);
  console.log(`Стек --ui-font-display: «${stack.stack}»; рублёвое семейство: «${stack.rubleFamily}»`);

  await step('fonts-1', 'страница без цен: на ней нет ₽', async () => {
    const hasPrice = await page.evaluate(() => /₽/.test(document.body.innerText));
    must(!hasPrice, `на ${PAGE_WITHOUT_PRICES} есть ₽`);
    return `${PAGE_WITHOUT_PRICES}: знака ₽ нет`;
  });

  await step('fonts-2', 'страница без цен: рублёвый face объявлен и unloaded', async () => {
    const faces = await facesOf(page, stack.rubleFamily);
    must(faces.length > 0, `face «${stack.rubleFamily}» в document.fonts нет`);
    const loaded = faces.filter((f) => f.status === 'loaded' || f.status === 'loading');
    must(loaded.length === 0, `грузится без цен: ${loaded.map((f) => `${f.weight} ${f.status}`).join(', ')}`);
    return `«${stack.rubleFamily}»: ${faces.map((f) => `${f.weight} ${f.status}`).join(', ')}`;
  });

  await step('fonts-3', 'дескрипторы face: unicode-range строго U+20BD, size-adjust 94%', async () => {
    const faces = await facesOf(page, stack.rubleFamily);
    must(faces.length > 0, 'face нет');
    const bad = faces.filter((f) => f.unicodeRange.replace(/\s/g, '').toUpperCase() !== 'U+20BD');
    must(bad.length === 0, `unicode-range не U+20BD: ${bad.map((f) => `${f.weight} «${f.unicodeRange}»`).join(', ')}`);
    const adjust = faces.filter((f) => String(f.sizeAdjust) !== '94%');
    must(adjust.length === 0, `size-adjust не 94%: ${adjust.map((f) => `${f.weight} «${f.sizeAdjust}»`).join(', ')}`);
    return faces.map((f) => `${f.weight}: ${f.unicodeRange}, size-adjust ${f.sizeAdjust}`).join('; ');
  });

  await step('fonts-4', 'три span с ₽: стек = рублёвый ≠ serif (step-72)', async () => {
    const before = await rubleWidths(page, stack.stack, stack.ruble);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const m = await rubleWidths(page, stack.stack, stack.ruble);
    must(m.inStack === m.inRuble, `₽ в стеке ${m.inStack}px ≠ в рублёвом ${m.inRuble}px`);
    must(m.inSerif !== m.inStack, `₽ в serif ${m.inSerif}px = в стеке — знак системный`);
    return `при 96px/800: стек ${m.inStack}px = рублёвый ${m.inRuble}px ≠ serif ${m.inSerif}px (первый замер до загрузки: ${before.inStack}/${before.inRuble}/${before.inSerif})`;
  });

  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForTimeout(2_500);

  await step('fonts-5', 'главная: face рубля loaded; знак на реальной цене — по глифам из собственного шрифта', async () => {
    const faces = await facesOf(page, stack.rubleFamily);
    must(faces.some((f) => f.status === 'loaded'), `face не загружен: ${faces.map((f) => `${f.weight} ${f.status}`).join(', ') || 'face нет'}`);
    const price = page.locator('main *', { hasText: /\d\s?₽/ }).last();
    must((await price.count()) > 0, 'цены со знаком ₽ на главной нет');
    await price.evaluate((el) => el.setAttribute('data-e2e-price', '1'));
    const fonts = await platformFonts(page, '[data-e2e-price="1"]');
    const system = fonts.filter((f) => !f.custom);
    must(system.length === 0, `часть цены из системного шрифта: ${fontsLine(fonts)}`);
    must(fonts.length >= 2, `рубль и цифры из одного файла? ${fontsLine(fonts)}`);
    await price.screenshot({ path: path.join(SHOTS, 'ruble-glyph-check.png') });
    return `«${(await price.innerText()).trim().replace(/\n/g, ' ').slice(0, 30)}» по глифам: ${fontsLine(fonts)}; face: ${faces.map((f) => `${f.weight} ${f.status}`).join(', ')}`;
  });

  await step('fonts-6', 'H1 главной: кириллица из display-шрифта по глифам, не из подстановки', async () => {
    const fonts = await platformFonts(page, 'h1');
    const system = fonts.filter((f) => !f.custom);
    must(system.length === 0, `H1 частично из системного шрифта: ${fontsLine(fonts)}`);
    must(fonts.some((f) => /Sofia Sans/i.test(f.family)), `в H1 нет Sofia: ${fontsLine(fonts)}`);
    return `H1 «${(await page.locator('h1').first().innerText()).slice(0, 40)}»: ${fontsLine(fonts)}`;
  });

  await step('fonts-7', 'абзац главной: Inter по глифам', async () => {
    const fonts = await platformFonts(page, 'main p');
    must(fonts.some((f) => /^Inter/i.test(f.family)) && fonts.every((f) => f.custom), `абзац: ${fontsLine(fonts)}`);
    return `абзац: ${fontsLine(fonts)}`;
  });

  await browser.close();
}

function writeReport() {
  const stamp = new Date().toISOString().slice(0, 10);
  const file = path.join(REPORTS, `phase-38-fonts-check-${stamp}.md`);
  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const rows = results.map((r) => `| ${r.id} | ${r.title} | ${r.status === 'pass' ? '✅' : '❌'} | ${String(r.detail).replace(/\|/g, '/').replace(/\n/g, ' ')} |`).join('\n');
  fs.writeFileSync(
    file,
    `# Независимый замер шрифтов и рубля — агент «Проверка», шаг 38.20\n\n**Дата:** ${new Date().toISOString()}\n**Стенд:** ${BASE}\n**Скрипт:** \`tests/e2e-phase-38-fonts-check.mjs\` (метод: три span + CDP по глифам)\n**Итог:** ${fail === 0 ? '✅' : '❌'} ${pass} из ${results.length}\n\n| ID | Проверка | Статус | Числа |\n| --- | --- | --- | --- |\n${rows}\n\nСнимок знака: \`tests/screenshots/phase-38/ruble-glyph-check.png\`\n`,
    'utf8',
  );
  return { file, pass, fail };
}

try {
  await main();
} catch (error) {
  console.error('замер прерван:', error);
  results.push({ id: 'run', title: 'замер прерван', status: 'fail', detail: String(error?.message ?? error) });
} finally {
  const report = writeReport();
  console.log(`\nИтог: ${report.pass} из ${results.length}. Отчёт: ${report.file}`);
  process.exit(report.fail > 0 ? 1 : 0);
}
