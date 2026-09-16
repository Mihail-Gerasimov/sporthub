// Витринные карусели главной «Клубы» и «Тренеры» (фаза 38, шаг 38.79b).
//
// Решение заказчика 16.09 (файл фазы, 2.1 п. 16): главная — ровно макет. Карусели —
// витрина, а не выдача: шесть клубов и четыре тренера приходят ЗАПРОСОМ
// (`sort=rating&limit=N`), фильтров стора они не знают; «Все клубы» / «Все тренеры»
// ведут в выдачу каталога и ставят режим стора. Тексты — из `SHOWCASE` в `home-copy`.
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  notFound: () => {
    throw new Error('Not found');
  },
}));

import Home from '@/app/page';
import { catalogSectionHref } from '@/lib/catalog-sections';
import { SHOWCASE } from '@/lib/home-copy';
import { HOME_SECTIONS } from '@/lib/home-sections';
import { useFilterStore } from '@/stores/useFilterStore';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes, fixtureClubs, fixtureTrainers } from '@/test/helpers/fixture-routes';
import { DEFAULT_CITY } from '@sporthub/types';

const section = (key: 'clubs' | 'trainers') =>
  document.getElementById(HOME_SECTIONS[key].id) as HTMLElement;

describe('Главная — витринные карусели (38.79b)', () => {
  let stub: ApiStub;

  beforeEach(() => {
    stub = installApiStub(createFixtureRoutes());
    useFilterStore.setState({ discoveryMode: 'clubs', searchQuery: '', selectedSportId: null });
  });

  afterEach(() => {
    stub?.restore();
  });

  it('шесть клубов и четыре тренера спрашиваются запросом — sort=rating и limit (файл фазы, 38.79b)', async () => {
    await Home();

    expect(stub.calls).toContain('/clubs?sort=rating&limit=6');
    expect(stub.calls).toContain('/trainers?sort=rating&limit=4');
  });

  it('карусель клубов: заголовок из словаря, карточки — по клубу из ответа, вся карточка ведёт на клуб', async () => {
    render(await Home());

    const clubs = section('clubs');

    expect(
      within(clubs).getByRole('heading', { name: SHOWCASE.clubs.title(DEFAULT_CITY) }),
    ).toBeInTheDocument();
    expect(within(clubs).getAllByRole('article', { name: /^Карточка клуба: / })).toHaveLength(
      fixtureClubs.length,
    );
    expect(within(clubs).getByRole('link', { name: fixtureClubs[0].name })).toHaveAttribute(
      'href',
      `/clubs/${fixtureClubs[0].slug}`,
    );
    // Витрина — плитка макета (38.104): без описания, адреса и тегов.
    for (const card of within(clubs).getAllByRole('article', { name: /^Карточка клуба: / })) {
      expect(card).toHaveAttribute('data-variant', 'showcase');
    }
  });

  it('карусель тренеров: заголовок из словаря, карточки тренеров в режиме витрины', async () => {
    render(await Home());

    const trainers = section('trainers');

    expect(
      within(trainers).getByRole('heading', { name: SHOWCASE.trainers.title(DEFAULT_CITY) }),
    ).toBeInTheDocument();
    expect(
      within(trainers).getAllByRole('article', { name: /^Карточка тренера: / }).length,
    ).toBeGreaterThan(0);
    // Карточка тренера — та же, что в каталоге, в режиме showcase (38.105): без площадки
    // и окна, зато «Доступен сейчас» и точка — от расписания дня, как в каталоге.
    for (const card of within(trainers).getAllByRole('article', { name: /^Карточка тренера: / })) {
      expect(card).toHaveAttribute('data-variant', 'showcase');
    }
    expect(within(trainers).queryByText('Площадка')).not.toBeInTheDocument();
  });

  it('витрина не знает фильтров стора: запрос без совпадений не пустит карусели', async () => {
    useFilterStore.setState({ searchQuery: 'кабачковая икра', discoveryMode: 'trainers' });
    render(await Home());

    expect(
      within(section('clubs')).getAllByRole('article', { name: /^Карточка клуба: / }),
    ).toHaveLength(fixtureClubs.length);
    expect(
      within(section('trainers')).getAllByRole('article', { name: /^Карточка тренера: / }).length,
    ).toBeGreaterThan(0);
  });

  it('с lg — сетка макета (клубы 3×2, тренеры четыре в ряд), ниже — та же карусель со свайпом (38.106)', async () => {
    render(await Home());

    const clubsRail = section('clubs').querySelector('[data-card-slider-rail]') as HTMLElement;
    const trainersRail = section('trainers').querySelector(
      '[data-card-slider-rail]',
    ) as HTMLElement;

    // Один компонент: та же лента `CardSlider`, с lg — grid в N колонок классами.
    expect(clubsRail.className).toContain('lg:grid-cols-3');
    expect(trainersRail.className).toContain('lg:grid-cols-4');
    expect(clubsRail.className).toContain('flex');
    // Ниже lg — слайдер: md две в ряд (стенд теста — узкий: одна).
    expect(
      within(section('clubs')).getAllByRole('article', { name: /^Карточка клуба: / }),
    ).toHaveLength(fixtureClubs.length);
    // Стрелки и точки с lg спрятаны: у сетки листать нечего.
    for (const name of ['Назад', 'Вперёд']) {
      expect(within(section('clubs')).getByRole('button', { name }).className).toContain(
        'lg:hidden',
      );
    }
    expect(
      section('clubs').querySelector('[data-card-slider-dot]')?.parentElement?.className,
    ).toContain('lg:hidden');
  });

  it('заголовки секций — шкала t-h2, рубрика зелёная; «Все …» — справа от заголовка (38.106)', async () => {
    render(await Home());

    const clubs = section('clubs');
    const heading = within(clubs).getByRole('heading', {
      name: SHOWCASE.clubs.title(DEFAULT_CITY),
    });

    expect(heading.className).toContain('t-h2');
    expect(within(clubs).getByText(SHOWCASE.clubs.eyebrow).className).toContain('text-lime-hov');
    // Кнопка «Все клубы» стоит в шапке секции рядом с заголовком, а не под лентой.
    expect(within(clubs).getByRole('link', { name: SHOWCASE.clubs.all }).closest('header')).toBe(
      heading.closest('header'),
    );
  });

  it('заголовки секций несут город из стора — как подзаголовок героя: сменился город — сменились заголовки', async () => {
    useFilterStore.setState({ selectedCity: 'Тольятти' });
    render(await Home());

    expect(
      within(section('clubs')).getByRole('heading', { name: SHOWCASE.clubs.title('Тольятти') }),
    ).toBeInTheDocument();
    expect(
      within(section('trainers')).getByRole('heading', {
        name: SHOWCASE.trainers.title('Тольятти'),
      }),
    ).toBeInTheDocument();
    // Город стоит в заголовке именительным падежом после тире, как в герое:
    // склонять названия городов словарём нельзя — их список живёт в базе.
    expect(SHOWCASE.clubs.title('Тольятти')).toMatch(/— Тольятти$/);
    expect(SHOWCASE.trainers.title('Тольятти')).toMatch(/— Тольятти$/);
  });

  it('«Все клубы» и «Все тренеры» ведут в выдачу каталога и ставят режим стора', async () => {
    push.mockClear();
    render(await Home());

    const allTrainers = within(section('trainers')).getByRole('link', {
      name: SHOWCASE.trainers.all,
    });
    expect(allTrainers).toHaveAttribute('href', catalogSectionHref('results'));

    fireEvent.click(allTrainers);
    expect(useFilterStore.getState().discoveryMode).toBe('trainers');

    fireEvent.click(within(section('clubs')).getByRole('link', { name: SHOWCASE.clubs.all }));
    expect(useFilterStore.getState().discoveryMode).toBe('clubs');
  });

  it('порядок карусели «Тренеры» = порядок ответа sort=rating&limit=4, ничьи не пересортировываются по имени', async () => {
    // Равные рейтинг и отзывы: справочник развёл бы по имени («Анна» раньше «Яны»),
    // запрос разводит по номеру (38.31) — карусель обязана показать как пришло.
    const tie = { rating: 4.9, reviewCount: 10 };
    const asAnswered = [
      { ...fixtureTrainers[2], ...tie, id: 9, name: 'Яна Тест', slug: 'yana-test' },
      { ...fixtureTrainers[0], ...tie, id: 11, name: 'Анна Тест', slug: 'anna-test' },
    ];
    stub.restore();
    stub = installApiStub({ ...createFixtureRoutes(), '/trainers': asAnswered });

    render(await Home());

    const names = within(section('trainers'))
      .getAllByRole('article', { name: /^Карточка тренера: / })
      .map((card) => card.getAttribute('aria-label'));

    expect(names).toEqual(['Карточка тренера: Яна Тест', 'Карточка тренера: Анна Тест']);
  });

  it('пустой каталог честен: карусели говорят словами словаря', async () => {
    stub.restore();
    stub = installApiStub({
      ...createFixtureRoutes(),
      '/clubs': [],
      '/trainers': [],
      '/offerings': [],
      '/schedule?ownerType=trainer&includeFull=true': [],
      '/trainer-club-links': [],
    });

    render(await Home());

    expect(within(section('clubs')).getByText(SHOWCASE.clubs.empty)).toBeInTheDocument();
    expect(within(section('trainers')).getByText(SHOWCASE.trainers.empty)).toBeInTheDocument();
    expect(fixtureTrainers.length).toBeGreaterThan(0);
  });
});
