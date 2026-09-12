// Сторож: полоса постраничности объявлена ровно один раз (шаг 37.67).
//
// ⚠️ Что он ловит. Полоса «‹ 1 2 3 › · Показано 1–15 из 52» была написана заново
// ПЯТЬ раз: журнал, люди, модерация и очередь надзора в служебной панели плюс
// лента уведомлений в кабинете. Каждая копия появлялась одинаково дёшево —
// новому списку нужен пагинатор, и тридцать строк разметки пишутся быстрее,
// чем ищется общий компонент. Расхождения при этом копятся молча: у одной копии
// цифры были с `tabular-nums`, у четырёх — без.
//
// ⚠️ Сторож ТЕКСТОВЫЙ и обходит ВЕСЬ исходник фронта: шестая копия появится
// в файле, которого сегодня нет, и перечислить его заранее нельзя.
//
// ⚠️ Ищутся подписи, а не разметка. Разметку можно написать десятком способов,
// а вот назвать кнопки иначе нельзя: подпись для экранного диктора обязательна,
// и «Предыдущая страница» / «Страница N» / «Показано X–Y из N» — это ровно те
// слова, которые обязана сказать любая полоса площадки. Попадётся и копия,
// набранная с нуля, — она всё равно скажет их.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Единственный законный дом полосы. */
const HOME = 'src/components/ui/PaginationBar.tsx';

/** Подписи, без которых полоса постраничности не обходится. */
const PAGER_WORDING = /Предыдущая страница|Следующая страница|Страница \$\{|Показано\s*[{<\d]/;

/** Текст файла без комментариев — иначе пояснение попало бы под запрет. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Рисует ли ЭТОТ файл полосу постраничности сам.
 *
 * Отдельной функцией — чтобы проверяемо было, что сторож вообще умеет увидеть
 * нарушение. Сторож, не научившийся искать, отчитывается тем же зелёным,
 * что и чистое дерево.
 */
export function drawsPaginationItself(relativePath: string, text: string): boolean {
  if (relativePath.split(path.sep).join('/') === HOME) return false;

  return PAGER_WORDING.test(codeOnly(text));
}

/** Обход исходников фронта. Тесты не в счёт: они вправе поминать эти подписи. */
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

    if (!/\.(ts|tsx)$/.test(entry.name)) continue;

    found.push(relative);
  }

  return found;
}

describe('Сторож: полоса постраничности одна', () => {
  it('ни одна страница не рисует пагинатор сама', async () => {
    const offenders: string[] = [];

    for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8');

      if (drawsPaginationItself(file, text)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    // ⚠️ Девять текстовых сторожей этого проекта однажды считали корень от каталога
    // запуска и вне своего каталога обходили НИЧЕГО, оставаясь зелёными. Корень
    // ищется по признаку (`web-root.ts`), а эта проверка сторожит сам обход.
    const files = await collectSources(path.join(WEB_ROOT, 'src'));

    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain(HOME.split('/').join(path.sep));
    // И все пять поверхностей, ради которых сторож заведён.
    for (const surface of [
      ['src', 'components', 'admin', 'LogsPage.tsx'],
      ['src', 'components', 'admin', 'DashboardPage.tsx'],
      ['src', 'components', 'admin', 'ModerationPage.tsx'],
      ['src', 'components', 'admin', 'AdminNotificationsPage.tsx'],
      ['src', 'components', 'profile', 'notifications', 'NotificationsListPage.tsx'],
    ]) {
      expect(files).toContain(path.join(...surface));
    }
  });

  it('сторож видит шестую копию, а не молчит на любом тексте', () => {
    // Диверсия без правки рабочего дерева: разбирается заведомо нарушающий текст.
    expect(
      drawsPaginationItself(
        'src/components/admin/FinancePage.tsx',
        '<button aria-label="Следующая страница" onClick={next}>›</button>',
      ),
    ).toBe(true);

    // Копия узнаётся и по подписи диапазона, даже если кнопки набраны иначе.
    expect(
      drawsPaginationItself(
        'src/components/admin/FinancePage.tsx',
        '<span>Показано {offset + 1}–{end} из {total}</span>',
      ),
    ).toBe(true);

    // И по подписи номера страницы.
    expect(
      drawsPaginationItself(
        'src/components/admin/FinancePage.tsx',
        'ariaLabel={`Страница ${page}`}',
      ),
    ).toBe(true);

    // Тот же файл, но полоса пришла из общего компонента — законно.
    expect(
      drawsPaginationItself(
        'src/components/admin/FinancePage.tsx',
        'import { PaginationBar } from \'@/components/ui\';\n<PaginationBar shape="boxed" page={page} />',
      ),
    ).toBe(false);

    // Пояснение в комментарии — не нарушение: сторож не должен мешать
    // рассказывать, куда полоса переехала.
    expect(
      drawsPaginationItself(
        'src/components/admin/FinancePage.tsx',
        '// Полоса «Показано 1–15 из 52» живёт в `PaginationBar`.',
      ),
    ).toBe(false);

    // И сам дом полосы нарушителем не считается.
    expect(drawsPaginationItself(HOME, 'ariaLabel="Предыдущая страница"')).toBe(false);
  });
});
