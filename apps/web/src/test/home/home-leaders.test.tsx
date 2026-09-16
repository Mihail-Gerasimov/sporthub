// Тесты полосы лидеров каталога `HomeLeaders` (фаза 38, шаг 38.92).
//
// Тупик разведки: карточки лидеров не были ссылками — лучший клуб показывался, но
// открыть его с главной было нельзя. Теперь у каждой карточки ссылка с именем,
// растянутая на карточку (как у карточек выдачи), в свой клуб / своего тренера.
// Тексты — из словаря `LEADERS` в `home-copy`, а не литералами компонента.
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { HomeData } from '@/components/home/home-data';
import { HomeLeaders } from '@/components/home/HomeLeaders';
import { LEADERS } from '@/lib/home-copy';
import { HOME_SECTIONS } from '@/lib/home-sections';
import type { Club, Trainer } from '@sporthub/types';

const club: Club = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Volna Aquatic Club',
  slug: 'volna-aquatic-club',
  description: 'Клуб с бассейном',
  shortDescription: 'Бассейн и пилатес рядом с набережной.',
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  phone: '',
  email: '',
  website: '',
  coordinates: { lat: 53.2, lng: 50.1 },
  sportIds: [3],
  imageUrls: [],
  amenityIds: [],
  tagIds: [],
  rating: 4.8,
  reviewCount: 64,
  priceFrom: 900,
  distanceKm: 1.8,
};

const trainer: Trainer = {
  id: 7,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Марина Соколова',
  slug: 'marina-sokolova',
  bio: 'Тренер по плаванию.',
  avatarUrl: '',
  experienceYears: 9,
  specialtyIds: [],
  workFormatIds: [],
  sportIds: [3],
  rating: 4.9,
  reviewCount: 31,
  priceFrom: 1400,
  city: 'Самара',
  address: '',
  coordinates: { lat: 53.2, lng: 50.1 },
};

/** Данные дня — лидеры и пустые остальные поля: секция читает только лидеров. */
function dataWith(over: Partial<HomeData>): HomeData {
  return {
    overview: { athletes: 1, trainers: 1, clubs: 1, reviews: 1 },
    clubs: [],
    sports: [],
    tags: [],
    trainerDirectory: [],
    upcomingSessions: [],
    upcomingSessionsLabel: '18 марта',
    trainerAvailability: [],
    trainerAvailabilityLabel: '18 марта',
    showcaseClubs: [],
    showcaseTrainers: [],
    ...over,
  };
}

describe('HomeLeaders (38.92)', () => {
  it('лидеры — ссылки в свой клуб и своего тренера, растянутые на карточку', () => {
    render(
      <HomeLeaders
        data={dataWith({
          featuredClub: club,
          featuredTrainer: trainer,
          featuredTrainerTitle: 'Плавание',
        })}
      />,
    );

    const clubLink = screen.getByRole('link', { name: 'Volna Aquatic Club' });
    const trainerLink = screen.getByRole('link', { name: 'Марина Соколова' });

    expect(clubLink).toHaveAttribute('href', '/clubs/volna-aquatic-club');
    expect(trainerLink).toHaveAttribute('href', '/trainers/marina-sokolova');
    expect(clubLink.className).toContain('after:absolute');
    expect(trainerLink.className).toContain('after:absolute');
  });

  it('секция несёт id и подпись из словаря, подписи карточек — из словаря текстов', () => {
    render(
      <HomeLeaders
        data={dataWith({
          featuredClub: club,
          featuredTrainer: trainer,
          featuredTrainerTitle: 'Плавание',
        })}
      />,
    );

    const section = screen.getByRole('region', { name: HOME_SECTIONS.leaders.label });

    expect(section.id).toBe(HOME_SECTIONS.leaders.id);
    expect(within(section).getByText(LEADERS.kind.club)).toBeInTheDocument();
    expect(within(section).getByText(LEADERS.kind.trainer)).toBeInTheDocument();
    expect(within(section).getAllByText(LEADERS.top)).toHaveLength(2);
    expect(within(section).getByText('Плавание')).toBeInTheDocument();
  });

  it('без лидеров — пустые состояния карточек и общий баннер пустого каталога, без «провайдера»', () => {
    render(<HomeLeaders data={dataWith({})} />);

    expect(screen.getByText(LEADERS.empty.club)).toBeInTheDocument();
    expect(screen.getByText(LEADERS.empty.trainer)).toBeInTheDocument();
    expect(screen.getByText(LEADERS.empty.catalog)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    // Лексика фазы 35: лица услуг, а не «провайдер».
    expect(document.body.textContent).not.toMatch(/провайдер/i);
  });

  it('цвета — токенами, без классов старой формы [var(--ui-…)]', () => {
    render(<HomeLeaders data={dataWith({ featuredClub: club })} />);

    const section = screen.getByRole('region', { name: HOME_SECTIONS.leaders.label });

    expect(section.innerHTML).not.toContain('var(--ui-');
    expect(section.innerHTML).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
  });
});
