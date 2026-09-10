// Тесты секции «Отзывы» провайдер-кабинета (Step 12.6)
import { screen } from '@testing-library/react';
import { renderInFaceCabinet } from '@/test/helpers/cabinet';
import { describe, expect, it } from 'vitest';

import { ProviderReviewsSection } from '@/components/profile/ProviderReviewsSection';
import type { Review } from '@sporthub/types';

const reviews: Review[] = [
  {
    id: 1,
    createdAt: '2026-03-18T12:00:00.000Z',
    userId: 1,
    clubId: 1,
    rating: 5,
    text: 'Отличный бассейн!',
  },
  {
    id: 2,
    createdAt: '2026-03-19T10:00:00.000Z',
    userId: 1,
    trainerId: 3,
    rating: 4,
    text: 'Хороший тренер.',
  },
];

describe('ProviderReviewsSection', () => {
  it('рендерит заголовок и карточки отзывов', () => {
    renderInFaceCabinet(<ProviderReviewsSection reviews={reviews} />);

    expect(screen.getByText('Отзывы на мои услуги')).toBeInTheDocument();
    expect(screen.getByText('Отличный бассейн!')).toBeInTheDocument();
    expect(screen.getByText('Хороший тренер.')).toBeInTheDocument();
  });

  it('отображает рейтинг и целевую сущность', () => {
    renderInFaceCabinet(<ProviderReviewsSection reviews={reviews} />);

    // Тип сущности (клуб / тренер)
    expect(screen.getByText('Клуб')).toBeInTheDocument();
    expect(screen.getByText('Тренер')).toBeInTheDocument();
  });

  it('отображает дату отзыва', () => {
    renderInFaceCabinet(<ProviderReviewsSection reviews={reviews} />);

    expect(screen.getByText(/18 марта/)).toBeInTheDocument();
    expect(screen.getByText(/19 марта/)).toBeInTheDocument();
  });

  it('показывает пустое состояние при отсутствии отзывов', () => {
    renderInFaceCabinet(<ProviderReviewsSection reviews={[]} />);

    expect(screen.getByText(/Нет отзывов/)).toBeInTheDocument();
  });
});
