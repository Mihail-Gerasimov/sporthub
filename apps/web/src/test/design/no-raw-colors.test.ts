// Сторож: ни одного сырого цвета вне токенов (шаг 38.8).
//
// ⚠️ Зачем. К фазе 38 в исходниках фронта накопилось 93 сырых цвета в 22 файлах
// и ещё 24 литерала в самом `globals.css` — при том, что палитра объявлена токенами
// с фазы 28. Копились они потому, что сторожа не было: `bg-[#0A1029]` пишется так же
// быстро, как `bg-plate`, а краснеет только при перекраске — когда токены поменяли,
// а сырой цвет остался прежним, и половина страницы уехала в старую палитру.
//
// Что считается сырым цветом — регулярки названы здесь, а не подразумеваются:
//   1. hex — `#fff`, `#0A1029`, `#7ED90080`;
//   2. функции цвета — `rgb(`, `rgba(`, `hsl(`, `hsla(`;
//   3. `-white` / `-black` в цветовых утилитах Tailwind — `bg-white/[0.06]`, `text-black`;
//   4. оттенки Tailwind — `text-red-500`, `bg-amber-50`, `border-gray-200`:
//      решение фазы — оттенки входят в «все», у проекта своя палитра.
//
// Что сырым цветом НЕ считается:
//   - объявления токенов в `:root` `globals.css` — единственный законный дом hex;
//   - `#000` внутри `mask-image`: у маски цвет не цвет, значение имеет только альфа;
//     исключение ПОИМЁННО — в `MASK_FILES`, в любом другом файле маска тоже краснеет;
//   - комментарии — снимаются до разбора, пояснение «раньше было #0A1029» законно;
//   - `src/test/**` — тесты вправе называть цвета, они их проверяют.
//
// ⚠️ Список старых файлов с потолками — `LEGACY_CEILINGS` — только убывает: файл
// чистится, запись снимается. Запись с файлом, в котором сырых цветов уже нет, —
// КРАСНАЯ, иначе «только убывает» ничем не проверяется. Новый или переписанный файл
// в список не попадает: у него потолок ноль.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Утилиты Tailwind, у которых значение — цвет. `font-black` — вес, не цвет, сюда не входит. */
const COLOR_UTILITIES =
  '(?:bg|text|border|border-[trblxyse]|ring|ring-offset|from|to|via|fill|stroke|outline|shadow|decoration|accent|caret|divide|placeholder)';

/** Именованные оттенки Tailwind. `lime`, `orange`, `red`, `teal` без числа — наши токены. */
const TAILWIND_HUES =
  '(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)';

/** Регулярки сырого цвета — каждая названа, чтобы диверсия била по известной цели. */
export const RAW_COLOR_PATTERNS: { name: string; pattern: RegExp }[] = [
  { name: 'hex', pattern: /#[0-9a-fA-F]{3,8}\b/g },
  // `(?<![a-zA-Z-])`, а не `\b`: в `shadow-[0_0_0_3px_rgba(...)]` перед `rgba` стоит `_`,
  // и граница слова там не проходит — такая тень уходила бы от сторожа.
  { name: 'функция цвета', pattern: /(?<![a-zA-Z-])(?:rgba?|hsla?)\(/g },
  {
    name: 'white/black',
    pattern: new RegExp(`(?<![\\w-])${COLOR_UTILITIES}-(?:white|black)(?![\\w-])`, 'g'),
  },
  {
    name: 'оттенок Tailwind',
    pattern: new RegExp(`(?<![\\w-])${COLOR_UTILITIES}-${TAILWIND_HUES}-\\d{2,3}(?![\\w-])`, 'g'),
  },
];

/** Файлы, где `#000` внутри `mask-image` — законная альфа-маска. Только эти. */
export const MASK_FILES = ['src/app/globals.css'];

/**
 * Старые файлы и потолок сырых цветов в каждом. Список только убывает (шаг 38.14
 * чистит все 22 и `globals.css`); дописать сюда файл нельзя — у нового потолок ноль.
 */
export const LEGACY_CEILINGS: Record<string, number> = {
  'src/app/global-error.tsx': 1,
  'src/app/globals.css': 19,
  'src/app/page.tsx': 11,
  'src/components/admin/AdminNavigation.tsx': 1,
  'src/components/admin/DashboardPage.tsx': 7,
  'src/components/admin/HideReasonModal.tsx': 2,
  'src/components/admin/LogsPage.tsx': 6,
  'src/components/admin/ModerationPage.tsx': 6,
  'src/components/admin/analytics/AnalyticsDashboard.tsx': 1,
  'src/components/admin/analytics/KpiCards.tsx': 4,
  'src/components/clubs/ClubCard.tsx': 2,
  'src/components/clubs/ClubDetailPageClient.tsx': 2,
  'src/components/detail-shared/DetailScheduleWeek.tsx': 1,
  'src/components/home/HeroSportMarquee.tsx': 2,
  'src/components/layout/Header.tsx': 7,
  'src/components/layout/MobileNav.tsx': 1,
  'src/components/map/MainMap.tsx': 10,
  'src/components/profile/AddressGeocoder.tsx': 3,
  'src/components/profile/CitySuggestInput.tsx': 1,
  'src/components/profile/ProviderPublicationsSection.tsx': 2,
  'src/components/profile/PublishClubModal.tsx': 9,
  'src/components/profile/PublishModalShell.tsx': 6,
  'src/components/profile/PublishTrainerModal.tsx': 15,
  'src/components/profile/ScheduleSlotsEditor.tsx': 2,
  'src/components/profile/provider/RejectBookingReasonModal.tsx': 1,
  'src/components/trainers/TrainerCard.tsx': 5,
  'src/components/trainers/TrainerDetailPageClient.tsx': 2,
  'src/components/trainers/trainer-utils.ts': 12,
  'src/components/ui/ChipMarquee.tsx': 2,
  'src/components/ui/Modal.tsx': 1,
};

// Текст без комментариев: блочных, строчных (до конца строки) и JSX-обёрток.
// ⚠️ Обычным комментарием, а не JSDoc: пример `*/` внутри JSDoc закрыл бы его сам.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** `:root { ... }` целиком — единственное место, где hex объявляется законно. */
function stripRootBlock(css: string): string {
  const start = css.indexOf(':root');

  if (start < 0) return css;

  const open = css.indexOf('{', start);
  let depth = 0;

  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(0, start) + css.slice(i + 1);
    }
  }

  return css;
}

/** Снимает значения `mask-image` (CSS) и `maskImage`/`WebkitMaskImage` (TSX). */
function stripMaskValues(text: string): string {
  return text
    .replace(/(?:-webkit-)?mask-image\s*:[^;]*;/g, '')
    .replace(/(?:Webkit)?[mM]askImage\s*:\s*(['"`])[\s\S]*?\1/g, '');
}

/** Путь в единой форме — со слэшами, от корня приложения. */
function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

/**
 * Сырые цвета в тексте файла — каждое вхождение с именем правила.
 *
 * Отдельной функцией, чтобы проверяемо было, что сторож вообще умеет их видеть:
 * сторож, не научившийся искать, отчитывается тем же зелёным, что и чистое дерево.
 */
export function rawColorsIn(relativePath: string, text: string): string[] {
  const file = normalize(relativePath);
  let body = stripComments(text);

  if (file.endsWith('.css')) body = stripRootBlock(body);
  if (MASK_FILES.includes(file)) body = stripMaskValues(body);

  const found: string[] = [];

  for (const { name, pattern } of RAW_COLOR_PATTERNS) {
    for (const match of body.matchAll(pattern)) found.push(`${name}: ${match[0]}`);
  }

  return found;
}

/** Обход исходников фронта: `.ts`, `.tsx`, `.css`; тесты не в счёт. */
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

    if (!/\.(ts|tsx|css)$/.test(entry.name)) continue;

    found.push(normalize(relative));
  }

  return found;
}

describe('Сторож: сырых цветов нет (38.8)', () => {
  it('ни в одном файле сырых цветов больше потолка; вне списка — ноль', async () => {
    const offenders: string[] = [];

    for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8');
      const found = rawColorsIn(file, text);
      const ceiling = LEGACY_CEILINGS[file] ?? 0;

      if (found.length > ceiling) {
        offenders.push(`${file}: ${found.length} > ${ceiling}\n    ${found.join('\n    ')}`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('список старых файлов только убывает: запись с уже чистым файлом — красная', async () => {
    // ⚠️ Потолок, который выше факта, — не потолок: дописать десять сырых цветов
    // в файл с потолком 15 можно было бы молча. Потолок обязан равняться факту.
    const stale: string[] = [];

    for (const [file, ceiling] of Object.entries(LEGACY_CEILINGS)) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8').catch(() => null);

      if (text === null) {
        stale.push(`${file}: файла нет — запись снять`);
        continue;
      }

      const actual = rawColorsIn(file, text).length;

      if (actual === 0) stale.push(`${file}: уже чист — запись снять`);
      else if (actual < ceiling)
        stale.push(`${file}: факт ${actual} < потолок ${ceiling} — опустить`);
    }

    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    // ⚠️ Текстовые сторожа проекта однажды обходили пустоту и оставались зелёными.
    const files = await collectSources(path.join(WEB_ROOT, 'src'));

    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('src/app/globals.css');
    expect(files).toContain('src/components/clubs/ClubCard.tsx');
    expect(files).toContain('src/components/ui/Button.tsx');
    expect(files.some((file) => file.startsWith('src/test/'))).toBe(false);
  });

  it('сторож видит каждый вид сырого цвета на подставном тексте', () => {
    const file = 'src/components/ui/Button.tsx';

    // hex в произвольном значении Tailwind.
    expect(rawColorsIn(file, "className='bg-[#7ED900] text-ink'")).toEqual(['hex: #7ED900']);
    // Функция цвета.
    expect(rawColorsIn(file, "className='border-[rgba(0,0,0,0.3)]'")).toEqual([
      'функция цвета: rgba(',
    ]);
    // white/black — в том числе с альфой через `/`.
    expect(rawColorsIn(file, "className='bg-white/[0.06] text-black'")).toEqual([
      'white/black: bg-white',
      'white/black: text-black',
    ]);
    // Оттенок Tailwind — входит в «все».
    expect(rawColorsIn(file, "className='text-red-500 bg-amber-50'")).toEqual([
      'оттенок Tailwind: text-red-500',
      'оттенок Tailwind: bg-amber-50',
    ]);
    // Инлайновый стиль с hex — тоже сырой цвет (диверсия д-4 бьёт по двум сторожам).
    expect(
      rawColorsIn('src/components/clubs/ClubCard.tsx', "style={{ background: '#7ED900' }}"),
    ).toEqual(['hex: #7ED900']);
  });

  it('сторож не путает с сырым цветом токены, якоря, вес шрифта и комментарии', () => {
    const file = 'src/components/ui/Button.tsx';

    // Наши токены: `lime`, `orange`, `red`, `teal` без числа — не оттенки.
    expect(
      rawColorsIn(file, "className='bg-lime text-lime-hov border-orange-soft bg-red'"),
    ).toEqual([]);
    // `var(--ui-*)` в произвольном значении — не сырой цвет.
    expect(rawColorsIn(file, "className='bg-[var(--ui-plate)]'")).toEqual([]);
    // Якорь — не hex.
    expect(rawColorsIn(file, "href='#results' href='#availability'")).toEqual([]);
    // `font-black` — вес, не цвет.
    expect(rawColorsIn(file, "className='font-black'")).toEqual([]);
    // Комментарии снимаются до разбора.
    expect(
      rawColorsIn(file, '// раньше было #0A1029\n/* и rgba(0,0,0,.5) */\n{/* text-red-500 */}'),
    ).toEqual([]);
    // Объявления токенов в `:root` — законный дом hex; вне `:root` тот же hex — сырой.
    expect(rawColorsIn('src/app/globals.css', ':root {\n  --ui-lime: #7ed900;\n}')).toEqual([]);
    expect(rawColorsIn('src/app/globals.css', ':root {\n}\n.x { color: #7ed900; }')).toEqual([
      'hex: #7ed900',
    ]);
  });

  it('альфа-маска #000 законна только в названных файлах', () => {
    // Маска в TSX не названа ни для одного файла: у ленты чипов она переехала в CSS.
    const mask = "maskImage: 'linear-gradient(to right, transparent 0, #000 24px, #000 100%)'";

    expect(rawColorsIn('src/components/ui/ChipMarquee.tsx', mask)).toEqual([
      'hex: #000',
      'hex: #000',
    ]);

    const cssMask =
      '.x {\n  -webkit-mask-image: linear-gradient(#000, transparent);\n  mask-image: linear-gradient(#000, transparent);\n}';

    expect(rawColorsIn('src/app/globals.css', cssMask)).toEqual([]);
    // А `#000` вне маски — сырой цвет даже в названном файле.
    expect(rawColorsIn('src/app/globals.css', '.x { color: #000; }')).toEqual(['hex: #000']);
  });
});
