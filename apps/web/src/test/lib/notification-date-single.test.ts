// Сторож: форматтер даты уведомления объявлен ровно один раз (шаг 37.40).
//
// ⚠️ Что он ловит. Дату уведомления форматировали в двух местах — в ленте
// кабинета и в выпадашке колокольчика, — и обе копии появились одинаково
// дёшево: поверхности нужна подпись под карточкой, автор пишет четыре строки
// с `toLocaleString`, и в дереве становится на один форматтер больше. Фаза 37
// добавляет третью поверхность (надзорная лента администратора), фаза 38
// добавит четвёртую. Без сторожа расхождение — вопрос времени, и увидит его
// не тест, а человек, у которого в шапке «22 апр.», а в ленте «21 апреля».
//
// ⚠️ Сторож ТЕКСТОВЫЙ и обходит ВЕСЬ исходник фронта: нарушение появится
// в новом файле, который перечислить забудут.
//
// ⚠️ Запрет прицельный, а не «никто не форматирует даты». Границей служит
// ПОВЕРХНОСТЬ уведомлений: файл, который называется уведомлением или показывает
// их тексты. Журнал служебной панели, лента записей атлета и карточка модерации
// форматируют СВОИ величины со своей плотностью строки — им здесь не место,
// и связывать их одним словарём ради совпадения слова «дата» было бы хуже,
// чем две копии.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Единственный законный дом форматтера. */
const HOME = 'src/lib/notification-date.ts';

/** Собственное форматирование момента — любым из доступных способов. */
const FORMATS_MOMENT =
  /\.toLocale(?:String|DateString|TimeString)\s*\(|new\s+Intl\.DateTimeFormat\s*\(/;

/** Признак поверхности уведомлений: имя файла либо показ их текстов. */
const SHOWS_NOTIFICATIONS = /@\/lib\/notification-(?:copy|date|buckets|groups)/;

/** Текст файла без комментариев — иначе пояснение попало бы под запрет. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Форматирует ли ЭТОТ файл дату уведомления сам.
 *
 * Отдельной функцией — чтобы проверяемо было, что сторож вообще умеет увидеть
 * нарушение. Сторож, не научившийся искать, отчитывается тем же зелёным,
 * что и чистое дерево.
 */
export function formatsNotificationDateItself(relativePath: string, text: string): boolean {
  if (relativePath === HOME) return false;

  const code = codeOnly(text);
  const isSurface = /notification/i.test(relativePath) || SHOWS_NOTIFICATIONS.test(code);

  return isSurface && FORMATS_MOMENT.test(code);
}

/** Обход исходников фронта. Тесты не в счёт: они вправе поминать прежние формы. */
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

describe('Сторож: форматтер даты уведомления один', () => {
  it('ни одна поверхность уведомлений не форматирует момент сама', async () => {
    const offenders: string[] = [];

    for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8');

      if (formatsNotificationDateItself(file, text)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    // ⚠️ Девять текстовых сторожей этого проекта однажды считали корень от каталога
    // запуска и вне своего каталога обходили НИЧЕГО, оставаясь зелёными. Корень
    // ищется по признаку (`web-root.ts`), а эта проверка сторожит сам обход.
    const files = await collectSources(path.join(WEB_ROOT, 'src'));

    expect(files.length).toBeGreaterThan(100);
    // И среди них — обе поверхности, ради которых сторож заведён.
    expect(files).toContain(path.join('src', 'components', 'layout', 'NotificationBell.tsx'));
    expect(files).toContain(
      path.join('src', 'components', 'profile', 'notifications', 'NotificationsListPage.tsx'),
    );
    expect(files).toContain(HOME.split('/').join(path.sep));
  });

  it('сторож видит третий форматтер, а не молчит на любом тексте', () => {
    // Диверсия без правки рабочего дерева: разбирается заведомо нарушающий текст.
    expect(
      formatsNotificationDateItself(
        'src/components/admin/OversightNotificationsFeed.tsx',
        "const label = new Date(n.createdAt).toLocaleString('ru-RU', { day: '2-digit' });",
      ),
    ).toBe(true);

    // Тот же файл, но форматирование пришло из общего модуля — законно.
    expect(
      formatsNotificationDateItself(
        'src/components/admin/OversightNotificationsFeed.tsx',
        "import { formatNotificationDateShort } from '@/lib/notification-date';",
      ),
    ).toBe(false);

    // Поверхность опознаётся и по показу текстов уведомлений, а не только по имени.
    expect(
      formatsNotificationDateItself(
        'src/components/admin/Feed.tsx',
        "import { getNotificationCopy } from '@/lib/notification-copy';\nconst d = new Intl.DateTimeFormat('ru-RU').format(x);",
      ),
    ).toBe(true);

    // Чужие величины сторож не трогает: журнал панели форматирует свой момент.
    expect(
      formatsNotificationDateItself(
        'src/components/admin/LogsPage.tsx',
        "const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit' });",
      ),
    ).toBe(false);

    // И сам дом форматтера не считается нарушителем.
    expect(
      formatsNotificationDateItself(HOME, "return date.toLocaleString('ru-RU', options);"),
    ).toBe(false);
  });
});
