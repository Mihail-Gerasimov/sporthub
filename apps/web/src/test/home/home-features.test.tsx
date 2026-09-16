// Тесты секции «Возможности» (шаг 38.72).
//
// Плитки макета выглядели кликабельными и не вели никуда (тупик № 10 приложения Б).
// Здесь каждая плитка — ссылка, и у каждой ссылки цель СУЩЕСТВУЕТ: якорь — из
// словаря секций главной, маршрут — файл `src/app/**/page.tsx`. Проверка та же,
// что у `menu-routes-exist`: по файлам, а не по тому, что ссылка отрисована.

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HomeFeatures } from '@/components/home/HomeFeatures';
import { FEATURES } from '@/lib/home-copy';
import { HOME_SECTIONS } from '@/lib/home-sections';
import { collectRoutes, routeExists } from '@/test/helpers/app-routes';

describe('HomeFeatures', () => {
  it('четыре плитки — по словарю home-copy, каждая ссылкой', () => {
    render(<HomeFeatures />);

    const section = screen.getByRole('region', { name: /всё, что нужно/i });
    const links = within(section).getAllByRole('link');

    expect(links).toHaveLength(4);
    expect(
      links.map((link) => within(link).getByText(/./, { selector: '.t-h4' }).textContent),
    ).toEqual(FEATURES.items.map((item) => item.title));
  });

  it('снятые плитки не вернулись: ни дневников, ни маркета, ни челленджей, ни оплаты', () => {
    render(<HomeFeatures />);

    const text = screen.getByRole('region', { name: /всё, что нужно/i }).textContent ?? '';

    for (const promise of [/дневник/i, /маркет/i, /челлендж/i, /оплат/i]) {
      expect(text).not.toMatch(promise);
    }
  });

  it('у каждой плитки цель существует: якорь — в словаре секций, маршрут — файлом страницы', async () => {
    render(<HomeFeatures />);

    // ⚠️ Только СТАТИЧЕСКИЕ маршруты: цели плиток — фиксированные адреса кабинета,
    // и подстановка `[faceKind]/[faceId]` под `/profile/me/что-угодно` дала бы
    // ложный зелёный (диверсия: `/profile/me/diary` — файл есть, страница 404).
    const routes = (await collectRoutes()).filter((route) => !route.includes('['));
    const hrefs = screen.getAllByRole('link').map((link) => link.getAttribute('href') ?? '');
    const anchors = new Set(Object.values(HOME_SECTIONS).map((section) => `/#${section.id}`));

    expect(hrefs).toHaveLength(4);

    for (const href of hrefs) {
      const isAnchor = href.startsWith('/#');

      expect(
        isAnchor ? anchors.has(href) : routeExists(href, routes),
        `цель «${href}» не существует`,
      ).toBe(true);
    }
  });

  it('иконки скрыты от диктора, подпись плитки — текст ссылки', () => {
    render(<HomeFeatures />);

    const section = screen.getByRole('region', { name: /всё, что нужно/i });

    expect(section.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /онлайн-запись/i })).toBeInTheDocument();
  });
});
