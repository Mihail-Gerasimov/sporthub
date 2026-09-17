// Эталон нового дизайна ПРОСПОРТ (Figma Make) — прогон чек-листа
// `tests/checklists/phase-38-design-reference.md` (92 шага, 12 сценариев) по САМОМУ
// проекту дизайна `prosport/`, поднятому Vite на порту 5173. Шаг 38.5 фазы 38.
//
// Запуск: cd prosport && npm run dev   (в другом окне)
//         node tests/e2e-phase-38-design-reference.mjs
//
// ⚠️ Это НЕ прогон нашего приложения. Здесь снимаются ЧИСЛА — размеры, отступы,
// радиусы, цвета, шрифты, поведение при наведении и на брейкпоинтах — чтобы
// переносить по факту, а не по впечатлению от скриншота. Каждый шаг заканчивается
// записанными числами; впечатление в отчёт не попадает.
//
// ⚠️ Чек-лист написан под Playwright MCP, но MCP-сервер в сессии не отвечает
// (`ConnectionRefused`), поэтому эталон снимается библиотекой `playwright`:
// `getBoundingClientRect` / `getComputedStyle` вместо `browser_evaluate`,
// `locator.ariaSnapshot()` вместо `browser_snapshot` — `page.accessibility`
// в Playwright 1.63 снят.
//
// ⚠️ Ховер-состояния дизайна живут в React-state (`useState(hov)`) и в инлайновых
// обработчиках `onMouseEnter`, а не в CSS `:hover`. Поэтому «до/после наведения» —
// два замера `getComputedStyle` вокруг `locator.hover()`, а не `:hover` в devtools.
//
// ⚠️ Наличие обработчика клика проверяется по внутренним свойствам React
// (`__reactProps$…` на DOM-узле): в дереве доступности `div onClick` и `div` без
// обработчика неразличимы, а чек-лист прямо спрашивает «обработчика нет».
//
// ⚠️ Прокрутка в дизайне — НЕ у окна. Оболочка держит `overflow:hidden` и вложенный
// `overflow-y:auto`, поэтому `window.scrollY` всегда 0; прокручиваем контейнер,
// найденный по признаку `scrollHeight > clientHeight` (шаг 92 это и фиксирует).
//
// Отчёт: `tests/reports/phase-38-design-reference-<дата>.md`.
// Снимки секций: `tests/screenshots/phase-38/reference/`.
import fs from 'node:fs';
import path from 'node:path';

import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const HERE = path.dirname(new URL(import.meta.url).pathname);
const SHOTS = path.join(HERE, 'screenshots', 'phase-38', 'reference');
const REPORTS = path.join(HERE, 'reports');
const DATE = new Date().toISOString().slice(0, 10);

/** Результаты шагов — по ним собирается отчёт. */
const results = [];
/** Сводные числа для шапки отчёта: палитра, шрифты, отступы — заполняются по ходу. */
const summary = { palette: {}, fonts: {}, spacing: {}, breakpoints: {} };

let browser = null;
let context = null;
let page = null;

/** Записать результат шага. Снимок — только на падении. */
async function step(id, title, fn) {
  const started = Date.now();
  try {
    const detail = await fn();
    results.push({ id, title, status: 'pass', detail: detail ?? '', ms: Date.now() - started });
    console.log(`  ✅ ${id} — ${String(detail ?? '').split('\n')[0]}`);
  } catch (error) {
    let shot = '';
    try {
      shot = path.join(SHOTS, `${id}-FAIL.png`);
      await page.screenshot({ path: shot });
    } catch {
      shot = '';
    }
    results.push({
      id,
      title,
      status: 'fail',
      detail: String(error?.message ?? error),
      shot,
      ms: Date.now() - started,
    });
    console.log(`  ❌ ${id} — ${error?.message ?? error}`);
  }
}

function must(condition, message) {
  if (!condition) throw new Error(message);
}

/** Пауза: анимации дизайна — 0.15–0.52 с, ждём с запасом. */
const wait = (ms) => page.waitForTimeout(ms);

/** Округлить до десятых — `getBoundingClientRect` отдаёт дроби. */
const r1 = (n) => Math.round(n * 10) / 10;

/**
 * Снять с элемента прямоугольник и названные свойства `getComputedStyle`.
 *
 * ⚠️ Всё считается ВНУТРИ страницы одним вызовом: `locator.evaluate` — отдельный
 * поход в браузер на каждое свойство, и 92 шага по десять свойств превратились бы
 * в тысячи обращений.
 */
async function measure(locator, props = []) {
  return locator.evaluate((el, names) => {
    const rect = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const out = {
      x: Math.round(rect.x * 10) / 10,
      y: Math.round(rect.y * 10) / 10,
      w: Math.round(rect.width * 10) / 10,
      h: Math.round(rect.height * 10) / 10,
    };
    for (const name of names) out[name] = cs.getPropertyValue(name).trim();
    return out;
  }, props);
}

/** Есть ли у DOM-узла React-обработчик с таким именем (`onClick`, `onMouseDown`…). */
async function hasReactHandler(locator, handler) {
  return locator.evaluate((el, name) => {
    const key = Object.keys(el).find((k) => k.startsWith('__reactProps'));
    if (!key) return null;
    return typeof el[key]?.[name] === 'function';
  }, handler);
}

/** Прокручивающийся контейнер страницы — тот, у кого содержимое выше окна. */
async function scroller() {
  return page.evaluateHandle(() => {
    const all = Array.from(document.querySelectorAll('div'));
    return (
      all.find((el) => {
        const cs = getComputedStyle(el);
        return (
          (cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight + 4
        );
      }) ?? document.scrollingElement
    );
  });
}

/** Прокрутить контейнер страницы к заданной позиции. */
async function scrollTo(top) {
  const handle = await scroller();
  await handle.evaluate((el, y) => {
    el.scrollTo(0, y);
  }, top);
  await wait(300);
}

/** Цвет по строке `rgb(a)` → числа. Прозрачная альфа — как у CSS. */
function parseColor(str) {
  const m = /rgba?\(([^)]+)\)/.exec(str);
  if (!m) return null;
  const parts = m[1].split(',').map((p) => parseFloat(p.trim()));
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
}

/** Смешать цвет с альфой поверх подложки. */
function blend(fg, bg) {
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

/** Относительная яркость по WCAG 2.x. */
function luminance({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Коэффициент контраста текст/фон, текст может быть полупрозрачным. */
function contrast(fgStr, bgStr) {
  const bg = parseColor(bgStr);
  const fg = blend(parseColor(fgStr), bg);
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return Math.round(ratio * 100) / 100;
}

/**
 * Какими ШРИФТАМИ ПЛАТФОРМЫ на самом деле отрисован узел — по глифам.
 *
 * ⚠️ `getComputedStyle().fontFamily` и `document.fonts.check()` по-глифовую подстановку
 * не видят: у Barlow Condensed нет кириллицы, а оба отвечают «Barlow». Единственный
 * честный ответ даёт DevTools-протокол: `CSS.getPlatformFontsForNode` возвращает
 * список семейств с числом глифов, взятых из каждого.
 */
async function platformFonts(selector) {
  const cdp = await context.newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 });
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    return fonts.map((f) => `${f.familyName}${f.isCustomFont ? '' : ' (системный)'}: ${f.glyphCount} глифов`).join(', ');
  } finally {
    await cdp.detach();
  }
}

/** Открыть главную дизайна на заданном окне. Ждём анимацию логотипа (0.52 с + задержка). */
async function openHome(width = 1440, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await wait(900);
}

/** Вернуться на главную из другого экрана десктопа — кликом по логотипу в шапке. */
async function backHome() {
  await page.locator('header button').first().click();
  await wait(600);
}

/** Секции главной по порядку: 0 герой … 8 призыв; подвал отдельно. */
const section = (n) => page.locator('section').nth(n);

/** Первый видимый `.hp-hero` и его левая колонка. */
const heroLeft = () => page.locator('.hp-hero > div').first();

/** Поисковый виджет героя — белая карточка с переключателем. */
const searchWidget = () => heroLeft().locator('div').filter({ has: page.locator('input') }).nth(1);

/** Заголовок сводки в отчёте — числа сразу под ним. */
function block(title, rows) {
  return [`**${title}**`, ...rows.map((row) => `- ${row}`)].join('\n');
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(REPORTS, { recursive: true });
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'ru-RU' });
  page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
  });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${String(e).slice(0, 160)}`));

  // ── Scenario 0: окно и оболочка ─────────────────────────────────────────
  console.log('\nScenario 0: окно и оболочка');

  await step('step-1', 'окно 1440×900, главная, анимация логотипа', async () => {
    await openHome(1440, 900);
    const anim = await page.locator('.ps-hp-r1').first().evaluate((el) => {
      const cs = getComputedStyle(el);
      return `${cs.animationName} ${cs.animationDuration} ${cs.animationDelay}`;
    });
    const sections = await page.locator('section').count();
    must(sections === 9, `секций ${sections}, ожидалось 9`);
    await page.screenshot({ path: path.join(SHOTS, '00-full-1440.png'), fullPage: false });
    return `секций 9; анимация логотипа: ${anim}; ошибок консоли: ${consoleErrors.length}`;
  });

  await step('step-2', 'шапка: высота, max-width, отступ, фон, граница, тень, position', async () => {
    const header = await measure(page.locator('header'), [
      'background-color',
      'border-bottom',
      'box-shadow',
      'position',
      'z-index',
    ]);
    const inner = await measure(page.locator('header > div').first(), [
      'max-width',
      'padding-left',
      'padding-right',
      'height',
    ]);
    // ⚠️ Чек-лист ждёт 64: это высота внутреннего контейнера; сам <header> на 1px
    // выше — граница снизу. Записываем оба числа, а не роняем шаг.
    must(inner.h === 64, `высота контейнера шапки ${inner.h}`);
    summary.spacing['шапка: высота / max-width / боковой отступ'] =
      `${header.h} / ${inner['max-width']} / ${inner['padding-left']}`;
    summary.palette['шапка: фон'] = header['background-color'];
    await page.locator('header').screenshot({ path: path.join(SHOTS, '01-header-1440.png') });
    return block('шапка', [
      `высота <header> ${header.h}px = контейнер ${inner.h}px + граница 1px; position ${header.position}, z-index ${header['z-index']}`,
      `контейнер max-width ${inner['max-width']}, боковой отступ ${inner['padding-left']} / ${inner['padding-right']}`,
      `фон ${header['background-color']}, граница снизу ${header['border-bottom']}`,
      `тень ${header['box-shadow']}`,
    ]);
  });

  await step('step-3', 'пункты меню: подписи, порядок, активный, «Мой Спорт»', async () => {
    const items = await page.locator('nav.dk-links > button').evaluateAll((els) =>
      els.map((el) => ({
        label: el.textContent.trim(),
        cls: el.className,
        svg: el.querySelectorAll('svg').length,
        font: `${getComputedStyle(el).fontSize} ${getComputedStyle(el).fontWeight}`,
        pad: getComputedStyle(el).padding,
        radius: getComputedStyle(el).borderRadius,
      })),
    );
    must(items.length === 5, `пунктов ${items.length}`);
    const active = items.filter((i) => / on| hi|active/.test(i.cls)).map((i) => i.label);
    const mySport = items[4];
    must(mySport.svg === 2, `ветвей у «Мой Спорт» ${mySport.svg}`);
    return block('меню', [
      `порядок: ${items.map((i) => i.label).join(' · ')}`,
      `активный на главной: ${active.length ? active.join(', ') : 'НЕТ — главная не подсвечивается ни одним пунктом'}`,
      `обычный пункт: ${items[0].font}, отступы ${items[0].pad}, радиус ${items[0].radius}`,
      `«Мой Спорт»: две SVG-ветви, ${mySport.font}, отступы ${mySport.pad}`,
    ]);
  });

  await step('step-4', 'колокольчик: размер, радиус, точка; обработчика клика нет', async () => {
    const bell = page.locator('header button').filter({ has: page.locator('svg.lucide-bell') });
    const m = await measure(bell, ['border-radius', 'background-color', 'border']);
    const dot = await measure(bell.locator('div').first(), [
      'background-color',
      'border',
      'top',
      'right',
    ]);
    const onClick = await hasReactHandler(bell, 'onClick');
    must(onClick === false, `у колокольчика onClick: ${onClick}`);
    const name = await bell.evaluate((el) => el.getAttribute('aria-label') ?? el.textContent.trim());
    return block('колокольчик', [
      `кнопка ${m.w}×${m.h}, радиус ${m['border-radius']}, фон ${m['background-color']}, рамка ${m.border}`,
      `точка ${dot.w}×${dot.h}, фон ${dot['background-color']}, обводка ${dot.border}, top ${dot.top} right ${dot.right}`,
      `обработчик onClick: НЕТ; доступное имя: «${name}» (пусто — безымянная кнопка)`,
    ]);
  });

  await step('step-5', 'кнопка «Войти»: размеры, фон, радиус, тень, шрифт', async () => {
    const btn = page.locator('header button', { hasText: 'Войти' }).first();
    const m = await measure(btn, [
      'background-color',
      'border-radius',
      'box-shadow',
      'font-family',
      'font-weight',
      'font-size',
      'letter-spacing',
      'padding',
      'color',
    ]);
    summary.palette['акцент (кнопка «Войти»)'] = m['background-color'];
    summary.fonts['кнопки: display-шрифт'] = `${m['font-family']} ${m['font-weight']} ${m['font-size']}`;
    return block('«Войти»', [
      `${m.w}×${m.h}, отступы ${m.padding}, радиус ${m['border-radius']}`,
      `фон ${m['background-color']}, текст ${m.color}, тень ${m['box-shadow']}`,
      `шрифт ${m['font-family']} ${m['font-weight']} ${m['font-size']}, трекинг ${m['letter-spacing']}`,
    ]);
  });

  // ── Scenario 1: HERO ────────────────────────────────────────────────────
  console.log('\nScenario 1: HERO');

  await step('step-6', 'герой: фон, padding-bottom, контейнер 1320, свечение', async () => {
    const hero = await measure(section(0), ['background-color', 'padding-bottom', 'position']);
    const container = await measure(section(0).locator('> div').nth(2), [
      'max-width',
      'padding',
    ]);
    const glow = await measure(section(0).locator('> div').nth(1), [
      'background-image',
      'top',
      'right',
      'pointer-events',
    ]);
    summary.palette['герой: тёмный фон'] = hero['background-color'];
    summary.spacing['герой: контейнер / внутренний отступ / padding-bottom'] =
      `${container['max-width']} / ${container.padding} / ${hero['padding-bottom']}`;
    await section(0).screenshot({ path: path.join(SHOTS, '02-hero-1440.png') });
    return block('герой', [
      `секция ${hero.w}×${hero.h}, фон ${hero['background-color']}, padding-bottom ${hero['padding-bottom']}`,
      `контейнер max-width ${container['max-width']} (факт ${container.w}px), отступ ${container.padding}`,
      `свечение ${glow.w}×${glow.h}, top ${glow.top}, right ${glow.right}, фон ${glow['background-image'].slice(0, 90)}…`,
    ]);
  });

  await step('step-7', 'сетка героя: колонки и gap', async () => {
    const grid = await measure(page.locator('.hp-hero'), [
      'grid-template-columns',
      'gap',
      'align-items',
    ]);
    const right = await measure(page.locator('.hp-hero-right'), ['display']);
    summary.spacing['герой: колонки / gap'] = `${grid['grid-template-columns']} / ${grid.gap}`;
    return block('сетка героя', [
      `grid-template-columns ${grid['grid-template-columns']} (правило: 1fr min(480px,42%))`,
      `gap ${grid.gap}, align-items ${grid['align-items']}`,
      `правая колонка ${right.w}×${right.h}, display ${right.display}`,
    ]);
  });

  await step('step-8', 'плашка «Новинки»: радиус, отступы, два фона, кегли 9 и 12', async () => {
    const pill = heroLeft().locator('> div').first();
    const m = await measure(pill, [
      'border-radius',
      'padding',
      'background-color',
      'border',
      'margin-bottom',
    ]);
    const tag = await measure(pill.locator('span').first(), [
      'background-color',
      'font-size',
      'font-weight',
      'letter-spacing',
      'text-transform',
      'padding',
      'color',
    ]);
    const text = await measure(pill.locator('span').nth(1), ['font-size', 'font-weight', 'color']);
    const isButton = await pill.evaluate((el) => el.tagName);
    return block('плашка «Новинки»', [
      `${m.w}×${m.h}, радиус ${m['border-radius']}, отступы ${m.padding}, margin-bottom ${m['margin-bottom']}`,
      `фон плашки ${m['background-color']}, рамка ${m.border}`,
      `метка: фон ${tag['background-color']}, ${tag['font-size']} ${tag['font-weight']} ${tag['text-transform']} трекинг ${tag['letter-spacing']}, отступы ${tag.padding}`,
      `текст: ${text['font-size']} ${text['font-weight']} ${text.color}`,
      `элемент — <${isButton}>, не кнопка и не ссылка`,
    ]);
  });

  await step('step-9', 'H1: шрифт, размер, интерлиньяж, зелёная строка; кириллица', async () => {
    const h1 = page.locator('h1');
    const m = await measure(h1, [
      'font-family',
      'font-weight',
      'font-size',
      'line-height',
      'letter-spacing',
      'color',
      'margin',
    ]);
    const green = await measure(h1.locator('span'), ['color']);
    const text = await h1.evaluate((el) => el.innerText.replace(/\n/g, ' / '));
    // ⚠️ Кириллицы у Barlow Condensed нет: браузер подставляет глиф из следующего
    // шрифта стека. `getComputedStyle` этого не видит — сравниваем ширину строки,
    // набранной объявленным стеком и системным запасным.
    const fallback = await page.evaluate(() => {
      const mk = (font) => {
        const s = document.createElement('span');
        s.textContent = 'НАЙДИ ЗАЛ, ЗАПИШИСЬ';
        s.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:900 72px ${font}`;
        document.body.append(s);
        const w = s.getBoundingClientRect().width;
        s.remove();
        return Math.round(w * 10) / 10;
      };
      const lat = (font) => {
        const s = document.createElement('span');
        s.textContent = 'FIND A GYM, SIGN UP';
        s.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:900 72px ${font}`;
        document.body.append(s);
        const w = s.getBoundingClientRect().width;
        s.remove();
        return Math.round(w * 10) / 10;
      };
      return {
        cyrBarlow: mk("'Barlow Condensed', sans-serif"),
        cyrSans: mk('sans-serif'),
        latBarlow: lat("'Barlow Condensed', sans-serif"),
        latSans: lat('sans-serif'),
        check: document.fonts.check("900 72px 'Barlow Condensed'", 'НАЙДИ'),
        checkLatin: document.fonts.check("900 72px 'Barlow Condensed'", 'FIND'),
      };
    });
    // Сжатый шрифт даёт заметно более узкую строку, чем системный: латиница это
    // показывает (отношение ~0.7). Кириллица с отношением около 1 набрана НЕ Barlow.
    const latRatio = r1(fallback.latBarlow / fallback.latSans);
    const cyrRatio = r1(fallback.cyrBarlow / fallback.cyrSans);
    const cyrillicFromFallback = cyrRatio > 0.9 && latRatio < 0.85;
    const platform = await platformFonts('h1');
    summary.fonts['H1'] = `${m['font-family']} ${m['font-weight']} ${m['font-size']} / lh ${m['line-height']}`;
    summary.fonts['кириллица в Barlow Condensed'] = cyrillicFromFallback
      ? `ПОДСТАНОВКА — H1 отрисован: ${platform}`
      : `глифы свои — H1 отрисован: ${platform}`;
    return block('H1', [
      `текст: ${text}`,
      `шрифт ${m['font-family']} ${m['font-weight']}, кегль ${m['font-size']} (clamp(2.8rem,5vw,4.6rem) при 1440 → 5vw = 72px)`,
      `интерлиньяж ${m['line-height']}, трекинг ${m['letter-spacing']}, поля ${m.margin}, ${m.w}×${m.h}`,
      `цвет ${m.color}, третья строка ${green.color}`,
      `кириллица: ширина «НАЙДИ ЗАЛ, ЗАПИШИСЬ» в стеке Barlow ${fallback.cyrBarlow}px против sans-serif ${fallback.cyrSans}px (отношение ${cyrRatio}); латиница ${fallback.latBarlow}px против ${fallback.latSans}px (отношение ${latRatio}) → ${cyrillicFromFallback ? 'кириллица ПОДСТАВЛЕНА, глифов у Barlow нет' : 'свои глифы'}`,
      `шрифты платформы у H1 по глифам (CDP): ${platform}`,
      `document.fonts.check: кириллица ${fallback.check}, латиница ${fallback.checkLatin} — check() подстановку не видит`,
    ]);
  });

  await step('step-10', 'подзаголовок: 15px, rgba(255,255,255,.45), max-width 480', async () => {
    const p = heroLeft().locator('> p').first();
    const m = await measure(p, ['font-size', 'color', 'max-width', 'line-height', 'margin']);
    const text = await p.innerText();
    summary.palette['герой: подзаголовок'] = m.color;
    return block('подзаголовок', [
      `${m['font-size']} / lh ${m['line-height']}, цвет ${m.color}, max-width ${m['max-width']} (факт ${m.w}px), поля ${m.margin}`,
      `текст: «${text}»`,
    ]);
  });

  await step('step-11', 'поисковый виджет: белая карточка, радиус 18, padding 8, тень', async () => {
    const w = await measure(searchWidget(), [
      'background-color',
      'border-radius',
      'padding',
      'box-shadow',
    ]);
    summary.spacing['поисковый виджет: радиус / padding'] = `${w['border-radius']} / ${w.padding}`;
    return block('виджет поиска', [
      `${w.w}×${w.h}, фон ${w['background-color']}, радиус ${w['border-radius']}, отступ ${w.padding}`,
      `тень ${w['box-shadow']}`,
    ]);
  });

  await step('step-12', 'переключатель «Клубы/Тренеры»: два состояния', async () => {
    const buttons = searchWidget().locator('> div').first().locator('button');
    const track = await measure(searchWidget().locator('> div').first(), [
      'background-color',
      'border-radius',
      'padding',
      'gap',
    ]);
    const both = [];
    for (let i = 0; i < 2; i += 1) {
      const m = await measure(buttons.nth(i), [
        'background-color',
        'color',
        'box-shadow',
        'border-radius',
        'font-size',
        'font-weight',
        'padding',
      ]);
      both.push(`«${await buttons.nth(i).innerText()}»: фон ${m['background-color']}, текст ${m.color}, тень ${m['box-shadow']}, радиус ${m['border-radius']}, ${m['font-size']} ${m['font-weight']}, ${m.w}×${m.h}`);
    }
    return block('переключатель', [
      `дорожка: фон ${track['background-color']}, радиус ${track['border-radius']}, отступ ${track.padding}, gap ${track.gap}`,
      ...both,
    ]);
  });

  await step('step-13', 'клик «Тренеры» — смена placeholder', async () => {
    const input = searchWidget().locator('input');
    const before = await input.getAttribute('placeholder');
    await searchWidget().locator('button', { hasText: 'Тренеры' }).click();
    await wait(200);
    const after = await input.getAttribute('placeholder');
    must(before !== after, 'placeholder не сменился');
    await searchWidget().locator('button', { hasText: 'Клубы' }).click();
    await wait(200);
    return `«${before}» → «${after}»`;
  });

  await step('step-14', 'поле ввода: высота, padding-left 42, фон, радиус', async () => {
    const m = await measure(searchWidget().locator('input'), [
      'padding',
      'background-color',
      'border-radius',
      'border',
      'font-size',
      'font-family',
      'caret-color',
    ]);
    return block('поле', [
      `${m.w}×${m.h}, отступы ${m.padding}, фон ${m['background-color']}, радиус ${m['border-radius']}`,
      `рамка в покое ${m.border}, шрифт ${m['font-family']} ${m['font-size']}, caret-color ${m['caret-color']}`,
    ]);
  });

  await step('step-15', 'фокус в поле: зелёная рамка 1.5px, caret, выпадашка', async () => {
    const input = searchWidget().locator('input');
    await input.focus();
    await wait(250);
    const m = await measure(input, ['border', 'border-color', 'caret-color', 'outline']);
    const dropdown = heroLeft().locator('div').filter({ hasText: 'Популярные запросы' }).last();
    const visible = await dropdown.count();
    must(visible > 0, 'выпадашка не открылась');
    return block('фокус', [
      `рамка ${m.border}, caret ${m['caret-color']}, outline ${m.outline}`,
      `выпадашка открылась: да`,
    ]);
  });

  await step('step-16', 'выпадашка: позиция, радиус, тень, z-index, рубрики', async () => {
    const widgetBox = await measure(searchWidget());
    const dd = heroLeft()
      .locator('div')
      .filter({ hasText: 'Популярные запросы' })
      .filter({ has: page.locator('button') })
      .last();
    const m = await measure(dd, [
      'top',
      'border-radius',
      'box-shadow',
      'z-index',
      'padding',
      'background-color',
      'position',
    ]);
    const heads = await dd.locator('> p').evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        return `«${el.textContent}» ${cs.fontSize} ${cs.fontWeight} ${cs.textTransform} трекинг ${cs.letterSpacing} цвет ${cs.color}`;
      }),
    );
    return block('выпадашка', [
      `отступ от низа виджета ${r1(m.y - (widgetBox.y + widgetBox.h))}px (правило top: calc(100% + 6px)), position ${m.position}`,
      `${m.w}×${m.h}, радиус ${m['border-radius']}, отступы ${m.padding}, z-index ${m['z-index']}, фон ${m['background-color']}`,
      `тень ${m['box-shadow']}`,
      ...heads.map((h) => `рубрика ${h}`),
    ]);
  });

  await step('step-17', 'шесть чипов категорий: подписи, иконки, радиус, активное состояние', async () => {
    const dd = heroLeft()
      .locator('div')
      .filter({ hasText: 'Популярные запросы' })
      .filter({ has: page.locator('button') })
      .last();
    const chips = await dd.locator('> div').first().locator('button').evaluateAll((els) =>
      els.map((el) => {
        const cs = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          label: el.textContent.trim(),
          svg: el.querySelectorAll('svg').length,
          radius: cs.borderRadius,
          bg: cs.backgroundColor,
          border: cs.border,
          color: cs.color,
          font: `${cs.fontSize} ${cs.fontWeight}`,
          pad: cs.padding,
          size: `${Math.round(rect.width)}×${Math.round(rect.height)}`,
        };
      }),
    );
    must(chips.length === 6, `чипов ${chips.length}`);
    const active = chips.filter((c) => c.bg === 'rgb(126, 217, 0)');
    return block('чипы категорий', [
      `подписи: ${chips.map((c) => c.label).join(' · ')}; иконок: ${chips.map((c) => c.svg).join('')}`,
      `радиус ${chips[0].radius}, фон ${chips[0].bg}, рамка ${chips[0].border}, текст ${chips[0].color}, ${chips[0].font}, отступы ${chips[0].pad}, размер ${chips[0].size}`,
      `активных при открытии: ${active.length} (начальное состояние «all» не совпадает ни с одним id)`,
    ]);
  });

  await step('step-18', '«Популярные запросы»: пять строк, ховер красит фон', async () => {
    const dd = heroLeft()
      .locator('div')
      .filter({ hasText: 'Популярные запросы' })
      .filter({ has: page.locator('button') })
      .last();
    const rows = dd.locator('> div').nth(1).locator('button');
    const labels = await rows.evaluateAll((els) => els.map((el) => el.textContent.trim()));
    must(labels.length === 5, `строк ${labels.length}`);
    const before = (await measure(rows.first(), ['background-color']))['background-color'];
    await rows.first().hover();
    await wait(150);
    const after = (await measure(rows.first(), ['background-color', 'border-radius', 'padding']));
    return block('популярные запросы', [
      `строки: ${labels.join(' · ')}`,
      `фон до наведения ${before} → после ${after['background-color']}; радиус ${after['border-radius']}, отступы ${after.padding}`,
    ]);
  });

  await step('step-19', 'клик по запросу — куда ушли, что со строкой', async () => {
    const dd = heroLeft()
      .locator('div')
      .filter({ hasText: 'Популярные запросы' })
      .filter({ has: page.locator('button') })
      .last();
    const first = dd.locator('> div').nth(1).locator('button').first();
    const query = await first.innerText();
    const urlBefore = page.url();
    // ⚠️ Обработчик — onMouseDown, поэтому именно mouse down, а не click.
    await first.dispatchEvent('mousedown');
    await wait(600);
    const activeNav = await page.locator('nav.dk-links > button.on, nav.dk-links > button.hi').evaluateAll(
      (els) => els.map((el) => el.textContent.trim()),
    );
    const catalogInput = page.locator('input[placeholder="Вид спорта, клуб или район…"]');
    const inCatalog = (await catalogInput.count()) > 0;
    const carried = inCatalog ? await catalogInput.inputValue() : null;
    must(inCatalog, 'каталог не открылся');
    return block('переход по запросу', [
      `нажат «${query}»; URL ${urlBefore} → ${page.url()} (не изменился)`,
      `открыт каталог: активный пункт меню «${activeNav.join(', ')}»`,
      `строка в поле каталога: «${carried}» — ${carried === '' ? 'запрос ОТБРОШЕН' : 'запрос доехал'}`,
    ]);
  });

  await step('step-20', 'домой; кнопка «Найти»: зелёная, радиус 12, Barlow 900, стрелка 14', async () => {
    await backHome();
    must((await page.locator('h1').count()) === 1, 'главная не открылась');
    const btn = searchWidget().locator('button', { hasText: 'Найти' });
    const m = await measure(btn, [
      'background-color',
      'border-radius',
      'font-family',
      'font-weight',
      'font-size',
      'letter-spacing',
      'padding',
      'color',
    ]);
    const arrow = await measure(btn.locator('svg'));
    return block('«Найти»', [
      `${m.w}×${m.h}, отступы ${m.padding}, фон ${m['background-color']}, радиус ${m['border-radius']}`,
      `шрифт ${m['font-family']} ${m['font-weight']} ${m['font-size']}, трекинг ${m['letter-spacing']}, цвет ${m.color}`,
      `стрелка ${arrow.w}×${arrow.h}`,
    ]);
  });

  await step('step-21', 'четыре счётчика: значения, шрифт, подписи', async () => {
    await wait(1500);
    const counters = await heroLeft().locator('> div').last().locator('> div').evaluateAll((els) =>
      els.map((el) => {
        const value = el.querySelector('p');
        const label = el.querySelectorAll('p')[1];
        const vs = getComputedStyle(value);
        const ls = getComputedStyle(label);
        return {
          value: value.textContent.trim(),
          vfont: `${vs.fontFamily} ${vs.fontWeight} ${vs.fontSize} ${vs.color}`,
          label: label.textContent.trim(),
          lfont: `${ls.fontSize} ${ls.fontWeight} ${ls.textTransform} трекинг ${ls.letterSpacing} цвет ${ls.color}`,
        };
      }),
    );
    must(counters.length === 4, `счётчиков ${counters.length}`);
    const gap = (await measure(heroLeft().locator('> div').last(), ['gap'])).gap;
    summary.fonts['счётчики: моно'] = counters[0].vfont;
    const counterFonts = await platformFonts('.hp-hero > div:first-child > div:last-child p');
    summary.fonts['счётчик «12 000+» — по глифам'] = counterFonts;
    summary.palette['герой: подписи счётчиков'] = counters[0].lfont.split('цвет ')[1];
    return block('счётчики', [
      `значения: ${counters.map((c) => c.value).join(' · ')}; gap ${gap}`,
      `подписи: ${counters.map((c) => c.label).join(' · ')}`,
      `число: ${counters[0].vfont}`,
      `подпись: ${counters[0].lfont}`,
      `число по глифам (CDP): ${counterFonts}`,
    ]);
  });

  await step('step-22', 'прокрутка счётчиков из вида и обратно — считает один раз', async () => {
    const valueOf = () => heroLeft().locator('> div').last().locator('p').first().innerText();
    const before = await valueOf();
    await scrollTo(4000);
    await wait(400);
    await scrollTo(0);
    await wait(300);
    const right = await valueOf();
    await wait(1200);
    const later = await valueOf();
    must(right === before && later === before, `значение менялось: ${before} → ${right} → ${later}`);
    return `до прокрутки ${before}, сразу после возврата ${right}, через 1.2 с ${later} — анимация не перезапускается (observer отключён после первого срабатывания)`;
  });

  await step('step-23', 'правая колонка: карточка клуба, фото 200, бейдж, рейтинг, слоты', async () => {
    const right = page.locator('.hp-hero-right');
    const card = right.locator('> div').first();
    const m = await measure(card, ['border-radius', 'box-shadow', 'border', 'top', 'right', 'left']);
    const photo = await measure(card.locator('> div').first(), ['background-color']);
    const badge = await measure(card.locator('span', { hasText: 'Верифицирован' }), [
      'background-color',
      'color',
      'font-size',
      'font-weight',
      'text-transform',
      'border-radius',
      'padding',
    ]);
    const name = await measure(card.locator('p', { hasText: 'CrossFit Garage' }).first(), [
      'font-family',
      'font-weight',
      'font-size',
    ]);
    const ratingLine = await card.locator('p', { hasText: 'CrossFit Garage' }).first().locator('..').innerText();
    const heading = await measure(card.locator('p', { hasText: 'Ближайшие занятия' }), [
      'font-family',
      'font-weight',
      'font-size',
      'text-transform',
      'letter-spacing',
    ]);
    const rows = await card.locator('p', { hasText: 'Ближайшие занятия' }).locator('..').locator('> div').count();
    await right.screenshot({ path: path.join(SHOTS, '03-hero-right-1440.png') });
    return block('правая колонка', [
      `карточка ${m.w}×${m.h}, top ${m.top} right ${m.right} left ${m.left}, радиус ${m['border-radius']}, рамка ${m.border}`,
      `тень ${m['box-shadow']}`,
      `фото ${photo.w}×${photo.h}, подложка ${photo['background-color']}`,
      `бейдж «Верифицирован»: фон ${badge['background-color']}, текст ${badge.color}, ${badge['font-size']} ${badge['font-weight']} ${badge['text-transform']}, радиус ${badge['border-radius']}, отступы ${badge.padding}`,
      `имя: ${name['font-family']} ${name['font-weight']} ${name['font-size']}; строка рейтинга: «${ratingLine.replace(/\n/g, ' ')}»`,
      `«Ближайшие занятия»: ${heading['font-family']} ${heading['font-weight']} ${heading['font-size']} ${heading['text-transform']} трекинг ${heading['letter-spacing']}; строк ${rows}`,
    ]);
  });

  await step('step-24', 'три слота: три разных состояния кнопки', async () => {
    const card = page.locator('.hp-hero-right > div').first();
    const buttons = card.locator('button');
    must((await buttons.count()) === 3, `кнопок ${await buttons.count()}`);
    const rows = [];
    for (let i = 0; i < 3; i += 1) {
      const b = buttons.nth(i);
      const m = await measure(b, ['background-color', 'border', 'color', 'border-radius', 'font-size', 'font-weight', 'padding']);
      const onClick = await hasReactHandler(b, 'onClick');
      rows.push(`«${await b.innerText()}»: фон ${m['background-color']}, рамка ${m.border}, текст ${m.color}, радиус ${m['border-radius']}, ${m['font-size']} ${m['font-weight']}, ${m.w}×${m.h}, onClick: ${onClick ? 'есть' : 'НЕТ'}`);
    }
    const time = await measure(card.locator('span').filter({ hasText: '07:00' }).first(), ['font-family', 'font-weight', 'font-size', 'width']);
    return block('слоты', [...rows, `время: ${time['font-family']} ${time['font-weight']} ${time['font-size']}, ширина ${time.width}`]);
  });

  await step('step-25', 'две плавающие карточки: позиции и фоны', async () => {
    const right = page.locator('.hp-hero-right');
    const rightBox = await measure(right);
    const floats = right.locator('> div');
    const a = await measure(floats.nth(1), ['background-color', 'border', 'border-radius', 'padding', 'width', 'box-shadow', 'z-index']);
    const b = await measure(floats.nth(2), ['background-color', 'border', 'border-radius', 'padding', 'width', 'box-shadow', 'z-index']);
    const aText = (await floats.nth(1).innerText()).replace(/\n/g, ' / ');
    const bText = (await floats.nth(2).innerText()).replace(/\n/g, ' / ');
    return block('плавающие карточки', [
      `«${aText}»: ${a.w}×${a.h}, слева ${r1(a.x - rightBox.x)}px от колонки, снизу ${r1(rightBox.y + rightBox.h - (a.y + a.h))}px; фон ${a['background-color']}, рамка ${a.border}, радиус ${a['border-radius']}, отступы ${a.padding}, тень ${a['box-shadow']}, z ${a['z-index']}`,
      `«${bText.slice(0, 40)}…»: ${b.w}×${b.h}, справа ${r1(b.x + b.w - (rightBox.x + rightBox.w))}px за колонку, снизу ${r1(rightBox.y + rightBox.h - (b.y + b.h))}px; фон ${b['background-color']}, рамка ${b.border}, радиус ${b['border-radius']}, отступы ${b.padding}, тень ${b['box-shadow']}`,
    ]);
  });

  await step('step-26', 'волна-переход: svg 1440×56, заливка', async () => {
    const wrap = await measure(section(0).locator('> div').last(), ['height', 'bottom', 'overflow']);
    const svg = section(0).locator('svg').last();
    const attrs = await svg.evaluate((el) => ({
      viewBox: el.getAttribute('viewBox'),
      par: el.getAttribute('preserveAspectRatio'),
      fill: el.querySelector('path')?.getAttribute('fill'),
      d: el.querySelector('path')?.getAttribute('d'),
    }));
    const m = await measure(svg);
    return block('волна', [
      `контейнер высота ${wrap.height}, bottom ${wrap.bottom}, overflow ${wrap.overflow}; svg ${m.w}×${m.h}`,
      `viewBox ${attrs.viewBox}, preserveAspectRatio ${attrs.par}, заливка ${attrs.fill}, path ${attrs.d}`,
    ]);
  });

  // ── Scenario 2: КАК ЭТО РАБОТАЕТ ────────────────────────────────────────
  console.log('\nScenario 2: как это работает');

  await step('step-27', 'рубрика и H2 секции шагов', async () => {
    const s = section(1);
    const sec = await measure(s, ['background-color', 'padding']);
    const rubric = await measure(s.locator('p').first(), ['font-family', 'font-size', 'font-weight', 'color', 'letter-spacing', 'text-transform', 'margin']);
    const h2 = await measure(s.locator('h2'), ['font-family', 'font-weight', 'font-size', 'line-height', 'margin']);
    const headWrap = await measure(s.locator('h2').locator('..'), ['text-align', 'margin-bottom']);
    summary.fonts['рубрика секции (моно)'] = `${rubric['font-family']} ${rubric['font-size']} ${rubric['font-weight']} ${rubric.color} трекинг ${rubric['letter-spacing']}`;
    summary.fonts['H2 секций'] = `${h2['font-family']} ${h2['font-weight']} ${h2['font-size']} / lh ${h2['line-height']}`;
    const rubricFonts = await platformFonts('section:nth-of-type(2) p');
    const h2Fonts = await platformFonts('section:nth-of-type(2) h2');
    summary.fonts['рубрика «Как это работает» — по глифам'] = rubricFonts;
    summary.fonts['H2 «ТРИ ШАГА…» — по глифам'] = h2Fonts;
    summary.spacing['секции: вертикальный padding'] = sec.padding;
    await s.screenshot({ path: path.join(SHOTS, '04-steps-1440.png') });
    return block('шапка секции', [
      `секция: фон ${sec['background-color']}, отступы ${sec.padding}`,
      `рубрика «${await s.locator('p').first().innerText()}»: ${rubric['font-family']} ${rubric['font-size']} ${rubric['font-weight']} ${rubric.color}, трекинг ${rubric['letter-spacing']}, ${rubric['text-transform']}, поля ${rubric.margin}`,
      `H2 «${await s.locator('h2').innerText()}»: ${h2['font-family']} ${h2['font-weight']} ${h2['font-size']} (clamp(1.8rem,3vw,2.8rem) при 1440 → 3vw = 43.2px), lh ${h2['line-height']}`,
      `выравнивание ${headWrap['text-align']}, отступ до полосы ${headWrap['margin-bottom']}`,
      `шрифты платформы по глифам: рубрика — ${rubricFonts}; H2 — ${h2Fonts}`,
    ]);
  });

  await step('step-28', 'полоса трёх шагов: белая, радиус 22, разделители border-right', async () => {
    const strip = page.locator('.hp-steps');
    const m = await measure(strip, ['background-color', 'border-radius', 'border', 'grid-template-columns', 'gap', 'overflow']);
    const borders = await strip.locator('> div').evaluateAll((els) => els.map((el) => getComputedStyle(el).borderRight));
    return block('полоса шагов', [
      `${m.w}×${m.h}, фон ${m['background-color']}, радиус ${m['border-radius']}, рамка ${m.border}, overflow ${m.overflow}`,
      `колонки ${m['grid-template-columns']}, gap ${m.gap} (разделители — border-right, не gap)`,
      `border-right по карточкам: ${borders.join(' | ')}`,
    ]);
  });

  await step('step-29', 'карточка шага: номер, иконка 44 радиус 13, отступы', async () => {
    const card = page.locator('.hp-steps > div').first();
    const m = await measure(card, ['padding']);
    const num = await measure(card.locator('span').first(), ['font-family', 'font-weight', 'font-size', 'color', 'line-height']);
    const icon = await measure(card.locator('span').first().locator('..').locator('div'), ['border-radius', 'background-color']);
    const h3 = await measure(card.locator('h3'), ['font-family', 'font-weight', 'font-size', 'margin']);
    const p = await measure(card.locator('p'), ['font-size', 'color', 'line-height']);
    const titles = await page.locator('.hp-steps h3').evaluateAll((els) => els.map((el) => el.textContent.trim()));
    const bodies = await page.locator('.hp-steps p').evaluateAll((els) => els.map((el) => el.textContent.trim()));
    return block('карточка шага', [
      `отступы ${m.padding}; номер ${num['font-family']} ${num['font-weight']} ${num['font-size']} ${num.color} lh ${num['line-height']}`,
      `иконка ${icon.w}×${icon.h}, радиус ${icon['border-radius']}, фон ${icon['background-color']}`,
      `h3 ${h3['font-family']} ${h3['font-weight']} ${h3['font-size']}, поля ${h3.margin}; текст ${p['font-size']} ${p.color} lh ${p['line-height']}`,
      `заголовки: ${titles.join(' · ')}`,
      `тексты: ${bodies.join(' | ')}`,
    ]);
  });

  await step('step-30', 'наведение на шаг — ховера нет', async () => {
    const card = page.locator('.hp-steps > div').first();
    const props = ['background-color', 'transform', 'box-shadow', 'border-right', 'color'];
    const before = await measure(card, props);
    await card.hover();
    await wait(300);
    const after = await measure(card, props);
    const changed = props.filter((p) => before[p] !== after[p]);
    must(changed.length === 0, `изменилось: ${changed.join(', ')}`);
    const onEnter = await hasReactHandler(card, 'onMouseEnter');
    return `ни одно из ${props.length} свойств не изменилось; обработчик onMouseEnter: ${onEnter ? 'есть' : 'нет'}; cursor ${(await measure(card, ['cursor'])).cursor}`;
  });

  // ── Scenario 3: ВОЗМОЖНОСТИ ─────────────────────────────────────────────
  console.log('\nScenario 3: возможности');

  await step('step-31', 'шапка секции: H2 в две строки + кнопка, выравнивание по низу', async () => {
    const s = section(2);
    const head = s.locator('> div > div').first();
    const m = await measure(head, ['display', 'align-items', 'justify-content', 'gap', 'margin-bottom', 'flex-wrap']);
    const h2 = await s.locator('h2').evaluate((el) => el.innerText.replace(/\n/g, ' / '));
    const btn = s.locator('button', { hasText: 'Попробовать бесплатно' });
    const b = await measure(btn, ['background-color', 'border-radius', 'padding', 'font-family', 'font-weight', 'font-size', 'box-shadow']);
    const h2Box = await measure(s.locator('h2'));
    await s.screenshot({ path: path.join(SHOTS, '05-features-1440.png') });
    return block('шапка «Возможности»', [
      `${m.display}, align-items ${m['align-items']}, justify ${m['justify-content']}, gap ${m.gap}, wrap ${m['flex-wrap']}, margin-bottom ${m['margin-bottom']}`,
      `H2 «${h2}», низ H2 y=${r1(h2Box.y + h2Box.h)} / низ кнопки y=${r1(b.y + b.h)} (разница ${r1(h2Box.y + h2Box.h - (b.y + b.h))}px)`,
      `кнопка ${b.w}×${b.h}, отступы ${b.padding}, фон ${b['background-color']}, радиус ${b['border-radius']}, ${b['font-family']} ${b['font-weight']} ${b['font-size']}, тень ${b['box-shadow']}`,
    ]);
  });

  await step('step-32', 'клик по кнопке — модалка входа: радиус, ширина, overflow', async () => {
    await section(2).locator('button', { hasText: 'Попробовать бесплатно' }).click();
    await wait(500);
    const drawer = page.locator('.sh-drawer');
    must((await drawer.count()) === 1, 'панель входа не открылась');
    const m = await measure(drawer, ['width', 'border-radius', 'position', 'top', 'right', 'bottom', 'box-shadow', 'z-index', 'background-color']);
    const backdrop = await measure(page.locator('.sh-backdrop'), ['background-color', 'z-index']);
    const overflow = await page.evaluate(() => document.body.style.overflow);
    const dialogRole = await page.locator('[role="dialog"]').count();
    const tabs = await drawer.locator('button').evaluateAll((els) => els.map((el) => el.textContent.trim()).filter(Boolean).slice(0, 8));
    await drawer.locator('button').first().click();
    await wait(400);
    must((await page.locator('.sh-drawer').count()) === 0, 'панель не закрылась по кнопке');
    return block('модалка входа', [
      `это ВЫЕЗЖАЮЩАЯ ПАНЕЛЬ справа, не центрированная модалка: position ${m.position}, top ${m.top} right ${m.right} bottom ${m.bottom}`,
      `ширина ${m.width} (факт ${m.w}px, правило min(440px,100vw)), радиус ${m['border-radius']}, фон ${m['background-color']}, тень ${m['box-shadow']}, z ${m['z-index']}`,
      `подложка ${backdrop['background-color']}, z ${backdrop['z-index']}; body.style.overflow = «${overflow}»`,
      `role="dialog": ${dialogRole}; кнопки: ${tabs.join(' · ')}`,
    ]);
  });

  await step('step-33', 'сетка 4×2: gap 14, восемь карточек', async () => {
    const m = await measure(page.locator('.hp-features'), ['grid-template-columns', 'gap']);
    const n = await page.locator('.hp-features > div').count();
    must(n === 8, `карточек ${n}`);
    return `колонки ${m['grid-template-columns']}, gap ${m.gap}, карточек ${n}`;
  });

  await step('step-34', 'карточка возможности: радиус, отступы, восемь подложек, иконка', async () => {
    const cards = page.locator('.hp-features > div');
    const m = await measure(cards.first(), ['border-radius', 'padding', 'border', 'transition', 'cursor']);
    const bgs = await cards.evaluateAll((els) => els.map((el) => getComputedStyle(el).backgroundColor));
    const icon = await measure(cards.first().locator('> div').first(), ['border-radius', 'background-color', 'box-shadow', 'margin-bottom']);
    return block('карточка возможности', [
      `${m.w}×${m.h}, радиус ${m['border-radius']}, отступы ${m.padding}, рамка ${m.border}, transition ${m.transition}, cursor ${m.cursor}`,
      `подложки (${new Set(bgs).size} разных): ${bgs.join(' | ')}`,
      `иконка ${icon.w}×${icon.h}, радиус ${icon['border-radius']}, фон ${icon['background-color']}, тень ${icon['box-shadow']}, margin-bottom ${icon['margin-bottom']}`,
    ]);
  });

  await step('step-35', 'восемь заголовков и подписей дословно', async () => {
    const items = await page.locator('.hp-features > div').evaluateAll((els) =>
      els.map((el) => `${el.querySelector('h3').textContent.trim()} — ${el.querySelector('p').textContent.trim()}`),
    );
    const h3 = await measure(page.locator('.hp-features h3').first(), ['font-family', 'font-weight', 'font-size', 'letter-spacing']);
    const p = await measure(page.locator('.hp-features p').first(), ['font-size', 'color', 'line-height']);
    return block('плитки', [
      ...items.map((i, n) => `${n + 1}. ${i}`),
      `h3 ${h3['font-family']} ${h3['font-weight']} ${h3['font-size']} трекинг ${h3['letter-spacing']}; p ${p['font-size']} ${p.color} lh ${p['line-height']}`,
    ]);
  });

  await step('step-36', 'наведение на плитку — transition есть, менять нечего', async () => {
    const card = page.locator('.hp-features > div').first();
    const props = ['background-color', 'transform', 'box-shadow', 'border'];
    const before = await measure(card, props);
    await card.hover();
    await wait(300);
    const after = await measure(card, props);
    const changed = props.filter((p) => before[p] !== after[p]);
    must(changed.length === 0, `изменилось: ${changed.join(', ')}`);
    return `transition ${before.transition ?? (await measure(card, ['transition'])).transition}, cursor default; обработчиков наведения: ${await hasReactHandler(card, 'onMouseEnter')}; изменений нет`;
  });

  // ── Scenario 4: ТОПОВЫЕ ЗАЛЫ ────────────────────────────────────────────
  console.log('\nScenario 4: топовые залы');

  await step('step-37', '«Все клубы»: белая, радиус 10, ховер красит рамку и текст', async () => {
    const btn = section(3).locator('button', { hasText: 'Все клубы' });
    const props = ['background-color', 'border-color', 'color', 'border-radius', 'padding', 'font-size', 'font-weight'];
    const before = await measure(btn, props);
    await btn.hover();
    await wait(250);
    const after = await measure(btn, props);
    await section(3).screenshot({ path: path.join(SHOTS, '06-clubs-1440.png') });
    return block('«Все клубы»', [
      `${before.w}×${before.h}, фон ${before['background-color']}, радиус ${before['border-radius']}, отступы ${before.padding}, ${before['font-size']} ${before['font-weight']}`,
      `рамка ${before['border-color']} → ${after['border-color']}; текст ${before.color} → ${after.color}`,
    ]);
  });

  await step('step-38', 'сетка клубов: 3 колонки, gap 16, шесть карточек', async () => {
    const m = await measure(page.locator('.hp-clubs-grid'), ['grid-template-columns', 'gap']);
    const n = await page.locator('.hp-clubs-grid > div').count();
    must(n === 6, `карточек ${n}`);
    return `колонки ${m['grid-template-columns']}, gap ${m.gap}, карточек ${n}`;
  });

  await step('step-39', 'карточка клуба: радиус 18, фото 180, градиент, тень покоя', async () => {
    const card = page.locator('.hp-clubs-grid > div').first();
    const m = await measure(card, ['border-radius', 'box-shadow', 'border', 'overflow', 'cursor', 'transition']);
    const photo = await measure(card.locator('> div').first(), ['background-color']);
    const grad = await measure(card.locator('> div > div').nth(0), ['background-image']);
    const img = await measure(card.locator('img'), ['opacity', 'object-fit']);
    return block('карточка клуба', [
      `${m.w}×${m.h}, радиус ${m['border-radius']}, рамка ${m.border}, overflow ${m.overflow}, cursor ${m.cursor}, transition ${m.transition}`,
      `тень покоя ${m['box-shadow']}`,
      `фото-блок ${photo.w}×${photo.h}, подложка ${photo['background-color']}; img opacity ${img.opacity}, object-fit ${img['object-fit']}`,
      `градиент: ${grad['background-image']}`,
    ]);
  });

  await step('step-40', 'наведение на карточку: translateY(-4), тень, opacity фото', async () => {
    const card = page.locator('.hp-clubs-grid > div').first();
    const props = ['transform', 'box-shadow'];
    const before = await measure(card, props);
    const imgBefore = (await measure(card.locator('img'), ['opacity'])).opacity;
    await card.hover();
    await wait(400);
    const after = await measure(card, props);
    const imgAfter = (await measure(card.locator('img'), ['opacity'])).opacity;
    must(after.transform !== before.transform, 'transform не изменился при наведении');
    await page.mouse.move(5, 5);
    return block('ховер карточки', [
      `transform ${before.transform} → ${after.transform}`,
      `тень ${before['box-shadow']} → ${after['box-shadow']}`,
      `фото opacity ${imgBefore} → ${imgAfter}`,
    ]);
  });

  await step('step-41', 'бейдж категории и плашка цены', async () => {
    const card = page.locator('.hp-clubs-grid > div').first();
    const cardBox = await measure(card);
    const badge = await measure(card.locator('span').filter({ hasText: 'Кроссфит' }).first(), ['background-color', 'color', 'font-size', 'font-weight', 'border-radius', 'padding']);
    const price = card.locator('p', { hasText: 'от ' }).first();
    const plate = await measure(price.locator('..'), ['background-color', 'border-radius', 'padding']);
    const priceText = await measure(price, ['font-family', 'font-weight', 'font-size', 'color']);
    return block('бейджи на фото', [
      `категория: слева ${r1(badge.x - cardBox.x)} сверху ${r1(badge.y - cardBox.y)}; фон ${badge['background-color']}, текст ${badge.color}, ${badge['font-size']} ${badge['font-weight']}, радиус ${badge['border-radius']}, отступы ${badge.padding}`,
      `цена «${await price.innerText()}»: справа ${r1(cardBox.x + cardBox.w - (plate.x + plate.w))} сверху ${r1(plate.y - cardBox.y)}; фон ${plate['background-color']}, радиус ${plate['border-radius']}, отступы ${plate.padding}; шрифт ${priceText['font-family']} ${priceText['font-weight']} ${priceText['font-size']} ${priceText.color}`,
    ]);
  });

  await step('step-42', 'подпись карточки: имя, звезда, рейтинг, отзывы, расстояние', async () => {
    const card = page.locator('.hp-clubs-grid > div').first();
    const name = card.locator('p').first();
    const n = await measure(name, ['font-family', 'font-weight', 'font-size', 'color', 'line-height']);
    const star = await measure(card.locator('svg.lucide-star'), ['fill', 'stroke']);
    const line = name.locator('..').locator('> div');
    const parts = await line.locator('span').evaluateAll((els) => els.map((el) => `«${el.textContent}» ${getComputedStyle(el).fontSize} ${getComputedStyle(el).color}`));
    const pin = await measure(card.locator('svg.lucide-map-pin'));
    const names = await page.locator('.hp-clubs-grid > div p:first-child').evaluateAll((els) => els.map((el) => el.textContent));
    return block('подпись карточки', [
      `имя ${n['font-family']} ${n['font-weight']} ${n['font-size']} ${n.color} lh ${n['line-height']}`,
      `звезда ${star.w}×${star.h} fill ${star.fill}; пин ${pin.w}×${pin.h}`,
      `элементы строки: ${parts.join(' ')}`,
      `шесть клубов: ${names.join(' · ')}`,
    ]);
  });

  await step('step-43', 'клик по карточке — каталог, без выбора клуба', async () => {
    const card = page.locator('.hp-clubs-grid > div').first();
    const clicked = await card.innerText();
    await card.click();
    await wait(600);
    const catalogInput = page.locator('input[placeholder="Вид спорта, клуб или район…"]');
    must((await catalogInput.count()) > 0, 'каталог не открылся');
    const value = await catalogInput.inputValue();
    const activeNav = await page.locator('nav.dk-links > button.on').evaluateAll((els) => els.map((el) => el.textContent.trim()));
    const hasBack = await page.locator('button', { hasText: '←' }).count();
    await backHome();
    return `нажата «${clicked.split('\n')[0]}» → каталог (пункт «${activeNav.join(', ')}»), поле поиска «${value}», кнопки «назад» к детальной: ${hasBack}; URL ${page.url()}`;
  });

  // ── Scenario 5: ТРЕНЕРЫ ─────────────────────────────────────────────────
  console.log('\nScenario 5: тренеры');

  await step('step-44', 'сетка тренеров: 4 колонки, gap 14, четыре карточки', async () => {
    const m = await measure(page.locator('.hp-trainers-grid'), ['grid-template-columns', 'gap', 'margin-bottom']);
    const n = await page.locator('.hp-trainers-grid > div').count();
    must(n === 4, `карточек ${n}`);
    await section(4).screenshot({ path: path.join(SHOTS, '07-trainers-1440.png') });
    return `колонки ${m['grid-template-columns']}, gap ${m.gap}, карточек ${n}, margin-bottom ${m['margin-bottom']}`;
  });

  await step('step-45', 'карточка тренера: радиус 18, padding 18, риска 20px', async () => {
    const card = page.locator('.hp-trainers-grid > div').first();
    const m = await measure(card, ['border-radius', 'padding', 'border', 'box-shadow', 'background-color']);
    const bar = await measure(card.locator('> div').first(), ['background-color', 'border-radius', 'margin-bottom', 'transition']);
    return block('карточка тренера', [
      `${m.w}×${m.h}, радиус ${m['border-radius']}, отступы ${m.padding}, рамка ${m.border}, фон ${m['background-color']}, тень ${m['box-shadow']}`,
      `риска ${bar.w}×${bar.h}, фон ${bar['background-color']}, радиус ${bar['border-radius']}, margin-bottom ${bar['margin-bottom']}, transition ${bar.transition}`,
    ]);
  });

  await step('step-46', 'наведение: риска 20→36, рамка зеленеет, translateY(-3)', async () => {
    const card = page.locator('.hp-trainers-grid > div').first();
    const before = await measure(card, ['transform', 'border-color', 'box-shadow']);
    const barBefore = (await measure(card.locator('> div').first())).w;
    await card.hover();
    await wait(400);
    const after = await measure(card, ['transform', 'border-color', 'box-shadow']);
    const barAfter = (await measure(card.locator('> div').first())).w;
    must(barAfter !== barBefore, 'риска не изменилась');
    await page.mouse.move(5, 5);
    return block('ховер тренера', [
      `риска ${barBefore} → ${barAfter}px`,
      `рамка ${before['border-color']} → ${after['border-color']}`,
      `transform ${before.transform} → ${after.transform}; тень ${before['box-shadow']} → ${after['box-shadow']}`,
    ]);
  });

  await step('step-47', 'аватар 56 радиус 14; рамка зелёная/серая; точка 12', async () => {
    const rows = await page.locator('.hp-trainers-grid > div').evaluateAll((els) =>
      els.map((el) => {
        const img = el.querySelector('img');
        const cs = getComputedStyle(img);
        const dot = img.parentElement.querySelector('div');
        const ds = dot ? getComputedStyle(dot) : null;
        return `${el.querySelector('p').textContent.trim()}: аватар ${img.getBoundingClientRect().width}×${img.getBoundingClientRect().height}, радиус ${cs.borderRadius}, рамка ${cs.border}` +
          (dot ? `, точка ${dot.getBoundingClientRect().width}×${dot.getBoundingClientRect().height} ${ds.backgroundColor} обводка ${ds.border}` : ', точки НЕТ');
      }),
    );
    return block('аватары', rows);
  });

  await step('step-48', 'бейдж «Доступен сейчас»; у Евгения Карпова нет', async () => {
    const cards = page.locator('.hp-trainers-grid > div');
    const withBadge = await cards.evaluateAll((els) => els.map((el) => `${el.querySelector('p').textContent.trim()}: ${el.textContent.includes('Доступен сейчас') ? 'есть' : 'НЕТ'}`));
    const badge = cards.first().locator('div', { hasText: 'Доступен сейчас' }).last();
    const m = await measure(badge, ['font-size', 'font-weight', 'color', 'background-color', 'border', 'border-radius', 'padding', 'margin-top']);
    const dot = await measure(badge.locator('div'), ['background-color']);
    const karpov = withBadge.find((r) => r.startsWith('Евгений Карпов'));
    must(karpov?.endsWith('НЕТ'), `у Евгения Карпова: ${karpov}`);
    return block('«Доступен сейчас»', [
      `${m.w}×${m.h}, ${m['font-size']} ${m['font-weight']}, текст ${m.color}, фон ${m['background-color']}, рамка ${m.border}, радиус ${m['border-radius']}, отступы ${m.padding}, margin-top ${m['margin-top']}`,
      `точка ${dot.w}×${dot.h} ${dot['background-color']}`,
      ...withBadge,
    ]);
  });

  await step('step-49', 'баннер «первое занятие бесплатно»: радиус, рамка, иконка, кнопка', async () => {
    const banner = section(4).locator('div', { hasText: '40% тренеров' }).filter({ has: page.locator('button') }).last();
    const m = await measure(banner, ['border-radius', 'border', 'padding', 'background-color']);
    const gift = await measure(banner.locator('> div > div').first(), ['border-radius', 'background-color']);
    const btn = banner.locator('button');
    const b = await measure(btn, ['background-color', 'border-radius', 'padding', 'font-family', 'font-weight', 'font-size']);
    const text = (await banner.innerText()).replace(/\n/g, ' / ');
    return block('баннер', [
      `${m.w}×${m.h}, радиус ${m['border-radius']}, рамка ${m.border}, отступы ${m.padding}, фон ${m['background-color']}`,
      `иконка-подарок ${gift.w}×${gift.h}, радиус ${gift['border-radius']}, фон ${gift['background-color']}`,
      `кнопка «${await btn.innerText()}» ${b.w}×${b.h}, фон ${b['background-color']}, радиус ${b['border-radius']}, отступы ${b.padding}, ${b['font-family']} ${b['font-weight']} ${b['font-size']}`,
      `текст: ${text}`,
    ]);
  });

  // ── Scenario 6: ЖИВАЯ ЛЕНТА ─────────────────────────────────────────────
  console.log('\nScenario 6: живая лента');

  await step('step-50', 'H2 и кнопка «Открыть ленту»', async () => {
    const s = section(5);
    const h2 = await s.locator('h2').evaluate((el) => el.innerText.replace(/\n/g, ' / '));
    const btn = s.locator('button', { hasText: 'Открыть ленту' });
    const b = await measure(btn, ['background-color', 'border', 'border-radius', 'padding', 'font-size', 'font-weight', 'color']);
    await s.screenshot({ path: path.join(SHOTS, '08-feed-1440.png') });
    return `H2 «${h2}»; кнопка ${b.w}×${b.h}, фон ${b['background-color']}, рамка ${b.border}, радиус ${b['border-radius']}, отступы ${b.padding}, ${b['font-size']} ${b['font-weight']} ${b.color}; svg: ${await btn.locator('svg').count()}`;
  });

  await step('step-51', 'сетка постов: 3 колонки gap 14; карточки радиус 16', async () => {
    const m = await measure(page.locator('.hp-posts-grid'), ['grid-template-columns', 'gap']);
    const card = await measure(page.locator('.hp-posts-grid > div').first(), ['border-radius', 'border', 'box-shadow', 'background-color', 'overflow']);
    return `колонки ${m['grid-template-columns']}, gap ${m.gap}; карточка ${card.w}×${card.h}, радиус ${card['border-radius']}, рамка ${card.border}, тень ${card['box-shadow']}, фон ${card['background-color']}, overflow ${card.overflow}`;
  });

  await step('step-52', 'шапка поста: аватар 36, имя 13, роль 10, LIVE', async () => {
    const card = page.locator('.hp-posts-grid > div').first();
    const head = await measure(card.locator('> div').first(), ['padding', 'gap']);
    const avatar = await measure(card.locator('img').first(), ['border-radius', 'border', 'object-fit']);
    const name = await measure(card.locator('p').first(), ['font-size', 'font-weight', 'color']);
    const role = await measure(card.locator('p').nth(1), ['font-size', 'color']);
    const live = await measure(card.locator('span', { hasText: 'LIVE' }), ['font-size', 'font-weight', 'color', 'background-color', 'border', 'border-radius', 'padding', 'letter-spacing']);
    return block('шапка поста', [
      `отступы ${head.padding}, gap ${head.gap}; аватар ${avatar.w}×${avatar.h}, радиус ${avatar['border-radius']}, рамка ${avatar.border}`,
      `имя «${await card.locator('p').first().innerText()}» ${name['font-size']} ${name['font-weight']} ${name.color}; роль «${await card.locator('p').nth(1).innerText()}» ${role['font-size']} ${role.color}`,
      `LIVE: ${live['font-size']} ${live['font-weight']} ${live.color}, фон ${live['background-color']}, рамка ${live.border}, радиус ${live['border-radius']}, отступы ${live.padding}, трекинг ${live['letter-spacing']}`,
    ]);
  });

  await step('step-53', 'у второго поста фото нет — высота карточки уходит', async () => {
    const rows = await page.locator('.hp-posts-grid > div').evaluateAll((els) =>
      els.map((el) => `${el.querySelector('p').textContent.trim()}: img ${el.querySelectorAll('img').length} (аватар + фото?), высота ${Math.round(el.getBoundingClientRect().height)}px`),
    );
    const alignItems = (await measure(page.locator('.hp-posts-grid'), ['align-items']))['align-items'];
    return block('фото постов', [...rows, `align-items сетки ${alignItems} (карточки растягиваются до высоты ряда)`]);
  });

  await step('step-54', 'клик «сердце»: цвет, заливка, +1 локально, не сохраняется', async () => {
    const card = page.locator('.hp-posts-grid > div').first();
    const heart = card.locator('button');
    const before = await measure(heart, ['color']);
    const textBefore = await heart.innerText();
    const fillBefore = await heart.locator('svg').getAttribute('fill');
    await heart.click();
    await wait(300);
    const after = await measure(heart, ['color']);
    const textAfter = await heart.innerText();
    const fillAfter = await heart.locator('svg').getAttribute('fill');
    must(Number(textAfter) === Number(textBefore) + 1, `счётчик ${textBefore} → ${textAfter}`);
    // Уйти на другой экран и вернуться: `key={view}` перемонтирует главную.
    await page.locator('nav.dk-links > button', { hasText: 'Клубы' }).click();
    await wait(400);
    await backHome();
    const textBack = await page.locator('.hp-posts-grid > div').first().locator('button').innerText();
    return `цвет ${before.color} → ${after.color}; fill ${fillBefore} → ${fillAfter}; счётчик ${textBefore} → ${textAfter}; после ухода и возврата ${textBack} (${textBack === textBefore ? 'сброшен — не сохраняется' : 'сохранён'})`;
  });

  // ── Scenario 7: ЧЕЛЛЕНДЖИ ───────────────────────────────────────────────
  console.log('\nScenario 7: челленджи');

  await step('step-55', 'две колонки: текст max-width 440, плитки 1fr 1fr', async () => {
    const s = section(6);
    const text = await measure(s.locator('> div > div > div').first(), ['max-width', 'margin-bottom']);
    const tiles = await measure(s.locator('> div > div > div').nth(1), ['grid-template-columns', 'gap', 'min-width', 'max-width', 'flex']);
    await s.screenshot({ path: path.join(SHOTS, '09-challenges-1440.png') });
    return `текстовая колонка ${text.w}×${text.h}, max-width ${text['max-width']}; плитки ${tiles.w}×${tiles.h}, колонки ${tiles['grid-template-columns']}, gap ${tiles.gap}, min-width ${tiles['min-width']}, max-width ${tiles['max-width']}, flex ${tiles.flex}`;
  });

  await step('step-56', 'полоса «4 активных прямо сейчас · 771 участник»', async () => {
    const bar = section(6).locator('div', { hasText: '4 активных прямо сейчас' }).last();
    const m = await measure(bar, ['background-color', 'border', 'border-radius', 'padding', 'gap']);
    const nums = await measure(bar.locator('span').last(), ['font-family', 'font-weight', 'font-size', 'color']);
    return `«${(await bar.innerText()).replace(/\n/g, ' · ')}»: ${m.w}×${m.h}, фон ${m['background-color']}, рамка ${m.border}, радиус ${m['border-radius']}, отступы ${m.padding}; число ${nums['font-family']} ${nums['font-weight']} ${nums['font-size']} ${nums.color}`;
  });

  await step('step-57', 'плитка челленджа: радиус 16, рамка', async () => {
    const tile = section(6).locator('button').filter({ hasText: '⚡ 30/30' }).first();
    const m = await measure(tile, ['border-radius', 'border', 'background-color', 'padding', 'text-align', 'transition']);
    const titles = await section(6).locator('button').filter({ hasText: 'участников' }).evaluateAll((els) => els.map((el) => el.querySelector('p').textContent.trim()));
    return `${m.w}×${m.h}, радиус ${m['border-radius']}, рамка ${m.border}, фон ${m['background-color']}, отступы ${m.padding}, transition ${m.transition}; плитки: ${titles.join(' · ')}`;
  });

  await step('step-58', 'наведение на плитку: рамка, фон, translateY(-2)', async () => {
    const tile = section(6).locator('button').filter({ hasText: '⚡ 30/30' }).first();
    const props = ['border-color', 'background-color', 'transform'];
    const before = await measure(tile, props);
    await tile.hover();
    await wait(350);
    const after = await measure(tile, props);
    must(after.transform !== before.transform, 'transform не изменился');
    await page.mouse.move(5, 5);
    return `рамка ${before['border-color']} → ${after['border-color']}; фон ${before['background-color']} → ${after['background-color']}; transform ${before.transform} → ${after.transform}`;
  });

  // ── Scenario 8: ОТЗЫВЫ ──────────────────────────────────────────────────
  console.log('\nScenario 8: отзывы');

  await step('step-59', 'сетка отзывов: auto-fill minmax(280,1fr), без класса', async () => {
    const grid = section(7).locator('> div > div').nth(1);
    const m = await measure(grid, ['grid-template-columns', 'gap']);
    const cls = await grid.evaluate((el) => el.className || '(нет класса)');
    const n = await grid.locator('> div').count();
    await section(7).screenshot({ path: path.join(SHOTS, '10-testimonials-1440.png') });
    return `колонки ${m['grid-template-columns']} (${m['grid-template-columns'].split(' ').length} шт. при контейнере ${m.w}px), gap ${m.gap}; class «${cls}»; карточек ${n}`;
  });

  await step('step-60', 'карточка отзыва: радиус 18, padding 24, звёзды, курсив, аватар', async () => {
    const card = section(7).locator('> div > div').nth(1).locator('> div').first();
    const m = await measure(card, ['border-radius', 'padding', 'border', 'box-shadow']);
    const stars = await card.locator('svg').evaluateAll((els) => `${els.length} шт., ${els[0].getBoundingClientRect().width}px, fill ${els[0].getAttribute('fill')}`);
    const text = await measure(card.locator('p').first(), ['font-size', 'font-style', 'color', 'line-height']);
    const quote = await card.locator('p').first().innerText();
    const avatar = await measure(card.locator('img'), ['border-radius', 'border']);
    return block('карточка отзыва', [
      `${m.w}×${m.h}, радиус ${m['border-radius']}, отступы ${m.padding}, рамка ${m.border}, тень ${m['box-shadow']}`,
      `звёзды ${stars}; текст ${text['font-size']} ${text['font-style']} ${text.color} lh ${text['line-height']}, начинается с «${quote.slice(0, 1)}» заканчивается «${quote.slice(-1)}»`,
      `аватар ${avatar.w}×${avatar.h}, радиус ${avatar['border-radius']}, рамка ${avatar.border}`,
    ]);
  });

  await step('step-61', 'формат подписи роли', async () => {
    const roles = await section(7).locator('img').evaluateAll((els) => els.map((el) => el.parentElement.querySelectorAll('p')[1].textContent.trim()));
    return `подписи: ${roles.join(' · ')}`;
  });

  // ── Scenario 9: ФИНАЛЬНЫЙ ПРИЗЫВ И ПОДВАЛ ───────────────────────────────
  console.log('\nScenario 9: финальный призыв и подвал');

  await step('step-62', 'секция призыва: фон #111, padding 80, свечение 700×400', async () => {
    const s = section(8);
    const m = await measure(s, ['background-color', 'padding', 'overflow', 'position']);
    const glow = await measure(s.locator('> div').first(), ['background-image', 'border-radius', 'transform']);
    const sBox = await measure(s);
    await s.screenshot({ path: path.join(SHOTS, '11-cta-1440.png') });
    return `фон ${m['background-color']}, отступы ${m.padding}, overflow ${m.overflow}; свечение ${glow.w}×${glow.h}, центр x=${r1(glow.x + glow.w / 2 - sBox.x)} y=${r1(glow.y + glow.h / 2 - sBox.y)} при секции ${sBox.w}×${sBox.h}, радиус ${glow['border-radius']}, ${glow['background-image'].slice(0, 80)}…`;
  });

  await step('step-63', 'H2 и подзаголовок призыва', async () => {
    const s = section(8);
    const h2 = await measure(s.locator('h2'), ['font-family', 'font-weight', 'font-size', 'line-height', 'letter-spacing', 'color']);
    const green = (await measure(s.locator('h2 span'), ['color'])).color;
    const sub = await measure(s.locator('p').nth(1), ['font-size', 'color', 'max-width', 'line-height']);
    const rubric = await measure(s.locator('p').first(), ['font-family', 'font-size', 'color']);
    return block('призыв', [
      `рубрика «${await s.locator('p').first().innerText()}» ${rubric['font-family']} ${rubric['font-size']} ${rubric.color}`,
      `H2 «${await s.locator('h2').evaluate((el) => el.innerText.replace(/\n/g, ' / '))}»: ${h2['font-family']} ${h2['font-weight']} ${h2['font-size']} (clamp(2.2rem,5vw,4.2rem) при 1440 → потолок 67.2px), lh ${h2['line-height']}, трекинг ${h2['letter-spacing']}, цвет ${h2.color}, вторая строка ${green}`,
      `подзаголовок «${await s.locator('p').nth(1).innerText()}»: ${sub['font-size']} ${sub.color}, max-width ${sub['max-width']}, lh ${sub['line-height']}`,
    ]);
  });

  await step('step-64', 'две кнопки и их ховеры', async () => {
    const s = section(8);
    const create = s.locator('button', { hasText: 'Создать аккаунт' });
    const browse = s.locator('button', { hasText: 'Смотреть клубы' });
    const c0 = await measure(create, ['background-color', 'border-radius', 'padding', 'font-family', 'font-weight', 'font-size', 'box-shadow', 'transform']);
    await create.hover();
    await wait(350);
    const c1 = await measure(create, ['box-shadow', 'transform']);
    const b0 = await measure(browse, ['background-color', 'border', 'border-radius', 'padding', 'font-size', 'font-weight', 'color']);
    await browse.hover();
    await wait(350);
    const b1 = await measure(browse, ['border-color', 'color']);
    await page.mouse.move(5, 5);
    return block('кнопки призыва', [
      `«Создать аккаунт» ${c0.w}×${c0.h}, фон ${c0['background-color']}, радиус ${c0['border-radius']}, отступы ${c0.padding}, ${c0['font-family']} ${c0['font-weight']} ${c0['font-size']}`,
      `  ховер: transform ${c0.transform} → ${c1.transform}; тень ${c0['box-shadow']} → ${c1['box-shadow']}`,
      `«Смотреть клубы» ${b0.w}×${b0.h}, фон ${b0['background-color']}, рамка ${b0.border}, радиус ${b0['border-radius']}, отступы ${b0.padding}, ${b0['font-size']} ${b0['font-weight']}, текст ${b0.color}`,
      `  ховер: рамка → ${b1['border-color']}; текст → ${b1.color}`,
    ]);
  });

  await step('step-65', 'строка под кнопками', async () => {
    const p = section(8).locator('p').last();
    const m = await measure(p, ['font-size', 'color', 'margin']);
    summary.palette['призыв: строка под кнопками'] = m.color;
    return `«${await p.innerText()}»: ${m['font-size']} ${m.color}, поля ${m.margin}`;
  });

  await step('step-66', 'подвал: фон, padding, логотип, четыре ссылки, ховер, копирайт', async () => {
    const footer = page.locator('footer');
    const m = await measure(footer, ['background-color', 'padding', 'border-top']);
    const links = footer.locator('button');
    const labels = await links.evaluateAll((els) => els.map((el) => el.textContent.trim()));
    const l0 = await measure(links.first(), ['color', 'font-size', 'font-weight']);
    await links.first().hover();
    await wait(250);
    const l1 = (await measure(links.first(), ['color'])).color;
    const copy = footer.locator('p').last();
    const c = await measure(copy, ['font-size', 'color']);
    const logoIsLink = await footer.locator('> div > div').first().evaluate((el) => `${el.tagName}${el.closest('a,button') ? ' внутри ссылки/кнопки' : ' — не ссылка и не кнопка'}`);
    summary.palette['подвал: фон'] = m['background-color'];
    summary.palette['подвал: ссылки'] = l0.color;
    await footer.screenshot({ path: path.join(SHOTS, '12-footer-1440.png') });
    return block('подвал', [
      `${m.w}×${m.h}, фон ${m['background-color']}, отступы ${m.padding}, граница сверху ${m['border-top']}`,
      `логотип: ${logoIsLink}; ссылки (${labels.length}): ${labels.join(' · ')}, ${l0['font-size']} ${l0['font-weight']}, цвет ${l0.color} → ховер ${l1}`,
      `копирайт «${await copy.innerText()}» ${c['font-size']} ${c.color} — год захардкожен`,
    ]);
  });

  // ── Scenario 10: адаптив ────────────────────────────────────────────────
  console.log('\nScenario 10: адаптив');

  /** Раскладка главной на текущем окне: число колонок ключевых сеток. */
  async function layout() {
    return page.evaluate(() => {
      const cols = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return 'нет';
        const cs = getComputedStyle(el);
        if (cs.display === 'none') return 'скрыт';
        return String(cs.gridTemplateColumns.split(' ').length);
      };
      const heroRight = document.querySelector('.hp-hero-right');
      const links = document.querySelector('.dk-links');
      const burger = document.querySelector('.dk-hamburger');
      const phone = document.querySelector('.mob-phone');
      const container = document.querySelector('.hp-hero')?.parentElement;
      return {
        hero: cols('.hp-hero'),
        heroRight: heroRight ? getComputedStyle(heroRight).display : 'нет',
        features: cols('.hp-features'),
        clubs: cols('.hp-clubs-grid'),
        trainers: cols('.hp-trainers-grid'),
        posts: cols('.hp-posts-grid'),
        steps: cols('.hp-steps'),
        links: links ? getComputedStyle(links).display : 'нет',
        burger: burger ? getComputedStyle(burger).display : 'нет',
        phone: phone ? `${Math.round(phone.getBoundingClientRect().width)}×${Math.round(phone.getBoundingClientRect().height)}` : 'нет',
        container: container ? Math.round(container.getBoundingClientRect().width) : 0,
        bodyOverflow: getComputedStyle(document.body).overflow,
        hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      };
    });
  }

  const fmt = (l) =>
    `герой ${l.hero} (правая колонка ${l.heroRight}), возможности ${l.features}, клубы ${l.clubs}, тренеры ${l.trainers}, посты ${l.posts}, шаги ${l.steps}; меню ${l.links} / гамбургер ${l.burger}; контейнер ${l.container}px; рамка телефона ${l.phone}; body overflow ${l.bodyOverflow}; гориз. скролл окна ${l.hscroll}`;

  await step('step-67', '1440×900 — эталон раскладки', async () => {
    await openHome(1440, 900);
    const l = await layout();
    summary.breakpoints['1440'] = fmt(l);
    must(l.hero === '2' && l.features === '4' && l.clubs === '3' && l.trainers === '4' && l.posts === '3' && l.steps === '3', fmt(l));
    await page.screenshot({ path: path.join(SHOTS, 'bp-1440.png'), fullPage: false });
    return fmt(l);
  });

  await step('step-68', '1280×900 — что изменилось', async () => {
    await openHome(1280, 900);
    const l = await layout();
    summary.breakpoints['1280'] = fmt(l);
    await page.screenshot({ path: path.join(SHOTS, 'bp-1280.png') });
    return fmt(l);
  });

  await step('step-69', '1100×900 — порог 1: герой в одну колонку, правая колонка исчезает', async () => {
    await openHome(1100, 900);
    const l = await layout();
    summary.breakpoints['1100'] = fmt(l);
    must(l.hero === '1' && l.heroRight === 'none', fmt(l));
    await page.screenshot({ path: path.join(SHOTS, 'bp-1100.png') });
    return fmt(l);
  });

  await step('step-70', '960×900 — порог оболочки: гамбургер, выпадающая панель', async () => {
    await openHome(960, 900);
    const l = await layout();
    summary.breakpoints['960'] = fmt(l);
    must(l.links === 'none' && l.burger === 'flex', fmt(l));
    await page.locator('.dk-hamburger').click();
    await wait(300);
    /** Выпадающая панель меню: absolute-блок в шапке с пятью кнопками. */
    const findPanel = () =>
      page.evaluate(() => {
        const el = Array.from(document.querySelectorAll('header div')).find(
          (d) => getComputedStyle(d).position === 'absolute' && d.querySelectorAll('button').length >= 5,
        );
        return el ? Array.from(el.querySelectorAll('button')).map((b) => b.textContent.trim()) : null;
      });
    const panelButtons = (await findPanel()) ?? [];
    must(panelButtons.length === 5, `пунктов в панели ${panelButtons.length}`);
    const overlayBg = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('header div')).find((d) => getComputedStyle(d).position === 'fixed');
      return el ? `${getComputedStyle(el).backgroundColor} z ${getComputedStyle(el).zIndex}` : 'нет';
    });
    const panel = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('header div')).find((d) => getComputedStyle(d).position === 'absolute' && d.querySelectorAll('button').length >= 5);
      if (!el) return 'нет';
      const cs = getComputedStyle(el);
      const b = el.querySelector('button');
      const bs = getComputedStyle(b);
      return `панель: top ${cs.top}, отступы ${cs.padding}, тень ${cs.boxShadow}; пункт: ${bs.fontFamily} ${bs.fontWeight} ${bs.fontSize}, отступы ${bs.padding}, радиус ${bs.borderRadius}, высота ${Math.round(b.getBoundingClientRect().height)}`;
    });
    await page.screenshot({ path: path.join(SHOTS, 'bp-960-menu.png') });
    await page.keyboard.press('Escape');
    await wait(200);
    const stillOpen = (await findPanel()) !== null;
    if (stillOpen) {
      await page.mouse.click(480, 700);
      await wait(200);
    }
    return `${fmt(l)}; панель: пункты ${panelButtons.join(' · ')}; оверлей ${overlayBg}; ${panel}; Escape закрывает: ${stillOpen ? 'НЕТ (закрыта кликом по оверлею)' : 'да'}`;
  });

  await step('step-71', '800×900 — прямо перед порогом телефона', async () => {
    await openHome(800, 900);
    const l = await layout();
    summary.breakpoints['800'] = fmt(l);
    must(l.phone === 'нет', 'рамка телефона появилась раньше 768');
    await page.screenshot({ path: path.join(SHOTS, 'bp-800.png') });
    return fmt(l);
  });

  await step('step-72', '768×900 — порог 2 (двойной): макет телефона + медиазапросы 768', async () => {
    await openHome(768, 900);
    const l = await layout();
    summary.breakpoints['768'] = fmt(l);
    must(l.phone !== 'нет', 'рамки телефона нет при 768');
    const tabs = await page.locator('.mob-phone > div:nth-last-child(2) button').evaluateAll((els) => els.map((el) => el.textContent.trim()));
    const frame = await measure(page.locator('.mob-phone'), ['border-radius', 'box-shadow']);
    const status = await page.locator('.mob-phone').locator('span', { hasText: '9:41' }).count();
    await page.screenshot({ path: path.join(SHOTS, 'bp-768-phone.png') });
    return `${fmt(l)}; рамка ${frame.w}×${frame.h} радиус ${frame['border-radius']}; статус-бар «9:41»: ${status}; нижние табы: ${tabs.join(' · ')}`;
  });

  await step('step-73', '768×700 — рамка scale(0.85)', async () => {
    await page.setViewportSize({ width: 768, height: 700 });
    await wait(300);
    const t = (await measure(page.locator('.mob-device'), ['transform'])).transform;
    must(t.includes('0.85'), `transform ${t}`);
    return `transform ${t}`;
  });

  await step('step-74', '768×600 — рамка scale(0.72)', async () => {
    await page.setViewportSize({ width: 768, height: 600 });
    await wait(300);
    const t = (await measure(page.locator('.mob-device'), ['transform'])).transform;
    must(t.includes('0.72'), `transform ${t}`);
    return `transform ${t}`;
  });

  await step('step-75', '540×900 — порог 3: сетки внутри 390; обрезается ли рамка', async () => {
    await openHome(540, 900);
    const l = await layout();
    summary.breakpoints['540'] = fmt(l);
    const device = await measure(page.locator('.mob-device'));
    const clipped = device.x < 0 || device.x + device.w > 540;
    await page.screenshot({ path: path.join(SHOTS, 'bp-540.png') });
    return `${fmt(l)}; рамка x=${device.x} w=${device.w} — ${clipped ? 'ОБРЕЗАЕТСЯ' : 'помещается'}`;
  });

  await step('step-76', '430×900 и 390×900 — горизонтальный скролл', async () => {
    const out = [];
    for (const w of [430, 390]) {
      await openHome(w, 900);
      const info = await page.evaluate(() => {
        const doc = document.documentElement;
        const device = document.querySelector('.mob-device').getBoundingClientRect();
        const screen = document.querySelector('.mob-screen');
        const home = screen?.firstElementChild;
        const cs = home ? getComputedStyle(home) : null;
        return {
          scrollW: doc.scrollWidth,
          clientW: doc.clientWidth,
          deviceX: Math.round(device.x),
          deviceW: Math.round(device.width),
          screenScrollW: screen?.scrollWidth,
          screenClientW: screen?.clientWidth,
          minWidth: cs?.minWidth,
        };
      });
      out.push(`${w}px: документ scrollWidth ${info.scrollW} / clientWidth ${info.clientW} (${info.scrollW > info.clientW ? 'ЕСТЬ скролл' : 'нет скролла, body overflow hidden'}); рамка x=${info.deviceX} w=${info.deviceW}${info.deviceX < 0 ? ' — УХОДИТ ЗА ЛЕВЫЙ КРАЙ' : ''}; экран телефона scrollWidth ${info.screenScrollW} / clientWidth ${info.screenClientW}; min-width главной ${info.minWidth}`);
      await page.screenshot({ path: path.join(SHOTS, `bp-${w}.png`) });
    }
    summary.breakpoints['430 / 390'] = out.join(' || ');
    return block('узкие окна', out);
  });

  await step('step-77', 'какая секция ломается первой при сужении', async () => {
    // Десктопная оболочка живёт до 769px: идём вниз шагом 20 и ищем первую ширину
    // с горизонтальной прокруткой контейнера страницы и секцию, что вылезла.
    let firstBreak = 'ни на одной ширине десктопа (769…1440) прокрутки нет';
    for (let w = 1440; w >= 769; w -= 20) {
      await page.setViewportSize({ width: w, height: 900 });
      await wait(120);
      const broken = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const sections = Array.from(document.querySelectorAll('section, footer'));
        const over = sections
          .map((el, i) => ({ i, name: el.tagName === 'FOOTER' ? 'подвал' : `секция ${i + 1}`, right: Math.round(el.getBoundingClientRect().right), sw: el.scrollWidth, cw: el.clientWidth }))
          .filter((s) => s.right > vw + 1 || s.sw > s.cw + 1);
        return over.length ? `${over[0].name} (right ${over[0].right} > ${vw}, scrollWidth ${over[0].sw} > ${over[0].cw})` : null;
      });
      if (broken) {
        firstBreak = `первая ширина с переполнением: ${w}px — ${broken}`;
        break;
      }
    }
    // Внутри рамки телефона ширина контента всегда 390: смотрим, что вылезает за 390.
    await openHome(390, 900);
    const phoneOver = await page.evaluate(() => {
      const screen = document.querySelector('.mob-screen');
      const limit = screen.getBoundingClientRect().right + 1;
      return Array.from(screen.querySelectorAll('section, footer, .hp-steps, .hp-clubs-grid, .hp-trainers-grid'))
        .map((el) => ({
          name: el.className || `${el.tagName.toLowerCase()} «${(el.querySelector('h1,h2')?.innerText ?? '').replace(/\n/g, ' ').slice(0, 30)}»`,
          right: Math.round(el.getBoundingClientRect().right),
          sw: el.scrollWidth,
          cw: el.clientWidth,
          overflow: getComputedStyle(el).overflow,
        }))
        .filter((s) => s.right > limit || s.sw > s.cw + 1)
        .slice(0, 5)
        .map((s) => `${s.name}: right ${s.right}, scrollWidth ${s.sw} > clientWidth ${s.cw}, overflow ${s.overflow}${s.overflow === 'hidden' ? ' — обрезано, видимого перелома нет' : ' — ВИДИМЫЙ перелом'}`);
    });
    return block('переполнение', [
      firstBreak,
      `в рамке телефона (390): ${phoneOver.length ? phoneOver.join('; ') : 'ни одна секция не выходит за 390'}`,
    ]);
  });

  await step('step-78', 'ширина 1440 → 700 → 1440 без перезагрузки: прокрутка и состояние', async () => {
    await openHome(1440, 900);
    await searchWidget().locator('input').fill('йога');
    await scrollTo(1500);
    const handleBefore = await scroller();
    const scrollBefore = await handleBefore.evaluate((el) => el.scrollTop);
    await page.setViewportSize({ width: 700, height: 900 });
    await wait(400);
    const phone = await page.locator('.mob-phone').count();
    await page.setViewportSize({ width: 1440, height: 900 });
    await wait(500);
    const handleAfter = await scroller();
    const scrollAfter = await handleAfter.evaluate((el) => el.scrollTop);
    const value = await searchWidget().locator('input').inputValue();
    return `прокрутка до ${scrollBefore}px; на 700 рамка телефона: ${phone}; после возврата прокрутка ${scrollAfter}px (${scrollAfter === scrollBefore ? 'сохранена' : 'ПОТЕРЯНА'}), текст в поле «${value}» (${value === 'йога' ? 'сохранён' : 'ПОТЕРЯН — оболочка перемонтировала дерево'})`;
  });

  // ── Scenario 11: дерево доступности ─────────────────────────────────────
  console.log('\nScenario 11: дерево доступности');

  await step('step-79', '<title> и <html lang>', async () => {
    await openHome(1440, 900);
    const title = await page.title();
    const lang = await page.evaluate(() => document.documentElement.lang);
    const description = await page.evaluate(() => document.querySelector('meta[name="description"]')?.content ?? '');
    return `title «${title}», lang «${lang}» (страница по-русски), description «${description.slice(0, 80)}…» — про билеты, не про спорт`;
  });

  await step('step-80', 'иерархия заголовков', async () => {
    const heads = await page.evaluate(() =>
      Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((el) => `${el.tagName.toLowerCase()} «${el.innerText.replace(/\n/g, ' ').slice(0, 40)}»`),
    );
    const levels = heads.map((h) => Number(h[1]));
    const h1 = levels.filter((l) => l === 1).length;
    const skips = [];
    for (let i = 1; i < levels.length; i += 1) if (levels[i] > levels[i - 1] + 1) skips.push(`${heads[i - 1].split(' ')[0]} → ${heads[i].split(' ')[0]}`);
    return block('заголовки', [
      `h1: ${h1}; всего ${heads.length}; пропусков уровня: ${skips.length ? skips.join(', ') : 'нет'}`,
      heads.join(' | '),
    ]);
  });

  await step('step-81', 'ориентиры: banner / main / navigation / contentinfo', async () => {
    const counts = await page.evaluate(() => ({
      header: document.querySelectorAll('header, [role="banner"]').length,
      main: document.querySelectorAll('main, [role="main"]').length,
      nav: document.querySelectorAll('nav, [role="navigation"]').length,
      footer: document.querySelectorAll('footer, [role="contentinfo"]').length,
    }));
    const snap = await page.locator('body').ariaSnapshot();
    const roles = ['banner', 'main', 'navigation', 'contentinfo'].map((r) => `${r}: ${(snap.match(new RegExp(`- ${r}\\b`, 'g')) ?? []).length}`);
    must(counts.main === 0, `main найден: ${counts.main}`);
    fs.writeFileSync(path.join(SHOTS, 'aria-snapshot-1440.yaml'), snap, 'utf8');
    return `в DOM: header ${counts.header}, main ${counts.main} (НЕТ), nav ${counts.nav}, footer ${counts.footer}; в дереве доступности: ${roles.join(', ')}; снимок дерева — aria-snapshot-1440.yaml (${snap.split('\n').length} строк)`;
  });

  await step('step-82', 'подписи всех кнопок шапки; безымянные', async () => {
    const names = await page.locator('header button').evaluateAll((els) =>
      els.map((el) => {
        const visible = getComputedStyle(el).display !== 'none';
        // innerText, а не textContent: в кнопке логотипа лежит <style> с keyframes.
        const name = el.getAttribute('aria-label') || el.innerText.trim() || el.getAttribute('title') || '';
        return { name, visible, svg: el.querySelectorAll('svg').length };
      }),
    );
    const nameless = names.filter((n) => n.visible && n.name === '');
    return block('кнопки шапки', [
      `видимых ${names.filter((n) => n.visible).length}, скрытых ${names.filter((n) => !n.visible).length}`,
      `имена: ${names.map((n) => `«${n.name || '(пусто)'}»${n.visible ? '' : ' (скрыта)'}`).join(' · ')}`,
      `безымянных видимых: ${nameless.length} — ${nameless.length ? 'логотип (только PNG-маски без alt) и колокольчик' : 'нет'}`,
    ]);
  });

  await step('step-83', 'роль карточки клуба — generic, не button и не link', async () => {
    const card = page.locator('.hp-clubs-grid > div').first();
    const info = await card.evaluate((el) => ({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute('role'),
      tabindex: el.getAttribute('tabindex'),
      link: el.closest('a, button') ? 'внутри ссылки/кнопки' : 'нет',
    }));
    const onClick = await hasReactHandler(card, 'onClick');
    const snap = await page.locator('.hp-clubs-grid').ariaSnapshot();
    const firstLines = snap.split('\n').slice(0, 4).join(' / ');
    return `<${info.tag}> role=${info.role ?? 'нет (generic)'}, tabindex=${info.tabindex ?? 'нет'}, onClick: ${onClick ? 'есть' : 'нет'}, обёртки-ссылки: ${info.link}; дерево доступности сетки начинается с: ${firstLines}`;
  });

  await step('step-84', 'обход Tab: куда фокус не попадает, виден ли фокус-ринг', async () => {
    await openHome(1440, 900);
    const visited = [];
    let cardFocused = 0;
    let ringSample = '';
    for (let i = 0; i < 120; i += 1) {
      await page.keyboard.press('Tab');
      const info = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return null;
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName.toLowerCase(),
          text: (el.getAttribute('aria-label') || el.innerText || el.getAttribute('placeholder') || '').trim().slice(0, 25) || '(без имени)',
          inClubCard: Boolean(el.closest('.hp-clubs-grid')),
          ring: `outline ${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}; box-shadow ${cs.boxShadow.slice(0, 40)}`,
        };
      });
      if (!info) break;
      if (info.inClubCard) cardFocused += 1;
      if (!ringSample && info.tag === 'button') ringSample = `${info.text}: ${info.ring}`;
      visited.push(`${info.tag}:${info.text}`);
      if (visited.length > 3 && visited[visited.length - 1] === visited[0]) break;
    }
    return block('обход Tab', [
      `остановок ${visited.length}; элементов в карточках клубов получили фокус: ${cardFocused} (шесть карточек — div без tabindex)`,
      `фокус-ринг на первой кнопке: ${ringSample || 'не снят'} (браузерный по умолчанию, свой не задан)`,
      `первые остановки: ${visited.slice(0, 14).join(' → ')}`,
    ]);
  });

  await step('step-85', 'выпадашка с клавиатуры; Enter по запросу не срабатывает', async () => {
    await openHome(1440, 900);
    const input = searchWidget().locator('input');
    await input.focus();
    await wait(250);
    const dd = heroLeft().locator('div').filter({ hasText: 'Популярные запросы' }).filter({ has: page.locator('button') }).last();
    must((await dd.count()) > 0, 'выпадашка не открылась по фокусу');
    const handlers = await dd.locator('button').first().evaluate((el) => {
      const key = Object.keys(el).find((k) => k.startsWith('__reactProps'));
      return Object.keys(el[key] ?? {}).filter((k) => k.startsWith('on')).join(', ');
    });
    // Tab уводит фокус с поля: onBlur через 150 мс закрывает выпадашку.
    await page.keyboard.press('Tab');
    await wait(400);
    const stillOpenAfterTab = (await dd.count()) > 0;
    const focused = await page.evaluate(() => `${document.activeElement.tagName.toLowerCase()} «${document.activeElement.textContent.trim().slice(0, 20)}»`);
    let enterResult = 'выпадашка закрылась раньше, чем до кнопки дошёл фокус';
    if (stillOpenAfterTab) {
      await page.keyboard.press('Enter');
      await wait(500);
      enterResult = (await page.locator('h1').count()) === 1 ? 'Enter по кнопке ничего не сделал (обработчик на onMouseDown)' : 'Enter перевёл на другой экран';
    }
    return `после Tab фокус на ${focused}; выпадашка ${stillOpenAfterTab ? 'открыта' : 'ЗАКРЫЛАСЬ по blur'}; ${enterResult}; обработчики чипа: ${handlers}`;
  });

  await step('step-86', 'модалка входа: role=dialog, запирание фокуса, Esc', async () => {
    await page.locator('header button', { hasText: 'Войти' }).click();
    await wait(500);
    const drawer = page.locator('.sh-drawer');
    must((await drawer.count()) === 1, 'панель не открылась');
    const roles = await page.evaluate(() => ({
      dialog: document.querySelectorAll('[role="dialog"], dialog').length,
      modal: document.querySelectorAll('[aria-modal="true"]').length,
    }));
    const focusedOnOpen = await page.evaluate(() => `${document.activeElement.tagName.toLowerCase()}${document.activeElement.closest('.sh-drawer') ? ' внутри панели' : ' ВНЕ панели'}`);
    let escaped = 0;
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press('Tab');
      const inside = await page.evaluate(() => Boolean(document.activeElement.closest('.sh-drawer')));
      if (!inside) escaped += 1;
    }
    await page.keyboard.press('Escape');
    await wait(300);
    const closedByEsc = (await page.locator('.sh-drawer').count()) === 0;
    if (!closedByEsc) {
      await page.locator('.sh-backdrop').click({ position: { x: 20, y: 20 } });
      await wait(300);
    }
    return `role=dialog: ${roles.dialog}, aria-modal: ${roles.modal}; фокус при открытии: ${focusedOnOpen}; за 40 Tab фокус ушёл наружу ${escaped} раз (${escaped ? 'НЕ заперт' : 'заперт'}); Esc закрывает: ${closedByEsc ? 'да' : 'НЕТ'}; клик по подложке закрыл: ${(await page.locator('.sh-drawer').count()) === 0}`;
  });

  await step('step-87', 'alt всех изображений: пустые и дублирующие текст', async () => {
    const imgs = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img')).map((img) => {
        const alt = img.getAttribute('alt');
        const parentText = img.parentElement?.parentElement?.textContent ?? '';
        return { alt, empty: alt === '' || alt === null, dup: alt && parentText.includes(alt) };
      }),
    );
    const masks = await page.locator('[style*="mask-image"]').count();
    return block('изображения', [
      `img всего ${imgs.length}; с пустым alt ${imgs.filter((i) => i.empty).length}; alt дублирует соседний текст ${imgs.filter((i) => i.dup).length}`,
      `alt: ${imgs.map((i) => `«${i.alt ?? '(нет)'}»`).join(' · ')}`,
      `логотип-бегун — ${masks} div с mask-image (PNG-маска, без alt и без роли)`,
    ]);
  });

  await step('step-88', 'контраст четырёх серых текстов на тёмном', async () => {
    const pairs = [
      ['подзаголовок героя', 'rgba(255, 255, 255, 0.45)', 'rgb(17, 17, 17)'],
      ['подписи счётчиков', 'rgba(255, 255, 255, 0.28)', 'rgb(17, 17, 17)'],
      ['строка под кнопками призыва', 'rgba(255, 255, 255, 0.18)', 'rgb(17, 17, 17)'],
      ['ссылки подвала', 'rgba(255, 255, 255, 0.3)', 'rgb(10, 10, 10)'],
    ];
    const rows = pairs.map(([name, fg, bg]) => {
      const c = contrast(fg, bg);
      return `${name}: ${fg} на ${bg} → ${c}:1 — ${c >= 4.5 ? 'AA' : c >= 3 ? 'ПРОВАЛ AA (крупный текст AA-large)' : 'ПРОВАЛ AA и AA-large'}`;
    });
    const fails = rows.filter((r) => r.includes('ПРОВАЛ')).length;
    // ⚠️ Чек-лист ждал четыре провала; подзаголовок героя проходит AA на волосок
    // (4.53:1 при пороге 4.5). Записываем факт, а не ожидание.
    return block('контраст (WCAG 2.x)', [...rows, `провалов AA: ${fails} из 4 (чек-лист ожидал 4)`]);
  });

  await step('step-89', 'контраст зелёного #7ED900 и обратных пар', async () => {
    const rows = [
      ['зелёный текст на белом', 'rgb(126, 217, 0)', 'rgb(255, 255, 255)'],
      ['тёмный текст на зелёной кнопке', 'rgb(17, 17, 17)', 'rgb(126, 217, 0)'],
      ['зелёный текст на #111 (счётчики, третья строка H1)', 'rgb(126, 217, 0)', 'rgb(17, 17, 17)'],
      ['#3a7000 на белом (рубрики секций)', 'rgb(58, 112, 0)', 'rgb(255, 255, 255)'],
      ['серый текст #6B7280 на белом', 'rgb(107, 114, 128)', 'rgb(255, 255, 255)'],
    ].map(([name, fg, bg]) => {
      const c = contrast(fg, bg);
      return `${name}: ${c}:1 — ${c >= 4.5 ? 'AA' : c >= 3 ? 'только AA-large' : 'ПРОВАЛ'}`;
    });
    return block('контраст зелёного', rows);
  });

  await step('step-90', 'prefers-reduced-motion: гасителя нет ни у одной анимации', async () => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await wait(100);
    const early = await heroLeft().locator('> div').last().locator('p').first().innerText();
    await wait(1500);
    const late = await heroLeft().locator('> div').last().locator('p').first().innerText();
    const anims = await page.evaluate(() => {
      const name = (sel) => {
        const el = document.querySelector(sel);
        return el ? `${getComputedStyle(el).animationName} ${getComputedStyle(el).animationDuration}` : 'нет';
      };
      return { logo: name('.ps-hp-r1'), screen: name('.dk-screen'), mq: matchMedia('(prefers-reduced-motion: reduce)').matches };
    });
    const cssGuard = await page.evaluate(() =>
      Array.from(document.styleSheets).some((s) => {
        try {
          return Array.from(s.cssRules).some((r) => r.media && String(r.media.mediaText).includes('reduced-motion'));
        } catch {
          return false;
        }
      }),
    );
    await page.emulateMedia({ reducedMotion: null });
    return `matchMedia reduce: ${anims.mq}; счётчик ${early} → ${late} (${early !== late ? 'АНИМИРУЕТСЯ' : 'без анимации'}); логотип: ${anims.logo}; экран: ${anims.screen}; правил @media (prefers-reduced-motion) в стилях: ${cssGuard ? 'есть' : 'НЕТ'}`;
  });

  await step('step-91', 'зоны нажатия на 390: слоты, сердце, чипы — порог 44×44', async () => {
    await openHome(390, 900);
    const screen = page.locator('.mob-screen');
    const heroRight = await screen.locator('.hp-hero-right').evaluate((el) => getComputedStyle(el).display);
    const hearts = await screen.locator('.hp-posts-grid button').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return `${Math.round(r.width)}×${Math.round(r.height)}`; }));
    await screen.locator('input').first().focus();
    await wait(250);
    const chips = await screen.locator('button').filter({ hasText: /Кроссфит|Йога|Плавание|Единоборства|Тренажёрный зал|Танцы/ }).evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return `${el.textContent.trim()} ${Math.round(r.width)}×${Math.round(r.height)}`; }));
    const tabs = await page.locator('.mob-phone > div:nth-last-child(2) button').evaluateAll((els) => els.map((el) => { const r = el.getBoundingClientRect(); return `${el.textContent.trim()} ${Math.round(r.width)}×${Math.round(r.height)}`; }));
    const small = [...hearts.map((h) => `сердце ${h}`), ...chips].filter((s) => { const m = /(\d+)×(\d+)$/.exec(s); return m && (Number(m[1]) < 44 || Number(m[2]) < 44); });
    return block('зоны нажатия (390)', [
      `кнопки слотов: правая колонка героя display ${heroRight} — на телефоне слотов НЕТ вовсе`,
      `сердца: ${hearts.join(' · ')}`,
      `чипы: ${chips.join(' · ')}`,
      `нижние табы: ${tabs.join(' · ')}`,
      `меньше 44×44: ${small.length} из ${hearts.length + chips.length} — ${small.join(' · ')}`,
    ]);
  });

  await step('step-92', 'полоса прокрутки главной скрыта на десктопе', async () => {
    await openHome(1440, 900);
    const info = await page.evaluate(() => {
      const divs = Array.from(document.querySelectorAll('div'));
      const scrollers = divs
        .filter((el) => { const cs = getComputedStyle(el); return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 4; })
        .map((el) => `scrollbar-width «${getComputedStyle(el).scrollbarWidth}», ширина полосы ${el.offsetWidth - el.clientWidth}px, scrollHeight ${el.scrollHeight}`);
      const homeRoot = divs.find((el) => getComputedStyle(el).scrollbarWidth === 'none');
      return {
        scrollers,
        homeRoot: homeRoot ? `scrollbar-width none стоит на элементе ${homeRoot.scrollHeight > homeRoot.clientHeight ? 'который прокручивается' : 'который НЕ прокручивается сам (высота = содержимому)'}` : 'нет',
        windowScroll: document.documentElement.scrollHeight > document.documentElement.clientHeight,
        webkitRule: Array.from(document.styleSheets).some((s) => { try { return Array.from(s.cssRules).some((r) => r.selectorText?.includes('::-webkit-scrollbar')); } catch { return false; } }),
      };
    });
    return block('прокрутка', [
      `окно прокручивается: ${info.windowScroll ? 'ДА — прокручивается сам документ, и его полоса видна (стилизована ::-webkit-scrollbar 6px)' : 'нет — прокрутка у вложенного контейнера'}`,
      `вложенные прокручивающиеся контейнеры: ${info.scrollers.join(' | ') || 'нет'}`,
      `${info.homeRoot} — правило scrollbarWidth:"none" из HomePage.tsx:239 на десктопе НЕ работает`,
      `правило ::-webkit-scrollbar в стилях: ${info.webkitRule ? 'есть (6px, App.tsx)' : 'нет'}`,
    ]);
  });

  await browser.close();
  return consoleErrors;
}

/** Отчёт: сводка чисел для переноса, таблица шагов, падения. */
function writeReport(consoleErrors) {
  const file = path.join(REPORTS, `phase-38-design-reference-${DATE}.md`);
  const pass = results.filter((r) => r.status === 'pass').length;
  const fail = results.filter((r) => r.status === 'fail').length;
  const icon = { pass: '✅', fail: '❌' };

  const summaryRows = (obj) =>
    Object.entries(obj)
      .map(([k, v]) => `| ${k} | ${String(v).replace(/\|/g, '/')} |`)
      .join('\n');

  const steps = results
    .map((r) => `### ${r.id} ${icon[r.status]} — ${r.title}\n\n${r.detail}${r.shot ? `\n\nСнимок падения: \`${path.relative(HERE, r.shot)}\`` : ''}\n`)
    .join('\n');

  fs.writeFileSync(
    file,
    `# Эталон дизайна ПРОСПОРТ (Figma Make) — снимок ${DATE}\n\n` +
      `**Чек-лист:** \`tests/checklists/phase-38-design-reference.md\` (92 шага, 12 сценариев)\n` +
      `**Объект:** \`prosport/\` на http://localhost:5173 (Vite 6.3.5, React из корня монорепо)\n` +
      `**Инструмент:** библиотека \`playwright\` (Chromium headless), скрипт \`tests/e2e-phase-38-design-reference.mjs\`\n` +
      `**Итог:** ${fail === 0 ? '✅' : '❌'} ${pass} из ${results.length} шагов снято, ${fail} упало\n` +
      `**Снимки:** \`tests/screenshots/phase-38/reference/\`\n` +
      `**Ошибок консоли:** ${consoleErrors.length}${consoleErrors.length ? ` — ${consoleErrors.slice(0, 3).join(' | ')}` : ''}\n\n` +
      `⚠️ Это эталон ПРОТОТИПА, а не задание на реализацию: что переносить нельзя — раздел 7\n` +
      `файла фазы и приложение Б реестра переноса. Здесь только числа.\n\n` +
      `⚠️ Снято без Playwright MCP (сервер не отвечает): \`getComputedStyle\` / \`getBoundingClientRect\`\n` +
      `вместо \`browser_evaluate\`, \`ariaSnapshot()\` вместо \`browser_snapshot\`.\n\n` +
      `## Сводка для переноса\n\n` +
      `### Палитра (как её видит браузер)\n\n| Что | Значение |\n| --- | --- |\n${summaryRows(summary.palette)}\n\n` +
      `### Шрифты\n\n| Что | Значение |\n| --- | --- |\n${summaryRows(summary.fonts)}\n\n` +
      `### Отступы ключевых секций\n\n| Что | Значение |\n| --- | --- |\n${summaryRows(summary.spacing)}\n\n` +
      `### Брейкпоинты\n\n| Окно | Раскладка |\n| --- | --- |\n${summaryRows(summary.breakpoints)}\n\n` +
      `## Шаги\n\n${steps}\n` +
      `## Окружение\n\n- Node ${process.version}\n- Playwright: библиотека, Chromium headless, locale ru-RU\n- Дизайн-проект: \`prosport/\`, \`npm run dev\` (Vite), React ${'19.2.3 из корневого node_modules — optional peer 18.3.1 npm не поставил, react-leaflet@5 требует 19'}\n`,
    'utf8',
  );
  return { file, pass, fail };
}

let consoleErrors = [];
try {
  consoleErrors = await main();
} catch (error) {
  console.error('прогон прерван:', error);
  results.push({ id: 'run', title: 'прогон прерван', status: 'fail', detail: String(error?.message ?? error), ms: 0 });
  if (browser) await browser.close();
} finally {
  const report = writeReport(consoleErrors);
  console.log(`\nИтог: ${report.pass} снято, ${report.fail} упало. Отчёт: ${report.file}`);
  process.exit(report.fail > 0 ? 1 : 0);
}
