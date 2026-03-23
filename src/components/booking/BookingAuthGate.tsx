'use client';

/* Auth-гейт для страницы записи: показывает предупреждение неавторизованным */

import { Badge, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

export function BookingAuthGate() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountType = useAuthStore((state) => state.accountType);
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const isAthlete = isAuthenticated && accountType === 'athlete';

  if (isAthlete) {
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
            Чтобы записаться на занятие, войдите или зарегистрируйтесь как спортсмен.
          </p>
        </div>

        <button
          type="button"
          className="inline-flex min-h-12 items-center justify-center rounded-pill bg-accent px-5 text-sm font-semibold text-panel transition-colors hover:bg-accent-strong"
          onClick={openAuthModal}
        >
          Войти / Зарегистрироваться
        </button>
      </div>
    </Card>
  );
}
