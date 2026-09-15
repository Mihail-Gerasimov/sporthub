// Сторож: лидеры каталога на главной берутся ЗАПРОСОМ, а не сортировкой в памяти
// (фаза 38, шаг 38.31).
//
// До этого шага главная поднимала весь каталог и находила «лучший клуб» и «лучшего
// тренера» сортировкой массива на месте (`[...clubs].sort(...)[0]`) — ради одной
// карточки в полосе лидеров страница платила за всю таблицу. Теперь лидер —
// `sort=rating&limit=1`: порядок и срез делает база (см. `clubs.controller.test.ts`,
// стенд витрины).
//
// Две половины, и обе нужны. Подключение: страница действительно спрашивает
// у бэкенда именно этот адрес — тест рендера этого не видит. Текст: в исходнике
// страницы не осталось `.sort(` — иначе лидер спрошен запросом, а показан
// из памяти (диверсия д-19: вернуть `[...clubs].sort(...)[0]`).

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '@/app/page';
import { useFilterStore } from '@/stores/useFilterStore';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';
import { WEB_ROOT } from '@/test/web-root';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  notFound: () => {
    throw new Error('Not found');
  },
}));

const PAGE = path.join(WEB_ROOT, 'src', 'app', 'page.tsx');

describe('лидеры главной — запросом', () => {
  let stub: ApiStub;

  beforeEach(() => {
    stub = installApiStub(createFixtureRoutes());
    useFilterStore.setState({ discoveryMode: 'clubs', searchQuery: '', selectedSportId: null });
  });

  afterEach(() => {
    stub?.restore();
  });

  it('страница спрашивает лидера клубов и лидера тренеров адресом sort=rating&limit=1', async () => {
    await Home();

    // Сравнение с ТОЧНЫМ адресом, а не «есть ли limit»: `limit=undefined` строкой
    // прошёл бы проверку «параметр присутствует» (д-22).
    expect(stub.calls).toContain('/clubs?sort=rating&limit=1');
    expect(stub.calls).toContain('/trainers?sort=rating&limit=1');
  });

  it('рабочий каталог по-прежнему спрашивается целиком — лидер его не подменяет', async () => {
    // Поиск, карта и слоты фильтруют в памяти по построению (Д-15) и читают
    // полный список: адрес без параметров обязан остаться.
    await Home();

    expect(stub.calls).toContain('/clubs');
    expect(stub.calls).toContain('/trainers');
  });

  it('в исходнике страницы нет сортировки в памяти', async () => {
    const source = (await readFile(PAGE, 'utf8'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');

    expect(source, 'лидер снова ищется сортировкой массива').not.toMatch(/\.sort\(/);
  });
});
