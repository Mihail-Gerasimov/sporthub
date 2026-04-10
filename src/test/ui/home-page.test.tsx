import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '@/app/page';
import { useFilterStore } from '@/stores/useFilterStore';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';

/* Мок next/navigation для useRouter (используется в UpcomingSessions/TrainerAvailability) */
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  notFound: () => {
    throw new Error('Not found');
  },
}));

describe('Home page', () => {
  let dataDirectory: string | null = null;

  beforeEach(() => {
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;

    if (dataDirectory) {
      await removeIsolatedDataDirectory(dataDirectory);
      dataDirectory = null;
    }
  });

  it('рендерит собранную главную с ключевыми секциями и переключает discovery mode', async () => {
    render(await Home());

    expect(screen.getByRole('heading', { name: 'Найди спорт в своём ритме' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Поиск по клубам и направлениям' }),
    ).toBeInTheDocument();
    // Карта — секция с заголовком (без API-ключа → fallback провайдера)
    expect(screen.getByRole('heading', { name: 'Карта' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Популярное рядом' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ближайшие занятия' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Клубы под текущие фильтры' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'MVP в разработке' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'По тренерам и направлениям' }));

    expect(
      screen.getByRole('heading', { name: 'Поиск по тренерам и направлениям' }),
    ).toBeInTheDocument();
    // Карта не меняется при переключении mode
    expect(screen.getByRole('heading', { name: 'Карта' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Популярные тренеры' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Свободные окна тренеров' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Тренеры под текущие фильтры' }),
    ).toBeInTheDocument();
  });

  it('показывает честный empty-state, если каталог пуст', async () => {
    dataDirectory = await createIsolatedDataDirectory();
    const isolatedDataDirectory = dataDirectory;
    process.env.SPORT_HUB_DATA_DIRECTORY = isolatedDataDirectory;

    const writeCollection = async (filename: string, data: unknown) => {
      await writeFile(
        path.join(isolatedDataDirectory, filename),
        `${JSON.stringify(data, null, 2)}\n`,
      );
    };

    await Promise.all([
      writeCollection('clubs.json', []),
      writeCollection('trainers.json', []),
      writeCollection('offerings.json', []),
      writeCollection('schedule.json', []),
      writeCollection('reviews.json', []),
      writeCollection('bookings.json', []),
    ]);

    render(await Home());

    expect(screen.getByText('0 клубов в каталоге')).toBeInTheDocument();
    expect(screen.getByText('0 тренеров в каталоге')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Каталог пока пуст. Витрина начнёт заполняться новыми публикациями из кабинета провайдера.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId('popular-nearby-empty')).toBeInTheDocument();
    expect(
      screen.getByText(
        'На сегодня в расписании нет новых слотов. Проверь другие секции или открой клуб, чтобы посмотреть ближайшие даты.',
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'По тренерам и направлениям' }));

    expect(screen.getByTestId('popular-trainers-empty')).toBeInTheDocument();
    expect(
      screen.getByText(
        'У тренеров пока нет новых свободных окон. Проверь позже или переключись обратно в клубный режим, чтобы посмотреть ближайшие групповые слоты.',
      ),
    ).toBeInTheDocument();
  });
});
