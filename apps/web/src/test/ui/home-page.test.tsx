// Тесты главной страницы.
//
// Данные приходят настоящим клиентом с заготовленного стенда ответов
// (`helpers/api-stub`): подменяется транспорт, а не модуль доступа к данным.
//
// ⚠️ Фаза 38, шаг 38.25: случай «бейдж надёжности рисуется по числу из карточки»
// переписан в обратный — механизма нет, и поле в ответе бейджа не возвращает
// (реестр `phase-38-reliability-cut.md`, Т16). Шаг 38.76 перепишет набор целиком.
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '@/app/page';
import { HERO } from '@/lib/home-copy';
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

  it('рендерит собранную главную с ключевыми секциями и переключает discovery mode', async () => {
    render(await Home());

    // Шаг 38.66: главная рисуется из словаря секций — герой стал `HomeHero` (38.65),
    // заголовок читается из `HERO`; 38.76 перепишет набор на новую витрину целиком.
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toContain(HERO.titleAccent);
    expect(
      screen.getByRole('heading', { name: 'Поиск по клубам и направлениям' }),
    ).toBeInTheDocument();
    // Карта — секция с заголовком (без API-ключа → fallback провайдера)
    expect(screen.getByRole('heading', { name: 'Карта' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Популярное рядом' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ближайшие занятия' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Клубы под текущие фильтры' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'MVP в разработке' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'По тренерам и направлениям' }));

    expect(
      screen.getByRole('heading', { name: 'Поиск по тренерам и направлениям' }),
    ).toBeInTheDocument();
    // Карта не меняется при переключении mode
    expect(screen.getByRole('heading', { name: 'Карта' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Популярные тренеры' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Свободные окна тренеров' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Тренеры под текущие фильтры' }),
    ).toBeInTheDocument();
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

    // Счётчики каталога в герое — слот 38.69; прежние плашки «N в каталоге» ушли
    // вместе со старым героем (38.66). Пустой каталог виден по лидерам и по выдаче.
    expect(
      screen.getByText(
        'Каталог пока пуст. Витрина начнёт заполняться новыми публикациями из кабинета провайдера.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('popular-nearby-empty')).toBeInTheDocument();
    expect(
      screen.getByText(
        'На сегодня в расписании нет новых слотов. Проверь другие секции или открой клуб, чтобы посмотреть ближайшие даты.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'По тренерам и направлениям' }));

    expect(screen.getByTestId('popular-trainers-empty')).toBeInTheDocument();
    // Phase 28.12: новая копия empty-state TrainerAvailability — короче.
    expect(
      screen.getByText(
        'У тренеров пока нет свободных окон. Проверь позже или переключись в клубный режим.',
      ),
    ).toBeInTheDocument();
  });
});
