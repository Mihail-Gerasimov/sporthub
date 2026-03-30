import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import ClubDetailPage from '@/app/clubs/[slug]/page';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import {
  fixtureClub,
  fixtureClubOffering,
  fixtureClubSlot1,
  seedTestData,
} from '@/test/helpers/seed-fixtures';

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

  async function writeCollection(filename: string, data: unknown) {
    await writeFile(path.join(dataDirectory, filename), `${JSON.stringify(data, null, 2)}\n`);
  }

  it('рендерит публичную страницу клуба с ключевыми секциями', async () => {
    render(await ClubDetailPage({ params: Promise.resolve({ slug: 'volna-aquatic-club' }) }));

    expect(screen.getByRole('heading', { name: 'Volna Aquatic Club' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Направления клуба' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Тренеры клуба' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Расписание на неделю' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Отзывы клуба' })).toBeInTheDocument();
    expect(screen.getAllByText('Фото клуба').length).toBeGreaterThan(0);
  });

  it('отдаёт notFound для несуществующего клуба', async () => {
    await expect(
      ClubDetailPage({ params: Promise.resolve({ slug: 'missing-club' }) }),
    ).rejects.toMatchObject({
      digest: expect.stringContaining('404'),
    });
  });

  it('не ломается на минимальной provider-публикации без rich-content', async () => {
    const minimalClub = {
      ...fixtureClub,
      id: 101,
      slug: 'start-swim-club',
      name: 'Start Swim Club',
      description: 'Новый клуб с базовой публикацией и первым расписанием.',
      shortDescription: 'Первая публикация клуба без галереи и отзывов.',
      imageUrls: [],
      amenities: [],
      tags: [],
      rating: 0,
      reviewCount: 0,
      isFeatured: false,
      source: 'provider' as const,
      status: 'published' as const,
    };
    const minimalOffering = {
      ...fixtureClubOffering,
      id: 201,
      ownerId: minimalClub.id,
      affiliatedClubId: minimalClub.id,
      title: 'Стартовая группа',
      description: minimalClub.description,
      price: 1200,
      address: minimalClub.address,
    };
    const minimalSchedule = {
      ...fixtureClubSlot1,
      id: 301,
      offeringId: minimalOffering.id,
      ownerId: minimalClub.id,
      clubId: minimalClub.id,
      trainerId: undefined,
      title: 'Стартовая группа',
      price: 1200,
      room: 'Зал A',
    };

    await Promise.all([
      writeCollection('clubs.json', [minimalClub]),
      writeCollection('trainers.json', []),
      writeCollection('offerings.json', [minimalOffering]),
      writeCollection('schedule.json', [minimalSchedule]),
      writeCollection('reviews.json', []),
      writeCollection('bookings.json', []),
    ]);

    render(await ClubDetailPage({ params: Promise.resolve({ slug: 'start-swim-club' }) }));

    expect(screen.getByRole('heading', { name: 'Start Swim Club' })).toBeInTheDocument();
    expect(screen.getByTestId('club-media-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('club-media-gallery-secondary')).not.toBeInTheDocument();
    expect(screen.getByTestId('club-trainers-empty')).toBeInTheDocument();
    expect(screen.getByTestId('club-reviews-empty')).toBeInTheDocument();
    expect(screen.getByText('Стартовая группа')).toBeInTheDocument();
  });
});
