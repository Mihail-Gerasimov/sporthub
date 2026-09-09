// Тесты страницы записи на занятие: превью слота и интеграция блока действий.
//
// Контекст слота приходит с заготовленного стенда ответов — так же, как его отдаёт
// бэкенд одним запросом. Собирать его на месте из коллекций больше не нужно: это
// была работа бэкенда, повторённая в тестовой подмене.
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  // Сторож этапа Э0a: единственным поводом поднимать историю записей были санкции
  // за неявки. Механизма нет — значит, страница не должна спрашивать записи вообще
  // и никому: ни гостю, ни вошедшему.
  it('истории записей не спрашивает вовсе — считать по ней больше нечего', async () => {
    await BookingPage({ params: Promise.resolve({ scheduleId: '1' }) });

    expect(stub.calls.filter((call) => call.startsWith('/bookings'))).toEqual([]);
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
