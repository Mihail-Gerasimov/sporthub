// Тесты главной — витрина и рабочая часть из словаря секций (фаза 38, шаг 38.76).
//
// Данные приходят настоящим клиентом с заготовленного стенда ответов
// (`helpers/api-stub`): подменяется транспорт, а не модуль доступа к данным.
//
// Что проверяется: страница собрана ИЗ СЛОВАРЯ — каждая запись отрисована своим
// компонентом в своём порядке; тексты витрины — из `home-copy`, а не литералами
// теста; рабочая часть переключается одним стором с героем; витрина не ходит
// за записями; надёжности нет ни в каком виде; пустой каталог честен.
//
// ⚠️ Правка по ревью 38.66: герой — во всю ширину под шапкой, `main` не держит
// ни полей, ни потолка; контейнер — у каждой секции свой.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '@/app/page';
import { CTA, FEATURES, HERO, LEADERS, POPULAR, STEPS } from '@/lib/home-copy';
import { HOME_SECTION_KEYS, HOME_SECTIONS } from '@/lib/home-sections';
import { useFilterStore } from '@/stores/useFilterStore';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes, fixtureClubs } from '@/test/helpers/fixture-routes';

/* Мок next/navigation для useRouter (используется в UpcomingSessions/TrainerAvailability) */
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

/** Переключатель героя — один стор с рабочей частью; кликаем в герое. */
function switchToTrainers() {
  fireEvent.click(
    within(screen.getByRole('region', { name: HOME_SECTIONS.hero.label })).getByRole('button', {
      name: 'Тренеры',
    }),
  );
}

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

  it('рисует все секции словаря в его порядке, каждую — с id из записи', async () => {
    render(await Home());

    const main = screen.getByRole('main');
    const ids = [...main.querySelectorAll('section[id]')]
      .filter((section) => section.parentElement?.closest('section') === null)
      .map((section) => section.id);

    expect(ids).toEqual(HOME_SECTION_KEYS.map((key) => HOME_SECTIONS[key].id));
  });

  it('витрина: заголовки героя, шагов, возможностей и призыва — из словаря текстов', async () => {
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
    expect(screen.getByRole('button', { name: CTA.primary })).toBeInTheDocument();
  });

  it('герой стоит во всю ширину: main без полей и потолка, контейнер — внутри героя', async () => {
    render(await Home());

    const main = screen.getByRole('main');
    expect(main.className).not.toMatch(/\bmax-w-|\bpx-/);

    const hero = screen.getByRole('region', { name: HOME_SECTIONS.hero.label });
    expect(hero.closest('[class*="max-w-"]')).toBeNull();
    expect(hero.querySelector('[class*="max-w-"]')).not.toBeNull();
  });

  it('рабочая часть переключается одним стором с героем: клубы → тренеры', async () => {
    render(await Home());

    // Подборка под фильтр — до её снятия (38.79b): заголовок ищется внутри её секции,
    // витринная карусель «Тренеры» называется так же.
    const popular = document.getElementById(HOME_SECTIONS.popular.id) as HTMLElement;
    expect(screen.getByRole('heading', { name: 'Карта' })).toBeInTheDocument();
    expect(within(popular).getByRole('heading', { name: POPULAR.title.clubs })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ближайшие занятия' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Клубы под текущие фильтры' })).toBeInTheDocument();
    // Карточки выдачи — по одной на клуб стенда (популярное рисует их ещё раз — 38.79).
    const catalog = document.getElementById(HOME_SECTIONS.results.id) as HTMLElement;
    expect(within(catalog).getAllByRole('article', { name: /^Карточка клуба: / })).toHaveLength(
      fixtureClubs.length,
    );

    switchToTrainers();

    // Карта не меняется при переключении режима.
    expect(screen.getByRole('heading', { name: 'Карта' })).toBeInTheDocument();
    expect(
      within(popular).getByRole('heading', { name: POPULAR.title.trainers }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Свободные окна тренеров' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Тренеры под текущие фильтры' }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('article', { name: /^Карточка тренера: / }).length).toBeGreaterThan(
      0,
    );
    // В выдаче клубов нет; витринная карусель «Клубы» режима не знает и стоит как была.
    expect(
      within(catalog).queryByRole('article', { name: /^Карточка клуба: / }),
    ).not.toBeInTheDocument();
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

    // Пустой каталог виден по лидерам и по выдаче; счётчики героя — из сводки.
    expect(screen.getByText(LEADERS.empty.catalog)).toBeInTheDocument();
    const popular = document.getElementById(HOME_SECTIONS.popular.id) as HTMLElement;
    expect(within(popular).getByText(POPULAR.empty.clubs)).toBeInTheDocument();
    expect(
      screen.getByText(
        'На сегодня в расписании нет новых слотов. Проверь другие секции или открой клуб, чтобы посмотреть ближайшие даты.',
      ),
    ).toBeInTheDocument();

    switchToTrainers();

    expect(within(popular).getByText(POPULAR.empty.trainers)).toBeInTheDocument();
    // Phase 28.12: новая копия empty-state TrainerAvailability — короче.
    expect(
      screen.getByText(
        'У тренеров пока нет свободных окон. Проверь позже или переключись в клубный режим.',
      ),
    ).toBeInTheDocument();
  });
});
