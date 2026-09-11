// Сторож: страница служебной панели никогда не зовёт ленту без ящика (шаг 37.43).
//
// ⚠️ Что он ловит и почему это самый дорогой промах работы.
//
// Уведомления спрашиваются ЯЩИКОМ. Не назвал ящик — и запрос означает «весь ящик
// того, кто спрашивает»: для человека это его лента целиком, а до шага 37.19
// без ящика уезжал `?scope=all`, то есть лента ВСЕЙ площадки в память. Такой вызов
// выглядит совершенно обычным — `getNotifications({ limit: 15 })`, — страница
// рисуется, строки приходят, и что это чужие строки, видно только глазом.
//
// Тип теперь требует ящик на сборке (`mailbox` обязателен с 37.42), и это главная
// защита. Сторож закрывает то, чего тип не видит: запрос из браузера, собранный
// строкой адреса. `fetch('/api/notifications?offset=0')` соберётся и в проде
// покажет администратору его собственную — пустую — почту вместо очереди надзора,
// а «пусто» читается как «событий нет», а не как «спросили не то».
//
// ⚠️ Граница запрета — ПОВЕРХНОСТЬ служебной панели, а не весь фронт. У кабинета
// человека «ящик не назван» — законный случай: это объединённый срез «всё моё»,
// и колокольчик в шапке спрашивает счётчик именно так. У панели такого случая нет:
// человеческого набора у администратора не бывает (решение 13 фазы 35), и любой
// её запрос про уведомления — про очередь надзора.
//
// ⚠️ Строчные маршруты (`/api/notifications/<id>/read`) под запрет не попадают:
// они называют не ящик, а строку, и право на неё сервер доказывает видом учётной
// записи. Требовать от них имя ящика значило бы требовать бессмыслицу.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Поверхности служебной панели: страницы маршрута и её компоненты. */
const ADMIN_SURFACES = [
  path.join('src', 'app', 'service-portal'),
  path.join('src', 'components', 'admin'),
];

/**
 * Запрос ПРО ЯЩИК — лента, счётчик неразобранного, «отметить всё», уборка.
 *
 * Строчные маршруты сюда не входят: `/api/notifications/12/read` не проходит
 * ни одну из веток — после `notifications` стоит `/`, а следом не `read-all`
 * и не `unread-count`.
 */
const MAILBOX_REQUEST =
  /getNotifications\s*\(|getUnreadNotificationsCount\s*\(|\/api\/notifications(?![/\w])|\/api\/notifications\/(?:read-all|unread-count)/;

/** Ящик назван: константой очереди надзора либо прямо в параметрах адреса. */
const NAMES_SUPERVISION = /SUPERVISION_MAILBOX|scope=supervision|['"]supervision['"]/;

/** Текст файла без комментариев — иначе это пояснение попало бы под запрет. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Поверхность служебной панели? */
function isAdminSurface(relativePath: string): boolean {
  return ADMIN_SURFACES.some((surface) => relativePath.startsWith(surface));
}

/**
 * Спрашивает ли ЭТОТ файл панели ящик уведомлений, не назвав его.
 *
 * Отдельной функцией — чтобы проверяемо было, что сторож вообще умеет увидеть
 * нарушение. Сторож, не научившийся искать, отчитывается тем же зелёным,
 * что и чистое дерево; в приёмке фазы 36 три диверсии из тридцати девяти
 * не покраснели именно так.
 */
export function asksMailboxWithoutNaming(relativePath: string, text: string): boolean {
  if (!isAdminSurface(relativePath)) return false;

  const code = codeOnly(text);

  if (!MAILBOX_REQUEST.test(code)) return false;

  return !NAMES_SUPERVISION.test(code);
}

/** Обход исходников фронта. Тесты не в счёт: они вправе поминать любые формы. */
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

describe('Сторож: панель не зовёт ленту без ящика', () => {
  it('ни одна поверхность панели не спрашивает уведомления безымянно', async () => {
    const offenders: string[] = [];

    for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8');

      if (asksMailboxWithoutNaming(file, text)) offenders.push(file);
    }

    expect(offenders).toEqual([]);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    // ⚠️ Девять текстовых сторожей этого проекта однажды считали корень от каталога
    // запуска и вне своего каталога обходили НИЧЕГО, оставаясь зелёными. Корень
    // ищется по признаку (`web-root.ts`), а эта проверка сторожит сам обход.
    const files = await collectSources(path.join(WEB_ROOT, 'src'));

    expect(files.length).toBeGreaterThan(100);
    // И среди них — сама поверхность, ради которой сторож заведён.
    expect(files).toContain(path.join('src', 'components', 'admin', 'AdminNavigation.tsx'));
    expect(files.some((file) => isAdminSurface(file))).toBe(true);
    expect(files.filter((file) => isAdminSurface(file)).length).toBeGreaterThan(5);
  });

  it('сторож видит безымянный запрос, а не молчит на любом тексте', () => {
    // Диверсия без правки рабочего дерева: разбирается заведомо нарушающий текст.
    expect(
      asksMailboxWithoutNaming(
        path.join('src', 'components', 'admin', 'AdminNotificationsPage.tsx'),
        'const response = await fetch(`/api/notifications?offset=${offset}&limit=15`);',
      ),
    ).toBe(true);

    // Тот же файл, но ящик назван в адресе — законно.
    expect(
      asksMailboxWithoutNaming(
        path.join('src', 'components', 'admin', 'AdminNotificationsPage.tsx'),
        'const response = await fetch(`/api/notifications?scope=supervision&offset=${offset}`);',
      ),
    ).toBe(false);

    // Ящик назван константой — тоже законно.
    expect(
      asksMailboxWithoutNaming(
        path.join('src', 'app', 'service-portal', '(admin)', 'notifications', 'page.tsx'),
        'const feed = await getNotifications({ mailbox: SUPERVISION_MAILBOX, limit: 15 });',
      ),
    ).toBe(false);

    // Счётчик панели без имени ящика — то же нарушение: он показал бы личную
    // почту администратора, то есть вечный ноль.
    expect(
      asksMailboxWithoutNaming(
        path.join('src', 'app', 'service-portal', '(admin)', 'layout.tsx'),
        'const unread = await getUnreadNotificationsCount();',
      ),
    ).toBe(true);

    // Строчный маршрут ящика не называет и называть не должен.
    expect(
      asksMailboxWithoutNaming(
        path.join('src', 'components', 'admin', 'AdminNotificationsPage.tsx'),
        "await fetch(`/api/notifications/${id}/read`, { method: 'POST' });",
      ),
    ).toBe(false);

    // Кабинет человека — не поверхность панели: там «ящик не назван» законно.
    expect(
      asksMailboxWithoutNaming(
        path.join('src', 'hooks', 'useUnreadCountPolling.ts'),
        "await fetch('/api/notifications/unread-count');",
      ),
    ).toBe(false);

    // Пояснение в комментарии под запрет не попадает.
    expect(
      asksMailboxWithoutNaming(
        path.join('src', 'components', 'admin', 'AdminNavigation.tsx'),
        '// Раньше здесь звали /api/notifications без ящика — так делать нельзя.',
      ),
    ).toBe(false);
  });
});
