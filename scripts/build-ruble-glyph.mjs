// Сборка рублёвого глифа для display-шрифта (шаг 38.18).
//
// ⚠️ Зачем. Display-шрифт витрины — Sofia Sans Extra Condensed, и знака рубля `₽`
// (U+20BD) в нём нет: цена «500 ₽» получила бы рубль из системного fallback —
// другим начертанием и другой ширины. У Barlow Condensed (display-шрифт макета)
// рубль есть. Отсюда четыре крошечных файла (~620 Б каждый): из `latin-ext` Barlow
// вырезан ОДИН глиф U+20BD на четыре веса, и `next/font/local` подставляет его
// по `unicode-range` — только для этого символа, только на странице, где он есть.
//
// Что делает скрипт:
//   1. спрашивает у Google Fonts CSS для Barlow Condensed весов 500/600/700/800
//      с User-Agent современного Chrome — иначе API отдаст TTF без разбиения
//      на подмножества и без `unicode-range`;
//   2. в ответе находит блок подмножества, чей `unicode-range` покрывает U+20BD
//      (это `latin-ext`), и скачивает его woff2;
//   3. `pyftsubset` (fontTools, инструмент разработчика вне package.json) вырезает
//      ровно U+20BD в `apps/web/src/fonts/barlow-ruble-<вес>.woff2`.
//
// ⚠️ Веса — на ступень НИЖЕ, чем у Sofia в том же месте: у Barlow штрих толще при
// равном весе; 500/600/700/800 закрывают display-шкалу Sofia 600/700/800/900.
// ⚠️ Результат закоммичен; скрипт запускается руками при смене донора или весов,
// в CI его нет. Сторож `ruble-glyph` сверяет результат через fontkit: ровно один глиф.
//
// Запуск: `node scripts/build-ruble-glyph.mjs` (нужны сеть и `pyftsubset` в PATH).
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Донор глифа и веса. */
const FAMILY = 'Barlow Condensed';
const WEIGHTS = [500, 600, 700, 800];
const RUBLE = 0x20bd;

/** Куда кладём результат. */
const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../apps/web/src/fonts');

/** User-Agent, при котором Google Fonts отдаёт woff2 с `unicode-range` по подмножествам. */
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

/** Попадает ли кодовая точка в `unicode-range: U+0100-02BA, U+20A0-20C0, ...`. */
function rangeCovers(unicodeRange, codePoint) {
  return unicodeRange.split(',').some((part) => {
    const [from, to] = part.trim().replace(/^U\+/i, '').split('-');
    const lo = parseInt(from, 16);
    const hi = to === undefined ? lo : parseInt(to, 16);

    return codePoint >= lo && codePoint <= hi;
  });
}

/** Блоки `@font-face` из CSS: вес, unicode-range, адрес woff2. */
function parseFontFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((match) => {
    const body = match[1];
    const weight = Number(body.match(/font-weight:\s*(\d+)/)?.[1]);
    const unicodeRange = body.match(/unicode-range:\s*([^;]+);/)?.[1] ?? '';
    const url = body.match(/url\(([^)]+\.woff2)\)/)?.[1] ?? '';

    return { weight, unicodeRange, url };
  });
}

async function main() {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(FAMILY).replace(/%20/g, '+')}:wght@${WEIGHTS.join(';')}&display=swap`;
  const css = await (await fetch(cssUrl, { headers: { 'user-agent': USER_AGENT } })).text();
  const faces = parseFontFaces(css).filter((face) => rangeCovers(face.unicodeRange, RUBLE));
  const scratch = mkdtempSync(path.join(tmpdir(), 'ruble-'));

  mkdirSync(OUT_DIR, { recursive: true });

  for (const weight of WEIGHTS) {
    const face = faces.find((candidate) => candidate.weight === weight);

    if (!face)
      throw new Error(
        `${FAMILY} ${weight}: подмножество с U+20BD не найдено в ответе Google Fonts`,
      );

    const source = path.join(scratch, `barlow-${weight}.woff2`);
    const target = path.join(OUT_DIR, `barlow-ruble-${weight}.woff2`);

    writeFileSync(source, Buffer.from(await (await fetch(face.url)).arrayBuffer()));

    // Только один глиф; без хинтинга и лишних таблиц — файл в сотни байт.
    execFileSync('pyftsubset', [
      source,
      `--unicodes=U+${RUBLE.toString(16).toUpperCase()}`,
      '--flavor=woff2',
      '--no-hinting',
      '--desubroutinize',
      '--layout-features=',
      '--name-IDs=1,2',
      `--output-file=${target}`,
    ]);

    console.log(`${path.relative(process.cwd(), target)} — из ${face.url}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
