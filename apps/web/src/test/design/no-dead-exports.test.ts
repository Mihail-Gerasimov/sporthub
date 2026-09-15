// Сторож: экспорт без потребителя — мёртвый код (шаг 38.11).
//
// ⚠️ Зачем. Три компонента — `StoreShowcase`, `UiShowcase`, `MapPreviewSection` —
// не рисовала ни одна страница, и никто этого не видел: экспорт есть, импорт есть
// в барреле, тест зелёный. Мёртвый экспорт — это код, который правят «на всякий
// случай», и второй экземпляр компонента, о котором забыли. Правило фазы: компонент
// рождается в коммите своего первого потребителя, иначе этот сторож красный.
//
// Что проверяется — экспорты ЗНАЧЕНИЙ: функции, константы, классы, списки `export {}`
// и реэкспорты баррелей. Типы и интерфейсы — нет: их «потребитель» может быть
// сам компилятор. Потребитель — любой НЕ тестовый файл, кроме самого модуля и кроме
// баррелей, которые лишь пробрасывают имя дальше: баррель — не потребитель, иначе
// `export { X } from './X'` делал бы живым любой труп.
//
// ⚠️ Вне проверки — `src/app/**` и `src/proxy.ts`: их экспорты читает сам Next
// (страницы, `metadata`, `proxy`, `config`), и потребителя в коде у них не бывает.
// Тесты потребителями не считаются: экспорт «только для теста» — это тоже код,
// которого нет в приложении.
//
// ⚠️ Список старых мёртвых экспортов с судьбой у каждого — только убывает. Запись,
// у экспорта которой появился потребитель или которого больше нет, — КРАСНАЯ.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Файлы, чьи экспорты читает Next, а не наш код. */
const FRAMEWORK_ENTRIES = ['src/proxy.ts'];

/**
 * Старые мёртвые экспорты, судьба каждого названа. Только убывает: снят или получил
 * потребителя — запись снимается. Шаг 38.11 снял три компонента и `getCoverPalette`
 * (12 сырых цветов) — остальное вне владения этого шага и ждёт своих этапов.
 */
export const LEGACY_DEAD_EXPORTS: Record<string, string[]> = {
  // Снять `export`: константа нужна только своему файлу.
  'src/components/admin/AdminNotificationsPage.tsx': ['SUPERVISION_GROUP_TABS'],
  // Снять или дать потребителя в записи (Э9, 38.81).
  'src/components/booking/BookingAuthGate.tsx': ['BookingAuthGate'],
  // Кабинет спортсмена: тест есть, страницы нет — снять вместе с тестом (Э3, 38.25).
  'src/components/profile/AthleteUpcomingBookingCard.tsx': ['AthleteUpcomingBookingCard'],
  'src/components/profile/ProviderBookingsSection.tsx': ['ProviderBookingsSection'],
  'src/components/profile/ProviderSettingsSection.tsx': ['ProviderSettingsSection'],
  'src/components/profile/athlete-history.ts': ['getAthleteHistoryItems'],
  'src/components/profile/profile-nav-items.ts': ['getPersonalNavItems', 'getFaceNavItems'],
  'src/components/profile/provider-helpers.ts': [
    'getProviderIncomingBookings',
    'getProviderSummary',
  ],
  // Снять `export`: константы нужны только своему файлу.
  'src/lib/generate-password.ts': ['PASSWORD_ALPHABET', 'GENERATED_PASSWORD_LENGTH'],
  'src/lib/moderation-filters.ts': [
    'MODERATION_STATUS_VALUES',
    'MODERATION_TYPE_VALUES',
    'MODERATION_RECHECK_VALUES',
  ],
  'src/lib/notification-links.ts': ['subjectHref'],
  'src/lib/provider-client-guards.ts': ['isClientOfProvider'],
  // Клиент бэкенда. Четыре мёртвых метода сняты шагом 38.32; два класса ошибок
  // остаются экспортом ради `instanceof` в тестах — потребителя вне тестов у них
  // нет по построению: страницы отдают их границе ошибок Next, не ловя по имени.
  'src/lib/server-api.ts': ['SessionRequiredError', 'BackendUnavailableError'],
  'src/lib/service-faces.ts': [
    'parseServiceFaceKind',
    'LEGACY_PERSONAL_CABINET_PATH',
    'LEGACY_FACE_CABINET_PATH',
    'findFaceByRef',
  ],
  'src/lib/service-portal-sections.ts': ['SERVICE_PORTAL_ROOT'],
  'src/lib/utils.ts': [
    'getTimeUntil',
    'getTrainerSportIds',
    'getTrainerPrimarySportId',
    'getTimeKeyInTimeZone',
  ],
  // Стор: `AUTH_STORE_DEFAULT_STATE` нужен 48 тестам — снять `export` нельзя без
  // переписывания фикстур; остаётся до решения (Э12, 38.102).
  'src/stores/useAuthStore.ts': [
    'AUTH_STORE_DEFAULT_STATE',
    'selectActiveFace',
    'selectPrimaryCabinet',
  ],
};

// Текст без комментариев: блочных и строчных (до конца строки).
// ⚠️ Обычным комментарием, а не JSDoc: пример `*/` внутри JSDoc закрыл бы его сам.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Путь в единой форме — со слэшами, от корня приложения. */
function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

/** Имена из списка `{ a, b as c, type T }` — без типов, с учётом переименования. */
function listNames(list: string): string[] {
  return list
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && !item.startsWith('type '))
    .map((item) =>
      item
        .split(/\s+as\s+/)
        .pop()!
        .trim(),
    );
}

/** Экспорты значений модуля: объявления, списки и реэкспорты. Типы не в счёт. */
export function valueExportsOf(text: string): string[] {
  const body = stripComments(text);
  const names: string[] = [];

  for (const match of body.matchAll(
    /^export\s+(?:async\s+)?(?:function\*?|const|let|var|class|enum)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    names.push(match[1]);
  }

  for (const match of body.matchAll(/^export\s+\{([^}]*)\}/gm)) names.push(...listNames(match[1]));

  return names;
}

/** Текст без строк-реэкспортов: баррель имя лишь пробрасывает, а не потребляет. */
function withoutReexports(text: string): string {
  return text
    .replace(/^export\s+\{[^}]*\}\s*from\s+['"][^'"]+['"];?$/gm, '')
    .replace(/^export\s+\*\s+from\s+['"][^'"]+['"];?$/gm, '');
}

/** Упоминает ли ЭТОТ файл имя как потребитель. */
export function consumes(text: string, name: string): boolean {
  return new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(withoutReexports(stripComments(text)));
}

/** Обход `.ts`/`.tsx` под `src`; тесты — отдельным флагом. */
async function collectSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...(await collectSources(full)));
      continue;
    }

    if (/\.(ts|tsx)$/.test(entry.name)) found.push(normalize(path.relative(WEB_ROOT, full)));
  }

  return found;
}

const isTest = (file: string) => file.startsWith('src/test/');
const isChecked = (file: string) =>
  !isTest(file) && !file.startsWith('src/app/') && !FRAMEWORK_ENTRIES.includes(file);

/** Все исходники с текстом — один разбор на все проверки. */
async function loadSources(): Promise<Map<string, string>> {
  const texts = new Map<string, string>();

  for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
    texts.set(file, await readFile(path.join(WEB_ROOT, file), 'utf8'));
  }

  return texts;
}

/** Есть ли у экспорта `name` из `file` потребитель вне тестов. */
function hasConsumer(texts: Map<string, string>, file: string, name: string): boolean {
  for (const [other, text] of texts) {
    if (other === file || isTest(other)) continue;
    if (consumes(text, name)) return true;
  }

  return false;
}

describe('Сторож: мёртвых экспортов нет (38.11)', () => {
  it('у каждого экспорта значения вне src/app есть потребитель, кроме названных', async () => {
    const texts = await loadSources();
    const dead: string[] = [];

    for (const [file, text] of texts) {
      if (!isChecked(file)) continue;

      const allowed = new Set(LEGACY_DEAD_EXPORTS[file] ?? []);

      for (const name of valueExportsOf(text)) {
        if (allowed.has(name)) continue;
        if (!hasConsumer(texts, file, name)) dead.push(`${file}: ${name}`);
      }
    }

    expect(dead, dead.join('\n')).toEqual([]);
  });

  it('список старых мёртвых экспортов только убывает', async () => {
    const texts = await loadSources();
    const stale: string[] = [];

    for (const [file, names] of Object.entries(LEGACY_DEAD_EXPORTS)) {
      const text = texts.get(file);

      if (text === undefined) {
        stale.push(`${file}: файла нет — запись снять`);
        continue;
      }

      const exported = new Set(valueExportsOf(text));

      for (const name of names) {
        if (!exported.has(name)) stale.push(`${file}: «${name}» больше не экспортируется — снять`);
        else if (hasConsumer(texts, file, name)) {
          stale.push(`${file}: у «${name}» появился потребитель — снять`);
        }
      }
    }

    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    const texts = await loadSources();
    const files = [...texts.keys()];

    expect(files.length).toBeGreaterThan(200);
    expect(files.filter(isChecked).length).toBeGreaterThan(100);
    expect(files).toContain('src/components/ui/index.ts');
    expect(files).toContain('src/components/ui/Button.tsx');
    // Потребители — и страницы тоже: `Button` живёт благодаря им.
    expect(hasConsumer(texts, 'src/components/ui/Button.tsx', 'Button')).toBe(true);
  });

  it('сторож видит экспорт и потребителя на подставном тексте', () => {
    // Все формы экспорта значения узнаются; типы — нет.
    expect(
      valueExportsOf(
        [
          'export function A() {}',
          'export const B = 1;',
          'export class C {}',
          'export type T = string;',
          'export interface I {}',
          'export { D, E as F, type G };',
          "export { H } from './h';",
        ].join('\n'),
      ),
    ).toEqual(['A', 'B', 'C', 'D', 'F', 'H']);

    // Потребитель — тот, кто пишет имя в коде; баррель и комментарий — нет.
    expect(consumes("import { A } from '@/x';\n<A />", 'A')).toBe(true);
    expect(consumes("export { A } from '@/x';", 'A')).toBe(false);
    expect(consumes('// тут был A', 'A')).toBe(false);
    // Часть чужого имени — не потребитель.
    expect(consumes('const AB = 1;', 'A')).toBe(false);
  });
});
