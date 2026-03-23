/**
 * Контракт дизайна карточек — проверяет минималистичный стиль
 * ClubCard и TrainerCard.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ClubCard } from '@/components/clubs/ClubCard';
import { TrainerCard } from '@/components/trainers/TrainerCard';
import type { Club, Sport } from '@/types';
import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

const stubSport: Pick<Sport, 'id' | 'name' | 'icon'> = { id: 1, name: 'Бокс', icon: '🥊' };

const stubClub: Club = {
  id: 1,
  name: 'Тестовый клуб',
  city: 'Москва',
  address: 'ул. Тестовая, 1',
  description: 'Описание клуба',
  shortDescription: 'Короткое описание',
  sportIds: [1],
  rating: 4.5,
  reviewCount: 10,
  isFeatured: false,
  priceFrom: 500,
  tags: ['тег'],
  distanceKm: 2.0,
  lat: 55.75,
  lng: 37.62,
  phone: '+7 999 111 22 33',
  email: 'test@test.ru',
  website: 'https://test.ru',
  workingHours: 'Пн-Пт 8:00-22:00',
  photos: [],
};

const stubTrainer: TrainerDirectoryItem = {
  id: 1,
  name: 'Иван Петров',
  city: 'Москва',
  bio: 'Опытный тренер',
  rating: 4.8,
  reviewCount: 15,
  experienceYears: 5,
  priceFrom: 1500,
  distanceKm: 3.0,
  lat: 55.75,
  lng: 37.62,
  sports: [{ id: 1, name: 'Бокс', icon: '🥊' }],
  specialties: ['Подготовка к соревнованиям'],
  venueLabel: 'Зал «Спарта»',
  venueName: 'Спарта',
  venueAddress: 'ул. Спартаковская, 10',
  nextSlotId: 'slot-1',
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
      const card = screen.getByTestId('trainer-card-surface');
      // Декоративные круги были absolute + rounded-full + border-panel
      const decorativeCircles = card.querySelectorAll(
        '.rounded-full.border.border-panel\\/25, .rounded-full.border.border-panel\\/20',
      );
      expect(decorativeCircles.length).toBe(0);
    });

    it('аватар-контейнер не содержит shadow-floating', () => {
      render(<TrainerCard trainer={stubTrainer} />);
      const card = screen.getByTestId('trainer-card-surface');
      // Аватар-контейнер — элемент с rounded-[2rem]
      const avatarContainer = card.querySelector('[class*="rounded-\\[2rem\\]"]');
      if (avatarContainer) {
        expect(avatarContainer.className).not.toContain('shadow-floating');
      }
    });
  });

  describe('ClubCard', () => {
    it('tracking адреса не превышает 0.15em', () => {
      render(<ClubCard club={stubClub} sports={[stubSport]} />);
      const address = screen.getByText('ул. Тестовая, 1');
      const trackingMatch = address.className.match(/tracking-\[([0-9.]+)em\]/);
      expect(trackingMatch).not.toBeNull();
      expect(parseFloat(trackingMatch![1])).toBeLessThanOrEqual(0.15);
    });
  });
});
