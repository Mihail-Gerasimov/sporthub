// Server page статистики кабинета лица (Step 25.11). Считает только по публикациям
// этого лица, поэтому записи берёт общим срезом кабинета — тем же, что уже посчитал
// макет в этом запросе.
import { getOfferings, getSchedule, getSports } from '@/lib/server-api';
import { loadFaceScope } from '@/lib/face-scope';
import { requireFaceCabinetParams, type FaceCabinetParams } from '@/lib/face-cabinet-params';
import { ProviderStats } from '@/components/profile/provider/ProviderStats';

export const dynamic = 'force-dynamic';

export default async function FaceStatsRoute({ params }: { params: Promise<FaceCabinetParams> }) {
  const face = await requireFaceCabinetParams(params);
  const [{ bookings, clubs, trainers }, offerings, schedule, sports] = await Promise.all([
    loadFaceScope(face.kind, face.id),
    getOfferings(),
    getSchedule({ ownerType: 'all' }),
    getSports(),
  ]);

  return (
    <ProviderStats
      bookings={bookings}
      clubs={clubs}
      trainers={trainers}
      offerings={offerings}
      schedule={schedule}
      sports={sports}
    />
  );
}
