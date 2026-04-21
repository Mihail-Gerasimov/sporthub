// Серверная страница Dashboard атлета (Step 25.3): параллельный маршрут с корневым /profile/athlete.
// Корень пока рендерит старый AthleteProfilePage (финальная миграция — Step 25.17).
import {
  getBookings,
  getClubs,
  getSchedule,
  getTrainers,
  getUsers,
  runLazyBookingTransitions,
} from '@/lib/db';
import { AthleteDashboard } from '@/components/profile/athlete/AthleteDashboard';

export const dynamic = 'force-dynamic';

export default async function AthleteDashboardRoute() {
  await runLazyBookingTransitions();

  const [bookings, clubs, schedule, trainers, users] = await Promise.all([
    getBookings(),
    getClubs(),
    getSchedule({ ownerType: 'all' }),
    getTrainers(),
    getUsers(),
  ]);

  return (
    <AthleteDashboard
      bookings={bookings}
      clubs={clubs}
      schedule={schedule}
      trainers={trainers}
      users={users}
    />
  );
}
