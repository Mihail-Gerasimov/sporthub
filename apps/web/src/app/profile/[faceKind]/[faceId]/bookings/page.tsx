// Server page входящих записей кабинета лица (Step 25.9).
//
// Срез берётся с историей клиентов: рядом с каждой входящей записью стоит бейдж
// надёжности атлета, а он считается по всей его истории, не только по нашей части.
import { ProviderBookingsInbox } from '@/components/profile/provider/ProviderBookingsInbox';
import { loadFaceScopeWithClientHistory } from '@/lib/face-scope';
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
    loadFaceScopeWithClientHistory(face.kind, face.id),
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
