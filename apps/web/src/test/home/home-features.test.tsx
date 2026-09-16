// Тесты секции «Возможности» (шаг 38.72).
//
// Плитки макета выглядели кликабельными и не вели никуда (тупик № 10 приложения Б).
// Здесь у каждой плитки цель СУЩЕСТВУЕТ: якорь — из словаря секций главной, маршрут —
// файл `src/app/**/page.tsx`, и проверяется ПАРА «плитка → цель», а не только
// существование целей. Гостю раздел кабинета — тупик (`307 → /` без возврата),
// поэтому гостю такая плитка открывает модалку входа, как «Создать аккаунт»
// в призыве; вошедшему — ссылка.

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { HomeFeatures } from '@/components/home/HomeFeatures';
import { FEATURES } from '@/lib/home-copy';
import { HOME_SECTIONS, homeSectionHref } from '@/lib/home-sections';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { collectRoutes, routeExists } from '@/test/helpers/app-routes';

/** Пары «плитка → цель», закреплённые по заголовку из словаря. */
const EXPECTED_TARGETS: Record<string, string> = {
  'Онлайн-запись': homeSectionHref('availability'),
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

/** Заголовок плитки — текст `.t-h4` внутри интерактива. */
const titleOf = (tile: HTMLElement) =>
  within(tile).getByText(/./, { selector: '.t-h4' }).textContent ?? '';

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

    for (const href of Object.values(EXPECTED_TARGETS)) {
      const exists = href.startsWith('/#')
        ? homeSectionHref('availability') === href
        : routeExists(href, routes, { staticOnly: true });

      expect(exists, `цель «${href}» не существует`).toBe(true);
    }
  });

  it('гостю плитки в кабинет — кнопки входа, а не ссылки в тупик; плитка к секции — ссылка', () => {
    render(<HomeFeatures />);

    const section = screen.getByRole('region', { name: HOME_SECTIONS.features.label });
    const links = within(section).getAllByRole('link');
    const buttons = within(section).getAllByRole('button');

    expect(links.map(titleOf)).toEqual(['Онлайн-запись']);
    expect(links[0]).toHaveAttribute('href', homeSectionHref('availability'));
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

  it('иконки скрыты от диктора, подпись плитки — имя интерактива', () => {
    signIn();
    render(<HomeFeatures />);

    const section = screen.getByRole('region', { name: HOME_SECTIONS.features.label });

    expect(section.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(4);
    expect(screen.getByRole('link', { name: /онлайн-запись/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /прогресс и цели/i })).toBeInTheDocument();
  });
});
