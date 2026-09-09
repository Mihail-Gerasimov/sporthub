// Phase 24 Step 24.7: страница уведомлений атлета — плоский список с mark-read.
// Server Component, dynamic='force-dynamic': читаем актуальный notifications.json
// на каждый запрос (чтобы router.refresh обновлял индикаторы).
// Phase 34: адресат ленты берётся из СЕРВЕРНОЙ СЕССИИ (`readSession`). До неё
// он приходил из cookie, которую писал сам браузер, — то есть страницу чужих
// уведомлений можно было открыть, поправив одно число в браузере.
import { readSession } from '@/lib/session';
import { getNotifications } from '@/lib/server-api';
import { NotificationsListPage } from '@/components/profile/notifications/NotificationsListPage';

export const dynamic = 'force-dynamic';

export default async function AthleteNotificationsRoute() {
  const userId = (await readSession())?.id ?? null;
  // Phase 27 Step 27.2: applyPreferences=true — SSR-страница уважает отключённые
  // пользователем типы (согласованность с dropdown колокольчика и badge-счётчиком).
  const notifications =
    userId !== null ? await getNotifications({ userId, applyPreferences: true }) : [];

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
