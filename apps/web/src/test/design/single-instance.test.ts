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
// Как узнаётся карусель — по вызову `scrollBy(`: лента без прокрутки не лента.
//
// ⚠️ Три проверки КРАСНЫЕ ПО ПОСТРОЕНИЮ до шагов, где предмет появляется:
// подписи карточек — 38.73 (клуб) и 38.74 (тренер), сведение каруселей — 38.79.
// Записаны через `it.fails`: vitest засчитывает такой тест зелёным, пока утверждение
// падает, и КРАСНЫМ, как только оно проходит, — то есть на шаге 38.73/38.74/38.79
// сторож сам потребует снять `.fails`. Это не зелёная пустышка: снять `.fails`
// раньше времени нельзя, оставить после — тоже.

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

/** Признак карусели. */
export const CAROUSEL_CALL = /\bscrollBy\(/;

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
async function filesDrawing(marker: RegExp): Promise<string[]> {
  const found: string[] = [];

  for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
    if (drawsItself(await readFile(path.join(WEB_ROOT, file), 'utf8'), marker)) found.push(file);
  }

  return found;
}

describe('Сторожа единственности (38.12)', () => {
  // ⚠️ Ожидается зелёный на шаге 38.73: тогда снять `.fails`.
  it.fails('club-card-single: карточку клуба рисует ровно один файл — ClubCard.tsx', async () => {
    expect(await filesDrawing(CARD_LABELS.clubCard)).toEqual([HOMES.clubCard]);
  });

  // ⚠️ Ожидается зелёный на шаге 38.74: тогда снять `.fails`.
  it.fails(
    'trainer-card-single: карточку тренера рисует ровно один файл — TrainerCard.tsx',
    async () => {
      expect(await filesDrawing(CARD_LABELS.trainerCard)).toEqual([HOMES.trainerCard]);
    },
  );

  // ⚠️ Ожидается зелёный на шаге 38.79: тогда снять `.fails`. Сегодня `scrollBy(`
  // живёт в `PopularNearby.tsx` и `PopularTrainers.tsx`, а сам `CardSlider` крутит
  // ленту сдвигом трека, не прокруткой, — сведение назовёт один способ.
  it.fails('carousel-single: scrollBy( только в CardSlider.tsx', async () => {
    expect(await filesDrawing(CAROUSEL_CALL)).toEqual([HOMES.carousel]);
  });

  it('сторожа обходят настоящие файлы, а не пустоту', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));

    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain(HOMES.clubCard);
    expect(files).toContain(HOMES.trainerCard);
    expect(files).toContain(HOMES.carousel);
    // Обе сегодняшние копии карусели найдены — иначе сведение на 38.79 нечего было бы стеречь.
    expect(await filesDrawing(CAROUSEL_CALL)).toEqual([
      'src/components/clubs/PopularNearby.tsx',
      'src/components/trainers/PopularTrainers.tsx',
    ]);
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
    // Карусель узнаётся по вызову, комментарий — не вызов.
    expect(drawsItself('ref.current?.scrollBy({ left: 320 })', CAROUSEL_CALL)).toBe(true);
    expect(drawsItself('// раньше тут был scrollBy(', CAROUSEL_CALL)).toBe(false);
  });
});
