// Client-обёртка над AthleteFeedbackSettingsSection (Step 25.6). Существующий компонент
// включает и базовые настройки, и блок отзывов — временно оставляем его как есть на
// /profile/athlete/settings до финальной дедупликации в Step 25.17. Чекбоксы
// per-NotificationType (User.notificationPreferences) добавим в Step 25.14.
'use client';

import { useMemo } from 'react';

import { AccountCredentialsSection } from '@/components/profile/AccountCredentialsSection';
import { AthleteFeedbackSettingsSection } from '@/components/profile/AthleteFeedbackSettingsSection';
import { getAthleteReviewItems } from '@/components/profile/athlete-review-items';
import { UserNotificationPreferencesEditor } from '@/components/profile/UserNotificationPreferencesEditor';
import { PERSONAL_CABINET_TITLE } from '@/lib/service-faces';
import { selectBookingActorUserId, useAuthStore } from '@/stores/useAuthStore';
import type { Club, Review, Trainer } from '@sporthub/types';

type AthleteSettingsProps = {
  clubs?: Club[];
  trainers?: Trainer[];
  reviews?: Review[];
};

export function AthleteSettings({ clubs = [], trainers = [], reviews = [] }: AthleteSettingsProps) {
  const user = useAuthStore((state) => state.user);
  // ⚠️ Шаг 35.34. Номер берётся у вошедшего человека, а не у «типа учётной
  // записи — спортсмен»: типа больше нет, а записи и отзывы есть у всех.
  const athleteUserId = useAuthStore(selectBookingActorUserId);

  const reviewItems = useMemo(
    () => getAthleteReviewItems({ athleteUserId, clubs, reviews, trainers }),
    [athleteUserId, clubs, reviews, trainers],
  );

  // ⚠️ Шаг 35.34. Здесь стояла плашка «Доступ ограничен» — косметика поверх
  // УЖЕ отданных данных: пускать или нет, решает серверный лейаут, и решает
  // до похода за ними. Осталась одна причина ничего не рисовать: ответ
  // «кто я» ещё в пути, и номера человека нет.
  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col gap-5">
      <AccountCredentialsSection user={user} accountTitle={PERSONAL_CABINET_TITLE} />
      <AthleteFeedbackSettingsSection reviewItems={reviewItems} />
      {typeof user.id === 'number' ? <UserNotificationPreferencesEditor userId={user.id} /> : null}
    </div>
  );
}
