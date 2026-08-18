// Серверная страница Dashboard атлета (Step 25.3). Основной маршрут ЛК после
// Phase 26 Step 26.5 — корневой /profile/athlete теперь редиректит сюда.
import { getBookings, getClubs, getSchedule, getTrainers, getUsers } from '@/lib/server-api';
import { AthleteDashboard } from '@/components/profile/athlete/AthleteDashboard';

export const dynamic = 'force-dynamic';

export default async function AthleteDashboardRoute() {
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
