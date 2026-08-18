// Phase 24 Step 24.7: страница уведомлений провайдера — плоский список с mark-read.
// Server Component, dynamic='force-dynamic': читаем актуальный notifications.json
// на каждый запрос (чтобы router.refresh обновлял индикаторы).
// Phase 26 post-fix: userId берём из auth-cookie (реальный залогиненный юзер),
// а не из hardcoded MVP_PROVIDER_USER_ID. Cookie пишется в useAuthStore при login.
import { getAuthUserIdFromCookies } from '@/lib/auth-cookie-server';
import { getNotifications } from '@/lib/server-api';
import { NotificationsListPage } from '@/components/profile/notifications/NotificationsListPage';

export const dynamic = 'force-dynamic';

export default async function ProviderNotificationsRoute() {
  const userId = await getAuthUserIdFromCookies();
  // Phase 27 Step 27.2: applyPreferences=true — SSR-страница уважает отключённые
  // пользователем типы (согласованность с dropdown колокольчика и badge-счётчиком).
  const notifications =
    userId !== null ? await getNotifications({ userId, applyPreferences: true }) : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <NotificationsListPage
        notifications={notifications}
        userId={userId ?? undefined}
        accountType="provider"
      />
    </div>
  );
}
