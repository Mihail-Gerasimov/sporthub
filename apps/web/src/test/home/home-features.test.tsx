// Тесты секции «Возможности» (шаг 38.72).
//
// Плитки макета выглядели кликабельными и не вели никуда (тупик № 10 приложения Б).
// Здесь у каждой плитки цель СУЩЕСТВУЕТ: якорь — из словаря секций каталога, маршрут —
// файл `src/app/**/page.tsx`, и проверяется ПАРА «плитка → цель», а не только
// существование целей. Гостю раздел кабинета — тупик (`307 → /` без возврата),
// поэтому гостю такая плитка открывает модалку входа, как «Создать аккаунт»
// в призыве; вошедшему — ссылка.

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { HomeFeatures } from '@/components/home/HomeFeatures';
import { FEATURES } from '@/lib/home-copy';
import { catalogSectionHref } from '@/lib/catalog-sections';
import { HOME_SECTIONS } from '@/lib/home-sections';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { collectRoutes, routeExists } from '@/test/helpers/app-routes';

/** Пары «плитка → цель», закреплённые по заголовку из словаря. */
const EXPECTED_TARGETS: Record<string, string> = {
  'Онлайн-запись': catalogSectionHref('availability'),
  'Статистика тренировок': '/profile/me/stats',
  'Прогресс и цели': '/profile/me/dashboard',
  'Отзывы и рейтинг': '/profile/me/reviews',
};

function signIn() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: { name: 'Марина Крылова', email: 'marina@studio.local' },
    isAuthenticated: true,
    accountKind: 'person',
    status: 'ready',
  });
}

/** Заголовок плитки — тот из словаря, что стоит внутри интерактива. */
const titleOf = (tile: HTMLElement) =>
  FEATURES.items.find((item) => within(tile).queryByText(item.title) !== null)?.title ?? '';

describe('HomeFeatures', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isAuthModalOpen: false });
  });

  it('якорь и подпись секции — из записи словаря секций', () => {
    render(<HomeFeatures />);

    const section = screen.getByRole('region', { name: HOME_SECTIONS.features.label });

    expect(section.id).toBe(HOME_SECTIONS.features.id);
  });

  it('четыре плитки — по словарю home-copy, в его порядке', () => {
    signIn();
    render(<HomeFeatures />);

    const section = screen.getByRole('region', { name: HOME_SECTIONS.features.label });
    const links = within(section).getAllByRole('link');

    expect(links).toHaveLength(4);
    expect(links.map(titleOf)).toEqual(FEATURES.items.map((item) => item.title));
  });

  it('снятые плитки не вернулись: ни дневников, ни маркета, ни челленджей, ни оплаты, ни серий', () => {
    render(<HomeFeatures />);

    const text =
      screen.getByRole('region', { name: HOME_SECTIONS.features.label }).textContent ?? '';

    for (const promise of [/дневник/i, /маркет/i, /челлендж/i, /оплат/i, /сери[ия]/i]) {
      expect(text).not.toMatch(promise);
    }
  });

  it('вошедшему каждая плитка — ссылка на СВОЮ цель, и цель существует', async () => {
    signIn();
    render(<HomeFeatures />);

    const routes = await collectRoutes();
    const links = screen.getAllByRole('link');

    expect(
      Object.fromEntries(links.map((link) => [titleOf(link), link.getAttribute('href')])),
    ).toEqual(EXPECTED_TARGETS);

    // Все цели — фиксированные маршруты (`/catalog#…` — страница каталога, якорь
    // из её словаря; `/profile/me/*` — кабинет): у каждой есть файл страницы.
    for (const href of Object.values(EXPECTED_TARGETS)) {
      expect(routeExists(href, routes, { staticOnly: true }), `цель «${href}» не существует`).toBe(
        true,
      );
    }
  });

  it('гостю плитки в кабинет — кнопки входа, а не ссылки в тупик; плитка к секции — ссылка', () => {
    render(<HomeFeatures />);

    const section = screen.getByRole('region', { name: HOME_SECTIONS.features.label });
    const links = within(section).getAllByRole('link');
    const buttons = within(section).getAllByRole('button');

    expect(links.map(titleOf)).toEqual(['Онлайн-запись']);
    expect(links[0]).toHaveAttribute('href', catalogSectionHref('availability'));
    expect(buttons.map(titleOf)).toEqual([
      'Статистика тренировок',
      'Прогресс и цели',
      'Отзывы и рейтинг',
    ]);

    // Тот же механизм, что у «Создать аккаунт» в призыве: модалка входа.
    expect(useUIStore.getState().isAuthModalOpen).toBe(false);
    fireEvent.click(buttons[1]);
    expect(useUIStore.getState().isAuthModalOpen).toBe(true);
  });

  it('у каждой плитки свой тон ПО КЛЮЧУ записи: подложка bg-tint-* и значок в тон, ни один не повторяется', () => {
    signIn();
    render(<HomeFeatures />);

    // Тон — по ключу записи словаря, а не по позиции: плитка находится по заголовку.
    const expectedSurface: Record<string, string> = {
      booking: 'bg-tint-lime',
      stats: 'bg-tint-sky',
      progress: 'bg-tint-emerald',
      reviews: 'bg-tint-orange',
    };
    const iconTones = new Set<string>();

    for (const item of FEATURES.items) {
      const tile = screen.getByRole('link', { name: new RegExp(item.title, 'i') });
      const iconTone = tile
        .querySelector('svg')
        ?.parentElement?.className.match(/\btext-[a-z-]+\b/)?.[0];

      expect(tile.className, `подложка «${item.title}»`).toContain(expectedSurface[item.key]);
      expect(iconTone, `тон значка «${item.title}»`).toBeDefined();
      iconTones.add(iconTone ?? '');
    }

    // Четыре плитки — четыре разных тона значка (макет, 38.110); общая подложка прежнего вида ушла.
    expect(iconTones.size).toBe(FEATURES.items.length);
    expect(
      screen.getAllByRole('link').some((link) => link.className.includes('bg-lime-soft')),
    ).toBe(false);
  });

  it('заголовок плитки — .t-h4 словаря обычным регистром (38.109)', () => {
    signIn();
    render(<HomeFeatures />);

    // Класс словаря типографики, а не литералы кегля: одно объявление — в globals.css.
    for (const item of FEATURES.items) {
      const title = screen.getByText(item.title);

      expect(title.className).toContain('t-h4');
      expect(title.className).not.toContain('uppercase');
    }
  });

  it('иконки скрыты от диктора, подпись плитки — имя интерактива', () => {
    signIn();
    render(<HomeFeatures />);

    const section = screen.getByRole('region', { name: HOME_SECTIONS.features.label });

    expect(section.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /онлайн-запись/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /прогресс и цели/i })).toBeInTheDocument();
  });
});
