/*
 * Тесты TrainerAvailability — секция «Свободные окна тренеров» на главной
 * (Phase 28.12). Проверяем: CardSlider с правильными props (eyebrow/title/
 * accent/visibleByBp), tools-блок (pill «Ближайшие» + chip даты), маппинг
 * слотов в общий SlotCard (Phase 28.13), auth-guard onSelect (athlete → router.push,
 * иначе → toast).
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TrainerAvailability } from '@/components/trainers/TrainerAvailability';
import { useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';

import type { TrainerAvailabilityItem } from '@/components/trainers/trainer-preview';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

function makeSlot(overrides: Partial<TrainerAvailabilityItem> = {}): TrainerAvailabilityItem {
  return {
    id: 1,
    trainerId: 1,
    trainerName: 'Тренер Иванов',
    title: 'Бокс',
    date: '2026-05-05',
    startTime: '19:00',
    endTime: '20:00',
    price: 1500,
    room: 'Зал 1',
    availableSpots: 4,
    format: 'personal',
    venueLabel: 'Клуб Альфа',
    ...overrides,
  };
}

beforeEach(() => {
  pushMock.mockClear();
  useAuthStore.setState({
    user: null,
    accountType: null,
    isAuthenticated: false,
    isAdmin: false,
    isImpersonating: false,
    adminOriginalUser: null,
  });
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  pushMock.mockClear();
});

describe('TrainerAvailability', () => {
  it('рендерит eyebrow «Trainer availability» и заголовок «Свободные окна тренеров»', () => {
    render(<TrainerAvailability dateLabel="4 мая" slots={[makeSlot()]} />);
    expect(screen.getByText(/trainer availability/i)).toBeInTheDocument();
    expect(screen.getByText(/Свободные окна тренеров/i)).toBeInTheDocument();
  });

  it('tools содержит pill «Ближайшие» и chip с переданным dateLabel', () => {
    render(<TrainerAvailability dateLabel="7 июня" slots={[makeSlot()]} />);
    expect(screen.getByText(/Ближайшие/i)).toBeInTheDocument();
    expect(screen.getByText('7 июня')).toBeInTheDocument();
  });

  it('маппит слоты в SlotCard (имя тренера видно в карточке)', () => {
    render(
      <TrainerAvailability
        dateLabel="4 мая"
        slots={[
          makeSlot({ id: 1, trainerName: 'Анна Кузнецова' }),
          makeSlot({ id: 2, trainerName: 'Борис Петров' }),
        ]}
      />,
    );
    expect(screen.getByText('Анна Кузнецова')).toBeInTheDocument();
    expect(screen.getByText('Борис Петров')).toBeInTheDocument();
  });

  it('клик «К записи» как athlete → router.push("/booking/{id}")', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
    });
    render(<TrainerAvailability dateLabel="4 мая" slots={[makeSlot({ id: 42 })]} />);
    fireEvent.click(screen.getByRole('button', { name: /к записи/i }));
    expect(pushMock).toHaveBeenCalledWith('/booking/42');
  });

  it('клик «К записи» как guest → router.push НЕ вызывается, добавляется toast', () => {
    render(<TrainerAvailability dateLabel="4 мая" slots={[makeSlot({ id: 42 })]} />);
    fireEvent.click(screen.getByRole('button', { name: /к записи/i }));
    expect(pushMock).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts.length).toBe(1);
  });

  it('пустой массив slots — empty-state CardSlider рендерится', () => {
    render(<TrainerAvailability dateLabel="4 мая" slots={[]} />);
    // CardSlider в empty-state рендерит eyebrow+title+emptyMessage,
    // но НЕ rail и НЕ dots.
    expect(document.querySelector('[data-card-slider-rail]')).toBeNull();
  });
});
