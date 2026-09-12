// Сторож: адрес раздела служебной панели написан буквами один раз (шаг 37.68).
//
// ⚠️ Что он ловит. `/service-portal/notifications`, `/service-portal/moderation`
// и `/service-portal/dashboard` были выписаны в словаре пунктов меню И в карте
// переходов уведомлений, а «дашборд» — ещё в трёх местах, которые уводят
// человека в панель. Переименуй раздел — меню поправится, переход из строки
// надзора уедет в никуда, и скажет об этом не тест, а клик: оба адреса
// синтаксически верны, оба ведут на существующий маршрут до самого конца.
//
// ⚠️ Сторож ТЕКСТОВЫЙ и обходит ВЕСЬ исходник фронта: шестое написание появится
// в файле, которого сегодня нет, и перечислить его заранее нельзя.
//
// ⚠️ Стерегутся адреса РАЗДЕЛОВ, а не корень панели. Корень `/service-portal`
// вынужденно остаётся строкой в `proxy.ts`: `config.matcher` читается сборщиком
// статически, вычисленное значение туда не подставить. Правило проведено по той
// же границе, что и возможность его соблюсти, — иначе сторож требовал бы
// невыполнимого и жил бы со списком исключений.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Единственный законный дом адресов разделов панели. */
const HOME = 'src/lib/service-portal-sections.ts';

/**
 * Адрес раздела внутри строки: кавычка (любая из трёх), затем корень панели
 * и БУКВА сегмента.
 *
 * Буква важна: `'/service-portal/:path*'` в `config.matcher` — это образец
 * маршрута, а не адрес раздела, и под запрет он попасть не должен.
 */
const SECTION_LITERAL = /['"`]\/service-portal\/[a-z]/i;

/** Текст файла без комментариев — иначе пояснение попало бы под запрет. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Пишет ли ЭТОТ файл адрес раздела панели буквами.
 *
 * Отдельной функцией — чтобы проверяемо было, что сторож вообще умеет увидеть
 * нарушение. Сторож, не научившийся искать, отчитывается тем же зелёным,
 * что и чистое дерево.
 */
export function spellsPanelSectionItself(relativePath: string, text: string): boolean {
  if (relativePath.split(path.sep).join('/') === HOME) return false;

  return SECTION_LITERAL.test(codeOnly(text));
}

/** Обход исходников фронта. Тесты не в счёт: они вправе называть адреса. */
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

describe('Сторож: адрес раздела панели объявлен один раз', () => {
  it('ни один файл не пишет адрес раздела буквами', async () => {
    const offenders: string[] = [];

    for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8');

      if (spellsPanelSectionItself(file, text)) offenders.push(file);
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
    // И оба читателя, ради которых сторож заведён.
    expect(files).toContain(path.join('src', 'components', 'admin', 'AdminNavigation.tsx'));
    expect(files).toContain(path.join('src', 'lib', 'notification-links.ts'));
  });

  it('сторож видит второе написание, а не молчит на любом тексте', () => {
    // Диверсия без правки рабочего дерева: разбирается заведомо нарушающий текст.
    expect(
      spellsPanelSectionItself(
        'src/lib/notification-links.ts',
        "const supervision = '/service-portal/notifications';",
      ),
    ).toBe(true);

    // Словарь меню с адресом строкой — та же беда, тот же ответ.
    expect(
      spellsPanelSectionItself(
        'src/components/admin/AdminNavigation.tsx',
        "{ href: '/service-portal/moderation', label: 'Модерация' },",
      ),
    ).toBe(true);

    // Ловится и адрес, собранный в шаблонной строке.
    expect(
      spellsPanelSectionItself(
        'src/components/layout/Header.tsx',
        'router.push(`/service-portal/dashboard?focus=${id}`);',
      ),
    ).toBe(true);

    // Тот же файл, но адрес приезжает из словаря — законно.
    expect(
      spellsPanelSectionItself(
        'src/components/layout/Header.tsx',
        "import { SERVICE_PORTAL_SECTIONS } from '@/lib/service-portal-sections';\nrouter.push(SERVICE_PORTAL_SECTIONS.users);",
      ),
    ).toBe(false);

    // Образец маршрута в `config.matcher` — не адрес раздела: сегмент там
    // не буква, а подстановка, и вычислить его сборщику нечем.
    expect(
      spellsPanelSectionItself(
        'src/proxy.ts',
        "export const config = { matcher: ['/profile/:path*', '/service-portal/:path*'] };",
      ),
    ).toBe(false);

    // Пояснение в комментарии — не нарушение: сторож не должен мешать
    // рассказывать, как устроены адреса панели.
    expect(
      spellsPanelSectionItself(
        'src/components/admin/AdminNavigation.tsx',
        '// Вложенный маршрут `/service-portal/dashboard/123` тоже подсвечивает пункт.',
      ),
    ).toBe(false);

    // И сам дом адресов нарушителем не считается.
    expect(spellsPanelSectionItself(HOME, 'users: `${SERVICE_PORTAL_ROOT}/dashboard`,')).toBe(
      false,
    );
  });
});
