// Client-обёртка над AthleteReviewsSection (Step 25.6). Читает авторизованного атлета
// из useAuthStore, резолвит targetName через getAthleteReviewItems.
'use client';

import { useMemo } from 'react';

import { AthleteReviewsSection } from '@/components/profile/AthleteReviewsSection';
import { getAthleteReviewItems } from '@/components/profile/athlete-review-items';
import { selectBookingActorUserId, useAuthStore } from '@/stores/useAuthStore';
import type { Club, Review, Trainer } from '@sporthub/types';

type AthleteReviewsProps = {
  clubs?: Club[];
  trainers?: Trainer[];
  reviews?: Review[];
};

export function AthleteReviews({ clubs = [], trainers = [], reviews = [] }: AthleteReviewsProps) {
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

  return <AthleteReviewsSection reviewItems={reviewItems} />;
}
