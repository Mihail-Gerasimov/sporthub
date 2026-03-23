import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '@/app/page';
import { useFilterStore } from '@/stores/useFilterStore';

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
  beforeEach(() => {
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });
  });

  it('рендерит собранную главную с ключевыми секциями и переключает discovery mode', async () => {
    render(await Home());

    expect(screen.getByRole('heading', { name: 'Найди спорт в своём ритме' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Поиск по клубам и направлениям' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Клубы на карте и в списке' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Популярное рядом' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ближайшие занятия' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'MVP в разработке' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'По тренерам и направлениям' }));

    expect(
      screen.getByRole('heading', { name: 'Поиск по тренерам и направлениям' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Тренеры на карте и в списке' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Популярные тренеры' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Свободные окна тренеров' })).toBeInTheDocument();
  });
});
