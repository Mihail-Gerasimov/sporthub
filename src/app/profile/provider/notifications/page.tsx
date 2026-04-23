// Phase 24 Step 24.7: страница уведомлений провайдера — плоский список с mark-read.
// Server Component, dynamic='force-dynamic': читаем актуальный notifications.json
// на каждый запрос (чтобы router.refresh обновлял индикаторы).
import { getNotifications } from '@/lib/db';
import { MVP_PROVIDER_USER_ID } from '@/stores/useAuthStore';
import { NotificationsListPage } from '@/components/profile/notifications/NotificationsListPage';

export const dynamic = 'force-dynamic';

export default async function ProviderNotificationsRoute() {
  const notifications = await getNotifications({ userId: MVP_PROVIDER_USER_ID });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <NotificationsListPage
        notifications={notifications}
        userId={MVP_PROVIDER_USER_ID}
        accountType="provider"
      />
    </div>
  );
}
