// Тесты колонки «Надёжность» и row-action «Пересчитать рейтинг» в DashboardPage.
// Проверяют вычисление на лету через computeAthleteReliability и запрос к admin-маршруту.
// Фаза 35, этап Э0a: колонка санкций за неявки и кнопка их ручного послабления удалены
// вместе с механизмом — здесь остался сторож того, что их больше нет.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '@/components/admin/DashboardPage';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { renderWithToast } from '@/test/helpers/render-with-toast';
import type { AdminUser } from '@/lib/server-api';
import type { Booking } from '@sporthub/types';

// Номера пользователей стенда. Раньше они приезжали константами из стора —
// фронт знал наперёд, кто атлет, провайдер и администратор. Теперь это просто
// данные теста.
const ADMIN_USER_ID = 3;

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const fetchMock = vi.fn();

// ⚠️ Шаг 35.20a. Число лиц услуг приходит ответом маршрута (`serviceFaceCount`),
// а не считается разделом по каталогу: `managedByUserId` из публичной выдачи
// ушёл, и каталог сюда больше не грузится. У атлета лиц нет, у Марины — одно.
const fixtureAthlete: AdminUser = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  status: 'active',
  name: 'Тестовый атлет',
  email: 'athlete@sporthub.local',
  phone: '',
  passwordHash: 'x',
  favoriteClubIds: [],
  serviceFaceCount: 0,
};

const fixtureProvider: AdminUser = {
  id: 2,
  createdAt: '2026-03-17T09:00:00.000Z',
  status: 'active',
  name: 'Марина Крылова',
  email: 'provider@sporthub.local',
  phone: '',
  passwordHash: 'x',
  favoriteClubIds: [],
  serviceFaceCount: 1,
};

function makeBooking(overrides: Partial<Booking>): Booking {
  return {
    id: 1,
    createdAt: '2026-03-10T00:00:00.000Z',
    scheduleId: 1,
    offeringId: 1,
    ownerType: 'club',
    ownerId: 1,
    userId: 1,
    sportId: 1,
    date: '2026-03-15',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1000,
    ...overrides,
  };
}

function renderDashboard(props: { users: AdminUser[]; bookings?: Booking[] }) {
  return renderWithToast(<DashboardPage users={props.users} bookings={props.bookings ?? []} />);
}

describe('DashboardPage — колонка надёжности и её действия', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: ADMIN_USER_ID, name: 'Admin', email: 'admin@sporthub.local' },
      isAuthenticated: true,
      isAdmin: true,
    });

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  it('показывает «Новый» для атлета с < 5 completed', () => {
    const bookings = [makeBooking({ id: 10, status: 'completed', date: '2026-03-15', userId: 1 })];
    renderDashboard({ users: [fixtureAthlete], bookings });

    const card = screen.getByText('Тестовый атлет').closest('article')!;
    expect(within(card).getByText(/новый/i)).toBeInTheDocument();
  });

  // Сторож этапа Э0a: три неявки подряд больше не дают ни плашки, ни отдельной
  // кнопки. Атлет получает ровно одно действие — «Пересчитать рейтинг».
  it('три неявки подряд не приводят к плашке и не подменяют кнопку действия', () => {
    const bookings = [
      makeBooking({ id: 20, status: 'no_show', date: '2026-04-10', userId: 1 }),
      makeBooking({ id: 21, status: 'no_show', date: '2026-04-15', userId: 1 }),
      makeBooking({ id: 22, status: 'no_show', date: '2026-04-19', userId: 1 }),
    ];
    vi.setSystemTime(new Date('2026-04-21T00:00:00.000Z'));

    renderDashboard({ users: [fixtureAthlete], bookings });

    const card = screen.getByText('Тестовый атлет').closest('article')!;
    // Прежняя красная плашка выводила дату окончания запрета — её больше нет.
    expect(within(card).queryByText(/до \d{2}\.\d{2}\.\d{4}/)).toBeNull();
    // А действие у атлета осталось ровно одно и прежнее.
    expect(within(card).getByRole('button', { name: /пересчитать/i })).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('клик «Пересчитать рейтинг» → POST /api/admin/users/1/recompute-reliability', async () => {
    renderDashboard({ users: [fixtureAthlete], bookings: [] });

    const card = screen.getByText('Тестовый атлет').closest('article')!;
    const recomputeBtn = within(card).getByRole('button', { name: /пересчитать/i });
    fireEvent.click(recomputeBtn);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (args) =>
          typeof args[0] === 'string' &&
          args[0].includes('/api/admin/users/1/recompute-reliability'),
      );
      expect(call).toBeDefined();
    });
  });

  it('кнопка «Пересчитать рейтинг» есть и у владельца лиц услуг', () => {
    // ⚠️ Шаг 35.24. Прежде здесь проверялось обратное: у роли `club_owner`
    // кнопки не было. Это и была ошибка модели — владелец зала ходит на йогу
    // как все, его неявки считаются так же, и прятать их от администратора
    // не от чего. Записываться может любой вошедший (решение 5.1).
    renderDashboard({ users: [fixtureProvider], bookings: [] });

    const card = screen.getByText('Марина Крылова').closest('article')!;
    expect(within(card).getByRole('button', { name: /пересчитать/i })).toBeInTheDocument();
  });
});
