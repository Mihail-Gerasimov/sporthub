// ⚠️ Фаза 35, шаг 35.34. Проверка «чужому — плашка «Доступ ограничен»» снята
// не потому, что стала не нужна, а потому, что она никогда не была защитой:
// плашка рисовалась ПОВЕРХ уже отданных данных. Настоящая проверка стоит
// в серверном лейауте, ДО похода за данными, и проверяется она набором
// `src/test/security/protected-layouts.test.ts` — там же, где проверяется
// и то, что уведённому данные не запрашивались вообще.
// Тесты ProviderClients (Step 25.10-B): агрегация уникальных клиентов из bookings
// провайдера, per-offering фильтр, drawer с историей записей и CRM-заметкой
// (POST создаёт, DELETE удаляет).
//
// ⚠️ Фаза 38, шаг 38.25: случай про фильтр «danger» снят — предмета нет (реестр
// `phase-38-reliability-cut.md`, Т15). Его место занял обратный: фильтра по надёжности
// в разделе нет, а клиент с двадцатью неявками виден наравне с остальными.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { renderInFaceCabinet, trainerFace } from '@/test/helpers/cabinet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { ProviderClients } from '@/components/profile/provider/ProviderClients';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { facesOf } from '@/test/helpers/service-faces';
import type {
  Booking,
  Club,
  Offering,
  ProviderClientNote,
  Schedule,
  Trainer,
  User,
} from '@sporthub/types';

process.env.TZ = 'UTC';

const providerUser: User = {
  id: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Ирина Провайдер',
  email: 'provider@studio.local',
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

const athleteUser2: User = {
  id: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Ольга Петрова',
  email: 'olga@sporthub.local',
  phone: '+7 999 000-00-00',
  passwordHash: 'secret',
  favoriteClubIds: [],
};

const club: Club = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Aqua Pro',
  slug: 'aqua-pro',
  description: '',
  shortDescription: '',
  sportIds: [3],
  rating: 4.8,
  reviewCount: 0,
  city: 'Самара',
  address: '',
  phone: '',
  coordinates: { lat: 53.2, lng: 50.1 },
  imageUrls: [],
  tagIds: [],
  amenityIds: [],
  priceFrom: 1000,
  distanceKm: 0,
  managedByUserId: providerUser.id,
};

const trainer: Trainer = {
  id: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Пётр Тренер',
  slug: 'pyotr',
  bio: '',
  avatarUrl: '',
  experienceYears: 5,
  specialtyIds: [],
  workFormatIds: [],
  rating: 5,
  reviewCount: 0,
  priceFrom: 1500,
  sportIds: [1, 4],
  managedByUserId: providerUser.id,
};

const offeringYoga: Offering = {
  id: 201,
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerType: 'trainer',
  ownerId: trainer.id,
  sportId: 1,
  title: 'Йога',
  description: '',
  format: 'group',
  price: 1500,
  durationMinutes: 60,
  capacity: 10,
  address: '',
  coordinates: { lat: 0, lng: 0 },
};

const offeringBox: Offering = {
  id: 202,
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerType: 'trainer',
  ownerId: trainer.id,
  sportId: 4,
  title: 'Бокс',
  description: '',
  format: 'group',
  price: 1500,
  durationMinutes: 60,
  capacity: 10,
  address: '',
  coordinates: { lat: 0, lng: 0 },
};

const clubOffering: Offering = {
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
  coordinates: { lat: 0, lng: 0 },
};

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
    offeringId: clubOffering.id,
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

function authenticateProvider() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: providerUser,
    accountKind: 'person',
    isAuthenticated: true,
    // ⚠️ Шаг 35.20a. Кабинет отбирает своё по ЛИЦАМ услуг из ответа «кто я»:
    // номер владельца из публичной выдачи каталога ушёл.
    faces: facesOf({ userId: providerUser.id, clubs: [club], trainers: [trainer] }),
  });
}

const fetchMock = vi.fn();

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ProviderClients (Step 25.10-B)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('показывает карточки для каждого уникального userId из bookings провайдера', () => {
    authenticateProvider();

    const b1 = makeBooking({ id: 501, status: 'completed', userId: athleteUser.id });
    const b2 = makeBooking({ id: 502, status: 'completed', userId: athleteUser2.id });

    renderInFaceCabinet(
      <ProviderClients
        bookings={[b1, b2]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        users={[providerUser, athleteUser, athleteUser2]}
        notes={[]}
      />,
    );

    expect(screen.getByTestId('provider-clients-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('provider-clients-card-2')).toBeInTheDocument();
  });

  // ⚠️ Кабинет — КАРТОЧКИ ТРЕНЕРА: обе записи набора сделаны на услуги карточки 5.
  // Клиенты теперь при лице, а не при человеке, и в кабинете клуба этих клиентов
  // не видно вовсе — их привёл не клуб.
  it('per-offering фильтр: выбор Йоги скрывает клиента с booking только на Бокс', () => {
    authenticateProvider();

    const yogaBooking = makeBooking({
      id: 601,
      status: 'completed',
      userId: athleteUser.id,
      offeringId: offeringYoga.id,
      ownerType: 'trainer',
      ownerId: trainer.id,
      trainerId: trainer.id,
      clubId: undefined,
      sportId: 1,
    });
    const boxBooking = makeBooking({
      id: 602,
      status: 'completed',
      userId: athleteUser2.id,
      offeringId: offeringBox.id,
      ownerType: 'trainer',
      ownerId: trainer.id,
      trainerId: trainer.id,
      clubId: undefined,
      sportId: 4,
    });

    renderInFaceCabinet(
      <ProviderClients
        bookings={[yogaBooking, boxBooking]}
        clubs={[]}
        trainers={[trainer]}
        offerings={[offeringYoga, offeringBox]}
        schedule={[makeSchedule({ id: 1001 })]}
        users={[providerUser, athleteUser, athleteUser2]}
        notes={[]}
      />,
      trainerFace(trainer.id, trainer.name),
    );

    expect(screen.getByTestId('provider-clients-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('provider-clients-card-2')).toBeInTheDocument();

    const select = screen.getByTestId('provider-clients-filter-offering') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: String(offeringYoga.id) } });

    expect(screen.getByTestId('provider-clients-card-1')).toBeInTheDocument();
    expect(screen.queryByTestId('provider-clients-card-2')).not.toBeInTheDocument();
  });

  it('фильтра по надёжности нет, и клиент с двадцатью неявками виден наравне с остальными', () => {
    authenticateProvider();

    // Прежде user 2 попадал под фильтр «danger» по доле доведённых записей.
    // Механизма нет — клиент как клиент: карточка есть, бейджа нет.
    const normalBookings: Booking[] = Array.from({ length: 6 }, (_, index) =>
      makeBooking({
        id: 700 + index,
        status: 'completed',
        userId: athleteUser.id,
      }),
    );

    const noShowBookings: Booking[] = Array.from({ length: 20 }, (_, index) =>
      makeBooking({
        id: 900 + index,
        status: 'no_show',
        userId: athleteUser2.id,
      }),
    );

    renderInFaceCabinet(
      <ProviderClients
        bookings={[...normalBookings, ...noShowBookings]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        users={[providerUser, athleteUser, athleteUser2]}
        notes={[]}
      />,
    );

    expect(screen.getByTestId('provider-clients-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('provider-clients-card-2')).toBeInTheDocument();
    expect(screen.queryByTestId('provider-clients-filter-reliability')).not.toBeInTheDocument();
    expect(screen.queryByText(/надёжн/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/reliability-badge/)).not.toBeInTheDocument();
  });

  it('клик по карточке открывает drawer с именем клиента и историей записей', () => {
    authenticateProvider();

    const b1 = makeBooking({ id: 501, status: 'completed', userId: athleteUser.id });
    const b2 = makeBooking({ id: 502, status: 'pending', userId: athleteUser.id });

    renderInFaceCabinet(
      <ProviderClients
        bookings={[b1, b2]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        users={[providerUser, athleteUser]}
        notes={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-clients-card-1'));

    const drawer = screen.getByTestId('provider-clients-drawer');
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(
      within(drawer).getByTestId('provider-clients-drawer-history-item-501'),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByTestId('provider-clients-drawer-history-item-502'),
    ).toBeInTheDocument();
  });

  it('save-note создаёт заметку через POST /api/provider-client-notes', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(createJsonResponse({ success: true, data: { id: 77 } }, 201));

    const b1 = makeBooking({ id: 501, status: 'completed', userId: athleteUser.id });

    renderInFaceCabinet(
      <ProviderClients
        bookings={[b1]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        users={[providerUser, athleteUser]}
        notes={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-clients-card-1'));

    const textarea = screen.getByTestId(
      'provider-clients-drawer-note-textarea',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Мотивированный клиент' } });
    fireEvent.click(screen.getByTestId('provider-clients-drawer-note-save'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/provider-client-notes');
    expect(call[1].method).toBe('POST');
    // ⚠️ Автора заметки в теле НЕТ: сервер берёт его из сессии, а схема тела
    // строгая — прежнее `providerUserId` она теперь отвергает. Заметки о клиентах
    // самые чувствительные данные площадки, и подписывать их клиенту не положено.
    expect(JSON.parse(call[1].body as string)).toEqual({
      clientUserId: athleteUser.id,
      note: 'Мотивированный клиент',
    });
  });

  it('delete-note удаляет существующую заметку через DELETE /api/provider-client-notes/[id]', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(createJsonResponse({ success: true }));

    const b1 = makeBooking({ id: 501, status: 'completed', userId: athleteUser.id });
    const existing: ProviderClientNote = {
      id: 42,
      createdAt: '2026-04-20T10:00:00.000Z',
      updatedAt: '2026-04-20T10:00:00.000Z',
      providerUserId: providerUser.id,
      clientUserId: athleteUser.id,
      note: 'Старая заметка',
    };

    renderInFaceCabinet(
      <ProviderClients
        bookings={[b1]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        users={[providerUser, athleteUser]}
        notes={[existing]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-clients-card-1'));
    fireEvent.click(screen.getByTestId('provider-clients-drawer-note-delete'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/provider-client-notes/42');
    // Тела у удаления больше нет вовсе: владельца заметки проверяет сервер.
    expect(call[1]).toEqual({ method: 'DELETE' });
  });
});
