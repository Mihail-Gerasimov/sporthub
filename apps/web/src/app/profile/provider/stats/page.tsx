// Server page статистики провайдера (Step 25.11): параллельный маршрут с корнем
// /profile/provider. Грузит bookings/clubs/trainers/offerings/schedule/sports одной
// пачкой через Promise.all. SSR-мемоизация через React.cache — один loader на рендер.
import { cache } from 'react';

import {
  getBookings,
  getClubs,
  getOfferings,
  getSchedule,
  getSports,
  getTrainers,
} from '@/lib/server-api';
import { ProviderStats } from '@/components/profile/provider/ProviderStats';

export const dynamic = 'force-dynamic';

/** Кэшированный loader: одна выборка всех данных на SSR-рендер. */
const loadProviderStatsData = cache(async () => {
  const [bookings, clubs, trainers, offerings, schedule, sports] = await Promise.all([
    getBookings(),
    getClubs(),
    getTrainers(),
    getOfferings(),
    getSchedule({ ownerType: 'all' }),
    getSports(),
  ]);

  return { bookings, clubs, trainers, offerings, schedule, sports };
});

export default async function ProviderStatsRoute() {
  const { bookings, clubs, trainers, offerings, schedule, sports } = await loadProviderStatsData();

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
