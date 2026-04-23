// Phase 25 Step 25.14: client-обёртка над ProviderSettingsSection. Access-gate; данные
// о пользователе берутся из useAuthStore (Настройки не требуют SSR-данных).
'use client';

import { ProviderSettingsSection } from '@/components/profile/ProviderSettingsSection';
import { useAuthStore } from '@/stores/useAuthStore';
import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';
import { UserNotificationPreferencesEditor } from '@/components/profile/UserNotificationPreferencesEditor';

export function ProviderSettings() {
  const user = useAuthStore((s) => s.user);
  const accountType = useAuthStore((s) => s.accountType);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated || accountType !== 'provider' || !user) {
    return <AccessDeniedCard requiredRole="provider" testId="provider-settings-access-denied" />;
  }

  return (
    <div className="flex flex-col gap-5" data-testid="provider-settings">
      <ProviderSettingsSection user={user} />
      {typeof user.id === 'number' ? (
        <UserNotificationPreferencesEditor userId={user.id} accountType="provider" />
      ) : null}
    </div>
  );
}
