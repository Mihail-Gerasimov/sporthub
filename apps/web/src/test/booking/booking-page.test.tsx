// Тесты страницы записи на занятие: превью слота и интеграция блока действий.
//
// Контекст слота приходит с заготовленного стенда ответов — так же, как его отдаёт
// бэкенд одним запросом. Собирать его на месте из коллекций больше не нужно: это
// была работа бэкенда, повторённая в тестовой подмене.
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Кто смотрит страницу. `null` — гость, и это состояние по умолчанию.
 *
 * ⚠️ Ради этой пары набор и знает про сессию. Расчёт карантина нужен только
 * вошедшему атлету, а записи для него страница спрашивала ДО того, как узнавала,
 * кто смотрит, — то есть просила полный срез площадки. Гостю такой запрос отвечает
 * отказом, и страница записи падала пятисотой на пустом месте.
 */
let viewer: { id: number; role: string; name: string; email: string } | null = null;

vi.mock('@/lib/session', () => ({
  readSession: async () => viewer,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  notFound: () => {
    const error = new Error('Not found') as Error & { digest?: string };

    error.digest = 'NEXT_HTTP_ERROR_FALLBACK;404';
    throw error;
  },
}));

import BookingPage from '@/app/booking/[scheduleId]/page';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';
import {
  fixtureClub,
  fixtureClubOffering,
  fixtureClubSlot1,
  fixtureTrainer,
  fixtureTrainerOffering,
  fixtureTrainerSlot,
} from '@sporthub/fixtures';

/** Клубное занятие: владелец — клуб, тренер ведёт. */
const clubSlotContext = {
  affiliatedClub: fixtureClub,
  club: fixtureClub,
  offering: fixtureClubOffering,
  schedule: fixtureClubSlot1,
  trainer: fixtureTrainer,
};

/** Тренерское занятие в зале клуба: владелец — тренер, клуб указан площадкой. */
const trainerSlotContext = {
  affiliatedClub: fixtureClub,
  club: null,
  offering: fixtureTrainerOffering,
  schedule: fixtureTrainerSlot,
  trainer: fixtureTrainer,
};

describe('Booking page', () => {
  let stub: ApiStub;

  beforeEach(() => {
    stub = installApiStub({
      ...createFixtureRoutes(),
      '/schedule/1/context': clubSlotContext,
      '/schedule/1001/context': trainerSlotContext,
      // Пустое тело — код 404: слота нет, страница обязана отдать «не найдено».
      '/schedule/999999/context': null,
    });
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isAuthModalOpen: false });
  });

  afterEach(() => {
    stub?.restore();
    viewer = null;
  });

  it('рендерит booking details для club slot без stub-копирайта', async () => {
    render(await BookingPage({ params: Promise.resolve({ scheduleId: '1' }) }));

    expect(screen.getByRole('heading', { name: 'Запись на занятие' })).toBeInTheDocument();
    expect(screen.getAllByText('Услуга клуба').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Volna Aquatic Club').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Утреннее плавание').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Подтверждение записи' })).toBeInTheDocument();
    expect(screen.queryByText(/MVP booking stub/i)).not.toBeInTheDocument();
  });

  it('рендерит booking details для trainer slot с независимым owner и площадкой', async () => {
    render(await BookingPage({ params: Promise.resolve({ scheduleId: '1001' }) }));

    expect(screen.getAllByText('Услуга тренера').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Марина Соколова').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Персональная тренировка: Плавание').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Volna Aquatic Club').length).toBeGreaterThan(0);
    expect(screen.getByText('ул. Лесная, 23к1')).toBeInTheDocument();
  });

  it('гостю записи не спрашивает вовсе — считать карантин ему нечего', async () => {
    await BookingPage({ params: Promise.resolve({ scheduleId: '1' }) });

    expect(stub.calls.filter((call) => call.startsWith('/bookings'))).toEqual([]);
  });

  it('вошедшему атлету спрашивает ЕГО записи, теми статусами и тем периодом, что читает карантин', async () => {
    viewer = { id: 1, role: 'athlete', name: 'Алексей', email: 'a@test.local' };

    await BookingPage({ params: Promise.resolve({ scheduleId: '1' }) });

    const call = stub.callTo('/bookings');
    expect(call).toBeDefined();
    // Свой срез, а не площадки: без номера атлета запрос означает полный срез.
    expect(call).toContain('userId=1');
    // Карантин смотрит на завершённые занятия и неявки за последние тридцать дней;
    // остальные пять статусов и вся история до окна странице не нужны.
    expect(call).toContain('status=completed%2Cno_show');
    expect(call).toMatch(/dateFrom=\d{4}-\d{2}-\d{2}/);
  });

  it('отдаёт notFound для несуществующего slot id', async () => {
    await expect(
      BookingPage({
        params: Promise.resolve({ scheduleId: '999999' }),
      }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });
});
