// Сторож: служебная панель не тянет код из кабинета человека (шаг 37.39).
//
// ⚠️ Что именно он ловит. Фаза 37 заводит администратору СВОЮ надзорную ленту.
// Она обязана делить с лентой человека общие части — вёдра по дате, подписи тем,
// тексты уведомлений, форматтер даты, — и ровно здесь есть дешёвый неправильный
// путь: сослаться из `components/admin` прямо в `components/profile`. Он работает
// сразу, сборка проходит, тесты зелёные — и с этого момента каркас кабинета
// (`NotificationsListPage` — 659 строк с ящиками, режимом выбора и модалкой
// удаления) становится зависимостью служебной панели. Любая правка кабинета
// начинает молча задевать надзор.
//
// Правильный путь один: общее уезжает в `lib`, и обе поверхности берут его оттуда.
// Сторож делает неправильный путь невозможным молча.
//
// ⚠️ Сторож ТЕКСТОВЫЙ и это осознанно. Рантаймовый проверил бы границу в тех
// файлах, которые ему перечислили, — а нарушение появится в новом файле, который
// перечислить забудут. Здесь обходится весь исходник обеих сторон панели.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/**
 * Что считается служебной панелью: её компоненты и её маршруты.
 *
 * Оба каталога, а не один: страница панели вправе собрать ленту сама, в обход
 * `components/admin`, и граница должна держаться и там.
 */
const ADMIN_ROOTS = [
  { relative: 'src/components/admin', minFiles: 10 },
  { relative: 'src/app/service-portal', minFiles: 8 },
];

/**
 * Долг, а не разрешение.
 *
 * `DashboardPage` тянет из кабинета чистый помощник `athlete-bookings` — то же
 * самое нарушение границы, только заведённое раньше этого шага. Чинится оно так же,
 * как чинится здесь домен уведомлений: помощник уезжает в `lib`, панель берёт его
 * оттуда. Сделать это на шаге 37.39 нельзя — файл панели занят параллельной работой
 * той же фазы, и правка импорта в нём столкнулась бы с ней.
 *
 * ⚠️ Исключение без причины — это снятый сторож. Каждая строка здесь обязана
 * называть, кто и когда её уберёт.
 */
const KNOWN_DEBT: readonly string[] = ['src/components/admin/DashboardPage.tsx'];

/**
 * Импорт из кабинета человека — в любом из ЧЕТЫРЁХ видов записи.
 *
 * ⚠️ Четвёртый — импорт ради побочного действия, без `from` (диверсия д-33,
 * шаг 37.76). Первая редакция шаблона его не видела: `from` в такой строке нет,
 * и диверсия «сослаться из панели в кабинет» прошла молча, оставив сторож зелёным.
 * Модуль кабинета при этом затягивается в сборку панели ровно так же.
 */
const PROFILE_IMPORT =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]@\/components\/profile\//;

/**
 * Находит в тексте файла ссылки на кабинет человека.
 *
 * Вынесено отдельной функцией не ради красоты: так проверяемо, что сторож вообще
 * УМЕЕТ увидеть нарушение. Сторож, который ничего не находит, потому что искать
 * не научился, отчитывается тем же зелёным, что и чистый код.
 */
export function findsProfileImport(text: string): boolean {
  // Комментарии снимаем: иначе объяснить в комментарии, почему панель сюда
  // не ходит, стало бы нельзя — объяснение само попало бы под запрет.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  return PROFILE_IMPORT.test(code);
}

/** Обход исходников каталога. Пути — относительно корня приложения. */
async function collectSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...(await collectSources(full)));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) continue;

    found.push(path.relative(WEB_ROOT, full));
  }

  return found;
}

describe('Сторож: служебная панель не импортирует из кабинета человека', () => {
  it('ни один файл панели не ссылается на components/profile', async () => {
    const offenders: string[] = [];

    for (const root of ADMIN_ROOTS) {
      for (const file of await collectSources(path.join(WEB_ROOT, root.relative))) {
        if (KNOWN_DEBT.includes(file)) continue;

        if (findsProfileImport(await readFile(path.join(WEB_ROOT, file), 'utf8'))) {
          offenders.push(file);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    // ⚠️ Девять текстовых сторожей этого проекта однажды считали корень от каталога
    // запуска и вне своего каталога обходили НИЧЕГО, оставаясь зелёными. Корень
    // ищется по признаку (`web-root.ts`), а эта проверка сторожит сам обход.
    for (const root of ADMIN_ROOTS) {
      const files = await collectSources(path.join(WEB_ROOT, root.relative));

      expect(files.length).toBeGreaterThanOrEqual(root.minFiles);
    }
  });

  it('сторож видит нарушение, а не молчит на любом тексте', () => {
    // Диверсия без правки рабочего дерева: тем же способом, что и сторож,
    // разбирается заведомо нарушающий текст.
    expect(
      findsProfileImport(
        "import { NotificationsListPage } from '@/components/profile/notifications/NotificationsListPage';",
      ),
    ).toBe(true);
    expect(
      findsProfileImport("const m = await import('@/components/profile/athlete-bookings');"),
    ).toBe(true);
    // ⚠️ Импорт ради побочного действия — та самая запись, на которой сторож
    // молчал до шага 37.76. `from` в ней нет, а зависимость есть.
    expect(findsProfileImport("import '@/components/profile/notifications/effects';")).toBe(true);

    // И не краснеет на законном: общее лежит в `lib`, а слово «profile»
    // встречается в панели и само по себе.
    expect(
      findsProfileImport("import { getNotificationCopy } from '@/lib/notification-copy';"),
    ).toBe(false);
    expect(findsProfileImport("const href = '/service-portal/profile';")).toBe(false);
  });

  it('долг сторожа описан именно тем, что в дереве ещё нарушает границу', async () => {
    // ⚠️ Список исключений обязан ссыхаться. Строка, оставшаяся после того как
    // нарушение убрали, превращает сторож в решето: следующий импорт в тот же
    // файл пройдёт молча.
    for (const file of KNOWN_DEBT) {
      expect(findsProfileImport(await readFile(path.join(WEB_ROOT, file), 'utf8'))).toBe(true);
    }
  });
});
