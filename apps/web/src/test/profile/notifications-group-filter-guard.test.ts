// Сторож: отбор ленты по ТЕМЕ существует в одном виде — в запросе (шаг 37.59).
//
// ⚠️ Что он ловит. До этого шага способов было два. Надзорная лента панели
// отправляла тему на сервер (`GET /api/notifications?group=…`), и отбирала база.
// Человеческая лента отбирала тему В ПАМЯТИ — `notifications.filter(n =>
// NOTIFICATION_TYPE_GROUP[n.type] === activeGroup)` — поверх массива, пришедшего
// пропом, у которого потолок выдачи сто строк и постраничности нет вовсе.
//
// Второй способ врёт молча и врёт двумя способами сразу: числа на вкладках
// считаются по обрезанной сотне, а вкладка темы показывает не всё, что в ней есть,
// а только то, что попало в первую сотню. На экране это выглядит правильно —
// список не пуст, страница рисуется, отказа нет. Ровно тот класс, что чинили
// шагом 37.57 (KPI «Непрочитанные» считался в памяти поверх обрезанной ленты)
// и что фаза 37 лечит целиком.
//
// ⚠️ Почему сторож ТЕКСТОВЫЙ. Отбор в памяти возвращается одной строкой, и тест
// поведения этого не видит: на короткой фикстуре — а короткая она во всех тестах
// ленты — оба способа дают одинаковый экран. Покраснеть должен сам факт появления
// второго способа, а не его последствие на длинной истории.
//
// ⚠️ Обходятся ОБА приложения. Сервер сегодня чист — тема уезжает в `where` через
// `notificationTypesOfGroup` (`repositories/prisma/catalog.repository.ts`), — но
// «отобрать в памяти после выборки» там пишется так же легко, как в браузере,
// и стоит там дороже: в память попадает чужая лента целиком.
//
// ⚠️ Законный случай ровно один и он не здесь: `notificationTypesOfGroup`
// в `packages/domain` перебирает СЛОВАРЬ ТИПОВ, чтобы собрать условие запроса.
// Это отбор типов, а не отбор ленты, и живёт он в пакете, который сторож не
// обходит: пакет — место объявления словаря, а не место чтения лент.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Корни обхода: оба приложения. Пакеты — место объявления словаря, не чтения лент. */
const SCAN_ROOTS: readonly string[] = [
  path.join(WEB_ROOT, 'src'),
  path.join(WEB_ROOT, '..', 'api', 'src'),
];

/**
 * Тема строки, сравнённая с чем-либо.
 *
 * Обе стороны сравнения: `NOTIFICATION_TYPE_GROUP[n.type] !== activeGroup`
 * и `activeGroup === NOTIFICATION_TYPE_GROUP[n.type]` — одно и то же нарушение,
 * записанное с разных концов.
 */
const GROUP_COMPARED =
  /NOTIFICATION_TYPE_GROUP\s*\[[^\]]*\]\s*(?:!==|===|==|!=)|(?:!==|===|==|!=)\s*NOTIFICATION_TYPE_GROUP\s*\[/;

/**
 * Тема строки, применённая как условие к массиву.
 *
 * Ищется в пределах ОДНОГО выражения (`[^;]`), чтобы `.filter(` из соседнего
 * оператора не притянул к себе безобидное упоминание словаря ниже по файлу.
 */
const GROUP_AS_PREDICATE =
  /\.(?:filter|some|every|find|findIndex|findLast|reduce|partition)\s*\([^;]{0,300}?NOTIFICATION_TYPE_GROUP/;

/** Текст файла без комментариев — иначе это пояснение попало бы под запрет. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Отбирает ли ЭТОТ текст ленту по теме в памяти.
 *
 * Отдельной функцией — чтобы проверяемо было, что сторож вообще умеет увидеть
 * нарушение. Сторож, не научившийся искать, отчитывается тем же зелёным, что
 * и чистое дерево; в приёмке фазы 36 три диверсии из тридцати девяти
 * не покраснели именно так.
 */
export function filtersFeedByGroupInMemory(text: string): boolean {
  const code = codeOnly(text);

  return GROUP_COMPARED.test(code) || GROUP_AS_PREDICATE.test(code);
}

/** Обход исходников. Тесты не в счёт: они вправе поминать любые формы. */
async function collectSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'test' || entry.name === 'node_modules') continue;

      found.push(...(await collectSources(full)));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.tsx?$/.test(entry.name)) continue;

    found.push(full);
  }

  return found;
}

async function collectAllSources(): Promise<string[]> {
  const found: string[] = [];

  for (const root of SCAN_ROOTS) {
    found.push(...(await collectSources(root)));
  }

  return found;
}

describe('Сторож: отбор уведомлений по теме — только в запросе (37.59)', () => {
  it('ни один файл обоих приложений не отбирает ленту по теме в памяти', async () => {
    const offenders: string[] = [];

    for (const file of await collectAllSources()) {
      const text = await readFile(file, 'utf8');

      if (filtersFeedByGroupInMemory(text)) offenders.push(path.relative(WEB_ROOT, file));
    }

    expect(offenders).toEqual([]);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    // ⚠️ Девять текстовых сторожей этого проекта однажды считали корень от каталога
    // запуска и вне своего каталога обходили НИЧЕГО, оставаясь зелёными. Корень
    // ищется по признаку (`web-root.ts`), а эта проверка сторожит сам обход.
    const files = await collectAllSources();

    expect(files.length).toBeGreaterThan(200);

    // Обе поверхности, ради которых сторож заведён, — в обходе.
    expect(files).toContain(
      path.join(
        WEB_ROOT,
        'src',
        'components',
        'profile',
        'notifications',
        'NotificationsListPage.tsx',
      ),
    );
    expect(files).toContain(
      path.join(WEB_ROOT, 'src', 'components', 'admin', 'AdminNotificationsPage.tsx'),
    );
    // И сервер: там отбор по теме собирает условие запроса, и стоит он дороже.
    expect(files).toContain(
      path.join(WEB_ROOT, '..', 'api', 'src', 'repositories', 'prisma', 'catalog.repository.ts'),
    );
    expect(files.some((file) => file.includes(path.join('api', 'src')))).toBe(true);
  });

  it('сторож видит нарушение, а не молчит на любом тексте', () => {
    // Диверсия без правки рабочего дерева: разбирается заведомо нарушающий текст.
    // Ровно та строка, которая жила в ленте кабинета до этого шага.
    expect(
      filtersFeedByGroupInMemory(
        'const shown = notifications.filter((n) => NOTIFICATION_TYPE_GROUP[n.type] === activeGroup);',
      ),
    ).toBe(true);

    // Та же мысль с другого конца сравнения.
    expect(
      filtersFeedByGroupInMemory(
        'if (activeGroup !== NOTIFICATION_TYPE_GROUP[n.type]) return false;',
      ),
    ).toBe(true);

    // Счётчик вкладки — тот же отбор, только с `.length` на конце.
    expect(
      filtersFeedByGroupInMemory(
        'const count = items.filter((item) => NOTIFICATION_TYPE_GROUP[item.type] === group).length;',
      ),
    ).toBe(true);

    // Отбор, разнесённый на несколько строк, прячется не лучше.
    expect(
      filtersFeedByGroupInMemory(
        [
          'const shown = notifications.filter((notification) => {',
          '  return NOTIFICATION_TYPE_GROUP[notification.type] === selected;',
          '});',
        ].join('\n'),
      ),
    ).toBe(true);

    // А законное сторож не трогает. Подпись темы ОДНОЙ строки — не отбор ленты.
    expect(
      filtersFeedByGroupInMemory('const group = NOTIFICATION_TYPE_GROUP[notification.type];'),
    ).toBe(false);

    // Тема, ушедшая В ЗАПРОС, — это и есть единственный разрешённый вид.
    expect(
      filtersFeedByGroupInMemory("if (activeGroup !== 'all') params.set('group', activeGroup);"),
    ).toBe(false);

    // Перебор СЛОВАРЯ ради секций редактора настроек — не чтение ленты.
    expect(
      filtersFeedByGroupInMemory(
        'for (const [type, group] of Object.entries(NOTIFICATION_TYPE_GROUP)) sections[group].push(type);',
      ),
    ).toBe(false);

    // Пояснение в комментарии под запрет не попадает — иначе краснел бы сам сторож.
    expect(
      filtersFeedByGroupInMemory(
        '// Раньше здесь стояло NOTIFICATION_TYPE_GROUP[n.type] === activeGroup — так делать нельзя.',
      ),
    ).toBe(false);
  });
});
