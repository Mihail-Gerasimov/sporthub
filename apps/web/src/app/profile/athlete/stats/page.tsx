// Server page статистики атлета (Step 25.5): параллельный маршрут с корнем /profile/athlete.
// Грузит bookings/clubs/schedule/sports/trainers/reviews одной пачкой через Promise.all.
// SSR-мемоизация через React.cache — если несколько компонентов попросят один loader,
// Next выдаст один и тот же результат за время одного рендера.
import { cache } from 'react';

import {
  getBookings,
  getClubs,
  getReviews,
  getSchedule,
  getSports,
  getTrainers,
  runLazyBookingTransitions,
} from '@/lib/db';
import { AthleteStats } from '@/components/profile/athlete/AthleteStats';

export const dynamic = 'force-dynamic';

/** Кэшированный loader: одна выборка всех данных на SSR-рендер. */
const loadAthleteStatsData = cache(async () => {
  await runLazyBookingTransitions();

  const [bookings, clubs, schedule, sports, trainers, reviews] = await Promise.all([
    getBookings(),
    getClubs(),
    getSchedule({ ownerType: 'all' }),
    getSports(),
    getTrainers(),
    getReviews(),
  ]);

  return { bookings, clubs, schedule, sports, trainers, reviews };
});

export default async function AthleteStatsRoute() {
  const { bookings, clubs, schedule, sports, trainers, reviews } = await loadAthleteStatsData();

  return (
    <AthleteStats
      bookings={bookings}
      clubs={clubs}
      schedule={schedule}
      sports={sports}
      trainers={trainers}
      reviews={reviews}
    />
  );
}
