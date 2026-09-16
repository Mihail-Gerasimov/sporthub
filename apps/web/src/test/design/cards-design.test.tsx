/**
 * Контракт дизайна карточек — проверяет минималистичный стиль
 * ClubCard и TrainerCard.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClubCard } from '@/components/clubs/ClubCard';
import { TrainerCard } from '@/components/trainers/TrainerCard';
import type { Club, Sport } from '@sporthub/types';
import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

const stubSport: Pick<Sport, 'id' | 'name' | 'icon'> = { id: 1, name: 'Бокс', icon: '🥊' };

const stubClub: Club = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Тестовый клуб',
  slug: 'test-club',
  city: 'Москва',
  address: 'ул. Тестовая, 1',
  description: 'Описание клуба',
  shortDescription: 'Короткое описание',
  sportIds: [1],
  rating: 4.5,
  reviewCount: 10,
  priceFrom: 500,
  tagIds: [1],
  distanceKm: 2.0,
  phone: '+7 999 111 22 33',
  email: 'test@test.ru',
  website: 'https://test.ru',
  coordinates: { lat: 55.75, lng: 37.62 },
  imageUrls: [],
  amenityIds: [],
  source: 'provider',
  status: 'published',
};

const stubTrainer: TrainerDirectoryItem = {
  id: 1,
  name: 'Иван Петров',
  slug: 'ivan-petrov',
  city: 'Москва',
  bio: 'Опытный тренер',
  avatarUrl: '',
  rating: 4.8,
  reviewCount: 15,
  experienceYears: 5,
  priceFrom: 1500,
  sportIds: [1],
  sports: [{ id: 1, name: 'Бокс', icon: '🥊' }],
  specialtyIds: [1],
  specialtyNames: ['Подготовка к соревнованиям'],
  address: 'ул. Спартаковская, 10',
  coordinates: { lat: 55.75, lng: 37.62 },
  venueLabel: 'Зал «Спарта»',
  venueName: 'Спарта',
  venueAddress: 'ул. Спартаковская, 10',
  primaryOfferingId: 11,
  offeringTitles: ['Персональная тренировка'],
  // Шаг 24.11: у карточки тренера появился массив услуг. Здесь он повторяет
  // единственную услугу из primaryOffering* — фикстура остаётся согласованной сама с собой.
  offerings: [
    {
      id: 11,
      title: 'Персональная тренировка',
      format: 'personal',
      price: 1500,
      durationMinutes: 60,
      venueClubName: 'Спарта',
      trainerClubLinkId: null,
    },
  ],
  searchText: 'иван петров бокс спарта',
  nextSlotId: 1,
  nextSlotDate: '2026-04-01',
  nextSlotStartTime: '10:00',
  availableSlotsCount: 3,
  primaryOfferingTitle: 'Персональная тренировка',
  primaryOfferingFormat: 'personal',
};

describe('Минималистичный стиль карточек', () => {
  describe('TrainerCard (38.74 — эталон витрины)', () => {
    it('покой — тень карточки, наведение — подъём, зелёная рамка и плавающая тень; цвета токенами', () => {
      render(<TrainerCard trainer={stubTrainer} />);
      const card = screen.getByTestId('trainer-card');
      expect(card.className).toContain('shadow-card');
      expect(card.className).toContain('hover:-translate-y-[3px]');
      expect(card.className).toContain('hover:border-lime/40');
      expect(card.className).toContain('hover:shadow-floating');
      expect(card.className).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
    });

    it('зелёная риска сверху 20px, при наведении 36px; аватар 56×56 радиусом 14', () => {
      render(<TrainerCard trainer={stubTrainer} />);
      const card = screen.getByTestId('trainer-card');
      const rule = card.querySelector('.h-\\[3px\\]');
      expect(rule).not.toBeNull();
      expect(rule?.className).toContain('w-5');
      expect(rule?.className).toContain('group-hover:w-9');
      expect(card.querySelector('.size-14.rounded-\\[14px\\]')).not.toBeNull();
    });

    // 38.105: витринная карточка — та же в режиме showcase: риска, аватар 56 и тени те же.
    it('showcase: риска, аватар 56×56 радиусом 14, тень покоя и подъём — те же', () => {
      render(<TrainerCard trainer={stubTrainer} variant="showcase" />);
      const card = screen.getByTestId('trainer-card');
      expect(card.className).toContain('shadow-card');
      expect(card.className).toContain('hover:-translate-y-[3px]');
      expect(card.querySelector('.h-\\[3px\\]')).not.toBeNull();
      expect(card.querySelector('.size-14.rounded-\\[14px\\]')).not.toBeNull();
    });

    it('не содержит декоративных кругов и теней на аватаре (упрощённый дизайн)', () => {
      render(<TrainerCard trainer={stubTrainer} />);
      const card = screen.getByTestId('trainer-card');
      expect(card.querySelector('.rounded-full.blur-')).toBeNull();
      expect(card.querySelector('.size-14')?.className).not.toContain('shadow-floating');
    });
  });

  describe('ClubCard (38.73 — эталон витрины)', () => {
    it('покой — тень карточки, наведение — подъём и плавающая тень; цвета токенами', () => {
      render(<ClubCard club={stubClub} sports={[stubSport]} />);
      const card = screen.getByTestId('club-card');
      expect(card.className).toContain('shadow-card');
      expect(card.className).toContain('hover:-translate-y-1');
      expect(card.className).toContain('hover:shadow-floating');
      expect(card.className).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
    });

    it('фото 180 с затемнением снизу токеном, а не градиентом в разметке', () => {
      render(<ClubCard club={stubClub} sports={[stubSport]} />);
      const card = screen.getByTestId('club-card');
      const shade = card.querySelector('[class*="--ui-decor-photo-shade"]');
      expect(shade).not.toBeNull();
      expect(card.querySelector('.h-\\[180px\\]')).not.toBeNull();
    });

    it('tracking адреса не превышает 0.20em', () => {
      render(<ClubCard club={stubClub} sports={[stubSport]} />);
      const address = screen.getByText('ул. Тестовая, 1');
      const trackingMatch = address.className.match(/tracking-\[([0-9.]+)em\]/);
      expect(trackingMatch).not.toBeNull();
      expect(parseFloat(trackingMatch![1])).toBeLessThanOrEqual(0.2);
    });

    // 38.104: витринная плитка — та же карточка в режиме showcase, те же тень, подъём,
    // фото 180 с затемнением токеном; хвоста (описание, адрес, теги) нет.
    it('showcase: те же тень, подъём и затемнение токеном; ни адреса, ни тегов', () => {
      render(<ClubCard club={stubClub} sports={[stubSport]} variant="showcase" />);
      const card = screen.getByTestId('club-card');
      expect(card.className).toContain('shadow-card');
      expect(card.className).toContain('hover:-translate-y-1');
      expect(card.className).toContain('hover:shadow-floating');
      expect(card.className).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
      expect(card.querySelector('[class*="--ui-decor-photo-shade"]')).not.toBeNull();
      expect(card.querySelector('.h-\\[180px\\]')).not.toBeNull();
      expect(screen.queryByText('ул. Тестовая, 1')).not.toBeInTheDocument();
      expect(card.querySelector('.chip-track')).toBeNull();
    });
  });
});
