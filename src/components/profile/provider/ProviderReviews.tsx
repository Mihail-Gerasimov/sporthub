// Phase 25 Step 25.14: client-обёртка над ProviderReviewsSection. Access-gate +
// фильтрация отзывов по managed-сущностям провайдера через getProviderReviews.
'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { ProviderReviewsSection } from '@/components/profile/ProviderReviewsSection';
import {
  getProviderClubs,
  getProviderReviews,
  getProviderTrainers,
} from '@/components/profile/provider-helpers';
import { Badge, Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Club, Review, Trainer } from '@/types';

type ProviderReviewsProps = {
  reviews?: Review[];
  clubs?: Club[];
  trainers?: Trainer[];
};

function AccessDeniedCard() {
  const openAuthModal = useUIStore((s) => s.openAuthModal);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accountType = useAuthStore((s) => s.accountType);

  return (
    <Card className="p-6 sm:p-8" data-testid="provider-reviews-access-denied">
      <div className="flex flex-wrap gap-2">
        <Badge tone="danger">Provider only</Badge>
        {accountType === 'athlete' ? <Badge tone="outline">Athlete session</Badge> : null}
      </div>
      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-ink">
        Доступ ограничен
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        Отзывы на ваши услуги доступны только провайдерам.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {!isAuthenticated ? <Button onClick={() => openAuthModal()}>Войти</Button> : null}
        <Link
          href="/"
          className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Вернуться на главную
        </Link>
      </div>
    </Card>
  );
}

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
    return <AccessDeniedCard />;
  }

  return (
    <div data-testid="provider-reviews">
      <ProviderReviewsSection reviews={providerReviews} />
    </div>
  );
}
