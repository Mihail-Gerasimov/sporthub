// Phase 25 Step 25.14: client-обёртка для /profile/provider/settings.
// Phase 29 fix: ProviderSettingsSection (дубль профиля + плашка) удалён —
// весь профиль и редактирование живут в AccountCredentialsSection.
'use client';

import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';
import { AccountCredentialsSection } from '@/components/profile/AccountCredentialsSection';
import { UserNotificationPreferencesEditor } from '@/components/profile/UserNotificationPreferencesEditor';
import { useAuthStore } from '@/stores/useAuthStore';

export function ProviderSettings() {
  const user = useAuthStore((s) => s.user);
  const accountType = useAuthStore((s) => s.accountType);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  if (!isAuthenticated || accountType !== 'provider' || !user) {
    return <AccessDeniedCard requiredRole="provider" testId="provider-settings-access-denied" />;
  }

  return (
    <div className="flex flex-col gap-5" data-testid="provider-settings">
      <AccountCredentialsSection
        user={user}
        accountTitle="Кабинет представителя спортивных услуг"
      />
      {typeof user.id === 'number' ? (
        <UserNotificationPreferencesEditor userId={user.id} accountType="provider" />
      ) : null}
    </div>
  );
}
