// Server page статистики провайдера (Step 25.11): параллельный маршрут с корнем
// /profile/provider. Считает только по своим публикациям, поэтому записи берёт
// общим срезом кабинета — тем же, что уже посчитал макет в этом запросе.
import { getOfferings, getSchedule, getSports } from '@/lib/server-api';
import { loadProviderScope } from '@/lib/provider-scope';
import { ProviderStats } from '@/components/profile/provider/ProviderStats';

export const dynamic = 'force-dynamic';

export default async function ProviderStatsRoute() {
  const [{ bookings, clubs, trainers }, offerings, schedule, sports] = await Promise.all([
    loadProviderScope(),
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
