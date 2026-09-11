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
  getOfferings,
  getReviews,
  getSchedule,
  getTrainerClubLinks,
  getUnreadNotificationsCount,
} from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function FaceDashboardRoute({
  params,
}: {
  params: Promise<FaceCabinetParams>;
}) {
  const face = await requireFaceCabinetParams(params);
  // ⚠️ Срез кабинета читается ПЕРВЫМ, потому что от него зависит, спрашивать ли
  // данные вообще: у гостя их не запрашивается ни одного.
  const scope = await loadFaceScope(face.kind, face.id);
  const { bookings, clubs, trainers, userId } = scope;

  const [offerings, schedule, links, unreadCount, reviews] = await Promise.all([
    getOfferings(),
    getSchedule({ ownerType: 'all' }),
    // Связи и отзывы — этого лица, а не всей площадки: обзор показывает их числа,
    // и отбирать выдачу площадки в памяти незачем.
    getTrainerClubLinks(faceOwnerQuery(face)),
    // ⚠️ Шаг 37.57. Непрочитанные приходят ЧИСЛОМ из запроса, а не лентой, которую
    // потом считают в браузере. Прежде страница забирала ленту человека (потолок —
    // сто строк), а сводка фильтровала её в памяти: после сотни уведомлений KPI
    // молча занижался, и цена страницы росла вместе с ящиком.
    //
    // Ящик назван лицом ОТКРЫТОГО кабинета — тем же самым, по которому раздел
    // уведомлений этого кабинета покажет строки. Число под подписью и список
    // под ним обязаны сходиться: у них один запрос и одно условие.
    userId === null ? Promise.resolve(0) : getUnreadNotificationsCount(face),
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
      unreadCount={unreadCount}
      reviews={reviews}
    />
  );
}
