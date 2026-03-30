import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BookingPage from '@/app/booking/[scheduleId]/page';
import ClubDetailPage from '@/app/clubs/[slug]/page';
import Home from '@/app/page';
import TrainerDetailPage from '@/app/trainers/[slug]/page';
import { AUTH_STORAGE_KEY, AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useFilterStore } from '@/stores/useFilterStore';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { publishCatalogPair } from '@/test/helpers/publish-flow';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
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

describe('publish-flow catalog integration (Step 14.11)', () => {
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
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    localStorage.removeItem(AUTH_STORAGE_KEY);
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('подхватывает новые публикации в homepage sections, card lists и availability', async () => {
    const { clubResult, trainerResult } = await publishCatalogPair({
      clearExisting: true,
      dataDirectory,
    });

    render(await Home());

    expect(screen.getByText('1 клубов в каталоге')).toBeInTheDocument();
    expect(screen.getByText('1 тренеров в каталоге')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Клубы под текущие фильтры' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Популярное рядом' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ближайшие занятия' })).toBeInTheDocument();
    expect(screen.getAllByTestId('club-card-surface')).toHaveLength(2);
    expect(screen.getAllByText('Стартовая группа по плаванию').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', {
        name: 'Открыть запись на занятие Стартовая группа по плаванию',
      }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('link', { name: /Start Swim Lab/i })
        .some((link) => link.getAttribute('href') === `/clubs/${clubResult.club.slug}`),
    ).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'По тренерам и направлениям' }));

    expect(
      screen.getByRole('heading', { name: 'Тренеры под текущие фильтры' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Популярные тренеры' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Свободные окна тренеров' })).toBeInTheDocument();
    expect(screen.getAllByTestId('trainer-card-surface')).toHaveLength(2);
    expect(screen.getAllByText('Персональная тренировка по плаванию').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Start Swim Lab').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('button', {
        name: 'Открыть запись к тренеру Ilya Volkov',
      }),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('link', { name: /Ilya Volkov/i })
        .some((link) => link.getAttribute('href') === `/trainers/${trainerResult.trainer.slug}`),
    ).toBe(true);
    expect(
      screen
        .getAllByRole('link', { name: 'Перейти к записи' })
        .some((link) => link.getAttribute('href') === `/booking/${trainerResult.schedules[0].id}`),
    ).toBe(true);
  });

  it('открывает detail page нового клуба по slug после публикации', async () => {
    const { clubResult } = await publishCatalogPair({
      clearExisting: true,
      dataDirectory,
    });

    render(await ClubDetailPage({ params: Promise.resolve({ slug: clubResult.club.slug }) }));

    expect(screen.getByRole('heading', { name: 'Start Swim Lab' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Расписание на неделю' })).toBeInTheDocument();
    expect(screen.getByText('Стартовая группа по плаванию')).toBeInTheDocument();
    expect(screen.getByText('Новая публикация')).toBeInTheDocument();
  });

  it('открывает detail page нового тренера по slug после публикации', async () => {
    const { trainerResult } = await publishCatalogPair({
      clearExisting: true,
      dataDirectory,
    });

    render(
      await TrainerDetailPage({
        params: Promise.resolve({ slug: trainerResult.trainer.slug }),
      }),
    );

    expect(screen.getByRole('heading', { name: 'Ilya Volkov' })).toBeInTheDocument();
    expect(screen.getByTestId('trainer-affiliated-club-section')).toBeInTheDocument();
    expect(screen.getByText('Персональная тренировка по плаванию')).toBeInTheDocument();
    expect(screen.getAllByText('Start Swim Lab').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: 'Перейти к клубу' })).toHaveAttribute(
      'href',
      '/clubs/start-swim-lab',
    );
  });

  it('открывает рабочий booking-flow для нового trainer slot', async () => {
    const { trainerResult } = await publishCatalogPair({
      clearExisting: true,
      dataDirectory,
    });

    render(
      await BookingPage({
        params: Promise.resolve({ scheduleId: String(trainerResult.schedules[0].id) }),
      }),
    );

    expect(screen.getByRole('heading', { name: 'Запись на занятие' })).toBeInTheDocument();
    expect(screen.getByText('Услуга тренера')).toBeInTheDocument();
    expect(screen.getAllByText('Ilya Volkov').length).toBeGreaterThan(0);
    expect(screen.getByText('Персональная дорожка')).toBeInTheDocument();
    expect(screen.getAllByText('Start Swim Lab').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Бассейн A').length).toBeGreaterThan(0);
  });
});
