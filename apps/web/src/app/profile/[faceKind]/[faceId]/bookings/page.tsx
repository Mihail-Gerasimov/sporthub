// Server page входящих записей кабинета лица (Step 25.9).
//
// Срез — записи публикаций лица. История клиентов по всей площадке (`?scope=clients`)
// читалась ради бейджа надёжности атлета; бейджа нет с шага 38.25, второго запроса
// у страницы больше нет.
import { ProviderBookingsInbox } from '@/components/profile/provider/ProviderBookingsInbox';
import { loadFaceScope } from '@/lib/face-scope';
import { requireFaceCabinetParams, type FaceCabinetParams } from '@/lib/face-cabinet-params';
import { getOfferings, getSchedule, getSports, getClientUsers } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function FaceBookingsRoute({
  params,
}: {
  params: Promise<FaceCabinetParams>;
}) {
  const face = await requireFaceCabinetParams(params);
  const [{ bookings, clubs, trainers }, offerings, schedule, sports, users] = await Promise.all([
    loadFaceScope(face.kind, face.id),
    getOfferings(),
    getSchedule({ ownerType: 'all' }),
    getSports(),
    getClientUsers(),
  ]);

  return (
    <ProviderBookingsInbox
      bookings={bookings}
      clubs={clubs}
      trainers={trainers}
      offerings={offerings}
      schedule={schedule}
      sports={sports}
      users={users}
    />
  );
}
