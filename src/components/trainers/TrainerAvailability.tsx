'use client';

/*
 * TrainerAvailability — секция «Свободные окна тренеров» в нижней части
 * главной (Phase 28.12).
 *
 * Дизайн handoff'а: claude-design/slots-availability/sporthub/project/
 * SportHub Slots - Availability.html (блок listing + slot-card slider).
 *
 * Контракт `{ dateLabel, slots }` сохранён — UpcomingSessions.tsx
 * (orchestrator) не трогаем. Бизнес-логика (auth-guard на запись через
 * useAuthStore + toast для гостей, push на /booking/{id} для athlete)
 * перенесена 1-в-1 из старой реализации.
 *
 * UI: CardSlider 1↔2↔3 видимых через visibleByBp + кастомный tools-блок
 * (pill «Ближайшие» + outline-chip с живым dateLabel + стрелки prev/next
 * рендерятся самим CardSlider). На lg+ header в одну строку, на <lg — в
 * три (eyebrow+стрелки / title / pill+date).
 */
import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

import { CardSlider } from '@/components/ui';
import { TrainerSlotCard } from '@/components/trainers/TrainerSlotCard';
import { useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';

import type { TrainerAvailabilityItem } from '@/components/trainers/trainer-preview';

type TrainerAvailabilityProps = {
  dateLabel: string;
  slots: TrainerAvailabilityItem[];
};

export function TrainerAvailability({ dateLabel, slots }: TrainerAvailabilityProps) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountType = useAuthStore((state) => state.accountType);
  const router = useRouter();
  const addToast = useToastStore((state) => state.addToast);

  /* Auth-guard на CTA «К записи» — athlete → /booking, иначе toast. */
  const handleSlotSelect = useCallback(
    (slotId: TrainerAvailabilityItem['id']) => {
      if (isAuthenticated && accountType === 'athlete') {
        router.push(`/booking/${slotId}`);
      } else {
        addToast({
          message: 'Чтобы записаться, войдите или зарегистрируйтесь как спортсмен',
          tone: 'info',
        });
      }
    },
    [accountType, addToast, isAuthenticated, router],
  );

  /* tools — кастомный блок справа от title (Phase 28.12). Стрелки
   * prev/next рендерит сам CardSlider — здесь только pill+date. */
  const tools = (
    <>
      <span className="inline-flex items-center rounded-full bg-[var(--ui-lime)] px-3.5 py-2 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ui-bg)] whitespace-nowrap">
        Ближайшие
      </span>
      <span className="inline-flex items-center rounded-full border border-[var(--ui-line)] bg-transparent px-3.5 py-2 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--ui-ink)] whitespace-nowrap">
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
        <TrainerSlotCard key={slot.id} item={slot} index={i} onSelect={handleSlotSelect} />
      ))}
    </CardSlider>
  );
}
