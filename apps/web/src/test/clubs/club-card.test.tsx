/*
 * Тесты ClubCard под новый дизайн Phase 28.8.
 * Карточка собрана 1-в-1 со схемы из claude-design/cards-trainers/sporthub/
 * project/SportHub Cards - Clubs.html (.club-card + child grid):
 *   hero (диагональный lime/orange/blank-луч + watermark номера + city-pill +
 *   address eyebrow + display-имя как Link) → body-meta (lime price-pill +
 *   distance) → body-desc clamp 3 → body-rating (звёзды + num + reviews +
 *   опц. badge "Новый") → tags ChipMarquee solid lime.
 *
 * ⚠️ Фаза 38, шаг 38.25: два случая про бейдж надёжности сняты — предмета нет
 * (реестр `phase-38-reliability-cut.md`, Т3).
 *
 * jsdom не считает layout (scrollWidth=0), поэтому ChipMarquee внутри
 * карточки попадёт в ветку no-loop. Для тестов это ОК — нам важна только
 * структура DOM и резолв тегов в имена.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClubCard } from '@/components/clubs/ClubCard';
import type { Club, Sport, Tag } from '@sporthub/types';

const sports: Pick<Sport, 'id' | 'name' | 'icon'>[] = [
  { id: 3, name: 'Плавание', icon: '🏊' },
  { id: 8, name: 'Пилатес', icon: '🤸' },
];

const tags: Tag[] = [
  { id: 1, name: 'Бассейн', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 2, name: 'Групповые', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 3, name: 'Детские секции', createdAt: '2026-01-01T00:00:00.000Z' },
];

const baseClub: Club = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Volna Aquatic Club',
  slug: 'volna-aquatic-club',
  description: 'Клуб с бассейном и пилатесом',
  shortDescription: 'Бассейн и пилатес рядом с набережной.',
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  phone: '+7 (846) 200-11-01',
  email: 'hello@volna-club.ru',
  website: 'https://volna-club.ru',
  coordinates: { lat: 53.2129, lng: 50.1245 },
  sportIds: [3, 8],
  imageUrls: [],
  amenityIds: [1],
  tagIds: [1, 2, 3],
  rating: 0,
  reviewCount: 0,
  priceFrom: 900,
  distanceKm: 1.8,
};

describe('ClubCard (Phase 28)', () => {
  beforeEach(() => {
    // Мокаем rAF — ChipMarquee внутри карточки не будет реально анимироваться.
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('рендерится как <article>, без обёртки <a> вокруг всей карточки', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);
    const card = screen.getByTestId('club-card');
    expect(card.tagName).toBe('ARTICLE');
    expect(card.closest('a')).toBeNull();
  });

  it('имя клуба обёрнуто в <Link href="/clubs/{slug}">', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);
    const nameLink = screen.getByRole('link', { name: baseClub.name });
    expect(nameLink.getAttribute('href')).toBe(`/clubs/${baseClub.slug}`);
  });

  it('index=0 → tone=lime + watermark "01"', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} index={0} />);
    const card = screen.getByTestId('club-card');
    expect(card.getAttribute('data-tone')).toBe('lime');
    expect(card.textContent).toContain('01');
  });

  it('index=1 → tone=orange + watermark "02"', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} index={1} />);
    const card = screen.getByTestId('club-card');
    expect(card.getAttribute('data-tone')).toBe('orange');
    expect(card.textContent).toContain('02');
  });

  it('index=2 → tone=blank', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} index={2} />);
    expect(screen.getByTestId('club-card').getAttribute('data-tone')).toBe('blank');
  });

  it('reviewCount=0 && rating=0 → бейдж «Новый»', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);
    expect(screen.getByTestId('club-card-new-badge')).toBeInTheDocument();
  });

  it('reviewCount>0 → бейдж «Новый» отсутствует', () => {
    render(
      <ClubCard club={{ ...baseClub, reviewCount: 12, rating: 4.5 }} sports={sports} tags={tags} />,
    );
    expect(screen.queryByTestId('club-card-new-badge')).not.toBeInTheDocument();
  });

  it('highlighted=true → атрибут data-highlighted="true"', () => {
    render(<ClubCard club={baseClub} highlighted sports={sports} tags={tags} />);
    expect(screen.getByTestId('club-card').getAttribute('data-highlighted')).toBe('true');
  });

  it('highlighted=false → атрибут data-highlighted="false"', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);
    expect(screen.getByTestId('club-card').getAttribute('data-highlighted')).toBe('false');
  });

  it('резолвит tagIds в имена через справочник', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);
    expect(screen.getByText('Бассейн')).toBeInTheDocument();
    expect(screen.getByText('Групповые')).toBeInTheDocument();
    expect(screen.getByText('Детские секции')).toBeInTheDocument();
  });

  it('фильтрует tagIds которых нет в справочнике (без fallback #N)', () => {
    const clubWithUnknown = { ...baseClub, tagIds: [1, 999, 2] };
    render(<ClubCard club={clubWithUnknown} sports={sports} tags={tags} />);
    expect(screen.getByText('Бассейн')).toBeInTheDocument();
    expect(screen.getByText('Групповые')).toBeInTheDocument();
    expect(screen.queryByText('#999')).not.toBeInTheDocument();
  });

  it('отображает price-pill с formatPrice и distance', () => {
    render(
      <ClubCard
        club={{ ...baseClub, priceFrom: 1500, distanceKm: 2.4 }}
        sports={sports}
        tags={tags}
      />,
    );
    // formatPrice добавляет неразрывные пробелы и валюту
    expect(screen.getByText(/1[\s  ]500[\s  ]?₽/)).toBeInTheDocument();
    expect(screen.getByText(/2\.4 км/)).toBeInTheDocument();
    expect(screen.getByText('от')).toBeInTheDocument();
  });

  it('city eyebrow содержит "г. Самара"', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);
    expect(screen.getByText(/г\. Самара/)).toBeInTheDocument();
  });

  it('eyebrow с адресом отображает club.address', () => {
    render(<ClubCard club={baseClub} sports={sports} tags={tags} />);
    expect(screen.getByText(baseClub.address)).toBeInTheDocument();
  });
});
