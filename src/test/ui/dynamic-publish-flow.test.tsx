import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { refreshMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    refresh: refreshMock,
  }),
  notFound: () => {
    const error = new Error('Not found') as Error & { digest?: string };

    error.digest = 'NEXT_HTTP_ERROR_FALLBACK;404';
    throw error;
  },
}));

import { POST as createClubPost } from '@/app/api/clubs/route';
import BookingPage from '@/app/booking/[scheduleId]/page';
import ClubDetailPage from '@/app/clubs/[slug]/page';
import Home from '@/app/page';
import ProviderProfileRoute from '@/app/profile/provider/page';
import { POST as createTrainerPost } from '@/app/api/trainers/route';
import TrainerDetailPage from '@/app/trainers/[slug]/page';
import {
  AUTH_STORAGE_KEY,
  AUTH_STORE_DEFAULT_STATE,
  MVP_PROVIDER_USER_ID,
  useAuthStore,
} from '@/stores/useAuthStore';
import { useFilterStore } from '@/stores/useFilterStore';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { clearCatalogCollections } from '@/test/helpers/publish-flow';
import { getDateKeyInTimeZone } from '@/lib/utils';

const PROVIDER_USER = {
  id: MVP_PROVIDER_USER_ID,
  name: 'Марина Крылова',
  email: 'marina@studio.local',
};

type ClubPublicationResponse = {
  club: {
    id: number;
    slug: string;
    name: string;
  };
  offering: {
    id: number;
  };
  schedules: Array<{
    id: number;
    title: string;
  }>;
};

type TrainerPublicationResponse = {
  trainer: {
    id: number;
    slug: string;
    name: string;
  };
  offering: {
    id: number;
  };
  schedules: Array<{
    id: number;
    title: string;
  }>;
};

function buildClubPayload(targetDate: string) {
  return {
    name: 'Start Swim Lab',
    city: 'Самара',
    address: 'ул. Ново-Садовая, 101',
    description:
      'Новый клуб для тех, кто хочет быстро выйти в воду, собрать первую группу и начать регулярные тренировки без лишней бюрократии и декоративных заглушек.',
    phone: '+7 (846) 300-00-11',
    email: 'hello@startswim.ru',
    priceFrom: '1500',
    disciplines: ['Плавание'],
    tags: ['Новая публикация', 'Утренние слоты'],
    amenities: ['Бассейн 25 м', 'Раздевалки'],
    scheduleSlots: [
      {
        title: 'Стартовая группа по плаванию',
        date: targetDate,
        startTime: '07:30',
        endTime: '08:30',
        price: '1350',
        capacity: '10',
        location: 'Бассейн A',
        discipline: 'Плавание',
      },
    ],
    userId: MVP_PROVIDER_USER_ID,
  };
}

function buildTrainerPayload(clubId: number, targetDate: string) {
  return {
    firstName: 'Ilya',
    lastName: 'Volkov',
    city: 'Самара',
    address: 'ул. Ново-Садовая, 101',
    bio: 'Тренер по плаванию, который помогает быстро собрать технику, вернуть уверенность в воде и перейти от редких посещений к стабильному персональному режиму.',
    experience: '6',
    sport: 'Плавание',
    specializations: ['Техника кроля', 'Персональные тренировки'],
    workFormat: 'В клубе',
    offeringName: 'Персональная тренировка по плаванию',
    offeringDescription:
      'Индивидуальная сессия с фокусом на технику, дыхание и разбор ошибок по каждому отрезку.',
    offeringFormat: 'Индивидуальная',
    offeringPrice: '2300',
    offeringDuration: '60',
    offeringLocation: 'Бассейн A',
    clubId,
    scheduleSlots: [
      {
        title: 'Персональная дорожка',
        date: targetDate,
        startTime: '09:00',
        endTime: '10:00',
        price: '2300',
        capacity: '1',
        location: 'Бассейн A',
        discipline: 'Плавание',
      },
    ],
    userId: MVP_PROVIDER_USER_ID,
  };
}

async function createClubThroughApi(targetDate: string): Promise<ClubPublicationResponse> {
  const response = await createClubPost(
    new Request('http://localhost:3000/api/clubs', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildClubPayload(targetDate)),
    }),
  );
  const body = (await response.json()) as
    | { success: true; data: ClubPublicationResponse }
    | { success: false; error?: string };

  expect(response.status).toBe(201);
  expect(body.success).toBe(true);

  return (body as { success: true; data: ClubPublicationResponse }).data;
}

async function createTrainerThroughApi(
  clubId: number,
  targetDate: string,
): Promise<TrainerPublicationResponse> {
  const response = await createTrainerPost(
    new Request('http://localhost:3000/api/trainers', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(buildTrainerPayload(clubId, targetDate)),
    }),
  );
  const body = (await response.json()) as
    | { success: true; data: TrainerPublicationResponse }
    | { success: false; error?: string };

  expect(response.status).toBe(201);
  expect(body.success).toBe(true);

  return (body as { success: true; data: TrainerPublicationResponse }).data;
}

describe('dynamic publish-flow phase regression (Step 14.12)', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });
    refreshMock.mockReset();
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('проходит полный club flow: provider create -> cabinet update -> catalog update -> detail page', async () => {
    const targetDate = getDateKeyInTimeZone();

    await clearCatalogCollections(dataDirectory);
    useAuthStore.getState().login({
      accountType: 'provider',
      user: PROVIDER_USER,
    });

    const initialCabinet = render(await ProviderProfileRoute());

    expect(screen.getByTestId('provider-publications-empty')).toBeInTheDocument();
    expect(screen.getByTestId('provider-summary-publications')).toHaveTextContent('0');

    initialCabinet.unmount();

    const clubPublication = await createClubThroughApi(targetDate);
    const updatedCabinet = render(await ProviderProfileRoute());

    expect(screen.getByTestId('provider-summary-publications')).toHaveTextContent('1');
    expect(screen.getByTestId('provider-publications-list')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Start Swim Lab' })).toHaveAttribute(
      'href',
      `/clubs/${clubPublication.club.slug}`,
    );

    updatedCabinet.unmount();
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });

    const homePage = render(await Home());

    expect(screen.getByText('1 клубов в каталоге')).toBeInTheDocument();
    expect(screen.getByText('0 тренеров в каталоге')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Клубы под текущие фильтры' })).toBeInTheDocument();
    expect(screen.getAllByText('Start Swim Lab').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Стартовая группа по плаванию').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', {
        name: 'Открыть запись на занятие Стартовая группа по плаванию',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Volna Aquatic Club')).not.toBeInTheDocument();

    homePage.unmount();

    render(await ClubDetailPage({ params: Promise.resolve({ slug: clubPublication.club.slug }) }));

    expect(screen.getByRole('heading', { name: 'Start Swim Lab' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Расписание на неделю' })).toBeInTheDocument();
    expect(screen.getByText('Стартовая группа по плаванию')).toBeInTheDocument();
    expect(screen.getByText('Новая публикация')).toBeInTheDocument();
  });

  it('проходит полный trainer flow: provider create -> cabinet update -> trainer catalog -> detail -> booking', async () => {
    const targetDate = getDateKeyInTimeZone();

    await clearCatalogCollections(dataDirectory);
    useAuthStore.getState().login({
      accountType: 'provider',
      user: PROVIDER_USER,
    });

    const clubPublication = await createClubThroughApi(targetDate);
    const trainerPublication = await createTrainerThroughApi(clubPublication.club.id, targetDate);

    const cabinetPage = render(await ProviderProfileRoute());

    expect(screen.getByTestId('provider-summary-publications')).toHaveTextContent('2');
    expect(screen.getByText('Start Swim Lab')).toBeInTheDocument();
    expect(screen.getByText('Ilya Volkov')).toBeInTheDocument();

    cabinetPage.unmount();
    useFilterStore.setState({
      discoveryMode: 'trainers',
      searchQuery: '',
      selectedSportId: null,
    });

    const homePage = render(await Home());

    expect(screen.getByText('1 клубов в каталоге')).toBeInTheDocument();
    expect(screen.getByText('1 тренеров в каталоге')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Тренеры под текущие фильтры' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Популярные тренеры' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Свободные окна тренеров' })).toBeInTheDocument();
    expect(screen.getAllByText('Ilya Volkov').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Персональная тренировка по плаванию').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Start Swim Lab').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', {
        name: 'Открыть запись к тренеру Ilya Volkov',
      }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('link', { name: 'Перейти к записи' })
        .some(
          (link) => link.getAttribute('href') === `/booking/${trainerPublication.schedules[0].id}`,
        ),
    ).toBe(true);
    expect(screen.queryByText('Марина Соколова')).not.toBeInTheDocument();

    homePage.unmount();

    const trainerPage = render(
      await TrainerDetailPage({
        params: Promise.resolve({ slug: trainerPublication.trainer.slug }),
      }),
    );

    expect(screen.getByRole('heading', { name: 'Ilya Volkov' })).toBeInTheDocument();
    expect(screen.getByTestId('trainer-affiliated-club-section')).toBeInTheDocument();
    expect(screen.getByText('Персональная дорожка')).toBeInTheDocument();
    expect(screen.getAllByText('Start Swim Lab').length).toBeGreaterThan(0);

    trainerPage.unmount();

    render(
      await BookingPage({
        params: Promise.resolve({ scheduleId: String(trainerPublication.schedules[0].id) }),
      }),
    );

    expect(screen.getByRole('heading', { name: 'Запись на занятие' })).toBeInTheDocument();
    expect(screen.getByText('Услуга тренера')).toBeInTheDocument();
    expect(screen.getAllByText('Ilya Volkov').length).toBeGreaterThan(0);
    expect(screen.getByText('Персональная дорожка')).toBeInTheDocument();
    expect(screen.getAllByText('Start Swim Lab').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Бассейн A').length).toBeGreaterThan(0);
  });

  it('не опирается на старые seed-card данные после очистки каталога', async () => {
    await clearCatalogCollections(dataDirectory);
    useAuthStore.getState().login({
      accountType: 'provider',
      user: PROVIDER_USER,
    });

    const cabinetPage = render(await ProviderProfileRoute());

    expect(screen.getByTestId('provider-publications-empty')).toBeInTheDocument();
    expect(screen.queryByText('Volna Aquatic Club')).not.toBeInTheDocument();
    expect(screen.queryByText('Марина Соколова')).not.toBeInTheDocument();

    cabinetPage.unmount();
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });

    render(await Home());

    expect(screen.getByText('0 клубов в каталоге')).toBeInTheDocument();
    expect(screen.getByText('0 тренеров в каталоге')).toBeInTheDocument();
    expect(screen.getByTestId('popular-nearby-empty')).toBeInTheDocument();
    expect(screen.queryByText('Volna Aquatic Club')).not.toBeInTheDocument();
    expect(screen.queryByText('Марина Соколова')).not.toBeInTheDocument();
    expect(
      screen.getByText(
        'Каталог пока пуст. Витрина начнёт заполняться новыми публикациями из кабинета провайдера.',
      ),
    ).toBeInTheDocument();
  });
});
