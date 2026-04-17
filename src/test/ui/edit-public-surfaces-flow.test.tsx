// Интеграционные тесты влияния edit-flow на кабинет, каталог, detail pages и booking-context.
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
  }),
  notFound: () => {
    const error = new Error('Not found') as Error & { digest?: string };

    error.digest = 'NEXT_HTTP_ERROR_FALLBACK;404';
    throw error;
  },
}));

import { PATCH as patchClubPublication } from '@/app/api/clubs/[id]/route';
import { PATCH as patchTrainerPublication } from '@/app/api/trainers/[id]/route';
import BookingPage from '@/app/booking/[scheduleId]/page';
import ClubDetailPage from '@/app/clubs/[slug]/page';
import Home from '@/app/page';
import ProviderProfileRoute from '@/app/profile/provider/page';
import TrainerDetailPage from '@/app/trainers/[slug]/page';
import { getDateKeyInTimeZone } from '@/lib/utils';
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
import { publishCatalogPair } from '@/test/helpers/publish-flow';
import { seedTestData } from '@/test/helpers/seed-fixtures';

const PROVIDER_USER = {
  id: MVP_PROVIDER_USER_ID,
  name: 'Марина Крылова',
  email: 'marina@studio.local',
};

function loginAsProvider() {
  useAuthStore.getState().login({
    accountType: 'provider',
    user: PROVIDER_USER,
  });
}

function buildClubEditPayload(targetDate: string) {
  return {
    name: 'Volna Aquatic Club Prime',
    city: 'Самара',
    address: 'ул. Мориса Тореза, 17',
    description:
      'Обновлённый клуб провайдера с новым позиционированием, актуальным описанием, переработанным расписанием и акцентом на быстрый доступ к воде и восстановлению.',
    phone: '+7 (846) 200-99-11',
    email: 'prime@volna-club.ru',
    priceFrom: '1700',
    sportIds: [3],
    tagIds: [1],
    amenityIds: [1],
    vk: '',
    telegram: '',
    facebook: '',
    scheduleSlots: [
      {
        id: 1,
        title: 'Утреннее плавание Reloaded',
        date: targetDate,
        startTime: '07:10',
        endTime: '08:25',
        price: '1700',
        capacity: '14',
        location: 'Бассейн PRO',
        discipline: 'Плавание',
      },
      {
        id: 2,
        title: 'Дневной пилатес Prime',
        date: targetDate,
        startTime: '13:00',
        endTime: '14:00',
        price: '1500',
        capacity: '10',
        location: 'Студия восстановления',
        discipline: 'Пилатес',
      },
      {
        id: 3,
        title: 'Вечернее плавание Recovery',
        date: targetDate,
        startTime: '19:10',
        endTime: '20:20',
        price: '1800',
        capacity: '12',
        location: 'Бассейн PRO',
        discipline: 'Плавание',
      },
    ],
    userId: MVP_PROVIDER_USER_ID,
  };
}

function buildTrainerEditPayload(existingSlotId: number, clubId: number, targetDate: string) {
  return {
    firstName: 'Ilya',
    lastName: 'Ocean',
    city: 'Самара',
    address: 'ул. Ново-Садовая, 101',
    bio: 'Обновлённый профиль тренера с акцентом на скорость, технику, персональный контроль прогресса и гибкую настройку слотов без пересоздания публикации.',
    experience: '7',
    sportIds: [3],
    specialtyIds: [1],
    workFormatIds: [1],
    phone: '+7 (846) 300-00-11',
    vk: '',
    telegram: '',
    facebook: '',
    offeringName: 'Скоростная персональная тренировка',
    offeringDescription:
      'Персональная работа над темпом, техникой разворотов и ускорением на ключевых отрезках.',
    offeringFormat: 'Индивидуальная',
    offeringPrice: '2600',
    offeringDuration: '75',
    offeringLocation: 'Открытая дорожка 2',
    clubId,
    scheduleSlots: [
      {
        id: existingSlotId,
        title: 'Скоростная дорожка',
        date: targetDate,
        startTime: '09:30',
        endTime: '10:45',
        price: '2600',
        capacity: '1',
        location: 'Открытая дорожка 2',
        discipline: 'Плавание',
      },
    ],
    userId: MVP_PROVIDER_USER_ID,
  };
}

async function patchClubById(clubId: number, payload: ReturnType<typeof buildClubEditPayload>) {
  const response = await patchClubPublication(
    new Request(`http://localhost:3000/api/clubs/${clubId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    }),
    {
      params: Promise.resolve({ id: String(clubId) }),
    },
  );
  const body = (await response.json()) as { error?: string; success?: boolean };

  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
}

async function patchTrainerById(
  trainerId: number,
  payload: ReturnType<typeof buildTrainerEditPayload>,
) {
  const response = await patchTrainerPublication(
    new Request(`http://localhost:3000/api/trainers/${trainerId}`, {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    }),
    {
      params: Promise.resolve({ id: String(trainerId) }),
    },
  );
  const body = (await response.json()) as { error?: string; success?: boolean };

  expect(response.status).toBe(200);
  expect(body.success).toBe(true);
}

describe('edit-flow public surfaces integration (Step 15.7)', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('после edit существующего клуба обновляет кабинет, клубный каталог, detail page и booking-context без смены slug', async () => {
    const targetDate = getDateKeyInTimeZone();

    loginAsProvider();

    const initialCabinet = render(await ProviderProfileRoute());

    expect(screen.getByTestId('provider-summary-publications')).toHaveTextContent('5');
    expect(screen.getByRole('link', { name: 'Volna Aquatic Club' })).toHaveAttribute(
      'href',
      '/clubs/volna-aquatic-club',
    );

    initialCabinet.unmount();

    await patchClubById(1, buildClubEditPayload(targetDate));

    const updatedCabinet = render(await ProviderProfileRoute());

    expect(screen.getByTestId('provider-summary-publications')).toHaveTextContent('5');
    expect(screen.getByRole('link', { name: 'Volna Aquatic Club Prime' })).toHaveAttribute(
      'href',
      '/clubs/volna-aquatic-club',
    );

    updatedCabinet.unmount();

    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });

    const homePage = render(await Home());

    expect(screen.getAllByText('Volna Aquatic Club Prime').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Утреннее плавание Reloaded').length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByRole('link', { name: /Volna Aquatic Club Prime/i })
        .some((link) => link.getAttribute('href') === '/clubs/volna-aquatic-club'),
    ).toBe(true);
    expect(screen.queryByText('Volna Aquatic Club')).not.toBeInTheDocument();

    homePage.unmount();

    const clubDetail = render(
      await ClubDetailPage({ params: Promise.resolve({ slug: 'volna-aquatic-club' }) }),
    );

    expect(screen.getByRole('heading', { name: 'Volna Aquatic Club Prime' })).toBeInTheDocument();
    expect(screen.getByText('Утреннее плавание Reloaded')).toBeInTheDocument();
    expect(screen.getByText('Дневной пилатес Prime')).toBeInTheDocument();
    expect(screen.getByText('Вечернее плавание Recovery')).toBeInTheDocument();

    clubDetail.unmount();

    render(await BookingPage({ params: Promise.resolve({ scheduleId: '1' }) }));

    expect(screen.getAllByText('Volna Aquatic Club Prime').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Утреннее плавание Reloaded' })).toBeInTheDocument();
    expect(screen.getByText('ул. Мориса Тореза, 17')).toBeInTheDocument();
    expect(screen.getByText('Бассейн PRO')).toBeInTheDocument();
  });

  it('после edit новой trainer-публикации обновляет кабинет, trainer-каталог, detail page и booking-context без смены slug', async () => {
    const targetDate = getDateKeyInTimeZone();
    const { clubResult, trainerResult } = await publishCatalogPair({
      clearExisting: true,
      dataDirectory,
      targetDate,
    });

    loginAsProvider();

    const initialCabinet = render(await ProviderProfileRoute());

    expect(screen.getByTestId('provider-summary-publications')).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: 'Ilya Volkov' })).toHaveAttribute(
      'href',
      `/trainers/${trainerResult.trainer.slug}`,
    );

    initialCabinet.unmount();

    await patchTrainerById(
      trainerResult.trainer.id,
      buildTrainerEditPayload(trainerResult.schedules[0].id, clubResult.club.id, targetDate),
    );

    const updatedCabinet = render(await ProviderProfileRoute());

    expect(screen.getByTestId('provider-summary-publications')).toHaveTextContent('2');
    expect(screen.getByRole('link', { name: 'Ilya Ocean' })).toHaveAttribute(
      'href',
      `/trainers/${trainerResult.trainer.slug}`,
    );

    updatedCabinet.unmount();

    const homePage = render(await Home());

    fireEvent.click(screen.getByRole('button', { name: 'По тренерам и направлениям' }));

    expect(
      screen.getByRole('heading', { name: 'Тренеры под текущие фильтры' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Ilya Ocean').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Скоростная персональная тренировка').length).toBeGreaterThan(0);
    expect(
      screen
        .getAllByRole('link', { name: /Ilya Ocean/i })
        .some((link) => link.getAttribute('href') === `/trainers/${trainerResult.trainer.slug}`),
    ).toBe(true);
    expect(screen.queryByText('Ilya Volkov')).not.toBeInTheDocument();

    homePage.unmount();

    const trainerDetail = render(
      await TrainerDetailPage({
        params: Promise.resolve({ slug: trainerResult.trainer.slug }),
      }),
    );

    expect(screen.getAllByText('Ilya Ocean').length).toBeGreaterThan(0);
    expect(screen.getByText('Скоростная персональная тренировка')).toBeInTheDocument();
    expect(screen.getByText('Скоростная дорожка')).toBeInTheDocument();
    expect(screen.getAllByText('Start Swim Lab').length).toBeGreaterThan(0);

    trainerDetail.unmount();

    render(
      await BookingPage({
        params: Promise.resolve({ scheduleId: String(trainerResult.schedules[0].id) }),
      }),
    );

    expect(screen.getAllByText('Ilya Ocean').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Скоростная дорожка' })).toBeInTheDocument();
    expect(screen.getAllByText('Открытая дорожка 2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Start Swim Lab').length).toBeGreaterThan(0);
  });
});
