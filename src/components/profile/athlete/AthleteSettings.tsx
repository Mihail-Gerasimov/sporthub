// Client-обёртка над AthleteFeedbackSettingsSection (Step 25.6). Существующий компонент
// включает и базовые настройки, и блок отзывов — временно оставляем его как есть на
// /profile/athlete/settings до финальной дедупликации в Step 25.17. Чекбоксы
// per-NotificationType (User.notificationPreferences) добавим в Step 25.14.
'use client';

import { useMemo } from 'react';

import { AthleteFeedbackSettingsSection } from '@/components/profile/AthleteFeedbackSettingsSection';
import { getAthleteReviewItems } from '@/components/profile/athlete-review-items';
import {
  getPersonalCabinetConfig,
  selectAthleteActionUserId,
  useAuthStore,
} from '@/stores/useAuthStore';
import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';
import { UserNotificationPreferencesEditor } from '@/components/profile/UserNotificationPreferencesEditor';
import type { Club, Review, Trainer } from '@/types';

type AthleteSettingsProps = {
  clubs?: Club[];
  trainers?: Trainer[];
  reviews?: Review[];
};

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
    return <AccessDeniedCard requiredRole="athlete" />;
  }

  return (
    <div className="flex flex-col gap-5">
      <AthleteFeedbackSettingsSection
        accountTitle={cabinetConfig?.title ?? 'Кабинет спортсмена'}
        reviewItems={reviewItems}
        user={user}
      />
      {typeof user.id === 'number' ? (
        <UserNotificationPreferencesEditor userId={user.id} accountType="athlete" />
      ) : null}
    </div>
  );
}
