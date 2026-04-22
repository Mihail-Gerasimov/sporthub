// Phase 25 Step 25.14: client-обёртка над ProviderPublicationsSection для отдельного
// маршрута /profile/provider/publications. Access-gate + фильтрация по managed-сущностям
// текущего провайдера. edit/delete handlers пока не подключены — для edit/delete используйте
// корневой /profile/provider (финальная миграция — Step 25.17).
'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { ProviderPublicationsSection } from '@/components/profile/ProviderPublicationsSection';
import { getProviderClubs, getProviderTrainers } from '@/components/profile/provider-helpers';
import { Card } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';
import type { Club, Trainer } from '@/types';

type ProviderPublicationsProps = {
  clubs?: Club[];
  trainers?: Trainer[];
};

export function ProviderPublications({ clubs = [], trainers = [] }: ProviderPublicationsProps) {
  const user = useAuthStore((s) => s.user);
  const accountType = useAuthStore((s) => s.accountType);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const providerUserId = user?.id ?? null;

  const providerClubs = useMemo(
    () => (providerUserId === null ? [] : getProviderClubs(clubs, providerUserId)),
    [clubs, providerUserId],
  );
  const providerTrainers = useMemo(
    () => (providerUserId === null ? [] : getProviderTrainers(trainers, providerUserId)),
    [trainers, providerUserId],
  );

  if (!isAuthenticated || accountType !== 'provider' || !user) {
    return (
      <AccessDeniedCard requiredRole="provider" testId="provider-publications-access-denied" />
    );
  }

  return (
    <div data-testid="provider-publications" className="flex flex-col gap-4">
      <ProviderPublicationsSection clubs={providerClubs} trainers={providerTrainers} />
      <Card className="p-4 text-sm leading-relaxed text-muted">
        Редактирование и удаление публикаций пока доступны через{' '}
        <Link href="/profile/provider" className="font-semibold text-accent hover:underline">
          корневой кабинет
        </Link>
        . Объединение маршрутов — следующий шаг фазы.
      </Card>
    </div>
  );
}
