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
import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';
import type { Club, Review, Trainer } from '@/types';

type ProviderReviewsProps = {
  reviews?: Review[];
  clubs?: Club[];
  trainers?: Trainer[];
};

export function ProviderReviews({ reviews = [], clubs = [], trainers = [] }: ProviderReviewsProps) {
  const user = useAuthStore((s) => s.user);
  const accountType = useAuthStore((s) => s.accountType);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const providerUserId = user?.id ?? null;

  const providerReviews = useMemo(() => {
    if (providerUserId === null) return [];
    const providerClubIds = getProviderClubs(clubs, providerUserId).map((c) => c.id);
    const providerTrainerIds = getProviderTrainers(trainers, providerUserId).map((t) => t.id);
    return getProviderReviews(reviews, providerClubIds, providerTrainerIds);
  }, [reviews, clubs, trainers, providerUserId]);

  if (!isAuthenticated || accountType !== 'provider' || !user) {
    return <AccessDeniedCard requiredRole="provider" testId="provider-reviews-access-denied" />;
  }

  return (
    <div data-testid="provider-reviews">
      <ProviderReviewsSection reviews={providerReviews} />
    </div>
  );
}
