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
import { useCabinetFaces } from '@/components/profile/cabinet-context';
import { useAuthStore } from '@/stores/useAuthStore';
import type { Club, Review, Trainer } from '@sporthub/types';

type ProviderReviewsProps = {
  reviews?: Review[];
  clubs?: Club[];
  trainers?: Trainer[];
};

export function ProviderReviews({ reviews = [], clubs = [], trainers = [] }: ProviderReviewsProps) {
  const user = useAuthStore((s) => s.user);
  // ⚠️ Шаг 35.20a. Свои публикации отбираются по ЛИЦАМ услуг из ответа
  // «кто я», а не по номеру владельца в карточке каталога: это поле из
  // публичной выдачи ушло.
  // ⚠️ Лица берутся у ОТКРЫТОГО КАБИНЕТА, а не у человека. Раздел кабинета клуба
  // отбирает данные этого клуба; раньше здесь стоял список всех лиц из стора,
  // и кабинет клуба Б показывал записи и публикации клуба А.
  const faces = useCabinetFaces();

  const providerReviews = useMemo(() => {
    const providerClubIds = getProviderClubs(clubs, faces).map((c) => c.id);
    const providerTrainerIds = getProviderTrainers(trainers, faces).map((t) => t.id);
    return getProviderReviews(reviews, providerClubIds, providerTrainerIds);
  }, [reviews, clubs, trainers, faces]);

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
