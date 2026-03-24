// Секция «Входящие записи» кабинета провайдера — список букингов на клубы и тренеров.
import { Badge, Card } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import type { Booking } from '@/types';

type ProviderBookingsSectionProps = {
  bookings: Booking[];
};

/** Локализованные метки статусов записей */
const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает',
  confirmed: 'Подтверждена',
  completed: 'Завершена',
  cancelled: 'Отменена',
};

/** Цвета бейджей по статусу */
const STATUS_TONES: Record<string, 'success' | 'outline' | 'danger' | 'teal'> = {
  pending: 'outline',
  confirmed: 'success',
  completed: 'teal',
  cancelled: 'danger',
};

/** Форматирование цены с пробелами (1 150 ₽) */
function formatPrice(price: number): string {
  return `${price.toLocaleString('ru-RU')} ₽`;
}

export function ProviderBookingsSection({ bookings }: ProviderBookingsSectionProps) {
  return (
    <Card className="p-6 sm:p-8">
      <h2 className="font-display text-2xl font-semibold text-ink">Входящие записи</h2>

      {bookings.length > 0 ? (
        <div className="mt-6 grid gap-4">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              className="grid gap-4 rounded-card border border-line bg-canvas p-4 md:grid-cols-[1.4fr_1fr_auto]"
            >
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={STATUS_TONES[booking.status] ?? 'outline'}>
                    {STATUS_LABELS[booking.status] ?? booking.status}
                  </Badge>
                  <Badge tone="outline">{booking.clubId ? 'Клуб' : 'Тренер'}</Badge>
                </div>

                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Стоимость
                </p>
                <p className="mt-2 text-xl font-semibold text-ink">
                  {formatPrice(booking.totalPrice)}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Дата</p>
                <p className="mt-2 text-base font-semibold text-ink">
                  {formatDate(booking.date, { day: 'numeric', month: 'long' })}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {booking.paymentStatus === 'paid' ? 'Оплачено' : 'Не оплачено'}
                </p>
              </div>

              <div className="flex items-start md:justify-end">
                <Badge tone="outline">ID: {booking.id}</Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm leading-relaxed text-muted">Нет входящих записей</p>
      )}
    </Card>
  );
}
