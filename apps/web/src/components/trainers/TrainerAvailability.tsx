'use client';

/*
 * TrainerAvailability — секция «Свободные окна тренеров» в нижней части
 * главной (Phase 28.12 + 28.13).
 *
 * Дизайн handoff'а: claude-design/slots-availability/sporthub/project/
 * SportHub Slots - Availability.html (блок listing + slot-card slider).
 *
 * Phase 28.13: карточка слота переехала в общий ui/SlotCard. Здесь только
 * маппинг `TrainerAvailabilityItem` → нейтральный контракт SlotCard через
 * локальный helper `mapTrainerToSlot`.
 *
 * Контракт `{ dateLabel, slots }` сохранён — UpcomingSessions.tsx
 * (orchestrator) не трогаем. Auth-guard на CTA («К записи: <имя>»):
 * push на /booking/{id} для athlete, иначе toast — живёт здесь.
 *
 * UI: CardSlider 1↔2↔3 видимых через visibleByBp + кастомный tools-блок
 * (pill «Ближайшие» + outline-chip с живым dateLabel + стрелки prev/next
 * рендерятся самим CardSlider). На lg+ header в одну строку, на <lg — в
 * три (eyebrow+стрелки / title / pill+date).
 */
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { CardSlider, SlotCard } from '@/components/ui';
import { BOOKING_REQUIRES_LOGIN } from '@/lib/auth-prompts';
import { selectCanBook, useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';

import type { TrainerAvailabilityItem } from '@/components/trainers/trainer-preview';

type TrainerAvailabilityProps = {
  dateLabel: string;
  slots: TrainerAvailabilityItem[];
};

/* Маппинг тренерского слота на нейтральный контракт SlotCard. */
function mapTrainerToSlot(slot: TrainerAvailabilityItem) {
  return {
    eyebrow: 'Персональная услуга',
    name: slot.trainerName,
    sport: slot.title,
    availableSpots: slot.availableSpots,
    startTime: slot.startTime,
    endTime: slot.endTime,
    price: slot.price,
    venueLabel: slot.venueLabel,
    room: slot.room,
    slotId: slot.id,
    ctaAriaName: `К записи: ${slot.trainerName}`,
  };
}

export function TrainerAvailability({ dateLabel, slots }: TrainerAvailabilityProps) {
  const canBook = useAuthStore(selectCanBook);
  const router = useRouter();
  const addToast = useToastStore((state) => state.addToast);

  /* Auth-guard на CTA «К записи»: вошедший человек → /booking, гость → toast. */
  const handleSlotSelect = useCallback(
    (slotId: TrainerAvailabilityItem['id']) => {
      if (canBook) {
        router.push(`/booking/${slotId}`);
      } else {
        addToast({ message: BOOKING_REQUIRES_LOGIN, tone: 'info' });
      }
    },
    [addToast, canBook, router],
  );

  /* tools — кастомный блок справа от title (Phase 28.12). Стрелки
   * prev/next рендерит сам CardSlider — здесь только pill+date. */
  const tools = (
    <>
      <span className="inline-flex items-center rounded-full bg-lime px-3.5 py-2 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-ink whitespace-nowrap">
        Ближайшие
      </span>
      <span className="inline-flex items-center rounded-full border border-line bg-transparent px-3.5 py-2 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-ink whitespace-nowrap">
        {dateLabel}
      </span>
    </>
  );

  return (
    <CardSlider
      eyebrow="Trainer availability"
      title="Свободные окна тренеров"
      accent="lime"
      sliderId="trainer-availability"
      total={slots.length}
      visibleByBp={{ sm: 1, md: 2, xl: 3 }}
      tools={tools}
      emptyMessage="У тренеров пока нет свободных окон. Проверь позже или переключись в клубный режим."
    >
      {slots.map((slot, i) => (
        <SlotCard key={slot.id} {...mapTrainerToSlot(slot)} index={i} onSelect={handleSlotSelect} />
      ))}
    </CardSlider>
  );
}
