/**
 * Раздел «Надзор» служебной панели — общая очередь событий администраторов
 * (шаг 37.44).
 *
 * Серверная часть делает ровно одно: спрашивает ПЕРВУЮ страницу очереди и отдаёт
 * её клиентскому компоненту. Дальше листает и отбирает браузер — теми же
 * параметрами запроса.
 *
 * ⚠️ Ящик назван явно: `SUPERVISION_MAILBOX`. Право на очередь даёт вид учётной
 * записи, а не владение, и лейаут панели проверил его до похода за данными
 * (`requireAdmin`). Без имени ящика запрос означал бы «всё моё» — личную почту
 * администратора, которой у него не бывает.
 *
 * ⚠️ Умолчание отбора — «не разобрано». Очередь тем и является очередью,
 * что открывается на неразобранном; разобранное никуда не девается и доступно
 * переключателем состояния.
 */
import { AdminNotificationsPage } from '@/components/admin/AdminNotificationsPage';
import { BRAND_NAME } from '@sporthub/domain';
import { SUPERVISION_MAILBOX } from '@/lib/notification-mailbox';
import { getNotifications } from '@/lib/server-api';
import { SUPERVISION_PAGE_SIZE } from '@/lib/notification-pagination';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: `${BRAND_NAME} — Надзор`,
};

export default async function SupervisionNotificationsRoute() {
  const initialFeed = await getNotifications({
    mailbox: SUPERVISION_MAILBOX,
    unreadOnly: true,
    offset: 0,
    limit: SUPERVISION_PAGE_SIZE,
  });

  return <AdminNotificationsPage initialFeed={initialFeed} />;
}
