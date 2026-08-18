// Server page расписания атлета (Step 25.4): единый список всех bookings с FSM-группами.
import { getBookings, getClubs, getSchedule, getSports, getTrainers } from '@/lib/server-api';
import { AthleteSchedule } from '@/components/profile/athlete/AthleteSchedule';

export const dynamic = 'force-dynamic';

export default async function AthleteScheduleRoute() {
  const [bookings, clubs, schedule, sports, trainers] = await Promise.all([
    getBookings(),
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
