// Server page расписания атлета (Step 25.4): единый список всех bookings с FSM-группами.
import { readSession } from '@/lib/session';
import { getBookingsByUser, getClubs, getSchedule, getSports, getTrainers } from '@/lib/server-api';
import { AthleteSchedule } from '@/components/profile/athlete/AthleteSchedule';

export const dynamic = 'force-dynamic';

export default async function AthleteScheduleRoute() {
  // Кто смотрит — известно из cookie входа: клиентская часть всё равно отберёт
  // записи по этому же атлету, поэтому спрашивать чужие незачем. У гостя записей
  // нет вовсе — раздел покажет отказ в доступе.
  const athleteUserId = (await readSession())?.id ?? null;

  const [bookings, clubs, schedule, sports, trainers] = await Promise.all([
    athleteUserId === null ? [] : getBookingsByUser(athleteUserId),
    getClubs(),
    getSchedule({ ownerType: 'all' }),
    getSports(),
    getTrainers(),
  ]);

  return (
    <AthleteSchedule
      bookings={bookings}
      clubs={clubs}
      schedule={schedule}
      sports={sports}
      trainers={trainers}
    />
  );
}
