// Расчёты кабинетов, зависящие от времени (Step 33.11).
//
// Все окна и календарные границы кабинета должны считаться по часам зала (Самара),
// а не по часам того, кто смотрит страницу. До перевода на общий помощник моменты
// строились из строк `${date}T${time}` — то есть в поясе браузера, — и окна отмены,
// окно отметки исхода, границы недели и координаты тепловой карты уезжали ровно на
// смещение пояса зрителя.
//
// Поэтому пояс процесса здесь задан явно и НЕ равен самарскому: под самарским поясом
// прежние формулы совпадали с верными, и ошибка была невидима. Все ожидания записаны
// моментом в UTC, а не той же формулой, по которой считает код.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { renderInFaceCabinet } from '@/test/helpers/cabinet';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { AthleteUpcomingBookingCard } from '@/components/profile/AthleteUpcomingBookingCard';
import { getAthleteAchievements } from '@/components/profile/athlete-achievements';
import { AthleteDashboard } from '@/components/profile/athlete/AthleteDashboard';
import { AthleteSchedule } from '@/components/profile/athlete/AthleteSchedule';
import { AthleteStats } from '@/components/profile/athlete/AthleteStats';
import { ProviderBookingsInbox } from '@/components/profile/provider/ProviderBookingsInbox';
import { ProviderClients } from '@/components/profile/provider/ProviderClients';
import { ProviderDashboard } from '@/components/profile/provider/ProviderDashboard';
import { ProviderStats } from '@/components/profile/provider/ProviderStats';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { facesOf } from '@/test/helpers/service-faces';
import type { Booking, Club, Offering, Schedule, Sport, Trainer, User } from '@sporthub/types';

// Токио на пять часов впереди Самары. Любая формула, считающая по поясу процесса,
// разойдётся с правильным ответом ровно на эти пять часов.
const ORIGINAL_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
process.env.TZ = 'Asia/Tokyo';

afterAll(() => {
  // Пояс возвращаем: воркер vitest переиспользуется следующими файлами.
  process.env.TZ = ORIGINAL_TIME_ZONE;
});

// Recharts на страницах статистики требует ResizeObserver, которого нет в jsdom.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// Заглушка подходит под тип ResizeObserver целиком, подавление проверки не нужно.
globalThis.ResizeObserver = ResizeObserverStub;

const athleteUser: User = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Алексей Смирнов',
  email: 'alexey@sporthub.local',
  phone: '+7 999 111-22-33',
  passwordHash: 'secret',
  favoriteClubIds: [],
};

const providerUser: User = {
  id: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Марина Крылова',
  email: 'marina@studio.local',
  phone: '+7 999 222-33-44',
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
  phone: '',
  imageUrls: [],
  distanceKm: 0,
  sportIds: [3],
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

const sports: Sport[] = [
  {
    id: 3,
    createdAt: '',
    name: 'Плавание',
    slug: 'swim',
    description: '',
    icon: '',
    imageUrl: '',
    isPopular: false,
  },
];
const trainers: Trainer[] = [];

function makeSchedule(overrides: Partial<Schedule> & Pick<Schedule, 'id'>): Schedule {
  return {
    createdAt: '2026-08-01T09:00:00.000Z',
    clubId: club.id,
    sportId: 3,
    title: 'Утреннее плавание',
    date: '2026-08-22',
    startTime: '10:00',
    endTime: '11:00',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 10,
    bookedCount: 1,
    price: 1000,
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking> & Pick<Booking, 'id' | 'scheduleId'>): Booking {
  return {
    createdAt: '2026-08-01T09:00:00.000Z',
    offeringId: offeringSwim.id,
    ownerType: 'club',
    ownerId: club.id,
    userId: athleteUser.id,
    clubId: club.id,
    sportId: 3,
    date: '2026-08-22',
    status: 'confirmed',
    paymentStatus: 'paid',
    totalPrice: 1000,
    ...overrides,
  };
}

function authenticateAthlete() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: athleteUser,
    accountKind: 'person',
    isAuthenticated: true,
  });
}

function authenticateProvider() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: providerUser,
    accountKind: 'person',
    isAuthenticated: true,
    // ⚠️ Шаг 35.20a. Лица приезжают ответом «кто я», не из каталога.
    faces: facesOf({ userId: providerUser.id, clubs: [club] }),
  });
}

const fetchMock = vi.fn();

/** Подменяет только Date: setTimeout и микротаски нужны живыми для async-действий. */
function freezeTimeAt(instant: string) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(instant));
}

beforeEach(() => {
  useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  refreshMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Окно бесплатной отмены у атлета (Step 33.11)', () => {
  // Занятие 22 августа в 10:00 по часам зала — это момент 2026-08-22T06:00Z.
  const bookingBase = {
    id: 77,
    bookingTypeLabel: 'Услуга клуба',
    clubName: 'Aqua Pro',
    date: '2026-08-22',
    endTime: '11:00',
    locationLabel: 'Aqua Pro · Бассейн A',
    startTime: '10:00',
    statusLabel: 'Подтверждена',
    statusTone: 'success' as const,
    timeLabel: '10:00 - 11:00',
    title: 'Утреннее плавание',
    trainerName: 'Марина Соколова',
  };

  it('за 26 часов до начала отмена не считается поздней', async () => {
    // 2026-08-21T04:00Z — до начала занятия ровно 26 часов по часам зала.
    // По часам зрителя (Токио) начало наступило бы на пять часов раньше, до него
    // оставался бы 21 час — и прежняя формула показала бы предупреждение зря.
    freezeTimeAt('2026-08-21T04:00:00.000Z');

    render(<AthleteUpcomingBookingCard booking={bookingBase} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Отменить запись' }));
    });

    expect(screen.queryByText('Поздняя отмена')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('за 22 часа до начала отмена поздняя и запрашивает подтверждение', async () => {
    // 2026-08-21T08:00Z — до начала 22 часа по часам зала, окно 24 часа уже нарушено.
    freezeTimeAt('2026-08-21T08:00:00.000Z');

    render(<AthleteUpcomingBookingCard booking={bookingBase} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Отменить запись' }));
    });

    expect(screen.getByText('Поздняя отмена')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('без известного времени начала предупреждение не показывается', async () => {
    // `startTime` карточки — не всегда время: когда слот не найден, туда попадает
    // подпись «Время уточняется». Раньше из неё получался Invalid Date, и ответ
    // выходил тем же, но случайно — через сравнение с NaN.
    freezeTimeAt('2026-08-21T08:00:00.000Z');

    render(
      <AthleteUpcomingBookingCard
        booking={{ ...bookingBase, startTime: 'Время уточняется', timeLabel: 'Время уточняется' }}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Отменить запись' }));
    });

    expect(screen.queryByText('Поздняя отмена')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Отсчёт до авто-отмены заявки (Step 33.11)', () => {
  it('остаток считается до часа перед началом по часам зала', () => {
    // Занятие 22 августа в 10:00 зала = 2026-08-22T06:00Z, авто-отмена за час до —
    // в 05:00Z. «Сейчас» 02:30Z, значит остаётся 2 часа 30 минут. По часам зрителя
    // (Токио) окно закрылось бы ещё в 00:00Z и отсчёт показал бы «скоро».
    authenticateAthlete();
    freezeTimeAt('2026-08-22T02:30:00.000Z');

    const slot = makeSchedule({ id: 10, date: '2026-08-22', startTime: '10:00' });
    const booking = makeBooking({
      id: 1,
      scheduleId: 10,
      status: 'pending',
      date: '2026-08-22',
    });

    render(<AthleteDashboard bookings={[booking]} schedule={[slot]} clubs={[club]} />);

    const pending = screen.getByTestId('athlete-dashboard-pending');
    expect(within(pending).getByText(/2ч 30мин/)).toBeInTheDocument();
  });
});

describe('Расписание атлета: неделя и окно отмены (Step 33.11)', () => {
  it('подпись недели показывает её настоящие границы', () => {
    // Запись 21 августа (пятница) попадает в неделю 17–23 августа. Прежняя подпись
    // строила полночь в поясе браузера и возвращала её через toISOString — то есть
    // день в UTC, — и для любого пояса восточнее UTC съезжала на сутки назад.
    authenticateAthlete();
    freezeTimeAt('2026-08-22T12:00:00.000Z');

    const booking = makeBooking({ id: 1, scheduleId: 10, date: '2026-08-21' });
    const slot = makeSchedule({ id: 10, date: '2026-08-21' });

    render(<AthleteSchedule bookings={[booking]} schedule={[slot]} clubs={[club]} />);

    const header = screen.getByTestId('athlete-schedule-week-header');
    expect(header).toHaveTextContent(/17 авг/);
    expect(header).toHaveTextContent(/23 авг/);
  });

  it('за 26 часов до начала отмена из карточки записи не считается поздней', async () => {
    authenticateAthlete();
    freezeTimeAt('2026-08-21T04:00:00.000Z');

    const booking = makeBooking({ id: 1, scheduleId: 10, date: '2026-08-22' });
    const slot = makeSchedule({ id: 10, date: '2026-08-22', startTime: '10:00' });

    render(<AthleteSchedule bookings={[booking]} schedule={[slot]} clubs={[club]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Детали' }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Отменить запись' }));
    });

    expect(screen.queryByText('Поздняя отмена')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('Окно отметки исхода у провайдера (Step 33.11)', () => {
  // Занятие 20 августа кончается в 20:00 по часам зала — это 2026-08-20T16:00Z.
  // Окно отметки исхода закрывается через 48 часов, в 2026-08-22T16:00Z.
  // «Сейчас» 12:00Z, значит до конца окна 4 часа — меньше порога в 6 часов.
  // По часам зрителя (Токио) окно закрылось бы в 11:00Z, то есть час назад.
  const slot = makeSchedule({
    id: 1001,
    date: '2026-08-20',
    startTime: '19:00',
    endTime: '20:00',
  });
  const booking = makeBooking({
    id: 701,
    scheduleId: 1001,
    status: 'confirmed',
    date: '2026-08-20',
  });

  it('карточка KPI считает записи, у которых окно закрывается в ближайшие часы', () => {
    authenticateProvider();
    freezeTimeAt('2026-08-22T12:00:00.000Z');

    renderInFaceCabinet(
      <ProviderDashboard
        clubs={[club]}
        trainers={trainers}
        bookings={[booking]}
        schedule={[slot]}
        offerings={[offeringSwim]}
      />,
    );

    expect(screen.getByTestId('provider-dashboard-approaching-checkin')).toHaveTextContent('1');
  });

  it('входящие показывают такую запись в табе «Требуют check-in» с пометкой срочности', () => {
    authenticateProvider();
    freezeTimeAt('2026-08-22T12:00:00.000Z');

    renderInFaceCabinet(
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
  });
});

describe('Граница недели в сводке провайдера (Step 33.11)', () => {
  it('в неделю попадают шесть дней вперёд от сегодняшнего дня зала', () => {
    // «Сейчас» 2026-08-22T12:00Z — 22 августа по часам зала. Неделя охватывает
    // 22–28 августа включительно, 29 августа уже за границей.
    authenticateProvider();
    freezeTimeAt('2026-08-22T12:00:00.000Z');

    renderInFaceCabinet(
      <ProviderDashboard
        clubs={[club]}
        trainers={trainers}
        bookings={[
          makeBooking({ id: 1, scheduleId: 1, date: '2026-08-22' }),
          makeBooking({ id: 2, scheduleId: 2, date: '2026-08-28' }),
          makeBooking({ id: 3, scheduleId: 3, date: '2026-08-29' }),
        ]}
        offerings={[offeringSwim]}
      />,
    );

    const todayBlock = screen.getByText('Активные записи сегодня').parentElement as HTMLElement;
    const weekBlock = screen.getByText('Активные на неделе').parentElement as HTMLElement;

    expect(within(todayBlock).getByText('1')).toBeInTheDocument();
    expect(within(weekBlock).getByText('2')).toBeInTheDocument();
  });
});

describe('Тепловая карта провайдера (Step 33.11)', () => {
  it('занятие в 10:00 попадает в клетку десяти часов своего дня недели', () => {
    // 21 августа 2026 — пятница, то есть строка 4. Время 10:00 — это часы зала,
    // и никакой пересчёт к ним не применяется. Прежняя версия разбирала строку в
    // поясе браузера, а час читала в UTC: в Самаре занятие уезжало в колонку 6,
    // в Токио — в колонку 1.
    authenticateProvider();
    freezeTimeAt('2026-08-22T12:00:00.000Z');

    const slot = makeSchedule({ id: 55, date: '2026-08-21', startTime: '10:00', endTime: '11:00' });
    const booking = makeBooking({
      id: 5,
      scheduleId: 55,
      status: 'completed',
      date: '2026-08-21',
    });

    renderInFaceCabinet(
      <ProviderStats
        clubs={[club]}
        trainers={trainers}
        bookings={[booking]}
        schedule={[slot]}
        offerings={[offeringSwim]}
        sports={sports}
      />,
    );

    expect(screen.getByTestId('provider-stats-heatmap-cell-4-10')).toHaveAttribute(
      'title',
      'Пт 10:00 — 1',
    );
    // Ни смещение на пояс зрителя, ни смещение к UTC не должны никуда попасть.
    expect(screen.getByTestId('provider-stats-heatmap-cell-4-6')).toHaveAttribute(
      'title',
      'Пт 6:00 — 0',
    );
    expect(screen.getByTestId('provider-stats-heatmap-cell-4-1')).toHaveAttribute(
      'title',
      'Пт 1:00 — 0',
    );
    expect(screen.getByTestId('provider-stats-heatmap-cell-4-14')).toHaveAttribute(
      'title',
      'Пт 14:00 — 0',
    );
  });
});

describe('Окно «последние 12 месяцев» (Step 33.11)', () => {
  // 2026-08-31T16:00Z — 31 августа 20:00 по часам зала, но уже 1 сентября в Токио.
  // Окно зала начинается с сентября 2025 года и включает запись от 15 сентября;
  // по календарю зрителя окно начиналось бы с октября и запись выпадала бы из него.
  const slot = makeSchedule({
    id: 90,
    date: '2025-09-15',
    startTime: '10:00',
    endTime: '11:00',
    durationMinutes: 60,
  });
  const booking = makeBooking({
    id: 9,
    scheduleId: 90,
    status: 'completed',
    date: '2025-09-15',
  });

  it('статистика провайдера удерживает запись самого раннего месяца окна', () => {
    authenticateProvider();
    freezeTimeAt('2026-08-31T16:00:00.000Z');

    renderInFaceCabinet(
      <ProviderStats
        clubs={[club]}
        trainers={trainers}
        bookings={[booking]}
        schedule={[slot]}
        offerings={[offeringSwim]}
        sports={sports}
      />,
    );

    expect(screen.getByTestId('provider-stats-total-hours')).toHaveTextContent('1');
  });

  it('статистика атлета удерживает ту же запись', () => {
    authenticateAthlete();
    freezeTimeAt('2026-08-31T16:00:00.000Z');

    render(<AthleteStats bookings={[booking]} schedule={[slot]} clubs={[club]} sports={sports} />);

    expect(screen.getByTestId('athlete-stats-total-hours')).toHaveTextContent('1');
  });
});

describe('Даты визитов в разделе клиентов (Step 33.11)', () => {
  it('первый и последний визит показываются тем же днём, каким записаны', () => {
    // Дата визита и показывается, и считается в поясе зала. Раньше полночь бралась
    // в поясе браузера, а показывалась через формат с поясом зала: для зрителя
    // восточнее Самары обе подписи съезжали на день назад.
    authenticateProvider();
    freezeTimeAt('2026-08-22T12:00:00.000Z');

    // ⚠️ Кабинет — клуба 1 (умолчание помощника совпадает с `club` набора). Раздел
    // клиентов отбирает записи по лицу ОТКРЫТОГО кабинета: без кабинета лиц нет
    // вовсе, и карточка клиента не появилась бы — проверка дат проверяла бы пустоту.
    renderInFaceCabinet(
      <ProviderClients
        clubs={[club]}
        trainers={trainers}
        offerings={[offeringSwim]}
        bookings={[
          makeBooking({ id: 1, scheduleId: 1, date: '2026-08-10', status: 'completed' }),
          makeBooking({ id: 2, scheduleId: 2, date: '2026-08-20', status: 'completed' }),
        ]}
        users={[athleteUser, providerUser]}
      />,
    );

    const card = screen.getByTestId(`provider-clients-card-${athleteUser.id}`);
    expect(card).toHaveTextContent(/10 авг/);
    expect(card).toHaveTextContent(/20 авг/);
    expect(card).not.toHaveTextContent(/9 авг/);
    expect(card).not.toHaveTextContent(/19 авг/);
  });
});

describe('Достижения атлета: окно семи дней (Step 33.11)', () => {
  it('три занятия в пределах недели засчитываются через границу месяца', () => {
    // Окно считается по календарным суткам: 30 августа плюс шесть дней — это
    // 5 сентября. Все три занятия внутри окна, достижение открыто.
    const bookings = [
      makeBooking({ id: 1, scheduleId: 1, status: 'completed', date: '2026-08-30' }),
      makeBooking({ id: 2, scheduleId: 2, status: 'completed', date: '2026-09-01' }),
      makeBooking({ id: 3, scheduleId: 3, status: 'completed', date: '2026-09-05' }),
    ];

    const achievements = getAthleteAchievements({
      athleteUserId: athleteUser.id,
      bookings,
      reviews: [],
    });

    const weekWithoutSkips = achievements.find((item) => item.id === 'week-without-skips');
    expect(weekWithoutSkips?.unlocked).toBe(true);

    // А занятие на седьмой день после первого в то же окно уже не попадает.
    const spreadOut = getAthleteAchievements({
      athleteUserId: athleteUser.id,
      bookings: [
        makeBooking({ id: 1, scheduleId: 1, status: 'completed', date: '2026-08-30' }),
        makeBooking({ id: 2, scheduleId: 2, status: 'completed', date: '2026-09-01' }),
        makeBooking({ id: 3, scheduleId: 3, status: 'completed', date: '2026-09-06' }),
      ],
      reviews: [],
    });

    expect(spreadOut.find((item) => item.id === 'week-without-skips')?.unlocked).toBe(false);
  });
});
