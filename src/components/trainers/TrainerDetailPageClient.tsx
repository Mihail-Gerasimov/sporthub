'use client';

/* Клиентский компонент детальной страницы тренера — STUB: будет расширен в Step 11.2–11.4 */

import type { Club, Offering, Review, Schedule, Sport, Trainer } from '@/types';

type TrainerDetailPageClientProps = {
  affiliatedClub: Club | null;
  offerings: Offering[];
  reviewAuthors: Record<number, string>;
  reviews: Review[];
  schedule: Schedule[];
  sports: Sport[];
  trainer: Trainer;
};

export function TrainerDetailPageClient({ trainer }: TrainerDetailPageClientProps) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      {/* Hero + Info — stub */}
      <h1 className="font-display text-3xl font-bold">{trainer.name}</h1>

      {/* Услуги тренера — stub */}
      <section aria-labelledby="trainer-offerings-heading" className="mt-8">
        <h2 id="trainer-offerings-heading" className="text-2xl font-bold">
          Услуги тренера
        </h2>
      </section>

      {/* Расписание — stub */}
      <section aria-labelledby="trainer-schedule-heading" className="mt-8">
        <h2 id="trainer-schedule-heading" className="text-2xl font-bold">
          Расписание
        </h2>
      </section>

      {/* Отзывы — stub */}
      <section aria-labelledby="trainer-reviews-heading" className="mt-8">
        <h2 id="trainer-reviews-heading" className="text-2xl font-bold">
          Отзывы
        </h2>
      </section>
    </div>
  );
}
