// Уведомления ЛИЧНОГО кабинета человека.
//
// ⚠️ Шаг 35.47a. Спрашивается именно ЛИЧНЫЙ ящик (`scope=personal`), а не лента
// человека целиком. Разница видна у того, у кого есть лица услуг: без указания
// ящика сюда попадали бы заявки на запись в его клуб — они адресованы клубу,
// и место им в кабинете клуба, а не среди собственных тренировок.
//
// Личность приходит из СЕРВЕРНОЙ СЕССИИ: до фазы 34 она бралась из cookie, которую
// писал сам браузер, и страницу чужих уведомлений открывали правкой одного числа.
import { readSession } from '@/lib/session';
import { getNotifications } from '@/lib/server-api';
import { NotificationsListPage } from '@/components/profile/notifications/NotificationsListPage';

export const dynamic = 'force-dynamic';

const PERSONAL_MAILBOX = { scope: 'personal' } as const;

export default async function PersonalNotificationsRoute() {
  const userId = (await readSession())?.id ?? null;
  // `applyPreferences` оставлен: страница уважает выключенные типы, как и колокольчик.
  const notifications =
    userId !== null
      ? await getNotifications({ userId, applyPreferences: true, mailbox: PERSONAL_MAILBOX })
      : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <NotificationsListPage
        notifications={notifications}
        userId={userId ?? undefined}
        mailbox={PERSONAL_MAILBOX}
      />
    </div>
  );
}
