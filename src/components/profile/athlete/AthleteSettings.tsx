// Client-обёртка над AthleteFeedbackSettingsSection (Step 25.6). Существующий компонент
// включает и базовые настройки, и блок отзывов — временно оставляем его как есть на
// /profile/athlete/settings до финальной дедупликации в Step 25.17. Чекбоксы
// per-NotificationType (User.notificationPreferences) добавим в Step 25.14.
'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { AthleteFeedbackSettingsSection } from '@/components/profile/AthleteFeedbackSettingsSection';
import { getAthleteReviewItems } from '@/components/profile/athlete-review-items';
import { Badge, Button, Card } from '@/components/ui';
import {
  getPersonalCabinetConfig,
  selectAthleteActionUserId,
  useAuthStore,
} from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Club, Review, Trainer } from '@/types';

type AthleteSettingsProps = {
  clubs?: Club[];
  trainers?: Trainer[];
  reviews?: Review[];
};

function AccessDeniedCard() {
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountType = useAuthStore((state) => state.accountType);

  const message = isAuthenticated
    ? 'Ты вошёл как представитель спортивных услуг. Настройки спортсмена недоступны.'
    : 'Настройки спортсмена доступны только после входа.';

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-wrap gap-2">
        <Badge tone="danger">Athlete only</Badge>
        {accountType === 'provider' ? <Badge tone="outline">Provider session</Badge> : null}
      </div>
      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-ink">
        Доступ ограничен
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">{message}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {!isAuthenticated ? (
          <Button onClick={() => openAuthModal()}>Войти или зарегистрироваться</Button>
        ) : null}
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

export function AthleteSettings({ clubs = [], trainers = [], reviews = [] }: AthleteSettingsProps) {
  const user = useAuthStore((state) => state.user);
  const accountType = useAuthStore((state) => state.accountType);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const athleteUserId = useAuthStore(selectAthleteActionUserId);
  const cabinetConfig = getPersonalCabinetConfig(accountType);

  const reviewItems = useMemo(
    () => getAthleteReviewItems({ athleteUserId, clubs, reviews, trainers }),
    [athleteUserId, clubs, reviews, trainers],
  );

  if (!isAuthenticated || accountType !== 'athlete' || !user) {
    return <AccessDeniedCard />;
  }

  return (
    <AthleteFeedbackSettingsSection
      accountTitle={cabinetConfig?.title ?? 'Кабинет спортсмена'}
      reviewItems={reviewItems}
      user={user}
    />
  );
}
