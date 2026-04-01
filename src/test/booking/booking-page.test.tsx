// Тесты booking page: preview-часть страницы и интеграция action block (Step 16.3)
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
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('Booking page', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isAuthModalOpen: false });
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
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
