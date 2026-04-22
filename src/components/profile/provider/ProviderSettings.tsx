// Phase 25 Step 25.14: client-обёртка над ProviderSettingsSection. Access-gate; данные
// о пользователе берутся из useAuthStore (Настройки не требуют SSR-данных).
'use client';

import { ProviderSettingsSection } from '@/components/profile/ProviderSettingsSection';
import { useAuthStore } from '@/stores/useAuthStore';
import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';

export function ProviderSettings() {
  const user = useAuthStore((s) => s.user);
  const accountType = useAuthStore((s) => s.accountType);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated || accountType !== 'provider' || !user) {
    return <AccessDeniedCard requiredRole="provider" testId="provider-settings-access-denied" />;
  }

  return (
    <div data-testid="provider-settings">
      <ProviderSettingsSection user={user} />
    </div>
  );
}
