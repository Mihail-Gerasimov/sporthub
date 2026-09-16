// Тесты страницы каталога `/catalog` (фаза 38, шаг 38.79a).
//
// Рабочая часть переехала с главной как есть: страница собрана ИЗ СЛОВАРЯ
// `catalog-sections` — каждая запись отрисована своим компонентом в своём порядке;
// секции переключаются одним стором с героем главной; пустой каталог честен.
// Данные приходят настоящим клиентом со стенда ответов (`helpers/api-stub`).

import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CatalogPage, { metadata } from '@/app/catalog/page';
import { CATALOG_SECTION_KEYS, CATALOG_SECTIONS } from '@/lib/catalog-sections';
import { useFilterStore } from '@/stores/useFilterStore';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes, fixtureClubs } from '@/test/helpers/fixture-routes';
import { BRAND_NAME } from '@sporthub/domain';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/catalog',
  notFound: () => {
    throw new Error('Not found');
  },
}));

const section = (key: keyof typeof CATALOG_SECTIONS) =>
  document.getElementById(CATALOG_SECTIONS[key].id) as HTMLElement;

describe('Страница /catalog (38.79a)', () => {
  let stub: ApiStub;

  beforeEach(() => {
    stub = installApiStub(createFixtureRoutes());
    useFilterStore.setState({ discoveryMode: 'clubs', searchQuery: '', selectedSportId: null });
  });

  afterEach(() => {
    stub?.restore();
  });

  it('заголовок вкладки несёт имя площадки', () => {
    expect(metadata.title).toBe(`Каталог — ${BRAND_NAME}`);
  });

  it('рисует все секции словаря в его порядке, каждую — с id из записи', async () => {
    render(await CatalogPage());

    const main = screen.getByRole('main');
    const ids = [...main.querySelectorAll('section[id]')]
      .filter((el) => el.parentElement?.closest('section') === null)
      .map((el) => el.id);

    expect(ids).toEqual(CATALOG_SECTION_KEYS.map((key) => CATALOG_SECTIONS[key].id));
  });

  it('рабочая часть переключается одним стором: клубы → тренеры', async () => {
    render(await CatalogPage());

    expect(screen.getByRole('heading', { name: 'Карта' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Клубы под текущие фильтры' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ближайшие занятия' })).toBeInTheDocument();
    expect(
      within(section('results')).getAllByRole('article', { name: /^Карточка клуба: / }),
    ).toHaveLength(fixtureClubs.length);

    fireEvent.click(within(section('discover')).getByRole('button', { name: 'Тренеры' }));

    expect(screen.getByRole('heading', { name: 'Карта' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Тренеры под текущие фильтры' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Свободные окна тренеров' })).toBeInTheDocument();
    expect(
      within(section('results')).getAllByRole('article', { name: /^Карточка тренера: / }).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole('article', { name: /^Карточка клуба: / })).not.toBeInTheDocument();
  });

  it('запрос из стора героя главной применяется здесь: ноль в счёте, пустая выдача', async () => {
    useFilterStore.setState({ searchQuery: 'кабачковая икра' });
    render(await CatalogPage());

    expect(within(section('discover')).getByText(/^0 клубов в выдаче$/)).toBeInTheDocument();
    expect(section('results').querySelector('[data-card-slider-empty]')?.textContent).toMatch(
      /не найдено/,
    );
  });

  it('пустой каталог честен: выдача и слоты говорят, что пусто', async () => {
    stub.restore();
    stub = installApiStub({
      ...createFixtureRoutes(),
      '/clubs': [],
      '/trainers': [],
      '/offerings': [],
      '/schedule?ownerType=club&includeFull=true': [],
      '/schedule?ownerType=trainer&includeFull=true': [],
      '/trainer-club-links': [],
    });

    render(await CatalogPage());

    expect(section('results').querySelector('[data-card-slider-empty]')?.textContent).toMatch(
      /не найдено/,
    );
    expect(section('availability').querySelector('[data-card-slider-empty]')?.textContent).toMatch(
      /нет новых слотов/,
    );
  });
});
