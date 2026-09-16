// Server page раздела «Клиенты» кабинета лица (Step 25.10-B): агрегация уникальных
// клиентов и CRM-заметок.
//
// Срез — записи публикаций лица: список клиентов собирается из них. История клиента
// по всей площадке (`?scope=clients`) читалась ради бейджа надёжности; бейджа нет
// с шага 38.25, и второго запроса у страницы больше нет.
import { ProviderClients } from '@/components/profile/provider/ProviderClients';
import { loadFaceScope } from '@/lib/face-scope';
import { requireFaceCabinetParams, type FaceCabinetParams } from '@/lib/face-cabinet-params';
import {
  getAllProviderClientNotes,
  getOfferings,
  getSchedule,
  getClientUsers,
} from '@/lib/server-api';

export const dynamic = 'force-dynamic';

export default async function FaceClientsRoute({ params }: { params: Promise<FaceCabinetParams> }) {
  const face = await requireFaceCabinetParams(params);
  const [{ bookings, clubs, trainers }, offerings, schedule, users, notes] = await Promise.all([
    loadFaceScope(face.kind, face.id),
    getOfferings(),
    getSchedule({ ownerType: 'all' }),
    getClientUsers(),
    getAllProviderClientNotes(),
  ]);

  return (
    <ProviderClients
      bookings={bookings}
      clubs={clubs}
      trainers={trainers}
      offerings={offerings}
      schedule={schedule}
      users={users}
      notes={notes}
    />
  );
}
