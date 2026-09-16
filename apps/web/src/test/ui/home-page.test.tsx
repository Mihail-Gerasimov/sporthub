// Тесты главной — витрина ровно по макету из словаря секций (фаза 38, шаги 38.76 и 38.79b).
//
// Данные приходят настоящим клиентом с заготовленного стенда ответов
// (`helpers/api-stub`): подменяется транспорт, а не модуль доступа к данным.
//
// Что проверяется: страница собрана ИЗ СЛОВАРЯ — шесть записей отрисованы своими
// компонентами в своём порядке, ниже призыва ничего нет; тексты витрины — из
// `home-copy`, а не литералами теста; рабочей части на главной нет (она на `/catalog`);
// витрина не ходит за записями; надёжности нет ни в каком виде; пустой каталог честен.
//
// ⚠️ Правка по ревью 38.66: герой — во всю ширину под шапкой, `main` не держит
// ни полей, ни потолка; контейнер — у каждой секции свой.
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '@/app/page';
import { CTA, FEATURES, HERO, SHOWCASE, STEPS } from '@/lib/home-copy';
import { HOME_SECTION_KEYS, HOME_SECTIONS } from '@/lib/home-sections';
import { useFilterStore } from '@/stores/useFilterStore';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes, fixtureClubs } from '@/test/helpers/fixture-routes';
import { DEFAULT_CITY } from '@sporthub/types';

/* Мок next/navigation для useRouter (виджет поиска героя, ссылки витрины) */
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
  notFound: () => {
    throw new Error('Not found');
  },
}));

describe('Home page', () => {
  let stub: ApiStub;

  beforeEach(() => {
    stub = installApiStub(createFixtureRoutes());
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });
  });

  afterEach(() => {
    stub?.restore();
  });

  it('рисует все секции словаря в его порядке, каждую — с id из записи; последняя — призыв', async () => {
    const { container } = render(await Home());

    // Своего `<main>` у страницы нет — он один, у каркаса (a11y-проход, MED).
    expect(container.querySelector('main')).toBeNull();
    const ids = [...container.querySelectorAll('section[id]')]
      .filter((section) => section.parentElement?.closest('section') === null)
      .map((section) => section.id);

    expect(ids).toEqual(HOME_SECTION_KEYS.map((key) => HOME_SECTIONS[key].id));
    // Главная — ровно макет (решение заказчика 16.09): ниже призыва ничего нет.
    expect(ids.at(-1)).toBe(HOME_SECTIONS.cta.id);
    expect(ids).toHaveLength(6);
  });

  it('витрина: заголовки героя, шагов, возможностей, каруселей и призыва — из словаря текстов', async () => {
    render(await Home());

    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toContain(HERO.titleAccent);
    expect(screen.getByRole('heading', { name: STEPS.title })).toBeInTheDocument();
    for (const step of STEPS.items) {
      expect(screen.getByRole('heading', { name: step.title })).toBeInTheDocument();
    }
    // H2 «возможностей» — в две строки блочными span'ами: сверяем по строкам словаря.
    const featuresTitle = screen.getByRole('heading', { level: 2, name: /Всё, что нужно/ });
    for (const line of FEATURES.titleLines) {
      expect(featuresTitle.textContent).toContain(line);
    }
    // Заголовки каруселей — с городом из стора (38.106).
    expect(
      screen.getByRole('heading', { name: SHOWCASE.clubs.title(DEFAULT_CITY) }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: SHOWCASE.trainers.title(DEFAULT_CITY) }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: CTA.primary })).toBeInTheDocument();
  });

  it('герой стоит во всю ширину: корень страницы без полей и потолка, контейнер — внутри героя', async () => {
    const { container } = render(await Home());

    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toMatch(/\bmax-w-|\bpx-/);

    const hero = screen.getByRole('region', { name: HOME_SECTIONS.hero.label });
    expect(hero.closest('[class*="max-w-"]')).toBeNull();
    expect(hero.querySelector('[class*="max-w-"]')).not.toBeNull();
  });

  it('рабочей части на главной нет: ни формы поиска с фильтрами, ни карты, ни выдачи, ни слотов', async () => {
    render(await Home());

    expect(screen.queryByRole('heading', { name: 'Карта' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /под текущие фильтры/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ближайшие занятия' })).not.toBeInTheDocument();
    expect(screen.queryByText(/в выдаче$/)).not.toBeInTheDocument();
    // Карточки — только витринные: по клубу из ответа с `limit`.
    expect(screen.getAllByRole('article', { name: /^Карточка клуба: / })).toHaveLength(
      fixtureClubs.length,
    );
  });

  it('витрина не ходит за записями вовсе', async () => {
    await Home();

    // ⚠️ Главная проверка этого набора. Раньше страница забирала записи ВСЕЙ площадки
    // ради бейджа надёжности, и когда полный срез записей закрыли от гостя, витрина
    // стала отвечать пятисотой: вход требовался не ради данных, а ради двух чисел
    // на карточке. Бейджа больше нет, а правило «витрине записи не нужны» осталось.
    expect(stub.calls.filter((call) => call.startsWith('/bookings'))).toEqual([]);
  });

  it('надёжности на витрине нет — даже если старый бэкенд пришлёт поле в карточке', async () => {
    stub.restore();
    stub = installApiStub({
      ...createFixtureRoutes(),
      // Карточка с полем `reliability`, каким его отдавал бэкенд до шага 38.23.
      // Фронт обязан его не заметить: бейджу взяться неоткуда — ни из поля,
      // ни из записей, которых страница не спрашивает.
      '/clubs': [
        {
          ...fixtureClubs[0],
          reliability: { completionRate: 0.4, badge: 'danger' },
        },
        ...fixtureClubs.slice(1),
      ],
    });

    render(await Home());

    expect(screen.queryByTestId(/reliability-badge/)).not.toBeInTheDocument();
    expect(screen.queryByText(/надёжност/i)).not.toBeInTheDocument();
  });

  it('показывает честный empty-state, если каталог пуст', async () => {
    stub.restore();
    stub = installApiStub({
      ...createFixtureRoutes(),
      '/clubs': [],
      '/trainers': [],
      '/offerings': [],
      '/schedule?ownerType=club&includeFull=true': [],
      '/schedule?ownerType=trainer&includeFull=true': [],
      '/reviews': [],
      '/bookings': [],
      '/trainer-club-links': [],
    });

    render(await Home());

    // Пустой каталог виден по каруселям витрины; счётчики героя — из сводки.
    const clubs = document.getElementById(HOME_SECTIONS.clubs.id) as HTMLElement;
    const trainers = document.getElementById(HOME_SECTIONS.trainers.id) as HTMLElement;
    expect(within(clubs).getByText(SHOWCASE.clubs.empty)).toBeInTheDocument();
    expect(within(trainers).getByText(SHOWCASE.trainers.empty)).toBeInTheDocument();
    // Лексика фазы 35: лица услуг, а не «провайдер».
    expect(document.body.textContent).not.toMatch(/провайдер/i);
  });
});
