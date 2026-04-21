// Тесты AthleteBookingTimeline (Step 25.4): читабельный список FSM-переходов для атлета.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AthleteBookingTimeline } from '@/components/profile/athlete/AthleteBookingTimeline';
import type { BookingStatusTransition } from '@/types';

describe('AthleteBookingTimeline', () => {
  it('рендерит все non-system переходы с label и датой', () => {
    const history: BookingStatusTransition[] = [
      { from: null, to: 'pending', actor: 'athlete', at: '2026-04-20T10:00:00.000Z' },
      { from: 'pending', to: 'confirmed', actor: 'provider', at: '2026-04-21T12:00:00.000Z' },
      {
        from: 'confirmed',
        to: 'cancelled_by_athlete',
        actor: 'athlete',
        at: '2026-04-22T15:00:00.000Z',
        reason: 'late',
      },
    ];

    render(<AthleteBookingTimeline history={history} />);

    const items = screen.getAllByRole('listitem');

    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent('Вы записались');
    expect(items[1]).toHaveTextContent('Провайдер подтвердил');
    expect(items[2]).toHaveTextContent(/Вы отменили/);
    expect(items[2]).toHaveTextContent(/поздняя отмена/i);
  });

  it('формат даты — ru-RU с днём, месяцем и временем', () => {
    const history: BookingStatusTransition[] = [
      { from: null, to: 'pending', actor: 'athlete', at: '2026-04-20T10:00:00.000Z' },
    ];

    render(<AthleteBookingTimeline history={history} />);

    const item = screen.getByRole('listitem');

    // Формат должен содержать «20», «апр» или «апреля», и время «:00».
    expect(item).toHaveTextContent(/20/);
    expect(item).toHaveTextContent(/апр/i);
    expect(item).toHaveTextContent(/:\d{2}/);
  });

  it('пустая история — показывает placeholder «История пуста»', () => {
    render(<AthleteBookingTimeline history={[]} />);

    expect(screen.getByText(/История пуста/i)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
