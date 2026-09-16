/*
 * Тесты TrainerCard под новый дизайн Phase 28.9.
 * Карточка собрана 1-в-1 со схемы из claude-design/cards-trainers/sporthub/
 * project/SportHub Cards - Trainers.html (.trainer-card + child grid):
 *   hero (диагональный orange/lime/blank-луч + watermark + city-pill +
 *   avatar 84×84 + role + Bowlby-имя как Link + sport-tag) → body-meta
 *   (orange/lime price-pill + distance/окна) → exp-row (опыт + group-chip)
 *   → headline 48px clamp 2 → body-rating + опц. «Новый» → meta-box
 *   «Площадка/Окно» → tags ChipMarquee → quote-row с CTA «К записи».
 *
 * ⚠️ Фаза 38, шаг 38.25: три случая про бейдж надёжности сняты — предмета нет
 * (реестр `phase-38-reliability-cut.md`, Т4).
 *
 * jsdom не считает layout (scrollWidth=0), ChipMarquee внутри карточки
 * пройдёт по ветке no-loop. Для тестов важна только структура DOM.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TrainerCard } from '@/components/trainers/TrainerCard';
import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

const baseTrainer: TrainerDirectoryItem = {
  id: 1,
  name: 'Марина Соколова',
  slug: 'marina-sokolova',
  bio: 'Тренер по плаванию.',
  avatarUrl: '/images/trainers/marina.jpg',
  experienceYears: 9,
  specialtyIds: [1],
  specialtyNames: ['Подготовка к соревнованиям'],
  rating: 0,
  reviewCount: 0,
  priceFrom: 1400,
  sportIds: [3],
  sports: [{ id: 3, name: 'Плавание', icon: '🏊' }],
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  coordinates: { lat: 53.2129, lng: 50.1245 },
  distanceKm: 1.8,
  venueName: 'Volna Aquatic Club',
  venueLabel: 'Volna Aquatic Club',
  venueAddress: 'ул. Лесная, 23к1',
  primaryOfferingId: 101,
  primaryOfferingTitle: 'Персональная тренировка',
  primaryOfferingFormat: 'personal',
  nextSlotId: 1,
  nextSlotDate: '2026-03-18',
  nextSlotStartTime: '07:30',
  availableSlotsCount: 5,
  offeringTitles: ['Персональная тренировка'],
  offerings: [],
  searchText: 'марина соколова плавание volna aquatic club',
};

describe('TrainerCard (Phase 28)', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('рендерится как <article>, без обёртки <a> вокруг всей карточки', () => {
    render(<TrainerCard trainer={baseTrainer} />);
    const card = screen.getByTestId('trainer-card');
    expect(card.tagName).toBe('ARTICLE');
    expect(card.closest('a')).toBeNull();
  });

  it('два независимых Link — на имя (/trainers/[slug]) и на CTA «К записи»', () => {
    render(<TrainerCard trainer={baseTrainer} />);

    const nameLink = screen.getByRole('link', { name: 'Марина Соколова' });
    expect(nameLink.getAttribute('href')).toBe('/trainers/marina-sokolova');

    const ctaLink = screen.getByRole('link', { name: /К записи/i });
    expect(ctaLink.getAttribute('href')).toBe('/booking/1');

    // Имя НЕ внутри CTA-Link и наоборот
    expect(nameLink.contains(ctaLink)).toBe(false);
    expect(ctaLink.contains(nameLink)).toBe(false);
  });

  it('CTA href = /trainers/[slug] если nextSlotId=null', () => {
    const noSlotTrainer: TrainerDirectoryItem = { ...baseTrainer, nextSlotId: null };
    render(<TrainerCard trainer={noSlotTrainer} />);

    const ctaLink = screen.getByRole('link', { name: /К записи/i });
    expect(ctaLink.getAttribute('href')).toBe('/trainers/marina-sokolova');
  });

  it('slot текст = «Слоты скоро появятся» если nextSlotDate=null', () => {
    const noSlotTrainer: TrainerDirectoryItem = {
      ...baseTrainer,
      nextSlotId: null,
      nextSlotDate: null,
      nextSlotStartTime: null,
    };
    render(<TrainerCard trainer={noSlotTrainer} />);
    expect(screen.getByText(/Слоты скоро появятся/)).toBeInTheDocument();
  });

  it('index=0 → tone=orange + watermark "01"', () => {
    render(<TrainerCard trainer={baseTrainer} index={0} />);
    const card = screen.getByTestId('trainer-card');
    expect(card.getAttribute('data-tone')).toBe('orange');
    expect(card.textContent).toContain('01');
  });

  it('index=1 → tone=lime + watermark "02"', () => {
    render(<TrainerCard trainer={baseTrainer} index={1} />);
    const card = screen.getByTestId('trainer-card');
    expect(card.getAttribute('data-tone')).toBe('lime');
    expect(card.textContent).toContain('02');
  });

  it('index=2 → tone=blank', () => {
    render(<TrainerCard trainer={baseTrainer} index={2} />);
    expect(screen.getByTestId('trainer-card').getAttribute('data-tone')).toBe('blank');
  });

  it('reviewCount=0 && rating=0 → бейдж «Новый»', () => {
    render(<TrainerCard trainer={baseTrainer} />);
    expect(screen.getByTestId('trainer-card-new-badge')).toBeInTheDocument();
  });

  it('reviewCount>0 → бейдж «Новый» отсутствует', () => {
    render(<TrainerCard trainer={{ ...baseTrainer, reviewCount: 28, rating: 4.9 }} />);
    expect(screen.queryByTestId('trainer-card-new-badge')).not.toBeInTheDocument();
  });

  it('primaryOfferingFormat="group" → отображает chip «Группа»', () => {
    const groupTrainer: TrainerDirectoryItem = {
      ...baseTrainer,
      primaryOfferingFormat: 'group',
    };
    render(<TrainerCard trainer={groupTrainer} />);
    expect(screen.getByText('Группа')).toBeInTheDocument();
  });

  it('primaryOfferingFormat="mini_group" → отображает chip «Группа»', () => {
    const miniTrainer: TrainerDirectoryItem = {
      ...baseTrainer,
      primaryOfferingFormat: 'mini_group',
    };
    render(<TrainerCard trainer={miniTrainer} />);
    expect(screen.getByText('Группа')).toBeInTheDocument();
  });

  it('primaryOfferingFormat="personal" → chip «Группа» отсутствует', () => {
    render(<TrainerCard trainer={baseTrainer} />);
    expect(screen.queryByText('Группа')).not.toBeInTheDocument();
  });

  it('отображает venue.name в meta-box и опционально sub (venueAddress)', () => {
    render(<TrainerCard trainer={baseTrainer} />);
    expect(screen.getByText('Площадка')).toBeInTheDocument();
    expect(screen.getByText('Volna Aquatic Club')).toBeInTheDocument();
    expect(screen.getByText('Ближайшее окно')).toBeInTheDocument();
  });

  it('venueLabel пустой → fallback «Без привязки»', () => {
    const noVenueTrainer: TrainerDirectoryItem = {
      ...baseTrainer,
      venueName: null,
      venueLabel: '',
      venueAddress: '',
    };
    render(<TrainerCard trainer={noVenueTrainer} />);
    expect(screen.getByText('Без привязки')).toBeInTheDocument();
  });

  it('headline = primaryOfferingTitle когда оно есть', () => {
    render(<TrainerCard trainer={baseTrainer} />);
    expect(screen.getByText('Персональная тренировка')).toBeInTheDocument();
  });

  it('headline = bio когда primaryOfferingTitle = null', () => {
    const noOfferingTrainer: TrainerDirectoryItem = {
      ...baseTrainer,
      primaryOfferingTitle: null,
    };
    render(<TrainerCard trainer={noOfferingTrainer} />);
    expect(screen.getByText('Тренер по плаванию.')).toBeInTheDocument();
  });

  it('quote-row пуст когда headline === bio (не дублируем)', () => {
    const sameTrainer: TrainerDirectoryItem = {
      ...baseTrainer,
      primaryOfferingTitle: null,
      bio: 'Уникальное био тренера.',
    };
    render(<TrainerCard trainer={sameTrainer} />);
    // bio показывается в headline, в quote — не должно быть второго вхождения
    const matches = screen.getAllByText('Уникальное био тренера.');
    expect(matches).toHaveLength(1);
  });

  it('отображает sport-tag из trainer.sports[0]', () => {
    render(<TrainerCard trainer={baseTrainer} />);
    expect(screen.getByText('Плавание')).toBeInTheDocument();
  });

  it('city eyebrow содержит "г. Самара"', () => {
    render(<TrainerCard trainer={baseTrainer} />);
    expect(screen.getByText(/г\. Самара/)).toBeInTheDocument();
  });

  it('experience tag = "{N} лет опыта"', () => {
    render(<TrainerCard trainer={baseTrainer} />);
    expect(screen.getByText('9 лет опыта')).toBeInTheDocument();
  });

  it('distance fallback с правильным склонением (1 окно / 3 окна / 5 окон)', () => {
    const t1: TrainerDirectoryItem = {
      ...baseTrainer,
      distanceKm: null,
      availableSlotsCount: 1,
    };
    const { unmount } = render(<TrainerCard trainer={t1} />);
    expect(screen.getByText('1 окно')).toBeInTheDocument();
    unmount();

    const t3: TrainerDirectoryItem = { ...baseTrainer, distanceKm: null, availableSlotsCount: 3 };
    const { unmount: u2 } = render(<TrainerCard trainer={t3} />);
    expect(screen.getByText('3 окна')).toBeInTheDocument();
    u2();

    const t5: TrainerDirectoryItem = { ...baseTrainer, distanceKm: null, availableSlotsCount: 5 };
    render(<TrainerCard trainer={t5} />);
    expect(screen.getByText('5 окон')).toBeInTheDocument();
  });

  it('highlighted=true → атрибут data-highlighted="true"', () => {
    render(<TrainerCard trainer={baseTrainer} highlighted />);
    expect(screen.getByTestId('trainer-card').getAttribute('data-highlighted')).toBe('true');
  });

  it('отображает имена specialties как чипы в marquee', () => {
    const trainerWithNames: TrainerDirectoryItem = {
      ...baseTrainer,
      specialtyIds: [1, 2],
      specialtyNames: ['Подготовка к соревнованиям', 'Реабилитация'],
    };
    render(<TrainerCard trainer={trainerWithNames} />);
    expect(screen.getByText('Подготовка к соревнованиям')).toBeInTheDocument();
    expect(screen.getByText('Реабилитация')).toBeInTheDocument();
  });
});
