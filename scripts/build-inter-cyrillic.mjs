// Сборка кириллического лица display-шрифта: Inter 900, только кириллица (шаг 38.113).
//
// ⚠️ Зачем. Display-шрифт макета — Barlow Condensed 900, кириллицы у него нет; в превью
// макета русские заголовки рисует системная Helvetica Bold. Ближайший к ней шрифт
// с кириллицей, который уже стоит в проекте, — Inter; его вес 900 подставляется
// пословно через `unicode-range` кириллицы (`apps/web/src/app/layout.tsx`), латиница
// и цифры остаются Barlow. `next/font/google` так не умеет — `unicode-range` у него
// не задать, поэтому лицо локальное.
//
// Что делает скрипт:
//   1. спрашивает у Google Fonts CSS вариативного Inter с User-Agent современного Chrome —
//      иначе API отдаст TTF без разбиения на подмножества и без `unicode-range`;
//   2. в ответе находит блок подмножества, чей `unicode-range` покрывает U+0400–045F
//      (это `cyrillic`, ~107 знаков), и скачивает его woff2;
//   3. fontTools (`fontTools.varLib.instancer`, инструмент разработчика вне package.json)
//      снимает с вариативного шрифта статический экземпляр wght=900 в
//      `apps/web/src/fonts/inter-cyrillic-900.woff2` (~8 КБ). Статический — потому что
//      fontkit из поставки Next, читающий локальные шрифты при сборке, падает
//      на вариативных осях.
//
// ⚠️ Результат закоммичен; скрипт запускается руками при смене донора или веса, в CI
// его нет. Сторож `font-stack` сверяет файл через fontkit: кириллица целиком, цифр нет,
// ширина «НАЙДИ ЗАЛ» с `size-adjust` — в 3% от Helvetica Bold превью.
//
// Запуск: `node scripts/build-inter-cyrillic.mjs` (нужны сеть и `python3` с fontTools
// и brotli — `pip install fonttools brotli`).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Донор и вес экземпляра. */
const FAMILY = 'Inter';
const WEIGHT = 900;
/** Основной блок кириллицы — по нему узнаётся нужное подмножество. */
const CYRILLIC_FROM = 0x400;
const CYRILLIC_TO = 0x45f;

/** Куда кладём результат. */
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/web/src/fonts');
const OUT_FILE = path.join(OUT_DIR, `inter-cyrillic-${WEIGHT}.woff2`);

/** User-Agent, при котором Google Fonts отдаёт woff2 с `unicode-range` по подмножествам. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

/** CSS Google Fonts для вариативного Inter (все веса одним файлом на подмножество). */
async function fetchCss() {
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(FAMILY)}:wght@100..900&display=swap`;
  const response = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });

  if (!response.ok) throw new Error(`Google Fonts CSS: ${response.status}`);

  return response.text();
}

/** Покрывает ли `unicode-range` блока основной блок кириллицы. */
function coversCyrillic(unicodeRange) {
  return [...unicodeRange.matchAll(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/gi)].some((m) => {
    const from = Number.parseInt(m[1], 16);
    const to = m[2] ? Number.parseInt(m[2], 16) : from;

    return from <= CYRILLIC_FROM && to >= CYRILLIC_TO;
  });
}

/** URL woff2 подмножества с кириллицей из CSS. */
function cyrillicSourceUrl(css) {
  for (const block of css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)) {
    const range = block[1].match(/unicode-range:\s*([^;]+);/)?.[1] ?? '';
    const url = block[1].match(/src:\s*url\(([^)]+)\)/)?.[1];

    if (url && coversCyrillic(range)) return url;
  }

  throw new Error('В CSS Google Fonts нет блока с кириллицей');
}

/** Статический экземпляр веса `WEIGHT` из вариативного файла — fontTools. */
function instantiate(source, target) {
  const script = [
    'import sys',
    'from fontTools.ttLib import TTFont',
    'from fontTools.varLib import instancer',
    'font = TTFont(sys.argv[1])',
    `static = instancer.instantiateVariableFont(font, {"wght": ${WEIGHT}})`,
    'static.flavor = "woff2"',
    'static.save(sys.argv[2])',
  ].join('\n');

  execFileSync('python3', ['-c', script, source, target], { stdio: 'inherit' });
}

async function main() {
  const css = await fetchCss();
  const url = cyrillicSourceUrl(css);
  const workDir = mkdtempSync(path.join(tmpdir(), 'inter-cyrillic-'));
  const source = path.join(workDir, 'inter-cyrillic-variable.woff2');
  const response = await fetch(url);

  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  writeFileSync(source, Buffer.from(await response.arrayBuffer()));
  mkdirSync(OUT_DIR, { recursive: true });
  instantiate(source, OUT_FILE);
  console.log(`Собрано: ${OUT_FILE} (источник ${url})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
