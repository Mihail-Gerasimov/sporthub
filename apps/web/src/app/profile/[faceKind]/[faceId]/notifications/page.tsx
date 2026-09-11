// Уведомления кабинета ЛИЦА услуг.
//
// ⚠️ Шаг 35.47a — и это исправление, а не новая работа. Адресат уведомления стал
// лицом ещё в 35.27, бэкенд научился отдавать ящик каждого лица отдельно в 35.28,
// и всё это было покрыто тестами. А страница кабинета продолжала спрашивать ленту
// ЧЕЛОВЕКА целиком: у владельца трёх клубов все три кабинета показывали одну кучу,
// в которой лежали и его личные уведомления о собственных записях к чужим тренерам.
//
// Ровно та ошибка, ради которой затевалась фаза 34: серверная часть написана
// и покрыта, а вызова из браузера нет ни одного — снаружи разделения не существует.
// Найдено проверкой чек-листов, а не тестами: тесты смотрели на API.
//
// Личность по-прежнему из СЕРВЕРНОЙ СЕССИИ. Владение лицом сверил лейаут
// (`requireOwner`) до отрисовки — здесь номер лица уже свой по построению.
import { readSession } from '@/lib/session';
import { getNotifications } from '@/lib/server-api';
import { requireFaceCabinetParams, type FaceCabinetParams } from '@/lib/face-cabinet-params';
import { NotificationsListPage } from '@/components/profile/notifications/NotificationsListPage';
import { NOTIFICATIONS_PAGE_SIZE } from '@/lib/notification-pagination';

export const dynamic = 'force-dynamic';

export default async function FaceNotificationsRoute({
  params,
}: {
  params: Promise<FaceCabinetParams>;
}) {
  const face = await requireFaceCabinetParams(params);
  const userId = (await readSession())?.id ?? null;

  // `applyPreferences` оставлен: страница уважает выключенные типы, как и колокольчик.
  // ⚠️ Шаг 37.59. Конверт уходит в компонент целиком: счётчики считает тот, у кого
  // есть все строки, — сервер. Отбор по теме и по непрочитанному теперь тоже его
  // работа, а браузер листает страницы тем же `limit`, что назван здесь.
  const feed =
    userId !== null
      ? await getNotifications({
          userId,
          applyPreferences: true,
          mailbox: face,
          offset: 0,
          limit: NOTIFICATIONS_PAGE_SIZE,
        })
      : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <NotificationsListPage
        initialFeed={feed ?? { items: [], total: 0, unreadCount: 0 }}
        userId={userId ?? undefined}
        mailbox={face}
      />
    </div>
  );
}
