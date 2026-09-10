// Тесты ProviderBookingsInbox (Step 25.9): 4 таба FSM, фильтры offering/sport,
// FSM-действия confirm/reject/check-in, критичность <6h до конца окна check-in.
// renderWithToast подмонтирует ToastStack — но мы проверяем только факт fetch-вызова
// и корректность endpoint+payload, не сам toast-рендер.
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToast as render } from '@/test/helpers/render-with-toast';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

import { ProviderBookingsInbox } from '@/components/profile/provider/ProviderBookingsInbox';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { facesOf } from '@/test/helpers/service-faces';
import type { Booking, Club, Offering, Schedule, Sport, Trainer, User } from '@sporthub/types';

// Фиксируем TZ до любых Date-операций, чтобы `new Date('YYYY-MM-DDTHH:mm:ss')` без
// суффикса Z парсил строку предсказуемо (иначе endAt-расчёты сдвигаются на оффсет local TZ).
process.env.TZ = 'UTC';

const NOW = new Date('2026-04-22T12:00:00.000Z');

const providerUser: User = {
  id: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Марина Крылова',
  email: 'marina@studio.local',
  phone: '+7 999 222-33-44',
  passwordHash: 'secret',
  favoriteClubIds: [],
};

const athleteUser: User = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Алексей Смирнов',
  email: 'alexey@sporthub.local',
  phone: '+7 999 111-22-33',
  passwordHash: 'secret',
  favoriteClubIds: [],
};

const club: Club = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Aqua Pro',
  slug: 'aqua-pro',
  description: '',
  sportId: 3,
  sportIds: [3, 4],
  rating: 4.8,
  reviewCount: 0,
  city: 'Самара',
  address: '',
  coordinates: { lat: 53.2, lng: 50.1 },
  tagIds: [],
  amenityIds: [],
  priceFrom: 1000,
  managedByUserId: providerUser.id,
};

const offeringSwim: Offering = {
  id: 101,
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerType: 'club',
  ownerId: club.id,
  sportId: 3,
  title: 'Плавание',
  description: '',
  format: 'group',
  price: 1000,
  durationMinutes: 60,
  capacity: 10,
  address: '',
  coordinates: { lat: 53.2, lng: 50.1 },
};

const offeringBox: Offering = {
  id: 102,
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerType: 'club',
  ownerId: club.id,
  sportId: 4,
  title: 'Бокс',
  description: '',
  format: 'group',
  price: 1000,
  durationMinutes: 60,
  capacity: 10,
  address: '',
  coordinates: { lat: 53.2, lng: 50.1 },
};

const sports: Sport[] = [
  { id: 3, createdAt: '', name: 'Плавание', slug: 'swim' },
  { id: 4, createdAt: '', name: 'Бокс', slug: 'box' },
];

function makeSchedule(overrides: Partial<Schedule> & Pick<Schedule, 'id'>): Schedule {
  return {
    createdAt: '2026-04-20T09:00:00.000Z',
    clubId: club.id,
    sportId: 3,
    title: 'Занятие',
    date: '2026-04-25',
    startTime: '10:00',
    endTime: '11:00',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 10,
    bookedCount: 0,
    price: 1000,
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking> & Pick<Booking, 'id' | 'status'>): Booking {
  return {
    createdAt: '2026-04-20T09:00:00.000Z',
    scheduleId: 1001,
    offeringId: offeringSwim.id,
    ownerType: 'club',
    ownerId: club.id,
    userId: athleteUser.id,
    clubId: club.id,
    sportId: 3,
    date: '2026-04-25',
    paymentStatus: 'paid',
    totalPrice: 1000,
    ...overrides,
  };
}

const trainers: Trainer[] = [];

function authenticateProvider() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: providerUser,
    accountKind: 'person',
    isAuthenticated: true,
    // ⚠️ Шаг 35.20a. Лица приезжают ответом «кто я», не из каталога.
    faces: facesOf({ userId: providerUser.id, clubs: [club], trainers }),
  });
}

const fetchMock = vi.fn();

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ProviderBookingsInbox (Step 25.9)', () => {
  beforeEach(() => {
    // Мокаем только Date, не setTimeout/Promise-микротаски — иначе waitFor вокруг
    // fetchMock'а будет висеть, не дождавшись resolution async-action'а.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('рендерит 4 таба FSM с лейблами', () => {
    authenticateProvider();
    render(<ProviderBookingsInbox clubs={[club]} trainers={trainers} />);

    expect(screen.getByTestId('provider-bookings-tab-pending')).toBeInTheDocument();
    expect(screen.getByTestId('provider-bookings-tab-confirmed')).toBeInTheDocument();
    expect(screen.getByTestId('provider-bookings-tab-check-in')).toBeInTheDocument();
    expect(screen.getByTestId('provider-bookings-tab-history')).toBeInTheDocument();
  });

  it('фильтр по offering: выбор Бокса в pending-табе скрывает карточку для Плавания', () => {
    authenticateProvider();

    const bookingSwim = makeBooking({ id: 501, status: 'pending', offeringId: offeringSwim.id });
    const bookingBox = makeBooking({
      id: 502,
      status: 'pending',
      offeringId: offeringBox.id,
      sportId: 4,
      scheduleId: 1002,
    });

    render(
      <ProviderBookingsInbox
        clubs={[club]}
        trainers={trainers}
        bookings={[bookingSwim, bookingBox]}
        offerings={[offeringSwim, offeringBox]}
        schedule={[makeSchedule({ id: 1001 }), makeSchedule({ id: 1002, sportId: 4 })]}
        sports={sports}
        users={[athleteUser, providerUser]}
      />,
    );

    // Изначально — обе карточки видны в pending-табе.
    expect(screen.getByTestId('provider-bookings-card-501')).toBeInTheDocument();
    expect(screen.getByTestId('provider-bookings-card-502')).toBeInTheDocument();

    const select = screen.getByTestId('provider-bookings-filter-offering') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: String(offeringBox.id) } });

    expect(screen.queryByTestId('provider-bookings-card-501')).not.toBeInTheDocument();
    expect(screen.getByTestId('provider-bookings-card-502')).toBeInTheDocument();
  });

  it('фильтр по виду спорта: выбор sportId=4 оставляет только бокс', () => {
    authenticateProvider();

    const bookingSwim = makeBooking({ id: 501, status: 'pending' });
    const bookingBox = makeBooking({
      id: 502,
      status: 'pending',
      offeringId: offeringBox.id,
      sportId: 4,
      scheduleId: 1002,
    });

    render(
      <ProviderBookingsInbox
        clubs={[club]}
        trainers={trainers}
        bookings={[bookingSwim, bookingBox]}
        offerings={[offeringSwim, offeringBox]}
        schedule={[makeSchedule({ id: 1001 }), makeSchedule({ id: 1002, sportId: 4 })]}
        sports={sports}
        users={[athleteUser, providerUser]}
      />,
    );

    const select = screen.getByTestId('provider-bookings-filter-sport') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '4' } });

    expect(screen.queryByTestId('provider-bookings-card-501')).not.toBeInTheDocument();
    expect(screen.getByTestId('provider-bookings-card-502')).toBeInTheDocument();
  });

  it('confirm: клик «Подтвердить» шлёт POST /api/bookings/[id]/confirm без личности', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(createJsonResponse({ success: true, data: { id: 501 } }));

    const booking = makeBooking({ id: 501, status: 'pending' });

    render(
      <ProviderBookingsInbox
        clubs={[club]}
        trainers={trainers}
        bookings={[booking]}
        offerings={[offeringSwim]}
        schedule={[makeSchedule({ id: 1001 })]}
        sports={sports}
        users={[athleteUser, providerUser]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-bookings-action-confirm-501'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/bookings/501/confirm');
    // ⚠️ Тело пустое: кто подтверждает — сервер знает из сессии. Прежнее поле
    // `userId` позволяло решить судьбу ЧУЖОЙ записи подменой одного числа.
    expect(JSON.parse(call[1].body as string)).toEqual({});
  });

  it('reject: клик «Отклонить» открывает модалку причины (Step 27.13)', () => {
    authenticateProvider();
    const booking = makeBooking({ id: 501, status: 'pending' });

    render(
      <ProviderBookingsInbox
        clubs={[club]}
        trainers={trainers}
        bookings={[booking]}
        offerings={[offeringSwim]}
        schedule={[makeSchedule({ id: 1001 })]}
        sports={sports}
        users={[athleteUser, providerUser]}
      />,
    );

    // До клика — модалки нет, fetch не вызывался.
    expect(screen.queryByTestId('provider-reject-reason-modal')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('provider-bookings-action-reject-501'));

    // После клика — модалка появилась, fetch ещё не пошёл (ждём submit).
    expect(screen.getByTestId('provider-reject-reason-modal')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reject: submit с причиной шлёт POST /reject с body.reason (Step 27.13)', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(createJsonResponse({ success: true, data: { id: 501 } }));

    const booking = makeBooking({ id: 501, status: 'pending' });

    render(
      <ProviderBookingsInbox
        clubs={[club]}
        trainers={trainers}
        bookings={[booking]}
        offerings={[offeringSwim]}
        schedule={[makeSchedule({ id: 1001 })]}
        sports={sports}
        users={[athleteUser, providerUser]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-bookings-action-reject-501'));

    const textarea = screen.getByTestId('provider-reject-reason-textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Время не подходит' } });
    fireEvent.click(screen.getByTestId('provider-reject-reason-submit'));

    await waitFor(() => {
      expect(fetchMock.mock.calls[0][0]).toBe('/api/bookings/501/reject');
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({ reason: 'Время не подходит' });
  });

  it('reject: submit без причины шлёт POST /reject без поля reason (Step 27.13)', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(createJsonResponse({ success: true, data: { id: 501 } }));

    const booking = makeBooking({ id: 501, status: 'pending' });

    render(
      <ProviderBookingsInbox
        clubs={[club]}
        trainers={trainers}
        bookings={[booking]}
        offerings={[offeringSwim]}
        schedule={[makeSchedule({ id: 1001 })]}
        sports={sports}
        users={[athleteUser, providerUser]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-bookings-action-reject-501'));
    // Submit сразу, без ввода причины — пустая trim'ится в null.
    fireEvent.click(screen.getByTestId('provider-reject-reason-submit'));

    await waitFor(() => {
      expect(fetchMock.mock.calls[0][0]).toBe('/api/bookings/501/reject');
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toEqual({});
    expect(body.reason).toBeUndefined();
  });

  it('reject: «Отмена» в модалке закрывает её без вызова fetch (Step 27.13)', () => {
    authenticateProvider();
    const booking = makeBooking({ id: 501, status: 'pending' });

    render(
      <ProviderBookingsInbox
        clubs={[club]}
        trainers={trainers}
        bookings={[booking]}
        offerings={[offeringSwim]}
        schedule={[makeSchedule({ id: 1001 })]}
        sports={sports}
        users={[athleteUser, providerUser]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-bookings-action-reject-501'));
    expect(screen.getByTestId('provider-reject-reason-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('provider-reject-reason-cancel'));
    expect(screen.queryByTestId('provider-reject-reason-modal')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('check-in completed: клик «Пришёл» шлёт POST с outcome=completed', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(createJsonResponse({ success: true, data: { id: 601 } }));

    // slot endAt = 2026-04-21T10:00 → + 48h = 2026-04-23T10:00. NOW=2026-04-22T12:00 → в окне, msLeft ≈ 22h.
    const slot = makeSchedule({
      id: 2001,
      date: '2026-04-21',
      startTime: '09:00',
      endTime: '10:00',
    });
    const booking = makeBooking({
      id: 601,
      status: 'confirmed',
      scheduleId: 2001,
      date: '2026-04-21',
    });

    render(
      <ProviderBookingsInbox
        clubs={[club]}
        trainers={trainers}
        bookings={[booking]}
        offerings={[offeringSwim]}
        schedule={[slot]}
        sports={sports}
        users={[athleteUser, providerUser]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-bookings-tab-check-in'));

    fireEvent.click(screen.getByTestId('provider-bookings-action-checkin-completed-601'));

    await waitFor(() => {
      expect(fetchMock.mock.calls[0][0]).toBe('/api/bookings/601/check-in');
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      outcome: 'completed',
    });
  });

  it('check-in no_show: клик «Не пришёл» шлёт POST с outcome=no_show', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(createJsonResponse({ success: true, data: { id: 601 } }));

    const slot = makeSchedule({
      id: 2001,
      date: '2026-04-21',
      startTime: '09:00',
      endTime: '10:00',
    });
    const booking = makeBooking({
      id: 601,
      status: 'confirmed',
      scheduleId: 2001,
      date: '2026-04-21',
    });

    render(
      <ProviderBookingsInbox
        clubs={[club]}
        trainers={trainers}
        bookings={[booking]}
        offerings={[offeringSwim]}
        schedule={[slot]}
        sports={sports}
        users={[athleteUser, providerUser]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-bookings-tab-check-in'));
    fireEvent.click(screen.getByTestId('provider-bookings-action-checkin-noshow-601'));

    await waitFor(() => {
      expect(fetchMock.mock.calls[0][1].body).toBeDefined();
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      outcome: 'no_show',
    });
  });

  // Phase 27 Step 27.4: карточки в табе «История» показывают конкретный FSM-label,
  // а не общий «Финальный статус». Проверяем на 3 статусах с разным tone.
  it('history: бейдж карточки отражает конкретный статус FSM', () => {
    authenticateProvider();

    const slot = makeSchedule({ id: 3001, date: '2026-04-20' });
    const cancelledByProv = makeBooking({
      id: 901,
      status: 'cancelled_by_provider',
      scheduleId: 3001,
      date: '2026-04-20',
    });
    const completed = makeBooking({
      id: 902,
      status: 'completed',
      scheduleId: 3001,
      date: '2026-04-20',
    });
    const noShow = makeBooking({
      id: 903,
      status: 'no_show',
      scheduleId: 3001,
      date: '2026-04-20',
    });

    render(
      <ProviderBookingsInbox
        clubs={[club]}
        trainers={trainers}
        bookings={[cancelledByProv, completed, noShow]}
        offerings={[offeringSwim]}
        schedule={[slot]}
        sports={sports}
        users={[athleteUser, providerUser]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-bookings-tab-history'));

    expect(screen.getByTestId('provider-bookings-history-status-901')).toHaveTextContent(
      /Вы отменили/i,
    );
    expect(screen.getByTestId('provider-bookings-history-status-902')).toHaveTextContent(
      /Проведено/i,
    );
    expect(screen.getByTestId('provider-bookings-history-status-903')).toHaveTextContent(
      /Не явился/i,
    );
    // Общего «Финальный статус» в табе больше нет.
    expect(screen.queryByText('Финальный статус')).not.toBeInTheDocument();
  });

  it('критичность <6h: карточка с endAt+48h - now ≈ 4h имеет data-approaching=true и красный border', () => {
    authenticateProvider();

    // NOW = 2026-04-22T12:00Z. Занятие кончается в 20:00 по часам зала (Самара, UTC+4),
    // то есть в 2026-04-20T16:00Z. Окно отметки исхода закрывается через 48 часов —
    // в 2026-04-22T16:00Z, значит до конца окна 4 часа < 6 → карточка критична.
    //
    // Момент записан в UTC намеренно: если бы конец занятия считался в поясе процесса
    // (тест идёт под TZ=UTC), окно закрывалось бы в 2026-04-22T20:00Z, до конца было бы
    // 8 часов и подсветки не было бы вовсе. Раньше тест это и проверял — по неверной
    // формуле, совпадающей с кодом.
    const slot = makeSchedule({
      id: 2001,
      date: '2026-04-20',
      startTime: '19:00',
      endTime: '20:00',
    });
    const booking = makeBooking({
      id: 701,
      status: 'confirmed',
      scheduleId: 2001,
      date: '2026-04-20',
    });

    render(
      <ProviderBookingsInbox
        clubs={[club]}
        trainers={trainers}
        bookings={[booking]}
        offerings={[offeringSwim]}
        schedule={[slot]}
        sports={sports}
        users={[athleteUser, providerUser]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-bookings-tab-check-in'));

    const card = screen.getByTestId('provider-bookings-card-701');
    expect(card).toHaveAttribute('data-approaching', 'true');
    expect(card.className).toContain('border-danger');
  });
});
