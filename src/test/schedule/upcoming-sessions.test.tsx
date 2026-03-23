import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { UpcomingSessions } from '@/components/schedule/UpcomingSessions';
import { useFilterStore } from '@/stores/useFilterStore';
import type { UpcomingSessionItem } from '@/components/schedule/getUpcomingSessions';
import type { TrainerAvailabilityItem } from '@/components/trainers';

const sessions: UpcomingSessionItem[] = [
  {
    id: 35,
    title: 'Утреннее плавание',
    clubId: 1,
    clubName: 'Volna Aquatic Club',
    date: '2026-03-17',
    startTime: '07:30',
    endTime: '08:30',
    price: 1100,
    room: 'Бассейн A',
    availableSpots: 6,
  },
  {
    id: 33,
    title: 'Утренняя хатха-йога',
    clubId: 3,
    clubName: 'Balance Yoga House',
    date: '2026-03-17',
    startTime: '09:00',
    endTime: '10:00',
    price: 900,
    room: 'Зал Light',
    availableSpots: 6,
  },
];

const trainerSlots: TrainerAvailabilityItem[] = [
  {
    id: 1001,
    trainerId: 1,
    trainerName: 'Марина Соколова',
    title: 'Персональная тренировка: Плавание',
    date: '2026-03-20',
    startTime: '08:15',
    endTime: '09:15',
    price: 1400,
    room: 'Индивидуальный зал',
    availableSpots: 1,
    format: 'personal',
    venueLabel: 'Volna Aquatic Club',
  },
];

describe('UpcomingSessions', () => {
  beforeEach(() => {
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });
  });

  it('рендерит карточки ближайших занятий со ссылками в сценарий записи', () => {
    render(
      <UpcomingSessions
        dateLabel="17 марта"
        sessions={sessions}
        trainerDateLabel="20 марта"
        trainerSlots={trainerSlots}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Ближайшие занятия' })).toBeInTheDocument();
    expect(screen.getByText('17 марта')).toBeInTheDocument();
    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.getAllByText('Свободно 6 мест')).toHaveLength(2);
    expect(screen.getByText('07:30 - 08:30')).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/booking/35', '/booking/33']);
  });

  it('в trainer-mode показывает свободные окна тренеров', () => {
    useFilterStore.setState({
      discoveryMode: 'trainers',
      searchQuery: '',
      selectedSportId: null,
    });

    render(
      <UpcomingSessions
        dateLabel="17 марта"
        sessions={sessions}
        trainerDateLabel="20 марта"
        trainerSlots={trainerSlots}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Свободные окна тренеров' })).toBeInTheDocument();
    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
    expect(screen.getByText('Персональная тренировка: Плавание')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Открыть запись к тренеру Марина Соколова' }),
    ).toHaveAttribute('href', '/booking/1001');
  });
});
