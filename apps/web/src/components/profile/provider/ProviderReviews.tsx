// Phase 25 Step 25.14: client-обёртка над ProviderReviewsSection. Access-gate +
// фильтрация отзывов по managed-сущностям провайдера через getProviderReviews.
'use client';

import { useMemo } from 'react';

import { ProviderReviewsSection } from '@/components/profile/ProviderReviewsSection';
import {
  getProviderClubs,
  getProviderReviews,
  getProviderTrainers,
} from '@/components/profile/provider-helpers';
import { useAuthStore } from '@/stores/useAuthStore';
import type { Club, Review, Trainer } from '@sporthub/types';

type ProviderReviewsProps = {
  reviews?: Review[];
  clubs?: Club[];
  trainers?: Trainer[];
};

export function ProviderReviews({ reviews = [], clubs = [], trainers = [] }: ProviderReviewsProps) {
  const user = useAuthStore((s) => s.user);

  const providerUserId = user?.id ?? null;

  const providerReviews = useMemo(() => {
    if (providerUserId === null) return [];
    const providerClubIds = getProviderClubs(clubs, providerUserId).map((c) => c.id);
    const providerTrainerIds = getProviderTrainers(trainers, providerUserId).map((t) => t.id);
    return getProviderReviews(reviews, providerClubIds, providerTrainerIds);
  }, [reviews, clubs, trainers, providerUserId]);

  // ⚠️ Шаг 35.34. Здесь стояла плашка «Доступ ограничен» — косметика поверх
  // УЖЕ отданных данных: пускать или нет, решает серверный лейаут, и решает
  // до похода за ними. Осталась одна причина ничего не рисовать: ответ
  // «кто я» ещё в пути, и номера человека нет.
  if (!user) {
    return null;
  }

  return (
    <div data-testid="provider-reviews">
      <ProviderReviewsSection reviews={providerReviews} />
    </div>
  );
}
