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
 *
 * Шаг 38.81: слоты СЛЕДУЮТ ЗА ЧИПОМ. Занятия дня приходят со страницы уже
 * отобранными (сегодня, не начались, есть места, по времени); здесь к ним
 * применяются те же фильтры, что у карточек рядом — вид спорта, город, запрос
 * из стора поиска, — и срез первых N (`applyUpcomingSessionFilters`). Прежде
 * из стора читался только режим, и под чипом «Йога» слоты были всех клубов.
 */
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { ClubAvailability } from '@/components/schedule/ClubAvailability';
import { applyUpcomingSessionFilters } from '@/components/schedule/getUpcomingSessions';
import { TrainerAvailability } from '@/components/trainers';
import { BOOKING_REQUIRES_LOGIN } from '@/lib/auth-prompts';
import { selectCanBook, useAuthStore } from '@/stores/useAuthStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { useToastStore } from '@/stores/useToastStore';

import type { ClubListSport } from '@/components/clubs/filterClubs';
import type { UpcomingSessionItem } from '@/components/schedule/getUpcomingSessions';
import type { TrainerAvailabilityItem } from '@/components/trainers';
import type { Club, Tag } from '@sporthub/types';

type UpcomingSessionsProps = {
  /** Занятия дня — отбор страницы, без фильтров и среза. */
  sessions: UpcomingSessionItem[];
  /** Каталог и справочники — правило выдачи ищет по тексту клуба, тегам и видам. */
  clubs: Club[];
  sports: ClubListSport[];
  tags?: Tag[];
  dateLabel: string;
  trainerDateLabel: string;
  trainerSlots: TrainerAvailabilityItem[];
};

export function UpcomingSessions({
  clubs,
  dateLabel,
  sessions,
  sports,
  tags = [],
  trainerDateLabel,
  trainerSlots,
}: UpcomingSessionsProps) {
  const discoveryMode = useFilterStore((state) => state.discoveryMode);
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);
  const selectedCity = useFilterStore((state) => state.selectedCity);
  const canBook = useAuthStore(selectCanBook);
  const router = useRouter();
  const addToast = useToastStore((state) => state.addToast);

  /* Auth-guard на CTA «К записи» в клубном режиме: вошедший человек → /booking,
   * гость → toast. Пробрасывается в ClubAvailability как onSelect. */
  const handleSessionClick = useCallback(
    (scheduleId: number) => {
      if (canBook) {
        router.push(`/booking/${scheduleId}`);
      } else {
        addToast({ message: BOOKING_REQUIRES_LOGIN, tone: 'info' });
      }
    },
    [addToast, canBook, router],
  );

  if (discoveryMode === 'trainers') {
    return <TrainerAvailability dateLabel={trainerDateLabel} slots={trainerSlots} />;
  }

  // Те же фильтры, что у карточек, затем первые N — в памяти по построению (Д-15).
  const visibleSessions = applyUpcomingSessionFilters({
    sessions,
    clubs,
    filters: { searchQuery, selectedSportId, selectedCity, sports, tags },
  });

  return (
    <ClubAvailability
      dateLabel={dateLabel}
      sessions={visibleSessions}
      onSelect={handleSessionClick}
    />
  );
}
