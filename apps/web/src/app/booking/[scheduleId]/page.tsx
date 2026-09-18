// Серверная страница записи должна брать свежий slot-context из JSON после edit/delete расписания.
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { BookingActionBlock } from '@/components/booking/BookingActionBlock';
import { Badge, Card } from '@/components/ui';
import { getScheduleSlotContext } from '@/lib/server-api';
import { formatDate, formatPrice } from '@/lib/utils';
import type { OfferingFormat } from '@sporthub/types';

// Явно отключаем статическую оптимизацию, чтобы booking-context не зависал после обновления слота.
export const dynamic = 'force-dynamic';

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

  // ⚠️ Фаза 35, этап Э0a: страница больше не читает ни сессию, ни историю записей.
  // Раньше здесь считались санкции за неявки смотрящего — механизм вырезан целиком,
  // а вместе с ним ушёл и единственный повод спрашивать что-либо, кроме самого слота.
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
  const actionDateLabel = formatDate(slot.date, { day: 'numeric', month: 'long' });
  const actionTimeLabel = `${slot.startTime} - ${slot.endTime}`;
  const priceLabel = slot.price > 0 ? formatPrice(slot.price) : 'Стоимость уточняется';

  return (
    <div className="min-h-screen bg-bg px-4 py-7 sm:px-6 lg:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/catalog"
            className="inline-flex items-center gap-1 text-xs font-semibold text-muted transition-colors hover:text-ink"
          >
            <span aria-hidden="true">←</span>
            Вернуться в каталог
          </Link>
        </div>

        <section
          data-testid="booking-page-hero"
          className="relative overflow-hidden rounded-modal bg-plate px-5 py-7 text-plate-ink shadow-deep sm:px-8 sm:py-9"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 [background-image:var(--ui-decor-plate-glow)]"
          />
          <div className="relative">
            <div>
              <p className="t-eyebrow text-lime">Booking details</p>
              <h1 className="t-h1 mt-3 text-plate-ink">Запись на занятие</h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-plate-muted">
                Проверьте занятие, место и время перед подтверждением записи.
              </p>
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              <Badge tone="accent">{slotTypeLabel}</Badge>
              <Badge className="border-plate-line bg-transparent text-plate-ink">
                {actionDateLabel}
              </Badge>
              <Badge className="border-plate-line bg-transparent text-plate-ink">
                {actionTimeLabel}
              </Badge>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <Card className="space-y-6 p-5 sm:p-7">
            <div className="flex flex-wrap gap-2">
              <Badge tone="accent">{slotTypeLabel}</Badge>
              <Badge tone="outline">{actionDateLabel}</Badge>
              <Badge tone={availableSpots > 0 ? 'success' : 'danger'}>
                Свободно мест: {availableSpots}
              </Badge>
            </div>

            <div>
              <p className="text-sm font-medium uppercase tracking-[0.10em] text-muted">
                {ownerName}
              </p>
              <h2 className="mt-3 font-display text-3xl font-black tracking-tight text-ink sm:text-4xl">
                {slot.title}
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
                Проверь формат, площадку и свободные места перед подтверждением записи на выбранный
                слот.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-card-lg border border-line bg-card-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Владелец услуги
                </p>
                <p className="mt-3 text-lg font-semibold text-ink">{ownerName}</p>
                <p className="mt-2 text-sm text-muted">{ownerMeta}</p>
              </div>

              <div className="rounded-card-lg border border-line bg-card-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Дата и время
                </p>
                <p className="mt-3 text-lg font-semibold text-ink">{formatDate(slot.date)}</p>
                <p className="mt-2 text-sm text-muted">{actionTimeLabel}</p>
                <p className="mt-2 text-sm text-muted">
                  {slot.durationMinutes} минут, {slot.room ?? 'зал уточняется'}
                </p>
              </div>

              <div className="rounded-card-lg border border-line bg-card-2 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Стоимость и формат
                </p>
                <p className="mt-3 text-lg font-semibold text-ink">{priceLabel}</p>
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

            <div className="rounded-card-lg border border-line bg-card-2 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Описание слота
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted">
                {slot.description ?? offering.description}
              </p>
            </div>
          </Card>

          <BookingActionBlock
            scheduleId={normalizedScheduleId}
            slotTitle={slot.title}
            ownerName={ownerName}
            ownerTypeLabel={slotTypeLabel}
            dateLabel={actionDateLabel}
            timeLabel={actionTimeLabel}
            availableSpots={availableSpots}
          />
        </div>
      </div>
    </div>
  );
}
