// Серверная страница Dashboard атлета (Step 25.3). Основной маршрут ЛК после
// Phase 26 Step 26.5 — корневой /profile/athlete теперь редиректит сюда.
import { getAuthUserIdFromCookies } from '@/lib/auth-cookie-server';
import { getBookingsByUser, getClubs, getSchedule, getTrainers, getUsers } from '@/lib/server-api';
import { AthleteDashboard } from '@/components/profile/athlete/AthleteDashboard';

export const dynamic = 'force-dynamic';

export default async function AthleteDashboardRoute() {
  // Кто смотрит — известно из cookie входа: клиентская часть всё равно отберёт
  // записи по этому же атлету, поэтому спрашивать чужие незачем. У гостя записей
  // нет вовсе — раздел покажет отказ в доступе.
  const athleteUserId = await getAuthUserIdFromCookies();

  const [bookings, clubs, schedule, trainers, users] = await Promise.all([
    athleteUserId === null ? [] : getBookingsByUser(athleteUserId),
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
