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
  distanceKm: 3.0,
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
  describe('TrainerCard', () => {
    it('не содержит декоративных кругов (упрощённый дизайн)', () => {
      render(<TrainerCard trainer={stubTrainer} />);
      const card = screen.getByTestId('trainer-card');
      // Декоративные круги были absolute + rounded-full + border-panel
      const decorativeCircles = card.querySelectorAll(
        '.rounded-full.border.border-panel\\/25, .rounded-full.border.border-panel\\/20',
      );
      expect(decorativeCircles.length).toBe(0);
    });

    it('аватар-контейнер не содержит shadow-floating', () => {
      render(<TrainerCard trainer={stubTrainer} />);
      const card = screen.getByTestId('trainer-card');
      // Аватар-контейнер — элемент с rounded-[2rem]
      const avatarContainer = card.querySelector('[class*="rounded-\\[2rem\\]"]');
      if (avatarContainer) {
        expect(avatarContainer.className).not.toContain('shadow-floating');
      }
    });
  });

  describe('ClubCard', () => {
    // Phase 28.8: address eyebrow в новом дизайне имеет letter-spacing 0.18em
    // (UI Kit eyebrow), порог поднят с 0.15 → 0.20em.
    it('tracking адреса не превышает 0.20em', () => {
      render(<ClubCard club={stubClub} sports={[stubSport]} />);
      const address = screen.getByText('ул. Тестовая, 1');
      const trackingMatch = address.className.match(/tracking-\[([0-9.]+)em\]/);
      expect(trackingMatch).not.toBeNull();
      expect(parseFloat(trackingMatch![1])).toBeLessThanOrEqual(0.2);
    });
  });
});
