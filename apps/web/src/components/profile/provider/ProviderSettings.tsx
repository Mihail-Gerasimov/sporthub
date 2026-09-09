// Phase 25 Step 25.14: client-обёртка для /profile/provider/settings.
// Phase 29 fix: ProviderSettingsSection (дубль профиля + плашка) удалён —
// весь профиль и редактирование живут в AccountCredentialsSection.
'use client';

import { AccountCredentialsSection } from '@/components/profile/AccountCredentialsSection';
import { UserNotificationPreferencesEditor } from '@/components/profile/UserNotificationPreferencesEditor';
import { useAuthStore } from '@/stores/useAuthStore';

export function ProviderSettings() {
  const user = useAuthStore((s) => s.user);

  // ⚠️ Шаг 35.34. Здесь стояла плашка «Доступ ограничен» — косметика поверх
  // УЖЕ отданных данных: пускать или нет, решает серверный лейаут, и решает
  // до похода за ними. Осталась одна причина ничего не рисовать: ответ
  // «кто я» ещё в пути, и номера человека нет.
  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col gap-5" data-testid="provider-settings">
      <AccountCredentialsSection
        user={user}
        accountTitle="Кабинет представителя спортивных услуг"
      />
      {typeof user.id === 'number' ? <UserNotificationPreferencesEditor userId={user.id} /> : null}
    </div>
  );
}
