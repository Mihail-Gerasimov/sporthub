// Сторож: каждый пункт меню ведёт на фиксированный маршрут с файлом страницы (шаг 38.56).
//
// ⚠️ Зачем. Разведка фазы 38 нашла шестнадцать тупиков — ссылок, которые никуда
// не ведут, и ни один из 2823 тестов их не поймал: тест проверял, что ссылка
// отрисована с нужным адресом, и не проверял, что адрес существует. Этот сторож
// ФАЙЛОВЫЙ: пункт меню с адресом `/x/y` обязан иметь `src/app/x/y/page.tsx` —
// с учётом групп маршрутов `(admin)` и динамических сегментов `[slug]`.
//
// ⚠️ Catch-all `[...rest]` за маршрут не засчитывается: с ним «существует» любой
// адрес, и «Маркет» → `/market` без страницы остался бы зелёным (диверсия д-34).
// Страница «раздел в разработке» — фиксированный `/coming-soon`.
//
// Якоря `/#секция` здесь не проверяются — их стережёт `anchors-exist` (38.66):
// цель якоря — элемент в разметке, а не файл.

import { describe, expect, it } from 'vitest';

import { FOOTER_NAV, HEADER_NAV, MOBILE_NAV, type NavItem } from '@/lib/navigation';

import { collectRoutes, routeExists } from '../helpers/app-routes';

/** Пункт — фиксированный маршрут (не якорь на главной). */
function isRoute(item: NavItem): boolean {
  return !item.href.startsWith('/#');
}

describe('Сторож: пункты меню ведут на существующие маршруты (38.56)', () => {
  it('каждый пункт шапки, подвала и дока с адресом-маршрутом имеет файл страницы', async () => {
    const routes = await collectRoutes();
    const missing: string[] = [];

    for (const item of [...HEADER_NAV, ...FOOTER_NAV, ...MOBILE_NAV]) {
      if (isRoute(item) && !routeExists(item.href, routes))
        missing.push(`«${item.label}» → ${item.href}`);
    }

    expect(missing, missing.join('\n')).toEqual([]);
  });

  it('страница «раздел в разработке» — фиксированный маршрут, а не catch-all', async () => {
    const routes = await collectRoutes();

    expect(routes).toContain('/coming-soon');
    expect(HEADER_NAV.some((item) => item.href === '/coming-soon')).toBe(true);
    // Catch-all в корне приложения сделал бы любой адрес «существующим».
    expect(routeExists('/market', routes)).toBe(false);
  });

  it('сторож читает настоящие маршруты, а не пустоту', async () => {
    const routes = await collectRoutes();

    expect(routes.length).toBeGreaterThan(20);
    expect(routes).toContain('/');
    expect(routes).toContain('/clubs/[slug]');
    // Группа маршрутов не входит в адрес.
    expect(routes).toContain('/service-portal/dashboard');
    expect(routes.some((r) => r.includes('(admin)'))).toBe(false);
    // Optional catch-all `[[...rest]]` за маршрут не считается.
    expect(routes.some((r) => r.includes('...'))).toBe(false);
  });

  it('сторож видит пункт без страницы на подставном списке', () => {
    const routes = ['/', '/coming-soon', '/clubs/[slug]'];

    // Диверсия д-34: «Маркет» → `/market` без страницы.
    expect(routeExists('/market', routes)).toBe(false);
    expect(routeExists('/coming-soon', routes)).toBe(true);
    // Параметр подходит под любой сегмент, но не под лишний уровень.
    expect(routeExists('/clubs/атлант', routes)).toBe(true);
    expect(routeExists('/clubs/атлант/фото', routes)).toBe(false);
    // Якорь и строка запроса адресу не мешают.
    expect(routeExists('/coming-soon?from=menu#top', routes)).toBe(true);
  });
});
