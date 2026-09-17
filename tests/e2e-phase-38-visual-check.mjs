// Сверка главной с макетом бок о бок — фаза 38, шаг 38.112 (довесок Э13).
//
// Запуск: node tests/e2e-phase-38-visual-check.mjs
//   E2E_BASE=http://localhost:3000 — наш стенд; макет поднимается сам: `npx vite` в `prosport/`
//   на свободном порту (первый свободный от 5199) и гасится после снятия.
//
// Что делает: снимает главную макета и нашу на 1440 / 1024 / 430 full-page (плюс каталог
// макета — для фазы 39), кладёт снимки в `tests/screenshots/phase-38-visual/`, пишет отчёт
// `tests/reports/phase-38-visual-<дата>.md` с парами снимков и ЧИСЛАМИ: высота героя,
// кегль H1/H2 (computed), число карточек в сетке клубов/тренеров и размер первой, пункты
// шапки и дока текстом, лента видов в герое (обязана исчезнуть), чип города в герое,
// «0.0 км» (обязано исчезнуть, Д-17), слайдер под сеткой.
//
// ⚠️ Замеры — не «похоже ли», а числа: их сравнивают до/после Э13 (базовая линия — первый
// прогон, до 38.107/38.108). Макет — SPA: его «каталог» — клик по «Клубы» в шапке.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { chromium } from 'playwright';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const PROTO_DIR = path.join(ROOT, 'prosport');
const SHOTS = path.join(HERE, 'screenshots', 'phase-38-visual');
const REPORTS = path.join(HERE, 'reports');
const OURS = process.env.E2E_BASE ?? 'http://localhost:3000';
// Суффикс захода: «после» Э13 не должен затирать снимки и отчёт базовой линии «до».
const SUFFIX = process.env.E2E_VISUAL_SUFFIX ? `-${process.env.E2E_VISUAL_SUFFIX}` : '';
const WIDTHS = [1440, 1024, 430];

/** Первый свободный порт от заданного. */
async function freePort(from = 5199) {
  for (let port = from; port < from + 50; port += 1) {
    const free = await new Promise((resolve) => {
      const server = net.createServer();
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error('свободного порта не нашлось');
}

/** Поднять vite макета и дождаться ответа; вернуть процесс и адрес. */
async function startPrototype() {
  const port = await freePort();
  const child = spawn('npx', ['vite', '--port', String(port), '--strictPort', '--clearScreen', 'false'], {
    cwd: PROTO_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  let log = '';
  child.stdout.on('data', (chunk) => (log += chunk));
  child.stderr.on('data', (chunk) => (log += chunk));
  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(base);
      if (response.ok) return { child, base, port };
    } catch {
      // ещё поднимается
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child.kill();
  throw new Error(`vite макета не поднялся за 60 с на ${base}: ${log.slice(-400)}`);
}

/** Погасить vite вместе с дочерними процессами. */
function stopPrototype(child) {
  if (!child || child.killed) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
}

/** Замеры страницы — общие для макета и для нас; селекторы различаются по `kind`. */
async function measure(page, kind) {
  return page.evaluate((k) => {
    const isProto = k === 'proto';
    const num = (v) => Math.round(v * 10) / 10;
    const rectOf = (el) => (el ? el.getBoundingClientRect() : null);
    const size = (el) => {
      const r = rectOf(el);
      return r ? `${Math.round(r.width)}×${Math.round(r.height)}` : '—';
    };
    const font = (el) => {
      if (!el) return '—';
      const cs = getComputedStyle(el);
      // Первым в нашем стеке стоит рублёвый шрифт (только ₽) — показываем два первых семейства.
      const families = cs.fontFamily.split(',').map((f) => f.trim().replace(/"/g, ''));
      return `${num(parseFloat(cs.fontSize))}px / ${cs.lineHeight} / ${cs.fontWeight} / ${families.slice(0, families[0] === 'ruble' ? 2 : 1).join(' → ')}`;
    };
    const texts = (selector) =>
      Array.from(document.querySelectorAll(selector))
        .map((el) => el.textContent.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' · ') || '—';

    const hero = isProto ? document.querySelector('main section, section') : document.getElementById('hero');
    const clubsGrid = isProto ? document.querySelector('.hp-clubs-grid') : document.getElementById('clubs');
    const trainersGrid = isProto ? document.querySelector('.hp-trainers-grid') : document.getElementById('trainers');
    const clubCards = isProto
      ? Array.from(clubsGrid?.children ?? [])
      : Array.from(document.querySelectorAll('#clubs [aria-label^="Карточка клуба"]'));
    const trainerCards = isProto
      ? Array.from(trainersGrid?.children ?? [])
      : Array.from(document.querySelectorAll('#trainers [aria-label^="Карточка тренера"]'));
    // Число колонок сетки — сколько карточек делят верх первого ряда.
    const columns = (cards) => {
      const tops = cards.map((c) => Math.round(c.getBoundingClientRect().top));
      return tops.length === 0 ? 0 : tops.filter((t) => t === tops[0]).length;
    };
    const mobile = window.innerWidth <= 768;
    const headerItems = isProto
      ? mobile
        ? texts('.mob-tab')
        : texts('header .dk-navbtn')
      : texts('header nav a');
    const dockItems = isProto ? (mobile ? texts('.mob-tab') : '—') : texts('nav[aria-label="Мобильная навигация"] a');
    const dockVisible = isProto
      ? mobile
      : (() => {
          const nav = document.querySelector('nav[aria-label="Мобильная навигация"]');
          return nav ? getComputedStyle(nav).display !== 'none' && nav.getBoundingClientRect().height > 0 : false;
        })();

    return {
      width: window.innerWidth,
      pageHeight: document.documentElement.scrollHeight,
      heroHeight: hero ? Math.round(rectOf(hero).height) : null,
      h1: font(document.querySelector('h1')),
      h1Text: (document.querySelector('h1')?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      h2: font(document.querySelector('h2')),
      clubs: { count: clubCards.length, columns: columns(clubCards), first: size(clubCards[0]) },
      trainers: { count: trainerCards.length, columns: columns(trainerCards), first: size(trainerCards[0]) },
      headerItems,
      dockVisible,
      dockItems,
      marquee: document.querySelectorAll('[data-testid="hero-sport-marquee"]').length,
      cityChipInHero: hero ? hero.querySelectorAll('a[href*="#discover"], a[href*="/catalog"]').length : 0,
      zeroKm: (document.body.textContent ?? '').includes('0.0 км'),
      sliderRails: document.querySelectorAll('[data-card-slider-rail]').length,
      sections:
        Array.from(document.querySelectorAll('main section[id]'))
          .filter((s) => s.parentElement?.closest('section') === null)
          .map((s) => '#' + s.id)
          .join(' → ') || '—',
    };
  }, kind);
}

async function snap(page, url, file, { width, after } = {}) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('about:blank');
  await page.goto(url, { waitUntil: 'networkidle' });
  if (after) await after(page);
  await page.waitForTimeout(1_200);
  // Ленивое: прокрутить до низа и обратно, чтобы всё догрузилось.
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 700) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, file), fullPage: true });
  return file;
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true });
  fs.mkdirSync(REPORTS, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const proto = await startPrototype();
  console.log(`Макет: ${proto.base}; стенд: ${OURS}`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ locale: 'ru-RU', deviceScaleFactor: 1 });
  const page = await context.newPage();
  const rows = [];
  try {
    for (const width of WIDTHS) {
      const protoFile = await snap(page, `${proto.base}/`, `proto-home-${width}${SUFFIX}.png`, { width });
      const protoM = await measure(page, 'proto');
      const oursFile = await snap(page, `${OURS}/`, `ours-home-${width}${SUFFIX}.png`, { width });
      const oursM = await measure(page, 'ours');
      // Каталог макета — для фазы 39: клик по «Клубы» в шапке (или в доке на телефоне).
      const catalogFile = await snap(page, `${proto.base}/`, `proto-catalog-${width}${SUFFIX}.png`, {
        width,
        after: async (p) => {
          const btn = p.locator('header .dk-navbtn, .mob-tab', { hasText: /^Клубы$/ }).first();
          if ((await btn.count()) > 0) await btn.click();
          await p.waitForTimeout(800);
        },
      });
      rows.push({ width, protoFile, oursFile, catalogFile, protoM, oursM });
      console.log(`${width}: герой ${protoM.heroHeight} / ${oursM.heroHeight}; клубов ${protoM.clubs.count}×${protoM.clubs.columns} / ${oursM.clubs.count}×${oursM.clubs.columns}; тренеров ${protoM.trainers.count}×${protoM.trainers.columns} / ${oursM.trainers.count}×${oursM.trainers.columns}; лента ${oursM.marquee}; 0.0 км ${oursM.zeroKm}`);
    }
  } finally {
    await browser.close();
    stopPrototype(proto.child);
  }

  const metric = (label, pick) => `| ${label} | ${rows.map((r) => `${pick(r.protoM)} \\| ${pick(r.oursM)}`).join(' | ')} |`;
  const lines = [
    `# Сверка главной с макетом — фаза 38, шаг 38.112${SUFFIX ? ` (заход «${process.env.E2E_VISUAL_SUFFIX}»)` : ''}`,
    ``,
    `**Дата:** ${new Date().toISOString()}. **Макет:** \`prosport/\` через vite на ${proto.base}. **Стенд:** ${OURS}.`,
    `**Снимки:** \`tests/screenshots/phase-38-visual/\` (full-page, Chromium, dpr 1). В каждой ячейке — макет \\| у нас.`,
    ``,
    `| Замер | ${WIDTHS.map((w) => `${w}`).join(' | ')} |`,
    `| --- | ${WIDTHS.map(() => '---').join(' | ')} |`,
    metric('высота страницы', (m) => m.pageHeight),
    metric('высота героя', (m) => m.heroHeight ?? '—'),
    metric('H1 (кегль / интерлиньяж / вес / семейство)', (m) => m.h1),
    metric('H1 текст', (m) => `«${m.h1Text}»`),
    metric('H2 первый', (m) => m.h2),
    metric('клубы: карточек × колонок, первая', (m) => `${m.clubs.count}×${m.clubs.columns}, ${m.clubs.first}`),
    metric('тренеры: карточек × колонок, первая', (m) => `${m.trainers.count}×${m.trainers.columns}, ${m.trainers.first}`),
    metric('пункты шапки', (m) => m.headerItems),
    metric('док виден / пункты', (m) => `${m.dockVisible ? 'да' : 'нет'}: ${m.dockItems}`),
    metric('лента видов в герое (обязана исчезнуть)', (m) => m.marquee),
    metric('чип города в герое (ссылок в герое)', (m) => m.cityChipInHero),
    metric('«0.0 км» на странице (обязано исчезнуть, Д-17)', (m) => (m.zeroKm ? 'ЕСТЬ' : 'нет')),
    metric('рельсов слайдера', (m) => m.sliderRails),
    metric('секции верхнего уровня', (m) => m.sections),
    ``,
    `## Пары снимков`,
    ``,
    ...rows.flatMap((r) => [
      `- **${r.width}**: макет \`${r.protoFile}\` · у нас \`${r.oursFile}\` · каталог макета \`${r.catalogFile}\``,
    ]),
    ``,
    `⚠️ Числа сравниваются до/после Э13: первый прогон — базовая линия «до» (38.107/38.108 ещё не сделаны).`,
    `⚠️ Макет на 430 рисует «телефон» с внутренней прокруткой (body overflow: hidden), поэтому его full-page снимок — только окно 430×900; наш — вся страница.`,
    ``,
  ];
  const file = path.join(REPORTS, `phase-38-visual-${stamp}${SUFFIX}.md`);
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  console.log(`Отчёт: ${file}`);
}

await main();
