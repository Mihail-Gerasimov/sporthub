import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import BookingPage from '@/app/booking/[scheduleId]/page';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';

describe('Booking page', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('рендерит booking details для club slot без stub-копирайта', async () => {
    render(await BookingPage({ params: Promise.resolve({ scheduleId: '1' }) }));

    expect(screen.getByRole('heading', { name: 'Запись на занятие' })).toBeInTheDocument();
    expect(screen.getByText('Услуга клуба')).toBeInTheDocument();
    expect(screen.getAllByText('Volna Aquatic Club').length).toBeGreaterThan(0);
    expect(screen.getByText('Утреннее плавание')).toBeInTheDocument();
    expect(screen.queryByText(/MVP booking stub/i)).not.toBeInTheDocument();
  });

  it('рендерит booking details для trainer slot с независимым owner и площадкой', async () => {
    render(await BookingPage({ params: Promise.resolve({ scheduleId: '1001' }) }));

    expect(screen.getByText('Услуга тренера')).toBeInTheDocument();
    expect(screen.getAllByText('Марина Соколова').length).toBeGreaterThan(0);
    expect(screen.getByText('Персональная тренировка: Плавание')).toBeInTheDocument();
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
