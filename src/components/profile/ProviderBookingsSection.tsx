// Секция «Входящие записи» кабинета провайдера — список букингов на клубы и тренеров.
import { Badge, Card, ReliabilityBadge } from '@/components/ui';
import type { ProviderIncomingBooking } from '@/components/profile/provider-helpers';
import { computeAthleteReliability } from '@/lib/reliability';
import { formatDate, formatPrice } from '@/lib/utils';
import type { Booking } from '@/types';

type ProviderBookingsSectionProps = {
  bookings: ProviderIncomingBooking[];
  /** Phase 24 Step 24.13: полный список bookings для расчёта reliability атлета per-card. */
  allBookings?: Booking[];
};

export function ProviderBookingsSection({
  bookings,
  allBookings = [],
}: ProviderBookingsSectionProps) {
  return (
    <Card className="p-6 sm:p-8">
      <h2 className="font-display text-2xl font-semibold text-ink">Входящие записи</h2>

      {bookings.length > 0 ? (
        <div className="mt-6 grid gap-4">
          {bookings.map((booking) => (
            <article
              key={booking.id}
              className="grid gap-4 rounded-card border border-line bg-canvas p-4 lg:grid-cols-[1.6fr_1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={booking.statusTone}>{booking.statusLabel}</Badge>
                  <Badge tone="outline">{booking.bookingTypeLabel}</Badge>
                </div>

                <h3 className="mt-4 text-lg font-semibold text-ink">{booking.title}</h3>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-ink">{booking.athleteName}</p>
                  {/* Phase 24 Step 24.13: reliability атлета — бейдж с деталями для provider'а. */}
                  <ReliabilityBadge
                    reliability={computeAthleteReliability(allBookings, booking.athleteUserId)}
                    showDetails
                    compact
                  />
                </div>
                <p className="mt-1 text-sm text-muted">{booking.athleteEmail}</p>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                      К кому / куда
                    </p>
                    <p className="mt-2 text-sm font-medium text-ink">{booking.contextLabel}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                      Локация
                    </p>
                    <p className="mt-2 text-sm font-medium text-ink">{booking.locationLabel}</p>
                  </div>
                </div>
              </div>

              <div className="grid gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                    Дата
                  </p>
                  <p className="mt-2 text-base font-semibold text-ink">
                    {formatDate(booking.date, { day: 'numeric', month: 'long' })}
                  </p>
                  <p className="mt-1 text-sm text-muted">{booking.timeLabel}</p>
                </div>

                <p className="mt-2 text-base font-semibold text-ink">
                  {formatPrice(booking.totalPrice)}
                </p>
                <p className="text-sm text-muted">{booking.paymentLabel}</p>
              </div>

              <div className="flex items-start justify-between gap-2 lg:flex-col lg:items-end">
                <Badge tone="outline">ID: {booking.id}</Badge>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-muted">Нет входящих записей</p>
      )}
    </Card>
  );
}
