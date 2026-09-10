// Тесты секции «Входящие записи» провайдер-кабинета (Step 12.6)
import { screen } from '@testing-library/react';
import { renderInFaceCabinet } from '@/test/helpers/cabinet';
import { describe, expect, it } from 'vitest';

import type { ProviderIncomingBooking } from '@/components/profile/provider-helpers';
import { ProviderBookingsSection } from '@/components/profile/ProviderBookingsSection';

const bookings: ProviderIncomingBooking[] = [
  {
    id: 1,
    athleteEmail: 'alexey@sporthub.local',
    athleteName: 'Алексей Миронов',
    bookingTypeLabel: 'Услуга клуба',
    contextLabel: 'Volna Aquatic Club',
    date: '2099-03-18',
    endTime: '09:00',
    locationLabel: 'Volna Aquatic Club · Дорожка 3',
    paymentLabel: 'Оплачено',
    startTime: '08:00',
    statusLabel: 'Подтверждена',
    statusTone: 'success',
    timeLabel: '08:00 - 09:00',
    title: 'Групповая дорожка',
    totalPrice: 1150,
  },
  {
    id: 2,
    athleteEmail: 'alexey@sporthub.local',
    athleteName: 'Алексей Миронов',
    bookingTypeLabel: 'Услуга тренера',
    contextLabel: 'Тимур Каримов · North Ring',
    date: '2099-03-20',
    endTime: '19:30',
    locationLabel: 'North Ring · Зал единоборств',
    paymentLabel: 'Не оплачено',
    startTime: '18:30',
    statusLabel: 'Ожидает подтверждения',
    statusTone: 'outline',
    timeLabel: '18:30 - 19:30',
    title: 'Персональная техника удара',
    totalPrice: 1600,
  },
];

describe('ProviderBookingsSection', () => {
  it('рендерит заголовок и карточки записей', () => {
    renderInFaceCabinet(<ProviderBookingsSection bookings={bookings} />);

    expect(screen.getByText('Входящие записи')).toBeInTheDocument();
    expect(screen.getByText(/1 150/)).toBeInTheDocument();
    expect(screen.getByText(/1 600/)).toBeInTheDocument();
  });

  it('отображает спортсмена, услугу, статус и дату каждой записи', () => {
    renderInFaceCabinet(<ProviderBookingsSection bookings={bookings} />);

    expect(screen.getAllByText('Алексей Миронов')).toHaveLength(2);
    expect(screen.getByText('Групповая дорожка')).toBeInTheDocument();
    expect(screen.getByText('Персональная техника удара')).toBeInTheDocument();
    expect(screen.getByText('Подтверждена')).toBeInTheDocument();
    expect(screen.getByText('Ожидает подтверждения')).toBeInTheDocument();
    expect(screen.getByText(/18 марта/)).toBeInTheDocument();
    expect(screen.getByText(/20 марта/)).toBeInTheDocument();
  });

  it('отображает тип записи, контекст и работает как read-only карточка', () => {
    renderInFaceCabinet(<ProviderBookingsSection bookings={bookings} />);

    expect(screen.getByText('Услуга клуба')).toBeInTheDocument();
    expect(screen.getByText('Услуга тренера')).toBeInTheDocument();
    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.getByText('Тимур Каримов · North Ring')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('показывает пустое состояние при отсутствии записей', () => {
    renderInFaceCabinet(<ProviderBookingsSection bookings={[]} />);

    expect(screen.getByText(/Нет входящих записей/)).toBeInTheDocument();
  });
});
