// Сквозные интеграционные тесты booking-flow: booking page -> API -> JSON -> athlete/provider cabinets.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
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

import { DELETE as deleteBookingRoute } from '@/app/api/bookings/[id]/route';
import { GET as getBookingsRoute, POST as createBookingRoute } from '@/app/api/bookings/route';
import BookingPage from '@/app/booking/[scheduleId]/page';
import AthleteProfileRoute from '@/app/profile/athlete/page';
import ProviderProfileRoute from '@/app/profile/provider/page';
import { getDateKeyInTimeZone } from '@/lib/utils';
import {
  AUTH_STORAGE_KEY,
  AUTH_STORE_DEFAULT_STATE,
  MVP_ATHLETE_USER_ID,
  MVP_PROVIDER_USER_ID,
  useAuthStore,
} from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { publishCatalogPair } from '@/test/helpers/publish-flow';
import type { Booking, Schedule } from '@/types';

function getFutureTargetDate(daysAhead = 5) {
  return getDateKeyInTimeZone(new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000));
}

describe('booking-flow integration (Step 16.9)', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isAuthModalOpen: false });
    refreshMock.mockReset();
    vi.stubGlobal('fetch', routeBackedFetch);
  });

  afterEach(async () => {
    cleanup();
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isAuthModalOpen: false });
    await removeIsolatedDataDirectory(dataDirectory);
  });

  /** Проксирует client fetch в реальные route handlers, чтобы тест шел по живому API поверх isolated JSON. */
  async function routeBackedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const requestUrl = new URL(rawUrl, 'http://localhost:3000');
    const method = (init?.method ?? 'GET').toUpperCase();

    if (requestUrl.pathname === '/api/bookings' && method === 'GET') {
      return getBookingsRoute(new NextRequest(requestUrl.toString()));
    }

    if (requestUrl.pathname === '/api/bookings' && method === 'POST') {
      return createBookingRoute(new Request(requestUrl.toString(), init));
    }

    const bookingIdMatch = requestUrl.pathname.match(/^\/api\/bookings\/(\d+)$/);

    if (bookingIdMatch && method === 'DELETE') {
      return deleteBookingRoute(new Request(requestUrl.toString(), init), {
        params: Promise.resolve({ id: bookingIdMatch[1] }),
      });
    }

    throw new Error(`Неожиданный fetch в интеграционном тесте: ${method} ${requestUrl.pathname}`);
  }

  function loginAsAthlete() {
    useAuthStore.getState().login({
      accountType: 'athlete',
      user: {
        id: MVP_ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
        phone: '+7 (927) 000-10-10',
      },
    });
  }

  function loginAsProvider() {
    useAuthStore.getState().login({
      accountType: 'provider',
      user: {
        id: MVP_PROVIDER_USER_ID,
        name: 'Марина Крылова',
        email: 'marina@studio.local',
        phone: '+7 (927) 000-20-20',
      },
    });
  }

  async function readBookingsFromJson(): Promise<Booking[]> {
    const raw = await readFile(path.join(dataDirectory, 'bookings.json'), 'utf8');

    return JSON.parse(raw) as Booking[];
  }

  async function readScheduleFromJson(): Promise<Schedule[]> {
    const raw = await readFile(path.join(dataDirectory, 'schedule.json'), 'utf8');

    return JSON.parse(raw) as Schedule[];
  }

  async function createBookingThroughApi(scheduleId: number, userId = MVP_ATHLETE_USER_ID) {
    return createBookingRoute(
      new Request('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduleId,
          userId,
        }),
      }),
    );
  }

  async function renderBookingPage(scheduleId: number) {
    return render(
      await BookingPage({
        params: Promise.resolve({ scheduleId: String(scheduleId) }),
      }),
    );
  }

  it('проходит trainer lifecycle: booking page -> athlete cabinet -> provider cabinet -> hard cancel -> rollback в обеих сторонах', async () => {
    const targetDate = getFutureTargetDate();
    const { trainerResult } = await publishCatalogPair({
      clearExisting: true,
      dataDirectory,
      targetDate,
    });
    const trainerSlotId = trainerResult.schedules[0].id;

    loginAsAthlete();

    await renderBookingPage(trainerSlotId);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Подтвердить запись' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await waitFor(() => {
      expect(screen.getByText('Запись подтверждена. Слот закреплён за вами.')).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: 'Перейти в ЛК' })).toHaveAttribute(
      'href',
      '/profile/athlete',
    );
    expect(refreshMock).toHaveBeenCalledTimes(1);

    const createdTrainerBookings = await readBookingsFromJson();

    expect(createdTrainerBookings).toHaveLength(1);
    expect(createdTrainerBookings[0]).toMatchObject({
      ownerType: 'trainer',
      scheduleId: trainerSlotId,
      userId: MVP_ATHLETE_USER_ID,
    });
    expect(
      (await readScheduleFromJson()).find((slot) => slot.id === trainerSlotId)?.bookedCount,
    ).toBe(1);

    cleanup();
    loginAsAthlete();
    render(await AthleteProfileRoute());

    expect(screen.getByTestId('athlete-summary-upcoming')).toHaveTextContent('1');
    expect(
      within(screen.getByTestId('athlete-upcoming-section')).getByText('Персональная дорожка'),
    ).toBeInTheDocument();
    expect(screen.getByText('Первая запись на тренировку')).toBeInTheDocument();

    cleanup();
    loginAsProvider();
    render(await ProviderProfileRoute());

    expect(screen.getByTestId('provider-summary-bookings')).toHaveTextContent('1');
    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.getByText('alexey@sporthub.local')).toBeInTheDocument();
    expect(screen.getByText('Персональная дорожка')).toBeInTheDocument();
    expect(screen.getByText('Ilya Volkov · Start Swim Lab')).toBeInTheDocument();

    cleanup();
    loginAsAthlete();
    render(await AthleteProfileRoute());

    fireEvent.click(screen.getByRole('button', { name: 'Отменить запись' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Запись отменена. Блок ближайших занятий обновлён.',
      );
    });

    expect(refreshMock).toHaveBeenCalledTimes(2);

    cleanup();
    loginAsAthlete();
    render(await AthleteProfileRoute());

    expect(screen.getByTestId('athlete-summary-upcoming')).toHaveTextContent('0');
    expect(
      screen.getByText(
        'Пока нет будущих записей. Новые бронирования появятся здесь после записи на занятия.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText('Первая запись на тренировку')).not.toBeInTheDocument();

    cleanup();
    loginAsProvider();
    render(await ProviderProfileRoute());

    expect(screen.getByTestId('provider-summary-bookings')).toHaveTextContent('0');
    expect(screen.getByText('Нет входящих записей')).toBeInTheDocument();
    expect(await readBookingsFromJson()).toEqual([]);
    expect(
      (await readScheduleFromJson()).find((slot) => slot.id === trainerSlotId)?.bookedCount,
    ).toBe(0);
  });

  it('проходит club lifecycle: create/cancel работают сквозно для клубного слота и отражаются в двух кабинетах', async () => {
    const targetDate = getFutureTargetDate();
    const { clubResult } = await publishCatalogPair({
      clearExisting: true,
      dataDirectory,
      targetDate,
    });
    const clubSlotId = clubResult.schedules[0].id;

    loginAsAthlete();

    await renderBookingPage(clubSlotId);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Подтвердить запись' })).toBeEnabled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить запись' }));

    await waitFor(() => {
      expect(screen.getByText('Запись подтверждена. Слот закреплён за вами.')).toBeInTheDocument();
    });

    expect((await readBookingsFromJson())[0]).toMatchObject({
      ownerType: 'club',
      scheduleId: clubSlotId,
      userId: MVP_ATHLETE_USER_ID,
    });

    cleanup();
    loginAsAthlete();
    render(await AthleteProfileRoute());

    expect(screen.getByTestId('athlete-summary-upcoming')).toHaveTextContent('1');
    expect(
      within(screen.getByTestId('athlete-upcoming-section')).getByText(
        'Стартовая группа по плаванию',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('athlete-upcoming-section')).getByText(
        'Start Swim Lab · Бассейн A',
      ),
    ).toBeInTheDocument();

    cleanup();
    loginAsProvider();
    render(await ProviderProfileRoute());

    expect(screen.getByTestId('provider-summary-bookings')).toHaveTextContent('1');
    expect(screen.getByText('Стартовая группа по плаванию')).toBeInTheDocument();
    expect(screen.getByText('Start Swim Lab · Бассейн A')).toBeInTheDocument();
    expect(screen.getByText('Услуга клуба')).toBeInTheDocument();

    cleanup();
    loginAsAthlete();
    render(await AthleteProfileRoute());

    fireEvent.click(screen.getByRole('button', { name: 'Отменить запись' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(
        'Запись отменена. Блок ближайших занятий обновлён.',
      );
    });

    cleanup();
    loginAsProvider();
    render(await ProviderProfileRoute());

    expect(screen.getByTestId('provider-summary-bookings')).toHaveTextContent('0');
    expect(screen.getByText('Нет входящих записей')).toBeInTheDocument();
    expect(await readBookingsFromJson()).toEqual([]);
    expect((await readScheduleFromJson()).find((slot) => slot.id === clubSlotId)?.bookedCount).toBe(
      0,
    );
  });

  it('для guest на booking page не создаёт запись и открывает auth flow через CTA', async () => {
    const targetDate = getFutureTargetDate();
    const { trainerResult } = await publishCatalogPair({
      clearExisting: true,
      dataDirectory,
      targetDate,
    });

    await renderBookingPage(trainerResult.schedules[0].id);

    expect(screen.getByText('Чтобы записаться, войдите как спортсмен')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Войти / Зарегистрироваться' }));

    expect(useUIStore.getState().isAuthModalOpen).toBe(true);
    expect(await readBookingsFromJson()).toEqual([]);
  });

  it('для provider-session на booking page блокирует booking и предлагает переключить аккаунт', async () => {
    const targetDate = getFutureTargetDate();
    const { trainerResult } = await publishCatalogPair({
      clearExisting: true,
      dataDirectory,
      targetDate,
    });

    loginAsProvider();
    await renderBookingPage(trainerResult.schedules[0].id);

    expect(
      screen.getByText('Текущий аккаунт не может записываться на занятия'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Сменить аккаунт' }));

    expect(useUIStore.getState().isAuthModalOpen).toBe(true);
    expect(await readBookingsFromJson()).toEqual([]);
  });

  it('показывает duplicate guard на booking page после уже созданной записи на тот же slot', async () => {
    const targetDate = getFutureTargetDate();
    const { trainerResult } = await publishCatalogPair({
      clearExisting: true,
      dataDirectory,
      targetDate,
    });
    const trainerSlotId = trainerResult.schedules[0].id;

    await createBookingThroughApi(trainerSlotId);
    loginAsAthlete();

    await renderBookingPage(trainerSlotId);

    await waitFor(() => {
      expect(screen.getByText('Вы уже записаны на этот слот')).toBeInTheDocument();
    });

    expect(screen.getByRole('link', { name: 'Перейти в ЛК' })).toHaveAttribute(
      'href',
      '/profile/athlete',
    );
    expect(screen.queryByRole('button', { name: 'Подтвердить запись' })).not.toBeInTheDocument();
    expect(await readBookingsFromJson()).toHaveLength(1);
  });

  it('показывает full-slot guard на booking page и не создаёт новую запись', async () => {
    const targetDate = getFutureTargetDate();
    const { clubResult } = await publishCatalogPair({
      clearExisting: true,
      dataDirectory,
      targetDate,
    });
    const clubSlotId = clubResult.schedules[0].id;
    const schedulePath = path.join(dataDirectory, 'schedule.json');
    const schedule = await readScheduleFromJson();
    const fullSchedule = schedule.map((slot) =>
      slot.id === clubSlotId ? { ...slot, bookedCount: slot.capacity } : slot,
    );

    await writeFile(schedulePath, `${JSON.stringify(fullSchedule, null, 2)}\n`, 'utf8');

    loginAsAthlete();
    await renderBookingPage(clubSlotId);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Мест нет' })).toBeDisabled();
    });

    expect(screen.getByText('Свободные места закончились')).toBeInTheDocument();
    expect(await readBookingsFromJson()).toEqual([]);
  });

  it('не удаляет booking чужим userId и сохраняет запись в JSON', async () => {
    const targetDate = getFutureTargetDate();
    const { clubResult } = await publishCatalogPair({
      clearExisting: true,
      dataDirectory,
      targetDate,
    });
    const clubSlotId = clubResult.schedules[0].id;
    const createResponse = await createBookingThroughApi(clubSlotId);
    const createdBody = await createResponse.json();
    const bookingId = createdBody.data.id as number;

    const deleteResponse = await deleteBookingRoute(
      new Request(`http://localhost:3000/api/bookings/${bookingId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: MVP_PROVIDER_USER_ID,
        }),
      }),
      {
        params: Promise.resolve({ id: String(bookingId) }),
      },
    );
    const deleteBody = await deleteResponse.json();

    expect(deleteResponse.status).toBe(403);
    expect(deleteBody).toEqual({
      success: false,
      error: 'Недостаточно прав для отмены записи',
    });
    expect(await readBookingsFromJson()).toHaveLength(1);
    expect((await readBookingsFromJson())[0]?.id).toBe(bookingId);
  });
});
