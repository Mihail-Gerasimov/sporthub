// Пустые состояния рабочей части главной (фаза 38, шаг 38.82; чек-лист step-16).
//
// Запрос, не дающий совпадений: каждая секция рабочей части — поиск, выдача, карта,
// подборка, слоты — говорит понятным текстом, что пусто, и у человека есть способ
// сбросить: чип «Сбросить запрос: …» в блоке поиска. Счёт «N клубов в выдаче» —
// ЖИВОЙ, по тем же фильтрам, что у выдачи: прежде бейдж брал длину всего каталога
// и при пустой выдаче говорил «3 клуба в выдаче» (ревью 38.66, LOW).
//
// Данные — настоящим клиентом со стенда ответов (`helpers/api-stub`).
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '@/app/page';
import { POPULAR } from '@/lib/home-copy';
import { HOME_SECTIONS } from '@/lib/home-sections';
import { PLURAL, countRu } from '@/lib/plural';
import { useFilterStore } from '@/stores/useFilterStore';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes, fixtureClubs, fixtureTrainers } from '@/test/helpers/fixture-routes';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => '/',
  notFound: () => {
    throw new Error('Not found');
  },
}));

/** Запрос, которого нет ни в одном имени, описании, теге и виде спорта стенда. */
const NO_MATCH = 'кабачковая икра';

const section = (key: keyof typeof HOME_SECTIONS) =>
  document.getElementById(HOME_SECTIONS[key].id) as HTMLElement;

describe('Home — пустые состояния рабочей части (38.82)', () => {
  let stub: ApiStub;

  beforeEach(() => {
    stub = installApiStub(createFixtureRoutes());
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: NO_MATCH,
      selectedSportId: null,
    });
  });

  afterEach(() => {
    stub?.restore();
  });

  it('клубы: счёт выдачи — ноль, выдача и подборка — текстом, карточек нет, карта на месте', async () => {
    render(await Home());

    expect(
      within(section('discover')).getByText(`${countRu(0, PLURAL.clubs)} в выдаче`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: /^Карточка клуба: / })).not.toBeInTheDocument();

    const resultsEmpty = section('results').querySelector('[data-card-slider-empty]');
    expect(resultsEmpty?.textContent).toMatch(/не найдено/);
    expect(within(section('popular')).getByText(POPULAR.empty.clubs)).toBeInTheDocument();
    // Слоты следуют за фильтрами (38.81): под запросом без совпадений — пустое состояние.
    expect(section('availability').querySelector('[data-card-slider-empty]')?.textContent).toMatch(
      /нет новых слотов/,
    );
    // Плашка карты «нет услуг по фильтрам» рисуется после загрузки Яндекс-карт и покрыта
    // `main-map.test.tsx` с подменённым `ymaps3`; здесь — что секция карты стоит и не падает.
    expect(section('map')).not.toBeNull();
  });

  it('тренеры: то же — ноль в счёте, пустая выдача и подборка', async () => {
    useFilterStore.setState({ discoveryMode: 'trainers' });
    render(await Home());

    expect(
      within(section('discover')).getByText(`${countRu(0, PLURAL.trainers)} в выдаче`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('article', { name: /^Карточка тренера: / })).not.toBeInTheDocument();
    expect(section('results').querySelector('[data-card-slider-empty]')?.textContent).toMatch(
      /не найдено/,
    );
    expect(within(section('popular')).getByText(POPULAR.empty.trainers)).toBeInTheDocument();
  });

  it('способ сбросить — чип «Сбросить запрос» в блоке поиска: после него выдача и счёт возвращаются', async () => {
    render(await Home());

    fireEvent.click(
      within(section('discover')).getByRole('button', { name: `Сбросить запрос: ${NO_MATCH}` }),
    );

    expect(useFilterStore.getState().searchQuery).toBe('');
    expect(
      within(section('discover')).getByText(
        `${countRu(fixtureClubs.length, PLURAL.clubs)} в выдаче`,
      ),
    ).toBeInTheDocument();
    expect(
      within(section('results')).getAllByRole('article', { name: /^Карточка клуба: / }),
    ).toHaveLength(fixtureClubs.length);
    expect(section('results').querySelector('[data-card-slider-empty]')).toBeNull();
  });

  it('счёт выдачи следует за фильтром вида спорта, а не за длиной каталога', async () => {
    useFilterStore.setState({ searchQuery: '' });
    render(await Home());

    // Плавание (id 3) — у части клубов и тренеров стенда; счёт равен числу карточек выдачи.
    fireEvent.click(within(section('discover')).getByRole('button', { name: 'Плавание' }));

    const clubsShown = within(section('results')).getAllByRole('article', {
      name: /^Карточка клуба: /,
    }).length;
    expect(clubsShown).toBeGreaterThan(0);
    expect(clubsShown).toBeLessThan(fixtureClubs.length + fixtureTrainers.length);
    expect(
      within(section('discover')).getByText(`${countRu(clubsShown, PLURAL.clubs)} в выдаче`),
    ).toBeInTheDocument();
  });
});
