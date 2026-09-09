'use client';

/* Auth-гейт для страницы записи: показывает предупреждение неавторизованным */

import { Badge, Card } from '@/components/ui';
import { selectCanBook, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

export function BookingAuthGate() {
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  // ⚠️ Шаг 35.34. Записываться может любой вошедший человек: типа учётной
  // записи больше нет, а владелец зала ходит на йогу как все.
  const canBook = useAuthStore(selectCanBook);

  if (canBook) {
    return null;
  }

  return (
    <Card className="border-warning/40 bg-warning/8 p-5" data-testid="booking-auth-gate">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="danger">Требуется авторизация</Badge>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-ink">
            Чтобы записаться на занятие, войдите или зарегистрируйтесь.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex min-h-12 items-center justify-center rounded-pill bg-accent px-5 text-sm font-semibold text-ink transition-colors hover:bg-accent-strong"
          onClick={openAuthModal}
        >
          Войти / Зарегистрироваться
        </button>
      </div>
    </Card>
  );
}
