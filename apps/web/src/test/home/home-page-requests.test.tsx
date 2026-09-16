// Тест подключения главной (фаза 38, шаги 38.32 и 38.66): какие адреса страница
// на самом деле спрашивает и откуда берёт числа героя.
//
// ⚠️ Урок фазы 36 (`awaiting-recheck-count.test.ts`): тест компонента зелен и тогда,
// когда число берётся не оттуда. Счётчики героя обязаны приходить из
// `GET /api/stats/overview` — четырёх `count` на бэкенде, — а не из длины полного
// списка, поднятого для рабочей части. Стенд отвечает сводкой, НЕ равной длинам
// списков: страница, посчитавшая «клубов: clubs.length», покажет другое число
// (диверсия д-20).

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
  notFound: () => {
    throw new Error('Not found');
  },
}));

import Home from '@/app/page';
import { useFilterStore } from '@/stores/useFilterStore';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes, fixtureClubs, fixtureOverview } from '@/test/helpers/fixture-routes';

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
});
