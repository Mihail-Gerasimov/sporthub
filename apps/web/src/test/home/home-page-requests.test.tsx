// Тест подключения главной (фаза 38, шаги 38.32 и 38.66): какие адреса страница
// на самом деле спрашивает и откуда берёт числа героя.
//
// ⚠️ Урок фазы 36 (`awaiting-recheck-count.test.ts`): тест компонента зелен и тогда,
// когда число берётся не оттуда. Счётчики героя обязаны приходить из
// `GET /api/stats/overview` — четырёх `count` на бэкенде, — а не из длины полного
// списка, поднятого для рабочей части. Стенд отвечает сводкой, НЕ равной длинам
// списков: страница, посчитавшая «клубов: clubs.length», покажет другое число
// (диверсия д-20).

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  notFound: () => {
    throw new Error('Not found');
  },
}));

import Home from '@/app/page';
import { useFilterStore } from '@/stores/useFilterStore';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes, fixtureClubs, fixtureOverview } from '@/test/helpers/fixture-routes';
import { SEARCH } from '@/lib/home-copy';
import { catalogSectionHref } from '@/lib/catalog-sections';

describe('главная — адреса запросов', () => {
  let stub: ApiStub;

  beforeEach(() => {
    stub = installApiStub(createFixtureRoutes());
    useFilterStore.setState({ discoveryMode: 'clubs', searchQuery: '', selectedSportId: null });
  });

  afterEach(() => {
    stub?.restore();
  });

  it('счётчики героя спрашиваются адресом /stats/overview', async () => {
    await Home();

    expect(stub.calls).toContain('/stats/overview');
  });

  it('вызовы лидеров ушли (38.79c): нет limit=1; тренеры — витриной с limit и справочником имён для героя (38.116)', async () => {
    await Home();

    const trainers = stub.calls.filter((call) => call.split('?')[0] === '/trainers');

    // Витрина — четвёрка с `limit`; полный список — ради имени тренера в строке занятия
    // героя (38.116); лидеров `limit=1` больше нет.
    expect(trainers).toEqual(
      expect.arrayContaining(['/trainers?sort=rating&limit=4', '/trainers']),
    );
    expect(trainers).toHaveLength(2);
    expect(stub.calls.filter((call) => /limit=1(&|$)/.test(call))).toEqual([]);
    expect(stub.calls).toContain('/clubs?sort=rating&limit=6');
    // ⚠️ Полный список клубов остаётся: «Сегодня в фокусе» — занятия дня всей площадки
    // с именами клубов, площадка тренера — клуб по связи (`load-home-data.ts`).
    expect(stub.calls).toContain('/clubs');
  });

  it('числа героя — из ответа сводки, а не из длины списков (д-20)', async () => {
    render(await Home());

    // Сторож стенда: сводка обязана отличаться от длины списка, иначе проверка слепа.
    expect(fixtureOverview.clubs).not.toBe(fixtureClubs.length);

    // Числа сводки — в тексте героя (в том числе для диктора); разметку счётчиков
    // тест не разглядывает, только сами числа.
    const hero = screen.getByRole('region', { name: 'Главный экран' }).textContent ?? '';

    for (const value of Object.values(fixtureOverview)) {
      expect(hero).toContain(value.toLocaleString('ru-RU'));
    }
  });

  it('виджет поиска стоит в герое: запрос из поля доезжает до стора, «Найти» ведёт к выдаче каталога (38.67, 38.79a)', async () => {
    push.mockClear();
    render(await Home());

    const hero = screen.getByRole('region', { name: 'Главный экран' });
    const input = hero.querySelector('input[type="search"]');

    expect(input).not.toBeNull();

    fireEvent.change(input as HTMLInputElement, { target: { value: 'йога' } });
    fireEvent.click(screen.getByRole('button', { name: SEARCH.button }));

    expect(useFilterStore.getState().searchQuery).toBe('йога');
    expect(push).toHaveBeenCalledWith(catalogSectionHref('results'));
  });
});
