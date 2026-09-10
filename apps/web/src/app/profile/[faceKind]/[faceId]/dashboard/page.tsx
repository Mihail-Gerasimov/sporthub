// Server page обзора кабинета лица (Step 25.8). Основной раздел кабинета: корень
// `/profile/<вид>/<номер>` уводит сюда.
//
// Записи и публикации приходят общим срезом кабинета: раздел показывает только своё —
// сводку по публикациям лица и их бейджи надёжности, — поэтому чужие записи ему
// не нужны, а срез уже посчитан макетом в этом же запросе.
import { ProviderDashboard } from '@/components/profile/provider/ProviderDashboard';
import { loadFaceScope } from '@/lib/face-scope';
import { requireFaceCabinetParams, type FaceCabinetParams } from '@/lib/face-cabinet-params';
import {
  faceOwnerQuery,
  getNotifications,
  getOfferings,
  getReviews,
  getSchedule,
  getTrainerClubLinks,
} from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function FaceDashboardRoute({
  params,
}: {
  params: Promise<FaceCabinetParams>;
}) {
  const face = await requireFaceCabinetParams(params);
  // ⚠️ Срез кабинета читается ПЕРВЫМ, потому что от него зависит, чьи уведомления
  // запрашивать. Раньше страница брала ленту ВСЕЙ платформы (`scope=all`) и считала
  // по ней непрочитанные одного пользователя фильтром в памяти — цена страницы росла
  // вместе с числом уведомлений всех пользователей сразу.
  const scope = await loadFaceScope(face.kind, face.id);
  const { bookings, clubs, trainers, userId } = scope;

  const [offerings, schedule, links, notifications, reviews] = await Promise.all([
    getOfferings(),
    getSchedule({ ownerType: 'all' }),
    // Связи и отзывы — этого лица, а не всей площадки: обзор показывает их числа,
    // и отбирать выдачу площадки в памяти незачем.
    getTrainerClubLinks(faceOwnerQuery(face)),
    userId === null ? Promise.resolve([]) : getNotifications({ userId }),
    getReviews(faceOwnerQuery(face)),
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
