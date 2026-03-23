import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Badge, Card } from '@/components/ui';
import { getScheduleSlotContext } from '@/lib/db';
import { formatDate, formatPrice } from '@/lib/utils';
import type { OfferingFormat } from '@/types';

const OWNER_TYPE_LABELS = {
  club: 'Услуга клуба',
  trainer: 'Услуга тренера',
} as const;

const OFFERING_FORMAT_LABELS: Record<OfferingFormat, string> = {
  group: 'Групповой формат',
  personal: 'Персональная сессия',
  mini_group: 'Мини-группа',
};

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

  const slotContext = await getScheduleSlotContext(normalizedScheduleId);

  if (!slotContext || !slotContext.offering) {
    notFound();
  }

  const { affiliatedClub, club, offering, schedule: slot, trainer } = slotContext;
  const ownerType = offering.ownerType;
  const ownerName = ownerType === 'club' ? club?.name : trainer?.name;

  if (!ownerName) {
    notFound();
  }

  const availableSpots = slot.capacity - slot.bookedCount;
  const ownerMeta =
    ownerType === 'club'
      ? trainer
        ? `Тренер: ${trainer.name}`
        : 'Услуга клуба без назначенного тренера'
      : affiliatedClub
        ? `Площадка: ${affiliatedClub.name}`
        : 'Независимая услуга тренера';
  const slotTypeLabel = OWNER_TYPE_LABELS[ownerType];
  const formatLabel = OFFERING_FORMAT_LABELS[offering.format];

  return (
    <main className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Booking details
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Запись на занятие</h1>
          </div>

          <Link
            href="/"
            className="rounded-pill border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent/30 hover:text-accent"
          >
            Назад на главную
          </Link>
        </div>

        <Card className="space-y-6 p-6 sm:p-8" elevated>
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">{slotTypeLabel}</Badge>
            <Badge tone="outline">{formatDate(slot.date, { day: 'numeric', month: 'long' })}</Badge>
            <Badge tone={availableSpots > 0 ? 'success' : 'danger'}>
              Свободно мест: {availableSpots}
            </Badge>
          </div>

          <div>
            <p className="text-sm font-medium uppercase tracking-[0.10em] text-muted">
              {ownerName}
            </p>
            <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-ink">
              {slot.title}
            </h2>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
              Проверь формат, площадку и свободные места перед подтверждением записи на выбранный
              слот.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-card border border-line bg-panel p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Владелец услуги
              </p>
              <p className="mt-3 text-lg font-semibold text-ink">{ownerName}</p>
              <p className="mt-2 text-sm text-muted">{ownerMeta}</p>
            </div>

            <div className="rounded-card border border-line bg-canvas p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Дата и время
              </p>
              <p className="mt-3 text-lg font-semibold text-ink">{formatDate(slot.date)}</p>
              <p className="mt-2 text-sm text-muted">
                {slot.startTime} - {slot.endTime}
              </p>
              <p className="mt-2 text-sm text-muted">
                {slot.durationMinutes} минут, {slot.room ?? 'зал уточняется'}
              </p>
            </div>

            <div className="rounded-card border border-line bg-panel-strong p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Стоимость и формат
              </p>
              <p className="mt-3 text-lg font-semibold text-ink">{formatPrice(slot.price)}</p>
              <p className="mt-2 text-sm text-muted">{formatLabel}</p>
              <p className="mt-2 text-sm text-muted">Свободно мест: {availableSpots}</p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Место проведения
              </p>
              <p className="mt-2 text-base font-semibold text-ink">{offering.address}</p>
              {slot.room ? <p className="mt-2 text-sm text-muted">{slot.room}</p> : null}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                {ownerType === 'trainer' ? 'Тренер' : 'Ведущий'}
              </p>
              <p className="mt-2 text-base font-semibold text-ink">
                {trainer?.name ?? 'Тренер будет назначен'}
              </p>
              {ownerType === 'trainer' && affiliatedClub ? (
                <p className="mt-2 text-sm text-muted">{affiliatedClub.name}</p>
              ) : null}
            </div>
          </div>

          <div className="rounded-card border border-line bg-canvas p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Описание слота
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {slot.description ?? offering.description}
            </p>
          </div>
        </Card>
      </div>
    </main>
  );
}
