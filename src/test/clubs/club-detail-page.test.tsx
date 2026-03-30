import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import ClubDetailPage from '@/app/clubs/[id]/page';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('Club detail page', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('рендерит публичную страницу клуба с ключевыми секциями', async () => {
    render(await ClubDetailPage({ params: Promise.resolve({ id: '1' }) }));

    expect(screen.getByRole('heading', { name: 'Volna Aquatic Club' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Направления клуба' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Тренеры клуба' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Расписание на неделю' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Отзывы клуба' })).toBeInTheDocument();
    expect(screen.getAllByText('Фото клуба').length).toBeGreaterThan(0);
  });

  it('отдаёт notFound для несуществующего клуба', async () => {
    await expect(ClubDetailPage({ params: Promise.resolve({ id: '999' }) })).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });
});
