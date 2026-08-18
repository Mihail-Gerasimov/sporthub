// Phase 24 Step 24.15: тесты BookingStatusHistoryDrawer — drawer рендерит
// таймлайн Booking.statusHistory (from→to, actor, at, reason). Используется
// админом для диагностики конкретного booking'а.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BookingStatusHistoryDrawer } from '@/components/admin/BookingStatusHistoryDrawer';
import type { Booking } from '@sporthub/types';

const fixtureBooking: Booking = {
  id: 42,
  createdAt: '2026-03-10T12:00:00.000Z',
  scheduleId: 1,
  offeringId: 1,
  ownerType: 'club',
  ownerId: 1,
  userId: 1,
  clubId: 1,
  sportId: 1,
  date: '2026-03-15',
  status: 'completed',
  paymentStatus: 'paid',
  totalPrice: 1000,
  statusHistory: [
    {
      from: null,
      to: 'pending',
      actor: 'athlete',
      actorUserId: 1,
      at: '2026-03-10T12:00:00.000Z',
    },
    {
      from: 'pending',
      to: 'confirmed',
      actor: 'provider',
      actorUserId: 2,
      at: '2026-03-10T13:00:00.000Z',
      reason: 'Принято',
    },
    {
      from: 'confirmed',
      to: 'completed',
      actor: 'provider',
      actorUserId: 2,
      at: '2026-03-15T20:00:00.000Z',
    },
  ],
};

describe('BookingStatusHistoryDrawer', () => {
  it('при open=false не рендерит содержимое', () => {
    render(<BookingStatusHistoryDrawer open={false} onClose={() => {}} booking={fixtureBooking} />);
    expect(screen.queryByText(/таймлайн|statushistory/i)).toBeNull();
  });

  it('при open=true рендерит все записи statusHistory', () => {
    render(<BookingStatusHistoryDrawer open onClose={() => {}} booking={fixtureBooking} />);

    expect(screen.getAllByText(/pending/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/confirmed/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/completed/).length).toBeGreaterThanOrEqual(1);
    // Reason отображается
    expect(screen.getByText(/Принято/)).toBeInTheDocument();
    // Таймлайн из 3 записей
    const items = screen.getByTestId('booking-status-history-timeline').querySelectorAll('li');
    expect(items.length).toBe(3);
  });

  it('booking без statusHistory — рендерит плашку «История пуста»', () => {
    const withoutHistory = { ...fixtureBooking, statusHistory: undefined };
    render(<BookingStatusHistoryDrawer open onClose={() => {}} booking={withoutHistory} />);

    expect(screen.getByText(/история пуста|нет истории/i)).toBeInTheDocument();
  });

  it('booking=null → ничего не рендерит', () => {
    const { container } = render(
      <BookingStatusHistoryDrawer open onClose={() => {}} booking={null} />,
    );
    expect(container.textContent).toBe('');
  });
});
