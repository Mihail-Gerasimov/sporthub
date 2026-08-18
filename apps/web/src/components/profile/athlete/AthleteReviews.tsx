// Client-обёртка над AthleteReviewsSection (Step 25.6). Читает авторизованного атлета
// из useAuthStore, резолвит targetName через getAthleteReviewItems.
'use client';

import { useMemo } from 'react';

import { AthleteReviewsSection } from '@/components/profile/AthleteReviewsSection';
import { getAthleteReviewItems } from '@/components/profile/athlete-review-items';
import { selectAthleteActionUserId, useAuthStore } from '@/stores/useAuthStore';
import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';
import type { Club, Review, Trainer } from '@sporthub/types';

type AthleteReviewsProps = {
  clubs?: Club[];
  trainers?: Trainer[];
  reviews?: Review[];
};

export function AthleteReviews({ clubs = [], trainers = [], reviews = [] }: AthleteReviewsProps) {
  const user = useAuthStore((state) => state.user);
  const accountType = useAuthStore((state) => state.accountType);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const athleteUserId = useAuthStore(selectAthleteActionUserId);

  const reviewItems = useMemo(
    () => getAthleteReviewItems({ athleteUserId, clubs, reviews, trainers }),
    [athleteUserId, clubs, reviews, trainers],
  );

  if (!isAuthenticated || accountType !== 'athlete' || !user) {
    return <AccessDeniedCard requiredRole="athlete" />;
  }

  return <AthleteReviewsSection reviewItems={reviewItems} />;
}
