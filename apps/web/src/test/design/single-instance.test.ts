// Сторожа единственности: одна карточка клуба, одна карточка тренера, одна карусель
// (шаг 38.12).
//
// ⚠️ Зачем. Карусель уже написана ДВАЖДЫ мимо `CardSlider` — `PopularNearby.tsx`
// и `PopularTrainers.tsx` крутят ленту собственным `scrollBy(`. Витрина фазы 38
// соблазняет завести «карточку клуба для витрины» рядом со старой — и через две
// фазы никто не скажет, какая из двух настоящая. Правило: карточка клуба — ОДНА,
// карточка тренера — ОДНА, карусель — ОДНА.
//
// Как узнаётся карточка — по подписи для экранного диктора
// `aria-label="Карточка клуба: …"` / `"Карточка тренера: …"`. Подпись обязательна:
// карточка без неё — не карточка, а набор текста; поэтому копию, набранную с нуля,
// сторож увидит по той же подписи, под каким бы именем файла она ни жила.
// ⚠️ Прежний различитель — подпись «Рейтинг: X из 5» — не годится: она живёт
// в трёх файлах, и карточкой из них является не каждый.
//
// Как узнаётся карусель — по одному из двух признаков: вызов `scrollBy(` на элементе
// (не `window.scrollBy` — это прокрутка страницы к якорю) либо сдвиг трека
// `translateX(` вместе с кнопками прокрутки (`aria-label` «Назад»/«Вперёд»/«Прокрутить…»).
// Второй признак нужен, чтобы после сведения на 38.79 единственную карусель было кому
// узнать: сам `CardSlider` `scrollBy(` не зовёт.
//
// ⚠️ Три проверки ПРИКОЛОТЫ к сегодняшнему состоянию, а не помечены «ожидаемо
// красными»: подписей карточек сегодня нет ни у кого (`[]`), каруселей три. `it.fails`
// здесь не годится (ревью 38.13b): он зеленел бы при ЛЮБОМ падении — и на «ещё нет»,
// и на «уже дубль», то есть был бы слеп к своему предмету. Приколотое ожидание краснит
// дубль сразу, а шаги 38.73 / 38.74 / 38.79 обязаны поменять ожидание на `[HOME]`
// сознательно — это и есть их приёмка.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Единственные законные дома. */
export const HOMES = {
  clubCard: 'src/components/clubs/ClubCard.tsx',
  trainerCard: 'src/components/trainers/TrainerCard.tsx',
  carousel: 'src/components/ui/CardSlider.tsx',
} as const;

/** Подписи карточек — начало `aria-label`, за которым идёт имя. */
export const CARD_LABELS = {
  clubCard: /aria-label=\{?[`'"]Карточка клуба: /,
  trainerCard: /aria-label=\{?[`'"]Карточка тренера: /,
} as const;

/** Признак карусели: `scrollBy(` на элементе — не `window.scrollBy` (прокрутка к якорю). */
export const CAROUSEL_CALL = /(?<!window)\.scrollBy\(/;

/** Второй признак: сдвиг трека `translateX(` вместе с кнопками прокрутки. */
export const CAROUSEL_TRACK = /translateX\(/;
export const CAROUSEL_CONTROLS = /aria-label=[{"'`]+(Назад|Вперёд|Прокрутить)/;

/** Сегодняшние карусели — три; на 38.79 остаётся `[HOMES.carousel]`. */
export const CAROUSELS_TODAY = [
  'src/components/clubs/PopularNearby.tsx',
  'src/components/trainers/PopularTrainers.tsx',
  'src/components/ui/CardSlider.tsx',
];

// Текст без комментариев: блочных и строчных (до конца строки).
// ⚠️ Обычным комментарием, а не JSDoc: пример `*/` внутри JSDoc закрыл бы его сам.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Путь в единой форме — со слэшами, от корня приложения. */
function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

/** Рисует ли файл предмет сам — по признаку, без учёта комментариев. */
export function drawsItself(text: string, marker: RegExp): boolean {
  return marker.test(stripComments(text));
}

/** Карусель ли это: прокрутка элемента либо сдвиг трека с кнопками. */
export function isCarousel(text: string): boolean {
  const body = stripComments(text);

  return CAROUSEL_CALL.test(body) || (CAROUSEL_TRACK.test(body) && CAROUSEL_CONTROLS.test(body));
}

/** Обход `.ts`/`.tsx` фронта; тесты не в счёт. */
async function collectSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const relative = path.relative(WEB_ROOT, full);

    if (relative.startsWith(path.join('src', 'test'))) continue;

    if (entry.isDirectory()) {
      found.push(...(await collectSources(full)));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry.name)) found.push(normalize(relative));
  }

  return found;
}

/** Файлы, в которых признак найден. */
async function filesDrawing(marker: RegExp | ((text: string) => boolean)): Promise<string[]> {
  const found: string[] = [];
  const test = typeof marker === 'function' ? marker : (text: string) => drawsItself(text, marker);

  for (const file of (await collectSources(path.join(WEB_ROOT, 'src'))).sort()) {
    if (test(await readFile(path.join(WEB_ROOT, file), 'utf8'))) found.push(file);
  }

  return found;
}

describe('Сторожа единственности (38.12)', () => {
  // Шаг 38.73: карточка клуба с подписью — ровно в своём файле; вторая — дубль.
  it('club-card-single: карточку клуба с подписью рисует ровно столько файлов, сколько приколото', async () => {
    expect(await filesDrawing(CARD_LABELS.clubCard)).toEqual([HOMES.clubCard]);
  });

  // ⚠️ На шаге 38.74 заменить ожидание на `[HOMES.trainerCard]`.
  it('trainer-card-single: карточку тренера с подписью рисует ровно столько файлов, сколько приколото', async () => {
    expect(await filesDrawing(CARD_LABELS.trainerCard)).toEqual([]);
  });

  // ⚠️ На шаге 38.79 заменить ожидание на `[HOMES.carousel]`: сведение каруселей.
  it('carousel-single: каруселей ровно столько, сколько приколото', async () => {
    expect(await filesDrawing(isCarousel)).toEqual(CAROUSELS_TODAY);
  });

  it('сторожа обходят настоящие файлы, а не пустоту', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));

    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain(HOMES.clubCard);
    expect(files).toContain(HOMES.trainerCard);
    expect(files).toContain(HOMES.carousel);
    // Дом карусели узнаётся вторым признаком — иначе после сведения его было бы некому узнать.
    expect(isCarousel(await readFile(path.join(WEB_ROOT, HOMES.carousel), 'utf8'))).toBe(true);
  });

  it('сторожа видят копию на подставном тексте, а не молчат на любом', () => {
    // Подпись в шаблонной строке, в кавычках и в фигурных скобках — все формы.
    expect(
      drawsItself('<article aria-label={`Карточка клуба: ${club.name}`}>', CARD_LABELS.clubCard),
    ).toBe(true);
    expect(drawsItself('<article aria-label="Карточка клуба: Атлант">', CARD_LABELS.clubCard)).toBe(
      true,
    );
    expect(
      drawsItself('<article aria-label={`Карточка тренера: ${name}`}>', CARD_LABELS.trainerCard),
    ).toBe(true);
    // Подпись тренера — не подпись клуба.
    expect(
      drawsItself('<article aria-label={`Карточка тренера: ${name}`}>', CARD_LABELS.clubCard),
    ).toBe(false);
    // Карусель узнаётся по вызову на элементе; комментарий и прокрутка страницы — нет.
    expect(isCarousel('ref.current?.scrollBy({ left: 320 })')).toBe(true);
    expect(isCarousel('// раньше тут был ref.scrollBy(')).toBe(false);
    expect(isCarousel('window.scrollBy({ top: 200 }); // к якорю')).toBe(false);
    // И по сдвигу трека с кнопками — но не по одному `translateX` (это может быть анимация).
    expect(
      isCarousel('rail.style.transform = `translateX(${x}px)`;\n<button aria-label="Вперёд" />'),
    ).toBe(true);
    expect(isCarousel('rail.style.transform = `translateX(${x}px)`;')).toBe(false);
    expect(
      isCarousel('<button aria-label="Прокрутить популярные клубы влево" />\n// translateX(0)'),
    ).toBe(false);
  });
});
