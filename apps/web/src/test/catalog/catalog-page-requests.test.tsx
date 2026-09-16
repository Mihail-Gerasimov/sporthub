// Тест подключения каталога (фаза 38, шаг 38.79a): какие адреса страница `/catalog`
// на самом деле спрашивает.
//
// Рабочая часть переехала с главной как есть: адреса — те же, что она делала там
// (полный каталог без `limit`, расписания, услуги, справочники, связи). Витринного
// у каталога нет: ни сводки `/stats/overview`, ни лидеров `limit=1`, ни записей.
// Урок фазы 36: тест компонента зелен и тогда, когда данные берутся не оттуда.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/catalog',
  notFound: () => {
    throw new Error('Not found');
  },
}));

import CatalogPage from '@/app/catalog/page';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';

describe('каталог — адреса запросов', () => {
  let stub: ApiStub;

  beforeEach(() => {
    stub = installApiStub(createFixtureRoutes());
  });

  afterEach(() => {
    stub?.restore();
  });

  it('спрашивает рабочую часть — те же адреса, что были у главной, и ничего витринного', async () => {
    await CatalogPage();

    const paths = stub.calls.map((call) => call.split('?')[0]);

    for (const path of [
      '/clubs',
      '/trainers',
      '/schedule',
      '/offerings',
      '/specialties',
      '/sports',
      '/tags',
      '/trainer-club-links',
    ]) {
      expect(paths, `нет вызова ${path}`).toContain(path);
    }

    // Полный каталог — без `limit`: отбор в памяти по построению (Д-15).
    expect(stub.calls.filter((call) => /^\/(clubs|trainers)\?.*limit=/.test(call))).toEqual([]);
    expect(paths).not.toContain('/stats/overview');
    expect(stub.calls.filter((call) => call.startsWith('/bookings'))).toEqual([]);
  });
});
