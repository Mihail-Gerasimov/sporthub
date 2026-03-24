// Тесты секции «Входящие записи» провайдер-кабинета (Step 12.6)
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProviderBookingsSection } from '@/components/profile/ProviderBookingsSection';
import type { Booking } from '@/types';

const bookings: Booking[] = [
  {
    id: 1,
    createdAt: '2026-03-18T10:00:00.000Z',
    scheduleId: 3,
    ownerType: 'club',
    ownerId: 1,
    userId: 1,
    clubId: 1,
    sportId: 3,
    date: '2026-03-18',
    status: 'confirmed',
    paymentStatus: 'paid',
    totalPrice: 1150,
  },
  {
    id: 2,
    createdAt: '2026-03-19T14:30:00.000Z',
    scheduleId: 1003,
    ownerType: 'trainer',
    ownerId: 3,
    userId: 1,
    trainerId: 3,
    sportId: 2,
    date: '2026-03-20',
    status: 'pending',
    paymentStatus: 'unpaid',
    totalPrice: 1600,
  },
];

describe('ProviderBookingsSection', () => {
  it('рендерит заголовок и карточки записей', () => {
    render(<ProviderBookingsSection bookings={bookings} />);

    expect(screen.getByText('Входящие записи')).toBeInTheDocument();
    expect(screen.getByText(/1 150/)).toBeInTheDocument();
    expect(screen.getByText(/1 600/)).toBeInTheDocument();
  });

  it('отображает статус и дату каждой записи', () => {
    render(<ProviderBookingsSection bookings={bookings} />);

    expect(screen.getByText('Подтверждена')).toBeInTheDocument();
    expect(screen.getByText('Ожидает')).toBeInTheDocument();
    // Даты
    expect(screen.getByText(/18 марта/)).toBeInTheDocument();
    expect(screen.getByText(/20 марта/)).toBeInTheDocument();
  });

  it('отображает тип сущности (клуб или тренер)', () => {
    render(<ProviderBookingsSection bookings={bookings} />);

    expect(screen.getByText('Клуб')).toBeInTheDocument();
    expect(screen.getByText('Тренер')).toBeInTheDocument();
  });

  it('показывает пустое состояние при отсутствии записей', () => {
    render(<ProviderBookingsSection bookings={[]} />);

    expect(screen.getByText(/Нет входящих записей/)).toBeInTheDocument();
  });
});
