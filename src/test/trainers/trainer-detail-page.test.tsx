import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import TrainerDetailPage from '@/app/trainers/[id]/page';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('Trainer detail page', () => {
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

  it('рендерит публичную страницу тренера с ключевыми секциями', async () => {
    render(await TrainerDetailPage({ params: Promise.resolve({ id: '1' }) }));

    /* Имя тренера из данных */
    expect(screen.getByRole('heading', { name: 'Марина Соколова' })).toBeInTheDocument();
    /* Ключевые секции страницы */
    expect(screen.getByRole('heading', { name: 'Услуги тренера' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Расписание' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Отзывы' })).toBeInTheDocument();
  });

  it('отдаёт notFound для несуществующего тренера', async () => {
    await expect(
      TrainerDetailPage({ params: Promise.resolve({ id: '999' }) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });

  it('отдаёт notFound для невалидного id', async () => {
    await expect(
      TrainerDetailPage({ params: Promise.resolve({ id: 'abc' }) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });
});
