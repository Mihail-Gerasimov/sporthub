import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import TrainerDetailPage from '@/app/trainers/[slug]/page';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import {
  fixtureTrainer,
  fixtureTrainerOffering,
  fixtureTrainerSlot,
  seedTestData,
} from '@/test/helpers/seed-fixtures';

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

  async function writeCollection(filename: string, data: unknown) {
    await writeFile(path.join(dataDirectory, filename), `${JSON.stringify(data, null, 2)}\n`);
  }

  it('рендерит публичную страницу тренера с ключевыми секциями', async () => {
    render(await TrainerDetailPage({ params: Promise.resolve({ slug: 'marina-sokolova' }) }));

    /* Имя тренера из данных */
    expect(screen.getByRole('heading', { name: 'Марина Соколова' })).toBeInTheDocument();
    /* Ключевые секции страницы */
    expect(screen.getByRole('heading', { name: 'Услуги тренера' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Расписание' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Отзывы' })).toBeInTheDocument();
  });

  it('отдаёт notFound для несуществующего тренера', async () => {
    await expect(
      TrainerDetailPage({ params: Promise.resolve({ slug: 'missing-trainer' }) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });

  it('отдаёт notFound для пустого slug', async () => {
    await expect(
      TrainerDetailPage({ params: Promise.resolve({ slug: '' }) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });

  it('не ломается на минимальной provider-публикации тренера без связанного клуба и отзывов', async () => {
    const minimalTrainer = {
      ...fixtureTrainer,
      id: 101,
      slug: 'ivan-belov',
      name: 'Иван Белов',
      bio: 'Новый тренер с первой опубликованной услугой.',
      avatarUrl: '',
      reviewCount: 0,
      rating: 0,
      affiliatedClubId: undefined,
      source: 'provider' as const,
      status: 'published' as const,
    };
    const minimalOffering = {
      ...fixtureTrainerOffering,
      id: 201,
      ownerId: minimalTrainer.id,
      affiliatedClubId: undefined,
      title: 'Персональная тренировка: Плавание',
      description: 'Первая персональная услуга без привязки к клубу.',
      address: minimalTrainer.address ?? 'ул. Лесная, 23к1',
    };
    const minimalSchedule = {
      ...fixtureTrainerSlot,
      id: 301,
      offeringId: minimalOffering.id,
      ownerId: minimalTrainer.id,
      trainerId: minimalTrainer.id,
      affiliatedClubId: undefined,
      title: 'Персональная тренировка: Плавание',
      room: 'Индивидуальный зал',
    };

    await Promise.all([
      writeCollection('clubs.json', []),
      writeCollection('trainers.json', [minimalTrainer]),
      writeCollection('offerings.json', [minimalOffering]),
      writeCollection('schedule.json', [minimalSchedule]),
      writeCollection('reviews.json', []),
      writeCollection('bookings.json', []),
    ]);

    render(await TrainerDetailPage({ params: Promise.resolve({ slug: 'ivan-belov' }) }));

    expect(screen.getByRole('heading', { name: 'Иван Белов' })).toBeInTheDocument();
    expect(screen.queryByTestId('trainer-affiliated-club-section')).not.toBeInTheDocument();
    expect(screen.getByTestId('trainer-reviews-empty')).toBeInTheDocument();
    expect(screen.getAllByText('Персональная тренировка: Плавание').length).toBeGreaterThan(0);
    expect(screen.getByText('Индивидуальный зал')).toBeInTheDocument();
  });
});
