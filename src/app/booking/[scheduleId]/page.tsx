import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Card } from '@/components/ui';
import { getClubById, getScheduleById, getTrainerById } from '@/lib/db';
import { formatDate, formatPrice, getScheduleClubId, getScheduleTrainerId } from '@/lib/utils';

type BookingPageProps = {
  params: Promise<{
    scheduleId: string;
  }>;
};

export default async function BookingPage({ params }: BookingPageProps) {
  const { scheduleId } = await params;
  const normalizedScheduleId = Number(scheduleId);

  if (!Number.isInteger(normalizedScheduleId) || normalizedScheduleId <= 0) {
    notFound();
  }

  const slot = await getScheduleById(normalizedScheduleId);

  if (!slot) {
    notFound();
  }

  const clubId = getScheduleClubId(slot);
  const trainerId = getScheduleTrainerId(slot);
  const [club, trainer] = await Promise.all([
    clubId === null ? Promise.resolve(null) : getClubById(clubId),
    trainerId === null ? Promise.resolve(null) : getTrainerById(trainerId),
  ]);

  if (!club || !trainer) {
    notFound();
  }

  const availableSpots = slot.capacity - slot.bookedCount;

  return (
    <main className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              Booking preview
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Запись на занятие</h1>
          </div>

          <Link
            href="/#upcoming-sessions"
            className="rounded-pill border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent/30 hover:text-accent"
          >
            Назад к занятиям
          </Link>
        </div>

        <Card className="space-y-6 p-6 sm:p-8" elevated>
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">MVP booking stub</Badge>
            <Badge tone="outline">{formatDate(slot.date, { day: 'numeric', month: 'long' })}</Badge>
          </div>

          <div>
            <p className="text-sm font-medium uppercase tracking-[0.22em] text-muted">
              {club.name}
            </p>
            <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">
              {slot.title}
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-8 text-muted">
              Это промежуточная страница записи для перехода с главной. Полный booking flow будет
              собран в отдельной фазе.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-card border border-line bg-canvas p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Время и формат
              </p>
              <p className="mt-3 text-lg font-semibold text-ink">
                {slot.startTime} - {slot.endTime}
              </p>
              <p className="mt-2 text-sm text-muted">
                {slot.durationMinutes} минут, {slot.room ?? 'зал уточняется'}
              </p>
            </div>

            <div className="rounded-card border border-line bg-panel-strong p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Стоимость и места
              </p>
              <p className="mt-3 text-lg font-semibold text-ink">{formatPrice(slot.price)}</p>
              <p className="mt-2 text-sm text-muted">Свободно мест: {availableSpots}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Тренер</p>
              <p className="mt-2 text-base font-semibold text-ink">{trainer.name}</p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Адрес</p>
              <p className="mt-2 text-base text-ink">{club.address}</p>
            </div>
          </div>
        </Card>
      </div>
    </main>
  );
}
