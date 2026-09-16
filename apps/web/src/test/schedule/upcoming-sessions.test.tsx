import { act, screen } from '@testing-library/react';
import { renderWithToast as render } from '@/test/helpers/render-with-toast';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UpcomingSessions } from '@/components/schedule/UpcomingSessions';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFilterStore } from '@/stores/useFilterStore';
import type { UpcomingSessionItem } from '@/components/schedule/getUpcomingSessions';
import type { TrainerAvailabilityItem } from '@/components/trainers';
import type { Club } from '@sporthub/types';

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
    sportId: 3,
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
    sportId: 1,
    date: '2026-03-17',
    startTime: '09:00',
    endTime: '10:00',
    price: 900,
    room: 'Зал Light',
    availableSpots: 6,
  },
];

/** Клубы сессий — правило выдачи ищет по ним; оба в Самаре, виды разные. */
const clubs: Club[] = [1, 3].map((id) => ({
  id,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: id === 1 ? 'Volna Aquatic Club' : 'Balance Yoga House',
  slug: id === 1 ? 'volna' : 'balance',
  description: 'Описание',
  shortDescription: 'Коротко',
  city: 'Самара',
  address: 'ул. Лесная, 1',
  phone: '+7 (846) 200-11-01',
  email: 'hello@club.local',
  website: 'https://club.local',
  coordinates: { lat: 53.2, lng: 50.1 },
  sportIds: id === 1 ? [3] : [1],
  imageUrls: [],
  amenityIds: [],
  tagIds: [],
  rating: 4.8,
  reviewCount: 10,
  priceFrom: 900,
  distanceKm: 1,
}));

const sports = [
  { id: 1, name: 'Йога', icon: '🧘' },
  { id: 3, name: 'Плавание', icon: '🏊' },
];

/** Полный набор пропсов секции — сессии, каталог и справочник видов. */
const baseProps = { clubs, sports, dateLabel: '17 марта', trainerDateLabel: '20 марта' };

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
    render(<UpcomingSessions {...baseProps} sessions={sessions} trainerSlots={trainerSlots} />);

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

  it('слоты следуют за чипом: фильтр вида из стора сужает список, снятие — возвращает', () => {
    const { rerender } = render(
      <UpcomingSessions {...baseProps} sessions={sessions} trainerSlots={trainerSlots} />,
    );

    expect(screen.getAllByRole('button', { name: /^К записи:/ })).toHaveLength(2);

    // Чип «Йога» — тот же путь, что у карточек: стор поиска.
    act(() => {
      useFilterStore.getState().setSport(1);
    });
    rerender(<UpcomingSessions {...baseProps} sessions={sessions} trainerSlots={trainerSlots} />);
    expect(screen.getAllByRole('button', { name: /^К записи:/ })).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'К записи: Утренняя хатха-йога' }),
    ).toBeInTheDocument();

    // Запрос по тексту клуба — правило выдачи: «volna» оставляет слот плавания.
    act(() => {
      useFilterStore.getState().setSport(null);
      useFilterStore.getState().setSearch('volna');
    });
    rerender(<UpcomingSessions {...baseProps} sessions={sessions} trainerSlots={trainerSlots} />);
    expect(screen.getByRole('button', { name: 'К записи: Утреннее плавание' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'К записи: Утренняя хатха-йога' })).toBeNull();

    // Сняли фильтры — оба вернулись.
    act(() => {
      useFilterStore.getState().resetFilters();
    });
    rerender(<UpcomingSessions {...baseProps} sessions={sessions} trainerSlots={trainerSlots} />);
    expect(screen.getAllByRole('button', { name: /^К записи:/ })).toHaveLength(2);
  });

  it('в trainer-mode показывает свободные окна тренеров', () => {
    useFilterStore.setState({
      discoveryMode: 'trainers',
      searchQuery: '',
      selectedSportId: null,
    });

    render(<UpcomingSessions {...baseProps} sessions={sessions} trainerSlots={trainerSlots} />);

    expect(screen.getByRole('heading', { name: 'Свободные окна тренеров' })).toBeInTheDocument();
    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
    expect(screen.getByText('Персональная тренировка: Плавание')).toBeInTheDocument();

    /* Phase 28.12: TrainerAvailability через CardSlider + TrainerSlotCard.
     * Кликабелен только CTA «К записи: <имя>», auth-гейт — на нём. */
    expect(screen.getByRole('button', { name: 'К записи: Марина Соколова' })).toBeInTheDocument();
  });

  it('показывает notice при клике без авторизации', async () => {
    const { fireEvent } = await import('@testing-library/react');

    render(<UpcomingSessions {...baseProps} sessions={sessions} trainerSlots={trainerSlots} />);

    const button = screen.getByRole('button', {
      name: 'К записи: Утреннее плавание',
    });
    fireEvent.click(button);

    expect(screen.getByText('Чтобы записаться, войдите или зарегистрируйтесь')).toBeInTheDocument();
  });
});
