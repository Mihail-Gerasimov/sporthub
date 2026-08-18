/*
 * Тесты ClubAvailability — секция «Ближайшие занятия» на главной для
 * режима clubs (Phase 28.13). Проверяем интеграцию с CardSlider и
 * правильный маппинг UpcomingSessionItem на нейтральный SlotCard.
 *
 * Auth-guard здесь не живёт — тестируем что onSelect callback вызывается
 * с session.id, а реальный auth-flow делегирован UpcomingSessions.tsx.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ClubAvailability } from '@/components/schedule/ClubAvailability';

import type { UpcomingSessionItem } from '@/components/schedule/getUpcomingSessions';

function makeSession(overrides: Partial<UpcomingSessionItem> = {}): UpcomingSessionItem {
  return {
    id: 1,
    title: 'Айкидо',
    clubId: 1,
    clubName: 'Самарская федерация Айкидо',
    date: '2026-05-05',
    startTime: '18:00',
    endTime: '18:40',
    price: 1000,
    room: 'Зал для единоборств',
    availableSpots: 11,
    ...overrides,
  };
}

describe('ClubAvailability', () => {
  it('рендерит eyebrow «Sessions today» и заголовок «Ближайшие занятия»', () => {
    render(<ClubAvailability dateLabel="5 мая" sessions={[makeSession()]} onSelect={vi.fn()} />);
    expect(screen.getByText(/sessions today/i)).toBeInTheDocument();
    expect(screen.getByText(/Ближайшие занятия/i)).toBeInTheDocument();
  });

  it('tools содержит pill «Сегодня» и chip с переданным dateLabel', () => {
    render(<ClubAvailability dateLabel="7 июня" sessions={[makeSession()]} onSelect={vi.fn()} />);
    expect(screen.getByText('Сегодня')).toBeInTheDocument();
    expect(screen.getByText('7 июня')).toBeInTheDocument();
  });

  it('маппит сессии в SlotCard с eyebrow «Групповое занятие», name=title, sport=clubName', () => {
    render(
      <ClubAvailability
        dateLabel="5 мая"
        sessions={[
          makeSession({ id: 1, title: 'Кроссфит', clubName: 'Амстафф' }),
          makeSession({ id: 2, title: 'Бокс', clubName: 'Невесомость' }),
        ]}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getAllByText('Групповое занятие').length).toBeGreaterThan(0);
    expect(screen.getByText('Кроссфит')).toBeInTheDocument();
    expect(screen.getByText('Бокс')).toBeInTheDocument();
    expect(screen.getAllByText('Амстафф').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Невесомость').length).toBeGreaterThan(0);
  });

  it('клик «К записи» вызывает onSelect(session.id) — auth-guard не внутри', () => {
    const onSelect = vi.fn();
    render(
      <ClubAvailability
        dateLabel="5 мая"
        sessions={[makeSession({ id: 42, title: 'Утреннее плавание' })]}
        onSelect={onSelect}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'К записи: Утреннее плавание' }));
    expect(onSelect).toHaveBeenCalledWith(42);
  });

  it('пустой массив sessions — empty-state CardSlider рендерится', () => {
    render(<ClubAvailability dateLabel="5 мая" sessions={[]} onSelect={vi.fn()} />);
    expect(document.querySelector('[data-card-slider-rail]')).toBeNull();
  });
});
