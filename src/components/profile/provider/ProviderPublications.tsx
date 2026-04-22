// Phase 25 Step 25.14: client-обёртка над ProviderPublicationsSection для отдельного
// маршрута /profile/provider/publications. Access-gate + фильтрация по managed-сущностям
// текущего провайдера. edit/delete handlers пока не подключены — для edit/delete используйте
// корневой /profile/provider (финальная миграция — Step 25.17).
'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { ProviderPublicationsSection } from '@/components/profile/ProviderPublicationsSection';
import { getProviderClubs, getProviderTrainers } from '@/components/profile/provider-helpers';
import { Badge, Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Club, Trainer } from '@/types';

type ProviderPublicationsProps = {
  clubs?: Club[];
  trainers?: Trainer[];
};

function AccessDeniedCard() {
  const openAuthModal = useUIStore((s) => s.openAuthModal);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accountType = useAuthStore((s) => s.accountType);

  return (
    <Card className="p-6 sm:p-8" data-testid="provider-publications-access-denied">
      <div className="flex flex-wrap gap-2">
        <Badge tone="danger">Provider only</Badge>
        {accountType === 'athlete' ? <Badge tone="outline">Athlete session</Badge> : null}
      </div>
      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-ink">
        Доступ ограничен
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        Мои публикации доступны только провайдерам.
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
    return <AccessDeniedCard />;
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
