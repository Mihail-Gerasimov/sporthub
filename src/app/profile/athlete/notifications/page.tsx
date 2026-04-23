// Phase 24 Step 24.7: страница уведомлений атлета — плоский список с mark-read.
// Server Component, dynamic='force-dynamic': читаем актуальный notifications.json
// на каждый запрос (чтобы router.refresh обновлял индикаторы).
// Phase 26 post-fix: userId берём из auth-cookie (реальный залогиненный юзер),
// а не из hardcoded MVP_ATHLETE_USER_ID. Cookie пишется в useAuthStore при login.
import { getAuthUserIdFromCookies } from '@/lib/auth-cookie-server';
import { getNotifications } from '@/lib/db';
import { NotificationsListPage } from '@/components/profile/notifications/NotificationsListPage';

export const dynamic = 'force-dynamic';

export default async function AthleteNotificationsRoute() {
  const userId = await getAuthUserIdFromCookies();
  const notifications = userId !== null ? await getNotifications({ userId }) : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <NotificationsListPage
        notifications={notifications}
        userId={userId ?? undefined}
        accountType="athlete"
      />
    </div>
  );
}
