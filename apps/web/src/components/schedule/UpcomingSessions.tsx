'use client';

/*
 * UpcomingSessions — orchestrator нижнего блока «свободных окон» на главной.
 * Переключает между клубным (TrainerAvailability ←- ClubAvailability) и
 * тренерским (TrainerAvailability) рендером по `discoveryMode`.
 *
 * Phase 28.13: оба режима теперь через общий ui/SlotCard. Старый клубный
 * JSX (`<Card>`-сетка) удалён. Auth-guard для клубных слотов остаётся
 * здесь (athlete → /booking, иначе toast) и пробрасывается в
 * ClubAvailability через onSelect.
 */
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { ClubAvailability } from '@/components/schedule/ClubAvailability';
import { TrainerAvailability } from '@/components/trainers';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { useToastStore } from '@/stores/useToastStore';

import type { UpcomingSessionItem } from '@/components/schedule/getUpcomingSessions';
import type { TrainerAvailabilityItem } from '@/components/trainers';

type UpcomingSessionsProps = {
  sessions: UpcomingSessionItem[];
  dateLabel: string;
  trainerDateLabel: string;
  trainerSlots: TrainerAvailabilityItem[];
};

export function UpcomingSessions({
  dateLabel,
  sessions,
  trainerDateLabel,
  trainerSlots,
}: UpcomingSessionsProps) {
  const discoveryMode = useFilterStore((state) => state.discoveryMode);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountType = useAuthStore((state) => state.accountType);
  const router = useRouter();
  const addToast = useToastStore((state) => state.addToast);

  /* Auth-guard на CTA «К записи» в клубном режиме — athlete → /booking,
   * иначе toast. Пробрасывается в ClubAvailability как onSelect. */
  const handleSessionClick = useCallback(
    (scheduleId: number) => {
      if (isAuthenticated && accountType === 'athlete') {
        router.push(`/booking/${scheduleId}`);
      } else {
        addToast({
          message: 'Чтобы записаться, войдите или зарегистрируйтесь как спортсмен',
          tone: 'info',
        });
      }
    },
    [accountType, addToast, isAuthenticated, router],
  );

  if (discoveryMode === 'trainers') {
    return <TrainerAvailability dateLabel={trainerDateLabel} slots={trainerSlots} />;
  }

  return (
    <ClubAvailability dateLabel={dateLabel} sessions={sessions} onSelect={handleSessionClick} />
  );
}
