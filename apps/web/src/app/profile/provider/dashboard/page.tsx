// Server page Dashboard провайдера (Step 25.8). Основной маршрут ЛК после
// Phase 26 Step 26.5 — корневой /profile/provider теперь редиректит сюда.
//
// Записи и публикации приходят общим срезом кабинета: раздел показывает только своё —
// сводку по своим публикациям и их бейджи надёжности, — поэтому чужие записи ему
// не нужны, а срез уже посчитан макетом в этом же запросе.
import { ProviderDashboard } from '@/components/profile/provider/ProviderDashboard';
import { loadProviderScope } from '@/lib/provider-scope';
import {
  getNotifications,
  getOfferings,
  getReviews,
  getSchedule,
  getTrainerClubLinks,
} from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function ProviderDashboardRoute() {
  // ⚠️ Область провайдера читается ПЕРВОЙ, потому что от неё зависит, чьи уведомления
  // запрашивать. Раньше страница брала ленту ВСЕЙ платформы (`scope=all`) и считала
  // по ней непрочитанные одного пользователя фильтром в памяти — цена страницы росла
  // вместе с числом уведомлений всех пользователей сразу.
  const scope = await loadProviderScope();
  const { bookings, clubs, trainers, userId } = scope;

  const [offerings, schedule, links, notifications, reviews] = await Promise.all([
    getOfferings(),
    getSchedule({ ownerType: 'all' }),
    getTrainerClubLinks(),
    userId === null ? Promise.resolve([]) : getNotifications({ userId }),
    getReviews(),
  ]);

  return (
    <ProviderDashboard
      bookings={bookings}
      clubs={clubs}
      trainers={trainers}
      offerings={offerings}
      schedule={schedule}
      links={links}
      notifications={notifications}
      reviews={reviews}
    />
  );
}
