import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { UpcomingSessions } from '@/components/schedule/UpcomingSessions';
import type { UpcomingSessionItem } from '@/components/schedule/getUpcomingSessions';

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

describe('UpcomingSessions', () => {
  it('рендерит карточки ближайших занятий со ссылками в сценарий записи', () => {
    render(<UpcomingSessions sessions={sessions} dateLabel="17 марта" />);

    expect(screen.getByRole('heading', { name: 'Ближайшие занятия' })).toBeInTheDocument();
    expect(screen.getByText('17 марта')).toBeInTheDocument();
    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.getAllByText('Свободно 6 мест')).toHaveLength(2);
    expect(screen.getByText('07:30 - 08:30')).toBeInTheDocument();

    const links = screen.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/booking/35', '/booking/33']);
  });
});
