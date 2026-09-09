import { screen } from '@testing-library/react';
import { renderWithToast as render } from '@/test/helpers/render-with-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UpcomingSessions } from '@/components/schedule/UpcomingSessions';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFilterStore } from '@/stores/useFilterStore';
import type { UpcomingSessionItem } from '@/components/schedule/getUpcomingSessions';
import type { TrainerAvailabilityItem } from '@/components/trainers';

/* Мок next/navigation для useRouter */
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

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
    useAuthStore.setState({
      isAuthenticated: false,
      accountKind: null,
      faces: [],
      activeFaceKey: null,
      user: null,
    });
  });

  it('рендерит карточки ближайших занятий с кнопками перехода к записи', () => {
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
    /* Phase 28.13: clubName рендерится дважды — как sport под title и как
     * venueLabel в footer. Проверяем что хотя бы одно вхождение есть. */
    expect(screen.getAllByText('Volna Aquatic Club').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Свободно 6 мест')).toHaveLength(2);
    expect(screen.getByText(/07:30\s*[–-]\s*08:30/)).toBeInTheDocument();

    /* Phase 28.13: ClubAvailability — auth-guard на CTA «К записи: <title>».
     * Кнопки теперь только CTA внутри SlotCard + 2 стрелки prev/next + ≤dots,
     * поэтому считаем CTA по точному имени. */
    const sessionCtas = sessions.map((s) =>
      screen.getByRole('button', { name: `К записи: ${s.title}` }),
    );
    expect(sessionCtas).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'К записи: Утреннее плавание' })).toBeInTheDocument();
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

    /* Phase 28.12: TrainerAvailability через CardSlider + TrainerSlotCard.
     * Кликабелен только CTA «К записи: <имя>», auth-гейт — на нём. */
    expect(screen.getByRole('button', { name: 'К записи: Марина Соколова' })).toBeInTheDocument();
  });

  it('показывает notice при клике без авторизации', async () => {
    const { fireEvent } = await import('@testing-library/react');

    render(
      <UpcomingSessions
        dateLabel="17 марта"
        sessions={sessions}
        trainerDateLabel="20 марта"
        trainerSlots={trainerSlots}
      />,
    );

    const button = screen.getByRole('button', {
      name: 'К записи: Утреннее плавание',
    });
    fireEvent.click(button);

    expect(screen.getByText('Чтобы записаться, войдите или зарегистрируйтесь')).toBeInTheDocument();
  });
});
