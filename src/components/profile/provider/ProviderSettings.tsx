// Phase 25 Step 25.14: client-обёртка над ProviderSettingsSection. Access-gate; данные
// о пользователе берутся из useAuthStore (Настройки не требуют SSR-данных).
'use client';

import Link from 'next/link';

import { ProviderSettingsSection } from '@/components/profile/ProviderSettingsSection';
import { Badge, Button, Card } from '@/components/ui';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

function AccessDeniedCard() {
  const openAuthModal = useUIStore((s) => s.openAuthModal);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accountType = useAuthStore((s) => s.accountType);

  return (
    <Card className="p-6 sm:p-8" data-testid="provider-settings-access-denied">
      <div className="flex flex-wrap gap-2">
        <Badge tone="danger">Provider only</Badge>
        {accountType === 'athlete' ? <Badge tone="outline">Athlete session</Badge> : null}
      </div>
      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-ink">
        Доступ ограничен
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">
        Настройки профиля провайдера доступны только представителям спортивных услуг.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        {!isAuthenticated ? <Button onClick={() => openAuthModal()}>Войти</Button> : null}
        <Link
          href="/"
          className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Вернуться на главную
        </Link>
      </div>
    </Card>
  );
}

export function ProviderSettings() {
  const user = useAuthStore((s) => s.user);
  const accountType = useAuthStore((s) => s.accountType);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated || accountType !== 'provider' || !user) {
    return <AccessDeniedCard />;
  }

  return (
    <div data-testid="provider-settings">
      <ProviderSettingsSection user={user} />
    </div>
  );
}
