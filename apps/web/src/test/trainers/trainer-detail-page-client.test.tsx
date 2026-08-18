import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithToast as render } from '@/test/helpers/render-with-toast';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TrainerDetailPageClient } from '@/components/trainers/TrainerDetailPageClient';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { Club, Offering, Review, Schedule, Specialty, Sport, Trainer } from '@sporthub/types';

/* Моковые данные тренера */
const trainer: Trainer = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Марина Соколова',
  slug: 'marina-sokolova',
  bio: 'Тренер по плаванию с мягким входом для взрослых новичков.',
  avatarUrl: '/images/trainers/marina.jpg',
  experienceYears: 9,
  specialtyIds: [8, 9],
  workFormatIds: [1],
  rating: 4.9,
  reviewCount: 28,
  priceFrom: 1400,
  sportIds: [3],
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
};

const sports: Sport[] = [
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Плавание',
    slug: 'swimming',
    description: 'Плавание в бассейне.',
    icon: '🏊',
    imageUrl: '/images/sports/swimming.jpg',
    isPopular: true,
  },
];

const specialties: Specialty[] = [
  { id: 8, createdAt: '2026-03-17T09:00:00.000Z', name: 'Кроль' },
  { id: 9, createdAt: '2026-03-17T09:00:00.000Z', name: 'Дыхание' },
];

const affiliatedClub: Club = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Volna Aquatic Club',
  slug: 'volna-aquatic-club',
  description: 'Клуб с бассейном.',
  shortDescription: 'Бассейн и пилатес.',
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  phone: '+7 (846) 200-11-01',
  coordinates: { lat: 53.2129, lng: 50.1245 },
  sportIds: [3],
  imageUrls: [],
  amenityIds: [],
  tagIds: [],
  rating: 4.8,
  reviewCount: 64,
  priceFrom: 900,
  distanceKm: 1.8,
};

const offerings: Offering[] = [
  {
    id: 101,
    createdAt: '2026-03-17T09:00:00.000Z',
    ownerType: 'trainer',
    ownerId: 1,
    affiliatedClubId: 1,
    sportId: 3,
    title: 'Персональная тренировка: Плавание',
    description: 'Индивидуальная работа над техникой.',
    format: 'personal',
    price: 1400,
    durationMinutes: 60,
    capacity: 1,
    address: 'ул. Лесная, 23к1',
    coordinates: { lat: 53.2129, lng: 50.1245 },
  },
];

const schedule: Schedule[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    /* Phase 30.7: 10:00 UTC = 14:00 Samara — ставим slot после 14:00, чтобы isSlotUpcoming его пропустил. */
    title: 'Утреннее плавание',
    date: '2026-03-18',
    startTime: '17:30',
    endTime: '18:30',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 14,
    bookedCount: 8,
    price: 1100,
    room: 'Бассейн A',
  },
];

const reviews: Review[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    userId: 1,
    trainerId: 1,
    rating: 5,
    text: 'Отличный тренер, очень внимательная.',
  },
];

const reviewAuthors: Record<number, string> = { 1: 'Алексей Смирнов' };

/* Пропсы по умолчанию для всех тестов */
const defaultProps = {
  affiliatedClub,
  offerings,
  reviewAuthors,
  reviews,
  schedule,
  specialties,
  sports,
  trainer,
};

describe('TrainerDetailPageClient', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    /* Phase 28.23: anchor расписания на 2026-03-18 — слоты фикстур
     * (date='2026-03-18') попадают в текущую ISO-неделю Пн 16 .. Вс 22 марта. */
    vi.setSystemTime(new Date('2026-03-18T10:00:00.000Z'));
    vi.restoreAllMocks();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('рендерит имя тренера, bio, специализации и виды спорта', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);

    expect(screen.getByRole('heading', { name: 'Марина Соколова' })).toBeInTheDocument();
    expect(
      screen.getByText('Тренер по плаванию с мягким входом для взрослых новичков.'),
    ).toBeInTheDocument();
    /* Phase 28.23: специализации теперь рендерятся и в hero ChipMarquee, и в
     * секции «Специализации» — могут быть дубли. */
    expect(screen.getAllByText('Кроль').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Дыхание').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Плавание').length).toBeGreaterThan(0);
  });

  it('рендерит секцию связанного клуба с ссылкой', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);

    expect(screen.getByTestId('trainer-affiliated-club-section')).toBeInTheDocument();
    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Перейти к клубу' })).toHaveAttribute(
      'href',
      '/clubs/volna-aquatic-club',
    );
  });

  it('не рендерит секцию связанного клуба если клуба нет', () => {
    render(<TrainerDetailPageClient {...defaultProps} affiliatedClub={null} />);

    expect(screen.queryByTestId('trainer-affiliated-club-section')).not.toBeInTheDocument();
  });

  it('рендерит услуги тренера', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);

    expect(screen.getByTestId('trainer-offerings-section')).toBeInTheDocument();
    expect(screen.getByText('Персональная тренировка: Плавание')).toBeInTheDocument();
    expect(screen.getByText('Персонально')).toBeInTheDocument();
    expect(screen.getByText('60 мин')).toBeInTheDocument();
  });

  it('рендерит расписание с week-tabs и активным днём текущей недели', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);

    expect(screen.getByTestId('trainer-schedule-section')).toBeInTheDocument();
    expect(screen.getByText('Утреннее плавание')).toBeInTheDocument();
    /* Phase 28.23: slot.sub теперь "07:30 - 08:30, Бассейн A" в одном узле,
     * поэтому используем regex match вместо exact text. */
    expect(screen.getByText(/17:30 - 18:30/)).toBeInTheDocument();
    expect(screen.getByText('Бассейн A')).toBeInTheDocument();
  });

  it('для гостя показывает кнопку «Записаться» и auth-notice при клике', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Записаться на Утреннее плавание' }));

    expect(
      screen.getByText('Чтобы записаться, войдите или зарегистрируйтесь как спортсмен'),
    ).toBeInTheDocument();
  });

  it('для athlete показывает ссылку «Записаться» на booking', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<TrainerDetailPageClient {...defaultProps} />);

    expect(screen.getByRole('link', { name: 'Записаться на Утреннее плавание' })).toHaveAttribute(
      'href',
      '/booking/1',
    );
  });

  it('рендерит отзывы с именем автора', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);

    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.getByText('Отличный тренер, очень внимательная.')).toBeInTheDocument();
  });

  it('для гостя блокирует отправку отзыва с auth-notice', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Отправить отзыв' }));

    expect(
      screen.getByText('Чтобы оставить отзыв, войдите или зарегистрируйтесь как спортсмен'),
    ).toBeInTheDocument();
  });

  it('для athlete отправляет отзыв через API с trainerId', async () => {
    /* Real timers + setSystemTime для async waitFor / fetchMock. */
    vi.useRealTimers();
    vi.setSystemTime(new Date('2026-03-18T10:00:00.000Z'));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 2,
          createdAt: '2026-03-18T10:00:00.000Z',
          userId: 1,
          trainerId: 1,
          rating: 5,
          text: 'Замечательные тренировки!',
        },
      }),
    });

    vi.stubGlobal('fetch', fetchMock);

    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<TrainerDetailPageClient {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Оценить на 5 из 5' }));
    fireEvent.change(screen.getByLabelText('Отзыв'), {
      target: { value: 'Замечательные тренировки!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить отзыв' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    /* Проверяем что POST содержит trainerId */
    const callBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);

    expect(callBody).toEqual(
      expect.objectContaining({
        trainerId: 1,
        rating: 5,
        text: 'Замечательные тренировки!',
      }),
    );
    expect(screen.getByText('Замечательные тренировки!')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Отзыв отправлен.')).toBeInTheDocument();
    });
  });

  it('показывает ошибки валидации при пустой форме', () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: { id: 1, name: 'Тест', email: 'test@test.local' },
    });

    render(<TrainerDetailPageClient {...defaultProps} />);

    fireEvent.click(screen.getByRole('button', { name: 'Отправить отзыв' }));

    expect(screen.getByText('Выбери оценку.')).toBeInTheDocument();
    expect(screen.getByText('Напиши пару слов о впечатлении.')).toBeInTheDocument();
  });

  it('отображает блок контактов с phone, vk, telegram (Step 23.10)', () => {
    const trainerWithContacts: Trainer = {
      ...trainer,
      phone: '+7 (927) 111-22-33',
      vk: 'https://vk.com/marina_swim',
      telegram: 'https://t.me/marina_swim',
      facebook: '',
    };

    render(<TrainerDetailPageClient {...defaultProps} trainer={trainerWithContacts} />);

    // Телефон
    expect(screen.getByText('+7 (927) 111-22-33')).toBeInTheDocument();

    // VK и Telegram — ссылки
    const vkLink = screen.getByRole('link', { name: /vk/i });

    expect(vkLink).toHaveAttribute('href', 'https://vk.com/marina_swim');

    const tgLink = screen.getByRole('link', { name: /telegram/i });

    expect(tgLink).toHaveAttribute('href', 'https://t.me/marina_swim');

    // Facebook пустой — не отображается
    expect(screen.queryByRole('link', { name: /facebook/i })).not.toBeInTheDocument();
  });

  // Phase 25 Step 25.13: публичная симметрия репутации на detail-странице.
  it('рендерит секцию «Надёжность» при передаче reliability', () => {
    render(
      <TrainerDetailPageClient
        {...defaultProps}
        reliability={{
          totalRelevant: 20,
          completedCount: 12,
          noShowCount: 8,
          lateCancelCount: 0,
          rejectedByProviderCount: 0,
          completionRate: 0.6,
          badge: 'danger',
          isNewUser: false,
        }}
      />,
    );

    expect(screen.getByTestId('trainer-reliability-section')).toBeInTheDocument();
    expect(screen.getByTestId('reliability-badge-danger')).toBeInTheDocument();
  });

  it('не рендерит секцию «Надёжность» если reliability не передан', () => {
    render(<TrainerDetailPageClient {...defaultProps} />);
    expect(screen.queryByTestId('trainer-reliability-section')).not.toBeInTheDocument();
  });
});
