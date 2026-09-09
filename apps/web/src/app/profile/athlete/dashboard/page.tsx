// Серверная страница Dashboard атлета (Step 25.3). Основной маршрут ЛК после
// Phase 26 Step 26.5 — корневой /profile/athlete теперь редиректит сюда.
import { readSession } from '@/lib/session';
import { getBookingsByUser, getClubs, getSchedule, getTrainers } from '@/lib/server-api';
import { AthleteDashboard } from '@/components/profile/athlete/AthleteDashboard';

export const dynamic = 'force-dynamic';

export default async function AthleteDashboardRoute() {
  // ⚠️ Свой профиль приходит из сессии, и спрашивается он ПЕРВЫМ: от него зависит,
  // чьи записи брать. Раньше страница поднимала СПИСОК ВСЕХ пользователей площадки —
  // с почтами и телефонами — только чтобы найти в нём себя по номеру. После фазы 34
  // тот маршрут под правом администратора, и кабинет на нём падал.
  const viewer = await readSession();
  const athleteUserId = viewer?.id ?? null;

  const [bookings, clubs, schedule, trainers] = await Promise.all([
    athleteUserId === null ? [] : getBookingsByUser(athleteUserId),
    getClubs(),
    getSchedule({ ownerType: 'all' }),
    getTrainers(),
  ]);

  return (
    <AthleteDashboard bookings={bookings} clubs={clubs} schedule={schedule} trainers={trainers} />
  );
}
